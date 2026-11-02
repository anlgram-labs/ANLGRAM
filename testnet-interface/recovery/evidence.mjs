import {Cell,loadAccount,loadShardAccount} from '@ton/core';
import {pinned,hash,parseWallet,digest,validateSnapshot} from './policy.mjs';
import {accountRead} from '../testnet-rpc.mjs';

const requireThat=(ok,message)=>{if(!ok)throw Error(message);};
const one=(boc,encoding)=>{
 requireThat(typeof boc==='string'&&boc.length>0&&boc.length<131072,'Bounded raw account required');
 const roots=Cell.fromBoc(Buffer.from(boc,encoding));
 requireThat(roots.length===1&&!roots[0].isExotic,'One ordinary account root required');return roots[0];
};
// These are provider-acquired full Account cells, NOT verified Merkle inclusion
// or validator finality. Preserve proof bytes for review; do not trust their mere
// presence. In particular no boolean supplied by a browser establishes finality.
export function matchRawAccounts(primary,secondary,snapshot,now=Date.now()){
 validateSnapshot(pinned,snapshot,undefined,now);
 for(const o of [primary,secondary])requireThat(o?.network==='-3'&&o.dataStatus==='FRESH_PROVIDER_OBSERVATION'&&Number.isSafeInteger(o.observedAt)&&Math.abs(now-o.observedAt)<15000,'Fresh raw Testnet acquisition required');
 requireThat(primary.provider==='TONCENTER_TESTNET'&&primary.authentication==='TESTNET_KEY_ACCEPTED'&&secondary.provider==='TONAPI_TESTNET','Independent fixed providers required');
 const shardCell=one(primary.rawAccount?.bytes,'base64'),shardSlice=shardCell.beginParse(),shard=loadShardAccount(shardSlice);shardSlice.endParse();
 requireThat(shardCell.refs.length===1,'Unexpected ShardAccount references');
 const accountCell=shardCell.refs[0],other=one(secondary.rawAccount?.state,'hex');
 requireThat(!accountCell.isExotic&&accountCell.hash().equals(other.hash()),'Full Account hashes disagree; never combine different states');
 const slice=accountCell.beginParse();requireThat(slice.loadBit(),'Operator account absent');const account=loadAccount(slice);slice.endParse();
 const state=account.storage.state,source=snapshot.source;
 requireThat(account.addr.toRawString()===pinned.operator&&state.type==='active'&&state.state.code?.hash().toString('hex')===hash(source.code)&&state.state.data?.hash().toString('hex')===hash(source.data)&&account.storage.balance.coins.toString()===source.balanceNano,'Raw Account does not match observed operator');
 requireThat(shard.lastTransactionHash.toString(16).padStart(64,'0')===source.lastTransactionHash&&shard.lastTransactionLt>0n&&account.storage.lastTransLt>=shard.lastTransactionLt,'Raw account transaction lineage mismatch');
 const block=secondary.rawAccount.id;
 requireThat(block?.workchain===-1&&/^[a-f0-9]{16}$/i.test(block.shard||'')&&Number.isSafeInteger(block.seqno)&&block.seqno>0&&/^[a-f0-9]{64}$/i.test(block.root_hash||'')&&/^[a-f0-9]{64}$/i.test(block.file_hash||''),'Masterchain reference required');
 const seqno=parseWallet(pinned,source);
 return{schema:1,network:'-3',operator:pinned.operator,originalFingerprint:pinned.oldFingerprint,
  accountHash:accountCell.hash().toString('hex'),accountBoc:accountCell.toBoc().toString('base64'),
  shardAccountBoc:shardCell.toBoc().toString('base64'),lastTransactionHash:source.lastTransactionHash,lastTransactionLt:shard.lastTransactionLt.toString(),seqno,balanceNano:source.balanceNano,codeHash:hash(source.code),dataHash:hash(source.data),
  referenceBlock:structuredClone(block),providerEvidence:structuredClone(secondary.rawAccount),
  observedAt:Math.min(snapshot.observedAt,primary.observedAt,secondary.observedAt),
  providers:['TONCENTER_TESTNET','TONAPI_TESTNET'],scope:'CORROBORATED_RAW_ACCOUNT_NOT_FINALIZED_RECEIPT',
  proofInclusionVerified:false,validatorFinalityVerified:false,independentReviewComplete:false,
  operationCompleted:false,financialSigningEnabled:false};
}

export async function acquireRawAccounts(env,snapshot){
 const all=[];
 for(const name of ['operatorRaw','operatorRawSecondary']){
  const started=Date.now(),r=await accountRead(env,name,true),body=await r.json();
  if(!r.ok){const e=Error('Raw Testnet evidence unavailable');e.status=r.status===429?429:503;e.provider=body.provider;e.retryAfterSeconds=body.retryAfterSeconds||1;throw e;}
  requireThat(Math.abs(Date.now()-body.observedAt)<15000&&Date.now()-started<15000,'Raw account acquisition expired');all.push({...body,providerObservedAt:body.observedAt,observedAt:started});
 }
 return matchRawAccounts(all[0],all[1],snapshot);
}

export class RecoveryEvidenceJournal {
 constructor(storage){this.storage=storage;}
 async append(evidence){
  evidence=structuredClone(evidence);
  requireThat(evidence.originalFingerprint===pinned.oldFingerprint&&evidence.network==='-3'&&evidence.operator===pinned.operator&&evidence.scope==='CORROBORATED_RAW_ACCOUNT_NOT_FINALIZED_RECEIPT'&&typeof evidence.proofInclusionVerified==='boolean'&&evidence.validatorFinalityVerified===false&&evidence.operationCompleted===false&&evidence.financialSigningEnabled===false,'Raw capture cannot grant reconciliation authority');
  if(evidence.proofInclusionVerified)requireThat(evidence.accountProof?.proofInclusionVerified===true&&evidence.accountProof?.accountHash===evidence.accountHash&&evidence.accountProof?.lastTransactionHash===evidence.lastTransactionHash,'Verified inclusion binding required');
  // A new masterchain block is not a new wallet state. Keep the first complete
  // proof for each state/strength; historical timestamps are never refreshed.
  const id=await digest({protocol:'RECOVERY_ACCOUNT_STATE_V2',ancestor:pinned.oldFingerprint,accountHash:evidence.accountHash,lastTransactionHash:evidence.lastTransactionHash,accountInclusion:evidence.proofInclusionVerified});
  return this.storage.transaction(async tx=>{
   const index=await tx.get('evidence:index')||[],prior=await tx.get('evidence:'+id);
   if(prior)return this.summary(prior,id,index.length);
   // Lazily adopt old block-keyed records, including a saturated V1 journal.
   // Never delete, overwrite, or evict the incident/before-state evidence.
   const adopted=await tx.get('evidence:state:'+id);
   if(adopted)return this.summary(await tx.get('evidence:'+adopted),adopted,index.length);
   for(const oldId of index){const old=await tx.get('evidence:'+oldId);if(old?.accountHash===evidence.accountHash&&old.lastTransactionHash===evidence.lastTransactionHash&&old.proofInclusionVerified===evidence.proofInclusionVerified){await tx.put('evidence:state:'+id,oldId);return this.summary(old,oldId,index.length);}}
   const states=await tx.get('evidence:statesV2')||[];
   requireThat(states.length<256,'Distinct evidence state capacity reached; preserve existing records');
   const saved=structuredClone(evidence);await tx.put('evidence:'+id,saved);await tx.put('evidence:index',[...index,id]);
   await tx.put('evidence:statesV2',[...states,id]);
   // Arrival order is not finality order; latest means last captured, not highest block.
   await tx.put('evidence:last',id);return this.summary(saved,id,index.length+1);
  });
 }
 summary(e,id,count){return{id,count,observedAt:e.observedAt,accountHash:e.accountHash,seqno:e.seqno,balanceNano:e.balanceNano,lastTransactionHash:e.lastTransactionHash,referenceBlock:e.referenceBlock,scope:e.scope,state:e.seqno===pinned.oldSeqno?'NO_EXECUTION_OBSERVED_RECEIPT_ABSENT':'SOURCE_CHANGED_RECEIPT_REQUIRED',proofInclusionVerified:e.proofInclusionVerified,validatorFinalityVerified:false,operationCompleted:false,financialSigningEnabled:false};}
 async findAccount(accountHash){for(const id of await this.storage.get('evidence:index')||[]){const e=await this.storage.get('evidence:'+id);if(e?.accountHash===accountHash)return e;}return null;}
 async status(){const id=await this.storage.get('evidence:last');if(!id)return null;return this.summary(await this.storage.get('evidence:'+id),id,(await this.storage.get('evidence:index')).length);}
}
