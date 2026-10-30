# MemeLabs isolated sprint: review notes

Base: `feature/launchpad-engine` at `caf2c70`. The sprint branch is separate
from Antigravity's working directory and has not been merged or deployed. The
`main` branch has independent UI, donation, and supervised-executor changes;
review them before integration instead of replacing either branch wholesale.

## Safety and outstanding work

- The deployment preflight is blocked. The curve sends `change_admin` as the
  curve, but the minter's administrator is the operator. A local TVM test using
  the builder's actual state shows that this request is rejected with exit 73.
  A complete renounce and activation sequence remains to be demonstrated.
- The current bonding curve source compiles to cell hash
  `a9665e985967e9d7add8482f10af5cea4234fb0363e8c08c6efabc30ea8a7386`;
  the saved artifact has hash
  `f280c59c7f8bf9c8a530f71ead0bebf9e30055c41d6c6ed6aec1d63b2672acef`.
  Its provenance remains unresolved. Neither the contract nor the artifact was
  replaced. The other three launchpad sources match their artifacts.
- The LP locker accepts a wallet selected by an authorized administrator or
  router without proving it belongs to the intended LP master and pool. A
  local TVM test demonstrates that an administrator-controlled address can
  trigger an LP confirmation without establishing custody. An unauthorized
  outsider cannot configure this address in the tested case. The preflight
  now fails closed until authenticity and custody can be verified.
- A local TVM reproduction with an artificially active curve found that a
  capped buy after an earlier trade records 462.761517970 TON of reserves,
  while the existing mathematical model's initial invariant gives 500 TON.
  No outgoing refund to the buyer is emitted for the excess. The fixture does
  not establish live-chain balances or the complete bootstrap flow. The same
  buy source appears in `main`; neither contract was modified. The preflight
  blocks deployment pending a reviewed correction.
- A simulated Jetton transfer credits the curve's Jetton wallet and emits a
  notification with a truncated variable-length integer; the curve aborts
  without a refund action. The sender's preceding wallet debit is not part of
  this test, so the complete real-chain consequence remains unproven.
- Distribution is deliberately disabled before requesting a wallet signature.
  It requires transaction-linked trace verification, per-recipient accounting,
  partial-failure reconciliation, and safe resumption before it can be enabled.
- Vesting requests and ambiguous Jetton deployment requests remain pending until
  independently reconciled. There is no assisted clearing flow. Local storage
  is not an atomic lock across browser tabs or devices.
- The token verifier supports Mainnet only. A testnet creation cannot be
  confirmed through that verifier. Mainnet account, supply, admin and creator
  balance checks establish current state, not that a particular request caused
  that state. Full message/transaction correlation remains necessary.
- Buy/sell integration, DEX migration and authentic LP custody remain
  incomplete or unverified. No testnet or Mainnet transactions were executed.

## Reproducible local tests

Install dependencies in an isolated checkout without production credentials.
The checked-in vesting artifact is identical to the version in `main` and its
cell hash matches the current vesting source. It was restored to make the
existing vesting and master-audit suites reproducible in a clean worktree.

```text
cd minter-contract
npm test
cd ..
node minter-contract/test-bonding-curve-math.js
node test-bonding-curve-tvm.js
node test-bonding-curve-source-tvm.js
node --test minter-contract/test-deploy-launchpad-testnet.js test-launchpad-bootstrap-authority.js test-lp-locker-trust-boundary.js
node test-distribution-pending-safety.js
node test-vesting-confirmation-regression.js
node test-jetton-deploy-outcomes.js
node test-jetton-wizard-confirmation.js
node test-step4-vesting-comprehensive.js
node test-master-security-audit.js
```

The TVM tests are local simulations; mocked tests are not on-chain evidence.
`test-bonding-curve-source-tvm.js` reports the mismatch and executes the suite
against in-memory compiled sources without changing the saved artifacts. The
preflight's historical DEX blocker is not a fresh verification of that router.

`node --test test-graduation-accounting-known-issues.js` intentionally runs
the desired invariant, refund, and malformed-sell assertions against the current
contract. At this sprint's end all three assertions fail; do not treat this as a
passing regression suite or enable trading until the failures are resolved.

## Resumed implementation and verified results — 2026-10-29

The previous changes were recovered intact and were uncommitted. The recovered
state contained six modified tracked files and ten new files, rather than the
eight-file estimate. No reset, cleanup, merge, push or deployment was performed.
Remote heads were checked again: feature remains `caf2c70`, main `781e1db`.

The legacy factory fallback now delegates to the existing canonical Jetton
creator rather than constructing another transaction from unchecked remote
bytecode. It propagates validation failures and preserves uncertain outcomes.
The existing branch's supply and message amounts are unchanged. Main's separate
donation behavior is not imported and must be reconciled explicitly.

Latest executed results (local assertions and simulated TVM, not live transaction
verification):

| Command / suite | Passed | Failed |
| --- | ---: | ---: |
| `npm test` in `minter-contract` | 5 | 0 |
| Preflight, bootstrap authority, LP boundary, direct delegation (`node --test`) | 18 | 0 |
| `test-jetton-deploy-outcomes.js` | 8 | 0 |
| `test-jetton-wizard-confirmation.js` | 10 | 0 |
| `test-distribution-pending-safety.js` | 30 | 0 |
| `test-vesting-confirmation-regression.js` | 18 | 0 |
| `test-bonding-curve-source-tvm.js` | 135 | 0 |
| `minter-contract/test-bonding-curve-math.js` | 46 | 0 |
| `test-wizard-comprehensive.js` | 50 | 0 |
| `test-step4-vesting-comprehensive.js` | 50 | 0 |
| `test-master-security-audit.js` | 51 | 0 |
| `test-graduation-accounting-known-issues.js` | 0 | 3 |

`git diff --check` passes. The vesting artifact restored from main has Git blob
`e7421022a474cfc9ec9b7340b1fae9cfd398a5d9`; this is an addition of an identical
existing artifact, not a recompiled replacement for the divergent curve BOC.

### Review and integration

Review commits on `codex/memelabs-sprint` in this isolated worktree. Recompare
Antigravity's latest branch and uncommitted work before any authorized
integration. Likely overlapping files are `anl-labs.js`, `launchpad.js`,
`memecoin-platform.html`, the preflight and its tests. Resolve the main/feature
donation and executor differences explicitly; never copy entire contracts.

The contract issues require a separately authorized behavior correction:
reconcile capped-buy accounting with the existing model and return excess TON;
handle malformed sell payloads through a funded recovery path; authenticate LP
wallets against the intended pool/master; validate the complete renounce
bootstrap. These affect contract bytecode and potentially deployed behavior.
No storage/interface or financial behavior change was made in this sprint.

Mainnet readiness remains blocked. Transaction-linked confirmation, testnet
creation confirmation, distribution resumption, vesting custody, full buy/sell
settlement and DEX migration are not complete. No on-chain verification or
wallet signing was performed by Codex.

### Modified and added files

```text
assets/js/anl-labs.js
assets/js/launchpad.js
memecoin-platform.html
minter-contract/deploy-launchpad-testnet.js
minter-contract/package.json
minter-contract/test-deploy-launchpad-testnet.js
minter-contract/test/mocha-setup.cjs
minter-contract/build/anlgram-vesting-wallet.compiled.json
test-bonding-curve-source-tvm.js
test-distribution-pending-safety.js
test-graduation-accounting-known-issues.js
test-jetton-deploy-outcomes.js
test-jetton-wizard-confirmation.js
test-launchpad-bootstrap-authority.js
test-launchpad-direct-delegation.js
test-lp-locker-trust-boundary.js
test-vesting-confirmation-regression.js
docs/launchpad/codex-sprint-review.md
```
