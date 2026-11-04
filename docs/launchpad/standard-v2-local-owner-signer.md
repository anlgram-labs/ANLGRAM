# Standard V2 local owner signer

This is a review build. Both signing commands stop before opening the backup. There is no broadcast code and no activation switch in the command line or environment. Changing the source gate requires a separate reviewed release and owner authorization. The previously reviewed encrypted wallet generator remains the source of the backup.

## Backup and recovery

Follow the [owner-wallet setup](./standard-v2-owner-wallet.md). Use native GnuPG Pinentry on the owner's trusted device. The signer shares the generator's bounded ciphertext input and private GnuPG pipe. Passphrases, recovery words and private keys are never emitted by the utility. The JavaScript process necessarily holds plaintext in memory briefly and clears the buffers and array entries it controls. Perform the separate backup verification on two encrypted copies and compare the full address, public key and wallet ID before funding. A recovery command is not an instruction to export plaintext.

## Offline deployment approval

An isolated supervisor exports the exact `localApprovalRequest` returned by its private preparation method. The local signer reconstructs the pinned manifest and quote fingerprint, recovers the same wallet from the encrypted backup, and would show the canonical authorization before asking for explicit confirmation. The signed bytes are domain-separated under `ANLGRAM_STANDARD_V2_LOCAL_ED25519_V1`. This scheme is distinct from TON Connect signData. The supervisor verifies it against its own stored preparation timestamp, nonce, quote, and V5R1 public key. The normal revalidation and atomic permanent reservation still apply. There is no transport activation. The approval is usable only before expiry and only for the exact deployment.

Future command, hard-disabled in this commit:

```text
node testnet-interface/standard-owner-signer-cli.mjs sign-approval <localApprovalRequest.json> <encrypted-wallet.gpg>
```

## Wallet initialization

Funding requires separate authorization after the owner verifies backup recovery. Use a funded, uninitialized Testnet V5R1 account derived from the generated key for chain -3, workchain 0, subwallet 0 and wallet ID 2147483645. Never use the historical Curve account. The initialization envelope includes the exact wallet StateInit and an expiring seqno-zero V5R1 external request. It has **zero internal messages** and pays only initialization fees. It cannot deploy the Standard minter.

Available read-only command. The JSON input is an object containing the generator's public `wallet` object and an explicit `ownerPolicyCeilingNano` decimal string. Supply the Testnet provider keys through the protected environment as for the Standard preflight.

```text
node testnet-interface/standard-owner-signer-cli.mjs prepare-init <public-init-input.json>
```

The command checks the included funded account and a separate provider observation, then runs unsigned emulation for the same reference. It requires one successful wallet transaction, no outgoing messages, exact code and expected seqno-one data, and a balance debit matching the modeled fee. The modeled fee must be below the available balance and within the policy ceiling. The ceiling is not an enforceable network fee cap. Live provider compatibility has not been verified.

If preflight stops, stderr returns a JSON diagnostic with a stable `code` and, where available, a provider name, operation, HTTP status and retry delay. It omits API keys, input contents and provider response text. Run the command in the same terminal that holds both Testnet environment variables. `PROVIDER_KEY_MISSING` means the named binding is absent in the Node process. `PROVIDER_AUTH_REJECTED` means the provider rejected the request. Wait for `retryAfterMs` if rate limited. `ACCOUNT_*` codes identify failures in current state, provider agreement or account evidence. `EMULATION_*` codes identify response, reference, freshness, trace or fee-accounting failures. `FEE_POLICY_EXCEEDED` keeps the original ceiling in force. A failed run produces no quote on stdout.

The emulator request pins `mc_block_seqno` to the independently corroborated account proof's masterchain height. If the emulator reports a newer height, the preflight resolves that exact height through TON Center and verifies the TonAPI account proof at its full block reference. The wallet Account hash, last transaction hash and logical time must all match the original proof. Older, conflicting, stale, or unprovable references produce no quote. The trace still has to match the unsigned message, initial balance, destination, resulting wallet state and fee ceiling. Successful output records the evidence reference separately from the operation fingerprint so a newer block with identical reviewed inputs does not invalidate it. Provider-relative inclusion is distinct from validator finality. [TON Center emulation schema](https://docs.ton.org/api/emulate/traces/emulate-trace) · [TonAPI account proof schema](https://raw.githubusercontent.com/tonkeeper/opentonapi/master/api/openapi.yml)

Save the read-only command's JSON output as the initialization quote for a future reviewed build. The signing command below is hard-disabled today. The reviewed design repeats emulation after the owner's confirmation and reserves a local, exclusive pending marker under the owner's home directory before signing. A crash or uncertain result leaves the marker in place. It never rearms or submits. The marker is local to one owner profile and does not coordinate across devices. Future submission requires its own authorized one-attempt procedure. Treat any signed initialization BOC as an executable authorization and keep it private.

```text
node testnet-interface/standard-owner-signer-cli.mjs sign-init <init-quote.json> <encrypted-wallet.gpg>
node testnet-interface/standard-preflight-cli.mjs --inspect-wallet <testnet-address>
```

After any future submission, preserve UNKNOWN until authenticated evidence links the exact external message to the included transaction. Use the wallet inspection command to verify active V5R1 code, public key, wallet ID and initial seqno 1. An active account alone is not a transaction receipt. Never retry after an ambiguous result or reuse a pending marker.

## Gates

Wallet generation is owner-operated and offline after source review. Funding, initialization and the Standard V2 minter deployment stay closed. The remaining requirements are local recovery confirmation, independent review of the signer and submission process, live read-only validation of the actual Testnet account, and separate owner authorization for each financial operation. Minting stays closed. No Mainnet, Cloudflare or Curve changes are part of this work.
