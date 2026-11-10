// STON.fi v2.2 Terminal Settlement Evaluator (F-02)
// Strictly classifies DEX liquidity and refund lifecycles into 8 discrete states.
// Never assumes LP custody alone proves terminal settlement.

export const TerminalOutcome = Object.freeze({
  BOTH_LEGS_DEPOSITED: 'BOTH_LEGS_DEPOSITED',
  PARTIAL_DEPOSIT: 'PARTIAL_DEPOSIT',
  LP_MINTED_AND_DELIVERED: 'LP_MINTED_AND_DELIVERED',
  TON_RETURNED: 'TON_RETURNED',
  JETTONS_RETURNED: 'JETTONS_RETURNED',
  PARTIAL_OR_FAILED_REFUND: 'PARTIAL_OR_FAILED_REFUND',
  LP_ACCOUNT_RESET_OR_DELETED: 'LP_ACCOUNT_RESET_OR_DELETED',
  TERMINAL_GRADUATED: 'TERMINAL_GRADUATED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME'
});

export const STONFI_OPCODES = Object.freeze({
  PROVIDE_LP: 0x37c096df,
  TON_TRANSFER: 0x01f3835d,
  DEPOSIT_REF: 0x414c5003,
  REFUND_ME: 0x132b9a2c,
  LP_MINT_NOTIFICATION: 0x7362d09c,
  LP_CUSTODY_RECEIPT: 0x414c5005,
  LP_OBSERVATION_RECEIPT: 0x414c5635,
  TERMINAL_SETTLEMENT_PROOF: 0x414e5903,
  SETTLE_MIGRATION: 0x414e5904
});

export function evaluateTerminalSettlement({
  lpAccountSnapshot,
  lpMintEvidence,
  tonRefundEvidence,
  jettonRefundEvidence,
  terminalProofEvidence,
  expectedDepositor,
  expectedPool,
  expectedLpWallet
}) {
  // Guard: Depositor and pool bindings are mandatory
  if (!expectedDepositor || !expectedPool) {
    return { outcome: TerminalOutcome.UNKNOWN_OUTCOME, reason: 'Missing expected depositor or pool' };
  }

  // 0. Evaluate Terminal Settlement Proof (Router -> Curve completed)
  if (terminalProofEvidence) {
    if (
      terminalProofEvidence.verified &&
      terminalProofEvidence.pool === expectedPool &&
      terminalProofEvidence.lpWallet === expectedLpWallet &&
      BigInt(terminalProofEvidence.lpAmount || '0') > 0n
    ) {
      return {
        outcome: TerminalOutcome.TERMINAL_GRADUATED,
        pool: terminalProofEvidence.pool,
        lpWallet: terminalProofEvidence.lpWallet,
        lpAmount: terminalProofEvidence.lpAmount,
        lockedAmount: terminalProofEvidence.lockedAmount || terminalProofEvidence.lpAmount
      };
    }
  }

  // 1. Evaluate LP Mint & Delivery
  if (lpMintEvidence) {
    if (
      lpMintEvidence.verified &&
      lpMintEvidence.recipient === expectedLpWallet &&
      BigInt(lpMintEvidence.amountUnits || '0') > 0n
    ) {
      return {
        outcome: TerminalOutcome.LP_MINTED_AND_DELIVERED,
        lpUnits: lpMintEvidence.amountUnits,
        deliveredTo: expectedLpWallet
      };
    }
  }

  // 2. Evaluate Refunds (TON / Jettons)
  const tonRefunded = tonRefundEvidence?.verified && BigInt(tonRefundEvidence.amountNano || '0') > 0n;
  const jettonRefunded = jettonRefundEvidence?.verified && BigInt(jettonRefundEvidence.amountUnits || '0') > 0n;

  if (tonRefunded && jettonRefunded) {
    return {
      outcome: TerminalOutcome.TON_RETURNED,
      tonReturnedNano: tonRefundEvidence.amountNano,
      jettonsReturnedUnits: jettonRefundEvidence.amountUnits,
      note: 'Both legs fully refunded'
    };
  }
  if (tonRefunded && !jettonRefunded) {
    return {
      outcome: TerminalOutcome.PARTIAL_OR_FAILED_REFUND,
      tonReturnedNano: tonRefundEvidence.amountNano,
      jettonStatus: 'UNREFUNDED_OR_PENDING'
    };
  }
  if (!tonRefunded && jettonRefunded) {
    return {
      outcome: TerminalOutcome.JETTONS_RETURNED,
      jettonsReturnedUnits: jettonRefundEvidence.amountUnits,
      tonStatus: 'UNREFUNDED_OR_PENDING'
    };
  }

  // 3. Evaluate LPAccount Snapshot
  if (lpAccountSnapshot) {
    if (lpAccountSnapshot.pool !== expectedPool || lpAccountSnapshot.user !== expectedDepositor) {
      return { outcome: TerminalOutcome.UNKNOWN_OUTCOME, reason: 'LPAccount binding mismatch' };
    }

    const a0 = BigInt(lpAccountSnapshot.amount0 || '0');
    const a1 = BigInt(lpAccountSnapshot.amount1 || '0');

    if (a0 === 0n && a1 === 0n) {
      return {
        outcome: TerminalOutcome.LP_ACCOUNT_RESET_OR_DELETED,
        reason: 'LPAccount contains zero reserves'
      };
    }
    if (a0 > 0n && a1 > 0n) {
      return {
        outcome: TerminalOutcome.BOTH_LEGS_DEPOSITED,
        amount0: a0.toString(),
        amount1: a1.toString()
      };
    }
    if (a0 > 0n || a1 > 0n) {
      return {
        outcome: TerminalOutcome.PARTIAL_DEPOSIT,
        amount0: a0.toString(),
        amount1: a1.toString(),
        pendingLeg: a0 === 0n ? 'TOKEN0' : 'TOKEN1'
      };
    }
  }

  return { outcome: TerminalOutcome.UNKNOWN_OUTCOME, reason: 'No verified DEX checkpoints' };
}
