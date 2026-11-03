# MemeLabs Frontend–Backend Integration Handoff

## 1. Authoritative Protocol Tokenomics & Shared Model Contract

All frontend displays, explainers, and simulations in `testnet-interface/wizard/` are strictly bound to the authoritative contract configuration (`minter-contract/scripts/bonding-curve-math.js` and `assets/js/donation-config.js`):

| Parameter | Authoritative Value | Source |
| :--- | :--- | :--- |
| **Launchpad Total Supply** | `1,000,000,000` tokens (`10^18` base units) | `DEFAULT_CONFIG.totalSupply` |
| **Decimals** | `9` | `DEFAULT_CONFIG.decimals` |
| **Bonding Curve Allocation** | `80%` (`800,000,000` tokens) | `DEFAULT_CONFIG.curveTokens` |
| **DEX Liquidity Allocation** | `20%` (`200,000,000` tokens) | `DEFAULT_CONFIG.gradTokens` |
| **Initial Free Allocations** | `0` creator / `0` team / `0` community (Fair Launch) | `DEFAULT_CONFIG.creatorTokens` / `treasuryTokens` |
| **Graduation Threshold** | **`500 TON`** (`500_000_000_000` nanoTON) | `DEFAULT_CONFIG.graduationThresholdTon` |
| **Protocol Trading Fee** | `1%` (`100 bps`) | `DEFAULT_CONFIG.protocolFeeBps` |
| **Creation Base Charge** | `0.20 TON` (`200000000` nanoTON) | `charges.BASE_EXECUTION_NANO` |
| **Mandatory Creation Donation** | `0.02 TON` (`20000000` nanoTON) | `charges.DONATION_AMOUNT_NANO` |

### Shared `wizard/model.mjs` & `wizard/preparation-model.mjs` Invariants
- **Storage Key**: `KEY = 'anlgram:testnet:memelabs-drafts:v1'` (schema `1`, network `'-3'`).
- **Basechain (Workchain 0) Address Validation**: `address(s)` enforces `a.workChain === 0` across creator wallet, CSV/manual airdrop recipients (`recipients(d)` and `parseRecipientsDetailed(d)`), vesting beneficiary, LP lock beneficiary, and unlocked LP controller, matching existing Jetton wallet workchain restrictions (error `333`).
- **Configuration Fingerprint**: `configurationFingerprint(d)` hashes the normalized financial configuration (`mode`, `metadata`, `allocations`, `distribution`, `vesting`, `lp`) while ignoring UI navigation (`stage`), `savedAt`, and local `trade` preview inputs.

---

## 2. Existing Read-Only & Offline Preparation Integration Points

The MemeLabs 6-step wizard (`/memelabs`) integrates strictly with the following existing endpoints without invoking any financial signing or on-chain broadcasts:

| Endpoint | Method | Scope & Purpose | Frontend Guardrails |
| :--- | :--- | :--- | :--- |
| `/api/config` | `GET` | Retrieve TON Connect manifest URL, network (`-3`), `financialSigningEnabled` flag, and `curveExecutionVersion`. | Rejects connection if `network !== '-3'`, `financialSigningEnabled !== false`, or `curveExecutionVersion` mismatches the compiled bundle. |
| `/api/mvp/status` | `GET` | Read live Testnet `ANLTEST` protocol checkpoint observations (Minter `#1`, Curve `#2` state, and operation lock state). | Requires `scope === 'ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS'`, `network === '-3'`, and `financialSigningEnabled === false`. Displayed strictly under `Existing protocol checkpoint — NOT your draft token`. |
| `/api/projects/prepare` | `POST` | Compute deterministic offline project candidates (`minter`, `curve`, `guard`, `migration`, `vesting`), distribution batches (`batchSize` `1..4`), and proposed operation templates. | Requires `scope === 'OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'`, `financialSigningEnabled === false`, `broadcastEnabled === false`, and exact `configurationFingerprint` match. |

---

## 3. Alignment with Codex PR #18 (`projects/deployment-receipt.mjs`)

Codex PR #18 introduces `testnet-interface/projects/deployment-receipt.mjs` (`deploymentReceiptPolicy` and `verifyProjectDeploymentFields`) as an internal/offline adapter binding per-project deployment operations (`stateInit` present) to `lib/v5-deployment-receipt.js` for active supported Testnet V5R1 subwallet `0` signers (`seqno` `1..4294967294`, `walletId` `2147483645`).

### Frontend Handling of Deployment & Post-Deployment Receipt States
1. **`NO_AUTHENTIC_TRANSACTION` (Default Prepared State)**:
   - Displayed as `NOT VERIFIED (NO_AUTHENTIC_TRANSACTION)`. Derived account addresses link to `https://testnet.tonviewer.com/<address>` labeled `derived address only · deployment NOT VERIFIED`.
2. **`MATCHED_FIELDS_REQUIRES_AUTHENTIC_PROVENANCE` (PR #18 Verifier Output)**:
   - Indicates that a trace matched the expected V5R1 deployment fields (`source`, `destination`, `seqno`, `stateInit`, `targetCodeHash`, `targetDataHash`), but `independentFinalityVerified: false`, `operationCompleted: false`, `custodyVerified: false`, and `financialSigningEnabled: false`.
   - The frontend never marks an operation completed, never claims custody, and never enables follow-up operations from field-matching alone.
3. **Post-Deployment Operations (Mint, Distribution Transfers, Vesting Escrow, LP Locking)**:
   - Require dedicated descendant receipt verifiers and authenticated provider provenance beyond the V5 deployment-receipt adapter.

---

## 4. `UNKNOWN` Is Not Zero — Required Data Contract for Future Status Reads

When a future read-only project observation endpoint is exposed, any value that is unobserved, pending, rate-limited, or unverified **must be `null` in JSON and rendered as `UNKNOWN`, `UNAVAILABLE`, or `NOT VERIFIED` in the UI** — never `"0"` or `0`. Zero is permitted only when authentic, corroborated on-chain evidence proves an actual zero balance.

```json
{
  "scope": "PROJECT_ACCOUNT_AND_RECEIPT_OBSERVATION_NOT_AUTHORIZATION",
  "network": "-3",
  "draftId": "uuid-v4",
  "configurationFingerprint": "64-hex-sha256",
  "financialSigningEnabled": false,
  "broadcastEnabled": false,
  "projectDeploymentStatus": "NOT_VERIFIED",
  "actualSupplyUnits": null,
  "tokenBalanceUnits": null,
  "holderCount": null,
  "curveReserves": {
    "status": "UNAVAILABLE",
    "realTonReserveNano": null,
    "graduationTargetTon": "500",
    "graduationProgressBps": null
  },
  "custodyVerification": {
    "status": "NOT_VERIFIED",
    "mintAuthorityRenounced": null,
    "curveJettonBalanceUnits": null,
    "lpLockerCustodyUnits": null,
    "unlockTimestamp": null
  },
  "distributionStatus": {
    "status": "NOT_VERIFIED",
    "availableBalanceUnits": null,
    "verifiedDeliveredUnits": null
  },
  "vestingStatus": {
    "status": "NOT_VERIFIED",
    "escrowedUnits": null,
    "claimedUnits": null
  },
  "operations": [
    {
      "id": "fingerprint:0",
      "name": "deploy-minter",
      "status": "NOT_SUBMITTED",
      "receipt": {
        "status": "NO_AUTHENTIC_TRANSACTION",
        "transactionHash": null,
        "independentFinalityVerified": false,
        "custodyVerified": false
      }
    }
  ]
}
```

---

## 5. Safety & Lock Invariants Preserved

- **Original Curve #2 Lock**: Remains permanently `LOCKED_PENDING_RECONCILIATION`. Chain `valid_until` expiry and an unchanged `seqno` alone cannot prove a request was never signed/broadcast or release an existing lock without full recovery reconciliation.
- **Provider Provenance vs. Finality**: Two HTTP provider responses alone do not constitute independent validator finality.
- **Build & CSS Integrity**: `public-pages/wizard-design.css` and `public-pages/wizard-labs.css` remain byte-identical to `assets/css/design-system.css` and `assets/css/anl-labs.css`; all responsive and accessibility rules live in `testnet-interface/wizard/wizard-accessibility.css`.

Integration clarification: the project observation endpoint in section4 remains a future proposal, not a live route. Current offline preparation cannot prove any actual balance, reserve or deployment state; those values remain null/UNKNOWN. The frontend project-status projection rejects foreign scopes, and the separate ANLTEST panel remains account/getter observations only. LP percentage presets change percentage only; lock duration is independently selected and must not be inferred from a preset label.

---

## 6. Missing Read-Only Backend Fields for Curve V2, STON.fi v2.2 & LP Locker V2

The frontend renders full Curve V2 graduation tracking (`#curve-graduation-tracker`), STON.fi v2.2 migration and LP Locker V2 status (`#stonfi-migration-panel` and `#dashboard-migration-lp-card`), the 9-stage migration financial lifecycle tracker (`#migration-lifecycle-tracker`), the 10-stage creator token lifecycle tracker (`#wizard-lifecycle-tracker`), and the 11-state financial/error diagnostics panel (`#wizard-financial-diagnostics`) via `testnet-interface/wizard/project-status.mjs`.

`normalizeMigrationStatusView(migration)` in `testnet-interface/wizard/project-status.mjs` isolates PR #21's `migration.statusView` (`scope: 'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION'`, `graduation`, `routerVerification`, `poolVerification`, `transactionReceipts`, `lp`, `versionedPackage`) when present, and safely defaults all unobserved or absent fields to `null` / `UNKNOWN` / `NOT_VERIFIED` without merging or modifying PR #21's financial backend files.

Because `/api/projects/prepare` is an offline preparation route (`scope: 'OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'`) and `/api/mvp/status` queries only the fixed historical `ANLTEST` accounts, the following read-only backend fields are currently **missing** for per-creator live observation and are therefore displayed as `UNKNOWN`, `UNAVAILABLE`, `PENDING`, or `NOT VERIFIED`:

| Missing Read-Only Field | Expected Type / Values | Frontend Consumer in `wizard/project-status.mjs` | Current Fallback |
| :--- | :--- | :--- | :--- |
| `observation.scope` | `'AUTHENTICATED_PROJECT_OBSERVATION'` | `deriveLifecycleStage`, `deriveMigrationLifecycle`, `migrationSummary` | `'CONFIGURATION_ONLY_NO_PROJECT_OBSERVATION'` |
| `observation.lifecycleStage` | One of: `'DRAFT'`, `'DEPLOYMENT_PENDING'`, `'MINTER_DEPLOYED'`, `'CURVE_INITIALIZATION_PENDING'`, `'TRADING_ACTIVE'`, `'GRADUATION_REACHED'`, `'MIGRATION_PENDING'`, `'LP_CUSTODY_PENDING'`, `'LP_LOCKED'`, `'MIGRATION_FAILED_OR_PARTIAL'` | `deriveLifecycleStage(draft, prepared, observation)` | `'DRAFT'` (`confirmedOnChain: false`) |
| `observation.migrationStep` | Integer `1..9` mapping to the 9 migration financial lifecycle steps (`TRADING_ON_CURVE`, `GRADUATION_THRESHOLD_REACHED`, `MIGRATION_AUTHORIZED`, `LIQUIDITY_DEPOSIT_SUBMITTED`, `EXTERNAL_SETTLEMENT_PENDING`, `LP_RECEIPT_PENDING`, `LP_CUSTODY_VERIFIED`, `LP_LOCK_VERIFIED`, `MIGRATION_FINALIZED`) | `deriveMigrationLifecycle(draft, prepared, observation)` (`#migration-lifecycle-list`) | `0` (`0/9 Verified · Migration Gated & Disabled`) |
| `observation.migrationAnomaly` | `'PARTIAL'` \| `'FAILED'` \| `'EXPIRED'` \| `'UNCERTAIN'` \| `null` | `deriveMigrationLifecycle` (`#migration-anomaly-banner`) | `null` (or explicit `NO RETRY` anomaly banner) |
| `observation.realTonReserveNano` | Exact integer string (`"0"`..`"500000000000"`) or `null` | `migrationSummary` (`#curve-grad-ton`, `#curve-grad-bar`) | `null` → `'UNAVAILABLE (deployment UNKNOWN)'` |
| `observation.curveInventoryUnits` | Exact integer string (`"0"`..`"800000000000000000"`) or `null` | `migrationSummary` (`#curve-grad-inventory`) | `null` → `'UNAVAILABLE (configured 800,000,000; on-chain reserve UNKNOWN)'` |
| `observation.migrationDepositStatus` | `'NOT_SUBMITTED'` \| `'DEPOSIT_PENDING'` \| `'PARTIAL_DEPOSIT_HOLD'` \| `'POOL_MINTED'` \| `'MIGRATION_FAILED'` | `migrationSummary` (`Liquidity Deposit Status`) | `'NOT_SUBMITTED · BLOCKED'` |
| `observation.migrationReceipts` | Array of `{ hop, transactionHash, finalized }` across Curve → Migration Binding V2 → STON.fi Router → Pool → LP Wallet → LP Locker V2 | `migrationSummary` & `#wizard-explorer-links` | `null` → `'UNKNOWN · NO_AUTHENTIC_TRANSACTION'` |
| `migration.custody.status` (live) | `'NOT_VERIFIED'` \| `'LP_CUSTODY_PENDING'` \| `'CONTRACT_RECORD_UNVERIFIED'` \| `'CUSTODY_VERIFIED'` | `lpLockerSummary` (`#lp-custody-badge`) | `'NOT_VERIFIED'` |
| `migration.custody.received` / `locked` / `unlocked` | Exact integer strings of LP Jetton units or `null` | `lpLockerSummary` (`Actual Verified LP Received`, `Locked & Unlocked LP Balances`) | `null` → `'UNKNOWN'` |
| `migration.custody.unlockTimestamp` | Unix timestamp string (`uint64`) from confirmed on-chain lock start or `null` | `lpLockerSummary` (`Unlock Timestamp & Extension Policy`) | `null` → `'UNKNOWN until confirmed on-chain lock start'` |
| `migration.withdrawalStatus` & `authenticatedWithdrawalReceipts` | `'NEVER_ELIGIBLE'` \| `'BLOCKED'` \| `'NO_PENDING_REQUEST'` \| `'PENDING_WALLET_OUTCOME'` + verified foreign LP wallet delivery receipts | `lpLockerSummary` (`Withdrawal Eligibility & Withdrawal Receipts`) | `'NEVER ELIGIBLE'` / `'NOT ELIGIBLE · BLOCKED'` + `'NONE VERIFIED · UNKNOWN'` |
