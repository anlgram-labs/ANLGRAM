# MemeLabs isolated sprint: review notes

## Accepted development model — deterministic LP authentication

The user explicitly approved the documented external STON.fi Router trust model
for development on October 30: "Acepto el modelo para desarrollo". This is not
deployment, signing, spending, Mainnet activation or independent source-review
approval. All existing commits remain preserved; code commit `e405a51` extends
the isolated development branch from `4371111`.

The LP guard now optionally embeds an immutable development code profile in
genesis. It checks the exact Pool, LP-wallet and LP-account code-cell hashes,
then independently calculates Pool StateInit from the configured Router and
discovered pair wallets. Descending serialized-address cell-hash ordering matches
the actual captured Router in 32 pairs, in both input orders. The LP wallet is
calculated from its code, the guard as owner, and the derived Pool as master.
The observed genesis DEX fields 20/10 are used for identity only; no ANLGRAM or
foreign DEX fee is changed.

Before the Pool exists, the contract exposes both calculated endpoints through
`get_expected_destinations`. It still awaits the actual Pool's TEP-89 response as
corroboration. Even authenticated Router/Pool replies cannot substitute other
addresses. Substituted code cells, changed genesis fees and invalid profile tags
are rejected before query dispatch. Validation is marked impure so the compiler
cannot discard checks when only their throwing behavior is needed.

No custody finalization was added. A matching StateInit address does not prove
current foreign code, non-upgradability, account balance or a particular LP mint.
`is_migration_authorized()` remains zero and Curve dispatch/finalization still
reject 414. Independent foreign v2.2 source/build and immutability review,
operation-correlated LP custody receipts, zero-forward Jetton refund receipts,
Curve handoff receipts and final migration reconciliation remain outstanding.
The TON ABI schema reference is pinned to commit
`7dc57067d85c95dc25c09ccaaf108eaba62f6303`; a schema is not an audited implementation.

Actual final results: **92/92 local Sandbox tests**, **37/37 root regression
suites**, 139 financial assertions in both source/artifact runner paths, 68/68
supervised executor tests, 46/46 math tests including 12,000 deterministic cycles,
and 5/5 legacy minter tests. All four compiler checks and the offline foreign
profile regeneration check pass. Machine-readable current evidence is in
[`verified-lp-deterministic-auth-2026-10-30.json`](verified-lp-deterministic-auth-2026-10-30.json).
The five new tests include real captured-code derivation/bootstrap and explicitly
labeled local injected adversarial replies. No result is live ANLGRAM settlement.

Current LP guard code-cell SHA-256:
`c7cb54c792e23eea4abb1bf3472d819ae2b8fb7d095b9010cf66031fec9e8143`.
BOC SHA-256:
`94c7663923f7e3953b1b8f4ce46f4ace84f3a61dce254922474e018bbe4ca0c9`.
The existing guard root layout is unchanged; the configuration accepts an optional
second reference containing the profile. Old configurations remain readable and
gain no financial authorization. New code/profile changes the guard candidate to
`0:0ea55227dfae405859094b7526c376b441c729aec35fd0a7943ffad3248046ef`.
The unchanged migration bytecode embeds that guard in genesis, so its candidate
changes to `0:245f446a80ffc4cbc80186a1d5f41358a28eefa368c1615afc0ae70104026740`.
Master, Curve, project wallet bytecode, tokenomics and their candidate identities
remain unchanged. The regenerated manifest now includes an LP-wallet prediction
before bootstrap, marked without custody/audit authorization.

Review points for Antigravity: guard source/artifact, optional config reference,
offline candidate builder and runtime suite registration. New import, profile,
offline extractor, derivation helper and test file are separate. Use
`git diff --name-status 4371111..e405a51` for the code file list. Fetch current
Antigravity refs again before integration; do not resolve financial conflicts
automatically. PR #2, production design, donation configuration and existing
TON Center/TonAPI/Cloudflare/Telegram code are unchanged. No credential access,
real transaction, deployment, merge or real TON spending occurred in this step.

## October 30 critical-integration follow-up — current verified state

Preserved baseline `ce72cc8`; new code commits `11f7d22` (migration recovery),
`a019482` (TON Center evidence) and `2560906` (abort handoff obligations).
All are isolated descendants on
`codex/memelabs-settlement-1030`, for PR #1. No production merge, deployment,
signature, blockchain transaction or TON spending occurred. PR #2 remains
untouched. UI, CSS, navigation, tokenomics and the validated 0.20 + 0.02 TON
mandatory creation donation remain unchanged. No secret values were printed,
recorded in these reports or added to Git.

### Financial defects corrected and limits verified

- Actual captured pTON code unwraps an LP-account refund through `ton_transfer`
  (`0x01f3835d`), which the previous migrator rejected with 404. The new handler
  requires the exact pTON wallet, Router origin, active provision ID, positive
  amount within pending principal and at least that much actual incoming TON.
- Bounces previously credited the declared amount even if only 0.05 TON arrived
  for a claimed 500 TON refund. The regression now preserves that negative case
  and separately tests a fully funded bounce. In-flight state remains set until
  both legs are resolved; duplicate/stale bounces cannot create another credit.
- New caller-funded recovery follows authenticated Router -> pair Pool -> own
  LP account -> account-data replies, with fresh nonce/phase checks, before the
  actual SDK `refund_me` message. The SDK includes two Maybe payload references
  absent from the prose table: omitting them reproduces exit 9 against real code.
  Only the migrator's own assets are requested back; no general sweep or arbitrary
  recipient was introduced. Funding is explicit, at least 0.90 TON in tests, and
  prior native balance is reserved through the query chain.
- Persistent used provision IDs block repeated deposits even after refunds.
  A pending asset leg blocks redispatch and abort. Correlated principal receipts
  are required; an ordinary excess does not clear the new protocol's liabilities.
- Abort return dispatch also records a distinct used ID and pending obligations
  (recovery phase 5). An authenticated first-hop Jetton bounce or Curve native
  bounce restores only that obligation once. Native return attaches 0.01 TON of
  caller-funded gas beyond the unchanged principal; minimum abort funding is
  0.08 TON for tokens plus 0.02 for native TON (0.10 for both). Prior non-principal
  balance is reserved. This is optional operator recovery gas, not a buyer fee or
  a tokenomics change. Full local dual-bounce recovery and replay tests pass.
  Successful outgoing return messages still do not clear obligations without
  delivery receipts. The DEX-account recovery path cannot act on phase 5.
- Local pTON-only deposits recover the full 500 TON and reconcile both legs when
  the Jetton first hop failed. Token-only and delayed-counterpart deposits recover
  actual 200M-token custody, but the real DEX refund uses zero notification gas.
  Its owner receives no authenticated credit receipt: pending token accounting
  remains blocked. This is an unfinished recovery step, not successful final
  migration. LP-already-issued queries likewise cannot restore dispatched assets
  or declare graduation complete.

The captured Router also refunds a token leg arriving after its real 1800-second
deadline; that additional test verifies zero LP issuance, native principal
recovery, actual returned token custody and unchanged blocked token liability.

### LP authenticity and settlement reliability

The bootstrap test executes the actual captured foreign contracts. Before a
first deposit, Pool discovery reaches a known but undeployed address and the
guard stalls at phase 4. After one deposit, phase 5 can be reached while the LP
wallet still does not exist: address binding is demonstrably insufficient. The
instantiated Pool/LP-account/LP-wallet code cells match Router-advertised cells;
actual LP wallet owner/master and positive custody are checked after both legs.
Independent source/build verification remains absent. Authorization stays zero,
and Curve dispatch/finalization remain blocked with 414.

The explicit external trust and deterministic authentication model is proposed
in [`lp-verification-model-proposal.md`](lp-verification-model-proposal.md).
Acceptance of STON.fi's Router upgrade administration is a required user
decision, not something the implementation silently assumes is trustless.

Forty persistent settlements and 30 modeled days of storage rent preserve token
custody and duplicate protection through funded receipt retries. The test supplies
measured deduplicated StateInit cell usage because injected Sandbox accounts
start with zero usage counters. Sample wallet data BOC grows from 2938 to 8409
bytes; total modeled retry-trace storage fees are 2199817 nanoTON. This is a bounded
local sample, not a future rent quote or proof of unlimited liveness. No general
withdrawal/sweep or record pruning was added; frozen operational TON can remain
stranded and old records must remain available for replay protection.

### Reused APIs and real read-only observations

The new server-only adapter reuses Antigravity's
`queryAccountStatusReadOnly` and `TONCENTER_API_KEY` support. Existing TonAPI
functionality, browser provider defaults and Cloudflare Worker are unchanged.
New backend routes are GET-only, Testnet-pinned, rate-limited and non-cacheable;
there is no arbitrary upstream, credential query parameter or browser API key.
Trace responses are size-limited, redirects rejected, errors sanitized, and
transaction/message hash selectors kept distinct. A provider observation is
always `financialOutcome: NOT_VERIFIED`, including complete indexed traces.
Financial confirmation still requires authenticated operation/custody outcomes.

Public TON Center reads actually succeeded without a key: Router and pTON code
references match the earlier TonAPI snapshot, and an unrelated existing Router
transaction trace was returned. This is third-party Testnet observation, not an
ANLGRAM deployment, a validator proof or a simulated result presented as live.
Details are in
[`toncenter-independent-observations-2026-10-30.json`](toncenter-independent-observations-2026-10-30.json).
The supplied operator was re-observed uninitialized with 0.0035 Testnet TON;
control is unverified. The updated offline manifest preserves the user's
5-Mainnet-TON ceiling and records zero spent; no transaction plan is approved.

The isolated process has no `TONCENTER_API_KEY` or `TONAPI_KEY`, and this worktree
has no `.env` or Worker `.dev.vars`. A targeted read-only check found the existing
`TONCENTER_API_KEY` in the original checkout's environment file. Used only in
memory, its protected-header Testnet account request returned HTTP 200 with the
matching Router code hash. The key was not copied, printed or committed. The
server adapter continues to obtain it through the existing runtime environment
variable; do not hardcode an original-checkout path or move secrets into Git.
Cloudflare deployment/account authentication and Telegram Bot API authorization
were not verified. Telegram Mini App code exists, but no Bot-token environment reference
or token literal was found in the inspected application files; do not invent a
replacement integration or claim that Bot API access has been tested. No Telegram
messages were sent, no Cloudflare configuration/credentials were changed.

### Final tests and artifact implications

| Check | Actual final result |
| --- | --- |
| Root regression runner | 37 suites passed, 0 failed |
| Local TVM/Sandbox integration | 87 passed, 0 failed, 0 skipped |
| Source/artifact financial TVM suite | 139 assertions passed in each runner path |
| TON Center evidence/backend suite | 8 passed, included in the root runner |
| Supervised planner/executor | 68 passed, 0 failed |
| Math | 46 passed, 0 failed, including 12,000 deterministic cycles |
| Legacy minter Mocha | 5 passed |
| Four source/artifact compiler checks | All passed without rewriting artifacts |

Full suite details, normalized source hashes and sampled rent/code-profile
evidence: [`verified-critical-integration-2026-10-30.json`](verified-critical-integration-2026-10-30.json).
The single-contract TVM harness does not accumulate prior transfers into its C7
balance. It now preserves an insolvent negative abort case and explicitly supplies
recovered principal for the positive case. Sandbox independently executes the
actual full balance flow; tests were not weakened to accept an unfunded refund.

Current migration code-cell SHA-256:
`a8a0b3487d1a5f4dcc0dffb6ffc56532919fd5294796e2196818686a86e02d36`.
Serialized BOC SHA-256:
`634ee1b9cf6e234ca83ce0c91e57e0375c41e8ef2ddb7469649c94febd551918`.
Wallet, Curve, LP guard and minter bytecode are unchanged from `ce72cc8`.
The migrator accepts old genesis root cells but persists an optional third root
reference after first dispatch: provision ID, recovery nonce/phase/Pool/account
and a used-ID dictionary, including abort handoffs. Original fields/getters remain; new recovery opcode
`0x414e4c3c`, official query/refund replies and `get_migration_recovery` extend the
interface. This is a new deployment candidate, not an in-place upgrade promise.
Only the migration candidate address changes in the acyclic manifest; do not use
the old `kQCtw1...` migration address. The new raw address is
`0:f00db348b9fe835e8552f91b7ad6a515f0b4bc6e3af2050cc16aa161166e046d`.

### Integration and next steps

Antigravity should review `11f7d22`, `a019482` and `2560906` separately. Shared integration
points are the migration source/artifact, `server.js`, the TVM suite and runtime
test package. New helper/test files are isolated. Before integration fetch and
compare current Antigravity work; do not automatically resolve financial changes.
A read-only status check of E: observed the existing deleted `token123.mp4` and
untracked work directories; they were not modified, restored or deleted.
The exact code/test file list is `git diff --name-status ce72cc8..2560906`;
documentation-only changes follow in a separate commit. PR #2 stays isolated.

Next: approve/review the LP trust model, establish independently verified foreign
source/code and deterministic bootstrap, add authenticated zero-notification DEX
refund custody receipts with cumulative/replay-safe accounting, then finish
Curve/migrator handoff and LP final reconciliation. Preserve pending liabilities
until those proofs exist. Update the transaction-specific Testnet plan with
reviewed addresses, gas estimates and failure procedures before any signature.
Independent review and actual Testnet transactions remain required. **Mainnet
readiness remains blocked; zero real TON spent.**

## October 30: authenticated settlement and real-code local DEX execution

Review commits: `1d7a018`, `ea2fdbd`, `9e4097e`, descendants of preserved
`e286eed`. Changes remain isolated in `codex/memelabs-settlement-1030` for
PR #1 (`codex/memelabs-sprint`). PR #1 must remain a draft; PR #2 and the
production-safe worktree remain at `8cbda34`. No UI, CSS, donation recipient,
production gate, pricing, fee percentage, supply, allocation or threshold changed.
Main remains `781e1db`; remote Antigravity remains `caf2c70` after final fetch.
The original E: checkout was not modified. Existing Antigravity working changes
are outside this sprint and must not be overwritten during integration.

Implemented an **opt-in new Jetton wallet protocol**, preserving the canonical
standard wallet and standard transfer handlers. Persistent owner/wire operation
IDs authenticate delivery and bounced failure, deduplicate requests and receipts,
and permit funded retries without assuming that a missing notification means
failure. Frozen-recipient recovery restores sender custody before a failure
receipt; Curve records a single token entitlement, without refunding booked TON
or making the same inventory available for resale. An additional fee-schedule
fault reproduction found that an unfunded receipt action could roll back token
credit/restoration: retryable receipt actions now preserve the authoritative
ledger even if the outgoing receipt is skipped. Tests cover both success and
failure outcomes, lost acknowledgements, delayed/replayed messages and reserve
conservation. Initialization cannot downgrade the pinned wallet code (408).

The new LP guard verifies an asynchronous chain of authenticated TEP-89 and
STON.fi Router replies, binding masters, Router-owned token wallets, the pair's
Pool and its guard-owned LP wallet. This proves an address relationship, not
foreign code integrity or a custody balance. `is_migration_authorized()` remains
zero; new-protocol Curve migration/finalization reject 414. The guard is a
development contract with no withdrawal, burn or upgrade entry point.

Public Testnet Router/pTON code, data and libraries were captured through GETs
and executed **locally** in Sandbox. The old migration's 0.10 TON token forward
is refunded by the actual captured Router: no LP is issued despite successful
intermediate transactions. Increasing that forward to 0.15 TON and its wallet
attachment from 0.15 to 0.20 TON, within the existing caller's 0.40 TON provision,
allows the local 500 TON / 200M token deposit and authentic LP issuance. The
guard refuses the old router's unverified LP metadata. Pending migration
principal is deliberately not claimed reconciled or finalized. No live pool or
liquidity was created. Snapshot provenance is provider testimony, not a state
proof; its foreign code and upgrade assumptions remain unresolved.

### Verified results (final code `9e4097e`)

| Check | Actual result | Scope |
| --- | --- | --- |
| Root regression runner | 36 suites passed, 0 failed | Includes source/artifact TVM and immutable historical main baseline |
| Settlement runtime | 77 passed, 0 failed, 0 skipped | Local Sandbox; 15 authenticated-settlement tests, 8 LP handshake tests, real captured DEX execution and fresh genesis |
| Supervised executor/planner | 68 passed, 0 failed | Local tests, no signing or broadcast |
| Curve math | 46 passed, 0 failed | Includes 12,000 deterministic buy/sell cycles |
| Legacy minter Mocha | 5 passed | Local contract execution |
| Wallet / Curve / guard / migration compilation | All four `--check` commands passed | Source, compiled code and recorded provenance agree |

Counts use each suite's own assertion/test granularity; they are not summed into
a misleading single blockchain-test total. Machine-readable details, source
hashes and the complete root suite list are in
[`verified-local-results-2026-10-30.json`](verified-local-results-2026-10-30.json).

| Contract | Final code-cell SHA-256 |
| --- | --- |
| Settlement wallet | `25e655468995229fc540e9f34cf7b826a68294eb5ab766b7040858c57a73d36c` |
| Curve | `7852dadcdd0d54ff387a23da271ccb1bf5214215c1ec586f1622115204c70cb6` |
| LP authentication guard | `58cad0f20c79bee067e14c3ffdf5c66567d7f43ebb7fba6f8230c49a2a12e939` |
| Migration router | `9f7239356e8e03f4e5cf993a25f51e31f226b834ad5f51dc6afa515ec1039233` |

### Compatibility, integration and remaining blockers

The new wallet has additional opcodes and an optional persistent dictionary;
its code and every dependent deterministic address change. This is a separate
deployment candidate, not an upgrade for existing wallets. Curve's root layout
is unchanged, but dictionary namespaces and accepted messages extend. The
legacy LP locker, standard wallet, frontend embedded artifacts and mainnet
donation configuration are unchanged. Do not copy these new artifacts into the
production creator, interchange wallet families, or enable legacy migration as
a shortcut around the new gate. Detailed wire/storage rules are in
[`settlement-protocol-v1.md`](settlement-protocol-v1.md).

Remaining critical work, in order:

1. Establish a reviewed on-chain foreign-code/custody proof or explicitly
   approved trust model, including STON.fi Router upgrade authority. Address
   discovery alone cannot authorize migration. Review pre-deposit Pool/LP
   bootstrap identity; the real-code test authenticates an already-created Pool.
2. Replace legacy unverified LP binding with the reviewed authenticated protocol;
   implement migration result correlation, LP custody confirmation, final reserve
   reconciliation and recovery when only one DEX deposit leg succeeds. The
   reproduced token refund can leave pTON in an LP account. A general recovery
   implementation and verified refund procedure are still missing.
3. Review persistent-record rent/growth and retry liveness. A frozen account may
   retain forwarded native TON as operational balance; there is no general
   recovery/sweep for every such balance. Do not promise full gas refunds.
4. Wire the reviewed candidate protocol into existing frontend transaction
   confirmation without changing its design. Current production financial gates
   stay closed; existing transaction checks are not evidence of live ANLGRAM
   settlement. Conduct an independent review and supervised Testnet traces.

The supplied operator address is recorded in the offline candidate manifest.
A public Testnet observation found it uninitialized with 0.0035 TON; neither
control nor funding is verified. The user subsequently authorized spending up
to **5 real Mainnet TON including fees**. This budget is recorded, but no Mainnet
transaction set is sufficiently verified, no signer is connected, and no funds
were spent. Do not treat this budget as proof of contract safety or as approval
to bypass outstanding Testnet verification. Testnet metadata, recipient and
individual supervised deployment plan still require review.

Use [`testnet-supervised-plan-2026-10-30.md`](testnet-supervised-plan-2026-10-30.md)
and the matching candidate JSON; do not use the older planner's placeholder
wallet/truncated migration StateInit for actual deployment. Recompute addresses
after any code, metadata, operator or genesis change. No deployment, blockchain
transaction, merge or publication occurred in this sprint. **Mainnet readiness:
blocked.** Antigravity should review the three focused code commits separately,
rerun the commands below, and integrate only with an explicit review of new
storage/opcodes and trust assumptions; no automated conflict resolution of
financial code. The exact file list is available through
`git diff --name-status e286eed..9e4097e`.

## PR #1 conflict resolution — isolated integration, 2026-10-29

Integration branch: `codex/memelabs-integration`, preserving `51a101c` and all
Codex history, with production `main=781e1db` merged only into this review branch.
Antigravity feature `caf2c70` is an ancestor of the Codex sprint. All 13 Git
conflicts were inspected and resolved explicitly; no original E: checkout was
modified and no force push, production merge, deployment or transaction occurred.

Resolution decisions:

| Conflict | Resolution |
| --- | --- |
| `assets/js/anl-labs.js` | Main's tab/hash navigation plus Codex's missing-consent rejection, exact receipts and financial gates. |
| `assets/js/donation-config.js` | Exact main allocation, immutable Codex config, pinned recipient and mainnet validation. |
| `assets/js/launchpad.js` | Preserve production fee styling; use canonical checked creator rather than main's unchecked clone path and invalid config-property aliases. |
| `memecoin-platform.html` | Current production HTML/CSS/navigation/calculator/pool empty state; transplant checked creator and receipt loading. Keep mandatory disclosure and hide recipient from normal creator markup, preserving wallet disclosures. |
| `docs/release/memelabs-production-readiness.md` | Preserve main's newer corrected historical release report; this report supersedes its financial readiness claims. |
| Curve source + artifact | Keep verified financial fixes; preserve main's three read-only getters; regenerate bytecode. No pricing, input opcode or storage-layout change. |
| LP locker source + artifact | Keep Codex's strictly stronger initialization, address, sender/origin and positive-amount guards. Main's less restrictive version is preserved in Git and independently tested as baseline. |
| Migration router source + artifact | Preserve Codex's pending-asset accounting and source/artifact pair. Main's incompatible runtime storage/error/interface variant is not spliced into it. Both variants remain reviewable in Git; historical main suite runs separately. |
| `deploy-launchpad-testnet.js` | Keep read-only fail-closed preflight and bootstrap blockers, not optimistic deployment instructions. Main executor/planner files and tests are retained separately. |
| `test-bonding-curve-tvm.js` | Keep integrated financial suite; run all 154 original main assertions through a separate immutable-baseline harness, not against incompatible fixtures. |

Automatically compatible main changes were reviewed and retained: homepage,
wallet connector, manifests, supervised executor/engine, minter's optional
admin-change confirmation destination, release documentation, candidate tools
and tests. No current production CSS file was changed. New preservation tests
compare every non-script inline style, CSS block, navigation markup, homepage
and wallet connector exactly with main. All pass. Text corrections and the new
consent-network span do not replace layout components.

Additional verified defect: executor artifact verification previously trusted
recorded code-cell hashes. It now independently decodes both BOC encodings,
allows legitimate CRC/index serialization differences, compares code cells and
recalculates the cell hash as well as the recorded serialization checksum.
Forged metadata and conflicting cells are rejected. This is integrity evidence,
not source verification, deployment approval or signing permission.

The old donation suite expected duplicate builders, substring-based rejection
classification and visible recipient addresses. Assertions now require canonical
routing, exact pinned message guards, mandatory wording and typed rejection/
persistent uncertain intent. Runtime batch and receipt tests retain actual
local Sandbox evidence. The real proxy test starts an ephemeral HTTP server
with explicitly injected upstream fixtures, removing its undeclared requirement
for an already-running localhost:8080 process. No result is represented as a
real external balance or deployment.

Verified results: **36/36 root regression suites pass**; source/artifact TVM
135 each; original main baseline TVM 154; donation static 26; creator outcomes
13; wizard confirmation 12; production preservation 4; receipt fixtures 11.
Additionally: **68/68** deployment-plan/executor/supervised-engine tests,
**50/50** Sandbox tests, **46/46** math checks (12,000 deterministic trade cycles),
and **5/5** minter Mocha tests. Compiler check passes and test-runtime dependency
audit reports zero vulnerabilities. Root suites include existing read-only
public TonAPI checks; those are unrelated account queries, not verification of
ANLGRAM deployment. Upload scripts and live transaction/deployment tests are
excluded under the user's no-spend/no-broadcast restrictions.

Curve cell hash: `bfb3af58119a5dccc6f40da34b33cb09b576204b6a6f11a3e6884b655770215e`.
Curve source SHA-256: `4d4231f6415af2dba3cd59c626ffec0c7712c566a11e0956d3bd2f67a2f761e9`.
Curve serialized BOC SHA-256: `f5029dac1fc2ee3d399ec87c4b012bf744be440a81f48f24a60dd65e96a2275c`.
Retained main minter cell hash:
`90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec`.
Both source/artifact pairs match independent compilation. These hashes change
Curve and dependent deterministic addresses versus the previous sprint;
there is no deployed-code upgrade or production address substitution.

Production-only preparation uses a separate worktree and branch based directly
on main. Only frontend safeguards, exact GET-only receipt proxy routing and
associated tests/documentation may be copied there. Contract source, artifacts,
CLI deployment tools, credentials and production addresses must remain identical
to main. No merge/publication is being performed as part of PR preparation.

Critical development remains isolated and blocked: no authenticated downstream
recipient failure receipt protocol, no contract-enforced trusted LP handshake,
and no fully executed external STON.fi deposit/LP custody/recovery simulation.
The two router storage variants must not be combined or switched during an
in-flight operation. An external verified Router/Pool fixture and authenticated
receipt retry/gas design are still required. Neither passing historical tests
nor matching SDK payload cells establishes migration completion or LP custody.

Antigravity integration: review this merge commit by conflict decision above;
run `node scripts/run-local-regressions.js`, all minter planner tests, runtime
Sandbox and source/compiler checks. Re-fetch main and feature first. Preserve
its own uncommitted work before any integration. PR #1 is development-only;
never use it as the production publication unit.


## 2026-10-29 — refund settlement and preserved creation donation

Continued from `64afb2a`, preserving all earlier commits. Financial correction:
`95c2eac` (`fix(curve): fund rejected-sell refunds and preserve correlated claims`).
The latest user authorization permits protocol extensions and pushing this
development branch. Earlier sections saying such extensions require authorization
are historical: permission is now granted, but implementation and verification
of those extensions remain incomplete. Production remains blocked.

### New demonstrated financial defect and correction

The full Sandbox buy → malformed sell → immediate refund reproduced **709 in
the Curve's sending Jetton wallet**. A sell notification supplied 50,000,000
nanoTON; the Curve retained a 10,000,000 compute allowance and attached
40,000,000 to the refund, but requested a 10,000,000 forwarding notification.
The standard wallet requires strictly more than forwarding amount + two
forwarding fees + 30,000,000. Thus the original refund could not settle, and
its truncated bounce had no correlation record to restore a seller claim.

All three immediate rejection paths (inactive Curve, insolvent quote, slippage
or malformed payload) now use a 1 nanoTON notification, retain the existing
incoming-gas threshold, and record query/amount/beneficiary before dispatch.
The minimum existing attachment of 35,000,000 exceeds the observed standard
wallet threshold with the small notification; actual 45/50/60 million
notification cases settle in Sandbox. No extra mandatory gas payment is added.
Refund excess returns through the authenticated recipient-wallet path already
used by buys/claims. A raw reserve protects the prior Curve TON balance and
the unused incoming gas returns to the seller.

New tests check actual buyer and Curve Jetton ownership, exact sell payout and
fee, malformed refund, minimum funding boundary, underfunded escrow/claim,
and a real protocol first-hop bounce after an explicitly injected local wallet
freeze. Replaying that consumed bounce cannot double-credit the claim; clearing
the local fault permits exactly one recovery. Account freezes and restored
states are labeled fault fixtures, not deployments or external-chain evidence.
The downstream recipient-failure blocker described below remains unresolved.

TVM assertions now inspect the refund opcode, recipient, amount and protected
reserve action instead of assuming a refund emits only one action. The refund
also emits reserve and gas-return actions. Assertions were not weakened to
accept 709 or missing delivery. Sandbox time is fixed explicitly; otherwise a
wall-clock second boundary intermittently charges one nanoTON of storage and
invalidates a transaction-gas-only balance comparison. Expectations remain exact.

### Source, bytecode and compatibility

- Curve source SHA-256 (LF-normalized):
  `338c9c275c4a72869aa6da25eb3315f6c9931de900fdfa50408060cb982f1cc5`.
- New Curve code-cell hash:
  `5a912e5b958474508238675dead24a308336d061832aa43c6b61d683ea322b5d`.
- Serialized BOC SHA-256:
  `53f45f36381a421fbc4e7fc1990846f6349a2f99feb7e6e125e93384a452821c`.
- Compiler `@ton-community/func-js@0.11.0`, BOC 4,601 bytes;
  `node minter-contract/compile-bonding-curve.js --check` passes without writes.
- No storage layout, message input interface, price formula, fee percentage,
  supply, graduation threshold or liquidity allocation changed. Existing
  dictionary correlation encoding is reused for immediate refunds.
- Outbound refund notification funding changes from 0.01 TON to 1 nanoTON;
  response address is the Curve, which forwards authenticated excess to seller.
- The new code changes every derived Curve StateInit address. Any dependent
  minter/router/locker StateInit containing that address must be recomputed.
  This is not an upgrade to existing deployed contracts. Nothing was deployed.
- Source-compiled minter, locker and migration router hashes still match their
  saved artifacts; their contract source and bytecode were unchanged this turn.

### Donation restored selectively from main, locally verified

The original allocation is 10% of the **0.20 TON creation execution base**:
0.05 deploy + 0.15 mint + **0.02 Mandatory Donation = 0.22 TON**, before wallet
network fees. This is not 10% of token supply, trade value or token sale fees.
`assets/js/donation-config.js` preserves that model using integer nanoTON.
Its configuration object is frozen and validates the designated mainnet address:
`UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd`.
The canonical creator independently checks recipient, amount, base, consent,
network and final message before requesting a wallet signature. No testnet
recipient has been approved, so this flow refuses testnet rather than sending
to a mainnet-designated recipient there.

Existing fee components retain their styling and now disclose **Mandatory
Donation (10%)** and the full payment. No recipient address is added to visible
normal UI. Wallet transaction disclosures remain intact. The actual generated
three-message frontend batch is executed in local Sandbox: pinned minter
deployment, 1B token mint to the creator, and one 20,000,000 nanoTON donation
credit. A second identical frontend intent cannot request another payment.
The production approval flag is changed only in the isolated VM test copy;
the shipped creator remains disabled pending production approval.

`lookupDonation` requires the exact signed wallet transaction, exactly one
matching outgoing donation (source, destination, value, comment body), and its
correlated recipient transaction with successful execution. Missing child,
wrong hash/account/amount/body, bounce, duplicate debit, skipped or failed
actions, emulation and unavailable evidence stay PENDING. The wizard cannot
confirm creation from mint balances and wallet acceptance alone. This relies
on the configured TonAPI provider, not a light-client inclusion proof; strict
checks may remain pending for uninitialized recipient accounts. It never
automatically retries or refunds a pending donation.
API schema reference: https://github.com/tonkeeper/opentonapi/blob/master/api/openapi.yml.

### Actual verification results — all local, zero real transactions

| Suite / verification | Passed | Failed |
| --- | ---: | ---: |
| Saved-artifact TVM suite | 135 | 0 |
| Independently source-compiled TVM suite | 135 | 0 |
| Sandbox runtime (14 settlement, 19 LP fixtures, 1 wire reference, 16 donation) | 50 | 0 |
| Activation flow TVM | 2 | 0 |
| Financial regression TVM | 3 | 0 |
| Curve mathematics, including 12,000 deterministic trade cycles | 46 | 0 |
| Bootstrap preflight, authority and LP boundary TVM/unit suites | 14 | 0 |
| Existing minter Mocha suite | 5 | 0 |
| Mocked wallet outcomes / production gate / donation safeguards | 13 | 0 |
| Wizard confirmation integration fixtures | 12 | 0 |
| Exact transaction receipt fixtures | 11 | 0 |
| Direct creator delegation | 4 | 0 |
| Distribution pending safeguards | 30 | 0 |
| Distribution wizard regression | 21 | 0 |
| Vesting confirmation regression | 18 | 0 |
| Worker proxy/security regression | 22 | 0 |
| Existing wizard static regression | 50 | 0 |
| Existing Labs integration static regression | 33 | 0 |

Total: **604 passing checks**, including repeated source/artifact cases, not
604 distinct blockchain scenarios. JavaScript syntax checks and `git diff
--check` pass. Settlement-runtime dependency audit: zero vulnerabilities.
The 19 LP cases are injected snapshot fixtures; the STON.fi wire test validates
outgoing cells against official SDK reference cells, not an actual DEX pool.
No Testnet/Mainnet verification, transaction, wallet signature or spend occurred.

### Remaining critical work and publication decision

1. A launchpad-specific wallet receipt protocol, persistent in-flight state and
   gas/retry accounting are still needed for downstream recipient failure.
   Standard wallet balance restoration alone does not authorize a Curve refund.
2. The on-chain LP authentication handshake is not implemented. The read-only
   verifier must not be substituted for contract-enforced pool/pair/code binding.
   The privileged locker binding boundary test demonstrates the remaining risk.
3. Full STON.fi pool creation/discovery, deposit execution, LP issuance, final
   custody/locking and asynchronous failure reconciliation remain unverified.
   No verified local external Router/Pool contract fixtures or trusted deployed
   manifest have been integrated. No completed migration is claimed.
4. Bootstrap/address dependency cycles and contract deployment validation remain
   preflight blockers. Creation, trading and migration must not be enabled for
   real funds by merging this branch or flipping a configuration flag.
5. Mainnet stays BLOCKED. This turn implements the confirmed refund correction
   and donation integration; it does not complete all requested protocol work.

Fetched remote refs again before integration: `main=781e1db`,
`feature/launchpad-engine=caf2c70`. No remote Antigravity commits changed during
this turn. Main has donation/navigation/supervised-execution work that is not
identical to the feature baseline. Overlaps include `memecoin-platform.html`,
`assets/js/{anl-labs,launchpad,donation-config}.js`, the Curve source/artifact,
launchpad tests and documentation. No blind merge or full-file replacement was
performed. No files in original `E:\ANLGRAM` were modified. The existing minter
dependency junction was read only to run tests; no dependency installation or
write through that junction was performed. Antigravity's
uncommitted working state was not available for review from this isolated tree;
remote refs cannot establish that state.

The branch contains both financial changes and divergent frontend work. The
Pages workflow publishes the entire repository root on main pushes; production
compatibility cannot be established by these local tests. Use the authorized
development-branch push and review proposal. **No main merge, website
publication, contract deployment or real transaction is authorized by this
report or was performed.**

### Changed files and safe integration instructions

- Financial commit: `minter-contract/contracts/anlgram-bonding-curve.fc`,
  its `build/anlgram-bonding-curve.compiled.json`, `test-bonding-curve-tvm.js`,
  `test-graduation-accounting-known-issues.js`,
  `tests/settlement-runtime/settlement.test.js`.
- Donation integration: `assets/js/donation-config.js`, `assets/js/launchpad.js`,
  `assets/js/transaction-receipt.js`, `assets/js/anl-labs.js`,
  `memecoin-platform.html`, `test-jetton-deploy-outcomes.js`,
  `test-jetton-wizard-confirmation.js`, `tests/settlement-runtime/donation.test.js`,
  runtime `package.json`, deterministic settlement test clock and this report.
- Antigravity should first preserve its own modified/untracked files, then fetch
  `codex/memelabs-sprint` into an isolated review branch. Compare common files;
  never replace whole frontend files or assume main is older/correct by default.
- Review `95c2eac` separately. Keep Curve source and generated artifact together,
  rerun compiler `--check`, both TVM suites, financial and Sandbox suites.
- Review donation configuration, HTML loader order/cache versions, canonical
  batch, receipt module and wizard checks as one integration unit. Keep the
  production gate false. Do not cherry-pick UI pricing without payment routing,
  consent, transaction verification and duplicate-intent protection.
- Re-fetch feature/main immediately before proposing actual integration and
  resolve financial conflicts by demonstrated behavior, never automatic choice.
- The previous seven Codex commits remain intact. The GitHub review/push result
  will be reported with the exact remote commit; this document does not assert
  a successful push or publication before those operations occur.

### Verified GitHub delivery

Code commits `95c2eac` and `0198eff` were pushed successfully to
`origin/codex/memelabs-sprint`; remote code tip was independently confirmed as
`0198eff95267f6ba5e9c1384c8cda913910a75de` before this documentation follow-up.
Draft review: https://github.com/anlgram-labs/ANLGRAM/pull/1.
GitHub reports 51 changed files, `mergeable=false`, `mergeable_state=dirty`:
integration has real conflicts with main. They were not resolved automatically.
Antigravity must review both preserved branches before selecting behavior.
Main remained `781e1dbf523d5e82ebc7295adf8367e42084cd34`; feature remained
`caf2c70aac9d49df77671570587f3fec8c54cbbd`. No production publication occurred.

## Critical-flow follow-up — current verified scope

Continued from `c5c026e` without changing contract code, bytecode, tokenomics,
website design or existing commits. Curve cell hash remains
`0abb0feb4b9b124d04fd349c2131f6f9d54a371bb743a44c88c6f91b52c53334`;
the compiler's read-only `--check` passes. No deterministic addresses change
in this iteration. Existing deployment/address warnings below still apply.

### Recipient failure: reproduced, not falsely refunded

Added a full Sandbox scenario with a recipient account frozen at a prior
nonzero-token state. This is an explicit local account-state fixture, not a
live frozen wallet. The sender accepts the transfer and debits tokens; the
recipient cannot unfreeze from the zero-initial-balance StateInit supplied by
the transfer and aborts. Its real protocol bounce returns to the sender wallet,
which restores its token balance exactly to the original 1B units. Recipient
state stays frozen. The Curve receives no authenticated failure receipt and
its token claim remains unavailable (409). No new TON or Jetton refund is
authorized merely because a success notification is missing.

This passing reproduction asserts the SAFE refusal to fabricate a refund; it
does not mean recipient-failure recovery is complete. The existing standard
wallet's `on_bounce` updates only its own balance and emits no owner receipt.

**Authorization needed for an incompatible extension:** a launchpad-specific
Jetton wallet must report correlated delivery success/failure to the Curve,
authenticate consumed in-flight messages, and prevent duplicate restoration or
claims. This likely needs wallet in-flight storage and a new authenticated
receipt message/acknowledgement exchange, plus reviewed gas funding. Changing
wallet code changes every derived Jetton wallet and dependent master/Curve
StateInit. It must also be recognized separately by bytecode verification;
do not silently relabel it as the existing canonical standard wallet. No new
opcode, wallet storage or wallet implementation was invented or activated here.

### LP verification implementation (read-only, fails closed)

`minter-contract/verify-lp-custody.js` implements snapshot verification using
the documented STON.fi v2 getter interfaces:

- Requires independently trusted addresses and code hashes for Router, Pool,
  LP wallet, locker, both token masters, Curve and migration router; requires
  exact expected network, anchored snapshot id and reconciled minimum LP.
- Derives each Router token wallet from its token master, then derives the
  Pool via Router `get_pool_address`; verifies Pool router and token pair.
- Derives locker LP wallet through Pool `get_wallet_address`; matches Pool
  supply/admin and advertised wallet code, wallet owner/master/code and balance.
- Checks permanent lock, stored Pool/Curve/wallet/migration-router binding and
  actual balance covering the recorded lock and expected minimum.
- Rejects missing pins, code substitution, mixed snapshots, wrong networks,
  non-exact numbers and failed getters. Rechecks account code at the end.

Its reader adapter must supply trusted, consistently anchored account/getter
evidence. No production RPC adapter, trusted deployment manifest or real pinned
snapshot is supplied. `VERIFIED_SNAPSHOT` is conditional read-only custody
evidence, not a transaction trace, Merkle proof, DEX audit, contract-level
enforcement or evidence that an actual deployment was verified. Unit tests use
clearly labeled injected getter fixtures. Missing evidence stays UNVERIFIED.

The locker still permits an authorized initializer to bind a wallet without
contract-enforced derivation. Replacing that with an asynchronous authenticated
pool/Router binding and making migration wait for the binding acknowledgement
requires a reviewed contract protocol/state-machine extension. That specific
interface change was stopped; the preflight LP blocker remains active.

Getter specifications checked against official documentation:
[STON.fi Pool](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/pool),
[STON.fi Router](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/router).

### STON.fi migration wire verification

`migration-wire.test.js` executes the actual source-compiled migration router
in Sandbox with explicitly preloaded liquidity and synthetic addresses. Its
outbound Jetton and pTON payload cells are compared to the exact cells generated
by official `@ston-fi/sdk@2.7.0` DEX.v2_1 / pTON.v2_1 builders. The pinned fixture
records the SDK version/source and token-wallet code hash. Both payloads match.
The test checks destination, query id, token amount and forwarding amount too.
It does NOT emulate external STON.fi Router/Pool contracts, pool creation,
LP issuance, LP receipt, or a successful completed migration.

Fixture regeneration is explicit via `ANLGRAM_GENERATE_SDK_FIXTURE=1` and a
temporary official SDK install. SDK was removed after generating the fixture;
the committed runtime dependency lock is unchanged and tests run without the
SDK. Its temporary dependency tree reported three high audit findings through
Zod; after removal `npm audit --prefix tests/settlement-runtime` reports zero.
No vulnerable SDK dependency was added to the app or retained in the test lock.

### Actual tests and integration

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Full-phase Sandbox settlement, including frozen recipient | 8 | 0 |
| LP verification algorithm (explicit unit fixtures) | 19 | 0 |
| Actual migration output vs official SDK reference | 1 | 0 |
| Source TVM regression | 135 | 0 |
| Artifact TVM regression | 135 | 0 |
| Routed activation/settlement + financial regressions | 5 | 0 |
| Preflight/bootstrap/LP boundary/receipt regressions | 25 | 0 |
| Math model, including 12,000 deterministic cycles | 46 | 0 |

Run `npm ci --ignore-scripts --prefix tests/settlement-runtime`, then
`npm test --prefix tests/settlement-runtime` (28 local tests). No RPC/broadcast
is needed. None of these local results establish a successful chain migration.

Files: `minter-contract/verify-lp-custody.js`, runtime `package.json`, expanded
`settlement.test.js`, new `lp-custody.test.js`, `migration-wire.test.js`,
`stonfi-v21-wire-fixture.json`, and this document. No existing passing financial
test was removed. Review the isolated local commits, confirm actual deployment
pins and a trusted snapshot adapter before integrating the verifier, and obtain
authorization for the wallet/locker protocol extensions before implementing
them. Preserve Antigravity's concurrent code. Do not merge/publish/deploy these
changes automatically. `E:\ANLGRAM` was not modified.

Mainnet and financial feature enablement remain blocked by recipient recovery,
contract-enforced LP authenticity, complete external DEX execution and recovery,
and live fee/delivery verification. No Testnet or Mainnet transactions occurred.

## Error 709 correction — latest verified status

All previous commits, including `5910e42` and `7905672`, are preserved. The
earlier 709 blocker below is superseded by the results in this section.

### Root cause and unchanged buyer budget

The failing message was Curve -> Curve Jetton wallet, not the recipient
deployment. `jetton-wallet.fc` requires strictly more than
`forward_ton_amount + 2 * floor(inboundForwardFee * 3 / 2) + 2 * 0.01 + 0.01 TON`.
The old message supplied exactly 0.04 TON, with a 0.01 TON notification, so it
failed even with zero forwarding fees. The full-phase baseline measured an
80,890 nanoTON inbound forward fee: the strict threshold was 40,242,670
nanoTON. It rejected with 709 and its real truncated bounce then failed with 9.

The correction allocates the SAME existing 40,000,000 nanoTON overhead:

| Internal allocation | Before | After |
| --- | ---: | ---: |
| Sender-wallet attachment | 40,000,000 | 35,000,000 nanoTON |
| Owner notification (inside that attachment) | 10,000,000 | 1 nanoTON |
| Curve compute/action budget | no remainder | 5,000,000 nanoTON |

No mandatory buyer gas payment or pricing/fee parameter was added. The tested
new sender-wallet threshold is 30,240,541 nanoTON (80,180 inbound forward fee),
below its 35,000,000 attachment. An owner contract may skip the 1-nanoton
notification due to insufficient compute gas; notification execution is NOT
used as proof of token delivery. The recipient Jetton balance is verified.

Every buy reserves the entire pre-message balance plus newly booked liquidity
and protocol fees before sending. Unspent trade input is refunded exactly;
unused Curve gas is returned separately, after fees. Recipient-wallet gas
excess travels through an authenticated standard TEP-74 response and is also
returned to the buyer. In the 1 TON fixture, liquidity is 950,400,000 nanoTON
and protocol fee is 9,600,000. Curve balance is exactly its prior 50,000,000
plus those booked amounts: 1,010,000,000. No prior funds subsidize delivery.

Measured local transaction fees for that fixture: Curve buy 1,284,777 nanoTON,
sender wallet 807,397, recipient wallet 724,355, Curve excess relay 1,013,755.
The test prints each message value, inbound forward fee, gas/storage/action
fees and final contract balances. These are Sandbox configuration measurements,
not a promised live-network fee schedule. Retained wallet balance is part of
the existing wallet gas/storage policy; new recipient deployment is tested.

### Recovery and compatibility

Real bounces contain only a truncated original body, so the recipient address
cannot be decoded reliably. The Curve now correlates buys and token claims by
its unique transaction logical time. In-flight records use domain-separated
keys in the existing dictionary; address-hash claim entries retain their old
encoding. An authentic first-hop rejection restores the buyer's pending token
entitlement once. Replayed bounces do not double-credit or underflow. A claim
works with its existing 0.04 TON minimum, preserves prior balance, and restores
its pending entitlement if its first-hop transfer fails again. On success the
derived recipient wallet is authenticated before the delivery record is cleared.

No constructor storage fields, public getters or numeric message opcodes change.
The existing standard excesses opcode is now handled; dictionary semantics gain
in-flight entries. Older code cannot safely process these entries: do not
downgrade or reuse live in-flight state. No deployed contract was upgraded.
Bytecode and StateInit-derived addresses change; regenerate all dependent
deployment addresses/plans before any separately authorized deployment.

- Curve code cell hash: `0abb0feb4b9b124d04fd349c2131f6f9d54a371bb743a44c88c6f91b52c53334`.
- Serialized BOC SHA-256: `3d50570332dc1f1e124274fdbb4adffab587659e88e805172b6f0475808a5180`.
- Reproducible source/import provenance is recorded in the artifact; compiler
  `--check` passes without rewriting it.

### Actual local tests

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Full-phase Sandbox settlement | 7 | 0 |
| Artifact TVM regression | 135 | 0 |
| Source TVM regression | 135 | 0 |
| Routed activation, buy/sell, graduation dispatch + financial regressions | 5 | 0 |
| Math model, including 12,000 deterministic cycles | 46 | 0 |
| Preflight/bootstrap/LP boundary/receipt regressions | 25 | 0 |

Sandbox covers the original 709 baseline, new/existing recipient wallets,
insufficient input, capped overpayment, repeated paid query ids and authentic
first-hop failure/claim/replay behavior. The failure test explicitly injects a
sender-token shortage, restores the fixture's custody before successful claim,
and does not pretend to mint missing tokens. Reusing a query id with a new paid
message is a new purchase; wallet-level replay protection is separate.

Run `npm ci --ignore-scripts --prefix tests/settlement-runtime`, then
`npm test --prefix tests/settlement-runtime`. This locked, separate runtime uses
Sandbox to model action/storage/forwarding fees, unlike compute-only tests.
Its dependencies were installed inside this isolated worktree, not in the
shared Antigravity dependency directory. No blockchain RPC or transaction is
needed by this test. The fixture starts active; the separate routed activation
test exercises initialization and renounce.

### Remaining limits and safe integration

Do not enable production trading. Later-hop recipient failure, missing excess
acknowledgements and extreme/future fee schedules still need complete recovery
verification. The standard sender wallet restores a bounced recipient transfer
but does not notify the Curve: a new authenticated failure exchange may be
necessary to resolve such in-flight records without risking double delivery.
No speculative wallet interface change was made. LP pool/master authentication
and actual STON.fi provision/custody remain blocked. The routed graduation test
checks dispatch and duplicate rejection, not successful external DEX execution.

Changed files: Curve source and compiled artifact; deployment preflight message;
`test-bonding-curve-tvm.js`; `test-graduation-accounting-known-issues.js`;
`tests/settlement-runtime/{package.json,package-lock.json,settlement.test.js}`;
this document. Existing assertions now distinguish TON reserve/gas-return
actions from the single Jetton transfer and continue requiring the exact capped
trade refund. No failed assertion was bypassed by increasing fixture funding.

Review these changes atop the preserved Codex commits, compare Antigravity's
current branch before integration, and regenerate dependent addresses. No
`E:\ANLGRAM` edit, merge, push, publication or real transaction was performed.
Mainnet remains blocked; all results above are local simulations.

## Remaining integration iteration — latest status

Base commit `9f34102` and all preceding commits are preserved. This iteration
changes no contract source, BOC, storage, interfaces or financial parameters.
The curve cell hash remains `9059d4a1ca1acc5d8e0d2e64648e7eb894fc2b3bf6dd39fdefa849897837de34`;
its reproducible compiler `--check` passes. Deterministic addresses do not
change in this iteration; the address implications of `9f34102` still apply.

### Implemented

- A source-compiled TVM integration test routes actual output messages through
  minter mint, curve Jetton wallet credit, custody notification, operator
  renounce, permissionless status query, minter response and Curve activation.
  It checks unauthorized/duplicate initialization, unauthorized mint/renounce,
  trading disabled before activation, duplicate ack rejection and permanent
  mint disablement. No fabricated confirmation is injected.
- The deployment plan now describes the compatible manual recovery sequence:
  after custody/state 2, the minter admin renounces via existing op 3, then
  `check_renounce` causes an authenticated status reply and activation. The
  original automatic attempt is still rejected (73); it is not advertised as
  working. Live deployment remains blocked.
- The browser captures a TON Connect message identity without persisting its
  signed BOC, and queries the exact normalized message hash through the
  read-only `/blockchain/messages/{hash}/transaction` endpoint. Both backend
  allowlists admit only a 64-character hex hash for this route.
- Receipt verification checks wallet, network, inbound body/hash identity,
  compute/action status and skipped actions. Missing, mismatched, failed,
  emulated or incomplete evidence cannot confirm a deployment. The creator
  still requires its existing state/supply/admin/balance checks as well.
  A wallet receipt establishes wallet execution only, not downstream token
  delivery or LP custody. Testnet state confirmation remains incomplete.

The normalization and response fields follow the official
[TonAPI transaction tracking documentation](https://docs.tonconsole.com/tonapi/cookbook/transaction-tracking/)
and [OpenAPI schema](https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.yml).

### New blocker reproduced; no silent economic change

`test-launchpad-activation-flow.js` has **1 passing activation scenario and
1 failing settlement scenario**. After activation, a real Curve output is
routed into its actual Jetton wallet. The wallet rejects transfer with 709:
the Curve attaches exactly 40,000,000 nanoTON and requests forwarding
10,000,000 nanoTON, while `jetton-wallet.fc` requires strictly more than the
forward amount + forwarding fees + twice its gas allowance + storage.
The test does not top up that output or alter the expected result to pass.
Its later sell, graduation and migration assertions are not reached.

Fixing this requires an explicit funding decision: increase the operational
trade overhead/attachment, reduce the owner-notification forward amount, or
provide an explicitly accounted operational buffer. Each affects existing
financial execution; no choice was silently made. The preflight reports the
demonstrated failure and keeps trading blocked.

LP outsider configuration rejection remains tested, but authorized binding
still does not prove pool/master authenticity. A complete authenticated LP
binding needs reviewed STON.fi wallet derivation/code identity and potentially
a new contract validation exchange. No invented pool address or ABI is used.
Actual STON.fi provision, LP issuance/custody and failure recovery remain
unverified as a complete external-contract flow. No live transaction was sent.

### Tests executed this iteration

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Routed activation and settlement | 1 | 1 (709 blocker above) |
| Normalized receipt + preflight/bootstrap/LP boundary | 25 | 0 |
| Creator wallet outcomes (mocked) | 8 | 0 |
| Wizard receipt/state confirmation (mocked) | 11 | 0 |
| Worker security regression | 22 | 0 |
| Artifact TVM regression | 135 | 0 |
| Source TVM regression | 135 | 0 |
| Financial regressions | 3 | 0 |
| Wizard existing regression | 50 | 0 |

All results are local TVM, unit or mocked integration tests. There is no new
on-chain verification evidence. `git diff --check` and compiler `--check` pass.

Files changed: `assets/js/transaction-receipt.js`, `assets/js/anl-labs.js`,
`memecoin-platform.html`, `server.js`, `cloudflare-worker/worker.js`,
`minter-contract/deploy-launchpad-testnet.js`, its test,
`test-transaction-receipt.js`, `test-jetton-wizard-confirmation.js`,
`test-launchpad-activation-flow.js`, and this document.

Review the isolated commits and the explicit failing test before integration.
Recompare Antigravity's current work without replacing files wholesale.
Deploying the backend allowlist or website requires separate approval; local
changes alone do not update the existing production Worker. No merge, push,
deployment or modification of `E:\ANLGRAM` was performed. Mainnet remains blocked.

## Authorized financial correction — latest status (2026-10-29)

This section supersedes the historical failures and source/artifact mismatch
described below. Commits `9fb3d16` and `9b9bcba` are preserved.

### Corrections

1. Capped buys reconstructed K from the shrinking current token inventory.
   They now use the existing model's initial 800M atomic-9 curve allocation
   and configured virtual reserves. The reproduction now reaches exactly
   500 TON of recorded reserves instead of 462.761517970 TON.
2. The unspent purchase input was neither recorded nor returned. It is now
   sent back as non-bounceable TON excess, with fees paid separately. Booked
   principal and accrued fees are reserved before the refund action; inadequate
   operational funding must fail the action phase rather than consume them.
   The regression checks the exact 504.869494949 TON refund for its fixture.
3. Sell payload parsing checked only the length prefix, then attempted to read
   absent bytes. Structural checks now validate Either/ref presence and all
   VarUInteger bytes before reading. Invalid orders use the existing funded
   Jetton refund or underfunded pending-claim path. Tests check exact refunded
   tokens and recipient, unchanged trading reserves/fees, five malformed
   encodings, low-gas escrow, successful claim and rejection of a repeated claim.

### Artifact provenance and compatibility

The intended source is the preserved `caf2c70` implementation with these targeted
financial corrections, not a wholesale contract import from main. The old BOC's
provenance remains unresolved; its bytes remain recoverable from prior commits.
The corrected BOC is compiled from the reviewed source and all imports.

- Previous saved curve cell hash: `f280c59c7f8bf9c8a530f71ead0bebf9e30055c41d6c6ed6aec1d63b2672acef`.
- Corrected curve cell hash: `9059d4a1ca1acc5d8e0d2e64648e7eb894fc2b3bf6dd39fdefa849897837de34`.
- Serialized BOC SHA-256: `e59a4ff918ce9f4172ee6ca1bada5e117c1e7c45c7cefa517f71de7efb5db5d9`.
- Source file SHA-256 in this worktree: `2b7cdf159cc69b473e2fbf314c8a9f4c3210aca93fc0b945b5ffb81c776ed6a5`.

The compiler records its package version and sorted SHA-256 hashes for every
source/import, normalizes CRLF to LF and omits variable timestamps. Repeated
compilations produced identical artifacts. Run
`node minter-contract/compile-bonding-curve.js --check` to verify without writing.

Storage, opcodes, getters, fee rate, initial supply, token allocations and
graduation threshold are unchanged. Financial execution and bytecode change.
New StateInit addresses therefore change, including dependent deterministic
addresses: regenerate deployment plans and review them together. Existing
deployed contracts are not upgraded by these files; no migration/upgrade of
deployed state is authorized or performed. Custom initial allocations other
than the existing fixed 800M curve allocation are unsupported by this model.

### Latest executed tests

| Local suite | Passed | Failed |
| --- | ---: | ---: |
| Former three financial failures (expanded edge assertions) | 3 | 0 |
| Saved-artifact TVM suite | 135 | 0 |
| Source-compiled TVM suite | 135 | 0 |
| Mathematical model, including 12,000 deterministic cycles | 46 | 0 |
| Preflight / bootstrap / LP trust-boundary tests | 14 | 0 |
| Jetton wizard confirmation | 10 | 0 |
| Distribution safety | 30 | 0 |
| Vesting confirmation | 18 | 0 |

The two resolved preflight defect labels were replaced by an explicit remaining
end-to-end settlement blocker. Renounce authority, LP authenticity and external
DEX blockers remain. Local executor action lists are not proof of final delivery
or fee sufficiency on a live chain. Full asynchronous settlement, failed Jetton
delivery after refund, fee-buffer exhaustion, and authentic LP custody require
further integrated verification. Trading and distribution remain disabled as
before; no redesign, wallet signatures, deployment, push or merge was performed.

Modified this iteration: `anlgram-bonding-curve.fc`, its compiler and compiled
JSON, the deployment preflight and its test, the financial regression test,
and this document. Integration: review this local commit on top of the two
preserved commits, compare Antigravity's latest code before any authorized
integration, and regenerate dependent addresses. Never copy BOCs alone or
enable production trading merely because these local tests pass.

## Historical sprint record (superseded where noted above)

Base: `feature/launchpad-engine` at `caf2c70`. The sprint branch is separate
from Antigravity's working directory and has not been merged or deployed. The
`main` branch has independent UI, donation, and supervised-executor changes;
review them before integration instead of replacing either branch wholesale.

## Safety and outstanding work

- The deployment preflight is blocked. The curve sends `change_admin` as the
  curve, but the minter's administrator is the operator. A local TVM test using
  the builder's actual state shows that this request is rejected with exit 73.
  A complete renounce and activation sequence remains to be demonstrated.
- The current bonding curve source compiles to cell hash
  `a9665e985967e9d7add8482f10af5cea4234fb0363e8c08c6efabc30ea8a7386`;
  the saved artifact has hash
  `f280c59c7f8bf9c8a530f71ead0bebf9e30055c41d6c6ed6aec1d63b2672acef`.
  Its provenance remains unresolved. Neither the contract nor the artifact was
  replaced. The other three launchpad sources match their artifacts.
- The LP locker accepts a wallet selected by an authorized administrator or
  router without proving it belongs to the intended LP master and pool. A
  local TVM test demonstrates that an administrator-controlled address can
  trigger an LP confirmation without establishing custody. An unauthorized
  outsider cannot configure this address in the tested case. The preflight
  now fails closed until authenticity and custody can be verified.
- A local TVM reproduction with an artificially active curve found that a
  capped buy after an earlier trade records 462.761517970 TON of reserves,
  while the existing mathematical model's initial invariant gives 500 TON.
  No outgoing refund to the buyer is emitted for the excess. The fixture does
  not establish live-chain balances or the complete bootstrap flow. The same
  buy source appears in `main`; neither contract was modified. The preflight
  blocks deployment pending a reviewed correction.
- A simulated Jetton transfer credits the curve's Jetton wallet and emits a
  notification with a truncated variable-length integer; the curve aborts
  without a refund action. The sender's preceding wallet debit is not part of
  this test, so the complete real-chain consequence remains unproven.
- Distribution is deliberately disabled before requesting a wallet signature.
  It requires transaction-linked trace verification, per-recipient accounting,
  partial-failure reconciliation, and safe resumption before it can be enabled.
- Vesting requests and ambiguous Jetton deployment requests remain pending until
  independently reconciled. There is no assisted clearing flow. Local storage
  is not an atomic lock across browser tabs or devices.
- The token verifier supports Mainnet only. A testnet creation cannot be
  confirmed through that verifier. Mainnet account, supply, admin and creator
  balance checks establish current state, not that a particular request caused
  that state. Full message/transaction correlation remains necessary.
- Buy/sell integration, DEX migration and authentic LP custody remain
  incomplete or unverified. No testnet or Mainnet transactions were executed.

## Reproducible local tests

Install dependencies in an isolated checkout without production credentials.
The checked-in vesting artifact is identical to the version in `main` and its
cell hash matches the current vesting source. It was restored to make the
existing vesting and master-audit suites reproducible in a clean worktree.

```text
cd minter-contract
npm test
cd ..
node minter-contract/test-bonding-curve-math.js
node test-bonding-curve-tvm.js
node test-bonding-curve-source-tvm.js
node --test minter-contract/test-deploy-launchpad-testnet.js test-launchpad-bootstrap-authority.js test-lp-locker-trust-boundary.js
node test-distribution-pending-safety.js
node test-vesting-confirmation-regression.js
node test-jetton-deploy-outcomes.js
node test-jetton-wizard-confirmation.js
node test-step4-vesting-comprehensive.js
node test-master-security-audit.js
```

The TVM tests are local simulations; mocked tests are not on-chain evidence.
`test-bonding-curve-source-tvm.js` reports the mismatch and executes the suite
against in-memory compiled sources without changing the saved artifacts. The
preflight's historical DEX blocker is not a fresh verification of that router.

`node --test test-graduation-accounting-known-issues.js` intentionally runs
the desired invariant, refund, and malformed-sell assertions against the current
contract. At this sprint's end all three assertions fail; do not treat this as a
passing regression suite or enable trading until the failures are resolved.

## Resumed implementation and verified results — 2026-10-29

The previous changes were recovered intact and were uncommitted. The recovered
state contained six modified tracked files and ten new files, rather than the
eight-file estimate. No reset, cleanup, merge, push or deployment was performed.
Remote heads were checked again: feature remains `caf2c70`, main `781e1db`.

The legacy factory fallback now delegates to the existing canonical Jetton
creator rather than constructing another transaction from unchecked remote
bytecode. It propagates validation failures and preserves uncertain outcomes.
The existing branch's supply and message amounts are unchanged. Main's separate
donation behavior is not imported and must be reconciled explicitly.

Latest executed results (local assertions and simulated TVM, not live transaction
verification):

| Command / suite | Passed | Failed |
| --- | ---: | ---: |
| `npm test` in `minter-contract` | 5 | 0 |
| Preflight, bootstrap authority, LP boundary, direct delegation (`node --test`) | 18 | 0 |
| `test-jetton-deploy-outcomes.js` | 8 | 0 |
| `test-jetton-wizard-confirmation.js` | 10 | 0 |
| `test-distribution-pending-safety.js` | 30 | 0 |
| `test-vesting-confirmation-regression.js` | 18 | 0 |
| `test-bonding-curve-source-tvm.js` | 135 | 0 |
| `minter-contract/test-bonding-curve-math.js` | 46 | 0 |
| `test-wizard-comprehensive.js` | 50 | 0 |
| `test-step4-vesting-comprehensive.js` | 50 | 0 |
| `test-master-security-audit.js` | 51 | 0 |
| `test-graduation-accounting-known-issues.js` | 0 | 3 |

`git diff --check` passes. The vesting artifact restored from main has Git blob
`e7421022a474cfc9ec9b7340b1fae9cfd398a5d9`; this is an addition of an identical
existing artifact, not a recompiled replacement for the divergent curve BOC.

### Review and integration

Review commits on `codex/memelabs-sprint` in this isolated worktree. Recompare
Antigravity's latest branch and uncommitted work before any authorized
integration. Likely overlapping files are `anl-labs.js`, `launchpad.js`,
`memecoin-platform.html`, the preflight and its tests. Resolve the main/feature
donation and executor differences explicitly; never copy entire contracts.

The contract issues require a separately authorized behavior correction:
reconcile capped-buy accounting with the existing model and return excess TON;
handle malformed sell payloads through a funded recovery path; authenticate LP
wallets against the intended pool/master; validate the complete renounce
bootstrap. These affect contract bytecode and potentially deployed behavior.
No storage/interface or financial behavior change was made in this sprint.

Mainnet readiness remains blocked. Transaction-linked confirmation, testnet
creation confirmation, distribution resumption, vesting custody, full buy/sell
settlement and DEX migration are not complete. No on-chain verification or
wallet signing was performed by Codex.

### Modified and added files

```text
assets/js/anl-labs.js
assets/js/launchpad.js
memecoin-platform.html
minter-contract/deploy-launchpad-testnet.js
minter-contract/package.json
minter-contract/test-deploy-launchpad-testnet.js
minter-contract/test/mocha-setup.cjs
minter-contract/build/anlgram-vesting-wallet.compiled.json
test-bonding-curve-source-tvm.js
test-distribution-pending-safety.js
test-graduation-accounting-known-issues.js
test-jetton-deploy-outcomes.js
test-jetton-wizard-confirmation.js
test-launchpad-bootstrap-authority.js
test-launchpad-direct-delegation.js
test-lp-locker-trust-boundary.js
test-vesting-confirmation-regression.js
docs/launchpad/codex-sprint-review.md
```
