# Isolated Standard V2 owner wallet

This local utility prepares a fresh TON Testnet V5R1 identity. It uses the pinned TON mnemonic and wallet libraries. The only production generation command requires an interactive terminal and the exact owner confirmation. The utility has no network, wallet connection, signing, or broadcast path. Do not run it in a shared, recorded, cloud, or AI-operated terminal.

## Install

Use Node.js 24 and a trusted GnuPG 2.x installation with working Pinentry. On Windows use [Gpg4win](https://www.gpg4win.org/). Verify that `gpg --version` resolves to your trusted installation. On Unix with terminal Pinentry, set `GPG_TTY="$(tty)"` from the local terminal if needed. From the reviewed checkout:

```text
npm ci --prefix minter-contract --ignore-scripts
npm ci --prefix testnet-interface --ignore-scripts
```

## Generate and verify recovery

Create a private, existing directory outside the checkout and outside synchronized storage. On Windows make its ACL owner-only. On Unix use a directory with mode 0700. Use a new filename. Substitute your private directory in these commands.

```text
node testnet-interface/standard-owner-wallet-cli.mjs generate "C:/Private/ANLGRAM/standard-v2-testnet.gpg"
node testnet-interface/standard-owner-wallet-cli.mjs verify-backup "C:/Private/ANLGRAM/standard-v2-testnet.gpg"
```

Type `GENERATE TESTNET` only in your local terminal. Choose a strong unique passphrase in GnuPG Pinentry and store it separately from the backup. The utility encrypts the TON mnemonic with GnuPG symmetric AES-256 and writes the ciphertext exclusively without overwriting. It immediately decrypts the backup through a private process pipe, derives the address and public key again, and prints public JSON only if both match. GnuPG symmetric passphrase caching is disabled. The utility does not write plaintext files. Plaintext briefly exists in local process memory, so use a trusted device. The CLI does not provide an export-to-terminal command or a wallet-app import.

Before funding, keep a second encrypted copy on offline media and run `verify-backup` against that copy. Compare the full `wallet.operator`, `wallet.publicKey`, and `wallet.walletId` with the original output. Verify that you can access the separate passphrase. Recovery is established only after your local check succeeds. A matching check proves backup derivation, and a future signer still needs a reviewed way to recover and use this account without exposing the backup plaintext. [GnuPG symmetric encryption and Pinentry](https://gnupg.org/documentation/manuals/gnupg/Operational-GPG-Commands.html)

## Public output and read-only verification

The JSON contains `wallet.address` in friendly Testnet form, canonical raw `wallet.operator`, a 64-hex `wallet.publicKey`, `wallet.walletId: 2147483645`, chain `-3`, workchain and subwallet number `0`, and the V5R1 code hash. `preflight` contains a Standard draft with the exact creator, public key, and an unset policy ceiling. The utility checks offline compatibility against the existing Standard V2 manifest builder. It does not claim any current balance, on-chain initialization, or SignData capability.

With `TONCENTER_TESTNET_API_KEY` and `TONAPI_TESTNET_API_KEY` supplied through your protected local environment:

```text
node testnet-interface/standard-preflight-cli.mjs --inspect-wallet <testnet-address>
node testnet-interface/standard-preflight-cli.mjs <public-preflight-input.json>
```

For the second command, save only the output's `preflight` object, set the draft name and symbol, and supply an explicit `ownerPolicyCeilingNano` as a decimal string. The first command can report a provider observation for an uninitialized address. After a separate, explicitly authorized Testnet funding and wallet initialization procedure, it can verify active V5R1 code, public key, wallet ID, balance, and seqno from the included account state. Compare the on-chain identity to the backup output. The second command uses unsigned emulation to check the proposed minter deployment. [Wallet V5 network-specific ID](https://docs.ton.org/contracts/standard/wallets/how-it-works)

**NO-GO for Standard V2 deployment.** Before funding, verify recovery and review a compatible owner-controlled signer for the generated account. Before deployment, separately authorize Testnet wallet funding and initialization, verify the actual account and signer, complete independent review of the isolated SignData and single-attempt transport, run fresh preflight, and obtain explicit owner approval for the exact deployment. All execution gates remain disabled.
