import {Cell} from '@ton/core';
import {intent} from './curve-policy.mjs';
export const RUNTIME_MODE='SERVER_PREPARED_V1';
export const GRANT_SECONDS=90;
const hash=s=>Cell.fromBase64(s).hash().toString('hex');
// Server-environment grant only. No browser can create/extend this authority.
// A grant is NOT a quote: every request must also match the private DO approval.
export function curveAuthorization(env,now=Math.floor(Date.now()/1000)){
 try{
  const a=JSON.parse(env.CURVE_TX2_SIGNING_AUTH||'null');
  if(!a||a.operation!==intent.operation||a.candidateSha256!==intent.candidateSha256||a.origin!=='https://testnet.anlgram.com'||a.network!=='-3'||a.operator!==intent.operator||a.destination!==intent.message.address||a.stateInitHash!==hash(intent.message.stateInit)||a.bodyHash!==hash(intent.message.payload)||a.amountNano!=='100000000'||a.expectedSeqno!==1||a.walletId!==intent.walletId||a.policyCeilingNano!=='120000000'||a.acceptNativeSeqnoLimitation!==true||a.hardMaximumDebitEnforced!==false||!Number.isSafeInteger(a.notAfter)||a.notAfter<=now)return null;
  if(a.mode===RUNTIME_MODE){
   if(!/^[a-f0-9]{64}$/.test(a.authorizationId||'')||!Number.isSafeInteger(a.issuedAt)||a.issuedAt>now||a.notAfter<=a.issuedAt||a.notAfter-a.issuedAt>GRANT_SECONDS||'fingerprint'in a||'validUntil'in a)return null;
   return a;
  }
  // Preserve previously reviewed exact-fingerprint authorizations; never treat
  // a malformed/unknown version as a less restrictive runtime grant.
  if(a.mode!==undefined||!/^[a-f0-9]{64}$/.test(a.fingerprint||'')||!Number.isSafeInteger(a.validUntil)||a.validUntil<=now)return null;
  return a;
 }catch{return null;}
}
export const curveAuthorized=(env,now)=>curveAuthorization(env,now)!==null;
export function matchesAuthorization(a,approval,fp,validUntil){
 if(!a)return false;
 if(a.mode===RUNTIME_MODE)return approval.authorizationMode===RUNTIME_MODE&&approval.authorizationId===a.authorizationId&&approval.authorizationNotAfter===a.notAfter&&validUntil<=a.notAfter;
 return a.fingerprint===fp&&a.validUntil===validUntil;
}

// Administrative HMAC is separate from TON wallet credentials. It is never sent
// to the browser, and authenticates the exact finite grant, origin and endpoint.
export async function verifyRuntimeAuthorization(request, raw, env){
 const secret=env.CURVE_TX2_RUNTIME_AUTH_KEY;
 if(!/^[a-f0-9]{64}$/.test(secret||''))return null;
 const signature=request.headers.get('X-Curve-Authorization');
 if(!/^[a-f0-9]{64}$/.test(signature||''))return null;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const bytes=Uint8Array.from(signature.match(/../g),v=>parseInt(v,16));
 const valid=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode('ANLGRAM_CURVE_AUTH_V1\nhttps://testnet.anlgram.com/api/curve-two/authorize\n'+raw));
 if(!valid)return null;
 const a=curveAuthorization({CURVE_TX2_SIGNING_AUTH:raw});
 return a?.mode===RUNTIME_MODE?a:null;
}
