# ANLGRAM Launchpad — Bonding Curve Mathematical Specification

**Version**: 1.0.0  
**Status**: Formal Economic & Mathematical Specification  
**Classification**: Engineering Protocol Specification  
**Arithmetic Standard**: Strict Integer Arithmetic Only (`BigInt`, Nanotons & Jetton Atomic Units)  

---

## 1. System Reserve Definitions & Token Supply Architecture

The ANLGRAM Memecoin Launchpad utilizes a constant-product Automated Market Maker (AMM) with virtual reserves. All accounting inside the contract is strictly deterministic, non-custodial, and executed in integer units.

### 1.1 Token Supply Allocation (Fixed 1,000,000,000 Supply)
Every launchpad token has a strictly enforced, immutable total supply:
$$\text{TOTAL\_SUPPLY} = 1,000,000,000 \times 10^9 \text{ base units} = 10^{18} \text{ units (with 9 decimals)}$$

The total supply is partitioned at token deployment into exactly two non-overlapping allocations:
1. **Bonding Curve Trading Allocation ($S_{\text{curve}}$)**:
   $$S_{\text{curve}} = 800,000,000 \times 10^9 \text{ units} = 8 \times 10^{17} \text{ units (80.00\%)}$$
   These tokens are deposited directly into the Bonding Curve contract inventory upon deployment.
2. **Graduation Liquidity Allocation ($S_{\text{grad}}$)**:
   $$S_{\text{grad}} = 200,000,000 \times 10^9 \text{ units} = 2 \times 10^{17} \text{ units (20.00\%)}$$
   These tokens are locked in escrow until the graduation threshold is reached, at which point they are paired with accumulated TON to seed the DEX liquidity pool.
3. **Creator Allocation ($S_{\text{creator}}$)**:
   $$S_{\text{creator}} = 0 \text{ units (0.00\%) (Strict Fair Launch)}$$
   To protect community participants and adhere to ANLGRAM's Fair Launch standard, no unbacked creator tokens are minted. Creators participate by buying on the curve alongside all other users.
4. **Treasury Pre-mine Allocation ($S_{\text{treasury}}$)**:
   $$S_{\text{treasury}} = 0 \text{ units (0.00\%)}$$

**Conservation Invariant**:
$$S_{\text{curve}} + S_{\text{grad}} + S_{\text{creator}} + S_{\text{treasury}} \equiv \text{TOTAL\_SUPPLY} = 10^{18} \text{ units}$$

---

## 2. Constant-Product Curve with Virtual Reserves

The bonding curve operates on effective reserves:
$$X = r_{\text{TON}} + v_{\text{TON}}$$
$$Y = r_{\text{TOK}} + v_{\text{TOK}}$$

Where:
- $r_{\text{TON}}$: **Real TON reserve** held in contract balance (starts at $0$, increases on buys, decreases on sells).
- $v_{\text{TON}}$: **Virtual TON reserve** (initial liquidity depth parameter, e.g. $30\text{ TON} = 30 \times 10^9\text{ nanoTON}$).
- $r_{\text{TOK}}$: **Real Token inventory** available in the curve (starts at $S_{\text{curve}} = 800\text{M}$ tokens, decreases on buys, increases on sells).
- $v_{\text{TOK}}$: **Virtual Token reserve** (virtual inventory depth parameter).

### 2.1 Determination of Virtual Token Reserve ($v_{\text{TOK}}$)
Let $T_{\text{grad}}$ be the real TON graduation threshold (e.g. $500\text{ TON} = 500 \times 10^9\text{ nanoTON}$).

The fundamental economic constraint of the launchpad requires that:
1. At genesis ($r_{\text{TON}} = 0$): real token inventory $r_{\text{TOK}} = S_{\text{curve}}$.
2. At graduation ($r_{\text{TON}} = T_{\text{grad}}$): real token inventory $r_{\text{TOK}} = 0$ (all $800\text{M}$ curve tokens have been sold).

Since the invariant $K$ is constant across the entire curve lifecycle:
$$K = X_{\text{start}} \cdot Y_{\text{start}} = X_{\text{grad}} \cdot Y_{\text{grad}}$$
$$v_{\text{TON}} \cdot (S_{\text{curve}} + v_{\text{TOK}}) = (v_{\text{TON}} + T_{\text{grad}}) \cdot v_{\text{TOK}}$$
$$v_{\text{TON}} \cdot S_{\text{curve}} + v_{\text{TON}} \cdot v_{\text{TOK}} = v_{\text{TON}} \cdot v_{\text{TOK}} + T_{\text{grad}} \cdot v_{\text{TOK}}$$
$$v_{\text{TON}} \cdot S_{\text{curve}} = T_{\text{grad}} \cdot v_{\text{TOK}}$$

Therefore, $v_{\text{TOK}}$ is uniquely and deterministically derived:
$$\mathbf{v_{\text{TOK}} = \left\lfloor \frac{v_{\text{TON}} \cdot S_{\text{curve}}}{T_{\text{grad}}} \right\rfloor}$$

And the constant invariant $K$ is:
$$\mathbf{K = v_{\text{TON}} \cdot (S_{\text{curve}} + v_{\text{TOK}})}$$

---

## 3. Fee Model & Precision Arithmetic

All calculations are performed using non-negative integers (`BigInt`).
- Basis points denominator: $\text{BPS} = 10,000$ ($100\text{ bps} = 1.00\%$).
- Trading protocol fee: $f_{\text{bps}} \in [0, 500]$ (e.g. $100\text{ bps} = 1.00\%$).
- The protocol fee is collected on trades and routed to the ANLGRAM Treasury wallet (`UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd`).
- Protocol fees are accounted separately and **do not** inflate the real trading reserve $r_{\text{TON}}$.

---

## 4. Buy Equations & Solvency Rounding

### 4.1 Input Parameters
- $\Delta x_{\text{gross}}$: Gross nanoTON sent by user.
- $f_{\text{bps}}$: Protocol fee in basis points (e.g. 100).
- $\text{max\_slippage}_{\text{bps}}$: Maximum acceptable slippage in basis points (e.g. 100 for 1%).

### 4.2 Fee & Net Input
$$\text{fee}_{\text{TON}} = \left\lfloor \frac{\Delta x_{\text{gross}} \cdot f_{\text{bps}}}{10000} \right\rfloor$$
$$\Delta x = \Delta x_{\text{gross}} - \text{fee}_{\text{TON}}$$

### 4.3 Output Tokens Calculation
Effective TON reserve after trade:
$$X' = X + \Delta x$$

By the constant-product invariant $X' \cdot Y' = K$:
$$Y' = \left\lceil \frac{K}{X'} \right\rceil = \left\lfloor \frac{K + X' - 1}{X'} \right\rfloor$$

Token output:
$$\Delta y = Y - Y' = \left\lfloor \frac{Y \cdot \Delta x}{X + \Delta x} \right\rfloor$$

### 4.4 Rounding Direction Rule (Solvency Enforcement)
Integer division in $\Delta y = \lfloor \frac{Y \cdot \Delta x}{X + \Delta x} \rfloor$ truncates down.  
This guarantees:
$$Y' = Y - \Delta y \ge \frac{K}{X + \Delta x} \implies X' \cdot Y' \ge K$$
**Result**: The contract reserves never surrender more tokens than mathematically permitted. The invariant $K$ is strictly non-decreasing ($\Delta K \ge 0$).

### 4.5 Boundary & Graduation Checks
1. $\Delta x_{\text{gross}} > 0$ (Zero input rejected).
2. If $\Delta y > r_{\text{TOK}}$, the buy exceeds remaining curve inventory. The trade is capped to remaining $r_{\text{TOK}}$ or rejected if partial fill is disabled.
3. If $r_{\text{TON}} + \Delta x \ge T_{\text{grad}}$, the trade reaches or crosses the graduation threshold.

---

## 5. Sell Equations & Solvency Rounding

### 5.1 Input Parameters
- $\Delta y$: Gross Jetton atomic units to sell.
- $\text{max\_slippage}_{\text{bps}}$: Maximum acceptable slippage in basis points.

### 5.2 Gross TON Output
Effective token reserve increases to:
$$Y' = Y + \Delta y$$

Gross TON output from curve:
$$\Delta x_{\text{gross}} = \left\lfloor \frac{X \cdot \Delta y}{Y + \Delta y} \right\rfloor$$

### 5.3 Rounding Direction Rule
Standard integer division rounds down $\Delta x_{\text{gross}}$.
This ensures the curve pays out fewer or equal nanoTON, leaving $X' = X - \Delta x_{\text{gross}} \ge \frac{K}{Y'}$, strictly preserving $X' \cdot Y' \ge K$.

### 5.4 Solvency Check (Non-Negotiable)
$$\Delta x_{\text{gross}} \le r_{\text{TON}}$$
The contract mathematically forbids paying out more TON than the actual real reserve $r_{\text{TON}}$ held in contract custody. (Virtual TON $v_{\text{TON}}$ can never be withdrawn).

### 5.5 Fee & Net Payout
$$\text{fee}_{\text{TON}} = \left\lfloor \frac{\Delta x_{\text{gross}} \cdot f_{\text{bps}}}{10000} \right\rfloor$$
$$\Delta x_{\text{net}} = \Delta x_{\text{gross}} - \text{fee}_{\text{TON}}$$

The seller receives $\Delta x_{\text{net}}$, the treasury receives $\text{fee}_{\text{TON}}$, and real reserve $r_{\text{TON}}$ decreases by exactly $\Delta x_{\text{gross}}$.

---

## 6. Spot Price & Price Impact Calculations

### 6.1 Spot Price (NanoTON per Token Unit)
The instantaneous marginal spot price on the curve is:
$$P = \frac{X}{Y} \quad \left(\text{in nanoTON per base token unit}\right)$$
In standard human units (TON per 1 whole token):
$$\text{Price}_{\text{TON/Token}} = \frac{X}{Y}$$

### 6.2 Price Impact Formula
For a trade with pre-trade spot price $P_0 = \frac{X}{Y}$ and execution price $P_{\text{exec}} = \frac{\Delta x}{\Delta y}$:
$$\text{PriceImpact}_{\text{bps}} = \left\lfloor \frac{|P_{\text{exec}} - P_0| \cdot 10000}{P_0} \right\rfloor$$

---

## 7. Slippage Protection (Integer Formulation)

Slippage tolerance protects against front-running and block-ordering manipulation:
- For Buys:
  $$\Delta y_{\text{min\_out}} = \left\lfloor \frac{\Delta y_{\text{quoted}} \cdot (10000 - \text{slippage}_{\text{bps}})}{10000} \right\rfloor$$
  Contract assertion: $\Delta y \ge \Delta y_{\text{min\_out}}$ (Throws TVM exit code 412 if violated).
- For Sells:
  $$\Delta x_{\text{min\_out}} = \left\lfloor \frac{\Delta x_{\text{net\_quoted}} \cdot (10000 - \text{slippage}_{\text{bps}})}{10000} \right\rfloor$$
  Contract assertion: $\Delta x_{\text{net}} \ge \Delta x_{\text{min\_out}}$ (Throws TVM exit code 412 if violated).

---

## 8. Graduation State Transitions

```text
       TRADING ACTIVE
             │
             │ r_TON >= T_grad (or r_TOK == 0)
             ▼
    GRADUATION THRESHOLD REACHED
             │
             ├─ lock trading: buy() -> throws error 403
             ├─ lock trading: sell() -> throws error 403
             ▼
     ELIGIBLE FOR DEX MIGRATION
             │
             ├─ Real TON accumulated: r_TON = T_grad
             ├─ Liquidity Tokens: S_grad = 200,000,000 tokens
             ▼
      DEX LIQUIDITY SEEDING (Phase 3 Router)
```

---

## 9. Default Model Parameter Set (For Testing & Validation)

| Parameter | Symbol | Value (Human) | Value (Integer Base Units) |
| :--- | :---: | :---: | :---: |
| Total Token Supply | $\text{TOTAL\_SUPPLY}$ | $1,000,000,000$ TOK | $1,000,000,000,000,000,000$ |
| Curve Token Inventory | $S_{\text{curve}}$ | $800,000,000$ TOK | $800,000,000,000,000,000$ |
| Graduation Token Escrow | $S_{\text{grad}}$ | $200,000,000$ TOK | $200,000,000,000,000,000$ |
| Creator Allocation | $S_{\text{creator}}$ | $0$ TOK | $0$ |
| Initial Virtual TON Reserve | $v_{\text{TON}}$ | $30$ TON | $30,000,000,000$ nanoTON |
| Real TON Graduation Threshold | $T_{\text{grad}}$ | $500$ TON | $500,000,000,000$ nanoTON |
| Derived Virtual Token Reserve | $v_{\text{TOK}}$ | $48,000,000$ TOK | $48,000,000,000,000,000$ |
| Initial Invariant | $K$ | — | $v_{\text{TON}} \cdot (S_{\text{curve}} + v_{\text{TOK}})$ |
| Trading Protocol Fee | $f_{\text{bps}}$ | $1.00\%$ | $100$ bps |
| Decimals | $D$ | $9$ | $9$ |
