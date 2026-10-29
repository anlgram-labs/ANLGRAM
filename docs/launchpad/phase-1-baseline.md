# ANLGRAM — Phase 1A Baseline & Production Safety Report

**Date of Record**: October 2026  
**Host**: `anlgram.com`  
**Classification**: Production Baseline & Safety Specification  
**Current Branch**: `feature/launchpad-engine`  
**Base Commit**: `94b225587c9b55535df1d02716641b166271171d`  
**Backup Branch**: `backup/pre-launchpad-phase1-2026-10-27` (`94b225587c9b55535df1d02716641b166271171d`)  
**Working-Tree Status**: Clean (no uncommitted changes, no untracked user files)

---

## 1. Repository State & Rollback Anchors

| Item | Value |
| :--- | :--- |
| **Commit SHA-1** | `94b225587c9b55535df1d02716641b166271171d` |
| **Commit Message** | `feat(labs): connect Meme Labs & TokenVerificationEngine to Cloudflare TonAPI Worker proxy` |
| **Active Development Branch** | `feature/launchpad-engine` (local only, not pushed to remote) |
| **Safe Rollback Branch** | `backup/pre-launchpad-phase1-2026-10-27` (local only, not pushed to remote) |
| **Production Branch** | `main` (completely untouched, protected) |
| **Remote Origin** | `https://github.com/anlgram-labs/ANLGRAM.git` |

---

## 2. Production Deployment Boundaries & GitHub Actions Verification

The repository contains two GitHub Actions workflow files in `.github/workflows/`:

### 2.1 Production Deployment Workflow: `.github/workflows/static.yml`
- **Deployment Target**: GitHub Pages serving `https://anlgram.com/` (configured via root `CNAME`).
- **Trigger Events**:
  - `push` strictly to branch `["main"]`.
  - `workflow_dispatch` (manual administrative execution via GitHub UI).
- **Triggers on `feature/*` or `backup/*` branches?**: **NO**. Pushes to `feature/launchpad-engine` cannot trigger deployment.
- **Triggers on Pull Requests?**: **NO**.
- **Action**: Runs on `ubuntu-latest`, uploads the repository root directory (`.`) as static artifact, and publishes to GitHub Pages via `actions/deploy-pages@v4`.

### 2.2 Continuous Integration Workflow: `.github/workflows/jekyll-docker.yml`
- **Trigger Events**: `push` to `main`, `pull_request` targeting `main`.
- **Action**: Runs Jekyll build check inside container (`jekyll/builder:latest`). Does **NOT** deploy.

### 2.3 Deployment Safety Policy
- `feature/launchpad-engine` and `backup/pre-launchpad-phase1-2026-10-27` are maintained **strictly local** during Phase 1A.
- No push to remote origin has been performed or will be performed during Phase 1A.

---

## 3. Production File Fingerprints (Cryptographic Baseline)

Below is the cryptographic inventory of all 20 production-critical files, calculated from the working tree at commit `94b2255`:

| File Path | Status | Git Object Hash | SHA-256 Digest |
| :--- | :--- | :--- | :--- |
| `memecoin-platform.html` | Tracked, Clean | `e5f8cb2381b31e3bb479d426907f3bf02a4b7163` | `b2484cd30f8c7c0ca5c01887ad505794f6e322c681b51b943b785ac6d168d3da` |
| `assets/js/launchpad.js` | Tracked, Clean | `e1206ed5093eb38c6e852249b1dcdcf93fada767` | `5a055e52a15de2b33230f66ded3cb381180251f74729e47a77b202f1aeed6a71` |
| `assets/js/wallet-connect.js` | Tracked, Clean | `f778d74d825848411f12c7b03e62f560171183a9` | `6396b10484412f45cdb8d185bcc8b2bd326622f5de416f1db69f6edb3d355138` |
| `assets/js/api.js` | Tracked, Clean | `973c1a2872a1de991b4ec86abd0c99b3b137ea81` | `236597aa3aa21fc01a05900ed99ca30df60a724e7e6bddac79fb16060e1479bb` |
| `assets/js/token-verification-engine.js` | Tracked, Clean | `1afc4a5fed315d2dc7f729b8b4e91cd099292686` | `52bcf89777bf363ecf087ed663d19c8ed1569851028f16247f9157fcb3855745` |
| `assets/js/security.js` | Tracked, Clean | `cac62f59757b1f4e944b6a9643d0c498f3d29134` | `727065a182c0d1d222b28d134363f7eadaefde4ffb4f8a02580d9a7e20610994` |
| `cloudflare-worker/worker.js` | Tracked, Clean | `0b9f17d1a13e4b964f47446f920207f698625003` | `cc6453aa24ec13b8ef7100ef7f1218826a85f160b07d4bebbbf9c4a1760c1598` |
| `minter-contract/contracts/jetton-minter.fc` | Tracked, Clean | `f76c96fd0f6978d5ee473df31357301dcb59603c` | `8f89000026b5209169cdc165ea3a6f7c339a429e1ec1062e2c29e2cba837fc22` |
| `minter-contract/contracts/jetton-wallet.fc` | Tracked, Clean | `127cabfec959f775ddd0180be7f29ad2ea4c04a6` | `026e6dad16265201989aa0a63c023297b6e317f2fd147e3764a28c87d2c8d615` |
| `src/config/pinned-contract-artifacts.json` | Tracked, Clean | `fd3a703816d810292250210f7620e4399c0b0f52` | `98eae0c0d69fc52f4a2dcace6c04e340a6be6cc52fcbf94b5415a18c0c79da65` |
| `assets/js/anl-labs.js` | Tracked, Clean | `6078cbdefa4b60bf04aed42c873fbb719eed168d` | `92f9e4c014f496626d55edd1330bee737b1d94d9383e1e9e40720e09379975a4` |
| `assets/js/platform.js` | Tracked, Clean | `5c82abb14bf50aecd4b692cd0340ead03726a9d2` | `72d0d4c1b2cf6d18061012cef4568a6acdd3b5214a8b9ac40e3f9c4fe134fd13` |
| `assets/js/staking.js` | Tracked, Clean | `7721f52fee9a0966561b0f7a4670bd74d245d191` | `7338d1ffa391a472118c775d5b372612b7439fb23b6dec368acfce1fcdd854d7` |
| `minter-contract/contracts/anlgram-factory.fc` | Tracked, Clean | `9c98727f03170b2568ce8e4855bcc6c69f49c611` | `e1fcf8f2027ad6bc59e05e388970711f39d871932ed23c93def92af934b289a5` |
| `minter-contract/contracts/anlgram-stake-vault.fc` | Tracked, Clean | `483d0d12667ed138652e84063eaf2078c406587d` | `053997f2d3708c5a6f7fe9c40c7f51a64fa7f74391c6a4c6f40ac8886c37b635` |
| `minter-contract/contracts/anlgram-staking-router.fc` | Tracked, Clean | `31b1ed41eda0c2d9f6c505e639e2a6ae47454d37` | `532c024f0df68b2f918d31bba998aa428df27430d34a7781f2c7f68dd1814d82` |
| `minter-contract/contracts/anlgram-vesting-wallet.fc` | Tracked, Clean | `1e7411febc7bddfd16e72ba2f95ec14fe830c100` | `be719884ff6bef168c3a728164cc8f491f9a55181d0ad5bc5fec08cc389f246b` |
| `CNAME` | Tracked, Clean | `728513841cf7dc53a54df70d8f7eae53a5f53173` | `fde1da6864c252fe3488ad69b0a1e28f41ce1c68f66fd07a82401963ec15ed70` |
| `tonconnect-manifest.json` | Tracked, Clean | `efc6d3c17bae8565d17f9bb4782d2f73bba8f86c` | `db559a9ee940f7476b8d119c2b9f40be3ec467fb14e4814f6ff415aa752be403` |
| `.github/workflows/static.yml` | Tracked, Clean | `1611d3cc1765b923c48113b1ec3eabe21ac79833` | `75d4ce2b45ce88d0c14b4e8a846859cbdc57084a30eae2932d161986d325be95` |

---

## 4. Existing Architecture & Toolchain Analysis

### 4.1 Frontend Architecture
- **Runtime**: Vanilla ECMAScript (ES6+) with browser-native DOM and Web Workers.
- **Web3 Libraries**:
  - `@ton/core` loaded in browser via ESM CDN (`https://esm.sh/@ton/core`).
  - `@tonconnect/ui` loaded via CDN (`https://unpkg.com/@tonconnect/ui@2.0.8/dist/tonconnect-ui.min.js`).
- **No Bundler**: There is no Webpack, Vite, Parcel, or Rollup configuration in the root directory. Files in `assets/js/` are loaded directly by `<script>` tags in HTML.
- **Frontend Build Pipeline**: **NONE**. The frontend is 100% static assets served as-is.

### 4.2 TypeScript Toolchain Boundary
- **TypeScript Location**: Exists exclusively inside `minter-contract/` (`tsconfig.json`, `minter-contract/node_modules/typescript`).
- **Usage**: Used strictly for compiling FunC smart contracts (`compile-factory.js`, `build/_build.ts`) and executing backend tests via `ts-node`.
- **Finding regarding `src/config/network-config.ts`**: The frontend cannot consume `.ts` files directly. Introducing a `.ts` file into the frontend would require adding a bundler (Vite/Webpack) or TypeScript compiler, altering the production hosting model. Therefore, any central network configuration must be written in **standard JavaScript (`.js`)** or UMD module format to preserve the zero-build static architecture.

### 4.3 Smart Contract Toolchain
- **Language**: FunC (`>=0.2.0`).
- **Compiler**: In-Node compiler `@ton-community/func-js` (`0.11.0`) inside `minter-contract/`. No external `fift` or `func` binaries required.
- **Artifacts**: Compiled to JSON BOC files in `minter-contract/build/*.compiled.json`.
- **Bytecode Registry**: Canonical TEP-74 minter & wallet bytecode hashes are pinned in `src/config/pinned-contract-artifacts.json`.

---

## 5. Existing Configuration Locations & Environment Variables

| Component | Configuration Location | Environment Variables / Secrets | Secret Exposure Status |
| :--- | :--- | :--- | :--- |
| **Cloudflare Worker** | `cloudflare-worker/wrangler.toml` | `env.TONAPI_KEY` (injected via `wrangler secret put TONAPI_KEY`) | **Zero Exposure**: Held securely in Cloudflare V8 environment; stripped from outgoing responses. |
| **Local Proxy / Dev Server** | `server.js` | `process.env.TONAPI_KEY` (optional for local rate bypass) | **Zero Exposure**: Server-side Node.js memory only. |
| **Testnet Contract Deployer** | `minter-contract/.env.testnet` | `TESTNET_DEPLOYER_MNEMONIC` (used for testnet test deployment) | **Zero Exposure**: Local file, gitignored via `.gitignore`. |
| **TON Connect** | `tonconnect-manifest.json` | None (public dApp metadata: name, icon, URL) | Public |
| **Frontend Network Selection** | `localStorage('anlgram_wallet_network')` | None (reads `'mainnet'` or `'testnet'`) | Public |
| **Treasury Address** | `assets/js/launchpad.js` line 26 | `UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd` | Public on-chain address |

---

## 6. Baseline Test Execution Results

Only safe, local test suites were executed. No transactions were broadcast to any network.

| Test Suite Script | Focus Area | Execution Command | Result | Tests Passed | Tests Failed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `test-master-security-audit.js` | Canonical Bytecode, TVM Opcodes, BigInt Units | `node test-master-security-audit.js` | **PASS** | 51 | 0 |
| `test-worker-deep-audit.js` | Cloudflare Edge Worker Whitelist, SSRF, TVM Allowlist | `node test-worker-deep-audit.js` | **PASS** | 22 | 0 |
| `test-anl-labs-regression.js` | ANL Labs UI, Step 1–6 Structure, Breakpoints | `node test-anl-labs-regression.js` | **PASS** | 33 | 0 |
| `test-onchain-security-and-burn.js` | Token Verification Engine, TEP-74 Burn, Renounce Flow | `node test-onchain-security-and-burn.js` | **PASS** | 33 | 0 |
| `test-staking-comprehensive.js` | Staking Router TVM Escrow, Bounces, Fee Math | `node test-staking-comprehensive.js` | **PASS** | 103 | 0 |
| `test-step4-vesting-comprehensive.js` | Step 4 Linear Vesting Schedule, Invariants | `node test-step4-vesting-comprehensive.js` | **PASS** | 50 | 0 |
| `test-explorer-regression.js` | Explorer Markup, DOM IDs, Handlers | `node test-explorer-regression.js` | **PASS** | 93 | 0 |
| `test-intel-exchange-regression.js` | Intel Exchange Markup, Asset Registry | `node test-intel-exchange-regression.js` | **PASS** | 73 | 0 |
| `test-profit-calculator-regression.js` | ProfitLab Formulas, Multipliers, Break-Even | `node test-profit-calculator-regression.js` | **PASS** | 65 | 0 |
| `test-distribution-wizard-flow.js` | Step 3 Batch Distribution Lifecycle & Guards | `node test-distribution-wizard-flow.js` | **PASS** | 21 | 0 |
| **TOTAL** | — | — | **100% PASS** | **544** | **0** |

### Tests Not Executed in Phase 1A (With Justification)
- `minter-contract/test-stake-vault-live-testnet.js`: Interacts with live TON testnet RPC and sends testnet TON. Excluded to comply with Phase 1A zero-broadcast restriction.
- `audit-real-wallet.js`: Queries live mainnet wallets; gitignored and excluded from offline baseline.
- `minter-contract/test/jetton.spec.ts`: Incurs `fetch failed` error due to legacy `ton-contract-executor` 0.5.0 attempting to download remote wasm runner; superseded by pure-TVM tests in root.

---

## 7. Protection of Current Direct Token Deployment Flow

The direct token deployment flow via `deployJettonWeb3` in `memecoin-platform.html` lines 1865–2066 has been verified to be completely intact:
- SHA-256 fingerprint matches original production code.
- Uses canonical pinned minter bytecode (`9a0f98dd...`).
- Zero changes to TON Connect integration.
- Direct deployment remains the authoritative, functional token-creation mechanism.

---

## 8. Rollback Verification

If any unexpected condition arises in subsequent phases:
1. Active branch `feature/launchpad-engine` can be discarded without affecting production.
2. `backup/pre-launchpad-phase1-2026-10-27` provides an immutable local snapshot of commit `94b2255`.
3. `main` branch remains clean, unmodified, and synchronized with `origin/main`.

**END OF BASELINE SPECIFICATION**
