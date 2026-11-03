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
| `/api/projects/status` | `POST` | Retrieve read-only schema 2 project migration & LP Locker V2 status (`scope: 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'`) bound to `configurationFingerprint`. | Validated by `validateProjectStatusResponse`: requires `schema === 2`, `network === '-3'`, exact `configurationFingerprint` match, and `financialSigningEnabled === false` / `migrationAuthorized === false` / `withdrawalsEnabled === false`. |

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

## 6. Integrated `POST /api/projects/status` Schema 2 Adapter & Remaining Evidence Gaps

The frontend renders full Curve V2 graduation tracking (`#curve-graduation-tracker`), STON.fi v2.2 migration and LP Locker V2 status (`#stonfi-migration-panel` and `#dashboard-migration-lp-card`), the 9-stage migration financial lifecycle tracker (`#migration-lifecycle-tracker`), the 10-stage creator token lifecycle tracker (`#wizard-lifecycle-tracker`), the 11-state financial/error diagnostics panel (`#wizard-financial-diagnostics`), and the live read-only `POST /api/projects/status` output panel (`#wizard-status-endpoint-output`) via `testnet-interface/wizard/project-status.mjs` and `testnet-interface/wizard/project-controller.mjs`.

`validateProjectStatusResponse(resp, expectedFingerprint, expectedMode)` and `normalizeMigrationStatusView(input)` in `testnet-interface/wizard/project-status.mjs` validate and normalize PR #21's `POST /api/projects/status` (`schema: 2`, `scope: 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'`) and `migration.statusView` (`MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION`, `REFERENCE_ANCHORED_PARTIAL_EVIDENCE_NOT_VALIDATOR_FINALITY`, `REFERENCE_ANCHORED_ACCOUNT_RECORDS_NOT_VALIDATOR_FINALITY`), including `lifecycle`, `deposits.ton`, `deposits.jettons`, `graduation` (keeping `localReserveEligible` distinct from `eligible: null`), `transactionReceipts`, and `lp` (`receivedUnits`, `recordedLockedUnits`, `recordedUnlockedUnits`, `custodyStatus`, `withdrawalReceipts`).

The following 4 financial evidence requirements remain unimplemented on-chain / awaiting external review, and all corresponding UI values therefore remain `UNKNOWN` / `NOT_VERIFIED` with all financial actions disabled:
1. **Validator-signature / catchain block finality verification** (current adapters provide reference-anchored partial evidence/records, never validator finality).
2. **DEX-complete migration attribution** across STON.fi v2.2 Router → Pool → Locker LP wallet minting before treating LP wallet transfers as current custody.
3. **Foreign LP wallet withdrawal final-delivery receipt verification** (standard TEP-74 Jetton transfer gives no authenticated final-delivery callback to `lp-locker-v2`, leaving `withdrawalPending` fail-closed).
4. **External security audit & production key ceremony**.
