'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Address,Cell,loadStateInit,contractAddress}=require('./tests/settlement-runtime/node_modules/@ton/core');
const {buildPlan}=require('./scripts/prepare-financial-testnet-plan');
test('offline Testnet deployment messages contain complete self-consistent StateInit and remain blocked',()=>{
 const p=buildPlan();assert.equal(p.network,'-3');assert.equal(p.broadcastEnabled,false);assert.equal(p.status,'BLOCKED_NOT_APPROVED');
 for(const s of p.steps){assert(Address.parseFriendly(s.message.address).isTestOnly);assert(s.requiresSeparateApproval);
  if(s.message.stateInit){const init=loadStateInit(Cell.fromBase64(s.message.stateInit).beginParse());assert(contractAddress(0,init).equals(Address.parse(s.message.address)));const role=s.name.slice(7);assert.equal(init.code.hash().toString('hex'),p.codeHashes[role]);}
 }
});
test('budget includes mandatory charge and sell reserve while migration/future quotes cannot be silently authorized',()=>{
 const p=buildPlan(),b=p.proposedSmokeBudget;
 assert.equal(BigInt(b.preparedMessageAttachmentsNano)+BigInt(b.sellAttachmentReserveNano)+BigInt(b.creationBaseNano)+BigInt(b.mandatoryDonationNano)+BigInt(b.feesAndContingencyReserveNano),BigInt(b.maximumTestnetNano));
 assert.equal(p.creationCharge.recipient,null);assert.equal(p.sell.message,null);assert.equal(p.mainnet.spentNano,'0');assert.equal(p.mainnet.authorizedTransactionPlan,false);
 assert.equal(p.migration.status,'BLOCKED');assert(BigInt(p.migration.requiredPrincipalNano)>BigInt(p.mainnet.maximumAuthorizedCeilingNano));
 assert(p.migration.templates.every(x=>x.notPartOfSmokeBudget&&x.status==='BLOCKED_FINANCIAL_VERIFICATION'));assert(BigInt(p.buyEstimate.minimumTokens)>0n);
});
