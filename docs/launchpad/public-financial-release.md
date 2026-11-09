# Public financial release candidate and execution criteria

## 300 TON integration checkpoint

### VNext unsigned execution rehearsal

The offline inventory now includes exact single-message templates for the five project deployments, Curve initialization, the one-billion-unit mint to Curve custody, and irreversible administrator renunciation. Sandbox exercises the same templates. The creation base and donation are shown separately and still require an approved payment and receipt. The manifest is unsigned, and configuration, keys and fees must be reviewed for the intended Testnet project. Example keys, historical ANLTEST and Curve #2 identities cannot establish readiness.

The private registry still requires its existing independently anchored deployment receipts for the minter, Curve and Migrator. Status now returns their verified registration identities and code/StateInit hashes without replacing the persisted record. Each migration leg exposes a separate Curve-to-Migrator funding status and a Curve return status. A fully booked return means that leg's principal was credited in Curve accounting. It conveys no DEX terminal proof. Pool, LP mint, historical Locker custody, live holdings and withdrawal delivery retain separate evidence requirements. STON.fi documents a 1% maximum referral on swaps. This revision adds no referral fee.

The internal trade builder accepts only a fresh, code-verified registered Curve checkpoint. It derives exact integer quotes and bounceable Testnet messages, with a maximum 100 bps slippage and the existing Sandbox attachments. Its sell builder rejects reserve exhaustion where the old getter would cap the displayed payout but the contract refunds. Its quote output is a reference-relative projection. A future executor needs fresh emulation, verified seller custody, exact owner approval, persistent one-attempt reservation and authenticated transaction/descendant reconciliation. The builder makes no wallet calls. The separate claim builder reopens the exact proven Curve Account, reads the owner's Jetton escrow entry and prepares the existing owner-bound claim. The contract prevents duplicate successful claims. Neither builder authenticates a historical native TON entitlement where the action failed and no bounce was emitted.

Run `node testnet-interface/testnet-release-cli.mjs manifest <public-drafts.json>` for the offline inventory. Run `node testnet-interface/testnet-release-cli.mjs rehearse` in a clean worktree for serial local checks. Before any authorized Testnet operation, review the exact manifest and commit, prove the operator identity and network, verify live account/DEX identities, emulate each message with fresh state and explicit spending policy, and reconcile each signed source, child transaction and balance before the next operation. For a rejected, interrupted or ambiguous send, retain the reservation, preserve the old message and wait for authenticated outcome evidence. An on-chain transaction has no code rollback. Do not repeat or compensate from provider balances alone. Gate 414 and historical Curve #2 remain closed.

### PR #38 post-audit getter

The audited Curve code hash was `594b37ee0dab3065b8d8a91c83f65451c7087d7ad1909d1c26d92220a6040014`. The follow-up compiles to `5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028`. The Migrator still compiles to `8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab`. Its artifact provenance changes with the generator. Legacy contracts and the original Curve #2 records are unchanged.

The Dispatch Curve now shares one calculation between execution and both getters. `get_buy_quote(gross)` retains its two results, tokens and actual protocol fee. `get_buy_quote_v2(gross)` returns atomic Jetton units, protocol fee in nanotons, gross consumed in nanotons, native principal refund in nanotons, and the graduation flag (TVM true is -1). Gross excludes the existing 40,000,000-nanoton operating allowance. V2 rejects an inactive Curve and input below the buy minimum. It models the current state and does not guarantee gas funding, slippage protection, message delivery or a future execution price.

Sandbox compares the tuples to the executed Curve's inventory and reserve deltas and to delivered native refunds. Cases include gross 300 TON, exactly 300 TON of principal with one unit still available, a subsequent purchase of that unit, gross 303.030303031 TON, and gross 510 and 610 TON. The test also covers total attachments of 510 and 610 TON. It rejects a replay after graduation and a forged refund claim. A tiny, directly injected bounceable message under the adversarial fee schedule reproduces a no-funds bounce with unchanged booked state and no refund emitted. There is no authenticated recovery entitlement for that case.

GitHub's PR #38 base is the head branch of PR #37, `codex/memelabs-hardening-20261105`. PR #38's head is `codex/vnext-audit-buy-fixes`. The previous audit applies to the old hash. Review the new hash before freezing or deriving any candidate. The stale inventory remains non-executable, and Gate 414 remains closed.

### Dispatch Curve audit-fix candidate

The VNext Dispatch Curve candidate moves from code hash `61b2246e82633c684fb9a9a8e7b5063cbbd752ca90217733bef684314d7df06d` to `594b37ee0dab3065b8d8a91c83f65451c7087d7ad1909d1c26d92220a6040014`. The Migrator retains code hash `8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab`. Its artifact changes only in generator provenance. The legacy Curve and Guard, the VNext Guard, Locker, ANLTEST manifests and original Curve #2 intent are unchanged. Dependent VNext addresses and operation scopes must be derived again from an approved configuration.

The existing 40,000,000-nanoton operating allowance remains fixed. The buy precheck reserves 35,000,000 nanotons for the Jetton-wallet hop and bounds forwarding for three basechain messages using the TVM fee schedule. The transfer has a single body reference and no StateInit. The two native returns are inline. The per-message bound allows two cells and 2,046 bits. Before returning from compute, the contract rechecks the bound with measured gas plus a 1,000-unit allowance for the fixed check-and-return tail. There is no explicit TVM commit before this check. Mandatory buy actions use bounce-on-action-failure modes. The incoming buy must be bounceable and from the basechain. On the adversarial fee schedule, the earlier bytecode retains the incoming principal after action result 37. The new bytecode rejects in compute with 405 and Sandbox routes the bounce to the original buyer, preserving reserves and reconciling the value and fees. This is prevention for the tested path. An unfunded bounce or a non-bounceable unsolicited transfer cannot be assumed to return. There is no historical recovery or claim handler.

At exactly 300 TON and one atomic unit remaining, the new Curve stays active. The last unit remains purchasable, and buying it takes the reserve to 300.000000001 TON. Graduation requires both the approved 300 TON minimum and exhausted inventory. The minimum gross for an initial full-inventory purchase is now 303.030303031 TON, excluding the existing gas allowance, with a fee of 3.030303030 TON. This follows `gross - floor(gross/100)` exactly. The excess from 510 and 610 TON is conserved. Reference-relative status reports graduation from the authenticated stage, inventory and reserve, rather than from a 100% progress bar. The legacy Curve getter is unchanged, and the Dispatch getter's second value still estimates the uncapped fee. Neither getter authorizes an executable financial quote.

The immutable legacy V5 candidate and attempt stay separate from the unsigned stale release inventory. A reviewed per-project deployment configuration and fresh identity derivation are required for a replacement executable VNext manifest. Gate 414 remains closed pending authenticated terminal deposit and return evidence. LP custody is not terminal settlement.

### Follow-up for PR #37

The 300 TON calibration changed an include used exclusively by the legacy LP authorization Guard. Its source then compiled to a different code cell from its pinned historical artifact. This follow-up restores the include byte-for-byte from before the calibration. The legacy Guard again compiles to `113108a0c8e7a48729e3da01dd2e2a4067955561ad8bfc19f1fba90db084a967`. Its historical 500 TON predicate is isolated to that Guard. The VNext Guard, Curve and Migrator still use the approved 300 TON configuration. No compiled artifact or historical manifest was changed.

The shared candidate verifier checks all six required roles, strict StateInit decoding, code and data hashes, derived workchain-zero addresses and Testnet tags. It is enforced for historical inputs used by Pages and before the offline generator can write a candidate. The separately pinned release inventory still reports its Guard mismatch and carries no execution authority. The fresh-project Sandbox test now verifies the 300 TON configuration after recompiling its dependencies and exercising mint custody and renouncement.

Two runs of `npm.cmd --prefix testnet-interface run build:pages` reproduced identical metadata and Worker hashes. `node scripts/prepare-testnet-v5.js --check` now gets past source compilation but returns `Stale V5 candidate` for the pinned release inventory. Keep that fingerprint intact until the exact replacement deployment graph is reviewed. The draft inventory and the legacy ANLTEST candidate are separate from the VNext deployment graph.

The integer reference test in `tests/settlement-runtime/graduation-reference.test.js` uses a monotone search over the normal floor-fee rule independently of the capped inversion. It identifies both the exact-threshold purchase and the first full-inventory purchase, and verifies the 510/610 TON refund delta. The existing TVM tests retain the exit 407 and action result 37 counterexamples. An Antigravity review of the exact revision is still needed before changing financial bytecode. Gate 414 still lacks operation-bound terminal evidence for both DEX deposit and return legs.

The isolated hardening pass starts at `cebba06` on the local 300 TON integration. The new VNext Sandbox regression deploys and activates a project before testing its capped buy. An impossible minimum exits with code 404 and preserves the Curve balance and state. Purchases attaching 510 and 610 TON each deliver the full 800M Jetton inventory, book the same principal and fees, and return the full 100 TON difference to the buyer. The Curve retains only its prior balance plus booked principal and fees. The test observes the actual excess message reaching the buyer.

The calibrated constant-product ceiling books 300,000,000,001 nanotons of principal. The current capped fee inversion books 3,030,303,031 nanotons. The minimum gross consistent with the normal floor-based 1% fee is 303,030,303,031 nanotons, one nanoton below the capped gross. This arithmetic discrepancy remains open. Changing it requires coordinated Curve bytecode and quote-model review. The Sandbox success case also does not establish recoverability after a failed native excess delivery or prove any live Testnet transfer.

Telegram verification rejects literal line breaks in decoded fields before building the signed key-value string. The regression shows how two parameter sets could otherwise share the same HMAC input. This is a parsing integrity fix. Telegram identity still grants no financial authority.

### Pages candidate separation

Commit `365488f` changed seven Guard code-hash references in the historical candidate file while leaving its StateInit and both historical intents intact. The active registry then pinned the edited content. Pages validates the historical fingerprint `b5edda7666aae4b79c4218a2dd91b941724663adeb58523d5d4bc89b3668c634` against its immutable intents and the separate release inventory fingerprint `ce0a2d547a9fdc53cfa43d8fb521889e808f17fc35a2e611738ba50c2409a8bb` against the registry. Both appear in generated metadata. Two complete local Pages dry-runs produced identical build metadata and Worker hashes. The release inventory still has a Guard StateInit code-hash mismatch, which is recorded in build metadata. The candidate generator also stops on the legacy Guard source/artifact mismatch. The build success is for read-only packaging.

### Curve arithmetic and the native return blocker

With virtual reserves `X = 100,000,000,000` nanotons and `Y = 1,066,666,666,666,666,666` token units, normal buys compute `n = g - floor(g/100)` and output `floor(Y*n/(X+n))`. At net 299,999,999,999, the Curve stays active with 666,668 units left. At exactly 300,000,000,000, it enters graduation pending with one atomic Jetton unit still in Curve inventory. At net 300,000,000,001, the raw output exceeds the available inventory. The cap uses `ceil(X*Y/(Y-inventory))-X`, which gives that same net value. The minimum gross for this net under the normal rule is `floor((n-1)*10000/9900)+1 = 303,030,303,031`. The current cap computes `ceil(n*10000/9900) = 303,030,303,032`. The smaller gross fails with exit 407 and rolls back. The larger gross succeeds and charges the extra nanoton. All figures exclude the existing 40,000,000-nanoton operational attachment. The regression preserves these findings for independent review before changing bytecode.

The native excess is non-bounceable. A frozen recipient in Sandbox receives the exact credit net of its transaction fees even though recipient code never runs. By contrast, a 100,000,000-nanoton forwarding base fee in the local configuration triggers action result 37 on a 510 TON purchase. The Curve data rolls back, no child message is emitted, and the Curve balance rises by exactly the attachment minus the failed transaction's fees. This is unbooked buyer principal. The current Curve has no durable operation record for that rolled-back buy. A missing notification, timeout, or surplus balance cannot authenticate a repayment. Keep recovery disabled. For an independently reviewed contract revision, evaluate bounce-on-action-failure on every mandatory buy action with a bounceable input and sufficient remaining return gas, plus a funded, operation-specific recovery design for cases where a bounce cannot be emitted. Reconcile using the exact inbound transaction and matched recipient credit or bounce, never dispatch alone. See [TON internal message bounce rules](https://docs.ton.org/foundations/messages/internal).

Telegram's HMAC format joins decoded fields with line feeds. The tests cover encoded punctuation, Unicode and escaped JSON line breaks, and reject ambiguous literal line breaks. Valid initData can be presented again within its five-minute read-only authentication window. A later presentation fails freshness. No financial approval is derived from Telegram.

Public financial execution remains blocked on both networks. Gate 414 still requires terminal proof for both STON.fi legs and their returns. Verified LP custody remains separately reportable. A valid live release also requires aligned manifests, independently reviewed signing and operation locks, and independently reconciled Testnet receipts.

Verification for this revision: 58 passed, zero failed and zero skipped across the serial VNext dispatch, LPAccount, candidate, security, release inventory, Vesting V2 and wizard suites. A broader concurrent run encountered Node/Wasm and Worker runtime allocation failures. Direct source compilation reproduced the pinned VNext Curve, Migrator, Guard and Locker hashes. The legacy Guard source compiled to `55a75d76988f6d361b5c8c6d10db2003fc396e21d3ff63bf4dd0506c9ba457fb` while the retained artifact is `113108a0c8e7a48729e3da01dd2e2a4067955561ad8bfc19f1fba90db084a967`. No contract or receipt was rewritten.

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

### LP withdrawal evidence acquisition

The registered Generation 2 project status now looks for both the exact immediate LP-wallet request bounce and the authorized delivery path from Locker to its LP wallet to the derived beneficiary or controller wallet. Acquisition reuses the bounded Testnet histories and account snapshots, then passes the matched transactions to the existing inclusion and state-transition verifier. The mint and withdrawal lookups share the Locker LP wallet history. Missing state snapshots, ambiguous matches and provider outages leave the affected observation unavailable.

The separate `withdrawalEvidence` field and MemeLabs status distinguish a reference-relative recipient delivery from restoration after an immediate bounce. The delivery observation does not clear Locker pending state. A downstream failure, timeout or missing callback still cannot authorize a retry or release. Gate 414 and all financial execution controls remain closed. No contract source or code cell changed in this phase.

Both paths are tested with captured STON.fi wallet bytecode routed through Sandbox. Tests compare exact message edges and reject wrong wallets, missing descendants, replay and substituted state. These runs do not establish live Testnet receipts or validator finality.

The clean rehearsal at `20f648c9ff340ee6af5995ecea4ffa9dae9087da` passed all 9 compiler checks, 30 settlement cases and 70 integration cases. The separate focused run passed 31 cases. Both runs recorded zero failures and zero skips. The unchanged contract hashes are listed below.

### Controlled Testnet preparation and operator checklist

The example inventory is labeled `EXAMPLE_KEYS_DETECTED` and always carries `executionEligible: false`. The reviewed Standard operator inventory is a separate [read-only JSON file](./reviewed-standard-testnet-inventory.json). Its V5R1 address and genesis hash reproduce from the owner's public key and match the wallet initialization review. The Standard minter is unassigned until the owner provides an actual Standard draft. Launchpad remains unassigned until a distinct reviewed Testnet operator, real project draft and migration authority public key exist.

```powershell
node .\testnet-interface\testnet-release-cli.mjs owner-manifest
node .\testnet-interface\testnet-release-cli.mjs owner-manifest "C:\path\to\real-standard-draft.json"
```

The optional file contains a canonical Standard draft directly. Set its creator to the reviewed Testnet wallet, choose the actual name, symbol, supply and decimals, and provide real optional distribution or vesting settings. Select `STANDARD_V2_SETTLEMENT` for Vesting V2. The live read-only Standard preflight CLI accepts its separate input envelope only for the pinned owner address and public key. The Standard submission adapter remains hard-disabled and independently checks the reviewed identity behind that gate.

Public TonAPI and TON Center observations both reported the reviewed wallet as uninitialized with `1999999999` nanotons. This is a provider observation and must be refreshed. It does not establish an initialization transaction, operator control, a current seqno or a deployment receipt. Use PR #34's independent initialization review before returning to Standard deployment preflight.

The prior clean release rehearsal at `20f648c9ff340ee6af5995ecea4ffa9dae9087da` passed 9 compiler checks, 30 settlement cases and 70 integration cases. This follow-up passed all 14 focused tests with zero failures and zero skips. A direct CLI check rejected the read-only inventory as a preflight input before opening provider access. The published owner inventory reproduced from the CLI.

#### Prepare the first owner Standard V2 draft

From the PR #35 worktree, run the reviewed script in Windows PowerShell 5.1. The execution policy applies only to that process.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\testnet-interface\prepare-standard-testnet-draft.ps1 -OutputDirectory "$env:USERPROFILE\Documents\ANLGRAM-Standard-Testnet"
```

Enter the approved token name, symbol, total supply and decimals. Press Enter to skip optional distribution or vesting. Distribution takes a UTF-8 public CSV with `address,amount` rows and one to four recipients per batch. Vesting takes an exact Testnet beneficiary, amount, UTC start date, cliff and duration, and selects `STANDARD_V2_SETTLEMENT`. The script pins the reviewed creator and checks that distribution and vesting fit the supply. It writes a canonical draft and a sanitized manifest into the selected directory. Keep the draft to preserve its project ID and deterministic contract addresses. The script refuses to overwrite either output. To reproduce the same manifest, pass the existing draft to `owner-manifest`.

The manifest includes the minter and creator Jetton wallet code, data and StateInit hashes, separate deployment and mint operation IDs and payload hashes, expected supply, and the optional vesting address. It omits transaction BOCs and financial authorization. The planned deployment and mint attachments are respectively 0.050 and 0.150 Testnet TON. Network fees and chain state remain unset or unverified.

After PR #34 verifies initialization, the Standard deployment requires a fresh included active V5R1 operator checkpoint, current seqno and funded balance, an independently confirmed empty uninitialized minter destination, and exact unsigned emulation at the authenticated reference. The separate read-only preflight input contains the saved draft, reviewed public key and explicitly approved `ownerPolicyCeilingNano`. The policy ceiling is not a guaranteed network fee cap. An independently reviewed single-attempt submission path, exact owner authorization and persistent reservation are still required. Reconcile the minter deployment before separately approving mint, and verify delivered supply before distribution or vesting. Launchpad and Gate 414 remain outside this flow.

Verification passed 13 focused tests with zero failures or skips. The Standard minter and original wallet, settlement wallet and Standard Vesting V2 artifact checks reproduced their committed code. A Windows PowerShell 5.1 smoke test generated both files using disposable token metadata, with chain state unverified and no fee quote. The smoke-test draft was not published.

The offline release CLI takes a JSON file with `network: "-3"`, `standard: {draft, publicKey}` and `launchpad: {draft, publicKey, migrationAuthorityPublicKey}`. Use current canonical schema-1 Testnet drafts from the wizard and the 64-character lowercase hex public keys of two distinct V5R1 subwallet-zero operators. The two draft creators must match the derived operators. An explicit Testnet-friendly address or a canonical workchain-zero raw address is accepted. A raw address has no network marker, so the Testnet V5 derivation and the explicit chain field establish the operator binding. The historical Curve operator and Curve #2 destination are excluded. PR #34 manages the wallet initialization independently. Enter public configuration only.

```powershell
node testnet-interface/testnet-release-cli.mjs manifest "C:\path\to\public-testnet-drafts.json"
node testnet-interface/testnet-release-cli.mjs rehearse
```

The manifest contains exact StateInit hashes and test-only display addresses, operation identities, the existing Standard deployment and mint message fingerprints, and a separate coordinated Generation 2 graph. The public Launchpad wizard's legacy preview addresses are separate. Use the Generation 2 record from this manifest for any subsequent review of that graph. The manifest has no fee quote or submission authorization. The rehearsal runs offline compiler checks and two-worker test suites and emits only the reviewed commit, worktree status, check names and counts. Provider credentials are not passed to its child processes. The only foreign identities in the manifest are pinned or captured references, including the Router and pTON family and the derived Pool, LPAccount code and Locker LP wallet. Check live code, libraries, pair bindings and external upgrade authority during a separately authorized preflight.

| Order | Standard path | Generation 2 Launchpad path |
|---|---|---|
| 1 | Confirm the separately initialized V5R1 operator, subwallet 0, Testnet wallet ID 2147483645, ownership, balance and current seqno | Confirm a separate V5R1 operator and exact Testnet migration-only authority public key |
| 2 | Deploy the exact Standard minter and verify initial admin, code, data and zero supply | Deploy minter → Curve → Guard → Migrator → Locker from the coordinated graph |
| 3 | Mint configured supply, then verify delivery to the creator's derived wallet and exact total supply | Initialize the Curve, mint and verify Curve wallet custody, then verify renunciation and activation |
| 4 | Reconcile creation charge separately, then review distribution or deploy and fund Vesting V2 before claims | Execute and reconcile individually quoted buy and sell operations. Verify fee, reserves and any refund before checking graduation |
| 5 | Reconcile every recipient or vesting claim under its exact operation ID | Verify 500 TON graduation, bind Locker and pair, establish return epochs, verify pre-funding permit, observe both funding legs, verify post-funding permit, then review DEX dispatch |
| 6 | Keep unsettled operations reserved | Observe both DEX legs and LP custody separately. Keep Gate 414 closed and require independent withdrawal delivery evidence |

**Before any future authorized Testnet operation:** use a clean reviewed commit, rederive the candidate, check the exact owner, chain, seqno, destination, state and absence of concurrent work, then obtain fresh unsigned emulation and a separately approved policy ceiling. The existing `standard-preflight-cli.mjs` accepts the Standard supervisor's public preflight input and performs read-only Testnet provider checks in an operator environment. It is outside the offline rehearsal. The maximum total network fee is not enforced by its policy ceiling. Reserve through the reviewed operation-specific lock before any possible submission and require explicit owner approval. The Standard deployment lock does not authorize mint, vesting, trading, migration or withdrawal.

**After an authorized operation:** match the signed V5 source transaction and exact outgoing message to the descendant transaction and its compute/action outcome. The existing Standard registration and Generation 2 adapters verify reference-relative inclusion and exact deployment edges. Generation 2 deployment registration covers minter, Curve and Migrator. Guard and Locker deployment, binding, final custody and asset transfers require their own evidence. Use the existing wallet receipt adapters for delivery or returned principal, and record the actual fee, balance delta, operation ID and expected versus observed state. Public reports should include only chain, scope, block reference, relevant account and message or transaction hashes, logical times, fee/amount deltas and explicit outcome. Keep raw provider bundles, approvals and internal logs private. Provider-reference inclusion and canonical validator finality are separate evidence levels.

**Crash, partial execution or provider outage:** retain the original reservation and operation ID even after expiry or restart. Compare source seqno, source and descendant history, actual account state and persistent receipt counters. A successful source action with a missing child is pending. A failed read, 429, conflicting proof or missing callback yields unknown. Resume read-only reconciliation after the provider cooldown. Never replay principal, reset a lock, or infer that a recreated LPAccount closes the older obligation. A failed immediate LP wallet request can restore only its exact authenticated bounce. A downstream failed withdrawal stays pending without contract-verifiable outcome evidence.

| Release area | Testnet readiness | Mainnet readiness |
|---|---|---|
| External V5R1 initialization | Owner-managed in PR #34. This checklist does not establish live wallet state | Disabled |
| Standard minter deployment | Offline candidate. Requires qualified review, live unsigned preflight, exact approval and a reviewed submission path | Disabled |
| Mint, distribution and vesting | Sandbox evidence. Requires per-operation live reconciliation and reviewed transport | Disabled |
| Launchpad initialization, activation and trading | Coordinated identities and Sandbox lifecycle. Requires separate deployment and transaction-specific live evidence | Disabled |
| Graduation, STON.fi, LP custody and withdrawals | Sandbox evidence. Gate 414, terminal refunds and external withdrawal receipts still block financial release | Disabled |

For eventual Mainnet, pin a separately reviewed chain `-239` manifest with independently derived V5 wallet IDs, production contract and DEX identities, provider and origin bindings, distinct storage namespaces, and one disabled-by-default gate per operation. Preserve the production donation configuration. Testnet addresses, operation locks, permits and evidence must remain in their Testnet scope. Configuration can open a fully validated feature only after independent review and genuine Testnet verification. Missing terminal proofs or submission paths remain implementation blockers.

### Public operation integration follow-up

The settlement-enabled Standard V2 profile now prepares distribution using the pinned wallet's authenticated transfer extension. Each recipient template identifies its owner query ID, expected amount, derived wallet and separate funded reconciliation query. The reconciliation message queries the existing operation and cannot initiate a new principal transfer. The legacy Standard V2 profile still prepares its original TEP-74 message. Historical exports or independently submitted transfers must be reconciled before approving a new distribution, because ordinary TEP-74 delivery does not populate the settlement dictionary.

The existing registered Standard project status route reads the exact creator wallet using the existing Testnet provider integration. The read-only adapter checks wallet code, owner, master, query ID, principal and recipient wallet against the canonical plan. It reports `DELIVERY_RECORDED`, `RETURN_RECORDED`, `PENDING` or `UNKNOWN` relative to the verified account reference. The wizard matches those rows to its current plan before displaying counts. Validator finality and transaction-specific release authorization remain separate requirements.

| Operation | Local evidence and remaining release gate |
|---|---|
| Standard creation and mint | The public plan and private supervisor derive the same deployment. Sandbox verifies mint supply and delivery. Public execution still requires an independently reviewed signer, isolated wallet initialization, fresh emulation and authenticated live deployment/mint reconciliation. |
| Distribution and Vesting V2 | The Standard Sandbox scenario executes mint, funded vesting, a recipient delivery with a delayed acknowledgment, same-ID reconciliation, a frozen recipient return and a duplicate transfer. It checks supply conservation and continues through Vesting V2 claim/recovery. Live recipient evidence and a reviewed one-attempt submission workflow remain prerequisites. |
| Curve purchase, sale, fees and refunds | The existing exact V5 Sandbox lifecycle verifies reserves and authenticated refund accounting. Production and Testnet still need operation-specific live verification and public authorization. |
| Graduation, migration, configurable LP lock and withdrawal | The source-compiled Launchpad lifecycle reaches graduation and executes captured STON.fi code through LP custody and an authorized unlocked withdrawal. Gate 414 blocks terminal settlement. A downstream external LP withdrawal still lacks a contract-consumable final receipt. |
| Telegram Mini App | The existing Telegram integration is preserved. Actual wallet compatibility, origin binding, session recovery and one-attempt financial transport in Telegram clients remain unverified. |

Public financial execution remains NO-GO on Testnet and Mainnet. No source or bytecode changes were made to financial contracts. The contract hashes listed in this report continue to identify the tested artifacts.

Verification recorded 227 settlement passes and 277 interface passes before the final registry refactor. The final focused rerun covered 12 cases across lifecycle, private preparation, registration and execution-version checks. Each run had zero failures and zero skips. The settlement suite used two test workers and captured STON.fi bytecode in Sandbox. The interface runs exercised local fixtures and did not verify live financial transactions.

### STON.fi terminal settlement and recovery checkpoint

Gate 414 is **NO-GO** on Testnet and Mainnet. STON.fi can delete the LPAccount during Pool handoff and recreate it at the same address. An authenticated balance reply describes one execution of that account. The refund callback initiates another asynchronous transfer. The interface supplies neither a lifetime identifier nor a terminal receipt that accounts for both original deposit legs, all descendant transfers and all recoverable balances. An LP credit, refund dispatch, missing callback or zero balance cannot establish that barrier. [Official STON.fi LPAccount interface](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount)

The registered Generation 2 status now includes `principalAccounting` for the exact active operation. Each leg reports original principal, funded amount, bounced funding, return in transit and principal booked by the Curve. `notBookedByCurve` equals original principal minus booked returns. It includes principal that might have been deposited successfully and does not represent a refund entitlement. Both DEX terminal outcomes and unresolved returns remain `UNKNOWN`. Historical LP custody remains separate.

The registry reserves a refresh transactionally, then validates and stores the new checkpoint against the latest durable checkpoint in a second transaction. An overlapping or delayed provider read cannot roll the persisted status backwards. Conflicting immutable obligations, decreasing cumulative counters and returns exceeding original principal are rejected. A provider outage or interrupted refresh preserves the last verified checkpoint and the bounded refresh cooldown. None of these operations send financial messages.

| Recovery evidence | Safe treatment |
|---|---|
| Missing first LP notification | The read-only acquisition filters for the exact Pool, wallet, contributor and operation payload before proof verification. Duplicate copies of the same transaction are collapsed and multiple distinct matches leave the result unknown. The existing verifier then requires matching histories and state hashes. It cannot book Locker custody from that observation. |
| Authenticated immediate Locker-to-wallet request bounce | The existing Locker can restore that exact request once. A missing callback does not qualify. |
| Downstream withdrawal failure or missing final delivery | Preserve the existing pending request. The foreign wallet can restore its own balance after a downstream bounce but supplies no contract-consumable operation receipt to the Locker. Do not retry or release a second payment. |
| Delayed deposit or refund after LPAccount recreation | Keep the original migration operation and both leg counters. A repeated refund to the same address can target a different account lifetime. Keep automated refunds and terminal settlement blocked. |

Reproduce the financial and monitoring checks with two test workers. In PowerShell, run the compiler and interface commands at the repository root and the last two lines inside `tests/settlement-runtime`.

```powershell
node minter-contract/compile-one-shot-dispatch.js --check
node minter-contract/compile-lp-locker-v2.js --check
node --test --test-concurrency=2 testnet-interface/test/generation2-status.test.mjs testnet-interface/test/generation2-integration.test.mjs testnet-interface/test/trusted-project-registration.test.mjs
$testFiles=(Get-Content package.json -Raw | ConvertFrom-Json).scripts.test.Split(' ') | Select-Object -Skip 2
node --test --test-concurrency=2 @testFiles
```

The unchanged LP Locker V2 code cell reproduced as `22d689df2f32d5fd00c72b50f31ab77291117a7625ad1bb654a4b6dbc796e001`. The unchanged Curve and Migrator reproduced the hashes below. The settlement suite passed 227 tests and the focused interface run passed 19 tests, each with zero failures and zero skips. These runs used local TVM execution, captured STON.fi bytecode, provider fixtures and a SQLite Durable Object restart. Live Testnet execution was outside this verification.

### PR #35 follow-up for Standard vesting and Gate 414

For a new Standard draft, the wizard's optional vesting section can select `walletProfile: "STANDARD_V2_SETTLEMENT"`. Public preparation, private supervision and registry intent recompute the same canonical configuration fingerprint and minter StateInit. Existing drafts keep their prior profile by default. The new profile keeps the Standard V2 minter code and TEP-74 interface, adds the existing authenticated settlement extension to its wallet, and selects a Vesting V2 artifact pinned to that wallet. No deployed schedule or wallet is migrated.

| Artifact | Code cell SHA-256 |
|---|---|
| Standard V2 minter, unchanged | `397faa44a7892b3f2eb0da4cf6f2ef04876d121f87f516c91fe3402808831d8c` |
| Original Standard V2 wallet, unchanged | `072d50c878949253fa6daee0149d12ed9adb91079cd5134b4d63a10ae6acb470` |
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
