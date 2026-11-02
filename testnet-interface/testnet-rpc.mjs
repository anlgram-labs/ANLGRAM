import {buildRecoveryEmulation} from './recovery/emulation.mjs';
import {RECOVERY,pinned} from './recovery/policy.mjs';
import candidate from '../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {curveEmulation} from './curve-emulation.mjs';
import curveIntent from './curve-two-intent.json' with {type:'json'};
import {minterEmulation} from './minter-emulation.mjs';
import {OPERATOR,MINTER,TESTNET_RPC} from './config.mjs';
const TTL=3000,SPACING=1200;
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}});
async function rawAccountJson(response){
 const reader=response.body?.getReader();if(!reader)throw Error('Missing raw account response');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288)throw Error('Raw account response too large');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));
}
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
  if(!input||typeof input!=='object'||Array.isArray(input)||input.network!=='-3'||!['operator','minter','fees','curve','jettonData','curveFees','curveWallet','buyerWallet','recoveryFees','operatorSecondary','operatorRaw','operatorRawSecondary','operatorHistory','operatorHistorySecondary','recoveryMasterBlock'].includes(input.account)||typeof input.fresh!=='boolean'||Object.keys(input).some(k=>!['network','account','fresh','validUntil','referenceSeqno'].includes(k)))return json({error:'Read not permitted'},400);
  if(input.account==='recoveryMasterBlock'?(input.fresh!==true||!Number.isSafeInteger(input.referenceSeqno)||input.referenceSeqno<1||input.referenceSeqno>0xffffffff):input.referenceSeqno!==undefined)return json({error:'Invalid fixed masterchain reference'},400);
  if(input.validUntil!==undefined&&(!['curveFees','recoveryFees'].includes(input.account)||input.fresh!==true||!Number.isSafeInteger(input.validUntil)||input.validUntil<=Math.floor(Date.now()/1000)||input.validUntil>Math.floor(Date.now()/1000)+90))return json({error:'Invalid server quote deadline'},400);
  if(input.account==='recoveryFees'&&(!input.fresh||input.validUntil===undefined))return json({error:'Exact recovery deadline required'},400);
  // Same-account readers share only an unfinished provider observation, never
  // a previously completed cached read when fresh=true.
  const secondary=['operatorSecondary','operatorRawSecondary','operatorHistorySecondary'].includes(input.account);
  const key=secondary?(request.headers.get('X-Internal-Tonapi-Testnet-Key')?.trim()||this.env.TONAPI_TESTNET_API_KEY?.trim()):(request.headers.get('X-Internal-Testnet-Key')?.trim()||this.env.TONCENTER_TESTNET_API_KEY?.trim());
  const inflightKey=input.account+':'+input.fresh+':'+(input.validUntil??input.referenceSeqno??'default')+':'+(key||'anonymous');let pending=this.inflight.get(inflightKey);
  if(!pending){pending=this.tail.then(()=>this.read(input,key));this.tail=pending.catch(()=>{});this.inflight.set(inflightKey,pending);pending.finally(()=>{if(this.inflight.get(inflightKey)===pending)this.inflight.delete(inflightKey);}).catch(()=>{});}
  const result=await pending;return json(result.body,result.status,result.headers);
 }
 async read(input,key){
  const secondary=['operatorSecondary','operatorRawSecondary','operatorHistorySecondary'].includes(input.account),rawState=['operatorRaw','operatorRawSecondary'].includes(input.account),history=['operatorHistory','operatorHistorySecondary'].includes(input.account),reference=input.account==='recoveryMasterBlock',gateKey=secondary?'gate:tonapi':'gate',spacing=secondary?2000:SPACING;
  const now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const cached=await this.state.storage.get('account:'+input.account);
  if(!input.fresh&&cached&&now()-cached.observedAt<TTL)return {status:200,body:{...cached,network:'-3',dataStatus:'SHORT_LIVED_CACHE',ageMs:now()-cached.observedAt}};
  // Explicitly no fallback to a Mainnet key, TONAPI_KEY, URL parameter or client key.
  const headers=secondary?{'Accept':'application/json',...(key?{'Authorization':'Bearer '+key}:{})}:{'Content-Type':'application/json',...(key?{'X-API-Key':key}:{})};
  const emulation=input.account==='fees'?await minterEmulation():input.account==='curveFees'?await curveEmulation(input.validUntil):input.account==='recoveryFees'?await buildRecoveryEmulation(RECOVERY,pinned.oldSeqno,input.validUntil):null;
  const getter=input.account==='jettonData';
  const rpc={jsonrpc:'2.0',id:1,method:getter?'runGetMethod':'getAddressInformation',params:getter?{address:MINTER,method:'get_jetton_data',stack:[]}:{address:input.account==='operator'?OPERATOR:input.account==='curve'?curveIntent.message.address:input.account==='curveWallet'?candidate.curveJettonWallet:input.account==='buyerWallet'?candidate.buyerJettonWallet:MINTER}};
  if(input.account==='operatorRaw'){rpc.method='getShardAccountCell';rpc.params={address:OPERATOR};}
  if(reference){rpc.method='lookupBlock';rpc.params={workchain:-1,shard:'-9223372036854775808',seqno:input.referenceSeqno};}
  // Current tip history does not require a forced archive node. Missing/pruned
  // rows remain unavailable; never fabricate history or silently change sources.
  if(history){rpc.method='getTransactions';rpc.params={address:OPERATOR,limit:16,archival:false};}
  let gate=await this.state.storage.get(gateKey)||{nextAt:0,failures:0};
  let reason='PROVIDER_TRANSPORT',status=503;
  for(let attempt=0;attempt<2;attempt++){
   const delay=Math.max(0,gate.nextAt-now());
   if(delay>2000)return this.unavailable(gate,status===429?429:gate.status||503,gate.reason||reason,cached);
   if(delay)await wait(delay);
   await this.state.storage.put(gateKey,{...gate,nextAt:now()+spacing});
   try{
    const response=await fetch(secondary?'https://testnet.tonapi.io/v2/'+(rawState?'liteserver/get_account_state/':'blockchain/accounts/')+OPERATOR+(history?'/transactions?limit=16&sort_order=desc':''):emulation?'https://testnet.toncenter.com/api/emulate/v1/emulateTrace':TESTNET_RPC+'/jsonRPC',{method:secondary?'GET':'POST',headers,...(secondary?{}:{body:JSON.stringify(emulation?(emulation.request||{boc:emulation.boc,ignore_chksig:true,include_code_data:true,with_actions:false}):rpc)}),redirect:'manual',signal:AbortSignal.timeout(8000)});
    let data;try{data=rawState||history||reference?await rawAccountJson(response):await response.json();}catch{data=null;}
    const code=response.ok&&data?.ok===false?Number(data.code):response.status;
    if(response.ok&&(reference?data?.ok===true&&data.result?.workchain===-1&&data.result.seqno===input.referenceSeqno:history?secondary?Array.isArray(data?.transactions)&&data.transactions.length<=16:data?.ok===true&&Array.isArray(data.result)&&data.result.length<=16:rawState?secondary?typeof data?.state==='string'&&/^[a-f0-9]+$/i.test(data.state)&&data.state.length<131072&&data.id?.workchain===-1&&Number.isSafeInteger(data.id?.seqno):data?.ok===true&&typeof data.result?.bytes==='string'&&data.result.bytes.length<131072:secondary?data?.address===OPERATOR&&data.status==='active'&&/^\d+$/.test(String(data.balance))&&typeof data.code==='string'&&typeof data.data==='string'&&/^[a-f0-9]{64}$/.test(data.last_transaction_hash||''):emulation?data?.is_incomplete===false&&data.transactions&&typeof data.transactions==='object':data?.ok===true&&(getter?data.result?.exit_code===0&&Array.isArray(data.result?.stack)&&data.result.stack.length===5:/^\d+$/.test(String(data.result?.balance))&&['active','uninitialized','frozen'].includes(data.result?.state)))){
     const value={...(reference?{referenceBlock:data.result}:history?{history:secondary?data.transactions:data.result}:rawState?{rawAccount:secondary?data:data.result}:secondary?{independentAccount:data}:emulation?{trace:data,bodyHash:emulation.bodyHash,validUntil:emulation.validUntil??input.validUntil}:getter?{getterResult:data.result}:{account:data.result}),observedAt:now(),observedUtc:new Date().toISOString(),provider:secondary?'TONAPI_TESTNET':'TONCENTER_TESTNET',authentication:secondary?(key?'TESTNET_TONAPI_KEY_ACCEPTED':'ANONYMOUS_TESTNET_TONAPI'):key?'TESTNET_KEY_ACCEPTED':'ANONYMOUS'};
     await this.state.storage.put('account:'+input.account,value);await this.state.storage.put(gateKey,{nextAt:now()+spacing,failures:0});
     return {status:200,body:{...value,network:'-3',dataStatus:'FRESH_PROVIDER_OBSERVATION',ageMs:0}};
    }
    status=code===429?429:503;
    reason=code===401?(secondary?'TESTNET_TONAPI_KEY_INVALID':'TESTNET_KEY_INVALID'):code===403?(secondary?'TESTNET_TONAPI_KEY_FORBIDDEN':'TESTNET_KEY_NETWORK_FORBIDDEN'):code===429?'PROVIDER_RATE_LIMITED':code===503?'PROVIDER_HTTP_503':'PROVIDER_RESPONSE_REJECTED';
    gate={failures:gate.failures+1,nextAt:now()+Math.max(spacing*Math.pow(2,Math.min(gate.failures,6)),retryAfter(response.headers.get('Retry-After'))),status,reason,provider:secondary?'TONAPI_TESTNET':'TONCENTER_TESTNET'};
    await this.state.storage.put(gateKey,gate);
    if(![429,503].includes(code))break;
   }catch{
    status=503;reason='PROVIDER_TRANSPORT';gate={failures:gate.failures+1,nextAt:now()+spacing*Math.pow(2,Math.min(gate.failures,6)),status,reason,provider:secondary?'TONAPI_TESTNET':'TONCENTER_TESTNET'};await this.state.storage.put(gateKey,gate);
   }
  }
  return this.unavailable(gate,status,reason,cached);
 }
 unavailable(gate,status,reason,cached){const seconds=Math.max(1,Math.ceil((gate.nextAt-Date.now())/1000));return {status,headers:{'Retry-After':String(seconds)},body:{error:'Testnet provider unavailable; balance unknown',network:'-3',provider:gate.provider||'TONCENTER_TESTNET',reason,retryAfterSeconds:seconds,dataStatus:cached?'STALE_NOT_SERVED':'UNAVAILABLE',lastObservationUtc:cached?.observedUtc}};}
}
export async function accountRead(env,account,fresh,validUntil,referenceSeqno){
 if(!env.TESTNET_READS)return json({error:'Testnet read scheduler not configured',reason:'READ_SERVICE_MISSING',network:'-3',dataStatus:'UNAVAILABLE'},503);
 return env.TESTNET_READS.get(env.TESTNET_READS.idFromName('toncenter-testnet-readonly-v1')).fetch(new Request('https://testnet-read.internal/',{method:'POST',headers:{...(env.TONCENTER_TESTNET_API_KEY?.trim()?{'X-Internal-Testnet-Key':env.TONCENTER_TESTNET_API_KEY.trim()}:{}),...(env.TONAPI_TESTNET_API_KEY?.trim()?{'X-Internal-Tonapi-Testnet-Key':env.TONAPI_TESTNET_API_KEY.trim()}: {})},body:JSON.stringify({network:'-3',account,fresh,...(validUntil===undefined?{}:{validUntil}),...(referenceSeqno===undefined?{}:{referenceSeqno})})}));
}
