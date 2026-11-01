import execution from '../execution-version.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {intent,fingerprint} from '../minter-policy.mjs';
import {intent as curveIntent,fingerprint as curveFingerprint} from '../curve-policy.mjs';
test('real SQLite Durable Object admits one concurrent claim and survives process/runtime restart',async()=>{
 const persist=mkdtempSync(join(tmpdir(),'anlgram-operation-lock-'));
 const make=()=>{
  const options=convertV4MiniflareOptions({scriptPath:fileURLToPath(new URL('../.worker-build/worker.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],bindings:{APP_ORIGIN:'https://testnet.anlgram.com'},durableObjects:{OPERATIONS:{className:'FinancialOperation',useSQLite:true}}});options.resourcePersistencePath=persist;return new Miniflare(options);
 };
 const transaction={network:'-3',from:intent.operator,validUntil:Math.floor(Date.now()/1000)+110,messages:[structuredClone(intent.message)]},hash=await fingerprint(transaction);
 const claim=stub=>stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'claim',transaction,fingerprint:hash,requirePrepared:true})}));
 let mf=make(),ticket;
 try{
  const ns=await mf.getDurableObjectNamespace('OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));
  const prepared=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'prepare',transaction,approval:{fingerprint:hash,validUntil:transaction.validUntil,observedAt:Math.floor(Date.now()/1000)}})}));assert.equal(prepared.status,200);
  const results=await Promise.all([claim(stub),claim(stub),claim(stub)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409,409]);ticket=(await results.find(r=>r.status===200).json()).ticket;
  for(let i=0;i<2;i++)await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket,event:'UNKNOWN_OR_REJECTED'})}));
  const status=await(await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:'{"action":"status"}'}))).json();assert.deepEqual(status.events,['UNKNOWN_OR_REJECTED']);assert.equal(status.ticket,undefined);assert.equal(status.status,'LOCKED_PENDING_RECONCILIATION');
 }finally{await mf.dispose();}
 mf=make();try{
  const ns=await mf.getDurableObjectNamespace('OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));assert.equal((await claim(stub)).status,409);
  const forbidden=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket:'wrong',event:'WALLET_RESPONSE_UNVERIFIED'})}));assert.equal(forbidden.status,403);
 }finally{await mf.dispose();}
});

test('real Curve SQLite namespace is independent and survives concurrent claims and runtime restart',async()=>{
 const persist=mkdtempSync(join(tmpdir(),'anlgram-operation-lock-'));
 const make=()=>{
  const options=convertV4MiniflareOptions({scriptPath:fileURLToPath(new URL('../.worker-build/worker.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],bindings:{APP_ORIGIN:'https://testnet.anlgram.com'},durableObjects:{OPERATIONS:{className:'FinancialOperation',useSQLite:true},CURVE_OPERATIONS:{className:'CurveFinancialOperation',useSQLite:true}}});options.resourcePersistencePath=persist;return new Miniflare(options);
 };
 const transaction={network:'-3',from:curveIntent.operator,validUntil:Math.floor(Date.now()/1000)+110,messages:[structuredClone(curveIntent.message)]},hash=await curveFingerprint(transaction);
 const claim=stub=>stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'claim',transaction,fingerprint:hash,requirePrepared:true})}));
 let mf=make(),ticket;
 try{
  const ns=await mf.getDurableObjectNamespace('CURVE_OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));
  const oldNs=await mf.getDurableObjectNamespace('OPERATIONS'),old=oldNs.get(oldNs.idFromName('isolated-fixture-lifetime-operation'));assert.equal((await(await old.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'status'})}))).json()).status,'NOT_CLAIMED');
  const first={...transaction,messages:[intent.message]};await assert.rejects(stub.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'claim',transaction:first,fingerprint:await fingerprint(first)})})));
  const prepared=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'prepare',transaction,approval:{fingerprint:hash,validUntil:transaction.validUntil,observedAt:Math.floor(Date.now()/1000)}})}));assert.equal(prepared.status,200);
  const results=await Promise.all([claim(stub),claim(stub),claim(stub)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409,409]);ticket=(await results.find(r=>r.status===200).json()).ticket;
  for(let i=0;i<2;i++)await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket,event:'UNKNOWN_OR_REJECTED'})}));
  const status=await(await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:'{"action":"status"}'}))).json();assert.deepEqual(status.events,['UNKNOWN_OR_REJECTED']);assert.equal(status.ticket,undefined);assert.equal(status.status,'LOCKED_PENDING_RECONCILIATION');
 }finally{await mf.dispose();}
 mf=make();try{
  const ns=await mf.getDurableObjectNamespace('CURVE_OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));assert.equal((await claim(stub)).status,409);
  const forbidden=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket:'wrong',event:'WALLET_RESPONSE_UNVERIFIED'})}));assert.equal(forbidden.status,403);
 }finally{await mf.dispose();}
});

test('Curve runtime authorization and quote epochs persist in real SQLite; stale revision, grant rotation and restart never unlock a claim',async()=>{
 const persist=mkdtempSync(join(tmpdir(),'anlgram-runtime-quotes-'));
 const make=()=>{const options=convertV4MiniflareOptions({scriptPath:fileURLToPath(new URL('../.worker-build/worker.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],durableObjects:{CURVE_OPERATIONS:{className:'CurveFinancialOperation',useSQLite:true}}});options.resourcePersistencePath=persist;return new Miniflare(options);};
 let mf=make(),saved;
 const now=Math.floor(Date.now()/1000),deadline=now+85;
 const {setup,authorize}=await import('./curve-fixture.mjs');const h=setup(),g=authorize(h,now,'65'.repeat(32));
 const call=(stub,body)=>stub.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,...body})}));
 const stub=async()=>{const ns=await mf.getDurableObjectNamespace('CURVE_OPERATIONS');return ns.get(ns.idFromName('runtime-epoch-fixture'));};
 try{
  const s=await stub();assert.equal((await call(s,{action:'authorize',grant:g})).status,200);assert.equal((await call(s,{action:'authorize',grant:g})).status,409);
  const a=await(await call(s,{action:'reserveQuote',scopeKey:'runtime:'+g.authorizationId,maximumValidUntil:deadline})).json();
  const b=await(await call(s,{action:'reserveQuote',scopeKey:'runtime:'+g.authorizationId,maximumValidUntil:deadline})).json();assert(b.revision>a.revision);assert(b.validUntil<a.validUntil);
  const transaction={network:'-3',from:curveIntent.operator,validUntil:b.validUntil,messages:[structuredClone(curveIntent.message)]},fp=await curveFingerprint(transaction);
  const approval={fingerprint:fp,validUntil:b.validUntil,observedAt:now,quoteExpiresAt:now+60,quoteRevision:b.revision,quoteScopeKey:b.scopeKey,authorizationId:g.authorizationId,authorizationNotAfter:g.notAfter};
  assert.equal((await call(s,{runtimeVersion:execution.sha256,action:'prepare',transaction,approval:{...approval,quoteRevision:a.revision}})).status,409);
  assert.equal((await call(s,{runtimeVersion:execution.sha256,action:'prepare',transaction,approval})).status,200);saved={runtimeVersion:execution.sha256,action:'claim',transaction,fingerprint:fp,requirePrepared:true,authorizationBinding:{id:g.authorizationId,notAfter:g.notAfter,requireStored:true}};
 }finally{await mf.dispose();}
 mf=make();try{
  const s=await stub();assert.equal((await(await call(s,{action:'authorization'})).json()).authorizationId,g.authorizationId);
  assert.equal((await call(s,{...saved,authorizationBinding:{...saved.authorizationBinding,id:'66'.repeat(32)}})).status,409);
  const rs=await Promise.all([call(s,saved),call(s,saved)]);assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call(s,{action:'authorize',grant:g})).status,409);assert.equal((await call(s,{action:'reserveQuote',scopeKey:'runtime:'+g.authorizationId,maximumValidUntil:deadline})).status,409);
 }finally{await mf.dispose();}
 mf=make();try{assert.equal((await call(await stub(),saved)).status,409);}finally{await mf.dispose();}
});
