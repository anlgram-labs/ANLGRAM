# F-03: seller Jetton custody — reproduced failure, release blocker

Evidence scope: **source-compiled FunC/TVM Sandbox only**. No live on-chain transaction, authenticated external receipt, or recovery is claimed.

- Base: PR #50 commit `4f81d35b342c5bedc0d0208dbb1749898a0a22cd`.
- CI: https://github.com/anlgram-labs/ANLGRAM/actions/runs/42564337572 — failure, 33 passed / 1 failed.
- Test: `tests/settlement-runtime/sell-action-phase-safety.test.js`.
- Reproduction: `npm ci` in `testnet-interface`, `minter-contract`, `tests/settlement-runtime`, then from repo root `node minter-contract/compile-one-shot-dispatch.js --check` and `node --test --test-concurrency=1 tests/settlement-runtime/sell-action-phase-safety.test.js`.
- Observed forward TON: **1 nanoton**.
- Seller Jetton debit: **1,255,269,914,730,402 atomic units**.
- Curve reserve change: **0**. Aggregate pending escrow change: **0**. Seller TON payout: **0**. Curve notification: **aborted**; action result was not present in the failure message. Do not label this specifically Action Phase 37 without a trace.
- Exact failure: `CUSTODY VIOLATION: seller lost tokens without a verified return or pending escrow`.

## Required isolated remediation evidence

1. Trace seller Jetton wallet transfer, Curve Jetton wallet internal transfer, notification compute/action/bounce flags and all downstream transactions, with exact owner, wallet and operation binding.
2. A no-booked-sale outcome is safe **only** if the seller's actual Jetton wallet balance is restored by an authenticated return, or a seller-keyed `get_pending_refund` entry exists, is owner-claimable and a claim on a separate Sandbox snapshot restores actual Jettons and clears both seller liability and aggregate. An aggregate `get_curve_state()[7]` delta alone is insufficient.
3. Include negative tests for 1, 1,000, 1,000,000, 5,000,000, 20,000,000 and 60,000,000 nanoton forward values, failure after Jetton transfer, malformed sender, replay, and insufficient claim gas. Preserve the original red regression; do not skip, relax, mock, or suppress it.
4. If a contract change is needed, implement it on a **separate review branch** and verify deterministic compiled hashes, all existing TVM tests, gas/action semantics and new custody tests before requesting independent review. Do not silently change the approved financial bytecode.
5. Cross-check PR #48 audit F-03, PR #49 native no-funds bounce evidence, F-01 Factory authority, F-02 two-leg STON.fi terminal settlement, F-04 LP Locker pending and F-05 legacy Curve drift.

## Release constraints

Mainnet financial **NO-GO**; Gate 414 closed; historical Curve #2 closed. No merge, deploy, signing, transfer, secret changes, or liquidity unlock. Preserve 300 TON graduation, 80/20, 1% fee and approved donation. All unproven live balances, receipts, refunds and final DEX outcomes remain **UNKNOWN**.

This document is a diagnostic checkpoint, **not** a fix, proof of a successful refund, or approval to release.
