# Codex / Antigravity coordination and backend data contract

Checkpoint: PR #16 head6d7aa24. Backend continuation branch: codex/project-receipt-backend. No frontend files are changed by this continuation. Antigravity's branch has not been merged, overwritten or checked out; fetch did not identify a newly named UX branch, so its exact ref is not assumed.

## Ownership and shared boundary

Antigravity owns UX, responsive layout, CSV upload presentation, browser QA and My Projects visuals: testnet-interface/wizard UI controllers/build markup, styles, existing production HTML and frontend presentation. Codex focuses on contracts, STON.fi, Locker V2, distribution/vesting preparation, per-user Jetton backend and receipt verification. Neither agent should merge the other's branch or resolve financial conflicts automatically.

The existing wizard/model.mjs and preparation-model.mjs are ALSO imported by the backend. Their schema, normalization, integer precision, canonical-address validation and fingerprint projection are a shared API contract. Coordinate changes to those exports before editing them; frontend presentation can change independently. No move or duplicate validator was introduced. worker.mjs/protected RPC/operation ledger and root build.mjs/security execution identity stay backend integration points; wizard/build.mjs is frontend presentation.

## Current public API (unchanged)

POST /api/projects/prepare on the approved Testnet origin, application/json, same-origin Origin header. Body: saved schema1 draft, network string -3, UUID id, mode standard or launchpad, metadata/allocations/distribution/vesting/lp. Textual token amounts and decimals use the existing schema; no floats. Body bound128000 bytes. Local data images can be saved in drafts but require a public HTTPS image before on-chain metadata preparation.

Response scope OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION. Fields:

| Field | Meaning for frontend |
|---|---|
| draftId, configurationFingerprint | Match current normalized configuration; reject stale async results. Stage/savedAt/trade-preview changes do not change identity. |
| metadata, creator, configuredSupplyUnits | Configuration only; creator is not authenticated by this endpoint. Actual supply remains null. |
| accounts[role] | address/raw/codeHash/dataHash/stateInit. Derived candidates, NOT deployed accounts or receipts. |
| operations[] | id/name/message/receiptExpectation; NOT_SUBMITTED, fresh fees null, separate approval required. No signing capability. |
| distribution | batchSize1–4, batches with exact base-unit strings, recipients and query IDs; unknown available balance/fees are null. No delivery claimed. |
| vesting | Address/StateInit, beneficiary, amountUnits and schedule. Timestamp integers are UTC seconds. Months are30 days; custody false. |
| migration | Existing V2 binding/locker addresses and immutable terms. Percent50–100; duration0 means permanent, otherwise seconds. Actual LP custody and unlock timestamp remain unknown. migrationAuthorized false. |
| creationCharge | Base200000000, donation20000000, total before network220000000 nanoTON; extra component attachments separately disclosed. No estimate/max debit or payment receipt. Preserve existing recipient; do not print it in normal UI. Public message export remains transparent. |
| financialSigningEnabled / broadcastEnabled | Both false. Missing flags must fail closed too. |

Input failures return400 with a bounded error; foreign origins/content types403. Do not automatically retry any financial operation. Pure preparation is not a quote or authorization. A null amount is unavailable data, never zero. A wallet connection, excess message or missing notification is not custody/delivery proof. Do not set pending/failed/completed financial status from localStorage or preparation JSON.

## New internal deployment-receipt adapter (not a public API)

projects/deployment-receipt.mjs reconstructs a project from its original draft and exact operation ID, derives the creator's supported V5R1 Testnet subwallet0 address/code from the public key, and binds the existing verifier to the recomputed deployment message and target code/data. Mainnet, wrong owner/key, stale project fingerprints, uint32-overflow/unsupported seqnos and non-deployment operations are rejected. Only an already-active supported V5 wallet with seqno1..4294967294 is covered; seqno0/source-wallet activation needs a separate compatible verifier and is not a reason to request an ownership transfer. Only deployment verification is covered; mint, custody, transfers and vesting require their own descendant evidence.

verifyProjectDeploymentFields reuses lib/v5-deployment-receipt.js without changing it. Result remains PURE_VERIFIER_REQUIRES_AUTHENTIC_PROVIDER_PROVENANCE, operationCompleted false, independentFinalityVerified false, custodyVerified false, policyAuthorized false, signing false, newOperationAllowed false. The legacy verifier's0.12TON observation is renamed legacyVerifier120mObservation: it is neither a generic project spending approval nor a guaranteed ceiling. No HTTP route, financial ledger mutation or signing request was added. Never expose arbitrary JSON submission as authenticated finality.

Tests: nine focused project/adapter cases passed, including a synthetic locally signed V5 fixture and negative message/hash/signer/project cases. Synthetic finality-shaped JSON never produces an authoritative completion result. No real signing or broadcasting occurred. Existing root verifier regression: six pass/zero fail.

## Financial gates preserved

Original Curve #2 LOCKED_PENDING_RECONCILIATION and history are unchanged. No recovery/unlock/rearm, minter deployment, minting, trading, migration, withdrawal or TON spending. No tokenomics/donation/artifact changes. Authentic provenance/finality, independent review, per-creator ownership/fresh fees and compatible V2 Curve-to-migrator handoff remain prerequisites. LP deterministic addresses and custody floors must not be presented as exact migration-attributable final custody.
