#!/bin/sh
# Trusted-operator preflight ONLY. This script never runs repository tests.
# Review it and the local image/dependency provenance before use. Linux Docker
# host required. Passing this preflight alone does not authorize a test run.
set -eu

if [ "$#" -ne 3 ]; then
  echo 'usage: sh preflight.sh sha256:IMAGE_ID /absolute/sanitized-source /absolute/offline-dependencies' >&2
  exit 2
fi
image=$1
src=$(realpath -e "$2")
deps=$(realpath -e "$3")
case "$image" in sha256:*) ;; *) echo 'use an immutable local image ID' >&2; exit 2 ;; esac
hex=${image#sha256:}
case "$hex" in *[!0-9a-f]*|'') echo 'invalid image ID' >&2; exit 2 ;; esac
[ "${#hex}" -eq 64 ] || { echo 'invalid image ID length' >&2; exit 2; }
[ "$src" != / ] && [ "$deps" != / ] && [ "$src" != "$deps" ] || exit 2
[ -f "$src/tests/settlement-runtime/f02-principal-ledger.test.js" ] || exit 2
[ -d "$deps/node_modules/@ton/sandbox" ] || exit 2
command -v docker >/dev/null
command -v timeout >/dev/null
docker image inspect "$image" >/dev/null

# The image must be a credential-free, operator-reviewed Linux image with
# /usr/bin/env, /bin/sh, mkdir, cat, ls and the preinstalled Node runtime.
# --pull=never prevents an implicit image fetch.
timeout --signal=TERM --kill-after=10s 120s docker run --rm --pull=never \
  --network=none --ipc=none --read-only --user=65534:65534 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --cpus=1 --memory=1g --memory-swap=1g --pids-limit=64 \
  --ulimit=cpu=90:90 --ulimit=fsize=16777216:16777216 --ulimit=core=0:0 --ulimit=nofile=64:64 \
  --tmpfs /scratch:rw,nosuid,nodev,noexec,size=128m,mode=1777 \
  --mount "type=bind,src=$src,dst=/target,readonly" \
  --mount "type=bind,src=$deps,dst=/dependencies,readonly" \
  --workdir /target --entrypoint /usr/bin/env "$image" -i \
  PATH=/usr/local/bin:/usr/bin:/bin HOME=/scratch/home TMPDIR=/scratch/tmp \
  NODE_PATH=/dependencies/node_modules /bin/sh -eu -c '
    mkdir -p "$HOME" "$TMPDIR"
    [ "$(id -u)" = 65534 ]
    [ "$(ls -1 /sys/class/net | tr "\n" " ")" = "lo " ]
    [ ! -w /target ] && [ ! -w /dependencies ] && [ -w /scratch ]
    [ ! -e /var/run/docker.sock ]
    echo "PREFLIGHT ONLY: uid, loopback-only interface, bind permissions and scratch checked"
    echo "Mount table for operator review follows:"
    cat /proc/self/mountinfo
    echo "CPU and file-size rlimits (operator must verify actual units):"
    ulimit -t
    ulimit -f
  '
echo 'STOP: independently verify all controls in README.md before target execution.'
