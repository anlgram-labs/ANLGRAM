# ANLGRAM Staking System — Threat Model & Security Invariants

**Repository**: [anlgram-labs/ANLGRAM](https://github.com/anlgram-labs/ANLGRAM)  
**Target Contracts**:
- `minter-contract/contracts/anlgram-stake-vault.fc` (Primary Isolated Vault)
- `minter-contract/contracts/anlgram-staking-router.fc` (Pooled Router Architecture)
**Document Classification**: Threat Modeling & Security Invariant Analysis  

---

## 1. System Security Invariants

The ANLGRAM staking contracts are engineered around six non-negotiable security invariants designed to protect depositor principal and guarantee predictable protocol execution on the TVM:

| Invariant ID | Name | Mathematical / Logical Expression | Enforcement Mechanism |
| :--- | :--- | :--- | :--- |
| **INV-1** | **Fund Isolation** | $\forall C_i, C_j \, (i \neq j): \text{Vault}(C_i) \cap \text{Vault}(C_j) = \emptyset$ | Ephemeral 1-vault-per-deposit architecture. Each deposit has its own contract address and dedicated tsTON Jetton Wallet. |
| **INV-2** | **Delivery Before Fee** | $\text{FeeReleased} \implies \text{tsTONCredited}(\text{ClientJW})$ | Two-phase escrow: `0xd53276db` from `client_jwallet_address` required before fee transfer is dispatched. |
| **INV-3** | **Bounce Impartiality** | $\text{PoolBounced}(0\text{x}47d54391) \implies \text{Refund} = \text{Principal} + \text{Fee}$ | Bounce handler returns 100% principal + 100% fee to client. Zero fee is retained on failed deposits. |
| **INV-4** | **Non-Custodial Administration** | $\forall \text{Opcode} \in \text{AdminOps}: \Delta \text{ClientFunds} = 0$ | No admin function, back-door, or privileged mode can drain or re-route user balances. |
| **INV-5** | **Replay & Cross-Chain Immunity** | $\text{DepositAccepted} \implies (\text{query\_id} > 0 \land \text{network\_id} \in \{-3, -239\})$ | Strict query_id tracking and on-chain check against expected network ID. |
| **INV-6** | **Contract Longevity** | $\text{Status} = \text{COMPLETED} \implies \text{ContractAlive}$ | No self-destruction (`SUICIDE` mode 128); vault remains active to route delayed tokens. |

---

## 2. Threat Vector Analysis & Mitigations

### 2.1 Threat Vector 1: Cross-Client Token Theft & Co-Mingling
- **Risk**: In a shared pooled router, if multiple users deposit simultaneously, an asynchronous transfer notification (`0x7362d09c`) might be mismatched, allowing one user to receive another user's minted tsTON tokens.
- **StakeVault Mitigation**: In `AnlgramStakeVault`, each deposit deploys an independent contract with its own Jetton Wallet. Cross-client co-mingling is mathematically impossible because the contract holds tokens for exactly one client.
- **Router Mitigation**: In `AnlgramStakingRouter`, incoming notifications are strictly indexed by 64-bit `query_id`. The contract asserts that `pending_deposits[query_id]` exists in `status::pending_pool` (0). Any notification with an unknown or zero `query_id` is aborted immediately with error 309, with zero FIFO fallback.

### 2.2 Threat Vector 2: Premature Fee Extraction
- **Risk**: The protocol collects the 0.35% fee before the user actually receives the staked tsTON tokens (e.g. if the pool fails to mint or the user's Jetton wallet bounces the transfer).
- **StakeVault Mitigation**:
  - The fee is held in escrow in `fee_nano` within the contract storage.
  - Phase 2a (`op::transfer_notification` from vault Jetton Wallet) dispatches `op::jetton_transfer` with `response_destination = my_address()`, but does **not** transfer the fee.
  - Phase 2b (`op::excesses` `0xd53276db`) must arrive from the client's verified Jetton Wallet (`client_jwallet_address`), confirming credit before line 384 sends the fee message.

### 2.3 Threat Vector 3: Pool Deposit Bounce / Upstream Rejection
- **Risk**: Tonstakers liquid pool is paused, halted, or rejects the deposit due to validation round transitions, locking client TON inside the intermediate contract.
- **StakeVault Mitigation**:
  - `recv_internal` checks `flags & 1` and calls `handle_bounce`.
  - Verifies `sender_address == pool_address` and `bounced_op == op::tonstakers_deposit()`.
  - Calculates `refund_amount = msg_value + fee_nano + const::jetton_transfer_gas()`.
  - Emits `op::vault_refunded()` (`0x414e4c74`) delivering 100% of the funds back to `client_address`.
  - Status updates to `STATUS_REFUNDED` (5).

### 2.4 Threat Vector 4: Gas Starvation / Out-of-Gas Failure
- **Risk**: A multi-hop asynchronous message sequence runs out of gas during compute or action phases, causing partial state execution.
- **StakeVault Mitigation**:
  - Attached gas breakdown for a 1 TON stake:
    - Principal: `1.0000 TON`
    - Fee (35 bps): `0.0035 TON`
    - Pool deposit gas: `1.0000 TON` (Tonstakers official requirement; unspent gas is refunded via `0xd53276db`)
    - Jetton transfer gas: `0.1050 TON` (approx. 2x TEP-74 minimum requirement)
    - Storage reserve: `0.0500 TON` (covers immutable storage rent)
    - Total required message value: `2.1585 TON`
  - In line 313, `throw_unless(error::insufficient_msg_value(), msg_value >= min_required)` guarantees execution solvency before forwarding messages.

### 2.5 Threat Vector 5: Replay & Front-Running Attacks
- **Risk**: An attacker intercepts a signed BoC and replays it on another network (e.g. Testnet transaction replayed on Mainnet), or front-runs a deployment with modified initial data.
- **StakeVault Mitigation**:
  - Every StakeVault deployment uses a unique `query_id` based on Unix millisecond timestamps combined with user address.
  - Initial data includes `network_id` (`-239` on Mainnet, `-3` on Testnet), verified on-chain via `throw_unless(error::wrong_network(), expected_network_id == network_id)`.
  - Deterministic address derivation ensures that altering any parameter changes the contract address, resulting in failed initialization.

### 2.6 Threat Vector 6: Privileged Admin Abuse
- **Risk**: Contract owner extracts escrowed funds, changes fee recipients to arbitrary addresses, or pauses withdrawals.
- **StakeVault Mitigation**:
  - `AnlgramStakeVault` has **zero admin roles, zero owner keys, and zero administrative opcodes**. It is completely autonomous and immutable upon deployment.
  - The fee recipient is verified against a hardcoded hash (`const::authorized_fee_recipient_hash()`).
- **Router Mitigation**:
  - `AnlgramStakingRouter` admin can only pause new deposits (`op::set_paused`) or configure the initial router Jetton wallet (`op::set_router_jwallet`). Admin has zero opcodes to withdraw TON or tsTON.

---

## 3. Residual Risks & Operational Considerations

1. **Upstream Protocol Risk**: ANLGRAM relies on the audited Tonstakers liquid pool contracts (`liquidTF`). Any systemic insolvency, smart contract exploit, or validator slashing event within Tonstakers directly affects tsTON exchange rates.
2. **Third-Party External Audit**: While formal verification and comprehensive TVM unit tests show 0 failures, an independent audit report from an accredited security firm remains a prerequisite for enterprise confidence.
3. **RPC & Network Congestion**: During heavy network load on TON, cross-shard routing delays can exceed standard polling timeouts (30-60 seconds). The contracts safely handle out-of-order execution, but UI polling must remain patient.
