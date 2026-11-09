# Experimental one-shot migration: actual Curve funding to LP custody

**Result:** source-compiled generation2 executes the real local sequence Curve -> Migrator -> captured compatible STON.fi Router/LPAccount/Pool -> deterministic LP wallet -> Locker -> authenticated Migrator observation. **LP custody is observed in Sandbox; canonical full settlement remains pending, COMPLETE is unreachable.** This is not live Testnet verification or security approval.

Exact independent code-review target: **351de8a** (full SHA and source/artifact/dependency hashes in [one-shot-dispatch-review-package.json](one-shot-dispatch-review-package.json)). Base PR25 `ebf83d9`, prior financial source `59f5a93` are preserved. New branch `codex/vnext-one-shot-dispatch`; no merge, live deployment, Cloudflare update, original Curve2 recovery, wallet signature request, broadcast or real TON spending occurred.

## What changed

New separately named contracts:

- `anlgram-bonding-curve-dispatch-v2.fc`, with derived `curve-dispatch-auth-v2`, `curve-lifecycle-dispatch-v2`, `curve-dispatch-router-v2` and new Migrator code pin.
- `anlgram-migration-router-dispatch-v2.fc`, with derived `migration-dispatch-auth-v2`, `migration-lp-dispatch-v2` and new `migration-dispatch-control-v2`.
- Reproducible `compile-one-shot-dispatch.js` derives from preserved VNext inputs with exact, counted anchors. Generated offline `migration-package-dispatch-v2.js` uses new code, protocol metadata and generation2 version commitments. It has no live executor or signer.

Guard VNext verification code, settlement wallet, minter and Locker V2 are reused unchanged. Curve/Migrator pins, immutable genesis templates, version commitment2 and project protocol metadata create **new deterministic identities**. Old permits, deployment BOCs, addresses and fingerprints cannot be reused. No deployed contract or existing VNext source/artifact was patched in place; old414 paths continue to deny.

These contracts have a working experimental execution path on global ID-3. **They are not cryptographically limited to Sandbox**: Testnet uses the same ID. Deployment and all live execution remain unauthorized; the frontend, server admission, TON Connect, V5 operation ledger and production gates have not been connected to this package. The final zero in protocol/status getters is not a claim that these new bytecodes could not execute if someone deployed them improperly.

## State invariants implemented and tested

The [state model](one-shot-dispatch-state-model.md) was recorded before the execution implementation. State is distributed across Curve's existing nonce/digest record and Migrator's existing lifecycle/registration/observation records; no new financial ledger was added.

| State | Entry evidence and invariant |
|---|---|
| PERMITTED_UNFUNDED | Actual500 TON graduation, zero curve inventory and refund claims,200M escrow, exact Guard/Curve/Migrator/master/LP intent/version scope, current signed nonce/digest/expiry and real receiver epochs. Curve getter reports1. |
| FUNDING_PENDING | Curve source-authenticates admin/creator, reads actual network config19=-3, validates readiness flags3 and reserve coverage, then commits irreversible dispatch flag and consumed permission status3 in the same TVM transaction as the asset sends. A downstream failure does not rearm it. |
| FUNDED | Existing Curve-authenticated native deposits plus cumulative settlement-wallet funding receipts cover exact original obligations and epochs. Migrator has real custody; no manually funded or seeded post-dispatch state is used. |
| DEX_DISPATCHED | Fresh phase2 Guard permit, matching wallets/minimum LP/root/epochs, no returns or earlier dispatch, exact asset obligations and enough prior protected balance plus caller gas. Existing used-ID/DEX flag and consumed registration status1 persist once. |
| LP_CUSTODY_OBSERVED | Authentic immutable Locker origin, exact root/Pool/wallet, positive credited LP at least signed minimum, exact ceiling allocation, pending LP0 and no contradictory returned or available principal. Receipt LT strictly increases. This is a **historical custody observation**, not perpetual current balance or full DEX settlement. |
| SETTLEMENT_PENDING | Explicit authorized `0x414e5d20` records lifecycle field17 after DEX dispatch. Custody may be known or unknown; no amount is cleared or paid by this transition. |
| COMPLETE | **No implemented transition.** Finalize `0x414e4c43` still rejects414. |

Curve consumption is stored **after** the inherited `save_data`/lifecycle writes, so those writes cannot erase it. Migrator consumption is stored after its used-ID/reconciliation saves. Critical sends use mode1 without ignoring action errors. A local config25 forwarding-fee exhaustion test produces compute0/action37/aborted, no outgoing critical message and no persisted consumption: there is no partial financial release to retry blindly.

Existing epoch opening is idempotent; the new control rejects re-priming once funding or dispatch has begun. Expired staged permits retain the existing authenticated renewal rules; consumed operations cannot renew or rearm. An expired permit cannot initiate dispatch, but genuine LP delivery after a timely consumed dispatch remains acceptable. Permits never attest custody, refunds or withdrawals.

Concurrent financial return `0x414e5904`, LPAccount recovery and legacy abort remain blocked. Read-only queries can continue. Genuine returned amounts are still consumed only through the existing authenticated, cumulative/bounce receipts; an observation, timeout, excess or missing message is never converted into a financial refund.

## Actual combined local happy path

`one-shot-dispatch-support.js` creates new zero-supply project genesis, initializes the actual Guard/Migrator binding, mints1B to Curve, renounces minter administration, activates, buys, sells, graduates, binds Locker and opens the real funding/DEX return epochs. New sources are compiled and compared to their artifacts. It calls no `setShardAccount` or prepared-funding fixture for project principal.

Phase1 permission is granted through real Curve -> Guard -> Curve messages. Curve sends200M Jettons from its actual wallet and500 TON from its own reserve. Migrator synchronizes the actual recipient wallet's owner-opened credit epoch; phase2 is signed and validated only after FUNDED. Its real outbound messages execute captured compatible external code. No Treasury provider substitutes for Curve or Migrator and no successful receipt is manually supplied to the happy path.

The Pool mints **316227766015836 LP units** into the deterministic Locker-owned wallet. The actual wallet's notification is accepted by source-compiled Locker, which emits **`0x414c5635` to its immutable contributor, the actual Migrator**. Migrator accepts that observation and reaches state5. The local Pool getter independently shows500 TON/pTON units and200M project units in its reserves. That getter is **test-observed data**, not evidence injected into Migrator to complete settlement.

Default100% permanent: all credited units locked, free0, pending0, existing permanent sentinel preserved. Actual combined executions also verify50%/180 days and75%/365 days, exact ceiling rounding, beneficiary/controller and full duration. This is representative compatibility over the existing enforced50..100 integer range; it is not a claim that every recovery/withdrawal race is solved for all lock settings.

## Custody acknowledgment and API/data semantics

Inherited Locker binding pins the exact Locker code/genesis, provider contributor, immutable intent, deterministic Pool and wallet. The derived observation consumer further requires:

- authenticated Locker sender and exact operation;
- consumed phase2 registration and historical DEX dispatch;
- received LP >= signed minimum; locked=`ceil(received*percent/100)`, free=received-locked, pending0;
- available native/Jetton liquidity0, pending DEX obligations still equal original totals, returned principal0 and no competing Curve transit/return accounting;
- strictly newer LT for positive observations; duplicate/stale positive receipts reject409 without double credit.

The contract credits only the Locker's authenticated accounting observation. The private permit key cannot certify one. A forged third-party observation rejects401. Lost first notification leaves the actual LP wallet funded but recorded custody UNKNOWN; querying an empty Locker snapshot does not credit it.

`get_dispatch_state_curve(q)` returns `(stage,completeFalse)`. Migrator `get_dispatch_state()` returns `(stage,creditedReceivedLp,creditedLockedLp,creditedFreeLp,pendingLp,custodyObservedHistorical,assetFinalityFalse,completeFalse)`. Use the existing `get_lp_v2_state` for receipt LT and unlock data. An absent receipt is **UNKNOWN physical custody**, not a zero wallet balance. After receipt, amounts are historical credited units at LT, not a perpetual balance assertion. Free/timed LP can subsequently move under Locker's unchanged rules; do not display an old observation as fresh custody or completion. No frontend/API adapter was changed in this contract-only task.

## Full settlement predicate remains separate

A future COMPLETE predicate must authenticate all of:

1. Exact project/root/version, consumed funding epoch and dispatch;
2. For **each** original asset obligation, uniquely attributed final DEX consumption and returned principal, with equation `original = consumed_by_DEX + authentically_returned + unresolved`; unresolved must be0;
3. No outstanding in-flight, bounced, refundable or competing recovery obligation;
4. Relevant authenticated LP issuance/custody/allocation and a reviewed consistent cut with any permitted LP withdrawals;
5. Required chain-finality/provenance assurance for external evidence.

Current foreign messages/Locker snapshots do not supply this entire per-operation completion proof to Migrator. No validator-proof engine or signed settlement attestation was added. Consequently pending DEX obligations **remain recorded even after authentic LP custody**. Neither a successful send, observed Pool reserves, receipt absence, permit signature nor the Locker ack clears them. `SETTLEMENT_PENDING` is honest and **COMPLETE remains unreachable**.

## Adversarial results and failure semantics

Twelve new cases execute the new generation, in addition to210 preserved regression cases:

- permanent integrated custody, duplicates/replays, pending transition and denied finalization;
-50%/180-day and75%/365-day exact allocations;
- incorrect digest, insufficient Curve/Migrator caller gas, duplicate release and hostile observation;
- expired permit and actual Mainnet configuration rejection;
- genuine frozen funding recipient: Curve wallet retains tokens, Migrator retains TON, no rearm;
- delayed **actual Curve-emitted** token leg: FUNDING_PENDING until authentic credit receipt, then FUNDED and custody;
- lost first LP notification: real LP remains held, no invented custody, pending/unknown;
- genuine pTON leg failure: native principal returns through actual bounce, token leg remains outstanding, no concurrent recovery;
- genuine LP notification delayed past authorization expiry: accepted only because dispatch already consumed while fresh;
- actual Pool minimum-LP rejection: both assets return to **LPAccount**, not immediately to Migrator. Exact owner/Pool/balances are verified locally and through the existing read-only observation; no false refunded balances or automatic `refund_me`;
- increased local forwarding price: action37 rolls back critical outputs and permission consumption even though compute exits0.

The delayed/fault tests hold actual emitted messages, freeze recipient code or alter local fee config. They do not supply a fabricated successful receipt. The exact authentic observation replay is injected only as a negative adversarial case; it rejects. No post-dispatch asset state is seeded.

An initial implementation reserved Migrator's protected balance twice: the action phase aborted37. The fix retains one reservation before critical sends and emits only unreserved excess afterward; it does not raise the400m caller budget. The tests check action success/abort, not only compute0. A first test assertion also assumed min-LP rejection instantly refunded Migrator; actual captured messages showed LPAccount retention. The final stronger test verifies that custody and leaves refunds blocked rather than changing financial code to invent a return.

## Reproducibility and measured local accounting

```powershell
node minter-contract/compile-one-shot-dispatch.js --check
node minter-contract/compile-vnext-package.js --check
cd tests/settlement-runtime
npm.cmd run test:one-shot
npm.cmd test
```

Actual full suite: **222 passed, 0 failed, 0 skipped**, including12 new cases and all210 prior cases. Both generator/source/artifact checks PASS. Credential-pattern and whitespace checks PASS. No browser, live Testnet or human audit result is claimed.

The committed [local trace](one-shot-dispatch-local-trace.json) records post-genesis source-initiated messages, exact serialized message hashes, sources/destinations, values, remaining forward fees, gas, compute/action outcomes and selected negative tests. It is not a live receipt or deployment candidate. Setup and test keys are local; key material is not exported or stored.

Measured normal dispatch transaction accounting in that trace:

| Item | Curve funding | Migrator DEX execution |
|---|---:|---:|
| Caller attachment (nanoTON) |250000000 |400000000 |
| Compute gas |74454 |127688 |
| Transaction totalFees |5048842 |8680620 |
| Token-wallet message value |80000000 |200000000 |
| Native/pTON message value |500010000000 |500150000000 |
| Unused dispatch gas returned |154780664 |40983196 |
| Outgoing remaining forward fees |170494 |336184 |

For each root, `sum(outgoing value + remaining forward fees) + totalFees - incoming value = 500000000000 nanoTON`: exactly its authorized principal leaves its prior balance. Curve protocol fees and prior protected operational balances are not a gas subsidy. Subsequent wallet/DEX/receipt fees are separate; the normal DEX transaction chain measured32491920 nanoTON in this local run. Operational attachments are not all fees and these figures are **not** a current network estimate, V5 wallet quote or guaranteed debit ceiling.

| Coordinated code | Cell hash |
|---|---|
| Curve dispatch generation2 |`d6a24fb21edd77152e5f2ae490bab4a09768b8d0ec472b18d371ff35bc4b5473` |
| Migrator dispatch generation2 |`7df729a4c2fecf3b4dba2fd16936b56d0e35af0c8f0a237b31d60e39ed89dbf1` |
| Guard VNext, unchanged verification code |`a2bbc0a304d40113da0ba78447862597f7302128dae04d344caee7686946f157` |
| Locker V2, unchanged |`22d689df2f32d5fd00c72b50f31ab77291117a7625ad1bb654a4b6dbc796e001` |

The machine-readable review package includes full source/dependency SHA-256, generator and artifact/BOC checksums and exact review target. Pinned compiler0.11.0, core0.63.1 and Sandbox0.45.0 are reused. A Guard address changes through its genesis commitments even though its code hash is unchanged. All new project addresses are Sandbox-derived identities; no public deployment manifest is prepared.

## Review and integration boundary

Qualified independent TON/STON.fi review must target the full code SHA in the JSON, both new compiled artifacts, unchanged dependencies and foreign profile/library pins. Specifically review consumption surviving storage rewrites, root/action rollback, reserve/gas conservation, all legacy handlers, epoch reuse, post-dispatch permission/recovery races, LP snapshot freshness versus withdrawals and the unresolved completion predicate.

Captured compatible external code execution does not prove current live Router code, validator finality or future behavior after Router administration upgrades. These trust assumptions remain. Missing-first LP reconstruction, downstream withdrawal outcomes, safe automatic LPAccount refunds, emergency buyer payouts and original Curve2 nonce recovery remain blocked; no authority-key attestation substitutes for them.

No production UI, Antigravity branch, Cloudflare, donation, tokenomics, existing source/artifact or operation lock changed. Supply1B, nine decimals,80/20 split,1% Curve fee,500 TON threshold and immutable LP terms remain inherited and tested. The normal creation fee/donation entry point is not replaced by this offline Sandbox factory.

**Verdict:** GO for reproducible Sandbox dispatch and authenticated LP custody review; **NO-GO for live financial deployment, Mainnet or canonical COMPLETE**. The exact next review is the generation2 code target and its separate completion/failure predicate, not removal of any preserved VNext gate.

Official interface reference: [STON.fi v2 Pool data and messages](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/pool). Getter index0 is lock state, index2 LP supply and indices3/4 reserves; those getter observations remain outside the contract's completion proof.
