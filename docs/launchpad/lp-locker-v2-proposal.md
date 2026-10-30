# Configurable LP locker V2 — isolated development proposal and implementation

## Status and compatibility

Implemented on `codex/lp-locker-v2`, descending from preserved `04a5e8a`.
Not deployed, not enabled in the frontend, not accepted by the existing migration
protocol. Existing guard, lockers, migration, Curve, wallet artifacts, deterministic
candidate addresses, production embeds and PR #2 remain unchanged.

V1's guard deliberately has no withdrawal interface and cannot be repurposed.
V2 has new code, immutable genesis storage, getter and deposit payload. Every set
of terms changes its StateInit/address. It is neither a storage upgrade nor a
drop-in destination for V1. Do not overwrite V1, change existing candidate files
or present the unsigned V1 Testnet plan as permission to deploy V2.

## Immutable terms and ownership

Integer percentages 50..100, default 100. Durations: exactly 180 days (15,552,000
seconds), 365 days (31,536,000 seconds), or permanent (zero configuration duration),
default permanent. Locked and immediately available LP have separate accounting.
The beneficiary controls matured locked principal; a separately disclosed
controller controls the unlocked share. Both default to the creator; either can
be explicitly configured at genesis. No party can change terms or ownership later.

For cumulative received LP `T`, locked allocation is `ceil(T * percent / 100)`.
The smallest LP unit rounds toward the lock, so small or split deposits cannot
reduce the selected share. Every authenticated later deposit extends the expiry
of **all remaining timed locked LP** to at least `block_time + duration`.
This extension policy must be disclosed before choosing the destination. It
never shortens a lock or unlocks a later deposit using an earlier timestamp.
Permanent mode uses `2^64-1` as the recorded timestamp and categorically rejects
locked withdrawals irrespective of time. No admin, emergency, upgrade, burn,
retarget or configuration mutation entry point exists. If percentage <100,
the unlocked controller can still withdraw its own share in permanent mode.

One immutable operation ID and contributor are bound at genesis. Additional
operation IDs require another vault. An arbitrary sender, wrong operation,
wrong contributor, invalid payload or absent notification cannot credit LP.

## Authentication and custody

The existing pinned development STON.fi v2.2 profile derives the Pool from the
declared Router and pair-wallet addresses; LP wallet derives from that Pool,
captured pinned wallet code and the V2 contract as owner. Incoming TEP-74
notifications must come from that exact wallet and identify the immutable
contributor, operation and V2 tag. Full-message hashes prevent repeated credit.
The configured pair is immutable but must still be bound to the intended token
masters by the future migration protocol and independent verifier. Creator input
alone does not authorize a new pair or replace the existing guard's checks.

Actual captured LP wallet code executes in the new Sandbox tests. Pool-origin
mint inputs are explicitly controlled test fixtures, not actual Pool execution
or live liquidity. Existing full captured Pool/Router tests also remain passing.
Independent foreign source/build/current-code and non-upgradability review is
still required. Previously approved Router administrative trust remains limited
to development. `is_migration_authorized()` remains zero in V2 as well as V1.

## Withdrawals and failure accounting

Only the beneficiary can request locked LP, at `now >= unlock` and only for timed
locks. Only the controller can request the unlocked share. Positive amount must
be within that bucket. Each request must use the next on-chain sequential query
ID and attach at least .10 TON for gas. Protected old TON is reserved; the request
forwards its explicitly supplied funding to the authentic LP wallet. This is a
new development withdrawal funding requirement, not a buyer-fee change or verified
real-network fee quote. No LP principal is sold to fund it.

The selected available bucket is debited once; a per-request record and aggregate
pending amount persist before sending the standard TEP-74 transfer. Multiple
distinct legitimate withdrawals remain possible against the remaining buckets.
A direct authenticated bounce of that precise wallet request restores its bucket
once and deletes its pending record. Old query IDs and replayed bounces cannot
restore or spend it twice, including after newer requests have been issued.

**Known financial blocker:** the foreign LP wallet does not provide the project's
authenticated final-delivery/failure receipts. Successful recipient transfer,
or downstream bounce restoring the foreign sender wallet, cannot be finalized
inside V2 from excess TON or absent notifications. Such requests remain pending;
they never restore spendable balance or permit another claim of the same amount.
Tests verify real recipient delivery and frozen-recipient restoration separately
with getters, but the contract does not manufacture either receipt. Final claim
reconciliation needs a reviewed authenticated receipt/state-proof protocol.
No automatic retry, off-chain attestor or unrestricted sweep is introduced.
LP/receipt dictionaries grow and storage-rent policy needs independent review;
permanent withdrawal prohibition does not imply indefinite free TON storage.

## New interfaces and disclosure

Root: version:uint8=2, config reference, accounting reference, notification-hash
dictionary and per-request dictionary. Config binds percent:uint7, duration:uint32,
deposit_query:uint64, references containing Router/pair endpoints and parties,
plus the existing pinned profile. Accounting tracks received, locked-available,
unlocked-available and pending Coins; last kind/query, next sequential query and
unlock timestamp. Getter `get_claim_v2(query)` returns outstanding amount/kind;
zero means no outstanding record, never a delivered receipt.

TEP-74 notification payload: `0x414c5632` + deposit_query:uint64 (inline or reference).
Withdrawal: `0x414c5633`, next_query:uint64, locked_bucket:bit, amount:Coins.
`get_lock_v2()` returns percent, duration, unlock, total received, locked available,
unlocked available, pending, next query, beneficiary, unlocked controller, Pool,
LP wallet. Existing V1 getters and `verify-lp-custody.js` do not support this schema.

`scripts/lp-locker-v2.js` creates the offline canonical configuration and disclosure
model. `preview-lp-locker-v2.js PUBLIC_CONFIG.json` displays exact public terms,
addresses and pending custody status without signing or provider calls. Config
requires creator, contributor, Router, two pair wallets and operation ID; optional
percent, duration (`permanent`, `days180`, `days365`), beneficiary and unlocked
controller. Do not put private keys in that public config. Examples of invocations:

```powershell
node minter-contract/preview-lp-locker-v2.js PUBLIC_CONFIG.json
node minter-contract/compile-lp-locker-v2.js --check
node --test tests/settlement-runtime/lp-locker-v2.test.js
```

The disclosure model exposes exact percent, duration, actual on-chain unlock
timestamp (unknown before receipt), beneficiary, unlocked controller, balances
and pending requests. Address derivation or getter-only records are displayed as
`PENDING_UNVERIFIED` or `CONTRACT_RECORD_UNVERIFIED`, never verified locking.
The normal website does not load these tools. Actual creator controls and a V2
chain-anchored custody verifier remain pending, to preserve the current design
and avoid presenting an unusable feature as available.

## Migration integration plan and outstanding work

1. Review V2 source, rent/gas assumptions and failure records independently.
2. Design an acyclic, versioned migration constructor/registration binding the full
   V2 StateInit, exact terms, beneficiary/controller, contributor, intended token
   pair and pinned foreign contracts. Current V1 registration pins V1 guard code
   and payload; do not silently substitute V2. Resolve any address dependencies
   explicitly rather than accepting an arbitrary post-deployment LP wallet.
3. Add authenticated native/Jetton final-return acknowledgment and query between
   Curve and migrator; existing return stage 6 is still pending. Curve's legacy
   return interface is not a sufficient new correlated finalization protocol.
4. Recover LP evidence when the locker was frozen before its initial notification;
   resolve LP withdrawal final receipts without new unapproved attestor trust.
5. Verify both DEX legs, LP custody split and permanent/timed policies independently.
   A partial/timed lock cannot satisfy an old 100%-permanent finalization check.
   Add explicit reviewed V2 transitions, never relax V1 checks or refund ledgers.
6. Add the reviewed V2 custody adapter and opt-in controls using existing UI styles,
   disclose exact terms/controllers and distinguish pending from verified custody.
7. Regenerate V2-only candidate addresses and obtain exact supervised Testnet plan
   approval, execute real Testnet tests, reconcile traces and recovery. No existing
   Mainnet allowance authorizes this deployment. Mainnet remains blocked.

GitHub authentication diagnosis: Git's configured username was `vasquezminor23`,
while the approved CLI keyring session is `mdlabs1`. A command-local username
override retrieves credentials without logging/storing the token. GitHub then
rejects repository writes with HTTP 403 for `mdlabs1`. Reauthenticate an account
with write permission through the existing GitHub CLI/keyring mechanism, fetch
and recheck concurrent work, then push without force. No credentials were placed
in source or reports. PR #1 must not be described as updated until verified.

## Financial integration V2.1 follow-up

The dedicated financial-integration branch adds authenticated project custody
observations and explicit funded queries plus a new immutable destination-binding
component. Locker data shape stays compatible, but code and addresses change; old
V2 at `15d9143` remains preserved on its own branch. See
[the newer protocol](financial-integration-v2.md) and source/hash evidence. This
component is not a DEX executor, does not complete foreign withdrawal receipts,
and always denies migration authorization. Existing permanent/timed/replay tests
remain passing; no on-chain upgrade or production enable occurred.
