# F-04 LP Locker withdrawal evidence

There are three distinct withdrawal outcomes. The captured STON.fi LP wallet can credit the recipient, reject the initial Locker request, or restore the sending LP wallet after the downstream recipient wallet fails. Only the original Locker-to-wallet request bounce is consumed by Locker V2. The downstream bounce ends at the sending LP wallet. This branch adds exact read-only evidence for that third outcome. [STON.fi LP Wallet v2](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpwallet) · [TON Jetton interface](https://docs.ton.org/contracts/standard/tokens/jettons/api)

The verifier binds the immutable Locker, Pool, LP wallet, claimant, request ID and amount to the persistent Locker request. It checks the original source debit, recipient failure, exact routed bounce and equal credit back to the pinned source wallet. The server-side acquisition path requires both source transactions in the same reference-relative wallet history and checks the Locker and recipient histories at that same reference. Missing or inconsistent evidence leaves the outcome unknown.

A returned balance at the source wallet does not clear the Locker's pending withdrawal. The captured wallet has no authenticated internal balance proof for this purpose. An excess from the expected recipient wallet can be induced by an unrelated transfer with the same query ID. Even independently included downstream-return evidence does not authorize a retry, unlock, migration or Gate 414. The current Locker bytecode and allocation rules remain in use. On-chain terminal withdrawal reconciliation remains open for independent review with F-02.

```sh
npm ci --prefix tests/settlement-runtime
npm ci --prefix testnet-interface
node --test --test-concurrency=1 tests/settlement-runtime/stonfi-locker-v2-real.test.js testnet-interface/test/generation2-status.test.mjs
```

The Sandbox freezes the actual recipient wallet after it has acquired a nonzero LP balance. The pinned foreign wallet restores the exact rejected withdrawal amount to the Locker's source wallet, while the Locker pending balance stays recorded. Tests reject substituted transactions and account snapshots, a delivery mislabeled as a return, and evidence without checkpoints. The positive Sandbox example verifies raw fields and routing. Live provider inclusion, validator finality and on-chain reconciliation remain unproven.
