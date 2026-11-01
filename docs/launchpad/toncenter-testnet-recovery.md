# TON Center Testnet recovery and transaction #1 approval

Observation: 2026-11-01T03:44:01.634Z. Baseline fc404c1. No production, contract, economic, donation, TON Connect transport or signing authorization changes.

## Root cause and correction

The deployed Testnet requests omitted X-API-Key. Neither the private Testnet Worker nor Pages originally had a TON Center secret; production TONAPI_KEY belongs to a different provider. Owner configured encrypted TONCENTER_TESTNET_API_KEY in the **Pages project's production environment**. It is not configured on the same-named private Worker, and was not copied there.

Pages reads the secret from its environment and passes it exclusively over its private Durable Object binding. TestnetReads sends X-API-Key only to fixed HTTPS Testnet TON Center endpoints. No client, query string, response, storage record or log contains the key. The deployed fresh balance AND fixed emulation calls returned200 with TESTNET_KEY_ACCEPTED. Thus the configured key is currently accepted on Testnet; no Mainnet-only key fallback occurs. A Pages redeployment was performed to activate the binding/code. Official protocol: [TON Center authentication](https://docs-next.ton.org/api/v2/authentication).

## Read-only scheduling and failure semantics

A single named SQLite Durable Object coordinates Pages instances. Minimum upstream spacing1200ms; concurrent identical unfinished reads deduplicate. Display reads may use a labeled three-second cache. Preflight account reads, financial claim/reconciliation reads and fee emulation bypass completed caches. Only the operator, minter and exact server-constructed invalid-signature minter emulation are supported. No caller-supplied BOC, destination, amount, method or network is accepted. No polling or fee estimation runs automatically.

At most two read/emulation attempts; exponential cooldown1200ms doubling through six exponent steps, persisted across instance restart. Retry-After seconds/HTTP-date is respected without shortening long delays. A delay over two seconds returns the actual cooldown instead of sleeping/repeatedly polling.429 stays429; upstream503/transport outages return503 with distinct reason;401/403 identify invalid versus wrong-network key. Stale observations are not served as balances on failure. They are labeled STALE_NOT_SERVED with observation time only. A missing key is explicitly ANONYMOUS, never represented as authenticated. The local CLI read/emulation helper similarly spaces requests, limits retries and never sends the Testnet key to Mainnet. No signing transport retries were changed.

The fixed fee endpoint constructs one zero-signature V5 message on the server, using the pinned Testnet candidate and exact0.10TON attachment. Emulation uses ignore_chksig=true and is NOT a real transaction. The CLI independently rebuilds and compares the full body hash, validates the complete trace and reconciles sender/minter fees. A90-second emulation deadline accommodates observed small clock skew while retaining the <=120-second policy; arbitrary deadlines/payloads are not accepted.

## Verification

77 local tests passed, zero failed:64 interface/bundle/rate-limit/emulation tests, three real workerd runtime tests (read coordinator, existing operation lock, proof routing), three local scheduling-client tests and seven preflight regression tests. The final input-guard/90-second adjustment additionally passed the12 affected unit tests; these are included, not added to the77 distinct count. All previous52 interface/transport/policy tests remain. Runtime source is rebuilt to an absolute output path to avoid accidentally testing an older bundle relative to the configuration directory.

Public verification:28 passed, zero failed. TLS, exact client/asset bytes, manifest/domain challenge, forged-proof/Mainnet rejection, fixed authenticated balance and disabled financial routes passed. Live financial claim returns403; MINTER_TX1_APPROVAL remains absent. Browser displayed1.999999999 Testnet TON. Owner's accidentally selected Mainnet account was rejected; renewed correct-account server-verified ton_proof expires 2026-11-01T03:47:34.000Z. No proof signature, session cookie, challenge secret or credential was committed.

## Transaction #1 PASS/FAIL sheet

| Check | Result |
|---|---|
| Protected Testnet reads/emulation | PASS: fresh, uncached, key accepted |
| Domain/operator proof | PASS at observation; expires 2026-11-01T03:47:34.000Z; renew after expiry |
| Operator | PASS: 0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR; V5R1, wallet ID2147483645, chain-3 |
| Balance/nonce | PASS:1.999999999 Testnet TON; uninitialized V5, initial seqno0 |
| Destination | PASS: kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8; uninitialized, zero balance |
| Source/artifacts/StateInit | PASS: seven unchanged source/artifact identities; destination/metadata/admin independently revalidated |
| Message | PASS: exactly one internal deployment message; attachment0.100000000 Testnet TON; no automatic retries or step2 |
| Complete provider emulation | PASS: block95008621; trace SHA256 7d1004e7c406eccf3563a104c20b783413ed55ab31679b8c9e0184f8b23e992a |
| Fees / debit | PASS model: sender fees0.006876950 TON; total0.106876950 Testnet TON. Minter gas33134nanoTON comes from the attachment and is not counted twice |
|0.120000000TON policy | PASS model; NOT a guaranteed wallet/network-enforced maximum |
| Persistent operation lock | PASS existing SQLite concurrency/restart regression; namespace preserved; no claim made |
| Mainnet isolation | PASS configured network/origin/wallet ID and wrong-account rejection; identical-StateInit-clone replay limitation remains |
| Native financial signing | NOT TESTED and not requested; ton_proof does not prove actual transaction signing |
| Authorization/broadcast | BLOCKED pending separate owner approval and fresh exact short-lived fingerprint/state/fee review. No authorization configured |

Pre-signing technical review passed at observation. Ready to present transaction#1 for **separate owner approval**, not ready for automatic execution. Evidence expires: fee/state and proof must be revalidated at the time of any future authorized request. Native wallet may sign and broadcast before returning its BOC; no post-return inspection or network-enforced total-debit cap is claimed. No transaction#2 is authorized.

## Delivery / preservation

Custom URL https://testnet.anlgram.com. Pages deployment https://82ade18c.anlgram-testnet-preparation.pages.dev; private Testnet coordinator Worker version ad39a939-464a-40c2-a0d2-74d5afc17be8. Existing proof and financial-lock namespace IDs unchanged; production anlgram-ton-proxy timestamp unchanged. Existing Pages secret preserved; private Worker has no copied TON Center secret. No DNS, production UI, financial branches, contract artifacts or donation settings changed. All financial controls stay disabled. No signature, broadcast, deployment of TON contracts or TON expenditure.

Reproduce: npm test in testnet-interface; npm run build:pages; wrangler deploy --config proof-storage/wrangler.toml --dry-run --outdir ABSOLUTE_TESTNET_INTERFACE/.worker-build; node test/rpc-runtime.mjs; node test/operation-runtime.mjs; node test/pages-runtime.mjs. Root: node test-toncenter-preflight-client.js; node test-v5-minter-preflight.js. Fresh non-signing preflight: node scripts/preflight-v5-minter.js --read-only --hash-only --protected-reads --write. Keep both existing namespaces and the new scheduler namespace on rollback. Preserve MINTER_TX1_APPROVAL absence until separate explicit approval.
