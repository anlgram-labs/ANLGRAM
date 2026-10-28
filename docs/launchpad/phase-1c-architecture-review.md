# ANLGRAM — PHASE 1C ARCHITECTURE & ECONOMIC REVIEW
**Pre-Contract Architecture Review, Mathematical Specification Corrections, and TVM Implementation Blueprint**

> **Document Status**: Complete Architecture & Security Review  
> **Target Branch**: `feature/launchpad-engine`  
> **Baseline Commit**: `94b225587c9b55535df1d02716641b166271171d`  
> **Review Commit**: `95d18fe3c5664cf9cdb90b10c392539a75806f01`  
> **Execution Gate**: Phase 1C Review Only — Zero smart contract code deployed, zero transactions broadcast, zero production files modified.

---

## 1. EXECUTIVE SUMMARY & REPRODUCIBILITY VERIFICATION

This review conducts a rigorous technical audit of the Phase 1B deliverables:
- Read-only multi-provider layer: [assets/js/blockchain-provider.js](file:///e:/ANLGRAM/assets/js/blockchain-provider.js)
- Integer bonding curve mathematical engine: [minter-contract/scripts/bonding-curve-math.js](file:///e:/ANLGRAM/minter-contract/scripts/bonding-curve-math.js)
- Bonding curve mathematical specification: [docs/launchpad/bonding-curve-math-spec.md](file:///e:/ANLGRAM/docs/launchpad/bonding-curve-math-spec.md)
- Automated test suites: `test-blockchain-provider.js` and `minter-contract/test-bonding-curve-math.js`
- Canonical TEP-74 FunC contracts: `minter-contract/contracts/jetton-minter.fc` and `jetton-wallet.fc`

### Baseline Reproducibility
All offline test commands were executed and verified independently in the local environment:
1. `node test-blockchain-provider.js`: **25 passed, 0 failed**.
2. `node minter-contract/test-bonding-curve-math.js`: **39 passed, 0 failed** (including 12,000 deterministic fuzz cycles with seed `0x414e4c47`).
3. Root regression test suites (10 test scripts): **544 passed, 0 failed**.
4. Total verified passing tests: **608 passed, 0 failed**.
5. Git working tree: **Clean** on `feature/launchpad-engine`. All 20 protected production files match the production baseline commit (`94b2255`) with **0 bitwise diff**.

---

## SECTION A: FINDINGS CONFIRMED BY SOURCE INSPECTION

### A.1 Frontend Static Architecture & Zero-Bundler Constraint
- **Inspection Source**: Root repository structure, `memecoin-platform.html`, and `package.json`.
- **Finding**: The production platform is hosted on GitHub Pages as static HTML, CSS, and vanilla ECMAScript. There is **no frontend bundler** (no Webpack, Vite, Rollup, or Parcel).
- **Architectural Consequence**: All browser-facing modules, including `assets/js/blockchain-provider.js`, must remain native ECMAScript with UMD/global exports. No TypeScript or NPM module imports can be introduced to `assets/js/` without breaking production hosting.

### A.2 Legacy Factory TVM Exit Code 73 Defect
- **Inspection Source**: `minter-contract/contracts/anlgram-factory.fc` lines 203 and 254; `minter-contract/contracts/jetton-minter.fc` line 71.
- **Finding**: In `anlgram-factory.fc`, the factory initializes the minter contract with `owner_addr` (the end-user creator) as `admin_address` (line 203). Subsequently, on line 254, the factory sends internal message `op::mint()` (opcode 21) from its own address. In `jetton-minter.fc`, line 71 explicitly enforces:
  ```func
  throw_unless(73, equal_slices(sender_address, admin_address));
  ```
  Because `sender_address` (Factory) $\neq$ `admin_address` (Creator), the TVM halts immediately with **exit code 73** (unauthorized admin). This explains why `FACTORY_MAINNET` and `FACTORY_TESTNET` were intentionally left blank in `assets/js/launchpad.js`, and why direct deployment (`deployJettonWeb3`) remains the active production deployment path.

### A.3 Jetton Wallet `transfer_notification` is Non-Bounceable
- **Inspection Source**: `minter-contract/contracts/jetton-wallet.fc` lines 141–149.
- **Finding**: When a user transfers Jettons to another wallet, the receiving Jetton Wallet credits the tokens to its internal balance (`balance += jetton_amount`, line 116) and sends `op::transfer_notification()` (opcode `0x7362d09c`) to its owner contract with header `0x10, 6`. The bounce flag is explicitly set to **false** (`nobounce`):
  ```func
  var msg = begin_cell()
    .store_uint(0x10, 6) ;; we should not bounce here cause receiver can have uninitialized contract
    .store_slice(owner_address)
    .store_coins(forward_ton_amount)
    ...
  send_raw_message(msg.end_cell(), 1);
  ```
- **Critical Consequence**: If the Curve contract throws an error (e.g., `throw(400)` for slippage or curve lock) during `transfer_notification`, **the tokens are NOT refunded to the user**. The tokens remain credited to the Curve's Jetton Wallet. The Curve contract must explicitly execute an outbound Jetton transfer back to the seller on failure.

---

## SECTION B: MATHEMATICAL AMBIGUITIES & INCONSISTENCIES IN THE PHASE 1B MODEL

### B.1 Fully Diluted Valuation (FDV) vs. Market Capitalization
- **Ambiguity**: In [bonding-curve-math-spec.md](file:///e:/ANLGRAM/docs/launchpad/bonding-curve-math-spec.md) and the Phase 1B report, initial valuation ($\approx 35.38\text{ TON}$) and graduation valuation ($\approx 11,042\text{ TON}$) were described as "Market Cap".
- **Mathematical Correction**:
  Multiplying spot price by the **total supply** ($S_{\text{total}} = 1,000,000,000$ tokens) defines **Fully Diluted Valuation (FDV)**, not Market Capitalization:
  $$\text{FDV} = P_{\text{spot}} \times S_{\text{total}}$$
  Market Capitalization must be calculated strictly against **circulating supply** ($S_{\text{circ}}$), defined as tokens held in public circulation outside contract inventory and DEX escrow:
  $$S_{\text{circ}} = S_{\text{curve}} - y_{\text{real}}$$
  $$\text{Market Capitalization} = P_{\text{spot}} \times S_{\text{circ}} = P_{\text{spot}} \times (S_{\text{curve}} - y_{\text{real}})$$
  - **At Genesis**: $y_{\text{real}} = 800\text{M} \implies S_{\text{circ}} = 0$.
    $$\text{Circulating Supply} = 0 \text{ tokens}$$
    $$\text{Market Capitalization} = P_0 \times 0 = 0.00\text{ TON}$$
    $$\text{FDV} = P_0 \times 1\text{B} = 35.38\text{ TON}$$
  - **At Graduation**: $y_{\text{real}} = 0 \implies S_{\text{circ}} = 800\text{M tokens}$. (The 200M DEX tokens remain escrowed for liquidity migration).
    $$\text{Market Capitalization} = P_{\text{grad}} \times 800\text{M} \approx 1.1042 \times 10^{-5} \times 800\text{M} \approx 8,833.6\text{ TON}$$
    $$\text{FDV} = P_{\text{grad}} \times 1\text{B} \approx 11,042\text{ TON}$$
- **Fiat Currency Oracle**: Any TON/USD conversion (e.g. at $\$5.20/\text{TON}$) is strictly an external, time-stamped display value provided by TonAPI/CoinGecko at query time. It must never be treated as an immutable economic constant in contract logic.

### B.2 Step-by-Step Monotonic Invariant Gap
- **Ambiguity**: `assertInvariants()` in `bonding-curve-math.js` line 430 verifies `currentK >= this.K`, comparing against the **genesis invariant** ($K_0$).
- **Correction**: Testing $K_t \ge K_0$ is insufficient to detect regressive state corruption. Because protocol fees and downward integer truncation leave residual value in the curve, $K$ increases monotonically with every trade:
  $$K_t \ge K_{t-1} \ge K_0$$
  If an erroneous calculation in trade $t$ reduced $K$ from $1.4 K_0$ down to $1.1 K_0$, comparing only against $K_0$ would falsely report success. The invariant assertion must enforce $K_t \ge K_{t-1}$ across every state transition.

### B.3 Clarification of "Arbitrage-Proof" Round-Trip Claims
- **Ambiguity**: The phrase "arbitrage-proof" was used in Phase 1B documentation to describe round-trip testing.
- **Correction**: No AMM can claim blanket "arbitrage-proof" immunity against external price differences across separate venues. The round-trip test proves a specific **internal solvency property**:
  *Under the assumption of zero external trades and constant reserves, an instantaneous buy-then-sell sequence by the same actor will always yield strictly less TON than the initial input:*
  $$\text{Net Payout}_{\text{sell}} < \text{Gross Input}_{\text{buy}}$$
  This loss is mathematically guaranteed by the cumulative price impact across the constant-product curve plus the two-leg protocol fee drag:
  $$\text{Fee Drag} = 1 - (1 - \phi)^2 = 1 - (0.99)^2 = 1.99\% \text{ (at } 100\text{ bps)}$$

---

## SECTION C: CORRECTED PROPOSED RESERVE AND FEE EQUATIONS

To prevent double-counting and preserve exact physical balance conservation on-chain, all TON held by the contract must be segregated into three distinct categories:

$$\text{Physical Contract Balance } (B_{\text{contract}}) = x_{\text{real}} + A_{\text{fees}} + R_{\text{storage}}$$

Where:
- $x_{\text{real}}$: Real TON curve reserve backing token liquidity ($0 \le x_{\text{real}} \le T_{\text{grad}}$).
- $A_{\text{fees}}$: Accrued protocol trading fees held in escrow awaiting treasury distribution.
- $R_{\text{storage}}$: Gas and storage fee reserve required to keep the contract active and pay TVM rent ($\ge 0.05\text{ TON}$).

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PHYSICAL CONTRACT TON BALANCE                        │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│    Real Curve Reserve    │   Accrued Protocol Fees  │  Storage / Gas   │
│       (x_real)           │         (A_fees)         │   (R_storage)    │
│  Backs token redemption  │  Awaiting treasury sweep │   TVM rent & min │
│   0 -> 500 TON target    │   Segregated from curve  │   >= 0.05 TON    │
└──────────────────────────┴──────────────────────────┴──────────────────┘
```

### C.1 Buy Transaction Equations
1. **Inbound Gross TON**: $\Delta x_{\text{gross}}$ (attached value minus inbound gas overhead).
2. **Protocol Fee**:
   $$\text{fee}_{\text{buy}} = \left\lfloor \frac{\Delta x_{\text{gross}} \cdot \phi}{10000} \right\rfloor$$
3. **Net Curve Inflow**:
   $$\Delta x_{\text{net}} = \Delta x_{\text{gross}} - \text{fee}_{\text{buy}}$$
4. **Token Output (Constant Product Invariant)**:
   $$\Delta y = \left\lfloor \frac{(y_{\text{real}} + v_{\text{TOK}}) \cdot \Delta x_{\text{net}}}{(x_{\text{real}} + v_{\text{TON}}) + \Delta x_{\text{net}}} \right\rfloor$$
   *Floor truncation strictly protects curve inventory: the user receives at most the mathematical quote.*
5. **State Transitions**:
   $$x_{\text{real}} \leftarrow x_{\text{real}} + \Delta x_{\text{net}}$$
   $$y_{\text{real}} \leftarrow y_{\text{real}} - \Delta y$$
   $$A_{\text{fees}} \leftarrow A_{\text{fees}} + \text{fee}_{\text{buy}}$$
6. **Balance Conservation**:
   $$\Delta B_{\text{contract}} = \Delta x_{\text{gross}} = \Delta x_{\text{net}} + \text{fee}_{\text{buy}} \equiv \Delta x_{\text{real}} + \Delta A_{\text{fees}}$$

### C.2 Sell Transaction Equations
1. **Inbound Tokens**: $\Delta y$ (received via `transfer_notification`).
2. **Gross TON Outflow (Constant Product Invariant)**:
   $$\Delta x_{\text{gross}} = \left\lfloor \frac{(x_{\text{real}} + v_{\text{TON}}) \cdot \Delta y}{(y_{\text{real}} + v_{\text{TOK}}) + \Delta y} \right\rfloor$$
   *Floor truncation strictly protects curve liquidity: the gross payout never exceeds the curve's theoretical share.*
3. **Solvency Invariant Check**:
   $$\Delta x_{\text{gross}} \le x_{\text{real}}$$
   *If violated, transaction must revert or refund tokens immediately.*
4. **Protocol Fee**:
   $$\text{fee}_{\text{sell}} = \left\lfloor \frac{\Delta x_{\text{gross}} \cdot \phi}{10000} \right\rfloor$$
5. **Net Seller Payout**:
   $$\Delta x_{\text{net}} = \Delta x_{\text{gross}} - \text{fee}_{\text{sell}}$$
6. **State Transitions**:
   $$x_{\text{real}} \leftarrow x_{\text{real}} - \Delta x_{\text{gross}}$$
   $$y_{\text{real}} \leftarrow y_{\text{real}} + \Delta y$$
   $$A_{\text{fees}} \leftarrow A_{\text{fees}} + \text{fee}_{\text{sell}}$$
7. **Physical Outflow**:
   Contract sends $\Delta x_{\text{net}}$ to the seller.
   $$\Delta B_{\text{contract}} = -\Delta x_{\text{net}} = -(\Delta x_{\text{gross}} - \text{fee}_{\text{sell}}) = -\Delta x_{\text{gross}} + \text{fee}_{\text{sell}}$$
   $$\Delta (x_{\text{real}} + A_{\text{fees}}) = (-\Delta x_{\text{gross}}) + (\text{fee}_{\text{sell}}) = -\Delta x_{\text{gross}} + \text{fee}_{\text{sell}}$$
   *Perfect physical conservation holds. Protocol fee remains inside the contract balance until swept to treasury.*

### C.3 Fee Sweep & Bounce Handling
- **Streaming Mode vs. Sweep Mode**:
  - *Streaming Mode* (immediate transfer to treasury on each trade) incurs extra gas fees ($\approx 0.015\text{ TON}$ per trade) and risks re-entrancy or outbound queue saturation.
  - *Accumulated Sweep Mode* (recommended) retains $A_{\text{fees}}$ in contract storage and permits the authorized treasury address to sweep accrued fees via `op::sweep_fees()`.
- **Bounce Protection**: If an outbound TON transfer to the seller bounces:
  - TVM receives a bounced message (`flags & 1`).
  - The contract credits the seller's claimable TON balance in a dedicated refund dictionary, or restores $x_{\text{real}} \leftarrow x_{\text{real}} + \Delta x_{\text{gross}}$ and re-emits the Jettons to the seller.

---

## SECTION D: INITIAL JETTON CREATION & FIXED-SUPPLY STATE MACHINE

Because TON executes asynchronous message-passing across multiple workchains and blocks, multi-contract initialization cannot occur atomically in a single transaction.

The Curve contract must enforce a deterministic **Seven-State Machine**:

```mermaid
stateDiagram-v2
    [*] --> STATE_UNINITIALIZED : Deploy Contract
    STATE_UNINITIALIZED --> STATE_DEPLOYING_MINTER : op::init_curve (Master Msg)
    STATE_DEPLOYING_MINTER --> STATE_AWAITING_MINT : Deploy Jetton Minter with Curve as Admin
    STATE_AWAITING_MINT --> STATE_CUSTODY_VERIFIED : Jetton Minter mints 1B tokens to Curve Wallet
    STATE_CUSTODY_VERIFIED --> STATE_ADMIN_REVOKED : op::change_admin to addr_none
    STATE_ADMIN_REVOKED --> STATE_ACTIVE : Admin Revocation Confirmed (Trading Enabled)
    STATE_ACTIVE --> STATE_GRADUATION_PENDING : x_real >= 500 TON (Trading Locked)
    STATE_GRADUATION_PENDING --> STATE_GRADUATED : DEX Pool Deployed & LP Locked
```

### Detailed State Transition Specifications

| State ID | State Name | Permitted Actions | Inbound Trigger | Outbound Message | Failure / Bounce Recovery |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `STATE_UNINITIALIZED` | Contract configuration only. Buys/Sells blocked. | Admin deploys Curve contract with parameters. | None. | None. |
| **1** | `STATE_DEPLOYING_MINTER` | Minter deployment. Buys/Sells blocked. | `op::init_launchpad()` from creator. | Deploys `jetton-minter.fc` with Curve as `admin_address`. | If deploy bounces, state resets to 0. Creator can retry. |
| **2** | `STATE_AWAITING_MINT` | Mint execution. Buys/Sells blocked. | Minter deployed confirmation. | Sends `op::mint()` (opcode 21) for $1,000,000,000$ tokens to Curve's address. | If mint fails, state halts. Admin can re-trigger mint. |
| **3** | `STATE_CUSTODY_VERIFIED` | Custody confirmation. Buys/Sells blocked. | Curve Jetton Wallet sends `transfer_notification` confirming $1\text{B}$ tokens held. | Sends `op::change_admin` (opcode 3) to Minter setting admin to `addr_none`. | If token count $\neq 1\text{B}$, halts with exit code 80. |
| **4** | `STATE_ACTIVE` | **Trading Live**. Buys and Sells enabled. | Minter emits confirmation of `change_admin`. | Inbound buys receive Jettons; sells receive TON. | Slippage exceeded $\implies$ full token or TON refund. |
| **5** | `STATE_GRADUATION_PENDING`| **Trading Frozen**. All buys/sells rejected. | Buy transaction pushes $x_{\text{real}} \ge T_{\text{grad}}$. | Initiates liquidity provision message to DEX Router. | In-flight sells receive full Jetton refund. |
| **6** | `STATE_GRADUATED` | Permanently frozen. | DEX confirms LP tokens minted to LP Locker. | Transfers LP tokens to LP Locker or verifies lock. | Retry migration with updated gas if DEX transaction bounces. |

### Protection of the 200M DEX Allocation
- Curve initial inventory is strictly partitioned in storage:
  $$S_{\text{curve\_trading}} = 800,000,000\text{ tokens}$$
  $$S_{\text{dex\_escrow}} = 200,000,000\text{ tokens}$$
- The trading engine computes quotes exclusively against $y_{\text{real}}$ where $y_{\text{real}} \le S_{\text{curve\_trading}}$.
- The $200\text{M}$ graduation tokens are stored in a separate immutable storage cell and cannot be accessed or decremented by `applyBuy()` or `applySell()`. They are unlocked exclusively upon transitioning to `STATE_GRADUATION_PENDING`.

---

## SECTION E: SELL PROCESSING AND TOKEN-REFUND DESIGN

When a user sells tokens, they transfer Jettons to the Curve contract’s Jetton Wallet. The Jetton Wallet transfers the tokens into its balance and forwards a `transfer_notification` message (opcode `0x7362d09c`) to the Curve contract.

### E.1 Message Validation Architecture
The Curve contract must validate the following fields inside `recv_internal`:

```func
;; Transfer notification payload:
;; op:0x7362d09c (32) query_id (64) amount:Coins (VarUInteger 16) sender:MsgAddress forward_payload:(Either Cell ^Cell)
int op = in_msg_body~load_uint(32);
int query_id = in_msg_body~load_uint(64);
int jetton_amount = in_msg_body~load_coins();
slice from_address = in_msg_body~load_msg_addr();
```

1. **Sender Authenticity Check**:
   The message sender must be the authentic Jetton Wallet belonging to the Curve contract:
   ```func
   slice expected_wallet = calculate_user_jetton_wallet_address(my_address(), jetton_master_address, jetton_wallet_code);
   throw_unless(707, equal_slices(sender_address, expected_wallet));
   ```
   *Any notification from an arbitrary sender is rejected immediately.*
2. **State & Gas Check**:
   - `throw_unless(401, state == STATE_ACTIVE);`
   - Forwarded TON value must exceed gas cost of computing sell quote + potential refund transfer ($\ge 0.05\text{ TON}$).
3. **Payload & Slippage Deserialization**:
   The `forward_payload` must contain the seller's minimum acceptable TON output (`min_ton_out`):
   ```func
   slice payload = in_msg_body~load_int(1) ? in_msg_body~load_ref().begin_parse() : in_msg_body;
   int min_ton_out = payload.slice_bits() >= 120 ? payload~load_coins() : 0;
   ```

### E.2 Safe Token-Refund Pattern on Failed Sells
As demonstrated in Section A.3, throwing a TVM exception does **NOT** return tokens to the user because `transfer_notification` is non-bounceable.

**Mandatory Refund Architecture**:
If any validation fails (e.g., slippage exceeded, curve graduated, or invalid payload):
1. **Do NOT throw an exception**.
2. Construct an outbound `op::transfer` (opcode `0xf8a7e0f`) from the Curve contract to its own Jetton Wallet.
3. Direct the Jettons back to `from_address`.
4. Attach the forwarded TON value minus gas consumed.
5. Leave $x_{\text{real}}$ and $y_{\text{real}}$ completely unchanged.

```mermaid
sequenceDiagram
    autonumber
    actor Seller
    participant SellerJW as Seller's Jetton Wallet
    participant CurveJW as Curve's Jetton Wallet
    participant Curve as Curve Contract
    
    Seller->>SellerJW: op::transfer(amount, to: Curve, min_ton_out)
    SellerJW->>CurveJW: op::internal_transfer(amount, from: Seller)
    CurveJW->>CurveJW: Credit balance += amount
    CurveJW->>Curve: op::transfer_notification(amount, from: Seller, min_ton_out)
    
    alt Sell Valid & Slippage Met
        Curve->>Curve: x_real -= grossTon; y_real += amount;
        Curve->>Seller: Send net TON payout (grossTon - fee)
        Curve->>CurveJW: (Tokens remain in Curve custody)
    else Sell Fails (Slippage Exceeded or Curve Frozen)
        Curve->>Curve: Keep reserves strictly unchanged
        Curve->>CurveJW: op::transfer(amount, to: Seller, response: Seller)
        CurveJW->>SellerJW: op::internal_transfer(amount, from: Curve)
        SellerJW->>Seller: Tokens safely restored to Seller!
    end
```

---

## SECTION F: GRADUATION AND MIGRATION FAILURE HANDLING

### F.1 Reaching the Graduation Threshold
- Target: $x_{\text{real}} = 500\text{ TON}$.
- When a buy order consumes the final available tokens ($y_{\text{real}} \to 0$) or pushes $x_{\text{real}} \ge 500\text{ TON}$:
  1. The buy executes with capped token output and refund of excess TON.
  2. State immediately updates to `STATE_GRADUATION_PENDING`.
  3. Real reserves freeze: $x_{\text{real}} = 500\text{ TON}$, $y_{\text{real}} = 0\text{ tokens}$.
  4. Trading locks permanently: subsequent buys bounce; subsequent sells trigger the safe Jetton refund flow (Section E.2).

### F.2 Atomic Migration Payload Preparation
The Curve contract prepares the DEX provisioning message:
- **Base Assets**: $500\text{ TON}$ (from real reserve) $+ 200,000,000$ tokens (from graduation escrow).
- **Recipient**: DEX Router (STON.fi v2 or DeDust.io).
- **LP Receiver**: Dedicated ANLGRAM LP Locker contract.

### F.3 Prevention of Double Graduation & Re-entrancy
- The state transition from `STATE_ACTIVE` to `STATE_GRADUATION_PENDING` occurs in the **computation phase** before outbound messages are committed.
- Re-triggering migration while in `STATE_GRADUATION_PENDING` or `STATE_GRADUATED` throws exit code 409 immediately.

### F.4 Migration Failure and Safe Recovery
If the DEX pool creation fails (e.g. pool factory out of gas, router temporary pause):
1. Outbound message bounces back to the Curve contract.
2. The Curve contract intercepts the bounce handler (`flags & 1`).
3. State remains in `STATE_GRADUATION_PENDING`.
4. The contract permits an authorized administrative keeper message (`op::retry_migration()`) with updated gas parameters.
5. Crucially: **No funds can be siphoned or redirected**. The assets remain locked to the specific token master and pool configuration.

---

## SECTION G: DEX LP BURN VS. DEDICATED LP LOCKER COMPARISON

A critical vulnerability identified during the Phase 1C technical research is the common misunderstanding of "LP token burning" in TON AMMs.

### G.1 The Fatal "LP Burn" Trap in STON.fi and DeDust
- In STON.fi and DeDust (as with Uniswap v2), **burning an LP token is the mechanical operation for WITHDRAWING liquidity**.
- When an LP token holder sends `op::burn` to their LP wallet, the LP wallet burns the LP tokens and sends a notification to the Pool contract. The Pool contract calculates the holder's proportional share of both pool assets and **sends the underlying TON and Jettons back to the caller/response address**.
- **Conclusion**: If the Curve contract attempts to "lock liquidity permanently" by sending an LP burn message, **IT WILL ACCIDENTALLY WITHDRAW THE ENTIRE 500 TON AND 200M JETTONS FROM THE POOL**, destroying the trading pair immediately!

### G.2 Sending LP Tokens to the Zero Address (`0:000...000`)
- **Mechanism**: The Curve transfers LP tokens to the TON zero address (`0:0000000000000000000000000000000000000000000000000000000000000000`).
- **Advantages**: Truly irreversible; no private key exists to sign transactions from the zero address.
- **Critical Risks**:
  1. *Gas Starvation*: Sending Jettons to an address that does not yet possess an active Jetton Wallet requires deploying that wallet via `StateInit` in the transfer message ($\ge 0.05\text{ TON}$). If gas estimation is insufficient, the transfer fails or bounces.
  2. *Zero Verification Metadata*: Neither TonAPI, Tonkeeper, nor ANLGRAM's TokenVerificationEngine can query an on-chain getter to inspect lock parameters, duration, or pool provenance.

### G.3 Recommended Solution: Dedicated ANLGRAM Immutable LP Locker
A minimalist, immutable smart contract (`anlgram-lp-locker.fc`):
1. **Storage Scheme**:
   - `pool_address:MsgAddress` (DEX pool address)
   - `lp_wallet_address:MsgAddress` (Locker's LP token wallet)
   - `unlock_timestamp:uint64` (`0xFFFFFFFFFFFFFFFF` for permanent lock)
   - `creator_address:MsgAddress` (Informational)
2. **Immutable Guarantee**:
   - If `unlock_timestamp == 0xFFFFFFFFFFFFFFFF`, the contract has **NO code path for withdrawal**. Any message requesting transfer or burn throws TVM exit code 999.
3. **On-Chain Verifiability**:
   - Exposes public getter: `get_lock_data() returns (int is_permanent, int unlock_time, slice pool, slice lp_wallet)`.
   - Allows ANLGRAM’s TokenVerificationEngine and external explorers to display an independently verified "🔒 Liquidity 100% Permanently Locked" badge.

---

## SECTION H: PENDING PARAMETER DECISIONS FOR HUMAN APPROVAL

The mathematical and economic parameters in Phase 1B represent an isolated technical model. They must not be treated as production commitments until explicitly approved by platform governance.

| Parameter | Provisional Value | Proposed Options | Economic & Technical Implications |
| :--- | :--- | :--- | :--- |
| **Total Token Supply** ($S_{\text{total}}$) | $1,000,000,000$ ($1\text{B}$) | $1\text{B}$ vs. $100\text{M}$ vs. $10\text{B}$ | Standardizes market norms. $1\text{B}$ aligns with JettonPad, Ton.fun, and Pump.fun standards. |
| **Curve Allocation** ($S_{\text{curve}}$) | $800,000,000$ ($80\%$) | $80\%$ vs. $75\%$ vs. $85\%$ | Determines public trading depth prior to graduation. |
| **Graduation Allocation** ($S_{\text{grad}}$) | $200,000,000$ ($20\%$) | $20\%$ vs. $25\%$ vs. $15\%$ | Determines initial DEX pool depth upon graduation. |
| **Graduation Threshold** ($T_{\text{grad}}$) | $500\text{ TON}$ | $300\text{ TON}$ vs. $500\text{ TON}$ vs. $1,000\text{ TON}$ | $\$1,560$ vs. $\$2,600$ vs. $\$5,200$ (at $\$5.20/\text{TON}$). Lower accelerates graduation; higher deepens DEX liquidity. |
| **Virtual TON Reserve** ($v_{\text{TON}}$) | $30\text{ TON}$ | $20\text{ TON}$ vs. $30\text{ TON}$ vs. $50\text{ TON}$ | Governs initial price sensitivity and price growth multiplier ($312\times$ at $30\text{ TON}$). |
| **Protocol Trading Fee** ($\phi$) | $1.00\%$ ($100\text{ bps}$) | $0.50\%$ vs. $1.00\%$ vs. $1.50\%$ | Balances platform revenue against trader slippage drag. |
| **Fee Recipient Split** | $100\%$ Treasury | $80\%$ Treasury / $20\%$ Staking | Can direct protocol fees to the ANL Staking Router to enhance ANL token staking yield. |
| **Creator Allocation Policy** | $0\%$ (Fair Launch) | $0\%$ vs. Max $2\%$ | Fair launch eliminates team dump risk; optional creator purchase allows initial buy-in. |
| **Target DEX Router** | STON.fi v2 CPI | STON.fi v2 vs. DeDust.io | STON.fi has largest TVL; DeDust has native single-contract pools. |
| **Liquidity Lock Policy** | Immutable LP Locker | Permanent Lock vs. 1-Year Time-Lock | Permanent lock builds maximum market trust; time-lock allows future DEX migration. |

---

## SECTION I: PROVIDER-LAYER AUDIT FINDINGS

Inspection of [assets/js/blockchain-provider.js](file:///e:/ANLGRAM/assets/js/blockchain-provider.js) confirms:

1. **Network Isolation**: When initialized with `network: 'mainnet'`, the provider resolves strictly to `tonapi.io/v2` and `toncenter.com/api/v2`. It is impossible for a testnet endpoint to be queried under mainnet configuration.
2. **Address Sanitization & CRC16 Checksum**: Decodes 48-character TEP-2 friendly addresses and recalculates the CRC16-CCITT checksum over the 34-byte slice. Corrupted addresses are rejected client-side before any network request is issued.
3. **Conservative Failover Execution**:
   - `executeWithFailover` only invokes the fallback provider upon network timeouts, HTTP 429 (rate limits), or HTTP 5xx (server errors).
   - Client errors (HTTP 400, 404, invalid address) return immediately without failover waste.
4. **Distinction Between Fixture Tests and Live Endpoints**:
   - `test-blockchain-provider.js` uses dependency injection (`config.customFetch`) to test failovers deterministically offline.
   - For live staging tests (Phase 1D), real read-only HTTP calls through the Cloudflare Worker proxy (`https://tonapi-proxy.anlgram.workers.dev`) should be verified.
5. **Zero Balance vs. Uninitialized State**:
   - The provider explicitly normalizes account states into `'active'`, `'uninitialized'`, `'frozen'`, and `'nonexist'`.
   - Accounts with zero transactions report `balanceNano: '0'` and `status: 'uninitialized'`, preventing `null` or `undefined` crashes in downstream UI components.

---

## SECTION J: PROPOSED CORRECTIONS TO EXISTING TESTS

When Phase 2 begins, the following updates should be made to `minter-contract/test-bonding-curve-math.js`:

1. **Step-by-Step Monotonic Invariant Assertion**:
   Add $K_t \ge K_{t-1}$ checks to every trade cycle in the 12,000 fuzz test iterations.
2. **FDV vs. Market Cap Nomenclature**:
   Rename test variables from `marketCap` to `fullyDilutedValuation` when referencing $P_{\text{spot}} \times S_{\text{total}}$.
   Add separate test assertions for circulating market cap:
   ```javascript
   const circulatingSupply = engine.config.curveTokens - engine.realTokens;
   const marketCap = (engine.getCurrentSpotPriceNano() * circulatingSupply) / (10n ** engine.config.decimals);
   ```
3. **Sell Refund Invariant Test**:
   Add test cases verifying that when a sell is rejected due to slippage (`minTonOut` not met), the engine state ($x_{\text{real}}, y_{\text{real}}, A_{\text{fees}}$) is 100% restored with zero deviation.

---

## SECTION K: PRECISE PHASE 2 IMPLEMENTATION PLAN

Upon receiving explicit user authorization, implementation will proceed through the following phased steps:

```
Phase 1C Review (Current)
       │
       ▼ (Awaiting Human Approval)
Phase 2A: FunC Smart Contract Development (Isolated local files)
       │  ├─ anlgram-bonding-curve.fc
       │  ├─ anlgram-lp-locker.fc
       │  └─ Compile artifacts to JSON BOC via @ton-community/func-js
       ▼
Phase 2B: Offline TVM Simulation Unit Testing
       │  ├─ @ton/sandbox or @ton/core TVM tests (Zero network calls)
       │  ├─ Verify step-by-step invariant K_t >= K_{t-1}
       │  └─ Verify safe token-refund flow on rejected sells
       ▼
Phase 2C: Formal Testnet Deployment & Live Verification Gate
          └─ Explicit authorization required before any broadcast!
```

### Phase 2A: Contract Architecture
- `minter-contract/contracts/anlgram-bonding-curve.fc`:
  - 100% integer arithmetic matching `bonding-curve-math.js`.
  - State machine enforcing `STATE_UNINITIALIZED` through `STATE_GRADUATED`.
  - Inbound buy handler with excess TON bounce return.
  - Inbound sell handler with safe token refund on slippage violation.
  - Graduation liquidity lock triggering.
- `minter-contract/contracts/anlgram-lp-locker.fc`:
  - Immutable lock holding DEX LP tokens with public getter.

### Phase 2B: Local TVM Simulation Suite
- Author `minter-contract/test/bonding-curve-tvm.spec.ts` using `@ton/sandbox`.
- Emulate multi-step transactions: Buy $\to$ Sell $\to$ Large Buy $\to$ Graduation $\to$ Post-Graduation Sell Refund.
- Verify exact gas consumption profiles ($\approx 0.015 - 0.025\text{ TON}$ per trade).

---

## SECTION L: PROTOCOL RISKS REQUIRING INDEPENDENT AUDIT & TESTNET TESTING

The following technical risks cannot be resolved solely through offline modeling and require live testnet verification in Phase 2C:

1. **DEX Router API Evolution**: STON.fi v2 CPI router addresses and payload schemas differ between testnet and mainnet. Exact pool creation payloads must be verified against current STON.fi v2 contract artifacts.
2. **TVM Message Gas Bounds**: While estimated at $0.02\text{ TON}$, exact gas consumption for unpacking complex slices during `transfer_notification` refund flows must be measured in sandbox tests to prevent out-of-gas reverts.
3. **Asynchronous Network Latency**: In live TON execution, messages between the user, Jetton Wallet, Curve Contract, and Treasury may be separated by 1–3 blocks (5–15 seconds). Frontend UI must display pending optimistic states without claiming on-chain finality until confirmed.

---

> [!IMPORTANT]
> **PHASE 1C COMPLETE — MANDATORY STOPPING POINT**  
> All analysis, mathematical corrections, and architecture designs have been documented.  
> No smart contracts have been written or deployed.  
> No production code has been modified.  
> Awaiting user review and explicit approval of economic parameters before Phase 2.
