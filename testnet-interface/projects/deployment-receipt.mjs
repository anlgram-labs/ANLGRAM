// Server/offline adapter. No public receipt submission route or ledger mutation.
import {WalletContractV5R1} from '@ton/ton';
import * as core from '@ton/core';
const {Address}=core;
import versioned from '../../minter-contract/scripts/migration-package-v2.js';
import verifier from '../../lib/v5-deployment-receipt.js';
import {prepareProject} from './prepare.mjs';

function supportedSigner(signer){
 if(signer?.network!=='-3'||signer.walletId!==2147483645||!Number.isSafeInteger(signer.seqno)||signer.seqno<1||signer.seqno>=0xffffffff||!/^[a-f0-9]{64}$/.test(signer.publicKey||''))throw Error('Supported Testnet V5R1 signer observation required');
}
function signerPolicy(creator,message,target,signer){
 supportedSigner(signer);
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(signer.publicKey,'hex'),walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
 if(signer.operator!==creator||wallet.address.toRawString()!==creator)throw Error('Signer does not derive the exact project creator');
 return{network:'-3',operator:creator,publicKey:signer.publicKey,walletId:signer.walletId,seqno:signer.seqno,walletCodeHash:wallet.init.code.hash().toString('hex'),message:structuredClone(message),targetCodeHash:target.codeHash,targetDataHash:target.dataHash};
}
export async function deploymentReceiptPolicy(draft,operationId,signer){
 supportedSigner(signer);
 const project=await prepareProject(draft),operation=project.operations.find(o=>o.id===operationId);
 if(!operation?.message.stateInit)throw Error('Exact project deployment operation required; minting and transfers use different verifiers');
 const target=Object.values(project.accounts).find(a=>a.raw===Address.parse(operation.message.address).toRawString());
 if(!target||target.stateInit!==operation.message.stateInit)throw Error('Project StateInit mismatch');
 return signerPolicy(project.creator,operation.message,target,signer);
}

export async function verifyProjectDeploymentFields(draft,operationId,signer,trace,validUntil){
 const policy=await deploymentReceiptPolicy(draft,operationId,signer);
 return matchedFields(operationId,policy,trace,validUntil);
}
function matchedFields(operationId,policy,trace,validUntil){
 const {withinPolicy,...fields}=verifier.verifyDeployment(trace,policy,validUntil);
 // The underlying verifier checks fields/signature, not provider provenance or
 // validator finality. It cannot release a lock or mark an operation completed.
 return{...fields,status:'MATCHED_FIELDS_REQUIRES_AUTHENTIC_PROVENANCE',operationId,
  legacyVerifier120mObservation:withinPolicy,policyAuthorized:false,
  independentFinalityVerified:false,operationCompleted:false,custodyVerified:false,
  financialSigningEnabled:false,newOperationAllowed:false};
}
// Internal versioned preparation: no new verifier, HTTP route or ledger.
export function versionedDeploymentPolicy(configuration,role,attachmentNano,signer){
 supportedSigner(signer);if(!['minter','curve','guard','migration','vault'].includes(role))throw Error('Unknown versioned deployment role');
 if(typeof attachmentNano!=='string'||!/^\d+$/.test(attachmentNano)||BigInt(attachmentNano)<=0n||BigInt(attachmentNano)>=(1n<<120n))throw Error('Explicit exact attachment required; fresh fees are separate');
 const c=versioned.build(core,configuration),init=role==='vault'?c.vault.init:c.states[role],state=core.beginCell().store(core.storeStateInit(init)).endCell();
 const message={address:core.contractAddress(0,init).toString({testOnly:true}),amount:attachmentNano,payload:core.beginCell().endCell().toBoc().toString('base64'),stateInit:state.toBoc().toString('base64')};
 return{operationId:'V2_DEPLOY:'+role+':'+state.hash().toString('hex'),policy:signerPolicy(c.operator.toRawString(),message,{codeHash:init.code.hash().toString('hex'),dataHash:init.data.hash().toString('hex')},signer)};
}
export function verifyVersionedDeploymentFields(configuration,role,attachmentNano,signer,trace,validUntil){
 const p=versionedDeploymentPolicy(configuration,role,attachmentNano,signer);return matchedFields(p.operationId,p.policy,trace,validUntil);
}
