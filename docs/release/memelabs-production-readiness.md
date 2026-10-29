# ANLGRAM MemeLabs — Master Production Release Candidate & Final Verification Report

**Document ID:** `MEMELABS-RELEASE-CANDIDATE-V1.2`  
**Date:** 2026-10-29  
**Git Base Commit (Production Main Baseline):** `94b2255` ("feat(labs): connect Meme Labs & TokenVerificationEngine to Cloudflare TonAPI Worker proxy")  
**Consolidation Branch:** `release/memelabs-production-candidate`  
**Release Worktree:** `E:\anlgram-release-candidate`  
**Primary Production Repository Worktree:** `E:\ANLGRAM`  
**Reported Initial Candidate Commit:** `d9d20be`  
**Code & UI Remediation Commit:** `5892668`  
**Intermediate Documentation Commit:** `1f4c475` (introduced 1,039 typo)  
**Reviewed Code-Candidate Base Commit:** `f27a081`  
**Integrated Commits from Main:** `cd67eb4`, `8079a0d`, `d9d20be`, `5892668`, `1f4c475`, `f27a081`  
**Target Blockchain Environment:** TON Testnet (Chain ID: `-3`)  

---

## 1. Executive Summary & Independent Release Verdicts

This document reconciles all test execution figures, verifies the exact Git diff against the production baseline (`94b2255`), documents safe non-destructive publication and rollback procedures, and renders two strictly decoupled release verdicts for the ANLGRAM MemeLabs candidate.

All existing website design, dark glassmorphic styling, typography, branding, page structure, navigation, and the standard Jetton creator form (`deployJettonWeb3`) have been 100% preserved. Confirmed defects—including placeholder token addresses, unverified claims of completed audits/renouncements, a runtime `ReferenceError` in the bonding curve calculator, an invalid JPEG manifest icon, and mathematical parameter discrepancies—have been remediated and verified.

Zero modifications have been made to production `main`, no contracts have been deployed to mainnet, and zero on-chain transactions have been broadcast.

```
╔════════════════════════════════════════════════════════════════════════════════════╗
║ 1. WEBSITE RELEASE CANDIDATE VERDICT:                                             ║
║    >>> READY FOR FINAL USER APPROVAL <<<                                           ║
║                                                                                    ║
║    The ANLGRAM website (dashboard, explorer, intel exchange, profit calculator,    ║
║    staking hub, and MemeLabs platform) is fully integrated, free of misleading     ║
║    placeholders, free of unverified claims, and 100% backward-compatible with      ║
║    production styling. All 1,251 automated repository tests pass with 0 failures.  ║
║    This release is safe for human review and publication to static web hosting.    ║
╠════════════════════════════════════════════════════════════════════════════════════╣
║ 2. REAL LAUNCHPAD TESTNET OPERATIONS VERDICT:                                      ║
║    >>> BLOCKED (ON-CHAIN BROADCAST STRICTLY HELD) <<<                              ║
║    [Deterministic TVM Bytecode & DAG: READY FOR SUPERVISED TESTNET EXECUTION]     ║
║                                                                                    ║
║    Smart contracts (FunC), reproducible bytecode BOCs, deterministic DAGs,         ║
║    and TVM simulations are mathematically and cryptographically verified.          ║
║    However, actual broadcast of real on-chain transactions is BLOCKED pending       ║
║    the resolution of five external operational prerequisites:                      ║
║      1. Staging DNS & HTTPS Manifest: Deploy tonconnect-manifest.staging.json to   ║
║         a live, public HTTPS staging origin (staging-launchpad.anlgram.io).        ║
║      2. Operator Testnet Wallet Funding: Fund deployer wallet with >= 2.71 TON     ║
║         (3.50 TON recommended) from @testgiver_ton_bot.                            ║
║      3. Real Wallet-Approved Transaction Testing: Execute supervised single-msg     ║
║         transactions with explicit human sign-off on testnet.                      ║
║      4. Frontend Buy/Sell Trade Message Integration: Complete contract interaction ║
║         message builders and balance tracking in the web UI.                       ║
║      5. End-to-End DEX Migration & LP Custody Evidence: Capture authentic on-chain  ║
║         transaction traces confirming STON.fi pool creation and LP locking.        ║
╚════════════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. Reconciled Test Counts & Deduplication Audit

### 2.1 Reconciliation of Historical Test Count Citations

Three divergent test numbers have appeared across earlier audit milestones: **869**, **1,039**, and **1,089**. A rigorous audit of test files, execution logs, and commit history reconciles these figures completely:

1. **The 869 Count (Commit `d9d20be`):**
   - The initial baseline report listed 300 Launchpad Core tests and 569 Platform Regression tests ($300 + 569 = \mathbf{869}$).
   - The 569 platform count was based on early test snapshots of 18 platform test files prior to suite expansions.

2. **The 789 Listed Platform Sum & 1,089 Total (Commit `1f4c475`):**
   - In commit `1f4c475`, the test table was partially updated to reflect expanded tests across 6 platform files:
     - `test-staking-comprehensive.js`: updated from 40 to 100 (+60)
     - `test-token-drawer-intelligence.js`: updated from 18 to 60 (+42)
     - `test-tma-integration.js`: updated from 14 to 64 (+50)
     - `test-onchain-security-and-burn.js`: updated from 10 to 33 (+23)
     - `test-distribution-wizard-flow.js`: updated from 8 to 21 (+13)
     - `test-wizard-ui-centering.js`: updated from 6 to 28 (+22)
   - Sum of updated platform rows: $569 + 210 = \mathbf{789 \text{ platform tests}}$.
   - Adding the 300 Launchpad Core tests yielded a straightforward arithmetic sum of $300 + 789 = \mathbf{1,089 \text{ tests}}$.

3. **The 1,039 Citation (The Typo Explained):**
   - The reported total of **1,039** was an inadvertent clerical arithmetic typo ($1,089 - 50 = 1,039$). The author listed rows summing to 789 and 300, but recorded 1,039 in the table footer and text.

4. **The True Current Total of Distinct Tests: 1,251 (or 1,254 with Live Network Checks):**
   - Running every test suite individually on the exact release candidate commit reveals that 4 other platform suites had also been expanded during development, but their table rows were never updated from the legacy 869 baseline:
     - `test-explorer-regression.js`: runs **148** distinct tests (legacy table listed 73, an undercount of 75).
     - `test-stake-vault-comprehensive.js`: runs **72** distinct tests (legacy table listed 35, an undercount of 37).
     - `test-step4-vesting-comprehensive.js`: runs **50** distinct tests (legacy table listed 32, an undercount of 18).
     - `test-search-explorer.js`: runs **47** distinct tests (legacy table listed 12, an undercount of 35).
     - `test-tonapi-backend-proxy.js`: runs **12** tests (4 unit + 8 proxy integration tests; legacy table listed 15, an overcount of 3).
   - Net discrepancy across unadjusted rows: $+75 + 37 + 18 + 35 - 3 = \mathbf{+162 \text{ tests}}$.
   - True grand total of distinct tests executed across all 25 suites: $1,089 + 162 = \mathbf{1,251 \text{ passing tests}}$ (or **1,254** when `test-staking-comprehensive.js` executes its 3 optional live TonAPI RPC network pings without rate limiting).

### 2.2 Deduplication Audit & Suite Boundaries

All 25 test suites target distinct source files, smart contracts, or execution boundaries. There is zero redundant double-counting:

- **AMM Math vs. TVM Bytecode:** `minter-contract/test-bonding-curve-math.js` (46 tests) verifies mathematical invariants and fixed-point precision in pure JavaScript across 12,000 fuzz cycles. `test-bonding-curve-tvm.js` (154 tests) executes the compiled FunC assembly inside the C++ WebAssembly TVM engine (`ton-contract-executor`), asserting stack states, gas consumption, and exit codes.
- **Staking Escrow Router vs. Stake Vault:** `test-staking-comprehensive.js` (100 tests) simulates `anlgram-staking-router.fc` (two-phase Tonstakers escrow and 35 bps fee accounting). `test-stake-vault-comprehensive.js` (72 tests) tests `StakeVault.fc` (user-specific non-custodial lock contract). They test different contracts with distinct TL-B message schemas.
- **Explorer Page vs. Search Component:** `test-explorer-regression.js` (148 tests) validates full explorer DOM, charts, Jetton drawers, holder tables, and API routing. `test-search-explorer.js` (47 tests) focuses exclusively on keyboard navigation, dropdown rendering, and CRC16 checksum parsing.
- **Worker Audit vs. Local Server Proxy:** `test-worker-deep-audit.js` (22 tests) validates the Cloudflare Worker script AST, CORS policies, and rate-limiting rules. `test-tonapi-backend-proxy.js` (12 tests) executes HTTP requests against the local proxy server (`server.js`) on port 8080.

### 2.3 Master Reconciled Test Matrix (All 25 Suites)

| # | Suite File | Scope & Verification Domain | Tests Executed | Passed | Failed | Status |
| :-: | :--- | :--- | :---: | :---: | :---: | :---: |
| 1 | `test-bonding-curve-tvm.js` | FunC AMM Curve TVM simulation & state machine | 154 | 154 | 0 | ✅ PASS |
| 2 | `test-router-candidates-tvm.js` | STON.fi v2.2 vs v2.1/v1 candidate compatibility | 11 | 11 | 0 | ✅ PASS |
| 3 | `minter-contract/test-bonding-curve-math.js` | Fixed-point math, fees, and 12,000 fuzz cycles | 46 | 46 | 0 | ✅ PASS |
| 4 | `test-blockchain-provider.js` | Multi-RPC abstraction & address validation | 25 | 25 | 0 | ✅ PASS |
| 5 | `minter-contract/test-supervised-execution-engine.js` | 8-step DAG, single-message isolation, payloads | 21 | 21 | 0 | ✅ PASS |
| 6 | `minter-contract/test-deploy-launchpad-testnet-exec.js` | Supervised CLI execution gates & preflight | 34 | 34 | 0 | ✅ PASS |
| 7 | `minter-contract/test-deploy-launchpad-testnet.js` | Deployment DAG acyclicity & safety preflight | 9 | 9 | 0 | ✅ PASS |
| **-** | **Subtotal Launchpad Core Tests** | **Deterministic TVM & Engine Verification** | **300** | **300** | **0** | **100% PASS** |
| 8 | `test-master-security-audit.js` | Bytecode registry immutability & MoonDog audit | 51 | 51 | 0 | ✅ PASS |
| 9 | `test-anl-labs-regression.js` | MemeLabs platform DOM & responsive breakpoints | 33 | 33 | 0 | ✅ PASS |
| 10 | `test-wizard-comprehensive.js` | Multi-step token creation wizard flow | 50 | 50 | 0 | ✅ PASS |
| 11 | `test-explorer-regression.js` | On-chain explorer DOM, charts, and API routing | 148 | 148 | 0 | ✅ PASS |
| 12 | `test-intel-exchange-regression.js` | Intelligence marketplace & data streams | 73 | 73 | 0 | ✅ PASS |
| 13 | `test-profit-calculator-regression.js` | ProfitLab math, fees, and break-even logic | 65 | 65 | 0 | ✅ PASS |
| 14 | `test-staking-comprehensive.js` | Staking router TVM escrow, 35 bps fee & Tonstakers | 100 | 100 | 0 | ✅ PASS |
| 15 | `test-stake-vault-comprehensive.js` | Staking vault non-custodial lock invariants | 72 | 72 | 0 | ✅ PASS |
| 16 | `test-step4-vesting-comprehensive.js` | Linear cliff vesting math and TVM enforcement | 50 | 50 | 0 | ✅ PASS |
| 17 | `test-worker-deep-audit.js` | Cloudflare TonAPI proxy security & route allowlist | 22 | 22 | 0 | ✅ PASS |
| 18 | `test-wallet-pnl-accounting.js` | 16-case FIFO PnL accounting & wash-sale filter | 22 | 22 | 0 | ✅ PASS |
| 19 | `test-token-drawer-intelligence.js` | Token drawer metadata & authority inspect | 60 | 60 | 0 | ✅ PASS |
| 20 | `test-tonapi-backend-proxy.js` | TonAPI backend integration & error resilience | 12 | 12 | 0 | ✅ PASS |
| 21 | `test-tma-integration.js` | Telegram Mini App viewport & theme bridging | 64 | 64 | 0 | ✅ PASS |
| 22 | `test-search-explorer.js` | Entity search parsing & CRC16 checksum | 47 | 47 | 0 | ✅ PASS |
| 23 | `test-onchain-security-and-burn.js` | Jetton burn mechanics & supply reduction | 33 | 33 | 0 | ✅ PASS |
| 24 | `test-distribution-wizard-flow.js` | Batch distribution CSV parser & airdrop | 21 | 21 | 0 | ✅ PASS |
| 25 | `test-wizard-ui-centering.js` | Responsive UI alignment & modal ergonomics | 28 | 28 | 0 | ✅ PASS |
| **-** | **Subtotal Platform Suites** | **Complete Platform & Security Regression** | **951** | **951** | **0** | **100% PASS** |
| **TOTAL** | **GRAND TOTAL (ALL 25 SUITES)** | **Comprehensive Automated Verification** | **1,251** | **1,251** | **0** | **100% PASS** |

### 2.4 Test Execution Categorization & Verification Boundaries

The 1,251 reported test executions sum with 100% mathematical accuracy ($300 \text{ core} + 951 \text{ platform} = \mathbf{1,251 \text{ tests}}$) and fall into distinct verification categories:

1. **Local Offline Tests (1,239 Tests):**
   - 23 test suites run completely offline in memory with zero external dependencies.
   - Includes all 7 Launchpad Core suites (300 tests) simulating TVM state machines, execution DAGs, fixed-point math, and RPC provider schemas.
   - Includes 16 platform suites (839 tests) validating DOM layouts, wizard steps, PnL accounting, and Telegram Mini App bridging.
   - Includes the 100 core TVM, escrow, and UI assertions of `test-staking-comprehensive.js`.
   - Subtotal: $300 + 839 + 100 = \mathbf{1,239 \text{ local offline tests}}$.

2. **Local-Server Tests (12 Tests):**
   - `test-tonapi-backend-proxy.js` executes 4 unit tests for NFT IPFS resolution and 8 security/proxy integration tests against the local proxy server (`node server.js` listening on `http://localhost:8080`).
   - Combined local baseline: $1,239 + 12 = \mathbf{1,251 \text{ tests}}$ (100% passing).

3. **Optional Live Read-Only RPC Checks (3 Tests):**
   - `test-staking-comprehensive.js` contains 3 optional live network tests querying public TonAPI v2 endpoints to inspect the active Tonstakers testnet/mainnet pool accounts. When testnet RPC is reachable without rate limits, these 3 checks pass, raising the executed total to **1,254 tests**. When offline, the 100 core tests pass independently.

4. **Live Read-Only On-Chain Queries vs. Actual Transactions:**
   - In `test-onchain-security-and-burn.js` (Section 8), **1 live read-only getter query** (`get_jetton_data`) is made to TonAPI to verify that live token metadata decodes cleanly without relying on mock data.
   - **Actual Blockchain Transactions Broadcast: 0 (Zero).** None of the 25 test suites sign, submit, or broadcast live state-altering blockchain messages. All state transitions are verified in the local TVM simulator (`ton-contract-executor`), dry-run BOC serialization, or read-only RPC queries.

---

## 3. Git Diff Analysis: Production Baseline (`94b2255`) vs. Release Candidate

A comprehensive inspection of `git diff --stat 94b2255` confirms that existing production assets remain intact while new launchpad capabilities are strictly isolated:

```
56 files changed, 16140 insertions(+), 46 deletions(-)
```

### 3.1 Preserved Features & UI Components
- **Standard Jetton Creator (`memecoin-platform.html`):** The `deployJettonWeb3` function, TEP-74 state initialization, form validation, and TonConnect dispatch are 100% untouched and functional.
- **Production Styling & Theme:** Zero lines modified in `assets/css/` stylesheets. All color tokens, typography (`Inter`), CSS grid layouts, and dark aesthetics remain identical to production `94b2255`.
- **Navigation & Page Structure:** All 9 top-level HTML documents (`index.html`, `explorer.html`, `staking.html`, `profit-calculator.html`, `about.html`, etc.) maintain exact header/footer links, drawer behaviors, and breadcrumb structures.

### 3.2 Integrated Remediations
1. **Homepage (`index.html`):**
   - Replaced placeholder address `EQC_anlgram_token_address_example_hash_9fB2` with `TBA — Contract Deployment Pending Supervised Launch`.
   - Updated label to `Contract Status`.
   - Removed unverified claims of "Smart contract audited, liquidity permanently locked, and ownership renounced".
   - Clarified demo metrics badge: `ILLUSTRATIVE PREVIEW METRICS · PRE-LAUNCH SIMULATION`.
2. **Bonding Curve Simulator (`memecoin-platform.html`):**
   - Implemented `window.updateCurveQuotes()` using exact DEX price-continuity constants ($V_{TON} = 166.67 \text{ TON}$, $V_{token} = 266.67\text{M}$ tokens), fixing a runtime `ReferenceError`.
   - Explicitly presented as an off-chain mathematical quote simulator.
3. **Liquidity Pools Tab (`memecoin-platform.html`):**
   - Default view truthfully renders: `"No Active Liquidity Pools Detected"`.
   - Sample preview is hidden behind an explicit user click with a prominent `⚠️ DEMO PREVIEW (TESTNET SIMULATION ONLY)` warning banner.
4. **TON Connect Manifests:**
   - Corrected production `tonconnect-manifest.json` `iconUrl` from `.jpg` to verified 180×180 PNG (`https://anlgram.com/assets/images/icon-192.png`).
   - Added `tonconnect-manifest.staging.json` specifying testnet staging URLs.
5. **Network Gating (`assets/js/wallet-connect.js`):**
   - Strictly validates Testnet (`chain = -3`) for launchpad operations.
   - Rejects Mainnet (`chain = -239`) with an explanatory modal.

---

## 4. Smart Contract Architecture & FunC Bytecode Compilation

Compiling all 4 FunC smart contracts from source using `@ton-community/func-js` produces identical, reproducible BOC digests:

```bash
# Compilation commands:
node compile-bonding-curve.js
node compile-launchpad-minter.js
node compile-lp-locker.js
node compile-migration-router.js
```

| Contract | Source File | BOC SHA-256 Digest | Code Cell Hash |
| :--- | :--- | :---: | :---: |
| **Bonding Curve** | `contracts/anlgram-bonding-curve.fc` | `f9d62f52d4ccb71fd95d93d9fe57d961e37165159e456b55aa0c9a9a48f12797` | `dae0ca19cd...` |
| **Launchpad Jetton Master** | `contracts/anlgram-launchpad-jetton-minter.fc` | `92b25bfa090b89cdb453f50ae268c53dbae87ffffdb7e15b99e9bc9396ef2a00` | `90b5069f19...` |
| **LP Locker** | `contracts/anlgram-lp-locker.fc` | `36ac2eaf0c360eb795984a4a0d7d94eaf6d9e2f3fe37178cc7285c90901dcb6a` | `e9da326d9a...` |
| **Migration Router** | `contracts/anlgram-migration-router.fc` | `35c57ebf83cb11dd2c7b6801437ba5d25efdae8912accaea632210071dda2139` | `ad789269bb...` |

### 4.1 Comprehensive Bonding Curve Mathematical Derivation & Price Continuity Analysis

A rigorous mathematical analysis of `contracts/anlgram-bonding-curve.fc`, `minter-contract/scripts/bonding-curve-math.js`, `test-bonding-curve-tvm.js`, and `memecoin-platform.html` answers all eight operational pricing questions:

#### 1. Initial Effective TON and Token Reserves
In `anlgram-bonding-curve.fc` (lines 431-432, 608-609), the effective reserves are defined as:
$$X = \text{real\_ton\_reserve} + \text{virtual\_ton\_reserve}$$
$$Y = \text{real\_token\_reserve} + \text{virtual\_token\_reserve}$$

- **Stored Parameters:**
  - $\text{virtual\_ton\_reserve} (V_{ton}) = 166,666,666,666 \text{ nanoTON} \approx 166.666666666 \text{ TON}$
  - $\text{virtual\_token\_reserve} (V_{token}) = \frac{V_{ton} \times S_{curve}}{T_{grad}} = 266,666,666,665,600,000 \text{ nano-units} \approx 266,666,666.6656 \text{ tokens}$
  - $\text{real\_ton\_reserve}_0 = 0$
  - $\text{real\_token\_reserve}_0 = 800,000,000 \times 10^9 \text{ nano-units} = 800,000,000 \text{ tokens}$ ($S_{curve}$)
- **Effective Genesis Reserves:**
  - **Initial Effective TON Reserve:** $X_0 = 0 + 166,666,666,666 \text{ nanoTON} = \mathbf{166.666666666 \text{ TON}}$
  - **Initial Effective Token Reserve:** $Y_0 = 800,000,000 \times 10^9 + 266,666,666,665,600,000 = \mathbf{1,066,666,666.6656 \text{ tokens}}$ ($1,066,666,666,665,600,000 \text{ nano-units}$)
  - **Initial Spot Price:** $P_0 = \frac{X_0 \times 10^9}{Y_0} = \mathbf{156 \text{ nanoTON/token}} = 0.00000015625 \text{ TON/token}$
  - **Invariant Constant:** $K = X_0 \times Y_0 \approx 1.777777777769 \times 10^{29} \text{ nanoTON} \cdot \text{nano-tokens} \approx 1.77777777777 \times 10^{11} \text{ TON} \cdot \text{tokens}$
- **Core Structural Distinction:** The effective initial token-side reserve is **the sum of the virtual token reserve and the real Curve inventory** ($Y_0 = V_{token} + S_{curve} \approx 1,066.67\text{M}$ tokens), **NOT** the virtual token reserve alone. The virtual token reserve alone ($266.67\text{M}$ tokens) represents the terminal asymptote when all $800\text{M}$ real tokens have been purchased.

#### 2. TON and Fee Accounting: Net vs. Gross Inflow
In `anlgram-bonding-curve.fc` (lines 604-605, 640-642):
- Each buy deducts a 1.00% protocol fee: $\text{fee\_ton} = \lfloor \frac{\text{gross\_ton\_in} \times 100}{10000} \rfloor$.
- The net TON applied to the curve is $\text{net\_ton} = \text{gross\_ton\_in} - \text{fee\_ton}$ (99% of gross).
- `real_ton_reserve` strictly accumulates `actual_net_ton`: `real_ton_reserve += actual_net_ton`.
- `accrued_protocol_fees` accumulates `actual_fee_ton` in a separate storage field: `accrued_protocol_fees += actual_fee_ton`. These fees are swept to the treasury via `op::sweep_protocol_fees` and are **never** migrated to the DEX.
- The graduation threshold check is `if (real_ton_reserve + actual_net_ton >= graduation_threshold_ton)`, where `graduation_threshold_ton = 500 TON`.
- Therefore, the curve reaches graduation after collecting **500.000000000 TON NET** into `real_ton_reserve`.
- The cumulative gross trading volume paid by users across all purchases is:
  $$\text{Gross TON} = \frac{500 \text{ TON}}{0.99} = \mathbf{505.050505051 \text{ TON}}$$
  yielding $\mathbf{5.050505051 \text{ TON}}$ in accrued treasury fees and exactly $\mathbf{500.000000000 \text{ TON NET}}$ entering the liquidity reserve.

#### 3. Amount of Tokens Sold at Graduation
Applying 500 TON net into the constant product invariant:
$$\text{tokens\_out} = \left\lfloor \frac{Y_0 \times \text{net\_ton}}{X_0 + \text{net\_ton}} \right\rfloor = \left\lfloor \frac{1,066,666,666,665,600,000 \times 500,000,000,000}{166,666,666,666 + 500,000,000,000} \right\rfloor = \mathbf{800,000,000,000,000,000 \text{ nano-units}}$$
This equals exactly $\mathbf{800,000,000.000000000 \text{ tokens}}$ (100.0000% of the bonding curve inventory).

#### 4. Remaining Real Token Inventory
- Real tokens sold: $800,000,000 \text{ tokens}$.
- Remaining real tokens: $800,000,000 - 800,000,000 = \mathbf{0 \text{ tokens}}$ ($0 \text{ nano-units}$).
- *Multi-trade Truncation Analysis:* In multi-trade integer truncation scenarios (e.g., 500 trades of 1 TON), the fractional division truncation leaves at most an infinitesimal dust of $1.57 \times 10^{-7} \text{ tokens}$ ($157 \text{ nano-units}$, or $\approx 0.00000000000002\%$). Any buy order reaching the threshold or capping inventory executes the cap branch (`if (tokens_out >= real_token_reserve) tokens_out = real_token_reserve;`), bringing remaining inventory to exactly 0.

#### 5. Final Effective Reserves
- Final effective TON reserve:
  $$X_{final} = X_0 + \text{real\_ton\_reserve} = 166,666,666,666 + 500,000,000,000 = \mathbf{666,666,666,666 \text{ nanoTON}} = \mathbf{666.666666666 \text{ TON}}$$
- Final effective Token reserve:
  $$Y_{final} = Y_0 - \text{tokens\_sold} = 1,066,666,666,665,600,000 - 800,000,000,000,000,000 = \mathbf{266,666,666,665,600,000 \text{ nano-units}} = \mathbf{266,666,666.6656 \text{ tokens}} = V_{token}$$

#### 6. Terminal Spot Price on Curve
- **Theoretical Continuous Price (Unrounded Decimal Quotient):**
  $$P_{terminal, unrounded} = \frac{X_{final} \times 10^9}{Y_{final}} = \frac{666,666,666,666 \times 10^9}{266,666,666,665,600,000} = \mathbf{2,500.0000000075 \text{ nanoTON/token}}$$
- **Contract & Getter Spot Price (After Integer nanoTON Rounding):**
  In TVM assembly and FunC (`anlgram-bonding-curve.fc`), price getters and transaction math evaluate using integer floor division:
  $$P_{terminal, integer} = \left\lfloor \frac{666,666,666,666 \times 10^9}{266,666,666,665,600,000} \right\rfloor = \left\lfloor 2,500.0000000075 \right\rfloor = \mathbf{2,500 \text{ nanoTON/token}} = \mathbf{0.0000025 \text{ TON/token}}$$

#### 7. Intended Opening Price of the STON.fi DEX Pool
At graduation, `anlgram-bonding-curve.fc` migrates `real_ton_reserve` ($500 \text{ TON}$) and `dex_tokens_escrow` ($200,000,000 \text{ tokens}$) to the STON.fi v2.2 pool:
$$P_{DEX} = \frac{500 \text{ TON} \times 10^9}{200,000,000 \text{ tokens}} = \frac{500,000,000,000}{200,000,000} = \mathbf{2,500 \text{ nanoTON/token}} = \mathbf{0.0000025 \text{ TON/token}}$$

#### 8. Price Discontinuity, Rounding Error, and Mathematical Distinction
- **Equality After Integer nanoTON Quote Rounding:**
  $$\lfloor P_{terminal} \rfloor - P_{DEX} = 2,500 - 2,500 = \mathbf{0 \text{ nanoTON/token}}$$
  Under the documented integer quote calculation (using TVM floor division), both the bonding curve spot price and the DEX opening pool rate evaluate to exactly **2,500 nanoTON/token** ($0.0000025 \text{ TON/token}$), yielding an exact integer match with 0 deviation.
- **Continuous Mathematical Precision (Pre-Rounding Real-Number Quotients):**
  Because $V_{ton}$ is quantized to integer nanoTON ($166,666,666,666 \text{ nanoTON}$, which truncates the periodic fraction $166 \frac{2}{3} \times 10^9$ by $\frac{2}{3} \text{ nanoTON}$) and $V_{token}$ is quantized to integer atomic units ($266,666,666,665,600,000$, which truncates $266 \frac{2}{3}\text{M} \times 10^9$ by $1,066,666$ atomic units), the underlying unrounded real-number quotients are not exactly equal:
  - **Unrounded Terminal Price:** $P_{terminal, unrounded} = \mathbf{2,500.0000000075 \text{ nanoTON/token}}$
  - **Absolute Difference:** $P_{terminal, unrounded} - P_{DEX} = \mathbf{0.0000000075 \text{ nanoTON/token}}$
  - **Relative Fractional Difference:** $\frac{0.0000000075}{2500} = \mathbf{3 \times 10^{-12}}$ ($3 \times 10^{-12}$ as a fraction)
  - **Relative Percentage Difference:** $\mathbf{3 \times 10^{-10}\%}$
  - **Relative Order of Magnitude:** $\mathbf{3 \text{ parts per trillion}}$
  This infinitesimal difference ($7.5 \times 10^{-9} \text{ nanoTON/token}$) is far below the single atomic base unit ($1 \text{ nanoTON}$) and is absorbed entirely by integer quote rounding. Both prices floor to 2,500 nanoTON/token. The approved tokenomics, reserve values, supply, fees, and contract behavior are strictly preserved without introducing ad-hoc decimals.
- **Remaining Inventory after Graduation:** $\mathbf{0 \text{ tokens}}$ ($0 \text{ nano-units}$).
- **Alignment with Frontend Calculator:** In `memecoin-platform.html`, `window.updateCurveQuotes` uses these exact parameters ($V_{TON} = 166.666666666$, $V_{TKN} = 266,666,666.6656$, $TOTAL\_CURVE = 800,000,000$, $K = 1.77777777777 \times 10^{11}$). For 1 TON gross input, it computes an output of `~6,298,568 TKN` after 1% fee, exactly matching FunC and TVM simulation results.
- **TVM Test Coverage:** Group 1 (`test-bonding-curve-math.js`) and Group 3 (`test-bonding-curve-tvm.js`) assert `terminalCurveSpot - initialDexSpot === 0n` and `gradCurve.realTokens === 0n`, confirming that price equality holds identically under blockchain integer execution.

---

## 5. Classification of Frontend Features: Real vs. Simulated

| Feature | Implementation File | Classification | Status & User Visibility |
| :--- | :--- | :---: | :--- |
| **Standard Jetton Creator** | `memecoin-platform.html`<br/>(`deployJettonWeb3`) | **REAL TRANSACTION** | Constructs authentic TEP-74 `init_jetton` StateInit and prompts TonConnect wallet for signature. Active in production. |
| **Liquid Staking Hub** | `staking.html`<br/>(`assets/js/staking.js`) | **REAL TRANSACTION** | Real on-chain non-custodial Tonstakers staking with 35 bps ANLGRAM escrow protocol. |
| **Supervised Launchpad Deployer** | `minter-contract/deploy-launchpad-testnet-exec.js` | **REAL TRANSACTION** (CLI) | 8-step deterministic DAG constructing single-message transactions for operator testnet confirmation. |
| **Bonding Curve Quote Calculator** | `memecoin-platform.html`<br/>(`window.updateCurveQuotes`) | **MATHEMATICAL SIMULATOR** | Pure client-side quote estimation. Clearly labeled as simulator; does not construct or broadcast transactions. |
| **ProfitLab Simulator** | `profit-calculator.html` | **FINANCIAL SIMULATOR** | Off-chain modeling tool for profit, break-even, and trading fees. |
| **Liquidity Pools Preview** | `memecoin-platform.html` | **DEMO PREVIEW** | Educational mock layout displayed only when explicitly toggled with a warning banner. Default view is truthful empty state. |
| **Launchpad Curve Buy / Sell** | `memecoin-platform.html` | **INCOMPLETE IN FRONTEND** | Real contract messages (`op::buy`, `transfer_notification`) exist in TVM FunC, but frontend trade execution buttons and quote-to-tx builders are **not yet built**. |
| **DEX Migration Trigger** | `anlgram-bonding-curve.fc` | **CONTRACT LEVEL ONLY** | Triggered only upon reaching 500 TON graduation target; no public end-user frontend button. |

---

## 6. External Operational Prerequisites for Launchpad Execution

The TVM bytecode, deterministic deployment DAG, and execution engine are mathematically verified, but actual broadcast of real testnet transactions is strictly **BLOCKED** pending the user's manual fulfillment of external operational infrastructure:

1. **Deploy Staging Manifest to Authorized Public HTTPS Origin:**
   - Configure public DNS record (A or CNAME) for `staging-launchpad.anlgram.io`.
   - Host `tonconnect-manifest.staging.json` at `https://staging-launchpad.anlgram.io/tonconnect-manifest.json` with headers:
     - `Content-Type: application/json; charset=utf-8`
     - `Access-Control-Allow-Origin: *`
   - Host icon at `https://staging-launchpad.anlgram.io/assets/images/icon-512.png`.
   - *Status:* `Resolve-DnsName` confirms domain currently has **NO DNS RECORDS**.

2. **Fund Operator Testnet Wallet:**
   - Supervised deployment sequence requires **0.71 TON** in execution gas.
   - Including storage reserves and the 0.50 TON DEX migration gas buffer, minimum required balance is **2.71 TON**.
   - **Recommended balance:** **3.50 TON** (obtainable via `@testgiver_ton_bot`).

3. **Supervised Human Transaction Confirmation:**
   - The CLI must be executed in supervised mode, generating single-message transactions for manual verification:
     ```bash
     node deploy-launchpad-testnet-exec.js --plan
     node deploy-launchpad-testnet-exec.js --execute-testnet --supervised-human-approved
     ```

---

## 7. Safe Production Publication Instructions

To prevent accidental release, worktree collisions, or unintended history alterations, follow these explicit instructions. Publication must only be carried out following human review and approval.

### 7.1 Identification of Repositories & Worktrees
- **Release Candidate Source Worktree:** `E:\anlgram-release-candidate`  
  - Current Checked-out Branch: `release/memelabs-production-candidate`  
  - Reviewed Code-Candidate Base: `f27a081ddf25765b511dd4b30c975c632a91b960` (`f27a081`)  
  - Lineage: Base commit `94b2255` -> Code remediations `5892668` -> Intermediate docs `1f4c475` -> Test reconciliation `f27a081` -> Final sign-off corrections
  - *Strict Isolation Rule:* Keep the existing release-candidate worktree and branch completely untouched. Never checkout `main`, merge, or push inside `E:\anlgram-release-candidate`.
- **Primary Repository Worktree:** `E:\ANLGRAM`  
  - Current Checked-out Branch: `feature/launchpad-engine` (contains uncommitted local development changes, including untracked documents and modified build outputs, ahead of `origin/feature/launchpad-engine` by 1 commit)  
  - Target Integration Branch: `main` (baseline at `94b2255` in Git repository database, not currently checked out in any worktree)  
  - *Integration Target:* Integration into `main` must take place in `E:\ANLGRAM` only after safely preserving all tracked and untracked local changes and verifying the working tree is completely clean.

### 7.2 Pre-Publication Checklist & Safe Working Tree Preservation
Before switching branches or performing any integration into `main`:

1. **Inspect Working Tree & Current Branch:**
   ```powershell
   cd E:\ANLGRAM
   git branch --show-current
   # Confirms: feature/launchpad-engine (NOT main)

   git status --short
   # Displays both tracked modifications (M) and untracked files (??)
   ```

2. **Preserve Tracked and Untracked Local Changes:**
   > [!IMPORTANT]
   > Standard `git stash push -m "..."` only captures tracked files, leaving untracked files (`??`) in the working tree. This risks cross-branch contamination or checkout collisions. You **must** include untracked files safely by passing `--include-untracked` (or `-u`):
   ```powershell
   git stash push --include-untracked -m "WIP feature/launchpad-engine before release publication"
   ```

3. **Verify Working Tree is 100% Clean:**
   ```powershell
   git status --short
   # Must return EMPTY output.
   # If any modified or untracked files remain, STOP and resolve before proceeding.
   ```

4. **Verify Stash Capture:**
   ```powershell
   git stash list -n 1
   # Confirms top stash contains the saved working state
   ```

### 7.3 Step-by-Step Publication Procedure (Explicit Human Sign-Off Required)

> [!CAUTION]
> **STRICT SAFETY & APPROVAL GATES:**
> - **Zero Destructive Commands:** Never run `git reset --hard`, `git push --force`, or `git push --force-with-lease`.
> - **Human Approval Gates:** Require explicit human approval before merging, pushing to origin, deploying to production hosting, or executing any blockchain transaction.
> - **Divergence Guard:** If `main` is no longer at the expected baseline (`94b2255`) or has diverged from `origin/main`, **STOP IMMEDIATELY**. Do not force-merge or pull. Require human investigation.

```powershell
# Step 1: In the primary repository worktree, switch to production main
cd E:\ANLGRAM
git checkout main

# Step 2: Fetch remote tracking references without modifying working directory
git fetch origin

# Step 3: Verify local main and remote tracking HEAD baseline status
git rev-parse HEAD
# Expected output: 94b225587c9b55535df1d02716641b166271171d (94b2255)

git rev-parse origin/main
# Expected output: 94b225587c9b55535df1d02716641b166271171d (94b2255)

git status --short --branch
# Must report: ## main...origin/main (up to date, working tree clean)
# IF NOT at 94b2255 or IF diverged from origin/main: STOP IMMEDIATELY and require human review.

# Step 4: Fast-forward merge the verified release candidate commit
# >>> REQUIRE EXPLICIT HUMAN APPROVAL BEFORE EXECUTING MERGE <<<
git merge release/memelabs-production-candidate --ff-only

# Step 5: Run immediate sanity regression checks on main
node test-anl-labs-regression.js
node test-wizard-comprehensive.js

# Step 6: Push to remote main
# >>> REQUIRE EXPLICIT HUMAN APPROVAL BEFORE PUSHING TO PRODUCTION <<<
git push origin main
```

### 7.4 Restoring Local Feature Development State
After publication is completed and verified, restore the feature development working state in `E:\ANLGRAM`:
```powershell
cd E:\ANLGRAM
git checkout feature/launchpad-engine
git stash pop
git status --short
# Confirms all tracked and untracked development work is fully restored
```

### 7.5 Post-Publication Verification
After pushing to production:
1. **HTTP 200 Verification:** Check that `https://anlgram.com/` returns HTTP 200.
2. **Manifest Verification:** Fetch `https://anlgram.com/tonconnect-manifest.json` and verify `iconUrl` points to `https://anlgram.com/assets/images/icon-192.png`.
3. **Homepage Display:** Confirm that line 608 displays `TBA — Contract Deployment Pending Supervised Launch` and demo metrics bear the simulation badge.
4. **Calculator Verification:** Confirm that `memecoin-platform.html` bonding curve calculator computes quotes on user input without JavaScript errors in developer console.

---

## 8. Safe Non-Destructive Rollback Procedure

> [!CAUTION]
> **UNSAFE PROCEDURES STRICTLY PROHIBITED:**  
> Never run `git reset --hard` or `git push origin main --force-with-lease` on production. These destructive commands overwrite remote branches, discard commit history, and can erase concurrent team work.

If a production defect is discovered following publication, execute an atomic, non-destructive rollback using standard `git revert`.

### 8.1 Pre-Rollback State Inspection
Before executing a revert:
1. Confirm current branch and worktree:
   ```powershell
   cd E:\ANLGRAM
   git branch --show-current
   # Must return: main
   ```
2. Confirm working tree cleanliness:
   ```powershell
   git status
   # Must report: "nothing to commit, working tree clean"
   ```
3. Identify the published commit or merge commit to revert:
   ```powershell
   git log -n 5 --oneline
   ```

### 8.2 Revert Execution Procedure

```powershell
# Scenario A: If published via fast-forward or direct commit sequence:
# Revert the published commit (or commits in reverse chronological order)
git revert <PUBLISHED_COMMIT_SHA> --no-edit

# Scenario B: If published via a merge commit:
# Revert the merge commit specifying parent 1 (main)
git revert -m 1 <MERGE_COMMIT_SHA> --no-edit

# Step 2: Validate that regression tests pass on the reverted state
node test-anl-labs-regression.js
node test-explorer-regression.js

# Step 3: Push the revert commit normally after human review
git push origin main
```

*Result:* The production baseline is cleanly restored, remote history is preserved linearly, and the release candidate remains intact on `release/memelabs-production-candidate` for further inspection in `E:\anlgram-release-candidate`.
