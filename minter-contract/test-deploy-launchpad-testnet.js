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
} = require('./deploy-launchpad-testnet');

const goodEnv = {
  TON_NETWORK: 'testnet',
  TON_GLOBAL_ID: '-3',
  TONCENTER_TESTNET_URL: 'https://testnet.toncenter.com/api/v2',
  TONAPI_TESTNET_URL: 'https://testnet.tonapi.io/v2',
  ANLGRAM_TESTNET_DEPLOYER_ADDRESS: 'kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-',
  STONFI_TESTNET_ROUTER: 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn',
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
  assert.equal(parseTonAddressForTestnet('kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn').valid, true);
  assert.equal(parseTonAddressForTestnet('kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn').testnetFlagPresent, true);
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

test('dependency graph identifies synthetic cycles and confirms remediated DAG is acyclic', () => {
  const cycles = findCycles({ a: ['b'], b: ['a'], c: ['b'] });
  assert.ok(cycles.some(c => c.includes('a') && c.includes('b')));
  const readiness = dependencyReadiness();
  assert.equal(readiness.ready, true, 'Remediated deployment graph must have zero unresolved cycles');
  assert.equal(readiness.cycles.length, 0);
  assert.equal(readiness.blockers.length, 0);
  assert.ok(readiness.resolvedMechanisms.length >= 2);
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
