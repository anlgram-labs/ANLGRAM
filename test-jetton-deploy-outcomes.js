'use strict';

// Local mocked wallet tests: no blockchain calls or transactions are made.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { TextEncoder } = require('util');

const html = fs.readFileSync(require('path').join(__dirname, 'memecoin-platform.html'), 'utf8');
const start = html.indexOf('    async function deployJettonWeb3(event) {');
const end = html.indexOf('    // DEX selection state', start);
assert(start >= 0 && end > start, 'deployment function is present');
const source = html.slice(start, end);

function createContext({ connected = true, hasCore = true, logo = 'https://example.org/logo.png', reject = false, logoConfirm = true, badWalletCode = false, approvedFixture = true, consent = true } = {}) {
  let sent = 0;
  const events = [];
  const values = { 'labs-card1-name': 'Example', 'labs-card1-symbol': 'EXM', 'lp-desc': '', 'lp-logo': logo };
  const document = { getElementById(id) { return id === 'deploy-confirm-checkbox' ? { checked: consent } : id in values ? { value: values[id], focus() {} } : null; } };
  const builder = { storeUint() { return this; }, storeCoins() { return this; }, storeAddress() { return this; }, storeRef() { return this; }, storeBit() { return this; }, storeStringTail() { return this; }, storeDict() { return this; }, store() { return this; }, endCell() { return this; }, toBoc() { return Buffer.from('cell'); } };
  const hash = '9a0f98dd6fbf225eef8165e4e64417ee931f7eea000653439e7b5dcdc0644cd6';
  const walletHash = 'beb0683ebeb8927fe9fc8ec0a18bc7dd17899689825a121eab46c5a3a860d0ce';
  let cellRead = 0;
  const tonCore = { beginCell: () => builder, toNano: () => 1n, storeStateInit: () => null,
    Dictionary: { empty: () => new Map(), Keys: { BigUint: () => null }, Values: { Cell: () => null } },
    Cell: { fromBoc: () => [{ hash: () => Buffer.from((cellRead++ % 2 === 0) ? hash : (badWalletCode ? '00'.repeat(32) : walletHash), 'hex') }] }, contractAddress: () => ({ toString: () => 'expected-minter' }),
    Address: { parse: () => ({}) } };
  const tc = { connected, account: { address: 'sender', chain: '-239' }, openModal() {}, async sendTransaction(tx) { sent++; assert.strictEqual(tx.messages.length, 3); assert.strictEqual(tx.messages[2].amount, '20000000'); if (reject) throw new Error('Wallet rejected'); return { boc: 'signed' }; } };
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const window = { tonConnectUI: tc, TON_CORE: hasCore ? tonCore : {}, dispatchEvent: e => events.push(e), wizardState: {} };
  const donation = require('./assets/js/donation-config');
  window.ANLGRAM_DONATION_CONFIG = { ...donation, createMessage: () => ({ address: donation.RECIPIENT_ADDRESS, amount: '20000000', payload: 'fixture' }) };
  const context = { window, document, localStorage: storage, alert() {}, confirm: () => logoConfirm,
    fetch: async () => ({ ok: true, json: async () => ({ standardMinterCodeHex: '00', standardWalletCodeHex: '00' }) }),
    crypto: { subtle: { digest: async () => new Uint8Array(32).buffer } }, TextEncoder, Uint8Array, Buffer,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, console };
  vm.createContext(context);
  // Only this mock fixture enables serialization; the shipped source stays blocked.
  vm.runInContext(approvedFixture ? source.replace('const CREATION_MAINNET_APPROVED = false', 'const CREATION_MAINNET_APPROVED = true') : source, context);
  return { context, tc, events, get sent() { return sent; } };
}

function event() { return { wizardInitiated: true, currentTarget: { innerHTML: 'Deploy', style: {}, removeAttribute() {} } }; }

(async () => {
  let passed = 0;
  async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
  await check('shipped production gate never opens a wallet request', async () => {
    const t = createContext({ approvedFixture: false }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.match(r.reason, /production approval/); assert.strictEqual(t.sent, 0);
  });
  await check('missing mandatory donation consent cannot sign', async () => {
    const t = createContext({ consent: false }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('testnet cannot use the designated mainnet donation recipient', async () => {
    const t = createContext(); t.tc.account.chain = '-3';
    const r = await t.context.deployJettonWeb3(event()); assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('substituted donation configuration cannot sign', async () => {
    const t = createContext(); t.context.window.ANLGRAM_DONATION_CONFIG.RECIPIENT_ADDRESS = 'unauthorized';
    const r = await t.context.deployJettonWeb3(event()); assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('substituted donation message cannot sign', async () => {
    const t = createContext(); t.context.window.ANLGRAM_DONATION_CONFIG.createMessage = () => ({ address: 'unauthorized', amount: '20000000' });
    const r = await t.context.deployJettonWeb3(event()); assert.strictEqual(r.submitted, false); assert.match(r.reason, /changed/); assert.strictEqual(t.sent, 0);
  });
  await check('disconnected wallet does not submit', async () => {
    const t = createContext({ connected: false }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0); assert.strictEqual(t.events.length, 0);
  });
  await check('missing TON libraries do not submit', async () => {
    const t = createContext({ hasCore: false }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('cancelled logo fallback is safe and does not submit', async () => {
    const t = createContext({ logo: 'data:image/png;base64,AA', logoConfirm: false }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('wallet rejection does not emit deployment event', async () => {
    const t = createContext({ reject: true }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(r.uncertain, true); assert.match(r.reason, /rejected/); assert.strictEqual(t.events.length, 0);
    const retry = await t.context.deployJettonWeb3(event()); assert.strictEqual(retry.uncertain, true); assert.strictEqual(t.sent, 1);
  });
  await check('wallet acceptance returns exact address but does not assert on-chain success', async () => {
    const t = createContext(); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, true); assert.strictEqual(r.destAddressMint, 'expected-minter'); assert.strictEqual(t.events.length, 1); assert.strictEqual(t.events[0].detail.wizardInitiated, true);
    const retry = await t.context.deployJettonWeb3(event()); assert.strictEqual(retry.uncertain, true); assert.strictEqual(t.sent, 1);
  });
  await check('unknown wallet chain does not submit', async () => {
    const t = createContext(); t.tc.account.chain = ''; const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.strictEqual(t.sent, 0);
  });
  await check('unexpected Jetton wallet code cannot reach signing', async () => {
    const t = createContext({ badWalletCode: true }); const r = await t.context.deployJettonWeb3(event());
    assert.strictEqual(r.submitted, false); assert.match(r.reason, /wallet bytecode hash/); assert.strictEqual(t.sent, 0);
  });
  await check('production pool preview is opt-in and cannot remove liquidity', async () => {
    const a = html.indexOf("const isDemoPreview = localStorage.getItem('anlgram_demo_pools_preview') === 'true'");
    const b = html.indexOf('// Load only tokens WHERE wallet is admin', a);
    assert(a >= 0 && b > a);
    const pools = html.slice(a, b);
    assert.match(pools, /DEMO PREVIEW/); assert.match(pools, /No Verified Liquidity Pools|No Active Liquidity Pools|No Liquidity Pools/i);
    assert(!pools.includes('onclick="removeLiquidityRedirect('));
  });
  console.log(`${passed} mocked wallet checks passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
