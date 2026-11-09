# LPAccount settlement evidence for generation 2

Financial baseline: 351de8a56b2b584c0353743c5917801a808a211d. PR #26 documentation head: a4fb68a. Review input: c75b9a8, an Antigravity AI review.

**Sandbox GO for the custody path and the evidence probes. Testnet financial deployment NO-GO.** The existing SETTLEMENT_PENDING stage and finalize rejection 414 remain the outcome. The tests use the existing unseeded Curve funding, both permits and the captured compatible foreign code. The only contract-source impersonation is a local ABI probe of refund_me from the expected account owner. It supplies local gas and executes the foreign handler. It is separate from the actual Migrator interface, which rejects the corresponding recovery request.

## Observed lifecycle

| Case | Captured TVM result |
|---|---|
| Project Jettons arrive first | LPAccount holds 200M project Jettons and zero pTON. The second leg can still arrive. |
| Successful provision | The second deposit triggers LPAccount to send cb_add_liquidity (0x06ecd527) and delete itself in that transaction. The Pool later mints LP and the Locker acknowledgment reaches Migrator. The tested successful initial pool consumes the two full legs. There is no live LPAccount holding dust in this run. |
| Query and refund after custody | The deterministic account is absent. The getter fails to produce a state response. An owner-addressed refund probe bounces without reaching Pool. |
| Minimum LP rejection | Pool returns both legs to the same deterministic account using an add_liquidity message with StateInit. LPAccount holds both exact amounts again. Migrator has no LP credit. |
| Failed first token send | The genuine wallet bounce restores the token leg. The successful native leg sits in LPAccount as 500 pTON. The later refund produces a separate native principal receipt. |
| Refund while a leg is queued | The first refund removes the token-only incarnation. The late native leg recreates the same address with pTON only. Replaying the identical refund request then affects the new incarnation. |

The successful path is evidence for this captured initial-liquidity operation. The tests did not exhaust arbitrary nonempty Pool balances or every rounding case. The account can hold an unrelated later state at the same address. A balance observation by itself does not establish which provision or account incarnation produced it.

Official interface: [STON.fi LPAccount messages and state](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount).

## Authenticated message graph

| Edge | What the receiver can authenticate |
|---|---|
| Router → Pool → LPAccount | provide_lp (0x37c096df) and Pool add_liquidity (0x50c6a654) route the legs. The deterministic LPAccount binds provider and Pool. amount0/amount1 are in pair-wallet order. |
| LPAccount → Pool | cb_add_liquidity carries both deposited amounts and provider identity. Migrator is outside this edge. |
| Pool → deterministic LP wallet → Locker → Migrator | internal_transfer (0x178d4519), transfer_notification (0x7362d09c), Locker observation (0x414c5635). These establish historical credited LP for the root and intended lock terms. An actual unlocked withdrawal lowers wallet holdings while the recorded observation stays intact. |
| Migrator → Router → Pool → LPAccount → Migrator | The existing funded lookup authenticates the Router response, exact Pool and deterministic LPAccount. The 0x24cfc100 reply contains nonce, owner, Pool and amounts. The root lives in Migrator's flight record. |
| Migrator owner probe → LPAccount → Pool → Router | refund_me uses opcode 0x132b9a2c, query ID uint64 and two absent Maybe payload bits. LPAccount emits 0x0f98e2b8 to Pool. Pool emits 0x657b54f5 to Router. |
| Router → wallets → Migrator custody | Router uses Jetton transfer (0x0f8a7ea5). The pTON wallet returns native principal in 0x01f3835d. The project wallet receives 0x178d4519. Migrator reads the project wallet's authenticated cumulative credit through its existing 0x414e4c3e query. Gas excess 0xd53276db is separate. |

In the delayed-reply test, a third party copying the exact reply is rejected with 401. The genuine reply is accepted once even though its account incarnation and balance have changed by delivery. Its reported LT is the Migrator's acceptance LT. A second delivery fails with 409. The existing receipt records remain informational. An absent reply leaves phase 3 with no observation LT, which is UNKNOWN. The getter has no account-generation identifier, balance fence or cancellation barrier.

For the refund test, the LPAccount-to-Pool message is deliberately held in Sandbox. Both returned counters remain zero until downstream execution and the wallet receipt query. A request repeated against the deleted account sends no second Pool callback. The same request can act on balances after recreation. Neither query ID nor dispatch acknowledgment is an across-incarnation refund lock.

## Completion predicate and remaining condition

For each original leg, require an authenticated partition into exact Pool consumption, actual returned principal and unresolved principal:

```text
original_native_principal = consumed_pTON + native_principal_returned + unresolved_native
original_project_units    = consumed_project + project_units_returned + unresolved_project
```

Normalize pTON to its principal units once. Attached native gas, account rent and excess returns sit outside this equation. Require both unresolved terms to be zero, authenticated historical LP issuance at or above the minimum, an exact allocation at the acknowledged LT and closure of all competing recovery obligations. Each counted event must bind the project, operation and relevant dispatch. A return of both legs with zero LP is a failed provision, not successful migration completion.

Current Migrator can authenticate bounded return credits and historical LP observations. It cannot prove the exact per-operation Pool-consumed amounts **and** closure of in-flight return obligations from these interfaces. An LPAccount reply is an asynchronous snapshot. Account absence after mint provides no authenticated empty-state or terminal receipt to Migrator. Computing consumed as original minus returned would assume the missing closure proof. The settlement gate therefore continues to return 414. The authorized signer retains the existing migration-permit scope. A separately labeled off-chain finalized trace could be informational, with no effect on contract state or funds.

The review's proposed automatic dust sweep and witness flag lack the necessary proof under Option 1. Its Locker and settlement-wallet hash rows also differ from the pinned PR #26 artifacts. The applicable cell hashes are 22d689df2f32d5fd00c72b50f31ab77291117a7625ad1bb654a4b6dbc796e001 and e21136c0ea3074a48addec49215af2d8d20125b4cc61a564a1a37d37667b58a2, respectively. See the [PR #26 review package](one-shot-dispatch-review-package.json).

## Reproduction

```powershell
node minter-contract/compile-one-shot-dispatch.js --check
node --test tests/settlement-runtime/one-shot-dispatch.test.js tests/settlement-runtime/lpaccount-settlement-evidence.test.js
```

The source-compiled tests reuse the PR #26 fixtures and their actual captured bytecode. The financial sources and compiled artifacts are those of 351de8a. Remaining work is an operation-bound terminal proof that authenticates both consumed legs and rules out outstanding returns, plus qualified independent review of the implementation before any live financial deployment.

Run result: 17 passed, 0 failed, 0 skipped (12 existing one-shot cases plus 5 new cases). Artifact reproduction passed.
