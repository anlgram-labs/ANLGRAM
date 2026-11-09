# F-04 Independent Audit & LP Locker Withdrawal Reconciliation Architecture

**Date**: 2026-11-09  
**Auditor**: Lead Engineering Agent (Antigravity)  
**Target PR**: [PR #55](https://github.com/anlgram-labs/ANLGRAM/pull/55) (`codex/f04-lp-withdrawal-evidence`)  
**Status**: **VERIFIED & EXTENDED WITH LOCKER V3 CANDIDATE ARCHITECTURE**  
**Execution Gate**: **Gate 414 Sealed, No Mainnet/Testnet Auto-Deploy**

---

## 1. Executive Summary & Audit of PR #55

PR #55 correctly verified the read-only evidence boundaries for the third withdrawal outcome: when a downstream recipient wallet fails or is frozen, the STON.fi LP wallet returns the LP balance to the Locker's source LP wallet via an internal transfer bounce. However, the deployed Locker V2:
1. **Leaves `pending` Unresolved**: Locker V2 only handles immediate bounces of its own direct messages; it cannot infer a downstream wallet-to-recipient bounce without an authenticated on-chain protocol.
2. **Cannot Distinguish Foreign Return from Genuine Excess**: A standard `0xd53276db` excess message carries no balance or custody proof.
3. **Cannot Re-Arm or Re-Withdraw Safely in V2**: Unlocking the returned balance directly on the Locker would risk double-spend if the recipient wallet subsequently recovers or if the return evidence was falsified.

To solve this without modifying deployed, immutable Locker instances, we designed and TVM Sandbox-verified **Locker V3** paired with a per-request **LP Withdrawal Escrow** contract candidate.

---

## 2. Safe Reconciliation Architecture: Locker V3 + LP Withdrawal Escrow

### 2.1 The Two-Leg Escrow Mechanism
Instead of sending LP tokens directly from the Locker's LP wallet to the final recipient, Locker V3 routes through a dedicated, deterministic per-request Escrow:

1. **Deterministic Address Commitment**:
   $$\text{Escrow StateInit} = f(\text{Locker Address}, \text{Recipient}, \text{Pool}, q, \text{Amount}, \text{LP Wallet Code})$$
   Every parameter is cryptographically bound in StateInit before any tokens move.
2. **Atomic One-Hop Handshake**:
   - The claimant sends `op::withdraw` (`0x414c5633`) with required gas ($\ge 0.40$ TON).
   - Locker V3 reserves old balance, debits `locked` or `free`, increments `pending`, and simultaneously:
     - Deploys and arms the Escrow with `op::arm` (`0x414c563c`).
     - Dispatches `op::transfer` (`0x0f8a7ea5`) to the Locker's LP wallet destined for the Escrow.
3. **Escrow Custody & Authenticated Acknowledgement**:
   - The Escrow's own authentic LP wallet credits the tokens and emits `op::transfer_notification` (`0x7362d09c`) to the Escrow.
   - The Escrow verifies the notification sender is its exact derived LP wallet.
   - The Escrow sends an authenticated `op::escrowed` (`0x414c563a`) acknowledgement to Locker V3.
   - Locker V3 accepts `op::escrowed` **only from the exact derived Escrow address**, transitioning `status = 1` and decrementing `pending -= amount`.
4. **Resilient Recipient Delivery & Failure Isolation**:
   - The Escrow immediately initiates transfer to the final `recipient`.
   - If the recipient wallet is frozen, active balance exceeds limits, or otherwise fails, **the bounce returns LP tokens to the Escrow's LP wallet, never stranding them in the Locker or affecting Locker state**.
   - The recipient can safely call `op::deliver` (`0x414c563d`) on the Escrow to retry delivery once unblocked.
   - Because the Escrow holds exactly `amount` LP tokens in its wallet, **double-withdrawal is physically impossible** on the TVM.

---

## 3. Bytecode Hashes & Artifact Verification

Compiled with standard FunC via `minter-contract/compile-lp-locker-v3.js --check`:

| Contract | Source File | SHA-256 Code Cell Hash | Status |
| :--- | :--- | :--- | :--- |
| **LP Locker V3 (Candidate)** | `minter-contract/contracts/anlgram-lp-locker-v3.fc` | `f050b7f34d3f3423eb86fc1c6fd502656074302b42bc156be9ad279c0f8f25d6` | **VERIFIED** |
| **LP Withdrawal Escrow (Candidate)** | `minter-contract/contracts/anlgram-lp-withdrawal-escrow.fc` | `4c124ff106170ecab4dd186bb1178c662db07e23d3937785c23e26f84faa15f9` | **VERIFIED** |
| **Deployed Locker V2 (Unmodified Baseline)** | `minter-contract/contracts/anlgram-lp-locker-v2.fc` | `6d663168bc14896c879144ca43e41446b9e2b3e38a556a414678791843235723` | **PRESERVED** |

`financialDeploymentAuthorized`: `false`.

---

## 4. Reproducible TVM Sandbox Verification Results

### 4.1 Locker V3 Sandbox Test Suite (`lp-locker-v3.test.js`)
```sh
node --test --test-concurrency=1 tests/settlement-runtime/lp-locker-v3.test.js
```
- ✔ **delivery**: escrow is authenticated by its own LP wallet, recipient receives exactly the request, Locker pending clears once (`2261ms`)
- ✔ **recipient failure cannot strand principal**: it stays in the escrow, is retry-safe, and never double-pays (`677ms`)
- ✔ **forged acknowledgement, notification, excess, replay and unauthorized withdrawal are rejected** (`493ms`)
- ✔ **duration, amount ceilings and controller rights are preserved; no reuse of withdrawn principal** (`484ms`)
- ✔ **underfunded withdrawal is rejected before any state change** (`292ms`)
- **Result: 5/5 PASSED (0 failures, 0 skips)**.

### 4.2 Baseline Regression Verification
```sh
node --test --test-concurrency=1 tests/settlement-runtime/stonfi-locker-v2-real.test.js testnet-interface/test/generation2-status.test.mjs
```
- **Result: 14/14 PASSED (0 failures, 0 skips)**.

---

## 5. Deployment and Migration Requirements

1. **Zero Impact on Active Pools**: Deployed V1/V2 Lockers remain untouched and retain their existing immutable guarantees.
2. **Future Project Configuration**: New projects opting into the V3 architecture configure `escrow_code` in their genesis StateInit parameters.
3. **No Central Authority**: Escrows are 100% permissionless, single-use, non-upgradeable, and self-cleaning upon token delivery.
