# Curve #2 — owner recovery decision sheet

**Decision boundary only. No active recovery implementation or financial authorization.** Original operation, fingerprint and persistent lock remain unchanged. Evidence: [machine-readable reconciliation](curve-two-reconciliation-2026-11-01.json).

## Finalized-chain findings

Final cross-provider check: **November 1, 2026, 18:54:16 New York (23:54:16 UTC)**. TON Center and TonAPI agree on source account/code/data/balance/latest transaction, and on masterchain block **95190406**, chain time18:54:14 New York, root `2dc02860dcef9e0e5cfcb53319fa204336a06b388286c0f37ae2dd12aad0413e`. Root and file hashes match across providers. An earlier authenticated protected TON Center observation also agrees.

| Finding | Verified evidence |
|---|---|
| Operator | `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR`, active V5R1 |
| Sequence / wallet ID | seqno **1**, wallet ID **2147483645**, signatures enabled, no extensions, expected public key |
| Balance | **5.893016464 Testnet TON**, unchanged |
| Last operator transaction | `d2e8fd5233eb8bf05a428605ea3735d67a1b50741826bb6996156ec49020dc21`, LT106958981000003; incoming funding at16:44:25 New York, before the #2 attempt |
| History | Five source transactions. Their raw transaction-BOC hashes and previous-hash/LT links verify back to genesis. No transaction after the attempt; the only external outgoing action is the already-known minter #1 deployment |
| Curve | TON Center directly reports **uninitialized, balance0, no code**. TonAPI returns empty transaction history; its raw-account404 alone is not treated as zero-balance evidence |
| Minter | Active, supply0, administrator unchanged |
| App operation | `LOCKED_PENDING_RECONCILIATION`; fingerprint `508c80f62122112cbda6af7a1fdad53a4a1bc86bad009bdd66f212988055bb28`; no reset/rearm/replacement |

This is corroborated finalized-provider evidence, not a locally verified validator-quorum/account-Merkle-proof package. No accepted Curve #2 execution is present through the corroborated state. No new debit or source transaction is observed. This does **not** establish whether Tonkeeper created a signature, attempted a rejected broadcast, or retained a different signed request.

## Signed-message and receipt search

Examined55 existing launchpad/task JSON evidence files, without inspecting wallet private storage or credentials. Three unique Curve-directed wallet bodies are **all-zero-signature emulations**, cryptographically invalid for the approved operator. One authentic operator signature was found for **seqno0 to the minter**, corresponding to transaction #1; it is not #2 and must never be replayed. No authentic signed Curve #2 BOC or genuine #2 transaction hash was found. The55-file search is scoped, not a claim that no copy exists on the owner's phone.

The request fingerprint is a local canonical-request digest, **not** a blockchain transaction or external-message hash. Simulation trace hashes cannot be promoted into live receipts. Without the actual signed #2 body, its signature, actual signed expiry/seqno/actions/StateInit cannot be conclusively validated.

## Can the old request still execute?

The reviewed request deadline was **17:53:36 New York (22:53:36 UTC)**. The deployed source code hash matches the official published V5R1 hash `20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f`. Official V5 source checks signature, exact stored seqno and wallet ID, rejects `valid_until <= now()` with136, increments seqno on acceptance, and commits external replay protection before processing actions.

**A correctly signed message actually containing that expired deadline cannot now be accepted, even though seqno remains1.** However, we do not have the native signed body proving that deadline was used. Seqno1 is still the **current** nonce: some other valid seqno1 signature with a future deadline would remain usable. Waiting or observing the unchanged nonce does not invalidate such an unknown signature. It is therefore not justified to release the old lock from snapshots alone.

Official rules reviewed at source commit `ff2a9cdb5abe3efdba1e773e4d03a53dea1550b1`; source-file SHA256 `b2ac76071f1cef914ecff601cafa6ec6e015857c6bbde993d255851df62d6a8f`. No wallet/ANLGRAM contract recompilation or deployment was performed. Prior read-only diagnostics independently reproduce fresh wallet emulation success versus expired136, but do not prove the exact cause of the owner's native warning.

## Recovery choices

| Choice | Support, cost and consequence |
|---|---|
| **A. Keep lock; recover existing evidence first** | Safest zero-spend immediate choice. If Tonkeeper already has a public hash or signed message, inspect it without creating a new signature. A verified expired exact message could support a reviewed reconciliation record; it would still not authorize a resend. Currently that evidence is unavailable |
| **B. Separately invalidate seqno, then review a new versioned operation** | Strongest practical option for resuming when the actual signed body is unavailable: a separately approved self-transfer from the same Testnet V5 consumes the nonce. A genuine finalized source receipt and actual resulting nonce make all old nonce1 signatures invalid, while retaining the old Curve lock/history. Requires new design review, code/tests, fresh funding/fee checks and individual owner approval. No active path exists |
| **C. Wait, change IDs or send Curve again directly** | Waiting alone does not invalidate a different unexpired nonce1 signature. Changing IDs/direct send would bypass the unresolved operation and is not approved. Do not reset the original ledger |
| **Zero-value self-call / no-op** | Could reduce the initial gross debit, but native Tonkeeper compatibility and exact execution have not been established. An empty action list is not the existing TON Connect one-message flow. Do not assume support or select this variant silently; assess it in the separately authorized design phase |
| **D. New operator/wallet/project** | Does not invalidate an old signature at the existing operator. It also changes dependencies/authority or requires additional transfers; unnecessary for the evidence-supported recovery here |

**Recommendation:** keep A immediately; if no existing authentic evidence can be recovered and the owner wants to resume, approve **development/review only of B**. Do not authorize another Curve send or an active unlock now.

## Passive gas model for B — not an approved transfer

Read-only Testnet wallet-emulation model at18:48:26 New York used an **invalid all-zero signature**, source seqno1, no source/destination StateInit, one **0.010000000 TON self-transfer** to `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR`, mode3 and public comment `ANLGRAM TESTNET nonce invalidation; Curve #2 remains locked`.

- Sender transaction fees:0.000515384TON.
- Remaining internal forwarding fee:0.000071290TON.
- Self-receipt transaction fees:0.000051868TON.
- Modeled network cost: **0.000638542TON**, cross-checked against the emulator's account event delta.
- Modeled initial gross debit before the self-receipt: **0.010586674TON**. The0.01TON returns to the same wallet, less receiving/network fees; it is not a payment to a third party or a platform donation.
- A possible **0.020000000TON gross-debit policy ceiling** is a review proposal only, not approved and not a network-enforced maximum. Fresh quotes/storage/forwarding/execution/action outcomes and wallet serialization can change the cost. No existing0.12TON Curve authorization carries over.

These values are illustrative passive design inputs. No live signing transaction, executable recovery UI, reusable financial grant or deployment candidate was created. No valid signature exists for these probes.

## Required design safeguards and risks

1. Add a wallet/destination-wide exclusion and append-only reconciliation link. The original Curve record and fingerprint remain immutable; a fresh operation ID must not bypass them.
2. Cancellation would be its own tightly scoped Testnet operation, self-recipient only, exact body/value/network/V5 identity, one outbound attempt, permanent lock, no automatic retries.
3. Verify the real finalized self-transfer trace/signature, fee/debit/return accounting and actual source seqno/code/key continuity. A failed/uncertain cancellation is not invalidation. No new Curve request until this is conclusive.
4. Native TON Connect cannot atomically impose the expected seqno. Require exclusive operator use and fresh state; if another transaction or the old request wins the race, stop, reconcile actual traces and do not silently choose another nonce.
5. After a successful nonce1 cancellation, expected source seqno becomes2. The existing seqno1 Curve executor must remain blocked. Any new recovery executor requires a reviewed protocol/version and the **actual** next nonce. Curve StateInit/address, minter, tokenomics and donation stay unchanged; subsequent nominal seqnos must be refreshed too.
6. No wallet destruction/reinitialization, generic send bypass, Mainnet fallback, blind signing or unlimited retries. Do not override another native emulation failure.
7. Recovery remains dependent on authentic provider acquisition/finality and independent review of the new ledger path; this report is not that external security review.

## Exact new authorization needed

**Now, if choosing B:** “Authorize development and local testing only of a Testnet V5 sequence-invalidation recovery design, preserving the original Curve #2 lock and history. No active recovery, signing, broadcast, self-transfer or spend.”

**Later, only after that review passes:** separate explicit authorization of one freshly quoted Testnet self-transfer, with exact approved amount/body/destination/nonce, new single-attempt ID, expiry and gross-spend policy (the0.01/0.02 figures above are proposals). Manual Tonkeeper confirmation remains mandatory. Verify actual chain result before proposing anything else.

**Still later:** a distinct approval for one new versioned Curve recovery transaction, if justified by the finalized invalidation/reconciliation evidence. Never silently reuse the original attempt.

## Actions in this task

Read-only provider queries, evidence parsing/hash/signature checks and invalid-signature passive fee emulations only. **No financial request, signature request, transaction broadcast, self-transfer, TON spend, deployment, lock mutation or active recovery implementation.** No unrelated integration/audit was repeated.

Primary references: [pinned V5 source](https://github.com/ton-blockchain/wallet-contract-v5/blob/ff2a9cdb5abe3efdba1e773e4d03a53dea1550b1/contracts/wallet_v5.fc), [official V5 code identity](https://github.com/ton-blockchain/docs/blob/main/content/contracts/standard/wallets/v5-api.mdx), [official wallet/emulation methods](https://docs.tonapi.io/tonapi/rest-api/emulation).
