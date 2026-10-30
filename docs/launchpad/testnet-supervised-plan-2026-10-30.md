# Supervised Testnet candidate — blocked pending verification and review

## Accepted development model: new LP guard candidate

The user accepted the documented STON.fi trust model for development only.
The guard now pins development code identities and independently derives Pool
and guard-owned LP-wallet StateInit addresses, rejecting substituted responses.
No financial gate is opened: source/build audit, immutability review, custody
receipts and real Testnet execution remain required.

Current guard code hash:
`c7cb54c792e23eea4abb1bf3472d819ae2b8fb7d095b9010cf66031fec9e8143`.
Current guard candidate:
`0:0ea55227dfae405859094b7526c376b441c729aec35fd0a7943ffad3248046ef`.
Embedding this guard changes migration genesis, while migration bytecode remains
unchanged. Current migration candidate:
`0:245f446a80ffc4cbc80186a1d5f41358a28eefa368c1615afc0ae70104026740`.
The candidate JSON now also contains the independently derived LP-wallet address
before Pool deployment, explicitly marked without audit/custody authorization.
Master, Curve, token wallet code and tokenomics remain unchanged. Old guard and
migration candidate addresses below are historical; use the latest JSON.

Regenerate the foreign development profile with
`node scripts/prepare-stonfi-v22-profile.js --check` (offline captured code only).
The profile's code identities are not independent source verification. A schema
or foreign code update needs a separate reviewed guard version, not a runtime
admin override. No additional transaction permission accompanies model approval.

## Critical-integration follow-up

The current migration code hash is
`a8a0b3487d1a5f4dcc0dffb6ffc56532919fd5294796e2196818686a86e02d36`.
Its candidate address is now
`kQDwDbNIuf6DXoVS-Rt61qUV8LS8bjryBQzBaqFhFm4EbVPJ`.
Master, Curve, guard, wallet family and metadata are unchanged. Recomputed values
are in the adjacent candidate JSON. No address here is a deployment claim.

Optional recovery operation `0x414e4c3c` is caller-funded with at least 0.90 TON
in the tested configuration (foreign SDK refund budget 0.80 plus query-chain
headroom). It is not part of the earlier 2.5 Testnet TON smoke budget; submit a
revised transaction-specific budget before any real recovery test. The owner
cannot override the refund destination. Trace Router/Pool/LP-account replies,
nonce, original provision ID and actual native principal in the pTON response.
Aborting recovered funds back to Curve is another correlated operation, not an
atomic undo: 0.10 TON of explicit caller funding is required when both assets
return (0.08 for tokens + 0.02 for native TON). Native principal carries an extra
0.01 TON of caller-funded execution/bounce gas. Account for this in any approved
plan. Phase 5 return obligations remain pending until authentic return receipts
exist; do not use the DEX refund query to clear a Curve handoff.

Local recovery returns pTON principal and can recover actual Jetton custody, but
zero-forward DEX Jetton refunds do not notify their owner. Those liabilities
remain pending. Never use a getter observation to clear them, and never abort or
redispatch while either original asset leg remains unresolved. LP issuance alone
also does not clear pending principal. The LP trust model in
`lp-verification-model-proposal.md` requires approval and independent code review.

Use the existing backend's new read-only Testnet routes for account and trace
evidence: `/api/toncenter-testnet/account/:address` and
`/api/toncenter-testnet/traces/:exact-message-hash`. They reuse the existing
`TONCENTER_API_KEY` environment variable. Raw addresses are scoped explicitly to
Testnet; mainnet-tagged friendly addresses are rejected. The standalone
`scripts/verify-toncenter-testnet-evidence.js --read-only` also tests transaction-
hash lookup separately. No API result automatically establishes settlement.
Existing TonAPI and Cloudflare routes are preserved; the new route has not been
deployed to the Worker or any website.

No signer, secret, deployment or transaction is used by the offline builder.
`testnet-candidate-2026-10-30.json` records actual StateInit-derived candidate
addresses, current code/data hashes and proposed metadata. They are not deployed
ANLGRAM accounts. Snapshot-based DEX predictions are not deployment attestations.

## Operator and budget

User public address:
`UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd`.
Raw: `0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d`.
Testnet representation:
`0QDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbZ2X`.
Changing the friendly network tag does not create a wallet or prove control.
A public Testnet GET on October 30 observed uninitialized status and 0.0035 TON.
Before signatures, require connected wallet chain `-3`, exact raw address and
working operator control; re-read balance/status and fees.

The user explicitly clarified a ceiling of **5 real Mainnet TON including fees**.
No Mainnet funds were spent. That budget does not establish financial safety or
remove the demonstrated migration blockers. There is no connected signer or
verified Mainnet execution set. Mainnet remains blocked pending Testnet evidence
and resolution of critical financial issues. Do not automatically fund Testnet
from Mainnet, bridge, swap, sign or transfer based on the candidate document.

For a separately reviewed Testnet settlement-only smoke plan, provisional
attachments are 0.10 TON each to four contracts, 0.10 for Curve initialization,
0.20 for the 1B-token mint, 0.05 for operator renunciation, a 1.00 TON buy, a 0.10
TON sell, and optional 0.02/0.06 retries. A 2.5 Testnet TON ceiling is a proposed
test budget, not a fee quote or new spending authorization. Attachments include
storage/principal/excess, not just burned gas. Estimate wallet and descendant
fees before approval; stop if the reviewed cap would be exceeded.

The unchanged graduation threshold is **500 TON** of reserves. Full graduation
needs substantially more than the stated 5 TON Mainnet ceiling. It cannot be
proved by a 5 TON real-money run. Do not lower the threshold or reuse simulated
balances as live proof. Testnet graduation needs separately approved ample
Testnet funding after the LP/recovery blockers are solved. Migration operational
funding remains 0.40 TON, separate from the 500 TON principal.

## Candidate construction and deployment order

Use `node minter-contract/prepare-settlement-testnet.js` offline. It checks
artifact hashes and the wallet pin. The manifest's DEX pool prediction is computed
separately through captured local Router getters. No address is hand-invented.
Changes to code, metadata or genesis configuration invalidate dependent addresses.
Metadata `ANLGRAM Testnet Settlement` / `ANLTEST` is proposed, not approved.
Do not use the old planner's placeholder-wallet/truncated migration StateInit.

The acyclic candidate sequence is exercised in `genesis.test.js` from empty
accounts with actual StateInit cells:

1. Master embeds operator, metadata and final settlement-wallet code.
2. Curve genesis embeds that master and DEX, with unbound init-only endpoints.
3. Guard embeds masters, DEX and admin; it does not require the Curve address.
4. Migration router embeds Curve, guard, masters and DEX. Deploy exact states.
5. Initialize Curve once with exact derived wallet, guard, migration and code.
6. Mint exactly 1B tokens to Curve. Verify supply and actual wallet custody.
7. Automatic Curve admin-change request is rejected (73): the real operator must
   renounce master admin with query ID `0x414e4c4752454e4f` and Curve as explicit
   confirmation destination. Verify null admin and Curve activation, not just a
   wallet approval. This action is irreversible. Test another mint rejection.

All steps above are local evidence today. Require explicit supervised Testnet
execution review before broadcasting. Never include private keys in logs/files.

## Outcome evidence required during eventual supervised tests

For every wallet request, record network, operation ID, normalized external
message hash, account transaction hash/LT, source/destination/value/body, compute
and action results, and the complete descendant trace. Check actual Jetton wallet
owner/master/code and balances, sender settlement ledger, Curve pending and
completed state, supply and native reserve/fee reconciliation. Wallet acceptance
alone is not execution or delivery. Missing a message is not a failed trade.

Buy into undeployed and existing wallets, sell, and repeat funded retries with
the same operation ID. Local frozen-recipient fault injection cannot arbitrarily
freeze a public account: retain local coverage and only exercise a reproducible,
reviewed on-chain failure condition. Do not manufacture a live failure claim.

For eventual DEX verification, independently verify Router/master/code/library
identity, upgrades/trust, pair wallets, Pool, LP wallet owner/master, custody
balance and immutable withdrawal restrictions. Compare actual deposit/refund
messages and reconcile Curve/migration pending principal after all descendants.
The guard's phase 5 is insufficient; its authorization is zero. Current new
Curve dispatch must reject 414. Do not remove this gate merely to run a demo.

Production creation donation remains **0.20 + 0.02 = 0.22 TON**, plus network
fees, with the validated existing recipient and wallet disclosure. Testnet
recipient/network approval is still absent; do not repurpose the production
configuration or expose its address in normal UI. No donation file was changed.

## Recovery and stop conditions

Stop new funding/signatures on unknown status, code mismatch, replay conflict,
unexpected destination, reserve discrepancy, fee-cap exhaustion or partial DEX
execution. Poll the exact operation; query/retry only with reviewed explicit gas.
Refunds require authenticated custody restoration, never an absent notification.
Do not remint or invent a compensating trade. Record stranded native TON honestly.

No rollback can undo a deployment, renunciation, trade or permanent lock.
Quarantine a defective Testnet instance and review new deterministic addresses.
Recovery of a partial STON.fi LP-account deposit is not implemented/verified;
therefore full migration must remain blocked. No generic refund opcode or address
should be guessed. Implement and simulate the actual recovery before requesting
its real execution. Preserve PR #2 and leave production gates closed.
