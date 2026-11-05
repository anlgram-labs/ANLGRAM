# Standard V2 wallet initialization activation review

**Review only. Do not apply the activation patch as part of this task.** The delivered tree keeps both gates false. The [proposed patch](./standard-v2-wallet-init-activation.patch) is inert text against PR #33 commit `be87aca8372faef3f819b71b45c73af44b6a353e`. It proposes enabling only the existing local initialization signer and broadcaster and adding the pinned release check at the real broadcaster entry point. The minter approval command is absent from the scoped signer. No public route, smart contract, Cloudflare service, Mainnet configuration, or Curve #2 component is involved.

## Exact operation and acceptance checks

| Field | Pinned value |
|---|---|
| Testnet wallet | `0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn` |
| StateInit hash | `9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08` |
| Wallet configuration | Testnet -3, workchain 0, V5R1, subwallet 0, wallet ID 2147483645 |
| Message | One external initialization, seqno 0 to 1, zero outgoing internal transfers |
| Modeled fee policy ceiling | 70000000 nanotons |

The owner reported a successful authenticated unsigned preflight at masterchain height 95650284 and a modeled fee of 780678 nanotons. That quote is historical. The ceiling compares the modeled fee and provides no network-enforced maximum.

## Owner procedure for a separately authorized future build

1. Have a qualified independent reviewer verify the exact base, activation patch, and resulting isolated local build. Confirm both encrypted backups recover the pinned identity, the trusted device has working Pinentry, and nobody else is using the wallet. Confirm the signing and broadcast markers are absent. If either exists, stop and preserve it. Use a single owner device and profile throughout.
2. With protected Testnet provider credentials in the owner's terminal, generate a fresh quote immediately before the planned attempt. Save it in the private directory. The command is read-only and works in the delivered build.

   ```powershell
   node testnet-interface/standard-owner-signer-cli.mjs prepare-init "C:\Private\ANLGRAM\public-init-input.json" | Set-Content -Encoding utf8NoBOM "C:\Private\ANLGRAM\init-quote.json"
   if ($LASTEXITCODE -ne 0) { throw "Wallet initialization preflight failed" }
   ```

   Compare the pinned values above, the exact funded uninitialized account, fresh authenticated reference, expected post-state, modeled fee, quote fingerprint and expiry. Verify the operation has enough time for both confirmations and rechecks. A quote that expires before reservation can be replaced with a fresh read-only quote. A consumed marker cannot be replaced or reused.
3. Only with separate explicit authorization and the reviewed execution build, run the signing command from the [wallet-only procedure](./standard-v2-wallet-init-release.md). The owner types `AUTHORIZE TESTNET INIT <quote-fingerprint>` only after inspecting the exact operation. The signer verifies the backup identity, repeats live preflight, compares the fingerprint, and creates the permanent signing marker before local signing. Keep the signed JSON private.
4. Independently inspect the signed message hash. Only with separate broadcast confirmation, type `BROADCAST TESTNET WALLET INIT <message-hash>`. The broadcaster validates the exact signature and envelope, rechecks live proof and emulation, and syncs the exclusive per-wallet broadcast marker before attempting at most one Testnet POST. Redirects and retries are disabled. A signed artifact can be submitted outside the application, so keep it on the one authorized device.
5. Any timeout, crash, ambiguous response or post-reservation expiry stays UNKNOWN. Preserve both markers and the signed artifact. Reconcile the exact message against authenticated Testnet account inclusion and corroborated transaction history. Verify active code, StateInit-derived identity, seqno 1, zero outgoing messages, and actual fees. An HTTP acknowledgment or an active wallet alone does not prove the exact transaction. [Reconciliation command and evidence requirements](./standard-v2-wallet-broadcast.md)

## Activation build verification and launcher

In this activation build:
- `testnet-interface/projects/standard-wallet-broadcast.mjs` sets `walletBroadcastEnabled = true` and asserts the pinned wallet release destination.
- `testnet-interface/standard-owner-signer-cli.mjs` sets `signingEnabled = true` for owner-operated wallet initialization.
- Read-only quote output and diagnostics accurately report `financialSigningEnabled` and `broadcastingEnabled` based on the active runtime gates rather than hardcoded false literals.
- `testnet-interface/standard-owner-wallet-launcher.ps1` provides a safe PowerShell launcher that loads process-scoped Testnet provider credentials (with optional user-level Windows DPAPI storage) without echoing, printing, or logging secrets.
- Full testnet-interface test suite passes: 276 passed, 0 failed, 1 skipped (optional local GnuPG fixture).

## Rollback limits

Before signing, discard the unapplied activation changes to restore the disabled build. Source rollback cannot revoke a signed BOC, undo a Testnet transaction, or release a marker. After either reservation, leave the markers intact even if the command exited early. They are local to one profile and do not establish exactly-once network delivery. A new attempt after uncertainty requires a separate reviewed recovery decision based on authenticated evidence.

**GO for review and read-only preflight. NO-GO for execution in the delivered build.** Execution also requires the exact future activation build to be reviewed, successful fresh preflight, and the owner's separate confirmations. A Standard Jetton minter deployment requires its own authorization.
