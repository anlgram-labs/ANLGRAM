'use strict';
// Synthetic signed-envelope fixture and injected RPC responses, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./minter-contract/node_modules/@ton/core');
const api = require('./assets/js/transaction-receipt');
const wallet = new core.Address(0, Buffer.alloc(32, 1));
const other = new core.Address(0, Buffer.alloc(32, 2));
const body = core.beginCell().storeUint(123, 32).endCell();
const envelope = core.beginCell().store(core.storeMessage(core.external({ to: wallet, body }))).endCell().toBoc().toString('base64');
const submission = api.create(envelope, wallet.toRawString(), '-3', core);
function transaction() { return { hash: 'ab'.repeat(32), account: { address: wallet.toRawString() }, success: true, aborted: false,
  compute_phase: { skipped: false, success: true, exit_code: 0 },
  action_phase: { success: true, result_code: 0, skipped_actions: 0 },
  in_msg: { msg_type: 'ext_in_msg', destination: { address: wallet.toRawString() }, raw_body: body.toBoc().toString('hex') } }; }
const lookup = tx => api.lookup(submission, '-3', async url => {
  assert.equal(url, `/blockchain/messages/${submission.hash}/transaction`);
  return { ok: true, json: async () => tx };
}, core);
test('normalized hash matches independent canonical external envelope', () => {
  const normalized = core.beginCell().storeUint(2,2).storeUint(0,2).storeAddress(wallet).storeCoins(0).storeBit(0).storeBit(1).storeRef(body).endCell();
  assert.equal(submission.hash, normalized.hash().toString('hex'));
  assert(!JSON.stringify(submission).includes(envelope));
});
test('wrong wallet and unknown network cannot create submission', () => {
  assert.throws(() => api.create(envelope, other.toRawString(), '-3', core));
  assert.throws(() => api.create(envelope, wallet.toRawString(), '', core));
});
test('included receipt explicitly proves wallet execution only', async () => {
  const result = await lookup(transaction());
  assert.equal(result.status, 'INCLUDED'); assert.equal(result.scope, 'wallet_transaction_only');
});
test('another message body does not confirm', async () => {
  const tx = transaction(); tx.in_msg.raw_body = core.beginCell().storeUint(124,32).endCell().toBoc().toString('hex');
  assert.equal((await lookup(tx)).status, 'PENDING');
});
test('another account does not confirm', async () => {
  const tx = transaction(); tx.account.address = other.toRawString(); assert.equal((await lookup(tx)).status, 'PENDING');
});
test('failed transaction is not accepted', async () => {
  const tx = transaction(); tx.aborted = true; assert.equal((await lookup(tx)).status, 'FAILED');
});
test('skipped actions and missing compute evidence stay unverified', async () => {
  const tx = transaction(); tx.action_phase.skipped_actions = 1; assert.equal((await lookup(tx)).status, 'PENDING');
  delete tx.compute_phase; assert.equal((await lookup(tx)).status, 'PENDING');
});
test('emulation cannot count as blockchain inclusion', async () => {
  const tx = transaction(); tx.emulated = true; assert.equal((await lookup(tx)).status, 'PENDING');
});
test('network mismatch makes no RPC request', async () => {
  const result = await api.lookup(submission, '-239', () => { throw new Error('must not call'); }, core);
  assert.equal(result.status, 'PENDING');
});
test('tampered stored hash cannot accept a response with another normalized identity', async () => {
  const result = await api.lookup({ ...submission, hash: 'ff'.repeat(32) }, '-3', async () => ({ ok: true, json: async () => transaction() }), core);
  assert.equal(result.status, 'PENDING');
});
test('404 and transport failure are pending', async () => {
  assert.equal((await api.lookup(submission, '-3', async () => ({ ok: false }), core)).status, 'PENDING');
  assert.equal((await api.lookup(submission, '-3', async () => { throw new Error('offline'); }, core)).status, 'PENDING');
});
