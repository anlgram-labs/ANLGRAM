'use strict';

/**
 * ANLGRAM MemeLabs — Test Suite for Supervised Execution Engine (Phase 3D.1)
 * File: minter-contract/test-supervised-execution-engine.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { Address, Cell } = require('@ton/core');

const {
  EXPECTED_TESTNET_GLOBAL_ID,
  EXPECTED_TESTNET_CHAIN,
  MAINNET_CHAIN,
  APPROVED_TESTNET_DEX,
  SUPERVISED_BUDGET,
  TONCONNECT_SPEC,
  validateTonConnectManifestConfig,
  deriveDeterministicAddresses,
  buildDeploymentOperations,
  validateTonConnectSession,
  buildTonConnectTransactionPayload,
  formatHumanApprovalCard,
  verifyStepPreconditionsReadOnly,
  evaluatePostApprovalResult,
  sanitizeLogOutput,
} = require('./supervised-execution-engine');

const { verifyArtifacts } = require('./deploy-launchpad-testnet-exec');

const validTestnetDeployer = 'kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-';

function loadTestArtifacts() {
  const res = verifyArtifacts();
  assert.equal(res.ok, true, `Artifact verification failed: ${res.errors.join('; ')}`);
  return res.artifacts;
}

// ---------------------------------------------------------------------------
// 1. Separation of Minting and Admin Renunciation Operations
// ---------------------------------------------------------------------------
test('Operation Separation: Step 7 (Mint) and Step 8 (Renounce) are distinct independent operations', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  assert.equal(ops.length, 8, 'There must be exactly 8 discrete write operations in the supervised plan');

  const op7 = ops[6]; // Step 7
  const op8 = ops[7]; // Step 8

  // Step 7: Mint 1B tokens
  assert.equal(op7.step, 7);
  assert.equal(op7.id, 'OP_7_MINT_1B_TOKENS');
  assert.equal(op7.operationType, 'CONTRACT_CALL');
  assert.equal(op7.opcodeHex, '0x00000015'); // 21
  assert.equal(op7.opcodeName, 'op::mint');
  assert.equal(op7.targetKey, 'launchpadMinter');
  assert.equal(op7.amountTon, 0.10);
  assert.deepEqual(op7.dependencies, ['OP_6_INIT_LAUNCHPAD']);

  // Step 8: Renounce Admin
  assert.equal(op8.step, 8);
  assert.equal(op8.id, 'OP_8_RENOUNCE_ADMIN');
  assert.equal(op8.operationType, 'CONTRACT_CALL');
  assert.equal(op8.opcodeHex, '0x00000003'); // 3
  assert.equal(op8.opcodeName, 'op == 3 (change_admin to addr_none)');
  assert.equal(op8.targetKey, 'launchpadMinter');
  assert.equal(op8.amountTon, 0.05);
  assert.deepEqual(op8.dependencies, ['OP_7_MINT_1B_TOKENS']);
});

// ---------------------------------------------------------------------------
// 2. Supply and Recipient Validation in Mint Payload
// ---------------------------------------------------------------------------
test('Mint Payload: constructs exact 1B tokens (10^18 units) targeting Curve recipient', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op7 = ops[6];
  assert.ok(op7.payloadBocBase64, 'Op 7 must have non-null serialized payload');

  const cell = Cell.fromBoc(Buffer.from(op7.payloadBocBase64, 'base64'))[0];
  const cs = cell.beginParse();

  const op = cs.loadUint(32);
  const queryId = cs.loadUint(64);
  const toAddr = cs.loadAddress();
  const fwdAmount = cs.loadCoins();
  const masterMsgRef = cs.loadRef();

  assert.equal(op, 21, 'Opcode must be 21 (op::mint)');
  assert.equal(toAddr.toString({ testOnly: true, bounceable: true }), addrs.bondingCurve.address, 'Mint recipient must be Bonding Curve address');
  assert.equal(fwdAmount, 50000000n, 'Forwarded amount must equal 0.05 TON');

  // Parse inner master message
  const mcs = masterMsgRef.beginParse();
  const innerOp = mcs.loadUint(32);
  const innerQuery = mcs.loadUint(64);
  const jettonAmount = mcs.loadCoins();

  assert.equal(innerOp, 0x178d4519, 'Master message must be op::internal_transfer');
  assert.equal(jettonAmount, 1000000000000000000n, 'Jetton amount must be exactly 1,000,000,000 * 10^9 units');
});

// ---------------------------------------------------------------------------
// 3. Administrative Authority Verification (Renounce Admin Payload)
// ---------------------------------------------------------------------------
test('Renounce Admin Payload: verifies new_admin is addr_none and custom_recipient is Curve', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op8 = ops[7];
  assert.ok(op8.payloadBocBase64, 'Op 8 must have non-null serialized payload');

  const cell = Cell.fromBoc(Buffer.from(op8.payloadBocBase64, 'base64'))[0];
  const cs = cell.beginParse();

  const op = cs.loadUint(32);
  const queryId = cs.loadUintBig(64);
  const newAdminTag = cs.preloadUint(2); // 0 = addr_none
  cs.skip(2);
  const customRecipient = cs.loadAddress();

  assert.equal(op, 3, 'Opcode must be 3 (change_admin)');
  assert.equal(queryId, 0x414e4c4752454e4fn, 'Query ID must match RENOUNCE_QUERY_ID ("ANLGRENO")');
  assert.equal(newAdminTag, 0, 'New admin must be addr_none (permanent renounce)');
  assert.equal(customRecipient.toString({ testOnly: true, bounceable: true }), addrs.bondingCurve.address, 'Custom recipient must be Curve address');
});

// ---------------------------------------------------------------------------
// 4. Automatic Curve Activation Verification (Read-Only Check)
// ---------------------------------------------------------------------------
test('Curve Activation: Curve automatically transitions to STATE_ACTIVE (3) without write tx', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op8 = ops[7];
  assert.equal(op8.postcondition.expectedCurveState, 3, 'Post-condition of Step 8 expects Curve STATE_ACTIVE (3)');
  assert.equal(op8.postcondition.expectedAdminNone, true, 'Post-condition of Step 8 expects Master admin to be addr_none');

  // Verify evaluatePostApprovalResult handles Curve getter transition to 3
  const txReceipt = { bounced: false, exitCode: 0 };
  const onChainState = { category: 'ALREADY_ACTIVE', status: 'active', hasCode: true };

  // If Curve getter returns 3 (STATE_ACTIVE), evaluation succeeds
  const evalSuccess = evaluatePostApprovalResult(op8, txReceipt, onChainState, 3);
  assert.equal(evalSuccess.success, true);
  assert.equal(evalSuccess.status, 'STEP_VERIFIED_SUCCESS');
  assert.equal(evalSuccess.mustHalt, false);

  // If Curve getter did not reach 3, evaluation halts closed
  const evalFailure = evaluatePostApprovalResult(op8, txReceipt, onChainState, 2); // still in STATE_RENOUNCE_PENDING
  assert.equal(evalFailure.success, false);
  assert.equal(evalFailure.status, 'GETTER_VERIFICATION_FAILED');
  assert.equal(evalFailure.mustHalt, true);
});

// ---------------------------------------------------------------------------
// 5. Out-of-Order Execution Rejection (DAG Enforcement)
// ---------------------------------------------------------------------------
test('DAG Enforcement: Step 8 (Renounce) cannot be presented or executed before Step 7 (Mint)', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op8 = ops[7];
  const onChainState = { category: 'ALREADY_ACTIVE', status: 'active', hasCode: true };

  // Trying to run Step 8 without Step 7 in completedStepIds
  const check = verifyStepPreconditionsReadOnly(op8, onChainState, 5000000000n, ['OP_1_DEPLOY_MINTER', 'OP_2_DEPLOY_CURVE', 'OP_3_DEPLOY_LOCKER', 'OP_4_DEPLOY_MIGRATOR', 'OP_5_INIT_LP_LOCKER', 'OP_6_INIT_LAUNCHPAD']);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes("Pre-requisite operation 'OP_7_MINT_1B_TOKENS' has not been confirmed")));
});

test('DAG Enforcement: Step 7 (Mint) cannot be executed before Step 6 (Init Launchpad)', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op7 = ops[6];
  const onChainState = { category: 'ALREADY_ACTIVE', status: 'active', hasCode: true };

  const check = verifyStepPreconditionsReadOnly(op7, onChainState, 5000000000n, ['OP_1_DEPLOY_MINTER', 'OP_2_DEPLOY_CURVE', 'OP_3_DEPLOY_LOCKER', 'OP_4_DEPLOY_MIGRATOR', 'OP_5_INIT_LP_LOCKER']);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes("Pre-requisite operation 'OP_6_INIT_LAUNCHPAD' has not been confirmed")));
});

// ---------------------------------------------------------------------------
// 6. User Cancellation and Signature Rejection
// ---------------------------------------------------------------------------
test('User Cancellation: wallet signature rejection halts sequence cleanly without auto-retry', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op7 = ops[6];
  const rejectReceipt = { userRejected: true };

  const res = evaluatePostApprovalResult(op7, rejectReceipt, null);
  assert.equal(res.success, false);
  assert.equal(res.status, 'USER_REJECTED');
  assert.equal(res.mustHalt, true);
  assert.equal(res.canAutoRetry, false);
  assert.ok(res.reason.includes('rejected by the user'));
});

// ---------------------------------------------------------------------------
// 7. Timeouts and Indeterminate States Handling
// ---------------------------------------------------------------------------
test('Indeterminate State: missing receipt or query timeout demands manual reconciliation', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const res = evaluatePostApprovalResult(op1, null, null);
  assert.equal(res.success, false);
  assert.equal(res.status, 'INDETERMINATE_TIMEOUT');
  assert.equal(res.mustHalt, true);
  assert.equal(res.canAutoRetry, false);
});

test('Pre-condition: HTTP 429 rate limit is treated as INDETERMINATE and halts execution', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const rateLimitedState = {
    category: 'INDETERMINATE',
    status: 'RATE_LIMITED',
    detail: 'Toncenter rate limit exceeded (HTTP 429)',
  };

  const check = verifyStepPreconditionsReadOnly(op1, rateLimitedState, 5000000000n, []);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes('Rate limit reached (HTTP 429)')));
});

// ---------------------------------------------------------------------------
// 8. Testnet Network Validation & Mainnet Rejection
// ---------------------------------------------------------------------------
test('TON Connect Network: strictly rejects Mainnet connection (chain -239)', () => {
  const mainnetSession = {
    chain: MAINNET_CHAIN,
    account: { address: validTestnetDeployer },
    manifestUrl: 'https://staging-launchpad.anlgram.io/tonconnect-manifest.json',
  };
  const res = validateTonConnectSession(mainnetSession, validTestnetDeployer);
  assert.equal(res.valid, false);
  assert.equal(res.networkOk, false);
  assert.ok(res.errors.some((e) => e.includes('Connected wallet is on MAINNET')));
});

test('TON Connect Network: accepts valid testnet chain (-3)', () => {
  const testnetSession = {
    chain: EXPECTED_TESTNET_CHAIN,
    account: { address: validTestnetDeployer },
    manifestUrl: 'https://staging-launchpad.anlgram.io/tonconnect-manifest.json',
  };
  const res = validateTonConnectSession(testnetSession, validTestnetDeployer);
  assert.equal(res.valid, true);
  assert.equal(res.networkOk, true);
});

// ---------------------------------------------------------------------------
// 9. TON Connect Staging Manifest Validation & Environment Isolation
// ---------------------------------------------------------------------------
test('Manifest Validator: enforces HTTPS and rejects non-HTTPS protocols', () => {
  const httpRes = validateTonConnectManifestConfig('http://staging-launchpad.anlgram.io/tonconnect-manifest.json');
  assert.equal(httpRes.ok, false);
  assert.ok(httpRes.errors.some((e) => e.includes('must use HTTPS')));
});

test('Manifest Validator: strictly rejects localhost and private IPs', () => {
  const localRes = validateTonConnectManifestConfig('https://localhost:3000/tonconnect-manifest.json');
  assert.equal(localRes.ok, false);
  assert.ok(localRes.errors.some((e) => e.includes('Localhost or private IP')));
});

test('Manifest Validator: strictly rejects production manifest (anlgram.com) for testnet launchpad', () => {
  const prodRes = validateTonConnectManifestConfig('https://anlgram.com/tonconnect-manifest.json');
  assert.equal(prodRes.ok, false);
  assert.ok(prodRes.errors.some((e) => e.includes('ENVIRONMENT ISOLATION: Production domain (anlgram.com) manifest must not be used')));
});

test('Manifest Validator: validates complete schema of valid staging manifest', () => {
  const validManifestData = {
    url: 'https://staging-launchpad.anlgram.io/',
    name: 'ANLGRAM MemeLabs Launchpad (Testnet)',
    iconUrl: 'https://staging-launchpad.anlgram.io/assets/images/sentinel-eye.jpg',
    termsOfUseUrl: 'https://staging-launchpad.anlgram.io/terms.html',
    privacyPolicyUrl: 'https://staging-launchpad.anlgram.io/privacy.html',
  };

  const res = validateTonConnectManifestConfig('https://staging-launchpad.anlgram.io/tonconnect-manifest.json', validManifestData);
  assert.equal(res.ok, true, `Validation failed: ${res.errors.join('; ')}`);
  assert.equal(res.errors.length, 0);
});

test('Manifest Validator: rejects manifest missing mandatory schema fields (e.g. iconUrl or name)', () => {
  const invalidData = {
    url: 'https://staging-launchpad.anlgram.io/',
    name: 'ANLGRAM Testnet',
    // iconUrl missing
  };

  const res = validateTonConnectManifestConfig('https://staging-launchpad.anlgram.io/tonconnect-manifest.json', invalidData);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("required field 'iconUrl' is missing or empty")));
});

// ---------------------------------------------------------------------------
// 10. Single-Message Isolation (Exactly 1 message per approval)
// ---------------------------------------------------------------------------
test('Single-Message Isolation: each of the 8 operations contains strictly 1 message', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  for (const op of ops) {
    const payload = buildTonConnectTransactionPayload(op, validTestnetDeployer);
    assert.equal(payload.network, EXPECTED_TESTNET_GLOBAL_ID);
    assert.equal(payload.from, validTestnetDeployer);
    assert.equal(payload.messages.length, 1, `Operation ${op.name} must contain exactly 1 message`);
  }
});

// ---------------------------------------------------------------------------
// 11. Absence of Secrets in Logs and Payloads
// ---------------------------------------------------------------------------
test('Secret Sanitization: redacts 12/24-word mnemonics and 64-char private keys', () => {
  const rawLog = 'Failure: --mnemonic="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12" key=11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
  const sanitized = sanitizeLogOutput(rawLog);

  assert.ok(!sanitized.includes('word1 word2 word3'));
  assert.ok(!sanitized.includes('11223344556677889900aabbccddeeff'));
  assert.ok(sanitized.includes('[REDACTED'));
});

// ---------------------------------------------------------------------------
// 12. Financial Budget Consistency
// ---------------------------------------------------------------------------
test('Financial Invariant: 8 items sum to exactly 0.71 TON, minimum balance 2.71 TON, 500 TON user liquidity', () => {
  assert.equal(SUPERVISED_BUDGET.items.length, 8);
  const itemsSum = SUPERVISED_BUDGET.items.reduce((acc, it) => acc + it.costTon, 0);
  assert.ok(Math.abs(itemsSum - 0.71) < 0.0001, `Items sum (${itemsSum}) must equal 0.71 TON`);
  assert.equal(SUPERVISED_BUDGET.operationalReserveBuffer, 1.50);
  assert.equal(SUPERVISED_BUDGET.minimumRequiredBalance, 2.71);
  assert.equal(SUPERVISED_BUDGET.recommendedBalance, 3.50);
  assert.equal(SUPERVISED_BUDGET.graduationTargetTon, 500.0);
});

// ---------------------------------------------------------------------------
// 13. Operator Wallet Recalculation on Divergence
// ---------------------------------------------------------------------------
test('Operator Wallet: detects different connected wallet and re-computes all deterministic addresses', () => {
  const artifacts = loadTestArtifacts();
  const altWallet = 'kQAREREREREREREREREREREREREREREREREREREREREREV2Z';

  const session = {
    chain: EXPECTED_TESTNET_CHAIN,
    account: { address: altWallet },
    manifestUrl: 'https://staging-launchpad.anlgram.io/tonconnect-manifest.json',
  };

  const res = validateTonConnectSession(session, validTestnetDeployer, artifacts);
  assert.equal(res.valid, true);
  assert.equal(res.walletMatchesConfiguredDeployer, false);
  assert.ok(res.warnings.some((w) => w.includes('differs from configured deployer')));
  assert.ok(res.recalculatedAddresses !== null);

  const defaultAddrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  assert.notEqual(res.recalculatedAddresses.launchpadMinter.address, defaultAddrs.launchpadMinter.address);
});

// ---------------------------------------------------------------------------
// 14. Approval Card Rendering
// ---------------------------------------------------------------------------
test('Approval Card: renders all required human-auditable parameters for Step 7 and Step 8', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const card7 = formatHumanApprovalCard(ops[6], { operatorAddress: validTestnetDeployer, balanceTon: 3.50 });
  assert.ok(card7.includes('OPERATION 7 OF 8: BOOTSTRAP 3: MINT 1B TOKENS TO CURVE WALLET (OP == 21)'));
  assert.ok(card7.includes('Proposed TON Value:  0.10 TON'));
  assert.ok(card7.includes('Payload Opcode:      0x00000015 (op::mint)'));

  const card8 = formatHumanApprovalCard(ops[7], { operatorAddress: validTestnetDeployer, balanceTon: 3.40 });
  assert.ok(card8.includes('OPERATION 8 OF 8: BOOTSTRAP 4: RENOUNCE ADMIN TO ADDR_NONE (OP == 3)'));
  assert.ok(card8.includes('Proposed TON Value:  0.05 TON'));
  assert.ok(card8.includes('Payload Opcode:      0x00000003 (op == 3 (change_admin to addr_none))'));
});
