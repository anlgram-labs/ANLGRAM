import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import support from '../../tests/settlement-runtime/one-shot-dispatch-support.js';
import {migrationAccountFields, verifyMigrationAccountCheckpoint} from '../projects/migration-account.mjs';
import {generation2Status} from '../projects/migration-status.mjs';
import {rememberMigrationCheckpoint} from '../projects/evidence-brand.mjs';
import {verifyProvenLpEvidence, lpEvidencePolicy, rememberLpEvidence} from '../projects/lp-evidence.mjs';
import {projectStatusResponse} from '../projects/project-registry.mjs';
import {validateProjectStatusResponse, normalizeMigrationStatusView, deriveMigrationLifecycle, lpLockerSummary} from '../wizard/project-status.mjs';
import {createDraft} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';
import worker from '../worker.mjs';

const core = createRequire(new URL('../../tests/settlement-runtime/one-shot-dispatch-support.js', import.meta.url))('@ton/core');

test('TASK 7 — GENERATION 2 END-TO-END INTEGRATION TEST SUITE', async (t) => {
  // Shared Sandbox fixture for Generation 2 dispatch & Locker
  const f = await support.ready({percent: 50, duration: 'days180'});
  await f.fund();
  const identity = Object.freeze({
    project: f.c.addresses.minter.toRawString(),
    migrator: f.c.addresses.migration.toRawString(),
    operationId: '77'
  });
  const configuration = Object.freeze({
    ...f.options,
    beneficiary: f.options.beneficiary.toRawString(),
    unlockedController: f.options.unlockedController.toRawString()
  });

  const getMigrationAccountBoc = async () => {
    const contract = await f.chain.getContract(f.c.addresses.migration);
    const cell = core.beginCell().storeBit(true).store(core.storeAccount(contract.account.account)).endCell();
    return cell.toBoc().toString('base64');
  };

  let seqno = 100;
  const makeCheckpoint = (fields) => rememberMigrationCheckpoint(Object.freeze({
    ...fields,
    proof: Object.freeze({
      masterchainSeqno: ++seqno,
      masterchainRootHash: ('0' + seqno.toString(16)).padStart(64, '0'),
      masterchainFileHash: ('f' + seqno.toString(16)).padStart(64, '0'),
      lastTransactionLt: String(20000000000n + BigInt(seqno)),
      lastTransactionHash: ('a' + seqno.toString(16)).padStart(64, '0'),
      accountHash: fields.accountHash,
      scope: 'SYNTHETIC_TEST_REFERENCE',
      validatorFinalityVerified: false
    })
  }));

  // Execute one-shot dispatch to STON.fi and LP Locker V2 in Sandbox
  await f.execute(await f.authorize());
  const postDispatchFields = migrationAccountFields(configuration, 'migration', await getMigrationAccountBoc(), 2);
  const authenticCheckpoint = makeCheckpoint(postDispatchFields);

  await t.test('1. Registered project with authentic checkpoint', async () => {
    const fingerprint = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const statusRes = projectStatusResponse({...identity, configurationFingerprint: fingerprint}, {checkpoint: authenticCheckpoint});
    assert.equal(statusRes.schema, 2);
    assert.equal(statusRes.generation, 2);
    assert.equal(statusRes.network, '-3');
    assert.equal(statusRes.dispatch, 'DEX_DISPATCHED');
    assert.equal(statusRes.custody, 'LP_CUSTODY_VERIFIED');
    assert.equal(statusRes.lock, 'LP_LOCKED_VERIFIED');
    assert.equal(statusRes.mint, 'NOT_VERIFIED');
    assert.equal(statusRes.settlement, 'SETTLEMENT_PENDING');
    assert.equal(statusRes.currentWalletUnits, null);
    assert.equal(statusRes.unresolvedReturns, 'UNKNOWN');
    assert.equal(statusRes.financialSigningEnabled, false);
    assert.equal(statusRes.migrationAuthorized, false);
    assert.equal(statusRes.withdrawalsEnabled, false);

    // Validate through frontend validator
    const validated = validateProjectStatusResponse(statusRes, fingerprint, 'launchpad');
    assert.equal(validated.generation, 2);

    // Validate frontend lifecycle adapter
    const draft = createDraft();
    draft.mode = 'launchpad';
    const life = deriveMigrationLifecycle(draft, null, statusRes);
    assert.equal(life.confirmedStep, 8);
    assert.match(life.summaryBadge, /Step 8\/9 Verified · Settlement Pending/);
    assert.equal(life.retryAllowed, false);

    // Validate LP Locker summary
    const lpSum = lpLockerSummary(draft, null, statusRes);
    assert.match(lpSum.actualVerifiedLpReceivedDisplay, /Historical on-chain record at LT/);
    assert.equal(lpSum.currentWalletUnits, null);
    assert.equal(lpSum.withdrawalsEnabled, false);
  });

  await t.test('2. Unregistered project configuration', async () => {
    const env = {APP_ORIGIN: 'https://testnet.anlgram.com'};
    const draft = createDraft();
    draft.mode = 'launchpad';
    draft.metadata.name = 'Unregistered Token';
    draft.metadata.symbol = 'UNREG';
    draft.metadata.creator = '0:' + '22'.repeat(32);
    draft.lp.beneficiary = draft.metadata.creator;

    const plan = await prepareProject(draft);
    const res = await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status', {
      method: 'POST',
      headers: {'content-type': 'application/json', origin: 'https://testnet.anlgram.com'},
      body: JSON.stringify({
        ...draft,
        // Client attempt to inject fake project registration and fake checkpoint
        project: identity.project,
        checkpoint: authenticCheckpoint,
        scope: 'REFERENCE_RELATIVE_READ_ONLY'
      })
    }), env);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.schema, 2);
    assert.equal(body.network, '-3');
    assert.equal(body.configurationFingerprint, plan.configurationFingerprint);
    assert.equal(body.scope, 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE');
    assert.equal(body.unavailableReason, 'NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS');
    assert.equal(body.financialSigningEnabled, false);
    assert.equal(body.migrationAuthorized, false);
    assert.equal(body.withdrawalsEnabled, false);
  });

  await t.test('3. Authentic checkpoint with valid StateInit', async () => {
    // Validates that migrationAccountFields properly parses and validates active account
    const rawAccountBoc = await getMigrationAccountBoc();
    const rootCell = core.Cell.fromBase64(rawAccountBoc);
    const accountHash = rootCell.hash().toString('hex');

    const fields = migrationAccountFields(configuration, 'migration', rawAccountBoc, 2);
    assert.ok(fields);
    assert.equal(fields.generation, 2);
    assert.equal(fields.role, 'migration');
    assert.equal(fields.address, identity.migrator);
    assert.equal(fields.activeOperationId, '77');
    assert.equal(fields.accountHash, accountHash);
    assert.equal(fields.lifecycle.dexDispatched, '1');
    assert.ok(fields.lpObservation);
    assert.equal(fields.lpObservation.receivedUnits, String((await f.stage())[1]));
    assert.equal(typeof fields.settlementPending, 'boolean');

    const cp = makeCheckpoint(fields);
    assert.ok(cp);
    assert.equal(cp.address, identity.migrator);
    const projStatus = generation2Status(identity, {checkpoint: cp});
    assert.equal(projStatus.settlement, 'SETTLEMENT_PENDING');
  });

  await t.test('4. Invalid source contract hash', async () => {
    // Tamper with account state code
    const rawAccountBoc = await getMigrationAccountBoc();
    const parsed = core.Cell.fromBase64(rawAccountBoc);
    const s = parsed.beginParse();
    s.loadBit();
    const a = core.loadAccount(s);
    // Tamper code to different cell
    a.storage.state.state.code = core.beginCell().storeUint(0x1234, 16).endCell();
    const tamperedCell = core.beginCell().storeBit(true).store(core.storeAccount(a)).endCell();
    const tamperedBoc = tamperedCell.toBoc().toString('base64');

    assert.throws(
      () => migrationAccountFields(configuration, 'migration', tamperedBoc, 2),
      /Versioned code mismatch/
    );
  });

  await t.test('5. Incorrect project identity', async () => {
    const wrongIdentity = {
      project: '0:' + '33'.repeat(32),
      migrator: identity.migrator,
      operationId: identity.operationId
    };
    assert.throws(
      () => generation2Status(wrongIdentity, {checkpoint: authenticCheckpoint}),
      /Wrong generation 2 project checkpoint/
    );

    const wrongMigrator = {
      project: identity.project,
      migrator: '0:' + '44'.repeat(32),
      operationId: identity.operationId
    };
    assert.throws(
      () => generation2Status(wrongMigrator, {checkpoint: authenticCheckpoint}),
      /Wrong generation 2 project checkpoint/
    );

    const wrongOpId = {
      project: identity.project,
      migrator: identity.migrator,
      operationId: '99999'
    };
    assert.throws(
      () => generation2Status(wrongOpId, {checkpoint: authenticCheckpoint}),
      /Wrong generation 2 project checkpoint/
    );
  });

  await t.test('6. Stale logical time', async () => {
    const newerCheckpoint = authenticCheckpoint;
    const staleCheckpoint = rememberMigrationCheckpoint({
      ...authenticCheckpoint,
      proof: {
        ...authenticCheckpoint.proof,
        masterchainSeqno: newerCheckpoint.proof.masterchainSeqno + 1,
        lastTransactionLt: String(BigInt(newerCheckpoint.proof.lastTransactionLt) - 100n)
      }
    });

    assert.throws(
      () => generation2Status(identity, {checkpoint: staleCheckpoint, previous: newerCheckpoint}),
      /Stale or conflicting project checkpoint/
    );
  });

  await t.test('7. Conflicting masterchain reference', async () => {
    const conflictingCheckpoint = rememberMigrationCheckpoint({
      ...authenticCheckpoint,
      proof: {
        ...authenticCheckpoint.proof,
        masterchainSeqno: authenticCheckpoint.proof.masterchainSeqno,
        masterchainRootHash: 'ff'.repeat(32) // Different root hash at same seqno
      }
    });

    assert.throws(
      () => generation2Status(identity, {checkpoint: conflictingCheckpoint, previous: authenticCheckpoint}),
      /Stale or conflicting project checkpoint/
    );
  });

  await t.test('8. Duplicate receipt rejection', async () => {
    const ref = JSON.stringify([
      authenticCheckpoint.proof.masterchainSeqno,
      authenticCheckpoint.proof.masterchainRootHash,
      authenticCheckpoint.proof.masterchainFileHash
    ]);

    // Synthesize an included LP_ISSUANCE evidence receipt
    const receipt1 = rememberLpEvidence({
      kind: 'LP_ISSUANCE',
      operationId: identity.operationId,
      reference: ref,
      locker: authenticCheckpoint.locker,
      pool: authenticCheckpoint.pool,
      lpWallet: authenticCheckpoint.lpWallet,
      walletTransactionHash: '11'.repeat(32),
      walletTransactionLt: '1000'
    });
    // Duplicate with same walletTransactionHash
    const receipt2 = rememberLpEvidence({
      kind: 'LP_ISSUANCE',
      operationId: identity.operationId,
      reference: ref,
      locker: authenticCheckpoint.locker,
      pool: authenticCheckpoint.pool,
      lpWallet: authenticCheckpoint.lpWallet,
      walletTransactionHash: '11'.repeat(32),
      walletTransactionLt: '1000'
    });

    // Provide evidence array with duplicates
    const res = generation2Status(identity, {
      checkpoint: authenticCheckpoint,
      evidence: [receipt1, receipt2]
    });
    assert.equal(res.evidence.length, 1);
    assert.equal(res.mint, 'LP_MINTED_OBSERVED');
  });

  await t.test('9. Cross-network input rejection', async () => {
    const env = {APP_ORIGIN: 'https://testnet.anlgram.com'};
    const draft = createDraft();
    draft.mode = 'launchpad';
    draft.metadata.creator = '0:' + '55'.repeat(32);
    draft.lp.beneficiary = draft.metadata.creator;

    // Reject Mainnet network
    const mainnetRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status', {
      method: 'POST',
      headers: {'content-type': 'application/json', origin: 'https://testnet.anlgram.com'},
      body: JSON.stringify({...draft, network: '-239'})
    }), env);
    assert.equal(mainnetRes.status, 400);

    // Reject unapproved origin
    const unapprovedOriginRes = await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status', {
      method: 'POST',
      headers: {'content-type': 'application/json', origin: 'https://malicious.origin.com'},
      body: JSON.stringify(draft)
    }), env);
    assert.equal(unapprovedOriginRes.status, 403);
  });

  await t.test('10. LP withdrawal after historical custody', async () => {
    const preWithdrawalStatus = generation2Status(identity, {checkpoint: authenticCheckpoint});
    assert.equal(preWithdrawalStatus.custody, 'LP_CUSTODY_VERIFIED');
    const freeUnits = preWithdrawalStatus.historicalLp.freeUnits;

    // Send LP withdrawal claim to LP Locker V2 in Sandbox
    const claim = core.beginCell()
      .storeUint(0x414c5633, 32)
      .storeUint(1, 64)
      .storeBit(false)
      .storeCoins(BigInt(freeUnits))
      .endCell();
    await f.send(f.c.vault.address, claim, 150000000n, f.other);

    // Acquire new migration account snapshot after claim
    const postClaimFields = migrationAccountFields(configuration, 'migration', await getMigrationAccountBoc(), 2);
    const postClaimCheckpoint = makeCheckpoint(postClaimFields);

    const postWithdrawalStatus = generation2Status(identity, {
      checkpoint: postClaimCheckpoint,
      previous: authenticCheckpoint
    });

    // Historical custody record remains verified at original observation LT
    assert.deepEqual(postWithdrawalStatus.historicalLp, preWithdrawalStatus.historicalLp);
    // Current wallet units remain strictly null
    assert.equal(postWithdrawalStatus.currentWalletUnits, null);
    // Withdrawals remain strictly disabled
    assert.equal(postWithdrawalStatus.withdrawalsEnabled, false);
  });

  await t.test('11. Missing Pool-to-wallet mint evidence', async () => {
    // Status without evidence has mint: 'NOT_VERIFIED'
    const noEvidenceStatus = generation2Status(identity, {checkpoint: authenticCheckpoint});
    assert.equal(noEvidenceStatus.mint, 'NOT_VERIFIED');

    // Attempting to pass mint evidence with mismatched pool throws
    const ref = JSON.stringify([
      authenticCheckpoint.proof.masterchainSeqno,
      authenticCheckpoint.proof.masterchainRootHash,
      authenticCheckpoint.proof.masterchainFileHash
    ]);
    const badEvidence = rememberMigrationCheckpoint({
      kind: 'LP_ISSUANCE',
      operationId: identity.operationId,
      reference: ref,
      locker: authenticCheckpoint.locker,
      pool: '0:' + '99'.repeat(32), // Wrong pool
      lpWallet: authenticCheckpoint.lpWallet,
      walletTransactionHash: '22'.repeat(32),
      walletTransactionLt: '1001'
    });

    assert.throws(
      () => generation2Status(identity, {checkpoint: authenticCheckpoint, evidence: [badEvidence]}),
      /Wrong project mint evidence/
    );
  });

  await t.test('12. Provider failure and unverified finality', async () => {
    const rawAccountBoc = await getMigrationAccountBoc();
    const rawAccountHex = Buffer.from(rawAccountBoc, 'base64').toString('hex');

    // Mismatched reference root hash (simulating provider returning corrupted Merkle proof)
    const badReference = JSON.stringify([99999, '00'.repeat(32), '11'.repeat(32)]);
    const badRawProof = {
      state: rawAccountHex,
      root: '22'.repeat(32),
      fileHash: '11'.repeat(32),
      seqno: 99999,
      accountHash: '33'.repeat(32),
      lastTxLt: '1000',
      lastTxHash: '44'.repeat(32)
    };

    assert.throws(
      () => verifyMigrationAccountCheckpoint(configuration, 'migration', badRawProof, badReference, 2),
      /Independent masterchain reference required|Account inclusion mismatch|Merkle/
    );

    // Gate 414 verification: SETTLEMENT_COMPLETE is never reachable
    assert.notEqual(authenticCheckpoint.settlementPending, undefined);
    const finalStatus = generation2Status(identity, {checkpoint: authenticCheckpoint});
    assert.equal(finalStatus.settlement, 'SETTLEMENT_PENDING');
    assert.notEqual(finalStatus.settlement, 'SETTLEMENT_COMPLETE');
  });
});
