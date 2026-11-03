# VNext settlement and recovery: bounded implementation

**Verdict: NO-GO for financial Testnet execution.** This iteration implements authenticated, read-only LPAccount observation and proves why the proposed balance/timeout/burn shortcuts cannot authorize financial recovery. It does not complete canonical DEX settlement, enable refunds or substitute an authority signature for evidence.

Exact new code review target: **59f5a93** (full SHA and file hashes in [vnext-settlement-recovery-artifacts.json](vnext-settlement-recovery-artifacts.json)). Base PR23: `1bba1c5`, financial source `f6776d6`. Review input: `audit/targeted-vnext-security-review-f6776d6`, `2f7b7bc`. This is an AI cross-review and engineering reproduction, **not qualified independent human approval**. PR21, PR22, PR23, deployed contracts, Cloudflare and original Curve #2 operation/nonce locks are untouched.

## Reproduction and decisions

The original review's four adversarial tests reproduced **4 passed / 0 failed** before changes. An archived copy is under `tests/settlement-runtime/review-inputs/targeted-vnext-adversarial.test.js.txt` (comment whitespace normalized). Its fourth assertion accepts either409 or414; it does not by itself prove a successful positive authorization reaches414. The existing fresh-genesis VNext test does reach414 after genuine local graduation and a valid grant. The review's stated 16-case wildcard count must not be used as the full financial suite count.

| Requested transition | Concrete implementation/evidence | Financial result |
|---|---|---|
| Stranded STON.fi deposit | New source-authenticated LPAccount observation, exact deterministic Pool/account checks, stable query nonce and funded read-only retries. Existing official refund wire and returned-principal receipt consumers are reused, not rebuilt. | Observation available; **refund dispatch blocked** without evidence that provision is no longer in progress. |
| Missing first LP notification | Six new captured-bytecode cases cover50/100% with permanent/180/365-day terms; existing75% coverage retained. Delayed original notification credits once and preserves conservative lock timing; self-transfer never changes principal. | **Exact reconstruction stays UNKNOWN** if original attributed receipt is absent. No restriction was removed or candidate balance credited. |
| Downstream withdrawal failure | Two actual delivered claims followed by later LP returns recreate the proposed balance inequality while both original deliveries succeeded. Another test holds a recipient message in the queue: sender balance is low even though delivery has not occurred. | Both interpretations of the proposed inequality are false in valid asynchronous executions. Pending records remain unchanged. |
| Emergency buyer refund | Actual source-compiled VNext buy/sell plus burn routing: wallet debit occurs before minter execution; a genuine minter bounce restores the buyer's tokens. | A local burn debit is not final destruction or atomic TON payout evidence. **No emergency payout path added.** Existing arithmetic remains a non-authorizing model. |
| Full end-to-end migration | Existing fresh-genesis project initialization, mint/renounce/activation, trading and graduation tests remain. New tests exercise captured DEX liquidity and receipts independently of the closed dispatch gate. | **Not a completed canonical VNext asset-dispatch-to-finalization flow.** No414 gate was removed from production code; post-dispatch tests are explicitly seeded fixtures, not canonical dispatch. |

## LPAccount implementation and actual correction

The inherited VNext recovery code could begin a refund query with an unrelated root and replace its query nonce while another recovery was outstanding. Its Router -> Pool -> account chain authenticated senders but did not independently compare returned destinations with immutable pinned genesis derivations. It also automatically sent `refund_me` after a positive account observation, which cannot establish quiescence of an asynchronous liquidity operation. These paths were dormant behind asset-dispatch restrictions, but inappropriate for future activation.

`minter-contract/contracts/imports/migration-vnext-recovery.fc` now intercepts the financial recovery opcode **`0x414e4c3c`** and rejects414 after sender/root checks. No administrator or migration permit can activate it. The generated VNext source no longer includes the old automatic-refund handler block. V1/V2 sources and artifacts remain unchanged.

The new **non-financial** request `0x414e5c10 || root:uint64`:

1. Requires the exact configured admin/Curve, immutable root, matching active operation, existing DEX-dispatch lifecycle flag, bound vault/LP destination and caller-funded150m nanoTON. That funding is a local query budget, not a live fee estimate or policy for financial signing.
2. Derives Pool from the immutable Router/pair/profile. Derives LPAccount from the pinned account code and zero-balance genesis containing exact provider owner and Pool. Router/Pool replies must match these independently derived addresses. Account data must come from that exact account and name the correct owner and Pool.
3. Uses existing flight phase/nonce and existing lifecycle dictionary fields14(token total),15(pTON total),16(observation LT). It adds **no second financial ledger**. Replay bookkeeping is retained. It never modifies protected principal, pending-leg accounting, LP balances, claims or settlement status.
4. Funded retries re-query only the current outstanding stage with the same nonce. Bounces and missing responses retain pending observation; they do not infer zero. Late or duplicate callbacks after phase advancement reject. A finished observation is immutable; repeated calls return operational gas and do not pretend to refresh it.
5. Records only the LPAccount's observed held totals, which may contain unrelated activity. The two explicit attribution/financial-authorization flags remain zero. A single observation is not cumulative settlement, canonical finality, current balance, cancellation or migration-specific delivered principal.

`get_recovery_observation_vnext()` returns `(root,nonce,phase,tokenTotal,ptonTotal,observationLT,attributionVerified=0,refundAuthorized=0)`. Phases0/1/2/3 mean unobserved/wait Router/wait Pool/wait LPAccount; their amounts must render **UNKNOWN**, not zero. Phase4 means historical observation only. No public API or frontend has been changed to expose these as verified balances.

The proposed recovery opcode `0x414e4c3e` was **already occupied** by authenticated settlement-wallet credit-receipt queries. It was preserved. The official v2.2 LPAccount schema remains `refund_me#132b9a2c query_id:uint64 left_maybe_payload:(Maybe ^Cell) right_maybe_payload:(Maybe ^Cell)`; the existing helper emits both absent bits. Captured-bytecode tests continue to reject the alternative opcode and reconcile genuine returned balances independently. An opcode and authenticated balance response alone cannot authorize cancellation.

New recovery tests use an explicitly **seeded** post-dispatch consumer and token custody because production VNext dispatch is closed. Actual captured Router/Pool/LPAccount/LP wallet code processes subsequent messages. In the first test a genuine delayed second leg still produces LP **after** the first leg was observed held: that observation did not prove refund safety. The test records no completion and sends no refund. Fault tests inject narrowly scoped malicious callback messages only to verify rejection; normal completion uses actual foreign query routing.

## Why the other prescriptions were not implemented

**Missing-first notification:** A candidate self-transfer proves `balance >= candidate` at that execution, not equality, mint source or operation attribution. Changing the percentage restriction cannot add those missing facts. The existing restricted probe is floor-only even for100% permanent locks. New50/100% tests keep custody uncredited until an actual delayed mint notification is processed. A duplicate leaves both allocation and unlock unchanged. Timed recovery starts no earlier than the delayed accepted evidence; it never shortens an existing lock. Existing tests also cover real donated LP and duplicate/replayed probes. A trusted signature is not substituted.

**Withdrawal:** The new multiple-claim counterexample delivers both claims, then both recipients later send real LP back. A high locker-wallet balance cannot retroactively prove either delivery failed. The low-balance counterexample holds a genuine recipient message after sender debit for more than an hour, then completes it: low balance did not prove delivery. Existing tests retain nonzero frozen-recipient downstream bounces, authenticated immediate-bounce restoration, fake excess, duplicate and unauthorized claims. Neither cooldown nor a probe may clear or restore a particular request. Immediate original-request bounce recovery remains supported; downstream failure still lacks an authenticated per-withdrawal outcome consumable by Locker.

**Emergency TON:** The new burn test observes zero buyer-wallet tokens after burn dispatch and then restores the exact tokens when the frozen minter rejects its notification. Paying TON at the intermediate debit would allow a later restoration of the redeemed tokens. A safe design needs persisted redemption correlation, authenticated final token custody/destruction, migration exclusion, solvency/gas funding, payout-bounce reconciliation and exactly-once settlement; neither the existing mathematical formula nor timeout implements this state machine. No new unreviewed payout design was introduced.

An auditable route to unblock these transitions requires a concrete contract-consumable finality/history proof or a compatible foreign contract extension producing correlated, authenticated outcomes. Router upgrades remain an external trust risk. API results, two-provider observations, captured code execution, self-transfer floors and migration-permit signatures do not meet that requirement by themselves. This iteration does not invent such a proof.

## Reproducible verification and artifacts

- `npm.cmd test` in `tests/settlement-runtime`: **208 passed, 0 failed, 0 skipped**. All prior196 cases retained;12 new cases (three LPAccount consumer cases and nine external-recovery/async cases). Test fixture extraction prevents importing one test file from silently re-registering its whole suite.
- `node --test tests/settlement-runtime/vnext-recovery-safety.test.js tests/settlement-runtime/vnext-external-recovery.test.js`: focused new paths; run after `node minter-contract/compile-vnext-package.js --check` from repository root.
- `node minter-contract/compile-vnext-package.js --check`: **PASS**. All generated sources/pins and artifacts match source compilation. Whitespace and staged credential-pattern checks pass.
- Original AI review reproduction: **4/4**, before changes, kept separately from the208. No qualified external assessment, live blockchain transaction, browser release or deployment was performed in this task.

Changed contract inputs: new `imports/migration-vnext-recovery.fc`; generated `anlgram-migration-router-vnext.fc`; generated `imports/migration-router-vnext-code.fc`. Generator and three artifact metadata files changed. Guard code and Curve source are unchanged, but Curve bytecode changes because its Migrator code pin changes. Existing minter, settlement wallet, Locker V2, V1/V2 artifacts, economics, mandatory donation, UI and API integrations are preserved.

| Contract | Bytecode cell hash |
|---|---|
| Guard VNext (unchanged bytecode) | `a2bbc0a304d40113da0ba78447862597f7302128dae04d344caee7686946f157` |
| Migrator VNext | `eeb1daf8834ca7037c8637c2f5a2a0829b2d69bad49e1b4f66096a1f44c1d686` |
| Curve VNext | `3e2e97612ff7ce9c95ab4ebb8b89d285d69b9ea68f155137e8f3f59da07493a9` |

Full source/dependency SHA-256, generator hash and BOC hashes are in the JSON and compiled artifacts. New Migrator code changes the dependent Curve/Guard/Migrator/Locker StateInit graph and permission version commitments. **Do not reuse any previous VNext deployment BOC, address, signature or fingerprint.** No live candidate was generated, no prior deployed address was changed, and no old operation lock was reset.

## Independent review handoff

Review the full `codeReviewTarget` SHA in the JSON and all dependent artifact pins. Specifically verify the observation-only boundary, preservation of flight/receipt dictionaries and protected balances, deterministic LPAccount schema, callback replay/phase behavior, unknown-vs-zero semantics and every legacy entry point. The archived AI review's feasibility assertions are not security approval; the new counterexamples invalidate its proposed balance/cooldown and atomic-burn shortcuts.

This is a separate development PR stacked on PR23, not a replacement or merge. No financial gate may be enabled from these test results. First financial Testnet authorization still requires a reviewed proof/cancellation design, qualified independent security assessment, a fresh compatible deployment candidate and separate owner approval. Mainnet remains blocked.

Official interface reference: [STON.fi v2 LPAccount messages](https://docs.ston.fi/developer-section/dex/smart-contracts/v2/lpaccount), including separate asynchronous `add_liquidity`, `cb_add_liquidity` and `refund_me` messages. Local captured-bytecode tests establish compatibility; they do not establish live or validator-level finality.
