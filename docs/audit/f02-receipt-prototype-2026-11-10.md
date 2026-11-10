# F-02 sandbox receipt prototype — partial, financially disabled

**Outcome: B, partial candidate only. Gate 414 remains sealed. This is not a migration engine, escrow, refund mechanism, or deployment candidate.** Never send assets to this prototype: it has no withdrawal or forwarding method and LP tokens sent to it would be inaccessible. It is not integrated with Curve, Guard, Locker V3, or release configuration.

## What is implemented

`anlgram-f02-receipt-prototype.fc` commits an operation ID, Router, two Router token wallets, provider and pinned STON.fi profile in StateInit. Different operation IDs produce different addresses. It derives the Pool and its own LP wallet using the existing pinned profile, accepts one positive notification only from that wallet with the configured provider, query ID and tag, and records its amount. The only states are no receipt and historical receipt. It never issues an outgoing message, has no finalization transition and never asserts a deposit, refund, current custody, or settlement is complete.

The accepted message is a TEP-74 notification sent by the **recipient LP wallet**, not by the Pool. The wallet's notification `sender` field is checked against the provider. This does not prove that the LP was newly minted for this operation: a transfer from that provider with a matching tag could also satisfy the check. The query ID is correlation data, not proof of foreign-message closure. Later real wallet credits can occur without a usable notification, and a second notification is rejected; the recorded amount is historical and need not equal current balance. Sandbox injection of a wallet sender is used only for replay testing.

The existing [Locker V3 source](../../minter-contract/contracts/anlgram-lp-locker-v3.fc) is unchanged. This prototype is **not** a Locker and cannot establish its terms or custody. A production design would need a verified one-operation depositor, isolated asset wallets, valid Curve authorization and actual Locker V3 delivery and acknowledgment. Simply inserting this prototype into that path would strand funds.

## Evidence and remaining limitation

The Sandbox test executes actual captured STON.fi Router, Pool and LP-wallet bytecode from the repository's local Testnet snapshot, with a treasury as provider. It checks the actual LP wallet balance, Pool-derived wallet address, notification source, forged notification rejection, duplicate notification rejection, unique StateInit and rejection of a finalization message. It is not a Curve integration test, a network test, or a complete audit. See `lpaccount-settlement-evidence.test.js` and `one-shot-dispatch.test.js` for separately reproduced real-TVM counterexamples: a delayed deposit recreates a deleted LPAccount at the same address; a reply can describe the preceding incarnation; and a minimum-LP rejection returns assets asynchronously. Those tests do not prove that every interleaving or refund is safe.

The [TON Jetton documentation](https://docs.ton.org/payments/jettons) describes recipient-wallet notification and wallet authentication. [STON.fi's Pool interface](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/pool) and [LPAccount interface](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount) expose the relevant asynchronous provisioning, query and refund paths; [STON.fi's liquidity examples](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/examples/lp-provide) describe account deletion and recreation. StateInit derivation and pinned captured-code hashes in `stonfi-v22-auth.fc` are development profile assumptions, not proof of an upgradeable Router's present network code or independently verified source provenance.

Even one depositor per operation cannot prove absence of in-flight messages or an exact partition of both original assets into consumed, returned, and unresolved amounts. Neither timeout, empty account, wallet balance, LP notification nor a Locker receipt closes that gap. A terminal proof would require an authenticated operation-bound foreign terminal interface or a sound contract-verifiable proof of finalized history and message closure. Until one is designed and reviewed, the correct state remains unknown/pending and 414 must not be removed. Recovery, partial refunds, action-phase exhaustion, late deposits after purported finalization and cross-project isolation are **not implemented by this prototype**; existing baseline tests provide only the particular counterexamples they execute.

## Reproduce

```powershell
cd tests/settlement-runtime
npm ci --ignore-scripts --no-audit --no-fund
cd ../..
$env:NODE_PATH = (Resolve-Path tests/settlement-runtime/node_modules).Path
node minter-contract/compile-f02-receipt-prototype.js --check
node --test tests/settlement-runtime/f02-receipt-prototype.test.js
```

The source-compiled code-cell hash is `14f13ca485eadc716de8691bd3fe47d7bf9ced6d6b421a664ba1da94645cd7ac`; the checked artifact records source hashes and compiler version. No pre-existing contract source or bytecode was changed. The full F-02 adversarial and regression matrix, proof design, financial implementation and independent security review remain outstanding. No deployment, signing, broadcast or live funds are authorized.
