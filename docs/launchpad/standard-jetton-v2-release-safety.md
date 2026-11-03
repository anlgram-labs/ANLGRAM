# Standard Jetton V2 release safety

This supersedes the Standard V1 candidate in the first financial Testnet release inventory. Existing deployments, the public preparation flow, and Curve #2 are preserved. Generate the V2 manifest with `prepareStandardTestnetRelease(draft, publicKey)`. Use a separately controlled Testnet V5R1 account. The function derives the new StateInit and destination from the pinned V2 artifacts. Schema 1 quotes and V1 receipt bytecode are rejected by the V2 verifier.

## Mint accounting

The owner requests a single initial mint with a monotonic query ID. The minter reserves that request and sends a funded private credit to the deterministic wallet. Dispatch leaves supply at zero. The wallet authenticates the minter, records credit once, and disables outgoing transfer and burn until release. Its receipt is part of the wallet credit transaction's action phase. A failure there rolls back the credit and requests a bounce. Only an exact receipt from that wallet books supply. The minter sends release after booking, and duplicate receipts cannot book supply again. A funded query re-emits the existing receipt if delivery of the receipt or release is interrupted. It cannot create credit. An authentic matching bounce records failed delivery without changing supply. Silence leaves the operation pending.

The contract requires 0.150 TON on the mint request and forwards 0.100 TON to the wallet. Receipt re-query requires 0.040 TON. These are attached values, not network fee bounds. The V2 contract permits one successful initial mint. Additional minting after success is disabled and the getter reports that change. The custom mint protocol leaves the TEP-74 transfer, burn and getter interfaces available for the resulting Jetton. A bounced mint may be replaced only with a higher query ID at contract level. The release candidate has no automatic or public replacement path.

Run `node minter-contract/compile-standard-jetton-v2.js --check` to reproduce both bytecodes. The artifact records source hashes for the generated contracts and all includes, generator hash, serialized BOC hash and code-cell hash.

| V2 artifact | Generated source SHA-256 | Code-cell hash |
|---|---|---|
| Minter | 10ebeab28953aed9a1f0ffbfa37f88af34f58b304e15aad06d03bfd778e523b8 | 397faa44a7892b3f2eb0da4cf6f2ef04876d121f87f516c91fe3402808831d8c |
| Wallet | e6d9d99c1a6a776b3b10b35140b895d9ca4ee2e75fe280b113a0a24014182422 | 072d50c878949253fa6daee0149d12ed9adb91079cd5134b4d63a10ae6acb470 |

## Release gates

| Feature | Verdict | Independent review and live prerequisites |
|---|---|---|
| Isolated Standard V2 minter deployment | NO-GO for execution | Select and authenticate a separate V5R1 wallet. Review the exact generated StateInit, confirm its destination is uninitialized, and get a fresh current-state emulation and quote for one 0.050 Testnet TON attachment. Wire and review the private supervisor and one-attempt transport against the dedicated operator-keyed storage. Obtain explicit owner authorization. |
| Initial mint | NO-GO for execution | Reconcile an actual deployment first. Review the custom mint/receipt/release protocol, bounce truncation, storage/gas reserves, delayed receipt and release behavior and TEP-74 compatibility. Obtain a separate approval. |
| Standard project registration | Code available for private review | The existing registry accepts a distinct STANDARD_V2 intent. It checks exact code, included wallet/minter histories and the signed deployment edge before immutable storage. Registration shows reference-relative deployment evidence through the existing schema, with no Launchpad or LP records. Provider inclusion leaves validator finality unverified. Validate with the first real deployment later. |
| Public signing, Curve #2 and all other financial paths | Closed | Outside this change. |

The lock is a storage-backed component with a server-only supervisor interface. It validates the exact approval, V5 wallet identity, network, current seqno, proof expiry, quote, uninitialized destination, emulation result, modeled debit, and concurrency evidence before atomic reservation. It has no reset or automatic rearm. Unknown outcomes remain reserved. Reconciliation can record an authenticated included deployment while retaining the permanent reservation. This release does not supply a live supervisor implementation or submit requests. Bind the component only in a reviewed isolated supervisor with authoritative chain reads and no public claim route. A quote policy ceiling is an approval rule, and the total fee ceiling remains unset until an enforceable bound is demonstrated.
