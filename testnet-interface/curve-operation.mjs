import {RecoveryRuntime} from './recovery/runtime.mjs';
import execution from './execution-version.json' with {type:'json'};
import * as core from '@ton/core';
import * as policy from './curve-policy.mjs';
import candidate from '../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {verifySnapshot,analyzeTrace} from '../lib/curve-two-preflight.js';
import {FinancialOperation} from './operation-lock.mjs';
import {accountRead} from './testnet-rpc.mjs';
import {curveEmulation} from './curve-emulation.mjs';
import {validProof} from './prepare-minter-one.mjs';
import {walletIdentity} from './proof.mjs';
import {curveAuthorization,curveAuthorized,matchesAuthorization,RUNTIME_MODE} from './curve-authorization.mjs';
export {curveAuthorized} from './curve-authorization.mjs';
const {intent,validateIntent,fingerprint}=policy;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=s=>core.Cell.fromBase64(s).hash().toString('hex');
export class CurveFinancialOperation extends FinancialOperation {
 constructor(state,env){super(state);this.policy=policy;this.env=env;}
 async fetch(request){
  const b=await request.clone().json();
  if(b.action?.startsWith('recovery:')){
   if(b.runtimeVersion!==execution.sha256)return json({error:'Incompatible recovery runtime'},409);
   const original=async()=>{const r=await super.fetch(new Request('https://legacy.internal/',{method:'POST',body:'{"action":"status"}'}));const j=await r.json();return{operation:intent.operation,state:j.status,fingerprint:j.fingerprint,claimedAt:j.claimedAt,validUntil:j.validUntil};};
   const env={...this.env,...(request.headers.get('X-Internal-Testnet-Key')?{TONCENTER_TESTNET_API_KEY:request.headers.get('X-Internal-Testnet-Key')}:{})};
   try{return await new RecoveryRuntime(this.state.storage,env,original).fetch({action:b.action.slice(9)});}catch(e){const limited=e.status===429;return Response.json({error:limited?'Testnet provider rate limited; no stale quote served':'Recovery preparation unavailable: fresh corroborated source, immutable legacy lock and exact fee simulation required',reason:limited?'PROVIDER_RATE_LIMITED':'RECOVERY_CHECK_UNAVAILABLE',...(limited?{retryAfterSeconds:e.retryAfterSeconds}:{}),financialSigningEnabled:false},{status:limited?429:503,headers:{'Cache-Control':'no-store',...(limited?{'Retry-After':String(e.retryAfterSeconds)}:{})}});}
  }
  if(b.action==='runtime')return json({runtimeVersion:execution.sha256});
  if(['authorize','reserveQuote','prepare','claim'].includes(b.action)&&b.runtimeVersion!==execution.sha256)return json({error:'Incompatible private Curve runtime'},409);
  if(b.action==='authorize'){
   const grant=curveAuthorization({CURVE_TX2_SIGNING_AUTH:JSON.stringify(b.grant)});
   if(grant?.mode!==RUNTIME_MODE)return json({error:'Invalid finite authorization'},403);
   const accepted=await this.state.storage.transaction(async tx=>{
    if(await tx.get('operation'))return false;
    const prior=await tx.get('runtimeAuthorization');
    if(prior&&(grant.issuedAt<=prior.issuedAt||grant.authorizationId===prior.authorizationId))return false;
    if(grant.preparedFingerprint){
     const p=await tx.get('prepared'),q=await tx.get('quote'),a=p?.approval,now=Math.floor(Date.now()/1000);
     if(!a||a.runtimeVersion!==execution.sha256||a.fingerprint!==grant.preparedFingerprint||a.quoteRevision!==q?.revision||a.observedAt>now||now-a.observedAt>60||a.quoteExpiresAt<=now||p.transaction.validUntil>grant.notAfter||!a.simulation)return false;
     await tx.put('prepared',{...p,approval:{...a,authorizationMode:RUNTIME_MODE,authorizationId:grant.authorizationId,authorizationNotAfter:grant.notAfter}});
    }else await tx.put('prepared',null);
    await tx.put('runtimeAuthorization',grant);return true;
   });
   return accepted?json({stored:true,notAfter:grant.notAfter}):json({error:'Replayed authorization or lifetime operation locked'},409);
  }
  if(b.action==='prepared')return json(await this.state.storage.get('prepared')??null);
  if(b.action==='authorization')return json(await this.state.storage.get('runtimeAuthorization')??null);
  if(b.action!=='reserveQuote')return super.fetch(request);
  const now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(b.maximumValidUntil)||b.maximumValidUntil<=now||b.maximumValidUntil>now+90||!/^(preview|runtime:[a-f0-9]{64}|legacy:[a-f0-9]{64})$/.test(b.scopeKey||''))return json({error:'Invalid quote reservation'},400);
  const quote=await this.state.storage.transaction(async tx=>{
   if(await tx.get('operation'))return null;
   const previous=await tx.get('quote');
   // Distinct hashes even when requoting in the same second. Within one
   // authorization, refreshes never increase the original signing deadline.
   const used=new Set((await tx.get('quoteDeadlines')??[]).filter(t=>t>now));
   let validUntil=b.maximumValidUntil;while(used.has(validUntil)&&validUntil>now)validUntil--;
   if(validUntil<=now)return null;
   const q={revision:(previous?.revision??0)+1,scopeKey:b.scopeKey,validUntil};
   await tx.put('quoteDeadlines',[...used,validUntil]);await tx.put('quote',q);await tx.put('prepared',null);return q;
  });
  return quote?json(quote):json({error:'Operation locked or quote cannot be refreshed'},409);
 }
}
function stubFor(env){return env.CURVE_OPERATIONS.get(env.CURVE_OPERATIONS.idFromName(intent.operation+':'+intent.operator));}
export function call(stub,body){return stub.fetch(new Request('https://curve-operation.internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,...body})}));}
async function compatibleStorage(env){if(!env.CURVE_OPERATIONS)return false;const r=await call(stubFor(env),{action:'runtime'});return r.ok&&(await r.json()).runtimeVersion===execution.sha256;}
export async function currentCurveAuthorization(env){
 // Legacy environment grants remain supported. A revoked/expired stored runtime
 // grant never falls back to legacy authority.
 if(env.CURVE_OPERATIONS){
  if(!await compatibleStorage(env))return null;
  const stored=await(await call(stubFor(env),{action:'authorization'})).json();
  if(stored){const valid=curveAuthorization({CURVE_TX2_SIGNING_AUTH:JSON.stringify(stored)});return valid?{...valid,stored:true}:null;}
 }
 return curveAuthorization(env);
}
export async function storeCurveAuthorization(env,grant){return call(stubFor(env),{action:'authorize',grant});}
async function fresh(env,name,validUntil){const r=await accountRead(env,name,true,validUntil),j=await r.json();if(!r.ok||j.network!=='-3'||j.authentication!=='TESTNET_KEY_ACCEPTED'||j.dataStatus!=='FRESH_PROVIDER_OBSERVATION'||Math.abs(Date.now()-j.observedAt)>15000)throw Error('Fresh authenticated Testnet observation required');return j;}
export async function curveOperationRoute(path,input,env,proof){
 // A post-dispatch diagnostic is authenticated by its lifetime claim ticket,
 // not an already-expired signing proof. It can never authorize or unlock funds.
 if(path.endsWith('/record'))return call(stubFor(env),{action:'record',ticket:input?.ticket,event:input?.event});
 if((path.endsWith('/claim')||path.endsWith('/prepare'))&&input?.runtimeVersion!==execution.sha256)return json({error:'Incompatible Curve execution version; refresh reviewed client'},409);
 if((path.endsWith('/claim')||path.endsWith('/prepare'))&&!await compatibleStorage(env))return json({error:'Incompatible persistent Curve runtime'},409);
 if(path.endsWith('/claim')&&!await currentCurveAuthorization(env))return json({error:'Separate exact Curve #2 owner authorization absent; signing disabled'},403);
 if(!validProof(proof)||proof.domain!=='testnet.anlgram.com')return json({error:'Fresh domain-bound operator proof required'},403);
 const stub=stubFor(env);
 if(path.endsWith('/prepare')){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='runtimeVersion'))return json({error:'Caller transaction parameters forbidden'},400);
  const lock=await(await call(stub,{action:'status'})).json();if(lock.status!=='NOT_CLAIMED')return json({error:'Attempt already locked; exact trace reconciliation required'},409);
  const authorization=await currentCurveAuthorization(env);
  if(authorization?.preparedFingerprint){
   const p=await(await call(stub,{action:'prepared'})).json(),a=p?.approval,now=Math.floor(Date.now()/1000);
   if(!a||a.quoteExpiresAt<=now||a.observedAt>now||now-a.observedAt>60||a.runtimeVersion!==execution.sha256||!a.simulation||!matchesAuthorization(authorization,a,a.fingerprint,p.transaction.validUntil))return json({error:'Exact approved quote expired or superseded; new owner review required'},409);
   validateIntent(p.transaction);if(await fingerprint(p.transaction)!==a.fingerprint)throw Error('Private prepared fingerprint changed');
   return json({runtimeVersion:execution.sha256,prepared:true,notSigned:true,transaction:p.transaction,fingerprint:a.fingerprint,simulation:a.simulation,stateInitHash:hash(intent.message.stateInit),expectedSeqno:1,quoteExpiresAt:a.quoteExpiresAt,requestAllowed:true,authorizationRefreshOnly:true,policyCeilingIsNotEnforcedMaximum:true,nativeSeqnoIsNotEnforced:true});
  }
  const observations={};for(const name of ['operator','minter','curve','jettonData'])observations[name]=await fresh(env,name);
  const now=Math.floor(Date.now()/1000);
  const maximumValidUntil=Math.min(now+90,proof.expiresAt,authorization?.notAfter??Infinity,authorization?.validUntil??Infinity);
  if(maximumValidUntil<=now)return json({error:'Proof/authorization expired before emulation'},403);
  const scopeKey=authorization?.mode===RUNTIME_MODE?'runtime:'+authorization.authorizationId:authorization?'legacy:'+authorization.fingerprint:'preview';
  const reserved=await call(stub,{action:'reserveQuote',maximumValidUntil,scopeKey});if(!reserved.ok)return reserved;
  const reservation=await reserved.json(),deadline=reservation.validUntil;
  observations.curveFees=await fresh(env,'curveFees',deadline);
  const checks=verifySnapshot({network:'-3',curveSigningEnabled:false,observations},candidate,intent),quote=observations.curveFees,reference=await curveEmulation(quote.validUntil);
  if(reference.bodyHash!==quote.bodyHash)throw Error('Wrong emulation body');
  const simulation=analyzeTrace(quote.trace,checks,intent,quote.bodyHash);
  if(BigInt(simulation.modeledSenderDebitNano)>120000000n) return json({error:'Fresh model exceeds proposed policy; new review required'},409);
  const transaction={network:'-3',from:intent.operator,validUntil:quote.validUntil,messages:[structuredClone(intent.message)]};validateIntent(transaction);
  if(!validProof(proof))return json({error:'Proof expired during reads'},403);
  if(quote.validUntil!==deadline)throw Error('Wrong quote deadline');
  const observedAt=Math.floor(Date.now()/1000),quoteExpiresAt=Math.min(observedAt+60,deadline,proof.expiresAt);
  if(quoteExpiresAt<=observedAt)return json({error:'Quote expired during preparation'},403);
  const fp=await fingerprint(transaction),approval={runtimeVersion:execution.sha256,simulation,fingerprint:fp,validUntil:transaction.validUntil,candidateSha256:intent.candidateSha256,observedAt,quoteExpiresAt,quoteRevision:reservation.revision,quoteScopeKey:scopeKey,expectedSeqno:1,walletId:intent.walletId,sourceDataHash:hash(checks.source.data),sourceBalanceNano:checks.source.balance,sourceLastTransactionHash:checks.source.last_transaction_id.hash,minterDataHash:hash(checks.minter.data),traceSha256:simulation.traceSha256,modeledDebitNano:simulation.modeledSenderDebitNano,...(authorization?.mode===RUNTIME_MODE?{authorizationMode:RUNTIME_MODE,authorizationId:authorization.authorizationId,authorizationNotAfter:authorization.notAfter}:{})};
  const saved=await call(stub,{action:'prepare',transaction,approval});if(!saved.ok)return saved;
  return json({runtimeVersion:execution.sha256,prepared:true,notSigned:true,transaction,fingerprint:fp,simulation,stateInitHash:hash(intent.message.stateInit),expectedSeqno:1,quoteExpiresAt,requestAllowed:validProof(proof)&&matchesAuthorization(await currentCurveAuthorization(env),approval,fp,transaction.validUntil),policyCeilingIsNotEnforcedMaximum:true,nativeSeqnoIsNotEnforced:true});
 }
 if(path.endsWith('/claim')){
  validateIntent(input.transaction);const fp=await fingerprint(input.transaction);
  const authorization=await currentCurveAuthorization(env);
  if(fp!==input.fingerprint||!walletIdentity(input.walletAccount))return json({error:'Wrong fingerprint or wallet account'},403);
  const ar=await call(stub,{action:'approval',fingerprint:fp});if(!ar.ok)return ar;const a=await ar.json(),now=Math.floor(Date.now()/1000);
  if(a.runtimeVersion!==execution.sha256||!matchesAuthorization(authorization,a,fp,input.transaction.validUntil)||a.expectedSeqno!==1||a.walletId!==intent.walletId||a.observedAt>now||now-a.observedAt>60||(a.quoteExpiresAt!==undefined&&now>=a.quoteExpiresAt)||a.candidateSha256!==intent.candidateSha256||a.validUntil!==input.transaction.validUntil||!/^\d+$/.test(a.modeledDebitNano)||BigInt(a.modeledDebitNano)>120000000n)return json({error:'Stale or incompatible approval'},403);
  const source=(await fresh(env,'operator')).account,minter=(await fresh(env,'minter')).account,curve=(await fresh(env,'curve')).account;
  if(source.state!=='active'||hash(source.code)!==candidate.wallet.codeHash||hash(source.data)!==a.sourceDataHash||source.balance!==a.sourceBalanceNano||source.last_transaction_id?.hash!==a.sourceLastTransactionHash||BigInt(source.balance)<BigInt(a.modeledDebitNano)||minter.state!=='active'||hash(minter.code)!==candidate.dependentAccounts.minter.codeHash||hash(minter.data)!==candidate.dependentAccounts.minter.dataHash||curve.state!=='uninitialized'||curve.code||curve.balance!=='0')return json({error:'Chain state changed; do not sign'},409);
  const d=core.Cell.fromBase64(source.data).beginParse();if(!d.loadBit()||d.loadUint(32)!==1||d.loadInt(32)!==intent.walletId||d.loadBuffer(32).toString('hex')!==intent.publicKey||d.loadBit())return json({error:'Wrong live V5 nonce/account'},409);d.endParse();
  validateIntent(input.transaction);if(!validProof(proof)||!matchesAuthorization(await currentCurveAuthorization(env),a,fp,input.transaction.validUntil))return json({error:'Proof/authorization expired'},403);
  const result=await call(stub,{action:'claim',transaction:input.transaction,fingerprint:fp,requirePrepared:true,approvalReference:a,...(authorization.mode===RUNTIME_MODE?{authorizationBinding:{id:authorization.authorizationId,notAfter:authorization.notAfter,requireStored:authorization.stored===true}}:{})});
  return json({...await result.json(),runtimeVersion:execution.sha256},result.status);
 }
 const lock=await(await call(stub,{action:'status'})).json();
 if(path.endsWith('/reconcile')){const source=(await fresh(env,'operator')).account,destination=(await fresh(env,'curve')).account;return json({lock,source,destination,network:'-3',status:'EXACT_FINALIZED_TRACE_REVIEW_REQUIRED',newOperationAllowed:false});}
 return json({...lock,newOperationAllowed:false});
}
