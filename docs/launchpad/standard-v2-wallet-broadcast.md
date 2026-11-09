# Standard V2 wallet initialization broadcast review

This is an execution-disabled review build. The broadcast CLI handles only the separate Testnet V5R1 wallet initialization with **zero outgoing messages**. It cannot submit a Standard V2 minter deployment. Both signing and real broadcast are hard-disabled in source.

## Owner workflow

1. On the owner's trusted device, verify recovery from both encrypted backups and compare their public identity. A separate, explicitly authorized Testnet funding operation must leave the generated V5R1 wallet funded and uninitialized. The expected wallet ID is 2147483645, network is -3, and workchain and subwallet number are zero.
2. With both Testnet provider credentials in the protected local environment, inspect the wallet and prepare the unsigned initialization quote. The public input consists of the generator's `wallet` object and an explicit decimal-string `ownerPolicyCeilingNano`. Save the output of `prepare-init` as `init-quote.json`.

   ```text
   node testnet-interface/standard-preflight-cli.mjs --inspect-wallet <testnet-address>
   node testnet-interface/standard-owner-signer-cli.mjs prepare-init <public-init-input.json>
   ```

3. A separately reviewed and authorized future build would permit the exact signing command below. It would recheck the quote, require a separate owner confirmation and create a signer marker before signing. Keep the resulting signed JSON private on the same owner device. The BOC is an executable authorization. Save it as `signed-init.json`. No such output is produced by this review build.

   ```text
   node testnet-interface/standard-owner-signer-cli.mjs sign-init <init-quote.json> <encrypted-wallet.gpg>
   ```

4. A separately reviewed and authorized future build would permit this broadcast command. The CLI reconstructs the exact initialization, checks the V5R1 signature and fingerprint, compares the existing signer marker, and displays the destination, StateInit, amount of outgoing transfers (zero), modeled fee, policy ceiling, expiry and message hash. The owner would type `BROADCAST TESTNET WALLET INIT` only after reviewing those exact values. The fee ceiling is a policy comparison against emulation and is not a network-enforced maximum.

   ```text
   node testnet-interface/standard-wallet-broadcast-cli.mjs broadcast <init-quote.json> <signed-init.json>
   ```

5. For any future ambiguous result, preserve both markers and the signed artifact. The available read-only command checks authenticated account inclusion and corroborated raw transaction history. It requires the exact incoming body, StateInit, successful uninitialized-to-active transition, zero outbound messages, and state hashes linking the approved pre-state to the included seqno-one wallet. It reports actual fees if verified. If the matching receipt is no longer at the proven account tip, evidence is unavailable, or any field conflicts, the result is UNKNOWN. Inclusion is reported separately from validator finality.

   ```text
   node testnet-interface/standard-wallet-broadcast-cli.mjs reconcile <init-quote.json> <signed-init.json>
   ```

The broadcast path rechecks fresh Testnet account state and unsigned emulation after confirmation. It then creates an exclusive per-wallet file under `~/.anlgram-standard-v2` containing the quote fingerprint and message hash. The file is synced before attempting one POST to the fixed TON Center Testnet RPC. There are no application retries or redirect follows. A response, rejection, timeout, expiry after reservation, or crash leaves the marker consumed and the outcome UNKNOWN until read-only reconciliation. An empty marker still blocks the next attempt. No path clears a marker. Use one trusted device and owner profile. The local marker is not a cross-device lock and does not guarantee exactly-once network delivery. [TON Center API](https://docs.ton.org/api/v2)

**NO-GO for live execution.** Before a future attempt, independently review the exact source, verify owner recovery, separately authorize funding and initialization, and validate live Testnet provider compatibility and the complete quote-to-broadcast timing. The initialization is a separate approval boundary from Standard V2 deployment.
