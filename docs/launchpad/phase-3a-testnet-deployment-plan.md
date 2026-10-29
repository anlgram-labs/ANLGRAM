# ANLGRAM Phase 3A — Testnet Deployment Preflight Plan & Remediation Dossier

**Status: RESOLVED & READY FOR HUMAN REVIEW — Strict Directed Acyclic Graph (DAG) verified; Circular dependencies eliminated via authorized one-time initialization mechanisms.**

## Scope completed in this package

- Read-only preflight planner for `minter-contract/deploy-launchpad-testnet.js`.
- Strict Directed Acyclic Graph (DAG) topological derivation.
- Remediation of circular stored-address dependencies across `Bonding Curve`, `Migration Router`, and `LP Locker`.
- Implementation of pre-authorized, one-time bootstrap operations:
  - `op::init_lp_locker` (`0x414e4c39`) with admin authentication and one-time state transition (`is_router_initialized`).
  - `op::init_launchpad` (`0x414e4c01`) with admin authentication and transition from `STATE_UNINITIALIZED` to `STATE_INITIALIZING`.
- Direct emission of `op::lp_locked_confirmation` (`0x414e4c33`) from `LP Locker` directly to `curve_address`.
- Offline unit tests for network gates, safe flags, exact TON unit conversion, and acyclic DAG validation (9/9 passed).
- TVM simulation test suite expanded to 97 assertions (97/97 passed).
- No transaction-signing or broadcast code is included.
- No mnemonic is loaded by any preflight mode.

---

## Architectural Remediation: Circular Dependencies Resolved

### The Problem Identified in Phase 3A Preflight
Prior source structures contained circular StateInit dependencies:
1. `Bonding Curve` stored `migration_router_address` and `lp_locker_address` in initial data.
2. `Migration Router` stored `curve_address` and `lp_locker_address` in initial data.
3. `LP Locker` stored `authorized_caller` (intended as Router for `set_lp_wallet`, but Curve for `lp_locked_confirmation`).

Because TVM contract addresses equal $\text{Hash}(\text{StateInit})$, mutual initial-data references created an unresolvable cycle where addresses could not be predicted without inventing mock data.

### The Acyclic Resolution: Strict Directed Acyclic Graph (DAG)

| Step | Contract | Initial Stored Address Dependencies | Resolution Mechanism |
| :--- | :--- | :--- | :--- |
| **1** | **Launchpad Jetton Master** | None (`[]`) | Deployed with deployer admin. Fixed deterministic address. |
| **2** | **Bonding Curve** | `[Launchpad Jetton Master]` | Deployed in `STATE_UNINITIALIZED` (0) with `lp_locker_address` and `migration_router_address` set to standard TON `addr_none$00`. Trading is completely disabled in this state. |
| **3** | **LP Locker** | `[Bonding Curve]` | Deployed with authentic `curve_address` (from Step 2). `router_address` initialized as `addr_none$00` with `is_router_initialized = 0`. |
| **4** | **Migration Router** | `[Launchpad Jetton Master, Bonding Curve, LP Locker]` | Deployed with authentic addresses of Minter, Curve, and Locker. Contains zero uninitialized references. |

### Post-Deployment One-Time Bootstrap Sequence

1. **LP Locker Initialization**:
   - Deployer sends `op::init_lp_locker` (`0x414e4c39`) with `Migration Router` address.
   - Guarded by `throw_unless(ERROR_UNAUTHORIZED_SENDER, equal_slices(sender_address, admin_address))`.
   - Guarded by `throw_if(ERROR_ALREADY_INITIALIZED, is_router_initialized == 1)`.
   - Guarded against empty address (`preload_uint(2) == 0`).
2. **Bonding Curve Initialization**:
   - Deployer sends `op::init_launchpad` (`0x414e4c01`) with Minter, Locker, and Router addresses.
   - Automatically computes `curve_jetton_wallet` if `addr_none`.
   - Transitions `state = STATE_INITIALIZING` (1).
   - Rejects duplicate calls with `ERROR_INVALID_STATE` (407).
3. **Supply Custody & Admin Renounce**:
   - Deployer mints 1,000,000,000 tokens to `Bonding Curve`.
   - Curve receives tokens, emits `op::change_admin(addr_none)` to Jetton Master.
   - Jetton Master emits `op::admin_changed_notification` back to Curve.
   - Curve transitions to `STATE_ACTIVE` (3), permanently activating AMM trading.

---

## What the Tool Checks

- Current Git branch and repository status (read-only).
- Differences from the recorded baseline for the listed protected paths (verified 0 paths).
- Current source files and compiled JSON artifacts.
- Artifact code-cell hash and serialized BOC SHA-256 against metadata.
- In-memory FunC recompilation against committed artifacts, without writing build files.
- Explicit testnet-only environment configuration.
- Mainnet endpoint rejection.
- Dependency-graph validation: verifies zero cycles and verified DAG.

---

## Safe Verification Commands

From the repository root in PowerShell:

```powershell
# 1. Inspect Plan, Artifact Hashes & DAG Structure
node minter-contract/deploy-launchpad-testnet.js --show-plan

# 2. Run Offline Preflight Unit Tests (9/9 assertions)
node --test minter-contract/test-deploy-launchpad-testnet.js

# 3. Run TVM Contract Simulation Suite (97/97 assertions)
node test-bonding-curve-tvm.js

# 4. Run Bonding Curve Math Suite (46/46 assertions; 12,000 fuzz cycles)
node minter-contract/test-bonding-curve-math.js

# 5. Run Blockchain Provider Suite (25/25 assertions)
node test-blockchain-provider.js

# 6. Verify Testnet Network Configuration (Read-only, no mnemonic loaded)
node -e "process.env.TON_NETWORK='testnet'; process.env.TON_GLOBAL_ID='-3'; process.env.TONCENTER_TESTNET_URL='https://testnet.toncenter.com/api/v2'; process.env.TONAPI_TESTNET_URL='https://testnet.tonapi.io/v2'; process.env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS='kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-'; process.env.STONFI_TESTNET_ROUTER='kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v'; process.env.STONFI_TESTNET_PTON_MASTER='kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px'; require('./minter-contract/deploy-launchpad-testnet.js').main(['--verify-config'], process.env)"

# 7. Comprehensive Preflight Dry Run (Read-only, no mnemonic loaded)
node -e "process.env.TON_NETWORK='testnet'; process.env.TON_GLOBAL_ID='-3'; process.env.TONCENTER_TESTNET_URL='https://testnet.toncenter.com/api/v2'; process.env.TONAPI_TESTNET_URL='https://testnet.tonapi.io/v2'; process.env.ANLGRAM_TESTNET_DEPLOYER_ADDRESS='kQBzQx6SZa94aoiJFfaHPV-cJ1EV-Y74djNEKwv1Z5GOn06-'; process.env.STONFI_TESTNET_ROUTER='kQALh-JBBIKK7gr0o4AVf9JZnEsFndqO0qTCyT-D-yBsWk0v'; process.env.STONFI_TESTNET_PTON_MASTER='kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px'; require('./minter-contract/deploy-launchpad-testnet.js').main(['--dry-run'], process.env)"
```

---

## Production Safety

- **0 Bytes Changed** across all 20 protected production files (`index.html`, `assets/js/*`, `cloudflare-worker.js`, etc.).
- No live network transactions broadcast.
- No mnemonics or private keys loaded or requested.
- Exclusively local read-only execution and compilation verification.

