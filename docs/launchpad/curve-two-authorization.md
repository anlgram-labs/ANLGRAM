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
