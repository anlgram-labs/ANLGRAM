# PR17 / PR18 Testnet integration

Isolated worktree: C:/Users/maino/.codex/worktrees/memelabs-ux-backend-integration/ANLGRAM. Branch: codex/testnet-ux-receipt-integration. No original branch/worktree, GitHub PR or production main was merged or overwritten.

## Verified graph

| PR | Head | Target |
|---|---|---|
|12|de328e47f74a67b37373912fba7977eedb1613f9|codex/curve-two-signing-readiness|
|16|6d7aa24f1304d144944aa24bec44ab9a417ba4c1|codex/testnet-mvp-offline-sprint|
|17|a4533ff8c1cec7f576215b14187baa7b27234074|codex/testnet-mvp-offline-sprint|
|18|aa636fedb9c34442229079dbff62aa35a93ba81b|codex/independent-project-integration|

Pairwise merge bases:12/16,12/17,12/18 = de328e4;16/17 and17/18 =39213ba;16/18 =6d7aa24. PR17 contains only one new UX commit beyond39213ba. A reviewed three-way merge into the newer PR18 tree preserved3191ff6's basechain restriction automatically; applying PR17's complete endpoint-to-endpoint diff would have lost newer work. No textual Git conflicts occurred.

## Included and corrected

Included PR17 mode cards, validation feedback, recipient table, clearly labeled configuration examples, local draft cards/deletion helpers, LP and model-preview presets, isolated accessibility/responsive CSS, and its tests. Kept PR18's per-project deployment receipt adapter and tests byte-for-byte; reused the original verifier without adding a receipt engine or public receipt submission route. PR16 metadata, StateInit, distribution, vesting and versioned LP preparations are retained.

Corrected the hard-coded1000TON graduation card and its handoff to the existing CURVE.thresholdTon=500. A source-compiled Sandbox execution additionally verifies getter threshold500000000000 nanoTON, Curve allocation800000000000000000 units, DEX escrow200000000000000000 units, minter total1000000000000000000 units, decimals9 and a10000000-nano fee for a1000000000-nano gross quote (1%). No contract/economic/source/artifact change.

Both canonical and detailed CSV parsing retain workchain0. Unknown deployment, supply, balances, reserves, distributions, vesting, custody, unlock time and receipts map to null/UNKNOWN. Configured amounts remain exact strings, including genuine configured zero; they are never presented as observed balances. Existing /api/projects/prepare supplies these offline project anchors. Existing /api/mvp/status supplies real ANLTEST data in its separate historical panel only. No generic project-status endpoint or authenticated project finality capability is invented.

Corrected the proposed handoff's draft key to the actual schema1 key, its unknown-state JSON examples to null, and its suggested expiry/no-broadcast inference. Expiry plus unchanged seqno does not release the original lock. A saved draft proves neither deployment nor absence of deployment. Returning to another/new draft also clears the old simulation card.

## Verification

Focused integration/frontend/preparation/receipt/Sandbox/readonly API:48 pass/0 fail. Compiled Pages/private Worker persistence and execution-version checks:7 pass/0 fail. Existing root V5 receipt verifier:6 pass/0 fail. The48 includes three source-compiled routed Sandbox scenarios and four project-adapter cases with explicitly synthetic signature evidence; neither is a live blockchain result. Initial narrower integration run39/0 also passed. No test expectations were relaxed.

Build Pages and private Worker dry-run passed. No private Worker publication is required: its financial/proof/RPC/recovery/ledger sources and execution identity are unchanged. Before release, Cloudflare reported latest Testnet Pages33d48538 source3191ff6 and private Worker5742c0cf-d9f2-4b42-9e65-1bc19b3eac7c. Release must recheck those checkpoints and refreshed Git heads before publishing Pages; a newer deployment must not be overwritten without comparison.

## Remaining integration limits

No textual unresolved conflict. Per-creator live status/receipt acquisition is still unavailable from the fixed-account readonly API; UI must show UNKNOWN. External review, V2 Curve/migrator handoff, authentic LP final custody/withdrawal evidence and real Testnet lifecycle transactions remain separate financial prerequisites. Original Curve #2 lock, nonce recovery restrictions, production services, donation0.02TON, namespace history and Mainnet gates stay unchanged. No signing, broadcast, funds movement or smart-contract deployment is part of this integration.
