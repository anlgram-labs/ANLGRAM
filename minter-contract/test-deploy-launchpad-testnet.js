'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  isTestnetEndpoint,
  validateNetworkConfig,
  findCycles,
  dependencyReadiness,
  tonToNano,
  parseTonAddressForTestnet,
  verifyDexAccountsReadOnly,
  deriveJettonWalletAddress,
  buildLaunchpadInitialStates,
  verifyLaunchpadStateInitLayout,
  EXTERNAL_DEX_BLOCKERS,
} = require('./deploy-launchpad-testnet');

const goodEnv = {
  TON_NETWORK: 'testnet',
  TON_GLOBAL_ID: '-3',
  TONCENTER_TESTNET_URL: 'https://testnet.toncenter.com/api/v2',
  TONAPI_TESTNET_URL: 'https://testnet.tonapi.io/v2',
  ANLGRAM_TESTNET_DEPLOYER_ADDRESS: 'kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-',
  STONFI_TESTNET_ROUTER: 'kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v',
  STONFI_TESTNET_PTON_MASTER: 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px',
  TESTNET_DEPLOYER_MNEMONIC: 'SHOULD_NOT_BE_READ_OR_PRINTED',
};

test('only safe preflight flags are accepted', () => {
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--verify-config']).verifyConfig, true);
  assert.equal(parseArgs(['--show-plan']).showPlan, true);
  assert.throws(() => parseArgs(['--deploy']), /does not implement deployment or broadcasting/);
  assert.throws(() => parseArgs([]), /Specify at least one safe mode/);
});

test('mainnet and non-HTTPS endpoints are rejected', () => {
  assert.equal(isTestnetEndpoint('https://toncenter.com/api/v2', 'toncenter'), false);
  assert.equal(isTestnetEndpoint('http://testnet.toncenter.com/api/v2', 'toncenter'), false);
  assert.equal(isTestnetEndpoint('https://testnet.toncenter.com/api/v2', 'toncenter'), true);
  assert.equal(isTestnetEndpoint('https://tonapi.io/v2', 'tonapi'), false);
  assert.equal(isTestnetEndpoint('https://testnet.tonapi.io/v2', 'tonapi'), true);
});

test('friendly testnet addresses validate checksum and testnet flag', () => {
  assert.equal(parseTonAddressForTestnet('kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v').valid, true);
  assert.equal(parseTonAddressForTestnet('kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v').testnetFlagPresent, true);
  assert.equal(parseTonAddressForTestnet('kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px').valid, true);
  assert.equal(parseTonAddressForTestnet('kQAcOvNK00CGceGQCdQinqcPvGCT7BXP7amCYLTCnM8TQCn8').valid, false);
  assert.equal(parseTonAddressForTestnet('EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O').testnetFlagPresent, false);
});

test('network configuration validates explicit testnet only', () => {
  const r = validateNetworkConfig(goodEnv);
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(validateNetworkConfig({ ...goodEnv, TON_NETWORK: 'mainnet' }).ok, false);
  assert.equal(validateNetworkConfig({ ...goodEnv, TON_GLOBAL_ID: '0' }).ok, false);
  assert.equal(validateNetworkConfig({ ...goodEnv, TONCENTER_TESTNET_URL: 'https://toncenter.com/api/v2' }).ok, false);
});

test('missing config fails closed', () => {
  const r = validateNetworkConfig({});
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 5);
});

test('dependency graph is acyclic but critical bootstrap and accounting issues block readiness', () => {
  const cycles = findCycles({ a: ['b'], b: ['a'], c: ['b'] });
  assert.ok(cycles.some(c => c.includes('a') && c.includes('b')));
  const readiness = dependencyReadiness();
  assert.equal(readiness.ready, false, 'Acyclic addresses do not imply a valid bootstrap');
  assert.equal(readiness.cycles.length, 0);
  assert.ok(readiness.blockers.some(b => b.id === 'MINTER_RENOUNCE_AUTHORITY_MISMATCH'));
  assert.ok(readiness.blockers.some(b => b.id === 'LP_CUSTODY_WALLET_UNVERIFIED'));
  assert.ok(readiness.blockers.some(b => b.id === 'CURVE_SETTLEMENT_END_TO_END_UNVERIFIED'));
  assert.ok(!readiness.blockers.some(b => b.id === 'BUY_GRADUATION_ACCOUNTING_UNRESOLVED'));
  assert.ok(readiness.resolvedMechanisms.length >= 2);
});

test('show-plan reports critical contract blockers and fails closed', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [require.resolve('./deploy-launchpad-testnet'), '--show-plan'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /MINTER_RENOUNCE_AUTHORITY_MISMATCH/);
  assert.match(result.stdout, /LP_CUSTODY_WALLET_UNVERIFIED/);
  assert.match(result.stdout, /CURVE_SETTLEMENT_END_TO_END_UNVERIFIED/);
  assert.doesNotMatch(result.stdout, /MALFORMED_SELL_RECOVERY_UNVERIFIED/);
  assert.match(result.stdout, /FINAL PREFLIGHT VERDICT: BLOCKED/);
  assert.doesNotMatch(result.stdout, /triggering automatic admin renounce/);
});

test('TON conversion is exact integer nanotons', () => {
  assert.equal(tonToNano('1'), 1000000000n);
  assert.equal(tonToNano('2.5'), 2500000000n);
  assert.equal(tonToNano('0.000000001'), 1n);
  assert.throws(() => tonToNano('0.0000000001'));
  assert.throws(() => tonToNano('-1'));
});

test('test harness confirms it does not request a wallet signature or broadcast', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('./deploy-launchpad-testnet'), 'utf8');
  assert.doesNotMatch(source, /WalletContractV4|mnemonicToPrivateKey|sendTransfer\s*\(|sendRawMessage\s*\(|broadcastTransaction/i);
});


test('read-only live checker uses GET only and labels its evidence as partial', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    const router = url.includes('STONfi') || url.includes(encodeURIComponent(goodEnv.STONFI_TESTNET_ROUTER));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: 'active',
        interfaces: router ? ['stonfi_router_v2'] : ['jetton_master'],
        code_hash: 'example-only',
      }),
    };
  };
  const result = await verifyDexAccountsReadOnly(goodEnv, fetchMock);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.options.method === 'GET'));
  assert.equal(result.ok, true);
  assert.ok(result.checks.every(c => c.result === 'PARTIAL_PASS'));
  assert.match(result.checks[0].caveat, /not proven by this request alone/);
});

test('StateInit builder constructs conformant initial data and round-trip validator succeeds', () => {
  const tonCore = require('@ton/core');
  const { Address, Cell, beginCell } = tonCore;
  const mockWalletCode = beginCell().storeUint(0x1234, 16).endCell();

  const deployer = Address.parseFriendly(goodEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS).address;
  const dexRouter = Address.parseFriendly(goodEnv.STONFI_TESTNET_ROUTER).address;
  const ptonMinter = Address.parseFriendly(goodEnv.STONFI_TESTNET_PTON_MASTER).address;
  const minter = new Address(0, Buffer.alloc(32, 1));
  const curve = new Address(0, Buffer.alloc(32, 2));
  const locker = new Address(0, Buffer.alloc(32, 3));
  const migrator = new Address(0, Buffer.alloc(32, 4));

  const states = buildLaunchpadInitialStates({
    adminAddress: deployer,
    creatorAddress: deployer,
    treasuryAddress: deployer,
    minterAddress: minter,
    curveAddress: curve,
    lpLockerAddress: locker,
    migrationRouterAddress: migrator,
    dexRouterAddress: dexRouter,
    ptonMinterAddress: ptonMinter,
    jettonWalletCode: mockWalletCode,
  }, tonCore);

  const validation = verifyLaunchpadStateInitLayout(states, tonCore);
  assert.equal(validation.ok, true, `Validation errors: ${validation.errors.join('; ')}`);
  assert.equal(validation.errors.length, 0);

  // Derived wallets verification
  const myWallet = deriveJettonWalletAddress(migrator, minter, mockWalletCode, tonCore);
  const dexWallet = deriveJettonWalletAddress(dexRouter, minter, mockWalletCode, tonCore);
  assert.equal(states.derivedWallets.migrationRouterJettonWallet.equals(myWallet), true);
  assert.equal(states.derivedWallets.dexRouterTokenWallet.equals(dexWallet), true);
  assert.equal(myWallet.equals(dexWallet), false, 'Migration router wallet must not equal DEX router wallet');
});

test('StateInit validator strictly rejects missing admin_address or fallback to curve_address in migrationRouter', () => {
  const tonCore = require('@ton/core');
  const { Address, Cell, beginCell } = tonCore;
  const mockWalletCode = beginCell().storeUint(0x1234, 16).endCell();

  const deployer = Address.parseFriendly(goodEnv.ANLGRAM_TESTNET_DEPLOYER_ADDRESS).address;
  const dexRouter = Address.parseFriendly(goodEnv.STONFI_TESTNET_ROUTER).address;
  const ptonMinter = Address.parseFriendly(goodEnv.STONFI_TESTNET_PTON_MASTER).address;
  const minter = new Address(0, Buffer.alloc(32, 1));
  const curve = new Address(0, Buffer.alloc(32, 2));
  const locker = new Address(0, Buffer.alloc(32, 3));
  const migrator = new Address(0, Buffer.alloc(32, 4));

  // Case 1: migrationRouter admin falls back to curve_address
  const fallbackStates = buildLaunchpadInitialStates({
    adminAddress: deployer,
    minterAddress: minter,
    curveAddress: curve,
    lpLockerAddress: locker,
    migrationRouterAddress: migrator,
    dexRouterAddress: dexRouter,
    ptonMinterAddress: ptonMinter,
    jettonWalletCode: mockWalletCode,
  }, tonCore);

  // Replace migrationRouterData with one where admin_address == curve_address
  fallbackStates.migrationRouterData = beginCell()
    .storeUint(0, 1)
    .storeAddress(curve)
    .storeAddress(locker)
    .storeAddress(dexRouter)
    .storeRef(
      beginCell()
        .storeAddress(minter)
        .storeAddress(ptonMinter)
        .storeCoins(0n)
        .storeCoins(0n)
        .storeAddress(curve) // Fallback to curve_address!
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(null)
        .storeAddress(null)
        .storeCoins(0n)
        .storeCoins(0n)
        .storeRef(mockWalletCode)
        .endCell()
    )
    .endCell();

  const fallbackCheck = verifyLaunchpadStateInitLayout(fallbackStates, tonCore);
  assert.equal(fallbackCheck.ok, false);
  assert.ok(fallbackCheck.errors.some(e => e.includes('admin_address must not fall back to curve_address') || e.includes('admin_address mismatch')));

  // Case 2: external DEX blockers records STONFI_TESTNET_ROUTER_EXIT_CODE_9
  assert.ok(EXTERNAL_DEX_BLOCKERS.some(b => b.id === 'STONFI_TESTNET_ROUTER_EXIT_CODE_9'));
});
