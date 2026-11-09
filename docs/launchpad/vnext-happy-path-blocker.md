# Result B: fresh VNext migration prefix and exact dispatch blocker

**NO-GO for complete canonical VNext migration.** The first blocker is in ANLGRAM, before STON.fi receives assets: `vn_require_curve_dispatch` unconditionally throws414 after validating the current permission. This is deliberate fail-closed behavior, not a foreign Router failure, expired permission, insufficient reserve, missing receiver epoch or fee estimate. No gate was removed.

Proof code commit: **257f805**; full SHA, exact source/bytecode hashes and file checksums are in [vnext-happy-path-proof-manifest.json](vnext-happy-path-proof-manifest.json). Financial source remains `59f5a93`, PR24 documentation base `7377978`. No financial contract, artifact, opcode, storage, economic parameter, lock, deployment or runtime was modified. Only a focused test, test script and local evidence were added in a dedicated worktree/branch.

## Reproduce exactly

```powershell
node minter-contract/compile-vnext-package.js --check
cd tests/settlement-runtime
npm.cmd run test:vnext-happy-path
```

To save a fresh local trace, set `ANLGRAM_LOCAL_PROOF_OUTPUT` to an output JSON path before running. Addresses and transaction hashes are ephemeral Sandbox data, **not approved Testnet deployment addresses, final receipts or signing candidates**. Authority keypairs are created only in memory for local permit tests. No wallet application, live signer, RPC, API secret or financial signing request is involved.

Actual result: **2 passed, 0 failed, 0 skipped**. The first test asserts the expected migration **failure**, not successful liquidity migration. The full existing208-case financial suite was not repeated; its cases are retained, with this file added for future full runs. Source/artifact reproducibility passes. No independent security approval is claimed.

## Test 1: genuine fresh prefix, no prepared post-dispatch state

The existing fresh project fixture is reused, not its seeded funding fixture. It source-compiles and compares Curve/Guard/Migrator; this test independently source-compiles and compares the unchanged minter, settlement wallet and Locker. Captured STON.fi code/libraries are loaded by the existing external fixture. Project contracts start at their actual genesis and are initialized by actual local messages.

The test executes:

1. New minter supply zero -> Curve initialization with validated Guard/Migrator genesis -> mint1B into the actual Curve wallet -> minter administrator renouncement -> authenticated activation.
2. A real local buy and sell, including wallet delivery and Curve reserve changes; a large buy then reaches graduation. Buyer holds800M, Curve wallet holds200M, curve inventory and outstanding refund tokens are zero. Native reserve is500 TON and protocol fees remain separate.
3. Open the Curve return epoch; bind the actual immutable Locker and expected wallet slots in Migrator; **execute actual Curve receiver-priming** (`0x414e5802`) and receive authentic funding/DEX epoch acknowledgments. This matters: merely granting permission without receiver readiness would not isolate the dispatch blocker.
4. Submit and verify a local migration-only permission; query it through actual Curve -> Guard -> Curve messages. Current nonce/digest/expiry match; Curve lifecycle flags are3 (permission and receiver readiness); all three receiver epochs are positive. No seeded obligations, forged successful callback or manual asset injection is used.
5. Wrong digest rejects409 without changing reserves. The exact correct digest then reaches `curve-vnext-auth.fc:54`, aborts414 and emits **no** Jetton transfer or TON funding message to Migrator. Native reserve, fees, escrow and actual wallet balances remain unchanged; Migrator funded amounts and DEX-sent counter remain zero.

Thus the attempted prefix satisfies the readiness conditions relevant before dispatch. There is no on-chain message to STON.fi to trace in the canonical case. Manually funding Migrator or removing414 would replace the required experiment with a different one.

Further static barriers, not represented as successful executions: Migrator `vn_require_execute` at `migration-vnext-auth.fc:60` throws414 after its own authorization checks; finalization at `anlgram-migration-router-vnext.fc:382` throws414. Completing only the first dispatch would therefore not prove full settlement.

## Evidence boundary by transition

All evidence below is **local TVM execution**, not validator-finalized Testnet history. `q=77` is the migration root; trade/mint query IDs and settlement wire IDs are separately correlated by existing code.

| Initiator -> receiver | Message / identity | Accounting and evidence actually available | Blocking condition |
|---|---|---|---|
| Creator -> Curve | Init `0x414e4c01`, query1 | Validated immutable config, exact code/StateInit-derived Guard and Migrator | Wrong caller, genesis, code, fee or participant rejects |
| Admin -> minter -> Curve wallet -> Curve | Mint21/query2; `0x178d4519`; authenticated `0x7362d09c` | Source-compiled wallet receives real1B units; minter supply updates; Curve checks its exact wallet/master | Wrong mint admin, custody wallet or supply rejects |
| Admin -> minter -> Curve | Change-admin3, renounce query; ack `0x7a3e810f` | Actual minter acknowledgment authorizes existing activation conditions; admin becomes addr_none | Missing/forged ack or mismatched supply leaves inactive |
| Buyer -> Curve -> wallets -> Curve | Buy `0x5fcc3d14`; settlement transfer/internal/receipt `0x414e5301/02/04`; trade101 | Actual delivered buyer tokens, source-correlated receipt, integer reserve/fee changes | Wrong wallet/receipt, gas, slippage or settlement failure retains obligations |
| Buyer wallet -> Curve wallet -> Curve | Sell `0x0f8a7ea5` then `0x7362d09c`; trade102 | Exact returned tokens and actual TON payout; reserve decreases | Malformed/underfunded or unauthenticated delivery cannot become an assumed payout |
| Graduating buyer -> Curve | Buy103 | Native reserve500 TON; zero curve inventory;200M DEX escrow; real wallets800/200M | Sub-threshold reserve or pending claims prevents readiness |
| Curve -> own/Migrator wallets -> Curve | `0x414e5801/02`, `0x414e5901/02`, credit epoch `0x414e5308/0a`; root77 with existing wire domains | Actual receiver epochs before assets; no asset principal is credited merely by opening an epoch | Missing/wrong epoch or participant prevents readiness |
| Local permit payer -> Guard; Curve -> Guard -> Curve | `0x414e5b10`, `0x414e5701`, `0x414e5b02`; root77/nonce1/digest | Signature grants migration permission only; exact scope/epoch/reserve/version match | Wrong digest rejects409; signature supplies no custody/refund/finality proof |
| Creator -> Curve | Dispatch `0x414e5803`; same nonce/digest | All pre-dispatch conditions ready; abort414; no principal mutation or outbound asset action | **First exact blocker: unconditional414** |
| Intended Migrator -> token wallet / pTON Router wallet | Would use `0x0f8a7ea5` and `0x01f3835d`, carrying `0x37c096df` | **Not reached by VNext Curve.** Existing source contains compatible wire construction below another gate | Missing actual Curve funding; post-funding authorization/execution gate414 |
| Independent provider -> Router / LPAccount / Pool -> Locker wallet | Actual compatible wire, root77; Pool `0x178d4519` and wallet `0x7362d09c` with `ALV2` tag `0x414c5632` | Demonstrated separately: authenticated mint and exact credited LP in intended Locker | Cannot be substituted for VNext dispatch or its remaining obligations |
| Locker -> provider | Existing observation `0x414c5635`; root77, emitted LT, exact pool/wallet | Authenticated Locker accounting snapshot; not a proof of every DEX deposit leg or canonical finality | Existing VNext finalization gate414; unproven refunds/leftovers stay unresolved |

## Test 2: compatible normal foreign path, without pretending it is VNext dispatch

A separate source-compiled minter and Locker use a **Sandbox Treasury provider contract**, not Curve/Migrator. Tokens are actually minted to that provider's wallet; **no post-dispatch balance is preloaded** and no LP receipt is injected. The existing wire builder sends200M tokens and500 TON/pTON to actual captured compatible Router, LPAccount, Pool and LP wallet implementations.

The Pool emits LP internal-transfer to the deterministic Locker-owned wallet. That wallet emits the notification accepted by source-compiled Locker. The trace asserts actual senders, root77, serialized parent/child message hashes, pool master, Locker wallet ownership, exact balance and credited principal. Result: **316227766015836 LP units received and locked; zero unlocked**. Terms are100% permanent with the existing permanent sentinel. The beneficiary's attempted locked withdrawal rejects403; a fabricated notification from an actual wrong caller rejects401.

The provider then invokes the existing funded Locker observation query `0x414c5634`. Locker really emits `0x414c5635` to its immutable contributor with the exact received/locked/free/pending/unlock and Pool/wallet fields. This is a usable local message capability, not an invented callback. No Migrator consumes it in this independent scenario and no migration is marked complete. The provider is not a new one-shot escrow, has no reviewed VNext authorization logic and is not proposed for deployment.

This isolates the foreign compatibility question: captured compatible STON.fi **can** mint LP and deliver authentic attributed custody to the existing Locker for the tested normal path. It does not prove the code behind VNext's closed gates, full reserve reconciliation, lost-notification recovery, external code immutability or finalized Testnet settlement.

## Concrete compatible alternative, before any new architecture implementation

The minimum demonstrated compatibility route is the **existing provision wire + immutable Locker notification + authenticated Locker accounting observation**. No foreign-contract rewrite or trusted custody signer is needed to demonstrate this custody milestone. A new general escrow is not justified solely by Router compatibility and cannot manufacture missing foreign receipts.

For a future coordinated immutable version, keep the existing Migrator as the exact per-project/provider identity, make one authorized funding epoch consumable once, and expose separate states:

`PERMITTED_UNFUNDED -> FUNDING_PENDING -> FUNDED -> DEX_DISPATCHED -> LP_CUSTODY_OBSERVED`

The last transition consumes the existing Locker-origin `0x414c5635`, matches its immutable root/config/Pool/wallet, checks minimum LP and exact locked/free allocation with pending0, and records its monotonically emitted LT. It must **not** be named `MIGRATION_COMPLETE` or clear unresolved asset-return liabilities. The executable foreign test demonstrates the exact custody messages this design could use; it does **not** implement or prove the new funding/dispatch consumer state machine.

Only a separately reviewed completion predicate with authenticated evidence for both asset obligations and all residual refunds can move to `COMPLETE`. A custody snapshot alone does not prove the exact TON/Jettons the Pool ultimately retained. If that proof is unavailable, keep the distinct custody milestone and remaining settlement UNKNOWN. Any new code enabling dispatch must be a new reviewed deployment version with new addresses/permits, not removal of414 from this preserved baseline.

This is the bounded alternative: reuse a proven compatible external message path and an already implemented on-chain Locker acknowledgment; implement/review **only** the missing one-shot asset-dispatch and completion consumer in a future authorized version. No escrow or new financial contract was implemented here, and no claim is made that this proposal alone makes funds safe to release.

## Minimum failure policy

- Partial/delayed deposits: do not resend principal or infer cancellation from timeout or an LPAccount balance. Existing observation/receipt tracking preserves unknown liabilities; `refund_me` is not invoked by this experiment.
- Missing LP notification: exact custody remains UNKNOWN until authentic attributable evidence is available. Floor probes, API balances or a valid migration signature do not create principal.
- Duplicate permission/query: never duplicate asset dispatch. This test's rejected digest and blocked dispatch move no assets; actual exactly-once dispatch after release is not yet proved.
- Withdrawals: permanent restrictions remain; immediate original bounce recovery is distinct from downstream failure. No balance inequality, excess or timeout clears a pending request.
- No final foreign evidence: retain pending/unknown status; neither an observed LP balance nor simulated success substitutes for finalized Testnet receipts.

## Exact measured local gas/fee accounting

The committed [local trace](vnext-happy-path-local-evidence.json) records each processed contract, sender, opcode/query ID, serialized message hash, gas, fees, outgoing value and execution result. It is **not** a live receipt bundle or deployment candidate. Native fee figures use the captured/local Sandbox configuration and Treasury actor, not the live V5 wallet or a current network fee quote.

| Measurement | Local result |
|---|---|
| Correct blocked Curve dispatch attachment |250000000 nanoTON |
| Curve compute gas |29653 |
| Curve transaction totalFees |1999089 nanoTON |
| Bounce outgoing value |247956465 nanoTON |
| Remaining forwarding fee on bounce |44446 nanoTON |
| Exact conservation for that unchanged-balance transaction |250000000 =247956465 +1999089 +44446 |
| Recorded canonical prefix fees |134014828 nanoTON; includes trade/initialization/query/adversarial and bounce processing, excludes fixture genesis deployment |
| Independent DEX legs attached |500350000000 nanoTON =500 TON principal +0.35 TON operational attachments |
| Independent DEX legs processed transaction fees |15315367 nanoTON |
| Additional Locker observation transaction-chain fees |3135913 nanoTON; funded separately with20000000 nanoTON |

Operational attachments are **not** all network fees: gas excess and retained native storage/operational balances remain separate. Recorded totalFees are not a guaranteed debit limit, nor a complete project deployment quote. The initial test failed when the assertion omitted the bounce's remaining forwarding fee; adding the actual message-carried fee resolved the reconciliation without altering contract behavior or loosening the equality.

## Reproducible hashes and unchanged code

| Contract | Code cell hash |
|---|---|
| Curve VNext |`3e2e97612ff7ce9c95ab4ebb8b89d285d69b9ea68f155137e8f3f59da07493a9` |
| Guard VNext |`a2bbc0a304d40113da0ba78447862597f7302128dae04d344caee7686946f157` |
| Migrator VNext |`eeb1daf8834ca7037c8637c2f5a2a0829b2d69bad49e1b4f66096a1f44c1d686` |
| Locker V2 |`22d689df2f32d5fd00c72b50f31ab77291117a7625ad1bb654a4b6dbc796e001` |

The manifest includes exact normalized-LF source SHA-256, compiled dependency hashes, artifact file/BOC checksums, captured foreign profile identities, proof source and trace checksum. Existing pinned compiler/core/Sandbox versions are reused. The three VNext artifacts and all financial source files are unchanged from PR24; no deterministic deployment address or original operation record was updated.

Trust assumptions remain: compatible captured foreign code/library/profile represents local tested behavior; live Router upgrade authority/version and validator finality require separate verification; one-shot provider/receipt consumption and complete reserve/return reconciliation require qualified independent review. The AI cross-review and these tests provide no such human approval.

**Next exact engineering action:** review and specify the new version's one-shot funding/dispatch transition and completion predicate against the demonstrated custody acknowledgment. Do not change the current gates or deploy from this proof. Normal foreign LP custody is demonstrated locally; complete VNext migration remains **NO-GO**.

Official message accounting reference: [TON internal message forwarding fields](https://docs.ton.org/foundations/messages/internal). The measured balance equality uses actual local message and transaction fields, not a wallet-response assumption.
