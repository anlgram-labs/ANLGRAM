'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const core=require('../minter-contract/node_modules/@ton/core');
const p=require('../docs/launchpad/testnet-v5-candidate.json'),intent=require('../testnet-interface/curve-two-intent.json'),registry=require('../docs/launchpad/active-testnet-candidate.json');
const {verifyDeployment}=require('./v5-deployment-receipt');
function verify(trace,approval,observations,secondary){
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),registry.candidateSha256);assert.equal(intent.candidateSha256,registry.candidateSha256);assert.deepEqual(intent.message,p.smokePlan.steps[1].message);
 assert.equal(approval.candidateSha256,intent.candidateSha256);assert.equal(approval.expectedSeqno,1);assert.equal(approval.walletId,intent.walletId);
 const canonical={operation:intent.operation,candidate:intent.candidateSha256,expectedSeqno:1,walletId:intent.walletId,network:'-3',from:intent.operator,validUntil:approval.validUntil,messages:[intent.message]};assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),approval.fingerprint);
 const policy={network:'-3',operator:intent.operator,publicKey:intent.publicKey,walletId:intent.walletId,seqno:1,walletCodeHash:p.wallet.codeHash,message:intent.message,targetCodeHash:p.dependentAccounts.curve.codeHash,targetDataHash:p.dependentAccounts.curve.dataHash};
 const receipt=verifyDeployment(trace,policy,approval.validUntil),hex=x=>Buffer.from(x,'base64').toString('hex');
 for(const [role,address]of [['operator',p.wallet.raw],['curve',p.dependentAccounts.curve.raw]]){
  const tx=Object.values(trace.transactions).find(t=>core.Address.parse(t.account).toRawString()===address),o=observations[role];assert.equal(o.network,'-3');assert.equal(o.state,'active');assert.equal(o.lastTransactionHash,hex(tx.hash));assert.equal(o.balanceNano,tx.account_state_after.balance);assert.equal(o.codeHash,hex(tx.account_state_after.code_hash));assert.equal(o.dataHash,hex(tx.account_state_after.data_hash));
 }
 const minter=observations.minter;assert.equal(minter.network,'-3');assert.equal(minter.state,'active');assert.equal(minter.codeHash,p.dependentAccounts.minter.codeHash);assert.equal(minter.dataHash,p.dependentAccounts.minter.dataHash);assert.equal(minter.supplyUnits,'0');assert.equal(minter.admin,p.wallet.raw);
 assert.equal(secondary.network,'-3');assert.equal(secondary.status,200);assert.equal(secondary.body.status,'active');assert.equal(core.Cell.fromHex(secondary.body.code).hash().toString('hex'),policy.targetCodeHash);assert.equal(core.Cell.fromHex(secondary.body.data).hash().toString('hex'),policy.targetDataHash);assert.equal(secondary.body.last_transaction_hash,receipt.destinationTransactionHash);
 const b=secondary.body.balance;assert(typeof b==='string'||Number.isSafeInteger(b));assert.equal(BigInt(b).toString(),receipt.destinationBalanceNano);
 return{...receipt,operation:intent.operation,fingerprint:approval.fingerprint,codeHash:policy.targetCodeHash,dataHash:policy.targetDataHash,curveState:0,minterUnchanged:true,requiresIndependentProviderAcquisition:true,subsequentTransactionsAuthorized:false};
}
module.exports={verify};
