# Financial integration V2 — development evidence and boundaries

Based on `15d9143` in `codex/financial-integration-v2`. No deployment, signatures,
transactions, spending, main merge or public UI changes are authorized/performed.
Creation remains .20 TON plus mandatory .02 TON donation. Supply, curve math,
allocation, fees and 500 TON graduation threshold are unchanged.

## Curve return protocol

`RET2(query)` records live in the existing namespaced Curve dictionary. They bind
original native and Jetton principal when the settlement dispatch path executes;
there is no external admin registration or off-chain refund attestation. Records
contain original TON/Jettons, confirmed returned TON/Jettons, wallet credit epoch
and a native message replay dictionary. Existing canonical legacy paths retain
their retry behavior; a first regression run exposed and corrected accidental
application of the new query restriction to that legacy path.

`0x414e4831 + query:uint64` requests a funded observation, authorized only for the
configured admin or migrator and an existing obligation. Minimum .04 TON is
supplied explicitly; .02 goes to the Curve's pinned settlement wallet. If no
epoch is known it opens the peer-bound epoch idempotently, otherwise it queries.
Unused request gas returns to the caller; previous balances are reserved.

Only the actual configured Curve wallet can send `credit_receipt#414e530a`.
Query, migrator peer and epoch must match. Cumulative principal must be monotonic
and <= the original Jetton obligation. Before booking a delta, its reported
actual wallet custody must cover existing curve token reserves, refund claims,
DEX escrow and that delta. The wallet itself authenticates actual TEP-74 delivery
and deduplicates messages. Curve owner notifications are hints only, including
late duplicates after a completed return; excess TON is never Jetton evidence.

Native returns retain the existing `0x414e4c36` body but require the matching V2
obligation, actual attached principal, configured migrator and amount cap on the
settlement path. Native replay hashes and cumulative caps prevent double booking.
Partially returned obligations remain migration-failed/pending. Only exact
reconciliation of both original principals restores graduation-pending state.

Curve sends project acknowledgment `0x414e4833`, query:uint64, original TON,
original Jettons, confirmed TON and confirmed Jettons (Coins). It reserves old
balances and newly booked native principal; insufficient receipt gas may skip
the message without reverting custody accounting. Another funded sync replays
the authoritative cumulative record.

Migrator accepts this only from its configured Curve and matching phase-5 flight
and query. Originals must match its returning obligation. A separately namespaced
record stores already-applied Curve acknowledgments; this is distinct from
principal bounced back into the migrator itself. Only monotonic unapplied deltas
reduce pending balances. Stage **8 means Curve bookkeeping confirmed**, not
successful DEX migration, LP verification, permanent locking or finalization.
`get_curve_return_v2(query)` and `get_curve_handoff_v2()` expose these records.

### Scope limitation: not a complete dispatch/abort lifecycle

Settlement `initiate_migration` still rejects 414. Its proposed dispatch-record
code remains behind that gate. New return tests explicitly seed a post-dispatch
obligation fixture and run real source-compiled Curve, wallets and migrator; they
do not claim a fresh, ungated graduation/migration round trip. The previously
verified fresh deployment/buy/sell and captured DEX tests remain separate evidence.

Production integration still needs a versioned lifecycle that binds the original
Curve dispatch ID to all DEX and abort IDs and ensures the receiving Curve wallet
epoch is ready **before** refund delivery. Legacy abort chooses an independently
unused ID; it cannot be treated as this complete handshake. Opening an epoch only
after tokens arrive cannot reconstruct missed credit history. Mixed funds restored
at migrator versus booked at Curve require explicit retry correlation. These
conditions are blockers, not permission to remove the dispatch gate.

## LP observations and immutable V2 destination binding

Locker development revision V2.1 adds project observation/query messages without
changing its data shape. Its bytecode and StateInit addresses change; existing
V2 code at `15d9143` remains preserved in `codex/lp-locker-v2`. No deployment is
upgraded or silently substituted. New components accept only the newly generated
Locker code identity pin. Recompile the locker before its binding component.

`query#414c5634 + operation:uint64` can be called by contributor, beneficiary or
unlocked controller with at least .02 TON funding. The immutable contributor
receives `observation#414c5635`: operation:uint64, logical-time:uint64, received,
locked available, unlocked available, pending (Coins), unlock:uint64 and a
reference containing Pool/LP-wallet addresses. Notifications emit the same
observation after storing authenticated LP credit. Gas failure never undoes credit;
querying recovers a lost observation. This is not a foreign withdrawal receipt.

`anlgram-migration-v2-plan.fc` is a **destination-binding component, not an
implemented liquidity executor**. Its immutable genesis binds creator, beneficiary,
unlocked controller, percentage, duration, operation, Router, configured pair
wallets and pinned foreign profile/Locker code. It internally constructs the
complete canonical Locker StateInit with itself as contributor. Its address is
independent of the resulting locker address, resolving that construction cycle.
It provides no post-deployment destination substitution or mutable terms.

The plan accepts observations only from that exact locker, with matching operation,
derived Pool/LP wallet and consistent balances. Cumulative gross allocation is
`ceil(received * percent / 100)`, preserving the existing V2 rounding toward the
lock by at most one smallest LP unit. Integer locked/unlocked amounts, rather than
an invented exactly divisible fractional balance, follow the immutable settings.
Available locked/unlocked buckets cannot exceed their respective gross allocation;
available amounts plus pending must reconcile to received. Monotonic logical time
prevents an older valid observation from replacing a later withdrawal state.

Unlocked LP remains in the vault, controlled by the disclosed unlocked controller,
until explicitly withdrawn. Existing V2 tests verify actual captured-wallet delivery
of that share, exact unlock timestamps, 180/365-day expiry, permanent locks and
separate claims. The plan does not mark an old snapshot as current locked custody.
It always returns zero authorization and rejects liquidity execution/finalization.

`scripts/migration-v2-plan.js` builds canonical offline component and Locker
StateInit values. The on-chain getter independently derives the same endpoints.
Tests exercise receipt loss/requery, old-observation replay, actual captured LP
wallet ownership and integer split. Mint-origin messages are labeled controlled
Sandbox fixtures; the .02 TON notification budget matches the existing integration
budget. No simulated mint is presented as real STON.fi liquidity.

## Exact remaining blockers

1. Bind intended token masters to the plan's declared pair wallets using verified
   on-chain discovery. Deterministic Pool derivation from configured endpoints is
   not proof that a creator supplied the intended token pair.
2. Complete a versioned Curve/migrator dispatch/abort/epoch handshake and mixed
   principal retry lifecycle. Validate it from actual fresh dispatch StateInit,
   not seeded return fixtures, without disabling current LP gates prematurely.
3. Genuine STON.fi LP wallet withdrawal outcomes have no implemented authenticated
   final-delivery/failure receipt interface. A frozen recipient may cause the
   foreign sender wallet to restore LP without notifying the locker. Request stays
   pending, unavailable for a second claim. Missing notifications/excess TON and
   off-chain snapshots cannot finalize it. A foreign protocol extension or reviewed
   on-chain proof mechanism is required; new attestor trust is not approved.
4. A locker frozen before its initial LP notification still cannot reconstruct
   that custody record from a getter snapshot. Lost project observation messages
   after a stored receipt are recoverable; these are different failure cases.
5. The binding component has no real DEX provision/refund executor. Integrate the
   verified STON.fi interfaces only after the preceding lifecycle and custody
   gates are reviewed, then reconcile both legs and all LP allocations.
6. Independent foreign source/build/current-code and immutability review remains
   incomplete. Previously accepted STON.fi Router administration trust is for
   development only; administrator upgrades can affect contracts/reserves. Identity
   pins and captured-code tests do not eliminate those upgrade risks.
7. Review storage growth, rent, stale observations and gas sufficiency; add V2
   custody verifier and frontend integration only after authenticated evidence.
   Existing styling/integrations/donation are untouched; no financial UI enabled.

## Testnet readiness

**The complete new protocol is not ready for a supervised full-migration deployment
plan.** Component experiments can be planned after independent review, but no
broadcast is authorized. Regenerated `testnet-candidate-2026-10-30.json` and
`financial-testnet-plan-2026-10-30.json` remain blocked offline baseline templates;
they do not deploy the new V2 plan/locker or prove current account state. Old
provider observations cannot be reused for changed addresses. A new complete plan
needs the reviewed lifecycle, exact V2 addresses/roles, verified operator control,
Testnet funding, metadata and approved Testnet donation recipient. Full unchanged
500 TON graduation is outside the existing small smoke budget.

Compiler order: settlement wallet -> Curve -> migration router -> old LP guard;
Locker V2 -> migration V2 binding component. Hash pins are generated and checked.
All code/data/address changes and actual results are in the adjacent machine
evidence and latest sprint report. Mainnet remains blocked.
