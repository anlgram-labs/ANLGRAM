# Isolated Testnet preparation — NOT PUBLISHED

This is a separate non-financial Cloudflare Worker, not the production website.
Reserved origin: `https://testnet.anlgram.com`; no DNS or HTTPS availability is
claimed. `wrangler whoami` reported **not authenticated** on 2026-10-31.
The repository currently has no Cloudflare deployment secrets available to this
session. Do not use temporary anonymous accounts, tunnels or the production proxy.

## Minimum manual setup

1. In the existing Cloudflare account, confirm the **anlgram.com** zone is owned
   by the intended account. Check DNS, Workers routes and custom domains to ensure
   `testnet.anlgram.com` is unused. If occupied, stop and review that service.
   Preserve apex/www records, production Pages and `anlgram-ton-proxy`.
2. From this directory, run `npx wrangler login` and complete browser login yourself.
   Run `npx wrangler whoami`; select the correct zone-owning account when prompted.
   Never paste tokens, seeds or private keys into chat or source files.
3. Run `npm ci --ignore-scripts`, `npm test`, `npm run check:deploy`, then
   `node test/worker-runtime.mjs`. Review the **two low-severity dependency audit
   entries** for `@tonconnect/ui` / `deepmerge` (GHSA-gcqx-w48m-w2h4; no npm fix
   reported). The SDK is pinned and locally served; no caller-supplied UI options
   are merged by this app. This does not eliminate upstream SDK risk.
4. Run `npx wrangler deploy` only for this directory/config. It creates the new
   `anlgram-testnet-preparation` Worker, dedicated SQLite Durable Object namespace
   and custom-domain binding; it does not deploy any TON contract. Let Cloudflare
   provision only the Testnet subdomain DNS/certificate. Do not change apex DNS,
   production secrets or production Workers. If permissions/zone/certificate
   provisioning fail, stop and correct that specific Cloudflare permission.
5. Verify valid TLS at `/`, `/tonconnect-manifest.json`, `/api/config` and
   `/api/operator`. HTTP must not serve the app without HTTPS. Check desktop/mobile
   rendering and browser console/CSP errors, TON Connect QR/deep links, Testnet
   rejection of Mainnet/V4 accounts, fresh proof and disconnect. Do not call it
   published or wallet compatible until these real checks pass.
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

Rollback of this isolated interface: disable only its custom-domain/Worker binding
in Cloudflare; preserve production and blockchain state. No signed external BOCs,
owner proofs, cookies, API keys or session secrets should be committed or logged.
