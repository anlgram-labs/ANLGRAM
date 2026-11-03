import {test} from 'node:test';import assert from 'node:assert/strict';import {WalletContractV5R1} from '@ton/ton';import {Address,Cell,loadStateInit,contractAddress} from '@ton/core';
import {versionedDeploymentPolicy,verifyVersionedDeploymentFields} from '../projects/deployment-receipt.mjs';
const publicKey='71'.repeat(32),w=WalletContractV5R1.create({publicKey:Buffer.from(publicKey,'hex'),walletId:{networkGlobalId:-3}}),signer={network:'-3',operator:w.address.toRawString(),publicKey,seqno:1,walletId:2147483645};
const configuration={creator:signer.operator,projectId:'versioned-receipt-test-only',metadata:{name:'Versioned local',symbol:'V2L'},operationId:77n};
test('existing V5 adapter binds all new V2 candidate roles to their exact source-compiled StateInit and never enables execution',()=>{
 const ids=new Set();for(const role of ['minter','curve','guard','migration','vault']){const p=versionedDeploymentPolicy(configuration,role,'100000000',signer),init=loadStateInit(Cell.fromBase64(p.policy.message.stateInit).beginParse());assert.equal(contractAddress(0,init).toRawString(),Address.parse(p.policy.message.address).toRawString());assert.equal(init.code.hash().toString('hex'),p.policy.targetCodeHash);assert.equal(init.data.hash().toString('hex'),p.policy.targetDataHash);assert.match(p.operationId,new RegExp('^V2_DEPLOY:'+role+':'));ids.add(p.operationId);}assert.equal(ids.size,5);
 assert.throws(()=>verifyVersionedDeploymentFields(configuration,'curve','100000000',signer,{},1800000000));
});
test('V2 adapter rejects unsupported signer/network, implicit or floating attachments and arbitrary operation roles',()=>{
 for(const amount of [undefined,100000000,'0','1e8'])assert.throws(()=>versionedDeploymentPolicy(configuration,'curve',amount,signer));assert.throws(()=>versionedDeploymentPolicy(configuration,'buy','100000000',signer));assert.throws(()=>versionedDeploymentPolicy(configuration,'curve','100000000',{...signer,network:'-239'}));assert.throws(()=>versionedDeploymentPolicy(configuration,'curve','100000000',{...signer,operator:'0:'+'00'.repeat(32)}));
});
