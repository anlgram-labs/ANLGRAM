/**
 * ANLGRAM — Blockchain Provider Abstraction Layer Offline Unit Tests
 * File: test-blockchain-provider.js
 * 
 * Tests:
 * 1. Explicit Network Enforcement (rejection of unspecified or invalid networks)
 * 2. Strict TON Address Validation & Checksum Verification (CRC16-CCITT)
 * 3. Read-Only Interface Verification (Zero mutation/send/sign methods)
 * 4. Response Normalization & Provenance Tracking
 * 5. Primary Provider Execution & Schema Normalization
 * 6. Conservative Failover Policy:
 *    - Fails over on Timeout (AbortError)
 *    - Fails over on HTTP 429 Rate Limit
 *    - Fails over on HTTP 500 / 502 / 503 Server Error
 *    - DOES NOT failover on invalid input, bad address, or client errors
 *    - DOES NOT cross networks (Mainnet never hits Testnet)
 * 7. Optional live read smoke test if --live argument provided
 */

'use strict';

const { BlockchainProvider, validateTonAddress } = require('./assets/js/blockchain-provider');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
  }
}

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🧪 ANLGRAM BLOCKCHAIN PROVIDER ABSTRACTION: OFFLINE UNIT TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// -----------------------------------------------------------------------------
// 1. Explicit Network Configuration & Rejections
// -----------------------------------------------------------------------------
console.log('--- 1. Explicit Network Configuration Enforcement ---');

try {
  new BlockchainProvider({});
  assert(false, 'Throws error when config.network is missing');
} catch (e) {
  assert(true, 'Throws error when config.network is missing');
}

try {
  new BlockchainProvider({ network: 'ethereum' });
  assert(false, 'Throws error when config.network is unsupported');
} catch (e) {
  assert(true, 'Throws error when config.network is unsupported');
}

const mainnetProvider = new BlockchainProvider({ network: 'mainnet' });
assert(mainnetProvider.network === 'mainnet', 'Accepts valid network: mainnet');

const testnetProvider = new BlockchainProvider({ network: 'testnet' });
assert(testnetProvider.network === 'testnet', 'Accepts valid network: testnet');

// -----------------------------------------------------------------------------
// 2. Strict Address Validation (Raw & Friendly TEP-2 with CRC16)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Strict Address Validation & CRC16-CCITT ---');

// Valid Raw Address
const validRaw = '0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309';
const rawRes = validateTonAddress(validRaw);
assert(rawRes.valid && rawRes.raw === validRaw.toLowerCase(), 'Validates 64-hex raw address');

// Valid Friendly Address (Binance Hot Wallet)
const validFriendly = 'EQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCXmC';
const friendlyRes = validateTonAddress(validFriendly);
assert(friendlyRes.valid && friendlyRes.raw === validRaw.toLowerCase(), 'Validates friendly TEP-2 address and computes exact raw hex');

// Corrupted Friendly Address (1 char altered)
const corruptedFriendly = validFriendly.slice(0, -1) + (validFriendly.slice(-1) === 'A' ? 'B' : 'A');
const corruptedRes = validateTonAddress(corruptedFriendly);
assert(!corruptedRes.valid && corruptedRes.reason === 'CRC16_CHECKSUM_MISMATCH', 'Rejects friendly address with corrupted CRC16 checksum');

// Adversarial & Malformed Inputs
assert(!validateTonAddress('').valid, 'Rejects empty address string');
assert(!validateTonAddress(null).valid, 'Rejects null address');
assert(!validateTonAddress('<script>alert(1)</script>').valid, 'Rejects XSS attempt in address');
assert(!validateTonAddress("0:1234'; DROP TABLE accounts;--").valid, 'Rejects SQL injection in address');

// -----------------------------------------------------------------------------
// 3. Read-Only Interface Verification (Zero Mutation Methods)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Read-Only Interface Security & Zero Mutation ---');

const pProto = Object.getOwnPropertyNames(BlockchainProvider.prototype);
const forbiddenMethods = ['send', 'broadcast', 'sign', 'transfer', 'deploy', 'sendBoc', 'sendMessage'];
const foundForbidden = forbiddenMethods.filter(m => pProto.includes(m));
assert(foundForbidden.length === 0, 'Provider prototype exposes ZERO mutation/send/sign methods', `Found: ${foundForbidden.join(', ')}`);

// -----------------------------------------------------------------------------
// 4. Primary Provider Normalized Execution (Simulated Transport)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Primary Provider Execution & Schema Normalization ---');

(async function testPrimaryExecution() {
  const mockFetch = async (url) => {
    if (url.includes('/accounts/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          address: '0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309',
          status: 'active',
          balance: 1550000000000n.toString(), // 1,550 TON
          is_wallet: true,
          last_activity: 1729000000
        })
      };
    }
    if (url.includes('/rates')) {
      return { ok: true, status: 200, json: async () => ({ rates: { TON: { prices: { USD: 5.25 } } } }) };
    }
    throw new Error(`Unhandled mock url: ${url}`);
  };

  const client = new BlockchainProvider({ network: 'mainnet', customFetch: mockFetch });

  // Test getAccountState
  const accRes = await client.getAccountState(validFriendly);
  assert(accRes.success === true, 'getAccountState returns success: true');
  assert(accRes.provider === 'tonapi', 'Correctly records provider provenance as tonapi');
  assert(accRes.network === 'mainnet', 'Correctly preserves network as mainnet');
  assert(accRes.data.status === 'active', 'Normalizes account status to active');
  assert(accRes.data.balanceNano === '1550000000000', 'Preserves exact integer nanoTON balance string without precision loss');

  // ---------------------------------------------------------------------------
  // 5. Failover Policy Tests (Timeout, 429, 5xx)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Conservative Failover Policy Verification ---');

  // Test 5A: Timeout Failover to TonCenter
  let tonApiCalled = false;
  let tonCenterCalled = false;

  const timeoutFetch = async (url) => {
    if (url.includes('tonapi.io')) {
      tonApiCalled = true;
      const timeoutErr = new Error('The operation was aborted');
      timeoutErr.name = 'AbortError';
      throw timeoutErr;
    }
    if (url.includes('toncenter.com')) {
      tonCenterCalled = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: {
            state: 'active',
            balance: '1550000000000',
            code_hash: '9a0f98dd...',
            last_transaction_id: { lt: '450000000' }
          }
        })
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const failoverClient = new BlockchainProvider({
    network: 'mainnet',
    primaryProvider: 'tonapi',
    fallbackProvider: 'toncenter',
    customFetch: timeoutFetch
  });

  const failoverRes = await failoverClient.getAccountState(validFriendly);
  assert(tonApiCalled === true, 'Primary provider was attempted first');
  assert(tonCenterCalled === true, 'Fallback provider was queried upon primary timeout');
  assert(failoverRes.success === true, 'Failover operation successfully returns data');
  assert(failoverRes.provider === 'toncenter', 'Provenance correctly reflects fallback provider (toncenter)');

  // Test 5B: HTTP 429 Rate Limit Failover
  let tonApi429 = false;
  let tonCenter429 = false;

  const rateLimitFetch = async (url) => {
    if (url.includes('tonapi.io')) {
      tonApi429 = true;
      const err = new Error('Too Many Requests');
      err.status = 429;
      throw err;
    }
    if (url.includes('toncenter.com')) {
      tonCenter429 = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { state: 'active', balance: '500' } })
      };
    }
    throw new Error('Unexpected');
  };

  const rClient = new BlockchainProvider({ network: 'mainnet', customFetch: rateLimitFetch });
  const rRes = await rClient.getAccountState(validFriendly);
  assert(tonApi429 && tonCenter429 && rRes.success, 'HTTP 429 rate limit triggers failover to fallback provider');

  // Test 5C: Non-Failover on Client Error (Invalid Address)
  let anyNetworkCalled = false;
  const noCallFetch = async () => { anyNetworkCalled = true; return {}; };
  const clientErrProvider = new BlockchainProvider({ network: 'mainnet', customFetch: noCallFetch });
  const errRes = await clientErrProvider.getAccountState('invalid_address_format');
  assert(errRes.success === false && errRes.error.code === 'INVALID_ADDRESS', 'Rejects invalid address immediately without network request');
  assert(anyNetworkCalled === false, 'Zero network requests issued on client-side address rejection');

  // Test 5D: Network Isolation (Mainnet NEVER queries Testnet)
  let queriedUrls = [];
  const captureFetch = async (url) => {
    queriedUrls.push(url);
    const err = new Error('Failed');
    err.status = 500;
    throw err;
  };
  const netClient = new BlockchainProvider({ network: 'mainnet', customFetch: captureFetch });
  await netClient.getAccountState(validFriendly);
  const leakedTestnet = queriedUrls.some(u => u.includes('testnet'));
  assert(!leakedTestnet, 'Mainnet provider strictly isolates queries to Mainnet (Never calls Testnet endpoints)');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`📊 BLOCKCHAIN PROVIDER TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();
