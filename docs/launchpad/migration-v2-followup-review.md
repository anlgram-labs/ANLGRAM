# PR #21 follow-up: operation binding and external LP evidence

Required independent code review commit: **420a17c6c3dd64cc9b3b43e622e16d8837080c60**.
Base: 8f1f4b060226eb2c94c61a1e8ffb9f46603415ab. This package is NOT a qualified independent review, financial release, completed migration protocol or deployment approval. Subsequent documentation-only commits do not change that code-review target.

## Delivered versus unresolved

| Requested gap | Concrete code delivered | Boundary still closed |
|---|---|---|
| Positive authorization | Curve V2 checks exact graduation state, 500 TON threshold/reserve, exhausted Curve inventory, zero pending refund obligations, 200M DEX inventory and authenticated operator/creator. Migrator local readiness checks immutable root/binding, funded original obligations, epochs, principal balance and absence of prior dispatch or returns. | The canonical guard still cannot grant positive approval. The external positive authorizer/registration protocol is NOT implemented. Both getters return external authorization false; execute remains 414. Local eligibility is not permission. |
| Final reconciliation | New getter projects persistent V3 obligations/funding/returns and V2 LP observations from the EXISTING dictionaries. A confirmed defect is fixed: even the authentic Curve cannot prime a different operation root. Pinned-account adapter checks identities, authorities, pair, exact numeric fields and conservation before projecting records. | Successful canonical dispatch-to-DEX-to-final-reserve settlement is still NOT implemented. No stage means COMPLETE. Provider-relative account inclusion is not validator finality or DEX success. |
| First lost LP notification | A specialized adapter checks the actual Pool outbound message, recipient LP-wallet transaction, pinned code, master/owner, immutable payload/query/contributor and exact before/after Account hashes and LP delta. It works without a successful locker notification in local captured-bytecode routing. | Exact wallet delivery fields do NOT establish full Curve/Migrator-to-Pool operation lineage. They do not create locker credit, extend locks or authorize resending. An independently reviewed, contract-consumable attribution/recovery mechanism is still absent. |
| Final external withdrawal | Adapter checks the authentic locker claim, immutable config, beneficiary/controller, timestamp, permanent restriction, exact query/amount, locker pending changes, both real internal message edges, LP-wallet debit and recipient-wallet credit. Included raw history can anchor those fields to account proofs. | The foreign wallet supplies no contract-authenticated final-delivery callback. The locker pending request remains pending. No off-chain verdict clears it, double-claims or enables another transfer. Validator finality, live provider acquisition and deployment registration are still prerequisites. |

## Evidence layers

`projects/lp-evidence.mjs` extends the existing receipt architecture with LP-specific message/account checks; it reuses `verifyAccountInclusion` and `matchHistory`. It is internal/offline, not a public evidence ingestion API. Policies derive from the exact pinned Locker V2 genesis, immutable STON profile and deterministic Pool/LP-wallet relationship. Special/tick-tock/library-substituted StateInit is rejected.

Raw field functions never claim provider provenance, finality, exact migration attribution, completion or contract acceptance. The included-proof adapter additionally requires both raw provider histories, an inclusion proof for every participant, receipt membership and a common reference. **The reference still needs authentic server acquisition; caller-supplied provider labels/reference hashes are not provider authentication. Validator quorum signatures are not verified.** No current live V2 bundle exists and the positive inclusion path for these new V2 accounts has not been verified on-chain.

`projects/migration-account.mjs` decodes the exact current versioned code/address and immutable relationships. It retains distinctions between native wallet balance, recorded Curve reserve, protocol fees, return transit, booked principal and DEX obligations. Existing inclusion proof verification is reused. A raw parsed account cannot be promoted into a proven checkpoint by changing JSON flags.

The in-process WeakSet marks only that the internal proof adapter ran. It is not persistent security state, ownership proof, authorization or a financial ledger. Serialized/reloaded evidence must have its raw proofs checked again. Persistent accounting remains in the existing contracts; the original recovery ledger and operation lock are untouched. No new public provider-acquisition/persistence pipeline was introduced.

## Backend contract for Antigravity PR #20

New **POST `/api/projects/status`**, same-origin `application/json`, same bounded validated wizard draft as `/api/projects/prepare`. Testnet only; Mainnet origin/network fails. This release has no registered versioned project deployments, so the endpoint truthfully returns configuration and UNKNOWN/UNAVAILABLE, with reason `NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS`. It does NOT query arbitrary caller addresses or accept caller receipts.

Response: `schema:2`, `network:'-3'`, `configurationFingerprint`, `status`, `unavailableReason`, and all signing/migration/withdrawal flags false. Standard Jettons return `status:null` and an explicit no-launchpad-migration reason.

Within `status`:

- `lifecycle`: stage UNKNOWN and authenticated false until evidence exists.
- `graduation`: known target `500000000000`; unknown real reserve/progress/eligibility are null. Server-only reference-anchored records distinguish `localReserveEligible` from financial eligibility.
- `deposits.ton` / `.jettons`: unknown principal/returns null. Internal proven-account projection can expose original/funded/booked/in-transit records, explicitly not DEX finality.
- Router/Pool verification NOT_VERIFIED; transaction receipts null when absent.
- `lp`: immutable configured percent/duration/beneficiary/controller; custody/received/locked/unlocked/unlock/eligibility/withdrawal receipts null when unverified.
- `migrationAuthorized`, `financialSigningEnabled`, `withdrawalsEnabled`: false.

`migrationEvidenceStatus` is an internal projection over reverified evidence, not another ledger. It rejects JSON proof flags, wrong operation IDs and duplicate account roles. Repeated receipt hashes are idempotent. Historical wallet deltas are never summed into current custody or presumed locked balances. PR #20 frontend files were not edited or merged. No new runtime build was publicly deployed.

## Compatibility and artifacts

Only the development V2 artifacts change. Existing V1, ANLTEST minter, Locker V2 code/ABI, tokenomics, original Curve #2 lock and signing/recovery paths remain unchanged. Added getters and stricter root/prerequisite checks do not add a financial admin bypass. There is no authorized upgrade path to deployed contracts.

| Artifact | New code-cell hash |
|---|---|
| Curve V2 | `465b5aea4d2862dd1704b0a57b7ae63384a9292daf8934db1f42474b50fdede9` |
| Migrator V2 | `368a1295f8aae0fe157866980fb11e54365e4bc415fda5ab57f13eaab44dab9a` |

These supersede the V2 hashes at 8f1f4b0 and change all dependent candidate StateInit/address relationships. Rebuild each project graph; never reuse old approval sheets, addresses or transaction fingerprints. No existing deployed contract was changed. Source/dependency/compiler identities are in `migration-v2-audit-package.json`.

## Actual tests

- Targeted financial regression: **72 passed, 0 failed** across migration-package-v2, stonfi-locker-v2-real, lifecycle-v3, lp-v4, lp-locker-v2, refund-receipts, lp-custody-receipts and curve-return-v2.
- Final modified component subset: **13 passed, 0 failed**, included above. Includes new wrong-root rejection, positive local Curve readiness while execution remains blocked, raw pinned-account parsing, actual lost-notification issuance fields, authentic final recipient balance delta, frozen-recipient rejection, substituted account/transaction and noncanonical StateInit rejection.
- Backend/status/project receipt compatibility: **18 passed, 0 failed**.
- Reproducible compilation `--check`: PASS. Wrangler Pages worker **dry-run only**: PASS, no deployment.
- The preceding full 173-case result belongs to 8f1f4b0; unrelated suites were not rerun this follow-up. No previous case was removed or financial expectation weakened.

All new external-contract execution evidence is captured STON Router/Pool/pTON/LP-wallet bytecode run locally with source-compiled ANLGRAM contracts. It is not live Testnet, current foreign source/build verification or Mainnet evidence. Initial new-adapter type/layout errors were corrected before the successful runs; no failed case was hidden.

## Independent review and next boundary

Review commit 420a17c in its full PR #21 context, especially operation-root binding, reserve prerequisites, Account state commitments, exact cross-contract messages, epoch preservation, raw history/reference provenance and the distinction between locker records and wallet delivery. Recompile the two artifacts and reproduce the focused commands above. The qualified reviewer must address the still-missing positive authorizer, canonical finalization, contract-consumable LP attribution/recovery and withdrawal-receipt trust model before any financial activation.

No signing request, broadcast, nonce recovery, financial deployment, TON spending, Mainnet activation or production/frontend publication occurred. Migration, LP withdrawals, original Curve #2 recovery and Mainnet financial actions remain disabled. This implementation does not turn the four remaining gaps into a fully operational migration.
