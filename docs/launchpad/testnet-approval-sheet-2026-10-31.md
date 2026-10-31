# Testnet transaction approval sheet — 2026-10-31

**SUPERSEDED FOR EXECUTION:** this V4 sheet is historical only. The owner approved
V5 preparation; old addresses, messages and transaction approvals are obsolete.
Use [the active registry](active-testnet-candidate.json) and the
[blocked V5 sheet](testnet-v5-approval-sheet.md). No signing is authorized.

**Status: preparation only, NOT AUTHORIZED TO SIGN OR BROADCAST.** PR #7 remains
isolated from production. Read-only PR #6 is deployed at production commit
`37ee53b483d69b0e301dc7ba8ba62696e2d37e17`;
[deployment succeeded](https://github.com/anlgram-labs/ANLGRAM/actions/runs/41241488614).
Actual public Analytics returned real metadata, supply, holders and master
transaction hashes;56/56 published files exactly match the reviewed package.
Desktop/mobile browser checks passed, financial controls stayed disabled.

## Operator, approvals and funding

- Exact operator: `0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d`.
- Testnet non-bounceable representation: `0QDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbZ2X`.
- Wallet identity: standard V4, public key independently reconstructs the exact
  address. Owner approved a real TON Connect session on chain -3; reload restored
  the same raw account and deploy remained disabled. This is manual connection
  evidence, not a separately verified [ton_proof signature](https://docs.ton.org/applications/ton-connect/how-to/ton-proof).
- The owner approved the SAME raw destination for Testnet donations and specified
  that platform donation/fee/reward recipients stay fixed if a test operator is
  ever changed. No new operator was needed. Production configuration is untouched.
- Donation recipient approval is complete; payment authorization is NOT granted.
- Current provider observation (2026-10-31T21:22:27.929Z): operator uninitialized,
  **2.003498553 Testnet TON**. The incoming funding was observed,
  not sent by this agent. Balance changes must be checked again before approval.
- Proposed maximum outgoing authorization envelope: **2.500000000 Testnet TON**.
  Recommended top-up to that envelope: **0.496501447 Testnet TON**.
  This envelope is a conservative funding target/cap, NOT a proven minimum cost.
- First transaction:0.100000000 attachment + current estimated source fees
  0.006797337 = **0.106797337 Testnet TON**.
  The observed balance covers this estimate. Future execution costs are not fixed.
- Every real request must explicitly target chain -3 and this exact sender, with
  fresh seqno/expiration. Public MemeLabs stays read-only; use a separately reviewed
  Testnet execution origin/manifest, never remove the public signing gates.

## Exact prepared order and destinations

Source-fee column: real TON Center Testnet `estimateFee` observations, using
invalid all-zero-signature envelopes with `ignore_chksig=true`. No signature
was created, no key/seed was used, no message was broadcast. Each row was estimated
independently with a current uninitialized V4 source, NOT a deployed future-state
end-to-end trace. Empty `destination_fees` does not mean zero destination cost.

| # | Exact Testnet destination | Attachment TON | Current source-fee estimate TON | Purpose | Acceptance requirement |
|---|---|---:|---:|---|---|
| 1 | `kQDzVA3j1ue-cB_ZeBZgXVYSiPIbE6F57nzH0KwhbEoTgBQD` | 0.100000000 | 0.006797337 | Deploy the source-matched Testnet minter | Active expected code/data, supply zero. |
| 2 | `kQDUo6ZeovKuperyN7xb6Vy795qoh3ce09amMC1uwlmhACwa` | 0.100000000 | 0.017409471 | Deploy the Curve | Active expected code/data, uninitialized Curve state. |
| 3 | `kQCPD5nXhUVy6VUMaGSkdbq3HPxIW8ew9ULdCgY4F2fLYGL6` | 0.100000000 | 0.004598804 | Deploy the dormant LP guard | Expected identity; financial authorization stays zero. |
| 4 | `kQCaEEzQhQ8vhR4VgihpQKbIE0BervHvCi6VR_YKaCVhox2k` | 0.100000000 | 0.022898405 | Deploy the dormant migrator | Expected identity; no DEX execution or principal migration. |
| 5 | `kQDUo6ZeovKuperyN7xb6Vy795qoh3ce09amMC1uwlmhACwa` | 0.100000000 | 0.005682937 | Bind master, settlement wallet, guard and migrator | INITIALIZING with exact versioned endpoints. |
| 6 | `0QDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbZ2X` | 0.020000000 | 0.000921203 | Mandatory 10% donation on fixed 0.20 TON base | Exactly one executed 0.02 TON message to the fixed approved raw recipient; correct comment and actual credit. |
| 7 | `kQDzVA3j1ue-cB_ZeBZgXVYSiPIbE6F57nzH0KwhbEoTgBQD` | 0.200000000 | 0.001003004 | Mint 1B ANLTEST, 9 decimals | Exact supply/custody, RENOUNCE_PENDING. No repeat mint on uncertainty. |
| 8 | `kQDzVA3j1ue-cB_ZeBZgXVYSiPIbE6F57nzH0KwhbEoTgBQD` | 0.050000000 | 0.000924736 | Irreversibly renounce mint authority | Master admin null and Curve ACTIVE. |
| 9 | `kQDUo6ZeovKuperyN7xb6Vy795qoh3ce09amMC1uwlmhACwa` | 1.000000000 | 0.000910803 | Buy using the reviewed fresh minimum output | Exact delivered Jettons and authenticated settlement receipt, not wallet acceptance. |
| 10 | `kQDUo6ZeovKuperyN7xb6Vy795qoh3ce09amMC1uwlmhACwa` | 0.100000000 | 0.000911336 | Intentional impossible-minimum buy | Exit404 plus actual native bounce; reserves unchanged. Gas is not refunded. |
| 11, conditional | `kQAGpwYqenM7Pyoj5mrqHQTx5hcz-ZuJSvWv21CBP_QBK3wq` | 0.100000000 | Fresh quote required | Sell actual confirmed Jetton units | Actual token debit/Curve credit, executed TON payout and reserve/fee reconciliation. Separate exact payload approval after buy. |

The signer also activates its own V4 wallet through the first external message's
StateInit if it is still uninitialized; this is part of the reviewed first send,
not permission for an extra transaction. The donation follows Curve initialization
and precedes minting. When operator and recipient coincide, it is a self-transfer:
it validates routing/credit but does not demonstrate an independent payer's fee.

Phase A attachments now total **1.870000000 Testnet TON, donation INCLUDED**.
The2.50 envelope is1.87 +0.10 later sale +0.20 existing base-budget reserve +0.33
fees/recovery contingency. Donation is not added twice. The base reserve is not
an extra authorized payment. Retained contract funding is not assumed withdrawable.
Current independently estimated wallet-source fees sum **0.062058036 TON**;
this is NOT a full execution quote or amount spent. Target execution, later wallet
state, sale and any funded recovery must be re-estimated before their approvals.
At most two0.02 TON funded receipt queries are contemplated within contingency;
their operation ID/payload remain unset until authenticated live correlation.

## Seven source-matched artifacts and deterministic identity

All seven artifacts were independently source-compiled when preparing the current
candidate. No contract source, bytecode, storage/interface, economics or deterministic
address recipe changed. Complete StateInit/payloads, expected hashes and four
core deployment addresses are in
[the unsigned candidate](supervised-smoke-candidate-2026-10-31.json).
Canonical JSON SHA256: `b522eb3b5e3125cf39bf9103fae8e2252de70cd9b1138eacaeafaf9560b726aa`.

Latest focused execution: **18 passed,0 failed,no skips** (4 smoke/donation,
5 fee/replay-boundary,2 preserved financial-plan and7 component-manifest cases).
The exact ten-message sequence, fixed-recipient donation credit, authenticated
receipt replay and subsequent sale run through fresh Sandbox state. These are
local simulations, not real Testnet transactions. The original155 Sandbox cases
remain the preserved baseline; no contract bytecode changed or test was weakened.

| Artifact | Code cell hash |
|---|---|
| anlgram-settlement-wallet | `e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2` |
| anlgram-launchpad-jetton-minter | `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec` |
| anlgram-bonding-curve | `421b1028536b49f6d79eadf872076cc7e7c9afde2aeca0e2868b2706449c3627` |
| anlgram-migration-router | `e9124986c48a9b070ed8e617447b7f4529c10e1f8d7698f0fbc6493dc090ec4a` |
| anlgram-lp-auth-guard | `113108a0c8e7a48729e3da01dd2e2a4067955561ad8bfc19f1fba90db084a967` |
| anlgram-lp-locker-v2 | `22d689df2f32d5fd00c72b50f31ab77291117a7625ad1bb654a4b6dbc796e001` |
| anlgram-migration-v2-plan | `4467bce59c4cb5c8359bbd94011bd2ebdb5e301a959ff0e0f2f6722fd8650043` |

[Read-only account observations](testnet-account-observations-2026-10-31.json)
at 2026-10-31T21:11:47.321Z: all8 inspected addresses (four core roles, binding, locker,
Curve Jetton wallet and buyer Jetton wallet) were uninitialized with zero balance
and no code. This is provider observation, not deployment permission. Recheck
before every deployment; any conflicting active/frozen state halts the sequence.
Binding/Locker V2 are NOT deployed or connected by this smoke sequence.

## Shared-wallet replay and receipt requirements

V4 signed bodies are not bound to a chain ID. The observed Mainnet seqno was
**44**; proposed Testnet nonces **0–12**
(10 prepared steps, sale and at most two funded receipt queries) are already
obsolete there. Recheck both chains before EACH signature. Any state/nonce change,
range overlap or extra external operation stops this plan and requires review;
never infer network isolation from the address prefix alone. The estimator rejects
Mainnet requests and nonce overlap. It has no broadcaster or signer.

For each approved message retain normalized external/inbound hashes, executed
compute/action outcomes, descendants and operation records. Wallet response alone
is not finality. Verify master/code/owner and actual balances; require the Curve
source-wallet authenticated settlement record for buy delivery. For the intentional
failure, observe the actual native bounce and invariant reserves. For the sale,
use actual delivered units and a fresh `get_sell_quote`, then verify actual TON
payout, wallet balances, fees and zero pending claims. Missing evidence stays pending;
never resend principal or mint because a notification is absent. Renouncement
cannot be rolled back. No signed external BOCs or private keys belong in reports.

## Readiness verdict and exact next authorization

- PASS: public read-only release, fixed recipient approval, exact address/V4 binding,
  owner-confirmed Testnet connection/restoration, seven artifact/source identities,
  deterministic addresses and reviewed serialized order. Migration is excluded.
- PARTIAL: current source-wallet fee estimates obtained; future-state end-to-end
  quotes and a fresh sale request cannot be final until their actual state exists.
- PENDING: full proposed funding reserve, metadata/transaction-plan approval,
  reviewed Testnet execution origin/manifest and fresh pre-signature checks.
- Overall: **BLOCKED FOR BROADCAST pending the remaining prerequisites and explicit per-stage approval**. Creation/activation/buy/sell
  is a viable supervised component MVP independent of unfinished STON.fi migration;
  source-matched Sandbox verifies the exact sequence, donor credit and receipt replay.
- Exact first contract transaction for separate authorization: `deploy-minter`,
 0.100000000 Testnet TON to `kQDzVA3j1ue-cB_ZeBZgXVYSiPIbE6F57nzH0KwhbEoTgBQD`,
 with the exact StateInit/payload in the candidate and fresh wallet fees. No
 financial signature or deployment is authorized by this sheet.

Migration, LP custody and withdrawals remain blocked. Full Mainnet needs exact
LP operation attribution, lost-notification/final-withdrawal evidence, independent
Router/Pool code/upgrade review, complete migration reconciliation and successful
real supervised Testnet evidence. No simulated outcome is presented as on-chain.
