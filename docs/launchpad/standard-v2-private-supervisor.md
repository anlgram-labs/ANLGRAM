# Standard V2 private Testnet supervisor

## Artifact identity

The reproducibility check regenerated both reviewed code cells from the Standard V2 generated entrypoints and their include manifests. Review commit ea71559 contains the adversarial test suite and does not change or independently list the compiler hashes. The generated source hashes below reconcile the release report with the actual compiler inputs. The legacy Jetton source files serve as generator inputs and have different hashes.

| Role | Generated compiler entrypoint SHA-256 | Code cell hash |
|---|---|---|
| Minter | 10ebeab28953aed9a1f0ffbfa37f88af34f58b304e15aad06d03bfd778e523b8 | 397faa44a7892b3f2eb0da4cf6f2ef04876d121f87f516c91fe3402808831d8c |
| Wallet | e6d9d99c1a6a776b3b10b35140b895d9ca4ee2e75fe280b113a0a24014182422 | 072d50c878949253fa6daee0149d12ed9adb91079cd5134b4d63a10ae6acb470 |

## Read-only command

Run `node testnet-interface/standard-preflight-cli.mjs <private-input.json>` with `TONCENTER_TESTNET_API_KEY` and `TONAPI_TESTNET_API_KEY` supplied through the local protected environment. The input contains a canonical Standard Testnet `draft`, a hex V5R1 `publicKey`, and a string `ownerPolicyCeilingNano`. The draft creator must be the address derived from that key for chain -3 and subwallet zero. Use a separate funded, initialized V5R1 wallet with active signing, seqno above zero, and no extensions. The existing Curve operator is rejected. No private keys belong in the input. The CLI performs only account reads and unsigned emulation and does not reserve an operation.

The wallet Account state is proven relative to a corroborated masterchain reference. Destination status uses an authenticated provider observation and matching emulation, so it is not a validator-finalized non-inclusion proof. The emulation must use the same reference sequence as the wallet proof, exact wallet state, and a successful one-message deployment of the pinned minter. The request sent to the emulator has a deliberately invalid zero signature. The attachment is exactly 0.050 Testnet TON. A policy ceiling bounds the modeled debit only.

## Lifecycle and activation boundaries

Storage is namespaced by Testnet, V5R1 and canonical wallet address. Prepared candidates are keyed by fingerprint. A wallet-wide permanent reservation atomically captures the reviewed candidate and consumes the nonce. Old unscoped reservations for the same operator are still honored. A lost prepared entry cannot erase a reservation. If the immutable snapshot or matching receipt is absent, reconciliation reports UNKNOWN.

Approval uses official TON Connect `signData` with the human-readable `text` payload, only when the authenticated wallet session advertises `SignData` with `text`. The server verifies the protocol's Ed25519 digest and exact signed text against the public key already bound to the V5R1 account. The signed text repeats chain and wallet identity because RPC `network` and `from` are envelope fields. It binds the domain, destination, code and StateInit hashes, fingerprint, amount, modeled debit, ceiling, seqno, expiry and single-use nonce. The response timestamp must fall between preparation and verification, before expiry. Legacy raw Ed25519 approvals are not accepted. A future isolated session service must supply the connected wallet capabilities and independently establish exclusive use. See the [official signData specification](https://github.com/ton-blockchain/ton-connect/blob/main/spec/rpc.md#signdata).

Reservation independently re-reads wallet and destination and re-emulates. A new corroborated block is permitted within the original quote window only when wallet account hash and logical time, seqno, destination state, emulated fee and manifest are unchanged. Same-height reference conflicts and older references fail closed. The original approved fingerprint and expiry are preserved.

The isolated real-wallet adapter is hard-disabled in source. Its future private session service must provide an authenticated account, an approved HTTPS bridge URL, TON Connect session encryption and a durable monotonically increasing request ID for that session. After permanent consumption it rechecks account, network, wallet ID and seqno, then makes at most one encrypted POST without redirect following or retries. The RPC does not carry a wallet-enforced expected seqno, so exclusive account use and wallet-side behavior must be verified before activation. An HTTP response leaves the operation UNKNOWN until authenticated on-chain reconciliation. The registry independently reacquires evidence. Inclusion does not establish validator finality.

### Select and inspect the owner wallet without signing

1. In the wallet app, use a separate account, select Testnet, and select W5/V5R1 in workchain 0. Prefer a fresh account key dedicated to Testnet. Keep recovery material inside the wallet's own backup process. Copy the public Testnet address and note the app/version.
2. Run `node testnet-interface/standard-preflight-cli.mjs --inspect-wallet <testnet-address>` with the two provider keys in the protected environment. An active account must match the V5R1 code and the address derived from Testnet -3, basechain 0, subwallet number 0 and the 64-hex public key read from the included account data. The encoded wallet ID is 2147483645 (0x7FFFFFFD). The CLI also reports balance and seqno and rejects the original Curve operator. The address's friendly Testnet flag and a W5 label alone do not establish those properties.
3. An uninitialized account has no on-chain public key to retrieve by this command. Stop at that state for this read-only phase. Wallet funding or initialization is a separate action. When an active candidate exists, run the JSON preflight above to determine whether its balance covers the modeled deployment debit.
4. A later isolated connection can inspect the wallet's advertised `SignData` text support without making a signing request. If support is absent, choose a compatible wallet build. No raw signature fallback or credential export is required.

NO-GO for live execution. Before a future activation, independently review the exact PR head, configure the isolated private supervisor and transactional storage, verify that the dedicated V5R1 wallet advertises and implements TON Connect SignData text, validate live provider and trace compatibility, and review and test the real wallet bridge. Then present the fresh deployment for separate manual authorization. Minting remains disabled.
