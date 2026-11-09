# ANLGRAM Independent TON Smart-Contract & Frontend Security Review

- **Audit Date:** 2026-11-08
- **Repository:** `https://github.com/anlgram-labs/ANLGRAM`
- **Reviewed Baseline:** `codex/memelabs-stack-integration` (`db0796f`, PR #46) + `origin/main` (`b57850b`) unified on `feat/anlgram-full-platform-integration`
- **Independent Release Verdict:** **FAIL / HOLD FOR FINANCIAL LAUNCH** — Keep all Mainnet and Testnet financial production gates **CLOSED** (`financialSigningEnabled = false`, `CREATION_MAINNET_APPROVED = false`, `MONETIZATION_PAYMENTS_ENABLED = false`) until smart-contract findings **F-01** through **F-05** are resolved and re-verified.

---

## 1. Executive Summary & 14-Point Security Audit Scope Matrix

| # | Audit Scope Area | Verdict | Summary of Evidence & Findings |
|---|---|---|---|
| **1** | Jetton V5 minter and factory initialization | **FAIL (Blocked in UI)** | `jetton-minter-launchpad.fc` and V5 candidate `testnet-v5-candidate.json` are verified (`PASS`), but `anlgram-factory.fc` has a critical mint-authority defect (**F-01**, exit code `73`) and fee-base overcharge. Factory is fail-closed in `assets/js/launchpad.js:187`. |
| **2** | Creator and administrator permissions | **PASS (with F-07 Low)** | `jetton-minter-launchpad.fc` enforces irreversible `op::change_admin` (`3`) to `addr_none` and emits `op::admin_changed_notification` (`0x7a3e810f`). `anlgram-bonding-curve-dispatch-v2.fc` verifies `reported_admin.preload_uint(2) == 0` and 1B supply before `STATE_ACTIVE`. |
| **3** | Verified deployment manifests and contract identities | **PASS (Isolated RC)** | `docs/launchpad/testnet-v5-candidate.json` code/data/stateInit SHA-256 hashes match compiled artifacts (`PR #37`). `docs/launchpad/testnet-v5-release-candidate.json` has a documented `guard` include hash mismatch and is isolated with `broadcastEnabled: false`, `readyForSigning: false`. |
| **4** | Curve VNext arithmetic and 300 TON graduation | **PASS on `dispatch-v2` / FAIL on legacy `vnext` (F-05)** | `anlgram-bonding-curve-dispatch-v2.fc:289` (`PR #38`) graduates strictly on `out == inventory` (`303,030,303,031` gross / `300,000,000,001` net nanoTON), preventing the 1-atomic-unit premature graduation deadlock. Unpatched sibling `anlgram-bonding-curve-vnext.fc` retains the old bug (**F-05**). |
| **5** | Fee calculations, rounding, slippage, and tx-value accounting | **PASS on `dispatch-v2` / FAIL on Factory (F-01)** | `dispatch-v2.fc:284` (`PR #38`) fixes the 1-nanoTON capped buy fee inversion (`consumed = ((net - 1) * 10000) / 9900 + 1`). `anlgram-factory.fc:185-188` taxes `rate%` of `msg_value - factory_execution_gas()` instead of a fixed base (**F-01**). |
| **6** | Buy/sell execution and Jetton delivery | **FAIL (F-03 Medium)** | Buy path uses `settlement-wallet-code.fc` delivery receipts and bounce recovery (`0x42555944` / `0x444f4e45`). However, valid sell TON payouts (`dispatch-v2.fc:810-819`) use mode `1` without `raw_reserve` or mode `+16` (**F-03**). |
| **7** | Buyer-principal safety during action failure without a bounce | **PASS on Buy / FAIL on Sell (F-03)** | `dispatch-v2.fc:932-991` (`PR #38`) enforces bounceable workchain-0 sender, dynamic `GETFORWARDFEE`/`GETGASFEE` bounds, `raw_reserve(..., 16)`, and send modes `17`/`144`. Valid sell path lacks mode `+16` (**F-03**). |
| **8** | Refund authentication, replay resistance, and double-claim protection | **PASS** | `dispatch-v2.fc:878-908` deletes `seller_hash` from `pending_refunds_dict` before staging delivery under `buy_delivery_key(cur_lt())` and restores credit only on an authenticated `curve_jetton_wallet` bounce (`0xffffffff`). |
| **9** | STON.fi v2.2 Router and LPAccount integration | **FAIL-CLOSED (F-02 Blocker)** | `anlgram-migration-router-dispatch-v2.fc` pins STON.fi v2.2 Router (`kQCas2p939...`) and `LPAccount` code hash (`9212a872...`), but completion and recovery intentionally throw exit `414` (`ERROR_UNSAFE_COMPLETION_DISABLED`) because `LPAccount` can be destroyed/recreated at the same address without a terminal proof. |
| **10** | Both liquidity deposit legs and returned asset recovery | **FAIL-CLOSED (F-02 Blocker)** | Router tracks `pending_ton` and `pending_tokens` across native pTON (`0x01f3835d`) and Jetton (`0x0f8a7ea5`) legs, but post-DEX recovery (`migration-vnext-recovery.fc:28`) throws `414` until an authenticated STON.fi v2.2 terminal settlement proof exists. |
| **11** | LP minting, lock custody, unlock eligibility, and withdrawal correctness | **FAIL (F-04 Medium)** | `anlgram-lp-locker-v2.fc:139-169` increments `pending` on withdrawal (`0x414c5633`) and ignores `0xd53276db` (`op::excesses`). Because foreign STON.fi LP wallets do not emit `sop::receipt`, `pending` is never cleared on success and downstream recipient bounces strand LP tokens in `pending`. |
| **12** | `ton_proof`, wallet sessions, API permissions, Cloudflare Worker, Telegram auth | **PASS (Fixed in Branch)** | Fixed `"No se pudo preparar la prueba"` in `testnet-interface/worker.mjs` and `testnet-interface/app.js`, synchronized all 5 Durable Objects (`PROOFS`, `OPERATIONS`, `TESTNET_READS`, `CURVE_OPERATIONS`, `PROJECT_REGISTRY`) across all 3 `wrangler.toml` configs, and hardened `POST /api/upload-logo` (**F-06**). |
| **13** | Mainnet/Testnet separation | **PASS (Fixed in Branch)** | Fixed `assets/js/wallet-connect.js` (`getConnectedWalletChainId` / `getChainNetwork`) so connected wallets with unknown chains fail closed (`null`) and raw `0:...` addresses are never assumed to be Mainnet `-239` (**F-08**). |
| **14** | False financial confirmations, stale quotes, and fabricated displays | **PASS (Fixed in Branch)** | Fixed `cloudflare-worker/worker.js` `Cache-Control: no-store` on `ttl=0` (`get_buy_quote_v2`), replaced unverified mint confirmation in `memecoin-platform.html` (`mintMoreTokensWeb3`) with on-chain supply verification, and disabled dead helpers in `assets/js/launchpad.js`. |

---

## 2. Detailed Security Findings

### Finding F-01 (HIGH — Smart Contract, Blocked in Frontend)
- **Title:** `anlgram-factory.fc` Sets Creator as Minter Admin Prior to Initial Mint (Guaranteed Exit Code `73`) and Overcharges Platform Fee on Excess Gas
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-factory.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-factory.fc#L109-L255) (`build_jetton_state_init`, `recv_internal` `op::create_jetton`)
  - [`minter-contract/contracts/jetton-minter.fc`](file:///e:/ANLGRAM/minter-contract/contracts/jetton-minter.fc#L69-L75) (`recv_internal` `op::mint()`)
- **Attack / Failure Scenario:**
  1. In `anlgram-factory.fc:203`, the Factory constructs the Jetton Master `StateInit` with `owner_addr` (the user wallet) as `admin_address`.
  2. Immediately afterward (`anlgram-factory.fc:238-254`), the Factory sends `op::mint` (`21`) from its own address (`sender_address = my_address()`) to `jetton_master_addr`.
  3. `jetton-minter.fc:71` executes `throw_unless(73, equal_slices(sender_address, admin_address));`. Because `sender_address` is the Factory and `admin_address` is `owner_addr`, the initial mint **always aborts with TVM exit code `73`**, leaving the user with a 0-supply Jetton Master while the Factory still forwards `platform_fee` to `treasury` in message #3 (`anlgram-factory.fc:258-267`).
  4. Furthermore, `anlgram-factory.fc:185-188` calculates `available = msg_value - const::factory_execution_gas()` and `platform_fee = muldiv(available, rate, 100)`, taxing any extra gas attached by the caller rather than charging a fixed fee on the base execution cost.
- **Reproducible Test Steps:**
  ```bash
  node --test test-mission2-adversarial-security.js
  ```
  See test: `Mission 2 Audit [F-01 HIGH]: anlgram-factory.fc sets owner_addr as Minter admin in StateInit then sends op::mint (21) from Factory, causing jetton-minter.fc exit code 73, and launchpad.js blocks execution`.
- **Smallest Safe Correction:**
  - Keep Factory execution disabled in `assets/js/launchpad.js:187` (`Factory creation requires verified donation routing and explicit production approval`).
  - Before any future Factory deployment, either (a) bundle `StateInit` + initial `op::mint` in the initial deploy message or set `my_address()` as temporary admin and transfer admin to `owner_addr` inside the mint message, and (b) compute `platform_fee` strictly against the fixed base cost (`const::deploy_gas() + const::mint_gas()`).

---

### Finding F-02 (HIGH / Launch Blocker — Fail-Closed by Design)
- **Title:** STON.fi v2.2 Migration Finalization and Recovery Intentionally Fail Closed (`Exit Code 414`) Pending Terminal `LPAccount` Proof
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-migration-router-dispatch-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-migration-router-dispatch-v2.fc#L380-L385) (`op::finalize_migration`)
  - [`minter-contract/contracts/imports/migration-vnext-recovery.fc`](file:///e:/ANLGRAM/minter-contract/contracts/imports/migration-vnext-recovery.fc#L20-L35)
  - [`minter-contract/contracts/imports/migration-dispatch-control-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/imports/migration-dispatch-control-v2.fc#L1-L15)
- **Attack / Failure Scenario:**
  - STON.fi v2.2 `Router` routes two-leg liquidity additions through a per-user `LPAccount` contract that can be destroyed (`refund_me`) or recreated at the same deterministic address across attempts.
  - Without an authenticated terminal message proving whether the `LPAccount` minted LP tokens to the Locker or refunded the underlying legs, allowing automatic retry or timeout recovery could double-spend or strand graduated principal (`300 TON` + `200M Jettons`).
  - Codex therefore hard-coded `throw(414)` (`ERROR_UNSAFE_COMPLETION_DISABLED`) on finalization and recovery paths.
- **Reproducible Test Steps:**
  ```bash
  node --test test-mission2-adversarial-security.js
  node --test testnet-interface/test/generation2-status.test.mjs
  ```
- **Smallest Safe Correction:**
  - Keep migration dispatch and trading gates closed (`financialSigningEnabled = false`) until a dedicated STON.fi v2.2 `LPAccount` state/getter probe or authenticated LP mint/refund callback verifier is audited in sandbox.

---

### Finding F-03 (MEDIUM — Smart Contract)
- **Title:** Valid Sell Order TON Payout in `anlgram-bonding-curve-dispatch-v2.fc` Lacks Action Phase `37` Bounce/Reserve Protection
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc#L797-L820) (`recv_internal` `op::transfer_notification` sell branch)
- **Attack / Failure Scenario:**
  - In PR #38, the `op::buy` path (`lines 932-991`) was hardened with workchain-0 validation, dynamic `buy_forward_fee`/`buy_compute_fee` bounds, `raw_reserve(..., 16)`, and `SEND_MODE_BOUNCE_ON_ACTION_FAIL` (`+16`) so an Action Phase `37` failure rolls back and bounces the buyer's TON.
  - By contrast, when a seller transfers Jettons to `curve_jetton_wallet` (`op::transfer_notification`), `lines 798-819` deduct `real_ton_reserve -= gross_ton_out`, credit `real_token_reserve += token_amount`, call `save_data(...)`, and send `net_ton_out` via `send_raw_message(p_msg.end_cell(), 1)` (mode `1`, without mode `+16`, without `raw_reserve`, and without checking `from_address` workchain).
  - If `msg_value` remaining after compute fees is insufficient to cover the outbound message forwarding fee (e.g., if `from_address` is a masterchain `-1` address or network forward fees spike) and the contract has no unreserved buffer, Action Phase fails with result code `37` **without** mode `+16`. Even if mode `+16` were set, a bounce of `op::transfer_notification` back to `curve_jetton_wallet` does **not** return Jettons to `from_address` because `jetton-wallet.fc` only handles bounces of `op::internal_transfer` (`0x178d4519`) and `op::burn_notification` (`0x7bdd97de`), not `op::transfer_notification` (`0x7362d09c`).
- **Reproducible Test Steps:**
  ```bash
  node --test test-mission2-adversarial-security.js
  ```
  See test: `Mission 2 Audit [F-03 MEDIUM]: anlgram-bonding-curve-dispatch-v2.fc valid sell payout asymmetry vs buy path Action Phase 37 protection`.
- **Smallest Safe Correction:**
  - Before executing the valid sell state update (`line 797`), check `(int seller_wc, _) = parse_std_addr(from_address)` and verify `seller_wc == 0` AND `msg_value >= buy_forward_fee(1, 512, 0) + buy_compute_fee(buy_gas_consumed() + 1500, 0) + 10000000`. If either check fails, route the sell into the existing `pending_refunds_dict` escrow branch (`lines 774-794`) so the seller can safely claim their Jettons back via `op::claim_refund`.

---

### Finding F-04 (MEDIUM — Smart Contract)
- **Title:** `anlgram-lp-locker-v2.fc` Withdrawal (`0x414c5633`) Leaves `pending` Unresolved on Success and Strands LP Tokens on Downstream Recipient Bounce
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-lp-locker-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-lp-locker-v2.fc#L79-L98) and [`lines 139-169`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-lp-locker-v2.fc#L139-L169)
  - [`minter-contract/contracts/imports/lp-v2-receipt.fc`](file:///e:/ANLGRAM/minter-contract/contracts/imports/lp-v2-receipt.fc)
- **Attack / Failure Scenario:**
  1. When `beneficiary` or `controller` withdraws unlocked/free LP tokens via `op == 0x414c5633`, `anlgram-lp-locker-v2.fc:157-163` moves `amount` from `locked`/`free` into `pending` (`pending + amount`) and sends standard TEP-74 `0x0f8a7ea5` (`op::transfer`) to the STON.fi LP Jetton wallet (`wallet`).
  2. Foreign STON.fi LP Jetton wallets implement standard TEP-74: on successful delivery they send `0xd53276db` (`op::excesses`) to `response_destination` (`my_address()`), **not** custom `sop::receipt`. Because `line 167` ignores `0xd53276db`, `pending` is never decremented on normal STON.fi LP transfers.
  3. Worse, if the Locker's LP wallet (`wallet`) processes `0x0f8a7ea5` and sends `0x178d4519` (`op::internal_transfer`) to the recipient's LP wallet, and *that* message bounces back to `wallet`, `wallet` re-credits the Locker's LP balance and sends `0xd53276db` (`op::excesses`) to the Locker (`response_destination`). Because the Locker only restores `locked`/`free` on a direct `0xffffffff` bounce of `0x0f8a7ea5` (`lines 79-98`), those re-credited LP tokens remain permanently stranded in `pending` with no withdrawal path.
- **Reproducible Test Steps:**
  ```bash
  node --test test-mission2-adversarial-security.js
  ```
  See test: `Mission 2 Audit [F-04 MEDIUM]: anlgram-lp-locker-v2.fc withdrawal sets pending + amount before external LP wallet transfer without downstream bounce recovery`.
- **Smallest Safe Correction:**
  - Add an authenticated post-withdrawal reconciliation query (`op::reconcile_lp_balance`) that calls `get_wallet_data` / `provide_wallet_balance` on `wallet` after a cooldown window and reconciles `locked + free` against the actual on-chain LP wallet balance when `pending > 0`.

---

### Finding F-05 (MEDIUM — Codebase Hygiene / Contract Drift)
- **Title:** Unpatched Sibling `anlgram-bonding-curve-vnext.fc` Retains Pre-PR#38 Premature 300 TON Graduation & Capped Fee Inversion Bugs
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-bonding-curve-vnext.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-bonding-curve-vnext.fc#L905-L965) (`recv_internal` `op::buy`)
- **Attack / Failure Scenario:**
  - While `anlgram-bonding-curve-dispatch-v2.fc` received the PR #38 fixes (requiring `out == inventory`, fixing the 1-nanoTON fee inversion at `303,030,303,031` gross nanoTON, and adding Action Phase `37` mode `+16` guards), `anlgram-bonding-curve-vnext.fc` still contains:
    - `if (real_ton_reserve + actual_net_ton >= graduation_threshold_ton) { will_graduate = 1; }` (graduates at `300,000,000,000` net nanoTON with `1` atomic token remaining, causing `initiate_migration` to fail `real_token_reserve == 0` with exit `410`), and
    - `int actualGross = (actual_net_ton * BPS_DENOMINATOR + netMultiplier - 1) / netMultiplier;` (under-computes `actual_fee_ton` by 1 nanoTON at `300,000,000,001` net).
- **Reproducible Test Steps:**
  ```bash
  node --test test-mission2-adversarial-security.js
  ```
- **Smallest Safe Correction:**
  - Ensure all deployment pipelines and quote verifiers (`assets/js/curve-vnext-onchain-quote.js`) exclusively pin `anlgram-bonding-curve-dispatch-v2.fc` (`CURVE_CODE_HASH`), and deprecate or synchronize `anlgram-bonding-curve-vnext.fc` in a future contract PR.

---

### Finding F-06 (MEDIUM — Backend API, **FIXED & VERIFIED**)
- **Title:** `POST /api/upload-logo` in `server.js` Lacked IP Rate Limiting and Binary Image Magic-Byte Verification
- **Exact File & Function:**
  - [`server.js`](file:///e:/ANLGRAM/server.js#L241-L345) (`POST /api/upload-logo`)
- **Attack / Failure Scenario:**
  - Previously, `POST /api/upload-logo` did not invoke `checkClientRateLimit(clientIp)` and accepted arbitrary base64 payloads without verifying PNG/JPEG/GIF/WebP magic-byte headers before writing to `assets/uploads/`, allowing disk exhaustion or polyglot file uploads.
- **Fix Applied & Verified:**
  - Enforced `checkClientRateLimit(clientIp)` (HTTP `429`), strict `data:image/(png|jpeg|jpg|gif|webp);base64,` regex validation, a 5 MB decoded size cap, and binary magic-byte header verification (`PNG`, `JPEG`, `GIF87a/89a`, `RIFF....WEBP`) in [`server.js`](file:///e:/ANLGRAM/server.js#L255-L328).
  - Verified by `Mission 1.6` in `test-mission1-auth-and-integration.js`.

---

### Finding F-07 (LOW — Smart Contract)
- **Title:** `op::sweep_fees` (`0x414e4c05`) in `anlgram-bonding-curve-dispatch-v2.fc` Sends `amount_to_sweep` With Mode `1` Without `raw_reserve`
- **Exact File & Function:**
  - [`minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc`](file:///e:/ANLGRAM/minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc#L1100-L1124) (`op::sweep_fees`)
- **Attack / Failure Scenario:**
  - `op::sweep_fees` caps `amount_to_sweep` at `my_balance - real_ton_reserve - MIN_STORAGE_RESERVE`, then sends `amount_to_sweep` with `send_raw_message(..., 1)`. Because mode `1` pays outbound forwarding fees on top of `amount_to_sweep`, the forwarding fee (~0.0004 TON) dips into `MIN_STORAGE_RESERVE` (`0.01 TON`).
- **Smallest Safe Correction:**
  - Call `raw_reserve(real_ton_reserve + MIN_STORAGE_RESERVE, 0)` before sending `amount_to_sweep` or deduct `forward_bound` from `max_sweepable`.

---

### Finding F-08 (LOW — Frontend / Worker, **FIXED & VERIFIED**)
- **Title:** Wallet Chain ID Fallback on Raw `0:...` Addresses, Missing `no-store` on `ttl === 0` Worker Responses, and `"No se pudo preparar la prueba"` Recovery
- **Exact Files & Functions:**
  - [`assets/js/wallet-connect.js`](file:///e:/ANLGRAM/assets/js/wallet-connect.js#L297-L321) (`window.getConnectedWalletChainId`, `getChainNetwork`, `window.disconnectWallet`)
  - [`cloudflare-worker/worker.js`](file:///e:/ANLGRAM/cloudflare-worker/worker.js#L470) (`fetch` response headers)
  - [`testnet-interface/worker.mjs`](file:///e:/ANLGRAM/testnet-interface/worker.mjs#L66-L159) (`route`)
  - [`testnet-interface/app.js`](file:///e:/ANLGRAM/testnet-interface/app.js#L43-L78) (`start.onclick`)
- **Fixes Applied & Verified:**
  - Removed `if (String(addr).startsWith('0:')) return '-239'` from `wallet-connect.js` and made connected wallets with unknown/missing chain IDs fail closed (`return null`).
  - Updated `cloudflare-worker/worker.js` to emit `'Cache-Control': ttl === 0 ? 'no-store' : 'public, max-age=' + ttl`.
  - Fixed `testnet-interface/worker.mjs` `APP_ORIGIN` default and `env?.PROOFS` 503 guards, synchronized all 5 Durable Objects across all 3 `wrangler.toml` files, and updated `testnet-interface/app.js` to reset `ui.setConnectRequestParameters(null)` on failure.
  - Verified by `Mission 1.1`–`Mission 1.5` in `test-mission1-auth-and-integration.js` and `testnet-interface/test/*.test.mjs` (33/33 PASS).

---

## 3. Independent Financial Release Recommendation

1. **Public Read-Only, Authentication, Explorer, Visualizer, and Rug Radar Modules:** **APPROVED FOR DEPLOYMENT** (`PASS`). All read-only inspections, `ton_proof` challenge/verify flows, Testnet/Mainnet chain separation, and on-chain verification guards operate safely without fabricated data.
2. **Financial Smart Contracts & Production Payment Gates:** **HOLD / DO NOT ENABLE** (`FAIL`). Keep:
   - `financialSigningEnabled: false` (`testnet-interface/worker.mjs`)
   - `CREATION_MAINNET_APPROVED = false` (`memecoin-platform.html`)
   - Factory deployment blocked (`assets/js/launchpad.js`)
   - `MONETIZATION_PAYMENTS_ENABLED = false` (`assets/js/monetization.js`)
   until Findings **F-01**, **F-02**, **F-03**, **F-04**, and **F-05** are remediated in a dedicated smart-contract PR by Codex and verified with sandbox regression tests.
