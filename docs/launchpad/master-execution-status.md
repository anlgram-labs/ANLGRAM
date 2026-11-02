# Master execution status — 2026-11-01

This continues the owner's master plan; it does not authorize a transaction. PR #12 remains the development delivery. Production main and PR #11 are separate.

| Deliverable | Verified status |
|---|---|
| ANLTEST minter | **Completed on Testnet**, transaction `0c79b9323f105d4b3f0e0d9c3e7fb3ee178e4738062182ccd507867c12c8b9b1`. Never repeat. Latest protected observation: active, supply 0, expected code/data/admin; TonAPI corroborates. |
| Curve #2 | **One owner-authorized request attempted; LOCKED_PENDING_RECONCILIATION.** Owner reported acceptance followed by wallet emulation error. Fresh observations still show uninitialized Curve and unchanged operator; no deployment receipt exists. Never resend automatically. |
| Initialization and minting | **Implemented and tested locally**, not executed on Testnet. Existing offline plan retains unique operation/template identities and exact destinations/payloads. |
| Administrator renouncement | **Prepared offline only.** Irreversible `change_admin(null)` requires its own owner approval after actual mint/custody verification. |
| Curve activation | **Verified locally only.** The authenticated minter renounce callback activates state 3; do not invent an extra activation transaction. |
| Real Testnet purchases | **Not executed.** Exact V5 local lifecycle exists; actual active Curve, fresh quote, authentic delivery receipts and individual approval remain prerequisites. |
| Real Testnet sales | **Not executed.** Actual delivered Jetton balance and a fresh net TON quote are required before constructing a sell. |
| Refund/receipt reconciliation | **Code/Sandbox evidence only for the MVP.** Actual finalized Testnet trade receipts and reserve reconciliation remain pending. Missing notification is never refund evidence. |
| STON.fi migration | **Blocked.** Current foreign LP contracts do not provide all required authenticated issuance/first-notification recovery/final-delivery evidence. Migration authorization stays zero. |
| LP Locker V2 | **Code/Sandbox implementation**, 50–100%, 180/365 days or permanent, default 100% permanent. No claim of live authentic LP custody, completed migration or withdrawal delivery. |
| Frontend | Existing read-only production/analytics and isolated Testnet interface are deployed. Full financial product features remain gated. PR #11 is unchanged, ready for review, not merged/published. |
| Independent audit / Mainnet | **Not completed / blocked.** Automated and AI reviews are not an external audit. No Mainnet financial deployment or activation is authorized. |

## New master-plan implementation

- `88f17e3`: compiled SDK, Pages server, private persistent Worker, prepared records and runtime authorization now pin a reproducible source-derived execution version. Stale/mismatched pairs fail before signing. The administrator CLI checks deployed compatibility before submitting a grant.
- `919b66c`: administrative HMAC authorization can adopt the **exact private fingerprint already reviewed by the owner**, retaining transaction, deadline, observation time and revision. No Pages deployment, silent quote replacement or freshness extension. Unknown/expired/superseded quotes fail closed; the existing one-attempt lock remains permanent.
- Focused results: **127 interface/SDK/server cases, 7 runtime cases** (4 real SQLite operations, 2 Pages/external-DO, 1 authenticated scheduler), zero failures. Tests use controlled wallet responses; actual encrypted loopback HTTP delivery is counted. No real financial wallet request was used for testing. Earlier financial Sandbox lifecycle results are preserved, not unnecessarily rerun.

## Current reconciliation boundary

Only Curve #2 on Testnet -3: destination `kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW`, StateInit `1f04bf5afbd04f9851fa195518a14cf46f2b93a1344703014082a657032468ee`, one message attaching **0.100000000 Testnet TON**. The latest read-only model at22:41:21Z was fees0.017022225TON, debit0.117022225TON. That model is historical, not a current approval. The0.12TON policy is not a guaranteed fee maximum. Expected operator seqno1, balance5.893016464TON at that observation; reread immediately before any attempt.

The owner renewed domain-bound proof through22:53:36Z, confirmed no pending/concurrent operator transactions and authorized one refreshed Curve #2 attempt. The expired70decc quote was never sent. Fresh508c80 quote/model was displayed, an exact finite runtime grant adopted its private approval without changing fingerprint/expiry, and one SDK request was invoked. Persistent claim time22:53:05.344Z; message expiry22:53:36Z. The owner reported accepting in Tonkeeper, followed by a wallet emulation error. SDK logged expiry at22:53:36.170Z. No signed BOC or genuine new transaction hash was received.

At23:01:00Z, authenticated TON Center observations and independent TonAPI still show operator seqno1, unchanged balance5.893016464TON and last transaction, minter supply0/admin operator, Curve uninitialized. The actual persistent record is `LOCKED_PENDING_RECONCILIATION`, fingerprint508c80f62122112cbda6af7a1fdad53a4a1bc86bad009bdd66f212988055bb28, with no final outcome event. No retry, lock reset, later financial step or Mainnet action was performed. The finite grant expired; financial signing is closed. Account snapshots are not substitutes for a finalized operation receipt.

Independent **read-only, zero-signature** probes to the official Testnet wallet-emulation API accepted a fresh exact deployment (HTTP200; wallet and Curve emulated success) and rejected its expired-deadline counterpart (HTTP406/exit136). This reproduces expiry rejection but is not the owner's actual signed message or proof of the precise native-wallet warning cause. See tonkeeper-emulation-diagnostic-2026-11-01.json and curve-two-attempt-2026-11-01.json. No financial wallet signature was requested by these probes. Official interfaces: https://docs.tonapi.io/tonapi/rest-api/emulation and https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.yml . Expiry semantics: https://docs.ton.org/standard/wallets/how-it-works .

Safe follow-up fixes: d9eda5c exposes only sanitized fixed-operation dispatch state in the existing read-only panel (never ticket/authorization or an unlock). cd0f193 fixes post-dispatch diagnostics being rejected after proof expiry: a valid lifetime claim ticket can record only the two existing **unverified** events, with duplicate protection and no financial authority. Preparation/signing still require fresh domain proof and full exact validation. This does not backfill the missing historical event or clear its lock. Latest focused totals:131 interface/SDK/server cases and7 workerd cases pass, zero failures; public verification40 checks. Existing financial lifecycle Sandbox evidence was preserved, not rerun.

Next financial work is paused pending conclusive reconciliation and an independently reviewed, separately authorized recovery procedure. If Tonkeeper has a public transaction hash or signed external-message evidence, correlate it against the expected operation before considering any further action. Do not force blind signing, automatically generate a replacement operation ID or delete/release the existing lock.

## Next preparations after actual Curve finality

Reuse `testnet-mvp-offline-plan.json`; do not reconstruct or execute its subsequent steps prematurely. The current compatible architecture next requires **separate guard and migrator deployments before initialization**, even though all DEX migration authorization remains closed. Each deployment attaches0.1TON in the offline template; fees and seqnos must be fresh after the previous real receipt. Then initialize, verify the separate mandatory0.02TON donation, mint, authenticate actual Curve custody, renounce/verify activation, buy, reconcile persistent delivery evidence, test controlled rejection/recovery and sell. No future-step signature or spend is authorized by this report.

For complete external liquidity, a STON.fi-supported receipt-capable wallet extension or a separately reviewed anchored state-proof architecture is still required. Replaying a stored guard receipt recovers a lost acknowledgment; it cannot reconstruct a first LP notification that never executed or prove migration attribution from an off-chain balance. Preserve the accepted development Router-upgrade trust model and require independent current-version review. Do not implement a new trust assumption or incompatible foreign interface silently.

PR #11: `a3065d0`, production base `37ee53b`; unchanged two-file frontend-only correction, already reviewed and ready for owner production review. No financial development branch is to be merged into main to obtain it.


Final Testnet-only publication: https://a1eb8ca6.anlgram-testnet-preparation.pages.dev . Canonical https://testnet.anlgram.com passed40 public checks with financial signing closed. Chrome verified the actual persistent locked state on desktop and mobile, with no horizontal overflow. The previous SDK expiry remains a historical console error; no new financial request was made during follow-up QA. See [non-executing recovery proposal](curve-two-recovery-proposal.md).
