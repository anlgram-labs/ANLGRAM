# Isolated Testnet V5R1 wallet initialization release candidate

**Review only. Signing and broadcast remain disabled.** This branch limits the local initialization CLIs to one destination. The Standard Jetton minter approval command is excluded. The private supervisor, public site and contract artifacts are outside the release.

| Reviewed parameter | Value |
|---|---|
| Wallet | `0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn` |
| Network | TON Testnet -3 |
| Wallet contract | V5R1, workchain 0, subwallet 0, wallet ID 2147483645 |
| StateInit cell hash | `9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08` |
| Operation | One seqno-zero external wallet initialization, expected seqno 1, zero outgoing internal messages |
| Owner policy ceiling | 70000000 nanotons |
| Historical evidence reported by owner | Modeled fee 780676 nanotons at masterchain reference 95647872 on base commit 7983848268b18d6351baae184372c762f7d9da94 |

The historical quote has no authorization value. The policy ceiling limits the modeled fee and does not enforce a network fee maximum.

## Owner review and authorization procedure

1. Review the exact candidate commit and independently confirm the public identity from both encrypted backups. Keep the backup and passphrase local. Use one trusted device and one owner profile. Confirm there is no pending initialization or competing use of this wallet. Preserve any existing marker.
2. In the terminal that holds both Testnet provider keys, generate a fresh unsigned quote. From PowerShell 7, save only the public JSON output to the private directory.

   ```powershell
   node testnet-interface/standard-owner-signer-cli.mjs prepare-init "C:\Private\ANLGRAM\public-init-input.json" | Set-Content -Encoding utf8NoBOM "C:\Private\ANLGRAM\init-quote.json"
   if ($LASTEXITCODE -ne 0) { throw "Read-only initialization preflight failed" }
   ```

   Confirm the exact wallet, chain, StateInit, seqnos, zero outgoing messages, modeled fee, ceiling, fingerprint, and expiry. A separate reviewed activation is required before the next two steps can be performed. Check the complete timing on the owner's device. If the quote expires before any signing reservation, prepare a new quote. Never rearm a consumed marker.
3. In a separately authorized build, the local signer will require `AUTHORIZE TESTNET INIT <quote-fingerprint>`, then recheck live proof and unsigned emulation against the approved quote before creating the exclusive signing marker. Only use the matching encrypted backup. Keep any signed artifact private.
4. In a separately authorized build, the broadcaster will validate the exact signed envelope and require `BROADCAST TESTNET WALLET INIT <message-hash>`. It reruns live preflight after confirmation and compares the quote again. It creates and syncs the exclusive per-wallet broadcast marker before the single Testnet POST. Redirect following and retries are disabled. If the operation expires after reservation or the result is ambiguous, the reservation stays consumed.
5. Reconcile using authenticated Testnet account inclusion and raw transaction history. Keep UNKNOWN if evidence is absent, stale, or contradictory. An HTTP response alone does not establish inclusion or finality. The read-only reconciliation command requires the matching signed file and local marker from a future attempt.

   ```text
   node testnet-interface/standard-wallet-broadcast-cli.mjs reconcile <init-quote.json> <signed-init.json>
   ```

See the [broadcast procedure](./standard-v2-wallet-broadcast.md) for the future command arguments and marker behavior. The local markers protect one owner profile. They do not coordinate other devices or guarantee exactly-once network delivery.

**GO for independent review and fresh read-only preflight. NO-GO for execution.** Require separate authorization for the exact fresh quote and message, review of an execution-enabled build scoped only to this initialization, and verified readiness of the local signing, storage and submission procedure. A Standard Jetton minter deployment remains a separate operation.
