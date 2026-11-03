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

Use dedicated transactional storage keyed by the isolated operator across all candidates. The supervisor persists preparation and delegates permanent atomic reservation to the existing Standard lock. It re-reads chain state and emulates again before reservation. A changed reference, seqno, fee or expiry invalidates the reviewed fingerprint and requires fresh preparation before any reservation. A superseded preparation cannot be reserved. The exact reference requirement may reject a review that crosses a masterchain block boundary.

The transport fixture persists UNKNOWN before invoking the mock wallet and records SUBMITTED or FAILED only for explicit mock outcomes. Concurrent attempts, reload, rejection and lost responses cannot reopen the reservation. The included receipt is independently checked against both histories and exact initial minter code and data, then forwarded to the private registry, which reacquires the evidence. Missing, contradictory or delayed results remain UNKNOWN. Included state does not claim validator finality.

NO-GO for live execution. No public endpoint or real transport is installed. Before a future activation, independently review the exact PR head, wire the private operator-keyed storage and the server-only ownership proof and operation-specific owner approval callbacks, prove control of the separate V5R1 wallet on the approved origin, validate live provider/trace compatibility and quote timing, and review the real single-attempt transport in isolation. Only then present a fresh quote and exact deployment for separate manual owner authorization. Minting stays disabled.
