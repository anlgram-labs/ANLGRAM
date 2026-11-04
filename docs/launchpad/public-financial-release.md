# Public financial release candidate and execution criteria

This candidate is stacked on PR #32 at `7983848268b18d6351baae184372c762f7d9da94`. It includes the PR #26 one-shot dispatch, PR #27 settlement counterexamples, PR #29 frontend integration, PR #30 private registration and PR #31 Standard V2 supervisor through that ancestry. The isolated wallet activation proposal in PR #34 is outside the public release.

## Implemented in this candidate

The existing Testnet wizard preparation endpoint and private Standard supervisor now use the same Standard V2 minter, wallet code and messages. Previously the public draft built a legacy minter and mint message, while the supervisor replaced both with a different V2 StateInit and payload. The correction preserves the private V2 deterministic addresses for the same configuration. Regenerate any old public Standard preparation because its legacy addresses and operation IDs are obsolete. The saved draft format, Launchpad preparation, mandatory 0.02 TON donation, UI and original Curve #2 lock are preserved. The public endpoint returns unsigned planning data. It carries no RPC authority, fee quote or deployment receipt.

A new negative-path check reproduces a vesting accounting defect. With the beneficiary Jetton wallet frozen at the final claim, the downstream delivery aborts and 3000 units return to the vesting Jetton wallet. The vesting contract still reports 4000 units claimed, including the 1000 delivered earlier. Its dispatch-time claimed counter and immediate sender-wallet bounce handler cannot reconcile a downstream recipient failure. The test reproduces the blocker and then verifies the successful path in a restored Sandbox snapshot. Public vesting requires a versioned delivery and recovery protocol that can consume authentic recipient outcomes. A timeout, wallet excess, or asserted receipt cannot credit a claim.

## Feature evidence and gates

All financial rows below are closed to public execution. No feature in this candidate has Mainnet approval or is enabled on Mainnet. Testnet activity refers only to what was verified live, separately from Sandbox.

| Feature | Implemented and tested evidence | Live Testnet and remaining gate |
|---|---|---|
| Standard Jetton V2 deployment and mint | Shared public/private preparation, source-checked artifacts, authenticated Sandbox deployment and initial mint receipt. Underfunded, bounced, duplicate and unauthorized mint paths covered. | No live Standard V2 deployment or mint verified. Requires isolated V5 initialization, fresh fee and ownership proofs, reviewed transport and operation-specific approval. Mint requires its own authenticated deployment and delivered-supply reconciliation. |
| Distribution | TEP-74 batches target the Standard V2 creator wallet. Sandbox executes exact-precision deliveries. | No live delivery receipts verified. Requires proved custody, per-batch fresh fee and destination checks, one-attempt orchestration and recipient-level receipt reconciliation. |
| Vesting | Exact deposit and maturity tests pass in Sandbox. Frozen recipient reproduces the claimed-principal defect described above. | Closed until exact successful delivery or recoverable failed principal can be authenticated and accounted for. |
| Curve buy/sell, fees and refunds | Source-compiled lifecycle and authenticated settlement tests exercise buy/sell, 1% Curve fee, reserve conservation, insufficient gas, frozen recipients, lost notifications and idempotent refund evidence. | No live project buy/sell/refund cycle verified. Requires version-aligned genesis, verified activation and transaction-specific final evidence. Historical Curve #2 remains retired and locked. |
| Graduation | Local 500 TON threshold and reserve/authorization checks, with the existing 80% Curve and 20% DEX allocation. | No live verified graduation. Eligibility does not authorize migration. |
| STON.fi migration and partial failure | Actual captured STON.fi Router, LPAccount and Pool bytecode executes both legs and produces LP in Sandbox. Tests cover minimum-LP rejection, independent leg failure and a delayed leg recreating LPAccount. | Closed. The official two-leg protocol can delete and recreate LPAccount. The same address or historical getter cannot establish that all obligations closed. Keep `SETTLEMENT_PENDING` and Gate 414. Require exact operation-bound closure for both deposit and return obligations before real user-funded migration. |
| LP lock and withdrawal | Sandbox covers authenticated custody and immutable 50â€“100% lock settings, expiry and permanent locks. Proven historical custody is separate from current holdings. | No live custody or withdrawal verified. Missing first notification and external recipient delivery require independently authenticated, operation-bound evidence. Immediate bounce recovery is narrower than downstream failure recovery. |
| Public receipts and frontend | Existing project-status API and six-step wizard handle UNKNOWN, read-only observations, and authenticated receipt adapters. Local tests cover proof, restart, provider outages, wrong network, stale data and duplicate submissions. | Public website remains read-only. No registered live Gen2 settlement verified. Require reviewed private registry bindings, genuine end-to-end receipts and environment-specific deployment. |
| Telegram Mini App | Existing integration remains in the baseline. | Financial Mini App compatibility was not verified. Requires origin, wallet capability, reconnect, expiry, and one-attempt bridge tests on actual clients. |

The foreign settlement limits are consistent with the [official STON.fi liquidity message lifecycle](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/examples/lp-provide). A custody receipt can establish historical LP credit while the migration remains pending. A new off-chain settlement authority is outside this design.

## Verified read-only observations and reproduction

The public MemeLabs page returned HTTP 200 with its read-only bootstrap. The Testnet configuration returned HTTP 200, network -3, financial signing false and Curve #2 retired. The historical ANLTEST minter returned active from TON Center Testnet with the recorded legacy code hash. [Recorded Testnet deployment evidence](./testnet-minter-one-finalized.json)

That historical record is separate from this candidate and does not establish Standard V2 or Launchpad readiness. No live transaction was initiated by this work.

The local settlement suite passed **227 of 227** cases. The Testnet interface suite passed **274 of 274** cases, including the updated public/private V2 parity test and the frozen-recipient counterexample. Both compilation checks reproduced the committed artifacts. These are local tests and captured-protocol fixtures. They do not establish public on-chain completion.

Run the following from a checkout with the pinned Node dependencies installed. To exercise the GnuPG fixture, set `ANLGRAM_TEST_GPG` to a trusted local GnuPG executable. The GnuPG test uses public disposable fixture data.

```text
npm --prefix tests/settlement-runtime test
npm --prefix testnet-interface test
node minter-contract/compile-standard-jetton-v2.js --check
node minter-contract/compile-one-shot-dispatch.js --check
```

## Release checklist

- Use the isolated PR for review. Keep the live GitHub Pages read-only packaging workflow from production main. The inherited development branch has a different whole-checkout artifact rule and must not replace production packaging.
- Use reviewed environment-specific deployment manifests with explicit chain IDs, artifact hashes, StateInit, provider and origin bindings, and one enablement decision per feature. Keep Mainnet and Testnet ledgers, wallets and approvals separate. No blanket enablement switch.
- Before opening a feature, independently review its exact artifact and operation implementation, verify the authorization and emergency pause boundary, prove actual Testnet outcomes and failures with account-linked transaction evidence, and reconcile all financial obligations. Keep unknown outcomes reserved. Use a config-controlled release gate for each fully verified path when its complete execution and monitoring stack is present.
- Keep source-level financial restrictions for missing execution or settlement paths. Config alone cannot make a missing proof or unsafe transfer sequence ready. Require explicit authorization for the first isolated Testnet transaction. Mainnet remains NO-GO.
