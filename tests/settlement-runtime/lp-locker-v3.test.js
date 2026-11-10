'use strict';
// F-04 candidate: Locker V3 + per-request withdrawal escrow, executed against the captured
// STON.fi v2.2 Pool/LP wallet bytecode in the local Sandbox. Not live-chain evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const {fixture} = require('./lp-locker-v3-support');
const {freeze, restore} = require('./refund-receipts-support');
const {beginCell} = core;

const WITHDRAW = 0x414c5633, ACK = 0x414c563a, DELIVER = 0x414c563d, ARM = 0x414c563c;
const withdraw = (q, locked, amount) => beginCell().storeUint(WITHDRAW, 32).storeUint(q, 64)
  .storeBit(locked).storeCoins(amount).endCell();
const exits = result => result.transactions.map(t => t.description.computePhase?.exitCode);
const lpBalance = async (f, address) => (await f.chain.runGetMethod(address, 'get_wallet_data')).stackReader.readBigNumber();
const lpWalletOf = async (f, owner) => (await f.chain.runGetMethod(f.vault.pool, 'get_wallet_address',
  [{type: 'slice', cell: beginCell().storeAddress(owner).endCell()}])).stackReader.readAddress();
const recipientInit = f => ({code: f.vault.lpInit.code, data: beginCell().storeCoins(0)
  .storeAddress(f.owner.address).storeAddress(f.vault.pool).storeRef(f.vault.lpInit.code).endCell()});

async function funded(percent = 75, duration = 'days180') {
  const f = await fixture(percent, duration);
  for (const m of f.deposit.messages) await f.owner.send({...m, bounce: true});
  const s = await f.read();
  const v = {percent: s.readBigNumber(), duration: s.readBigNumber(), unlock: s.readBigNumber(),
    received: s.readBigNumber(), locked: s.readBigNumber(), free: s.readBigNumber(), pending: s.readBigNumber()};
  f.chain.now = Number(v.unlock);
  return {f, v};
}
async function lock(f) {
  const s = await f.read();
  return {pending: (s.readBigNumber(), s.readBigNumber(), s.readBigNumber(), s.readBigNumber(), s.readBigNumber(), s.readBigNumber(), s.readBigNumber())};
}
const state = async f => {
  const s = await f.read();
  const out = {percent: s.readBigNumber(), duration: s.readBigNumber(), unlock: s.readBigNumber(),
    received: s.readBigNumber(), locked: s.readBigNumber(), free: s.readBigNumber(), pending: s.readBigNumber(),
    next: s.readBigNumber()};
  return out;
};
const claim = async (f, q) => {
  const r = (await f.chain.runGetMethod(f.vault.address, 'get_claim_v3', [{type: 'int', value: BigInt(q)}])).stackReader;
  return {amount: r.readBigNumber(), kind: r.readBigNumber(), status: r.readBigNumber()};
};
const escrowOf = async (f, q) => (await f.chain.runGetMethod(f.vault.address, 'get_escrow_address_v3',
  [{type: 'int', value: BigInt(q)}])).stackReader.readAddress();
const escrowState = async (f, address) => {
  const r = (await f.chain.runGetMethod(address, 'get_escrow_v1')).stackReader;
  return {funded: r.readBigNumber(), acked: r.readBigNumber(), amount: r.readBigNumber()};
};

test('delivery: escrow is authenticated by its own LP wallet, recipient receives exactly the request, Locker pending clears once', async () => {
  const {f, v} = await funded();
  const recipient = await lpWalletOf(f, f.owner.address);
  const result = await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, v.locked)});
  assert.equal((await claim(f, 1)).status, 1n, 'acknowledged by the exact escrow');
  const escrow = await escrowOf(f, 1);
  assert.deepEqual(await escrowState(f, escrow), {funded: v.locked, acked: 1n, amount: v.locked});
  assert.equal(await lpBalance(f, recipient), v.locked);
  const after = await state(f);
  assert.equal(after.pending, 0n);
  assert.equal(after.locked, 0n);
  assert.equal(after.free, v.free, 'unlocked principal untouched');
  assert(exits(result).every(code => code === 0 || code === undefined), JSON.stringify(exits(result)));
});

test('recipient failure cannot strand principal: it stays in the escrow, is retry-safe, and never double-pays', async () => {
  const {f, v} = await funded();
  const recipient = await lpWalletOf(f, f.owner.address);
  await f.owner.send({to: recipient, init: recipientInit(f), value: 100000000n, body: beginCell().endCell()});
  await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, 1n)});
  assert.equal(await lpBalance(f, recipient), 1n, 'first unit delivered');
  const old = await freeze(f, recipient);
  await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(2, true, v.locked - 1n)});
  const escrow = await escrowOf(f, 2);
  await restore(f, recipient, old);
  assert.equal(await lpBalance(f, recipient), 1n, 'frozen recipient wallet received nothing from second withdrawal');
  // Only the recipient can retry; the Locker, a stranger and an unrelated wallet cannot.
  const stranger = await f.chain.treasury('stranger');
  const deliver = beginCell().storeUint(DELIVER, 32).storeUint(2, 64).endCell();
  const denied = await stranger.send({to: escrow, value: 200000000n, body: deliver});
  assert(exits(denied).includes(401));
  assert.equal(await lpBalance(f, recipient), 1n);
  await f.owner.send({to: escrow, value: 200000000n, body: deliver});
  assert.equal(await lpBalance(f, recipient), v.locked, 'exactly the request is delivered');
  await f.owner.send({to: escrow, value: 200000000n, body: deliver});
  assert.equal(await lpBalance(f, recipient), v.locked, 'second retry cannot pay again');
  assert.equal(await lpBalance(f, f.vault.lpWallet), v.free, 'Locker principal never drawn');
});

test('forged acknowledgement, notification, excess, replay and unauthorized withdrawal are rejected', async () => {
  const {f, v} = await funded();
  const stranger = await f.chain.treasury('stranger');
  const ack = beginCell().storeUint(ACK, 32).storeUint(1, 64).storeCoins(v.locked).endCell();
  assert(exits(await stranger.send({to: f.vault.address, value: 100000000n, body: ack})).includes(409), 'no such request');
  assert(exits(await stranger.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, v.locked)})).includes(401));
  assert.equal((await state(f)).pending, 0n);
  await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, v.locked)});
  assert(exits(await stranger.send({to: f.vault.address, value: 100000000n, body: ack})).includes(401), 'wrong sender for an existing request');
  const escrow = await escrowOf(f, 1);
  const notification = beginCell().storeUint(0x7362d09c, 32).storeUint(1, 64).storeCoins(v.locked)
    .storeAddress(f.vault.address).storeBit(false).endCell();
  assert(exits(await stranger.send({to: escrow, value: 100000000n, body: notification})).includes(401), 'not from the escrow LP wallet');
  const excess = beginCell().storeUint(0xd53276db, 32).storeUint(1, 64).endCell();
  assert(exits(await stranger.send({to: escrow, value: 100000000n, body: excess})).includes(404), 'excess is never evidence');
  assert(exits(await stranger.send({to: escrow, value: 100000000n, body: beginCell().storeUint(ARM, 32).storeUint(1, 64).endCell()})).includes(401));
  // Replaying the escrow's genuine acknowledgement and the original request changes nothing.
  const before = await state(f);
  assert(exits(await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, 1n)})).includes(409));
  assert.deepEqual(await state(f), before);
  const recipient = await lpWalletOf(f, f.owner.address);
  assert.equal(await lpBalance(f, recipient), v.locked);
});

test('duration, amount ceilings and controller rights are preserved; no reuse of withdrawn principal', async () => {
  const {f, v} = await funded();
  const recipient = await lpWalletOf(f, f.owner.address);
  assert((await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, v.locked + 1n)})).transactions
    .some(t => t.description.computePhase?.exitCode === 408));
  assert((await f.other.send({to: f.vault.address, value: 450000000n, body: withdraw(1, true, v.locked)})).transactions
    .some(t => t.description.computePhase?.exitCode === 401), 'only the beneficiary can unlock timed principal');
  assert((await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(1, false, v.free)})).transactions
    .some(t => t.description.computePhase?.exitCode === 401), 'beneficiary is not the free-principal controller');
  await f.other.send({to: f.vault.address, value: 450000000n, body: withdraw(1, false, v.free)});
  assert.equal((await claim(f, 1)).status, 1n);
  const controllerWallet = await lpWalletOf(f, f.other.address);
  assert.equal(await lpBalance(f, controllerWallet), v.free);
  await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(2, true, v.locked)});
  assert.equal(await lpBalance(f, recipient), v.locked);
  assert((await f.owner.send({to: f.vault.address, value: 450000000n, body: withdraw(3, true, 1n)})).transactions
    .some(t => t.description.computePhase?.exitCode === 408), 'locked bucket is exhausted');
  assert.equal(await lpBalance(f, f.vault.lpWallet), 0n);
});

test('underfunded withdrawal is rejected before any state change', async () => {
  const {f, v} = await funded();
  const before = await state(f);
  const result = await f.owner.send({to: f.vault.address, value: 350000000n, body: withdraw(1, true, v.locked)});
  assert(exits(result).includes(407));
  assert.deepEqual(await state(f), before);
});

test('permanent lock rejects locked withdrawal; premature withdrawal rejects with 403', async () => {
  // 1. Permanent lock rejection
  const p = await fixture(100, 'permanent');
  for (const m of p.deposit.messages) await p.owner.send({...m, bounce: true});
  const pState = await p.read();
  const pLocked = (pState.readBigNumber(), pState.readBigNumber(), pState.readBigNumber(), pState.readBigNumber(), pState.readBigNumber());
  const permResult = await p.owner.send({to: p.vault.address, value: 450000000n, body: withdraw(1, true, pLocked)});
  assert(exits(permResult).includes(403), 'permanent lock can never be withdrawn');

  // 2. Premature withdrawal rejection
  const timed = await fixture(75, 'days180');
  for (const m of timed.deposit.messages) await timed.owner.send({...m, bounce: true});
  const tState = await timed.read();
  const tLocked = (tState.readBigNumber(), tState.readBigNumber(), tState.readBigNumber(), tState.readBigNumber(), tState.readBigNumber());
  // now is before unlock (unlock is now + 180 days)
  const premature = await timed.owner.send({to: timed.vault.address, value: 450000000n, body: withdraw(1, true, tLocked)});
  assert(exits(premature).includes(403), 'withdrawal before unlock time must reject with 403');
});


