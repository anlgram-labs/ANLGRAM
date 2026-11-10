#!/usr/bin/env bash
# Only after the operator has independently checked every control in README.md.
# This launcher has not been executed or validated on any host.
set -euo pipefail
if [[ "${F02_CONTROL_REVIEW:-}" != 'verified-on-this-host' || $# -ne 3 ]]; then
  printf '%s\n' 'STOP: independently verify every README.md control; set F02_CONTROL_REVIEW=verified-on-this-host and provide IMAGE_ID SOURCE DEPENDENCIES.' >&2
  exit 2
fi
image=$1
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 2
src=$(realpath -e "$2")
deps=$(realpath -e "$3")
[[ "$src" != / && "$deps" != / && "$src" != "$deps" ]] || exit 2
[[ -f "$src/tests/settlement-runtime/f02-principal-ledger.test.js" && -d "$deps/node_modules/@ton/sandbox" ]] || exit 2
docker image inspect "$image" >/dev/null
name="f02-ledger-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
# The cap on the visible stream and the watchdog apply outside the container.
# A truncated stream fails under pipefail; no test-generated file is retained.
timeout --signal=TERM --kill-after=10s 120s docker run --name "$name" --rm --pull=never \
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
    exec /usr/local/bin/node --test /target/tests/settlement-runtime/f02-principal-ledger.test.js
  ' 2>&1 | head -c 1048576
