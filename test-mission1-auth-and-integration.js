'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Mission 1.1: testnet-interface/worker.mjs defaults APP_ORIGIN safely and fails closed with 503 when PROOFS DO is missing or unreachable', async () => {
  const workerSrc = fs.readFileSync(path.join(__dirname, 'testnet-interface/worker.mjs'), 'utf8');
  assert(workerSrc.includes("const configuredOrigin = env && 'APP_ORIGIN' in env ? env.APP_ORIGIN : 'https://testnet.anlgram.com';"), 'worker.mjs must default APP_ORIGIN to https://testnet.anlgram.com when omitted');
  assert(workerSrc.includes("if (!env?.PROOFS) return json({error:'Proof storage service unavailable'},503);"), 'worker.mjs must return 503 when PROOFS Durable Object is unbound');
  assert(workerSrc.includes("return json({error:'Proof storage backend unreachable'},503);"), 'worker.mjs must catch PROOFS stub fetch errors and return 503');

  const workerMod = await import('./testnet-interface/worker.mjs');
  const worker = workerMod.default;

  // 1. Missing PROOFS binding on POST /api/proof/challenge with omitted APP_ORIGIN
  const makeChallengeReq = () => new Request('https://testnet.anlgram.com/api/proof/challenge', {
    method: 'POST',
    headers: { 'Origin': 'https://testnet.anlgram.com', 'Content-Type': 'application/json' },
    body: '{}'
  });
  const resNoProofs = await worker.fetch(makeChallengeReq(), {});
  assert.equal(resNoProofs.status, 503);
  const bodyNoProofs = await resNoProofs.json();
  assert.equal(bodyNoProofs.error, 'Proof storage service unavailable');

  // 2. Unreachable PROOFS stub on POST /api/proof/challenge
  const resThrowingStub = await worker.fetch(makeChallengeReq(), {
    PROOFS: {
      idFromName: () => 'id-1',
      get: () => ({
        fetch: async () => { throw new Error('DO network error'); }
      })
    }
  });
  assert.equal(resThrowingStub.status, 503);
  const bodyThrowingStub = await resThrowingStub.json();
  assert.equal(bodyThrowingStub.error, 'Proof storage backend unreachable');

  // 3. Explicit invalid APP_ORIGIN still fails closed with 503
  const resBadOriginConfig = await worker.fetch(makeChallengeReq(), {
    APP_ORIGIN: 'http://insecure.example.com'
  });
  assert.equal(resBadOriginConfig.status, 503);
});

test('Mission 1.2: testnet-interface/app.js resets TonConnect connect parameters on challenge failure and surfaces actionable diagnostics for "No se pudo preparar la prueba"', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, 'testnet-interface/app.js'), 'utf8');
  assert(appSrc.includes('try{ui.setConnectRequestParameters(null);}catch{}'), 'app.js must reset connect parameters on challenge failure so TonConnect is not stuck in loading state');
  assert(appSrc.includes('No se pudo preparar la prueba (HTTP ${r.status}${detail}). No firmes transacciones.'), 'app.js must surface HTTP status and backend error detail when proof preparation fails');
  assert(appSrc.includes('No se pudo preparar la prueba (red no disponible). No firmes transacciones.'), 'app.js must surface network error detail when fetch throws');
  assert(appSrc.includes('Prueba rechazada o expirada'), 'app.js must surface proof verification rejection/expiration clearly');
});

test('Mission 1.3: all three wrangler.toml files declare synchronized PROOFS, OPERATIONS, TESTNET_READS, CURVE_OPERATIONS, and PROJECT_REGISTRY Durable Objects', () => {
  const files = [
    'testnet-interface/wrangler.toml',
    'testnet-interface/proof-storage/wrangler.toml',
    'testnet-interface/pages/wrangler.toml'
  ];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    for (const binding of ['PROOFS', 'OPERATIONS', 'TESTNET_READS', 'CURVE_OPERATIONS', 'PROJECT_REGISTRY']) {
      assert(content.includes(`name = "${binding}"`), `${rel} must bind ${binding}`);
    }
    assert(content.includes('class_name = "ProjectRegistry"'), `${rel} must reference ProjectRegistry class`);
  }
});

test('Mission 1.4: wallet-connect.js strictly separates Testnet (-3 / 0xfffffffd) and Mainnet (-239 / 0xffffff11), fails closed on unknown chains, and cleans up warning banner on disconnect', () => {
  const src = fs.readFileSync(path.join(__dirname, 'assets/js/wallet-connect.js'), 'utf8');
  assert(!src.includes("if (String(addr).startsWith('0:')) return '-239'"), 'wallet-connect.js must never infer Mainnet (-239) from a raw 0:... address');
  assert(src.includes("if (rawChain === '-3' || rawChain === '0xfffffffd') return '-3';"), 'wallet-connect.js must normalize -3 and 0xfffffffd to -3');
  assert(src.includes("if (rawChain === '-239' || rawChain === '0xffffff11') return '-239';"), 'wallet-connect.js must normalize -239 and 0xffffff11 to -239');

  // Execute getConnectedWalletChainId in a sandboxed VM context
  const fnMatch = src.match(/window\.getConnectedWalletChainId\s*=\s*function\s*\(\)\s*\{[\s\S]*?\n\s*\};/);
  assert(fnMatch, 'getConnectedWalletChainId must be defined');

  const sandbox = {
    currentAddress: '',
    window: {
      tonConnectUI: null,
      location: { search: '' }
    },
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] || null; }
    }
  };
  vm.runInNewContext(fnMatch[0], sandbox);

  // Connected wallet with hex Testnet chain ID
  sandbox.window.tonConnectUI = { connected: true, account: { address: '0:' + '1'.repeat(64), chain: '0xfffffffd' } };
  assert.equal(sandbox.window.getConnectedWalletChainId(), '-3');

  // Connected wallet with hex Mainnet chain ID
  sandbox.window.tonConnectUI = { connected: true, account: { address: '0:' + '1'.repeat(64), chain: '0xffffff11' } };
  assert.equal(sandbox.window.getConnectedWalletChainId(), '-239');

  // Connected wallet with missing or unrecognized chain ID -> must fail closed (null), even with raw 0: address
  sandbox.window.tonConnectUI = { connected: true, account: { address: '0:' + '1'.repeat(64), chain: '-1' } };
  assert.equal(sandbox.window.getConnectedWalletChainId(), null);

  sandbox.window.tonConnectUI = { connected: true, account: { address: '0:' + '1'.repeat(64) } };
  assert.equal(sandbox.window.getConnectedWalletChainId(), null);
});

test('Mission 1.5: cloudflare-worker/worker.js sets Cache-Control: no-store when ttl === 0 (e.g. get_buy_quote_v2)', () => {
  const workerSrc = fs.readFileSync(path.join(__dirname, 'cloudflare-worker/worker.js'), 'utf8');
  assert(workerSrc.includes("'Cache-Control': ttl === 0 ? 'no-store' : `public, max-age=${ttl}`"), 'cloudflare-worker/worker.js must emit no-store when ttl === 0');
});

test('Mission 1.6: server.js POST /api/upload-logo enforces IP rate limiting, 5 MB limit, and binary image magic-byte verification', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverSrc.includes("const rateCheck = checkClientRateLimit(clientIp);"), 'POST /api/upload-logo must check client IP rate limit');
  assert(serverSrc.includes("if (!buffer.length || buffer.length > 5 * 1024 * 1024)"), 'POST /api/upload-logo must enforce 5 MB decoded limit');
  assert(serverSrc.includes("Invalid image binary header (magic bytes verification failed)"), 'POST /api/upload-logo must verify PNG/JPEG/GIF/WebP magic bytes');
});

test('Mission 1.7: anl-labs.js integrates Verified Project Registry (/api/projects/status) with explicit UNKNOWN, PENDING, REFUND_PENDING, and CUSTODY_UNVERIFIED states', async () => {
  const labsSrc = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf8');
  assert(labsSrc.includes('window.labsInspectVerifiedProjectRegistry = async function'), 'anl-labs.js must expose window.labsInspectVerifiedProjectRegistry');
  assert(labsSrc.includes('window.labsRefreshMyProjects = async function'), 'anl-labs.js must expose window.labsRefreshMyProjects');
  assert(labsSrc.includes("refundState: data?.migration?.refundAvailable === true ? 'REFUND_PENDING' : 'NO_REFUND_EVIDENCE'"), 'anl-labs.js must map refundAvailable to REFUND_PENDING / NO_REFUND_EVIDENCE');
  assert(labsSrc.includes("lpLockState: data?.lpLocker?.locked === true ? 'LOCKED_ONCHAIN' : 'CUSTODY_UNVERIFIED'"), 'anl-labs.js must map lpLocker.locked to LOCKED_ONCHAIN / CUSTODY_UNVERIFIED');
});
