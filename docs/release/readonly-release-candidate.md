# MemeLabs read-only release candidate — 2026-10-30 (America/New_York)

Historical pre-release record below. PR #4 was subsequently merged at `61cb4bc`
and its Pages deployment succeeded with enforced HTTPS. The current follow-up
candidate and actual mobile/production verification are documented in
[read-only completion](readonly-completion-2026-10-31.md). No new publication is
implied by this follow-up.

Branch: `codex/memelabs-readonly-release`, based directly on production
`781e1db`. Selected only the read-only delta of `0627533`; did not merge
`codex/financial-integration-v2` or import its financial implementations.
The script-loading conflict was resolved with production's existing dependencies;
the development-only transaction-receipt dependency was not imported.

## Delivered and preserved

Network-aware GET transport, exact integer formatting, stale wallet/token request
rejection, correct holder percentages and read-only financial gates are integrated
with production's existing design. Browser QA found and corrected:

- Undefined donation formatter and incorrect donation-property aliases in
  `launchpad.js`. The unchanged configuration still gives .20 + .02 = .22 TON.
- A competing legacy Mainnet scanner overwrote the new renderer. It cannot run
  in this release; one network-aware renderer owns the wallet/token tables.
- Wallet buttons could open TON Connect twice through inline and delegated
  handlers. The release routes each click once through the original connector.
- Selected token/analytics state survived wallet changes; it is now invalidated.
- Truncated table balances differed from the connector's rounded header. Integer
  rounding now handles carries without losing large-integer precision.

Native MemeLabs financial buttons remain disabled even when legacy UI code tries
to re-enable them. Capture guards stop financial handlers; SDK and underlying
connector sends reject, including replacement/restored instances. The production
wallet connector itself is byte-for-byte unchanged. These are frontend release
boundaries, not contract authorization or a sandbox against arbitrary hostile JS.

Contracts, bytecode, deterministic addresses, CSS, navigation, homepage source,
donation configuration/recipient, backend, Cloudflare Worker, API credentials and
TON Connect manifest are unchanged against `781e1db`. Donation remains disclosed,
with recipient details available in wallet confirmation rather than normal UI.
No merge, publication, deployment, signature, broadcast or TON expenditure occurred.

## Actual browser QA

Used real Chrome with the actual generated static artifact, not a DOM-only mock.
A separate local-only QA harness exercised the existing public-address watch-only
API. It supplied no balances or transaction hashes and is not in the repository
or public artifact. Watch-only tests do not prove wallet ownership/authentication.

| Check | Actual result |
|---|---|
| TON Connect selector | Real SDK selector/QR opened; double-opening fixed. Owner approval and authenticated disconnect/restoration remain manual. |
| Mainnet public reads | Real native balance and seven indexed Jettons loaded. |
| Selection / metadata / holders | Selected an actual listed Jetton; live supply, nine decimals and holder percentages rendered. |
| History | Shared client's real account-events GET returned20 events. This is API evidence; no new native MemeLabs history panel was added. |
| Testnet isolation | Same public address returned Testnet uninitialized/zero state with no Mainnet token list; network labels changed correctly. Live wallet-chain precedence additionally has automated tests. |
| Loading / empty / disconnected | Loading state observed; empty Jetton list displayed; disconnect cleared tables and selector. A Mainnet uninitialized account can still hold TON, so uninitialized is not equated with zero. |
| API error / recovery | Local HTTP404 fault injection displayed unavailable, not invented zero; restoring the actual Worker recovered reads. This outage was simulated locally, not attributed to the deployed provider. |
| Financial controls | Modern and legacy deployment buttons reported enabled=false in Chrome. Capture interception also produced the unavailable alert before SDK signing. |
| Desktop / mobile | Screenshots at1440×900 and390×844; desktop document1420px and mobile385px had no horizontal document overflow. Mobile navigation and wizard review were inspected; real device/Telegram acceptance remains manual. |
| Console | Final normal read-only and single-opening TON Connect runs had no captured errors/warnings. Intentional HTTP404 produced expected diagnostics. Initial source run's undefined formatter and SDK double-open/abort issue were corrected; not hidden. |

No genuine wallet approval, authenticated restored wallet session, signed
transaction, Testnet deployment or on-chain financial execution was performed.
Zero-decimal and oversized integer cases are automated fixtures, not claims about
the live token used above. Market-wide verified launch listings, trading charts,
circulating supply, advanced paid analytics and financial actions are unavailable.
Static GitHub Pages cannot provide the Node image-upload backend; token creation
and its financial controls stay closed. Simulated LP preview is not live custody.

## Verification evidence

- Focused Node run: **37 passed, 0 failed, 0 skipped**: 26 integration/release
  cases plus11 preserved frontend/API regression-file cases.
- Artifact secret-pattern check passed for **55 selected public files**. It
  detects common token/private-key patterns without printing values; it is a
  bounded heuristic, not a comprehensive independent secret audit.
- **157 relative script/link/image references checked; zero missing** in the
  generated artifact. Source paths and custom-domain manifest are preserved.
- Actual public HTTPS GETs: site, TON Connect manifest, wallet icon and Worker
  health all200; Worker CORS returned the exact `https://anlgram.com` origin.
- Production-preservation checks, JavaScript syntax and `git diff --check` pass.
- No financial compiler/contract suites were repeated: all contract files and
  artifacts are unchanged, and this is not a new contract verification claim.

Reproduce: `node --test test-unified-readonly.js test-readonly-release.js` and
`node scripts/build-readonly-release.js --output <new-empty-directory-outside-checkout>`.

## Actual deployment configuration and required manual publication

GitHub Pages API currently reports **build_type=legacy, main at /, CNAME
anlgram.com, https_enforced=false**. HTTPS requests currently succeed; do not
interpret that as proof that HTTP is forced to HTTPS. Cloudflare configuration
in this repository is the existing read-only Worker, not a site deployment job.
Neither Pages settings nor Cloudflare configuration was changed.

The revised static workflow packages only public frontend files, excludes backend,
credentials, snapshots, tests and bytecode, and guards every public page before
wallet code loads. Factory deployment is replaced in the artifact by an explicit
unavailable page. Missing safety JS fails closed. The source homepage remains
unchanged; the generated homepage/staking pages receive the same signing gate.
Deployment job is restricted to `refs/heads/main`; PRs/this branch do not deploy.

Required manual actions, after separate publication approval:

1. Finish owner-controlled TON Connect connection/disconnection, Mainnet/Testnet
   switching and reload/restoration acceptance against the intended HTTPS
   origin/manifest. Do not sign any transaction. Check an actual mobile/Telegram
   client if that channel is included in the release claim.
2. Review only this production-based PR and its final checks. Do not merge PR #3
   or the financial development branch into main for this release.
3. In repository Settings → Pages → Build and deployment → Source, select
   **GitHub Actions**. Keep the existing domain and secrets; confirm HTTPS
   enforcement/redirect and certificate behavior. Do not publish through the
   current legacy branch mode, which bypasses the reviewed artifact packaging.
4. With explicit authorization, merge this reviewed candidate into main. That
   push triggers the static build/upload/deploy workflow; no manual dispatch is
   needed. Inspect its result and verify the public page, cached asset versions,
   network isolation and unavailable financial controls before claiming release.

[Official publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
The existing Jekyll PR job is CI, not this controlled publication path. The new
workflow has been inspected and its Node packaging run locally, not deployed or
claimed successful in GitHub Actions. If publication fails, retain signing gates;
use a reviewed read-only artifact/maintenance page, not an older financial UI.

Status: **read-only candidate prepared and browser-tested; publication and final
wallet-owner/device acceptance are pending. Financial functionality remains closed.**
