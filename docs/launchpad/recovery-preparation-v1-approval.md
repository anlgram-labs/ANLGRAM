# Next owner decision — recovery preparation V1

**No financial execution is authorized or enabled.** Original Curve #2 remains permanently locked.

- Recovery operation: `ANLTEST_V5_NONCE_INVALIDATION_V1`, Testnet -3, V5 operator and recipient both `0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR`.
- Fixed proposal:0.010000000TON self-transfer, no StateInit, opcode0 comment `ANLGRAM TESTNET nonce invalidation; Curve #2 remains locked`. Exact payload/hash/template: `recovery-preparation-v1-candidates.json`.
- Historical modeled fees0.000638542TON; initial gross debit0.010586674TON; conservative attachment-plus-all-fees check0.010638542TON. Proposed0.02TON gross policy is unapproved, must be freshly estimated and is not a guaranteed maximum.
- Separate successor: `ANLTEST_CURVE_SUCCESSOR_V1`, original Curve destination/StateInit and0.100000000TON unchanged. No predicted nonce; no runtime signing eligibility before genuine independent invalidation evidence and reconciliation review.
- Verification:21 new focused cases plus6 affected existing receipt cases passed; no financial signatures, requests, broadcasts or spending. Separate internal AI review completed; qualified independent external activation review remains outstanding.

**Recommended decision now:** accept the disabled code package for qualified independent review and authorize completion/review of the server-owned evidence-acquisition and reconciliation boundary only. This is not approval to activate, sign, self-transfer, release the old lock or deploy Curve.

**A future financial authorization must separately state:** exact fresh Testnet self-transfer message/value/nonce/fingerprint/expiry, current fees and chosen gross-spend policy, one attempt, manual Tonkeeper confirmation, no retries. After authentic finalized reconciliation, a separate approval would still be required for the versioned Curve successor.

Full focused package: `recovery-preparation-v1-review.md`. No broad roadmap or production merge is proposed.
