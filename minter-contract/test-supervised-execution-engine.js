'use strict';

/**
 * ANLGRAM MemeLabs — Test Suite for Supervised Execution Engine (Phase 3D.0)
 * File: minter-contract/test-supervised-execution-engine.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  EXPECTED_TESTNET_GLOBAL_ID,
  EXPECTED_TESTNET_CHAIN,
  MAINNET_CHAIN,
  APPROVED_TESTNET_DEX,
  SUPERVISED_BUDGET,
  TONCONNECT_SPEC,
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
// 1. Wrong Network Connection Rejection
// ---------------------------------------------------------------------------
test('TON Connect Network: strictly rejects Mainnet connection (chain -239)', () => {
  const mainnetSession = {
    chain: MAINNET_CHAIN,
    account: { address: validTestnetDeployer },
    manifestUrl: 'https://testnet.anlgram.io/tonconnect-manifest.json',
  };
  const res = validateTonConnectSession(mainnetSession, validTestnetDeployer);
  assert.equal(res.valid, false);
  assert.equal(res.networkOk, false);
  assert.ok(res.errors.some((e) => e.includes('Connected wallet is on MAINNET')));
});

test('TON Connect Network: rejects unknown or unsupported chain (e.g. chain 0 or string)', () => {
  const invalidChainSession = {
    chain: 0,
    account: { address: validTestnetDeployer },
  };
  const res = validateTonConnectSession(invalidChainSession, validTestnetDeployer);
  assert.equal(res.valid, false);
  assert.equal(res.networkOk, false);
  assert.ok(res.errors.some((e) => e.includes('does not match TON Testnet')));
});

test('TON Connect Network: accepts valid testnet chain (-3)', () => {
  const testnetSession = {
    chain: EXPECTED_TESTNET_CHAIN,
    account: { address: validTestnetDeployer },
    manifestUrl: 'https://testnet.anlgram.io/tonconnect-manifest.json',
  };
  const res = validateTonConnectSession(testnetSession, validTestnetDeployer);
  assert.equal(res.valid, true);
  assert.equal(res.networkOk, true);
  assert.equal(res.errors.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Operator Wallet Differs from Expected
// ---------------------------------------------------------------------------
test('Operator Wallet: detects different connected wallet and re-computes all deterministic addresses', () => {
  const artifacts = loadTestArtifacts();
  // Valid testnet address derived from workchain 0, raw hash 1111...1111
  const altWallet = 'kQAREREREREREREREREREREREREREREREREREREREREREV2Z';

  const session = {
    chain: EXPECTED_TESTNET_CHAIN,
    account: { address: altWallet },
    manifestUrl: 'https://testnet.anlgram.io/tonconnect-manifest.json',
  };

  const res = validateTonConnectSession(session, validTestnetDeployer, artifacts);
  assert.equal(res.valid, true);
  assert.equal(res.walletMatchesConfiguredDeployer, false);
  assert.ok(res.warnings.some((w) => w.includes('differs from configured deployer')));
  assert.ok(res.recalculatedAddresses !== null);

  // Recalculated addresses must differ from default deployer's addresses
  const defaultAddrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  assert.notEqual(res.recalculatedAddresses.launchpadMinter.address, defaultAddrs.launchpadMinter.address);
  assert.notEqual(res.recalculatedAddresses.bondingCurve.address, defaultAddrs.bondingCurve.address);
});

// ---------------------------------------------------------------------------
// 3. Modified StateInit or Artifact Detection
// ---------------------------------------------------------------------------
test('Artifact Integrity: detects corrupted or modified bytecode SHA256', () => {
  const artifacts = loadTestArtifacts();
  const tamperedArtifacts = JSON.parse(JSON.stringify(artifacts));

  // Tamper with the minter code BOC
  const tamperedCell = tamperedArtifacts.launchpadMinter.codeBocBase64.replace(/^te6cckEBAQ/, 'te6cckEBAA');
  tamperedArtifacts.launchpadMinter.codeBocBase64 = tamperedCell;

  // Deriving addresses with tampered code must either fail or produce a different code hash
  try {
    const addrs = deriveDeterministicAddresses(validTestnetDeployer, tamperedArtifacts);
    assert.notEqual(addrs.launchpadMinter.codeHash, artifacts.launchpadMinter.codeHash);
  } catch (err) {
    assert.ok(err.message.includes('BOC') || err.message.includes('Cell'));
  }
});

// ---------------------------------------------------------------------------
// 4. Target Differs from Approved Configuration
// ---------------------------------------------------------------------------
test('Target Verification: rejects rogue DEX router address in address derivation', () => {
  const artifacts = loadTestArtifacts();
  const rogueDex = {
    router: 'kQCX_fake_dex_router_address_for_testnet_123456789',
    ptonMaster: APPROVED_TESTNET_DEX.ptonMaster,
  };

  assert.throws(
    () => deriveDeterministicAddresses(validTestnetDeployer, artifacts, rogueDex),
    /invalid|CRC16|length|address/i
  );
});

// ---------------------------------------------------------------------------
// 5. Account Already Deployed Check (Pre-condition)
// ---------------------------------------------------------------------------
test('Pre-condition: blocks StateInit deployment if target account is already active on-chain', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0]; // OP_1_DEPLOY_MINTER
  const onChainState = {
    category: 'ALREADY_ACTIVE',
    status: 'active',
    hasCode: true,
  };
  const balanceNano = 5000000000n; // 5 TON

  const check = verifyStepPreconditionsReadOnly(op1, onChainState, balanceNano, []);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes('already ALREADY_ACTIVE')));
});

// ---------------------------------------------------------------------------
// 6. Repeated Initialization Prevention
// ---------------------------------------------------------------------------
test('Pre-condition: blocks repeat initialization if LP Locker router is already initialized', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op5 = ops[4]; // OP_5_INIT_LP_LOCKER
  const onChainState = {
    category: 'ALREADY_ACTIVE',
    status: 'active',
    hasCode: true,
  };
  const balanceNano = 5000000000n;

  // Simulate already completed dependencies
  const completed = ['OP_3_DEPLOY_LOCKER', 'OP_4_DEPLOY_MIGRATOR'];
  const check = verifyStepPreconditionsReadOnly(op5, onChainState, balanceNano, completed);
  assert.equal(check.ok, true);

  // If evaluated post-execution with already initialized result:
  const duplicateReceipt = { bounced: false, exitCode: 405 }; // exit_code 405 = ALREADY_INITIALIZED
  const postEval = evaluatePostApprovalResult(op5, duplicateReceipt, onChainState);
  assert.equal(postEval.success, false);
  assert.equal(postEval.status, 'TRANSACTION_FAILED_BOUNCED');
  assert.equal(postEval.mustHalt, true);
  assert.equal(postEval.canAutoRetry, false);
});

// ---------------------------------------------------------------------------
// 7. Insufficient Balance Check
// ---------------------------------------------------------------------------
test('Pre-condition: blocks execution when operator wallet balance is below minimum (2.71 TON)', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const onChainState = { category: 'UNINITIALIZED', status: 'nonexist', hasCode: false };
  const lowBalanceNano = 1000000000n; // 1.00 TON < 2.71 TON minimum

  const check = verifyStepPreconditionsReadOnly(op1, onChainState, lowBalanceNano, []);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes('below the minimum required 2.71 TON')));
});

test('Financial Invariant: Itemized budget clearly isolates deployer funds from 500 TON user liquidity', () => {
  assert.equal(SUPERVISED_BUDGET.minimumRequiredBalance, 2.71);
  assert.equal(SUPERVISED_BUDGET.recommendedBalance, 3.50);
  assert.equal(SUPERVISED_BUDGET.graduationTargetTon, 500.0);
  assert.equal(SUPERVISED_BUDGET.items.length, 8);

  const sumItems = SUPERVISED_BUDGET.items.reduce((acc, it) => acc + it.costTon, 0);
  assert.ok(Math.abs(sumItems - 0.71) < 0.001, `Sum of items (${sumItems}) should equal 0.71 TON`);
});

// ---------------------------------------------------------------------------
// 8. Rate Limiting and Network Query Errors Fail Closed
// ---------------------------------------------------------------------------
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

test('Pre-condition: Network timeout or 500 error is INDETERMINATE and does NOT assume unoccupied', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const timeoutState = {
    category: 'INDETERMINATE',
    status: 'FETCH_ERROR',
    detail: 'Request timed out after 8000ms',
  };

  const check = verifyStepPreconditionsReadOnly(op1, timeoutState, 5000000000n, []);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes('returned indeterminate state')));
});

// ---------------------------------------------------------------------------
// 9. User Rejects Signature in Wallet
// ---------------------------------------------------------------------------
test('Post-Execution: User signature rejection aborts procedure cleanly without resending', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const rejectedReceipt = { userRejected: true };

  const evalRes = evaluatePostApprovalResult(op1, rejectedReceipt, null);
  assert.equal(evalRes.success, false);
  assert.equal(evalRes.status, 'USER_REJECTED');
  assert.equal(evalRes.mustHalt, true);
  assert.equal(evalRes.canAutoRetry, false);
  assert.ok(evalRes.reason.includes('rejected by the user'));
});

// ---------------------------------------------------------------------------
// 10. Pending or Indeterminate Post-Transaction Outcome
// ---------------------------------------------------------------------------
test('Post-Execution: Missing receipt or query timeout demands manual reconciliation without auto-retry', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const timeoutRes = evaluatePostApprovalResult(op1, null, null);
  assert.equal(timeoutRes.success, false);
  assert.equal(timeoutRes.status, 'INDETERMINATE_TIMEOUT');
  assert.equal(timeoutRes.mustHalt, true);
  assert.equal(timeoutRes.canAutoRetry, false);
});

// ---------------------------------------------------------------------------
// 11. Transaction Bounce or Failure Handling
// ---------------------------------------------------------------------------
test('Post-Execution: Bounced message or non-zero exit code halts sequence', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op2 = ops[1]; // OP_2_DEPLOY_CURVE
  const bouncedReceipt = {
    bounced: true,
    exitCode: 408,
  };

  const evalRes = evaluatePostApprovalResult(op2, bouncedReceipt, { category: 'ALREADY_ACTIVE' });
  assert.equal(evalRes.success, false);
  assert.equal(evalRes.status, 'TRANSACTION_FAILED_BOUNCED');
  assert.equal(evalRes.mustHalt, true);
  assert.equal(evalRes.canAutoRetry, false);
  assert.equal(evalRes.exitCode, 408);
});

// ---------------------------------------------------------------------------
// 12. Prevention of Subsequent Operations After Failure (DAG Halt)
// ---------------------------------------------------------------------------
test('DAG Enforcement: Step 2 cannot be executed if Step 1 has not succeeded on-chain', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op2 = ops[1]; // OP_2_DEPLOY_CURVE depends on OP_1_DEPLOY_MINTER
  const onChainState = { category: 'UNINITIALIZED', status: 'nonexist', hasCode: false };

  // Step 1 NOT in completed array
  const check = verifyStepPreconditionsReadOnly(op2, onChainState, 5000000000n, []);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes("Pre-requisite operation 'OP_1_DEPLOY_MINTER' has not been confirmed")));
});

test('DAG Enforcement: Step 6 cannot be executed if Step 5 has not succeeded on-chain', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op6 = ops[5]; // OP_6_INIT_LAUNCHPAD depends on OP_2 and OP_5
  const onChainState = { category: 'ALREADY_ACTIVE', status: 'active', hasCode: true };

  // OP_5 missing from completed
  const check = verifyStepPreconditionsReadOnly(op6, onChainState, 5000000000n, ['OP_1_DEPLOY_MINTER', 'OP_2_DEPLOY_CURVE', 'OP_3_DEPLOY_LOCKER', 'OP_4_DEPLOY_MIGRATOR']);
  assert.equal(check.ok, false);
  assert.ok(check.blockers.some((b) => b.includes("Pre-requisite operation 'OP_5_INIT_LP_LOCKER' has not been confirmed")));
});

// ---------------------------------------------------------------------------
// 13. Absence of Secrets in Logs and Payloads
// ---------------------------------------------------------------------------
test('Secret Sanitization: redacts 12/24-word mnemonics, private keys, and seed flags from logs', () => {
  const sampleLogWithSecret = 'Error during test: --mnemonic="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12" secret_key=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const sanitized = sanitizeLogOutput(sampleLogWithSecret);

  assert.ok(!sanitized.includes('word1 word2 word3'));
  assert.ok(!sanitized.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
  assert.ok(sanitized.includes('[REDACTED'));
});

test('Payload Safety: operations payload generator never contains secret keys or mnemonics', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  for (const op of ops) {
    const serialized = JSON.stringify(op, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
    assert.ok(!serialized.toLowerCase().includes('mnemonic'));
    assert.ok(!serialized.toLowerCase().includes('seed'));
    assert.ok(!serialized.toLowerCase().includes('privatekey'));
  }
});

// ---------------------------------------------------------------------------
// 14. TON Connect Manifest Protocol Requirements & Blocker Flag
// ---------------------------------------------------------------------------
test('TON Connect Protocol: documents and enforces HTTPS manifest requirement', () => {
  assert.equal(TONCONNECT_SPEC.manifestRequirements.protocol, 'https:');
  assert.equal(TONCONNECT_SPEC.manifestRequirements.allowLocalhost, false);
  assert.equal(TONCONNECT_SPEC.manifestRequirements.status, 'BLOCKED_PENDING_HTTPS_HOSTING');
  assert.ok(TONCONNECT_SPEC.manifestRequirements.blockerReason.includes('public HTTPS URL hosting tonconnect-manifest.json'));
});

// ---------------------------------------------------------------------------
// 15. Single-Message Isolation (No Batching of Irreversible Operations)
// ---------------------------------------------------------------------------
test('TON Connect Payload: builds strictly 1 message per transaction payload', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  for (const op of ops) {
    const payload = buildTonConnectTransactionPayload(op, validTestnetDeployer);
    assert.equal(payload.network, EXPECTED_TESTNET_GLOBAL_ID);
    assert.equal(payload.from, validTestnetDeployer);
    assert.equal(payload.messages.length, 1, `Operation ${op.name} must contain exactly 1 message, found ${payload.messages.length}`);
    assert.equal(payload.messages[0].address, op.targetAddress);
    assert.equal(payload.messages[0].amount, op.amountNano.toString());
  }
});

// ---------------------------------------------------------------------------
// 16. Comprehensive Human Approval Card Formatting
// ---------------------------------------------------------------------------
test('Approval Card: renders all required fields (Operation, Target, Amount, StateInit, Payload, Operator, Network, Risks)', () => {
  const artifacts = loadTestArtifacts();
  const addrs = deriveDeterministicAddresses(validTestnetDeployer, artifacts);
  const ops = buildDeploymentOperations(validTestnetDeployer, addrs);

  const op1 = ops[0];
  const card = formatHumanApprovalCard(op1, { operatorAddress: validTestnetDeployer, balanceTon: 3.50 });

  assert.ok(card.includes('OPERATION 1 OF 8: DEPLOY LAUNCHPAD JETTON MASTER'));
  assert.ok(card.includes('Target Address:'));
  assert.ok(card.includes('Proposed TON Value:  0.08 TON'));
  assert.ok(card.includes('Artifact Code Hash:'));
  assert.ok(card.includes('Operator Wallet:'));
  assert.ok(card.includes('Target Network:      TON Testnet (global_id: -3, chain: -3)'));
  assert.ok(card.includes('Irreversible Effects & Operational Risks'));
  assert.ok(card.includes('APPROVAL ACTIONS:'));
  assert.ok(card.includes('[1] APPROVE'));
  assert.ok(card.includes('[2] CANCEL'));
});
