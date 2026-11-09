# Settlement architecture decision

Evidence baseline: PR #27, fd68005df228a28b6bc3db5d4158e76a240528f0.

Adopt A for product status. Keep settlement pending as an independent financial state. A provides a useful custody milestone on the existing contract graph. All three options remain NO-GO for full settlement with the supported interfaces and current trust model.

## Status contract

Treat dispatch, LP evidence and settlement as separate fields. A project may have verified historical LP lock allocation and pending settlement simultaneously.

| State | Evidence and scope |
|---|---|
| DEX_DISPATCHED | Migrator's committed one-shot dispatch record. Establishes dispatch, before downstream delivery or execution is known. |
| LP_MINTED_OBSERVED | A matched Pool-to-LP-wallet mint edge in a trace. Report trace provenance separately. The Migrator receives a Locker credit observation rather than the Pool mint transaction itself. |
| LP_CUSTODY_VERIFIED | Authenticated Locker observation from the immutable expected Locker, with correct operation, Pool and wallet. Report credited amount and observation LT. This verifies historical attributed credit. |
| LP_LOCKED_VERIFIED | The same authenticated observation with verified immutable terms, exact locked allocation and unlock timestamp. Report the locked amount as of the observation. Current wallet holdings and pending withdrawals require separate fresh evidence. |
| SETTLEMENT_PENDING | The contract's existing pending state, shown independently from custody. Keep missing amounts unknown. |
| SETTLEMENT_COMPLETE | Requires a terminal conservation proof for both legs and all recovery obligations. Gate 414 currently blocks this transition. |

Keep authorization a separate property evaluated by the action handler. Status projection has no role in withdrawal, refund, dispatch or finalization checks. Label evidence obtained in Sandbox accordingly. If a deployment lacks generation 2 identity or authenticated receipts, omit unsupported verification badges.

## Architecture comparison

**A. Official STON.fi v2.2 with separate custody and settlement.** Preserve creation, trading, the one-shot migration and immutable Locker configurations demonstrated in Sandbox. The graph stays Curve → Migrator → token wallet and pTON wallet → Router → Pool → LPAccount → Pool → LP wallet → Locker → Migrator. The final Locker message is 0x414c5635. Reuse the existing epoch ledger, registration, observation and bounce handlers. Those establish ANLGRAM-side conservation through dispatch, bounded return credits and historical LP credit. Pool-side consumption remains unresolved. Delayed or recreated accounts remain observations tied to their sample, with no sweep authorization. Immediate authenticated withdrawal bounces retain their existing handling. Missing LP notices, ambiguous downstream delivery and automatic LPAccount recovery remain pending. Trust stays within the existing contract and foreign profile assumptions, including Router upgrades. Product projection requires no contract upgrade or address changes. Financial deployment remains a separate decision.

**B. Versioned adapter with custody of its own obligations.** A future graph could be Curve → operation-specific adapter → official Router and downstream contracts, with Locker and return-wallet receipts bound to the adapter's operation. The adapter could issue a durable acknowledgment of funds it actually receives, its own release and exact authenticated returns. A unique provider per operation can isolate operations, while the foreign account can still be recreated within an operation. Adapter balances and send records can prove conservation up to the external boundary. They cannot account for later Pool consumption or rule out pending foreign messages. A relay acknowledgment cannot extend that proof. Exact closure would require either a foreign terminal interface covering that operation, or a contract-verifiable proof of the foreign transitions and message closure anchored to authenticated TON history. A fully controlled DEX could define these receipts but changes the intended official STON.fi integration. A wrapper adds asset custody, gas requirements, versioned StateInit identities, failure and recovery paths, and qualified review. It does not supply new foreign refund or withdrawal evidence by itself. Do not implement it for the current milestone.

**C. Additional supported STON.fi interface.** The reviewed Pool, Router and LPAccount interfaces expose state, address discovery, liquidity routing, mint delivery, cancellation and pay-to transfers. The LPAccount → Pool callback 0x06ecd527 carries amounts for Pool execution. The mint transfer → LP wallet carries the LP amount. The Pool → Router pay-to path routes returns to wallets. These messages have different recipients and do not provide Migrator a terminal receipt with both consumed amounts and a closed set of returns. Pool state is aggregate. LPAccount state has no incarnation marker or delivery fence. Payloads can carry correlation, which still needs verified amounts and terminal outcomes. Excess is gas. The existing graph retains the product features but exact closure is unsupported by the documented compatible interfaces reviewed here. A supported extension would require a versioned foreign endpoint and pinned code, with reviewed upgrades and deployment compatibility. No existing callback can simply be relabeled as this proof.

Official interfaces reviewed: [Pool](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/pool), [Router](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/router), [LPAccount](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount).

## Exact changes and next milestone

For A, contract modifications are zero. Reuse get_dispatch_state, get_lp_v2_state, immutable Locker binding and the project LP evidence adapter. The latter already distinguishes raw fields and reference-relative inclusion from validator finality. Preserve Gate 414 and the migration-only permit scope. No financial authority is needed to project these statuses.

Implement a read-only generation 2 projection as the next milestone. It should require a verified project identity and operation, preserve observation LT, expose unknowns explicitly, and keep the independent settlement status visible. Prove the projection on existing fixtures, including historical custody after withdrawal and custody with settlement pending. Keep it disconnected from every financial action. There is no need to rerun LPAccount lifecycle experiments for this milestone.

For eventual full settlement, the smallest missing interface is a contract-authenticatable, operation-bound terminal outcome covering both legs. It must bind chain, version, provider, Pool, pair, operation and dispatch epoch, establish exact consumed and returned principal and close the in-flight obligations. A future consumer would validate the source or cryptographic history, enforce once-only acceptance and preserve the equation original = consumed + actually returned + unresolved for each leg. Gas remains separate and unresolved must be zero. A full refund without LP is a failed migration outcome. A valid migration must also satisfy the existing LP minimum and lock allocation. A signer cannot fill in any missing term.

The boundary is causal closure of the foreign message graph, as established by PR #27. Presenting custody independently is feasible now. Releasing funds or completing settlement from those same observations remains unsupported.
