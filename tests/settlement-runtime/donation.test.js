'use strict';
// Local Sandbox and injected RPC fixtures only. No transactions are broadcast.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('@ton/core');
const { Blockchain } = require('@ton/sandbox');
const donation = require('../../assets/js/donation-config');
const receipts = require('../../assets/js/transaction-receipt');
const wallet = new core.Address(0, Buffer.alloc(32, 11));
const recipient = core.Address.parse(donation.RECIPIENT_ADDRESS);
const body = core.beginCell().storeUint(98, 32).endCell();
const envelope = core.beginCell().store(core.storeMessage(core.external({ to: wallet, body }))).endCell().toBoc().toString('base64');
const submission = receipts.create(envelope, wallet.toRawString(), '-239', core);
function fixtures() {
  const message = { msg_type: 'int_msg', hash: 'cd'.repeat(32), bounced: false, value: 20000000,
    source: { address: wallet.toRawString() }, destination: { address: recipient.toRawString() },
    raw_body: core.Cell.fromBase64(donation.createMessage(core, '-239').payload).toBoc().toString('hex') };
  const phases = { compute_phase: { skipped: false, success: true, exit_code: 0 }, action_phase: { success: true, result_code: 0, skipped_actions: 0 } };
  const root = { hash: 'ab'.repeat(32), success: true, aborted: false, account: { address: wallet.toRawString() }, ...phases,
    in_msg: { msg_type: 'ext_in_msg', destination: { address: wallet.toRawString() }, raw_body: body.toBoc().toString('hex') }, out_msgs: [message] };
  const child = { hash: 'ef'.repeat(32), success: true, aborted: false, account: { address: recipient.toRawString() }, ...phases, in_msg: { ...message }, out_msgs: [] };
  return { root, child };
}
const verify = f => receipts.lookupDonation(submission, '-239', async url => ({ ok: true, json: async () => url.includes(submission.hash) ? f.root : f.child }), core, donation);
test('donation uses exact original creation base and valid immutable mainnet recipient', () => {
  assert.equal(donation.BASE_EXECUTION_NANO, 200000000n);
  assert.equal(donation.calculateDonation(200000000n).donationNano, 20000000n);
  assert.equal(donation.TOTAL_TRANSACTION_NANO, 220000000n);
  assert.equal(core.Address.parseFriendly(donation.RECIPIENT_ADDRESS).isTestOnly, false);
  assert(Object.isFrozen(donation));
  assert.throws(() => donation.createMessage(core, '-3'));
});
test('local Sandbox executes donation exactly once with exact incoming TON and comment', async () => {
  const chain = await Blockchain.create();
  chain.now = 1800000000;
  const payer = await chain.treasury('donation-payer');
  const msg = donation.createMessage(core, '-239');
  const result = await payer.send({ to: recipient, value: BigInt(msg.amount), bounce: false, body: core.Cell.fromBase64(msg.payload), sendMode: core.SendMode.PAY_GAS_SEPARATELY });
  const received = result.transactions.filter(t => t.inMessage?.info.type === 'internal' && t.inMessage.info.dest.equals(recipient));
  assert.equal(received.length, 1);
  assert.equal(received[0].inMessage.info.value.coins, 20000000n);
  const s = received[0].inMessage.body.beginParse(); assert.equal(s.loadUint(32), 0); assert.equal(s.loadStringTail(), donation.PAYLOAD_COMMENT);
  assert.equal((await chain.getContract(recipient)).balance, 20000000n);
});
test('only correlated executed donation is confirmed', async () => assert.equal((await verify(fixtures())).status, 'INCLUDED'));
for (const [name, mutate] of [
  ['missing child', f => { f.child = {}; }],
  ['wrong child hash', f => { f.child.in_msg.hash = '00'.repeat(32); }],
  ['substituted recipient', f => { f.child.account.address = wallet.toRawString(); }],
  ['wrong amount', f => { f.child.in_msg.value = 19000000; }],
  ['bounced transfer', f => { f.child.in_msg.bounced = true; }],
  ['failed recipient', f => { f.child.aborted = true; }],
  ['failed action result', f => { f.child.action_phase = { success: true, result_code: 37, skipped_actions: 0 }; }],
  ['skipped recipient actions', f => { f.child.action_phase = { success: true, result_code: 0, skipped_actions: 1 }; }],
  ['emulated result', f => { f.child.emulated = true; }],
  ['duplicate debit', f => { f.root.out_msgs.push(f.root.out_msgs[0]); }],
  ['wrong comment', f => { f.child.in_msg.raw_body = body.toBoc().toString('hex'); }],
  ['wallet root only', f => { f.root.out_msgs = []; }],
]) test(`${name} cannot confirm donation`, async () => { const f = fixtures(); mutate(f); assert.equal((await verify(f)).status, 'PENDING'); });

test('actual frontend serializes deploy, mint and donation; Sandbox executes all three', async () => {
  const chain = await Blockchain.create(); const payer = await chain.treasury('creator');
  chain.now = 1800000000;
  const html = fs.readFileSync(require('node:path').join(__dirname, '../../memecoin-platform.html'), 'utf8');
  const start = html.indexOf('    async function deployJettonWeb3(event) {');
  // Fixture-only enablement. Shipped source remains production-blocked.
  const source = html.slice(start, html.indexOf('    // DEX selection state', start)).replace('const CREATION_MAINNET_APPROVED = false', 'const CREATION_MAINNET_APPROVED = true');
  let captured;
  const values = { 'labs-card1-name': 'Sandbox', 'labs-card1-symbol': 'SBX', 'lp-logo': 'https://example.org/logo.png' };
  const stored = new Map();
  const window = { TON_CORE: core, ANLGRAM_DONATION_CONFIG: donation, wizardState: {}, dispatchEvent() {},
    tonConnectUI: { connected: true, account: { address: payer.address.toRawString(), chain: '-239' }, sendTransaction: async tx => { captured = tx; return {}; } } };
  const ctx = { window, document: { getElementById: id => id === 'deploy-confirm-checkbox' ? { checked: true } : values[id] ? { value: values[id] } : null },
    localStorage: { getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v), removeItem: k => stored.delete(k) },
    fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../../src/config/pinned-contract-artifacts.json'), 'utf8')) }),
    crypto: require('node:crypto').webcrypto, TextEncoder, Uint8Array, Buffer, console, alert() {}, CustomEvent: class {} };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const event = () => ({ wizardInitiated: true, currentTarget: { innerHTML: 'Create', style: {}, removeAttribute() {} } });
  await ctx.deployJettonWeb3(event()); assert(captured); assert.equal(captured.messages.length, 3);
  assert.equal(captured.messages.reduce((n,m) => n + BigInt(m.amount), 0n), 220000000n);
  const messages = captured.messages.map(m => core.internal({ to: core.Address.parse(m.address), value: BigInt(m.amount), bounce: false,
    body: m.payload ? core.Cell.fromBase64(m.payload) : core.beginCell().endCell(), init: m.stateInit ? core.loadStateInit(core.Cell.fromBase64(m.stateInit).beginParse()) : undefined }));
  const result = await payer.sendMessages(messages, core.SendMode.PAY_GAS_SEPARATELY);
  assert.equal((await chain.getContract(recipient)).balance, 20000000n);
  const minter = core.Address.parse(captured.messages[0].address);
  const data = (await chain.runGetMethod(minter, 'get_jetton_data')).stackReader;
  assert.equal(data.readBigNumber(), 1000000000000000000n); data.readBigNumber(); assert(data.readAddress().equals(payer.address));
  const walletResult = await chain.runGetMethod(minter, 'get_wallet_address', [{ type: 'slice', cell: core.beginCell().storeAddress(payer.address).endCell() }]);
  const tokenWallet = walletResult.stackReader.readAddress();
  assert.equal((await chain.runGetMethod(tokenWallet, 'get_wallet_data')).stackReader.readBigNumber(), 1000000000000000000n);
  assert(!result.transactions.some(tx => tx.description.computePhase?.type === 'vm' && ![0,1].includes(tx.description.computePhase.exitCode)));
  captured = null; const retry = await ctx.deployJettonWeb3(event()); assert.equal(retry.uncertain, true); assert.equal(captured, null);
});
