# First supervised financial Testnet release

## Independent execution gates

| Gate | Readiness | Evidence required to open separately |
|---|---|---|
| Standard minter deployment only | Conditional candidate, closed | Fresh separately controlled Testnet V5R1 account, domain-bound ownership proof, current seqno, empty destination, exact manifest and one-message emulation, fresh fee quote within an owner-approved policy ceiling, a dedicated persistent lifetime operation lock and reviewed one-attempt transport, exact owner authorization and manual wallet confirmation. |
| Standard initial mint | Closed | Independently reconciled deployment, verified minter admin and zero supply, authenticated child-wallet delivery and consistent supply, safe handling of a bounced or failed child transfer. An underfunded child caused the current artifact to increase supply without delivery in Sandbox. |
| Launchpad initialization and activation | Closed | Separately reviewed versioned minter, Curve, Guard and Migrator identities, authenticated initialization, allocation custody, authority reconciliation and activation receipt. The original Curve #2 remains out of scope. |
| Curve buy/sell | Closed | Verified activation, funded per-trade operation, authenticated Jetton delivery or failure and exact reserve, fee and refund reconciliation. |
| Graduation | Closed | On-chain 500 TON eligibility and reserve/obligation reconciliation for the exact Curve. Graduation status grants no migration authority. |
| STON.fi migration | Closed | Exact project-scoped migration permit, pinned Router/Pool/pair, both deposit legs and safe closure of partial or late returns. Official LPAccount recreation at the same address defeats an address-only cancellation barrier. |
| LP custody and locking | Read-only evidence only | Exact authenticated operation-specific delivery and Locker attribution, with immutable lock terms and balances. Missing notifications require verifiable delivery evidence. Historical credit does not describe current balance or terminal DEX settlement. |
| LP withdrawal | Closed | Verified beneficiary, maturity or unlocked allocation, exact final recipient delivery or authenticated bounce and duplicate-safe accounting. Foreign wallet dispatch or excess alone cannot settle a claim. |
| Financial recovery | Closed | Exact source, operation, epoch, amount and independently verifiable terminal result. No reset or retry from missing evidence. |

## Versioned offline manifest

Use `prepareStandardTestnetRelease(draft, publicKey)` from the release module with the canonical Standard Jetton draft and public key of the separately controlled wallet. The manifest pins the current execution version, Testnet chain -3, wallet V5R1 ID 2147483645, derived wallet and minter addresses, exact StateInit and body, operation IDs, code hashes and approval boundaries. The original operator is rejected. The actual wallet and resulting destination remain unassigned until the owner selects the new account. The official Wallet V5 implementation uses the network ID in the wallet ID. See [Wallet V5](https://github.com/ton-blockchain/wallet-contract-v5).

| Artifact | Code cell SHA-256 |
|---|---|
| Standard minter | `9a0f98dd6fbf225eef8165e4e64417ee931f7eea000653439e7b5dcdc0644cd6` |
| Standard Jetton wallet | `beb0683ebeb8927fe9fc8ec0a18bc7dd17899689825a121eab46c5a3a860d0ce` |

`standardDeploymentIdentity` binds the exact message and its StateInit to a recent block reference, reviewed wallet seqno, expiry of at most 60 seconds, modeled fee and owner policy ceiling. It consumes verified inputs from the future preflight and performs no RPC. The deployment attachment is 0.050 Testnet TON. Mint has a separate planned 0.150 TON attachment and stays closed. The 0.020 TON donation remains in the existing creation-charge plan. This technical deployment test does not settle the full creation charge or establish donation payment. Total debit including fees has no enforced numerical maximum in this release. Establish a fresh modeled debit and explicit policy ceiling before authorization.

## First operation and incident procedure

1. Review the exact PR head, select and prove control of the separate Testnet signer, check the balance and seqno independently, and confirm no concurrent activity. Confirm the destination is still uninitialized and recheck the exact deployment message in current-state emulation.
2. Wire and independently review a Standard-specific persistent dispatch record and one-attempt transport. Never share a Curve #2 operation identity or lock. Reserve the operation before presenting any wallet request. Expiry, rejection, timeout or reload never rearm it.
3. After separate owner approval and manual confirmation, match the included V5 source and minter histories at a corroborated reference. The release module verifies the exact signed action and successful deployment edge. Provider-relative inclusion and signed message fields do not establish validator finality. Preserve the source and child transaction identities, fee debit, minter admin, code and initial supply.
4. If evidence is missing or conflicts, keep the operation locked pending reconciliation. Preserve raw evidence, compare account histories and seqno, and investigate independently. Never issue a second deployment or mint while the outcome is uncertain.
5. Standard project persistent registration remains a release prerequisite. The existing Generation 2 registry verifies coordinated launchpad deployments only. A Standard deployment must use a separately reviewed Standard receipt variant in the same storage/API rather than invent a Migrator, operation settlement or LP status.

Keep `SETTLEMENT_PENDING` for unresolved DEX obligations. A contract-controlled adapter would need explicit acknowledgments or authenticated asset returns from every leg before enabling terminal accounting. A wrapper around the current foreign contracts cannot manufacture those signals. No escrow, signer or financial authority is added here.
