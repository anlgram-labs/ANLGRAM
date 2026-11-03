# Financial security gaps: sealed registration and supported LP evidence

**Exact independent code-review target: `e1dacb7dd82d628064950af43e1a20cc3ec2a48f`.**

Base is PR #21 at d7efdc6005ae491f04b968ee2249e185ea73feea, including the prior 420a17c review target. Subsequent documentation-only commits do not change this code target. No qualified independent review has been obtained. AI implementation/tests are not a substitute.

## Implementation status

| Gap | Implemented now | Still blocked |
|---|---|---|
| External authorization | Persistent guard-authenticated registration consumer, exact operation/project participants, immutable LP commitment, funded reserve/epoch matching, explicit LP minimum, at-most60s on-chain deadline, idempotent identical registration and rejection of replacements/replays. | The pinned guard cannot produce a positive Curve approval or registration. That producer/proof protocol is still absent. Execution remains sealed with 414 even when the consumer's local checks pass. |
| Canonical finality/settlement | Existing proof/history pipeline is reused for raw field and reference-relative inclusion checks. Exact persistent claim records and immediate-bounce restoration can now be consumed by the LP receipt adapter. | No authenticated Testnet bootstrap/key-block/validator proof chain, validator quorum verification, current foreign code proof or complete canonical DEX settlement trace has been supplied. UNKNOWN remains; no COMPLETE transition was added. |
| Missing-first LP notification | Migrator now consumes the existing Locker 0x414c5639 authenticated floor receipt; checks its exact vault/Pool/wallet/root, permanent100% terms and monotonic floor/LT. Caller-funded queries and same-nonce retries use the existing locker probe. Floor evidence is persisted in the existing LP observation record and prevents another authorization. | Floor is not exact balance or migration-specific issuance. It never creates LP credit, changes locked/free amounts or clears a receipt. Exact on-chain recovery for partial/timed locks remains unsupported. |
| Withdrawal settlement | Existing claim dictionary is checked against the exact q/amount/kind before accepting raw delivery fields. New immediate LP-wallet bounce adapter checks actual parent/child messages, failed wallet execution, original request, deleted claim and exact restored principal. | A downstream recipient failure or lost final notification is not an immediate wallet bounce. Foreign LP wallets still provide no final authenticated callback to clear the Locker pending request. No off-chain receipt is injected into the contract. |

These are completed safe consumers and protections, **not a claim that the four financial gaps are fully closed**.

## Authorization invariants and compatibility

Development-only Migrator command **0x414e5a03** accepts a registration only from its configured immutable guard, never the admin or creator. The Curve-side initialization/lifecycle and exact candidate StateInit bindings remain prerequisites; this callback is not a replacement for reverse code/finality authentication or a source of independent security approval.

The registration commits to the root query ID, Curve/Migrator/vault addresses, LP intent hash, original TON/Jetton obligations, Curve/funding/DEX epochs, explicit LP minimum and chain-time window. It requires the existing fully funded local readiness predicate: at least500TON, exactly200M DEX units at9 decimals, no pending DEX obligations, no earlier dispatch, no return transit/bookings and no existing recorded/unassigned LP. Execution templates must match the exact pair wallets, LP wallet and registered minimum. The original hard denial remains after these checks.

One registration is immutable. Identical duplicates are idempotent while valid; different registrations, expired windows, changed epochs and cross-project contexts fail. Expiration is checked with TVM `now()`, not browser time. The permitted window is at most60s and is not extended. A later deposit/return or unassigned LP floor invalidates local eligibility. There is no automatic renewal, rearm or signing path.

**Important limitation:** registration is a post-funding consumer. It does not solve the preceding positive Curve dispatch authorization. The producer must separately prove the whole graph, current external dependencies and approved conditions. Expired immutable operation renewal would need an independently reviewed, versioned protocol; the current execute body does not bind a new permit revision, so silently renewing would permit ambiguous old requests. Existing principal-return paths remain available in local contract code, but no recovery operation is executed or automatically authorized here.

No new signing key, reviewer oracle, provider-as-authorizer or admin bypass was introduced. The consumer's positive branch is tested with a narrowly scoped seeded funding fixture and injected guard messages. That fixture is explicitly **not canonical dispatch, a real guard approval or external on-chain evidence**. The canonical fresh-genesis test still ends at the denied financial gate.

The immutable LP intent/binding and V3 lifecycle dictionaries are reused. The reserved key0 record gains an optional registration reference; its observation gains an optional floor reference. Readers accept absent optional fields. V1, deployed ANLTEST minter and Locker V2 source/bytecode/ABI remain unchanged. The new Migrator commands are local ANLGRAM protocol extensions, not invented STON.fi interfaces.

## Supported custody recovery

Development-only **0x414e5a04** forwards an existing Locker 0x414c5636 initial probe or0x414c5638 funded retry. Sender must be the bound admin/Curve, query must match the immutable root, binding must exist and terms must be100% permanent. The retry cannot replace the stored candidate/nonce. It forwards only caller funding with existing reserve protection; a lower-bound probe cannot spend native liquidity principal.

Preparation requires an explicit positive candidate or explicit retry; no balance is invented.150m nanoTON is the caller-funded attachment for this local probe-forwarding template,40m for registration. These are gas funding requirements, not fee estimates or total network debit ceilings. No wallet/UI execution was enabled.

Authenticated 0x414c5639 receipt flags must remain0: neither exact balance nor attributed issuance. A stale receipt is ignored, an identical duplicate is idempotent, a conflicting same-LT receipt or decreasing floor is rejected. A fresh regular locker observation preserves the floor. The floor getter returns its LT/amount and exact/attributed flags0. Available/locked/free/pending balances are not credited from a floor. The unassigned floor blocks another migration authorization.

The existing raw Pool-to-wallet receipt adapter can establish local delivery fields without the first locker notification, but it still cannot prove full migration ancestry or produce a message that the foreign wallet/Locker authenticate as recovery credit. Current foreign wallets do not expose a contract-authenticated historical balance/issuance query. An API response, provider flag, excess, manual beneficiary acknowledgement or self-transfer is not a substitute.

## Withdrawal evidence trust model

`verifyLpWithdrawalFields` now additionally verifies the exact new persistent claim entry, absence of a prior same-q claim and immutable q/amount/kind, alongside existing authority/maturity/account deltas and message edges. Successful local recipient delivery is not a final contract callback; pending remains.

`verifyLpWithdrawalBounceFields` handles only the original LP wallet's immediate failed execution and the actual bounced original request into the locker. It proves the exact stored claim was removed and locked/free principal restored once. The original withdrawal query is not reused. A downstream bounce cannot be substituted. The included-proof wrapper reuses the existing account-inclusion/history matching and still returns validator finality false. No automatic new attempt is authorized.

Locker V2 itself is unchanged: permanent principal has no withdrawal/upgrade/emergency path; timed claims require maturity and the beneficiary; unlocked LP is controlled only by the configured controller. Pending foreign-wallet outcomes never become delivered merely because a notification is absent.

## Exact canonical finality and settlement evidence still required

1. An authenticated Testnet trust anchor, not merely two matching API responses. Authenticate the key-block proof chain and validator-set transitions through the target masterchain block, including correct validator/catchain selection, signed block identity and required weighted signatures. The official TON implementation performs these checks in [check-proof.cpp at pinned commit857b8a57](https://github.com/ton-blockchain/ton/blob/857b8a57a178e6ae0fe7fa86e7d81c5233de8560/crypto/block/check-proof.cpp). Fetching a signature list alone does not authenticate the validator keys/weights.
2. Bind that authenticated masterchain block to the shard/account proofs and raw transaction history already checked by the existing adapter. The current adapter only authenticates inclusion **relative to the supplied reference**, not provider provenance or validator quorum. It has not been promoted into a validator light client.
3. Authenticate approved root registration and both deposit legs, current Router/Pool/pair/master/wallet code and ownership, exact messages, pool/LPAccount preconditions, successful pool reserve/supply changes and all descendants. A successful one-leg wallet dispatch is not DEX settlement.
4. Attribute actual LP issuance and receipt to that exact root and immutable beneficiary/controller configuration. Independently account for each principal unit as net deposit, in-flight obligation or authenticated return. Keep fees/storage/caller gas distinct from principal. Reconcile duplicate/delayed/refunded legs and all pending balances before any terminal state.
5. For contract-level first-notification recovery or withdrawal finalization, supply a reviewed contract-consumable anchored proof implementation or an authenticated capability in the actual foreign contracts. Neither exists in this package. Off-chain proof matching cannot become an internal receipt automatically.

Router administration upgrade authority remains the accepted development trust assumption and an independent-review concern. Captured bytecode tests do not prove current deployed code or source/build correspondence. No new validator-finality or custody claim is made.

## Verified tests and artifacts

- Focused source-compiled/captured-bytecode financial regression: **75 passed,0 failed**.
- Modified component subset: **16 passed,0 failed**, included above.
- Backend/project receipt/status compatibility: **18 passed,0 failed**.
- Reproducible compilation `node minter-contract/compile-migration-package-v2.js --check`: PASS.
- No previous test was removed or relaxed. No unrelated full-suite/browser/infrastructure audit was repeated.

New cases cover forged/premature/cross-project registration, mismatched epochs, duplicate/replacement attempts, exact expiry, immutable LP minimum, permanently sealed execution, floor receipt spoofing/staleness/decrease, caller-funded retries, reserve preservation and genuine captured-bytecode LP-wallet immediate bounce/replay.

| Artifact | Code-cell hash |
|---|---|
| Curve V2 | `24cf7fcaf32e5021b4287bca78e1ac8886a6e2a1e46a3cc89b80a1dda7ea0965` |
| Migrator V2 | `c629a2e360ac8fe335177bd7e8577a937946ba37361aa2204b9972471368947a` |

All source/dependency hashes, compiler identity, normalized implementation source hashes and result counts are in `migration-v2-audit-package.json`. New V2 code changes dependent deterministic addresses. Recompute the entire candidate graph; never reuse older deployment approvals or fingerprints. No contract was upgraded or deployed.

## Independent integration and release boundary

Review **e1dacb7** in full PR #21 context; the earlier 420a17c review target is superseded. Reviewers must include the initial positive guard/registration producer, one-shot expiry/recovery limitations, validator trust anchor, exact external operation attribution and unsupported final wallet receipts. None has been externally approved here.

PR #22 was independently checked at b644b71dddf89c39d1469eacc05f0657d74d10e0, with shared ancestor d7efdc6. Its frontend changes were not modified, merged or deployed. Review/rebuild these financial changes before any subsequent integration; all execution/release approvals remain separate.

**Financial Testnet readiness remains BLOCKED**, beyond offline/component review. Original Curve #2 LOCKED_PENDING_RECONCILIATION, nonce recovery restrictions and all Mainnet/financial gates remain untouched. No signatures, broadcasts, spending, financial deployments, Cloudflare publication or production changes occurred.
