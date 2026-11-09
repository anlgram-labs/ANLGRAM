# F-02 Independent Audit & STON.fi v2.2 Terminal Settlement Specification

**Date**: 2026-11-09  
**Auditor**: Lead Engineering Agent (Antigravity)  
**Branch**: `audit/antigravity-f02-stonfi-settlement`  
**Status**: **8 TERMINAL SETTLEMENT OUTCOMES VERIFIED — GATE 414 SEALED**

---

## 1. Executive Summary & Architecture Overview

In decentralized liquidity provision via STON.fi v2.2, liquidity migration involves an asynchronous two-leg deposit (`Asset 0`: pTON, `Asset 1`: Jetton) routed via `Router` into an intermediate `LPAccount` contract.

Historically:
- The ANLGRAM migration router locked its state upon receiving the initial LP custody notification, or threw `414` on `op::finalize_migration`.
- Previous assumptions failed to distinguish between partial deposits, full liquidity provisioning, asymmetric refunds, or LPAccount deletion.
- **LP custody alone does NOT prove terminal settlement**; an LP mint notification can arrive while pTON or Jetton excess or partial refunds are still unresolved, or while an LPAccount retains unrefunded residual principal.

---

## 2. The 8 Discrete Terminal Outcomes

Under this specification, off-chain projection and on-chain verification distinguish exactly 8 mutually exclusive states:

| State Code | Outcome Identifier | Condition & Invariants |
| :--- | :--- | :--- |
| **State 1** | `BOTH_LEGS_DEPOSITED` | `amount0 > 0 && amount1 > 0` accounted in the authentic `LPAccount`. Ready for Pool mint. |
| **State 2** | `PARTIAL_DEPOSIT` | `(amount0 > 0 ^ amount1 > 0)`. One leg received; other leg in-flight, failed, or pending. |
| **State 3** | `LP_MINTED_AND_DELIVERED` | Pool has minted LP and the authentic LP Locker wallet has received and verified delivery. |
| **State 4** | `TON_RETURNED` | Both legs refunded via `refund_me`; exact TON and Jetton balances returned to depositor. |
| **State 5** | `JETTONS_RETURNED` | Only Jettons returned from `LPAccount`; TON remains in-flight or held. |
| **State 6** | `PARTIAL_OR_FAILED_REFUND` | Only TON returned while Jetton leg failed or remains unrefunded. |
| **State 7** | `LP_ACCOUNT_RESET_OR_DELETED` | `amount0 == 0 && amount1 == 0`. Account reset after successful mint or complete refund. |
| **State 8** | `UNKNOWN_OUTCOME` | Mismatched pool, forged message, unauthorized query ID, or missing checkpoint proof. |

---

## 3. Implementation Artifacts

1. **Evaluator Specification**:
   - [`testnet-interface/projects/stonfi-terminal-settlement.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/stonfi-terminal-settlement.mjs): Pure reference evaluator consuming verified DEX checkpoints and emitting `TerminalOutcome`.
2. **FunC Contract Guards**:
   - [`minter-contract/contracts/imports/stonfi-terminal-settlement.fc`](file:///e:/ANLGRAM/minter-contract/contracts/imports/stonfi-terminal-settlement.fc): Contract-level validation functions computing authentic `LPAccount` StateInit and verifying state transitions.
3. **Gate 414 Invariant**:
   - `anlgram-migration-router-dispatch-v2.fc` line 384 continues to enforce `throw(414);` on `op::finalize_migration`. **Gate 414 remains strictly closed.**

---

## 4. Test Matrix & Verification

Executed with Node.js test runner in `tests/settlement-runtime/`:
```sh
node --test tests/settlement-runtime/stonfi-terminal-settlement.test.js
```
- ✔ **F-02 State 1: Both liquidity legs deposited into LPAccount** (`1.16ms`)
- ✔ **F-02 State 2: Partial liquidity deposit (one leg only)** (`0.17ms`)
- ✔ **F-02 State 3: LP minted and delivered to authorized LP wallet** (`0.17ms`)
- ✔ **F-02 State 4: Both legs refunded (TON & Jettons returned)** (`0.17ms`)
- ✔ **F-02 State 5: Only Jettons refunded (partial refund)** (`0.17ms`)
- ✔ **F-02 State 6: Only TON refunded while Jettons failed/unrefunded** (`0.16ms`)
- ✔ **F-02 State 7: LPAccount reset or deleted (0 reserves)** (`0.15ms`)
- ✔ **F-02 State 8: Unknown outcome on mismatched pool or unverified claims** (`0.13ms`)

**Result: 8/8 PASSED (0 failures, 0 skips)**.
