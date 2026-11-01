# V5 transaction #1 — signer compatibility and bounded approval procedure

**Financial signing remains BLOCKED. This is a procedure for separate owner
approval, not an enabled executor or a request for a financial signature.**
Checkpoint `a4aa50c` was verified (6/6 regressions) and pushed without force to
`codex/testnet-pages-hosting`, remote hash
`a4aa50c4aa234faa2aea517cb27e3de643e32743`.

## Current evidence

- Exact HTTPS origin: `https://testnet.anlgram.com`.
- Actual connection declared **Tonkeeper 26.10.4**, `SendTransaction: true`.
  The displayed feature did not provide a message limit. These are connection-
  declared capabilities, not an independent audit of the native application.
- Real fresh domain-bound proof passed and owner confirmed connection; displayed
  expiry **2026-11-01T02:23:03Z**. The approved raw account and fixed public key
  derive the pinned V5R1 Testnet StateInit; wallet ID **2147483645**, chain **-3**.
  Do not confuse proof validity with perpetual signing authorization.
- Account balance **1.999999999 Testnet TON**, wallet uninitialized / initial
  seqno **0**. Minter remains uninitialized with zero balance.
- Seven source/artifact hashes match the already source-compiled candidate;
  no contract audit or compilation rerun was needed. Full StateInit, empty body,
  metadata, supply zero, admin and destination match the approved candidate.
- Complete provider emulation, including operator wallet activation and minter
  execution: **0.106876940 TON** sender debit = 0.1 attachment + 0.006876940 sender
  fees. Minter gas 0.000033134 comes FROM attachment; expected retained balance
  0.099966866, no descendants, wallet nonce becomes 1. These are simulations only.
- Canonical Mainnet uses ID **2147483409**, seqno **26**; same-nonce Testnet-ID
  negative emulation rejects **134**. A deliberately funded identical-StateInit
  clone is not intrinsically excluded by the V5 VM; no absolute chain-binding
  guarantee is claimed.

## Demonstrated SDK retry limitation — not yet resolved

Installed/public implementation: `@tonconnect/ui` **2.3.1**, SDK **3.3.1**.
SDK ESM SHA256:
`2aebf1039a9fd15e42b4229828bda288160c6610ed4166ce1fae24d0e7c4f880`.
Published UI bundle SHA256:
`bbd171213cd16b0c681485232cce6d46d2dcd1fa42810244b9c6f8ef8027b5f0`.

Inspected installed source and the actual bundled code: HTTP `BridgeGateway.send`
defaults `attempts` to **Number.MAX_SAFE_INTEGER**, stopping when aborted. Public
`sendTransaction` forwards `onRequestSent` and `signal`, not `attempts`, although
the lower provider supports that option. Therefore passing an undocumented
`attempts: 1` to the public method does not establish a one-POST guarantee.

These transport retries resend the same encrypted RPC request/ID; this is NOT
evidence that duplicate on-chain transactions actually occurred. Wallet-side
deduplication and broadcast behavior were not exercised. A single application
call, disabled button or deadline alone does not prove single transport delivery.

Before execution, independently review/test a narrowly scoped adapter/fork that
exposes and propagates **one HTTP attempt**, or a proven one-POST transport fence
with an AbortSignal. Do not monkey-patch a private provider or silently change the
financial SDK in production. Injected transport is an alternative only after its
actual connection and retry behavior have been independently inspected. None of
these mitigations is claimed implemented/approved by this preflight.

## What can be enforced, and where

| Limit | Actual enforcement |
|---|---|
| Exactly one destination/value/body/StateInit | Can be fail-closed in a reviewed request builder and immutable approval fingerprint; must also be checked by the wallet |
| Attachment 100000000 nanoTON | Exact internal message value; never auto-increase or add an extra message |
| Network/from | Explicit `network: '-3'`, exact raw operator; V5 stored ID must match the request actually signed |
| Validity | Build fresh `validUntil <= now + 120`; V5 rejects an expired signed body. Actual native wallet must honor that request |
| Seqno | Wallet enforces its current nonce; successful first send increments 0 → 1, even if eligible action errors are ignored |
| One application attempt | Persistent consumed authorization/operation record BEFORE invocation, no reset on timeout/cancel/reload |
| One HTTP attempt | NOT established with current public SDK path; transport mitigation above remains a blocker |
| 0.120000000 TON total debit | **Policy only**, not a V5/TON Connect fee cap. No invented `maxFee` parameter or guarantee |

## Strictly limited future procedure (approval required)

1. Close the one-attempt SDK/transport blocker with reviewed code and tests first.
   Keep all existing financial gates closed meanwhile. No generic launchpad
   activation, restored-session signing or production feature toggle is permitted.
2. Obtain separate owner approval for **only transaction #1**, recognizing the
   non-enforced 0.12 ceiling, implicit operator-wallet activation, and replay model.
   Do not count this document or ton_proof as payment approval.
3. Immediately before presenting a native wallet request, require a fresh exact-
   domain proof and matching declared capability/account. Re-read both network
   states, source balance/seqno and empty destination. Rehash source/artifact/
   StateInit and re-emulate the exact current single message. Stop on any change
   or estimated total above 0.12, missing/failed trace or unknown extra fees.
4. Freeze and persist the approval fingerprint: network -3, exact operator,
   destination **kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8**, amount
   **100000000**, approved empty body and StateInit, seqno, state observation and
   absolute deadline. Consume the unique attempt persistently before invoking the
   wallet; disable continuation across another tab/reload. Do not store keys,
   seeds, session cookies or signed BOCs in source/reports.
5. Only after that approval and guard review, invoke ONE request with exact
   `network`, `from`, `validUntil` and exactly one message. No extra currencies,
   second deployment message, top-up, relayer/gasless/internal request or follow-up
   action. No automatic retry on any outcome.
6. Owner reviews the wallet's displayed Testnet/account/destination/0.1 amount and
   StateInit intent; cancel on any mismatch or unsupported wallet warning. Actual
   native wallet signing/ID construction cannot be conclusively established by
   ton_proof or a source-wallet simulation alone.
7. **TON Connect sendTransaction is not an offline sign-only API.** A wallet may
   sign AND broadcast before returning its BOC. Post-return decoding cannot be
   advertised as a pre-broadcast safety gate. The separate owner approval must
   cover that combined action; this task authorizes neither.
8. After an approved future send, retain only safe hashes/operation references;
   decode the actual V5 envelope and verify operation, network-specific wallet
   ID, seqno, expiry, action count/value/destination/body/StateInit. Independently
   observe the included source and destination transactions, actual fees/balance
   deltas, minter active code/data, supply zero and operator admin.
9. Timeout, bridge error, wallet result without inclusion or missing acknowledgement
   means **UNKNOWN/PENDING**. Never generate a new request, clear the attempt,
   re-sign, top up or proceed to #2. Reconcile original hashes, source nonce and
   destination state through read-only queries; any new attempt needs separate
   review/approval. An AbortSignal cannot revoke a wallet request already delivered.

## PASS/FAIL outcome

PASS: checkpoint remote preservation; actual V5 owner proof and declared wallet
capability; exact account/network/StateInit; source/artifact integrity; current
balance and destination; complete fee/conservation emulation and canonical-ID
replay rejection. No financial signature was requested or tested.

CONDITIONAL: 0.12 TON ceiling is a policy, wallet-declared capability is not actual
signing evidence, and fresh state/proof/expiry must be rechecked at execution time.

**FAIL / NO-GO for a financial request today:** one-attempt HTTP transport is not
verified/enforced by the current public SDK route. Native signing/broadcast
behavior remains untested under the owner's restrictions. Keep the prepared
transaction for review; do not claim it ready for financial execution yet.

References: [TON Connect requests and capabilities](https://docs.ton.org/applications/ton-connect/get-started),
[wallet-side validation responsibilities](https://docs.ton.org/applications/ton-connect/deep/native-web).
