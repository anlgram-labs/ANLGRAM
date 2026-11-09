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

  // 4. TON Address Validation, URL-Encoded Raw Addresses & Method Execution Routing (ALTO-01, ALTO-03, BAJO-01)
  console.log('\n--- 4. Real worker.fetch Execution: Friendly, Raw, URL-Encoded & Method Allowlist ---');

  const origFetch = global.fetch;
  let lastUpstreamUrl = null;
  global.fetch = async (url, opts) => {
    lastUpstreamUrl = String(url);
    return new Response(JSON.stringify({ ok: true, upstreamUrl: lastUpstreamUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    await test('ALTO-01: worker.fetch permits valid Friendly address in method getter route -> HTTP 200', async () => {
      const addr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton_data`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/blockchain/accounts/${addr}/methods/get_jetton_data`);
    });

    await test('ALTO-01: worker.fetch permits valid unencoded Raw address in method getter route -> HTTP 200', async () => {
      const addr = '0:fe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831';
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton_data`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/blockchain/accounts/${addr}/methods/get_jetton_data`);
    });

    await test('ALTO-01: worker.fetch permits URL-encoded Raw address (0%3A...) via encodeURIComponent -> HTTP 200', async () => {
      const rawAddr = '0:fe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831';
      const encodedAddr = encodeURIComponent(rawAddr);
      assert.strictEqual(encodedAddr.startsWith('0%3A'), true);
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${encodedAddr}/methods/get_jetton_data`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/blockchain/accounts/${rawAddr}/methods/get_jetton_data`);
    });

    await test('VNext quote: verified method route forwards one bounded hexadecimal amount without writes', async () => {
      const addr = '0:fe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831';
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_buy_quote_v2?args=0x46bcd9000`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/blockchain/accounts/${addr}/methods/get_buy_quote_v2?args=0x46bcd9000`);
      assert.strictEqual(res.headers.get('Cache-Control'), 'public, max-age=0');
    });

    await test('VNext quote: zero, missing, duplicate or malformed args are blocked before upstream', async () => {
      const addr = '0:fe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831';
      for (const suffix of ['', '?args=0x0', '?args=1', '?args=0x10&args=0x20', '?args=0x10&limit=1', '?args=0x1234567890abcdef0123']) {
        lastUpstreamUrl = null;
        const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_buy_quote_v2${suffix}`, { method: 'GET' });
        const res = await worker.fetch(req, env, ctx);
        assert.strictEqual(res.status, 400);
        assert.strictEqual(lastUpstreamUrl, null);
      }
    });

    await test('ALTO-03: worker.fetch permits /accounts/:wallet/jettons/:minter with both friendly and encoded raw addresses -> HTTP 200', async () => {
      const walletRaw = '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d';
      const minterFriendly = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const req = new Request(`https://anlgram.com/api/ton/accounts/${encodeURIComponent(walletRaw)}/jettons/${encodeURIComponent(minterFriendly)}`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/accounts/${walletRaw}/jettons/${minterFriendly}`);
    });

    await test('ALTO-03: worker.fetch rejects /accounts/:wallet/jettons/:minter when second address (:minter) is invalid -> HTTP 400', async () => {
      const walletFriendly = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const badMinter = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaXX'; // corrupted CRC16
      const req = new Request(`https://anlgram.com/api/ton/accounts/${walletFriendly}/jettons/${badMinter}`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 400);
    });

    await test('ALTO-03: worker.fetch permits ?supported_extensions=custom_payload on /accounts/:id/jettons -> HTTP 200', async () => {
      const walletFriendly = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const req = new Request(`https://anlgram.com/api/ton/accounts/${walletFriendly}/jettons?supported_extensions=custom_payload`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastUpstreamUrl, `https://tonapi.io/v2/accounts/${walletFriendly}/jettons?supported_extensions=custom_payload`);
    });

    await test('BAJO-01: worker.fetch rejects friendly TON address with corrupted CRC16 checksum -> HTTP 400', async () => {
      const badCrcAddr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOf'; // last char altered
      const req = new Request(`https://anlgram.com/api/ton/accounts/${badCrcAddr}`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 400);
    });

    await test('Rejects malformed TON address with HTTP 400', async () => {
      const malformed = 'not_a_ton_address';
      const req = new Request(`https://anlgram.com/api/ton/accounts/${malformed}`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, 'Bad Request');
    });

    await test('ALTO-01: Rejects unpermitted TVM method name (e.g. arbitrary_method) with HTTP 403', async () => {
      const addr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/arbitrary_method`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 403);
    });

    await test('Rejects disallowed method names with special chars or traversal with HTTP 403', async () => {
      const addr = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';
      const req = new Request(`https://anlgram.com/api/ton/blockchain/accounts/${addr}/methods/get_jetton;rm -rf`, { method: 'GET' });
      const res = await worker.fetch(req, env, ctx);
      assert.strictEqual(res.status, 403);
    });

    await test('ALTO-01: Rejects encoded traversal (%2e%2e, %2f, %5c), double encoding (%253A), and control chars (%00, %0a) -> HTTP 400', async () => {
      const badRequests = [
        { method: 'GET', url: 'https://anlgram.com/api/ton/accounts/%2e%2e/rates', headers: new Headers() },
        new Request('https://anlgram.com/api/ton/accounts/%2e%2e%2frates', { method: 'GET' }),
        new Request('https://anlgram.com/api/ton/accounts/0%2ffe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831', { method: 'GET' }),
        new Request('https://anlgram.com/api/ton/accounts/0%5cfe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831', { method: 'GET' }),
        new Request('https://anlgram.com/api/ton/blockchain/accounts/0%253Afe3d356840b2d0a299b28ad217878bc657f03b911f5ca7f8fd40b3dfd2371831/methods/get_jetton_data', { method: 'GET' }),
        new Request('https://anlgram.com/api/ton/rates%00', { method: 'GET' }),
        new Request('https://anlgram.com/api/ton/rates%0a', { method: 'GET' })
      ];
      for (const req of badRequests) {
        const res = await worker.fetch(req, env, ctx);
        assert.strictEqual(res.status, 400, `Expected 400 for ${req.url}, got ${res.status}`);
      }
    });
  } finally {
    global.fetch = origFetch;
  }

  // 5. Query Parameter Validation & Server Parity
  console.log('\n--- 5. Query Parameter Whitelist, Length Caps & server.js Parity ---');
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

  await test('Node and Cloudflare quote proxies reject oversized and duplicate inputs and never reuse a quote', async () => {
    const {server}=require('./server.js');
    const route='/api/ton/blockchain/accounts/0:'+'11'.repeat(32)+'/methods/get_buy_quote_v2';
    const upstream=[];
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    global.fetch=async(url,options)=>{
      assert.equal(options.method,'GET');
      upstream.push(String(url));
      return Response.json({success:true});
    };
    try {
      const local='http://127.0.0.1:'+server.address().port;
      for(const query of ['?args=0x'+(1000000000000001n).toString(16),'?args=0x1&args=0x2']){
        assert.equal((await origFetch(local+route+query)).status,400);
        assert.equal((await worker.fetch(new Request('https://anlgram.com'+route+query),env,ctx)).status,400);
      }
      assert.equal(upstream.length,0);
      for(let i=0;i<2;i++){
        const res=await origFetch(local+route+'?args=0x1000000');
        assert.equal(res.status,200);
        assert.equal(res.headers.get('cache-control'),'no-store');
        await res.json();
      }
      assert.equal(upstream.length,2);
      assert.equal(upstream[0],upstream[1]);
    } finally {
      global.fetch=origFetch;
      await new Promise(resolve=>server.close(resolve));
    }
  });

  await test('Permits whitelisted query parameters args and supported_extensions in both Worker and server.js', async () => {
    const srv = require('./server.js');
    assert.strictEqual(worker.ALLOWED_QUERY_PARAMS.has('args'), true);
    assert.strictEqual(worker.ALLOWED_QUERY_PARAMS.has('supported_extensions'), true);
    assert.strictEqual(srv.ALLOWED_QUERY_PARAMS.has('args'), true);
    assert.strictEqual(srv.ALLOWED_QUERY_PARAMS.has('supported_extensions'), true);
    assert.strictEqual(srv. isValidTonAddress('EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe'), true);
    assert.strictEqual(srv.isValidTonAddress('EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOf'), false);
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
