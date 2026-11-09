# Experimental generation 2: state model before implementation

Scope: separately named source-compiled contracts and Sandbox execution only. Existing VNext sources, artifacts and deployed/live gates remain unchanged. Generation2 cannot be made cryptographically Sandbox-specific merely by checking Testnet global ID; no signing, public execution interface or deployment authorization is provided.

The implementation must establish these invariants in executable tests before claiming any local financial path works:

| State | Required evidence / permitted next transition |
|---|---|
| PERMITTED_UNFUNDED | Curve graduated at500 TON, inventory0, escrow200M, claims0; matching unexpired phase1 signed permit and real receiver epochs. |
| FUNDING_PENDING | Curve persists consumed nonce/digest and irreversible dispatch flag before sending either asset. No second release, revocation/rearm or blind retry after any downstream failure. |
| FUNDED | Migrator's existing authenticated native deposits and cumulative settlement-wallet funding receipt match original obligations and exact epochs; actual native/token custody covers them. No DEX funds sent yet. |
| DEX_DISPATCHED | Matching fresh phase2 permit, exact immutable wallets/minimum LP, no existing dispatch/return, principal plus caller-funded gas available. Commit consumed permission and existing DEX obligations once. Critical sends use non-ignoring action modes; transaction-level action failure rolls back dispatch. |
| LP_CUSTODY_OBSERVED | Actual immutable Locker-origin observation matches root/Pool/wallet and exact allocation, minimum LP, no pending withdrawal, no contradictory refunded principal. Receipt LT is strictly newer; no custody from signer, indexer, probe or excess. |
| SETTLEMENT_PENDING | Explicit recorded reconciliation state; custody can be known or unknown. No inference that outstanding DEX obligations are satisfied simply because LP exists. |
| COMPLETE | Unreachable in this generation unless a separate contract-authenticatable completion predicate is implemented and reviewed. No permission/admin/timeout can manufacture missing foreign settlement evidence. |

Existing per-operation lifecycle/receipt dictionaries are authoritative; no duplicate ledger is introduced. Both contracts check actual config19=-3 at execution. Version2 commitments change deterministic genesis identities; old project/version permits cannot apply. Guard's migration-only verification code is reused without custody/refund privileges.

Curve's exact one-shot write must survive later storage writes in its legacy dispatch body. Migrator's consumed registration must survive its legacy used-ID/reconciliation saves. Consumption must be written after those saves but before transaction completion; all writes and critical sends belong to the same TVM transaction. An abort in the action phase must not leave a consumed permission with emitted partial critical sends.

Protected liquidity, protocol fees and prior operational/storage balances are reserved independently of each caller's gas attachment. Unused dispatch gas may return only after critical asset sends; no automatic principal retry is emitted by callback or recovery code. Authentic bounces and cumulative returned balances may update existing obligations but never reset consumption.

Financial recovery/abort paths stay closed during and after dispatch. Read-only funded observations may continue. A lost first LP notification, failed recipient transfer or ambiguous asset leg must remain pending/unknown rather than release other funds. Permanent locks and immutable partial/timed terms remain Locker V2's responsibility.

Proof obligations: fresh genesis through both asset legs and actual captured DEX code; duplicate/wrong/expired permissions; wrong network; delayed or bounced funding; lost LP notification; insufficient gas; partial DEX failure; hostile and stale Locker receipts; exact allocation for permanent and timed locks. Local traces are not finalized Testnet evidence or independent human approval.
