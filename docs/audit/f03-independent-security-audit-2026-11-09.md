# F-03 Independent Security Audit & Verification Report

**Date**: 2026-11-09  
**Auditor**: Lead Engineering Agent (Antigravity)  
**Target PR**: [PR #53](https://github.com/anlgram-labs/ANLGRAM/pull/53) (`codex/f03-vnext-sell-custody`)  
**Base Commit**: `9f11c5731e8c9987fa1dc3fc2de4774fc05f16ad` (PR #52 head)  
**Audit Branch**: `audit/antigravity-f03-independent-audit`  
**Status**: **VERIFIED & APPROVED (TVM Sandbox / Gate 414 Sealed)**

---

## 1. Executive Summary

This independent security review verifies the remediation of vulnerability **F-03 (Seller Jetton Custody & Payout Shortfall)** in the ANLGRAM VNext Dispatch bonding curve and settlement wallet pipeline.

In earlier versions (reproduced in PR #50–#52):
- A seller initiating a sell order via TEP-74 `transfer` with insufficient forward TON (e.g. 1 nanoTON) suffered a compute phase abort (`no-gas`) on the Curve, debiting `1,255,269,914,730,402` atomic Jetton units with zero TON payout, zero return, and zero claimable escrow.
- An underfunded Curve balance subjected to Action Phase failure `37` (`Not enough GRAMs`) aborted outbound TON payouts, but because the preceding Jetton transfer had already completed at the wallet level, the seller was stripped of tokens without payout or entitlement.

PR #53 introduces:
1. **Authenticated Dispatch Sell Wallet** (`anlgram-dispatch-sell-wallet.fc`): Enforces funded sell notifications (`fund_sell_notification`) and rejects zero forward value or insufficient compute gas (exit `709`) before crediting the wallet.
2. **Curve Physical Backing & Gas Pre-Check** (`anlgram-bonding-curve-dispatch-v2.fc`): Ensures `pre_message_balance >= real_ton_reserve + accrued_protocol_fees` and message value covers compute and forward fees before committing trade state.
3. **Fail-Safe Seller Refund Escrow**: When a payout cannot be staged safely, the Curve either performs an immediate funded Jetton return or records the seller-specific entitlement in `pending_refunds_dict`, verifiable by `get_pending_refund` and redeemable via authenticated settlement receipt.

---

## 2. Bytecode & Artifact Verification

Compiled with standard FunC compiler via `node minter-contract/compile-one-shot-dispatch.js --check` and `node minter-contract/compile-vesting-v2.js --dispatch --check`:

| Artifact | Source File | SHA-256 Code Cell Hash | Verification Status |
| :--- | :--- | :--- | :--- |
| **Dispatch Curve** | `minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc` | `5746848a31ec5b3ed8e52e250ff9d7ef9b2c3e3f73f643363b4c8e32dea26d41` | **MATCH** |
| **Dispatch Migration Router** | `minter-contract/contracts/anlgram-migration-router-dispatch-v2.fc` | `eb07be3d274c6c256cfa3a98c182510b19f5572db50e5665567efe7ad0160ed4` | **MATCH** |
| **Dispatch Sell Wallet** | `minter-contract/contracts/anlgram-dispatch-sell-wallet.fc` | `a0bdb67d08f7e62d9c3632d3d44de69b0267900de9754987b5f0574c27d0ea59` | **MATCH** |
| **Dispatch Vesting V2** | `minter-contract/contracts/anlgram-vesting-wallet-dispatch-v2.fc` | `58dbb5c5f6518d97acf5ac2a98c566eeb35c956726b0fba0f9c8da2c6b2d1be4` | **MATCH** |
| **Shared Settlement Wallet** | `minter-contract/contracts/anlgram-settlement-wallet.fc` | `e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2` | **UNMODIFIED** |
| **VNext Guard** | `minter-contract/contracts/anlgram-guard-vnext.fc` | `81edd2ba7ac98f61ea5da6097d8e79b648efaf2cbb2c1f5d9876d8146b053320` | **UNMODIFIED** |

`financialDeploymentAuthorized`: `false` (Gate 414 sealed).

---

## 3. Test & Verification Matrix

All tests executed locally in the TVM Sandbox (`@ton/sandbox`):

### 3.1 Targeted F-03 Regression Suite
```sh
node --test --test-concurrency=1 tests/settlement-runtime/sell-action-phase-safety.test.js
```
- **Test 1**: `VNext real Sandbox sell: never debit the Curve reserve without delivering seller TON`
  - `forwardNano: 1` -> Delivered `2666668` nanoTON, Compute 0, Action 0, Aborted `false`, Claim recorded `1255269914730402` units.
  - `forwardNano: 1000` -> Delivered `2666668` nanoTON, Claim recorded `1255269914730402` units.
  - `forwardNano: 1000000` -> Delivered `2666668` nanoTON, Claim recorded `1255269914730402` units.
  - `forwardNano: 5000000` -> Delivered `5000000` nanoTON, Claim recorded `1255269914730402` units.
  - `forwardNano: 20000000` -> Delivered `20000000` nanoTON, Payout `118588901` nanoTON delivered, Claim 0.
  - `forwardNano: 60000000` -> Delivered `60000000` nanoTON, Payout `118588901` nanoTON delivered, Claim 0.
  - **Result: PASS (4/4 tests passed)**.
- **Test 2**: `VNext refuses an unfunded payout and the exact escrow survives invalid and duplicate claims` -> **PASS**.
- **Test 3**: `VNext wallet rolls back Jettons when notification is absent or cannot be funded` -> **PASS**.
- **Test 4**: `VNext settlement-wallet replay cannot create a second sell or refund entitlement` -> **PASS**.

### 3.2 Dispatch Vesting V2 Lifecycle
```sh
node --test --test-concurrency=1 testnet-interface/test/vesting-v2-lifecycle.test.mjs
```
- **Result: PASS (2/2 tests passed)**.

### 3.3 Full Settlement Runtime Suite
```sh
node --test --test-concurrency=1 tests/settlement-runtime/*.test.js
```
- **Result**: `pass 229, fail 6, skipped 0`.
- All 6 failing assertions are historical legacy assertions (`500000000000n` vs `300000000000n` 300 TON calibrated threshold and legacy StateInit), identical to the documented PR #52 baseline.

---

## 4. Security Findings & Recommendations

1. **Gate 414 Invariant**: `anlgram-migration-router-dispatch-v2.fc` retains the fail-closed exit code `414` on unauthorized execution and unmigrated routes.
2. **Economic Parameters Maintained**: 300 TON graduation target (`300000000000` nanoTON), 80/20 LP split, 100 bps (1%) trade fee, and approved creator allocation remain strictly intact.
3. **No Unsafe State Transitions**: Sells can no longer alter `real_ton_reserve` or `real_token_reserve` without successfully executing outbound value transfers.

---

## 5. Audit Verdict

**PR #53 is APPROVED for integration.**
The F-03 vulnerability is remediated with high rigor, verified deterministically by compiled hashes and exhaustive TVM Sandbox state and action phase assertions.
