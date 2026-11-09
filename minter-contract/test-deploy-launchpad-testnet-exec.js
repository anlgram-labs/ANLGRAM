'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseArgs,
  parseTonAddress,
  normalizeEndpoint,
  validateNetworkConfig,
  verifyArtifacts,
  deriveDeterministicAddresses,
  queryAccountStatusReadOnly,
  verifyDeterministicAddressesOnChainReadOnly,
  printOnChainPreflight,
  DEPLOYMENT_BUDGET,
  APPROVED_TESTNET_DEX,
  CONTRACT_SPECS,
  DEPENDENCY_DAG,
  main,
} = require('./deploy-launchpad-testnet-exec');

const validTestnetEnv = {
  TON_NETWORK: 'testnet',
  TON_GLOBAL_ID: '-3',
  TONCENTER_TESTNET_URL: 'https://testnet.toncenter.com/api/v2',
  TONAPI_TESTNET_URL: 'https://testnet.tonapi.io/v2',
  ANLGRAM_TESTNET_DEPLOYER_ADDRESS: 'kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-',
  STONFI_TESTNET_ROUTER: 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn',
  STONFI_TESTNET_PTON_MASTER: 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px',
  TESTNET_DEPLOYER_MNEMONIC: 'SECRET_DO_NOT_PRINT_WORD1_WORD2_WORD3',
};

// ---------------------------------------------------------------------------
// 1. CLI Option Parsing & Secret Prohibition
// ---------------------------------------------------------------------------
test('CLI parser: default mode defaults to read-only --plan', () => {
  const flags = parseArgs([]);
  assert.equal(flags.plan, true);
  assert.equal(flags.executeTestnet, false);
  assert.equal(flags.dryRun, false);
});

test('CLI parser: accepts authorized safe operational flags', () => {
  assert.equal(parseArgs(['--plan']).plan, true);
  assert.equal(parseArgs(['--verify-config']).verifyConfig, true);
  assert.equal(parseArgs(['--verify-onchain']).verifyOnchain, true);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--execute-testnet', '--supervised-human-approved']).executeTestnet, true);
  assert.equal(parseArgs(['--execute-testnet', '--supervised-human-approved']).supervisedHumanApproved, true);
  assert.equal(parseArgs(['--help']).help, true);
});

test('CLI parser: rejects unknown or rogue options', () => {
  assert.throws(() => parseArgs(['--deploy']), /Unsupported option: --deploy/);
  assert.throws(() => parseArgs(['--broadcast']), /Unsupported option: --broadcast/);
  assert.throws(() => parseArgs(['--force']), /Unsupported option: --force/);
});

test('CLI parser: strictly forbids CLI secret flags (--mnemonic, --seed, --key)', () => {
  assert.throws(
    () => parseArgs(['--mnemonic=abandon abandon abandon']),
    /SECURITY VIOLATION: Command-line secret flag '--mnemonic=abandon abandon abandon' is strictly forbidden/
  );
  assert.throws(
    () => parseArgs(['--seed=1234567890']),
    /SECURITY VIOLATION: Command-line secret flag '--seed=1234567890' is strictly forbidden/
  );
  assert.throws(
    () => parseArgs(['--key=0123456789abcdef']),
    /SECURITY VIOLATION: Command-line secret flag '--key=0123456789abcdef' is strictly forbidden/
  );
});

// ---------------------------------------------------------------------------
// 2. Network Configuration & Whitelist Controls
// ---------------------------------------------------------------------------
test('Network config: accepts fully compliant testnet configuration', () => {
  const res = validateNetworkConfig(validTestnetEnv);
  assert.equal(res.ok, true, `Validation failed: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);
});

test('Network config: strictly rejects mainnet and mismatched global_id', () => {
  const mainnetRes = validateNetworkConfig({ ...validTestnetEnv, TON_NETWORK: 'mainnet' });
  assert.equal(mainnetRes.ok, false);
  assert.ok(mainnetRes.errors.some((e) => e.includes("TON_NETWORK must be explicitly set to 'testnet'")));

  const globalIdRes = validateNetworkConfig({ ...validTestnetEnv, TON_GLOBAL_ID: '0' });
  assert.equal(globalIdRes.ok, false);
  assert.ok(globalIdRes.errors.some((e) => e.includes('TON_GLOBAL_ID must equal -3')));
});

test('Network config: enforces HTTPS on RPC endpoints', () => {
  const httpCenter = validateNetworkConfig({
    ...validTestnetEnv,
    TONCENTER_TESTNET_URL: 'http://testnet.toncenter.com/api/v2',
  });
  assert.equal(httpCenter.ok, false);
  assert.ok(httpCenter.errors.some((e) => e.includes('TONCENTER_TESTNET_URL must use HTTPS')));

  const httpApi = validateNetworkConfig({
    ...validTestnetEnv,
    TONAPI_TESTNET_URL: 'http://testnet.tonapi.io/v2',
  });
  assert.equal(httpApi.ok, false);
  assert.ok(httpApi.errors.some((e) => e.includes('TONAPI_TESTNET_URL must use HTTPS')));
});

test('Network config: strictly enforces domain whitelist (rejects mainnet & unknown domains)', () => {
  const mainnetCenter = validateNetworkConfig({
    ...validTestnetEnv,
    TONCENTER_TESTNET_URL: 'https://toncenter.com/api/v2',
  });
  assert.equal(mainnetCenter.ok, false);
  assert.ok(mainnetCenter.errors.some((e) => e.includes('not in approved testnet whitelist')));

  const rogueApi = validateNetworkConfig({
    ...validTestnetEnv,
    TONAPI_TESTNET_URL: 'https://malicious-rpc.org/v2',
  });
  assert.equal(rogueApi.ok, false);
  assert.ok(rogueApi.errors.some((e) => e.includes('not in approved testnet whitelist')));
});

test('Network config: fails closed when configuration is empty or incomplete', () => {
  const res = validateNetworkConfig({});
  assert.equal(res.ok, false);
  assert.ok(res.errors.length >= 5);
});

// ---------------------------------------------------------------------------
// 3. Approved DEX Endpoints & Address Validation (Candidate B)
// ---------------------------------------------------------------------------
test('DEX config: accepts exact Candidate B approved router & pTON master', () => {
  assert.equal(APPROVED_TESTNET_DEX.router, 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn');
  assert.equal(APPROVED_TESTNET_DEX.ptonMaster, 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px');
  assert.equal(APPROVED_TESTNET_DEX.version, 'STON.fi DEX v2.2');
});

test('DEX config: rejects deprecated Candidate A (CPI v2.1.0) router', () => {
  const cpiRouterEnv = {
    ...validTestnetEnv,
    STONFI_TESTNET_ROUTER: 'kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v', // Candidate A
  };
  const res = validateNetworkConfig(cpiRouterEnv);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('does not match Candidate B approved address')));
});

test('DEX config: rejects unapproved pTON master address', () => {
  const roguePtonEnv = {
    ...validTestnetEnv,
    STONFI_TESTNET_PTON_MASTER: 'kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-',
  };
  const res = validateNetworkConfig(roguePtonEnv);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('does not match approved pTON address')));
});

// ---------------------------------------------------------------------------
// 4. TON Address Parser Robustness
// ---------------------------------------------------------------------------
test('Address parser: parses friendly testnet bounceable address', () => {
  const parsed = parseTonAddress('kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.format, 'friendly');
  assert.equal(parsed.testnetFlagPresent, true);
  assert.equal(parsed.workchain, 0);
  assert.equal(parsed.bounceable, true);
  assert.equal(parsed.rawHash, '05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3');
});

test('Address parser: parses raw 0:hash addresses', () => {
  const parsed = parseTonAddress('0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3');
  assert.equal(parsed.valid, true);
  assert.equal(parsed.format, 'raw');
  assert.equal(parsed.workchain, 0);
});

test('Address parser: rejects corrupted checksum and invalid characters', () => {
  // 1-character typo in checksum
  const corrupted = 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztX';
  const parsedCorrupt = parseTonAddress(corrupted);
  assert.equal(parsedCorrupt.valid, false);
  assert.ok(parsedCorrupt.reason.includes('checksum mismatch'));

  // Invalid length
  assert.equal(parseTonAddress('kQAFpeGFJQA').valid, false);
  // Null/empty
  assert.equal(parseTonAddress(null).valid, false);
});

test('Address parser: flags mainnet friendly address as lacking testnet tag', () => {
  // Mainnet bounceable starts with EQ
  const parsedMainnet = parseTonAddress('EQBsGx9ArADUrREB34W-ghgsCgBShvfUr4Jvlu-0KGc33Rbt');
  assert.equal(parsedMainnet.valid, true);
  assert.equal(parsedMainnet.testnetFlagPresent, false);
});

// ---------------------------------------------------------------------------
// 5. Artifact Verification & Checksum Integrity
// ---------------------------------------------------------------------------
test('Artifact verifier: checks all 4 compiled artifacts and validates SHA256 integrity', () => {
  const res = verifyArtifacts();
  assert.equal(res.ok, true, `Artifact verification failed: ${res.errors.join('; ')}`);
  assert.equal(Object.keys(res.artifacts).length, 4);

  const curveArtifact = res.artifacts.bondingCurve;
  assert.ok(curveArtifact.codeBocBase64);
  // Integration preserves the corrected Curve, not main's older financial code.
  const { Cell } = require('@ton/core');
  const bytes = Buffer.from(curveArtifact.codeBocBase64, 'base64');
  assert.equal(curveArtifact.codeCellHash, Cell.fromBoc(bytes)[0].hash().toString('hex'));
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'build/anlgram-bonding-curve.compiled.json'), 'utf8'));
  const serialized = saved.codeHex ? Buffer.from(saved.codeHex, 'hex') : bytes;
  assert.equal(curveArtifact.bocSha256, require('node:crypto').createHash('sha256').update(serialized).digest('hex'));
});

test('Artifact verifier rejects forged recorded cell hash and conflicting BOC encodings', () => {
  const read = fs.readFileSync;
  for (const field of ['codeCellHash','codeHex']) {
    try {
      fs.readFileSync = function(file, options) {
        const data = read.apply(this, arguments);
        if (String(file).endsWith('anlgram-bonding-curve.compiled.json')) {
          const artifact = JSON.parse(data.toString()); artifact[field] = '00'.repeat(32);
          return JSON.stringify(artifact);
        }
        return data;
      };
      assert.equal(verifyArtifacts().ok, false, field);
    } finally { fs.readFileSync = read; }
  }
});

// ---------------------------------------------------------------------------
// 6. Deterministic Address Derivation & Acyclic DAG
// ---------------------------------------------------------------------------
test('Deterministic addresses: generates predictable StateInit addresses for deployment DAG', () => {
  const artifactsRes = verifyArtifacts();
  assert.equal(artifactsRes.ok, true);

  const predicted = deriveDeterministicAddresses(
    validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS,
    artifactsRes.artifacts
  );

  assert.ok(predicted.launchpadMinter.address.startsWith('kQ'));
  assert.ok(predicted.bondingCurve.address.startsWith('kQ'));
  assert.ok(predicted.lpLocker.address.startsWith('kQ'));
  assert.ok(predicted.migrationRouter.address.startsWith('kQ'));

  // Confirm DAG dependencies are acyclic
  assert.deepEqual(DEPENDENCY_DAG.launchpadMinter, []);
  assert.deepEqual(DEPENDENCY_DAG.bondingCurve, ['launchpadMinter']);
  assert.deepEqual(DEPENDENCY_DAG.lpLocker, ['bondingCurve']);
  assert.deepEqual(DEPENDENCY_DAG.migrationRouter, ['launchpadMinter', 'bondingCurve', 'lpLocker']);
});

// ---------------------------------------------------------------------------
// 7. Budget Realism & Financial Invariant
// ---------------------------------------------------------------------------
test('Budget: validates realistic gas breakdown, operational buffer, and user liquidity invariant', () => {
  const itemsSum = DEPLOYMENT_BUDGET.items.reduce((acc, it) => acc + it.costTon, 0);
  assert.equal(Math.round(itemsSum * 100) / 100, 0.71);
  assert.equal(DEPLOYMENT_BUDGET.operationalReserveBuffer, 1.50);
  assert.equal(DEPLOYMENT_BUDGET.minimumRequiredBalance, 2.71);
  assert.equal(DEPLOYMENT_BUDGET.recommendedBalance, 3.50);
  assert.equal(DEPLOYMENT_BUDGET.items.length, 8);
});

// ---------------------------------------------------------------------------
// 8. Supervised Gating & Phase 3C Policy Enforcement
// ---------------------------------------------------------------------------
test('Execution gate: rejects --execute-testnet when --supervised-human-approved is omitted', async () => {
  const origErr = console.error;
  let capturedErr = '';
  console.error = (msg) => { capturedErr += msg + '\n'; };

  try {
    const code = await main(['--execute-testnet'], validTestnetEnv);
    assert.equal(code, 2);
    assert.ok(capturedErr.includes('--supervised-human-approved flag'));
  } finally {
    console.error = origErr;
  }
});

test('Execution gate: enforces Phase 3C policy (broadcast disabled) when approved flag is passed', async () => {
  const origLog = console.log;
  let capturedLog = '';
  console.log = (msg) => { capturedLog += msg + '\n'; };

  try {
    const code = await main(['--execute-testnet', '--supervised-human-approved'], validTestnetEnv);
    assert.equal(code, 0);
    assert.ok(capturedLog.includes('Live transaction broadcasting is strictly disabled'));
    assert.ok(capturedLog.includes('PREPARADO PARA REVISIÓN MANUAL DEL EJECUTOR'));
  } finally {
    console.log = origLog;
  }
});

test('Default execution: runs read-only planner with exit code 0', async () => {
  const origLog = console.log;
  let capturedLog = '';
  console.log = (msg) => { capturedLog += msg + '\n'; };

  try {
    const code = await main(['--plan'], validTestnetEnv);
    assert.equal(code, 0);
    assert.ok(capturedLog.includes('ANLGRAM MEMELABS — SUPERVISED DEPLOYMENT PLAN'));
    assert.ok(capturedLog.includes('READ-ONLY PLANNER'));
    assert.ok(capturedLog.includes('PREFLIGHT VERIFICATION COMPLETE: ALL GATES PASSED'));
  } finally {
    console.log = origLog;
  }
});

// ---------------------------------------------------------------------------
// 9. Zero Secret Leakage Audit
// ---------------------------------------------------------------------------
test('Secret isolation: deploy-launchpad-testnet-exec.js never imports private key signing or exposes mnemonics', () => {
  const execSource = fs.readFileSync(path.join(__dirname, 'deploy-launchpad-testnet-exec.js'), 'utf8');

  // Verify dangerous signing routines are not present
  assert.doesNotMatch(execSource, /mnemonicToPrivateKey/i);
  assert.doesNotMatch(execSource, /mnemonicToWalletKey/i);
  assert.doesNotMatch(execSource, /keyPairFromSeed/i);
  assert.doesNotMatch(execSource, /WalletContractV4/i);
  assert.doesNotMatch(execSource, /sendTransfer\s*\(/i);
  assert.doesNotMatch(execSource, /sendRawMessage\s*\(/i);

  // Verify secret environment variables are never printed in planning output
  let stdoutLogs = '';
  const origLog = console.log;
  console.log = (msg) => { stdoutLogs += String(msg) + '\n'; };

  try {
    main(['--plan'], validTestnetEnv);
    assert.doesNotMatch(stdoutLogs, /SECRET_DO_NOT_PRINT/);
    assert.doesNotMatch(stdoutLogs, /WORD1_WORD2/);
  } finally {
    console.log = origLog;
  }
});

// ---------------------------------------------------------------------------
// 10. Phase 3C.3: Read-Only On-Chain Preflight & Error Handling Verification
// ---------------------------------------------------------------------------
test('On-chain preflight: rejects mainnet addresses in read-only query', async () => {
  const mainnetAddr = 'EQBsGx9ArADUrREB34W-ghgsCgBShvfUr4Jvlu-0KGc33Rbt';
  const res = await queryAccountStatusReadOnly(mainnetAddr, validTestnetEnv);
  assert.equal(res.ok, false);
  assert.equal(res.category, 'INDETERMINATE');
  assert.equal(res.status, 'MAINNET_ADDRESS_REJECTED');
  assert.match(res.detail, /mainnet address rejected/i);
});

test('On-chain preflight: rejects non-whitelisted or insecure endpoints in read-only query', async () => {
  const rogueEnv = { ...validTestnetEnv, TONAPI_TESTNET_URL: 'https://evil-rpc.org/v2' };
  const res = await queryAccountStatusReadOnly('kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn', rogueEnv);
  assert.equal(res.ok, false);
  assert.equal(res.category, 'INDETERMINATE');
  assert.equal(res.status, 'FORBIDDEN_ENDPOINT');

  const httpEnv = { ...validTestnetEnv, TONAPI_TESTNET_URL: 'http://testnet.tonapi.io/v2' };
  const resHttp = await queryAccountStatusReadOnly('kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn', httpEnv);
  assert.equal(resHttp.ok, false);
  assert.equal(resHttp.status, 'INSECURE_ENDPOINT');
});

test('On-chain preflight: detects clean uninitialized / nonexist accounts', async () => {
  const mockFetchTonApi = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'nonexist', balance: 0 }),
  });

  const res = await queryAccountStatusReadOnly('kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8', validTestnetEnv, mockFetchTonApi);
  assert.equal(res.ok, true);
  assert.equal(res.category, 'UNINITIALIZED');
  assert.equal(res.status, 'nonexist');
  assert.equal(res.hasCode, false);
  assert.equal(res.balance, 0n);

  const mockFetchToncenter = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      result: { state: 'uninitialized', code: '', data: '', balance: '0' },
    }),
  });
  const envToncenterOnly = { ...validTestnetEnv, TONAPI_TESTNET_URL: '' };
  const resCenter = await queryAccountStatusReadOnly('kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8', envToncenterOnly, mockFetchToncenter);
  assert.equal(resCenter.ok, true);
  assert.equal(resCenter.category, 'UNINITIALIZED');
  assert.equal(resCenter.status, 'uninitialized');
  assert.equal(resCenter.hasCode, false);
});

test('On-chain preflight: detects already active / initialized account and halts deployment', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  // Mock returning 'active' for the bonding curve address (simulating address collision)
  const mockFetch = async (url) => {
    if (url.includes(encodeURIComponent(predicted.bondingCurve.address))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', balance: 5000000000, code_hash: 'abc123hash' }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetch);
  assert.equal(onchain.ok, false);
  assert.equal(onchain.statusVerdict, 'INTERVENTION_REQUIRED');
  assert.ok(onchain.blockers.some((b) => b.includes('ALREADY ACTIVE on-chain')));
});

test('On-chain preflight: detects frozen account and requires manual intervention', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  const mockFetch = async (url) => {
    if (url.includes(encodeURIComponent(predicted.lpLocker.address))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'frozen', balance: 1000 }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetch);
  assert.equal(onchain.ok, false);
  assert.equal(onchain.statusVerdict, 'INTERVENTION_REQUIRED');
  assert.ok(onchain.blockers.some((b) => b.includes('FROZEN on-chain')));
});

test('On-chain preflight: detects uninitialized account with rogue code and flags as incompatible', async () => {
  const envToncenter = { ...validTestnetEnv, TONAPI_TESTNET_URL: '' };
  const mockFetchToncenterIncompatible = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      result: { state: 'uninitialized', code: 'te6cckEBAQEAIwAIQgKEjR2p...', data: '', balance: '0' },
    }),
  });

  const res = await queryAccountStatusReadOnly(
    'kQCUd7-PNHWoT2uihm-DGhHtUxLgwxX-ngdc9-P7g_pV0nV8',
    envToncenter,
    mockFetchToncenterIncompatible
  );
  assert.equal(res.ok, true);
  assert.equal(res.category, 'INCOMPATIBLE');
  assert.equal(res.hasCode, true);
});

test('On-chain preflight: stops on indeterminate states (HTTP 500, network error, timeout) and does NOT assume unoccupied', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  // Mock network failure on Migration Router query
  const mockFetchFails = async (url) => {
    if (url.includes(encodeURIComponent(predicted.migrationRouter.address))) {
      throw new Error('ETIMEDOUT: Connection timed out');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetchFails);
  assert.equal(onchain.ok, false);
  assert.equal(onchain.statusVerdict, 'INDETERMINATE');
  assert.ok(onchain.errors.some((e) => e.includes('Must not assume address is unoccupied')));
});

test('On-chain preflight: stops on rate limit HTTP 429 and does NOT assume unoccupied', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  const mockFetch429 = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ ok: false, result: 'Ratelimit exceed' }),
  });

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetch429);
  assert.equal(onchain.ok, false);
  assert.equal(onchain.statusVerdict, 'INDETERMINATE');
  assert.ok(onchain.errors.some((e) => e.includes('Must not assume address is unoccupied')));
});

test('On-chain preflight: detects operator wallet balance shortage and halts before execution', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  // 4 targets uninitialized, but operator has only 0.50 TON (below 2.71 TON)
  const mockFetchUnderfunded = async (url) => {
    if (url.includes(encodeURIComponent(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', balance: 500000000 }), // 0.50 TON
      };
    }
    if (url.includes(encodeURIComponent(APPROVED_TESTNET_DEX.router)) || url.includes(encodeURIComponent(APPROVED_TESTNET_DEX.ptonMaster))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', balance: 2000000000 }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetchUnderfunded);
  assert.equal(onchain.ok, false);
  assert.equal(onchain.statusVerdict, 'INTERVENTION_REQUIRED');
  assert.ok(onchain.blockers.some((b) => b.includes('Required minimum is 2.71 TON')));
});

test('On-chain preflight: approves PREFLIGHT_PASS_READONLY when all 4 targets are clean and operator wallet is funded', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  // 4 targets uninitialized, operator has 3.50 TON, DEX active
  const mockFetchFullyReady = async (url) => {
    if (url.includes(encodeURIComponent(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', balance: 3500000000 }), // 3.50 TON
      };
    }
    if (url.includes(encodeURIComponent(APPROVED_TESTNET_DEX.router)) || url.includes(encodeURIComponent(APPROVED_TESTNET_DEX.ptonMaster))) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'active', balance: 2000000000 }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  const onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockFetchFullyReady);
  assert.equal(onchain.ok, true);
  assert.equal(onchain.statusVerdict, 'PREFLIGHT_PASS_READONLY');
  assert.equal(onchain.blockers.length, 0);
  assert.equal(onchain.errors.length, 0);
});

test('Read-only compliance: strictly enforces zero signing, zero broadcasting, and GET-only queries', async () => {
  const artifactsRes = verifyArtifacts();
  const predicted = deriveDeterministicAddresses(validTestnetEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, artifactsRes.artifacts);

  const queryLog = [];
  const mockSpyFetch = async (url, options) => {
    queryLog.push({ url, method: options.method, body: options.body });
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'nonexist', balance: 0 }),
    };
  };

  await verifyDeterministicAddressesOnChainReadOnly(predicted, validTestnetEnv, mockSpyFetch);

  // Verify all network requests were GET and had no payload
  assert.ok(queryLog.length >= 6); // 4 contracts + 1 deployer + 2 DEX
  for (const q of queryLog) {
    assert.equal(q.method, 'GET', `Request to ${q.url} must use GET method`);
    assert.equal(q.body, undefined, `Request to ${q.url} must not transmit a body`);
  }
});
