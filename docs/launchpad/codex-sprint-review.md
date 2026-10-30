# MemeLabs isolated sprint: review notes

## Error 709 correction — latest verified status

All previous commits, including `5910e42` and `7905672`, are preserved. The
earlier 709 blocker below is superseded by the results in this section.

### Root cause and unchanged buyer budget

The failing message was Curve -> Curve Jetton wallet, not the recipient
deployment. `jetton-wallet.fc` requires strictly more than
`forward_ton_amount + 2 * floor(inboundForwardFee * 3 / 2) + 2 * 0.01 + 0.01 TON`.
The old message supplied exactly 0.04 TON, with a 0.01 TON notification, so it
failed even with zero forwarding fees. The full-phase baseline measured an
80,890 nanoTON inbound forward fee: the strict threshold was 40,242,670
nanoTON. It rejected with 709 and its real truncated bounce then failed with 9.

The correction allocates the SAME existing 40,000,000 nanoTON overhead:

| Internal allocation | Before | After |
| --- | ---: | ---: |
| Sender-wallet attachment | 40,000,000 | 35,000,000 nanoTON |
| Owner notification (inside that attachment) | 10,000,000 | 1 nanoTON |
| Curve compute/action budget | no remainder | 5,000,000 nanoTON |

No mandatory buyer gas payment or pricing/fee parameter was added. The tested
new sender-wallet threshold is 30,240,541 nanoTON (80,180 inbound forward fee),
below its 35,000,000 attachment. An owner contract may skip the 1-nanoton
notification due to insufficient compute gas; notification execution is NOT
used as proof of token delivery. The recipient Jetton balance is verified.

Every buy reserves the entire pre-message balance plus newly booked liquidity
and protocol fees before sending. Unspent trade input is refunded exactly;
unused Curve gas is returned separately, after fees. Recipient-wallet gas
excess travels through an authenticated standard TEP-74 response and is also
returned to the buyer. In the 1 TON fixture, liquidity is 950,400,000 nanoTON
and protocol fee is 9,600,000. Curve balance is exactly its prior 50,000,000
plus those booked amounts: 1,010,000,000. No prior funds subsidize delivery.

Measured local transaction fees for that fixture: Curve buy 1,284,777 nanoTON,
sender wallet 807,397, recipient wallet 724,355, Curve excess relay 1,013,755.
The test prints each message value, inbound forward fee, gas/storage/action
fees and final contract balances. These are Sandbox configuration measurements,
not a promised live-network fee schedule. Retained wallet balance is part of
the existing wallet gas/storage policy; new recipient deployment is tested.

### Recovery and compatibility

Real bounces contain only a truncated original body, so the recipient address
cannot be decoded reliably. The Curve now correlates buys and token claims by
its unique transaction logical time. In-flight records use domain-separated
keys in the existing dictionary; address-hash claim entries retain their old
encoding. An authentic first-hop rejection restores the buyer's pending token
entitlement once. Replayed bounces do not double-credit or underflow. A claim
works with its existing 0.04 TON minimum, preserves prior balance, and restores
its pending entitlement if its first-hop transfer fails again. On success the
derived recipient wallet is authenticated before the delivery record is cleared.

No constructor storage fields, public getters or numeric message opcodes change.
The existing standard excesses opcode is now handled; dictionary semantics gain
in-flight entries. Older code cannot safely process these entries: do not
downgrade or reuse live in-flight state. No deployed contract was upgraded.
Bytecode and StateInit-derived addresses change; regenerate all dependent
deployment addresses/plans before any separately authorized deployment.

- Curve code cell hash: `0abb0feb4b9b124d04fd349c2131f6f9d54a371bb743a44c88c6f91b52c53334`.
- Serialized BOC SHA-256: `3d50570332dc1f1e124274fdbb4adffab587659e88e805172b6f0475808a5180`.
- Reproducible source/import provenance is recorded in the artifact; compiler
  `--check` passes without rewriting it.

### Actual local tests

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Full-phase Sandbox settlement | 7 | 0 |
| Artifact TVM regression | 135 | 0 |
| Source TVM regression | 135 | 0 |
| Routed activation, buy/sell, graduation dispatch + financial regressions | 5 | 0 |
| Math model, including 12,000 deterministic cycles | 46 | 0 |
| Preflight/bootstrap/LP boundary/receipt regressions | 25 | 0 |

Sandbox covers the original 709 baseline, new/existing recipient wallets,
insufficient input, capped overpayment, repeated paid query ids and authentic
first-hop failure/claim/replay behavior. The failure test explicitly injects a
sender-token shortage, restores the fixture's custody before successful claim,
and does not pretend to mint missing tokens. Reusing a query id with a new paid
message is a new purchase; wallet-level replay protection is separate.

Run `npm ci --ignore-scripts --prefix tests/settlement-runtime`, then
`npm test --prefix tests/settlement-runtime`. This locked, separate runtime uses
Sandbox to model action/storage/forwarding fees, unlike compute-only tests.
Its dependencies were installed inside this isolated worktree, not in the
shared Antigravity dependency directory. No blockchain RPC or transaction is
needed by this test. The fixture starts active; the separate routed activation
test exercises initialization and renounce.

### Remaining limits and safe integration

Do not enable production trading. Later-hop recipient failure, missing excess
acknowledgements and extreme/future fee schedules still need complete recovery
verification. The standard sender wallet restores a bounced recipient transfer
but does not notify the Curve: a new authenticated failure exchange may be
necessary to resolve such in-flight records without risking double delivery.
No speculative wallet interface change was made. LP pool/master authentication
and actual STON.fi provision/custody remain blocked. The routed graduation test
checks dispatch and duplicate rejection, not successful external DEX execution.

Changed files: Curve source and compiled artifact; deployment preflight message;
`test-bonding-curve-tvm.js`; `test-graduation-accounting-known-issues.js`;
`tests/settlement-runtime/{package.json,package-lock.json,settlement.test.js}`;
this document. Existing assertions now distinguish TON reserve/gas-return
actions from the single Jetton transfer and continue requiring the exact capped
trade refund. No failed assertion was bypassed by increasing fixture funding.

Review these changes atop the preserved Codex commits, compare Antigravity's
current branch before integration, and regenerate dependent addresses. No
`E:\ANLGRAM` edit, merge, push, publication or real transaction was performed.
Mainnet remains blocked; all results above are local simulations.

## Remaining integration iteration — latest status

Base commit `9f34102` and all preceding commits are preserved. This iteration
changes no contract source, BOC, storage, interfaces or financial parameters.
The curve cell hash remains `9059d4a1ca1acc5d8e0d2e64648e7eb894fc2b3bf6dd39fdefa849897837de34`;
its reproducible compiler `--check` passes. Deterministic addresses do not
change in this iteration; the address implications of `9f34102` still apply.

### Implemented

- A source-compiled TVM integration test routes actual output messages through
  minter mint, curve Jetton wallet credit, custody notification, operator
  renounce, permissionless status query, minter response and Curve activation.
  It checks unauthorized/duplicate initialization, unauthorized mint/renounce,
  trading disabled before activation, duplicate ack rejection and permanent
  mint disablement. No fabricated confirmation is injected.
- The deployment plan now describes the compatible manual recovery sequence:
  after custody/state 2, the minter admin renounces via existing op 3, then
  `check_renounce` causes an authenticated status reply and activation. The
  original automatic attempt is still rejected (73); it is not advertised as
  working. Live deployment remains blocked.
- The browser captures a TON Connect message identity without persisting its
  signed BOC, and queries the exact normalized message hash through the
  read-only `/blockchain/messages/{hash}/transaction` endpoint. Both backend
  allowlists admit only a 64-character hex hash for this route.
- Receipt verification checks wallet, network, inbound body/hash identity,
  compute/action status and skipped actions. Missing, mismatched, failed,
  emulated or incomplete evidence cannot confirm a deployment. The creator
  still requires its existing state/supply/admin/balance checks as well.
  A wallet receipt establishes wallet execution only, not downstream token
  delivery or LP custody. Testnet state confirmation remains incomplete.

The normalization and response fields follow the official
[TonAPI transaction tracking documentation](https://docs.tonconsole.com/tonapi/cookbook/transaction-tracking/)
and [OpenAPI schema](https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.yml).

### New blocker reproduced; no silent economic change

`test-launchpad-activation-flow.js` has **1 passing activation scenario and
1 failing settlement scenario**. After activation, a real Curve output is
routed into its actual Jetton wallet. The wallet rejects transfer with 709:
the Curve attaches exactly 40,000,000 nanoTON and requests forwarding
10,000,000 nanoTON, while `jetton-wallet.fc` requires strictly more than the
forward amount + forwarding fees + twice its gas allowance + storage.
The test does not top up that output or alter the expected result to pass.
Its later sell, graduation and migration assertions are not reached.

Fixing this requires an explicit funding decision: increase the operational
trade overhead/attachment, reduce the owner-notification forward amount, or
provide an explicitly accounted operational buffer. Each affects existing
financial execution; no choice was silently made. The preflight reports the
demonstrated failure and keeps trading blocked.

LP outsider configuration rejection remains tested, but authorized binding
still does not prove pool/master authenticity. A complete authenticated LP
binding needs reviewed STON.fi wallet derivation/code identity and potentially
a new contract validation exchange. No invented pool address or ABI is used.
Actual STON.fi provision, LP issuance/custody and failure recovery remain
unverified as a complete external-contract flow. No live transaction was sent.

### Tests executed this iteration

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Routed activation and settlement | 1 | 1 (709 blocker above) |
| Normalized receipt + preflight/bootstrap/LP boundary | 25 | 0 |
| Creator wallet outcomes (mocked) | 8 | 0 |
| Wizard receipt/state confirmation (mocked) | 11 | 0 |
| Worker security regression | 22 | 0 |
| Artifact TVM regression | 135 | 0 |
| Source TVM regression | 135 | 0 |
| Financial regressions | 3 | 0 |
| Wizard existing regression | 50 | 0 |

All results are local TVM, unit or mocked integration tests. There is no new
on-chain verification evidence. `git diff --check` and compiler `--check` pass.

Files changed: `assets/js/transaction-receipt.js`, `assets/js/anl-labs.js`,
`memecoin-platform.html`, `server.js`, `cloudflare-worker/worker.js`,
`minter-contract/deploy-launchpad-testnet.js`, its test,
`test-transaction-receipt.js`, `test-jetton-wizard-confirmation.js`,
`test-launchpad-activation-flow.js`, and this document.

Review the isolated commits and the explicit failing test before integration.
Recompare Antigravity's current work without replacing files wholesale.
Deploying the backend allowlist or website requires separate approval; local
changes alone do not update the existing production Worker. No merge, push,
deployment or modification of `E:\ANLGRAM` was performed. Mainnet remains blocked.

## Authorized financial correction — latest status (2026-10-29)

This section supersedes the historical failures and source/artifact mismatch
described below. Commits `9fb3d16` and `9b9bcba` are preserved.

### Corrections

1. Capped buys reconstructed K from the shrinking current token inventory.
   They now use the existing model's initial 800M atomic-9 curve allocation
   and configured virtual reserves. The reproduction now reaches exactly
   500 TON of recorded reserves instead of 462.761517970 TON.
2. The unspent purchase input was neither recorded nor returned. It is now
   sent back as non-bounceable TON excess, with fees paid separately. Booked
   principal and accrued fees are reserved before the refund action; inadequate
   operational funding must fail the action phase rather than consume them.
   The regression checks the exact 504.869494949 TON refund for its fixture.
3. Sell payload parsing checked only the length prefix, then attempted to read
   absent bytes. Structural checks now validate Either/ref presence and all
   VarUInteger bytes before reading. Invalid orders use the existing funded
   Jetton refund or underfunded pending-claim path. Tests check exact refunded
   tokens and recipient, unchanged trading reserves/fees, five malformed
   encodings, low-gas escrow, successful claim and rejection of a repeated claim.

### Artifact provenance and compatibility

The intended source is the preserved `caf2c70` implementation with these targeted
financial corrections, not a wholesale contract import from main. The old BOC's
provenance remains unresolved; its bytes remain recoverable from prior commits.
The corrected BOC is compiled from the reviewed source and all imports.

- Previous saved curve cell hash: `f280c59c7f8bf9c8a530f71ead0bebf9e30055c41d6c6ed6aec1d63b2672acef`.
- Corrected curve cell hash: `9059d4a1ca1acc5d8e0d2e64648e7eb894fc2b3bf6dd39fdefa849897837de34`.
- Serialized BOC SHA-256: `e59a4ff918ce9f4172ee6ca1bada5e117c1e7c45c7cefa517f71de7efb5db5d9`.
- Source file SHA-256 in this worktree: `2b7cdf159cc69b473e2fbf314c8a9f4c3210aca93fc0b945b5ffb81c776ed6a5`.

The compiler records its package version and sorted SHA-256 hashes for every
source/import, normalizes CRLF to LF and omits variable timestamps. Repeated
compilations produced identical artifacts. Run
`node minter-contract/compile-bonding-curve.js --check` to verify without writing.

Storage, opcodes, getters, fee rate, initial supply, token allocations and
graduation threshold are unchanged. Financial execution and bytecode change.
New StateInit addresses therefore change, including dependent deterministic
addresses: regenerate deployment plans and review them together. Existing
deployed contracts are not upgraded by these files; no migration/upgrade of
deployed state is authorized or performed. Custom initial allocations other
than the existing fixed 800M curve allocation are unsupported by this model.

### Latest executed tests

| Local suite | Passed | Failed |
| --- | ---: | ---: |
| Former three financial failures (expanded edge assertions) | 3 | 0 |
| Saved-artifact TVM suite | 135 | 0 |
| Source-compiled TVM suite | 135 | 0 |
| Mathematical model, including 12,000 deterministic cycles | 46 | 0 |
| Preflight / bootstrap / LP trust-boundary tests | 14 | 0 |
| Jetton wizard confirmation | 10 | 0 |
| Distribution safety | 30 | 0 |
| Vesting confirmation | 18 | 0 |

The two resolved preflight defect labels were replaced by an explicit remaining
end-to-end settlement blocker. Renounce authority, LP authenticity and external
DEX blockers remain. Local executor action lists are not proof of final delivery
or fee sufficiency on a live chain. Full asynchronous settlement, failed Jetton
delivery after refund, fee-buffer exhaustion, and authentic LP custody require
further integrated verification. Trading and distribution remain disabled as
before; no redesign, wallet signatures, deployment, push or merge was performed.

Modified this iteration: `anlgram-bonding-curve.fc`, its compiler and compiled
JSON, the deployment preflight and its test, the financial regression test,
and this document. Integration: review this local commit on top of the two
preserved commits, compare Antigravity's latest code before any authorized
integration, and regenerate dependent addresses. Never copy BOCs alone or
enable production trading merely because these local tests pass.

## Historical sprint record (superseded where noted above)

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
