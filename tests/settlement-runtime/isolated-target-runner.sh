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
CGROUP_SELF="$(cat /proc/self/cgroup)"
echo "$CGROUP_SELF"

CGROUP_REL_PATH="$(echo "$CGROUP_SELF" | cut -d: -f3)"
echo "[PROBE] Relative cgroup path: $CGROUP_REL_PATH"

# Assert that current process is inside an audit-sandbox scope
if ! echo "$CGROUP_REL_PATH" | grep -q "audit-sandbox"; then
  echo "[CRITICAL FAIL] Process is not running inside an audit-sandbox cgroup scope! ($CGROUP_REL_PATH)"
  exit 1
fi
echo "[PROBE PASSED] Process verified inside audit-sandbox cgroup scope: $CGROUP_REL_PATH"

# Query systemd unit properties for the scope
SCOPE_UNIT="$(systemctl list-units --type=scope 2>/dev/null | grep audit-sandbox | awk '{print $1}' || echo '')"
if [ -z "$SCOPE_UNIT" ]; then
  SCOPE_UNIT="$(basename "$CGROUP_REL_PATH")"
fi

echo "[PROBE] Discovered active systemd scope unit: $SCOPE_UNIT"

# Verify exact resource ceilings from systemd
SYS_MEM_MAX="$(systemctl show "$SCOPE_UNIT" -p MemoryMax --value 2>/dev/null || echo '')"
SYS_PIDS_MAX="$(systemctl show "$SCOPE_UNIT" -p TasksMax --value 2>/dev/null || echo '')"
SYS_SWAP_MAX="$(systemctl show "$SCOPE_UNIT" -p MemorySwapMax --value 2>/dev/null || echo '')"
SYS_CGROUP="$(systemctl show "$SCOPE_UNIT" -p ControlGroup --value 2>/dev/null || echo '')"

echo "[PROBE] systemd scope ControlGroup: $SYS_CGROUP"
echo "[PROBE] systemd scope MemoryMax: $SYS_MEM_MAX"
echo "[PROBE] systemd scope TasksMax: $SYS_PIDS_MAX"
echo "[PROBE] systemd scope MemorySwapMax: $SYS_SWAP_MAX"

if [ "$SYS_MEM_MAX" != "4294967296" ]; then
  echo "[CRITICAL FAIL] systemd MemoryMax verification failed: expected 4294967296, got $SYS_MEM_MAX"
  exit 1
fi
if [ "$SYS_PIDS_MAX" != "200" ]; then
  echo "[CRITICAL FAIL] systemd TasksMax verification failed: expected 200, got $SYS_PIDS_MAX"
  exit 1
fi
if [ "$SYS_SWAP_MAX" != "0" ]; then
  echo "[CRITICAL FAIL] systemd MemorySwapMax verification failed: expected 0, got $SYS_SWAP_MAX"
  exit 1
fi

# Also check filesystem cgroup if accessible
CGROUP_DIR="/sys/fs/cgroup${SYS_CGROUP:-$CGROUP_REL_PATH}"
if [ -d "$CGROUP_DIR" ] && [ -f "$CGROUP_DIR/memory.max" ]; then
  FS_MEM_MAX="$(cat "$CGROUP_DIR/memory.max")"
  FS_PIDS_MAX="$(cat "$CGROUP_DIR/pids.max")"
  echo "[PROBE] Filesystem cgroup memory.max: $FS_MEM_MAX"
  echo "[PROBE] Filesystem cgroup pids.max: $FS_PIDS_MAX"
  if [ "$FS_MEM_MAX" != "4294967296" ]; then
    echo "[CRITICAL FAIL] Filesystem cgroup memory.max mismatch!"
    exit 1
  fi
  if [ "$FS_PIDS_MAX" != "200" ]; then
    echo "[CRITICAL FAIL] Filesystem cgroup pids.max mismatch!"
    exit 1
  fi
  if [ -f "$CGROUP_DIR/cgroup.procs" ]; then
    if ! grep -qx "$$" "$CGROUP_DIR/cgroup.procs"; then
      echo "[CRITICAL FAIL] Process $$ not in $CGROUP_DIR/cgroup.procs!"
      exit 1
    fi
  fi
fi

echo "[PROBE PASSED] OS-level memory limit (4GB physical RAM), process limit (200 PIDs), and swap limit (0) strictly verified."

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

