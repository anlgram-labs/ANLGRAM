import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Address,Cell} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {createDraft} from '../wizard/model.mjs';
import {buildReleasePlan,buildReviewedOwnerInventory} from '../testnet-release-plan.mjs';
import {assertReviewedStandardPreflightInput,reviewedStandardPublicKey} from '../projects/reviewed-standard-operator.mjs';
import {submitStandardDeployment} from '../projects/standard-transport-fixture.mjs';
import {createStandardOwnerDraft} from '../projects/standard-owner-draft.mjs';

function publicInput(){
 const project=(mode,byte,id)=>{
  const publicKey=Buffer.alloc(32,byte).toString('hex');
  const operator=WalletContractV5R1.create({publicKey:Buffer.from(publicKey,'hex'),walletId:{networkGlobalId:-3}});
  const draft=createDraft(id);
  draft.mode=mode;
  Object.assign(draft.metadata,{name:'Local release fixture',symbol:'LOCAL',creator:operator.address.toString({testOnly:true})});
  draft.distribution.skip=true;
  draft.lp.beneficiary=draft.metadata.creator;
  return {draft,publicKey};
 };
 const standard=project('standard',17,'a577a9e3-d751-490a-bce4-91034060574d');
 standard.draft.walletProfile='STANDARD_V2_SETTLEMENT';
 standard.draft.allocations.team='40';
 Object.assign(standard.draft.vesting,{enabled:true,beneficiary:standard.draft.metadata.creator,amount:'40',startDate:'2027-01-01'});
 return {network:'-3',standard,launchpad:{...project('launchpad',18,'a577a9e3-d751-490a-bce4-91034060575d'),migrationAuthorityPublicKey:'13'.repeat(32)}};
}

test('Testnet inventory reproduces both deployment branches and all included StateInit identities',async()=>{
 const input=publicInput(),a=await buildReleasePlan(input);
 assert.deepEqual(a,await buildReleasePlan(input));
 assert.equal(a.standard.deployment.attachmentNano,'50000000');
 assert.equal(a.standard.deployment.stateInitHash,a.standard.minter.stateInitHash);
 assert.equal(a.launchpad.operator.walletId,2147483645);
 assert.equal(a.launchpad.genesisOperations.length,8);
 assert.equal(new Set(a.launchpad.genesisOperations.map(operation=>operation.operationId)).size,8);
 for(const operation of a.launchpad.genesisOperations){
  assert.equal(operation.executionEligible,false);
  assert.equal(operation.source,a.launchpad.operator.address);
  assert.equal(Cell.fromBase64(operation.message.payload).hash().toString('hex'),operation.payloadHash);
  if(operation.stateInitHash)assert.equal(Address.parse(operation.message.address).hash.toString('hex'),operation.stateInitHash);
 }
 assert.equal(a.launchpad.genesisOperations[5].payloadHash,a.launchpad.initializeCurveBodyHash);
 assert.equal(a.launchpad.creationCharge.donationNano,'20000000');
 assert.equal(a.launchpad.graduationPrincipalNano,'300000000000');
 assert.equal(a.launchpad.stonfi.scope,'CAPTURED_TESTNET_IDENTITIES_NO_LIVE_PROOF');
 for(const item of [a.standard.minter,a.standard.vesting,...Object.values(a.launchpad.accounts),a.launchpad.stonfi.pool,a.launchpad.stonfi.lpWallet]){
  const address=Address.parseFriendly(item.address);
  assert(address.isTestOnly);
  assert.equal(address.address.hash.toString('hex'),Cell.fromBase64(item.stateInit).hash().toString('hex'));
 }
 assert.equal(a.gates.migration,'GATE_414_CLOSED');
 assert.equal(a.identityStatus,'EXAMPLE_KEYS_DETECTED');
 assert.equal(a.executionEligible,false);
 assert.equal(a.financialSigningEnabled,false);
 assert.equal(a.broadcastingEnabled,false);
 assert.equal(a.liveChainVerified,false);
 assert.equal(a.feeQuote,null);
});

test('reviewed owner inventory pins PR 34 genesis and leaves unassigned projects empty',async()=>{
 const owner=await buildReviewedOwnerInventory();
 assert.equal(owner.operator.address,'0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn');
 assert.equal(owner.operator.stateInitHash,owner.operator.raw.slice(2));
 assert.equal(owner.standard,null);
 assert.equal(owner.launchpad,null);
 assert.equal(owner.executionEligible,false);
 assert.equal(owner.liveChainVerified,false);
 const draft=publicInput().standard.draft;
 draft.metadata.creator=owner.operator.address;
 const planned=await buildReviewedOwnerInventory(draft);
 assert.equal(planned.standard.minter.stateInitHash,Address.parse(planned.standard.minter.address).hash.toString('hex'));
 assert.equal(planned.standard.minter.stateInit,undefined);
 assertReviewedStandardPreflightInput({draft,publicKey:reviewedStandardPublicKey});
 assert.throws(()=>assertReviewedStandardPreflightInput({draft,publicKey:'11'.repeat(32)}),/UNREVIEWED/);
 draft.metadata.creator=Address.parse(owner.operator.address).toString();
 assert.throws(()=>assertReviewedStandardPreflightInput({draft,publicKey:reviewedStandardPublicKey}),/UNREVIEWED/);
});

test('example draft and exported manifest cannot reach reviewed preflight or financial transport',async()=>{
 const sample=publicInput();
 const manifest=await buildReleasePlan(sample);
 assert.throws(()=>assertReviewedStandardPreflightInput(sample.standard),/UNREVIEWED/);
 assert.throws(()=>assertReviewedStandardPreflightInput(manifest),/UNREVIEWED/);
 await assert.rejects(buildReviewedOwnerInventory(sample.standard.draft),/UNREVIEWED/);
 await assert.rejects(submitStandardDeployment(null,manifest.standard.operator.address,null),/hard-disabled/);
});

test('owner settings generate a canonical settlement draft and exact mint and wallet identities',async()=>{
 const owner=await buildReviewedOwnerInventory();
 const choices={name:'Local test only',symbol:'LOCAL',supply:'100.50',decimals:'2',
  distribution:{csv:'address,amount\n'+owner.operator.address+',1.25',batchSize:'1'},
  vesting:{beneficiary:owner.operator.address,amount:'2.50',startDate:'2027-01-01',cliffMonths:'1',durationMonths:'6'}};
 const draft=createStandardOwnerDraft(choices);
 assert.equal(draft.walletProfile,'STANDARD_V2_SETTLEMENT');
 assert.equal(draft.allocations.community,'1.25');
 assert.equal(draft.allocations.team,'2.50');
 const manifest=await buildReviewedOwnerInventory(draft);
 assert.deepEqual(manifest,await buildReviewedOwnerInventory(draft));
 assert.equal(manifest.standard.expectedMintUnits,'10050');
 assert.equal(manifest.standard.distributionRecipientCount,1);
 assert.equal(manifest.standard.creatorJettonWallet.codeHash,manifest.standard.walletCodeHash);
 assert.equal(manifest.standard.creatorJettonWallet.stateInitHash,Address.parse(manifest.standard.creatorJettonWallet.address).hash.toString('hex'));
 assert.notEqual(manifest.standard.mintMessage.operationId,manifest.standard.deploymentMessage.operationId);
 assert.equal(manifest.standard.chainState,'UNVERIFIED');
 assert.equal(manifest.feeQuote,null);
 assert.equal(manifest.executionEligible,false);
 assert.throws(()=>createStandardOwnerDraft({...choices,creator:publicInput().standard.draft.metadata.creator}),/INVALID/);
 assert.throws(()=>createStandardOwnerDraft({...choices,supply:'',decimals:'2'}),/INVALID/);
 assert.throws(()=>createStandardOwnerDraft({...choices,supply:'1'}),/INVALID/);
 await assert.rejects(buildReviewedOwnerInventory({...draft,liveChainVerified:true}),/Non-canonical/);
});

test('release input rejects Mainnet, cross-wallet, unsupported workchain and execution overrides',async()=>{
 const mutations=[
  x=>x.network='-239',
  x=>x.launchpad.draft.network='-239',
  x=>delete x.standard.draft.walletProfile,
  x=>x.launchpad.publicKey=x.standard.publicKey,
  x=>{x.launchpad.publicKey=x.standard.publicKey;x.launchpad.draft.metadata.creator=x.standard.draft.metadata.creator;},
  x=>x.standard.draft.metadata.creator=Address.parse(x.standard.draft.metadata.creator).toString(),
  x=>x.launchpad.draft.lp.beneficiary='-1:'+'a'.repeat(64),
  x=>{x.standard.draft.distribution.skip=false;x.standard.draft.distribution.text=Address.parse(x.standard.draft.metadata.creator).toString()+',1';},
  x=>x.broadcastingEnabled=true,
 ];
 for(const mutate of mutations){const input=publicInput();mutate(input);await assert.rejects(buildReleasePlan(input));}
});
