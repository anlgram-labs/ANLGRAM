import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
import assert from 'node:assert/strict';
import * as core from '@ton/core';
import worker from '../worker.mjs';
import {standardV2Code} from '../projects/artifacts.mjs';
import {walletAddress} from '../projects/distribution.mjs';
import {createDraft} from '../wizard/model.mjs';
import {makeLocalReceipt} from './recovery-local-fixture.mjs';
import {pinned} from '../recovery/policy.mjs';
import {StandardDeploymentLock} from '../projects/standard-deployment-lock.mjs';
import {standardRegistrationIntent, standardStatus} from '../projects/standard-registration.mjs';
import {hash} from '../projects/project-registration.mjs';
import {prepareStandardTestnetRelease, standardDeploymentIdentity, verifyStandardDeploymentFields} from '../projects/standard-testnet-release.mjs';

test('Standard Jetton release candidate deploys and mints in Sandbox with distinct V5 requests', async () => {
  const f = await makeLocalReceipt();
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata, {name: 'Sandbox standard', symbol: 'SBX', creator: f.w.address.toRawString()});
  const key = f.key.publicKey.toString('hex');
  const manifest = await prepareStandardTestnetRelease(draft, key);
  const origin='https://testnet.anlgram.com';
  const response=await worker.fetch(new Request(origin+'/api/projects/prepare',{
    method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(draft)
  }),{APP_ORIGIN:origin});
  assert.equal(response.status,200);
  const prepared=await response.json();
  assert.equal(prepared.configurationFingerprint,manifest.configurationFingerprint);
  assert.deepEqual(prepared.accounts.minter,manifest.minter);
  assert.deepEqual(prepared.operations.map(op=>op.message),[manifest.deployment.message,manifest.mint.message]);
  assert.deepEqual(prepared.operations.map(op=>op.id),[manifest.deployment.id,manifest.mint.id]);
  assert.equal(core.Address.parse(prepared.distribution.creatorWallet).toRawString(),
    walletAddress(manifest.operator.address,manifest.minter.raw,standardV2Code('wallet')).toRawString());
  assert.equal(prepared.financialSigningEnabled,false);
  assert.equal(prepared.broadcastEnabled,false);
  assert.equal(manifest.operator.walletId, 2147483645);
  assert.equal(manifest.financialSigningEnabled, false);
  assert.equal(manifest.creationCharge.mandatoryDonationNano, '20000000');
  const quote = {seqno: 2, validUntil: f.chain.now + 45, referenceRootHash: 'ab'.repeat(32), modeledSenderFeeNano: '10000000', ownerPolicyCeilingNano: '70000000'};
  const identity = await standardDeploymentIdentity(manifest, quote, f.chain.now);
  assert.equal(identity.modeledDebitNano, '60000000');
  assert.equal(identity.maximumTotalDebitNano, null);
  assert.notEqual((await standardDeploymentIdentity(manifest, {...quote, seqno: 3}, f.chain.now)).fingerprint, identity.fingerprint);
  await assert.rejects(standardDeploymentIdentity(manifest, {...quote, ownerPolicyCeilingNano: '59999999'}, f.chain.now), /ceiling/);
  await assert.rejects(standardDeploymentIdentity(manifest, quote, quote.validUntil));
  await assert.rejects(standardDeploymentIdentity(manifest, {...quote, validUntil: f.chain.now + 61}, f.chain.now));
  await assert.rejects(prepareStandardTestnetRelease({...draft, network: '-239'}, key));
  await assert.rejects(prepareStandardTestnetRelease({...draft, metadata: {...draft.metadata, creator: pinned.operator}}, key));
  await assert.rejects(prepareStandardTestnetRelease(draft, '34'.repeat(32)));

  const send = (operation, seqno, timeout) => {
    const {message} = operation, {isBounceable, address} = core.Address.parseFriendly(message.address);
    const init = message.stateInit && core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse());
    return f.send(seqno, [core.internal({to: address, bounce: isBounceable, value: BigInt(message.amount),
      body: core.Cell.fromBase64(message.payload), init})], timeout);
  };
  const deployed = await send(manifest.deployment, quote.seqno, quote.validUntil);
  const rows = deployed.transactions.map(tx => {
    const cell = core.Cell.fromBase64(f.core.beginCell().store(f.core.storeTransaction(tx)).endCell().toBoc().toString('base64'));
    return {tx: core.loadTransaction(cell.beginParse()), hash: hash(cell)};
  });
  const by = address => rows.filter(({tx}) => tx.inMessage?.info.dest?.toRawString() === address);
  const owner = by(manifest.operator.address), minter = by(manifest.minter.raw);
  const ownerState = {code: f.beforeCode, data: f.beforeData};
  const verified = verifyStandardDeploymentFields(manifest, identity, ownerState, owner, minter);
  assert.equal(verified.address, manifest.minter.raw);
  assert.equal(verified.validatorFinalityVerified, false);
  assert.throws(() => verifyStandardDeploymentFields(manifest, {...identity, seqno: 3}, ownerState, owner, minter), /reviewed operation/);
  assert.throws(() => verifyStandardDeploymentFields(manifest, identity, ownerState, [], minter), /Authenticated V5/);
  assert.throws(() => verifyStandardDeploymentFields({...manifest, deployment: {...manifest.deployment,
    message: {...manifest.deployment.message, amount: '50000001'}}}, identity, ownerState, owner, minter), /reviewed operation/);

  const target = f.core.Address.parse(manifest.minter.raw);
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), 0n);
  const replay = await send(manifest.deployment, quote.seqno, quote.validUntil).catch(error => error);
  if (replay instanceof Error) assert.match(replay.message, /exit code.*33|seqno/i);
  else assert.ok(!replay.transactions.some(tx => tx.inMessage?.info.dest?.equals(target)));
  const underfunded = await send({...manifest.mint, message:{...manifest.mint.message,amount:'149999999'}}, 3);
  assert.ok(underfunded.transactions.some(tx => tx.inMessage?.info.dest?.equals(target) && tx.description.aborted));
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), 0n);
  const expectedWallet = (await f.chain.runGetMethod(target, 'get_wallet_address', [{type:'slice',
    cell: f.core.beginCell().storeAddress(f.core.Address.parse(manifest.operator.address)).endCell()}])).stackReader.readAddress();
  const snapshot = f.chain.snapshot();
  const {createShardAccount} = require('../../tests/settlement-runtime/node_modules/@ton/sandbox');
  const empty = f.core.Cell.EMPTY;
  const frozen = createShardAccount({address:expectedWallet,code:empty,data:empty,balance:10000000n});
  frozen.account.storage.state = {type:'frozen', stateHash:1n};
  await f.chain.setShardAccount(expectedWallet, frozen);
  const bounced = await send(manifest.mint, 4);
  assert.ok(bounced.transactions.some(tx => tx.inMessage?.info.dest?.equals(target) && tx.inMessage.info.bounced));
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), 0n);
  const failedState = (await f.chain.runGetMethod(target, 'get_initial_mint')).stackReader;
  assert.equal(failedState.readBigNumber(), BigInt(manifest.mintQueryId));
  assert.equal(failedState.readBigNumber(), 3n);
  const sameQuery = await send(manifest.mint, 5);
  assert.ok(sameQuery.transactions.some(tx => tx.inMessage?.info.dest?.equals(target) && tx.description.aborted));
  await f.chain.loadFrom(snapshot);
  const action = manifest.mint.message;
  const signingBody = await f.w.createTransfer({seqno:4,secretKey:f.key.secretKey,timeout:quote.validUntil,sendMode:3,
    messages:[core.internal({to:action.address,value:BigInt(action.amount),body:core.Cell.fromBase64(action.payload)})]});
  const message = core.beginCell().store(core.storeMessage(core.external({to:f.w.address,body:signingBody}))).endCell();
  const minted = {transactions:[]};
  for await (const tx of await f.chain.sendMessageIter(f.core.Cell.fromBase64(message.toBoc().toString('base64')))) {
    minted.transactions.push(tx);
    if (tx.inMessage?.info.dest?.equals(expectedWallet) && minted.transactions.length === 3) {
      assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), 0n);
      const receipt = (await f.chain.runGetMethod(expectedWallet,'get_initial_credit')).stackReader;
      assert.equal(receipt.readBigNumber(),BigInt(manifest.mintQueryId));
      assert.equal(receipt.readBigNumber(),BigInt(manifest.expectedMintUnits));
      assert.equal(receipt.readBigNumber(),0n);
    }
  }
  assert.ok(minted.transactions.length >= 3);
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), BigInt(manifest.expectedMintUnits));
  const wallet = (await f.chain.runGetMethod(target, 'get_wallet_address', [{type:'slice',
    cell: f.core.beginCell().storeAddress(f.core.Address.parse(manifest.operator.address)).endCell()}])).stackReader.readAddress();
  const data = (await f.chain.runGetMethod(wallet, 'get_wallet_data')).stackReader;
  assert.equal(data.readBigNumber(), BigInt(manifest.expectedMintUnits));
  assert.equal(data.readAddress().toRawString(), manifest.operator.address);
  assert.equal(data.readAddress().toRawString(), manifest.minter.raw);
  assert.equal(hash(data.readCell()), manifest.walletCodeHash);

  const initial = await f.chain.runGetMethod(target, 'get_initial_mint');
  assert.equal(initial.stackReader.readBigNumber(), BigInt(manifest.mintQueryId));
  assert.equal(initial.stackReader.readBigNumber(), 2n);
  const repeated = await send(manifest.mint, 5);
  assert.ok(repeated.transactions.some(tx => tx.inMessage?.info.dest?.equals(target) && tx.description.aborted));
  const stranger = await f.chain.treasury('unauthorized-standard-minter');
  const forged = await stranger.send({to:target,value:150000000n,body:f.core.Cell.fromBase64(manifest.mint.message.payload)});
  assert.ok(forged.transactions.some(tx => tx.inMessage?.info.dest?.equals(target) && tx.description.aborted));
  const query = f.core.beginCell().storeUint(0x53544d04,32).storeUint(BigInt(manifest.mintQueryId),64).endCell();
  await stranger.send({to:wallet,value:40000000n,body:query});
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), BigInt(manifest.expectedMintUnits));
});


test('Standard lock rejects stale or cross-network preflight and survives recreation with one reservation', async () => {
  const f = await makeLocalReceipt();
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata,{name:'Private operation',symbol:'OPS',creator:f.w.address.toRawString()});
  const publicKey = f.key.publicKey.toString('hex');
  const manifest = await prepareStandardTestnetRelease(draft,publicKey);
  const now = Math.floor(Date.now()/1000);
  const quote = {seqno:2, validUntil:now+55,referenceRootHash:'ab'.repeat(32),
    modeledSenderFeeNano:'10000000',ownerPolicyCeilingNano:'70000000'};
  const identity = await standardDeploymentIdentity(manifest,quote,now);
  const file = join(mkdtempSync(join(tmpdir(),'standard-lock-')),'lock.sqlite');
  const openStorage = () => {
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY, value TEXT)');
    let tail = Promise.resolve();
    return {
      close:()=>db.close(),
      get:async key=>JSON.parse(db.prepare('SELECT value FROM storage WHERE key = ?').get(key)?.value ?? 'null'),
      put:async (key,value)=>db.prepare('INSERT OR REPLACE INTO storage VALUES (?, ?)').run(key,JSON.stringify(value)),
      transaction(fn) {
        const run = tail.then(async()=> {
          db.exec('BEGIN');
          try { const value=await fn(this); db.exec('COMMIT'); return value; }
          catch (error) { db.exec('ROLLBACK'); throw error; }
        });
        tail = run.catch(()=>{});
        return run;
      }
    };
  };
  const storage = openStorage();
  let override = {}, acquired = null;
  const supervisor = {
    verifyOwnerApproval:async approval=>approval===identity.fingerprint,
    verifyCurrentStateAndEmulation:async()=>({network:'-3',operator:manifest.operator.address,walletId:manifest.operator.walletId,
      walletCodeHash:manifest.operator.codeHash,seqno:quote.seqno,destination:manifest.minter.raw,destinationState:'uninitialized',
      referenceRootHash:quote.referenceRootHash,fingerprint:identity.fingerprint,modeledSenderFeeNano:quote.modeledSenderFeeNano,
      emulationSucceeded:true,noConcurrentOperation:true,proofExpiresAt:now+60,observedAt:now,balanceNano:'100000000',...override}),
    acquireAuthenticatedDeploymentReceipt:async()=>acquired
  };
  const lock = new StandardDeploymentLock(storage,supervisor);
  const reserve = (approval=identity.fingerprint) => lock.reserve(draft,publicKey,quote,approval);
  await assert.rejects(reserve('wrong'), /owner authorization/);
  for (const invalid of [{network:'-239'},{observedAt:now-16},{seqno:3},{emulationSucceeded:false}]) {
    override = invalid;
    await assert.rejects(reserve(),/preflight/);
  }
  override = {};
  const both = await Promise.allSettled([reserve(),reserve()]);
  assert.equal(both.filter(result=>result.status==='fulfilled').length,1);
  storage.close();
  const restartedStorage = openStorage();
  const restart = new StandardDeploymentLock(restartedStorage,supervisor);
  assert.equal((await restart.reconcile()).state,'LOCKED_PENDING_RECONCILIATION');
  acquired = {fingerprint:'wrong',deployment:{address:manifest.minter.raw}};
  assert.equal((await restart.reconcile()).state,'LOCKED_PENDING_RECONCILIATION');
  await assert.rejects(restart.reserve(draft,publicKey,quote,identity.fingerprint),/permanently reserved/);

  restartedStorage.close();
  const registration = await standardRegistrationIntent({projectType:'STANDARD_V2',draft,publicKey,quote});
  const status = standardStatus(registration,null);
  assert.equal(status.status,null);
  assert.equal(status.projectType,'STANDARD_V2');
  assert.equal(status.migrator,undefined);
  assert.equal(status.financialSigningEnabled,false);
  await assert.rejects(standardRegistrationIntent({projectType:'STANDARD_V2',draft,publicKey,quote,receipt:{verified:true}}));
});
