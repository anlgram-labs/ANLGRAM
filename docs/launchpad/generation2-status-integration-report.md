# ANLGRAM MemeLabs — Generation 2 Verified Project Status Integration Report

**Integration Branch**: `feature/memelabs-gen2-status-integration`  
**Integration Commit**: Target of this PR  
**Base Target**: PR #28 (`b9345ada90301b2f6cbba5afcf98b27446eb0f09`)  
**Associated PRs**:
- PR #28 (`codex/generation2-readonly-status`): Generation 2 read-only status projection and Sandbox verification.
- PR #26 (`351de8a56b2b584c0353743c5917801a808a211d`): One-shot dispatch and authenticated LP custody in Sandbox.
- PR #22 (`b644b71dddf89c39d1469eacc05f0657d74d10e0`): Unified frontend/backend integration with 9-stage lifecycle tracker.

---

## 1. Executive Summary

This integration completes the end-to-end connection between the **Generation 2 verified financial status projection** and the **ANLGRAM MemeLabs frontend dashboard**, adhering strictly to read-only security invariants:

1. **Gate 414 Compliance**: `SETTLEMENT_COMPLETE` remains completely unreachable under the pinned generation. STON.fi multi-hop liquidity minting and delivery to LP Locker V2 is recognized as `SETTLEMENT_PENDING`.
2. **Server-Side Trusted Registration**: Browser clients can never register projects, supply arbitrary contract addresses, or submit unauthenticated account proofs. Project resolution occurs exclusively server-side via `configurationFingerprint`.
3. **Safe Unregistered Fallback**: When no persistent on-chain registration exists, `POST /api/projects/status` returns `scope: 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'` and `unavailableReason: 'NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS'` with all financial action flags set to `false`.
4. **Historical Custody Distinction**: Historical LP custody acknowledged by LP Locker V2 at observation LT is preserved and strictly separated from current wallet balances (`currentWalletUnits: null`).

---

## 2. Branch Compatibility Matrix

| Component | Source Reference | Compatibility Verification | Status |
| :--- | :--- | :--- | :--- |
| **Generation 2 Dispatch** | `migration-package-dispatch-v2.js` (PR #26) | Verified StateInit code hashes and genesis cells | **COMPATIBLE** |
| **VNext Guard Permit** | `anlgram-guard-vnext` (PR #23-#26) | Migration-only authorization verified | **COMPATIBLE** |
| **LP Locker V2** | `anlgram-lp-locker-v2` | Pinned version 2 bytecode and immutable terms | **COMPATIBLE** |
| **Gen 2 Status Projector** | `generation2Status` (PR #28) | Tested with source-compiled Sandbox state | **COMPATIBLE** |
| **MemeLabs 9-Stage Tracker** | `wizard/project-status.mjs` (PR #22) | Merged & updated for Generation 2 schema 2 | **COMPATIBLE** |
| **Private Worker API** | `worker.mjs` | Connected to server-side registry resolver | **COMPATIBLE** |

---

## 3. Server-Side Project Registration Infrastructure

### Architecture & Specification
Per Task 2 specifications, `testnet-interface/projects/project-registry.mjs` defines the server-side registration requirement:
- **Binding**: Worker KV / Durable Object / D1 SQL binding `PROJECT_REGISTRY`.
- **Index Key**: Deterministic `configurationFingerprint` (64-character lowercase hex string).
- **Required Invariant Records**:
  - `network`: `'-3'` (TON Testnet workchain 0 only)
  - `generation`: `2`
  - `executionVersion`: Exact sha256 from `execution-version.json`
  - `project`: Raw address of Jetton Minter (`0:...`)
  - `migrator`: Raw address of Migration Router Dispatch V2 (`0:...`)
  - `operationId`: Root query ID string
  - `configuration`: Pinned dispatch configuration parameters
- **Registration Lifecycle**:
  Registration cannot be created or updated by browser requests. It requires an authentic finalized V5 deployment transaction receipt verified against deterministic StateInit.
- **Fail-Closed Behavior**:
  Unregistered projects return HTTP 200 with `scope: 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'`, leaving all financial actions and signing disabled.

---

## 4. Authenticated Checkpoint Acquisition Pipeline

- **Account Proof Validation**:
  `verifyMigrationAccountCheckpoint(configuration, 'migration', rawProof, reference, 2)` verifies the Account BOC against independent masterchain reference hashes (`masterchainSeqno`, `masterchainRootHash`, `masterchainFileHash`).
- **StateInit Integrity**:
  The active Account cell is checked against `c.states.migration.code` and `c.states.migration.data`.
- **Rejection of Client Proofs**:
  Client requests cannot submit Merkle proofs, account BOCs, or mock checkpoints to `POST /api/projects/status`. Any caller-supplied evidence fields are dropped during server-side `prepareProject` normalization.

---

## 5. Generation 2 Status Projection & Gate 414 Compliance

The server projects status via `generation2Status(identity, { checkpoint, previous, evidence })`:
- **Supported Generation 2 States**:
  - `DEX_DISPATCHED`: Dispatched to STON.fi router (`dexDispatched === '1'`).
  - `LP_MINTED_OBSERVED`: Observed only when verified Pool-to-LP-wallet issuance trace exists.
  - `LP_CUSTODY_VERIFIED`: Historical on-chain LP custody acknowledged by LP Locker V2.
  - `LP_LOCKED_VERIFIED`: Lock percentage and unlock timer recorded in Locker ledger.
  - `SETTLEMENT_PENDING`: Multi-hop STON.fi router-to-pool settlement is active.
- **Gate 414 Invariant**:
  `SETTLEMENT_COMPLETE` is never returned. LPAccount balance changes, recreation, gas refunds, or local execution cannot mark settlement complete.
- **Historical vs. Current Custody**:
  `historicalLp` presents exact integer strings for `receivedUnits`, `lockedUnits`, `freeUnits`, `unlockTimestamp`, and `lt`. `currentWalletUnits` remains strictly `null`, preventing assumption of current custody.

---

## 6. Verified LP Evidence Handling

- **Evidence Inclusion**:
  LP issuance evidence must be branded via `verifyProvenLpEvidence` bound to the exact reference, Locker, Pool, and LP wallet.
- **Deduplication**:
  Receipts are deduplicated by `walletTransactionHash`.
- **Absence of Evidence**:
  When mint trace is absent, `mint` remains `'NOT_VERIFIED'`, `currentWalletUnits` remains `null`, and `unresolvedReturns` remains `'UNKNOWN'`.

---

## 7. Connected MemeLabs Dashboard Experience

The MemeLabs frontend (Step 6 "My Projects" and review cards) seamlessly reflects Generation 2 status:
- **Unregistered / Local Drafts**:
  Displays `UNKNOWN`, `UNAVAILABLE`, and `NOT VERIFIED`. No false progression is shown.
- **Dispatched & Locked Generation 2 Projects**:
  - Lifecycle Stage: Advances to `LP LOCKED (Historical LT: <lt>)` or `LP CUSTODY VERIFIED`.
  - Migration Lifecycle Steps: Steps 1–5, 7, and 8 verified on-chain; Step 6 verified if issuance trace present; Step 9 remains pending.
  - LP Locker Card: Displays historical verified balances with exact LT timestamp; clarifies that current wallet balance is UNKNOWN and withdrawals are disabled.

---

## 8. Integration Test Results

All test suites pass completely:

1. **`testnet-interface/test/generation2-integration.test.mjs`** (13/13 PASS):
   - ✔ 1. Registered project with authentic checkpoint
   - ✔ 2. Unregistered project configuration
   - ✔ 3. Authentic checkpoint with valid StateInit
   - ✔ 4. Invalid source contract hash
   - ✔ 5. Incorrect project identity
   - ✔ 6. Stale logical time
   - ✔ 7. Conflicting masterchain reference
   - ✔ 8. Duplicate receipt rejection
   - ✔ 9. Cross-network input rejection
   - ✔ 10. LP withdrawal after historical custody
   - ✔ 11. Missing Pool-to-wallet mint evidence
   - ✔ 12. Provider failure and unverified finality
2. **`testnet-interface/test/generation2-status.test.mjs`** (1/1 PASS):
   - Source-compiled Sandbox state reading and separation of historical custody from settlement.
3. **`testnet-interface/test/ux-backend-integration.test.mjs`** (5/5 PASS):
   - Verified economics, offline preparation mapping, frontend adapters, 9-stage tracker, positive/negative response verification.
4. **`testnet-interface/test/migration-status.test.mjs`** (4/4 PASS):
   - Readonly preparation invariants and receipt validation.
5. **`tests/settlement-runtime/migration-package-v2.test.js`** (7/7 PASS):
   - V2 StateInit handshake, frozen migrator recovery, immutable LP binding, graduation and return epochs.
6. **`testnet-interface/test/compiled-transport.test.mjs`** (42/42 PASS):
   - Patched SDK single-attempt invariant and network transport replay protection.
7. **`testnet-interface/test/execution-version.test.mjs`** (4/4 PASS):
   - Deterministic execution ID reproduction and persistent Worker pairing.

---

## 9. Recommended Next Steps

1. **Review and Merge Integration PR**:
   Merge `feature/memelabs-gen2-status-integration` into `main` after standard code review.
2. **Deploy Persistent Registration Storage**:
   Bind `PROJECT_REGISTRY` KV namespace / Durable Object in production Cloudflare Worker configuration when on-chain project creation receipts are introduced.
3. **Maintain Gate 414**:
   Keep `SETTLEMENT_COMPLETE` disabled until external STON.fi settlement completion proofs and LP withdrawal delivery contracts undergo independent qualified security audit.
