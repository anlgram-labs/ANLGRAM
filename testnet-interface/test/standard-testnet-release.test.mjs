import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@ton/core';
import {createDraft} from '../wizard/model.mjs';
import {makeLocalReceipt} from './recovery-local-fixture.mjs';
import {pinned} from '../recovery/policy.mjs';
import {hash} from '../projects/project-registration.mjs';
import {prepareStandardTestnetRelease, standardDeploymentIdentity, verifyStandardDeploymentFields} from '../projects/standard-testnet-release.mjs';

test('Standard Jetton release candidate deploys and mints in Sandbox with distinct V5 requests', async () => {
  const f = await makeLocalReceipt();
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata, {name: 'Sandbox standard', symbol: 'SBX', creator: f.w.address.toRawString()});
  const key = f.key.publicKey.toString('hex');
  const manifest = await prepareStandardTestnetRelease(draft, key);
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
  const minted = await send(manifest.mint, 3);
  assert.ok(minted.transactions.length >= 3);
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), BigInt(manifest.expectedMintUnits));
  const wallet = (await f.chain.runGetMethod(target, 'get_wallet_address', [{type:'slice',
    cell: f.core.beginCell().storeAddress(f.core.Address.parse(manifest.operator.address)).endCell()}])).stackReader.readAddress();
  const data = (await f.chain.runGetMethod(wallet, 'get_wallet_data')).stackReader;
  assert.equal(data.readBigNumber(), BigInt(manifest.expectedMintUnits));
  assert.equal(data.readAddress().toRawString(), manifest.operator.address);
  assert.equal(data.readAddress().toRawString(), manifest.minter.raw);
  assert.equal(hash(data.readCell()), manifest.walletCodeHash);

  // Deliberately starve the child wallet delivery in Sandbox. This variant
  // cannot be produced by the reviewed manifest.
  const original = core.Cell.fromBase64(manifest.mint.message.payload).beginParse();
  const op = original.loadUint(32), query = original.loadUintBig(64), recipient = original.loadAddress();
  original.loadCoins();
  const underfunded = core.beginCell().storeUint(op, 32).storeUint(query, 64)
    .storeAddress(recipient).storeCoins(1n).storeRef(original.loadRef()).endCell();
  const failed = await send({...manifest.mint, message: {...manifest.mint.message,
    payload: underfunded.toBoc().toString('base64')}}, 4);
  assert.ok(failed.transactions.some(tx => tx.inMessage?.info.dest?.equals(wallet) && tx.description.aborted));
  assert.equal((await f.chain.runGetMethod(wallet, 'get_wallet_data')).stackReader.readBigNumber(), BigInt(manifest.expectedMintUnits));
  assert.equal((await f.chain.runGetMethod(target, 'get_jetton_data')).stackReader.readBigNumber(), 2n * BigInt(manifest.expectedMintUnits));

});
