# Unified MemeLabs read-only integration — 2026-10-30

Dedicated branch: `codex/unified-readonly-integration`, based on `69f4c57`.
This delivers frontend corrections against the existing combined implementation;
it does not authorize publication or financial transactions.

## Preservation and actual branch comparison

Fetched origin before editing and again before integration review:

| Reference | Verified checkpoint |
|---|---|
| main | `781e1db` |
| feature/launchpad-engine | `caf2c70` |
| codex/memelabs-sprint / codex/memelabs-settlement-1030 | `04a5e8a` |
| codex/lp-locker-v2 | `15d9143` |
| codex/financial-integration-v2 | `69f4c57` |
| PR #1 | draft, `04a5e8a`; unchanged |
| PR #2 / production-safe worktree | `8cbda34`; unchanged, clean |

`caf2c70` is already an ancestor of the development baseline. Before this change,
all files under `assets`, the platform page, homepage and Cloudflare Worker were
identical to PR #2's versions. Only `server.js` differed in that comparison: the
development branch retains the protected read-only TON Center Testnet evidence
routes. Recopying Antigravity files or cherry-picking PR #2 would duplicate existing
integration. No merge, conflict overwrite or financial protocol splice was needed.

Original `E:\ANLGRAM` was inspected read-only. Its existing deletion of
`token123.mp4`, untracked `anlgram-*` archive/worktree directories and unrelated
`autoredes/` application remain untouched. Initial/final normal Git status agree.
Untracked applications, databases, dependencies and credential files are not
imported into this integration. Their original files remain in place; this is
preservation, not a claim that their uncommitted contents were backed up in Git.
Existing historical branches and commits remain recoverable without reset/clean.

## Implemented functionality and defects corrected

- One shared GET-only MemeLabs transport now serves both existing frontend paths.
  Actual connected TON Connect chain is authoritative; URL hints cannot override
  a connected Mainnet wallet. Testnet reads never use the Mainnet Worker. Unknown
  connected networks fail closed. Provider failures remain unavailable, not zero.
- Existing Cloudflare routing is preserved, with bounded requests and conservative
  same-network public TonAPI fallback. Typed address helpers validate complete
  TON addresses, including workchain. No credentials are added to browser code.
- Wallet/token balances use exact integer arithmetic, including zero decimals and
  values above JavaScript's safe integer range. Unsupported data is unavailable.
- Wallet disconnect/change invalidates outstanding requests and clears the
  lifecycle selector; token metadata in options is escaped. Unsupported networks
  clear previous balances. Admin matching retains the workchain and validates
  addresses. An undefined `optionStyle` that prevented actual token rendering is
  fixed; malformed token addresses cannot enter the list.
- Analytics retain exact total supply, preserve a real zero-holder result and
  calculate holder shares against total supply, rather than the five largest
  holders' subtotal. Circulating supply is unavailable without supporting evidence.
  Late metadata cannot overwrite a newly selected token. Pool status says
  unverified instead of claiming a DEX search that was never performed.
- Legacy sample wallet/token rows stay hidden until replaced with a connection
  prompt. Sample aggregate and portfolio values are replaced with unavailable
  states. The existing explicitly labeled opt-in simulated pool preview remains
  a demo and is not counted as live liquidity.
- The MemeLabs review page rejects TON Connect `sendTransaction`, including late
  SDK publication/restored sessions. Connection methods remain available. This is
  a release gate, not a security sandbox against arbitrary hostile page scripts.
  Existing financial implementations are retained for development and their
  isolated tests; this page cannot enable them through a query/localStorage flag.

Changed runtime files: `assets/js/memelabs-readonly.js`, `assets/js/anl-labs.js`,
`memecoin-platform.html`. Tests: `test-unified-readonly.js`. The wizard script's
cache version is advanced. No CSS, navigation, homepage, wallet connector,
backend/Worker source, contract source, storage, opcode, artifact or deterministic
address changes. The existing mandatory .20 + .02 = .22 TON before gas, validated
donation recipient, and LP V2 50–100%, 180/365 days/permanent, 100%-permanent
default are preserved. No credentials were read or copied into source.

## Functional inventory

“Local” means executable development evidence, not deployed or live-money proof.

| Function | Status and actual boundary |
|---|---|
| 1. Creation / Jetton deployment | Partial: wizard and local deployment/settlement tests retained; review-page sends blocked, no live deployment verified. |
| 2. Metadata / images | Partial: real TonAPI metadata reads; existing upload code requires configured upload backend, not supplied by GET-only Worker. |
| 3. TON Connect | Working connection code retained, chain-aware reads integrated; no interactive wallet-signing/authentication claim from these tests. |
| 4. Curve buy/sell | Local TVM/Sandbox only; real-money UI remains closed. |
| 5. Discovery / listings / token pages | Partial: wallet tokens and selected-token reads work; project-wide verified launch listings are not established. Existing discovery/drawer code preserved. |
| 6. Stats / holders / history / charts | Partial: real-data reads and holder denominator corrected; existing explorer history paths retained. No newly verified live launchpad price chart, circulation or pool liquidity. |
| 7. Creator dashboard / management | Partial: current wallet tokens and workchain-aware admin reads; mint/burn/renounce signing closed in review release. |
| 8. Distribution / allocations / vesting | Local confirmation/regression coverage retained; public financial execution blocked. |
| 9. Graduation / STON.fi migration | Blocked for live use: V3 dispatch/returns locally tested; foreign LP evidence and independent authorization incomplete. |
| 10. LP Locker V1/V2 | Local tests pass, immutable V2 choices preserved; general exact foreign-wallet recovery is blocked. |
| 11. Receipts / reconciliation | Local project-wallet operation receipts and refund paths tested; absent authenticated foreign final evidence remains pending, never assumed settled. |
| 12. Telegram | Partial: existing Mini App SDK integration retained and regression-tested; no independently verified authenticated Bot backend found in tracked launchpad source. |
| 13. TON Center / TonAPI | Read-only integrations retained; Mainnet Worker and metadata GETs succeeded. Testnet evidence routes retained, no real Testnet transaction verification performed. |
| 14. Cloudflare / API / secrets | Existing GET Worker healthy; Node proxy/upload/evidence routes retained. No secrets printed or production configuration changed. |
| 15. Frontend/backend / refresh | Working local HTTP serving and GET wiring; wallet events refresh safely. No claim of full real-time polling or browser/device acceptance testing. |
| 16. Security / release gates | Working local checks: SDK sends closed, network isolation, escaped options, stale-request rejection, donation/design preservation. Financial authorization remains closed. |

## Actual verification

- `node --test test-unified-readonly.js test-integration-preservation.js`:
  **18 passed, 0 failed** (14 new integration cases + 4 preservation cases).
- `node scripts/run-local-regressions.js`: **39 suites passed, 0 failed**.
  Includes source/artifact financial TVM paths, **139 assertions each**, and the
  historical Antigravity baseline. An initial ad-hoc runner lacked `NODE_PATH`
  for one Router suite; the existing repository runner supplies it and all39 pass.
- `npm test --prefix tests/settlement-runtime`: **155 passed, 0 failed**, no skips.
  These are source-compiled local Sandbox/TVM executions, including captured real
  DEX protocol code; not real on-chain transactions.
- Serial deployment-plan/executor/supervised-engine tests: **68 passed, 0 failed**.
- Six compiler `--check` runs pass: settlement wallet, migration router, LP guard,
  Curve, Locker V2, migration V2 binding. No artifacts regenerated.
- JavaScript syntax and `git diff --check` pass.
- Actual public GET: Worker `/health` **200**; selected Mainnet USD₮ metadata
  returned symbol, decimals6 and string-encoded supply through the shared client.
  This validates read routing, not ANLGRAM token deployment or custody.
- Actual ephemeral local HTTP GETs: page, new transport, provider script and proxy
  health **4/4 HTTP200**. No signer or wallet transaction was invoked.

## Safe integration and remaining blockers

Review this focused diff against `codex/financial-integration-v2`; keep PR #1 and
PR #2 unchanged. For a later production-only proposal, review only the three
runtime frontend files plus tests against the production-safe branch, run the
preservation tests, and verify HTTPS manifest/CSP, public route availability,
wallet connection on supported devices and absence of loaded financial entry
points that bypass the read-only boundary. Do not cherry-pick financial artifacts
as part of frontend publication. Deployment still needs separate approval.

The existing V4 report remains authoritative for contract hashes and capability
limits. This integration changes no contract hashes or deployment addresses.
The approved STON.fi development trust model does not replace independent review.

Exact first lost LP notification recovery still needs authenticated operation-level
issuance evidence; the genuine self-transfer proves only a custody lower bound.
The foreign wallet has no authenticated final withdrawal/bounce receipt or replay
endpoint. Exact recovery needs a compatible STON.fi-supported wallet/Pool extension
or an independently reviewed anchored proof verifier, not an API balance snapshot.
Current Router/Pool code/governance authorization, full migration finalization and
reserve reconciliation under missing final evidence remain blocked. General
withdrawal/refund claims must stay pending where final evidence is absent.

**Read-only review candidate: implemented and locally verified, not published or
fully browser/device accepted. Supervised Testnet: offline component plan exists,
but no complete financial release is ready; independent review, concrete approved
transaction plan, funded operator and actual on-chain evidence are still required.**
Shortest path: accept the read-only frontend separately; resolve the external LP
evidence capability and independent trust review; then approve and execute a
bounded Testnet component plan before considering broader financial activation.
