# ANLGRAM Staking System — Test Reproduction & Verification Guide

**Repository**: [anlgram-labs/ANLGRAM](https://github.com/anlgram-labs/ANLGRAM)  
**Document Classification**: Non-Destructive Test Suite Reproduction  

---

## 1. Safety Policy & Prohibited Commands

> [!CAUTION]
> **STRICT SAFETY POLICY**:
> - **NEVER** run `node minter-contract/deploy-staking-router-testnet.js` or `node minter-contract/test-stake-vault-live-testnet.js` during standard auditing or verification. These scripts connect to external endpoints and interact with testnet wallets.
> - **NEVER** run commands targeting TON Mainnet wallets or contracts.
> - The test suites detailed below (`test-stake-vault-comprehensive.js` and `test-staking-comprehensive.js`) are **100% SAFE and NON-DESTRUCTIVE**: they execute in-memory using the TVM WebAssembly emulator (`ton-contract-executor`) and perform zero network state-changing operations.

---

## 2. Test Suite Overview

| Test Suite Script | Framework / Runtime | Test Count | Scope of Verification |
| :--- | :--- | :--- | :--- |
| **`test-stake-vault-comprehensive.js`** | Node.js + `ton-contract-executor` | **72 tests** | In-memory TVM execution of `anlgram-stake-vault.fc`: StateInit generation, 35 bps fee calculation, 2-phase delivery flow, bounce refund (100% principal + fee), multi-client isolation, and unauthorized caller rejection. |
| **`test-staking-comprehensive.js`** | Node.js + `ton-contract-executor` | **103 tests** | In-memory TVM execution of `anlgram-staking-router.fc`: Phase 1 escrow, Phase 2 confirmation, pool bounce refund, multi-client concurrent accounting (Client A 10 TON, Client B 20 TON, Client C 50 TON), anti-spoofing, anti-extraction, and frontend static assertion. |

---

## 3. Environment Prerequisites

Ensure Node.js (version 18, 20, or 22) and project dependencies are present:

```powershell
# Verify Node.js version
node -v

# Verify local dependencies in minter-contract
cd minter-contract
npm list ton ton-contract-executor @ton-community/func-js
cd ..
```

---

## 4. Test Execution Instructions

### 4.1 Running the Isolated StakeVault Test Suite (72 Tests)

This suite validates the 1-vault-per-deposit architecture implemented in `minter-contract/contracts/anlgram-stake-vault.fc`.

```powershell
node test-stake-vault-comprehensive.js
```

#### What It Tests:
1. **Fee Calculation**: Tests 1 TON, 10 TON, 100 TON, and 1,000 TON principal inputs against `muldiv(p, 35, 10000)` ensuring exact nanoTON accuracy.
2. **StateInit Deployment**: Validates 5-bit StateInit cell construction and deterministic hash derivation.
3. **Phase 1 (Initialization)**: Verifies `op::vault_init` (0x414e4c70) sets `STATUS_PENDING_POOL` (1) and emits `op::tonstakers_deposit` (0x47d54391) with 1.00 TON gas.
4. **Phase 2a (Mint Notification)**: Verifies `op::transfer_notification` (0x7362d09c) triggers `op::jetton_transfer` (0x0f8a7ea5) to the client.
5. **Phase 2b (Excess Receipt)**: Verifies `op::excesses` (0xd53276db) from `client_jwallet_address` confirms receipt and releases the 0.35% fee to `fee_recipient`.
6. **Pool Bounce Refund**: Simulates Tonstakers pool rejection; verifies 100% of principal + fee is returned to the client (0 fee charged).
7. **Multi-Client Isolation**: Executes concurrent vaults for Client A, Client B, and Client C, proving distinct contract addresses, independent storage, and zero cross-client token co-mingling.

---

### 4.2 Running the Staking Module & Router Test Suite (103 Tests)

This suite validates the multi-client accounting, TVM routing, and frontend integration.

```powershell
node test-staking-comprehensive.js
```

#### What It Tests:
1. **Router State & Dictionaries**: Verifies binary trees and hash dictionaries (`udict_set_builder`, `udict_get?`) for pending, completed, and refunded deposits.
2. **Multi-Client Concurrency**: Tests interleaved asynchronous messages where Client C's notification arrives before Client A's, proving zero FIFO corruption.
3. **Anti-Extraction Attacks**: Proves that Client B cannot claim or divert Client A's tokens via retry opcodes.
4. **Non-Custodial Enforcement**: Confirms that admin accounts cannot invoke unauthorized withdrawal opcodes (rejection with exit code 399).
5. **Frontend Parameter Verification**: Asserts that `assets/js/staking.js` and `staking.html` enforce terms acceptance, chain ID matching, and accurate fee disclosure.

---

## 5. Non-Destructive Static Compilation Verification

To verify that the FunC source code compiles identically to the committed bytecode artifacts **without modifying any files**, the existing compile scripts can be run:

```powershell
# Compile anlgram-stake-vault.fc and verify hash matches e69f7d22756c31ef...
node minter-contract/compile-stake-vault.js

# Compile anlgram-staking-router.fc and verify hash matches 1d21bbaebf360157...
node minter-contract/compile-staking-router.js
```

Both scripts use `@ton-community/func-js` to compile the contracts and output the SHA-256 hash of the generated code cell.
