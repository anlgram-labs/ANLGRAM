import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Address,Cell} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {createDraft} from '../wizard/model.mjs';
import {buildReleasePlan} from '../testnet-release-plan.mjs';

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
 assert.equal(a.launchpad.stonfi.scope,'CAPTURED_TESTNET_IDENTITIES_NO_LIVE_PROOF');
 for(const item of [a.standard.minter,a.standard.vesting,...Object.values(a.launchpad.accounts),a.launchpad.stonfi.pool,a.launchpad.stonfi.lpWallet]){
  const address=Address.parseFriendly(item.address);
  assert(address.isTestOnly);
  assert.equal(address.address.hash.toString('hex'),Cell.fromBase64(item.stateInit).hash().toString('hex'));
 }
 assert.equal(a.gates.migration,'GATE_414_CLOSED');
 assert.equal(a.financialSigningEnabled,false);
 assert.equal(a.broadcastingEnabled,false);
 assert.equal(a.liveChainVerified,false);
 assert.equal(a.feeQuote,null);
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
