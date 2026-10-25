# ANLGRAM Staking System — Contract Deployments & Address Registry

**Repository**: [anlgram-labs/ANLGRAM](https://github.com/anlgram-labs/ANLGRAM)  
**Date of Record**: October 2026  
**Document Classification**: Deployment & Address Traceability Registry  

---

## 1. Network & Address Registry

### 1.1 TON Mainnet (`Chain ID: -239`)

| Contract / Entity | Friendly Address (Bounceable / Non-Bounceable) | Raw Hex Address (Workchain:Hash) | Status / Role | Evidence Source |
| :--- | :--- | :--- | :--- | :--- |
| **Tonstakers Official Liquid Pool** | `EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR` | `0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa` | Active Production Pool | Verified upstream contract on TON Mainnet. Referenced in `assets/js/staking.js` (line 108). |
| **tsTON Jetton Master (NEP-74)** | `EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav` | `0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000` | Active Production Master | Official Tonstakers liquid token master. Referenced in `assets/js/staking.js` (line 119). |
| **ANLGRAM Fee Recipient Wallet** | `UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd` | `0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d` | Platform Fee Destination | Hardcoded in `anlgram-stake-vault.fc` (`const::authorized_fee_recipient_hash()`), `anlgram-staking-router.fc`, and `staking.js`. |
| **AnlgramStakeVault Contract** | Deterministic address calculated per deposit | `0:<stateInitHash>` | Ephemeral / Active | Bytecode hash `e69f7d22756c31ef01965ac197e3c561c77ab25d496795f0d4fdc9f2502daccf`. Generated dynamically per deposit in `assets/js/staking.js`. |
| **AnlgramStakingRouter Contract** | `null` | `null` | Not Deployed on Mainnet | Explicitly set to `ROUTER_ADDRESS_MAINNET: null` in `assets/js/staking.js` (line 68). |

---

### 1.2 TON Testnet (`Chain ID: -3`)

| Contract / Entity | Friendly Address | Raw Hex Address (Workchain:Hash) | Status / Role | Evidence Source |
| :--- | :--- | :--- | :--- | :--- |
| **Tonstakers Testnet Liquid Pool** | `kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3` | `0:0d16c632627f86499e286a350999ba03511654fae74c1dff49c733b8bd833f84` | Active Testnet Pool | Official Tonstakers testnet contract. Verified active on `testnet.tonapi.io`. |
| **tsTON Testnet Master** | `kQAiQ2XK7BXePLwemeo-u4wNyjg-wxGeySmaFGEP7R2Mhf4m` | `0:224365caec15de3cbc1e99ea3ebb8c0dca383ec3119ec9299a14610fed1d8c85` | Active Testnet Master | Official Tonstakers testnet token master. |
| **AnlgramStakingRouter (Testnet)** | `kQDd9FJmHX6-A2T1XsF4oSS04KFq_13gQyKco_ZYwmuDIREK` | `0:ddf452661d7ebe0364f55ec178a124b4e0a16aff5de043229ca3f658c26b8321` | Deployed Testnet Router | Deployed via `minter-contract/deploy-staking-router-testnet.js`. Documented in `minter-contract/build/anlgram-staking-router.testnet-manifest.json`. |
| **Router tsTON Jetton Wallet** | `kQCulIZF_pX3SEaTp4QobY9oMkVlt-imEIexJV7eak8CxY6G` | `0:ae948645fe95f7484693a784286d8f68324565b7e8a61087b1255ede6a4f02c5` | Configured on Router | Configured via `op::set_router_jwallet` (`0x414e4c60`). |
| **Testnet Deployer Wallet** | `0QCnFkBtq26Gocq6ZkpG_DNdTBeWxBVbl5lETMok8D18uzEE` | `0:a716406dab6e86a1caba664a46fc335d4c1796c4155b9799444cca24f03d7cbb` | Testnet Deployer | Recorded in deployment manifest. |

---

## 2. Distinction: Source Code Facts vs. Owner Claims vs. Unverified Items

In accordance with strict verification and audit standards, this section clearly separates **facts established by source code evidence**, **claims reported by the project owner**, and **unverified items**:

### 2.1 Facts Established by Source Code Inspection
1. **Mathematical Precision**: The fee calculation is explicitly $35\text{ bps}$ ($0.35\%$), coded as `muldiv(principal_nano, 35, 10000)` in both FunC contracts and BigInt JavaScript.
2. **Hardened Fee Destination**: The address hash `0xd6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d` is embedded directly into the compiled bytecode of `anlgram-stake-vault.fc` and verified before any fee is released.
3. **Escrow Guarantee**: In `anlgram-stake-vault.fc`, `fee_nano` is held in storage until `op::excesses` (`0xd53276db`) arrives from `client_jwallet_address`.
4. **Bounce Handling**: If the pool bounces (`0x47d54391`), `handle_bounce` refunds `msg_value + fee_nano + jetton_gas` back to `client_address`.
5. **Mainnet Router Null**: The router address for Mainnet is intentionally configured as `null` in `assets/js/staking.js` line 68.
6. **Bytecode Identity**:
   - `AnlgramStakeVault` code cell SHA-256 is `e69f7d22756c31ef01965ac197e3c561c77ab25d496795f0d4fdc9f2502daccf`.
   - `AnlgramStakingRouter` code cell SHA-256 is `1d21bbaebf3601577c4dc1dd2e8296d691edcec13d6c38fb26d5b8b884f5af6a`.

### 2.2 Claims Reported by Project Owner
1. **Real-Fund Production Tests**: The owner reports having successfully executed end-to-end deposits and withdrawals with real TON funds on the live production environment.
2. **Fee Collection Confirmation**: The owner reports that the 0.35% ANLGRAM platform fee was charged, collected, and delivered to the fee recipient wallet during these real-fund tests.
3. **Transaction History Tracking**: The owner reports that wallet transaction history correctly captured and displayed the completed actions.

### 2.3 Items Unverified by Code Repository Alone
1. **Historical Mainnet Transaction Hashes**: Specific transaction hashes from the owner's manual real-fund testing are stored on the TON blockchain and user wallet history, but are not hardcoded in the git repository files.
2. **Third-Party Security Certification**: Neither `AnlgramStakeVault` nor `AnlgramStakingRouter` has completed an accredited third-party security certification (e.g., CertiK, SlowMist).
3. **High-Concurrency Mainnet Volume**: While local TVM tests prove concurrency across multiple simulated accounts, real-world multi-validator shard delays during peak network load remain subject to live network conditions.
