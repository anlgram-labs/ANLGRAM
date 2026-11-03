# ANLGRAM Launchpad — Independent AI Security Review (PR #21 / PR #22)

- **Review Role**: Independent Skeptical TON Smart-Contract & Financial Backend Security Reviewer
- **Repository**: `https://github.com/anlgram-labs/ANLGRAM`
- **Financial PR #21 Branch**: `codex/curve-v2-migration-completion`
- **Financial Implementation Commit Reviewed**: `e1dacb7dd82d628064950af43e1a20cc3ec2a48f`
- **Financial Documentation Head Reviewed**: `0c3ab18bb9455fb4753021b6fa260b826ccc852e`
- **Security Gap Documentation Challenged**: `docs/launchpad/migration-v2-security-gaps-review.md`, `docs/launchpad/migration-v2-audit-package.json`
- **Integrated Frontend/Backend PR #22 Head Inspected**: `b644b71dddf89c39d1469eacc05f0657d74d10e0` (based on earlier PR #21 checkpoint `d7efdc6005ae491f04b968ee2249e185ea73feea` / `420a17c6c3dd64cc9b3b43e622e16d8837080c60`)
- **Isolated Audit Branch**: `audit/independent-financial-security-review-pr21`
- **Sandbox Verification Suite**: `tests/settlement-runtime/independent-security-review-poc.test.js`

---

## Executive Verdict

1. **Testnet Read-Only / Sealed Safety**: **PASS (Fail-Closed)**. All live financial signing, Curve #2 recovery unlocking, and DEX migration dispatches remain disabled (`403` / `409` off-chain; `414` on-chain). No existing V1 contract artifacts or live Testnet reservations (`03299c7c...`) were weakened.
2. **Curve V2 / Migrator V2 / Locker V2 Financial Readiness**: **NOT READY FOR LIVE FINANCIAL ACTIVATION**. While PR #21 (`e1dacb7`) implements strong fail-closed guards, deterministic StateInit bindings, and replay-resistant settlement ledgers, our independent review identified **two High-severity architectural/state-machine lockouts**, **three Medium-severity contract/verifier defects**, and **one Low-severity storage/fee issue** that must be remediated before any real TON or LP tokens are committed to the V2 contracts.

| ID | Title | Severity | Status | Component |
|---|---|---|---|---|
| **F-01** | **Irreversible 500 TON Graduation Deadlock Under Pinned `LP_AUTH_GUARD_CODE_HASH`** | **High** | **Proven (Sandbox PoC)** | `anlgram-bonding-curve-v2.fc`, `anlgram-lp-auth-guard.fc`, `curve-lifecycle-v3.fc` |
| **F-02** | **Write-Once 60-Second Registration Permit (`v2_register`) Permanently Locks Out Migrator V2 After Expiry** | **High** | **Proven (Sandbox PoC)** | `minter-contract/contracts/imports/migration-lp-v2.fc` |
| **F-03a** | **Downstream Recipient LP Wallet Bounce Permanently Traps Claimed LP Tokens in Locker V2 `pending` State** | **Medium** | **Proven (Sandbox PoC)** | `minter-contract/contracts/anlgram-lp-locker-v2.fc` |
| **F-03b** | **Off-Chain `verifyLpWithdrawalFields` Falsely Rejects Valid On-Chain LP Withdrawals That Unfreeze an Empty (`balance = 0`) Recipient LP Wallet** | **Medium** | **Proven (Sandbox PoC)** | `testnet-interface/projects/lp-evidence.mjs` |
| **F-04** | **PR #21 (`e1dacb7`) vs. PR #22 (`b644b71`) Versioned V2 Artifact & Schema Drift** | **Medium** | **Proven (Git / Build Check)** | `minter-contract/build/*-v2.compiled.json`, `testnet-interface/projects/*` |
| **F-05** | **`anlgram-bonding-curve-v2.fc` Overwrites Custom `protocol_fee_bps` with Hardcoded `100` and Retains Unpruned `DONE` Delivery Keys** | **Low** | **Proven (Sandbox PoC)** | `minter-contract/contracts/anlgram-bonding-curve-v2.fc` |
| **H-01** | *Hypothesis Refuted*: `transfer_notification` Immediate Refund `0.045 TON` Action-Phase Reserve Boundary | Informational (Refuted) | **Refuted by Sandbox Test** | `minter-contract/contracts/anlgram-bonding-curve-v2.fc` |

---

## Task 1 — Full Financial Threat Model

### 1.1 Component-by-Component Inspection

| Component | Source Files | Security Posture & Residual Risks |
|---|---|---|
| **1. Jetton Minter** | `minter-contract/contracts/anlgram-launchpad-jetton-minter.fc` | Standard TEP-74 Minter with `op::admin_changed_notification` (`0x7a3e810f`) and `op::query_admin_status` (`0x51c9d381`). Only `admin_address` can mint (`op == 21`) or change admin (`op == 3`). Once `admin_address` is set to `addr_none` (`00` bits) with `RENOUNCE_QUERY_ID` (`0x414e4c4752454e4f`), minting is permanently impossible. |
| **2. Settlement Wallet v1** | `minter-contract/contracts/anlgram-settlement-wallet.fc`, `imports/settlement-protocol.fc` | Dual-mode TEP-74 + settlement wallet (`sop::transfer`, `sop::internal`, `sop::ack`, `sop::receipt`, `sop::retry`, `sop::query`, `sop::credit_open`, `sop::credit_query`). Properly deduplicates incoming `wire_id` transfers (`incoming_key`), outbound `owner_id` transfers (`0x4f574e51`), standard transfer bounces (`0x424e4331`), and epoch credit observations (`0x5354444d`). Uses `raw_reserve(..., 2)` with `128 + 2` on receipt emissions so unfunded receipt actions cannot revert token credits. |
| **3. Bonding Curve V2** | `minter-contract/contracts/anlgram-bonding-curve-v2.fc`, `imports/curve-v2-router.fc`, `imports/curve-lifecycle-v3.fc`, `imports/curve-return-v2.fc` | Constant-product integer AMM (`graduation_threshold_ton == 500 TON`, `800M` curve tokens, `200M` DEX escrow). Validates Migrator V2 genesis `StateInit` at `op::init_launchpad` (`validate_v2_migrator`). Protects buyer reserves during trades via `raw_reserve(my_balance - msg_value + actual_net_ton + actual_fee_ton, 0)`. **Critical flaw (F-01)**: pins `LP_AUTH_GUARD_CODE_HASH` (`0x113108a0...`) which hardcodes `allowed = 0`, trapping all 500 TON in `STATE_GRADUATION_PENDING` once graduated. |
| **4. Migration Router / Migrator V2** | `minter-contract/contracts/anlgram-migration-router-v2.fc`, `imports/migration-lp-v2.fc`, `imports/migration-lifecycle-v3.fc` | Enforces immutable `used_ids[0]` LP lock intent (`0x4d563242`), deterministic Locker V2 binding (`0x414e5a01`), locker state observation (`0x414e5a02` / `0x414c5635`), custody-floor receipt recording (`0x414c5639`), and Guard registration (`0x414e5a03`). **Critical flaw (F-02)**: `v2_register` stores `permit` as a write-once cell in `used_ids[0]`; if the 60-second deadline expires before execution, the permit can never be refreshed (`exit_code = 409`). |
| **5. STON.fi v2.2 Integration** | `minter-contract/contracts/imports/stonfi-v22-auth.fc`, `scripts/stonfi-v22-addresses.js`, `scripts/stonfi-lp-v2-wire.js` | Pins captured STON.fi v2.2 Pool (`0xec614ea4...`), LP Wallet (`0xbf130417...`), and LPAccount (`0x3f1bb319...`) code hashes and derives Pool + LP Wallet deterministically using descending `slice_hash(w0) < slice_hash(w1)` ordering. Does **not** verify live on-chain Router bytecode prior to sending funds, and cannot natively attribute two-leg `LPAccount` completion without external evidence. |
| **6. LP Locker V2** | `minter-contract/contracts/anlgram-lp-locker-v2.fc`, `imports/lp-custody-probe-v4.fc`, `imports/lp-v2-receipt.fc` | Enforces `percent` (`50..100`), `duration` (`0`, `180d`, `365d`), ceiling lock rounding `(amount * percent + 99) / 100`, monotonic `unlock` extension on subsequent deposits, and bounded self-transfer custody-floor probing (`0x414c5636`) for initial `100%` permanent vaults. **Flaw (F-03a)**: LP withdrawals (`0x414c5633`) move principal into `pending` and only restore on an immediate bounce from `lp_wallet`; a downstream bounce from `recipient`'s LP wallet back to `lp_wallet` leaves the tokens permanently stuck in `pending`. |
| **7. Financial Guard (`anlgram-lp-auth-guard.fc`)** | `minter-contract/contracts/anlgram-lp-auth-guard.fc` | Read-only deterministic authenticity observer (`0x414e5001`, `0x414e5601`, `0x414e5701`). Hardcodes `allowed = 0` in `0x414e5702` and has **no entry point** to emit `allowed = 1` or `0x414e5a03` (`v2_register`). Has no upgrade entry point. |
| **8. V5 Wallet Receipt & Operation Ledger** | `lib/v5-deployment-receipt.js`, `lib/v5-self-transfer-receipt.js`, `testnet-interface/operation-lock.mjs`, `curve-operation.mjs`, `recovery/ledger.mjs` | Cryptographically verifies Ed25519 domain signatures (`0x7369676e`), `walletId` (`2147483645`), `seqno` progression, exact `StateInit`/`body` hashes, and fee conservation (`debit == attachment + fees`). Durable Object operation locks are write-once per operation/operator and never auto-reset on wallet callback errors. |
| **9. Off-Chain Financial Evidence Services** | `testnet-interface/recovery/account-proof.mjs`, `receipts.mjs`, `testnet-interface/projects/lp-evidence.mjs`, `migration-account.mjs`, `migration-status.mjs` | Verifies Merkle proofs (`shard_proof` -> `McStateExtra` -> `ShardDescr` -> shard `proof` -> `ShardAccounts` -> `Account` state hash) and raw `prevTransactionHash`/`prevTransactionLt` chains across two providers (`TONCENTER_TESTNET` and `TONAPI_TESTNET`). **Flaw (F-03b)**: `lp-evidence.mjs` `wallet()` helper rejects valid on-chain LP withdrawals that unfreeze an empty (`balance = 0`) `frozen` recipient LP wallet. |

---

### 1.2 Threat Matrix Across All 18 Required Categories

| # | Threat Category | Assessment | Detailed Findings & Mechanism Analysis |
|---|---|---|---|
| 1 | **Unauthorized minting** | **Mitigated** | `anlgram-launchpad-jetton-minter.fc:68` enforces `equal_slices(sender_address, admin_address)` on `op::mint()` (`21`). Curve V2 remains in `STATE_RENOUNCE_PENDING (2)` until Minter emits `op::admin_changed_notification` (`0x7a3e810f`) with `reported_admin == addr_none` and `reported_supply == 1,000,000,000 * 10^9`. |
| 2 | **Token supply manipulation** | **Mitigated** | `anlgram-bonding-curve-v2.fc:563-605` requires exact `TOTAL_SUPPLY_JETTONS` (`10^18` units = 1B tokens with 9 decimals) on initial transfer notification and rejects any subsequent Minter transfer once `state != STATE_INITIALIZING`. |
| 3 | **Reserve misaccounting** | **Mitigated (Trades) / Vulnerable (Locker V2 `pending`)** | Curve V2 buy/sell math preserves `real_ton_reserve`, `real_token_reserve`, `accrued_protocol_fees`, and `dex_tokens_escrow`. Return accounting in `curve-return-v2.fc` and `migration-lifecycle-v3.fc` enforces `rt <= ot` and `rj <= oj`. However, in Locker V2 (**F-03a**), a downstream recipient bounce causes `lp_wallet` balance to diverge from Locker V2's `locked`/`free` vs. `pending` accounting. |
| 4 | **Theft or permanent loss of TON** | **HIGH RISK (F-01)** | No unauthorized theft vector exists, **but** deploying Curve V2 with the currently pinned `LP_AUTH_GUARD_CODE_HASH` creates a **permanent 500 TON lockup** (**F-01**) once buyers graduate the curve (`STATE_GRADUATION_PENDING`), because selling is disabled in state 4 and migration is permanently blocked (`414`) with no Guard upgrade path. |
| 5 | **Incorrect Jetton delivery** | **Mitigated** | Outbound Curve V2 buy/refund deliveries use `anlgram-settlement-wallet.fc` (`sop::transfer`), correlating `cur_lt()` via `buy_delivery_key`. If `sop::internal` bounces at the buyer wallet, `settled_outcome(..., failed=1)` restores the Curve wallet balance and emits `sop::receipt(status=3)` to Curve V2, which credits `pending_refunds_dict[slice_hash(beneficiary)]`. |
| 6 | **Forged sender or fake contract authorization** | **Mitigated** | Every inter-contract message checks `equal_slices(sender_address, expected_address)` or deterministic `StateInit` address + code-hash pins (`validate_v2_migrator`, `v2_validate_vault`, `validate_migration_genesis`). |
| 7 | **Replay or duplicate receipt processing** | **Mitigated** | `anlgram-settlement-wallet.fc` deduplicates by `incoming_key(sender, wire_id)`, `record_key(0x4f574e51, owner_id)`, `0x5354444d` (message cell hash), and `0x424e4331` (bounce cell hash). `anlgram-lp-locker-v2.fc` deduplicates initial mint receipts by `cell_hash(full)` in `seen` dictionary. |
| 8 | **Cross-project or cross-wallet operation confusion** | **Mitigated** | `migration-package-v2.js` embeds `anlgram_project_id` into Minter content metadata (changing Minter address, wallet addresses, Curve V2 init data, and Migrator V2 `intent` hash). `migration-lp-v2.fc:71` verifies `sh~load_uint(256) == cell_hash(intent)` on `0x414e5a03`. |
| 9 | **Reentrancy-like asynchronous message ordering risks** | **Mitigated** | State updates (`save_data`, `save_vault`, `save_with_records`) are committed and in-flight correlation keys (`buy_delivery_key`, `requests[q]`, `0x4f555447`) are persisted before dispatching asynchronous child messages. Delayed old observations (`emitted < prev_lt` in `0x414c5635` / `0x414c5639`) are ignored without regressing state. |
| 10 | **Bounce handling and refund failures** | **MEDIUM RISK (F-03a, F-03b)** | Curve V2 and Migrator V2 handle direct bounces and settlement-wallet `sop::receipt` / `sop::credit_receipt` cleanly. However, **Locker V2 (`anlgram-lp-locker-v2.fc`)** uses a standard STON.fi TEP-74 LP wallet (`0xbf130417...`) that does **not** propagate a second-hop bounce back to Locker V2 when the recipient's LP wallet bounces `0x178d4519` (**F-03a**). |
| 11 | **Premature migration before 500 TON graduation** | **Mitigated** | Both `op::initiate_migration` (`anlgram-bonding-curve-v2.fc:983`) and `handle_curve_life` (`curve-lifecycle-v3.fc:41,51,69`) enforce `(state == STATE_GRADUATION_PENDING) & (real_ton_reserve >= 500000000000) & (real_token_reserve == 0) & (dex_tokens_escrow == 200000000000000000) & (pending_refunds_tokens == 0)`. |
| 12 | **Fake LP custody or unverified pool/token binding** | **Mitigated** | `anlgram-lp-locker-v2.fc:99-119` verifies `sender == wallet` (where `wallet` is deterministically derived from `router`, `w0`, `w1`, and pinned STON.fi v2.2 code hashes), `origin == contributor`, and payload `0x414c5632 || expected_query_id`. |
| 13 | **Duplicate LP credit** | **Mitigated** | `anlgram-lp-locker-v2.fc:105-107` hashes the full incoming message cell (`cell_hash(full)`) into `seen`; replaying the notification returns early without re-crediting `received`, `locked`, or `free`. |
| 14 | **Bypass of permanent lock** | **Mitigated** | `anlgram-lp-locker-v2.fc:169` enforces `throw_if(403, (duration == 0) | (unlock == 0) | (now() < unlock))` whenever `want_locked` is true. When `percent == 100` and `duration == 0`, `free == 0` and `locked` can never be withdrawn. |
| 15 | **Unauthorized unlocked-portion or timed-lock withdrawal** | **Mitigated** | `anlgram-lp-locker-v2.fc:167` enforces `equal_slices(sender, want_locked ? beneficiary : controller)`. |
| 16 | **Stale, reordered or delayed messages** | **HIGH RISK (F-02)** | While observation messages (`0x414c5635`, `0x414c5639`) safely ignore stale `lt`, **registration (`0x414e5a03`) in `migration-lp-v2.fc:73-77`** stores a single write-once permit with a maximum 60-second window (`deadline <= starts + 60`). Any network delay or missed 60s execution window permanently bricks registration for that Migrator V2 instance (**F-02**). |
| 17 | **Trust in unverified indexer/provider observations** | **Mitigated (Two-Provider Merkle Proof, Not Validator Quorum)** | `account-proof.mjs` and `receipts.mjs` reject raw JSON flags and verify Merkle proofs against a corroborated two-provider (`TONCENTER_TESTNET` + `TONAPI_TESTNET`) masterchain block reference. However, validator Ed25519 quorum signatures are not verified (correctly disclosed in `scope`). |
| 18 | **Inconsistent contract vs. frontend state claims** | **MEDIUM RISK (F-04)** | Frontend and backend status responses (`migrationStatus`, `migrationEvidenceStatus`) accurately label unverified states as `UNKNOWN` / `PARTIAL`. However, **PR #22 (`b644b71`) is out of sync with PR #21 (`e1dacb7`)** (**F-04**): PR #22 pins the earlier `420a17c` V2 contract hashes (`465b5aea...` / `368a1295...`) rather than `e1dacb7`'s `24cf7fca...` / `c629a2e3...`. |

---

## Task 2 — Exploit-Driven Review & Proven Findings

### Finding F-01: Irreversible 500 TON Graduation Deadlock Under Pinned `LP_AUTH_GUARD_CODE_HASH`

- **Severity**: **High**
- **Classification**: **Proven** (Reproduced in local TON Sandbox — `PoC F-01`)
- **Affected Files & Lines**:
  - `minter-contract/contracts/imports/lp-auth-guard-code.fc:1` (`LP_AUTH_GUARD_CODE_HASH = 0x113108a0cebe43710bd7f7b8e14494391da9d5594c0fd36ab444179a79d1bd1b`)
  - `minter-contract/contracts/imports/curve-lifecycle-v3.fc:24,33,67`
  - `minter-contract/contracts/anlgram-lp-auth-guard.fc:68-71`
  - `minter-contract/contracts/anlgram-bonding-curve-v2.fc:640,931-933,981`
- **Vulnerability & Mechanism Description**:
  1. When cumulative net purchases on `anlgram-bonding-curve-v2.fc` reach `graduation_threshold_ton` (`500 TON`), lines 931–933 transition the contract state from `STATE_ACTIVE (3)` to `STATE_GRADUATION_PENDING (4)`.
  2. Once `state == STATE_GRADUATION_PENDING (4)`, **buyers can no longer sell tokens back for TON**: `op::transfer_notification` (`anlgram-bonding-curve-v2.fc:640`, `if (state != STATE_ACTIVE)`) treats all incoming Jettons as non-active refunds and returns the Jettons to the sender without releasing any of the `500 TON` in `real_ton_reserve`.
  3. Simultaneously, **graduation cannot proceed**:
     - Legacy `op::initiate_migration` (`0x414e4c35`) unconditionally throws `414` (`throw_if(ERROR_LP_AUTH_REQUIRED, settlement_enabled())` at line 981).
     - The V2 lifecycle handshake (`0x414e5801` in `curve-lifecycle-v3.fc:24`) requires the Guard contract's `StateInit` code hash to equal `LP_AUTH_GUARD_CODE_HASH` (`0x113108a0...`).
     - In `anlgram-lp-auth-guard.fc:68-71`, the `0x414e5701` handler hardcodes `.store_uint(0, 1)` (`allowed = 0`) in its `0x414e5702` response, and has **no code path** to ever set `allowed = 1` or send `0x414e5a03` (`v2_register`).
     - When `0x414e5803` (`curve-lifecycle-v3.fc:67`) is called to dispatch the 500 TON and 200M Jettons to Migrator V2, it checks `throw_unless(414, flags == 7)`. Because bit 2 (`allowed`) is always `0` (`flags == 5`), `0x414e5803` permanently throws `414`.
     - Neither `anlgram-bonding-curve-v2.fc` nor `anlgram-lp-auth-guard.fc` has a code-upgrade entry point, and `op::init_launchpad` is locked after initialization (`state == STATE_UNINITIALIZED`).
  4. **Impact**: If `anlgram-bonding-curve-v2.fc` (`24cf7fcaf3...`) is ever deployed on-chain and funded by buyers up to 500 TON, **all 500 TON of buyer funds are permanently frozen in `STATE_GRADUATION_PENDING`** with no migration path and no buyer TON exit path.
- **Smallest Safe Correction**:
  - Do **not** deploy `anlgram-bonding-curve-v2.fc` for live trading until `anlgram-lp-auth-guard.fc` implements a complete, audited positive authorization and registration (`0x414e5702` + `0x414e5a03`) path and its new `LP_AUTH_GUARD_CODE_HASH` is compiled into Curve V2 and Migrator V2.
  - Additionally, consider adding a time-bounded emergency buyer unwind/redemption mechanism if a curve remains stuck in `STATE_GRADUATION_PENDING` or `STATE_MIGRATION_FAILED` beyond a maximum settlement timeout.

---

### Finding F-02: Write-Once 60-Second Registration Permit (`v2_register`) Permanently Locks Out Migrator V2 After Expiry

- **Severity**: **High**
- **Classification**: **Proven** (Reproduced in local TON Sandbox — `PoC F-02`)
- **Affected Files & Lines**:
  - `minter-contract/contracts/imports/migration-lp-v2.fc:57-78` (`v2_register`)
  - `minter-contract/contracts/imports/migration-lp-v2.fc:80-95` (`v2_require_execute`)
- **Vulnerability & Mechanism Description**:
  1. In `migration-lp-v2.fc:61`, `v2_register` (`0x414e5a03`) enforces a strict maximum 60-second validity window for the DEX execution permit:
     ```func
     throw_unless(409,(starts > 0) & (deadline > starts) & (deadline <= starts + 60) & (min_lp > 0) & (now() < deadline));
     ```
  2. In lines 73–77, `v2_register` loads `used_ids[0]` (which stores `(0x4d563242, ^intent, ^bound, ^obs, ^prior_permit)`) and checks:
     ```func
     ifnot(cell_null?(prior)) { throw_unless(409,cell_hash(prior) == cell_hash(permit));return (); }
     ```
  3. Because `prior` is never cleared or replaceable when `now() >= deadline`, `used_ids[0]`'s 4th reference is **write-once for the entire lifetime of the Migrator V2 contract**.
  4. Furthermore, `v2_root(intent)` (`operationId`) is immutably committed in `used_ids[0]` at Migrator V2 genesis and verified by Curve V2's `validate_v2_migrator`.
  5. **Exploitation / Failure Sequence**:
     - Step 1: Guard sends `0x414e5a03` (`v2_register`) with `[starts, deadline = starts + 60, min_lp]`. Migrator V2 stores `permit` in `used_ids[0]`.
     - Step 2: Due to normal Testnet/Mainnet block latency, operator signing delay, RPC throttling, or an adverse pool price movement requiring a refreshed `min_lp` quote, `op::execute_dex_provision` (`0x414e4c37`) is not executed before `deadline` (60 seconds).
     - Step 3: At `now() >= deadline`, `v2_require_execute` rejects execution (`now() < deadline` fails with `409`), `v2_register` with the old `permit` fails (`now() < deadline` fails with `409`), and `v2_register` with a new `[starts', deadline', min_lp']` fails (`cell_hash(prior) == cell_hash(permit)` fails with `409`).
     - Step 4: The Migrator V2 contract is **permanently locked out of ever registering a new execution permit** for that migration operation.
- **Smallest Safe Correction**:
  - In `migration-lp-v2.fc:73-77`, allow `v2_register` to replace `prior` when the existing `prior` permit has expired (`now() >= prior_deadline`) and `phase == 0` (DEX provision has not yet been dispatched), while preserving idempotency for identical active permits.

---

### Finding F-03a: Downstream Recipient LP Wallet Bounce Permanently Traps Claimed LP Tokens in Locker V2 `pending` State

- **Severity**: **Medium**
- **Classification**: **Proven** (Reproduced in local TON Sandbox — `PoC F-03a`)
- **Affected Files & Lines**:
  - `minter-contract/contracts/anlgram-lp-locker-v2.fc:64-79` (bounce handler)
  - `minter-contract/contracts/anlgram-lp-locker-v2.fc:163-191` (`0x414c5633` claim handler)
- **Vulnerability & Mechanism Description**:
  1. When `beneficiary` (or `controller`) claims unlocked LP tokens via `0x414c5633`, `anlgram-lp-locker-v2.fc:172-181` debits `locked` (or `free`), increments `pending += amount`, stores `requests[q] = (amount, want_locked)`, and sends TEP-74 `transfer` (`0x0f8a7ea5`) to Locker V2's STON.fi LP Jetton Wallet (`wallet`).
  2. Unlike `anlgram-settlement-wallet.fc`, the STON.fi v2.2 LP Jetton Wallet (`0xbf130417...`) is a standard TEP-74 Jetton wallet. When `wallet` processes `0x0f8a7ea5`, it debits Locker V2's LP balance and sends `internal_transfer` (`0x178d4519`) with initial `StateInit(balance = 0)` to the recipient's LP wallet (`destination`).
  3. If `destination` bounces `0x178d4519` — for example, because `destination` already held a non-zero LP balance (`balance > 0`) from an earlier partial claim and subsequently became frozen (so its `stateHash` does not match the initial `StateInit(balance = 0)`), or because `destination` had accumulated storage debt exceeding the forwarded message value — `destination` bounces `0x178d4519` back to `wallet` (Locker V2's LP wallet).
  4. `wallet` processes `on_bounce` and **restores `amount` LP tokens to Locker V2's balance inside `wallet`**, but standard TEP-74 `on_bounce` does **not** send any notification or bounce message back to `owner` (Locker V2).
  5. Because `anlgram-lp-locker-v2.fc:64-79` only restores `pending` back to `locked`/`free` upon receiving a direct bounced `0x0f8a7ea5` message from `wallet`, **Locker V2 permanently records `locked = 0` and `pending = amount`**, and has no retry or recovery entry point for `requests[q]`. The bounced LP tokens remain permanently stranded in `wallet`.
- **Smallest Safe Correction**:
  - Add an authenticated recovery/re-dispatch or self-transfer verification mechanism for pending withdrawal requests `requests[q]` in `anlgram-lp-locker-v2.fc` (or verify via a bounded TEP-74 balance floor check that `wallet` still holds `locked + free + uncollected_bounced_pending` before re-crediting/retrying `requests[q]`).

---

### Finding F-03b: Off-Chain `verifyLpWithdrawalFields` Falsely Rejects Valid On-Chain LP Withdrawals That Unfreeze an Empty (`balance = 0`) Recipient LP Wallet

- **Severity**: **Medium**
- **Classification**: **Proven** (Reproduced in local TON Sandbox — `PoC F-03b`)
- **Affected Files & Lines**:
  - `testnet-interface/projects/lp-evidence.mjs:19,21,62-64`
- **Vulnerability & Mechanism Description**:
  1. In `testnet-interface/projects/lp-evidence.mjs:21`, the `wallet(a, owner, master, expectedCode)` helper parses the recipient's LP wallet `before` and `after` Account states:
     ```javascript
     function wallet(a,owner,master,expectedCode){
       if(a.absent||a.account.storage.state.type==='uninit')return 0n;
       const s=active(a,expectedCode).beginParse(),n=s.loadCoins();
       ...
     }
     ```
  2. When a recipient's LP wallet was previously deployed with `0` LP balance and later became `frozen` (`a.account.storage.state.type === 'frozen'`) due to storage fees, its `stateHash` equals `hash(StateInit(balance = 0))`.
  3. When Locker V2's LP wallet sends TEP-74 `internal_transfer` (`0x178d4519`) to the recipient's LP wallet, it attaches `StateInit(balance = 0)`. On TON, delivering an internal message with matching `StateInit` to a `frozen` account **validly unfreezes the account (`orig_status = 'frozen'`, `end_status = 'active'`) and credits the recipient with `amount` LP tokens (`exitCode = 0`)**.
  4. However, when `verifyLpWithdrawalFields` (`lp-evidence.mjs:62-64`) inspects `dest.before`, `dest.before.account.storage.state.type` is `'frozen'`, which is neither `'absent'` nor `'uninit'`. It calls `active(dest.before, ...)`, which throws `Error: Active Account required`!
  5. Note that `tests/settlement-runtime/stonfi-locker-v2-real.test.js:61-62` actually constructed this exact scenario (`freeze(g, destination)` on a 0-balance wallet) and asserted `assert.throws(() => api.verifyLpWithdrawalFields(...))` under the mistaken assumption that the on-chain delivery had failed, when in fact our Sandbox PoC (`PoC F-03b`) proves that `destination` succeeded (`exitCode = 0`) and received 100% of `initialLocked` on-chain!
- **Smallest Safe Correction**:
  - If `dest.before.account.storage.state.type === 'frozen'`, verify that `dest.before.account.storage.state.stateHash` matches the canonical `StateInit(balance = 0)` hash for `(recipient, pool, lpInit.code)` and treat the pre-unfreeze balance as `0n` (while continuing to require `dest.after` to be `'active'` with `after == amount`).

---

### Finding F-04: PR #21 (`e1dacb7`) vs. PR #22 (`b644b71`) Versioned V2 Artifact & Schema Drift

- **Severity**: **Medium**
- **Classification**: **Proven** (Verified via Git commit and compiled artifact inspection)
- **Affected Files**:
  - `minter-contract/build/anlgram-bonding-curve-v2.compiled.json`
  - `minter-contract/build/anlgram-migration-router-v2.compiled.json`
  - `minter-contract/contracts/imports/migration-router-v2-code.fc`
  - `testnet-interface/projects/lp-evidence.mjs`, `migration-account.mjs`, `migration-status.mjs`
- **Description**:
  - PR #22 (`b644b71dddf89c39d1469eacc05f0657d74d10e0`, currently deployed on `https://testnet.anlgram.com`) integrated Frontend PR #20 (`4c5b1b6`) with Backend PR #21 at commit `d7efdc6005ae491f04b968ee2249e185ea73feea` (`420a17c6...`).
  - Subsequent commits on PR #21 (`e1dacb7dd82d628064950af43e1a20cc3ec2a48f` and `0c3ab18bb9455fb4753021b6fa260b826ccc852e`) modified `migration-lp-v2.fc`, `curve-v2-router.fc`, and the off-chain evidence modules, changing the compiled code hashes:
    - `anlgram-bonding-curve-v2`: `465b5aeaf1637cf7f9660b3795e0b844780d3f5fd188c1304d9c09c518e09545` (PR #22) $\rightarrow$ `24cf7fcaf32e5021b4287bca78e1ac8886a6e2a1e46a3cc89b80a1dda7ea0965` (PR #21 `e1dacb7`)
    - `anlgram-migration-router-v2`: `368a12951811ba02f52cf8c8256efdf527c234b46fd12fb553cf9e95a33a512a` (PR #22) $\rightarrow$ `c629a2e360ac8fe335177bd7e8577a937946ba37361aa2204b9972471368947a` (PR #21 `e1dacb7`)
- **Smallest Safe Correction**:
  - Before any V2 checkpoint verification is wired into the integrated branch, merge `0c3ab18bb9455fb4753021b6fa260b826ccc852e` (plus fixes for F-01 through F-03b) into PR #22.

---

### Finding F-05: `anlgram-bonding-curve-v2.fc` Overwrites Custom `protocol_fee_bps` with Hardcoded `100` and Accumulates Unpruned `DONE` Delivery Keys

- **Severity**: **Low**
- **Classification**: **Proven** (Reproduced in local TON Sandbox — `PoC F-04`)
- **Affected Files & Lines**:
  - `minter-contract/contracts/anlgram-bonding-curve-v2.fc:111,177`
  - `minter-contract/contracts/anlgram-bonding-curve-v2.fc:86-88,414,427,464`
- **Description**:
  1. `load_data()` (`line 111`) reads `int protocol_fee_bps = ds~load_uint(16);` and discards it; `save_data()` (`line 177`) hardcodes `.store_uint(100, 16)`. While consistent with the 1% fee spec, any non-100 initial `protocol_fee_bps` in genesis data is silently overwritten on the first state transition.
  2. Every completed buy or immediate refund delivery writes a permanent `completed_delivery_key(query_id)` (`"DONE" || query_id`) entry into `pending_refunds_dict` (`lines 414, 427, 464`). These records are never pruned, causing `pending_refunds_dict` (which is also shared across 6 key namespaces: `slice_hash(user)`, `BUYD`, `DONE`, `RET2`, `FB33`, `CUR3`) to grow monotonically with every trade on the curve, increasing dictionary lookup gas and storage fees over high trade volumes.
- **Smallest Safe Correction**:
  - Enforce `throw_unless(408, protocol_fee_bps == 100)` in `load_data()`, and separate long-lived migration/lifecycle state (`CUR3`, `RET2`, `FB33`) from the trade delivery dictionary or bound/prune `DONE` records after graduation.

---

### Refuted Hypothesis H-01: `transfer_notification` Immediate Refund `0.045 TON` Action-Phase Reserve Boundary

- **Classification**: **Hypothesis Refuted by Sandbox Testing**
- **Analysis**:
  - During static code review of `anlgram-bonding-curve-v2.fc:635-653,705-707,740-742`, we questioned whether setting `available_gas = msg_value - COMPUTE_GAS_RESERVE` (`msg_value - 10,000,000`) and calling `send_jettons_funded(..., mode = 1, available_gas)` alongside `raw_reserve(my_balance - msg_value, 0)` at the minimum `msg_value = 45,000,000` (`0.045 TON`) boundary could fail in the TVM Action Phase (`resultCode = 37`) if `compute_fee + fwd_fee > 10,000,000`.
  - We tested this exact boundary in TON Sandbox (`msg_value = 45,000,000` nanoTON on a slippage-refunded sell). The compute phase + forward fee consumed ~7.2M nanoTON (`< 10,000,000` nanoTON reserve), so the Action Phase succeeded (`resultCode = 0`) and delivered the refund cleanly.

---

## Task 3 — Free Static and Symbolic Analysis

We audited the local workspace environment for compatible static, symbolic, and compiler-level analyzers:

| Tool / Method | Compatibility with FunC / MJS | Execution Status & Findings |
|---|---|---|
| **TON Symbolic Analyzer (TSA)** | Compatible with FunC / TVM BoC (requires JVM / Gradle / TSA CLI binary) | **Unavailable in local offline environment**: `Get-Command java, gradle, docker` confirmed neither a JVM nor Docker/TSA binary is installed on the host machine. |
| **Tact Static Analyzers (Misti)** | **Incompatible** with FunC (`minter-contract/contracts/*.fc` are pure FunC `>=0.2.0`, not Tact) | **Intentionally not applied** per Task 3 instructions (*"Do not falsely apply Tact-only analyzers to FunC contracts"*). |
| **`@ton-community/func-js` (`v0.11.0`) Reproducibility & AST/Type Check** | Native FunC compiler used by project | **Executed**: `node minter-contract/compile-migration-package-v2.js --check` passed (`check: true`), confirming bit-for-bit reproducibility of `anlgram-bonding-curve-v2` (`24cf7fcaf32e5021b4287bca78e1ac8886a6e2a1e46a3cc89b80a1dda7ea0965`) and `anlgram-migration-router-v2` (`c629a2e360ac8fe335177bd7e8577a937946ba37361aa2204b9972471368947a`) while leaving V1 build artifacts untouched. |
| **TON Sandbox (`@ton/sandbox` `v0.45.0`) Adversarial & PoC Execution** | Full TVM execution + state/action phase inspection | **Executed**: Ran 30 existing V2/Locker/Evidence tests + 5 new adversarial PoC tests in `tests/settlement-runtime/independent-security-review-poc.test.js` (35/35 passing assertions). |

---

## Task 4 — Review of the Five Open Financial Gaps

We independently evaluated the five open gaps documented in `docs/launchpad/migration-v2-security-gaps-review.md` to determine whether the current PR #21 architecture can securely close them in place or requires a **revised protocol architecture**:

### Gap 1: Positive Guard Authorization (`0x414e5702` / `0x414e5a03`)
- **Current State**: `anlgram-lp-auth-guard.fc` hardcodes `allowed = 0` in `0x414e5702` and has no producer for `0x414e5a03` (`v2_register`).
- **Architectural Evaluation**: **Requires Contract Revision & Recompilation (Cannot Be Closed Without Changing Pinned Code Hashes)**.
  - Because `LP_AUTH_GUARD_CODE_HASH` is compiled into both `anlgram-bonding-curve-v2.fc` and `anlgram-migration-router-v2.fc`, enabling positive Guard authorization requires modifying `anlgram-lp-auth-guard.fc` (and fixing the write-once 60s permit lockout **F-02** in `migration-lp-v2.fc`), which changes `LP_AUTH_GUARD_CODE_HASH`, `MIGRATION_ROUTER_V2_CODE_HASH`, and Curve V2's compiled code hash.
  - Furthermore, on TON, an on-chain Guard contract **cannot** inspect off-chain provider Merkle proofs or foreign STON.fi Router live code state without either:
    1. An **on-chain cryptographic oracle / operator-signed permit** verified via `check_signature` inside the Guard (binding exact `(operationId, curveEpoch, fundingEpoch, dexEpoch, minLpOut, starts, deadline)` after off-chain preflight verification), OR
    2. A **fully deterministic on-chain message chain** where Guard verifies on-chain state messages from Curve V2, Migrator V2, and Locker V2 directly.

### Gap 2: Canonical Transaction Finality & Provider Provenance
- **Current State**: `account-proof.mjs` and `receipts.mjs` verify Merkle inclusion (`McStateExtra` $\rightarrow$ `ShardDescr` $\rightarrow$ shard `Account` state + `prevTransactionHash` chain) against a masterchain block hash corroborated by two HTTPS providers (`TONCENTER_TESTNET` and `TONAPI_TESTNET`), without verifying validator catchain/Ed25519 quorum signatures.
- **Architectural Evaluation**: **Current Architecture Is Sound for Server-Side Defense-in-Depth, Provided Lite-Server / Validator Set Verification Is Added for Mainnet**.
  - Requiring two independent providers to agree on `(seqno, root_hash, file_hash)` and verifying full Merkle proofs from that masterchain block down to the `Account` state cell and transaction hash chain eliminates single-indexer spoofing and forged JSON flags.
  - To achieve true trustless finality for Mainnet without trusting dual HTTPS providers, the verifier only needs an incremental addition: verifying the masterchain block's `ValidatorSet` Ed25519 signatures (key block $\rightarrow$ catchain validator signatures) before passing `reference` into `verifyAccountInclusion()`. No smart-contract changes are needed for this layer.

### Gap 3: Complete STON.fi v2.2 Settlement Attribution
- **Current State**: STON.fi v2.2 liquidity provision is a two-leg asynchronous flow (`provide_lp` via Router token wallet + `provide_lp` via pTON wallet $\rightarrow$ Router $\rightarrow$ Pool $\rightarrow$ `LPAccount` $\rightarrow$ Pool mints LP Jettons to Locker V2's LP wallet, or `refund_me` returns single-leg tokens).
- **Architectural Evaluation**: **Current On-Chain + Off-Chain Architecture Can Support Attribution Only With an Explicit Timeout / Refund-Unwind State Machine**.
  - On-chain, Locker V2 (`anlgram-lp-locker-v2.fc`) already authenticates `sender == wallet`, `origin == contributor` (`Migrator V2`), and payload `0x414c5632 || expected_query_id`. Because STON.fi v2.2 Pool sets `from_address = user_address` (`Migrator V2`) in the minted LP `internal_transfer` and forwards `custom_payload` (`0x414c5632 || q`), **a third party donating LP tokens via standard transfer cannot forge `origin == Migrator V2` unless they route through STON.fi Pool with `user_address = Migrator V2`**.
  - However, if one leg of the deposit succeeds and the second leg bounces or fails inside STON.fi, funds sit in STON.fi's `LPAccount` contract until `refund_me` (`0x0f8a7ea5` / `0x2fcb26a2`) is invoked by `Migrator V2`. Currently, `anlgram-migration-router-v2.fc` has **no entry point to send `refund_me` to its STON.fi `LPAccount`**!
  - **Required Architectural Addition**: `anlgram-migration-router-v2.fc` must add an authenticated `op::request_lp_account_refund` entry point so that if one deposit leg bounces or times out in `LPAccount`, `Migrator V2` can trigger `refund_me` on its deterministic `LPAccount` address and recover the stranded leg back into the `curve-return-v2.fc` return pipeline.

### Gap 4: Exact LP Recovery Consumable by Contracts
- **Current State**: If the first TEP-74 `transfer_notification` from `lp_wallet` to Locker V2 fails (e.g., out of gas), `lp-custody-probe-v4.fc` (`0x414c5636`) performs a self-transfer of `candidate` LP units on `100%` permanent vaults to prove a lower-bound floor (`0x414c5639`), but never credits `received`/`locked`/`free` (`get_lock_v2` remains `0`) and rejects timed or partial (`< 100%`) vaults (`throw_unless(409, (percent == 100) & (duration == 0))`).
- **Architectural Evaluation**: **Requires Revised Recovery Mechanism for Timed / Partial Vaults**.
  - Because standard TEP-74 Jetton wallets (`0xbf130417...`) do not expose an on-chain internal message (`provide_wallet_balance` is TEP-89 `take_wallet_address`, not balance) to report exact balance to their owner, a self-transfer probe (`0x0f8a7ea5` from Locker V2 to itself) is the only pure TEP-74 way to prove on-chain that `lp_wallet` holds at least `candidate` units.
  - However, refusing to credit `locked`/`free` after a proven self-transfer means that if the initial notification is lost on a **timed or partial vault** (`50%` or `75%`, `180d` or `365d`), **100% of the LP tokens are permanently locked forever** (neither `locked` after expiry nor `free` can ever be withdrawn via `0x414c5633`, and `0x414c5636` throws `409`).
  - **Recommended Revision**: Allow `0x414c5636` on **all** vaults whenever `received == 0 & pending == 0` (when the initial notification was lost), and allow an operator/beneficiary-authenticated recovery commit that converts the proven `floor` into the single initial `(received, locked, free, unlock = now() + duration)` allocation once.

### Gap 5: Final LP Withdrawal Delivery Confirmation
- **Current State**: When `0x414c5633` dispatches a withdrawal from Locker V2, `pending` is incremented by `amount` and **never decremented** on successful delivery because standard STON.fi LP wallets do not send a settlement receipt back to Locker V2 upon crediting the recipient's LP wallet. Worse, as proven in **F-03a**, if the recipient's LP wallet bounces `0x178d4519` back to Locker V2's LP wallet, the LP tokens are restored to Locker V2's LP wallet while Locker V2 permanently leaves them in `pending` (`locked = 0`).
- **Architectural Evaluation**: **Requires Contract-Level Recovery Entry Point in `anlgram-lp-locker-v2.fc` + Off-Chain Unfreeze Fix in `lp-evidence.mjs`**.
  - Off-chain, `verifyLpWithdrawalFields` in `lp-evidence.mjs` can confirm final recipient delivery (once **F-03b** is fixed to accept `frozen` $\rightarrow$ `active` unfreeze transitions on 0-balance recipient wallets).
  - On-chain, `anlgram-lp-locker-v2.fc` must not permanently orphan LP tokens when a second-hop bounce occurs at the recipient's LP wallet (**F-03a**). Adding a self-transfer probe for pending withdrawal recovery (verifying that `lp_wallet` still holds `locked + free + requests[q].amount` after a cooldown window) allows Locker V2 to safely re-dispatch or restore a second-hop bounced withdrawal without risking double-withdrawal of still-locked funds.

---

## Task 5 — Reproducible Verification Commands

All verification tests are non-destructive and run locally in `@ton/sandbox`:

```bash
# 1. Verify bit-for-bit V2 contract compilation reproducibility and V1 preservation
node minter-contract/compile-migration-package-v2.js --check

# 2. Run the Independent AI Security Review Sandbox PoC Suite (F-01, F-02, F-03a, F-03b, F-05)
node --test tests/settlement-runtime/independent-security-review-poc.test.js

# 3. Run existing V2 migration, STON.fi Locker V2, and off-chain evidence suites
node --test tests/settlement-runtime/migration-package-v2.test.js tests/settlement-runtime/stonfi-locker-v2-real.test.js tests/settlement-runtime/lp-v4.test.js tests/lp-evidence.test.mjs tests/migration-account.test.mjs
```
