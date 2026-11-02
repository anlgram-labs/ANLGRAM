import execution from './execution-version.json' with {type:'json'};
import {verifyRuntimeAuthorization} from './curve-authorization.mjs';
import {readMvpStatus,readCurveDispatch} from './mvp-status.mjs';
import {curveOperationRoute,currentCurveAuthorization,storeCurveAuthorization} from './curve-operation.mjs';
export {CurveFinancialOperation} from './curve-operation.mjs';
import {prepareMinterOne,preparationEnabled} from './prepare-minter-one.mjs';
import { approvedOrigin, CHAIN, MINTER, OPERATOR, TESTNET_RPC, TTL } from './config.mjs';
import { verifyProof } from './proof.mjs';
import {accountRead} from './testnet-rpc.mjs';
export {TestnetReads} from './testnet-rpc.mjs';
import {operationRoute} from './operation-lock.mjs';
export {FinancialOperation} from './operation-lock.mjs';

const json = (body, status=200, extra={}) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...extra}});
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
const cookieName = '__Host-anlgram-testnet-proof';
const cookie = id => `${cookieName}=${id}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${TTL}`;
function attemptId(request) {
  return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
}
export async function consumeChallenge(storage, challenge, now) {
  return storage.transaction(async tx=>{
    const value=await tx.get('challenge');
    if (!value || value.used || value.expiresAt<=now || value.payload!==challenge.payload) return false;
    await tx.put('challenge',{...value,used:true});
    return true;
  });
}
async function boundedBody(request) {
  if (!request.body) return '';
  const reader=request.body.getReader(), decoder=new TextDecoder();
  let size=0, raw='';
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000)throw Error('Body too large');raw+=decoder.decode(value,{stream:true});}
    return raw+decoder.decode();
  } finally { await reader.cancel(); }
}
export class ProofAttempt {
  constructor(state) { this.state=state; }
  async fetch(request) {
    const body=await request.json(), now=Math.floor(Date.now()/1000);
    if(body.action==='status'){
      const verified=await this.state.storage.get('verified');
      return verified&&verified.domain===body.domain&&verified.expiresAt>now?json({...verified,verified:true}):json({verified:false});
    }
    if (body.action==='create') {
      const challenge={payload:random(),createdAt:now,expiresAt:now+TTL,used:false};
      await this.state.storage.put('challenge',challenge);
      await this.state.storage.setAlarm((now+TTL)*1000);
      return json({payload:challenge.payload,expiresAt:challenge.expiresAt});
    }
    const current=await this.state.storage.get('challenge');
    if (!await verifyProof(body.proofBody,current,body.domain,now)) return json({error:'Ownership proof rejected; reconnect'},401);
    // Signature checked first, then single-use consumption is serialized atomically.
    const accepted=await consumeChallenge(this.state.storage,current,now);
    if(accepted)await this.state.storage.put('verified',{address:OPERATOR,network:CHAIN,domain:body.domain,expiresAt:current.expiresAt});
    return accepted ? json({verified:true,address:OPERATOR,network:CHAIN,expiresAt:current.expiresAt,
      scope:'OWNERSHIP_ONLY',financialSigningEnabled:false,replayIsolationVerified:false}) : json({error:'Expired/replayed proof'},401);
  }
  async alarm() { await this.state.storage.deleteAll(); }
}

async function route(request,env) {
  try { approvedOrigin(env.APP_ORIGIN); } catch { return json({error:'Origin not approved'},503); }
  const u=new URL(request.url);
  let origin; try { origin=approvedOrigin(u.origin); } catch { return json({error:'Wrong Testnet origin'},403); }
  if (u.search) return json({error:'Query overrides are forbidden'},400);
  const path=u.pathname;
  if (request.method==='GET' && path==='/tonconnect-manifest.json') return json({url:origin.origin+'/',name:'ANLGRAM TESTNET ONLY — ownership proof',iconUrl:origin.origin+'/icon.png'},200,{'Access-Control-Allow-Origin':'*'});
  if (request.method==='GET' && path==='/api/config') {const dispatch=await readCurveDispatch(env),retired=dispatch.state!=='NOT_CLAIMED';return json({curveExecutionVersion:execution.sha256,network:CHAIN,operator:OPERATOR,minter:MINTER,
    manifestUrl:origin.origin+'/tonconnect-manifest.json',financialSigningEnabled:false,minterTransactionOnePreparationEnabled:preparationEnabled(env,u.origin),curveTransactionTwoRetired:retired,curveTransactionTwoPreparationEnabled:!retired&&u.origin==='https://testnet.anlgram.com',curveTransactionTwoSigningEnabled:!retired&&!!await currentCurveAuthorization(env),curveTransactionTwoRuntimeAuthorizationAvailable:/^[a-f0-9]{64}$/.test(env.CURVE_TX2_RUNTIME_AUTH_KEY||''),replayIsolationVerified:false});}
  if(path.startsWith('/api/recovery/')){
    if(u.origin!=='https://testnet.anlgram.com')return json({error:'Canonical Testnet origin required'},403);
    const action=path.slice('/api/recovery/'.length);
    if(!['status','observe','prepare'].includes(action))return json({error:'Recovery and successor signing disabled',financialSigningEnabled:false},403);
    if((['status','observe'].includes(action)&&request.method!=='GET')||(action==='prepare'&&request.method!=='POST'))return json({error:'Method rejected'},405);
    if(action==='prepare'){
      if(request.headers.get('Origin')!==u.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origin/content type rejected'},403);
      let body;try{body=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid preparation'},400);}
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return json({error:'Caller transaction/authorization parameters forbidden'},400);
      const id=attemptId(request);let proof={verified:false};
      if(/^[a-f0-9]{64}$/.test(id||''))proof=await(await env.PROOFS.get(env.PROOFS.idFromName(id)).fetch(new Request('https://proof.internal/',{method:'POST',body:JSON.stringify({action:'status',domain:origin.hostname})}))).json();
      if(!proof.verified||proof.network!=='-3'||proof.address!==OPERATOR||proof.domain!==origin.hostname||proof.expiresAt<=Math.floor(Date.now()/1000))return json({error:'Fresh domain-bound V5 operator proof required; no transaction requested'},403);
    }
    if(!env.CURVE_OPERATIONS)return json({error:'Persistent operation service unavailable'},503);
    const stub=env.CURVE_OPERATIONS.get(env.CURVE_OPERATIONS.idFromName('ANLTEST_CURVE_TX2:'+OPERATOR));
    return stub.fetch(new Request('https://curve-operation.internal/',{method:'POST',headers:env.TONCENTER_TESTNET_API_KEY?{'X-Internal-Testnet-Key':env.TONCENTER_TESTNET_API_KEY}:{},body:JSON.stringify({action:'recovery:'+action,runtimeVersion:execution.sha256})}));
  }
  if(request.method==='POST'&&path==='/api/curve-two/authorize'){
    if(u.origin!=='https://testnet.anlgram.com'||request.headers.get('Origin')!==u.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Canonical administration origin required'},403);
    let raw;try{raw=await boundedBody(request);}catch{return json({error:'Invalid authorization'},400);}
    const grant=await verifyRuntimeAuthorization(request,raw,env);
    if(!grant)return json({error:'Administrative authorization rejected'},403);
    return storeCurveAuthorization(env,grant);
  }
  if(request.method==='POST'&&['/api/curve-two/prepare','/api/curve-two/claim','/api/curve-two/record','/api/curve-two/status','/api/curve-two/reconcile'].includes(path)){
    if(u.origin!=='https://testnet.anlgram.com'||request.headers.get('Origin')!==u.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Canonical Curve origin required'},403);
    let input;try{input=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid operation request'},400);}
    if(path.endsWith('/claim')&&!await currentCurveAuthorization(env))return json({error:'Curve owner authorization absent; signing disabled'},403);
    if(path.endsWith('/record'))return curveOperationRoute(path,input,env,{verified:false});
    const id=attemptId(request);let proof={verified:false};
    if(/^[a-f0-9]{64}$/.test(id||''))proof=await(await env.PROOFS.get(env.PROOFS.idFromName(id)).fetch(new Request('https://proof.internal/',{method:'POST',body:JSON.stringify({action:'status',domain:origin.hostname})}))).json();
    return curveOperationRoute(path,input,env,proof);
  }
  if(request.method==='POST'&&['/api/operation/prepare','/api/operation/claim','/api/operation/record','/api/operation/status','/api/operation/reconcile'].includes(path)){
    if(request.headers.get('Origin')!==origin.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origin/content type rejected'},403);
    let input;try{input=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid operation request'},400);}
    // Fail before touching any storage/provider when no exact approval exists.
    if((path.endsWith('/claim')||path.endsWith('/prepare'))&&!env.MINTER_TX1_APPROVAL&&!preparationEnabled(env,u.origin))return json({error:'Financial authorization absent; signing disabled'},403);
    const id=attemptId(request);let proofState={verified:false};
    if(/^[a-f0-9]{64}$/.test(id||''))proofState=await(await env.PROOFS.get(env.PROOFS.idFromName(id)).fetch(new Request('https://proof.internal/',{method:'POST',body:JSON.stringify({action:'status',domain:origin.hostname})}))).json();
    if(path.endsWith('/prepare'))return prepareMinterOne(input,env,proofState);
    if(!env.MINTER_TX1_APPROVAL&&path.endsWith('/claim')&&!preparationEnabled(env,u.origin))return json({error:'Wrong signing origin'},403);
    return operationRoute(path,input,env,proofState);
  }
  if (request.method==='POST' && ['/api/proof/challenge','/api/proof/verify'].includes(path)) {
    if (request.headers.get('Origin')!==origin.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Origin/content type rejected'},403);
    let raw; try { raw=await boundedBody(request); } catch { return json({error:'Body too large'},413); }
    let input; try { input=JSON.parse(raw); } catch { return json({error:'Invalid JSON'},400); }
    const creating=path.endsWith('/challenge'), id=creating?random():attemptId(request);
    if (!/^[a-f0-9]{64}$/.test(id||'')) return json({error:'Missing login attempt'},401);
    const stub=env.PROOFS.get(env.PROOFS.idFromName(id));
    const result=await stub.fetch(new Request('https://proof.internal/',{method:'POST',body:JSON.stringify(creating?{action:'create'}:{action:'verify',proofBody:input,domain:origin.hostname})}));
    const response=new Response(result.body,result);
    if (creating) response.headers.set('Set-Cookie',cookie(id));
    return response;
  }
  // One fixed read-only provider call. Never forward caller URLs, RPC methods or BOCs.
  if (request.method==='GET' && path==='/api/operator') {
    const r=await accountRead(env,'operator',false),data=await r.json();
    if(!r.ok)return json(data,r.status,{'Retry-After':r.headers.get('Retry-After')||'1'});
    return json({network:CHAIN,address:OPERATOR,balanceNano:String(data.account.balance),state:data.account.state,source:'TON Center Testnet',observedUtc:data.observedUtc,verification:'PROVIDER_OBSERVATION',dataStatus:data.dataStatus,ageMs:data.ageMs,authentication:data.authentication});
  }
  if(request.method==='GET' && path==='/api/mvp/status')return readMvpStatus(env);
  if(request.method==='POST' && path==='/api/preflight/curve'){
    if(request.headers.get('Origin')!==origin.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origin/content type rejected'},403);
    let input;try{input=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid read'},400);}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json({error:'Parameters forbidden'},400);
    const observations={};
    for(const name of ['operator','minter','curve','jettonData','curveFees']){const r=await accountRead(env,name,true),j=await r.json();if(!r.ok)return json(j,r.status,{'Retry-After':r.headers.get('Retry-After')||'1'});observations[name]=j;}
    return json({network:CHAIN,observations,financialSigningEnabled:false,curveSigningEnabled:false});
  }
  if(request.method==='POST' && path==='/api/preflight/fees'){
    if(request.headers.get('Origin')!==origin.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origin/content type rejected'},403);
    let input;try{input=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid read'},400);}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json({error:'Parameters forbidden'},400);
    return accountRead(env,'fees',true);
  }
  if(request.method==='POST' && path==='/api/preflight/accounts'){
    if(request.headers.get('Origin')!==origin.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origin/content type rejected'},403);
    let input;try{input=JSON.parse(await boundedBody(request));}catch{return json({error:'Invalid read'},400);}
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json({error:'Parameters forbidden'},400);
    const observations={};
    for(const name of ['operator','minter']){const r=await accountRead(env,name,true);const data=await r.json();if(!r.ok)return json(data,r.status,{'Retry-After':r.headers.get('Retry-After')||'1'});observations[name]=data;}
    return json({network:CHAIN,observations,financialSigningEnabled:false});
  }
  if (request.method==='GET' && ['/', '/app.js', '/transaction-one.js', '/transaction-two.js', '/mvp-status.js', '/recovery-status.js', '/style.css', '/tonconnect-ui.min.js', '/icon.png', '/curve-two-preflight.json'].includes(path)) return env.ASSETS.fetch(request);
  return json({error:'Unavailable; financial actions are disabled'},404);
}
export default {
  async fetch(request,env) {
    let result; try { result=await route(request,env); } catch { result=json({error:'Request failed safely'},503); }
    const headers=new Headers(result.headers);
    headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://config.ton.org https://*.tonconnect.org https://*.tonapi.io https://*.tonkeeper.com https://*.tonhubapi.com https://tonconnectbridge.mytonwallet.org https://walletbot.me https://raw.githubusercontent.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    headers.set('X-Content-Type-Options','nosniff'); headers.set('Referrer-Policy','no-referrer');
    headers.set('Strict-Transport-Security','max-age=31536000');
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    return new Response(result.body,{status:result.status,headers});
  }
};
