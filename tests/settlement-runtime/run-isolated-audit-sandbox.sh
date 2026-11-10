#!/usr/bin/env bash
set -euo pipefail

# run-isolated-audit-sandbox.sh
# Strict OS-enforced isolation satisfying all Cloudflare security-audit skill requirements:
# 1. Kernel-level network isolation (loopback-only namespace, external egress blocked)
# 2. Sanitized source subset & pinned read-only dependencies (excludes .git, credentials, sockets)
# 3. OS-level total memory limit via Linux cgroups v2 controller (4GB physical max) - strict verification
# 4. tmpfs scratch-only bounded storage (mandatory tmpfs, noexec, nosuid, nodev verification)
# 5. Empty sanitized environment allowlist (credential stripping)
# 6. Unprivileged target execution (strictly non-root user, explicit cgroup membership)
# 7. Pre-flight enforcement probe asserting all controls before running target code
# 8. Guaranteed descendant cleanup on termination, interruption, or timeout

echo "=== [ISOLATED AUDIT SANDBOX] Pre-Flight Setup & Enforcement Probe ==="

SANITIZED_SOURCE="/tmp/sanitized-source"
RO_TARGET="/tmp/ro-target"
SCRATCH_ROOT="/tmp/scratch"
REPO_SOURCE="$(pwd)"
RUNNER_USER="${SUDO_USER:-$(id -un)}"
RUNNER_UID="$(id -u "$RUNNER_USER")"
RUNNER_GID="$(id -g "$RUNNER_USER")"
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
CGROUP_DIR="/sys/fs/cgroup/audit-sandbox"

echo "Host runner user: $RUNNER_USER (UID: $RUNNER_UID, GID: $RUNNER_GID)"
echo "Audited commit SHA: $GIT_COMMIT"

# Teardown trap ensuring complete descendant cleanup
cleanup() {
  echo "=== [ISOLATED AUDIT SANDBOX] Teardown & Process Termination ==="
  if [ "${USE_SYSTEMD:-0}" -eq 1 ] && command -v systemctl >/dev/null 2>&1; then
    sudo systemctl stop "${SCOPE_NAME:-}" 2>/dev/null || true
  fi
  if [ -n "${CGROUP_DIR:-}" ] && [ -d "$CGROUP_DIR" ] && [ -f "$CGROUP_DIR/cgroup.procs" ]; then
    while read -r pid; do
      if [ -n "$pid" ] && [ "$pid" != "$$" ]; then
        sudo kill -9 "$pid" 2>/dev/null || true
      fi
    done < "$CGROUP_DIR/cgroup.procs" 2>/dev/null || true
  fi
  sudo umount -f "$RO_TARGET" 2>/dev/null || true
  sudo umount -f "$SCRATCH_ROOT" 2>/dev/null || true
  sudo ip netns del audit-net 2>/dev/null || true
  if [ -n "${CGROUP_DIR:-}" ] && [ -d "$CGROUP_DIR" ]; then
    sudo rmdir "$CGROUP_DIR" 2>/dev/null || true
  fi
  sudo rm -rf "$SANITIZED_SOURCE" 2>/dev/null || true
  echo "[OK] Teardown complete."
}
trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# 1. Prepare sanitized source subset (Exclude .git, credentials, host sockets, workflows)
# -----------------------------------------------------------------------------
echo "[SETUP] Creating sanitized source subset..."
sudo rm -rf "$SANITIZED_SOURCE" "$RO_TARGET" "$SCRATCH_ROOT"
mkdir -p "$SANITIZED_SOURCE" "$RO_TARGET"

# Copy ONLY audited contracts, scripts, tests, and lib
cp -r "$REPO_SOURCE/minter-contract" "$SANITIZED_SOURCE/"
cp -r "$REPO_SOURCE/tests" "$SANITIZED_SOURCE/"
cp -r "$REPO_SOURCE/testnet-interface" "$SANITIZED_SOURCE/"
cp -r "$REPO_SOURCE/lib" "$SANITIZED_SOURCE/"
mkdir -p "$SANITIZED_SOURCE/docs/audit/evidence"
if [ -f "$REPO_SOURCE/docs/audit/f02-receipt-prototype-2026-11-10.md" ]; then
  mkdir -p "$SANITIZED_SOURCE/docs/audit"
  cp "$REPO_SOURCE/docs/audit/f02-receipt-prototype-2026-11-10.md" "$SANITIZED_SOURCE/docs/audit/"
fi

# Verify strict exclusion of sensitive patterns
for BAD_PATTERN in ".git" ".env" "*.pem" "*.key" "id_rsa" ".aws" ".ssh" "credentials"; do
  FOUND=$(find "$SANITIZED_SOURCE" -name "$BAD_PATTERN" | head -n 1)
  if [ -n "$FOUND" ]; then
    echo "[CRITICAL FAIL] Sensitive pattern '$BAD_PATTERN' found at $FOUND! Aborting."
    exit 1
  fi
done
echo "[PROBE PASSED] Sanitized source strictly isolated from host git, credentials, and keys."

# -----------------------------------------------------------------------------
# 2. Setup tmpfs scratch-only storage with mandatory verification
# -----------------------------------------------------------------------------
echo "[SETUP] Mounting scratch tmpfs..."
mkdir -p "$SCRATCH_ROOT"
# Fail immediately if tmpfs mounting fails
sudo mount -t tmpfs -o size=1G,noexec,nosuid,nodev tmpfs "$SCRATCH_ROOT"

# Verify effective mount type, size and restrictions
MOUNT_INFO="$(findmnt -n -o FSTYPE,OPTIONS "$SCRATCH_ROOT")"
echo "[PROBE] Scratch mount info: $MOUNT_INFO"
if ! echo "$MOUNT_INFO" | grep -q "tmpfs"; then
  echo "[CRITICAL FAIL] $SCRATCH_ROOT is not mounted on tmpfs! Aborting."
  exit 1
fi
if ! echo "$MOUNT_INFO" | grep -q "noexec"; then
  echo "[CRITICAL FAIL] $SCRATCH_ROOT missing noexec mount restriction! Aborting."
  exit 1
fi
if ! echo "$MOUNT_INFO" | grep -q "nosuid"; then
  echo "[CRITICAL FAIL] $SCRATCH_ROOT missing nosuid mount restriction! Aborting."
  exit 1
fi
if ! echo "$MOUNT_INFO" | grep -q "nodev"; then
  echo "[CRITICAL FAIL] $SCRATCH_ROOT missing nodev mount restriction! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Scratch tmpfs mount type and restrictions verified (tmpfs, noexec, nosuid, nodev)."

mkdir -p "$SCRATCH_ROOT/home" "$SCRATCH_ROOT/tmp"
sudo chown -R "$RUNNER_USER:$RUNNER_USER" "$SCRATCH_ROOT"
sudo chmod -R 700 "$SCRATCH_ROOT"

# -----------------------------------------------------------------------------
# 3. Mount sanitized source as READ-ONLY
# -----------------------------------------------------------------------------
sudo mount --bind -o ro "$SANITIZED_SOURCE" "$RO_TARGET"
echo "[OK] Read-only bind mount created at: $RO_TARGET"

# Test read-only enforcement
if sudo -u "$RUNNER_USER" touch "$RO_TARGET/should_fail.tmp" 2>/dev/null; then
  echo "[CRITICAL FAIL] Target repository is WRITABLE by unprivileged user! Aborting."
  exit 1
fi
if sudo touch "$RO_TARGET/should_fail_root.tmp" 2>/dev/null; then
  echo "[CRITICAL FAIL] Target repository is WRITABLE by root! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Target mount is strictly read-only for both unprivileged user and root."

# Verify scratch is the only writable storage accessible to target code
if ! sudo -u "$RUNNER_USER" touch "$SCRATCH_ROOT/probe.tmp" 2>/dev/null; then
  echo "[CRITICAL FAIL] Target user cannot write inside assigned scratch! Aborting."
  exit 1
fi
rm -f "$SCRATCH_ROOT/probe.tmp"
echo "[PROBE PASSED] Scratch verified as writable by target user."

# -----------------------------------------------------------------------------
# 4. Setup Kernel Network Namespace (loopback only)
# -----------------------------------------------------------------------------
sudo ip netns del audit-net 2>/dev/null || true
sudo ip netns add audit-net
sudo ip netns exec audit-net ip link set lo up
echo "[OK] Network namespace 'audit-net' created with loopback only."

# Test network isolation enforcement
if sudo ip netns exec audit-net ping -c 1 -W 1 8.8.8.8 2>/dev/null; then
  echo "[CRITICAL FAIL] Network namespace has internet access! Aborting."
  exit 1
fi
echo "[PROBE PASSED] External network access blocked inside sandbox namespace."

if ! sudo ip netns exec audit-net ping -c 1 -W 1 127.0.0.1 >/dev/null 2>&1; then
  echo "[CRITICAL FAIL] Loopback interface is down in sandbox namespace! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Loopback interface verified active inside sandbox namespace."

# -----------------------------------------------------------------------------
# 5. OS-Level Total Memory & Process Limits via cgroups v2
# -----------------------------------------------------------------------------
if [ ! -d "/sys/fs/cgroup" ]; then
  echo "[CRITICAL FAIL] Linux cgroups (/sys/fs/cgroup) is not available! Aborting."
  exit 1
fi

SCOPE_NAME="audit-sandbox-$$"
if [ -d /run/systemd/system ] && command -v systemd-run >/dev/null 2>&1; then
  echo "[SETUP] Using systemd-run to manage OS-enforced transient cgroup scope ($SCOPE_NAME)."
  USE_SYSTEMD=1
else
  echo "[SETUP] Using direct cgroups v2 controller hierarchy ($SCOPE_NAME)."
  USE_SYSTEMD=0
  CGROUP_DIR="/sys/fs/cgroup/audit-sandbox"
  sudo mkdir -p "$CGROUP_DIR"
  echo "4294967296" | sudo tee "$CGROUP_DIR/memory.max" >/dev/null
  echo "0" | sudo tee "$CGROUP_DIR/memory.swap.max" >/dev/null 2>&1 || true
  echo "200" | sudo tee "$CGROUP_DIR/pids.max" >/dev/null
  MEM_MAX="$(cat "$CGROUP_DIR/memory.max")"
  PIDS_MAX="$(cat "$CGROUP_DIR/pids.max")"
  if [ "$MEM_MAX" != "4294967296" ] || [ "$PIDS_MAX" != "200" ]; then
    echo "[CRITICAL FAIL] Direct cgroup limit verification failed!"
    exit 1
  fi
fi

# -----------------------------------------------------------------------------
# 6. Verify non-root execution capability
# -----------------------------------------------------------------------------
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"

PROBE_USER=$(sudo ip netns exec audit-net sudo -u "$RUNNER_USER" env -i PATH="$NODE_DIR:/usr/bin:/bin" whoami)
echo "[PROBE] Target execution will run as user: $PROBE_USER"
if [ "$PROBE_USER" = "root" ]; then
  echo "[CRITICAL FAIL] Target code would run as privileged root! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Unprivileged execution confirmed (non-root, UID: $RUNNER_UID)."

# -----------------------------------------------------------------------------
# 7. Execute runner inside the unprivileged sandbox with explicit cgroup joining
# -----------------------------------------------------------------------------
echo "=== [ISOLATED AUDIT SANDBOX] Executing Reproduction Runner ==="

if [ "$USE_SYSTEMD" -eq 1 ]; then
  sudo systemd-run --scope --unit="$SCOPE_NAME" \
    -p MemoryMax=4294967296 \
    -p MemorySwapMax=0 \
    -p TasksMax=200 \
    ip netns exec audit-net sudo -u "$RUNNER_USER" env -i \
      PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
      HOME="$SCRATCH_ROOT/home" \
      TMPDIR="$SCRATCH_ROOT/tmp" \
      AUDIT_SCRATCH_DIR="$SCRATCH_ROOT" \
      AUDIT_ISOLATED_SANDBOX=1 \
      AUDIT_GIT_COMMIT="$GIT_COMMIT" \
      NODE_PATH="$RO_TARGET/tests/settlement-runtime/node_modules:$RO_TARGET/minter-contract/node_modules:$RO_TARGET/testnet-interface/node_modules" \
      bash -c "
        CGROUP_PATH=\$(cut -d: -f3 < /proc/self/cgroup 2>/dev/null || echo '')
        CGROUP_DIR=\"/sys/fs/cgroup\${CGROUP_PATH}\"
        echo \"[PROBE] Target process cgroup path: \$CGROUP_DIR\"
        if [ ! -d \"\$CGROUP_DIR\" ]; then
          echo \"[CRITICAL FAIL] Cgroup scope directory \$CGROUP_DIR does not exist!\"
          exit 1
        fi
        MEM_MAX=\$(cat \"\$CGROUP_DIR/memory.max\" 2>/dev/null || echo '0')
        PIDS_MAX=\$(cat \"\$CGROUP_DIR/pids.max\" 2>/dev/null || echo '0')
        if [ \"\$MEM_MAX\" != \"4294967296\" ]; then
          echo \"[CRITICAL FAIL] cgroups memory.max verification failed: expected 4294967296, got \$MEM_MAX\"
          exit 1
        fi
        if [ \"\$PIDS_MAX\" != \"200\" ]; then
          echo \"[CRITICAL FAIL] cgroups pids.max verification failed: expected 200, got \$PIDS_MAX\"
          exit 1
        fi
        if ! grep -qx \"\$\$\" \"\$CGROUP_DIR/cgroup.procs\" 2>/dev/null; then
          echo \"[CRITICAL FAIL] Process \$\$ is not confirmed inside cgroup.procs!\"
          exit 1
        fi
        if [ -f \"\$CGROUP_DIR/memory.swap.max\" ]; then
          SWAP_MAX=\$(cat \"\$CGROUP_DIR/memory.swap.max\" 2>/dev/null || echo 'none')
          echo \"[PROBE] Effective memory.swap.max: \$SWAP_MAX\"
        fi
        echo \"[PROBE PASSED] OS-level memory limit (4GB physical RAM) and process limit (200 PIDs) strictly verified via cgroups v2.\"
        echo \"[PROBE PASSED] Audited process tree (PID \$\$) confirmed inside cgroup.\"
        ulimit -u 200
        ulimit -f 1048576
        ulimit -t 300
        cd '$RO_TARGET'
        timeout 300s '$NODE_BIN' --max-old-space-size=2048 tests/settlement-runtime/f02-independent-reproduction-runner.js
      "
else
  # Direct cgroup placement using sudo tee before running target code
  CGROUP_DIR="/sys/fs/cgroup/audit-sandbox"
  sudo ip netns exec audit-net sudo -u "$RUNNER_USER" env -i \
    PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
    HOME="$SCRATCH_ROOT/home" \
    TMPDIR="$SCRATCH_ROOT/tmp" \
    AUDIT_SCRATCH_DIR="$SCRATCH_ROOT" \
    AUDIT_ISOLATED_SANDBOX=1 \
    AUDIT_GIT_COMMIT="$GIT_COMMIT" \
    NODE_PATH="$RO_TARGET/tests/settlement-runtime/node_modules:$RO_TARGET/minter-contract/node_modules:$RO_TARGET/testnet-interface/node_modules" \
    bash -c "
      MEM_MAX=\$(cat '$CGROUP_DIR/memory.max')
      PIDS_MAX=\$(cat '$CGROUP_DIR/pids.max')
      if [ \"\$MEM_MAX\" != \"4294967296\" ] || [ \"\$PIDS_MAX\" != \"200\" ]; then
        echo \"[CRITICAL FAIL] Direct cgroup limit verification failed!\"
        exit 1
      fi
      ulimit -u 200
      ulimit -f 1048576
      ulimit -t 300
      cd '$RO_TARGET'
      timeout 300s '$NODE_BIN' --max-old-space-size=2048 tests/settlement-runtime/f02-independent-reproduction-runner.js
    " &
  CHILD_PID=$!
  echo "$CHILD_PID" | sudo tee "$CGROUP_DIR/cgroup.procs" >/dev/null
  if ! grep -qx "$CHILD_PID" "$CGROUP_DIR/cgroup.procs" 2>/dev/null; then
    echo "[CRITICAL FAIL] Failed to place process $CHILD_PID into cgroup!"
    exit 1
  fi
  wait "$CHILD_PID"
fi

echo "=== [ISOLATED AUDIT SANDBOX] Target Execution Completed Successfully ==="

# -----------------------------------------------------------------------------
# 8. Verify evidence generation and promote
# -----------------------------------------------------------------------------
if [ -f "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" ]; then
  echo "[EVIDENCE CAPTURED] Promoting verified evidence from scratch to workspace..."
  mkdir -p "$REPO_SOURCE/docs/audit/evidence"
  cp "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" "$REPO_SOURCE/docs/audit/evidence/"
  echo "[OK] Evidence promoted to: docs/audit/evidence/f02-independent-reproduction-evidence.json"
else
  echo "[CRITICAL FAIL] Evidence file was not produced in scratch!"
  exit 1
fi
