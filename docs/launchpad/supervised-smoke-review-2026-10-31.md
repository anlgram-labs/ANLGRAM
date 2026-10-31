# Supervised Testnet smoke candidate — 2026-10-31

Development branch `codex/testnet-execution-candidate`, based on `c8b7a08`.
No contract source/bytecode/address recipe, tokenomics, donation, frontend or
Antigravity integration changes. PR #5 stays preserved. Nothing is deployed,
signed, broadcast or spent; Mainnet stays blocked.

## Implemented and verified

`scripts/prepare-supervised-smoke.js` reuses the seven-source-compiled component
candidate and the existing financial planner. It checks all four deployment
roles against the component's exact identities, exports the existing serialized
StateInit/payloads and prepares an intentional native bounce test. The old planner
now accepts an explicit operator for reproducible Sandbox execution; its default
output/addresses remain compatible.

`sellTemplate` builds the actual existing TEP-74 sell message with a positive
fresh minimum TON amount, exact owner/Curve and full uint64 query ID. It does not
verify provider evidence or authorize signing. The live sale remains a separate
approval after actual buy delivery and a current Curve quote; no pristine-genesis
simulation result is substituted for that evidence.

```text
node scripts/prepare-supervised-smoke.js --write
node scripts/prepare-supervised-smoke.js --check
node --test test-supervised-smoke.js test-financial-testnet-plan.js test-migration-component-manifest.js
```

Generated public review file:
`supervised-smoke-candidate-2026-10-31.json`. SHA256 of
`JSON.stringify(JSON.parse(file))`:
`89aad036f142ac889c670bef1b0243271ae5b909724c2a094f5d1d5e7fbfa44b`.
Contains source hashes, exact destination addresses, payloads, StateInit and
approval/reconciliation requirements. It is **not a ready-to-sign session**.

## Proposed signing wallet and addresses

Owner-supplied operator, not a new signer:
`0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d`.
Testnet representation:
`0QDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbZ2X`.
An address/tag does not prove Testnet wallet control or wallet version/public key.

| Role | Exact Testnet address |
|---|---|
| Minter | `kQDzVA3j1ue-cB_ZeBZgXVYSiPIbE6F57nzH0KwhbEoTgBQD` |
| Curve | `kQDUo6ZeovKuperyN7xb6Vy795qoh3ce09amMC1uwlmhACwa` |
| LP guard | `kQCPD5nXhUVy6VUMaGSkdbq3HPxIW8ew9ULdCgY4F2fLYGL6` |
| Migrator | `kQCaEEzQhQ8vhR4VgihpQKbIE0BervHvCi6VR_YKaCVhox2k` |
| Operator Jetton wallet | `kQAGpwYqenM7Pyoj5mrqHQTx5hcz-ZuJSvWv21CBP_QBK3wq` |

Binding/Locker V2 remain separate undeployed components. This smoke does not
attach them to V3 principal dispatch or authorize foreign LP custody/migration.
LP percentage50–100,180/365 days/permanent and100%-permanent default are unchanged.

## Approval sequence and budget

| Step | Attachment in Testnet TON | Required outcome |
|---|---:|---|
| Deploy minter/Curve/guard/migrator, four distinct messages | 0.10 each | Exact active code/data identities, no conflicting/frozen accounts. |
| Initialize Curve | 0.10 | Intended master/wallet/guard/migrator; INITIALIZING. |
| Mint exactly1B units at9 decimals | 0.20 | Supply/custody exact and RENOUNCE_PENDING; never repeat a mint after uncertainty. |
| Operator renouncement | 0.05 | Admin null and Curve ACTIVE. Irreversible. The known automatic Curve-origin admin attempt is not treated as successful. |
| Small buy | 1.00 | Current reviewed minimum output; actual authenticated Jetton delivery/settlement. |
| Deliberate impossible-minimum buy | 0.10 | Curve exit404, observed native bounce and unchanged reserves; execution fees remain spent. |
| Subsequent sell, after separate live evidence/quote approval | 0.10 | Actual token debit/credit, TON payout, reserve/fee reconciliation. |

Phase A attachments sum **1.85 Testnet TON**, including principal and retained
contract funding, not just transaction fees. Proposed envelope **2.50 Testnet
TON** also reserves0.10 for the later sale,0.20 for the existing creation-base
budget,0.02 mandatory donation and0.33 fees/contingency. The base reserve is not
an additional authorized payment. Not all contract funding is assumed withdrawable.
No Testnet donation waiver or substitution is assumed: recipient and serialized
donation message remain pending explicit approval. Production donation unchanged.

Read-only TON Center observation this session: operator Testnet account
`uninitialized`, balance **0.0035 Testnet TON**, no code/data. This is provider
observation, not proof of control. It is insufficient for the proposed envelope;
minimum shortfall against2.50 is **2.4965 Testnet TON**. No transfer was initiated.

**Actual live network fees cannot yet be fully quoted**: operator wallet control,
version/public key and initial state must be verified; later messages depend on
fresh deployed state and actual delivery. Before approval, obtain current network
estimates for the exact wallet messages, confirm metadata/Testnet donation recipient,
check all deployment accounts and prepare an approved Testnet manifest/origin.
No private keys/seeds are needed or requested. The old5 TON Mainnet ceiling is
not authorization for this plan or for Mainnet spending.

## Actual local execution evidence

Focused test run: **12 passed,0 failed,no skips**: three new smoke cases, two
preserved financial-plan tests and seven preserved component-manifest tests.
The exact prepared messages are routed through actual Sandbox contracts from
fresh genesis, without seeded post-dispatch balances. Source/artifact checks
compile all seven dependencies before the plan is accepted.

- Deploy/mint/manual renounce/activation succeeded; mint authority became null.
- Buy delivered `6048071477226374` Jetton units; source-wallet settlement status2,
  owner/master and actual recipient balance matched.
- Intentional slippage rejection produced an actual routed native bounce of
  `99262999` nanoTON from the0.10 attachment; reserves/fees were unchanged.
- Two funded queries replayed the same authenticated receipt without sending
  tokens or booking reserves twice.
- A getter-derived sale quote paid exactly `940896000` nanoTON to the operator;
  its token wallet finished at0, Curve wallet at1B supply, pending refunds0.
- Total simulated transaction fees for the nine Phase A operations and their
  descendants: `51342906` nanoTON. **This is not a live fee quote**, excludes the
  later sale/receipt-query fees and the pending donation, and is not total funding.

Existing155 Sandbox cases and prior39-suite checkpoint are reused as baseline,
not claimed rerun here. No contract changed. Frozen recipient, malformed-sell
escrow and lost-receipt recovery remain established local tests; the new native
bounce test is not falsely presented as a live frozen-wallet recovery.

## Recovery and remaining financial gates

Stop on an unknown result. Retain exact external/internal message hashes and
operation IDs; inspect compute/action results, descendants, persistent source-
wallet records and actual principal movement. A funded receipt query is permitted
only after correlation/review; the candidate deliberately leaves its operation
ID/payload unset until observed. Never resend principal based on missing notices.
Renouncement cannot be rolled back; recovery is reconciliation, not resetting
chain history. No migration/deposit/finalize message appears in the allowlist.

Exact LP issuance/operation attribution, general first-notification recovery,
foreign final withdrawal receipts, independent Router/Pool code and upgrade review
and complete migration finalization remain blocked as documented at V4/c8b7a08.
The foreign wallet does not implement the necessary authenticated receipts.
A compatible STON.fi-supported extension or independently reviewed anchored TON
proof verifier is required; an API snapshot/new attestor is not an approved fix.
No foreign capability was invented and no LP authorization gate was removed.

This is ready for **review of a bounded Testnet component proposal**, not signing
or full-migration execution. Finish control/funding, donation/metadata, live costs,
manifest and exact per-stage approvals before any supervised broadcast. Full
Mainnet also requires independent review and successful actual Testnet financial
execution/recovery evidence. Public UI/production activation is not authorized.
