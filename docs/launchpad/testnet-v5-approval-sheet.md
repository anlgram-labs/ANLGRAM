# V5 Testnet candidate — blocked, unsigned

**Domain/API checkpoint update:** `https://testnet.anlgram.com` is active with
valid TLS and an exact-domain manifest. Real V5 `ton_proof` and disconnect passed
on this domain; a fresh proof is still required before any later execution.
The balance API 503 was corrected (unsupported Workers `redirect:'error'` replaced
by manual mode with redirect rejection). Latest Testnet operator balance:
**1.999999999 TON**, wallet uninitialized; minter uninitialized. Fresh source-fee
estimate: **0.006876937 TON**, plus unchanged attachment **0.100000000 TON** =
**0.106876937 TON estimated**. Destination fees/execution remain unverified; no
hard maximum or transaction approval is inferred. This supersedes the historical
unfunded quote/readiness observations below. See
[domain evidence](testnet-domain-verification.json),
[owner evidence](testnet-domain-owner-proof.json), and
[fresh fee observation](testnet-v5-observations.json). No signing/broadcast authorized.

Preparation authorized; signing, spending, deployment and transaction #2 are not.
Active registry: [active-testnet-candidate.json](active-testnet-candidate.json).
All previous V4 transaction details/approvals are obsolete for execution; the
historical files are preserved. PR #7 is unchanged at `10e8a83`.

## Identities

| Role | Testnet address |
|---|---|
| V5R1 operator | `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR` |
| Minter | `kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8` |
| Curve | `kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW` |
| LP guard | `kQDdYVrXUm-AeoseOuPfz3V2J6VkrWwD3zexD3lClmlRH7cM` |
| Migrator | `kQBTSc4ytYXLOFkWSh6K09Md7DEkiKMWWlv_-3kuOBVZ29Y2` |
| V2 binding | `kQCuWBp-7FXvdD-5TghAmFwGfFFTMB4Dr3iEJcNcAq1NWN_g` |
| V2 locker | `kQB6FRtXktqz4zHhou0wd4qVFfoli2izcy-eoWOBwZLtvT5W` |
| Curve Jetton wallet | `kQApeBbbNrNnWCvPjGgAgmS2bZh3d7e9bgrPlEUjXRodUlLh` |
| Buyer Jetton wallet | `kQB7Qoi45tQ5cXveStE0Y8nexF5iNfjjQNdmYx6st8C8KLlW` |

Exact StateInit BOCs, hashes, regenerated ordered messages, dependent Pool/LP
identities and immutable settings are in [testnet-v5-candidate.json](testnet-v5-candidate.json).
The Pool/LP derivations remain development candidates, not custody or financial
authorization. Migration, LP custody and withdrawals stay blocked.

All seven contract code hashes are unchanged and match fresh source compilation.
Minter metadata remains `ANLGRAM Testnet Settlement`, `ANLTEST`, decimals `9`,
supply initially zero; admin is now the exact V5 operator. No source/interface/
economics changed. Operator-dependent storage hashes and deterministic addresses
**have changed**; do not deploy with the old StateInit. LP settings remain 100%
permanent by default; beneficiary/unlocked controller are this new operator.

Donation/fee/reward configuration remains the original raw recipient
`0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d`;
mandatory donation is 0.02 TON on the fixed 0.20 TON base. It is not redirected
to the new operator. This document authorizes no payment.

## Replay and actual wallet compatibility

Official implementation pinned at
[wallet-contract-v5 4fab977](https://github.com/ton-blockchain/wallet-contract-v5/tree/4fab977f4fae3a37c1aac216ed2b7e611a9bc2af).
Fetched official artifact bytes match SDK 16.3.0 V5R1 code cell
`20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f`.
For workchain 0/version 0/subwallet 0, context `0x80000000` XOR global ID yields
Testnet `2147483645`, Mainnet `2147483409`. They derive different addresses.
The same-key canonical Mainnet wallet is
`0:cec5d92a0661507ab9d8ff521edd10d2596d4cf0b7197658bb84bcecc05902ff`;
live observation found official V5 code, Mainnet ID and seqno 26.
The proposed Testnet raw address on Mainnet was uninitialized.

These facts do not prove owner control or application compatibility. The owner
must select the exact V5R1 Testnet account in their wallet and pass a fresh
single-use, domain-bound proof on the isolated origin. No seeds/keys are needed.
If the app cannot select or prove this exact account, stop. No compatibility or
ownership success is claimed. V5 is not an intrinsic global-ID VM assertion;
deliberate same-StateInit deployment elsewhere remains a limitation. Repeat both
chain checks immediately before any future financial request; forbid relayers,
gasless/internal signing and automatic retries. Future request must have exact
network `-3`, exact `from`, one reviewed message, fresh seqno and 120-second expiry.

## Latest read-only evidence and expenditure

[Provider observations](testnet-v5-observations.json), 2026-10-31 22:39 UTC:
all nine Testnet addresses were uninitialized, zero balance. No deployment occurred.
The proposed V5 operator needs **Testnet** funding only after control is confirmed.
Do not transfer real Mainnet TON or export keys to fund a test account.

The unfunded V5 source estimate returned **0.003692402 TON** source fees and
0.103692402 including attachment. It returned zero outbound forwarding fee and
no destination fees; therefore it is **incomplete and unsuitable for approval**,
not a reliable complete transaction estimate or maximum debit. Historical V4 fees
cannot be reused. Requote and simulate the exact V5 transaction after confirmed
ownership/funding. Account for storage, forwarding, action/compute failures and
current wallet state. An estimated fee is not a wallet-enforced debit limit.

Proposed **review ceiling** for transaction #1: 0.120000000 Testnet TON total,
including the unchanged 0.100000000 attachment. This ceiling is **not approved**,
not a guaranteed maximum and not technically enforced by TON Connect. If exact
simulation cannot support a conservative bound, stop and explain the remaining
uncertainty before requesting explicit owner approval. No balance sweep, extra
message, automatic funding, attachment increase or fee top-up is permitted.

## Current acceptance

- PASS: official V5 artifact identity, canonical wallet ID/address separation,
  seven source/artifact checks, all deterministic StateInit identities, exact
  metadata/new admin and preserved recipient/economics.
- PASS locally: proof protocol rejects wrong network, key, wallet, domain,
  expiry, replay and forged signatures; actual local workerd Durable Object
  routing runs. Synthetic tests are not an operator proof or live transaction.
- BLOCKED: isolated HTTPS publication (Cloudflare unauthenticated), real wallet
  application compatibility, cryptographic owner proof, Testnet funding, fresh
  complete fees/expenditure approval and final exact transaction review.
- Interface target: `https://testnet.anlgram.com/`; manifest target:
  `https://testnet.anlgram.com/tonconnect-manifest.json`. **Neither is claimed live.**
  Follow [manual setup](../../testnet-interface/README.md); preserve apex production.
- Dependency audit: 2 low entries (`@tonconnect/ui`, `deepmerge`), no reported fix;
  see interface README. No high/critical entry in that focused production audit.
- No financial request may be proposed yet. No signing/broadcast/deployment,
  production release, Mainnet operation or next transaction is authorized here.
