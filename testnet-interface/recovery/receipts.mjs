import {Cell,loadTransaction,loadAccount} from '@ton/core';
import {accountRead} from '../testnet-rpc.mjs';
import {pinned,operationPolicy,RECOVERY} from './policy.mjs';
import {acquireRawAccounts} from './evidence.mjs';
import {verifyAccountInclusion} from './account-proof.mjs';
import receiptVerifier from '../../lib/v5-self-transfer-receipt.js';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const hash=c=>c.hash().toString('hex'),b64=c=>c.toBoc().toString('base64');
function decoded(rows,encoding,operator){
 need(Array.isArray(rows)&&rows.length>0&&rows.length<=16,'Bounded source history required');
 return rows.map(row=>{const value=encoding==='base64'?row.data:row.raw;need(typeof value==='string'&&value.length<262144,'Raw transaction BOC required');const roots=Cell.fromBoc(Buffer.from(value,encoding));need(roots.length===1&&!roots[0].isExotic,'One ordinary transaction root required');const cell=roots[0],slice=cell.beginParse(),tx=loadTransaction(slice);slice.endParse();need(tx.address===BigInt('0x'+operator.slice(2)),'Foreign source transaction');return{cell,tx,hash:hash(cell)};});
}
// Raw hashes/previous references, not indexer success flags, authenticate history
// relative to the account inclusion proof. A bounded missing row is not absence
// from the entire chain. No caller-selected transaction/hash/provider is used.
export function matchHistory(primary,secondary,evidence,operator=pinned.operator){
 const a=decoded(primary,'base64',operator),b=decoded(secondary,'hex',operator),other=new Map(b.map(x=>[x.hash,x]));need(other.size===b.length,'Duplicate independent transaction');
 need(a[0].hash===evidence.lastTransactionHash&&a[0].tx.lt.toString()===evidence.lastTransactionLt,'History does not start at proven account tip');
 const seen=new Set();for(let i=0;i<a.length;i++){
  const row=a[i],independent=other.get(row.hash);need(!seen.has(row.hash)&&independent&&row.cell.hash().equals(independent.cell.hash()),'Raw source history disagreement');seen.add(row.hash);
  if(i){const prev=a[i-1].tx;need(prev.prevTransactionHash===BigInt('0x'+row.hash)&&prev.prevTransactionLt===row.tx.lt,'Broken source transaction hash/LT chain');}
 }
 return a;
}
async function read(env,name,referenceSeqno){
 const started=Date.now(),r=await accountRead(env,name,true,undefined,referenceSeqno),j=await r.json();
 if(!r.ok){const e=Error('Receipt provider unavailable');e.status=r.status===429?429:503;e.provider=j.provider;e.retryAfterSeconds=j.retryAfterSeconds||1;throw e;}
 need(j.network==='-3'&&j.dataStatus==='FRESH_PROVIDER_OBSERVATION'&&Number.isSafeInteger(j.observedAt)&&Math.abs(Date.now()-j.observedAt)<15000&&Date.now()-started<15000,'Fresh receipt acquisition required');
 need(name.endsWith('Secondary')?j.provider==='TONAPI_TESTNET':j.provider==='TONCENTER_TESTNET'&&j.authentication==='TESTNET_KEY_ACCEPTED','Fixed protected receipt provider required');return j;
}
export async function acquireReceiptCheckpoint(env,snapshot){
 const evidence=await acquireRawAccounts(env,snapshot),reference=await read(env,'recoveryMasterBlock',evidence.referenceBlock.seqno);
 const inclusion=verifyAccountInclusion(evidence.providerEvidence,reference.referenceBlock,pinned.operator);
 need(inclusion.accountHash===evidence.accountHash&&inclusion.lastTransactionHash===evidence.lastTransactionHash&&inclusion.lastTransactionLt===evidence.lastTransactionLt,'Proof differs from corroborated Account');
 const primary=await read(env,'operatorHistory'),secondary=await read(env,'operatorHistorySecondary'),rows=matchHistory(primary.history,secondary.history,evidence);
 // Pure account/history evidence remains useful without any authorized recovery.
 return{evidence:{...evidence,accountProof:inclusion,independentReference:reference.referenceBlock,proofInclusionVerified:true},rows};
}
function rowForVerifier(row,beforeBalance,afterBalance,dataBefore,dataAfter){
 const t=row.tx,d=t.description,m=t.inMessage;
 need(d.type==='generic'&&d.computePhase.type==='vm'&&d.actionPhase,'Complete ordinary wallet transaction required');
 return{raw:b64(row.cell),hash:row.cell.hash().toString('base64'),account:'0:'+t.address.toString(16).padStart(64,'0'),lt:t.lt.toString(),now:t.now,emulated:false,finality:'finalized',orig_status:t.oldStatus,end_status:t.endStatus,total_fees:t.totalFees.coins.toString(),description:{aborted:d.aborted,compute_ph:{success:d.computePhase.success,exit_code:d.computePhase.exitCode},action:{success:d.actionPhase.success,result_code:d.actionPhase.resultCode}},
  in_msg:{source:m.info.type==='external-in'?null:m.info.src.toRawString(),init_state:m.init?{}:null,message_content:{body:b64(m.body),hash:m.body.hash().toString('base64')}},out_msgs:Array.from(t.outMessages.values(),()=>({})),account_state_before:{balance:beforeBalance,data_hash:dataBefore},account_state_after:{balance:afterBalance,data_hash:dataAfter}};
}
function accountData(boc){const c=Cell.fromBase64(boc),s=c.beginParse();need(s.loadBit(),'Account absent');const a=loadAccount(s);s.endParse();need(a.storage.state.type==='active','Wallet not active');return{cell:c,account:a,data:a.storage.state.state.data,code:a.storage.state.state.code,balance:a.storage.balance.coins};}
// No network flags are inferred from wallet callbacks. This function is called
// only with server-acquired checkpoint rows and an exact existing reservation.
export async function buildAndVerifyReceipt(checkpoint,before,prepared,reservation,attempt,context=pinned){
 prepared=structuredClone(prepared);reservation=structuredClone(reservation);attempt=structuredClone(attempt);before=structuredClone(before);
 need(reservation?.operation===RECOVERY&&reservation.originalFingerprint===context.oldFingerprint&&reservation.fingerprint===prepared?.approval?.fingerprint&&prepared.approval.kind===RECOVERY&&prepared.approval.expectedSeqno===context.oldSeqno&&attempt?.fingerprint===reservation.fingerprint&&attempt.validUntil===prepared.transaction.validUntil,'Exact reserved recovery lineage required');
 const exactPolicy=operationPolicy(context,RECOVERY,context.oldSeqno);need(await exactPolicy.fingerprint(prepared.transaction)===reservation.fingerprint,'Prepared recovery fingerprint mismatch');
 const {evidence,rows}=checkpoint,expected=prepared.approval.sourceIdentity;
 need(evidence.proofInclusionVerified===true&&evidence.accountProof?.accountHash===evidence.accountHash&&evidence.accountProof.lastTransactionHash===evidence.lastTransactionHash,'Account inclusion required');
 need(before&&before.accountHash===hash(Cell.fromBase64(before.accountBoc))&&before.lastTransactionHash===expected.lastTransactionHash&&before.codeHash===expected.codeHash&&before.dataHash===expected.dataHash&&before.balanceNano===expected.balanceNano,'Captured before Account required');
 // The receipt must end at the proven current tip. Additional/concurrent sends
 // require explicit investigation, never an automatic receipt substitution.
 need(rows.length>=2,'Self-receipt missing');const child=rows[0],root=rows[1];
 const a=accountData(before.accountBoc),z=accountData(evidence.accountBoc),policy={...operationPolicy(context,RECOVERY,context.oldSeqno).intent,seqno:context.oldSeqno,walletCodeHash:context.walletCodeHash,expectedSource:expected};
 need(hash(a.cell)===root.tx.stateUpdate.oldHash.toString('hex')&&hash(z.cell)===child.tx.stateUpdate.newHash.toString('hex'),'Full account states not bound to receipt');
 const r=rowForVerifier(root,a.balance.toString(),'0',a.data.hash().toString('base64'),z.data.hash().toString('base64')),c=rowForVerifier(child,'0',z.balance.toString(),z.data.hash().toString('base64'),z.data.hash().toString('base64'));
 const proof=evidence.accountProof,after={provider:'TONCENTER_TESTNET',network:'-3',state:'active',address:context.operator,code:b64(z.code),data:b64(z.data),balanceNano:z.balance.toString(),lastTransactionHash:child.hash,lastTransactionLt:child.tx.lt.toString(),block:{seqno:proof.masterchainSeqno,rootHash:proof.masterchainRootHash,fileHash:proof.masterchainFileHash,chainTime:proof.chainTime},finality:'finalized',emulated:false};
 // "finalized" is only the legacy verifier's field vocabulary. The externally
 // returned scope explicitly retains the two-provider reference trust boundary.
 const bundle={validUntil:attempt.validUntil,beforeAccountBoc:before.accountBoc,afterAccountBoc:evidence.accountBoc,trace:{is_incomplete:false,trace_info:{trace_state:'complete',pending_messages:0},transactions:{[r.hash]:r,[c.hash]:c}},after,independent:{...after,provider:'TONAPI_TESTNET'}};
 const verified=receiptVerifier.verifySelfTransferReceipt(bundle,policy);
 return{bundle,summary:{...verified,scope:'SERVER_ACQUIRED_RECEIPT_AND_ACCOUNT_INCLUSION_PROVIDER_FINALITY_ONLY',originalFingerprint:context.oldFingerprint,recoveryFingerprint:reservation.fingerprint,providerAcquisitionVerified:true,proofInclusionVerified:true,validatorFinalityVerified:false,independentFinalityVerified:false,independentReviewComplete:false,operationCompleted:false,financialSigningEnabled:false}};
}
