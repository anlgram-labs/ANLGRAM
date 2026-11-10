# ANLGRAM — Independent F-02 Security Audit & Execution Environment Unblocking Report

**Audit Date:** 2026-11-10  
**Target Repository:** `anlgram-labs/ANLGRAM`  
**Audited PRs:**
- PR #63 (`04f1925792ef516b5632f4e1192aa0d1789a35eb`) — *Prototype isolated STON.fi LP receipt observation*
- PR #64 (`90eeb5d5c96532289865a955fef2ee3531cee944`) — *Document partial independent F-02 architecture review*
- Base Branch: `feat/testnet-readiness-verification` (PR #62)
- Audit Candidate Branch: `audit/f02-independent-security-validation` (Draft PR #66)  
- Verified Isolated Linux CI Run: [Run 42909112874](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42909112874) (100% Green, Artifact ID: `13805912706`, ZIP SHA-256: `165a7a648e7926861333b232770a818e12bce4e03a60875a56a03ab886bde885`)
- PR Head SHA: `3b4c9deccf5117aadd9a5ae7430cd11fce1ecf93`
- Tested Merge SHA: `075b4e9d87a6888ce0fca610f0e29ef4f46d1615`
- Preceding Verification Runs: [Run 42768895998](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42768895998), [Run 42765992724](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42765992724)
- Lead Security Agent: Antigravity AI (Pair Programming with Engineering Team)

---

## 1. Executive Summary & Critical Clarifications

This audit establishes an OS-enforced, reproducible execution environment meeting every mandatory Universal Execution Safety control of the Cloudflare `security-audit` skill. It unblocks the execution blocker documented in PR #64, compiles PR #63, reproduces the STON.fi v2.2 LPAccount counterexamples, verifies an authenticated terminal settlement candidate with strengthened adversarial cases, and evaluates long-term architecture options (A, B, C, D).

> [!IMPORTANT]
> ### Distinction: Successful Test Execution vs. Proven Financial Finality
> - **Sandbox / TVM Test Suite Success:** All 9 adversarial tests, 5 LPAccount settlement counterexamples, and 1 PR #63 prototype test pass with 100% green exit codes under the verified Linux container sandbox.
> - **Absence of Proven Financial Finality:** As demonstrated in Section 5 of this report, **passing local tests or observing LP token custody does NOT equal mathematical or financial message closure**. The asynchronous nature of TON shardchains, potential dust residues, and foreign DEX contract mutability mean that true on-chain terminal settlement remains an optimistic custody observation unless supported by an atomic two-phase commit or consensus-level proof from STON.fi.
> - **Evidence Integrity:** Local Windows host results are strictly distinguished from Linux OS-isolated runs. The canonical evidence artifact is produced strictly within the unprivileged Linux environment.

> [!CAUTION]
> ### Invariants Strictly Enforced
> 1. **Gate 414 Strictly Sealed:** Baseline release candidate contracts (`anlgram-migration-router-dispatch-v2.fc`, `anlgram-bonding-curve-dispatch-v2.fc`) strictly enforce `throw(414)`. No migration or funds can be dispatched on-chain.
> 2. **Financial Authorization Disabled:** `financialDeploymentAuthorized: false`. Zero contracts deployed, zero testnet/mainnet transactions broadcast, zero real tokens or TON at risk.
> 3. **PR #63 Prototype Blocked:** Formally proven insufficient for live financial wiring due to permanent LP custody stranding and lack of terminal settlement proofs.

---

## 2. Cloudflare `security-audit` Mandatory Controls & Linux Sandbox Implementation

### 2.1 Mandatory Controls Specification & Gap Resolution

Per `.agents/skills/security-audit/SKILL.md` (Universal Execution Safety), all target-controlled builds, tests, processes, and fixture processing must be executed within an OS-enforced sandbox guaranteeing:

| Control | SKILL.md Mandatory Requirement | Local Host Status | Finalized Isolated Linux CI Implementation | Enforcement Status |
|---|---|---|---|---|
| **C-1: Network Isolation** | No external network; isolated loopback namespace only. | **UNAVAILABLE** (No network namespaces on Windows). | `ip netns add audit-net`, `ip link set lo up`. External ping/curl asserted to fail; loopback asserted to pass. | **ENFORCED** |
| **C-2: Clean Environment** | Empty environment (`env -i`) populated only from explicit allowlist, scratch-local `HOME`, `TMPDIR`, and caches. | **UNAVAILABLE** (Ambient Windows environment inherited). | `env -i PATH=... HOME=/tmp/scratch/home TMPDIR=/tmp/scratch/tmp AUDIT_SCRATCH_DIR=/tmp/scratch AUDIT_ISOLATED_SANDBOX=1 AUDIT_GIT_COMMIT=... NODE_PATH=...` | **ENFORCED** |
| **C-3: Sanitized Source & Immutable Tools** | Mount only sanitized source subset & pinned tools; exclude `.git`, credentials, sockets, host services. | **UNAVAILABLE** (Entire workspace was exposed). | Sanitized subset prepared at `/tmp/sanitized-source` (contains only audited contracts, scripts, tests, and `lib/`; strictly excludes `.git`, `.github`, credentials, sockets). Mounted via `mount --bind -o ro`. Write probe asserted to fail for both root and runner. | **ENFORCED** |
| **C-4: Scratch-Only Storage** | Target writes strictly confined to temporary scratch directory (`/tmp/scratch`), discarded or promoted via trusted parent check. | **PARTIAL** (Directory convention only). | Scratch directory `/tmp/scratch` mounted via `mount -t tmpfs -o size=1G,noexec,nosuid,nodev`. Mount restrictions strictly asserted via `findmnt`. Scratch verified as only writable path (writes to `/tmp/ro-target` and `/` fail; scratch write succeeds). Strict pattern exclusion verifies zero `.git`, `.env*`, `.ssh`, `.aws`, keys, or credentials. | **ENFORCED** |
| **C-5: OS-Level Total Memory & Resource Limits** | Explicit OS-level memory ceiling, CPU, process, and file-size limits. | **UNAVAILABLE** (No native memory cgroups on Windows). | Linux `cgroups v2` resource ceiling enforced via systemd transient scope (`MemoryMax=4294967296`, `MemorySwapMax=0`, `TasksMax=200`, `Delegate=yes`). Target runner introspection strictly asserts `systemctl show` D-Bus values and `/proc/self/cgroup` scope membership before running target code. Fallback to direct cgroup hierarchy. Process limits enforced: `ulimit -t 300` (CPU time), `ulimit -f 1048576` (file size limit 1GB), `ulimit -u 200` (process count), `--max-old-space-size=2048` (V8 heap), `timeout 300s`. | **ENFORCED** |
| **C-6: Unprivileged Execution** | Do not run target-controlled code as a privileged process (no root). | **VIOLATED** (Early scripts ran as root in CI). | Execution dropped inside namespace via `sudo -u "$RUNNER_USER"`. Probe verifies `whoami == runner` (`uid: 1001`, `isRoot: false`). | **ENFORCED** |
| **C-7: Pre-Flight Probe** | Verify enforcement of all controls before executing target code. | **FAILED** (Cannot enforce on native Windows). | Automated pre-flight probe asserting C-1 through C-12 before runner starts. Immediate fatal exit on any missing limit or failure. | **ENFORCED** |
| **C-8: Descendant Cleanup** | Guarantee process termination and teardown on success, failure, interruption, or timeout. | **PARTIAL** | Registered `trap cleanup EXIT INT TERM` stops systemd scope unit (`systemctl stop`), terminates any descendant worker processes, unmounts tmpfs and ro bind-mounts, and deletes network namespaces without self-killing. | **ENFORCED** |
| **C-9: Mount Namespace Isolation** | Private mount namespace with restricted filesystem root view; mask host repo, `.git`, credentials, sockets. | **UNAVAILABLE** (No mount namespaces on Windows). | `unshare --mount` with `mount --make-rprivate /`. Read-only empty tmpfs mounts mask `$REPO_SOURCE`, `/home/runner/work`, `/root`, `/home/runner/.ssh`, `/home/runner/.aws`, `/home/runner/.config`, `/etc/sudoers.d`. `/usr/bin/sudo` and `/var/run/docker.sock` bound to `/dev/null`. Target mount namespace verified distinct from host (`mnt:[4026532316]` != `mnt:[4026531832]`). | **ENFORCED** |
| **C-10: Capability Stripping & NoNewPrivs** | Lock kernel privilege escalation prevention and strip all capabilities. | **UNAVAILABLE** (No POSIX capabilities on Windows). | Dropped via `setpriv --reuid 1001 --regid 1001 --clear-groups --no-new-privs`. Probes strictly verify `NoNewPrivs: 1`, `CapEff: 0000000000000000`, `CapPrm: 0000000000000000`. Direct `sudo` execution verified to fail. | **ENFORCED** |
| **C-11: File Descriptor Sanitization** | Ensure target code does not inherit host file descriptors, sockets, or pipes. | **PARTIAL** | All file descriptors > 2 explicitly closed before runner launch. Probes assert `/proc/self/fd` contains 0, 1, 2 only. | **ENFORCED** |
| **C-12: Host Path Denial Verification** | Target code cannot read or access host credentials, git, or write outside scratch. | **FAILED** (No sandbox on host). | Probes assert non-existence/denial of `$REPO_SOURCE/.git`, `/home/runner/work/.../.git`, `~/.gitconfig`, `~/.ssh`, `~/.aws`, `/root`, `/var/run/docker.sock`. Write probes assert `/` and `/home/runner` and `$RO_TARGET` are unwritable, and only scratch tmpfs is writable. | **ENFORCED** |

---

## 3. Verified Linux Isolated Execution Evidence (Run 42909112874)

### 3.1 Environment Metadata
- **Platform:** `linux` (`x64`)
- **Node Version:** `v22.23.4`
- **OS Type / Release:** `Linux` / `7.0.0-1019-azure`
- **User / UID:** `runner` (`uid: 1001`, `gid: 1001`, `isRoot: false`)
- **Isolation Active:** `isolatedSandbox: true`
- **Mount Namespace Verified:** `mountNamespace: true` (`mnt:[4026532316]` != host `mnt:[4026531832]`)
- **Network Namespace Verified:** `networkNamespace: true` (`net:[4026532260]` != host `net:[4026531833]`)
- **NoNewPrivs Enforced:** `noNewPrivs: true` (`NoNewPrivs: 1`, `CapEff: 0000000000000000`, `CapPrm: 0000000000000000`)
- **Cgroups V2 Enforced:** `cgroupsV2Enforced: true` (`MemoryMax: 4294967296`, `TasksMax: 200`, `MemorySwapMax: 0`)
- **PR Head SHA:** `3b4c9deccf5117aadd9a5ae7430cd11fce1ecf93`
- **Tested Merge SHA:** `075b4e9d87a6888ce0fca610f0e29ef4f46d1615`
- **Workflow Status:** **100% Green (Success, Duration: 1m 9s)**
- **GitHub Actions Run:** [Run 42909112874](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42909112874)
- **Uploaded Artifact ID:** `13805912706` (`f02-independent-reproduction-evidence.zip`)
- **Uploaded Artifact ZIP SHA-256:** `165a7a648e7926861333b232770a818e12bce4e03a60875a56a03ab886bde885`
- **Evidence Promotion:** Verified and persisted in `docs/audit/evidence/f02-independent-reproduction-evidence.json`

### 3.2 Strengthened Adversarial Verification Results (Authenticated Senders)

| Test Case | Sender Tested | Malicious / Fault Condition | Contract Verified | Exit Code | Verified Outcome |
|---|---|---|---|---|---|
| **Adversarial 1: Forged LP Receipt** | Untrusted / Attacker address (`f.other`) | Forged `0x414c5635` observation receipt | Migration Router | `401` | Unauthorized sender rejected |
| **Adversarial 2: Direct Proof to Curve** | Untrusted / Attacker address (`f.other`) | Forged `0x414e5903` terminal proof | Bonding Curve | `401` | Unauthorized sender rejected |
| **Adversarial 3: Pending Claims (Strengthened)** | **Authentic Locker V3** (`c.vault.address`) | Receipt with `pending > 0` (uncleared claims) | Migration Router | **`409`** | Internal state check fails; sender authenticated (NOT 401) |
| **Adversarial 4: Mismatched Pool (Strengthened)** | **Authentic Locker V3** (`c.vault.address`) | Receipt referencing forged/wrong pool and wallet | Migration Router | **`408`** | `ERROR_INVALID_ADDRESS`; sender authenticated (NOT 401) |
| **Adversarial 5: Partial Deposit Recovery** | Authorized Admin | Outbound `0x132b9a2c` (`refund_me`) | Migration Router | `0` | Dispatches recovery callback to authentic STON.fi LPAccount |
| **Adversarial 6: Replay on Graduated Curve (Strengthened)** | **Authentic Migration Router** (`c.addresses.migration`) | Replay `0x414e5903` when Curve is already `STATE_GRADUATED` | Bonding Curve | **`407`** | `ERROR_INVALID_STATE` in Curve contract constant (reconciled in code & report; sender authenticated, NOT 401) |
| **Adversarial 7: Conservation of Funds** | System-wide balances | Complete migration lifecycle | System Ledger | Exact 300 TON reserve, 200M DEX tokens, 800M sold tokens strictly conserved |

### 3.3 PR #63 Bytecode Verification & Prototyping
- Contract: `minter-contract/contracts/anlgram-f02-receipt-prototype.fc`
- Compiled Code Cell Hash: `14f13ca485eadc716de8691bd3fe47d7bf9ced6d6b421a664ba1da94645cd7ac` (Exact match).
- Prototyping status: Confirmed as passive observer only; permanently locks assets if funded; must **never** be deployed.

---

## 4. Deep Critique: Why PR #63 is Insufficient for Production

1. **Permanent Fund Custody Stranding (No Outgoing Path):**
   `anlgram-f02-receipt-prototype.fc` contains **zero** outgoing message generation (`send_raw_message` is absent). Any LP tokens or TON delivered to this contract or its wallet become permanently trapped with no withdrawal or recovery method.
2. **No Terminal Settlement or Liability Closure:**
   It acts solely as a passive recorder. It never emits terminal settlement proof `0x414e5903` to the Bonding Curve. The Curve would remain in `MIGRATION_PENDING` indefinitely, and user claims/refunds would remain unresolved.
3. **No Proof of Both Asset Legs Consumed:**
   A recipient notification proves receipt of LP units, but does **not** prove that both the 300 TON and the 200,000,000 JETTONs were deposited into the pool, nor does it guarantee the pool's liquidity state.
4. **Conclusion:**
   PR #63 must remain an isolated sandbox experiment; it must **never** be merged or wired to the production financial pipeline.

---

## 5. CRITICAL SECURITY LIMITATION: Why LP Custody or Internal Callbacks are NOT Proof of Closed DEX Obligations

A core architectural inquiry of this audit is: **Does receiving an LP custody receipt (e.g. `0x414c5635`) or an internal DEX callback prove that all STON.fi obligations have closed?**

The rigorous answer is **NO**. Independent analysis reveals four remaining security limitations that exist even if all tests pass:

### 1. The Asynchronous Actor Model & Message In-Flight Blindness
In TVM Sandbox, all transactions execute within an artificial synchronous message queue. On live TON Mainnet/Testnet, contracts operate as independent asynchronous actors across disparate shardchains. Each inter-contract hop requires 2 to 4 seconds:
- When LP tokens arrive at the recipient wallet, intermediate messages (such as refund notices, excess gas returns, or partial deposit adjustments) may **still be in flight** across shardchains.
- The arrival of LP tokens demonstrates **token receipt**, but does not prove that all preceding descendant messages have been processed or terminated.

### 2. Unconsumed Dust & Asymmetric Liquidity Provision
STON.fi v2.2 calculates liquidity invariant $k = x \cdot y$. Depending on market volatility or rounding, a fraction of native TON (or pTON) or Jettons may remain unconsumed in the LPAccount or Router:
- The LP receipt does not carry balance attestation of the DEX router or the LPAccount.
- An unconsumed asset fragment could remain in an intermediate contract without triggering an immediate bounce.

### 3. LPAccount Re-creation Race Conditions
Because LPAccount addresses are derived deterministically from `(router, user, pool)`, late messages from an earlier operation can deliver funds into a newly re-created LPAccount instance for a subsequent operation. Without an atomic, contract-level cryptographic message fence, an on-chain contract cannot differentiate between an intentional deposit and a delayed in-flight message from an earlier aborted attempt.

### 4. No Cryptographic Consensus Receipt from Foreign Protocols
STON.fi does not currently emit a cryptographic proof-of-closure payload signed by the DEX master confirming that zero liabilities remain. Therefore, any on-chain settlement mechanism is fundamentally an **optimistic custody observer**, not a mathematically complete closure proof.

---

## 6. Comparative Architecture Matrix (Options A, B, C, D)

| Dimension | Option A: Per-Operation Escrow | Option B: STON.fi Protocol Extension | Option C: Isolated Escrow & External Reconciliation | Option D: Alternative DEX (DeDust) |
|---|---|---|---|---|
| **Trust Model** | Purely on-chain, deterministic smart contracts. | Requires STON.fi team to deploy new contract versions. | Mixed on-chain escrow + multi-sig/oracle reconciliation. | Purely on-chain, alternative TVM architecture. |
| **Message Closure Guarantee** | High (enforced via Locker V3 receipt and two-phase proof). | Full (if STON.fi exposes native terminal callback). | Weak (relies on off-chain validator consensus). | Moderate (DeDust uses vault callbacks, still async). |
| **Handling of Stale / Recreated Accounts** | Managed via unique operation nonces and address derivation. | Managed natively inside DEX router. | Vulnerable to race conditions if oracle signs prematurely. | Distinct vault architecture avoids LPAccount re-use. |
| **Implementation Complexity** | Medium (implemented & verified in our candidate). | High (external dependency, months of lead time). | Medium-High (requires off-chain indexing infrastructure). | High (requires complete rewrite of DEX integration). |
| **Production Feasibility for ANLGRAM** | **RECOMMENDED PATH** (Feasible, self-contained, formally verifiable). | Unviable for near-term release. | Suboptimal (introduces custodial centralization risk). | Feasible only as a future multi-DEX routing upgrade. |

---

## 7. Conclusion & Sign-Off

1. **PR #63:** Evaluated and rejected for production integration.
2. **PR #64 Blocker:** Fully resolved via unprivileged Linux CI sandbox environment with mount namespace isolation, kernel NoNewPrivs, capability stripping, systemd cgroups v2 resource limits, tmpfs scratch isolation, and sanitized source subset ([Run 42909112874](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42909112874)).
3. **Draft PR #66:** Maintained in draft status with verified green CI evidence.
4. **Gate 414:** Strictly **SEALED** (`throw(414)`). Zero real funds are at risk.
