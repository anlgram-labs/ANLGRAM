'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const { internal } = require('@ton/sandbox');
const { ready, exit } = require('./one-shot-dispatch-support');
const dispatch = require('../../minter-contract/scripts/migration-package-dispatch-v2');
const wire = require('../../minter-contract/scripts/stonfi-lp-v2-wire');

const ROOT = 77n;
const TON = 500000000000n;
const JETTONS = 200000000000000000n;
const body = (op, id = ROOT) => core.beginCell().storeUint(op, 32).storeUint(id, 64);
const opcode = message => message?.body.bits.length >= 32 ? message.body.beginParse().loadUint(32) : 0;
const outputs = tx => [...tx.outMessages.values()];

async function prepare(minimum) {
  const f = await ready();
  await f.fund();
  const permit = await f.authorize(minimum);
  return { ...f, permit, migrator: f.c.addresses.migration, pool: f.c.vault.pool };
}

async function accountAddress(f) {
  const result = await f.chain.runGetMethod(f.pool, 'get_lp_account_address', [
    { type: 'slice', cell: core.beginCell().storeAddress(f.migrator).endCell() },
  ]);
  return result.stackReader.readAddress();
}

async function accountAmounts(f, account) {
  const { stackReader: data } = await f.chain.runGetMethod(account, 'get_lp_account_data');
  assert(data.readAddress().equals(f.migrator));
  assert(data.readAddress().equals(f.pool));
  return [data.readBigNumber(), data.readBigNumber()];
}

// Only the foreign ABI probes inject a local sender. The Migrator keeps its
// production-equivalent 414 gates. All downstream messages are TVM outputs.
function foreignRefund(f, account, id = ROOT) {
  return internal({ from: f.migrator, ...wire.refund(core, { operationId: id, lpAccount: account.toRawString() }), bounce: true });
}

async function splitDispatch(f) {
  const { to, value, body: payload } = dispatch.execute(core, f.c, f.permit);
  const tx = await (await f.chain.getContract(to)).receiveMessage(internal({
    from: f.owner.address, to, value, body: payload, bounce: true,
  }));
  assert.equal(tx.description.aborted, false);
  assert.equal(tx.description.actionPhase.success, true);
  const token = outputs(tx).find(m => opcode(m) === 0x0f8a7ea5);
  const native = outputs(tx).find(m => opcode(m) === 0x01f3835d);
  assert(token && native);
  return { token, native };
}

async function assertPending(f) {
  assert(exit(await f.send(f.migrator, body(0x414e5d20).endCell(), 20000000n), f.migrator, 0));
  const stage = await f.stage();
  assert.equal(stage[0], 6n);
  assert.equal(stage[7], 0n);
  assert(exit(await f.send(f.migrator, body(0x414e4c43).endCell()), f.migrator, 414));
}

test('successful canonical dispatch deletes LPAccount, and post-custody query and refund cannot prove zero or return', async () => {
  const f = await prepare();
  const result = await f.execute(f.permit);
  assert.equal((await f.stage())[0], 5n);
  const account = await accountAddress(f);
  const handoff = result.transactions.find(t => t.inMessage?.info.dest.equals(account)
    && outputs(t).some(m => opcode(m) === 0x06ecd527));
  assert(handoff);
  assert.equal(handoff.description.actionPhase.statusChange, 'deleted');
  assert.equal((await f.chain.getContract(account)).accountState, undefined);

  const query = await f.send(f.migrator, body(0x414e5c10).endCell(), 150000000n);
  assert(query.transactions.some(t => t.inMessage?.info.src?.equals(f.migrator)
    && t.inMessage.info.dest.equals(account) && opcode(t.inMessage) === 0x24cfc100));
  const obs = (await f.chain.runGetMethod(f.migrator, 'get_recovery_observation_vnext')).stack.map(x => x.value);
  assert.equal(obs[2], 3n);
  assert.equal(obs[5], 0n);

  const refund = await f.chain.sendMessage(foreignRefund(f, account));
  assert(refund.transactions.some(t => t.inMessage?.info.bounced && t.inMessage.info.src.equals(account)));
  assert(!refund.transactions.some(t => t.inMessage?.info.dest.equals(f.pool)));
  assert(exit(await f.send(f.migrator, body(0x414e4c3c).endCell(), 900000000n), f.migrator, 414));
  await assertPending(f);
});

test('authentic getter reply can become stale while a refund and the delayed second leg recreate the same LPAccount', async () => {
  const f = await prepare();
  const legs = await splitDispatch(f);
  await f.chain.sendMessage(legs.token);
  const account = await accountAddress(f);
  assert.deepEqual((await accountAmounts(f, account)).sort(), [0n, JETTONS].sort());

  // Hold only the genuine reply, after executing the actual lookup chain.
  const queue = [internal({ from: f.owner.address, to: f.migrator, value: 150000000n,
    body: body(0x414e5c10).endCell(), bounce: true })];
  let reply;
  while (queue.length) {
    const message = queue.shift();
    if (message.info.src.equals(account) && opcode(message) === 0x24cfc100) {
      reply = message;
      break;
    }
    const tx = await (await f.chain.getContract(message.info.dest)).receiveMessage(message);
    queue.push(...outputs(tx));
  }
  assert(reply);
  const replyBody = reply.body.beginParse();
  replyBody.loadUint(32);
  const nonce = replyBody.loadUintBig(64);
  const forged = await f.send(f.migrator, reply.body, reply.info.value.coins, f.other);
  assert(exit(forged, f.migrator, 401));

  const returned = await f.chain.sendMessage(foreignRefund(f, account));
  assert(returned.transactions.some(t => t.inMessage?.info.src?.equals(account)
    && t.inMessage.info.dest.equals(f.pool)));
  assert(returned.transactions.some(t => t.inMessage?.info.src?.equals(f.pool)
    && t.inMessage.info.dest.equals(f.c.dex)));
  const duplicate = await f.chain.sendMessage(foreignRefund(f, account));
  assert(!duplicate.transactions.some(t => t.inMessage?.info.dest.equals(f.pool)));

  await f.chain.sendMessage(legs.native);
  assert((await accountAddress(f)).equals(account));
  assert.deepEqual((await accountAmounts(f, account)).sort(), [0n, TON].sort());

  assert(exit(await f.chain.sendMessage(reply), f.migrator, 0));
  const observation = (await f.chain.runGetMethod(f.migrator, 'get_recovery_observation_vnext')).stack.map(x => x.value);
  assert.deepEqual(observation.slice(0, 5), [ROOT, nonce, 4n, JETTONS, 0n]);
  assert.deepEqual(observation.slice(6), [0n, 0n]);
  assert(exit(await f.chain.sendMessage(reply), f.migrator, 409));

  // Same refund body can affect the later incarnation. A repeated request is
  // not a safe protocol-level idempotency mechanism across deletion.
  const later = await f.chain.sendMessage(foreignRefund(f, account));
  assert(later.transactions.some(t => t.inMessage?.info.src?.equals(account)
    && t.inMessage.info.dest.equals(f.pool)));
  const reconcile = () => f.send(f.migrator, body(0x414e4c3e).endCell(), 80000000n);
  await reconcile();
  await reconcile();
  const { stackReader: settlement } = await f.chain.runGetMethod(f.migrator, 'get_migration_settlement');
  for (let i = 0; i < 5; i++) settlement.readBigNumber();
  assert.equal(settlement.readBigNumber(), TON);
  assert.equal(settlement.readBigNumber(), JETTONS);
  await assertPending(f);
});

test('minimum-LP rejection recreates LPAccount holding both legs, while refund dispatch precedes returned balances', async () => {
  const f = await prepare(1000000000000000000n);
  const result = await f.execute(f.permit);
  const account = await accountAddress(f);
  assert.deepEqual((await accountAmounts(f, account)).sort(), [TON, JETTONS].sort());
  assert(result.transactions.some(t => t.inMessage?.info.dest.equals(account)
    && t.description.actionPhase?.statusChange === 'deleted'));
  assert(result.transactions.some(t => t.inMessage?.info.src?.equals(f.pool)
    && t.inMessage.info.dest.equals(account) && t.inMessage.init));
  assert.equal((await f.stage())[1], 0n);

  const tx = await (await f.chain.getContract(account)).receiveMessage(foreignRefund(f, account));
  assert.equal(tx.description.aborted, false);
  const callback = outputs(tx).find(m => m.info.dest.equals(f.pool));
  assert(callback);
  console.log('LPACCOUNT_REFUND_EDGE', opcode(callback).toString(16));
  const before = (await f.chain.runGetMethod(f.migrator, 'get_migration_settlement')).stack.map(x => x.value);
  assert.deepEqual(before.slice(5, 7), [0n, 0n]);

  const routed = await f.chain.sendMessage(callback);
  console.log('LPACCOUNT_RETURN_ROUTE', routed.transactions.map(t => opcode(t.inMessage).toString(16)).join(' -> '));
  await f.send(f.migrator, body(0x414e4c3e).endCell(), 80000000n);
  const after = (await f.chain.runGetMethod(f.migrator, 'get_migration_settlement')).stack.map(x => x.value);
  assert.deepEqual(after.slice(5, 7), [TON, JETTONS]);
  assert(exit(await f.execute(f.permit), f.migrator, 409));
  await assertPending(f);
});
test('failed first token send leaves only pTON in LPAccount and native return is separate from token bounce', async () => {
  const f = await prepare();
  const legs = await splitDispatch(f);
  const { freeze } = require('./refund-receipts-support');
  await freeze(f, legs.token.info.dest);
  const failure = await f.chain.sendMessage(legs.token);
  assert(failure.transactions.some(t => t.inMessage?.info.bounced && t.inMessage.info.src.equals(legs.token.info.dest)));
  await f.chain.sendMessage(legs.native);
  const account = await accountAddress(f);
  assert.deepEqual((await accountAmounts(f, account)).sort(), [0n, TON].sort());
  const refund = await f.chain.sendMessage(foreignRefund(f, account));
  assert(refund.transactions.some(t => t.inMessage?.info.src?.equals(f.c.ptonWallet)
    && t.inMessage.info.dest.equals(f.migrator) && opcode(t.inMessage) === 0x01f3835d));
  const returned = (await f.chain.runGetMethod(f.migrator, 'get_migration_settlement')).stack.map(x => x.value);
  assert.deepEqual(returned.slice(5, 7), [TON, JETTONS]);
  assert.equal((await f.stage())[1], 0n);
  await assertPending(f);
});
test('unlocked withdrawal changes LP holdings while the Migrator preserves its historical receipt', async () => {
  const f = await ready({ percent: 50, duration: 'days180' });
  await f.fund();
  await f.execute(await f.authorize());
  const observation = await f.stage();
  assert.equal(observation[0], 5n);
  assert(observation[3] > 0n);
  const claim = body(0x414c5633, 1n).storeBit(false).storeCoins(observation[3]).endCell();
  assert(exit(await f.send(f.c.vault.address, claim, 150000000n, f.other), f.c.vault.address, 0));
  const { stackReader } = await f.chain.runGetMethod(f.c.vault.lpWallet, 'get_wallet_data');
  assert.equal(stackReader.readBigNumber(), observation[2]);
  assert.deepEqual(await f.stage(), observation);
});
