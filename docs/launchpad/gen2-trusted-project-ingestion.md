# Generation 2 trusted project ingestion

This change extends the existing read-only project status route. The private SQLite Durable Object owns registration and the latest accepted account checkpoint. It cannot sign or send blockchain messages. The public Worker entry point always returns 404. Pages can resolve a project through its internal namespace binding. The existing POST status route forwards only a recomputed configuration key and uses the existing unknown response for absent registrations.

## Registration and version pin

An internal service with the Durable Object namespace can POST a canonical launchpad draft, the exact execution version, and the migration authority **public** key to the named object's internal register path. The object name and path key are the SHA-256 of the existing canonical draft. There is no public registration route. Do not forward this method from Pages.

The server rebuilds the pinned dispatch package. The minter genesis metadata commits to the canonical configuration fingerprint and execution version. The operation ID is derived from the first 60 bits of that fingerprint, with zero mapped to one, and bound to the full project identity. This defines the registration intent format for future projects. A project deployed with unrelated metadata or an older execution version does not register under this format. Published contracts and their bytecode remain untouched.

Registration requires successful deployments of the exact minter, Curve and Migrator from the same Testnet V5R1 creator. The intake verifies raw source and destination transactions, the identical internal message, exact StateInit and execution code, the V5 wallet ID and signature, and their inclusion through contiguous account histories at one corroborated reference. The intake is limited to individual V5 deployment messages in the recent 16-transaction window for each account. Register promptly following a future independently authorized deployment. Archive pagination, batched deployments and V5 extension-authorized transactions are outside this intake.

Records are written once in a storage transaction. Exact retries are idempotent, changed authority keys conflict, and records are never rewritten to fit a newer execution version. The returned provenance records both provider roles, reference hashes and the raw transaction hashes and LTs for each verified deployment. Inclusion is relative to the corroborated provider block. Validator quorum and canonical finality remain unverified.

## Checkpoints and LP evidence

TonAPI supplies raw Account and shard proofs. TON Center independently supplies the corresponding masterchain reference. Historical transactions come from both providers and must link back to the verified account tip. The latest accepted raw Migrator proof survives restarts, is verified again when read, and cannot be replaced by a stale, cross-project or conflicting checkpoint. Per-project refreshes are coalesced and cooled down. Provider failure can return explicitly historical status or UNKNOWN. It cannot advance a checkpoint.

After dispatch, the service searches the authenticated histories of the derived Pool and LP wallet for an exact message edge and root query ID. A bounded lookback requests historical raw Account cells. Only cells matching the actual old and new transaction state hashes can reach the existing LP issuance verifier. When the provider cannot return those exact states, including where multiple transactions fall between available block snapshots, LP mint remains NOT_VERIFIED. Verified contract custody remains historical and current wallet balance remains null. Gate 414 still prevents a terminal settlement claim.

## Future deployment prerequisites

- Review and deploy the dedicated private Worker defined by the registry Wrangler configuration with SQLite class `ProjectRegistry`.
- Bind `PROJECT_REGISTRY` on the future Pages deployment to that external Durable Object class in script `anlgram-testnet-project-registry`. Add a namespace binding to a separately reviewed private intake service if registration automation is needed. Keep the public Pages binding read-only at the HTTP router.
- Provide `TONCENTER_TESTNET_API_KEY` and `TONAPI_TESTNET_API_KEY` to the **private registry Worker** as server secrets. Neither browser access nor Pages secret propagation is assumed.
- Use the same reviewed execution version in the registration plan and Worker. Check a genuine project's receipts and provider archival coverage before making status available publicly. No Cloudflare or chain changes are part of this change.

An unregistered launchpad continues to return schema 2 with scope `PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE` and reason `NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS`. A registered project without evidence can return `settlement: "UNKNOWN"`, `mint: "NOT_VERIFIED"`, `currentWalletUnits: null` and `acquisition.status: "PROVIDER_OR_PROOF_UNAVAILABLE_HISTORICAL_ONLY"`. Antigravity can keep consuming the same status fields and use the optional acquisition status to label a historical view.
