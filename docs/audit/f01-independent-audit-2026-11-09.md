# F-01 Factory independent audit (PR #54) and fee-on-rejected-repeat correction

Evidence scope: source-compiled FunC in the TON Sandbox only. No deployment, signing, transfer or live network call. Factory execution stays gated and Gate 414 stays closed.

## Verified on PR #54 (`69abc9b`)

`compile-factory.js --check` and both existing Sandbox tests pass. Hashes: Factory `3fb7e28c…ef03`, child minter `ccfb6965…711f`, Jetton wallet `beb0683e…d0ce`. Verified: creator is the administrator, the Factory cannot call ordinary mint or change-admin (exit 73), a stranger or wrong query cannot bootstrap (exit 73), the supply and the creator wallet balance equal the request, a stranger CREATE for another owner fails (201), underfunding fails (202), substituted child code fails (203), and excess attachment is refunded with the Factory balance unchanged at 0.22 and 0.60 TON.

## Reproduced defect (not fixed by PR #54)

A repeated identical request (same creator, query ID, supply and metadata) resolves to the already-bootstrapped minter. The child threw 73 and the deploy message bounced to the Factory, which ignores bounces. `factory-repeat-charge.test.js` measured on the PR #54 code:

| Quantity | PR #54 | This branch |
| --- | --- | --- |
| Treasury fee for the rejected repeat | 73,479,399 nano | 0 |
| Bounced creator funds retained by the Factory | 104,734,998 nano | 0 |
| Creator net cost | 181,386,139 nano | 3,148,609 nano (gas only) |

Retained funds were recoverable only by the Factory administrator (`withdraw_excess`).

## Correction (separate branch, new code hashes)

The service fee is no longer sent by the Factory. The Factory sends `deploy + mint budget + fee` to the child with the treasury address and fee in the authenticated bootstrap body. The child pays the treasury only after the one-use mint succeeds. If the capability was already consumed, the child returns the attachment to its administrator (the creator) with mode 64 and does not mint or charge. Child and Factory addresses/StateInit commitments are otherwise unchanged. The fixed 0.105 TON base and 70% rate are unchanged (0.0735 TON on success).

| Code cell | PR #54 | This branch |
| --- | --- | --- |
| Factory | `3fb7e28ce037ab5b2294bb79186e92e6f678f018cd454d966a489c0f8541ef03` | `453af8a467e8cba3ad1f95cdc6e6eae5f4512f9e3b8d8714f688735e9ebae970` |
| Child minter | `ccfb69658addf71f99bfd550d0930ed4b78bb4dbfc66998beb243bd83623711f` | `0b9f3d9478c90f8701a000be186435cc15f003339b5dce33dcecf3316b74e240` |
| Jetton wallet | `beb0683e…d0ce` | Same |

Note: after bootstrap any sender of the bootstrap opcode only causes a refund of its own attachment to the creator, never a mint or state change.

```sh
npm ci --prefix tests/settlement-runtime
node minter-contract/compile-factory.js --check
node --test tests/settlement-runtime/factory-mint-authority.test.js tests/settlement-runtime/factory-repeat-charge.test.js
```

Result: 3 passed, 0 failed.

## Remaining, not fixed

- Asynchronous failure downstream of the child (frozen or undeliverable creator wallet, child account failure) is still not recovered by an on-chain protocol. The Factory ignores bounces and cannot identify the creator from a bounced body, so such funds remain in the Factory/child. This was not reproduced in the Sandbox and is not claimed fixed.
- The Factory UI remains gated. `factory-deploy.html` was not changed. Independent review of this correction is pending; it was written and verified by the same agent that found the defect.
