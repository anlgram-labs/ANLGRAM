# Generation 2 project status adapter

The existing project status adapter now accepts generation 2 checkpoints. The public POST /api/projects/status keeps its configuration-only response until a server integration has registered a project and acquired authenticated evidence. This change introduces no public API or client evidence input.

## Server integration

1. Resolve the project from a trusted registration associated with the existing configuration fingerprint. Use the pinned PR #26 package configuration, exact raw minter and Migrator addresses and root operation ID. Normalize addresses to raw strings before passing configuration across modules.
2. Acquire the raw account proof and independent Testnet reference through the existing evidence pipeline. Call verifyMigrationAccountCheckpoint(configuration, 'migration', raw, reference, 2). The parser verifies the same code and bound StateInit as the generation 2 getters. It reads their persisted fields from the included Account cell, which keeps all fields on one reference.
3. Optionally verify an issuance bundle with verifyProvenLpEvidence and the immutable Locker policy. Supply it only when the reference matches the Migrator checkpoint. The projection verifies the operation, Locker, Pool and LP wallet and deduplicates wallet transactions.
4. Call generation2Status(identity, { checkpoint, previous, evidence }). Keep the last accepted checkpoint in the caller's trusted project context and supply it as previous. The projector rejects older and conflicting references and logical times. It does not maintain a new high-water ledger. Reverify serialized evidence before passing it back to the adapter.
5. Expose the result through the existing status response when registered evidence is available. Keep all action eligibility separate from this result. On missing evidence use the existing unavailable behavior. An invalid or conflicting checkpoint should fail closed in the integration.

The mint badge is separate from custody. It needs a verified Pool-to-LP-wallet issuance trace. Custody and lock badges describe historical attributed credit at the Locker observation LT. LPAccount snapshots have no role in this projection. Reference-relative inclusion scope and last transaction identity are carried in checkpoint. Inclusion does not establish validator finality.

## Response fields

The object has schema 2, generation 2, exact project and Migrator raw addresses, operationId as an integer string, scope, dispatch, mint, custody, lock and settlement. The historicalLp object carries receivedUnits, lockedUnits, freeUnits, unlockTimestamp and lt as exact integer strings. The permanent sentinel is 18446744073709551615. checkpoint carries the existing reference and transaction proof metadata. evidence contains the verified issuance receipts, including Pool and wallet transaction hashes and LTs. All execution flags are false.

Safe field subset for a dispatch with a historical Locker acknowledgment and no separate mint trace:

```json
{
  "dispatch": "DEX_DISPATCHED",
  "mint": "NOT_VERIFIED",
  "custody": "LP_CUSTODY_VERIFIED",
  "lock": "LP_LOCKED_VERIFIED",
  "settlement": "SETTLEMENT_PENDING",
  "currentWalletUnits": null,
  "unresolvedReturns": "UNKNOWN",
  "financialSigningEnabled": false
}
```

With no checkpoint, dispatch, custody, lock and settlement are UNKNOWN. Historical LP and current wallet units are null. The projector has no reachable SETTLEMENT_COMPLETE output for the pinned generation. LPAccount recreation, returned gas and stale observations do not close either principal obligation.

## Focused verification

```powershell
node --test testnet-interface/test/generation2-status.test.mjs testnet-interface/test/migration-status.test.mjs tests/settlement-runtime/migration-package-v2.test.js
```

The new case reads actual source-compiled Sandbox Account state and checks alignment with the dispatch and LP getters. Its synthetic inclusion envelope exercises projection and ordering only. The test does not exercise a live proof acquisition path or a positive provider-included issuance bundle. The baseline route tests cover rejection of client evidence. Contract artifacts and the deployed configuration are outside this change.
