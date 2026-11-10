# F-02 offline isolation — setup proposal, not yet validated

This configuration is **untested**. It is a preflight for an operator-controlled, disposable Linux VM, not proof that the host enforces the security-audit skill. `preflight.sh` executes only an operator-reviewed image's shell and standard utilities; it does not run repository code. Do not use a shared or privileged CI runner, a workstation with secrets, a host network, a Docker socket mount, or a live TON endpoint. Local Windows inspection found no Docker/Podman and WSL was not installed; Hyper-V feature state could not be read without elevation.

## Controls and preparation

Use an ephemeral, credential-free Linux VM with no network interface attached to the VM. Limit its virtual disk, memory and CPU as a second boundary. Pre-provision a Linux Docker runtime using the platform's approved offline process, and inspect its cgroup, user namespace, seccomp and mount behavior. Do not attach the operator's home directory, SSH agent, Docker configuration, cloud metadata or credentials. A local Docker daemon socket stays outside the container. Do not invoke a hosted CI service with repository tokens as a substitute without verifying all these constraints.

Prepare a small **sanitized source directory** outside any home directory from the exact audited commit. Include only these Git-tracked paths, preserve their directory layout, and inspect them for credentials and symlinks before mounting:

```text
tests/settlement-runtime/f02-principal-ledger.test.js
tests/settlement-runtime/fixtures/f02-principal-ledger-harness.fc
minter-contract/contracts/imports/f02-principal-ledger.fc
minter-contract/contracts/imports/stdlib.fc
```

The PR #65 harness resolves includes relative to its target; first inspect compiler path behavior on the chosen environment. Stage an independently reviewed, credential-free copy of the **already installed** `tests/settlement-runtime/node_modules` as `/absolute/offline-dependencies/node_modules`. Do not run `npm install`, `npm ci`, lifecycle scripts or any registry operation during this audit run. Record the PR commit, Node version, exact package versions, package-lock hash, dependency provenance and local image ID. Image and dependency contents must have no credentials. Do not include `.git`, `.env`, home directories or sockets. Read-only bind mounts are not a substitute for sanitizing inputs.

Use an operator-reviewed immutable local Linux image containing Node plus `/usr/bin/env`, `/bin/sh`, `mkdir`, `cat`, `ls`, `id`, `tr` and `ulimit`. Obtain its `sha256:<64 lowercase hex>` image ID without pulling during the run. The image's runtime, interpreter, toolchain, default environment and layers must be inspected for secrets and unwanted startup hooks. The preflight overrides the entrypoint and starts the shell with `env -i` and only `PATH`, `HOME`, `TMPDIR` and `NODE_PATH`. Its image must also permit uid 65534 to read both inputs. `--pull=never` prevents an image fetch.

```sh
sh scripts/f02-isolation/preflight.sh sha256:LOCAL_IMAGE_ID /absolute/sanitized-source /absolute/offline-dependencies
```

Before considering a test, an independent operator must verify on **that actual host**: (1) VM has no network attachment and Docker's `none` namespace has loopback only; (2) no credential, host home, shared service, device, socket or writable host mount is exposed; (3) root, `/target`, `/dependencies` and the toolchain are truly read-only, with no writable filesystem or communication channel outside the bounded `/scratch` except the minimum kernel interfaces necessary to run; (4) scratch is a 128 MiB tmpfs and process environment has exactly the explicit allowlist; (5) non-root uid, dropped capabilities, no-new-privileges and default seccomp are enforced; (6) cgroup limits actually enforce one CPU, 1 GiB RAM with no additional swap, 64 processes, and file-size and CPU rlimits; (7) a host watchdog terminates the container and all descendants after 120 seconds; and (8) retained output and other agents' directories are not mounted. Review `/proc/self/mountinfo`, `docker inspect`, effective cgroup settings, environment, image and staged inputs. The preflight's permission checks are only diagnostics and do **not** prove mount, network, credential or cgroup isolation.

Only after every control is independently verified may the operator review and launch `run-ledger-test.sh` with the same image and inputs. The launcher requires `F02_CONTROL_REVIEW=verified-on-this-host` as an explicit record of that prerequisite; the variable is not evidence of isolation. It uses the same Docker flags, a unique container name, host-side timeout and cleanup trap, and a bounded stdout stream. Independently confirm cleanup removes all descendants; an interrupted Docker CLI alone is not proof. Preserve the command's exact exit status and capture only bounded non-secret output. In guidance mode do not retain target-generated files. Full-audit artifact promotion, if needed, must follow the descriptor-relative no-follow checks in the installed skill; do not copy an arbitrary workspace or `scratch` tree.

```sh
F02_CONTROL_REVIEW=verified-on-this-host bash scripts/f02-isolation/run-ledger-test.sh sha256:LOCAL_IMAGE_ID /absolute/sanitized-source /absolute/offline-dependencies
```

This test, if it passes, validates only the harness and selected arithmetic examples. It does not demonstrate authenticated asset custody, DEX dispatch, refunds, action-phase outcomes, LP delivery or settlement. No test has been run using this proposal, and no bytecode hash or result is asserted. A subsequent deterministic compilation and real-asset-flow Sandbox suite require the same controls and independently reviewed tests. Gate 414 remains sealed.

References: [Docker none network](https://docs.docker.com/engine/network/drivers/none/), [container run flags](https://docs.docker.com/reference/cli/docker/container/run/), [resource limits](https://docs.docker.com/engine/containers/resource_constraints/), and [tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/).
