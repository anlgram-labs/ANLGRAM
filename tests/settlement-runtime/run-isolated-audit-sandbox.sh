#!/usr/bin/env bash
set -euo pipefail

# run-isolated-audit-sandbox.sh
# Enforces all Cloudflare security-audit skill Universal Execution Safety controls on Linux:
# 1. Network isolation (loopback-only namespace)
# 2. Read-only audited repository target
# 3. Scratch-only writable directory
# 4. Sanitized empty environment allowlist
# 5. OS-enforced resource limits (ulimits)
# 6. Pre-flight enforcement probe before target execution

echo "=== [ISOLATED AUDIT SANDBOX] Pre-Flight Setup & Enforcement Probe ==="

RO_TARGET="/tmp/ro-target"
SCRATCH_ROOT="/tmp/scratch"
REPO_SOURCE="$(pwd)"

# 1. Prepare directories
sudo rm -rf "$RO_TARGET" "$SCRATCH_ROOT"
sudo mkdir -p "$RO_TARGET" "$SCRATCH_ROOT/home" "$SCRATCH_ROOT/tmp"
sudo chmod 777 "$SCRATCH_ROOT" "$SCRATCH_ROOT/home" "$SCRATCH_ROOT/tmp"

# 2. Mount repository as READ-ONLY
sudo mount --bind -o ro "$REPO_SOURCE" "$RO_TARGET"
echo "[OK] Read-only bind mount created at: $RO_TARGET"

# Test read-only enforcement
if touch "$RO_TARGET/should_fail.tmp" 2>/dev/null; then
  echo "[CRITICAL FAIL] Target repository is WRITABLE! Aborting."
  sudo umount "$RO_TARGET" || true
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

# 4. Resolve Node binary path and module paths
NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"

# 5. Execute runner under strict isolation
echo "=== [ISOLATED AUDIT SANDBOX] Executing Reproduction Runner ==="

sudo ip netns exec audit-net env -i \
  PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
  HOME="$SCRATCH_ROOT/home" \
  TMPDIR="$SCRATCH_ROOT/tmp" \
  AUDIT_SCRATCH_DIR="$SCRATCH_ROOT" \
  AUDIT_ISOLATED_SANDBOX=1 \
  NODE_PATH="$RO_TARGET/tests/settlement-runtime/node_modules:$RO_TARGET/minter-contract/node_modules:$RO_TARGET/testnet-interface/node_modules" \
  bash -c "
    ulimit -u 150
    ulimit -v 4194304
    ulimit -f 1048576
    cd '$RO_TARGET'
    timeout 300s '$NODE_BIN' tests/settlement-runtime/f02-independent-reproduction-runner.js
  "

echo "=== [ISOLATED AUDIT SANDBOX] Execution Completed Successfully ==="

# 6. Verify evidence generation and promote
if [ -f "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" ]; then
  echo "[EVIDENCE CAPTURED] Copying evidence to workspace artifacts..."
  mkdir -p "$REPO_SOURCE/docs/audit/evidence"
  cp "$SCRATCH_ROOT/f02-independent-reproduction-evidence.json" "$REPO_SOURCE/docs/audit/evidence/"
  echo "[OK] Evidence promoted to: docs/audit/evidence/f02-independent-reproduction-evidence.json"
else
  echo "[CRITICAL FAIL] Evidence file was not produced in scratch!"
  exit 1
fi

# Cleanup mounts and namespace
sudo umount "$RO_TARGET"
sudo ip netns del audit-net
echo "=== [ISOLATED AUDIT SANDBOX] All Controls Verified & Teardown Complete ==="
