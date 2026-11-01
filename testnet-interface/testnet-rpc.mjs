import {minterEmulation} from './minter-emulation.mjs';
import {OPERATOR,MINTER,TESTNET_RPC} from './config.mjs';
const TTL=3000,SPACING=1200;
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}});
export function retryAfter(value,now=Date.now()){
 if(!value)return 0;
 if(/^\d+(?:\.\d+)?$/.test(value))return Math.ceil(Number(value)*1000);
 const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):0;
}
// The named object serializes all Pages instances. Only two fixed account reads
// and the pinned invalid-signature minter emulation are supported, never sends.
export class TestnetReads {
 constructor(state,env){this.state=state;this.env=env;this.tail=Promise.resolve();this.inflight=new Map();}
 async fetch(request){
  let input;try{input=await request.json();}catch{return json({error:'Invalid read'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input)||input.network!=='-3'||!['operator','minter','fees'].includes(input.account)||typeof input.fresh!=='boolean'||Object.keys(input).some(k=>!['network','account','fresh'].includes(k)))return json({error:'Read not permitted'},400);
  // Same-account readers share only an unfinished provider observation, never
  // a previously completed cached read when fresh=true.
  const key=request.headers.get('X-Internal-Testnet-Key')?.trim()||this.env.TONCENTER_TESTNET_API_KEY?.trim();
  const inflightKey=input.account+':'+input.fresh+':'+(key||'anonymous');let pending=this.inflight.get(inflightKey);
  if(!pending){pending=this.tail.then(()=>this.read(input,key));this.tail=pending.catch(()=>{});this.inflight.set(inflightKey,pending);pending.finally(()=>{if(this.inflight.get(inflightKey)===pending)this.inflight.delete(inflightKey);}).catch(()=>{});}
  const result=await pending;return json(result.body,result.status,result.headers);
 }
 async read(input,key){
  const now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const cached=await this.state.storage.get('account:'+input.account);
  if(!input.fresh&&cached&&now()-cached.observedAt<TTL)return {status:200,body:{...cached,network:'-3',dataStatus:'SHORT_LIVED_CACHE',ageMs:now()-cached.observedAt}};
  // Explicitly no fallback to a Mainnet key, TONAPI_KEY, URL parameter or client key.
  const headers={'Content-Type':'application/json',...(key?{'X-API-Key':key}:{})};
  const emulation=input.account==='fees'?await minterEmulation():null;
  let gate=await this.state.storage.get('gate')||{nextAt:0,failures:0};
  let reason='PROVIDER_TRANSPORT',status=503;
  for(let attempt=0;attempt<2;attempt++){
   const delay=Math.max(0,gate.nextAt-now());
   if(delay>2000)return this.unavailable(gate,status===429?429:gate.status||503,gate.reason||reason,cached);
   if(delay)await wait(delay);
   await this.state.storage.put('gate',{...gate,nextAt:now()+SPACING});
   try{
    const response=await fetch(emulation?'https://testnet.toncenter.com/api/emulate/v1/emulateTrace':TESTNET_RPC+'/jsonRPC',{method:'POST',headers,body:JSON.stringify(emulation?emulation.request:{jsonrpc:'2.0',id:1,method:'getAddressInformation',params:{address:input.account==='operator'?OPERATOR:MINTER}}),redirect:'manual',signal:AbortSignal.timeout(8000)});
    let data;try{data=await response.json();}catch{data=null;}
    const code=response.ok&&data?.ok===false?Number(data.code):response.status;
    if(response.ok&&(emulation?data?.is_incomplete===false&&data.transactions&&typeof data.transactions==='object':data?.ok===true&&/^\d+$/.test(String(data.result?.balance))&&['active','uninitialized','frozen'].includes(data.result?.state))){
     const value={...(emulation?{trace:data,bodyHash:emulation.bodyHash,validUntil:emulation.validUntil}:{account:data.result}),observedAt:now(),observedUtc:new Date().toISOString(),authentication:key?'TESTNET_KEY_ACCEPTED':'ANONYMOUS'};
     await this.state.storage.put('account:'+input.account,value);await this.state.storage.put('gate',{nextAt:now()+SPACING,failures:0});
     return {status:200,body:{...value,network:'-3',dataStatus:'FRESH_PROVIDER_OBSERVATION',ageMs:0}};
    }
    status=code===429?429:503;
    reason=code===401?'TESTNET_KEY_INVALID':code===403?'TESTNET_KEY_NETWORK_FORBIDDEN':code===429?'PROVIDER_RATE_LIMITED':code===503?'PROVIDER_HTTP_503':'PROVIDER_RESPONSE_REJECTED';
    gate={failures:gate.failures+1,nextAt:now()+Math.max(SPACING*Math.pow(2,Math.min(gate.failures,6)),retryAfter(response.headers.get('Retry-After'))),status,reason};
    await this.state.storage.put('gate',gate);
    if(![429,503].includes(code))break;
   }catch{
    status=503;reason='PROVIDER_TRANSPORT';gate={failures:gate.failures+1,nextAt:now()+SPACING*Math.pow(2,Math.min(gate.failures,6)),status,reason};await this.state.storage.put('gate',gate);
   }
  }
  return this.unavailable(gate,status,reason,cached);
 }
 unavailable(gate,status,reason,cached){const seconds=Math.max(1,Math.ceil((gate.nextAt-Date.now())/1000));return {status,headers:{'Retry-After':String(seconds)},body:{error:'Testnet provider unavailable; balance unknown',network:'-3',reason,retryAfterSeconds:seconds,dataStatus:cached?'STALE_NOT_SERVED':'UNAVAILABLE',lastObservationUtc:cached?.observedUtc}};}
}
export async function accountRead(env,account,fresh){
 if(!env.TESTNET_READS)return json({error:'Testnet read scheduler not configured',reason:'READ_SERVICE_MISSING',network:'-3',dataStatus:'UNAVAILABLE'},503);
 return env.TESTNET_READS.get(env.TESTNET_READS.idFromName('toncenter-testnet-readonly-v1')).fetch(new Request('https://testnet-read.internal/',{method:'POST',headers:env.TONCENTER_TESTNET_API_KEY?.trim()?{'X-Internal-Testnet-Key':env.TONCENTER_TESTNET_API_KEY.trim()}:{},body:JSON.stringify({network:'-3',account,fresh})}));
}
