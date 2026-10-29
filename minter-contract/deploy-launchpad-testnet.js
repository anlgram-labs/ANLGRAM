#!/usr/bin/env node
'use strict';

/**
 * ANLGRAM Phase 3A — testnet deployment preflight planner.
 *
 * SAFETY: This version has NO transaction-signing, wallet derivation, or
 * transaction-broadcast code. It validates local artifacts/configuration and
 * reports whether a safe deployment plan can be derived. The current reported
 * contract graph contains unresolved circular immutable-address dependencies,
 * so this tool deliberately fails closed instead of inventing StateInit data.
 *
 * Usage from the repository root or minter-contract directory:
 *   node minter-contract/deploy-launchpad-testnet.js --verify-config
 *   node minter-contract/deploy-launchpad-testnet.js --show-plan
 *   node minter-contract/deploy-launchpad-testnet.js --dry-run
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const BASELINE_COMMIT = '94b225587c9b55535df1d02716641b166271171d';
const EXPECTED_BRANCH = 'feature/launchpad-engine';
const EXPECTED_GLOBAL_ID = '-3';

const CONTRACTS = [
  {
    id: 'launchpadMinter',
    label: 'Launchpad Jetton Master',
    source: 'contracts/anlgram-launchpad-jetton-minter.fc',
    artifact: 'build/anlgram-launchpad-jetton-minter.compiled.json',
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
  {
    id: 'bondingCurve',
    label: 'Bonding Curve',
    source: 'contracts/anlgram-bonding-curve.fc',
    artifact: 'build/anlgram-bonding-curve.compiled.json',
  },
];

const PROTECTED_PATHS = [
  'index.html', 'assets/css/styles.css', 'assets/js/app.js', 'assets/js/wallet.js',
  'assets/js/security.js', 'assets/js/analytics.js', 'assets/js/staking.js',
  'assets/js/vesting.js', 'assets/js/token-creator.js', 'assets/js/pnl-chart.js',
  'assets/js/portfolio.js', 'assets/js/ton-connect-ui.js', 'cloudflare-worker.js',
  'minter-contract/contracts/jetton-minter.fc',
  'minter-contract/contracts/jetton-wallet.fc',
  'minter-contract/contracts/op-codes.fc', 'minter-contract/contracts/params.fc',
  'minter-contract/contracts/stdlib.fc',
  'minter-contract/build/jetton-minter.compiled.json',
  'minter-contract/build/jetton-wallet.compiled.json',
];

// Remediated deployment dependency graph:
// 1. launchpadMinter: zero dependencies; deployed first.
// 2. bondingCurve: depends only on launchpadMinter; deployed in STATE_UNINITIALIZED
//    with addr_none for lp_locker and migration_router.
// 3. lpLocker: depends only on bondingCurve; stores curve_address directly, with
//    router_address initially addr_none.
// 4. migrationRouter: depends on launchpadMinter, bondingCurve, and lpLocker;
//    stores all three authentic addresses in initial StateInit.
// Acyclic bootstrap: post-deployment, Deployer sends one-time authorized messages:
//   - op::init_lp_locker (0x414e4c39) to LP Locker configuring Migration Router.
//   - op::init_launchpad (0x414e4c01) to Curve configuring LP Locker & Migration Router.
const DEPENDENCY_GRAPH = {
  launchpadMinter: [],
  bondingCurve: ['launchpadMinter'],
  lpLocker: ['bondingCurve'],
  migrationRouter: ['launchpadMinter', 'bondingCurve', 'lpLocker'],
};

const RESOLVED_BOOTSTRAP_MECHANISMS = [
  {
    id: 'RESOLVED_CURVE_MIGRATION_ROUTER',
    nodes: ['bondingCurve', 'migrationRouter'],
    message: 'Curve initial StateInit sets lp_locker and migration_router to addr_none. Post-deployment, authorized one-time op::init_launchpad (0x414e4c01) configures authentic addresses and transitions state from STATE_UNINITIALIZED to STATE_INITIALIZING.',
  },
  {
    id: 'RESOLVED_MIGRATION_ROUTER_LP_LOCKER',
    nodes: ['migrationRouter', 'lpLocker'],
    message: 'LP Locker initial StateInit sets router_address to addr_none and stores curve_address directly. Post-deployment, authorized one-time op::init_lp_locker (0x414e4c39) by admin configures authentic Migration Router address. Migration Router stores authentic lp_locker_address directly in StateInit.',
  },
];

const KNOWN_BOOTSTRAP_BLOCKERS = [];

function parseArgs(argv) {
  const allowed = new Set(['--verify-config', '--show-plan', '--dry-run', '--verify-dex-readonly', '--help']);
  const out = { verifyConfig: false, showPlan: false, dryRun: false, verifyDexReadonly: false, help: false };
  for (const arg of argv) {
    if (!allowed.has(arg)) {
      throw new Error(`Unsupported option: ${arg}. This Phase 3A script does not implement deployment or broadcasting.`);
    }
    if (arg === '--verify-config') out.verifyConfig = true;
    if (arg === '--show-plan') out.showPlan = true;
    if (arg === '--dry-run') out.dryRun = true;
    if (arg === '--verify-dex-readonly') out.verifyDexReadonly = true;
    if (arg === '--help') out.help = true;
  }
  if (!out.help && !out.verifyConfig && !out.showPlan && !out.dryRun && !out.verifyDexReadonly) {
    throw new Error('Specify at least one safe mode: --verify-config, --show-plan, or --dry-run.');
  }
  return out;
}

function normalizeEndpoint(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isTestnetEndpoint(value, provider) {
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (provider === 'toncenter') {
    return host === 'testnet.toncenter.com' && u.pathname.replace(/\/+$/, '').startsWith('/api/v2');
  }
  if (provider === 'tonapi') {
    return host === 'testnet.tonapi.io' && u.pathname.replace(/\/+$/, '').startsWith('/v2');
  }
  return false;
}

function crc16Xmodem(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function parseTonAddressForTestnet(value) {
  const text = String(value || '').trim();
  if (/^0:[0-9a-fA-F]{64}$/.test(text) || /^-1:[0-9a-fA-F]{64}$/.test(text)) {
    return { valid: true, format: 'raw', testnetFlagPresent: false, workchain: Number(text.split(':')[0]) };
  }
  if (!/^[A-Za-z0-9_-]{48}$/.test(text)) return { valid: false, reason: 'Expected a 48-character TON friendly address or raw workchain:hash address.' };
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(normalized, 'base64');
  if (bytes.length !== 36) return { valid: false, reason: 'Friendly address decoded to an invalid byte length.' };
  const expected = crc16Xmodem(bytes.subarray(0, 34));
  const actual = bytes.readUInt16BE(34);
  if (expected !== actual) return { valid: false, reason: 'Friendly address CRC16 checksum mismatch.' };
  const tag = bytes[0];
  return {
    valid: true,
    format: 'friendly',
    testnetFlagPresent: (tag & 0x80) !== 0,
    workchain: bytes.readInt8(1),
    bounceable: (tag & 0x40) === 0,
  };
}

function validateRequiredTestnetAddress(name, value, errors) {
  if (!value) { errors.push(`${name} is missing.`); return; }
  const parsed = parseTonAddressForTestnet(value);
  if (!parsed.valid) { errors.push(`${name} is invalid: ${parsed.reason}`); return; }
  if (parsed.format === 'raw') errors.push(`${name} uses a raw address without a friendly testnet-only flag; network identity is not encoded in raw addresses.`);
  else if (!parsed.testnetFlagPresent) errors.push(`${name} friendly address lacks the testnet-only flag.`);
}

function validateNetworkConfig(env = process.env) {
  const errors = [];
  const warnings = [];
  if (env.TON_NETWORK !== 'testnet') errors.push('TON_NETWORK must be explicitly set to testnet.');
  if (String(env.TON_GLOBAL_ID || '') !== EXPECTED_GLOBAL_ID) errors.push(`TON_GLOBAL_ID must equal ${EXPECTED_GLOBAL_ID}.`);

  const center = normalizeEndpoint(env.TONCENTER_TESTNET_URL);
  const api = normalizeEndpoint(env.TONAPI_TESTNET_URL);
  if (!center) errors.push('TONCENTER_TESTNET_URL is missing.');
  else if (!isTestnetEndpoint(center, 'toncenter')) errors.push('TONCENTER_TESTNET_URL is not a valid HTTPS TON Center testnet v2 endpoint.');
  if (!api) errors.push('TONAPI_TESTNET_URL is missing.');
  else if (!isTestnetEndpoint(api, 'tonapi')) errors.push('TONAPI_TESTNET_URL is not a valid HTTPS TONAPI testnet v2 endpoint.');

  // Public deployment identity only. Never load a mnemonic in any preflight mode.
  validateRequiredTestnetAddress('ANLGRAM_TESTNET_DEPLOYER_ADDRESS', env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS, errors);
  validateRequiredTestnetAddress('STONFI_TESTNET_ROUTER', env.STONFI_TESTNET_ROUTER, errors);
  validateRequiredTestnetAddress('STONFI_TESTNET_PTON_MASTER', env.STONFI_TESTNET_PTON_MASTER, errors);

  // A preflight must never load TESTNET_DEPLOYER_MNEMONIC. Presence is not
  // necessary and its value is deliberately never read or reported.
  return { ok: errors.length === 0, errors, warnings };
}

function git(repoRoot, args) {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', windowsHide: true });
  if (r.error) return { ok: false, error: r.error.message, stdout: '', stderr: '' };
  return { ok: r.status === 0, code: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function inspectRepository(repoRoot = REPO_ROOT) {
  const root = git(repoRoot, ['rev-parse', '--show-toplevel']);
  const branch = git(repoRoot, ['branch', '--show-current']);
  const head = git(repoRoot, ['log', '-1', '--format=%H %s']);
  const status = git(repoRoot, ['status', '--short', '--untracked-files=all']);
  const remote = git(repoRoot, ['branch', '-vv']);
  const protectedDiff = git(repoRoot, ['diff', '--name-only', BASELINE_COMMIT, '--', ...PROTECTED_PATHS]);
  return {
    gitAvailable: root.ok,
    root: root.ok ? root.stdout : null,
    branch: branch.ok ? branch.stdout : null,
    head: head.ok ? head.stdout : null,
    status: status.ok ? status.stdout : null,
    branches: remote.ok ? remote.stdout : null,
    protectedDiffPaths: protectedDiff.ok ? protectedDiff.stdout.split('\n').filter(Boolean) : null,
    errors: [root, branch, head, status, remote, protectedDiff].filter(x => !x.ok).map(x => x.stderr || x.error || 'Git inspection failed'),
  };
}

function artifactChecksumsFromJson(artifactPath, tonCore) {
  const data = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  if (!data.codeBocBase64) throw new Error(`Artifact lacks codeBocBase64: ${artifactPath}`);
  const decoded = Buffer.from(data.codeBocBase64, 'base64');
  if (!decoded.length) throw new Error(`Artifact contains an empty BOC: ${artifactPath}`);
  const cells = tonCore.Cell.fromBoc(decoded);
  if (!Array.isArray(cells) || cells.length !== 1) throw new Error(`Expected exactly one code cell in ${artifactPath}`);
  const codeCell = cells[0];
  const canonicalBoc = codeCell.toBoc();
  return {
    codeCellHash: codeCell.hash().toString('hex'),
    bocFileSha256: crypto.createHash('sha256').update(canonicalBoc).digest('hex'),
    bocSizeBytes: canonicalBoc.length,
    artifactCodeCellHash: String(data.codeCellHash || data.codeHash || '').toLowerCase(),
    artifactBocSha256: String(data.bocFileSha256 || '').toLowerCase(),
    artifact: data,
  };
}

async function compileSourceInMemory(sourcePath, tonCore, funcCompiler) {
  const contractsDir = path.join(SCRIPT_DIR, 'contracts');
  const sources = filePath => {
    let absPath;
    if (filePath.startsWith('/') || filePath.includes(':')) absPath = filePath;
    else absPath = path.join(contractsDir, filePath);
    if (!fs.existsSync(absPath)) throw new Error(`FunC include/source not found: ${absPath}`);
    return fs.readFileSync(absPath, 'utf8');
  };
  const result = await funcCompiler.compileFunc({ targets: [path.basename(sourcePath)], sources });
  if (result.status === 'error') throw new Error(result.message || `FunC compilation failed: ${sourcePath}`);
  const codeCell = tonCore.Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  const canonicalBoc = codeCell.toBoc();
  return {
    codeCellHash: codeCell.hash().toString('hex'),
    bocFileSha256: crypto.createHash('sha256').update(canonicalBoc).digest('hex'),
    bocSizeBytes: canonicalBoc.length,
  };
}

async function verifyContractArtifacts({ compile = true } = {}) {
  let tonCore;
  let funcCompiler;
  try {
    tonCore = require('@ton/core');
    if (compile) funcCompiler = require('@ton-community/func-js');
  } catch (e) {
    throw new Error(`Required local dependency is unavailable; install/use the repository's existing minter-contract dependencies. Details: ${e.message}`);
  }

  const results = [];
  const errors = [];
  for (const c of CONTRACTS) {
    const sourcePath = path.join(SCRIPT_DIR, c.source);
    const artifactPath = path.join(SCRIPT_DIR, c.artifact);
    if (!fs.existsSync(sourcePath)) {
      errors.push(`${c.label}: source missing (${c.source})`);
      continue;
    }
    if (!fs.existsSync(artifactPath)) {
      errors.push(`${c.label}: compiled artifact missing (${c.artifact})`);
      continue;
    }
    try {
      const art = artifactChecksumsFromJson(artifactPath, tonCore);
      const sourceCompile = compile ? await compileSourceInMemory(sourcePath, tonCore, funcCompiler) : null;
      const row = {
        id: c.id,
        label: c.label,
        source: c.source,
        artifact: c.artifact,
        artifactCodeCellHash: art.artifactCodeCellHash,
        computedArtifactCodeCellHash: art.codeCellHash,
        artifactBocSha256: art.artifactBocSha256,
        computedArtifactBocSha256: art.bocFileSha256,
        bocSizeBytes: art.bocSizeBytes,
        sourceCompile,
        artifactMatchesStoredHashes: art.codeCellHash === art.artifactCodeCellHash && (!art.artifactBocSha256 || art.bocFileSha256 === art.artifactBocSha256),
        sourceMatchesArtifact: sourceCompile ? sourceCompile.codeCellHash === art.codeCellHash && sourceCompile.bocFileSha256 === art.bocFileSha256 : null,
      };
      if (!row.artifactMatchesStoredHashes) errors.push(`${c.label}: serialized artifact does not match its recorded code-cell hash / BOC SHA-256.`);
      if (row.sourceMatchesArtifact === false) errors.push(`${c.label}: source compiles to a different artifact than the committed compiled JSON.`);
      results.push(row);
    } catch (e) {
      errors.push(`${c.label}: ${e.message}`);
    }
  }
  return { ok: errors.length === 0 && results.length === CONTRACTS.length && results.every(r => r.sourceMatchesArtifact !== false), results, errors };
}

function findCycles(graph) {
  const nodes = Object.keys(graph);
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const found = [];
  const seen = new Set();

  function canonicalCycle(cycle) {
    const body = cycle.slice(0, -1);
    const rotations = body.map((_, i) => body.slice(i).concat(body.slice(0, i)).join('->'));
    return rotations.sort()[0];
  }
  function dfs(node) {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      if (idx >= 0) {
        const cyc = stack.slice(idx).concat(node);
        const key = canonicalCycle(cyc);
        if (!seen.has(key)) { seen.add(key); found.push(cyc); }
      }
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node); stack.push(node);
    for (const dep of (graph[node] || [])) if (graph[dep]) dfs(dep);
    stack.pop(); visiting.delete(node); visited.add(node);
  }
  for (const n of nodes) dfs(n);
  return found;
}

function dependencyReadiness() {
  const cycles = findCycles(DEPENDENCY_GRAPH);
  const blockers = KNOWN_BOOTSTRAP_BLOCKERS.map(b => ({ ...b }));
  return {
    ready: cycles.length === 0 && blockers.length === 0,
    cycles,
    blockers,
    graph: DEPENDENCY_GRAPH,
    resolvedMechanisms: RESOLVED_BOOTSTRAP_MECHANISMS,
  };
}

function tonToNano(tonString) {
  if (typeof tonString !== 'string' || !/^\d+(?:\.\d{1,9})?$/.test(tonString)) {
    throw new Error(`Invalid TON decimal string: ${tonString}`);
  }
  const [whole, fraction = ''] = tonString.split('.');
  return BigInt(whole) * 1000000000n + BigInt((fraction + '000000000').slice(0, 9));
}

async function verifyDexAccountsReadOnly(env = process.env, fetchImpl = globalThis.fetch) {
  const config = validateNetworkConfig(env);
  if (!config.ok) return { ok: false, checks: [], errors: config.errors };
  const base = normalizeEndpoint(env.TONAPI_TESTNET_URL);
  const headers = { accept: 'application/json' };
  if (env.TONAPI_KEY) headers.authorization = `Bearer ${env.TONAPI_KEY}`;
  const targets = [
    { role: 'STON.fi Router', address: env.STONFI_TESTNET_ROUTER, expectedInterface: 'stonfi_router_v2' },
    { role: 'pTON Jetton Master', address: env.STONFI_TESTNET_PTON_MASTER, expectedInterface: 'jetton_master' },
  ];
  const checks = [];
  const errors = [];
  for (const target of targets) {
    try {
      const url = `${base}/accounts/${encodeURIComponent(target.address)}`;
      const response = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const interfaces = Array.isArray(data.interfaces) ? data.interfaces.map(String) : [];
      const status = String(data.status || 'unknown').toLowerCase();
      const active = status === 'active';
      const interfaceMatch = interfaces.some(x => x.toLowerCase().includes(target.expectedInterface));
      const row = {
        role: target.role,
        address: target.address,
        status,
        interfaces,
        active,
        interfaceMatch,
        codeHashReported: typeof data.code_hash === 'string' ? data.code_hash : null,
        result: active && interfaceMatch ? 'PARTIAL_PASS' : 'FAIL',
        caveat: 'Account state/interface is a read-only provider claim; official source/code-hash equivalence and full protocol compatibility are not proven by this request alone.',
      };
      checks.push(row);
      if (!active) errors.push(`${target.role} is not reported active (status=${status}).`);
      if (!interfaceMatch) errors.push(`${target.role} does not expose the expected interface tag ${target.expectedInterface}.`);
    } catch (e) {
      errors.push(`${target.role} read-only check failed: ${e.message}`);
      checks.push({ role: target.role, address: target.address, result: 'UNVERIFIED', error: e.message });
    }
  }
  return { ok: errors.length === 0, checks, errors };
}

function printHelp() {
  console.log(`ANLGRAM Phase 3A testnet preflight (read-only; no deploy implementation)\n\nUsage:\n  node minter-contract/deploy-launchpad-testnet.js --verify-config\n  node minter-contract/deploy-launchpad-testnet.js --show-plan\n  node minter-contract/deploy-launchpad-testnet.js --dry-run\n  node minter-contract/deploy-launchpad-testnet.js --verify-dex-readonly\n\nNo option in this version signs or broadcasts a transaction.\n`);
}

function printRepoSummary(repo) {
  console.log('\n[Repository]');
  console.log(`Root: ${repo.root || 'UNVERIFIED'}`);
  console.log(`Branch: ${repo.branch || 'UNVERIFIED'}`);
  console.log(`HEAD: ${repo.head || 'UNVERIFIED'}`);
  console.log(`Working tree: ${repo.status === '' ? 'clean' : (repo.status || 'UNVERIFIED')}`);
  if (repo.errors.length) for (const e of repo.errors) console.log(`Git inspection warning: ${e}`);
  if (repo.protectedDiffPaths && repo.protectedDiffPaths.length) {
    console.log('Protected baseline diff paths:');
    for (const p of repo.protectedDiffPaths) console.log(`  - ${p}`);
  } else if (repo.protectedDiffPaths) {
    console.log(`Protected files differ from baseline: 0 paths (baseline ${BASELINE_COMMIT})`);
  }
  if (repo.branch && repo.branch !== EXPECTED_BRANCH) console.log(`BLOCKER: expected branch ${EXPECTED_BRANCH}.`);
}

function printDependencySummary(readiness) {
  console.log('\n[Deployment Dependency Analysis]');
  for (const [node, deps] of Object.entries(readiness.graph)) {
    console.log(`- ${node} depends on: ${deps.length ? deps.join(', ') : '(no stored-address dependencies)'}`);
  }
  if (readiness.cycles.length) {
    console.log('Circular address dependencies detected:');
    for (const c of readiness.cycles) console.log(`  - ${c.join(' -> ')}`);
  } else {
    console.log('Circular address dependencies: NONE (Strict Directed Acyclic Graph - DAG verified)');
  }
  for (const b of readiness.blockers) console.log(`BLOCKER ${b.id}: ${b.message}`);
  for (const m of (readiness.resolvedMechanisms || [])) console.log(`RESOLVED ${m.id}: ${m.message}`);
}

function printArtifactSummary(result) {
  console.log('\n[Compiled Artifact Verification]');
  for (const r of result.results) {
    console.log(`- ${r.label}`);
    console.log(`  Code Cell Hash: ${r.computedArtifactCodeCellHash}`);
    console.log(`  BOC SHA-256: ${r.computedArtifactBocSha256}`);
    console.log(`  BOC bytes: ${r.bocSizeBytes}`);
    console.log(`  Artifact metadata consistency: ${r.artifactMatchesStoredHashes ? 'PASS' : 'FAIL'}`);
    console.log(`  Current source matches artifact: ${r.sourceMatchesArtifact === true ? 'PASS' : r.sourceMatchesArtifact === false ? 'FAIL' : 'NOT RUN'}`);
  }
  for (const e of result.errors) console.log(`ERROR: ${e}`);
}

async function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) { console.error(`ERROR: ${e.message}`); return 2; }
  if (args.help) { printHelp(); return 0; }

  console.log('ANLGRAM Phase 3A — TESTNET PREFLIGHT ONLY');
  console.log('Transaction signing: DISABLED');
  console.log('Transaction broadcast: NOT IMPLEMENTED');
  console.log('Mnemonic loading: DISABLED');

  const repo = inspectRepository(REPO_ROOT);
  printRepoSummary(repo);
  const readiness = dependencyReadiness();
  if (args.showPlan || args.dryRun) printDependencySummary(readiness);

  let configResult = null;
  if (args.verifyConfig || args.dryRun) {
    configResult = validateNetworkConfig(env);
    console.log('\n[Network Configuration]');
    console.log(`TON_NETWORK: ${env.TON_NETWORK || 'MISSING'}`);
    console.log(`TON_GLOBAL_ID: ${env.TON_GLOBAL_ID || 'MISSING'}`);
    console.log(`TONCENTER_TESTNET_URL: ${env.TONCENTER_TESTNET_URL ? normalizeEndpoint(env.TONCENTER_TESTNET_URL) : 'MISSING'}`);
    console.log(`TONAPI_TESTNET_URL: ${env.TONAPI_TESTNET_URL ? normalizeEndpoint(env.TONAPI_TESTNET_URL) : 'MISSING'}`);
    console.log(`Deployer public address configured: ${Boolean(env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS)}`);
    console.log(`STON.fi Router configured: ${Boolean(env.STONFI_TESTNET_ROUTER)}`);
    console.log(`pTON Master configured: ${Boolean(env.STONFI_TESTNET_PTON_MASTER)}`);
    console.log('Mnemonic inspected: NO');
    for (const w of configResult.warnings) console.log(`WARNING: ${w}`);
    for (const e of configResult.errors) console.log(`ERROR: ${e}`);
  }

  let artifacts = null;
  if (args.showPlan || args.dryRun) {
    try {
      artifacts = await verifyContractArtifacts({ compile: true });
      printArtifactSummary(artifacts);
    } catch (e) {
      console.error(`Artifact verification error: ${e.message}`);
      artifacts = { ok: false, results: [], errors: [e.message] };
    }
  }

  if (args.showPlan || args.dryRun) {
    console.log('\n[Deployment Plan]');
    if (readiness.ready) {
      console.log('Topological Deployment Order:');
      console.log('  1. Launchpad Jetton Master (contracts/anlgram-launchpad-jetton-minter.fc)');
      console.log('  2. Bonding Curve (contracts/anlgram-bonding-curve.fc)');
      console.log('  3. LP Locker (contracts/anlgram-lp-locker.fc)');
      console.log('  4. Migration Router (contracts/anlgram-migration-router.fc)');
      console.log('\nPost-Deployment Bootstrap Sequence (One-Time Authorized Operations):');
      console.log('  Step 1: Deployer calls op::init_lp_locker (0x414e4c39) on LP Locker with Migration Router address.');
      console.log('  Step 2: Deployer calls op::init_launchpad (0x414e4c01) on Bonding Curve with Minter, Locker & Router addresses.');
      console.log('  Step 3: Deployer mints 1,000,000,000 tokens from Minter to Curve, triggering automatic admin renounce to addr_none.');
      console.log('  Step 4: Curve receives admin_changed_notification and transitions to STATE_ACTIVE (trading enabled).');
      console.log('Funding estimate: Minimum ~2.5 TON testnet recommended for initial contract state storage rent and bootstrap messages.');
    } else {
      for (const c of CONTRACTS) console.log(`- ${c.label}: ${c.source} -> ${c.artifact}`);
      console.log('Predicted addresses: NOT CALCULATED — initial StateInit dependency cycles are unresolved.');
      console.log('Deployment order: BLOCKED — do not deploy contracts until immutable-address cycles are removed or an audited bootstrap sequence is implemented.');
      console.log('Funding estimate: NOT CERTIFIED — deployment/state-init dependencies and actual message costs are not resolved.');
    }
  }

  let dexReadResult = null;
  if (args.verifyDexReadonly) {
    dexReadResult = await verifyDexAccountsReadOnly(env);
    console.log('\n[Read-only live DEX account checks]');
    for (const check of dexReadResult.checks) {
      console.log(`- ${check.role}: ${check.result}${check.status ? ` (status=${check.status})` : ''}`);
      if (check.codeHashReported) console.log(`  Provider-reported code hash: ${check.codeHashReported}`);
      console.log(`  Limitation: ${check.caveat || check.error || 'Account could not be fully verified.'}`);
    }
    for (const e of dexReadResult.errors) console.log(`ERROR: ${e}`);
  }

  const hardBlockers = [];
  if (repo.branch && repo.branch !== EXPECTED_BRANCH) hardBlockers.push(`Wrong branch: ${repo.branch}`);
  if (!readiness.ready) hardBlockers.push('Unresolved circular contract-address dependencies prevent a deterministic deployment order.');
  if (artifacts && !artifacts.ok) hardBlockers.push('One or more compiled artifacts do not match the current contract sources or recorded hashes.');
  if (configResult && !configResult.ok) hardBlockers.push('Testnet network configuration is incomplete or unsafe.');
  if (dexReadResult && !dexReadResult.ok) hardBlockers.push('Read-only live DEX account identity/interface checks failed or remain unverified.');

  if (hardBlockers.length) {
    console.log('\nFINAL PREFLIGHT VERDICT: BLOCKED');
    for (const b of hardBlockers) console.log(`- ${b}`);
    console.log('No transaction was signed or broadcast. No mnemonic was loaded.');
    return 2;
  }

  console.log('\nFINAL PREFLIGHT VERDICT: READY FOR HUMAN REVIEW ONLY');
  console.log('This script cannot deploy contracts. A separately reviewed execution tool is required after all protocol and StateInit dependencies are resolved.');
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(err => {
    console.error(`Fatal preflight error: ${err.message}`);
    process.exitCode = 2;
  });
}

module.exports = {
  parseArgs,
  normalizeEndpoint,
  isTestnetEndpoint,
  validateNetworkConfig,
  findCycles,
  dependencyReadiness,
  tonToNano,
  crc16Xmodem,
  parseTonAddressForTestnet,
  validateRequiredTestnetAddress,
  artifactChecksumsFromJson,
  verifyDexAccountsReadOnly,
  CONTRACTS,
  DEPENDENCY_GRAPH,
  KNOWN_BOOTSTRAP_BLOCKERS,
  main,
};
