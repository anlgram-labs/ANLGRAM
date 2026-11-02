import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('real Pages binding passes its secret internally; both provider cooldowns survive workerd restart',async()=>{
 const persist=mkdtempSync(join(tmpdir(),'anlgram-testnet-reads-'));let count=0,secondaryCount=0,rateLimit=false;
 const make=()=>{
  const options=convertV4MiniflareOptions({workers:[
   {name:'pages',scriptPath:fileURLToPath(new URL('../.pages-worker-build/pages-entry.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],bindings:{APP_ORIGIN:'https://testnet.anlgram.com',TONCENTER_TESTNET_API_KEY:'fixture-pages-testnet-key'},durableObjects:{TESTNET_READS:{className:'TestnetReads',scriptName:'storage',useSQLite:true}}},
   {name:'storage',scriptPath:fileURLToPath(new URL('../.worker-build/worker.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],durableObjects:{TESTNET_READS:{className:'TestnetReads',useSQLite:true}},outboundService:async request=>{if(request.url.startsWith('https://testnet.tonapi.io/')){secondaryCount++;assert.equal(request.headers.get('X-API-Key'),null);return new Response(null,{status:429,headers:{'Retry-After':'30'}});}count++;assert.equal(request.url,'https://testnet.toncenter.com/api/v2/jsonRPC');assert.equal(request.headers.get('X-API-Key'),'fixture-pages-testnet-key');if(rateLimit)return new Response(null,{status:429,headers:{'Retry-After':'30'}});return Response.json({ok:true,result:{balance:'1999999999',state:'uninitialized'}});}}
  ]});options.resourcePersistencePath=persist;return new Miniflare(options);
 };
 let mf=make();
 try{
  const url='https://testnet.anlgram.com/api/operator';const r=await Promise.all(Array.from({length:5},()=>mf.dispatchFetch(url)));assert(r.every(x=>x.status===200));assert.equal(count,1);for(const response of r){const j=await response.json();assert.equal(j.authentication,'TESTNET_KEY_ACCEPTED');assert(!JSON.stringify(j).includes('fixture-pages-testnet-key'));}
  rateLimit=true;const ns=await mf.getDurableObjectNamespace('TESTNET_READS','storage'),stub=ns.get(ns.idFromName('toncenter-testnet-readonly-v1'));
  const failure=await stub.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'fixture-pages-testnet-key'},body:JSON.stringify({network:'-3',account:'operator',fresh:true})}));assert.equal(failure.status,429);assert.equal(count,2);
  const secondary=await stub.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'operatorSecondary',fresh:true})}));assert.equal(secondary.status,429);assert.equal((await secondary.json()).provider,'TONAPI_TESTNET');assert.equal(secondaryCount,1);assert.equal(count,2);
 }finally{await mf.dispose();}
 mf=make();try{
  const r=await mf.dispatchFetch('https://testnet.anlgram.com/api/preflight/accounts',{method:'POST',headers:{Origin:'https://testnet.anlgram.com','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,429);assert.equal(count,2);const j=await r.json();assert.equal(j.dataStatus,'STALE_NOT_SERVED');assert.equal(j.balanceNano,undefined);
  const ns=await mf.getDurableObjectNamespace('TESTNET_READS','storage'),stub=ns.get(ns.idFromName('toncenter-testnet-readonly-v1'));const secondary=await stub.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'operatorSecondary',fresh:true})}));assert.equal(secondary.status,429);assert.equal(secondaryCount,1);assert.equal((await secondary.json()).provider,'TONAPI_TESTNET');
 }finally{await mf.dispose();}
});
