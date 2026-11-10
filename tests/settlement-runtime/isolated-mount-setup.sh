#!/usr/bin/env bash
set -euo pipefail

# isolated-mount-setup.sh
# Runs as root inside the private mount and network namespaces.
# Establishes OS-enforced filesystem boundary isolation before permanently dropping privileges.

echo "=== [ISOLATED MOUNT SETUP] Establishing Kernel Filesystem View Boundary ==="

# 1. Make all mounts in this namespace private to prevent any propagation to host
mount --make-rprivate /

# 2. Mask host repository checkout and work directory
if [ -d "$REPO_SOURCE" ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs "$REPO_SOURCE"
fi
if [ -d /home/runner/work ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs /home/runner/work
fi

# 3. Mask root home and host user credential paths
mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs /root
if [ -n "${RUNNER_USER:-}" ] && [ -d "/home/$RUNNER_USER" ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs "/home/$RUNNER_USER"
fi
if [ -d /home/runner ] && [ "${RUNNER_USER:-}" != "runner" ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs /home/runner
fi

# 4. Mask sudo binary and sudoers configuration
if [ -d /etc/sudoers.d ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs /etc/sudoers.d
fi
if [ -f /etc/sudoers ]; then
  mount --bind -o ro /dev/null /etc/sudoers
fi
if [ -f /usr/bin/sudo ]; then
  mount --bind -o ro /dev/null /usr/bin/sudo
fi

# 5. Mask host daemon sockets
if [ -S /var/run/docker.sock ]; then
  mount --bind -o ro /dev/null /var/run/docker.sock
fi
if [ -d /run/containerd ]; then
  mount -t tmpfs -o ro,nosuid,nodev,noexec tmpfs /run/containerd
fi

# 6. Make cgroup controller directory readable by target user if present
if [ -n "${SCOPE_UNIT:-}" ] && [ -d "/sys/fs/cgroup/system.slice/${SCOPE_UNIT}" ]; then
  chmod 755 "/sys/fs/cgroup/system.slice/${SCOPE_UNIT}" 2>/dev/null || true
fi
if [ -n "${CGROUP_DIR:-}" ] && [ -d "$CGROUP_DIR" ]; then
  chmod 755 "$CGROUP_DIR" 2>/dev/null || true
fi

echo "[OK] Mount namespace boundary established: host checkout, credentials, and daemon sockets masked."

# 7. Drop all privileges, clear supplementary groups, lock no_new_privs, and execute target runner
exec setpriv --reuid "$RUNNER_UID" --regid "$RUNNER_GID" --clear-groups --no-new-privs \
  env -i \
    PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
    HOME="$SCRATCH_ROOT/home" \
    TMPDIR="$SCRATCH_ROOT/tmp" \
    AUDIT_SCRATCH_DIR="$SCRATCH_ROOT" \
    AUDIT_ISOLATED_SANDBOX=1 \
    AUDIT_GIT_COMMIT="$GIT_COMMIT" \
    AUDIT_PR_HEAD_SHA="${AUDIT_PR_HEAD_SHA:-$GIT_COMMIT}" \
    AUDIT_MERGE_SHA="${AUDIT_MERGE_SHA:-$GIT_COMMIT}" \
    AUDIT_MOUNT_NAMESPACE=1 \
    AUDIT_NET_NAMESPACE=1 \
    AUDIT_NO_NEW_PRIVS=1 \
    AUDIT_CGROUPS_ENFORCED=1 \
    HOST_MNT_NS="${HOST_MNT_NS:-}" \
    HOST_NET_NS="${HOST_NET_NS:-}" \
    RO_TARGET="$RO_TARGET" \
    NODE_BIN="$NODE_BIN" \
    SCOPE_UNIT="${SCOPE_UNIT:-}" \
    NODE_PATH="$RO_TARGET/tests/settlement-runtime/node_modules:$RO_TARGET/minter-contract/node_modules:$RO_TARGET/testnet-interface/node_modules" \
    bash "$RO_TARGET/tests/settlement-runtime/isolated-target-runner.sh"
