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

Approval is an Ed25519 signature from the dedicated V5 public key over the exact domain-separated bytes produced by `standardApprovalBytes`. Those bytes include the Testnet domain and chain, wallet identity, destination, reviewed code and StateInit hashes, fingerprint, amount, seqno, expiry and single-use nonce. No browser ownership or approval boolean is accepted. A future owner-side signer must support those exact bytes without exporting the wallet key. Exclusive account use must still be checked separately by a trusted private service.

Reservation independently re-reads wallet and destination and re-emulates. A new corroborated block is permitted within the original quote window only when wallet account hash and logical time, seqno, destination state, emulated fee and manifest are unchanged. Same-height reference conflicts and older references fail closed. The original approved fingerprint and expiry are preserved.

The isolated real-wallet adapter is hard-disabled in source. Its future bridge contract requires an authenticated account check and one call to a private single-attempt owner-confirmation method after durable consumption. No live bridge is installed, and the bridge's outbound POST behavior must be independently verified before activation. The fixture persists UNKNOWN before calling the mock and records SUBMITTED or FAILED only for explicit mock outcomes. A lost response or a process interruption leaves the reservation consumed. Reconciliation verifies the reserved deployment against both histories and initial minter code and data. The private registry independently reacquires the evidence. Inclusion does not establish validator finality.

NO-GO for live execution. Before a future activation, independently review the exact PR head, configure the isolated private supervisor and transactional storage, verify that the dedicated V5R1 wallet supports the exact off-chain approval, validate live provider and trace compatibility, and review and test the real wallet bridge. Then present the fresh deployment for separate manual authorization. Minting remains disabled.
