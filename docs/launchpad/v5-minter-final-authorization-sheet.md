# Transaction #1 — final V5 Testnet preflight

**Signer review update:** authenticated connection declared Tonkeeper 26.10.4 and
SendTransaction support; no actual financial signing tested. Installed SDK HTTP
bridge automatically retries and the public sendTransaction wrapper does not
forward an attempts limit. Therefore financial execution remains **NO-GO** pending
a reviewed one-attempt transport guard. Latest hash-only/current-state refresh:
**0.106876940 TON** modeled debit; no enforced 0.12 total cap. Use the
[bounded procedure](v5-single-attempt-signing-procedure.md) and
[compatibility evidence](v5-signing-compatibility.json). Earlier simulation values
below are historical. This update grants no spending/signing authorization.

**Execution simulation PASS. Ready for owner review, NOT authorized or ready for
automatic signing/broadcast.** Exact data: [preflight evidence](v5-minter-final-preflight.json).
Baseline `7ebe087`; no production, interface, financial gate, contract or economics
change. This sheet authorizes no TON expenditure and never proceeds to step #2.

| Check | Result / evidence |
|---|---|
| Network/operator | PASS: chain -3, V5R1 wallet ID 2147483645; initial seqno 0, balance 1.999999999 Testnet TON |
| Ownership | PASS at observation: real owner renewed exact-domain ton_proof; expires 2026-11-01T02:06:47Z. An expired proof must be refreshed before a future request |
| Active candidate | PASS: SHA256 b5edda7666aae4b79c4218a2dd91b941724663adeb58523d5d4bc89b3668c634 |
| Seven artifacts | PASS: all seven freshly compiled and source/file hashes match the active candidate |
| Minter identity | PASS: independently parsed exact StateInit/admin/metadata/supply and derived the same destination; still uninitialized, zero balance |
| Current-state emulation | PASS: real Testnet TON Center complete trace at masterchain block 94993699; emulator-only signature bypass, no actual signature |
| Message count | PASS: one outgoing internal message to minter, no minter descendants, no automatic retry. First external request ALSO activates the uninitialized V5 operator wallet |
| 0.12 TON ceiling | CONDITIONAL: model fits by 0.013123062 TON; policy ceiling only, not technically enforced by V5 or TON Connect |
| Canonical Mainnet replay | PASS under observed canonical configuration: different wallet ID/address; matching-nonce negative emulation rejects 134 (invalid_wallet_id), not just seqno mismatch |
| Absolute replay guarantee | NOT ESTABLISHED: V5 checks stored wallet_id, not intrinsic blockchain global ID. A deliberately funded identical-StateInit clone remains replay-capable |
| Actual wallet transaction signing | NOT TESTED, as required: owner ton_proof establishes key control, not successful execution of a financial SendTransaction request. Do not label actual signing verified |

## Exact proposed action for separate approval

- Origin: `https://testnet.anlgram.com`.
- Network: **TON Testnet -3**, external V5 signature mode only; no relayer/gasless/internal signing.
- Operator: `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR`.
- Destination: `kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8`.
- Attached value: **0.100000000 Testnet TON**, unchanged.
- Body: exact empty cell, hash `96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7`.
- Minter code hash: `90b5069f199fcea56ef467dd25cf8420c5e9848ba0fcc0cc139424c5cac17aec`.
- Minter initial data hash: `0e8b1bae1b7c8f68c4d713b24b1a7c0542c56c44f199987ad3360a78991f684a`.
- StateInit hash/address hash: `393c40e96f450f1ac1940f48c1c8ef6a34577a3eac973e93244d4ca781de7e21`.
- Metadata: ANLGRAM Testnet Settlement / ANLTEST / 9 decimals; supply **0**; admin is the exact V5 operator.
- Exact unsigned internal payload/StateInit already in `testnet-v5-candidate.json`, first smoke-plan step.
- Future request: exactly one reviewed message, fresh seqno/state, validity at most 120 seconds; no additional transactions or retry after an uncertain result.

## Complete modeled value flow (nanoTON)

| Item | Amount |
|---|---:|
| Operator before | 1999999999 |
| Wallet transaction fees, including import/storage/gas/action portions | 4866966 |
| Remaining outbound forwarding fees | 2009972 |
| Total sender fees | 6876938 |
| Attached principal/funding | 100000000 |
| **Total modeled sender debit** | **106876938** |
| Operator after (simulation only) | 1893123061 |
| Minter execution fees, paid FROM attachment | 33134 |
| Minter retained balance (simulation only) | 99966866 |
| Total network fees across both simulated transactions | 6910072 |

Conservation and post-code/data/nonce checks pass. Destination compute/action exit
codes are zero; minter data remains the exact initial supply/admin/metadata. No
mint, Curve activation, donation payment or other contract deployment message is
included. Operator-wallet activation is an explicit additional state effect of
the same external request, not an automatic separate transaction.

## Conditions before any financial request

1. Owner must separately approve the exact transaction, implicit V5 wallet
   activation and a **policy** ceiling of 0.12 Testnet TON, recognizing there is no
   wallet-enforced maximum. Stop if a fresh complete emulation exceeds that ceiling.
2. Review the actual single-operation signer/client request before enabling it:
   exact network/from/message/StateInit/value, wallet ID and expiry. The public
   interface remains non-financial; no financial button or signature was enabled
   merely to finish this preflight. Actual signing remains deliberately untested.
3. Repeat only state/seqno/fees/proof validity checks immediately before signing.
   A state, configuration, wallet or payload change invalidates this snapshot.
4. Do not claim absolute cross-network protection. If the owner requires absolute
   non-replay for identical funded clones rather than canonical V5 isolation, this
   candidate does not satisfy that condition; stop that signing path for review.
5. After an approved future broadcast, verify the exact included external/internal
   message, both transaction outcomes and active minter code/data/supply/admin.
   A wallet response is not deployment confirmation. Never automatically proceed
   to transaction #2 or resend because a receipt is missing.

Local regression evidence: **6 passed, 0 failed** using a minimized real-provider
emulation fixture. An initial negative probe incorrectly attached Testnet StateInit
to the active canonical Mainnet destination; it was corrected to omit StateInit,
and only that affected probe was repeated, producing rejection 134. No contract
logic/test expectations were weakened. All simulation requests carry invalid zero
signatures and use emulation endpoints only. No real transactions occurred.
