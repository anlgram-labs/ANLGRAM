# MemeLabs frontend-only publication proposal

Base: production main `781e1db`. Branch: `codex/memelabs-production-safe`.
Prepared independently of the contract integration in PR #1. No publication,
production merge, deployment, wallet connection, signature or transaction has
been performed. This is a reviewable frontend safety update, not launchpad
Mainnet approval.

## Exact runtime files

- `memecoin-platform.html`: preserve current page design/navigation/calculator,
  disclose Mandatory Donation (10%) and 0.22 TON total, preserve full wallet
  transaction disclosure, load exact receipt dependency and keep creation
  production approval flag false.
- `assets/js/donation-config.js`: immutable integer creation allocation and pinned
  mainnet recipient `UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd`.
- `assets/js/launchpad.js`: correct invalid donation config aliases, use the
  canonical checked creator, and block the unverified factory path.
- `assets/js/transaction-receipt.js`: exact signed wallet message normalization
  and correlated donation child-transaction verification; no timeout success.
- `assets/js/anl-labs.js`: retain main tab/hash navigation; require reviewed
  wallet/network/consent; confirm exact token state/balance and wallet/donation
  receipts; preserve fail-closed distribution and vesting safeguards.
- `server.js` and `cloudflare-worker/worker.js`: add only GET message-to-transaction
  lookup with a strict 64-hex message hash to existing allowlists.

Donation is **0.02 TON = 10% of the 0.20 TON deploy/mint base**. The signed
creation batch totals 0.22 TON before wallet network fees. It is not a trading
fee or token allocation. The normal creator UI does not display the recipient
address; the actual wallet request does and remains fully reviewable. Missing,
forged, bounced, emulated or duplicate donation evidence stays unconfirmed.
Uncertain submissions are persisted and cannot be blindly retried.

## Publication boundary and functional restrictions

Contract sources, all compiled artifacts, pinned contract configuration,
production addresses, CSS files, homepage, wallet connector, TON manifests and
GitHub deployment workflows remain **byte-for-byte identical to main**. This
branch contains no launchpad contract fixes and must not be replaced by PR #1.
Test/doc files are review evidence and do not enable financial operations.

Creation is intentionally blocked pending separate production approval, including
standard creation through the alternate entry point. No unfinished buy/sell,
graduation or migration is enabled. Distribution remains blocked without exact
per-recipient reconciliation; unverified vesting cannot claim success. These
restrictions are necessary to avoid collecting real funds through incompletely
verified flows; the UI components and design are preserved.

The seven runtime files must be reviewed together with their tests. GitHub Pages
publishes the repository root on main pushes; its deployment does not update an
already-hosted Cloudflare Worker. The separately hosted worker's GET-only route
requires its own publication/review if transaction confirmation is later enabled.
Missing route support fails closed. No worker credentials were read or changed.

## Actual verification

- **30/30 root regression suites passed**, including existing main contract TVM
  baseline (154 assertions), homepage/address audit, frontend integration,
  proxy/security, wallet, distribution, vesting, wizard and donation checks.
- **16/16 local Sandbox/receipt tests passed** in `tests/creation-runtime`.
  The actual frontend-generated deploy/mint/donation batch delivers 1B standard
  Jettons to the local creator and exactly one 0.02 TON donation locally.
  This does not verify any real ANLGRAM deployment or real donation payment.
- **4/4 preservation tests passed**: all current non-script inline styles and
  page CSS blocks, navigation, homepage and wallet connector match production.
- Browser smoke test on the local server: Launchpad → Liquidity → Meme Lab →
  Review & Deploy worked; exact donation/base/total were visible, disconnected
  wallet and unverified network were shown, no recipient address was displayed.
  No browser console errors were observed. No wallet was connected.
- `npm ci --prefix tests/creation-runtime --ignore-scripts` and dependency audit
  completed with zero vulnerabilities. Existing minter dependencies are read
  through a dependency-only junction for tests; nothing was installed there.
- Existing root security suites include read-only queries to unrelated public
  token/pool accounts. They do not establish ANLGRAM Mainnet readiness. Upload,
  deployment and live transaction scripts were not executed.

Root suite results are recorded in `memelabs-frontend-test-results.json`.
The branch is ready for frontend safety review/publication preparation with the
above financial restrictions, not for enabling the complete launchpad.

## Separate remaining financial development

PR #1 keeps all Codex financial fixes and compatible Antigravity improvements.
Authenticated downstream delivery/failure receipts, contract-enforced LP
pool/pair/code authentication and fully executed STON.fi liquidity migration
remain blockers there. Do not import or enable them through this frontend PR.
Re-fetch both branches and preserve Antigravity's uncommitted work before any
future integration. No automatic conflict resolution, merge or deployment.
