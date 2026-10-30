# LP verification model — approved for development only

On October 30 the user explicitly accepted this model: "Acepto el modelo para
desarrollo". That accepts the stated external Router-administration trust for
development. It does not waive independent review or authorize deployment,
signatures, spending, financial activation or a Mainnet readiness claim.
Current contract result remains `is_migration_authorized() = 0`.

## What the current evidence establishes

Actual configured Router and pTON code references were independently observed
through TonAPI capture and public TON Center reads. The local Router getter's
advertised Pool, LP-account and LP-wallet code cells match the StateInit cells
actually instantiated in Sandbox. These are code-cell identities and execution
evidence, not independently audited source correspondence or validator proofs.
`sourceAuditVerified` is explicitly false in the new bootstrap test.

Before the first deposit, the Pool address can be obtained but the Pool is
uninitialized. TEP-89 LP discovery cannot succeed at that point. After a single
local deposit initializes it, the guard can discover an LP wallet address even
though no LP wallet or balance exists yet. Hence phase 5 must not mean custody.
The second deposit creates actual LP units; local owner/master and unauthorized
withdrawal checks pass, while the guard still refuses authorization.

The Router's administration can change its code. Actual reserves reside in
Router-owned token wallets. Permanently preventing the guard from sending LP
tokens does not remove a foreign Router administration's power over underlying
DEX custody. A snapshot or attestation cannot guarantee that no future upgrade
will occur. This is a separate trust assumption from LP wallet ownership.

See the official [Router specification](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/router)
and [Pool specification](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/pool).
The public [dex-core source repository](https://github.com/ston-fi/dex-core)
describes v1 deployments; that source cannot be asserted to verify the captured
v2.2 bytecode. A matching independently reviewed v2.2 source/build has not been
established by this sprint.

## Narrow alternative proposed for explicit review

Develop deterministic contract authentication with **explicit trust in the
configured STON.fi Router administration for foreign reserve custody**. Do not
describe this as fully trustless liquidity.

Requirements before implementing authorization:

1. Establish versioned independently reviewed source/build correspondence for
   the exact Router implementation, Pool, LP account, LP wallet and pTON code,
   resolving exotic library references. Record code hashes, the actual Router
   admin and upgrade mechanism. Matching two provider responses alone is not
   sufficient. The captured upgrade-cell hash is not an assertion that no upgrade
   is pending; decode and verify its fields before each supervised operation.
2. Derive the exact Pool StateInit from approved code, pair and genesis fields
   inside the guard. Independently derive the LP wallet StateInit with owner
   equal to the immutable guard and master equal to that Pool. Authenticated
   replies may corroborate these values but cannot replace local derivation.
   Audit absence of foreign Pool/LP wallet code replacement and arbitrary owner
   changes. If those properties fail, stop and revise the model.
3. Solve first-Pool bootstrap using verified StateInit construction, not a dummy
   wallet or an unapproved seed deposit. A pre-existing Pool also needs reviewed
   reserve/slippage handling. Do not alter the 500 TON / 200M token allocation or
   use another actor's liquidity as proof of this migration.
4. Bind one immutable migration operation to network, pair, source Curve,
   migrator, guard, expected Pool and LP wallet, amounts and nonce. Accept the
   authenticated mint/delivery notification only from that derived LP wallet,
   with expected Pool origin and operation payload. Prove the exact LP code
   credits balance before notification and that the guard cannot subsequently
   transfer/burn/upgrade it. A balance getter snapshot alone is insufficient.
5. Complete authenticated project-wallet recovery receipts, including standard
   DEX refunds with zero notification gas, and reconcile both asset legs, actual
   LP custody and pending accounting before finalizing. Reject repeat execution,
   mismatched IDs, substituted contracts and incomplete traces. No assertion of
   permanent LP custody based solely on an outgoing transfer's success.

Router upgrade trust, source verification and immutable destination derivation
are independent requirements. User acceptance of Router trust cannot waive the
other requirements or independent review. Real Testnet evidence is then required
before proposing any Mainnet transaction plan.

If this external trust is unacceptable, leave migration blocked and design a
separately reviewed architecture with immutable foreign custody and validator-
anchored state proofs. That is an architectural decision, not an automatic
replacement of STON.fi. A committee-signed snapshot would add committee trust
without removing the Router trust and is not proposed as a shortcut.

## Current implementation boundary

The new recovery entry point forwards only explicitly supplied operational gas
through authenticated Router -> pair Pool -> own LP account queries. It can
request refunds to the migrator itself, never an arbitrary withdrawal recipient.
It does not attest code, authorize liquidity dispatch or mark LP custody complete.
It inherits the existing configured DEX trust and stays behind the production
financial block. The zero-forward Jetton refund accounting gap is deliberately
unresolved rather than cleared using a provider snapshot.

Trust-model status: **approved for development only**. Independently reviewed
v2.2 source/build correspondence, code immutability, actual custody receipts and
live Testnet verification remain incomplete. No financial authorization is enabled.

## Deterministic authentication implementation

The guard now supports an immutable optional genesis development profile. It
pins exact Pool, LP-wallet and LP-account code-cell identities and the observed
constant-product genesis schema. The contract independently builds Pool StateInit
from the Router and the two discovered token wallets, ordered by descending
serialized-address cell hash. It independently builds the zero-balance LP-wallet
StateInit with owner equal to itself and master equal to that Pool. Authenticated
Router/Pool replies must match those locally calculated addresses.

The observed Pool genesis fields are unlocked, zero reserves/supply/protocol
collections, null protocol-fee address, and DEX fee fields 20/10. These are
identity inputs from existing captured foreign code, not changes to ANLGRAM or
STON.fi economic settings. The schema is cross-referenced to
[TON ABI revision 7dc5706](https://github.com/ton-blockchain/abis/tree/7dc57067d85c95dc25c09ccaaf108eaba62f6303/data/stonfi).
ABI schemas are not audited implementation source or proof of code immutability.

`get_expected_destinations` exposes profile presence and derived endpoints once
both token wallets are discovered, including before the Pool is deployed.
Profile presence is not code audit, authorization or custody. The TEP-89 reply
from a live Pool remains a separate corroboration; an uninitialized Pool still
cannot send that reply. Original configurations without the profile remain
readable and retain their previous address-discovery behavior, without gaining
new financial authorization. The offline candidate now includes the profile.
