# Development refund and LP custody protocol — October 30

These are ANLGRAM protocol extensions, not invented STON.fi messages. All
production gates remain closed. Source/tests are authoritative for serialization.
Existing TEP-74 transfer interfaces remain available. Never mix contract families.

## Refund evidence

The owner opens `credit_open` (`0x414e5308`, query:uint64, peer owner:MsgAddress)
on its settlement wallet before a DEX operation. The wallet persists the peer,
current logical-time epoch and baseline cumulative credits. Reopening the same
operation cannot reset its baseline. Owner-only `credit_query` (`0x414e5309`,
query:uint64) returns `credit_receipt` (`0x414e530a`, query:uint64, epoch:uint64,
peer owner:MsgAddress, cumulative delta:Coins, current balance:Coins).

Only authenticated standard incoming transfers matching a preopened query/peer
and positive amount contribute. Standard incoming full-message hashes prevent
replayed credit/notification; outgoing per-peer/query pending amounts and bounce
hashes prevent duplicate restoration. Burn bounces require the master. Unrelated,
preopening or zero transfers do not create refund credit entries. Standard
excess TON and absent notifications are never proof of returned Jetton principal.

Migration `prime_refund_receipts` (`0x414e4c3d`) and
`sync_refund_receipts` (`0x414e4c3e`) carry query:uint64 and optionally wallet relay
gas:Coins. They are admin-only and explicitly funded from the incoming message.
Default .02 TON wallet relay + .02 TON routing funding is required; callers can
choose more relay gas. Previous native principal is reserved. Opening snapshots
original TON/Jettons; execution requires the matching ready epoch and principal.

The wallet-authenticated receipt must match query, peer and epoch. Cumulative
credits are monotonic; only the unapplied delta is booked and it cannot exceed
pending principal or actual wallet custody. Native refunds require the configured
source/origin, current query, sufficient actual attached TON and a unique full
message hash. Repeated partial native receipts cannot masquerade as new refunds.
Missing or underfunded receipts remain pending and can be queried with fresh gas.

Migration adds optional reconciliation state: stage:uint8, opened:bit, epoch:uint64,
original TON/Jettons:Coins, confirmed returned TON/Jettons:Coins, applied wallet
cumulative:Coins, optional native receipt dictionary and LP evidence. Per-query
records are archived in the used-ID dictionary. `get_migration_settlement` and
`get_migration_operation(query)` expose the current and archived eight-field
accounting records. Existing configuration and protocol require review together;
there is no automatic in-place upgrade of deployed storage.

Stages: 0 none; 1 epoch pending; 2 prepared; 3 depositing; 4 reconciling;
5 principal recovered at migrator; 6 returning to Curve; 7 LP observed/unreviewed.
Stage 6 still needs authenticated confirmation of Curve bookkeeping. Stage 7
does not clear principal or authorize successful graduation/finalization.

## LP identity and custody observations

Guard `register_lp_operation` (`0x414c5002`) takes query:uint64, funding owner
address and a reference to the complete migration StateInit. Admin authorization,
the expected Curve, derived addresses, pinned migration/settlement code and
configured Router, pair, master and guard must all match. A caller-selected wallet
address alone is insufficient. The guard configuration optionally appends the
expected Curve after admin; its optional fourth root reference stores LP records.

The migration uses the existing STON.fi `cross_provide_lp_body` custom-payload
field to pass ANLGRAM tag `0x414c5003` + query:uint64 for the new wallet family.
Legacy null custom payload stays unchanged. No foreign opcode is introduced.

Actual LP notifications must come from the derived LP wallet and name the
registered liquidity contributor (migrator) as origin. The LP master is the Pool;
the notification origin is not the Pool. Query, payload and positive amount must
match. Full-message-hash deduplication prevents repeat observation. Guard records
owner/Pool/wallet/amount and retains custody without a withdrawal entry point.

`query_lp_receipt` (`0x414c5004`, query:uint64) lets the admin or funding owner
request the persisted observation using explicit gas. The guard emits
`0x414c5005`: query:uint64, Pool address, LP wallet address, cumulative amount:Coins,
reviewed:bit (always zero). Migration accepts only its configured guard and exact
operation/LP destination. `get_lp_receipt` and `get_migration_lp_receipt` expose
the records. Losing the guard-to-migrator message is recoverable; never executing
the original LP notification at a frozen guard is not currently recoverable by
this protocol. An off-chain balance snapshot cannot substitute for that receipt.

`is_migration_authorized()` remains zero. Migration finalization (`0x414e4c43`)
rejects 414. Pool/LP deterministic identity is not independent source review or
proof of current foreign implementation/non-upgradability. STON.fi administrative
trust was accepted for development only. No claim of finalized or permanently
locked live liquidity follows from these local observations.

## Reproduction and compatibility

Compile/check in order: settlement wallet, bonding curve, migration router, LP
guard. Regenerate both wallet and migration code pins before dependent artifacts.
All four code cells and dependent candidate StateInit addresses change; the
minter code is unchanged but its wallet-code data changes its address. Source
hashes and BOC hashes are in `verified-financial-completion-2026-10-30.json`.

Run `npm test --prefix tests/settlement-runtime`, root regression runner, math,
legacy minter tests and supervised executor tests. Refund actors are controlled
local counterparts; STON.fi capture tests use actual captured code in Sandbox.
Neither is live blockchain deployment evidence. See the sprint report for exact
counts, the transient executor timeout and unresolved financial gates.
