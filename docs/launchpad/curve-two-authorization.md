# Curve transaction #2 — authorization review only

Observed 1/11/2026, 1:05:41 GMT-4, America/New_York. Baseline bc7769b, isolated branch codex/testnet-curve-two-preflight. No transaction #2 signed, requested from a wallet, broadcast or paid. Mainnet and production unchanged.

| Check | Result |
|---|---|
| Current deployed minter | PASS: active; exact approved bytecode/data hash, admin 0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061, supply0; balance0.099966866 Testnet TON |
| Metadata/getter | PASS: get_jetton_data exit0; ANLGRAM Testnet Settlement / ANLTEST /9 decimals; getter/storage agree. TonAPI independently matches current code/data/balance/transaction |
| Protocol compatibility | PASS: compiled settlement wallet e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2 matches both minter getter/storage and Curve genesis wallet-code reference |
| Curve StateInit/destination | PASS: derived from exact pinned candidate; master dependency is the actually deployed minter; target still uninitialized/zero balance |
| Operator | PASS observed: V5R1 Testnet wallet ID2147483645, seqno1, balance1.893123044TON; correct key/code and no extensions |
| Source compilation | PASS: fresh Func compilation of Curve, minter and settlement wallet matches pinned artifacts; seven existing source/artifact identities unchanged |
| Sandbox | PASS: seven new transaction-specific TVM tests plus existing full-genesis regression. Exact message routes V5->Curve, seqno1->2; no Curve pre-seeding or minter changes |
| Current Testnet emulation | PASS: complete two-transaction trace, one internal deployment, no descendants, compute/action exit0, exact code/data/amount and conservation |
| Fresh ton_proof | PENDING: latest observed proof expired; renew in the exact Testnet domain when owner returns. Historical transaction signature is not a fresh login proof |
| Signing authorization/executor | BLOCKED: separate exact owner approval and a separately verified operation#2 single-attempt executor required. Existing transaction#1 guard intentionally rejects this different message |

## Exact proposal

Network: TON Testnet, chain-3. Operator 0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR. Wallet V5R1, ID2147483645, seqno1; no source Wallet StateInit because it is already active.

Destination: **kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW**.

- Attachment: **0.100000000 Testnet TON**, one internal message, unchanged.
- Body: exact empty cell from the pinned candidate (hash96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7).
- StateInit SHA256: 1f04bf5afbd04f9851fa195518a14cf46f2b93a1344703014082a657032468ee.
- Curve code hash: 421b1028536b49f6d79eadf872076cc7e7c9afde2aeca0e2868b2706449c3627.
- Initial data hash: e2f3912b606e55b0cbd88805f0919b5072f69649ded2ce82a0c9bf1c6b768ec4.
- Modeled sender fees: **0.017022198TON**.
- Modeled total sender debit: **0.117022198TON**.
- Modeled Curve gas from attachment: 0.000043268TON; expected remaining contract balance0.099956732TON.
- Proposed total policy threshold0.120000000TON is **not approved for transaction#2 and is not a guaranteed technical maximum**. A fresh estimate and short deadline are required before an eventual request. No automatic amount increase or financial retry.

## Accounting and activation boundaries

Curve deploys at state0 (uninitialized), with real liquidity reserve0, accrued fees0 and pending refunds0. Its contract TON balance is gas funding, not liquidity. The800million Curve units and200million DEX units are immutable logical allocations, NOT proof that Jettons were minted/delivered; current real minter supply is0. No price, fee, supply, allocation, threshold or donation setting changed.

Local Sandbox reconstructs observed public code/data/balances/seqno and uses local storage/configuration, so its fees are NOT the live fee quote. Local result: debit0.117022070TON. The live quote above comes from authenticated Testnet emulation using current provider state. All emulation signatures are invalid zero signatures with checks skipped only in TVM; a negative test proves they are rejected with genuine signature checks.

Local regressions cover exact dispatch, duplicate/replay rejection, real signature-check rejection, wrong network wallet ID at matching nonce, preactivation buy rejection, underfunded operator and no gas subsidy from minter. A separate existing local genesis regression deploys, initializes, mints, verifies Curve wallet custody, explicitly renounces and activates, buys and sells. Those actions were NOT executed on Testnet in this sprint.

Remaining real steps, each with new proof/state/fees and individual owner approval: deploy Curve; deploy/configure required Guard/Migrator components without enabling migration; authenticated initialization; mandatory0.02TON donation in the existing creator/launch sequence; mint and verify actual Curve wallet custody; explicit operator renouncement with authenticated master callback; small buy, failure/refund reconciliation and sell. The current protocol's automatic Curve-admin change request is rejected with73 while operator remains admin; the passing local sequence uses explicit operator renouncement. Never label that rejected request as success. STON.fi migration and LP withdrawals remain blocked.

## Actual checks / reproduction

104 distinct targeted local tests passed, zero failed:77 interface/compiled-SDK/read-policy/UI; three actual workerd runtime; eight Sandbox/genesis; six Curve report regressions; seven previous minter-preflight; three read-client regressions. The entire older financial Sandbox suite was not rerun, because no contract source changed; its cases remain intact and the new dispatch tests are registered in its existing npm script.

Read-only report: node scripts/preflight-v5-curve-two.js --read-only --write. Source-compiled replay: node scripts/simulate-curve-two-sandbox.js --local-only --write. Targeted cases: node --test tests/settlement-runtime/curve-two-dispatch.test.js tests/settlement-runtime/genesis.test.js; node test-curve-two-preflight.js. Interface: npm --prefix testnet-interface test. No signing method exists in these scripts.

The Testnet interface exposes a manual historical report only, with observed time, real minter metadata, model fees, local TVM labeling and explicit signing blockers. All five provider observations use the existing protected Testnet key and durable scheduler; no new project, namespace, secret or DNS setup. Production anlgram.com, its proxy, Antigravity design, contracts and all existing financial gates remain preserved.

Public verification:32 checks passed, including exact deployed report/client assets, TLS, manifest, network rejection and closed financial routes. Real browser report interaction passed with no JavaScript console errors, connection request or wallet signature. Receipt report deployment: https://5ce8e2e4.anlgram-testnet-preparation.pages.dev; private read coordinator versionfa68b32e-9b24-4351-bacc-b2ff077b8dd8. Production proxy timestamp and existing proof/financial-operation namespace IDs were checked unchanged.


## Curve #2 isolated executor checkpoint (2026-11-01)

Supersedes only the earlier pending-executor/proof items above. Based on 65841e4, branch `codex/curve-two-signing-readiness`. No contract source, bytecode, StateInit, deterministic address, production UI, donation or tokenomics changed. Transaction #1 was NOT repeated.

Implemented sealed Curve policy, distinct operation `ANLTEST_CURVE_TX2`, fingerprint including expected seqno1 and wallet ID, separate SQLite Durable Object namespace, same tested build-time SDK3.3.1/UI2.3.1 one-attempt transport and persistent atomic claim. Minter fingerprint format and original namespace remain unchanged. Curve namespace: `7156708f328444748a01f04d3f1eebef`; old minter namespace: `ac09a6ee93b74bb4ba713f84837cf892`.

Server preparation checks five fresh authenticated Testnet observations plus complete exact emulation. A future claim additionally requires exact finite owner authorization (fingerprint/deadline/operation/candidate/network/operator/destination/StateInit/body/value/nonce/wallet ID), domain-bound proof, parsed V5 account StateInit, and unchanged current operator/minter/Curve state before the atomic claim. Financial authorization `CURVE_TX2_SIGNING_AUTH` is absent. Public prepare button only reads and simulates; request button remains disabled. No financial request was made.

The real browser verified domain-bound ownership through 2026-11-01T13:58:03Z and successfully prepared the exact Curve request, with seqno1 and balance1.893123044 Testnet TON. Browser model: fees0.017023634TON, total0.117023634TON, attached0.100000000TON. Quote expired at13:54:58Z; fingerprint `1865523ecf87f2fa6c101e345b424400aad5ceb8c50883db071a4823eb6e48c4`. This is historical evidence, NOT a current signing authorization. Fresh proof/fees/state and a new deadline/fingerprint are required at the next approval boundary. Independent fresh read-only report also confirmed minter code/data/getter and TonAPI agreement, Curve uninitialized, exact StateInit and conservation.

**Native limitation:** TON Connect's SendTransaction request has `network`, `from`, `validUntil`, `messages`; it has no seqno field. SDK3.3.1 cannot force the native wallet to sign nonce1 atomically. The server checks nonce1 before issuing a claim; exclusive use of this operator and no concurrent transfers are required. If cryptographic exact-nonce enforcement is required, signing readiness FAILS until a different reviewed signing workflow exists. No signature was requested to test compatibility. Official schema: https://github.com/tonkeeper/ton-connect-docs/blob/main/requests-responses.md . V5 stored wallet-ID separation and its previously documented same-StateInit clone limitation remain unchanged.

**Spending:** 0.120000000TON is a proposed review threshold, not wallet/network-enforced maximum. Attachment is fixed; complete modeled source debit must fit policy, but later native-wallet/network fees can vary. Owner must accept this uncertainty explicitly; do not raise attachment automatically.

Verified:91 interface/unit/actual encrypted compiled-bundle HTTP/UI tests;4 actual workerd persistence/binding tests;8 source-compiled TVM/Sandbox cases;36 public checks. All passed, zero failed. Curve transport fixtures measured exactly1 received encrypted bridge POST for success, failure, lost response, timeout and duplicate callbacks; concurrent tabs share1 claim, reload cannot retry, invalid input or lost claim acknowledgment produces0 POSTs. Fixture wallet responses use INVALID zero signatures; no real wallet signing or on-chain execution is represented by these tests. Reconciliation never unlocks or marks success from a wallet BOC/account snapshot; exact finalized trace evidence is required.

Published only safe Testnet preparation: https://testnet.anlgram.com/ ; Pages deployment https://5234b5b2.anlgram-testnet-preparation.pages.dev ; private Worker version `d4f3c439-6957-4628-9622-0a50482c3527`. Exact public asset hashes, HTTPS/TLS, manifest, Mainnet rejection, forged proof rejection, live authenticated balance and signing403 verified. Pages TON Center secret preserved; production proxy timestamp unchanged. No production deployment/merge.

**Next owner approval:** authorize only one Curve deployment on TON Testnet(-3), destination `kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW`, StateInit `1f04bf5afbd04f9851fa195518a14cf46f2b93a1344703014082a657032468ee`, one exact empty-body message attaching0.100000000TON, fresh model below proposed0.12TON policy, accepting non-guaranteed fees and the native nonce limitation/exclusive-operator rule. Approval must bind the fresh fingerprint and deadline; do not configure it from this expired quote. Then permit one owner confirmation in Tonkeeper, reconcile actual finalized trace, stop. No mint/activation/buy/sell/migration/LP withdrawal follows automatically.
