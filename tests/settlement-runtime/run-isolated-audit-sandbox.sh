#!/usr/bin/env bash
set -euo pipefail

# run-isolated-audit-sandbox.sh
# Enforces all Cloudflare security-audit skill Universal Execution Safety controls on Linux:
# 1. Network isolation (loopback-only namespace)
# 2. Read-only audited repository target and immutable tools
# 3. Scratch-only writable storage on tmpfs / isolated directory
# 4. Sanitized empty environment allowlist (credential removal)
# 5. OS-enforced resource limits (process, file, CPU time, wall-clock, and Node physical heap)
# 6. Unprivileged target execution (strictly non-root)
# 7. Pre-flight enforcement probe before target execution
# 8. Teardown trap ensuring cleanup on success or failure

echo "=== [ISOLATED AUDIT SANDBOX] Pre-Flight Setup & Enforcement Probe ==="

RO_TARGET="/tmp/ro-target"
SCRATCH_ROOT="/tmp/scratch"
REPO_SOURCE="$(pwd)"
RUNNER_USER="${SUDO_USER:-$(id -un)}"
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"

echo "Host runner user: $RUNNER_USER"
echo "Audited commit SHA: $GIT_COMMIT"

# Teardown trap
cleanup() {
  echo "=== [ISOLATED AUDIT SANDBOX] Teardown & Process Termination ==="
  sudo umount -f "$RO_TARGET" 2>/dev/null || true
  sudo ip netns del audit-net 2>/dev/null || true
  echo "[OK] Teardown complete."
}
trap cleanup EXIT INT TERM

# 1. Prepare directories
sudo rm -rf "$RO_TARGET" "$SCRATCH_ROOT"
sudo mkdir -p "$RO_TARGET" "$SCRATCH_ROOT/home" "$SCRATCH_ROOT/tmp"
sudo chown -R "$RUNNER_USER:$RUNNER_USER" "$SCRATCH_ROOT"
sudo chmod -R 700 "$SCRATCH_ROOT"

# 2. Mount repository as READ-ONLY
sudo mount --bind -o ro "$REPO_SOURCE" "$RO_TARGET"
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
echo "[PROBE PASSED] Write attempt to audited target failed with read-only restriction as required."

# 3. Setup Network Namespace (loopback only)
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

# 4. Resolve Node binary path and verify non-root execution capability
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"

# Probe unprivileged execution
PROBE_USER=$(sudo ip netns exec audit-net sudo -u "$RUNNER_USER" env -i PATH="$NODE_DIR:/usr/bin:/bin" whoami)
echo "[PROBE] Target execution will run as user: $PROBE_USER"
if [ "$PROBE_USER" = "root" ]; then
  echo "[CRITICAL FAIL] Target code would run as privileged root! Aborting."
  exit 1
fi
echo "[PROBE PASSED] Unprivileged execution confirmed (non-root)."

# 5. Execute runner under strict isolation
echo "=== [ISOLATED AUDIT SANDBOX] Executing Reproduction Runner ==="

# Resource Limits explanation:
# - ulimit -u 200: max processes/threads
# - ulimit -f 1048576: max file size 1GB
# - ulimit -t 300: max 300 CPU seconds
# - Node --max-old-space-size=2048: caps physical V8 heap to 2GB RSS.
# - Virtual memory (ulimit -v) is left unconstrained because 64-bit V8/Emscripten WebAssembly
#   reserves large virtual address guard regions (up to 8GB per Wasm instance) for TVM Sandbox emulators.
# - timeout 300s: caps wall-clock time to 5 minutes.

sudo ip netns exec audit-net sudo -u "$RUNNER_USER" env -i \
  PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
  HOME="$SCRATCH_ROOT/home" \
  TMPDIR="$SCRATCH_ROOT/tmp" \
  AUDIT_SCRATCH_DIR="$SCRATCH_ROOT" \
  AUDIT_ISOLATED_SANDBOX=1 \
  AUDIT_GIT_COMMIT="$GIT_COMMIT" \
  NODE_PATH="$RO_TARGET/tests/settlement-runtime/node_modules:$RO_TARGET/minter-contract/node_modules:$RO_TARGET/testnet-interface/node_modules" \
  bash -c "
    ulimit -u 200
    ulimit -f 1048576
    ulimit -t 300
    cd '$RO_TARGET'
    timeout 300s '$NODE_BIN' --max-old-space-size=2048 tests/settlement-runtime/f02-independent-reproduction-runner.js
  "

echo "=== [ISOLATED AUDIT SANDBOX] Target Execution Completed Successfully ==="

# 6. Verify evidence generation and promote
if [ -f "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" ]; then
  echo "[EVIDENCE CAPTURED] Copying verified evidence from scratch to workspace artifacts..."
  mkdir -p "$REPO_SOURCE/docs/audit/evidence"
  cp "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" "$REPO_SOURCE/docs/audit/evidence/"
  echo "[OK] Evidence promoted to: docs/audit/evidence/f02-independent-reproduction-evidence.json"
else
  echo "[CRITICAL FAIL] Evidence file was not produced in scratch!"
  exit 1
fi
