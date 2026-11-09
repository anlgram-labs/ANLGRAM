# TON Connect single-attempt transport — verified implementation

## Scope and pinned build

Branch: codex/testnet-single-attempt, based on a9d65a5. UI 2.3.1, SDK 3.3.1, esbuild 0.28.2. No contract or economic changes.

sdk-patch.mjs applies a build-time patch only to the exact upstream SDK SHA256 2aebf1039a9fd15e42b4229828bda288160c6610ed4166ce1fae24d0e7c4f880. Changed source or patch contexts fail the build. No runtime monkey-patching. The single patched SDK module is the same module used by TON Connect UI. Served client SHA256: f84fe4c54031fb1f6becc7e5c788cf8004cd40a42a5f1953f6b3081a60b505be.

The public sendTransaction method requires the exact pinned minter transaction; HTTP provider only. Its bridge attempt count is one, TTL follows the short transaction expiration, and financial POST redirects are manual. Other connection/SSE behavior, encryption and RPC identifiers are preserved. Mainnet, substituted operator/destination/StateInit/body/value, extra messages or unsupported options fail closed. The immutable transaction is fingerprinted including expiration.

## Persistent operation lock and authorization

Before any financial SDK invocation a same-origin server claim is required. A SQLite FinancialOperation Durable Object atomically locks the single operation/operator for its lifetime, independently of expiration or fingerprint changes. There is no application reset, expiration release, retry, or unlock endpoint. Lost claim acknowledgments, rejected requests, reloads and disconnects do not authorize another attempt. The original ProofAttempt namespace is preserved.

MINTER_TX1_APPROVAL is deliberately ABSENT. Financial UI controls remain disabled. A future separately reviewed authorization must pin the exact fingerprint/deadline, candidate hash, complete fresh emulation trace, modeled debit and source state. The server requires a current domain-bound operator proof, quote age <=60 seconds, deadline <=120 seconds, modeled debit <=120000000 nanoTON and authentic fixed Testnet source/destination reads. This policy is NOT a network-enforced spending ceiling.

Uncertain outcomes remain LOCKED_PENDING_RECONCILIATION. Wallet BOC responses are marked UNVERIFIED, never deployment success. Reconciliation queries authentic Testnet account observations but never unlocks: exact external hash/transaction trace, seqno, minter code/data and balances must be independently reviewed. A balance or missing response cannot prove transaction outcome. No automatic second operation is supported.

## Measured verification

61 local tests passed, zero failed: 52 bundle/policy/interface tests, one actual workerd SQLite persistence/concurrency/restart test, one external Durable Object Pages routing test, seven preflight regression tests.

Tests load the exact generated application bundle and route encrypted HTTP financial frames to a real loopback HTTP server. The server counts received POSTs. Success, HTTP500,307 redirect, lost response/socket close, timeout, hung connection and wallet rejection each produce exactly ONE financial POST. Concurrent clicks, VM reload/two tabs, duplicate callbacks, disconnect and SSE reconnection produce no additional POST. Invalid network/parameters, missing authorization and lost/hung claim acknowledgement produce ZERO financial POSTs. A claim response with headers but no complete body also times out without a financial POST.

Negative control: the separately bundled unmodified SDK produced FOUR received POSTs with the same RPC ID in the recorded run. This is repeated transport delivery, NOT evidence of repeated blockchain execution. Timers are accelerated in the controlled harness; wallet result fixtures carry an invalid all-zero signature and are never broadcast. Session encryption/decryption is real. Native financial signing, native wallet internal retries and blockchain settlement are deliberately untested.

## Live preparation and preservation

Only non-signing Testnet preparation deployed: private Testnet proof/storage Worker version 9af7ce62-cd81-4a73-b31b-69b724548d47 and Pages deployment ce1c7bdc.anlgram-testnet-preparation.pages.dev, custom origin https://testnet.anlgram.com. Live claim route returns403 without creating a claim. Approval remains absent. Exact asset hashes, manifest, TLS and domain-bound challenge checks are tested by verify-domain.mjs.

Production anlgram-ton-proxy modification timestamp remains 2026-10-27T04:37:56.362791Z; existing proof namespace unchanged. Production website, contracts, donation, tokenomics, DNS and previous PRs are not modified. Cloudflare administrators remain trusted to preserve storage; never delete/recreate the lock namespace to recover an ambiguous transaction.

## Transaction #1 approval status

Transport blocker resolved in controlled tests. Transport is ready for separate review; transaction approval remains blocked by expired proof and current public provider rate limiting. Operator 0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR; destination kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8. Exactly one message, attachment 0.100000000 Testnet TON. Latest read-only complete emulator sender debit 0.106876947 TON at 2026-11-01T03:14:24.646Z; 0.120000000 TON is policy only. Destination remains uninitialized. The first external request also activates the uninitialized V5 operator wallet; no second internal deployment message is added.

Historical ton_proof is expired: renew it before future authorization, then refresh state, fee trace and exact short-lived fingerprint. Tonkeeper26.10.4 declared SendTransaction support, not proof of actual financial signing compatibility. The wallet may sign AND broadcast before returning a BOC; post-return inspection cannot prevent that broadcast. Canonical V5 network IDs separate configurations, but an intentionally funded identical-StateInit clone remains a replay trust limitation. No generic financial executor, transaction #2, native-wallet guarantee, hard fee cap or Mainnet readiness is claimed.

## Reproduce / recovery

In testnet-interface: npm ci --ignore-scripts; npm test; npm run build:pages; wrangler deploy --config proof-storage/wrangler.toml --dry-run --outdir .worker-build; node test/operation-runtime.mjs; node test/pages-runtime.mjs. Root: node test-v5-minter-preflight.js. Public non-signing checks: node testnet-interface/verify-domain.mjs. Keep MINTER_TX1_APPROVAL absent until a separately reviewed, time-bounded owner authorization. Roll back only this Testnet Pages/Worker code if necessary, preserving both Durable Object namespaces and all recorded locks.

Live check limitation: TON Center returned HTTP429 to the deployed interface, which correctly returned503 with unknown balance. All preceding TLS, exact bundle/assets, manifest, domain challenge, forged-proof/network rejection and closed-route checks passed; financial claim403. No fallback values or financial authorization enabled. The direct read-only complete emulation passed with modeled sender debit0.106876947 Testnet TON. A fresh successful provider read and owner proof are required before any future financial request.
