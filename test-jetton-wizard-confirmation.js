'use strict';

// Mocked local integration tests. No wallet or RPC request leaves this process.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const js = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf8');
const start = js.indexOf('  window.labsExecuteDeployFromWizard = async function () {');
const end = js.indexOf('  // 5. STEP 3:', start);
assert(start >= 0 && end > start);
const source = js.slice(start, end) + '\nwindow.testPoll = labsPollDeploymentConfirmation;';

function setup({ result, chain = '-239', report, balance = '1000000000000000000' } = {}) {
  const elements = {};
  for (const id of ['deploy-confirm-checkbox', 'wizard-deploy-status-banner', 'wizard-deploy-status-text', 'wizard-step2-deploy-btn', 'wizard-deploy-success-area', 'wizard-deploy-contract-link', 'wizard-step2-continue-btn']) {
    elements[id] = { checked: true, style: {}, textContent: '', innerHTML: '' };
  }
  const listeners = {};
  const calls = [];
  const wizardState = { deployment: { status: 'idle', minterAddress: '', reviewedWallet: 'sender', reviewedChain: chain }, tokenDraft: { name: 'Example', symbol: 'EXM' } };
  const tc = { connected: true, account: { address: 'sender', chain } };
  const window = { tonConnectUI: tc, TON_CORE: { Address: { parse: x => ({ equals: y => x === y.value, value: x }) } },
    AnlgramTransactionReceipt: { lookup: async () => ({ status: 'INCLUDED', scope: 'wallet_transaction_only' }), lookupDonation: async () => ({ status: 'INCLUDED', scope: 'creation_donation_only' }) },
    deployJettonWeb3: async () => result,
    addEventListener: (type, fn) => { listeners[type] = fn; }, dispatchEvent() {},
    TokenVerificationEngine: { verifyToken: async address => { calls.push(address); return report; } } };
  const context = { window, wizardState, document: { getElementById: id => elements[id] || null },
    labsCloseModal() {}, getNetworkContext: () => ({ chainId: chain, tonscanBase: 'https://example.test' }),
    labsFetchTonApi: async () => ({ ok: true, json: async () => ({ balances: [{ jetton: { address: 'expected' }, balance }] }) }),
    rawToFriendly: x => x, shortAddr: x => x, localStorage: { getItem: () => '', setItem() {} },
    CustomEvent: class {}, setTimeout: fn => { fn(); return 0; }, console };
  vm.createContext(context); vm.runInContext(source, context);
  return { context, wizardState, elements, listeners, calls };
}
const validReport = { target: { network: 'TON Mainnet' }, claims: {
  account_status: { status: 'VERIFIED' },
  total_supply: { status: 'VERIFIED', evidence: { rawSupply: '1000000000000000000', decimals: 9 } },
  admin_status: { status: 'VERIFIED', evidence: { isUserAdmin: true } },
} };

(async () => {
  let passed = 0;
  async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
  await check('unverified donation prevents confirmation even with matching minted balance', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    t.context.window.AnlgramTransactionReceipt.lookupDonation = async () => ({ status: 'PENDING' });
    await t.context.window.labsExecuteDeployFromWizard();
    assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed'); assert.strictEqual(t.calls.length, 0);
  });
  await check('failed wallet request does not start blockchain polling', async () => {
    const t = setup({ result: { submitted: false, reason: 'cancelled' } }); await t.context.window.labsExecuteDeployFromWizard();
    assert.strictEqual(t.wizardState.deployment.status, 'failed'); assert.strictEqual(t.calls.length, 0);
  });
  await check('uncertain wallet request remains pending without a retry send', async () => {
    const t = setup({ result: { submitted: false, uncertain: true, destAddressMint: 'expected' } }); await t.context.window.labsExecuteDeployFromWizard();
    assert.strictEqual(t.wizardState.deployment.status, 'verifying'); assert.strictEqual(t.calls.length, 0);
    assert.match(t.elements['wizard-deploy-status-text'].textContent, /uncertain/);
  });
  await check('testnet is never verified by the Mainnet-only engine', async () => {
    const t = setup({ chain: '-3', result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    await t.context.window.labsExecuteDeployFromWizard(); assert.strictEqual(t.calls.length, 0); assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed');
  });
  await check('an active account alone cannot confirm mint and ownership', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: { target: { network: 'TON Mainnet' }, claims: { account_status: { status: 'VERIFIED' } } } });
    await t.context.window.labsExecuteDeployFromWizard(); assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed'); assert(t.calls.every(a => a === 'expected'));
  });
  await check('incorrect creator balance does not confirm deployment', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport, balance: '0' });
    await t.context.window.labsExecuteDeployFromWizard(); assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed');
  });
  await check('numeric JSON balances cannot masquerade as exact integer strings', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport, balance: 1000000000000000000 });
    await t.context.window.labsExecuteDeployFromWizard(); assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed');
  });
  await check('changing wallet during verification prevents confirmation', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    t.context.window.TokenVerificationEngine.verifyToken = async () => { t.context.window.tonConnectUI.account.address = 'other'; return validReport; };
    await t.context.window.labsExecuteDeployFromWizard(); assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed');
  });
  await check('matching state and balance verifies only the expected address', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    await t.context.window.labsExecuteDeployFromWizard(); assert.strictEqual(t.wizardState.deployment.status, 'confirmed'); assert.deepStrictEqual(t.calls, ['expected']);
  });
  await check('wizard deployment event does not launch a second poll', async () => {
    const t = setup({ report: validReport }); t.listeners.anlgramJettonDeployed({ detail: { destAddressMint: 'expected', wizardInitiated: true } });
    assert.strictEqual(t.calls.length, 0);
  });
  await check('a changed network invalidates the reviewed authorization', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    t.context.alert = () => {}; t.context.window.tonConnectUI.account.chain = '-3';
    await t.context.window.labsExecuteDeployFromWizard();
    assert.strictEqual(t.wizardState.deployment.status, 'idle'); assert.strictEqual(t.calls.length, 0);
  });
  await check('missing transaction receipt cannot confirm deployment from balances alone', async () => {
    const t = setup({ result: { submitted: true, destAddressMint: 'expected' }, report: validReport });
    t.context.window.AnlgramTransactionReceipt.lookup = async () => ({ status: 'PENDING' });
    await t.context.window.labsExecuteDeployFromWizard();
    assert.notStrictEqual(t.wizardState.deployment.status, 'confirmed'); assert.equal(t.calls.length, 0);
  });
  console.log(`${passed} mocked wizard checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
