# ANLGRAM — TON Development Skills Integration & PR #46 / #47 Technical Review

**Date**: 2026-11-08  
**Branch**: `feat/anlgram-full-platform-integration` (PR #48)  
**Reviewed PRs**:
- **PR #46** (`codex/memelabs-stack-integration`, commit `db0796f`): *Integrate MemeLabs VNext quote, graduation and proxy safeguards*
- **PR #47** (`codex/vnext-release-evidence`, commit `bb4c832`): *VNext: unsigned genesis, proof-bound trading and refund rehearsal*

---

## 1. Official TON Documentation & Skills Consulted

Following the `$ton-blockchain`, `$tolk`, `$acton`, and `$func2tolk` workflows, we consulted primary TON documentation before evaluating and extending the implementation:

1. **Orientation & Architecture** (`https://docs.ton.org/llms/start-here/content.md`, `https://docs.ton.org/llms.txt`)
2. **TEP-74 / TEP-64 Jetton Interface & Getters** (`https://docs.ton.org/llms/contracts/standard/tokens/jettons/api/content.md`):
   - Verified binary layouts for `transfer` (`0x0f8a7ea5`), `internal_transfer` (`0x178d4519`), `transfer_notification` (`0x7362d09c`), `excesses` (`0xd53276db`), `burn` (`0x595f07bc`), `burn_notification` (`0x7bdd97de`), `get_jetton_data`, and `get_wallet_data`.
3. **On-Chain Jetton Processing & Wallet Verification** (`https://docs.ton.org/llms/contracts/techniques/on-chain-jetton-processing/content.md`):
   - Verified `JettonNotify` (`0x7362d09c`) sender authentication in `anlgram-bonding-curve-dispatch-v2.fc` (deterministic `calculate_jetton_wallet_state_init` check during `op::init_launchpad`) and `anlgram-lp-locker-v2.fc` (`stonfi_expected_destinations` check).
4. **Message Sending Modes & Action Phase Semantics** (`https://docs.ton.org/llms/foundations/messages/modes/content.md`):
   - Verified `SEND_MODE_REGULAR (0)`, `SEND_MODE_PAY_FEES_SEPARATELY (+1)`, `SEND_MODE_IGNORE_ERRORS (+2)`, `SEND_MODE_BOUNCE_ON_ACTION_FAIL (+16)`, `SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE (64)`, and `SEND_MODE_CARRY_ALL_BALANCE (128)`.
5. **TVM Compute & Action Phase Exit Codes** (`https://docs.ton.org/llms/tvm/exit-codes/content.md`):
   - Verified Compute Phase vs Action Phase exit codes, specifically Action Phase `37` (`Not enough GRAMs`) and `0xffff` (`65535`).
6. **Tolk & FunC-to-Tolk Binary Layout Rules** (`$tolk`, `$func2tolk`):
   - Preserved 100% of existing FunC financial contracts and bytecode without automatic migration, and authored formal, reference-only Tolk binary layout schemas under [`minter-contract/tolk-schemas/`](file:///e:/ANLGRAM/minter-contract/tolk-schemas/) ([`errors.tolk`](file:///e:/ANLGRAM/minter-contract/tolk-schemas/errors.tolk), [`messages.tolk`](file:///e:/ANLGRAM/minter-contract/tolk-schemas/messages.tolk), [`storage.tolk`](file:///e:/ANLGRAM/minter-contract/tolk-schemas/storage.tolk)).

---

## 2. Review of PR #46 & PR #47 Implementation

### 2.1 What PR #46 & PR #47 Accomplish Correctly
- **PR #46 (`db0796f`)**:
  - Pins `CURVE_CODE_HASH = 5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028` in [`curve-vnext-onchain-quote.js`](file:///e:/ANLGRAM/assets/js/curve-vnext-onchain-quote.js) and verifies exact 1% floor-rounded fee on `consumed` gross TON (`303,030,303,031` gross nanoTON -> `300,000,000,001` net principal, `3,030,303,030` fee).
  - Enforces uncached (`ttl = 0`) proxy routing for `get_buy_quote_v2` with bounded hex `args`.
- **PR #47 (`bb4c832`)**:
  - Introduces [`launchpad-gen2-operations.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/launchpad-gen2-operations.mjs), which defines the 8 single-message unsigned genesis operations sent directly by `c.operator` (`deploy-minter`, `deploy-curve`, `deploy-guard`, `deploy-migration`, `deploy-locker`, `initialize-curve`, `mint-to-curve`, `renounce-and-activate`). **This cleanly bypasses the legacy Factory `op::mint` sender mismatch (F-01) for Generation-2 projects** because the Minter's `admin_address` (`c.operator`) directly dispatches `op::mint (21)` and `op::change_admin (3)`.
  - Introduces [`curve-trade-payload.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/curve-trade-payload.mjs) (`buildCurveTradePayload`, `prepareCurveTrade`, `prepareCurveJettonRefund`), binding trade and Jetton-refund preparation to a fresh (< 30s) registered Curve checkpoint and rejecting reserve-exhausting sells (`gross > reserve`).
  - Extends [`migration-status.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/migration-status.mjs) and [`project-registry.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/project-registry.mjs) with `registrationIdentity` and per-leg `fundingStatus` / `curveReturnStatus`.

### 2.2 Gaps Identified & Remediated in This Integration

1. **Gap 1 — On-Chain `get_sell_quote` Capping vs `recv_internal` Refund Divergence**:
   - In [`anlgram-bonding-curve-dispatch-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc#L1183-L1204), `get_sell_quote` caps `if (gross_ton_out > real_ton_reserve) { gross_ton_out = real_ton_reserve; }`, whereas `recv_internal` (`op::transfer_notification`, line 731) does **not** cap the sell — it triggers a Jetton refund instead.
   - **Fix**: Added `parseCurveState`, `parseSellQuote`, and `quoteSell` to [`curve-vnext-onchain-quote.js`](file:///e:/ANLGRAM/assets/js/curve-vnext-onchain-quote.js#L75-L202) and whitelisted uncached `get_sell_quote` and `get_curve_state` in [`cloudflare-worker/worker.js`](file:///e:/ANLGRAM/cloudflare-worker/worker.js#L51-L61) and [`server.js`](file:///e:/ANLGRAM/server.js#L48-L58). `quoteSell` cross-checks `get_sell_quote` against `get_curve_state` and rejects any sell where `uncapGross > realTonReserve`.

2. **Gap 2 — Sell Action Phase `37` (`Not enough GRAMs`) Solvency Asymmetry**:
   - In [`anlgram-bonding-curve-dispatch-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc#L797-L819), valid sells commit `real_ton_reserve -= gross_ton_out` in Compute Phase and dispatch the payout using `send_raw_message(p_msg.end_cell(), 1)` (`SEND_MODE_PAY_FEES_SEPARATELY` without `+16`). If the Curve account's native TON balance (`walletBalanceNano`) is lower than `real_ton_reserve + accrued_protocol_fees` (e.g. due to storage fees), Compute Phase succeeds (`exitCode = 0`) while Action Phase fails with `resultCode = 37`, burning the seller's reserve and absorbing their Jettons without sending TON.
   - **Fix**: Added an explicit live-balance solvency guard in both [`curve-trade-payload.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/curve-trade-payload.mjs#L64-L70) (`prepareCurveTrade`) and [`curve-vnext-onchain-quote.js`](file:///e:/ANLGRAM/assets/js/curve-vnext-onchain-quote.js#L121-L126) (`parseSellQuote` / `quoteSell`) that rejects sell preparation whenever `walletBalanceNano < realTonReserve + accruedProtocolFees`.

3. **Gap 3 — Frontend Integration of PR #47 `registrationIdentity` and Per-Leg Migration Status**:
   - **Fix**: Updated `window.labsInspectVerifiedProjectRegistry` in [`anl-labs.js`](file:///e:/ANLGRAM/assets/js/anl-labs.js#L3077-L3098) to surface `registrationIdentity`, `settlement`, `tonFundingStatus`, `tonCurveReturnStatus`, `jettonFundingStatus`, and `jettonCurveReturnStatus`.

---

## 3. Contract Hash & StateInit Comparison (Before vs After)

| Contract Artifact | Code Cell Hash (Before) | Code Cell Hash (After) | Status |
| :--- | :--- | :--- | :--- |
| `anlgram-bonding-curve-dispatch-v2.fc` | `5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028` | `5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028` | **IDENTICAL (0 Drift)** |
| `anlgram-migration-router-dispatch-v2.fc` | `8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab` | `8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab` | **IDENTICAL (0 Drift)** |
| `anlgram-guard-vnext.fc` | `b78772e91f1d96b69214bc3b9365702a729098967546950c934e4cf532e076c1` | `b78772e91f1d96b69214bc3b9365702a729098967546950c934e4cf532e076c1` | **IDENTICAL (0 Drift)** |
| `anlgram-lp-locker-v2.fc` | `6d663168bc14896c879144ca43e41446b9e2b3e38a556a414678791843235723` | `6d663168bc14896c879144ca43e41446b9e2b3e38a556a414678791843235723` | **IDENTICAL (0 Drift)** |

---

## 4. Reproducible TVM Gas & Fee Analysis (`@ton/sandbox`)

Measured via [`test-ton-skills-pr46-pr47-audit.js`](file:///e:/ANLGRAM/test-ton-skills-pr46-pr47-audit.js) on real compiled VNext FunC bytecode in `@ton/sandbox`:

| Lifecycle Operation | Opcode | Compute Phase Gas (`gasUsed`) | Contract Tx Total Fees (`totalFees`) | Configured Attachment | Safety Margin |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Curve Buy (`op::buy`)** | `0x5fcc3d14` | `26,744` gas | `1,845,243` nanoTON (`0.001845 TON`) | `gross + 40,000,000` (`0.04 TON` overhead) | `35,000,000` forwarded to Jetton Wallet + `5,000,000` Curve budget; excess returned via mode `144` |
| **Curve Sell (`op::transfer_notification`)** | `0x7362d09c` | `19,533` gas | `1,324,422` nanoTON (`0.001324 TON`) | `150,000,000` (`0.15 TON` on Wallet, `0.05 TON` forward) | `37.7x` compute fee margin inside `0.05 TON` `forward_ton_amount` |
| **Migrator One-Shot Dispatch** | `0x414e5d10` | `127,688` gas | `8,680,620` nanoTON (`0.008681 TON`) | `400,000,000` (`0.40 TON`) | Full 20-tx STON.fi v2.2 Router -> LPAccount -> Pool -> Locker cascade consumes `32,464,008` nanoTON (`0.03246 TON`) total |
| **LP Locker V2 Custody Receipt** | `0x7362d09c` -> `0x414c5635` | `47,437` gas | `3,209,534` nanoTON (`0.003210 TON`) | Funded from Router/Pool LP mint notification | Emits authenticated `0x414c5635` observation receipt back to Migrator |

---

## 5. Unresolved Financial Risks Requiring Codex Contract-Level Resolution Before Opening Gate 414 / Mainnet

1. **Contract-Level Sell Action Phase `37` (`Not enough GRAMs`) Asymmetry (`anlgram-bonding-curve-dispatch-v2.fc:797-819`)**:
   - *Status*: **Mitigated in off-chain preparation (`prepareCurveTrade`) and frontend quote inspection (`quoteSell`)**, but **unresolved in on-chain FunC bytecode** if a user bypasses the UI and sends a direct `0x0f8a7ea5` transfer with `forward_ton_amount = 1` nanoTON when the Curve has no unbooked TON buffer or when network gas prices spike.
   - *Recommended Contract Fix for Codex*: In `op::transfer_notification` (`0x7362d09c`), compute `int sell_forward_bound = buy_forward_fee(1, 1023, 0);` and verify `msg_value >= sell_forward_bound + buy_compute_fee(buy_gas_consumed() + 1000, 0)` **before** deducting `real_ton_reserve -= gross_ton_out`, routing to the Jetton refund branch if `msg_value` cannot self-fund the outbound TON payout.
2. **On-Chain `get_sell_quote` Reserve Capping (`anlgram-bonding-curve-dispatch-v2.fc:1196-1198`)**:
   - *Status*: **Mitigated in `quoteSell` (`curve-vnext-onchain-quote.js`) and `prepareCurveTrade` (`curve-trade-payload.mjs`)**, which both cross-check `gross > real_ton_reserve` and reject before signing. However, third-party callers invoking `get_sell_quote` directly on-chain without comparing `get_curve_state` will see a capped positive payout for an amount that `recv_internal` actually refunds.
3. **STON.fi v2.2 Terminal Settlement & Recovery Gate `414` (`anlgram-migration-router-dispatch-v2.fc`)**:
   - *Status*: **Fail-Closed by Design (`exitCode = 414`)**. `op::complete_migration` (`0x414e4c43`), `op::recover_token_return` (`0x414e4c3c`), and retry (`0x414e5904`) remain sealed with `414` until full STON.fi v2.2 partial-refund / LPAccount re-creation edge cases are finalized and approved.
4. **LP Locker V2 Downstream Recipient Failure vs Direct Wallet Bounce (`anlgram-lp-locker-v2.fc:79-98`)**:
   - *Status*: Verified in `TON Skills Audit 4` that a **direct bounce** from the LP Jetton Wallet (`flags & 1`, `0xffffffff` + `0x0f8a7ea5`) **does** restore `locked`/`free` and resets `pending = 0`. However, if the LP Jetton Wallet is active and accepts `0x0f8a7ea5` while a downstream failure occurs, `pending` remains non-zero by design ("Downstream recipient failure is not inferable here: leave pending, never retry or declare delivered").
5. **Legacy `anlgram-factory.fc` `op::mint` Sender Mismatch (F-01)**:
   - *Status*: **Bypassed for Generation-2 projects** by PR #47's [`launchpad-gen2-operations.mjs`](file:///e:/ANLGRAM/testnet-interface/projects/launchpad-gen2-operations.mjs) (where `c.operator` directly deploys and mints), while legacy `anlgram-factory.fc` remains blocked in [`launchpad.js`](file:///e:/ANLGRAM/assets/js/launchpad.js).


