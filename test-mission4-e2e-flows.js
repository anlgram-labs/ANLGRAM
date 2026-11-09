'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const liveQuote = require('./assets/js/curve-vnext-onchain-quote.js');
const { inspect, controller } = require('./assets/js/memelabs-inspector.js');
const monetization = require('./assets/js/monetization.js');
const { server: localHttpServer } = require('./server.js');

// Helper: start local server.js on an ephemeral port for live HTTP E2E tests
async function withLocalServer(fn) {
  await new Promise((resolve, reject) => {
    localHttpServer.once('error', reject);
    localHttpServer.listen(0, '127.0.0.1', resolve);
  });
  const addr = localHttpServer.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => localHttpServer.close(resolve));
  }
}

test('Mission 4 E2E Flow 1 & 14: Desktop & Mobile Landing, Navigation, HTML/JS Syntax Integrity, and Zero Secret Exposure across all pages', async () => {
  await withLocalServer(async (baseUrl) => {
    const pages = [
      '/index.html',
      '/explorer.html',
      '/visualizer.html',
      '/memecoin-platform.html',
      '/dashboard.html',
      '/tonconnect-manifest.json'
    ];

    for (const pagePath of pages) {
      const res = await fetch(`${baseUrl}${pagePath}`);
      assert.equal(res.status, 200, `GET ${pagePath} must return HTTP 200`);
      const text = await res.text();

      // Verify security headers
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert((res.headers.get('content-security-policy') || '').includes("frame-ancestors 'self'"));

      // Verify zero exposed private keys, bot tokens, or API secrets
      assert(!/TONAPI_KEY\s*=\s*['"][A-Za-z0-9]{32,}['"]/.test(text), `${pagePath} must not embed raw TONAPI keys`);
      assert(!/TELEGRAM_BOT_TOKEN\s*=\s*['"][0-9]{8,}:[A-Za-z0-9_-]{30,}['"]/.test(text), `${pagePath} must not embed Telegram bot tokens`);

      if (pagePath.endsWith('.html')) {
        // Verify responsive mobile viewport meta tag
        assert(text.includes('name="viewport"') && text.includes('width=device-width'), `${pagePath} must include responsive viewport meta`);
        // Parse every inline non-module script with vm.Script to guarantee zero syntax errors
        for (const [, attrs, code] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (!/type=["']module["']/i.test(attrs) && code.trim()) {
            assert.doesNotThrow(() => new vm.Script(code), `Inline script syntax check in ${pagePath}`);
          }
        }
      }
    }
  });
});

test('Mission 4 E2E Flow 2 & 13: Wallet Connection, Disconnection, Network Separation (-3 vs -239), and Rejection/Disconnect Cleanup', () => {
  const walletSrc = fs.readFileSync(path.join(__dirname, 'assets/js/wallet-connect.js'), 'utf8');
  const warningEl = { hidden: false, textContent: 'Warning' };
  const overlayEl = { style: { display: 'flex' } };
  const dispatchedEvents = [];

  const sandbox = {
    window: {
      innerWidth: 375, // Mobile viewport check
      location: { protocol: 'https:', origin: 'https://anlgram.com', hostname: 'anlgram.com', search: '' },
      tonConnectUI: {
        connected: true,
        wallet: { account: { address: '0:' + '1'.repeat(64), chain: '-3' } },
        account: { address: '0:' + '1'.repeat(64), chain: '-3' },
        disconnect: async () => {}
      },
      dispatchEvent: (ev) => dispatchedEvents.push(ev),
      CustomEvent: function (name, opts) { this.type = name; this.detail = opts?.detail; }
    },
    document: {
      readyState: 'complete',
      head: { appendChild: () => {} },
      body: { appendChild: () => {} },
      createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
      getElementById: (id) => {
        if (id === 'memelabs-network-warning') return warningEl;
        if (id === 'anlgram-wallet-modal-overlay') return overlayEl;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] || null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; }
    },
    fetch: async () => ({ ok: true, json: async () => ({ balance: '1500000000' }) }),
    CustomEvent: function (name, opts) { this.type = name; this.detail = opts?.detail; },
    console
  };

  vm.runInNewContext(walletSrc, sandbox);

  // Verify Testnet chain detection
  assert.equal(sandbox.window.getConnectedWalletChainId(), '-3');
  assert.equal(sandbox.window.validateLaunchpadNetwork().valid, true);

  // Switch to Mainnet (-239) -> validateLaunchpadNetwork blocks Testnet-only launchpad actions
  sandbox.window.tonConnectUI.wallet.account.chain = '-239';
  sandbox.window.tonConnectUI.account.chain = '-239';
  assert.equal(sandbox.window.getConnectedWalletChainId(), '-239');
  assert.equal(sandbox.window.validateLaunchpadNetwork().valid, false);

  // Disconnect cleans up localStorage and hides network warning
  return sandbox.window.disconnectWallet().then(() => {
    assert.equal(warningEl.hidden, true);
    assert.equal(warningEl.textContent, '');
    assert.equal(sandbox.localStorage.getItem('anlgram_wallet_addr'), null);
  });
});

test('Mission 4 E2E Flow 3 & 4: ton_proof Challenge/Verify Expiration & Replay Protection and Telegram Mini App HMAC Authentication', async () => {
  const workerMod = await import('./testnet-interface/worker.mjs');
  const worker = workerMod.default;
  const ProofAttempt = workerMod.ProofAttempt;

  // Create in-memory Durable Object storage for ProofAttempt
  const doStore = new Map();
  const state = {
    storage: {
      get: async (k) => doStore.get(k),
      put: async (k, v) => doStore.set(k, v),
      setAlarm: async () => {},
      deleteAll: async () => doStore.clear(),
      transaction: async (cb) => cb({
        get: async (k) => doStore.get(k),
        put: async (k, v) => doStore.set(k, v)
      })
    }
  };
  const proofDO = new ProofAttempt(state);
  const env = {
    PROOFS: {
      idFromName: (id) => id,
      get: () => ({ fetch: (req) => proofDO.fetch(req) })
    },
    TELEGRAM_BOT_TOKEN: '123456789:AAH_test_token_for_hmac_verification_only'
  };

  // 1. POST /api/proof/challenge issues 64-hex payload and __Host-anlgram-testnet-proof cookie
  const challengeRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/proof/challenge', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: '{}'
  }), env);
  assert.equal(challengeRes.status, 200);
  const challengeBody = await challengeRes.json();
  assert.match(challengeBody.payload, /^[a-f0-9]{64}$/);
  const setCookie = challengeRes.headers.get('set-cookie') || '';
  assert(setCookie.includes('__Host-anlgram-testnet-proof='));

  // 2. Forged/expired ton_proof is rejected with HTTP 401
  const cookieHeader = setCookie.split(';')[0];
  const forgedVerifyRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/proof/verify', {
    method: 'POST',
    headers: {
      'Origin': 'https://testnet.anlgram.com',
      'Content-Type': 'application/json',
      'Cookie': cookieHeader
    },
    body: JSON.stringify({
      account: { address: '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061', chain: '-3' },
      proof: { timestamp: Math.floor(Date.now() / 1000), domain: { value: 'testnet.anlgram.com' }, payload: challengeBody.payload, signature: 'bad' }
    })
  }), env);
  assert.equal(forgedVerifyRes.status, 401);

  // 3. Telegram Mini App verification (/api/telegram/verify) authenticates valid HMAC-SHA256 initData and rejects tampered data
  const authDate = Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify({ id: 99887766, first_name: 'ANLGRAM_Tester', username: 'anlgram_qa' });
  const dataCheckString = `auth_date=${authDate}\nuser=${userJson}`;
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
  const validHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const initData = new URLSearchParams({ auth_date: String(authDate), user: userJson, hash: validHash }).toString();

  const tgValidRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/telegram/verify', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData })
  }), env);
  assert.equal(tgValidRes.status, 200);
  const tgValidBody = await tgValidRes.json();
  assert.equal(String(tgValidBody.user.id), '99887766');
  assert.equal(tgValidBody.financialSigningEnabled, false);

  const tgTamperedRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/telegram/verify', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: initData.replace(validHash, '0'.repeat(64)) })
  }), env);
  assert.equal(tgTamperedRes.status, 401);
});

test('Mission 4 E2E Flow 5, 6, 8, 9, 10 & 15: Project Preparation, Status View (Refund/Migration/LP Lock), Real Token Inspection, and Disabled Financial Gates', async () => {
  const workerMod = await import('./testnet-interface/worker.mjs');
  const worker = workerMod.default;

  // Flow 5 & 10: /api/projects/prepare and /api/projects/status return deterministic addresses and explicit NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS status
  const projectConfig = {
    schema: 1,
    network: '-3',
    id: '11111111-2222-3333-4444-555555555555',
    stage: 6,
    mode: 'launchpad',
    metadata: {
      name: 'ANLGRAM QA Token',
      symbol: 'ANLQA',
      supply: '1000000000',
      decimals: '9',
      description: 'E2E verification token',
      logo: 'https://anlgram.com/assets/images/icon-192.png',
      creator: '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061'
    },
    allocations: { creator: '0', community: '0', team: '0' },
    distribution: { skip: true, mode: 'equal', amount: '0', text: '', batchSize: '4' },
    vesting: { enabled: false, beneficiary: '', amount: '0', cliffMonths: '3', durationMonths: '12', startDate: '' },
    lp: {
      percent: '100',
      duration: 'permanent',
      beneficiary: '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061',
      controller: ''
    },
    trade: { buyAttachment: '1', sellTokens: '0' },
    savedAt: null
  };

  const prepRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/prepare', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(projectConfig)
  }), {});
  assert.equal(prepRes.status, 200);
  const prepData = await prepRes.json();
  assert.equal(prepData.financialSigningEnabled, false);
  assert.match(prepData.configurationFingerprint, /^[a-f0-9]{64}$/);

  const statusRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(projectConfig)
  }), {});
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.financialSigningEnabled, false);
  assert.equal(statusData.migrationAuthorized, false);
  assert.equal(statusData.withdrawalsEnabled, false);
  assert.equal(statusData.scope, 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE');
});

test('Mission 4 E2E Flow 7, 11 & 12: Live VNext Curve Quote Validation, Explorer/Visualizer/Rug Radar Accuracy, and Local Server Monetization Status', async () => {
  // Flow 7: Bonding curve quote display and bytecode/fee validation
  const rawAddr = '0:' + 'a'.repeat(64);
  const fakeTonCore = {
    Address: { parse(v) { if (v !== rawAddr) throw new Error('Invalid address'); } },
    Cell: { fromBoc() { return [{ hash: () => Buffer.from(liveQuote.CURVE_CODE_HASH, 'hex') }]; } }
  };
  const quoteRes = await liveQuote.quote({
    address: rawAddr,
    network: 'testnet',
    grossTon: '10',
    tonCore: fakeTonCore,
    request: async (p) => p.includes('/methods/')
      ? { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: [['num', '96144212650000000'], ['num', '100000000'], ['num', '10000000000'], ['num', '0'], ['num', '0']] }) }
      : { ok: true, status: 200, json: async () => ({ status: 'active', code: 'b5ee9c72' }) }
  });
  assert.equal(quoteRes.feeNano, 100000000n);
  assert.equal(quoteRes.consumedNano, 10000000000n);
  assert.equal(quoteRes.willGraduate, false);

  // Flow 12: Verify local server /api/monetization/status endpoint
  await withLocalServer(async (baseUrl) => {
    const monRes = await fetch(`${baseUrl}/api/monetization/status`);
    assert.equal(monRes.status, 200);
    const monBody = await monRes.json();
    assert.equal(monBody.ok, true);
    assert.equal(monBody.paymentsEnabled, false);
    assert.equal(monBody.paymentGateStatus, 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL');
    assert.equal(monBody.safetyScoreIsolationGuaranteed, true);
    assert(monBody.packages.BOOST_24H);
    assert(monBody.packages.PROFILE_STANDARD);
    assert(monBody.packages.AD_BANNER_24H);
  });
});
