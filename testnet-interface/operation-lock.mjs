import {accountRead} from './testnet-rpc.mjs';
import {intent,validateIntent,fingerprint} from './minter-policy.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export class FinancialOperation {
 constructor(state){this.state=state;}
 async fetch(request){
  const body=await request.json();
  if(body.action==='claim'){
   validateIntent(body.transaction);const hash=await fingerprint(body.transaction);
   if(hash!==body.fingerprint) return json({error:'Fingerprint mismatch'},409);
   const ticket=token(),record={fingerprint:hash,ticket,status:'LOCKED_PENDING_RECONCILIATION',claimedAt:Date.now(),validUntil:body.transaction.validUntil,approvalReference:body.approvalReference,events:[]};
   const accepted=await this.state.storage.transaction(async tx=>{if(await tx.get('operation'))return false;await tx.put('operation',record);return true;});
   return accepted?json({claimed:true,fingerprint:hash,ticket}):json({error:'Lifetime operation already claimed; no automatic retry'},409);
  }
  let record=await this.state.storage.get('operation');
  if(!record)return json({status:'NOT_CLAIMED'});
  if(body.action==='record'){
   if(body.ticket!==record.ticket||!['WALLET_RESPONSE_UNVERIFIED','UNKNOWN_OR_REJECTED'].includes(body.event))return json({error:'Invalid receipt'},403);
   await this.state.storage.transaction(async tx=>{const r=await tx.get('operation');if(!r.events.includes(body.event)){r.events.push(body.event);await tx.put('operation',r);}});
   record=await this.state.storage.get('operation');
  }
  // Never return ticket, erase state, mark chain success from wallet response,
  // expire the lock, or automatically permit a new operation.
  return json({status:record.status,fingerprint:record.fingerprint,claimedAt:record.claimedAt,validUntil:record.validUntil,approvalReference:record.approvalReference,events:record.events});
 }
}
async function liveAccount(env,which){
 const r=await accountRead(env,which,true);if(!r.ok)throw Error('Fresh state unavailable');const j=await r.json();if(j.dataStatus!=='FRESH_PROVIDER_OBSERVATION'||j.network!=='-3'||Date.now()-j.observedAt>10000)throw Error('Fresh state unavailable');return j.account;
}
export async function operationRoute(path,input,env,proofState){
 const stub=env.OPERATIONS.get(env.OPERATIONS.idFromName(intent.operation+':'+intent.operator));
 if(path.endsWith('/claim')){
  // No approval is configured/deployed by this task. Future authorization must
  // name this exact fingerprint/deadline and a fresh reviewed fee/state snapshot.
  let approval;try{approval=JSON.parse(env.MINTER_TX1_APPROVAL||'null');}catch{return json({error:'Invalid authorization'},403);}
  if(!approval)return json({error:'Financial authorization absent; signing disabled'},403);
  const now=Math.floor(Date.now()/1000);validateIntent(input.transaction,now);const hash=await fingerprint(input.transaction);
  if(proofState?.verified!==true||proofState.network!==intent.network||proofState.address!==intent.operator||!Number.isSafeInteger(proofState.expiresAt)||proofState.expiresAt<=now)return json({error:'Fresh operator proof required'},403);
  if(approval.fingerprint!==hash||input.fingerprint!==hash||approval.validUntil!==input.transaction.validUntil||approval.candidateSha256!==intent.candidateSha256||approval.completeEmulation!==true||!/^[a-f0-9]{64}$/.test(approval.traceSha256||'')||!Number.isSafeInteger(approval.observedAt)||approval.observedAt>now||now-approval.observedAt>60||!/^\d+$/.test(approval.modeledDebitNano||'')||BigInt(approval.modeledDebitNano)>BigInt(intent.maximumPolicyNano)||BigInt(approval.modeledDebitNano)<=100000000n)return json({error:'Unapproved or stale transaction/fee snapshot'},403);
  const source=await liveAccount(env,'operator'),destination=await liveAccount(env,'minter');
  if(source.state!=='uninitialized'||source.code||source.balance!==approval.sourceBalanceNano||source.last_transaction_id?.hash!==approval.sourceLastTransactionHash||BigInt(source.balance)<BigInt(approval.modeledDebitNano)||destination.state!=='uninitialized'||destination.code||destination.balance!=='0')return json({error:'Chain state changed; new review required'},409);
  const approvalReference={candidateSha256:approval.candidateSha256,sourceBalanceNano:approval.sourceBalanceNano,sourceLastTransactionHash:approval.sourceLastTransactionHash,modeledDebitNano:approval.modeledDebitNano,observedAt:approval.observedAt,traceSha256:approval.traceSha256};
  return stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({...input,action:'claim',approvalReference})}));
 }
 if(path.endsWith('/record'))return stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({...input,action:'record'})}));
 if(proofState?.verified!==true)return json({error:'Owner proof required'},403);
 const lock=await(await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:'{"action":"status"}'}))).json();
 if(path.endsWith('/reconcile')){
  // Authentic fixed-network reads aid recovery. Account snapshots alone are not
  // proof of this operation's inclusion. No automatic unlock follows these reads.
  const source=await liveAccount(env,'operator'),destination=await liveAccount(env,'minter');
  return json({lock,source:{state:source.state,balanceNano:source.balance,lastTransaction:source.last_transaction_id},destination:{state:destination.state,balanceNano:destination.balance,lastTransaction:destination.last_transaction_id},network:intent.network,status:'AUTHENTIC_PROVIDER_OBSERVATIONS_REQUIRE_EXACT_TRACE_REVIEW',newOperationAllowed:false});
 }
 return json({...lock,newOperationAllowed:false});
}
