import * as core from '@ton/core';
import * as policy from './curve-policy.mjs';
import candidate from '../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {verifySnapshot,analyzeTrace} from '../lib/curve-two-preflight.js';
import {FinancialOperation} from './operation-lock.mjs';
import {accountRead} from './testnet-rpc.mjs';
import {curveEmulation} from './curve-emulation.mjs';
import {validProof} from './prepare-minter-one.mjs';
import {walletIdentity} from './proof.mjs';
const {intent,validateIntent,fingerprint}=policy;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=s=>core.Cell.fromBase64(s).hash().toString('hex');
export class CurveFinancialOperation extends FinancialOperation {
 constructor(state){super(state);this.policy=policy;}
}
// This authorization is deliberately absent until the owner approves #2.
// TON Connect has no seqno parameter and cannot enforce a total fee ceiling.
export function curveAuthorized(env,now=Math.floor(Date.now()/1000)){
 try{const a=JSON.parse(env.CURVE_TX2_SIGNING_AUTH||'null');return !!a&&a.operation===intent.operation&&a.candidateSha256===intent.candidateSha256&&a.origin==='https://testnet.anlgram.com'&&a.network==='-3'&&a.operator===intent.operator&&a.destination===intent.message.address&&a.stateInitHash===hash(intent.message.stateInit)&&a.bodyHash===hash(intent.message.payload)&&a.amountNano==='100000000'&&a.expectedSeqno===1&&a.walletId===intent.walletId&&a.policyCeilingNano==='120000000'&&a.acceptNativeSeqnoLimitation===true&&a.hardMaximumDebitEnforced===false&&/^[a-f0-9]{64}$/.test(a.fingerprint||'')&&Number.isSafeInteger(a.validUntil)&&a.validUntil>now&&Number.isSafeInteger(a.notAfter)&&a.notAfter>now;}catch{return false;}
}
function stubFor(env){return env.CURVE_OPERATIONS.get(env.CURVE_OPERATIONS.idFromName(intent.operation+':'+intent.operator));}
function call(stub,body){return stub.fetch(new Request('https://curve-operation.internal/',{method:'POST',body:JSON.stringify(body)}));}
async function fresh(env,name){const r=await accountRead(env,name,true),j=await r.json();if(!r.ok||j.network!=='-3'||j.authentication!=='TESTNET_KEY_ACCEPTED'||j.dataStatus!=='FRESH_PROVIDER_OBSERVATION'||Math.abs(Date.now()-j.observedAt)>15000)throw Error('Fresh authenticated Testnet observation required');return j;}
export async function curveOperationRoute(path,input,env,proof){
 if(path.endsWith('/claim')&&!curveAuthorized(env))return json({error:'Separate exact Curve #2 owner authorization absent; signing disabled'},403);
 if(!validProof(proof)||proof.domain!=='testnet.anlgram.com')return json({error:'Fresh domain-bound operator proof required'},403);
 const stub=stubFor(env);
 if(path.endsWith('/prepare')){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json({error:'Caller transaction parameters forbidden'},400);
  const lock=await(await call(stub,{action:'status'})).json();if(lock.status!=='NOT_CLAIMED')return json({error:'Attempt already locked; exact trace reconciliation required'},409);
  const observations={};for(const name of ['operator','minter','curve','jettonData','curveFees'])observations[name]=await fresh(env,name);
  const checks=verifySnapshot({network:'-3',curveSigningEnabled:false,observations},candidate,intent),quote=observations.curveFees,reference=await curveEmulation(quote.validUntil);
  if(reference.bodyHash!==quote.bodyHash)throw Error('Wrong emulation body');
  const simulation=analyzeTrace(quote.trace,checks,intent,quote.bodyHash);
  if(BigInt(simulation.modeledSenderDebitNano)>120000000n) return json({error:'Fresh model exceeds proposed policy; new review required'},409);
  const transaction={network:'-3',from:intent.operator,validUntil:quote.validUntil,messages:[structuredClone(intent.message)]};validateIntent(transaction);
  if(!validProof(proof))return json({error:'Proof expired during reads'},403);
  const fp=await fingerprint(transaction),approval={fingerprint:fp,validUntil:transaction.validUntil,candidateSha256:intent.candidateSha256,observedAt:Math.floor(Date.now()/1000),expectedSeqno:1,walletId:intent.walletId,sourceDataHash:hash(checks.source.data),sourceBalanceNano:checks.source.balance,sourceLastTransactionHash:checks.source.last_transaction_id.hash,minterDataHash:hash(checks.minter.data),traceSha256:simulation.traceSha256,modeledDebitNano:simulation.modeledSenderDebitNano};
  const saved=await call(stub,{action:'prepare',transaction,approval});if(!saved.ok)return saved;
  return json({prepared:true,notSigned:true,transaction,fingerprint:fp,simulation,stateInitHash:hash(intent.message.stateInit),expectedSeqno:1,quoteExpiresAt:approval.observedAt+60,requestAllowed:curveAuthorized(env),policyCeilingIsNotEnforcedMaximum:true,nativeSeqnoIsNotEnforced:true});
 }
 if(path.endsWith('/claim')){
  validateIntent(input.transaction);const fp=await fingerprint(input.transaction);
  const authorization=JSON.parse(env.CURVE_TX2_SIGNING_AUTH);
  if(fp!==authorization.fingerprint||input.transaction.validUntil!==authorization.validUntil||fp!==input.fingerprint||!walletIdentity(input.walletAccount))return json({error:'Wrong fingerprint or wallet account'},403);
  const ar=await call(stub,{action:'approval',fingerprint:fp});if(!ar.ok)return ar;const a=await ar.json(),now=Math.floor(Date.now()/1000);
  if(a.expectedSeqno!==1||a.walletId!==intent.walletId||a.observedAt>now||now-a.observedAt>60||a.candidateSha256!==intent.candidateSha256||a.validUntil!==input.transaction.validUntil||!/^\d+$/.test(a.modeledDebitNano)||BigInt(a.modeledDebitNano)>120000000n)return json({error:'Stale or incompatible approval'},403);
  const source=(await fresh(env,'operator')).account,minter=(await fresh(env,'minter')).account,curve=(await fresh(env,'curve')).account;
  if(source.state!=='active'||hash(source.code)!==candidate.wallet.codeHash||hash(source.data)!==a.sourceDataHash||source.balance!==a.sourceBalanceNano||source.last_transaction_id?.hash!==a.sourceLastTransactionHash||BigInt(source.balance)<BigInt(a.modeledDebitNano)||minter.state!=='active'||hash(minter.code)!==candidate.dependentAccounts.minter.codeHash||hash(minter.data)!==candidate.dependentAccounts.minter.dataHash||curve.state!=='uninitialized'||curve.code||curve.balance!=='0')return json({error:'Chain state changed; do not sign'},409);
  const d=core.Cell.fromBase64(source.data).beginParse();if(!d.loadBit()||d.loadUint(32)!==1||d.loadInt(32)!==intent.walletId||d.loadBuffer(32).toString('hex')!==intent.publicKey||d.loadBit())return json({error:'Wrong live V5 nonce/account'},409);d.endParse();
  validateIntent(input.transaction);if(!validProof(proof)||!curveAuthorized(env))return json({error:'Proof/authorization expired'},403);
  return call(stub,{action:'claim',transaction:input.transaction,fingerprint:fp,requirePrepared:true,approvalReference:a});
 }
 if(path.endsWith('/record'))return call(stub,{action:'record',ticket:input.ticket,event:input.event});
 const lock=await(await call(stub,{action:'status'})).json();
 if(path.endsWith('/reconcile')){const source=(await fresh(env,'operator')).account,destination=(await fresh(env,'curve')).account;return json({lock,source,destination,network:'-3',status:'EXACT_FINALIZED_TRACE_REVIEW_REQUIRED',newOperationAllowed:false});}
 return json({...lock,newOperationAllowed:false});
}
