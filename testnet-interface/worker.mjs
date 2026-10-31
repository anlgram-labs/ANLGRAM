import { approvedOrigin, CHAIN, MINTER, OPERATOR, TESTNET_RPC, TTL } from './config.mjs';
import { verifyProof } from './proof.mjs';

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
    return accepted ? json({verified:true,address:OPERATOR,network:CHAIN,expiresAt:current.expiresAt,
      scope:'OWNERSHIP_ONLY',financialSigningEnabled:false,replayIsolationVerified:false}) : json({error:'Expired/replayed proof'},401);
  }
  async alarm() { await this.state.storage.deleteAll(); }
}

async function route(request,env) {
  let origin; try { origin=approvedOrigin(env.APP_ORIGIN); } catch { return json({error:'Origin not approved'},503); }
  const u=new URL(request.url);
  if (u.origin!==origin.origin) return json({error:'Wrong Testnet origin'},403);
  if (u.search) return json({error:'Query overrides are forbidden'},400);
  const path=u.pathname;
  if (request.method==='GET' && path==='/tonconnect-manifest.json') return json({url:origin.origin+'/',name:'ANLGRAM TESTNET ONLY — ownership proof',iconUrl:origin.origin+'/icon.png'},200,{'Access-Control-Allow-Origin':'*'});
  if (request.method==='GET' && path==='/api/config') return json({network:CHAIN,operator:OPERATOR,minter:MINTER,
    manifestUrl:origin.origin+'/tonconnect-manifest.json',financialSigningEnabled:false,replayIsolationVerified:false});
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
    try {
      const response=await fetch(TESTNET_RPC+'/getAddressInformation?address='+encodeURIComponent(OPERATOR),{redirect:'error',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw Error();
      const data=await response.json(), account=data.result;
      if (data.ok!==true || !/^\d+$/.test(String(account?.balance))) throw Error();
      return json({network:CHAIN,address:OPERATOR,balanceNano:String(account.balance),state:account.state,source:'TON Center Testnet',observedUtc:new Date().toISOString(),verification:'PROVIDER_OBSERVATION'});
    } catch { return json({error:'Testnet provider unavailable; balance unknown'},503); }
  }
  if (request.method==='GET' && ['/', '/app.js', '/style.css', '/tonconnect-ui.min.js', '/icon.png'].includes(path)) return env.ASSETS.fetch(request);
  return json({error:'Unavailable; financial actions are disabled'},404);
}
export default {
  async fetch(request,env) {
    let result; try { result=await route(request,env); } catch { result=json({error:'Request failed safely'},503); }
    const headers=new Headers(result.headers);
    headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.tonconnect.org https://*.tonapi.io https://*.tonkeeper.com https://*.tonhubapi.com https://raw.githubusercontent.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    headers.set('X-Content-Type-Options','nosniff'); headers.set('Referrer-Policy','no-referrer');
    headers.set('Strict-Transport-Security','max-age=31536000');
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    return new Response(result.body,{status:result.status,headers});
  }
};
