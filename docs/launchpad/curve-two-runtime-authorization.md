# Curve #2 runtime quote authorization

This Testnet-only protocol removes Pages redeployment from the quote/signing path. It does not authorize a financial attempt.

## Separation of authority and quotes

1. Once, configure `CURVE_TX2_RUNTIME_AUTH_KEY` in the isolated **Pages** project using `runtime-authorization-admin.ps1 -Initialize`. The random HTTP-administration key is encrypted locally using Windows CurrentUser DPAPI, outside Git. It is unrelated to TON keys and never appears in browser assets, arguments or responses. A Pages deployment activates this binding once.
2. After a separate explicit owner authorization, an administrator submits one reviewed finite `SERVER_PREPARED_V1` grant using `runtime-authorization-admin.ps1 -GrantPath <reviewed-json>`. The CLI makes one HMAC-authenticated HTTPS POST, with no retry. No Pages build or deployment is required. This command does not invoke TON Connect.
3. The grant pins operation, canonical origin, network, operator, nonce, V5 wallet ID, immutable candidate, destination, StateInit/body hashes, attachment and policy. It contains a random 64-hex `authorizationId`, integer `issuedAt`, and `notAfter <= issuedAt + 90`. Runtime grants cannot contain a client fingerprint or transaction deadline. Those are generated and verified server-side.
4. `/api/curve-two/prepare` accepts **no caller parameters**. Fresh domain-bound proof, authenticated live reads and complete exact emulation produce an immutable transaction and private persistent approval. The quote lasts at most 60 seconds; the transaction lasts at most 90 seconds, shortened by the grant/proof expiry. No window is extended.
5. Every quote reserves a monotonic revision and distinct transaction deadline in the existing Curve Durable Object. Replacement immediately invalidates the previous prepared quote, even if upstream reads then fail. A stale concurrent response cannot overwrite the latest reservation.
6. The already-loaded controller displays the exact server quote and enables review only when the server permits it. Expiry disables the controls; no automatic refresh or request follows. Editing browser flags is insufficient: `/claim` independently verifies the current grant, exact private approval, actual wallet identity, live state, proof and policy.
7. The final claim atomically rechecks the stored authorization epoch and quote revision before writing the existing lifetime operation lock. Rejection, lost response, timeout, reload or disconnect never clear that lock or resend the request. Authentic finalized-transaction review is required for uncertain outcomes.

## Administrative endpoint

`POST https://testnet.anlgram.com/api/curve-two/authorize`

The exact UTF-8 JSON body is authenticated with HMAC-SHA256 over:

```
ANLGRAM_CURVE_AUTH_V1\nhttps://testnet.anlgram.com/api/curve-two/authorize\n<exact JSON>
```

The hex MAC is sent in `X-Curve-Authorization`. The secret is server-side; the browser never receives it. Grants are saved only after MAC and immutable scope validation. Replay, non-increasing issuance time, expired/extended scope and any attempted authorization after a lifetime claim are rejected. A new finite grant requires a separate manual administrative action; it never renews itself. An expired stored grant cannot fall back to an older environment grant.

Legacy exact-fingerprint environment grants remain supported for compatibility but are not configured or needed. No authorization is currently installed. Never restore minter #1 preparation or signing authorization.

## Remaining boundaries

The 0.120000000 Testnet TON ceiling is a **policy**, not a guaranteed network fee cap. Native TON Connect does not atomically enforce the expected seqno; fresh state validation plus exclusive operator use remains necessary. The owner must manually inspect and confirm Tonkeeper. This change neither signs nor transmits Curve #2 and does not enable subsequent operations, migration, LP withdrawals or Mainnet.

Local browser fixtures explicitly simulate wallet responses; encrypted SDK loopback tests count received HTTP requests. Neither is real on-chain evidence. The local fixture is excluded from the ten-file Pages publication allowlist.

## Exact review and version binding

Every financial preparation/claim carries the source-derived `execution-version.json` ID from the actual compiled SDK. The app rejects a mismatched server/SDK pair; Pages also checks the private persistent Worker's version. Prepared records and finite grants pin that version. The administrator CLI checks the deployed version before sending a grant. An incompatible or obsolete version cannot acquire a signing claim. This identifier concerns execution infrastructure only: contract bytecode and deterministic addresses are unchanged.

For the exact owner-review path, a runtime grant may include `preparedFingerprint` naming the **already stored, unexpired private quote**. The administrative HMAC covers it. The persistent transaction verifies that exact quote/revision and adopts it without changing its transaction, fingerprint, quote expiration or observation time. A manual preparation refresh then displays that same quote with server permission. Unknown, superseded or expired fingerprints are rejected; expired exact grants never manufacture another quote. The final claim still performs fresh live state/proof checks and atomically claims once. No client-supplied authorization is trusted.

If the owner has not authorized an exact quote, no grant is installed. A preview does not request a signature or consume the attempt. If owner review takes longer than the quote lifetime, a genuinely fresh quote and renewed owner review are required; expiry is never extended to accommodate review.
