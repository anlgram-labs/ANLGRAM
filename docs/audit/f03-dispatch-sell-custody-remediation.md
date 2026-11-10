# F-03 Dispatch sell custody

The comparison starts at PR #52 head `9f11c5731e8c9987fa1dc3fc2de4774fc05f16ad`. PR #49 verified the separate native buy no-funds bounce and the V5 Sandbox message route. PR #50 added the sell regression, PR #51 preserved the red CI evidence, and PR #52 required a seller-specific getter and actual Jetton return. [PR #49](https://github.com/anlgram-labs/ANLGRAM/pull/49) · [PR #50](https://github.com/anlgram-labs/ANLGRAM/pull/50) · [PR #51](https://github.com/anlgram-labs/ANLGRAM/pull/51) · [PR #52](https://github.com/anlgram-labs/ANLGRAM/pull/52)

## Failure and correction

Both baseline cases ran with a real seller wallet and Curve Jetton wallet after a genuine buy. Each transferred `1255269914730402` atomic Jetton units from the seller into Curve custody and produced zero TON payout and zero seller entitlement. At a 1-nanoton forward amount, TVM skipped Curve compute with `no-gas`. At a 60000000-nanoton forward amount with the Curve's physical TON balance fault-injected to 10000000 nanoton, compute exited `0` and the payout failed in the Action Phase with code `37`. The Curve reverted its sell accounting while the preceding wallet transaction stood. [PR #52 red CI](https://github.com/anlgram-labs/ANLGRAM/actions/runs/42704987344) · [TON execution phases](https://docs.ton.org/foundations/phases) · [TVM exit codes](https://docs.ton.org/tvm/exit-codes)

The authenticated genesis mint opts only the Dispatch Curve wallet into the funded-notification rule. The wallet floors a positive sell notification at the configured cost of 40000 Curve gas units, funds that floor from the inbound wallet transfer, and requires the notification send to succeed in its own Action Phase. Zero forward value or insufficient funding rejects the wallet transfer before credit. The bounce tested for zero forward value is the original wallet-to-wallet transfer. The Curve never relies on bouncing a later TEP-74 notification to undo wallet custody. [TEP-74 messages](https://docs.ton.org/contracts/standard/tokens/jettons/api) · [TON sending modes](https://docs.ton.org/foundations/messages/modes)

Before staging a payout the Curve checks its physical TON backing and the notification's compute and forwarding budget. A shortfall leaves the trade reserves and fees untouched and records the full token amount under the seller's address. A payable sell reserves old TON less the exact net payout and uses a mandatory send that pays fees from the notification budget. Rejected, sufficiently funded orders retain the existing correlated refund route. The claim path uses the existing authenticated settlement-wallet receipt and replay protection.

The tests verify both actual Jetton balances, the seller and bystander dictionary entries, aggregate pending refunds, booked TON and Jetton reserves, protocol fees, and the seller's delivered TON or Jetton receipt. They cover forward amounts of 1, 1000, 1000000, 5000000, 20000000 and 60000000 nanoton, zero notification, insufficient seller and claim gas, an unfunded payout, forged notification, unauthorized and repeated claims, an independent second transfer sharing a TEP-74 query ID, and replay of a settlement transfer and receipt. The successful trade fixture paid exactly `118588901` nanoton at each of the two larger forward budgets.

## Financial bytecode and scope

| Code cell | PR #52 | This change |
| --- | --- | --- |
| Dispatch Curve | `5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028` | `5746848a31ec5b3ed8e52e250ff9d7ef9b2c3e3f73f643363b4c8e32dea26d41` |
| Dispatch migration router | `8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab` | `eb07be3d274c6c256cfa3a98c182510b19f5572db50e5665567efe7ad0160ed4` |
| Dispatch wallet | Uses the shared wallet below | `a0bdb67d08f7e62d9c3632d3d44de69b0267900de9754987b5f0574c27d0ea59` |
| Dispatch Vesting V2 | Uses the shared Vesting V2 profile | `58dbb5c5f6518d97acf5ac2a98c566eeb35c956726b0fba0f9c8da2c6b2d1be4` |
| Shared settlement wallet | `e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2` | Same |
| VNext Guard | `81edd2ba7ac98f61ea5da6097d8e79b648efaf2cbb2c1f5d9876d8146b053320` | Same |

The migration-router bytecode change pins the Dispatch wallet identity. The package and unsigned sell preparation derive the seller wallet with the new code. The Dispatch Vesting V2 artifact uses the same authenticated wallet protocol with the new wallet pin. The shared Vesting V2 code stays at `942578b7bf6585f16be69b531b0bc4266bfdda5085c87a63a89a7183d6d87953` and Standard Vesting V2 stays at `d436ede674ef3c17781dbf8c4a850e57b114342559dabb8a2405dc050bc2cda9`. The existing verifier still accepts the exact historical PR #49 Curve code for native buy failure evidence. The price formula, 1% trade fee, 300 TON graduation, 80/20 split and approved allocation terms are preserved.

The evidence covers fresh Dispatch StateInit and source-compiled Sandbox. A previously lost deposit does not acquire a retroactive claim. A frozen or otherwise unavailable Curve account and live fee schedules require separate review before release. Gate 414, Testnet financial execution and Mainnet financial execution remain closed.

## Reproduction

Install lockfile dependencies in `testnet-interface`, `minter-contract` and `tests/settlement-runtime` with `npm ci`. The minter directory can use `npm ci --ignore-scripts`, as in CI. Run at the repository root.

```sh
node minter-contract/compile-one-shot-dispatch.js --check
node minter-contract/compile-vesting-v2.js --dispatch --check
node --test --test-concurrency=1 tests/settlement-runtime/sell-action-phase-safety.test.js
node --test --test-concurrency=1 tests/settlement-runtime/*.test.js
node --test --test-concurrency=1 testnet-interface/test/vesting-v2-lifecycle.test.mjs
```

To reproduce the original red comparison, copy only the current `sell-action-phase-safety.test.js` into a checkout of the exact PR #52 head with the same locked dependencies. Run the two named tests below against that checkout's original sources and artifacts. The test diagnostics print the failed transaction phases and the unchanged zero claim.

```sh
node --test --test-concurrency=1 --test-name-pattern 'never debit|unfunded payout' tests/settlement-runtime/sell-action-phase-safety.test.js
```

The workflow `vnext-graduation-regression.yml` also runs the release-gate, graduation, native refund, registration and real STON.fi Sandbox regression tests and builds the Pages candidate in dry-run mode.

The broader Sandbox command recorded 229 passes and six failures, with zero skips. All six failures reproduced separately at the PR #52 base. They cover legacy allocation and StateInit expectations, legacy 500 TON graduation assertions, and legacy post-funding grant revocation. The branch preserves those assertions and the approved 300 TON Dispatch economics.
