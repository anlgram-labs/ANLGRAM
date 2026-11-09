import {test} from 'node:test';import assert from 'node:assert/strict';
import {TestnetReads,accountRead} from '../testnet-rpc.mjs';import {OPERATOR} from '../config.mjs';
const account={address:OPERATOR,status:'active',balance:'1000000000',code:'controlled-code',data:'controlled-data',last_transaction_hash:'11'.repeat(32)};
function fixture(){const m=new Map(),state={storage:{get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v))}},object=new TestnetReads(state,{});return{state,object,call:(name,fresh=true,headers={})=>object.fetch(new Request('https://internal/',{method:'POST',headers,body:JSON.stringify({network:'-3',account:name,fresh})}))};}
async function controlled(fn){const saved={fetch,now:Date.now,timer:setTimeout};let t=Date.now();Date.now=()=>t;globalThis.setTimeout=(f,ms)=>{t+=ms;queueMicrotask(f);return 0;};try{await fn(ms=>{t+=ms;});}finally{globalThis.fetch=saved.fetch;Date.now=saved.now;globalThis.setTimeout=saved.timer;}}

test('anonymous TonAPI spacing respects documented four-second quota without removing persistent gates or fresh-read checks',()=>controlled(async()=>{
 const h=fixture(),times=[];globalThis.fetch=async()=>{times.push(Date.now());return Response.json(account);};
 assert.equal((await h.call('operatorSecondary')).status,200);assert.equal((await h.call('operatorSecondary')).status,200);assert(times[1]-times[0]>=4200);
 const keyed=fixture(),authorized=[];globalThis.fetch=async(_url,o)=>{assert.equal(o.headers.Authorization,'Bearer TESTNET_ONLY');authorized.push(Date.now());return Response.json(account);};
 const headers={'X-Internal-Tonapi-Testnet-Key':'TESTNET_ONLY'};assert.equal((await keyed.call('operatorSecondary',true,headers)).status,200);assert.equal((await keyed.call('operatorSecondary',true,headers)).status,200);assert(authorized[1]-authorized[0]>=2000);
}));
test('independent provider cooldown persists but cannot poison authenticated TON Center reads; no stale secondary fallback',()=>controlled(async advance=>{
 const h=fixture();let secondary=0,primary=0,limited=false;globalThis.fetch=async(url,o)=>{if(url.startsWith('https://testnet.tonapi.io/')){secondary++;assert.equal(o.method,'GET');assert.equal(o.redirect,'manual');if(limited)return new Response(null,{status:429,headers:{'Retry-After':'30'}});return Response.json(account);}primary++;assert.equal(o.headers['X-API-Key'],'LOCAL_CENTER_KEY');return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});};
 assert.equal((await h.call('operatorSecondary')).status,200);advance(4000);limited=true;const r=await h.call('operatorSecondary');assert.equal(r.status,429);const j=await r.json();assert.equal(j.provider,'TONAPI_TESTNET');assert.equal(j.dataStatus,'STALE_NOT_SERVED');assert.equal(j.independentAccount,undefined);assert.equal(secondary,2);
 const restarted=new TestnetReads(h.state,{});assert.equal((await restarted.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'operatorSecondary',fresh:true})}))).status,429);assert.equal(secondary,2);
 assert.equal((await h.call('operator',true,{'X-Internal-Testnet-Key':'LOCAL_CENTER_KEY'})).status,200);assert.equal(primary,1);assert.equal(secondary,2);
 advance(31000);limited=false;assert.equal((await h.call('operatorSecondary')).status,200);assert.equal(secondary,3);
}));
test('secondary requests deduplicate/cache with exact labels; optional Testnet key never crosses provider boundary or leaks',()=>controlled(async()=>{
 const h=fixture();let calls=0;const headers={'X-Internal-Testnet-Key':'LOCAL_CENTER_KEY','X-Internal-Tonapi-Testnet-Key':'LOCAL_TONAPI_KEY'};
 globalThis.fetch=async(url,o)=>{calls++;assert.equal(url,'https://testnet.tonapi.io/v2/blockchain/accounts/'+OPERATOR);assert.equal(o.headers.Authorization,'Bearer LOCAL_TONAPI_KEY');assert.equal(o.headers['X-API-Key'],undefined);assert(!JSON.stringify(o).includes('LOCAL_CENTER_KEY'));return Response.json(account);};
 const replies=await Promise.all(Array.from({length:8},()=>h.call('operatorSecondary',true,headers)));assert(replies.every(r=>r.status===200));assert.equal(calls,1);const body=await replies[0].json();assert.equal(body.authentication,'TESTNET_TONAPI_KEY_ACCEPTED');assert(!JSON.stringify(body).includes('LOCAL_TONAPI_KEY'));
 assert.equal((await(await h.call('operatorSecondary',false,headers)).json()).dataStatus,'SHORT_LIVED_CACHE');assert.equal(calls,1);assert.equal((await(await h.call('operatorSecondary',true,headers)).json()).dataStatus,'FRESH_PROVIDER_OBSERVATION');assert.equal(calls,2);
}));
test('Pages forwards separate encrypted binding names internally; anonymous secondary never uses Mainnet or TON Center keys',()=>controlled(async()=>{
 const h=fixture();const env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:r=>h.object.fetch(r)})},TONCENTER_TESTNET_API_KEY:'LOCAL_CENTER_KEY',TONAPI_KEY:'DO_NOT_USE_MAINNET_KEY'};
 globalThis.fetch=async(url,o)=>{assert.equal(o.headers.Authorization,undefined);assert.equal(o.headers['X-API-Key'],undefined);assert(!JSON.stringify(o).includes('DO_NOT_USE_MAINNET_KEY'));assert(!JSON.stringify(o).includes('LOCAL_CENTER_KEY'));return Response.json(account);};
 const r=await accountRead(env,'operatorSecondary',true);assert.equal(r.status,200);assert.equal((await r.json()).authentication,'ANONYMOUS_TESTNET_TONAPI');
}));
test('secondary bounded retry distinguishes invalid credentials/outages and refuses arbitrary accounts or messages',()=>controlled(async()=>{
 for(const [status,reason]of [[401,'TESTNET_TONAPI_KEY_INVALID'],[403,'TESTNET_TONAPI_KEY_FORBIDDEN'],[503,'PROVIDER_HTTP_503']]){const h=fixture();let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status});};const r=await h.call('operatorSecondary'),j=await r.json();assert.equal(r.status,503);assert.equal(j.reason,reason);assert.equal(j.provider,'TONAPI_TESTNET');assert.equal(j.independentAccount,undefined);assert(calls<3);}
 const h=fixture();for(const b of [{network:'-239',account:'operatorSecondary',fresh:true},{network:'-3',account:'operatorSecondary',fresh:true,address:OPERATOR},{network:'-3',account:'operatorSecondary',fresh:true,method:'sendBoc'}])assert.equal((await h.object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify(b)}))).status,400);
}));
