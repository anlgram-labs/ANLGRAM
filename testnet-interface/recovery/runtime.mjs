import {Cell,Address} from '@ton/core';
import {RecoveryPreparationLedger} from './ledger.mjs';
import {pinned,RECOVERY,SUCCESSOR,hash,operationPolicy,validateSnapshot} from './policy.mjs';
import {buildRecoveryEmulation} from './emulation.mjs';
import {accountRead} from '../testnet-rpc.mjs';

const fail=(ok,message)=>{if(!ok){const e=Error(message);e.publicReason=message;throw e;}};
const raw=a=>Address.parse(a).toRawString();
const hex=b=>Buffer.from(b,'base64').toString('hex');
const scoped=(store,prefix)=>({get:k=>store.get(prefix+k),put:(k,v)=>store.put(prefix+k,v),transaction:fn=>store.transaction(tx=>fn(scoped(tx,prefix)))});
const json=(b,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'no-store'}});
function upstream(response,body){
 if(response.ok)return;
 const e=Error('Fresh recovery provider unavailable');e.status=response.status===429?429:503;
 e.reason=e.status===429?'PROVIDER_RATE_LIMITED':'PROVIDER_UNAVAILABLE';
 e.retryAfterSeconds=Math.min(300,Math.max(1,Number(body?.retryAfterSeconds)||Number(response.headers.get('Retry-After'))||1));throw e;
}

// Server-only fixed provider acquisition. An account snapshot corroborates
// identity/current state, NEVER finalized execution or an old request's fate.
export async function observeRecovery(env,originalLock){
 const observations={};
 for(const name of ['minter','curve','operator']){
  const startedAt=Date.now(),r=await accountRead(env,name,true),o=await r.json();upstream(r,o);
  fail(r.ok&&o.network==='-3'&&o.authentication==='TESTNET_KEY_ACCEPTED'&&o.dataStatus==='FRESH_PROVIDER_OBSERVATION'&&Number.isSafeInteger(o.observedAt)&&Math.abs(Date.now()-o.observedAt)<15000&&Date.now()-startedAt<15000,'Fresh protected Testnet reads unavailable');
  // Different Cloudflare machines can disagree by milliseconds. Anchor age to
  // the LOCAL acquisition start (conservative), never to a future remote clock.
  observations[name]={...o,providerObservedAt:o.observedAt,observedAt:startedAt};
 }
 const source=observations.operator.account,last=hex(source.last_transaction_id?.hash||'');
 fail(/^[a-f0-9]{64}$/.test(last),'Source transaction hash unavailable');
 const secondary=await fetch('https://testnet.tonapi.io/v2/blockchain/accounts/'+pinned.operator,{redirect:'manual',signal:AbortSignal.timeout(8000)});
 upstream(secondary);const other=await secondary.json();
 fail(other.address===pinned.operator&&other.status===source.state&&String(other.balance)===String(source.balance)&&other.last_transaction_hash===last&&Cell.fromHex(other.code).hash().toString('hex')===hash(source.code)&&Cell.fromHex(other.data).hash().toString('hex')===hash(source.data),'Independent source observations disagree; reconcile before any preparation');
 return{network:'-3',observedAt:Math.min(...Object.values(observations).map(o=>o.observedAt)),source:{state:source.state,code:source.code,data:source.data,balanceNano:String(source.balance),lastTransactionHash:last},minter:observations.minter.account,curve:{state:observations.curve.account.state,code:observations.curve.account.code,balanceNano:String(observations.curve.account.balance)},originalLock,corroboration:{providers:['TON Center Testnet','TonAPI Testnet'],scope:'CURRENT_ACCOUNT_MATCH_NOT_FINALIZED_TRANSACTION_RECEIPT',finalityVerified:false}};
}

// Fee analysis of the EXACT fixed self-transfer, never a generic emulator.
export function analyzeRecoveryFees(observation,snapshot,request,fingerprint,now=Date.now()){
 const t=observation.trace,tx=Object.values(t?.transactions||{});
 fail(observation.network==='-3'&&observation.authentication==='TESTNET_KEY_ACCEPTED'&&observation.dataStatus==='FRESH_PROVIDER_OBSERVATION'&&Number.isSafeInteger(observation.observedAt)&&now-observation.observedAt>=0&&now-observation.observedAt<15000&&t.is_incomplete===false&&tx.length===2,'Complete fresh authenticated recovery emulation required');
 fail(observation.bodyHash===request.bodyHash,'Emulation request body mismatch');
 const root=tx.find(x=>!x.in_msg?.source),child=tx.find(x=>x!==root);
 fail(root&&child,'Separate source and self-receipt transactions required');
 for(const x of tx)fail(raw(x.account)===pinned.operator&&x.emulated===true&&x.orig_status==='active'&&x.end_status==='active'&&x.description?.aborted===false&&x.description.compute_ph?.success===true&&x.description.compute_ph.exit_code===0&&x.description.action?.success===true&&x.description.action.result_code===0,'Recovery emulation failed');
 fail(root.out_msgs?.length===1&&child.out_msgs?.length===0&&root.description.action.msgs_created===1,'Unexpected recovery messages');
 const m=root.out_msgs[0],policy=operationPolicy(pinned,RECOVERY,pinned.oldSeqno);
 fail(raw(m.destination)===pinned.operator&&raw(child.in_msg.source)===pinned.operator&&m.value===policy.intent.message.amount&&m.hash===child.in_msg.hash&&!m.init_state?.hash&&!root.in_msg.init_state?.hash&&hex(m.message_content.hash)===hash(policy.intent.message.payload)&&hex(root.in_msg.message_content.hash)===request.bodyHash,'Wrong self-transfer action');
 fail(hex(root.account_state_before.code_hash)===pinned.walletCodeHash&&hex(root.account_state_before.data_hash)===hash(snapshot.source.data)&&root.account_state_before.balance===snapshot.source.balanceNano&&hex(root.account_state_after.code_hash)===pinned.walletCodeHash&&hex(child.account_state_after.code_hash)===pinned.walletCodeHash,'Emulation source changed');
 const data=Cell.fromBase64(t.data_cells[root.account_state_after.data_hash]).beginParse();
 fail(data.loadBit()&&data.loadUint(32)===pinned.oldSeqno+1&&data.loadUint(32)===pinned.walletId&&data.loadBuffer(32).toString('hex')===pinned.publicKey&&!data.loadBit(),'Unexpected emulated V5 state');data.endParse();
 fail(root.account_state_after.data_hash===child.account_state_after.data_hash,'Self-receipt altered wallet data');
 const sender=BigInt(root.total_fees)+BigInt(m.fwd_fee),recipient=BigInt(child.total_fees),total=sender+recipient,before=BigInt(snapshot.source.balanceNano);
 fail(sender>0n&&recipient>=0n&&before-BigInt(root.account_state_after.balance)===10000000n+sender&&BigInt(child.account_state_after.balance)-BigInt(root.account_state_after.balance)===10000000n-recipient&&before-BigInt(child.account_state_after.balance)===total,'Recovery fee/balance reconciliation mismatch');
 return{network:'-3',observedAt:observation.observedAt,fingerprint,complete:true,senderFeesNano:sender.toString(),totalNetworkFeesNano:total.toString(),modeledNetCostNano:total.toString(),initialGrossDebitNano:(10000000n+sender).toString(),scope:'INVALID_SIGNATURE_PROVIDER_EMULATION_NOT_EXECUTION',hardMaximumEnforced:false};
}

export class RecoveryRuntime {
 constructor(storage,env,legacy){
  this.storage=storage;this.env=env;this.legacy=legacy;this.latest=null;
  this.ledger=new RecoveryPreparationLedger({storage:scoped(storage,'recovery-runtime:v1:'),observe:async()=>{this.latest=await observeRecovery(env,await legacy());return this.latest;},estimate:async({transaction,fingerprint})=>{
   const request=await buildRecoveryEmulation(RECOVERY,pinned.oldSeqno,transaction.validUntil);
   const startedAt=Date.now(),r=await accountRead(env,'recoveryFees',true,transaction.validUntil),o=await r.json();upstream(r,o);
   fail(Number.isSafeInteger(o.observedAt)&&Math.abs(Date.now()-o.observedAt)<15000&&Date.now()-startedAt<15000,'Fresh fee acquisition interval required');
   const model=analyzeRecoveryFees({...o,observedAt:startedAt},this.latest,request,fingerprint);
   const before=this.latest,next=await observeRecovery(env,await legacy());validateSnapshot(pinned,next,pinned.oldSeqno);fail(next.source.lastTransactionHash===before.source.lastTransactionHash&&next.source.data===before.source.data&&next.source.balanceNano===before.source.balanceNano,'Source changed during recovery quote');this.latest=next;return model;
  }});
 }
 async fetch(input){
  // No claim, reserve, record, evidence-upload, reconciliation or activation
  // endpoint. Neither a client flag nor a server environment toggle opens this.
  if(input.action==='observe'){const snapshot=await observeRecovery(this.env,await this.legacy());const identity=validateSnapshot(pinned,snapshot,pinned.oldSeqno);const status=await(await this.fetch({action:'status'})).json();return json({...status,currentChain:{observedAt:snapshot.observedAt,seqno:identity.seqno,balanceNano:identity.balanceNano,lastTransactionHash:identity.lastTransactionHash,curveState:snapshot.curve.state,minterState:snapshot.minter.state,corroboration:snapshot.corroboration,scope:'CURRENT_ACCOUNTS_NOT_FINALIZED_OPERATION'}});}
  if(input.action==='status')return json({...await this.ledger.status(),operation:RECOVERY,successorOperation:SUCCESSOR,originalLock:await this.legacy(),scope:'SERVER_RECOVERY_PREPARATION_NOT_EXECUTION',successor:{message:pinned.curveMessage,expectedSeqno:null,eligibleForAuthorization:false},blockedBy:['QUALIFIED_INDEPENDENT_REVIEW','SERVER_FINALIZED_RECEIPT_ACQUISITION','EXACT_NEW_OWNER_AUTHORIZATION','MANUAL_WALLET_CONFIRMATION'],executionEnabled:false});
  if(input.action==='prepare'){
   const draft=await this.ledger.prepare(RECOVERY);
   return json({...draft,scope:'SERVER_RECOVERY_PREPARATION_NOT_EXECUTION',requestAllowed:false,policyThresholdIsNotGuaranteedMaximum:true,corroboration:this.latest.corroboration});
  }
  return json({error:'Recovery and successor execution disabled; original lock preserved',financialSigningEnabled:false},403);
 }
}
