'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const { evaluateTerminalOutcome, evaluateTerminalSettlement, TerminalOutcome } = require('../../testnet-interface/projects/stonfi-terminal-settlement.mjs');

const POOL = '0:1111111111111111111111111111111111111111111111111111111111111111';
const DEPOSITOR = '0:2222222222222222222222222222222222222222222222222222222222222222';
const LP_WALLET = '0:3333333333333333333333333333333333333333333333333333333333333333';

test('F-02 State 1: Both liquidity legs deposited into LPAccount', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    lpAccountSnapshot: { pool: POOL, user: DEPOSITOR, amount0: '500000000000', amount1: '200000000000000000' }
  });
  assert.equal(result.outcome, TerminalOutcome.BOTH_LEGS_DEPOSITED);
  assert.equal(result.amount0, '500000000000');
  assert.equal(result.amount1, '200000000000000000');
});

test('F-02 State 2: Partial liquidity deposit (one leg only)', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    lpAccountSnapshot: { pool: POOL, user: DEPOSITOR, amount0: '500000000000', amount1: '0' }
  });
  assert.equal(result.outcome, TerminalOutcome.PARTIAL_DEPOSIT);
  assert.equal(result.pendingLeg, 'TOKEN1');
});

test('F-02 State 3: LP minted and delivered to authorized LP wallet', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    lpMintEvidence: { verified: true, recipient: LP_WALLET, amountUnits: '316227766016837' }
  });
  assert.equal(result.outcome, TerminalOutcome.LP_MINTED_AND_DELIVERED);
  assert.equal(result.lpUnits, '316227766016837');
});

test('F-02 State 4: Both legs refunded (TON & Jettons returned)', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    tonRefundEvidence: { verified: true, amountNano: '500000000000' },
    jettonRefundEvidence: { verified: true, amountUnits: '200000000000000000' }
  });
  assert.equal(result.outcome, TerminalOutcome.TON_RETURNED);
  assert.equal(result.tonReturnedNano, '500000000000');
  assert.equal(result.jettonsReturnedUnits, '200000000000000000');
});

test('F-02 State 5: Only Jettons refunded (partial refund)', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    jettonRefundEvidence: { verified: true, amountUnits: '200000000000000000' }
  });
  assert.equal(result.outcome, TerminalOutcome.JETTONS_RETURNED);
  assert.equal(result.jettonsReturnedUnits, '200000000000000000');
});

test('F-02 State 6: Only TON refunded while Jettons failed/unrefunded', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    tonRefundEvidence: { verified: true, amountNano: '500000000000' }
  });
  assert.equal(result.outcome, TerminalOutcome.PARTIAL_OR_FAILED_REFUND);
  assert.equal(result.tonReturnedNano, '500000000000');
});

test('F-02 State 7: LPAccount reset or deleted (0 reserves)', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    lpAccountSnapshot: { pool: POOL, user: DEPOSITOR, amount0: '0', amount1: '0' }
  });
  assert.equal(result.outcome, TerminalOutcome.LP_ACCOUNT_RESET_OR_DELETED);
});

test('F-02 State 8: Unknown outcome on mismatched pool or unverified claims', () => {
  const result = evaluateTerminalSettlement({
    expectedDepositor: DEPOSITOR,
    expectedPool: POOL,
    expectedLpWallet: LP_WALLET,
    lpAccountSnapshot: { pool: '0:wrong_pool', user: DEPOSITOR, amount0: '100', amount1: '100' }
  });
  assert.equal(result.outcome, TerminalOutcome.UNKNOWN_OUTCOME);
});
