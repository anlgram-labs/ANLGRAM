#!/usr/bin/env bash
set -euo pipefail

# isolated-target-runner.sh
# Audited target code execution entrypoint running strictly inside:
# - Unprivileged non-root runner user
# - Network-isolated namespace (loopback only)
# - Read-only mounted source and toolchain
# - OS-enforced cgroups v2 resource ceiling (4GB physical memory, 200 PIDs)

echo "=== [ISOLATED TARGET RUNNER] Initializing Inside Sandbox Boundary ==="

# 1. Print and verify process context
RUNNER_USER="$(whoami)"
RUNNER_UID="$(id -u)"
echo "[PROBE] Execution user: $RUNNER_USER (UID: $RUNNER_UID)"
if [ "$RUNNER_UID" -eq 0 ] || [ "$RUNNER_USER" = "root" ]; then
  echo "[CRITICAL FAIL] Target code running as privileged root! Aborting."
  exit 1
fi

# 2. Inspect and verify cgroup v2 membership and resource limits
echo "[PROBE] Inspecting process cgroup hierarchy..."
cat /proc/self/cgroup

CGROUP_REL_PATH="$(cut -d: -f3 < /proc/self/cgroup)"
echo "[PROBE] Relative cgroup path: $CGROUP_REL_PATH"

if [ -z "$CGROUP_REL_PATH" ] || [ "$CGROUP_REL_PATH" = "/" ]; then
  CGROUP_DIR="/sys/fs/cgroup"
else
  CGROUP_DIR="/sys/fs/cgroup${CGROUP_REL_PATH}"
fi

echo "[PROBE] Target cgroup directory: $CGROUP_DIR"
ls -ld "$CGROUP_DIR" 2>&1 || true
ls -la /sys/fs/cgroup/system.slice 2>&1 | head -n 30 || true

# Check if systemd unit is active
SCOPE_UNIT="$(systemctl list-units --type=scope 2>/dev/null | grep audit-sandbox | awk '{print $1}' || echo '')"
if [ -n "$SCOPE_UNIT" ]; then
  echo "[PROBE] Discovered active systemd scope: $SCOPE_UNIT"
  systemctl show "$SCOPE_UNIT" -p MemoryMax -p TasksMax -p MemorySwapMax -p ControlGroup || true
fi

# Locate the actual cgroup directory
if [ ! -d "$CGROUP_DIR" ]; then
  if [ -n "$SCOPE_UNIT" ]; then
    UNIT_CGROUP="$(systemctl show "$SCOPE_UNIT" -p ControlGroup --value 2>/dev/null || echo '')"
    if [ -n "$UNIT_CGROUP" ] && [ -d "/sys/fs/cgroup${UNIT_CGROUP}" ]; then
      CGROUP_DIR="/sys/fs/cgroup${UNIT_CGROUP}"
      echo "[PROBE] Resolved cgroup directory from systemd ControlGroup: $CGROUP_DIR"
    fi
  fi
fi

if [ ! -d "$CGROUP_DIR" ]; then
  # Fallback: check /sys/fs/cgroup/audit-sandbox if set by parent
  if [ -d "/sys/fs/cgroup/audit-sandbox" ]; then
    CGROUP_DIR="/sys/fs/cgroup/audit-sandbox"
    echo "[PROBE] Using parent-configured cgroup directory: $CGROUP_DIR"
  else
    echo "[CRITICAL FAIL] Cgroup directory ($CGROUP_DIR) does not exist! Aborting."
    exit 1
  fi
fi

# Verify memory.max limit
if [ -f "$CGROUP_DIR/memory.max" ]; then
  MEM_MAX="$(cat "$CGROUP_DIR/memory.max")"
  echo "[PROBE] Effective cgroup memory.max: $MEM_MAX"
  if [ "$MEM_MAX" != "4294967296" ]; then
    echo "[CRITICAL FAIL] cgroups memory.max verification failed: expected 4294967296, got $MEM_MAX"
    exit 1
  fi
elif [ -f "$CGROUP_DIR/memory.limit_in_bytes" ]; then
  # cgroups v1 fallback if runner kernel is v1
  MEM_MAX="$(cat "$CGROUP_DIR/memory.limit_in_bytes")"
  echo "[PROBE] Effective cgroups v1 memory.limit_in_bytes: $MEM_MAX"
  if [ "$MEM_MAX" != "4294967296" ]; then
    echo "[CRITICAL FAIL] cgroups v1 memory limit verification failed: expected 4294967296, got $MEM_MAX"
    exit 1
  fi
else
  echo "[CRITICAL FAIL] No memory limit controller found in cgroup! Aborting."
  exit 1
fi

# Verify pids.max limit
if [ -f "$CGROUP_DIR/pids.max" ]; then
  PIDS_MAX="$(cat "$CGROUP_DIR/pids.max")"
  echo "[PROBE] Effective cgroup pids.max: $PIDS_MAX"
  if [ "$PIDS_MAX" != "200" ]; then
    echo "[CRITICAL FAIL] cgroups pids.max verification failed: expected 200, got $PIDS_MAX"
    exit 1
  fi
elif [ -f "$CGROUP_DIR/pids.limit" ]; then
  PIDS_MAX="$(cat "$CGROUP_DIR/pids.limit")"
  echo "[PROBE] Effective cgroups v1 pids.limit: $PIDS_MAX"
  if [ "$PIDS_MAX" != "200" ]; then
    echo "[CRITICAL FAIL] cgroups pids limit verification failed: expected 200, got $PIDS_MAX"
    exit 1
  fi
else
  echo "[CRITICAL FAIL] No pids limit controller found in cgroup! Aborting."
  exit 1
fi

# Verify process membership in cgroup.procs (or tasks in v1)
CURRENT_PID="$$"
if [ -f "$CGROUP_DIR/cgroup.procs" ]; then
  if ! grep -qx "$CURRENT_PID" "$CGROUP_DIR/cgroup.procs"; then
    echo "[CRITICAL FAIL] Process $CURRENT_PID is not in $CGROUP_DIR/cgroup.procs!"
    exit 1
  fi
  echo "[PROBE PASSED] Process $CURRENT_PID verified inside cgroup.procs."
elif [ -f "$CGROUP_DIR/tasks" ]; then
  if ! grep -qx "$CURRENT_PID" "$CGROUP_DIR/tasks"; then
    echo "[CRITICAL FAIL] Process $CURRENT_PID is not in $CGROUP_DIR/tasks!"
    exit 1
  fi
  echo "[PROBE PASSED] Process $CURRENT_PID verified inside cgroup tasks."
fi

# Optional swap verification
if [ -f "$CGROUP_DIR/memory.swap.max" ]; then
  SWAP_MAX="$(cat "$CGROUP_DIR/memory.swap.max")"
  echo "[PROBE] Effective memory.swap.max: $SWAP_MAX"
fi

echo "[PROBE PASSED] OS-level memory limit (4GB physical RAM) and process limit (200 PIDs) strictly verified."

# 3. Enforce process resource limits (CPU, max file size, process count)
ulimit -u 200
ulimit -f 1048576
ulimit -t 300
echo "[PROBE PASSED] CPU limit (300s), file size limit (1GB), and process limit (200) active."

# 4. Change directory to read-only target root
cd "$RO_TARGET"

# 5. Execute Node reproduction runner under timeout
echo "=== [ISOLATED TARGET RUNNER] Starting Reproduction Suite ==="
timeout 300s "$NODE_BIN" --max-old-space-size=2048 tests/settlement-runtime/f02-independent-reproduction-runner.js
echo "=== [ISOLATED TARGET RUNNER] Reproduction Suite Completed Successfully ==="

