# Isolated Testnet preparation — published on Cloudflare Pages

Final live origin: **https://testnet.anlgram.com/**, DNS/CNAME and valid TLS verified.
Cloudflare custom-domain verification/validation are active; certificate covers
the exact hostname. No further manual activation is required.
The separate **https://anlgram-testnet-preparation.pages.dev/** origin also works. The project and
hostname were returned by the Cloudflare API, not guessed. Its independent
production branch is `codex/testnet-pages-hosting`; it has no GitHub auto-deploy
connection. This is not production `anlgram.com`.

Real owner V5 Testnet connection and server-verified `ton_proof` passed independently
on both origins; authenticated disconnect cleared the UI. Final-domain evidence:
`../docs/launchpad/testnet-domain-owner-proof.json`. No proof/session secrets saved.
This is not transaction approval; require a fresh proof before a future request.

Pages advanced-mode Functions (`pages-entry.mjs` → `_worker.js`) reuse the reviewed
router. `PROOFS` binds to the persistent `ProofAttempt` Durable Object class in the
**new private** Worker `anlgram-testnet-preparation`. Existing `anlgram-ton-proxy`
and its secrets were not modified. Cloudflare requires an external Worker for
Pages Durable Objects. The initial Wrangler project-create command unexpectedly
delegated to Workers and created this private storage host before its custom-domain
attempt failed; the actual Pages project was then created explicitly via REST.
The private Worker has no workers.dev or custom-domain target. No public HTTP
proxy to the storage service or ephemeral in-memory replacement was introduced.

Only five static public assets and a server-side Function are deployed. Source,
configuration, contract artifacts and transaction endpoints return 404.

## Minimum manual setup

1. Pages custom domain **testnet.anlgram.com** is active. Owner added **CNAME**,
   name **testnet**, target **anlgram-testnet-preparation.pages.dev**, TTL **1800**.
   Do not change nameservers, apex/www, existing DNS, Workers or production keys.
   If `testnet` is already occupied when editing, stop and review that record.
2. DNS/TLS activation is complete. The domain-specific manifest is at
   `https://testnet.anlgram.com/tonconnect-manifest.json`. Repeat DNS/TLS checks
   after future DNS/certificate changes. No zone transfer is necessary.
3. For future maintenance, authenticate Wrangler using the existing Cloudflare
   account; never paste credentials into chat/source. Run `npm ci --ignore-scripts`,
   `npm test`, `npm run check:deploy`, `npm run build:pages`, then
   `node test/pages-runtime.mjs`.
   Review the **two low-severity dependency audit
   entries** for `@tonconnect/ui` / `deepmerge` (GHSA-gcqx-w48m-w2h4; no npm fix
   reported). The SDK is pinned and locally served; no caller-supplied UI options
   are merged by this app. This does not eliminate upstream SDK risk.
4. Deploy from the **pages/** subdirectory only:
   `npx.cmd wrangler pages deploy ../public-pages --project-name anlgram-testnet-preparation --branch codex/testnet-pages-hosting`.
   Do not run the old root `wrangler deploy` custom-domain configuration; the
   domain is managed by Spaceship, not a Cloudflare zone. Pages config contains
   the external Durable Object binding; preserve that namespace on redeploy.
5. Run `node verify-pages.mjs` for public HTTPS/byte identity/manifest/closed-route
   checks and disposable unsigned proof rejection requests. Cookies and challenge
   values are never written to evidence. Run `node verify-domain.mjs` for the final
   custom domain. `/api/operator` now returns real provider observations (200).
   Root cause of the previous 503 was Workers rejecting `redirect:'error'` before
   any upstream call. Manual mode with non-2xx rejection fixes it without allowing
   redirects. Rate limits/transport failures still return explicit unavailable,
   never a fabricated balance. No production credentials were reused.
6. Owner selects **V5R1, Testnet, subwallet 0**, checks exact address below, then
   approves only the domain-bound `ton_proof` connection. No financial signature.
   A restored SDK connection never authenticates; restoration is disabled.

## Current candidate and constraints

- Operator: `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR`.
- Expected ID: `2147483645` (`0x7ffffffd`); network `-3`.
- Only the exact fixed-key V5R1 StateInit/code/key/address is supported. V4,
  Mainnet ID, plugins/extensions, substituted accounts and malformed data reject.
- This uses the previously observed **public** key; nobody here has a signing key.
  Address derivation does not establish the owner can select/control this account
  in the actual wallet app. If the app derives another address, stop and re-review.
- Five-minute cryptographic challenges are bound to the exact domain and a
  Secure/HttpOnly host cookie; Durable Object transactions consume each once.
  Ed25519 proof establishes ownership only, never spending authorization.
- V5 separates canonical Mainnet/Testnet wallet IDs and addresses, not a native
  blockchain-global-ID check. A malicious identical StateInit clone on another
  chain remains a trust consideration. Fresh bilateral state checks, explicit
  network/from/destination and 120-second future request policy are still needed.
- No transaction/sign-data/broadcast API or financial button exists. No Mainnet
  API proxy exists. The only blockchain route is a fixed Testnet balance read.
- See `../docs/launchpad/active-testnet-candidate.json` and
  `testnet-v5-approval-sheet.md`. Old V4 plans remain historical and are obsolete
  for execution. Financial interfaces, production UI and recipient configuration
  are not changed by deploying this Worker.

The local workerd test verifies routing and actual Durable Object persistence.
Unit tests use synthetic in-memory Ed25519 keys for cryptographic verification;
they do not establish operator ownership or any real blockchain outcome.

Rollback of this isolated interface: roll back only this separate Pages deployment
or disable its custom-domain association; preserve the proof storage namespace,
production and blockchain state. No signed external BOCs,
owner proofs, cookies, API keys or session secrets should be committed or logged.
