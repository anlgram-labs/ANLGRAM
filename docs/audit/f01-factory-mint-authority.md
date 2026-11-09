# F-01 Factory mint authority

The earlier Factory initialized the standard minter with the creator as its administrator and then sent a standard `mint` from the Factory. That sender fails the minter's administrator check with exit 73. This revision deploys a pinned Factory-specific minter and sends the bootstrap opcode in the same message as its StateInit.

The creator remains administrator. StateInit binds the Factory's exact address, request ID and initial supply. Before bootstrap, only that Factory can invoke the one-use mint with the committed request ID. The minter constructs the standard wallet transfer from StateInit fields and removes the bootstrap capability in the same transaction that stages the mandatory mint send. The Factory cannot use ordinary mint or change-admin authority. The deterministic address commits to the creator and supply, including when metadata is identical.

The Factory fee now uses the documented fixed 0.105 TON deploy and mint budget. The configured 70% rate produces 0.0735 TON across attachments. Tests at 0.22 and 0.60 TON verify that exact fee and the Factory balance reserve. Curve price, graduation and allocations are outside this change.

| Code cell | SHA-256 |
| --- | --- |
| Factory | `3fb7e28ce037ab5b2294bb79186e92e6f678f018cd454d966a489c0f8541ef03` |
| Factory child minter | `ccfb69658addf71f99bfd550d0930ed4b78bb4dbfc66998beb243bd83623711f` |
| Standard Jetton wallet | `beb0683ebeb8927fe9fc8ec0a18bc7dd17899689825a121eab46c5a3a860d0ce` |

The legacy Factory code cell was `d2d6412e87cf0ba2e50cbd858db1e55c6f1f7ac954cb2ee89b0ee24a285e1b0a`. The source of the standard Jetton minter and wallet stays as before. The child minter is a separate compilation with the bootstrap handler.

```sh
npm ci --prefix tests/settlement-runtime
node minter-contract/compile-factory.js --check
node --test tests/settlement-runtime/factory-mint-authority.test.js
```

Sandbox tests verify actual wallet delivery, supply, exact owner, wrong requester and query, rejected code substitution, low funding, and one-use bootstrap. Factory UI execution remains gated. A rejected repeat can still consume an attachment and incur the Factory service fee. The branch does not introduce an asynchronous mint or Factory payment recovery protocol. A release still needs independent review of that downstream outcome and fee behavior.
