# MemeLabs Frontend–Backend Integration Handoff

## 1. Existing Integration Points (Read-Only & Offline Preparation)

The MemeLabs 6-step frontend wizard (`/memelabs`) integrates strictly with the following existing endpoints without invoking any financial signing or on-chain broadcasts:

| Endpoint | Method | Purpose | Frontend Guardrails |
| :--- | :--- | :--- | :--- |
| `/api/config` | `GET` | Retrieve TON Connect manifest URL, network (`-3`), `financialSigningEnabled` flag, and `curveExecutionVersion`. | Rejects connection if `network !== '-3'`, `financialSigningEnabled !== false`, or `curveExecutionVersion` mismatches the compiled bundle. |
| `/api/mvp/status` | `GET` | Read live Testnet ANLTEST protocol checkpoint status (Minter `#1`, Curve `#2` state, and operation lock state). | Requires `scope === 'ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS'`, `network === '-3'`, and `financialSigningEnabled === false`. Displayed strictly under the `NOT your draft token` section. |
| `/api/projects/prepare` | `POST` | Compute deterministic offline project addresses (`minter`, `curve`, `locker`, etc.), distribution batches, vesting schedule timestamps, and proposed operation templates for a draft configuration. | Requires `scope === 'OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'`, `financialSigningEnabled === false`, `broadcastEnabled === false`, and exact `configurationFingerprint` match against the current draft state. |

---

## 2. Missing API Fields for Project-Specific Lifecycle Tracking

While `/api/projects/prepare` provides deterministic offline preparation and `/api/mvp/status` reports on the global `ANLTEST` checkpoint, the My Projects dashboard (`Step 6`) requires a read-only project status endpoint (e.g., `GET /api/projects/:draftId/status` or `POST /api/projects/status`) once creator-specific deployments are enabled in a future phase:

These fields are a proposal, not a deployed endpoint. The current project preparation API supplies configuration only; unknown values are null and must display UNKNOWN. Existing ANLTEST observations remain separately labeled and cannot populate another project.

### Missing Fields Needed from Backend
1. **`projectDeploymentStatus`**:
   - Current state of the specific creator's Minter, Curve, Vesting, and LP Locker contracts (`NOT_DEPLOYED` | `MINTER_DEPLOYED` | `CURVE_INITIALIZED` | `MINT_RENOUNCED_ACTIVE` | `GRADUATED_MIGRATING` | `LP_LOCKED`).
2. **`verifiedReceipts`**:
   - Array of finalized, corroborated on-chain transaction receipts (`lt`, `hash`, `utime`, `providerSources`, `operationName`) proving each lifecycle step.
3. **`custodyVerification`**:
   - `curveJettonBalanceUnits`: Verified base units held by the project's Bonding Curve Jetton wallet.
   - `mintAuthorityRenounced`: Boolean confirmed via on-chain `get_jetton_data` (`admin_address === addr_none`).
   - `lpLockerCustodyUnits`: Verified LP token balance held by the project's LP Locker V2 contract post-graduation.
   - `unlockTimestamp`: Confirmed on-chain unlock UNIX timestamp from LP Locker V2 getter (`null` for permanent locks).
4. **`liveCurveQuote` (Read-Only Reserve Observation)**:
   - `realTonReserveNano`: Verified real TON reserve in the active Bonding Curve contract.
   - `virtualTonReserveNano` / `virtualTokenReserveUnits`: Current curve parameters.
   - `graduationProgressBps`: Integer basis points (`0..10000`) toward the `500 TON` graduation threshold.

---

## 3. Expected Response Format (`GET /api/projects/:draftId/status`)

```json
{
  "scope": "PROJECT_OBSERVATION_AND_FINALIZED_RECEIPTS",
  "network": "-3",
  "draftId": "uuid-v4",
  "configurationFingerprint": "64-hex-sha256",
  "financialSigningEnabled": false,
  "observedUtc": "2026-11-02T15:00:00.000Z",
  "projectDeploymentStatus": "UNKNOWN",
  "accounts": {
    "minter": { "address": "0:...", "accountState": "UNKNOWN", "codeHashVerified": null },
    "curve": { "address": "0:...", "accountState": "UNKNOWN", "codeHashVerified": null },
    "lpLocker": { "address": "0:...", "accountState": "UNKNOWN", "codeHashVerified": null }
  },
  "custodyVerification": {
    "status": "NOT_VERIFIED",
    "mintAuthorityRenounced": null,
    "curveJettonBalanceUnits": null,
    "lpLockerCustodyUnits": null,
    "unlockTimestamp": null
  },
  "distributionStatus": {
    "completedBatches": null,
    "totalBatches": null,
    "verifiedDeliveredUnits": null
  },
  "vestingStatus": {
    "contractDeployed": null,
    "escrowedUnits": null,
    "claimedUnits": null
  },
  "verifiedReceipts": null
}
```

---

## 4. Required Statuses & Error Codes

To ensure deterministic UI states and prevent silent fallbacks or stale data display, backend responses must use these canonical statuses:

- **HTTP `200 OK`**: Freshly observed state with `dataStatus: "FRESH_DUAL_PROVIDER"` or `"FRESH_PRIMARY_PROVIDER"`.
- **HTTP `429 Too Many Requests`**:
  ```json
  {
    "error": "Upstream provider rate limited",
    "reason": "PROVIDER_RATE_LIMITED",
    "provider": "tonapi | toncenter",
    "retryAfterSeconds": 2
  }
  ```
- **HTTP `503 Service Unavailable`**:
  ```json
  {
    "error": "Fresh blockchain observation unavailable",
    "reason": "PROVIDER_UNAVAILABLE",
    "staleDataSubstituted": false
  }
  ```
- **Operation Lock Statuses**:
  - `LOCKED_PENDING_RECONCILIATION` (must block any duplicate claim or signing attempt).
  - `RECONCILED_FINALIZED` is a proposed state, requiring authenticated finalized evidence and the existing reconciliation gates; two matching API observations alone do not establish validator finality.
  - `EXPIRED_NO_BROADCAST` is not a supported release status: expiry and unchanged seqno alone do not prove absence of signing/broadcast or authorize a retry. Preserve `LOCKED_PENDING_RECONCILIATION`.

---

## 5. Frontend Compatibility Requirements

1. **Draft Storage Schema Compatibility (`schema: 1`)**:
   - The frontend persists drafts in `localStorage` under `anlgram:testnet:memelabs-drafts:v1`.
   - `draft.distribution.batchSize` defaults to `'4'` (`1..4` recipients per proposed batch) and is preserved across `normalizeDraft` and `saveDraft`.
2. **Configuration Fingerprinting**:
   - Any changes to `preparation-model.mjs` (`configurationFingerprint`) must remain deterministic across browser WebCrypto (`crypto.subtle.digest('SHA-256', ...)`) and Node.js backend verification so prepared plans invalidate immediately when the user edits any form field.
3. **Strict Separation of Simulation vs. Live Quotes**:
   - Frontend bonding curve calculations (`previewBuy`) are strictly labeled as `INITIAL configuration preview only`.
   - When Codex enables live Curve reserve reads, the response must include `quoteType: "OBSERVED_RESERVE_ESTIMATE_NOT_SIGNING_QUOTE"` until full signing authorization is separately unlocked.
4. **Build & Asset Integrity**:
   - `public-pages/wizard-design.css` and `public-pages/wizard-labs.css` must remain byte-identical to `assets/css/design-system.css` and `assets/css/anl-labs.css`.
   - All custom responsive, mobile, and accessibility rules reside exclusively in `testnet-interface/wizard/wizard-accessibility.css`.
   - No inline event handlers (`on[a-z]+=`) or financial transaction triggers (`.sendTransaction(`, `/api/operation/claim`, `/api/curve-two/claim`) are permitted in the wizard bundle.
