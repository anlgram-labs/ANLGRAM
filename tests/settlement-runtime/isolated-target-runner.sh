#!/usr/bin/env bash
set -euo pipefail

# isolated-target-runner.sh
# Audited target code execution entrypoint running strictly inside:
# - Unprivileged non-root runner user with dropped supplementary groups
# - Kernel-enforced PR_SET_NO_NEW_PRIVS and zero capabilities
# - Isolated mount namespace with host workspace/credentials/sockets masked
# - Network-isolated namespace (loopback only)
# - Read-only mounted source and toolchain
# - OS-enforced cgroups v2 resource ceiling (4GB physical memory, 200 PIDs, 0 Swap)

echo "=== [ISOLATED TARGET RUNNER] Initializing Inside Sandbox Boundary ==="

# -----------------------------------------------------------------------------
# 1. Probe: User and privilege dropping
# -----------------------------------------------------------------------------
RUNNER_USER="$(whoami)"
RUNNER_UID="$(id -u)"
RUNNER_GID="$(id -g)"
echo "[PROBE] Execution user: $RUNNER_USER (UID: $RUNNER_UID, GID: $RUNNER_GID)"
if [ "$RUNNER_UID" -eq 0 ] || [ "$RUNNER_USER" = "root" ]; then
  echo "[CRITICAL FAIL] Target code running as privileged root! Aborting."
  exit 1
fi

USER_GROUPS="$(id -Gn)"
echo "[PROBE] Effective supplementary groups: $USER_GROUPS"
if echo "$USER_GROUPS" | grep -qw "sudo"; then
  echo "[CRITICAL FAIL] Target user has sudo group membership! ($USER_GROUPS)"
  exit 1
fi
if echo "$USER_GROUPS" | grep -qw "docker"; then
  echo "[CRITICAL FAIL] Target user has docker group membership! ($USER_GROUPS)"
  exit 1
fi
echo "[PROBE PASSED] Unprivileged execution confirmed (non-root UID: $RUNNER_UID, no privileged groups)."

# -----------------------------------------------------------------------------
# 2. Probe: Kernel NoNewPrivs and Linux capabilities
# -----------------------------------------------------------------------------
echo "[PROBE] Inspecting process privileges and capabilities..."
NO_NEW_PRIVS="$(grep "^NoNewPrivs:" /proc/self/status | awk '{print $2}')"
CAP_EFF="$(grep "^CapEff:" /proc/self/status | awk '{print $2}')"
CAP_PRM="$(grep "^CapPrm:" /proc/self/status | awk '{print $2}')"

echo "[PROBE] NoNewPrivs: $NO_NEW_PRIVS"
echo "[PROBE] CapEff: $CAP_EFF"
echo "[PROBE] CapPrm: $CAP_PRM"

if [ "$NO_NEW_PRIVS" != "1" ]; then
  echo "[CRITICAL FAIL] Kernel NoNewPrivs bit is NOT enforced (got: '$NO_NEW_PRIVS')!"
  exit 1
fi
if [ "$CAP_EFF" != "0000000000000000" ]; then
  echo "[CRITICAL FAIL] Effective capabilities non-zero (got: '$CAP_EFF')!"
  exit 1
fi
if [ "$CAP_PRM" != "0000000000000000" ]; then
  echo "[CRITICAL FAIL] Permitted capabilities non-zero (got: '$CAP_PRM')!"
  exit 1
fi

# Verify sudo cannot be invoked or escalate privileges
if command -v sudo >/dev/null 2>&1; then
  if sudo -n true 2>/dev/null; then
    echo "[CRITICAL FAIL] sudo is executable and succeeded! Privilege escalation possible!"
    exit 1
  fi
fi
echo "[PROBE PASSED] Privilege stripping and kernel NoNewPrivs locked (CapEff=0, CapPrm=0, NoNewPrivs=1)."

# -----------------------------------------------------------------------------
# 3. Probe: Mount and Network Namespace Isolation
# -----------------------------------------------------------------------------
echo "[PROBE] Inspecting namespace isolation..."
TARGET_MNT_NS="$(readlink /proc/self/ns/mnt 2>/dev/null || echo '')"
TARGET_NET_NS="$(readlink /proc/self/ns/net 2>/dev/null || echo '')"

echo "[PROBE] Target mount namespace: $TARGET_MNT_NS (Host was: ${HOST_MNT_NS:-unknown})"
echo "[PROBE] Target net namespace:   $TARGET_NET_NS (Host was: ${HOST_NET_NS:-unknown})"

if [ -n "${HOST_MNT_NS:-}" ] && [ "$TARGET_MNT_NS" = "$HOST_MNT_NS" ]; then
  echo "[CRITICAL FAIL] Target process shares host mount namespace! ($TARGET_MNT_NS)"
  exit 1
fi
if [ -n "${HOST_NET_NS:-}" ] && [ "$TARGET_NET_NS" = "$HOST_NET_NS" ]; then
  echo "[CRITICAL FAIL] Target process shares host network namespace! ($TARGET_NET_NS)"
  exit 1
fi

# Test network isolation: loopback active and external internet egress blocked
if [ ! -d /sys/class/net/lo ]; then
  echo "[CRITICAL FAIL] Loopback interface missing! Aborting."
  exit 1
fi
LO_FLAGS="$(cat /sys/class/net/lo/flags 2>/dev/null || echo '0x0')"
echo "[PROBE] Loopback device flags: $LO_FLAGS"
# Bit 0 (0x1) is IFF_UP
if [ "$(( LO_FLAGS & 1 ))" -ne 1 ]; then
  echo "[CRITICAL FAIL] Loopback interface is down! Aborting."
  exit 1
fi

# Verify unprivileged local TCP socket binding succeeds on loopback
LOOPBACK_OK=0
"$NODE_BIN" -e "
  const net = require('net');
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    server.close();
    process.exit(0);
  });
  server.on('error', () => process.exit(1));
" && LOOPBACK_OK=1 || true

if [ "$LOOPBACK_OK" -ne 1 ]; then
  echo "[CRITICAL FAIL] Loopback socket binding failed! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Loopback interface operational and accepts local connections."

# Verify external network egress is strictly blocked (ENETUNREACH expected)
EGRESS_OPEN=0
"$NODE_BIN" -e "
  const net = require('net');
  const s = net.createConnection({ host: '8.8.8.8', port: 53 });
  s.on('connect', () => { s.destroy(); process.exit(99); });
  s.on('error', () => { process.exit(0); });
  setTimeout(() => { s.destroy(); process.exit(0); }, 500);
" || EGRESS_OPEN=$?

if [ "$EGRESS_OPEN" -eq 99 ]; then
  echo "[CRITICAL FAIL] External network connection to 8.8.8.8:53 succeeded! Egress not blocked!"
  exit 1
fi
echo "[PROBE PASSED] Mount and network namespaces isolated (loopback active, external egress blocked, distinct mount view)."

# -----------------------------------------------------------------------------
# 4. Probe: File descriptor sanitization and inheritance
# -----------------------------------------------------------------------------
echo "[PROBE] Sanitizing inherited file descriptors..."
for fd in $(ls /proc/self/fd 2>/dev/null || true); do
  if [ "$fd" -gt 2 ]; then
    eval "exec ${fd}<&-" 2>/dev/null || true
  fi
done

for fd in $(ls /proc/self/fd 2>/dev/null || true); do
  # When 'ls' evaluates /proc/self/fd, fd 3 is typically the open directory handle
  if [ "$fd" -gt 3 ]; then
    echo "[CRITICAL FAIL] Leaked inherited file descriptor detected: fd $fd"
    exit 1
  fi
done
echo "[PROBE PASSED] Inherited file descriptors verified clean (0, 1, 2 only)."

# -----------------------------------------------------------------------------
# 5. Probe: Host filesystem isolation and path access denial
# -----------------------------------------------------------------------------
echo "[PROBE] Verifying denied access to host paths outside permitted view..."
if [ -n "${REPO_SOURCE:-}" ] && [ -e "$REPO_SOURCE/.git" ]; then
  echo "[CRITICAL FAIL] Original checkout .git directory is accessible at $REPO_SOURCE/.git!"
  exit 1
fi
if [ -e "/home/runner/work/ANLGRAM/ANLGRAM/.git" ]; then
  echo "[CRITICAL FAIL] Host .git directory is accessible at /home/runner/work/ANLGRAM/ANLGRAM/.git!"
  exit 1
fi
if [ -s "/home/runner/.gitconfig" ]; then
  echo "[CRITICAL FAIL] Host gitconfig is readable!"
  exit 1
fi
if [ -d "/home/runner/.ssh" ] && [ -n "$(ls -A /home/runner/.ssh 2>/dev/null)" ]; then
  echo "[CRITICAL FAIL] Host .ssh directory is accessible!"
  exit 1
fi
if [ -d "/root" ] && [ -n "$(ls -A /root 2>/dev/null)" ]; then
  echo "[CRITICAL FAIL] Host /root directory is accessible!"
  exit 1
fi
if [ -S "/var/run/docker.sock" ]; then
  echo "[CRITICAL FAIL] Host Docker daemon socket is accessible!"
  exit 1
fi
echo "[PROBE PASSED] Host checkout (.git), credentials, and daemon sockets strictly inaccessible."

# -----------------------------------------------------------------------------
# 6. Probe: Filesystem write restrictions
# -----------------------------------------------------------------------------
echo "[PROBE] Verifying filesystem write restrictions..."
# Target mount must be strictly read-only
if touch "$RO_TARGET/probe_fail.tmp" 2>/dev/null; then
  rm -f "$RO_TARGET/probe_fail.tmp" 2>/dev/null || true
  echo "[CRITICAL FAIL] Target mount ($RO_TARGET) is WRITABLE! Aborting."
  exit 1
fi

# Root filesystem must be read-only / unwritable
if touch "/probe_fail.tmp" 2>/dev/null; then
  rm -f "/probe_fail.tmp" 2>/dev/null || true
  echo "[CRITICAL FAIL] Root filesystem (/) is WRITABLE! Aborting."
  exit 1
fi

# Host runner home must be unwritable
if [ -d /home/runner ] && touch "/home/runner/probe_fail.tmp" 2>/dev/null; then
  rm -f "/home/runner/probe_fail.tmp" 2>/dev/null || true
  echo "[CRITICAL FAIL] Host runner home (/home/runner) is WRITABLE! Aborting."
  exit 1
fi

# Scratch tmpfs must be writable
if ! touch "$SCRATCH_ROOT/probe_ok.tmp" 2>/dev/null; then
  echo "[CRITICAL FAIL] Scratch tmpfs ($SCRATCH_ROOT) is NOT writable! Aborting."
  exit 1
fi
rm -f "$SCRATCH_ROOT/probe_ok.tmp"
echo "[PROBE PASSED] Filesystem write access strictly restricted to bounded tmpfs scratch."

# -----------------------------------------------------------------------------
# 7. Probe: Cgroups v2 resource ceiling verification
# -----------------------------------------------------------------------------
echo "[PROBE] Inspecting process cgroup hierarchy..."
CGROUP_SELF="$(cat /proc/self/cgroup)"
echo "[PROBE] /proc/self/cgroup: $CGROUP_SELF"
CGROUP_REL_PATH="$(echo "$CGROUP_SELF" | cut -d: -f3)"

if ! echo "$CGROUP_REL_PATH" | grep -q "audit-sandbox"; then
  echo "[CRITICAL FAIL] Process is not running inside an audit-sandbox cgroup scope! ($CGROUP_REL_PATH)"
  exit 1
fi
echo "[PROBE PASSED] Process verified inside audit-sandbox cgroup scope: $CGROUP_REL_PATH"

if [ -z "${SCOPE_UNIT:-}" ]; then
  SCOPE_UNIT="$(systemctl list-units --type=scope 2>/dev/null | grep audit-sandbox | awk '{print $1}' || echo '')"
  if [ -z "$SCOPE_UNIT" ]; then
    SCOPE_UNIT="$(basename "$CGROUP_REL_PATH")"
  fi
fi
echo "[PROBE] Active scope unit: $SCOPE_UNIT"

SYS_MEM_MAX="$(systemctl show "$SCOPE_UNIT" -p MemoryMax --value 2>/dev/null || echo '')"
SYS_PIDS_MAX="$(systemctl show "$SCOPE_UNIT" -p TasksMax --value 2>/dev/null || echo '')"
SYS_SWAP_MAX="$(systemctl show "$SCOPE_UNIT" -p MemorySwapMax --value 2>/dev/null || echo '')"

# Direct filesystem cgroup fallback/cross-check
CGROUP_FS_DIR="/sys/fs/cgroup/system.slice/${SCOPE_UNIT}"
if [ -d "$CGROUP_FS_DIR" ] && [ -f "$CGROUP_FS_DIR/memory.max" ]; then
  FS_MEM_MAX="$(cat "$CGROUP_FS_DIR/memory.max" 2>/dev/null || echo '')"
  FS_PIDS_MAX="$(cat "$CGROUP_FS_DIR/pids.max" 2>/dev/null || echo '')"
  if [ -n "$FS_MEM_MAX" ] && [ -z "$SYS_MEM_MAX" ]; then SYS_MEM_MAX="$FS_MEM_MAX"; fi
  if [ -n "$FS_PIDS_MAX" ] && [ -z "$SYS_PIDS_MAX" ]; then SYS_PIDS_MAX="$FS_PIDS_MAX"; fi
fi

echo "[PROBE] Verified MemoryMax: $SYS_MEM_MAX"
echo "[PROBE] Verified TasksMax: $SYS_PIDS_MAX"
echo "[PROBE] Verified MemorySwapMax: $SYS_SWAP_MAX"

if [ "$SYS_MEM_MAX" != "4294967296" ]; then
  echo "[CRITICAL FAIL] Memory ceiling verification failed: expected 4294967296, got '$SYS_MEM_MAX'"
  exit 1
fi
if [ "$SYS_PIDS_MAX" != "200" ]; then
  echo "[CRITICAL FAIL] TasksMax verification failed: expected 200, got '$SYS_PIDS_MAX'"
  exit 1
fi
if [ -n "$SYS_SWAP_MAX" ] && [ "$SYS_SWAP_MAX" != "0" ]; then
  echo "[CRITICAL FAIL] MemorySwapMax verification failed: expected 0, got '$SYS_SWAP_MAX'"
  exit 1
fi
echo "[PROBE PASSED] OS-level memory limit (4GB physical RAM), process limit (200 PIDs), and swap limit (0) strictly verified."

# -----------------------------------------------------------------------------
# 8. Probe: Process resource ulimits
# -----------------------------------------------------------------------------
ulimit -u 200
ulimit -f 1048576
ulimit -t 300
echo "[PROBE PASSED] CPU limit (300s), file size limit (1GB), and process limit (200) active."

# -----------------------------------------------------------------------------
# 9. Execute Node reproduction suite
# -----------------------------------------------------------------------------
cd "$RO_TARGET"
echo "=== [ISOLATED TARGET RUNNER] Starting Reproduction Suite ==="
timeout 300s "$NODE_BIN" --max-old-space-size=2048 tests/settlement-runtime/f02-independent-reproduction-runner.js
echo "=== [ISOLATED TARGET RUNNER] Reproduction Suite Completed Successfully ==="
