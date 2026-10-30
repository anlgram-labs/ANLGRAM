'use strict';

// Local unit tests: the mocked RPC and wallet responses are not on-chain evidence.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf8');

function makeHarness({ accountStatus = 'active', chain = '-3', search = '', reject = false,
  switchBeforeSigning = false, storage = new Map(), storageBlocked = false, simultaneous = false,
  metadataDecimals = '9' } = {}) {
  const elements = Object.fromEntries(Object.entries({
    'labs-vesting-beneficiary': 'beneficiary',
    'labs-vesting-amount': '100',
    'labs-vesting-cliff': '3 months',
    'labs-vesting-period': '12 months',
    'labs-vesting-date': '2027-01-01',
    'vesting-tx-status': '',
    'vesting-validation-error': '',
    'labs-vesting-submit-btn': ''
  }).map(([id, value]) => [id, { value, style: {}, innerHTML: '', disabled: false }]));

  let sendCount = 0;
  let pollCount = 0;
  const coinValues = [];
  let jettonFetches = 0;
  let releaseJettonFetches;
  const jettonFetchGate = new Promise((resolve) => { releaseJettonFetches = resolve; });
  const alerts = [];
  const makeAddress = (value) => ({
    toRawString: () => String(value),
    toString: () => String(value)
  });
  const makeCell = () => ({
    toBoc: () => Buffer.from('mock-cell'),
    beginParse: () => ({ loadCoins() {}, loadMaybeAddress() {}, loadRef: makeCell })
  });
  const beginCell = () => {
    const builder = {};
    for (const method of ['storeUint', 'storeBit', 'storeAddress', 'storeRef', 'store']) {
      builder[method] = () => builder;
    }
    builder.storeCoins = (value) => { coinValues.push(value); return builder; };
    builder.endCell = makeCell;
    return builder;
  };
  const tc = {
    connected: true,
    account: { address: 'creator', chain },
    async sendTransaction() {
      sendCount++;
      if (reject) throw new Error('Wallet rejected request');
      return { boc: 'mock-wallet-response' };
    }
  };
  const window = {
    location: { search },
    tonConnectUI: tc,
    TON_CORE: {
      beginCell,
      toNano: () => 1n,
      Address: { parse: makeAddress },
      Cell: { fromBoc: () => [makeCell()] },
      contractAddress: () => makeAddress('vesting-account'),
      storeStateInit: () => ({})
    },
    addEventListener() {}
  };
  const context = {
    window,
    document: { getElementById: (id) => elements[id] || null, addEventListener() {} },
    localStorage: {
      getItem: (key) => { if (storageBlocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value); },
      removeItem: (key) => { if (storageBlocked) throw new Error('Storage blocked'); storage.delete(key); }
    },
    fetch: async (url) => {
      if (url.includes('/v2/jettons/')) return { ok: true, json: async () => ({ metadata: { decimals: metadataDecimals } }) };
      if (url.includes('/blockchain/accounts/')) return { ok: true, json: async () => ({ data: '00' }) };
      if (url.includes('/jettons/')) {
        if (switchBeforeSigning) tc.account.chain = '-239';
        if (simultaneous) {
          jettonFetches++;
          if (jettonFetches === 2) releaseJettonFetches();
          await jettonFetchGate;
        }
        return { ok: true, json: async () => ({ wallet_address: { address: 'creator-wallet' } }) };
      }
      if (url.includes('/accounts/vesting-account')) {
        pollCount++;
        return { ok: true, json: async () => ({ status: accountStatus }) };
      }
      throw new Error(`Unexpected mocked URL: ${url}`);
    },
    alert: (message) => alerts.push(message),
    confirm: () => true,
    setTimeout: (callback) => { callback(); return 0; },
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    Uint8Array, BigInt, Date, console: { error() {}, warn() {}, log() {} }
  };
  vm.runInNewContext(source, context, { filename: 'anl-labs.js' });
  window.wizardState.activeToken = { address: 'token-master', name: 'Token', symbol: 'TOK', decimals: 9 };
  return { window, tc, elements, alerts, coinValues, get sendCount() { return sendCount; }, get pollCount() { return pollCount; } };
}

(async () => {
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log(`PASS ${name}`); };

  await test('active account does not assert a verified token deposit', async () => {
    const h = makeHarness();
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 1);
    assert.strictEqual(h.pollCount, 1);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /account is active/i);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /deposit and lock have not been verified/i);
    assert.doesNotMatch(h.elements['vesting-tx-status'].innerHTML, /deployed & verified|tokens locked/i);
    assert.strictEqual(h.elements['labs-vesting-submit-btn'].disabled, true);
  });

  await test('polling timeout remains pending and prevents accidental resubmission', async () => {
    const h = makeHarness({ accountStatus: 'uninit' });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.pollCount, 20);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /activation has not been confirmed/i);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /deposit and lock have not been verified/i);
    assert.strictEqual(h.elements['labs-vesting-submit-btn'].disabled, true);
  });

  await test('wallet errors stay pending because submission status may be unknown', async () => {
    const h = makeHarness({ reject: true });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.pollCount, 0);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /not confirmed|unknown/i);
    assert.strictEqual(h.elements['labs-vesting-submit-btn'].disabled, true);
  });

  await test('an uncertain submission remains protected after reloading', async () => {
    const storage = new Map();
    const first = makeHarness({ reject: true, storage });
    await first.window.labsSubmitVesting();
    assert.strictEqual(first.sendCount, 1);
    const second = makeHarness({ storage });
    await second.window.labsSubmitVesting();
    assert.strictEqual(second.sendCount, 0);
    assert.match(second.elements['vesting-tx-status'].innerHTML, /pending|previous/i);
  });

  await test('overlapping requests in the same page send at most once', async () => {
    const h = makeHarness({ simultaneous: true });
    await Promise.all([h.window.labsSubmitVesting(), h.window.labsSubmitVesting()]);
    assert.strictEqual(h.sendCount, 1);
  });

  await test('storage failure prevents submission', async () => {
    const h = makeHarness({ storageBlocked: true });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 0);
  });

  await test('wallet network change during preparation prevents signing', async () => {
    const h = makeHarness({ switchBeforeSigning: true });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.elements['vesting-tx-status'].innerHTML, /account or network changed/i);
  });

  await test('testnet URL cannot override a mainnet wallet', async () => {
    const h = makeHarness({ chain: '-239', search: '?testnet' });
    await h.window.labsSubmitVesting(true);
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.alerts.join(' '), /network could not be verified/i);
  });

  await test('mainnet remains blocked without the existing explicit override', async () => {
    const h = makeHarness({ chain: '-239' });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.alerts.join(' '), /cannot be executed on Mainnet/i);
  });

  await test('testnet URL does not enable the vesting button for a mainnet wallet', async () => {
    const h = makeHarness({ chain: '-239', search: '?testnet' });
    h.window.labsUpdateVestingUI();
    assert.strictEqual(h.elements['labs-vesting-submit-btn'].disabled, true);
  });

  await test('unknown wallet network is rejected', async () => {
    const h = makeHarness({ chain: undefined });
    h.tc.account.chain = undefined;
    await h.window.labsSubmitVesting(true);
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.alerts.join(' '), /network could not be verified/i);
  });

  await test('conflicting wallet account networks are rejected', async () => {
    const h = makeHarness();
    h.tc.wallet = { account: { chain: '-239' } };
    await h.window.labsSubmitVesting(true);
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.alerts.join(' '), /network could not be verified/i);
  });

  await test('zero-decimal Jettons preserve exact indivisible units', async () => {
    const h = makeHarness({ metadataDecimals: '0' });
    h.elements['labs-vesting-amount'].value = '123';
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 1);
    assert(h.coinValues.some((value) => value === 123n));
  });

  await test('fractional units are converted without floating point rounding', async () => {
    const h = makeHarness({ metadataDecimals: '9' });
    h.elements['labs-vesting-amount'].value = '123456789123456.123456789';
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 1);
    assert(h.coinValues.some((value) => value === 123456789123456123456789n));
  });

  await test('values above the token precision are rejected before signing', async () => {
    const h = makeHarness({ metadataDecimals: '2' });
    h.elements['labs-vesting-amount'].value = '1.001';
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 0);
    assert.match(h.elements['vesting-validation-error'].textContent, /decimal|precision/i);
  });

  await test('zero and exponential amounts are rejected before signing', async () => {
    for (const amount of ['0', '1e9']) {
      const h = makeHarness();
      h.elements['labs-vesting-amount'].value = amount;
      await h.window.labsSubmitVesting();
      assert.strictEqual(h.sendCount, 0);
    }
  });

  await test('missing decimal metadata is rejected before signing', async () => {
    const h = makeHarness({ metadataDecimals: null });
    await h.window.labsSubmitVesting();
    assert.strictEqual(h.sendCount, 0);
  });

  await test('Coins upper bound is enforced exactly', async () => {
    const max = (1n << 120n) - 1n;
    const valid = makeHarness({ metadataDecimals: '0' });
    valid.elements['labs-vesting-amount'].value = String(max);
    await valid.window.labsSubmitVesting();
    assert.strictEqual(valid.sendCount, 1);
    assert(valid.coinValues.some((value) => value === max));
    const overflow = makeHarness({ metadataDecimals: '0' });
    overflow.elements['labs-vesting-amount'].value = String(max + 1n);
    await overflow.window.labsSubmitVesting();
    assert.strictEqual(overflow.sendCount, 0);
  });

  console.log(`Vesting confirmation unit tests: ${count} passed`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
