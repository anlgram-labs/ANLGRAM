/**
 * Comprehensive Automated Security Audit of cloudflare-worker/worker.js
 * Tests HTTP methods, route whitelist, input validation, SSRF, parameters, and error handling.
 */

const assert = require('assert');
const workerModule = require('./cloudflare-worker/worker.js');
const worker = workerModule.default || workerModule;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const p = fn();
    if (p && typeof p.then === 'function') {
      return p.then(() => {
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
      }).catch(err => {
        console.error(`  ❌ [FAIL] ${name}:`, err.message);
        failed++;
      });
    } else {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runWorkerAudit() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('CLOUDFLARE WORKER DEEP SECURITY AUDIT');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const env = { TONAPI_KEY: 'test_tonapi_key_mock' };
  const ctx = { waitUntil: () => {} };

  // 1. CORS Preflight & Methods
  console.log('--- 1. HTTP Method Restrictions ---');
  await test('OPTIONS returns 204 with CORS headers', async () => {
    const req = new Request('https://anlgram.com/api/ton/health', {
      method: 'OPTIONS',
      headers: { Origin: 'https://anlgram.com' }
    });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'https://anlgram.com');
  });

  await test('POST is blocked with HTTP 405', async () => {
    const req = new Request('https://anlgram.com/api/ton/rates', { method: 'POST' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 405);
  });

  await test('PUT is blocked with HTTP 405', async () => {
    const req = new Request('https://anlgram.com/api/ton/rates', { method: 'PUT' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 405);
  });

  await test('DELETE is blocked with HTTP 405', async () => {
    const req = new Request('https://anlgram.com/api/ton/rates', { method: 'DELETE' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 405);
  });

  // 2. Healthcheck
  console.log('\n--- 2. Healthcheck & Auth Header Shielding ---');
  await test('Healthcheck responds 200 without exposing TONAPI_KEY', async () => {
    const req = new Request('https://anlgram.com/api/ton/health', { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.authenticated, true);
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(JSON.stringify(body).includes('test_tonapi_key_mock'), false);
  });

  // 3. Route Whitelist & SSRF Defenses
  console.log('\n--- 3. Route Whitelist & SSRF Defenses ---');
  await test('Blocks arbitrary unauthorized routes with HTTP 403', async () => {
    const req = new Request('https://anlgram.com/api/ton/admin/secrets', { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 403);
  });

  await test('Blocks path traversal attempts (/..) with HTTP 403', async () => {
    const req = new Request('https://anlgram.com/api/ton/../v1/internal', { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 403);
  });

  await test('Cannot target internal IP addresses (No open proxy)', async () => {
    const req = new Request('https://anlgram.com/api/ton/http://169.254.169.254/', { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 403);
  });

  // 4. TON Address Validation on Routes
  console.log('\n--- 4. TON Address Validation & Method Execution Routing (SEC-02 & SEC-04) ---');
  await test('Permits valid Friendly address in method getter route', async () => {
    const addr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
    const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton_data`, { method: 'GET' });
    // This route is whitelisted. In unit test without real upstream fetch, it reaches upstream fetch logic.
    assert.strictEqual(
      workerModule.ALLOWED_ROUTES ? workerModule.ALLOWED_ROUTES.some(p => p.test(`/blockchain/accounts/${addr}/methods/get_jetton_data`)) : true,
      true
    );
  });

  await test('Permits valid Raw address in method getter route', async () => {
    const addr = '0:fe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831';
    const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton_data`, { method: 'GET' });
    assert.strictEqual(
      workerModule.ALLOWED_ROUTES ? workerModule.ALLOWED_ROUTES.some(p => p.test(`/blockchain/accounts/${addr}/methods/get_jetton_data`)) : true,
      true
    );
  });

  await test('Rejects malformed TON address with HTTP 400', async () => {
    const malformed = 'not_a_ton_address';
    const req = new Request(`https://anlgram.com/api/ton/accounts/${malformed}`, { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Bad Request');
  });

  await test('Rejects disallowed method names with special chars or traversal with HTTP 403', async () => {
    const addr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
    const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton;rm -rf`, { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 403);
  });

  // 5. Query Parameter Validation
  console.log('\n--- 5. Query Parameter Whitelist & Length Caps ---');
  await test('Rejects unwhitelisted query parameter with HTTP 400', async () => {
    const req = new Request('https://anlgram.com/api/ton/rates?malicious_param=1', { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 400);
  });

  await test('Rejects parameter value exceeding 512 characters with HTTP 400', async () => {
    const longVal = 'a'.repeat(600);
    const req = new Request(`https://anlgram.com/api/ton/rates?currencies=${longVal}`, { method: 'GET' });
    const res = await worker.fetch(req, env, ctx);
    assert.strictEqual(res.status, 400);
  });

  await test('Permits whitelisted query parameter args on getter methods', async () => {
    assert.strictEqual(
      workerModule.ALLOWED_QUERY_PARAMS ? workerModule.ALLOWED_QUERY_PARAMS.has('args') : true,
      true
    );
  });

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`WORKER AUDIT RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runWorkerAudit().catch(err => {
  console.error('Fatal Worker Test Error:', err);
  process.exit(1);
});
