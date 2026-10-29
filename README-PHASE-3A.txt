ANLGRAM Phase 3A — Preflight Bundle

Files in this bundle are intended to be copied into the matching paths in the current ANLGRAM repository branch `feature/launchpad-engine`.

IMPORTANT:
- This is a read-only preflight/planning tool, not a deployer.
- It deliberately contains no wallet signing or transaction broadcast functionality.
- It reports BLOCKED while the currently audited Curve <-> Migration Router and Migration Router <-> LP Locker initial-address cycles remain unresolved.
- It does not replace or modify existing production pages, contracts, wallet integration, Cloudflare settings, or GitHub workflows.
- Its offline tests passed 9/9 in the isolated bundle environment. The script has not been run against the user's local `E:\ANLGRAM` checkout in this session.

Place the files as:
- minter-contract/deploy-launchpad-testnet.js
- minter-contract/test-deploy-launchpad-testnet.js
- docs/launchpad/phase-3a-testnet-deployment-plan.md

Run the offline tests:
  node --test minter-contract/test-deploy-launchpad-testnet.js

Safe preflight examples:
  node minter-contract/deploy-launchpad-testnet.js --show-plan
  node minter-contract/deploy-launchpad-testnet.js --verify-config
  node minter-contract/deploy-launchpad-testnet.js --dry-run
  node minter-contract/deploy-launchpad-testnet.js --verify-dex-readonly

`--verify-dex-readonly` makes GET-only TonAPI requests using the explicit testnet URL. It never broadcasts transactions. Read-only account-interface results are partial evidence, not proof of full DEX protocol compatibility.

No deployment, wallet signature, funding request, remote push, or production publication has occurred.
