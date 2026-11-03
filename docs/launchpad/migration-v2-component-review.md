# Curve/Migration V2 and actual STON.fi → Locker V2 component package

Historical checkpoint:8f1f4b0. For the current code review target, new artifact hashes, API contract and additional evidence, see `migration-v2-followup-review.md` and the current `migration-v2-audit-package.json`.

Base: PR #19, f8726732b892b4c25a279b646e0dd58092ec58d3. Isolated branch codex/curve-v2-migration-completion. This is an implementation checkpoint with genuine local external-bytecode tests, NOT completed or authorized financial migration.

## Compatibility findings and corrections

No separate deployable Curve V2 existed at this baseline. The existing Curve source contains V2 return-epoch and V3 dispatch lifecycle imports. Its canonical LP authorizer can only deny. The existing migration-v2-plan is an immutable address/observation component and explicitly has no executor. Neither can safely be renamed into an operational Curve V2.

The old migration Router emits V1 guard receipt tag0x414c5003 and a mutable `set_lp_wallet` message. Locker V2 expects immutable terms, tag0x414c5632 and an authenticated transfer origin equal to its configured contributor. The old plan configured itself as contributor, while actual STON.fi issuance identifies the liquidity provider. Thus linking the old Router/plan directly would lose the first custody notification even when LP actually arrived. This mismatch was reproduced/corrected in new versioned wire construction and checked against captured real Router/Pool/pTON/LP-wallet execution.

- Added separately named Curve V2 and Migration Router V2 sources/artifacts derived reproducibly from current V1 sources. The generator asserts exact edit anchors and records the base and every included-source SHA256; `--check` verifies source, pins, bytecode and provenance. V1 sources/artifacts, existing minter, Locker V2, economic math and original signing intents are untouched.
- Curve V2 initialization adds ONE StateInit reference for the exact new Migrator. It checks code identity, deterministic destination, Curve/guard/DEX/master/admin relationships, empty initial balances and the immutable LP intent. Missing/legacy/substituted initialization fails. Storage prefix and existing minter mint/renounce/settlement messages are retained. New code necessarily changes new Curve/Migrator/dynamic dependencies' deterministic addresses; these are not upgrades of existing deployments.
- Migrator V2 reserves key0 in the EXISTING flight used_ids dictionary for a constructor commitment to lock percentage/duration/operation ID/pair/beneficiary/controller/profile. The commitment excludes the self-address, making the deployment graph acyclic. The actual Locker V2 StateInit is bound once AFTER the Migrator address is known, with contributor equal to that address. The vault code/genesis, exact immutable settings, token pair and derived Pool/LP wallet are checked. Duplicate identical binding is idempotent; changed terms or substitute participants fail. V3 epochs and existing recovery accounting preserve key0; there is no second operation ledger.
- Added authenticated Locker V2 observations keyed to the same migration ID, strict Pool/wallet matching, cumulative conservation, monotonic logical time, duplicate/stale response handling and caller-funded recovery queries. Unused callback gas is returned without spending protected principal. A contract-record observation is NOT validator finality, exact external issuance attribution or final beneficiary delivery.
- Versioned source removes the old LP metadata mutation and uses the Locker V2 receipt tag/destination. New V2 execution templates append an explicit positive minimum LP amount; offline wire construction also REQUIRES an explicit LP minimum. The real-bytecode fixtures choose1 unit explicitly; that is NOT a production slippage policy or fresh quote. Existing400m provision funding and legacy wire gas allocations are not raised; attachments are not network fee ceilings.
- Canonical financial execution remains rejected414. No mutable admin bypass, artificial approval, new signed request, nonce recovery or lock reset was added. The original authorizer still cannot grant positive V2 approval/registration. This is an explicit remaining implementation/security boundary, not a claim that review alone would magically enable the current bytecode.

## Actual implemented sequence and evidence boundaries

Source-compiled Sandbox starts from fresh legitimate new StateInit: deploy compatible original minter code plus new Curve/Migrator, initialize, mint1B, verify exact Curve wallet custody, renounce and activate, buy and sell real local Jettons, reach the actual500TON graduation condition, freeze trading into graduation pending, open authenticated return/funding epochs, preserve the LP commitment, and reject unapproved dispatch without changing reserves/fees. This sequence does not seed post-dispatch state or bypass the canonical authorizer.

Separate external component tests use a local treasury as the liquidity provider. They compile the existing minter/settlement wallet/Locker V2 and execute the captured actual STON.fi v2.2 Router, Pool, pTON and LP-wallet libraries. Both deposits execute and actual LP-wallet balances/owner/master and Locker V2 notifications are verified. They test75%/180days,100% permanent,50%/180days and75%/365days, exact cumulative rounding, unauthorized/premature claims, exact unlock time, real beneficiary wallet delivery and duplicate prevention. The provider fixture is NOT the canonical Curve-to-Migrator authorized dispatch. These two test sequences are deliberately not represented as a completed end-to-end migration.

A single token leg actually remains in the external LPAccount, and official refund_me#132b9a2c with both Maybe-ref bits restores the exact200M Jettons. A lost first notification during actual DEX LP issuance leaves the vault record at0 while actual LP is present. The existing100%-permanent bounded self-transfer probe proves only a floor and does NOT fabricate original issuance credit. Actual post-unlock LP delivery still leaves the contract request pending because the foreign wallet provides no authenticated final-delivery receipt. These limitations are tested, not hidden behind altered expectations.

## Read-only / receipt integration

The EXISTING V5 deployment adapter now constructs policies for all versioned candidate roles, recomputes exact StateInit/address/code/data, requires exact attachment and Testnet V5 identity, and calls the SAME original deployment verifier. No new verifier, public arbitrary-receipt submission route, financial ledger, authorization or completion status is introduced. Field matches retain provenance/finality/custody/completion false; the old0.12TON diagnostic remains explicitly non-authorizing.

The current preparation API adds migration.statusView: configured target500TON and LP settings, with progress/reserves/eligibility/receipts/custody/unlock/withdrawal eligibility null or NOT_VERIFIED. It explicitly says the new package is for local review and has NOT been selected for the existing legacy plan. No frontend file was edited and no public deployment was performed in this financial sprint. Live per-contract observation/trace acquisition must be wired to authenticated approved addresses once genuine deployments exist; no synthetic responses fill that gap.

## Commands and verified results

- `node minter-contract/compile-migration-package-v2.js --check`: PASS.
- `npm test` in tests/settlement-runtime:173 pass,0 fail (all prior163 plus10 new cases).
- Focused new V2/STON component run:10 pass,0 fail (subset of173).
- Backend migration/preparation/receipt adapters:15 pass,0 fail.
- Root V5 receipt / financial-plan / preservation / mandatory donation Node suites:13 pass,0 fail; donation script additionally reports its26 internal checks passing.
- Initial compiler syntax errors in new helpers were corrected before the successful reproducibility and execution runs. Existing financial test expectations were not weakened. All tests are local/synthetic or captured-external-bytecode execution; no new on-chain verification occurred.

## Remaining blockers / independent review scope

1. A reviewed POSITIVE V2 authorizer/registration protocol and success/finalization reconciliation are still missing. The new Router's execution gate remains414 and Curve's original guard still denies approval. Full migration execution/finalization is NOT implemented or operational. Do not remove this gate merely to make an end-to-end test pass.
2. Current foreign code identity, Router upgrade authority, exact Pool/pair ownership and finality need independent review and live evidence. Captured bytecode hashes/getter relations do not attest current on-chain code. Existing accepted development trust model remains; it is not an audit.
3. Exact migration-specific LP issuance after the first notification is lost cannot be reconstructed from a custody floor, excess TON or an API getter alone. Partial/timed-lock first-notification recovery remains constrained; no credit is invented.
4. Actual foreign LP final-withdrawal receipts are unavailable. Successful dispatch/getter balance or lack of notification does not permit clearing pending principal, double claims or declaring completion.
5. No V2 deployment, Testnet transaction or Mainnet financial activation is authorized by these results. Original Curve #2 LOCKED_PENDING_RECONCILIATION and all its evidence remain untouched. Qualified independent security review and separately approved real Testnet verification remain prerequisites.

## Audit package and integration

`migration-v2-audit-package.json` supplies exact source/dependency/artifact identities and result counts. Two new artifacts only are committed; no existing artifact is regenerated. Review helper code and generator edits against their base first, then rebuild and run the commands above. Keep financial changes separate from Antigravity UI. Do not cherry-pick the new initialization format onto V1 code, reuse old deployment approvals or infer approved costs from Sandbox gas. No automatic merge or deployment.

| New artifact | Code-cell hash |
|---|---|
| anlgram-bonding-curve-v2 | `9a58d644d65b11e6a40f8d0cec5f1baa77d031ba80db3415be34ed2310ebe6d5` |
| anlgram-migration-router-v2 | `8999dda47e04011ccfff2ef406f8b438423275d8aaf42f501101a782821f1cec` |
