# Curve #2 recovery proposal — NOT an execution authorization

Current facts are preserved in curve-two-attempt-2026-11-01.json. The old Curve operation remains permanently locked; no reset, replacement operation or retry has been implemented. No new financial transaction is prepared for signing by this proposal.

## Evidence already available

- The exact Curve request was claimed22:53:05.344Z, with signed-message deadline22:53:36Z and fingerprint508c80f62122112cbda6af7a1fdad53a4a1bc86bad009bdd66f212988055bb28.
- Owner reported accepting in Tonkeeper, followed by inability to emulate. Browser SDK expired22:53:36.170Z; no signed BOC or new transaction hash returned.
- Fresh protected TON Center reads and independent TonAPI observations show source seqno1, unchanged source last transaction/data/balance, minter supply0 and undeployed Curve. This supports no observed execution, but does not expose the bytes the native wallet may have signed.
- Official read-only Testnet wallet-emulation probes: fresh exact V5 request HTTP200 with both wallet/Curve simulated success; expired-deadline variant HTTP406/exit136. These are zero-signature simulations, not deployments or the owner's actual failed response.

## Immediate non-financial recovery

1. Keep the previous wallet request closed and do not approve it again. Preserve its permanent lock and expired grant.
2. Obtain a public transaction hash or the exact signed external-message BOC from the wallet only if it already exists. Never ask for seed/private keys or sign another request merely to create evidence.
3. If a real transaction exists, use the existing V5/Curve receipt verifier plus independently acquired finalized trace/accounts. Check signature, wallet ID, seqno, exact internal action, StateInit/body/value, target code/data and accounting. An error screen or emulated trace cannot satisfy this.
4. If the exact signed external is available and its verified expiry is past, prove it cannot now be accepted; corroborate source sequence and destination state. Any new attempt still requires explicit owner approval and reviewed operation-ledger changes; never erase the original record.

## Contingency when no signed external is available

A reviewed **Testnet-only sequence-invalidation operation** is an alternative design, not something to execute now: the owner separately authorizes a minimal self-transfer from the same V5 operator to itself, verifies the genuine finalized source transaction and actual resulting seqno, then confirms that every old seqno1 signature is invalid. Existing TON wallet replay rules require the signed seqno to equal current storage and advance it on acceptance.

This would cost network fees and requires its own exact destination/value/fee sheet, fresh proof, one-attempt executor, separate owner approval and manual Tonkeeper confirmation. The amount and spending ceiling have **not** been approved or chosen. Do not use Mainnet, an unrelated destination, a new private key, a generic send interface or a silent self-transfer.

After a genuine sequence-invalidating receipt, the pinned seqno1 Curve executor is obsolete for execution. A new **reviewed/versioned recovery operation** would have to pin the actual next seqno while preserving the identical Curve StateInit/destination, candidate and financial amounts. Preserve the old operation/lock/fingerprint forever. Introduce a destination-wide reconciliation gate so a new operation ID cannot bypass an old uncertain operation or deploy/send principal twice. Check for an already deployed Curve before any request; native TON Connect still cannot atomically impose the requested seqno, so exclusive operator control remains an explicit assumption.

This is a consequential additional financial workflow and operation-ledger change. It needs owner design approval and independent review before implementation/activation. No cancellation, rearm, lock release or replacement signing operation has been performed.

## Confirmation timing for any future approved operation

Have the owner keep the correct Testnet wallet foregrounded before preparing the short-lived quote. Renew proof before it becomes the limiting transaction deadline. Generate/validate the finite runtime grant and current quote just in time, display exact details, and require prompt native review. Do not extend existing windows or silently raise funds. If the remaining human-confirmation interval is inadequate, stop before claiming; a numeric minimum runway policy should be explicitly reviewed rather than represented as a guarantee of wallet responsiveness.

References: [TON wallet replay/expiry rules](https://docs.ton.org/standard/wallets/how-it-works), [official wallet-emulation interface](https://docs.tonapi.io/tonapi/rest-api/emulation), and [OpenAPI](https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.yml).
