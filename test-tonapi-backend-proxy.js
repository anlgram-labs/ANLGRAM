/**
 * ANLGRAM Intelligence - TonAPI Backend Proxy & Security Test Suite
 * Version: 2.1.0
 */

const http = require('http');
const assert = require('assert');

// 1. Unit Test for NFT Image Resolver logic
function resolveNftImageUrlTest(nft) {
  if (nft?.previews && Array.isArray(nft.previews)) {
    const preview = nft.previews.find(p => p.resolution === '500x500') || nft.previews[1] || nft.previews[0];
    if (preview && preview.url && preview.url.startsWith('https://')) {
      return preview.url;
    }
  }

  const raw = nft?.metadata?.image;
  if (!raw || typeof raw !== 'string') return 'assets/img/anlgram-icon.svg';
  const trimmed = raw.trim();

  if (trimmed.startsWith('ipfs://')) {
    const cidPath = trimmed.slice(7).replace(/^\/+/, '');
    if (/^[a-zA-Z0-9_\-\.\/]+$/.test(cidPath)) {
      return `https://cloudflare-ipfs.com/ipfs/${cidPath}`;
    }
  }

  if (trimmed.startsWith('https://')) {
    return trimmed;
  }

  return 'assets/img/anlgram-icon.svg';
}

function requestProxy(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: headers
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runSuite() {
  console.log('========================================================================');
  console.log('🛡️  ANLGRAM SECURE TONAPI PROXY & BACKEND VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc} -> ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(desc, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc} -> ${err.message}`);
      failed++;
    }
  }

  console.log('--- 1. NFT Image Resolution & IPFS Sanitization Tests ---');
  test('Prefers official TonAPI preview thumbnail if available', () => {
    const nft = {
      previews: [
        { resolution: '100x100', url: 'https://cache.tonapi.io/img/small.png' },
        { resolution: '500x500', url: 'https://cache.tonapi.io/img/large.png' }
      ],
      metadata: { image: 'ipfs://bafybeicid' }
    };
    const resolved = resolveNftImageUrlTest(nft);
    assert.strictEqual(resolved, 'https://cache.tonapi.io/img/large.png');
  });

  test('Converts raw ipfs:// URI safely to HTTPS Cloudflare IPFS gateway', () => {
    const nft = {
      metadata: { image: 'ipfs://bafkreihhiv2nnsjz7e43jufzflbzxxh6kb72t32hpqplwfgzhemgvumaam' }
    };
    const resolved = resolveNftImageUrlTest(nft);
    assert.strictEqual(resolved, 'https://cloudflare-ipfs.com/ipfs/bafkreihhiv2nnsjz7e43jufzflbzxxh6kb72t32hpqplwfgzhemgvumaam');
  });

  test('Preserves existing legitimate HTTPS URLs', () => {
    const nft = {
      metadata: { image: 'https://nft.fragment.com/username/vipss88.webp' }
    };
    const resolved = resolveNftImageUrlTest(nft);
    assert.strictEqual(resolved, 'https://nft.fragment.com/username/vipss88.webp');
  });

  test('Falls back safely to local SVG icon when image metadata is invalid or null', () => {
    assert.strictEqual(resolveNftImageUrlTest(null), 'assets/img/anlgram-icon.svg');
    assert.strictEqual(resolveNftImageUrlTest({ metadata: {} }), 'assets/img/anlgram-icon.svg');
    assert.strictEqual(resolveNftImageUrlTest({ metadata: { image: 'javascript:alert(1)' } }), 'assets/img/anlgram-icon.svg');
  });

  console.log('\n--- 2. Proxy Security & Route Whitelisting Tests ---');
  await asyncTest('Proxy health endpoint responds 200 OK', async () => {
    const res = await requestProxy('GET', '/api/ton/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  await asyncTest('Rejects non-GET HTTP methods with 405 Method Not Allowed', async () => {
    const res = await requestProxy('POST', '/api/ton/accounts/UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    assert.strictEqual(res.status, 405);
    assert.strictEqual(res.body.error, 'Method Not Allowed');
  });

  await asyncTest('Rejects unwhitelisted arbitrary routes with 403 Forbidden', async () => {
    const res = await requestProxy('GET', '/api/ton/arbitrary/exploit/route');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'Forbidden');
  });

  await asyncTest('Permits legitimate account inspection endpoint', async () => {
    const res = await requestProxy('GET', '/api/ton/accounts/UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    assert.strictEqual(res.status, 200);
    assert(res.body.balance !== undefined);
  });

  await asyncTest('Permits legitimate rates endpoint', async () => {
    const res = await requestProxy('GET', '/api/ton/rates?tokens=ton&currencies=usd');
    assert.strictEqual(res.status, 200);
    assert(res.body.rates !== undefined);
  });

  await asyncTest('Permits legitimate NFT inquiry endpoint', async () => {
    const res = await requestProxy('GET', '/api/ton/accounts/UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd/nfts?limit=10');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body.nft_items));
  });

  console.log('\n--- 3. Secret Leakage & Header Auditing ---');
  await asyncTest('Never exposes TONAPI_KEY or upstream Authorization in response body', async () => {
    const res = await requestProxy('GET', '/api/ton/accounts/UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    const rawString = JSON.stringify(res.body);
    assert(!rawString.includes('TONAPI_KEY'));
    assert(!rawString.includes('Bearer'));
  });

  await asyncTest('Never exposes internal auth headers in HTTP response headers', async () => {
    const res = await requestProxy('GET', '/api/ton/accounts/UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    assert(!res.headers['authorization']);
    assert(!res.headers['x-api-key']);
  });

  console.log(`\n========================================================================`);
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`========================================================================\n`);

  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
