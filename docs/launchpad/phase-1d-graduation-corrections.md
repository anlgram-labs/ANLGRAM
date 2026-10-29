# ANLGRAM — PHASE 1D SPECIFICATION & ARCHITECTURAL REVIEW
**Graduation Price Continuity, Residual Inventory Accounting, and Renounce Verification**

> **Document Status**: Production-Isolated Mathematical & Architecture Correction  
> **Target Branch**: `feature/launchpad-engine`  
> **Baseline Commit**: `94b225587c9b55535df1d02716641b166271171d`  
> **Prior Review Commit**: `d7cbd3961c12fdd990130ad45637abbd9a8af98b`  
> **Scope**: Local mathematical model, offline tests, and architecture specification ONLY. Zero contract deployment, zero network broadcasting, zero modifications to production HTML/JS.

---

## 1. THE GRADUATION PRICE DISCREPANCY IN PHASE 1B/1C

In the provisional model presented in Phase 1B/1C, the parameters were:
- Curve Token Allocation ($S_{\text{curve}}$): $800,000,000$ tokens ($800\text{M}$)
- DEX Graduation Token Allocation ($S_{\text{DEX}}$): $200,000,000$ tokens ($200\text{M}$)
- Target Real TON Reserve ($T_{\text{grad}}$): $500\text{ TON}$
- Virtual TON Reserve ($v_{\text{TON}}$): $30\text{ TON}$ (provisional baseline)
- Virtual Token Reserve ($v_{\text{TOK}}$): Derived via sellout condition as $\lfloor \frac{30 \cdot 800\text{M}}{500} \rfloor = 48,000,000$ tokens ($48\text{M}$)

### The Mathematical Price Discrepancy
At the graduation point on the bonding curve ($x_{\text{real}} = 500\text{ TON}$, $y_{\text{real}} = 0\text{ tokens}$):
- Effective TON: $X_{\text{grad}} = 500 + 30 = 530\text{ TON}$
- Effective Tokens: $Y_{\text{grad}} = 0 + 48\text{M} = 48,000,000\text{ tokens}$
- **Terminal Marginal Curve Spot Price**:
  $$P_{\text{curve\_terminal}} = \frac{X_{\text{grad}}}{Y_{\text{grad}}} = \frac{530\text{ TON}}{48,000,000\text{ tokens}} \approx 1.104166667 \times 10^{-5}\text{ TON/token} \quad (11,041.67\text{ nanoTON})$$

Now consider the initial DEX pool created with the collected real reserve of $500\text{ TON}$ and the $200,000,000$ graduation tokens:
- **Initial DEX Pool Spot Price**:
  $$P_{\text{DEX\_initial}} = \frac{500\text{ TON}}{200,000,000\text{ tokens}} = 2.500000 \times 10^{-6}\text{ TON/token} \quad (2,500.00\text{ nanoTON})$$

### Discrepancy Ratio:
$$\frac{P_{\text{curve\_terminal}}}{P_{\text{DEX\_initial}}} = \frac{1.104166667 \times 10^{-5}}{2.500000 \times 10^{-6}} = 4.41666667 \quad (\mathbf{441.67\%})$$

> [!WARNING]
> **Severe Price Cliff**: Under the Phase 1B/1C parameters, the terminal curve price was **4.4167 times higher** than the initial DEX pool opening price. The instant migration occurred, the token price on the DEX would open at an immediate **77.35% discount** relative to the price paid by final curve buyers. This would induce immediate panic selling and severe loss of user funds.

---

## 2. DERIVATION OF PRICE-CONTINUITY VIRTUAL RESERVES

To ensure **100% price continuity** between the terminal curve state and the opening DEX pool, we establish a simultaneous two-equation system.

### The Two Fundamental Constraints
Let:
- $S_{\text{curve}} = 800,000,000$ tokens ($800\text{M}$)
- $S_{\text{DEX}} = 200,000,000$ tokens ($200\text{M}$)
- $T_{\text{grad}} = 500\text{ TON}$

1. **Constraint 1 (Sellout Invariant)**: The curve must exhaust exactly $S_{\text{curve}}$ tokens when $x_{\text{real}}$ reaches $T_{\text{grad}}$:
   $$(v_{\text{TON}}) \cdot (S_{\text{curve}} + v_{\text{TOK}}) = (T_{\text{grad}} + v_{\text{TON}}) \cdot (v_{\text{TOK}})$$
   $$v_{\text{TON}} \cdot S_{\text{curve}} = T_{\text{grad}} \cdot v_{\text{TOK}} \implies \mathbf{v_{\text{TOK}} = \frac{v_{\text{TON}} \cdot S_{\text{curve}}}{T_{\text{grad}}}} \quad \text{--- (Eq. 1)}$$

2. **Constraint 2 (Price Continuity)**: The terminal marginal curve spot price must equal the opening DEX pool spot price:
   $$\frac{T_{\text{grad}} + v_{\text{TON}}}{v_{\text{TOK}}} = \frac{T_{\text{grad}}}{S_{\text{DEX}}} \quad \text{--- (Eq. 2)}$$

### Algebraic Solution
Substitute Eq. 1 into Eq. 2:
$$\frac{T_{\text{grad}} + v_{\text{TON}}}{\frac{v_{\text{TON}} \cdot S_{\text{curve}}}{T_{\text{grad}}}} = \frac{T_{\text{grad}}}{S_{\text{DEX}}}$$
Simplify:
$$\frac{T_{\text{grad}} \cdot (T_{\text{grad}} + v_{\text{TON}})}{v_{\text{TON}} \cdot S_{\text{curve}}} = \frac{T_{\text{grad}}}{S_{\text{DEX}}}$$
Divide both sides by $T_{\text{grad}}$:
$$\frac{T_{\text{grad}} + v_{\text{TON}}}{v_{\text{TON}} \cdot S_{\text{curve}}} = \frac{1}{S_{\text{DEX}}}$$
Cross-multiply:
$$S_{\text{DEX}} \cdot (T_{\text{grad}} + v_{\text{TON}}) = S_{\text{curve}} \cdot v_{\text{TON}}$$
$$S_{\text{DEX}} \cdot T_{\text{grad}} + S_{\text{DEX}} \cdot v_{\text{TON}} = S_{\text{curve}} \cdot v_{\text{TON}}$$
$$S_{\text{DEX}} \cdot T_{\text{grad}} = (S_{\text{curve}} - S_{\text{DEX}}) \cdot v_{\text{TON}}$$
$$\mathbf{v_{\text{TON}} = \frac{S_{\text{DEX}} \cdot T_{\text{grad}}}{S_{\text{curve}} - S_{\text{DEX}}}} \quad \text{--- (Analytical Solution)}$$

### Numerical Evaluation (Exact Fractions)
Substituting the target values:
$$S_{\text{curve}} - S_{\text{DEX}} = 800\text{M} - 200\text{M} = 600\text{M}$$
$$v_{\text{TON}} = \frac{200\text{M} \cdot 500\text{ TON}}{600\text{M}} = \frac{1}{3} \cdot 500\text{ TON} = \mathbf{\frac{500}{3}\text{ TON} \approx 166.666666667\text{ TON}}$$

Now compute $v_{\text{TOK}}$ using Eq. 1:
$$v_{\text{TOK}} = \frac{\left(\frac{500}{3}\right) \cdot 800\text{M}}{500} = \mathbf{\frac{800\text{M}}{3}\text{ tokens} \approx 266,666,666.667\text{ tokens}}$$

---

## 3. INTEGER-ONLY BASE-UNIT ARITHMETIC & ROUNDING PROOF

In TON smart contracts and BigInt off-chain engines, floating-point numbers do not exist. We compute in base atomic units:
- $1\text{ TON} = 10^9\text{ nanoTON}$
- $1\text{ Token} = 10^9\text{ base atomic units}$ (9 decimals)
- $T_{\text{grad}} = 500 \cdot 10^9 = 500,000,000,000\text{ nanoTON}$
- $S_{\text{curve}} = 800,000,000 \cdot 10^9 = 800,000,000,000,000,000\text{ units}$
- $S_{\text{DEX}} = 200,000,000 \cdot 10^9 = 200,000,000,000,000,000\text{ units}$

### Integer Division & Remainder Analysis
1. **Virtual TON Reserve**:
   $$v_{\text{TON\_base}} = \left\lfloor \frac{S_{\text{DEX}} \cdot T_{\text{grad}}}{S_{\text{curve}} - S_{\text{DEX}}} \right\rfloor = \left\lfloor \frac{200\text{M} \cdot 10^9 \cdot 500 \cdot 10^9}{600\text{M} \cdot 10^9} \right\rfloor = \mathbf{166,666,666,666\text{ nanoTON}}$$
   *(Remainder: $2\text{ nanoTON}$, i.e., $2 \times 10^{-9}\text{ TON}$)*

2. **Virtual Token Reserve**:
   $$v_{\text{TOK\_base}} = \left\lfloor \frac{v_{\text{TON\_base}} \cdot S_{\text{curve}}}{T_{\text{grad}}} \right\rfloor = \left\lfloor \frac{166,666,666,666 \cdot 800,000,000 \cdot 10^9}{500 \cdot 10^9} \right\rfloor = \mathbf{266,666,666,665,600,000\text{ units}}$$
   *(Exact: $266,666,666.6656\text{ whole tokens}$)*

3. **Constant Product Invariant ($K$)**:
   $$K = v_{\text{TON\_base}} \cdot (S_{\text{curve}} + v_{\text{TOK\_base}})$$
   $$K = 166,666,666,666 \cdot (800,000,000,000,000,000 + 266,666,666,665,600,000) = \mathbf{177,777,777,776,888,888,888,889,600,000}$$

4. **Terminal Spot Price Verification in Base Units**:
   - Terminal curve spot price:
     $$P_{\text{curve\_terminal}} = \frac{(T_{\text{grad}} + v_{\text{TON\_base}}) \cdot 10^9}{v_{\text{TOK\_base}}} = \frac{(500,000,000,000 + 166,666,666,666) \cdot 10^9}{266,666,666,665,600,000} = \mathbf{2,500\text{ nanoTON/token}}$$
   - Initial DEX pool spot price:
     $$P_{\text{DEX\_initial}} = \frac{T_{\text{grad}} \cdot 10^9}{S_{\text{DEX}}} = \frac{500,000,000,000 \cdot 10^9}{200,000,000 \cdot 10^9} = \mathbf{2,500\text{ nanoTON/token}}$$
   - **Integer Price Discrepancy**:
     $$\Delta P = P_{\text{curve\_terminal}} - P_{\text{DEX\_initial}} = 2,500 - 2,500 = \mathbf{0\text{ nanoTON} \quad (0.000000\% \text{ deviation})}$$

---

## 4. CORRECTED PARAMETER SPECIFICATION TABLE

| Parameter | Symbol | Value in Whole Units | Value in Integer Base Units | Source / Mathematical Basis |
| :--- | :--- | :--- | :--- | :--- |
| **Total Fixed Supply** | $S_{\text{total}}$ | $1,000,000,000$ tokens | $1,000,000,000,000,000,000$ | Fixed canonical supply |
| **Curve Allocation** | $S_{\text{curve}}$ | $800,000,000$ tokens | $800,000,000,000,000,000$ | 80% public curve trading |
| **Max DEX Allocation** | $S_{\text{DEX\_max}}$ | $200,000,000$ tokens | $200,000,000,000,000,000$ | 20% initial DEX liquidity |
| **Creator Allocation** | $S_{\text{creator}}$ | $0$ tokens | $0$ | 0% Fair launch standard |
| **Graduation Threshold** | $T_{\text{grad}}$ | $500\text{ TON}$ | $500,000,000,000\text{ nanoTON}$ | Real curve TON target |
| **Virtual TON Reserve** | $v_{\text{TON}}$ | $166.666666666\text{ TON}$ | $166,666,666,666\text{ nanoTON}$ | Derived via Price Matching |
| **Virtual Token Reserve**| $v_{\text{TOK}}$ | $266,666,666.6656\text{ tokens}$ | $266,666,666,665,600,000$ | Derived via Sellout Condition |
| **Genesis Spot Price** | $P_0$ | $0.00000015625\text{ TON}$ | $156.25\text{ nanoTON}$ | $v_{\text{TON}} / (S_{\text{curve}} + v_{\text{TOK}})$ |
| **Graduation Spot Price**| $P_{\text{grad}}$ | $0.00000250000\text{ TON}$ | $2,500.00\text{ nanoTON}$ | Matches DEX initial price |
| **Curve Price Growth** | $P_{\text{grad}} / P_0$ | $16.0\times$ | $16.0\times$ | Organic growth curve |
| **Genesis FDV** | $\text{FDV}_0$ | $156.25\text{ TON}$ | $156,250,000,000\text{ nanoTON}$ | $P_0 \times S_{\text{total}}$ |
| **Graduation FDV** | $\text{FDV}_{\text{grad}}$| $2,500.00\text{ TON}$ | $2,500,000,000,000\text{ nanoTON}$ | $P_{\text{grad}} \times S_{\text{total}}$ |
| **Graduation Market Cap**| $\text{MCAP}_{\text{grad}}$| $2,000.00\text{ TON}$ | $2,000,000,000,000\text{ nanoTON}$ | $P_{\text{grad}} \times S_{\text{curve}}$ ($800\text{M}$ circ) |
| **Protocol Trading Fee** | $\phi$ | $1.00\%$ | $100\text{ basis points}$ | Applied on buys and sells |

---

## 5. RESIDUAL INVENTORY & DEX ALLOCATION RECONCILIATION

In practical TVM execution, trading occurs in discrete chunks. When a user submits a buy that pushes $x_{\text{real}} \ge T_{\text{grad}}$, the trade is capped, and the curve transitions to `GRADUATION_PENDING`.

### Calculation of Required DEX Tokens at Graduation
Let:
- $T_{\text{actual}}$ = Actual real TON reserve at graduation ($T_{\text{actual}} \ge T_{\text{grad}}$)
- $y_{\text{residual}}$ = Residual unsold tokens on curve ($y_{\text{residual}} \ge 0$)
- Actual Terminal Curve Spot Price:
  $$P_{\text{terminal}} = \frac{T_{\text{actual}} + v_{\text{TON}}}{y_{\text{residual}} + v_{\text{TOK}}}$$

To seed the DEX liquidity pool with $T_{\text{actual}}$ such that the initial DEX pool price matches $P_{\text{terminal}}$ exactly:
$$S_{\text{DEX\_calc}} = \left\lfloor \frac{T_{\text{actual}} \cdot (y_{\text{residual}} + v_{\text{TOK}})}{T_{\text{actual}} + v_{\text{TON}}} \right\rfloor$$

### Analysis of Residual Token Policies
If $S_{\text{DEX\_calc}} \le S_{\text{DEX\_max}}$, there will be:
- Residual curve tokens: $y_{\text{residual}}$
- Unused graduation allocation: $U_{\text{grad}} = S_{\text{DEX\_max}} - S_{\text{DEX\_calc}}$
- Total residual tokens: $R_{\text{total}} = y_{\text{residual}} + U_{\text{grad}}$

| Residual Token Policy | Mechanical Execution | Effect on Total Supply | Effect on DEX Price Continuity | Security & Governance Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Policy A: Burn Residuals (Recommended)** | Curve invokes `op::burn` on Jetton Minter for $R_{\text{total}}$. | Deflationary: $S_{\text{total}} \leftarrow S_{\text{total}} - R_{\text{total}}$. | **100% Preserved**: DEX opens at exact terminal price. | **Highest Security**: Irreversible destruction. Zero dump risk. |
| **Policy B: Lock in LP Locker** | Curve transfers $R_{\text{total}}$ to the dedicated immutable LP Locker. | Unchanged ($1\text{B}$). Circulating supply unchanged. | **100% Preserved**: Locked tokens cannot trade. | **High Security**: Immutable contract lock, but requires storage rent. |
| **Policy C: Dump all residuals into DEX** | Curve deposits all $S_{\text{DEX\_max}} + y_{\text{residual}}$ into DEX. | Unchanged ($1\text{B}$). | **Broken**: DEX price drops below terminal curve price, triggering arbitrage dump. | **Unacceptable**: Destroys price continuity. |

> [!IMPORTANT]
> **Policy Recommendation**: **Policy A (Burn Residual Tokens)**.  
> Burning residual tokens permanently synchronizes the on-chain total supply on the Jetton Minter with the actual tokens in existence ($S_{\text{circulating}} + S_{\text{DEX\_pool}}$). It preserves 100% price continuity on DEX migration with zero dilution risk.

---

## 6. FOUR-CATEGORY FEE AND RESERVE ACCOUNTING

To prevent double-counting and eliminate any possibility that trading fees or storage rent compromise the advertised $500\text{ TON}$ DEX liquidity:

$$\text{Physical Contract TON Balance } (B_{\text{contract}}) \ge x_{\text{real}} + A_{\text{fees}} + R_{\text{storage}} + M_{\text{budget}}$$

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHYSICAL CONTRACT TON BALANCE                        │
├─────────────────────┬──────────────────┬───────────────┬───────────────┤
│ Real Curve Reserve  │  Accrued Fees    │ Storage & Gas │ Migration Gas │
│     (x_real)        │    (A_fees)      │  (R_storage)  │  (M_budget)   │
│ Backs token buys    │ 1% on buys/sells │ TVM rent/min  │ Forward fees  │
│ 0 -> 500 TON target │ 100% Treasury    │ >= 0.05 TON   │ >= 0.30 TON   │
└─────────────────────┴──────────────────┴───────────────┴───────────────┘
```

1. **`real_curve_ton_reserve` ($x_{\text{real}}$)**:
   - Dedicated exclusively to backing token liquidity.
   - At graduation, exactly $T_{\text{actual}}$ ($\ge 500\text{ TON}$) is transferred to the DEX router as liquidity principal.
2. **`accrued_protocol_fees` ($A_{\text{fees}}$)**:
   - 100% payable to the platform treasury (`UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd`).
   - Retained in contract storage; swept by treasury via `op::sweep_fees()`.
   - Never included in curve solvency calculations.
3. **`storage_and_gas_reserve` ($R_{\text{storage}}$)**:
   - Initialized at deployment ($\ge 0.05\text{ TON}$) to pay ongoing TVM storage rent.
4. **`migration_operational_budget` ($M_{\text{budget}}$)**:
   - Dedicated reserve ($\approx 0.30 - 0.50\text{ TON}$) to cover forward fees and gas for pool deployment and LP locker transfers, ensuring $x_{\text{real}}$ is not depleted.

---

## 7. CANONICAL MINTER INSPECTION & RENOUNCE STATE MACHINE

### Source Inspection of `jetton-minter.fc`
Lines 130–136 of `minter-contract/contracts/jetton-minter.fc`:
```func
if (op == 3) { ;; change admin
    throw_unless(73, equal_slices(sender_address, admin_address));
    slice new_admin_address = in_msg_body~load_msg_addr();
    save_data(total_supply, new_admin_address, content, jetton_wallet_code);
    return ();
}
```
**CRITICAL FINDING**: Opcode 3 (`change_admin`) sends **ZERO outbound message or acknowledgement**. It updates storage and executes `return ()`.

### The Non-Acknowledgement Constraint
Because TON message passing is asynchronous and the minter emits no callback:
- An outbound message from the Curve with `op = 3` and `new_admin = addr_none` does **not** provide synchronous on-chain proof that admin has become null.
- If trading were activated immediately after sending opcode 3, a dropped or bounced message would leave the minter admin active while trading proceeds.

### The Verification-Gated State Machine
To guarantee that minting is permanently revoked before trading can begin:

```mermaid
stateDiagram-v2
    [*] --> UNINITIALIZED : Contract Deployed
    UNINITIALIZED --> INITIALIZING : op::init_launchpad(creator)
    INITIALIZING --> RENOUNCE_PENDING : Mint 1B Tokens to Curve Wallet & Send op::change_admin(addr_none)
    RENOUNCE_PENDING --> ACTIVE : External Keeper / Engine verifies admin == null via get_jetton_data()
    ACTIVE --> GRADUATION_PENDING : x_real >= 500 TON (Trading Locked)
    GRADUATION_PENDING --> MIGRATING : Prepare DEX Liquidity & LP Locker
    MIGRATING --> GRADUATED : LP Tokens received in LP Locker
    MIGRATING --> MIGRATION_FAILED : DEX provisioning bounced / failed
    MIGRATION_FAILED --> MIGRATING : op::retry_migration() with updated gas
```

1. **`UNINITIALIZED` (0)**: Initial deployment state.
2. **`INITIALIZING` (1)**: Minter deployed with Curve as admin. Curve sends `op::mint()` (opcode 21) for $1\text{B}$ tokens to its own wallet.
3. **`RENOUNCE_PENDING` (2)**: Curve sends `op::change_admin` to `addr_none`. Trading remains **locked**.
4. **`ACTIVE` (3)**: Trading enabled **only after on-chain verification**. A verification transaction (`op::confirm_renounce()`) providing proof of null admin, or verified via the off-chain Blockchain Provider before enabling client interactions.
5. **`GRADUATION_PENDING` (4)**: $x_{\text{real}} \ge 500\text{ TON}$ reached. Buys bounce; sells refund tokens.
6. **`MIGRATING` (5)**: DEX liquidity provision message in flight.
7. **`GRADUATED` (6)**: LP tokens confirmed held in immutable LP Locker.
8. **`MIGRATION_FAILED` (7)**: Outbound DEX message bounced; assets recovered safely in Curve; authorized retry permitted.

---

## 8. SELL NOTIFICATION & TOKEN-REFUND ARCHITECTURE

### The Non-Bounceable Notification Trap
In `jetton-wallet.fc` lines 141–149, `op::transfer_notification` is sent with `0x10, 6` (`nobounce = true`).
If the Curve contract throws an unhandled exception (e.g. slippage exceeded or curve graduated):
- The notification does **not** bounce.
- The tokens are **already credited** to the Curve's Jetton Wallet.
- The user loses their tokens and receives zero TON.

### Required Refund Implementation
When processing `op::transfer_notification` in `recv_internal`:
1. **Authenticity Check**:
   ```func
   slice expected_wallet = calculate_user_jetton_wallet_address(my_address(), jetton_master_address, jetton_wallet_code);
   throw_unless(707, equal_slices(sender_address, expected_wallet));
   ```
2. **Refund Trigger Conditions**:
   - Curve state $\neq$ `ACTIVE`
   - Forwarded gas $< 0.05\text{ TON}$
   - Calculated payout $< \text{min\_ton\_out}$ (slippage exceeded)
   - Malformed payload
3. **Execution of Refund**:
   - Construct `op::transfer` (opcode `0xf8a7e0f`) from Curve to its own Jetton Wallet.
   - Recipient: `from_address` (original seller).
   - Amount: `jetton_amount`.
   - Forward remaining TON value minus TVM computation cost.
   - Leave $x_{\text{real}}$ and $y_{\text{real}}$ **100% unchanged**.

---

## 9. DEDICATED IMMUTABLE LP LOCKER DESIGN

The LP Locker (`anlgram-lp-locker.fc`) guarantees permanent liquidity lock without the dangerous "LP burn" mechanism (which actually withdraws liquidity).

### Architectural Rules
1. **Expected LP Jetton Master**: Immutably set in initial storage at deployment.
2. **Authenticity Enforcement**: The locker accepts incoming tokens only from its own verified LP Jetton Wallet.
3. **Zero Withdrawal Methods**: The contract code contains **NO transfer, burn, or withdrawal opcodes**.
4. **Permanent Lock Timestamp**: Storage contains `unlock_timestamp = 0xFFFFFFFFFFFFFFFF`.
5. **Public Verifiability**: Exposes read-only get method:
   ```func
   (int, int, slice, slice) get_lock_data() method_id {
       return (
           -1, ;; is_permanent: true (-1)
           0xFFFFFFFFFFFFFFFF, ;; unlock_timestamp: permanent
           expected_pool_address,
           lp_wallet_address
       );
   }
   ```
   *Enables ANLGRAM's TokenVerificationEngine to verify the lock on-chain with zero third-party trust.*

---

## 10. UNRESOLVED QUESTIONS REQUIRING HUMAN GOVERNANCE

Before Phase 2A begins, platform governance must confirm:

1. **Protocol Fee Split**: Confirm whether 100% of the 1% fee routes to treasury, or if a portion (e.g., 20%) routes to the ANL Staking Router.
2. **Target DEX**: Confirm whether STON.fi v2 CPI pool is the exclusive graduation target, or if DeDust.io fallback router should be supported.
3. **Keeper Architecture**: Confirm whether the transition from `RENOUNCE_PENDING` to `ACTIVE` will be automated by an off-chain keeper bot or triggered via the ANLGRAM Admin interface.

---

> [!IMPORTANT]
> **PHASE 1D SPECIFICATION RECORDED**  
> All mathematical equations, derivations, and state machine designs have been verified.  
> Proceeding to update the isolated mathematical model and offline test suite.
