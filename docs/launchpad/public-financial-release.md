# Public financial release candidate and execution criteria

This candidate is stacked on PR #32 at `7983848268b18d6351baae184372c762f7d9da94`. It includes the PR #26 one-shot dispatch, PR #27 settlement counterexamples, PR #29 frontend integration, PR #30 private registration and PR #31 Standard V2 supervisor through that ancestry. The isolated wallet activation proposal in PR #34 is outside the public release.

## Implemented in this candidate

The existing Testnet wizard preparation endpoint and private Standard supervisor now use the same Standard V2 minter, wallet code and messages. Previously the public draft built a legacy minter and mint message, while the supervisor replaced both with a different V2 StateInit and payload. The correction preserves the private V2 deterministic addresses for the same configuration. Regenerate any old public Standard preparation because its legacy addresses and operation IDs are obsolete. The saved draft format, Launchpad preparation, mandatory 0.02 TON donation, UI and original Curve #2 lock are preserved. The public endpoint returns unsigned planning data. It carries no RPC authority, fee quote or deployment receipt.

## Vesting V2 settlement correction

The legacy counterexample still reproduces. After the beneficiary wallet froze at the final claim, 3000 units returned to the vesting Jetton wallet while the legacy schedule reported 4000 claimed. The schedule had counted dispatch as delivery and only handled its immediate wallet bounce.

The fresh Vesting V2 artifact reuses the pinned settlement wallet and unchanged vesting schedule math. It reserves a single pending claim under a strictly increasing owner query ID. An authenticated exact-amount success receipt books delivered units. An authenticated downstream failure releases the reservation without advancing claimed principal. A missing receipt keeps the claim pending. A beneficiary-funded retry queries the same wallet operation. An authenticated unseen response permits resubmission only under the original ID, so the wallet's persistent deduplication prevents another debit. The new claim and retry gas floor is 0.08 TON for the fresh version. No legacy code, deployed identities or tokenomics changed.

The integrated Sandbox test uses a freshly deployed and activated Launchpad project, buys and sells, graduates, dispatches both assets into captured STON.fi contracts, verifies LP custody and an authorized unlocked withdrawal, and checks Gate 414. It then deposits purchased Jettons into Vesting V2 and verifies the cliff claim, exact 3000-unit failure restoration, first-hop loss and same-ID recovery, delayed receipt, forged receipt rejection and duplicate receipt safety. DEX terminal settlement stays pending throughout.

Vesting V2 accepts only settlement wallet code hash `e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2`. Its code cell hash is `942578b7bf6585f16be69b531b0bc4266bfdda5085c87a63a89a7183d6d87953`. The builder selects it only for compatible wallet code. The public fair-launch draft still forbids initial team allocations. The integrated test funds vesting with purchased Jettons. A public flow for independently acquired Launchpad holdings remains unimplemented. Standard V2 still lacks the authenticated general transfer outcome used by Vesting V2. Its existing vesting template remains blocked under `AUTHENTICATED_SETTLEMENT_WALLET_REQUIRED`. Deployed legacy vesting schedules cannot be repaired in place by this version.

## Feature evidence and gates

All financial rows below are closed to public execution. No feature in this candidate has Mainnet approval or is enabled on Mainnet. Testnet activity refers only to what was verified live, separately from Sandbox.

| Feature | Implemented and tested evidence | Live Testnet and remaining gate |
|---|---|---|
| Standard Jetton V2 deployment and mint | Shared public/private preparation, source-checked artifacts, authenticated Sandbox deployment and initial mint receipt. Underfunded, bounced, duplicate and unauthorized mint paths covered. | No live Standard V2 deployment or mint verified. Requires isolated V5 initialization, fresh fee and ownership proofs, reviewed transport and operation-specific approval. Mint requires its own authenticated deployment and delivered-supply reconciliation. |
| Distribution | TEP-74 batches target the Standard V2 creator wallet. Sandbox executes exact-precision deliveries. | No live delivery receipts verified. Requires proved custody, per-batch fresh fee and destination checks, one-attempt orchestration and recipient-level receipt reconciliation. |
| Vesting | Vesting V2 books only authenticated delivery for settlement-wallet tokens, including the opt-in Standard profile described below. Sandbox covers frozen recipient, restored principal and delayed or duplicate receipts. | No live V2 vesting verified. Original Standard wallets and deployed legacy schedules retain their prior receipt limitations. |
| Curve buy/sell, fees and refunds | Source-compiled lifecycle and authenticated settlement tests exercise buy/sell, 1% Curve fee, reserve conservation, insufficient gas, frozen recipients, lost notifications and idempotent refund evidence. | No live project buy/sell/refund cycle verified. Requires version-aligned genesis, verified activation and transaction-specific final evidence. Historical Curve #2 remains retired and locked. |
| Graduation | Local 500 TON threshold and reserve/authorization checks, with the existing 80% Curve and 20% DEX allocation. | No live verified graduation. Eligibility does not authorize migration. |
| STON.fi migration and partial failure | Actual captured STON.fi Router, LPAccount and Pool bytecode executes both legs and produces LP in Sandbox. Tests cover minimum-LP rejection, independent leg failure and a delayed leg recreating LPAccount. | Closed. The official two-leg protocol can delete and recreate LPAccount. The same address or historical getter cannot establish that all obligations closed. Keep `SETTLEMENT_PENDING` and Gate 414. Require exact operation-bound closure for both deposit and return obligations before real user-funded migration. |
| LP lock and withdrawal | Sandbox covers authenticated custody and immutable 50ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ100% lock settings, expiry and permanent locks. Proven historical custody is separate from current holdings. | No live custody or withdrawal verified. Missing first notification and external recipient delivery require independently authenticated, operation-bound evidence. Immediate bounce recovery is narrower than downstream failure recovery. |
| Public receipts and frontend | Existing project-status API and six-step wizard handle UNKNOWN, read-only observations, and authenticated receipt adapters. Local tests cover proof, restart, provider outages, wrong network, stale data and duplicate submissions. | Public website remains read-only. No registered live Gen2 settlement verified. Require reviewed private registry bindings, genuine end-to-end receipts and environment-specific deployment. |
| Telegram Mini App | Existing integration remains in the baseline. | Financial Mini App compatibility was not verified. Requires origin, wallet capability, reconnect, expiry, and one-attempt bridge tests on actual clients. |

The foreign settlement limits are consistent with the [official STON.fi liquidity message lifecycle](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/examples/lp-provide). A custody receipt can establish historical LP credit while the migration remains pending. A new off-chain settlement authority is outside this design.

## Verified read-only observations and reproduction

The public MemeLabs page returned HTTP 200 with its read-only bootstrap. The Testnet configuration returned HTTP 200, network -3, financial signing false and Curve #2 retired. The historical ANLTEST minter returned active from TON Center Testnet with the recorded legacy code hash. [Recorded Testnet deployment evidence](./testnet-minter-one-finalized.json)

That historical record is separate from this candidate and does not establish Standard V2 or Launchpad readiness. No live transaction was initiated by this work.

The local settlement suite passed **227 of 227** cases. The Testnet interface suite passed **275 of 275** cases, including Standard V2 parity, the legacy frozen-recipient counterexample and the new integrated Vesting V2 lifecycle. Both suites had zero failures and zero skips. The Vesting V2 and Standard V2 compilation checks reproduced the committed artifacts. These are local tests and captured-protocol fixtures. They do not establish public on-chain completion.

Run the following from a checkout with the pinned Node dependencies installed. To exercise the GnuPG fixture, set `ANLGRAM_TEST_GPG` to a trusted local GnuPG executable. The GnuPG test uses public disposable fixture data.

```text
npm --prefix tests/settlement-runtime test
npm --prefix testnet-interface test
node minter-contract/compile-vesting-v2.js --check
node minter-contract/compile-standard-jetton-v2.js --check
node minter-contract/compile-one-shot-dispatch.js --check
```

## Release checklist

### PR #35 follow-up for Standard vesting and Gate 414

For a new Standard draft, the wizard's optional vesting section can select `walletProfile: "STANDARD_V2_SETTLEMENT"`. Public preparation, private supervision and registry intent recompute the same canonical configuration fingerprint and minter StateInit. Existing drafts keep their prior profile by default. The new profile keeps the Standard V2 minter code and TEP-74 interface, adds the existing authenticated settlement extension to its wallet, and selects a Vesting V2 artifact pinned to that wallet. No deployed schedule or wallet is migrated.

| Artifact | Code cell SHA-256 |
|---|---|
| Standard V2 minter, unchanged | `397faa44a7892b3f2eb0da4cf6f2ef04876d121f87f516c91fe3402808831d8c` |
| Standard V2 settlement-enabled wallet | `464dc9e767cd096f27597f2952569adbf14aac010ae90aa60595b8ce7aabf765` |
| Vesting V2 for Standard V2 settlement-enabled wallets | `d436ede674ef3c17781dbf8c4a850e57b114342559dabb8a2405dc050bc2cda9` |
| One-shot Migrator, unchanged | `7df729a4c2fecf3b4dba2fd16936b56d0e35af0c8f0a237b31d60e39ed89dbf1` |
| One-shot Curve, unchanged | `d6a24fb21edd77152e5f2ae490bab4a09768b8d0ec472b18d371ff35bc4b5473` |

The new Sandbox path deploys and mints the Standard token, funds vesting via TEP-74, authenticates a 1,000-unit cliff delivery, recovers a 3,000-unit downstream bounce without increasing claimed principal, then reconciles a delayed final receipt with a funded query under the same operation ID. The duplicate and forged receipts cannot add principal. Final total supply equals the sum of the creator, vesting and beneficiary wallet balances. A confirmed failed transfer clears that claim and consumes its ID. A subsequent claim uses a new ID. A missing or delayed receipt keeps its existing ID for reconciliation.

The captured STON.fi tests exercise both actual deposit legs, independent leg failure, LP mint and custody, LPAccount deletion and same-address recreation, and a refund whose dispatch precedes actual receipt. The operation ledger can identify local funding, transit and authenticated returns it has booked. The Router, Pool and LPAccount callbacks do not provide an operation-bound terminal barrier proving no delayed leg, recreated LPAccount balance or downstream return remains. A Locker receipt proves historical LP credit only. A refund callback or local wallet debit cannot prove downstream delivery. The contract therefore preserves Gate 414 and `SETTLEMENT_PENDING` when a return or deposit obligation lacks conclusive closure. No contract or provider trust change is introduced for migration. See [official STON.fi LPAccount interface](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount).

The reproducible [LPAccount counterexample](../../tests/settlement-runtime/lpaccount-settlement-evidence.test.js) separates these edges:

| Observed edge | Accounting consequence |
|---|---|
| Jetton leg arrives before the native leg | The LPAccount holds only the first principal. Its genuine `0x24cfc100` reply can arrive after the account has been deleted and recreated by the delayed native leg. The reply cannot establish the current obligation. |
| LPAccount forwards both legs to Pool via `0x06ecd527` | The LPAccount is deleted. The Pool may mint LP or recreate the LPAccount if minimum LP is unmet. Missing state and bounced queries cannot establish zero obligations. |
| LPAccount dispatches a refund | The Migrator's returned-principal counters remain unchanged until authenticated return messages arrive. The same refund body can affect a recreated LPAccount. |
| One funding leg bounces and the other returns from DEX | The ledger books each asset once under the original operation. Reconciliation preserves the cumulative amounts and Gate 414 still rejects terminal cancellation. |
| Locker observes LP or later spends unlocked LP | Historical credit remains separate from current wallet holdings and final delivery to an external withdrawal recipient. |

Reproduce the added artifact and lifecycle checks from the repository root.

```text
node minter-contract/compile-standard-jetton-settlement-wallet.js --check
node minter-contract/compile-vesting-v2.js --standard --check
node --test testnet-interface/test/vesting-v2-lifecycle.test.mjs
node --test tests/settlement-runtime/lpaccount-settlement-evidence.test.js
```

| Feature | Testnet execution | Mainnet execution |
|---|---|---|
| Standard V2 creation, mint and vesting with the new profile | NO-GO until independent review, fresh network-specific preflight and separately authorized live verification | NO-GO |
| Curve trading and graduation | NO-GO for public use. Existing Sandbox evidence only | NO-GO |
| STON.fi migration, LP custody and withdrawals | NO-GO. External terminal settlement and final withdrawal delivery remain unproven | NO-GO |

- Use the isolated PR for review. Keep the live GitHub Pages read-only packaging workflow from production main. The inherited development branch has a different whole-checkout artifact rule and must not replace production packaging.
- Use reviewed environment-specific deployment manifests with explicit chain IDs, artifact hashes, StateInit, provider and origin bindings, and one enablement decision per feature. Keep Mainnet and Testnet ledgers, wallets and approvals separate. No blanket enablement switch.
- Before opening a feature, independently review its exact artifact and operation implementation, verify the authorization and emergency pause boundary, prove actual Testnet outcomes and failures with account-linked transaction evidence, and reconcile all financial obligations. Keep unknown outcomes reserved. Use a config-controlled release gate for each fully verified path when its complete execution and monitoring stack is present.
- Keep source-level financial restrictions for missing execution or settlement paths. Config alone cannot make a missing proof or unsafe transfer sequence ready. Require explicit authorization for the first isolated Testnet transaction. Mainnet remains NO-GO.
