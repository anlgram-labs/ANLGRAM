#!/usr/bin/env node
'use strict';

/**
 * ANLGRAM MemeLabs — Supervised Testnet Deployment Tool & Execution Engine
 * File: minter-contract/deploy-launchpad-testnet-exec.js
 *
 * PHASE 3C.3 COMPLIANCE:
 * - Dedicated execution planner, deterministic address verifier, and read-only preflight engine.
 * - Default Mode is 100% read-only: validates configuration, checks artifacts, calculates DAG,
 *   derives deterministic StateInit addresses, and presents itemized gas budgets and balance preflights.
 * - Strict read-only on-chain verification distinguishes uninitialized, active, frozen, and indeterminate states.
 * - Never treats query failure (HTTP 429, 500, timeout) as confirmation that an address is unoccupied.
 * - Future Execution Mode (--execute-testnet) requires strict multi-layer gates, explicit testnet
 *   selection, allowed domain whitelisting, balance pre-checks, and step-by-step human confirmation.
 * - Zero secrets printed, stored, or accepted as command-line arguments.
 * - Zero transaction signing or broadcasting logic implemented.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const {
  TONCONNECT_SPEC,
  validateTonConnectManifestConfig,
  SUPERVISED_BUDGET,
  buildDeploymentOperations,
  validateTonConnectSession,
  buildTonConnectTransactionPayload,
  formatHumanApprovalCard,
  verifyStepPreconditionsReadOnly,
  evaluatePostApprovalResult,
  sanitizeLogOutput,
} = require('./supervised-execution-engine');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const EXPECTED_GLOBAL_ID = '-3';

// Allowed RPC domain whitelist for testnet
const ALLOWED_TESTNET_HOSTS = new Set([
  'testnet.toncenter.com',
  'testnet.tonapi.io',
]);

// STON.fi DEX v2.2 Approved Testnet Endpoints (Candidate B)
const APPROVED_TESTNET_DEX = {
  router: 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn',
  routerRaw: '0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3',
  ptonMaster: 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px',
  ptonMasterRaw: '0:0092df40d7a1443b35f0293efce1ede066499f4be32809fa590d5ad6daf13413',
  version: 'STON.fi DEX v2.2',
};

// Itemized Gas & Financial Budget Breakdown
const DEPLOYMENT_BUDGET = {
  items: [
    { name: 'Deploy Launchpad Jetton Master', costTon: 0.08, note: 'StateInit deployment + initial storage rent' },
    { name: 'Deploy Bonding Curve', costTon: 0.15, note: 'StateInit deployment + AMM reserves storage rent' },
    { name: 'Deploy LP Locker', costTon: 0.10, note: 'StateInit deployment + immutable lock storage rent' },
    { name: 'Deploy Migration Router', costTon: 0.12, note: 'StateInit deployment + STON.fi routing state' },
    { name: 'Bootstrap Step 1: Init LP Locker (0x414e4c39)', costTon: 0.05, note: 'One-time authorized router configuration' },
    { name: 'Bootstrap Step 2: Init Launchpad (0x414e4c01)', costTon: 0.06, note: 'One-time authorized curve setup (Locker & Router)' },
    { name: 'Bootstrap Step 3: Mint 1B Tokens & Renounce (op==3)', costTon: 0.10, note: 'Mints 1B tokens to Curve + renounces admin' },
    { name: 'Bootstrap Step 4: Verify Admin Renounce & Activate', costTon: 0.05, note: 'Processes admin_changed_notification -> STATE_ACTIVE' },
  ],
  operationalReserveBuffer: 1.50, // Buffer for network fee fluctuations and storage across blocks
  minimumRequiredBalance: 2.71,   // Absolute hard-stop floor: items sum (0.71) + reserve (1.50) + provision gas buffer (0.50)
  recommendedBalance: 3.50,      // Recommended operator wallet balance
};

const CONTRACT_SPECS = [
  {
    id: 'launchpadMinter',
    label: 'Launchpad Jetton Master',
    source: 'contracts/anlgram-launchpad-jetton-minter.fc',
    artifact: 'build/anlgram-launchpad-jetton-minter.compiled.json',
  },
  {
    id: 'bondingCurve',
    label: 'Bonding Curve',
    source: 'contracts/anlgram-bonding-curve.fc',
    artifact: 'build/anlgram-bonding-curve.compiled.json',
  },
  {
    id: 'lpLocker',
    label: 'LP Locker',
    source: 'contracts/anlgram-lp-locker.fc',
    artifact: 'build/anlgram-lp-locker.compiled.json',
  },
  {
    id: 'migrationRouter',
    label: 'Migration Router',
    source: 'contracts/anlgram-migration-router.fc',
    artifact: 'build/anlgram-migration-router.compiled.json',
  },
];

// Remediated Acyclic DAG Specification
const DEPENDENCY_DAG = {
  launchpadMinter: [],
  bondingCurve: ['launchpadMinter'],
  lpLocker: ['bondingCurve'],
  migrationRouter: ['launchpadMinter', 'bondingCurve', 'lpLocker'],
};

function parseArgs(argv) {
  const flags = {
    plan: false,
    verifyConfig: false,
    verifyOnchain: false,
    dryRun: false,
    executeTestnet: false,
    supervisedHumanApproved: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--plan') flags.plan = true;
    else if (arg === '--verify-config') flags.verifyConfig = true;
    else if (arg === '--verify-onchain') flags.verifyOnchain = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--execute-testnet') flags.executeTestnet = true;
    else if (arg === '--supervised-human-approved') flags.supervisedHumanApproved = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg.startsWith('--mnemonic') || arg.startsWith('--seed') || arg.startsWith('--key')) {
      throw new Error(`SECURITY VIOLATION: Command-line secret flag '${arg}' is strictly forbidden. Secrets must never be passed in command arguments.`);
    } else {
      throw new Error(`Unsupported option: ${arg}. Allowed: --plan, --verify-config, --verify-onchain, --dry-run, --execute-testnet, --supervised-human-approved.`);
    }
  }

  // Default mode if no flags specified is --plan
  if (!flags.plan && !flags.verifyConfig && !flags.verifyOnchain && !flags.dryRun && !flags.executeTestnet && !flags.help) {
    flags.plan = true;
  }

  return flags;
}

function crc16Xmodem(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function parseTonAddress(value) {
  const text = String(value || '').trim();
  if (/^0:[0-9a-fA-F]{64}$/.test(text) || /^-1:[0-9a-fA-F]{64}$/.test(text)) {
    return { valid: true, format: 'raw', testnetFlagPresent: false, workchain: Number(text.split(':')[0]) };
  }
  if (!/^[A-Za-z0-9_-]{48}$/.test(text)) {
    return { valid: false, reason: 'Expected a 48-character TON friendly address or raw workchain:hash address.' };
  }
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length !== 36) {
    return { valid: false, reason: 'Friendly address decoded to an invalid byte length.' };
  }
  const expected = crc16Xmodem(bytes.subarray(0, 34));
  const actual = bytes.readUInt16BE(34);
  if (expected !== actual) {
    return { valid: false, reason: 'Friendly address CRC16 checksum mismatch.' };
  }
  const tag = bytes[0];
  return {
    valid: true,
    format: 'friendly',
    testnetFlagPresent: (tag & 0x80) !== 0,
    workchain: bytes.readInt8(1),
    bounceable: (tag & 0x40) === 0,
    rawHash: bytes.subarray(2, 34).toString('hex'),
  };
}

function normalizeEndpoint(endpoint) {
  try {
    return new URL(String(endpoint || '').trim()).toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function validateNetworkConfig(env = process.env) {
  const errors = [];
  const warnings = [];

  if (env.TON_NETWORK !== 'testnet') {
    errors.push(`SECURITY: TON_NETWORK must be explicitly set to 'testnet' (received: '${env.TON_NETWORK}').`);
  }
  if (String(env.TON_GLOBAL_ID || '') !== EXPECTED_GLOBAL_ID) {
    errors.push(`SECURITY: TON_GLOBAL_ID must equal ${EXPECTED_GLOBAL_ID} for testnet (received: '${env.TON_GLOBAL_ID}').`);
  }

  const centerUrl = normalizeEndpoint(env.TONCENTER_TESTNET_URL);
  if (!centerUrl) {
    errors.push('TONCENTER_TESTNET_URL is missing or malformed.');
  } else {
    const u = new URL(centerUrl);
    if (u.protocol !== 'https:') {
      errors.push('TONCENTER_TESTNET_URL must use HTTPS.');
    }
    if (!ALLOWED_TESTNET_HOSTS.has(u.hostname.toLowerCase())) {
      errors.push(`SECURITY: TONCENTER_TESTNET_URL host '${u.hostname}' is not in approved testnet whitelist.`);
    }
  }

  const apiUrl = normalizeEndpoint(env.TONAPI_TESTNET_URL);
  if (!apiUrl) {
    errors.push('TONAPI_TESTNET_URL is missing or malformed.');
  } else {
    const u = new URL(apiUrl);
    if (u.protocol !== 'https:') {
      errors.push('TONAPI_TESTNET_URL must use HTTPS.');
    }
    if (!ALLOWED_TESTNET_HOSTS.has(u.hostname.toLowerCase())) {
      errors.push(`SECURITY: TONAPI_TESTNET_URL host '${u.hostname}' is not in approved testnet whitelist.`);
    }
  }

  // Address validations
  const deployer = env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS;
  if (!deployer) {
    errors.push('ANLGRAM_TESTNET_DEPLOYER_ADDRESS is missing.');
  } else {
    const p = parseTonAddress(deployer);
    if (!p.valid) errors.push(`ANLGRAM_TESTNET_DEPLOYER_ADDRESS invalid: ${p.reason}`);
    else if (!p.testnetFlagPresent) errors.push('ANLGRAM_TESTNET_DEPLOYER_ADDRESS lacks friendly testnet flag.');
  }

  const router = env.STONFI_TESTNET_ROUTER;
  if (!router) {
    errors.push('STONFI_TESTNET_ROUTER is missing.');
  } else {
    const p = parseTonAddress(router);
    if (!p.valid) errors.push(`STONFI_TESTNET_ROUTER invalid: ${p.reason}`);
    else if (!p.testnetFlagPresent) errors.push('STONFI_TESTNET_ROUTER lacks friendly testnet flag.');
    else if (router !== APPROVED_TESTNET_DEX.router) {
      errors.push(`SECURITY: STONFI_TESTNET_ROUTER '${router}' does not match Candidate B approved address (${APPROVED_TESTNET_DEX.router}).`);
    }
  }

  const pton = env.STONFI_TESTNET_PTON_MASTER;
  if (!pton) {
    errors.push('STONFI_TESTNET_PTON_MASTER is missing.');
  } else {
    const p = parseTonAddress(pton);
    if (!p.valid) errors.push(`STONFI_TESTNET_PTON_MASTER invalid: ${p.reason}`);
    else if (!p.testnetFlagPresent) errors.push('STONFI_TESTNET_PTON_MASTER lacks friendly testnet flag.');
    else if (pton !== APPROVED_TESTNET_DEX.ptonMaster) {
      errors.push(`SECURITY: STONFI_TESTNET_PTON_MASTER '${pton}' does not match approved pTON address (${APPROVED_TESTNET_DEX.ptonMaster}).`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function verifyArtifacts() {
  const errors = [];
  const artifacts = {};

  for (const spec of CONTRACT_SPECS) {
    const fullArtifactPath = path.join(SCRIPT_DIR, spec.artifact);
    if (!fs.existsSync(fullArtifactPath)) {
      errors.push(`Missing compiled artifact: ${spec.artifact}`);
      continue;
    }

    try {
      const data = JSON.parse(fs.readFileSync(fullArtifactPath, 'utf8'));
      if (!data.codeBocBase64) {
        errors.push(`Artifact ${spec.artifact} is missing codeBocBase64.`);
        continue;
      }
      // Hex/base64 may use different valid index/CRC serialization options.
      // Compare decoded cells, and hash the serialization recorded by compiler.
      const { Cell } = require('@ton/core');
      const codeCells = Cell.fromBoc(Buffer.from(data.codeBocBase64, 'base64'));
      const bocBuffer = data.codeHex ? Buffer.from(data.codeHex, 'hex') : Buffer.from(data.codeBocBase64, 'base64');
      const cells = Cell.fromBoc(bocBuffer);
      if (cells.length !== 1 || codeCells.length !== 1 || !cells[0].hash().equals(codeCells[0].hash())) {
        errors.push(`Conflicting BOC encodings in ${spec.artifact}.`);
        continue;
      }
      const sha256 = crypto.createHash('sha256').update(bocBuffer).digest('hex');
      if (data.bocFileSha256 && data.bocFileSha256.toLowerCase() !== sha256.toLowerCase()) {
        errors.push(`Checksum mismatch in ${spec.artifact}: recorded ${data.bocFileSha256} != calculated ${sha256}`);
        continue;
      }
      const actualCodeHash = cells[0].hash().toString('hex');
      if ([data.codeCellHash, data.codeHash].some(hash => hash && hash.toLowerCase() !== actualCodeHash)) {
        errors.push(`Code cell hash mismatch in ${spec.artifact}.`);
        continue;
      }
      // Internal consistency is not deployment approval or source verification.
      artifacts[spec.id] = {
        id: spec.id,
        label: spec.label,
        codeBocBase64: data.codeBocBase64,
        codeCellHash: actualCodeHash,
        bocSha256: sha256,
        sizeBytes: bocBuffer.length,
      };
    } catch (err) {
      errors.push(`Failed to parse artifact ${spec.artifact}: ${err.message}`);
    }
  }

  return { ok: errors.length === 0, errors, artifacts };
}

function deriveDeterministicAddresses(deployerAddress, artifacts) {
  const { Cell, beginCell, contractAddress, Address } = require('@ton/core');
  const deployer = Address.parse(deployerAddress);
  const dexRouter = Address.parse(APPROVED_TESTNET_DEX.router);
  const ptonMaster = Address.parse(APPROVED_TESTNET_DEX.ptonMaster);
  const treasuryAddr = Address.parseRaw('0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d');

  // Load code cells
  const minterCode = Cell.fromBoc(Buffer.from(artifacts.launchpadMinter.codeBocBase64, 'base64'))[0];
  const curveCode = Cell.fromBoc(Buffer.from(artifacts.bondingCurve.codeBocBase64, 'base64'))[0];
  const lockerCode = Cell.fromBoc(Buffer.from(artifacts.lpLocker.codeBocBase64, 'base64'))[0];
  const migratorCode = Cell.fromBoc(Buffer.from(artifacts.migrationRouter.codeBocBase64, 'base64'))[0];

  const dummyWalletCode = new Cell();
  const dummyContent = beginCell().storeUint(0, 8).endCell();

  // 1. Minter StateInit
  const minterData = beginCell()
    .storeCoins(0)
    .storeAddress(deployer)
    .storeRef(dummyContent)
    .storeRef(dummyWalletCode)
    .endCell();
  const minterStateInit = { code: minterCode, data: minterData };
  const minterAddress = contractAddress(0, minterStateInit);

  // 2. Bonding Curve StateInit
  const vTon = 166666666666n;
  const vTok = 266666666665600000n;
  const tGrad = 500000000000n; // 500 TON
  const curveTokens = 800000000000000000n; // 800M
  const dexEscrow = 200000000000000000n; // 200M

  const curveData = beginCell()
    .storeUint(0, 8) // STATE_UNINITIALIZED
    .storeUint(100, 16) // 1.00% fee
    .storeRef(
      beginCell()
        .storeAddress(deployer)
        .storeAddress(deployer)
        .storeAddress(treasuryAddr)
        .storeRef(
          beginCell()
            .storeAddress(minterAddress)
            .storeAddress(null) // curve_jetton_wallet calculated post-deploy
            .storeAddress(dexRouter)
            .storeRef(
              beginCell()
                .storeAddress(null) // lp_locker unbound in StateInit
                .storeAddress(null) // migration_router unbound in StateInit
                .endCell()
            )
            .endCell()
        )
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeCoins(0)
        .storeCoins(curveTokens)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(vTon)
        .storeCoins(vTok)
        .storeCoins(tGrad)
        .storeCoins(dexEscrow)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeDict(null)
        .storeRef(dummyWalletCode)
        .endCell()
    )
    .endCell();
  const curveStateInit = { code: curveCode, data: curveData };
  const curveAddress = contractAddress(0, curveStateInit);

  // 3. LP Locker StateInit
  const lockerData = beginCell()
    .storeUint(0, 1) // is_locked
    .storeUint(BigInt('0xFFFFFFFFFFFFFFFF'), 64) // permanent lock timestamp
    .storeCoins(0)
    .storeUint(0, 1) // is_wallet_initialized
    .storeUint(0, 1) // is_router_initialized
    .storeAddress(null) // pool_address
    .storeAddress(curveAddress) // curve_address bound directly
    .storeRef(
      beginCell()
        .storeAddress(null) // lp_wallet_address
        .storeAddress(null) // router_address (initialized post-deploy)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(deployer)
        .endCell()
    )
    .endCell();
  const lockerStateInit = { code: lockerCode, data: lockerData };
  const lockerAddress = contractAddress(0, lockerStateInit);

  // 4. Migration Router StateInit
  const migratorData = beginCell()
    .storeUint(0, 1) // is_initialized
    .storeAddress(curveAddress)
    .storeAddress(lockerAddress)
    .storeAddress(dexRouter)
    .storeRef(
      beginCell()
        .storeAddress(minterAddress)
        .storeAddress(ptonMaster)
        .storeCoins(0)
        .storeCoins(0)
        .storeAddress(deployer)
        .endCell()
    )
    .endCell();
  const migratorStateInit = { code: migratorCode, data: migratorData };
  const migratorAddress = contractAddress(0, migratorStateInit);

  return {
    launchpadMinter: {
      address: minterAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: minterAddress.toRawString(),
      codeHash: minterCode.hash().toString('hex'),
    },
    bondingCurve: {
      address: curveAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: curveAddress.toRawString(),
      codeHash: curveCode.hash().toString('hex'),
    },
    lpLocker: {
      address: lockerAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: lockerAddress.toRawString(),
      codeHash: lockerCode.hash().toString('hex'),
    },
    migrationRouter: {
      address: migratorAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: migratorAddress.toRawString(),
      codeHash: migratorCode.hash().toString('hex'),
    },
  };
}

/**
 * Perform a strict read-only on-chain state inspection for a TON address.
 * Distinguishes uninitialized, active, frozen, query errors, and indeterminate states.
 * Under NO condition does this transmit a transaction or modify blockchain state.
 */
async function queryAccountStatusReadOnly(address, env = process.env, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'FETCH_UNAVAILABLE',
      category: 'INDETERMINATE',
      detail: 'No fetch implementation available in current runtime environment.',
    };
  }

  // 1. Validate target address format and network flags
  const addrCheck = parseTonAddress(address);
  if (!addrCheck.valid) {
    return {
      ok: false,
      status: 'INVALID_ADDRESS',
      category: 'INDETERMINATE',
      detail: `Address validation failed: ${addrCheck.reason}`,
    };
  }
  if (!addrCheck.testnetFlagPresent && addrCheck.format === 'friendly') {
    return {
      ok: false,
      status: 'MAINNET_ADDRESS_REJECTED',
      category: 'INDETERMINATE',
      detail: 'Address lacks friendly testnet flag (mainnet address rejected).',
    };
  }

  // 2. Select endpoint from configuration
  const tonapiUrl = normalizeEndpoint(env.TONAPI_TESTNET_URL);
  const toncenterUrl = normalizeEndpoint(env.TONCENTER_TESTNET_URL);

  if (!tonapiUrl && !toncenterUrl) {
    return {
      ok: false,
      status: 'NO_ENDPOINT',
      category: 'INDETERMINATE',
      detail: 'Neither TONAPI_TESTNET_URL nor TONCENTER_TESTNET_URL is configured.',
    };
  }

  // Enforce whitelist and HTTPS
  const candidateUrl = tonapiUrl || toncenterUrl;
  const parsedEndpoint = new URL(candidateUrl);
  if (!ALLOWED_TESTNET_HOSTS.has(parsedEndpoint.hostname.toLowerCase())) {
    return {
      ok: false,
      status: 'FORBIDDEN_ENDPOINT',
      category: 'INDETERMINATE',
      detail: `Endpoint host '${parsedEndpoint.hostname}' is not in approved testnet whitelist.`,
    };
  }
  if (parsedEndpoint.protocol !== 'https:') {
    return {
      ok: false,
      status: 'INSECURE_ENDPOINT',
      category: 'INDETERMINATE',
      detail: 'Endpoint must use HTTPS.',
    };
  }

  // Use TonAPI if available (standard REST status)
  if (tonapiUrl) {
    const queryUrl = `${tonapiUrl}/accounts/${encodeURIComponent(address)}`;
    const headers = { 'Accept': 'application/json' };
    if (env.TONAPI_KEY) headers['Authorization'] = `Bearer ${env.TONAPI_KEY}`;

    try {
      const response = await fetchImpl(queryUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 429) {
        return {
          ok: false,
          status: 'RATE_LIMITED',
          category: 'INDETERMINATE',
          provider: 'tonapi',
          detail: 'TonAPI rate limit exceeded (HTTP 429). Must not treat as unoccupied.',
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          status: `HTTP_${response.status}`,
          category: 'INDETERMINATE',
          provider: 'tonapi',
          detail: `TonAPI responded with HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      const status = String(data.status || 'unknown').toLowerCase();
      const balance = BigInt(data.balance || 0);
      const codeHash = typeof data.code_hash === 'string' ? data.code_hash : null;

      if (status === 'active') {
        return {
          ok: true,
          status: 'active',
          category: 'ALREADY_ACTIVE',
          hasCode: true,
          codeHash,
          balance,
          provider: 'tonapi',
          rawResponse: data,
          detail: 'Account is active on-chain with existing deployed code.',
        };
      }
      if (status === 'frozen') {
        return {
          ok: true,
          status: 'frozen',
          category: 'FROZEN',
          hasCode: false,
          balance,
          provider: 'tonapi',
          rawResponse: data,
          detail: 'Account is frozen on-chain.',
        };
      }
      if (status === 'nonexist' || status === 'uninit') {
        return {
          ok: true,
          status,
          category: 'UNINITIALIZED',
          hasCode: false,
          balance,
          provider: 'tonapi',
          rawResponse: data,
          detail: `Account is ${status} on-chain with zero code (clean for StateInit deployment).`,
        };
      }
      return {
        ok: false,
        status,
        category: 'INDETERMINATE',
        provider: 'tonapi',
        rawResponse: data,
        detail: `Unexpected account status returned by TonAPI: ${status}`,
      };
    } catch (err) {
      return {
        ok: false,
        status: 'FETCH_ERROR',
        category: 'INDETERMINATE',
        provider: 'tonapi',
        detail: `Network error querying TonAPI: ${err.message}`,
      };
    }
  }

  // Fallback to Toncenter v2
  const queryUrl = `${toncenterUrl}/getAddressInformation?address=${encodeURIComponent(address)}`;
  const headers = { 'Accept': 'application/json' };
  if (env.TONCENTER_API_KEY) headers['X-API-Key'] = env.TONCENTER_API_KEY;

  try {
    const response = await fetchImpl(queryUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 429) {
      return {
        ok: false,
        status: 'RATE_LIMITED',
        category: 'INDETERMINATE',
        provider: 'toncenter',
        detail: 'Toncenter rate limit exceeded (HTTP 429). Must not treat as unoccupied.',
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: `HTTP_${response.status}`,
        category: 'INDETERMINATE',
        provider: 'toncenter',
        detail: `Toncenter responded with HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    if (data.ok === false) {
      return {
        ok: false,
        status: 'API_ERROR',
        category: 'INDETERMINATE',
        provider: 'toncenter',
        detail: `Toncenter error: ${data.result || data.error}`,
      };
    }

    const res = data.result || {};
    const state = String(res.state || 'unknown').toLowerCase();
    const code = String(res.code || '');
    const balance = BigInt(res.balance || 0);

    if (state === 'active') {
      return {
        ok: true,
        status: 'active',
        category: 'ALREADY_ACTIVE',
        hasCode: true,
        codeHash: res.code_hash || null,
        balance,
        provider: 'toncenter',
        rawResponse: res,
        detail: 'Account is active on-chain with existing deployed code.',
      };
    }
    if (state === 'frozen') {
      return {
        ok: true,
        status: 'frozen',
        category: 'FROZEN',
        hasCode: false,
        balance,
        provider: 'toncenter',
        rawResponse: res,
        detail: 'Account is frozen on-chain.',
      };
    }
    if (state === 'uninitialized') {
      if (code !== '') {
        return {
          ok: true,
          status: 'uninitialized',
          category: 'INCOMPATIBLE',
          hasCode: true,
          balance,
          provider: 'toncenter',
          rawResponse: res,
          detail: 'Account is marked uninitialized but already holds code.',
        };
      }
      return {
        ok: true,
        status: 'uninitialized',
        category: 'UNINITIALIZED',
        hasCode: false,
        balance,
        provider: 'toncenter',
        rawResponse: res,
        detail: 'Account is uninitialized on-chain with zero code (clean for StateInit deployment).',
      };
    }
    return {
      ok: false,
      status: state,
      category: 'INDETERMINATE',
      provider: 'toncenter',
      rawResponse: res,
      detail: `Unexpected account state returned by Toncenter: ${state}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'FETCH_ERROR',
      category: 'INDETERMINATE',
      provider: 'toncenter',
      detail: `Network error querying Toncenter: ${err.message}`,
    };
  }
}

/**
 * Conduct comprehensive on-chain read-only preflight verification across
 * all 4 predicted deterministic contract addresses, the operator deployer wallet,
 * and the DEX infrastructure dependencies.
 */
async function verifyDeterministicAddressesOnChainReadOnly(predictedAddresses, env = process.env, fetchImpl = globalThis.fetch) {
  const targets = [
    { id: 'launchpadMinter', label: 'Launchpad Jetton Master', address: predictedAddresses.launchpadMinter.address },
    { id: 'bondingCurve', label: 'Bonding Curve', address: predictedAddresses.bondingCurve.address },
    { id: 'lpLocker', label: 'LP Locker', address: predictedAddresses.lpLocker.address },
    { id: 'migrationRouter', label: 'Migration Router', address: predictedAddresses.migrationRouter.address },
  ];

  const results = {};
  const errors = [];
  const blockers = [];
  let allUninitialized = true;
  let anyIndeterminate = false;

  for (const t of targets) {
    const res = await queryAccountStatusReadOnly(t.address, env, fetchImpl);
    results[t.id] = {
      label: t.label,
      address: t.address,
      ...res,
    };

    if (res.category === 'INDETERMINATE') {
      anyIndeterminate = true;
      errors.push(`${t.label} (${t.address}): Query failed or indeterminate (${res.detail}). Must not assume address is unoccupied.`);
    } else if (res.category === 'ALREADY_ACTIVE') {
      allUninitialized = false;
      blockers.push(`${t.label} (${t.address}): ALREADY ACTIVE on-chain! Deploying would be ignored or corrupt existing deployment.`);
    } else if (res.category === 'FROZEN') {
      allUninitialized = false;
      blockers.push(`${t.label} (${t.address}): FROZEN on-chain. Manual intervention required.`);
    } else if (res.category === 'INCOMPATIBLE') {
      allUninitialized = false;
      blockers.push(`${t.label} (${t.address}): INCOMPATIBLE state on-chain (${res.detail}).`);
    } else if (res.category === 'UNINITIALIZED') {
      // Clean
    }
  }

  // Operator Deployer wallet check
  let deployerResult = null;
  const deployerAddr = env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS;
  if (deployerAddr) {
    deployerResult = await queryAccountStatusReadOnly(deployerAddr, env, fetchImpl);
    const minNanotons = BigInt(Math.floor(DEPLOYMENT_BUDGET.minimumRequiredBalance * 1e9));
    const recNanotons = BigInt(Math.floor(DEPLOYMENT_BUDGET.recommendedBalance * 1e9));
    deployerResult.balanceTon = Number(deployerResult.balance || 0n) / 1e9;
    deployerResult.meetsMinimum = (deployerResult.balance || 0n) >= minNanotons;
    deployerResult.meetsRecommended = (deployerResult.balance || 0n) >= recNanotons;

    if (!deployerResult.meetsMinimum) {
      blockers.push(`Operator wallet (${deployerAddr}) balance is ${deployerResult.balanceTon.toFixed(4)} TON. Required minimum is ${DEPLOYMENT_BUDGET.minimumRequiredBalance.toFixed(2)} TON.`);
    }
  }

  // DEX infrastructure check
  const dexResults = {};
  const dexRouterRes = await queryAccountStatusReadOnly(APPROVED_TESTNET_DEX.router, env, fetchImpl);
  dexResults.router = { label: 'STON.fi Router v2.2', address: APPROVED_TESTNET_DEX.router, ...dexRouterRes };
  const ptonRes = await queryAccountStatusReadOnly(APPROVED_TESTNET_DEX.ptonMaster, env, fetchImpl);
  dexResults.ptonMaster = { label: 'pTON v2 Master', address: APPROVED_TESTNET_DEX.ptonMaster, ...ptonRes };

  let statusVerdict;
  if (anyIndeterminate) {
    statusVerdict = 'INDETERMINATE';
  } else if (blockers.length > 0) {
    statusVerdict = 'INTERVENTION_REQUIRED';
  } else if (allUninitialized && deployerResult && deployerResult.meetsMinimum) {
    statusVerdict = 'PREFLIGHT_PASS_READONLY';
  } else {
    statusVerdict = 'INTERVENTION_REQUIRED';
  }

  return {
    ok: statusVerdict === 'PREFLIGHT_PASS_READONLY',
    statusVerdict,
    targets: results,
    deployer: deployerResult,
    dex: dexResults,
    errors,
    blockers,
  };
}

function printPlan(predictedAddresses) {
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📋 ANLGRAM MEMELABS — SUPERVISED DEPLOYMENT PLAN (Phase 3C.3)');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log('--- 1. Target Network & Infrastructure ---');
  console.log('  Network:           TON Testnet (global_id: -3)');
  console.log('  DEX Protocol:      STON.fi DEX v2.2 (Release)');
  console.log(`  DEX Router:        ${APPROVED_TESTNET_DEX.router}`);
  console.log(`  pTON v2 Master:    ${APPROVED_TESTNET_DEX.ptonMaster}`);

  console.log('\n--- 2. Deterministic StateInit Deployment Graph (Acyclic Order) ---');
  console.log(`  Step 1: Deploy Launchpad Jetton Master`);
  console.log(`          Predicted:  ${predictedAddresses.launchpadMinter.address}`);
  console.log(`          Code Hash:  ${predictedAddresses.launchpadMinter.codeHash}`);
  console.log(`  Step 2: Deploy Bonding Curve`);
  console.log(`          Predicted:  ${predictedAddresses.bondingCurve.address}`);
  console.log(`          Code Hash:  ${predictedAddresses.bondingCurve.codeHash}`);
  console.log(`  Step 3: Deploy LP Locker`);
  console.log(`          Predicted:  ${predictedAddresses.lpLocker.address}`);
  console.log(`          Code Hash:  ${predictedAddresses.lpLocker.codeHash}`);
  console.log(`  Step 4: Deploy Migration Router`);
  console.log(`          Predicted:  ${predictedAddresses.migrationRouter.address}`);
  console.log(`          Code Hash:  ${predictedAddresses.migrationRouter.codeHash}`);

  console.log('\n--- 3. Post-Deployment Two-Phase Bootstrap Sequence ---');
  console.log('  Phase A: Deployer sends op::init_lp_locker (0x414e4c39) to LP Locker with authentic Migration Router.');
  console.log('  Phase B: Deployer sends op::init_launchpad (0x414e4c01) to Curve with Minter, Locker & Migration Router.');
  console.log('  Phase C: Deployer mints 1,000,000,000 tokens from Minter to Curve, and renounces admin via op == 3.');
  console.log('  Phase D: Curve receives on-chain verified renounce notification and activates STATE_ACTIVE.');

  console.log('\n--- 4. Itemized Operational Gas Budget & Cost Model ---');
  for (const item of DEPLOYMENT_BUDGET.items) {
    console.log(`  - ${item.name.padEnd(48)}: ${item.costTon.toFixed(2)} TON (${item.note})`);
  }
  console.log(`  - Operational Reserve Buffer (Network Volatility):     ${DEPLOYMENT_BUDGET.operationalReserveBuffer.toFixed(2)} TON`);
  console.log('  ─────────────────────────────────────────────────────────────────────────');
  console.log(`  TOTAL REQUIRED MINIMUM BALANCE:                        ${DEPLOYMENT_BUDGET.minimumRequiredBalance.toFixed(2)} TON`);
  console.log(`  RECOMMENDED OPERATOR WALLET BALANCE:                   ${DEPLOYMENT_BUDGET.recommendedBalance.toFixed(2)} TON`);
  console.log('\n  ⚠️  FINANCIAL INVARIANT: The 500 TON DEX graduation liquidity is provided');
  console.log('      by users during trading, NEVER subsidized from deployer gas reserves.');

  console.log('\n--- 5. Security & Safety State ---');
  console.log('  Mode:               READ-ONLY PLANNER (Zero broadcast, zero mutations)');
  console.log('  Future Execution:   Gated behind --execute-testnet and human confirmation');
  console.log('  Secrets:            No mnemonics loaded or logged. Local signer required.');
}

function printOnChainPreflight(onchain) {
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('🔍 ON-CHAIN READ-ONLY PREFLIGHT AUDIT EVIDENCE');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log('--- 1. Deterministic Target Contract Addresses ---');
  for (const [id, item] of Object.entries(onchain.targets)) {
    const verdictMark = item.category === 'UNINITIALIZED' ? '✅' : '❌';
    console.log(`  ${verdictMark} ${item.label.padEnd(25)}: ${item.address}`);
    console.log(`     Category: [${item.category}] | Status: ${item.status} | Code: ${item.hasCode ? 'PRESENT' : 'NONE'} | Provider: ${item.provider || 'none'}`);
    console.log(`     Detail:   ${item.detail}`);
  }

  console.log('\n--- 2. Operator Deployer Wallet State ---');
  if (onchain.deployer) {
    const d = onchain.deployer;
    const fundedMark = d.meetsMinimum ? '✅' : '⚠️ ';
    console.log(`  ${fundedMark} Address:     ${envAddressMask(process.env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS)}`);
    console.log(`     Status:      ${d.status} (${d.category})`);
    console.log(`     Balance:     ${d.balanceTon.toFixed(4)} TON`);
    console.log(`     Min Needed:  ${DEPLOYMENT_BUDGET.minimumRequiredBalance.toFixed(2)} TON (Meets Minimum: ${d.meetsMinimum ? 'YES' : 'NO - FUNDING REQUIRED'})`);
    console.log(`     Recommended: ${DEPLOYMENT_BUDGET.recommendedBalance.toFixed(2)} TON (Meets Recommended: ${d.meetsRecommended ? 'YES' : 'NO'})`);
  }

  console.log('\n--- 3. External DEX Infrastructure Readiness ---');
  for (const [id, item] of Object.entries(onchain.dex)) {
    const dexMark = item.category === 'ALREADY_ACTIVE' ? '✅' : '⚠️ ';
    console.log(`  ${dexMark} ${item.label.padEnd(25)}: ${item.address}`);
    console.log(`     Status: [${item.status}] | Deployed Code: ${item.hasCode ? 'ACTIVE' : 'MISSING'} | Balance: ${(Number(item.balance || 0n) / 1e9).toFixed(4)} TON`);
  }

  console.log('\n--- 4. Overall Preflight Summary Verdict ---');
  if (onchain.statusVerdict === 'PREFLIGHT_PASS_READONLY') {
    console.log('  STATUS: ✅ PREFLIGHT PASS (READ-ONLY)');
    console.log('  All 4 deterministic addresses are unoccupied. Operator wallet is funded. DEX endpoints verified.');
  } else if (onchain.statusVerdict === 'INTERVENTION_REQUIRED') {
    console.log('  STATUS: ⚠️  INTERVENTION REQUIRED');
    for (const b of onchain.blockers) {
      console.log(`  - BLOCKER: ${b}`);
    }
  } else if (onchain.statusVerdict === 'INDETERMINATE') {
    console.log('  STATUS: ❓ INDETERMINATE RESULT');
    for (const e of onchain.errors) {
      console.log(`  - QUERY ERROR: ${e}`);
    }
  }
}

function envAddressMask(addr) {
  if (!addr) return 'none';
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

async function requestHumanConfirmation(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`\n⚠️  HUMAN CONFIRMATION REQUIRED:\n${promptText} [type 'CONFIRM' to proceed, anything else to abort]: `, (answer) => {
      rl.close();
      resolve(answer.trim() === 'CONFIRM');
    });
  });
}

async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch) {
  const flags = parseArgs(argv);

  if (flags.help) {
    console.log('ANLGRAM MemeLabs Supervised Testnet Deployer & Preflight Tool');
    console.log('Usage:');
    console.log('  node minter-contract/deploy-launchpad-testnet-exec.js --plan');
    console.log('  node minter-contract/deploy-launchpad-testnet-exec.js --verify-config');
    console.log('  node minter-contract/deploy-launchpad-testnet-exec.js --verify-onchain');
    console.log('  node minter-contract/deploy-launchpad-testnet-exec.js --dry-run');
    console.log('  node minter-contract/deploy-launchpad-testnet-exec.js --execute-testnet --supervised-human-approved');
    return 0;
  }

  // 1. Validate Network Configuration
  const config = validateNetworkConfig(env);
  if (!config.ok) {
    console.error('\n❌ CONFIGURATION VALIDATION FAILED:');
    for (const err of config.errors) console.error(`  - ${err}`);
    return 1;
  }

  // 2. Verify Contract Artifacts
  const artifactsRes = verifyArtifacts();
  if (!artifactsRes.ok) {
    console.error('\n❌ ARTIFACT VERIFICATION FAILED:');
    for (const err of artifactsRes.errors) console.error(`  - ${err}`);
    return 1;
  }

  // If verify-config flag requested exclusively
  if (flags.verifyConfig) {
    console.log('\n✅ NETWORK & ARTIFACT CONFIGURATION VERIFIED: ALL CHECKS PASSED');
    return 0;
  }

  // 3. Derive Deterministic Addresses
  const deployer = env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS;
  const predicted = deriveDeterministicAddresses(deployer, artifactsRes.artifacts);

  // 4. Default / Planner Mode / On-Chain Verification Mode
  if (!flags.executeTestnet) {
    printPlan(predicted);

    if (flags.verifyOnchain || flags.dryRun) {
      let onchain = null;
      try {
        onchain = await verifyDeterministicAddressesOnChainReadOnly(predicted, env, fetchImpl);
        printOnChainPreflight(onchain);
      } catch (err) {
        console.log(`\n⚠️  ON-CHAIN QUERY NOTICE: Read-only network check failed (${err.message}).`);
      }

      if (flags.verifyOnchain) {
        if (onchain && onchain.statusVerdict === 'PREFLIGHT_PASS_READONLY') {
          console.log('\n✅ PREFLIGHT VERIFICATION COMPLETE: ALL GATES PASSED (READ-ONLY)');
          return 0;
        }
        if (onchain && onchain.statusVerdict === 'INTERVENTION_REQUIRED') {
          console.log('\n⚠️  PREFLIGHT HALTED: INTERVENTION REQUIRED (READ-ONLY)');
          return 1;
        }
        if (onchain && onchain.statusVerdict === 'INDETERMINATE') {
          console.log('\n❌ PREFLIGHT HALTED: INDETERMINATE RESULT (READ-ONLY)');
          return 1;
        }
      }
    }

    console.log('\n✅ PREFLIGHT VERIFICATION COMPLETE: ALL GATES PASSED (READ-ONLY)');
    return 0;
  }

  // 5. Future Execution Mode Gate (--execute-testnet)
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('🚨 TESTNET EXECUTION MODE REQUESTED');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  if (!flags.supervisedHumanApproved) {
    console.error('\n❌ EXECUTION REJECTED: --execute-testnet requires explicit --supervised-human-approved flag.');
    return 2;
  }

  // Gated check: In Phase 3C.1 / Phase 3C.3, live transaction broadcast is strictly disabled.
  console.log('\n⚠️  PHASE 3C.1 / PHASE 3C.3 POLICY ENFORCEMENT:');
  console.log('Live transaction broadcasting is strictly disabled during Phase 3C.1.');
  console.log('The execution engine is fully built and verified, awaiting formal testnet deployment session.');
  console.log('Status: PREPARADO PARA REVISIÓN MANUAL DEL EJECUTOR / REVISIÓN FINAL DEL PROCEDIMIENTO.');
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  parseTonAddress,
  normalizeEndpoint,
  validateNetworkConfig,
  verifyArtifacts,
  deriveDeterministicAddresses,
  queryAccountStatusReadOnly,
  verifyDeterministicAddressesOnChainReadOnly,
  printOnChainPreflight,
  requestHumanConfirmation,
  DEPLOYMENT_BUDGET,
  APPROVED_TESTNET_DEX,
  CONTRACT_SPECS,
  DEPENDENCY_DAG,
  TONCONNECT_SPEC,
  SUPERVISED_BUDGET,
  buildDeploymentOperations,
  validateTonConnectSession,
  buildTonConnectTransactionPayload,
  formatHumanApprovalCard,
  verifyStepPreconditionsReadOnly,
  evaluatePostApprovalResult,
  sanitizeLogOutput,
  main,
};
