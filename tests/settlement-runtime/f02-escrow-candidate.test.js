'use strict';
// UNVERIFIED TEST DESIGN. Execute only in independently verified OS isolation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('@ton/core');
const {Blockchain, createShardAccount, internal} = require('@ton/sandbox');
const {compileFunc} = require('@ton-community/func-js');
const {build} = require('../../minter-contract/scripts/f02-escrow-candidate');
const {beginCell, Cell, Address} = core;
const addr = n => new Address(0, Buffer.alloc(32, n));
const OP = {deposit: 0x46323001, ton: 0x46323002, jetton: 0x46323003, ack: 0x46323004, restoreTon: 0x46323006, queryJetton: 0x46323007, retryJetton: 0x46323008, notification: 0x7362d09c};
const body = (op, q, seq, amount) => {
  const b = beginCell().storeUint(op, 32).storeUint(q, 64);
  if (seq !== undefined) b.storeUint(seq, 64);
  return b.storeCoins(amount).endCell();
};
async function fixture() {
  const root = path.resolve(__dirname, '../..');
  const target = 'minter-contract/contracts/anlgram-f02-escrow-candidate.fc';
  const result = await compileFunc({targets: [target], sources: name =>
    fs.readFileSync(path.resolve(root, name), 'utf8').replace(/\r\n/g, '\n')});
  assert.equal(result.status, 'ok', result.message);
  const code = Cell.fromBase64(result.codeBoc), controller = addr(1), master = addr(2), walletCode = beginCell().endCell();
  const escrow = build(core, {code, controller, master, walletCode, operationId: 77n});
  const other = build(core, {code, controller, master, walletCode, operationId: 78n});
  assert(!escrow.address.equals(other.address));
  const chain = await Blockchain.create();
  await chain.setShardAccount(escrow.address, createShardAccount({address: escrow.address, ...escrow.init, balance: 100000000n}));
  const account = await chain.getContract(escrow.address);
  const send = async (from, messageBody, value = 100000000n) => account.receiveMessage(internal({from, to: escrow.address, value, bounce: true, body: messageBody}));
  const read = async method => {
    const s = (await chain.runGetMethod(escrow.address, method)).stackReader;
    return Array.from({length: 6}, () => s.readBigNumber());
  };
  return {escrow, controller, master, walletCode, chain, account, send, read};
}
function exit(tx) { return tx.description.computePhase.exitCode; }

test('TON deposit and recovery remain pending until exact controller attestation', async () => {
  const f = await fixture();
  assert.equal(exit(await f.send(addr(9), body(OP.deposit, 77, 1, 1000000000n), 1100000000n)), 401);
  assert.equal(exit(await f.send(f.controller, body(OP.deposit, 78, 1, 1000000000n), 1100000000n)), 409);
  assert.equal(exit(await f.send(f.controller, body(OP.deposit, 77, 1, 1000000000n), 1000000000n)), 407);
  assert.equal(exit(await f.send(f.controller, body(OP.deposit, 77, 1, 1000000000n), 1100000000n)), 0);
  assert.equal(exit(await f.send(f.controller, body(OP.deposit, 77, 1, 1), 100000000n)), 409);
  assert.equal(exit(await f.send(f.controller, body(OP.deposit, 77, 2, 100), 100000000n)), 0);
  const payout = await f.send(f.controller, body(OP.ton, 77, 0, 400000000n));
  assert.equal(exit(payout), 0);
  assert.equal(payout.description.actionPhase.success, true);
  const tonOut = [...payout.outMessages.values()].find(m => m.info.dest.equals(f.controller));
  assert(tonOut);
  assert.equal(tonOut.info.value.coins, 400000000n);
  assert.equal(tonOut.body.beginParse().loadUint(32), 0x46323005);
  assert.deepEqual(await f.read('get_f02_ton_ledger'), [600000100n, 400000000n, 0n, 1n, 0n, 1000000100n]);
  // A simulated TON bounce cannot release the full amount: fees may be lost.
  const tonBounce = beginCell().storeUint(0xffffffff, 32).storeUint(0x46323005, 32).storeUint(77, 64).storeUint(0, 64).endCell();
  await f.account.receiveMessage(internal({from: f.controller, to: f.escrow.address, value: 390000000n, bounced: true, body: tonBounce}));
  assert.deepEqual(await f.read('get_f02_ton_ledger'), [600000100n, 400000000n, 0n, 1n, 0n, 1000000100n]);
  assert.equal(exit(await f.send(f.controller, body(OP.ton, 77, 1, 1))), 461);
  assert.equal(exit(await f.send(addr(9), body(OP.ack, 77, 0, 400000000n))), 401);
  assert.equal(exit(await f.send(f.controller, body(OP.ack, 77, 0, 400000000n))), 409);
  const restore = beginCell().storeUint(OP.restoreTon, 32).storeUint(77, 64).storeUint(0, 64).endCell();
  assert.equal(exit(await f.send(addr(9), restore)), 401);
  assert.equal(exit(await f.send(f.controller, restore)), 0);
  assert.deepEqual(await f.read('get_f02_ton_ledger'), [1000000100n, 0n, 0n, 1n, 0n, 1000000100n]);
  assert.equal(exit(await f.send(f.controller, restore)), 409);
  assert.equal(exit(await f.send(f.controller, body(OP.ton, 77, 1, 400000000n))), 0);
  assert.equal(exit(await f.send(f.controller, body(OP.ack, 77, 1, 399999999n))), 462);
  assert.equal(exit(await f.send(f.controller, body(OP.ack, 77, 1, 400000000n))), 0);
  assert.deepEqual(await f.read('get_f02_ton_ledger'), [600000100n, 0n, 400000000n, 2n, 0n, 1000000100n]);
  assert.equal(exit(await f.send(f.controller, body(OP.ack, 77, 1, 400000000n))), 462);
});

test('only the derived wallet and configured origin can credit a Jetton deposit', async () => {
  const f = await fixture();
  const wallet = (await f.chain.runGetMethod(f.escrow.address, 'get_f02_jetton_wallet')).stackReader.readAddress();
  const note = (origin, q = 77) => beginCell().storeUint(OP.notification, 32).storeUint(q, 64)
    .storeCoins(1000).storeAddress(origin).storeBit(false).endCell();
  assert.equal(exit(await f.send(addr(9), note(f.controller))), 401);
  assert.equal(exit(await f.send(wallet, note(addr(9)))), 401);
  assert.equal(exit(await f.send(wallet, note(f.controller, 78))), 409);
  assert.equal(exit(await f.send(wallet, note(f.controller))), 0);
  assert.equal(exit(await f.send(wallet, note(f.controller))), 409);
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [1000n, 0n, 0n, 0n, 0n, 1000n]);
  assert.equal(exit(await f.send(f.controller, body(OP.jetton, 77, 0, 1000), 100000000n)), 407);
  const payout = await f.send(f.controller, body(OP.jetton, 77, 0, 1000), 300000000n);
  assert.equal(exit(payout), 0);
  assert.equal(payout.description.actionPhase.success, true);
  const walletOut = [...payout.outMessages.values()].find(m => m.info.dest.equals(wallet));
  assert(walletOut);
  const transfer = walletOut.body.beginParse();
  assert.equal(transfer.loadUint(32), 0x414e5301);
  assert.equal(transfer.loadUintBig(64), 0n);
  assert.equal(transfer.loadCoins(), 1000n);
  assert(transfer.loadAddress().equals(f.controller));
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [0n, 1000n, 0n, 1n, 0n, 1000n]);
  // Injected bounced messages exercise state transitions, not wallet behavior.
  const bounced = beginCell().storeUint(0xffffffff, 32).storeUint(0x414e5301, 32).storeUint(0, 64).endCell();
  const inject = from => f.account.receiveMessage(internal({from, to: f.escrow.address, value: 30000000n, bounced: true, body: bounced}));
  await inject(addr(9));
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [0n, 1000n, 0n, 1n, 0n, 1000n]);
  await inject(wallet);
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [0n, 1000n, 0n, 1n, 0n, 1000n]);
  const query = beginCell().storeUint(OP.queryJetton, 32).storeUint(77, 64).storeUint(0, 64).endCell();
  const retry = beginCell().storeUint(OP.retryJetton, 32).storeUint(77, 64).storeUint(0, 64).endCell();
  assert.equal(exit(await f.send(addr(9), query)), 401);
  const queried = await f.send(f.controller, query);
  const queryMessage = [...queried.outMessages.values()].find(m => m.info.dest.equals(wallet));
  assert.equal(queryMessage.body.beginParse().loadUint(32), 0x414e5305);
  const retried = await f.send(f.controller, retry, 300000000n);
  const retryMessage = [...retried.outMessages.values()].find(m => m.info.dest.equals(wallet));
  assert(retryMessage.body.equals(walletOut.body), 'retry must preserve the same wallet request');
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [0n, 1000n, 0n, 1n, 0n, 1000n]);
  const receipt = (amount, status) => beginCell().storeUint(0x414e5304, 32).storeUint(0, 64)
    .storeUint(123, 64).storeCoins(amount).storeUint(status, 2).endCell();
  assert.equal(exit(await f.send(addr(9), receipt(1000, 3))), 401);
  assert.equal(exit(await f.send(wallet, receipt(999, 3))), 409);
  assert.equal(exit(await f.send(wallet, receipt(1000, 3))), 0);
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [1000n, 0n, 0n, 1n, 0n, 1000n]);
  await f.send(wallet, receipt(1000, 3));
  assert.deepEqual(await f.read('get_f02_jetton_ledger'), [1000n, 0n, 0n, 1n, 0n, 1000n]);
});

test('real Sandbox Jetton wallets transfer and credit separate deposits', async () => {
  const root = path.resolve(__dirname, '../..');
  const compile = async target => {
    const r = await compileFunc({targets: [target], sources: name =>
      fs.readFileSync(path.resolve(root, name), 'utf8').replace(/\r\n/g, '\n')});
    assert.equal(r.status, 'ok', r.message);
    return Cell.fromBase64(r.codeBoc);
  };
  const [escrowCode, walletCode, minterCode] = await Promise.all([
    compile('minter-contract/contracts/anlgram-f02-escrow-candidate.fc'),
    compile('minter-contract/contracts/anlgram-settlement-wallet.fc'),
    compile('minter-contract/contracts/anlgram-launchpad-jetton-minter.fc')
  ]);
  const chain = await Blockchain.create(), owner = await chain.treasury('f02-real-owner');
  const minterInit = {code: minterCode, data: beginCell().storeCoins(0).storeAddress(owner.address)
    .storeRef(beginCell().endCell()).storeRef(walletCode).endCell()};
  const master = core.contractAddress(0, minterInit);
  await owner.send({to: master, init: minterInit, value: 100000000n});
  const mint = beginCell().storeUint(0x178d4519, 32).storeUint(1, 64).storeCoins(10000)
    .storeAddress(null).storeAddress(owner.address).storeCoins(0).storeBit(false).endCell();
  await owner.send({to: master, value: 200000000n, body: beginCell().storeUint(21, 32)
    .storeUint(1, 64).storeAddress(owner.address).storeCoins(100000000n).storeRef(mint).endCell()});
  const escrow = build(core, {code: escrowCode, controller: owner.address, master, walletCode, operationId: 77n});
  await chain.setShardAccount(escrow.address, createShardAccount({address: escrow.address, ...escrow.init, balance: 100000000n}));
  const wallet = who => core.contractAddress(0, {code: walletCode, data: beginCell().storeCoins(0)
    .storeAddress(who).storeAddress(master).storeRef(walletCode).endCell()});
  const transfer = amount => beginCell().storeUint(0x0f8a7ea5, 32).storeUint(77, 64).storeCoins(amount)
    .storeAddress(escrow.address).storeAddress(owner.address).storeBit(false).storeCoins(20000000).storeBit(false).endCell();
  // Identical query and amount in distinct actual messages must be credited twice.
  for (const amount of [1000n, 1000n]) {
    const txs = await owner.send({to: wallet(owner.address), value: 300000000n, body: transfer(amount)});
    const notification = txs.transactions.find(tx => tx.inMessage?.info.dest?.equals(escrow.address) &&
      tx.inMessage.body.bits.length >= 32 && tx.inMessage.body.beginParse().preloadUint(32) === OP.notification);
    assert(notification, 'actual wallet notification must reach escrow');
    assert.equal(notification.description.computePhase.exitCode, 0);
    assert.equal(notification.description.actionPhase.success, true);
  }
  const balance = (await chain.runGetMethod(wallet(escrow.address), 'get_wallet_data')).stackReader.readBigNumber();
  const s = (await chain.runGetMethod(escrow.address, 'get_f02_jetton_ledger')).stackReader;
  assert.deepEqual(Array.from({length: 6}, () => s.readBigNumber()), [2000n, 0n, 0n, 0n, 0n, 2000n]);
  assert.equal(balance, 2000n);
  assert.equal((await chain.runGetMethod(wallet(owner.address), 'get_wallet_data')).stackReader.readBigNumber(), 8000n);
  const recovery = await owner.send({to: escrow.address, value: 400000000n, body: body(OP.jetton, 77, 0, 500n)});
  const walletRequest = recovery.transactions.find(tx => tx.inMessage?.info.dest?.equals(wallet(escrow.address)) &&
    tx.inMessage.body.bits.length >= 32 && tx.inMessage.body.beginParse().preloadUint(32) === 0x414e5301);
  assert(walletRequest, 'sender wallet must process the settlement request');
  assert.equal(walletRequest.description.computePhase.exitCode, 0);
  assert.equal(walletRequest.description.actionPhase.success, true);
  const receiptTx = recovery.transactions.find(tx => tx.inMessage?.info.dest?.equals(escrow.address) &&
    tx.inMessage.body.bits.length >= 32 && tx.inMessage.body.beginParse().preloadUint(32) === 0x414e5304);
  assert(receiptTx, 'settlement wallet must provide an outcome receipt');
  assert.equal(receiptTx.description.computePhase.exitCode, 0);
  assert.equal((await chain.runGetMethod(wallet(owner.address), 'get_wallet_data')).stackReader.readBigNumber(), 8500n);
  assert.equal((await chain.runGetMethod(wallet(escrow.address), 'get_wallet_data')).stackReader.readBigNumber(), 1500n);
  const after = (await chain.runGetMethod(escrow.address, 'get_f02_jetton_ledger')).stackReader;
  assert.deepEqual(Array.from({length: 6}, () => after.readBigNumber()), [1500n, 0n, 500n, 1n, 0n, 2000n]);
});
