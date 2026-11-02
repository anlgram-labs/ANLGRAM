// Server/offline adapter. No public receipt submission route or ledger mutation.
import {WalletContractV5R1} from '@ton/ton';
import {Address} from '@ton/core';
import verifier from '../../lib/v5-deployment-receipt.js';
import {prepareProject} from './prepare.mjs';

export async function deploymentReceiptPolicy(draft,operationId,signer){
 if(signer?.network!=='-3'||signer.walletId!==2147483645||!Number.isSafeInteger(signer.seqno)||signer.seqno<1||signer.seqno>=0xffffffff||!/^[a-f0-9]{64}$/.test(signer.publicKey||''))throw Error('Supported Testnet V5R1 signer observation required');
 const project=await prepareProject(draft),operation=project.operations.find(o=>o.id===operationId);
 if(!operation?.message.stateInit)throw Error('Exact project deployment operation required; minting and transfers use different verifiers');
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(signer.publicKey,'hex'),walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
 if(signer.operator!==project.creator||wallet.address.toRawString()!==project.creator)throw Error('Signer does not derive the exact project creator');
 const target=Object.values(project.accounts).find(a=>a.raw===Address.parse(operation.message.address).toRawString());
 if(!target||target.stateInit!==operation.message.stateInit)throw Error('Project StateInit mismatch');
 return{network:'-3',operator:project.creator,publicKey:signer.publicKey,walletId:signer.walletId,seqno:signer.seqno,walletCodeHash:wallet.init.code.hash().toString('hex'),message:structuredClone(operation.message),targetCodeHash:target.codeHash,targetDataHash:target.dataHash};
}

export async function verifyProjectDeploymentFields(draft,operationId,signer,trace,validUntil){
 const policy=await deploymentReceiptPolicy(draft,operationId,signer);
 const {withinPolicy,...fields}=verifier.verifyDeployment(trace,policy,validUntil);
 // The underlying verifier checks fields/signature, not provider provenance or
 // validator finality. It cannot release a lock or mark an operation completed.
 return{...fields,status:'MATCHED_FIELDS_REQUIRES_AUTHENTIC_PROVENANCE',operationId,
  legacyVerifier120mObservation:withinPolicy,policyAuthorized:false,
  independentFinalityVerified:false,operationCompleted:false,custodyVerified:false,
  financialSigningEnabled:false,newOperationAllowed:false};
}
