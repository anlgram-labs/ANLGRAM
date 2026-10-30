'use strict';

// Isolated browser mocks; no wallet, network, or blockchain operations occur.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf8');

function harness({ storage = new Map(), send, failStorage = false, decimals = 9, chain = '-3', search = '', extensions = [], scaledUi, balance = '1000000000000000000000000000', enableTestOnlySendPath = true } = {}) {
  const nodes = {};
  const coins = [];
  const confirmations = [];
  const node = id => nodes[id] || (nodes[id] = {
    style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    disabled: false, textContent: '', innerHTML: '', value: ''
  });
  const cell = {
    storeUint() { return this; }, storeCoins(value) { coins.push(value); return this; },
    storeAddress() { return this; }, storeBit() { return this; },
    storeStringTail() { return this; }, storeRef() { return this; },
    endCell() { return this; }, toBoc() { return Buffer.from('mock'); }
  };
  let sends = 0;
  const box = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: node, querySelector() { return null; },
      querySelectorAll() { return []; }, addEventListener() {}
    },
    localStorage: {
      getItem(key) { if (failStorage) throw new Error('unavailable'); return storage.get(key) || null; },
      setItem(key, value) { if (failStorage) throw new Error('unavailable'); storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    TON_CORE: {
      Address: { parse(a) { return a; } }, beginCell() { return cell; },
      toNano(s) { return BigInt(Math.round(Number(s) * 1e9)); }
    },
    tonConnectUI: {
      connected: true, account: { address: '0:' + '1'.repeat(64), chain },
      async sendTransaction(tx) { sends++; return send ? send(tx) : { boc: 'mock' }; }
    },
    location: { search }, addEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({ wallet_address: { address: '0:' + '2'.repeat(64) }, jetton: { decimals, scaled_ui: scaledUi }, extensions, balance }) }),
    alert() {}, confirm(message) { confirmations.push(message); return true; }, setTimeout, clearTimeout
  };
  box.window = box;
  // Most tests exercise the retained defenses through a mock-only source copy.
  // Production code keeps the gate false until real reconciliation exists.
  const fixtureSource = enableTestOnlySendPath
    ? source.replace('const DISTRIBUTION_VERIFICATION_AVAILABLE = false;', 'const DISTRIBUTION_VERIFICATION_AVAILABLE = true;')
    : source;
  vm.runInContext(fixtureSource, vm.createContext(box));
  box.wizardState.activeToken = { address: '0:' + '3'.repeat(64) };
  box.wizardState.distributor.recipients = Array.from({ length: 5 }, (_, i) => ({
    address: '0:' + String(i + 4).repeat(64), amount: 10, amountText: '10', valid: true
  }));
  box.wizardState.distributor.totalAmount = 50;
  return { box, nodes, coins, confirmations, storage, sends: () => sends };
}

async function main() {
  let count = 0;
  const check = (condition, description) => { assert(condition, description); count++; console.log('PASS', description); };

  const disabled = harness({ enableTestOnlySendPath: false });
  disabled.box.labsReviewAndSendDistribution();
  check(disabled.nodes['labs-dist-modal-submit'].disabled === true &&
        disabled.nodes['labs-dist-modal-status-banner'].textContent.includes('temporarily unavailable'),
        'production review clearly disables distribution until verification is ready');
  await disabled.box.labsExecuteDistributionBatch();
  check(disabled.sends() === 0 && disabled.storage.size === 0,
        'production gate stops before wallet signature and stores no pending request');

  const a = harness();
  await a.box.labsExecuteDistributionBatch();
  check(a.sends() === 1, 'only the first batch is submitted when confirmation is unavailable');
  check(a.confirmations[0].includes('Only the first batch can be submitted') && a.confirmations[0].includes('retries will be blocked'), 'review warns before signing that automatic continuation is unavailable');
  check(a.box.wizardState.distributor.status === 'pending', 'wallet result remains pending, not completed');
  check(a.box.wizardState.distributor.successfulBatches.length === 0, 'unverified batch is never recorded as successful');
  check(a.nodes['wizard-step3-continue-btn'].style.display === 'none', 'unverified batch does not unlock completion');
  check(a.storage.has('anlgram_distribution_pending_v1'), 'pending intent survives in local storage');
  await a.box.labsExecuteDistributionBatch();
  check(a.sends() === 1, 'same-page retry cannot send pending batch');

  const reloaded = harness({ storage: a.storage });
  await reloaded.box.labsExecuteDistributionBatch();
  check(reloaded.sends() === 0, 'reload cannot resend a pending batch');
  check(reloaded.box.wizardState.distributor.status === 'pending', 'reload reports pending status');

  const ambiguous = harness({ send: async () => { throw new Error('bridge timeout'); } });
  await ambiguous.box.labsExecuteDistributionBatch();
  check(ambiguous.box.wizardState.distributor.status === 'pending', 'ambiguous wallet error stays pending');
  await ambiguous.box.labsExecuteDistributionBatch();
  check(ambiguous.sends() === 1, 'ambiguous wallet error cannot trigger a duplicate');

  const rejected = harness({ send: async () => { const e = new Error('rejected'); e.name = 'UserRejectsError'; throw e; } });
  await rejected.box.labsExecuteDistributionBatch();
  check(rejected.box.wizardState.distributor.status === 'failed', 'explicit wallet rejection is reported as failed');
  check(!rejected.storage.has('anlgram_distribution_pending_v1'), 'explicit rejection clears the intent');
  await rejected.box.labsExecuteDistributionBatch();
  check(rejected.sends() === 2, 'explicitly rejected request can be retried');

  const unavailable = harness({ failStorage: true });
  await unavailable.box.labsExecuteDistributionBatch();
  check(unavailable.sends() === 0, 'storage failure stops before wallet submission');

  const exact = harness({ decimals: 6 });
  exact.box.wizardState.distributor.distributionType = 'custom';
  exact.nodes['labs-dist-amount'] = { value: '1', style: {} };
  const address1 = '0:' + 'a'.repeat(64);
  const address2 = '0:' + 'b'.repeat(64);
  exact.box.labsParseDistributionText(`${address1},99999999999999.999999\n${address2},0.000001`);
  check(exact.box.wizardState.distributor.totalAmountText === '100000000000000', 'preview sums large decimal inputs exactly');
  await exact.box.labsExecuteDistributionBatch();
  check(exact.coins[0] === 99999999999999999999n, 'large amount is serialized exactly at six decimals');
  check(exact.coins[2] === 1n, 'smallest supported unit is serialized exactly');

  const fractional = harness({ decimals: 6 });
  fractional.box.wizardState.distributor.recipients[0].amountText = '0.0000001';
  await fractional.box.labsExecuteDistributionBatch();
  check(fractional.sends() === 0 && fractional.storage.size === 0, 'unrepresentable precision is rejected before wallet signing');
  const missingDecimals = harness({ decimals: null });
  await missingDecimals.box.labsExecuteDistributionBatch();
  check(missingDecimals.sends() === 0, 'missing Jetton decimals are rejected instead of assumed');
  const missingText = harness();
  delete missingText.box.wizardState.distributor.recipients[0].amountText;
  await missingText.box.labsExecuteDistributionBatch();
  check(missingText.sends() === 0, 'amounts without original text are rejected');
  const badInput = harness();
  badInput.box.wizardState.distributor.distributionType = 'custom';
  badInput.nodes['labs-dist-amount'] = { value: '1', style: {} };
  badInput.box.labsParseDistributionText(`${address1},1e3`);
  check(!badInput.box.wizardState.distributor.recipients[0].valid, 'scientific notation is rejected rather than silently rounded or replaced');
  const injection = harness();
  injection.nodes['labs-dist-amount'] = { value: '1', style: {} };
  injection.box.labsParseDistributionText('<img>,1');
  check(injection.nodes['labs-dist-modal-tbody'].innerHTML.includes('&lt;img&gt;') &&
        !injection.nodes['labs-dist-modal-tbody'].innerHTML.includes('<img>'), 'invalid CSV address is escaped in the preview');
  const wrongNetwork = harness({ chain: '-239', search: '?testnet' });
  await wrongNetwork.box.labsExecuteDistributionBatch();
  check(wrongNetwork.sends() === 0, 'network query override cannot make a mainnet wallet use testnet data');
  const missingNetwork = harness({ chain: undefined });
  missingNetwork.box.tonConnectUI.account.chain = undefined;
  await missingNetwork.box.labsExecuteDistributionBatch();
  check(missingNetwork.sends() === 0, 'unknown wallet network is rejected');
  const customToken = harness({ extensions: ['custom_payload'] });
  await customToken.box.labsExecuteDistributionBatch();
  check(customToken.sends() === 0, 'unsupported special token transfers are rejected');
  const scaledToken = harness({ scaledUi: { multiplier: '2' } });
  await scaledToken.box.labsExecuteDistributionBatch();
  check(scaledToken.sends() === 0, 'scaled token displays cannot be mistaken for raw decimal units');
  const insufficient = harness({ balance: '1' });
  await insufficient.box.labsExecuteDistributionBatch();
  check(insufficient.sends() === 0, 'insufficient token balance is rejected before wallet signing');

  console.log(`Distribution pending safety: ${count} passed; 0 failed`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
