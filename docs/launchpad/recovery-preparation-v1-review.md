# Recovery preparation V1 — focused implementation and activation review package

Development only. No active recovery, signing UI, route registration, financial grant, deployment or transaction execution was added. Original Curve operation `ANLTEST_CURVE_TX2` and its permanently locked fingerprint `508c80f62122112cbda6af7a1fdad53a4a1bc86bad009bdd66f212988055bb28` are preserved.

## Source delivered

- `testnet-interface/recovery/policy.mjs`: exact Testnet V5 identity/derived-address checks; fixed self-transfer; distinct operation/ancestor-bound fingerprints using the existing transaction policy; fresh source/minter/Curve/legacy-lock validation.
- `testnet-interface/recovery/ledger.mjs`: separate, wallet/destination-bound preparation storage; runtime quote revisions/deadlines; atomic lifetime reservations using the existing `FinancialOperation`; duplicate/concurrency/reload protection; immutable receipt snapshots and fresh before/after source binding. No method erases or releases an original/recovery lock.
- `testnet-interface/recovery/emulation.mjs`: read-only exact V5 emulation BOC builder with an invalid all-zero signature and no source StateInit. No transport, signer or broadcasting function.
- `lib/v5-self-transfer-receipt.js`: pure signature/one-action/raw transaction/raw account-state verification for the two-transaction self-transfer; nonce, StateInit absence, message linkage, hash/LT chain, code/data/balance, forwarding/execution fees and same-wallet return reconciliation.
- `lib/v5-deployment-receipt.js`: reuses the established V5 signature/action verifier for a policy explicitly requiring no destination StateInit. Existing deployment policies still require their exact StateInit. Wallet import is narrowed to the same SDK V5 class.
- `scripts/prepare-testnet-recovery.mjs`: deterministic offline candidate generator; does not acquire credentials, call providers, generate signing deadlines or touch original records. `--write` emits only `recovery-preparation-v1-candidates.json`.

## Exact recovery candidate

| Parameter | Proposed value |
|---|---|
| Operation | `ANLTEST_V5_NONCE_INVALIDATION_V1` |
| Network | TON Testnet, `-3` only |
| Source and recipient | `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR` |
| Source seqno | Must freshly equal the original unresolved nonce1; contradiction stops preparation |
| Wallet | V5R1, wallet ID2147483645; expected public key/code; signatures enabled, no extensions |
| Attachment | **0.010000000 Testnet TON**, fixed; never automatically increased |
| Destination/source StateInit | **Absent**; existing wallet only |
| Body | opcode0 comment: `ANLGRAM TESTNET nonce invalidation; Curve #2 remains locked` |
| Body hash | `2134252d51fa928a00bcfca26a87051a66bdfa0c0e46a03d4cc3358af2c3201e` |
| Template digest | `71dd4745514c5a04c3c2bdd30bbc4aae33ba933a44bf7337976c306557a58f6c` — NOT a financial request fingerprint |
| Proposed gross policy |0.020000000TON, unapproved and not network-enforced |

The full exact payload is in the adjacent JSON candidate. There is no current signing deadline or authorized fingerprint. Runtime preparation generates a new exact fingerprint, keeps quotes at most60seconds/messages at most90seconds, checks source observations at most15seconds old, and invalidates superseded quotes atomically without a Pages deployment. Every subsequent reservation rechecks fresh source identity/balance/latest transaction and the immutable legacy lock.

Historical read-only provider model: sender+forwarding fees0.000586674TON; self-receipt fees0.000051868TON; **total network cost0.000638542TON**. Initial gross debit before return was modeled at0.010586674TON. The module conservatively checks attachment **plus all network fees**,0.010638542TON in this example, against source balance and the proposed0.02TON policy. This historical estimate is not a fresh approval or guaranteed maximum. The self-transfer is not a donation/platform fee; tokenomics and the mandatory creation donation are unchanged.

## Separate Curve successor

`ANLTEST_CURVE_SUCCESSOR_V1` is a distinct offline candidate. It preserves destination `kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW`, StateInit hash `1f04bf5afbd04f9851fa195518a14cf46f2b93a1344703014082a657032468ee`, exact body and0.100000000TON attachment. Its template digest is `cd445bb49ccfc1118c09da2cb2129291f2e4aef2cf788288b90d2ad7b65b5d0c`.

The generated template intentionally has **expectedSeqno:null**. The engine derives a candidate nonce only from the actual data in a structurally verified invalidation receipt plus a fresh matching source observation. It never predicts2 as a signing nonce or reuses an old fingerprint. Snapshot-only seqno changes do not satisfy this gate. An existing Curve, changed minter/admin/supply, different source state or lineage is rejected.

`prepareSuccessorCandidate()` remains **ineligible for authorization**. `prepare(SUCCESSOR)`, `prepareSuccessorRuntimeQuote()` and execution all fail closed. Destination reservations are never removed; a new operation ID cannot bypass the old attempt. A future reviewed server-only reconciliation transition is still required before any successor runtime authorization. This task deliberately does not implement an active transition.

## Receipt/provenance boundary — do not remove

The receipt verifier validates signature and exact action, raw transaction BOC hashes/address/status, raw before/after Account-cell hashes against transaction state updates, transaction-message and previous-hash/LT links, post-wallet code/data/nonce/balance and two corroborating observation fields. It additionally binds the before-state and root previous transaction to the stored preparation snapshot. It clones incoming evidence before any await, preventing mutable-input receipt poisoning.

**None of those input fields establish trusted acquisition by themselves.** Caller-provided JSON, provider names, `finality` flags or local fixtures are never live blockchain provenance. All outputs retain `independentAcquisitionVerified:false`, `independentFinalityVerified:false` where applicable and `financialSigningEnabled:false`. Stored local receipt summaries are field-verification results, not declarations that the real operator nonce was consumed.

Before activation, implement/review a server-owned fixed-provider acquisition adapter that obtains authentic finalized transaction and historical before/after account evidence, verifies inclusion/finality and independent account/block/receipt correlation, and handles missing evidence conservatively. Do not expose observer/estimator/context injection to browser callers. No trust may be created by editing a client flag or simply naming two providers. Actual invalidation remains pending the owner's future separately approved transaction and genuine independent receipts.

## Targeted verification (no163-case rerun)

| Checks | Passed | Failed |
|---|---:|---:|
| New preparation/security/TVM cases |19|0|
| New actual workerd SQLite persistence/concurrency/restart case |1|0|
| New existing compiled SDK rejection case; received financial POSTs measured0 |1|0|
| Existing deployment-receipt regressions affected by shared helper |6|0|

27 selected cases, zero failures. The19-case file contains actual standard V5 TVM message routing with a synthetic local test key and valid local signatures, raw transaction/account BOCs, duplicate nonce133, expired request136 and invalid signature135. No real operator key/signature or chain broadcast was used. Positive receipt fixtures cannot certify the real pinned operator. Other cases cover wrong network/value/body/StateInit, stale source/seqno, fee/balance limits, expired/superseded quotes, concurrent prepares/reservations, rejected/timeout/interrupted/uncertain outcomes, reload, duplicate callbacks, forged/transplanted receipts and mutation during asynchronous observation.

The compiled SDK test verifies the actual existing application bundle refuses the new operation with0 received financial HTTP POSTs and no operation claim. Existing transport was not patched/reimplemented; future profile registration is intentionally absent. The ledger reuses the established `FinancialOperation` primitive.

The SQLite test compiles a **temporary local fixture with Wrangler dry-run only**, runs real SQLite DO storage in workerd, and restarts it. No production binding/configuration/namespace was added. Its initial startup failure was traced to a temporary module outside Miniflare's default module root; setting the actual generated bundle root fixed the harness without weakening ledger tests.

Reproduce:

```
node --test testnet-interface/test/recovery-preparation.test.mjs test-v5-deployment-receipt.js
node testnet-interface/test/recovery-persistence.mjs
node --test --test-name-pattern="disabled recovery operation" testnet-interface/test/compiled-transport.test.mjs
node scripts/prepare-testnet-recovery.mjs --write
```

## Separate review and outstanding activation conditions

A separate internal AI reviewer inspected the design, independently ran the earlier18 preparation cases, and reported raw-state binding, complete-fee-cap, successor-preparation and asynchronous-input issues. All were corrected with targeted regressions. Final internal re-review found no remaining concrete issue within this **disabled offline scope**. That is not a qualified independent external security review. The latest19+6+1+1 checks above were run by the implementing agent; no larger independent run is claimed.

Activation remains blocked by: qualified independent ledger/security review; trusted real receipt/account proof acquisition; review of the wallet/destination-wide reconciliation transition; separately scoped registration in the existing single-attempt transport and server routes; live V5/network/proof/source/fee checks; owner execution authorization and manual Tonkeeper confirmation. Native wallet seqno is still not atomically imposed by TON Connect, and confirmation can still expire; exclusive operator use and a promptly foregrounded wallet are required. No automatic retries or window extensions.

No new smart-contract bytecode, deterministic addresses, on-chain interfaces, production website, Cloudflare deployment, donor/fee/reward settings or Antigravity integration changed. Mainnet remains closed.

## Runtime integration follow-up

The recovery module is now connected to the existing Curve Durable Object with a separate `recovery-runtime:v1:` storage prefix; the original `operation` record is read only. No new namespace, lock reset or ledger migration was introduced. `/api/recovery/status` returns sanitized persistent state. `/api/recovery/observe` acquires fixed, fresh protected Testnet account observations and corroborates the operator code/data/balance/last transaction with TonAPI. These are current-account observations, NOT finalized transaction evidence.

`/api/recovery/prepare` requires a fresh server-held canonical-domain V5 proof and accepts only an empty body. It generates a short runtime quote using the existing ledger/policy and exact invalid-zero-signature self-transfer emulation through the protected read scheduler. Complete sender/self-receipt fees, message linkage, source code/data, nonce and balance reconciliation are checked. A second fresh source/minter/Curve/legacy-lock validation rejects changes during estimation. Draft revision replacement and persistence reuse the prior implementation. No quote needs a Pages deployment.

All signing, claim, reserve, receipt-upload, reconciliation, authorization and successor execution routes remain closed. There is no activation environment toggle and no client-controlled authorization state. The existing compiled SDK does not register the recovery/successor operation. Original Curve preparation/signing controls are retired when its persistent record is locked or unavailable. The exact successor template is available for review with no predicted nonce and no authorization eligibility. Receipt field verification remains implemented in the existing ledger but is NOT exposed as a caller-evidence acceptance route: trustworthy acquisition of historical raw account/inclusion/finality evidence is still required.

The Testnet UI adds real-account/ledger reads, proof-protected non-signing preparation and transparent blocked create/buy/sell controls. It retains the existing styling, connector and API integrations. Mandatory creation donation remains0.02TON; no contract source/artifact, Mainnet or production UI changed. This is NOT an operational creation/trading MVP.

Targeted verification:8 new runtime/controller/security cases plus affected prior tests;76 distinct selected cases passed (71 source/unit/TVM cases,4 actual workerd/Pages/SQLite cases,1 compiled-SDK zero-financial-POST case). An initial cross-Worker test found a stale local Worker output because Wrangler resolved the output directory relative to the separate configuration; rebuilding the root fixture resolved its version mismatch without changing expectations. Final affected tests were rerun after the last source changes. The163-case lifecycle suite was not rerun. The existing offline lifecycle/source-integrity manifest check passed unchanged. Qualified external activation review remains outstanding; these tests are not that review.
