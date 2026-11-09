import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import {TestnetReads,retryAfter} from '../testnet-rpc.mjs';
import {OPERATOR,TESTNET_RPC} from '../config.mjs';
function harness(key){
 const values=new Map(),state={storage:{get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))}};
 const object=new TestnetReads(state,{});
 const read=(fresh=false,account='operator')=>object.fetch(new Request('https://internal/',{method:'POST',headers:key?{'X-Internal-Testnet-Key':key}:{},body:JSON.stringify({network:'-3',account,fresh})}));
 const env={APP_ORIGIN:'https://testnet.anlgram.com',TONCENTER_TESTNET_API_KEY:key,TONAPI_KEY:'wrong-provider',TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:r=>object.fetch(r)})}};
 return{values,state,object,read,env};
}
async function controlled(fn){const original={fetch:globalThis.fetch,now:Date.now,timer:globalThis.setTimeout};let time=1900000000000;Date.now=()=>time;globalThis.setTimeout=(fn,ms)=>{time+=ms;queueMicrotask(fn);return 0;};try{await fn(ms=>{time+=ms;});}finally{globalThis.fetch=original.fetch;Date.now=original.now;globalThis.setTimeout=original.timer;}}
const ok=()=>Response.json({ok:true,result:{balance:'123456789123456789',state:'uninitialized',last_transaction_id:{hash:'fixture'}}});

test('Pages environment key reaches fixed Testnet upstream only; display cache labeled, fresh bypasses cache',()=>controlled(async()=>{
 const h=harness('fixture-testnet-key');let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,TESTNET_RPC+'/jsonRPC');assert.equal(options.redirect,'manual');assert.equal(options.headers['X-API-Key'],'fixture-testnet-key');assert.deepEqual(JSON.parse(options.body),{jsonrpc:'2.0',id:1,method:'getAddressInformation',params:{address:OPERATOR}});return ok();};
 const request=()=>new Request('https://testnet.anlgram.com/api/operator');
 let r=await worker.fetch(request(),h.env),data=await r.json();assert.equal(r.status,200);assert.equal(data.balanceNano,'123456789123456789');assert.equal(data.network,'-3');assert.equal(data.authentication,'TESTNET_KEY_ACCEPTED');assert(!JSON.stringify(data).includes('fixture-testnet-key'));
 r=await worker.fetch(request(),h.env);assert.equal((await r.json()).dataStatus,'SHORT_LIVED_CACHE');assert.equal(calls,1);
 assert.equal((await(await h.read(true)).json()).dataStatus,'FRESH_PROVIDER_OBSERVATION');assert.equal(calls,2);
}));
test('missing key is accurately anonymous and never falls back to TonAPI',()=>controlled(async()=>{
 const h=harness();globalThis.fetch=async(_,o)=>{assert.equal(o.headers['X-API-Key'],undefined);assert(!JSON.stringify(o).includes('wrong-provider'));return ok();};assert.equal((await(await h.read()).json()).authentication,'ANONYMOUS');
}));
test('concurrent identical reads deduplicate one provider invocation',()=>controlled(async()=>{
 const h=harness('fixture');let calls=0;globalThis.fetch=async()=>{calls++;await Promise.resolve();return ok();};const replies=await Promise.all(Array.from({length:12},()=>h.read(true)));assert(replies.every(r=>r.status===200));assert.equal(calls,1);
}));
test('distinct reads are serialized with minimum spacing',()=>controlled(async()=>{
 const h=harness('fixture'),times=[];globalThis.fetch=async()=>{times.push(Date.now());return ok();};await Promise.all([h.read(true),h.read(true,'minter')]);assert.equal(times.length,2);assert(times[1]-times[0]>=1200);
}));
test('429 Retry-After survives object recreation; stale balance never replaces a fresh failure',()=>controlled(async advance=>{
 const h=harness('fixture');globalThis.fetch=async()=>ok();await h.read();advance(4000);let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'30'}});};let r=await h.read(true),j=await r.json();assert.equal(r.status,429);assert.equal(j.dataStatus,'STALE_NOT_SERVED');assert.equal(j.account,undefined);assert.equal(j.balanceNano,undefined);assert.equal(j.retryAfterSeconds,30);assert.equal(calls,1);
 const second=new TestnetReads(h.state,{});r=await second.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'operator',fresh:true})}));assert.equal(r.status,429);assert.equal(calls,1);
 advance(30001);globalThis.fetch=async()=>{calls++;return ok();};assert.equal((await h.read(true)).status,200);assert.equal(calls,2);assert.equal(h.values.get('gate').failures,0);
}));
test('bounded read retry recovers; exponential backoff stops repeated outages',()=>controlled(async()=>{
 const h=harness('fixture');let calls=0;globalThis.fetch=async()=>++calls===1?new Response(null,{status:429}):ok();assert.equal((await h.read(true)).status,200);assert.equal(calls,2);
 globalThis.fetch=async()=>{calls++;return new Response(null,{status:503});};let r=await h.read(true);assert.equal(r.status,503);assert.equal((await r.json()).reason,'PROVIDER_HTTP_503');assert.equal(calls,4);assert.equal(h.values.get('gate').failures,2);assert(h.values.get('gate').nextAt-Date.now()>=2400);assert.equal((await h.read(true)).status,503);assert.equal(calls,4);
}));
test('invalid key and wrong-network key are distinct failures without anonymous fallback or retry',()=>controlled(async()=>{
 for(const [status,reason]of [[401,'TESTNET_KEY_INVALID'],[403,'TESTNET_KEY_NETWORK_FORBIDDEN']]){const h=harness('fixture');let calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status});};const r=await h.read(true),j=await r.json();assert.equal(r.status,503);assert.equal(j.reason,reason);assert.equal(j.account,undefined);assert.equal(calls,1);}
}));
test('JSON RPC 429, malformed responses and transport errors never return invented balances',()=>controlled(async()=>{
 for(const reply of [()=>Response.json({ok:false,code:429}),()=>Response.json({ok:true,result:{balance:'bad'}}),()=>{throw Error('offline');}]){const h=harness();globalThis.fetch=async()=>reply();const r=await h.read(true),j=await r.json();assert([429,503].includes(r.status));assert.equal(j.account,undefined);}
}));
test('Mainnet, arbitrary methods, financial payloads and foreign origins fail closed',async()=>{
 const h=harness();for(const input of [{network:'-239',account:'operator',fresh:true},{network:'-3',account:'other',fresh:true},{network:'-3',account:'operator',fresh:true,method:'sendBoc'},{network:'-3',account:'operator',fresh:'yes'}])assert.equal((await h.object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify(input)}))).status,400);
 assert.equal((await worker.fetch(new Request('https://testnet.anlgram.com/api/preflight/accounts',{method:'POST',headers:{Origin:'https://anlgram.com','Content-Type':'application/json'},body:'{}'}),h.env)).status,403);
});
test('missing binding fails closed; seconds and HTTP-date Retry-After respected',async()=>{
 const r=await worker.fetch(new Request('https://testnet.anlgram.com/api/operator'),{APP_ORIGIN:'https://testnet.anlgram.com'});assert.equal(r.status,503);assert.equal((await r.json()).reason,'READ_SERVICE_MISSING');assert.equal(retryAfter('30',0),30000);assert.equal(retryAfter(new Date(60000).toUTCString(),1000),59000);assert.equal(retryAfter('garbage',0),0);
});
// Server-only deadline is part of the deduplication key and exact emulator body.
test('Curve runtime deadlines reject caller extensions and emulate distinct deadlines without sharing the wrong fingerprint',()=>controlled(async()=>{
 const h=harness('fixture'),now=Math.floor(Date.now()/1000),base={network:'-3',account:'curveFees',fresh:true,validUntil:now+80};
 const run=b=>h.object.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'fixture'},body:JSON.stringify(b)}));
 for(const patch of [{validUntil:now},{validUntil:now+91},{validUntil:now+1.5},{account:'operator'},{fresh:false}])assert.equal((await run({...base,...patch})).status,400);
 let calls=0;const bodies=[];globalThis.fetch=async(_,o)=>{calls++;bodies.push(JSON.parse(o.body));return Response.json({is_incomplete:false,transactions:{}});};
 const first=await Promise.all([run(base),run(base)]);assert.equal(calls,1);const j=await first[0].json();assert.equal(j.validUntil,base.validUntil);
 const next=await(await run({...base,validUntil:now+79})).json();assert.equal(calls,2);assert.notEqual(next.bodyHash,j.bodyHash);assert.notDeepEqual(bodies[0],bodies[1]);
}));
