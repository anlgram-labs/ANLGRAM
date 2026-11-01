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
 const claim=stub=>stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'claim',transaction,fingerprint:hash,requirePrepared:true})}));
 let mf=make(),ticket;
 try{
  const ns=await mf.getDurableObjectNamespace('OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));
  const prepared=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'prepare',transaction,approval:{fingerprint:hash,validUntil:transaction.validUntil,observedAt:Math.floor(Date.now()/1000)}})}));assert.equal(prepared.status,200);
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
 const claim=stub=>stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'claim',transaction,fingerprint:hash,requirePrepared:true})}));
 let mf=make(),ticket;
 try{
  const ns=await mf.getDurableObjectNamespace('CURVE_OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));
  const oldNs=await mf.getDurableObjectNamespace('OPERATIONS'),old=oldNs.get(oldNs.idFromName('isolated-fixture-lifetime-operation'));assert.equal((await(await old.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'status'})}))).json()).status,'NOT_CLAIMED');
  const first={...transaction,messages:[intent.message]};await assert.rejects(stub.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'claim',transaction:first,fingerprint:await fingerprint(first)})})));
  const prepared=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'prepare',transaction,approval:{fingerprint:hash,validUntil:transaction.validUntil,observedAt:Math.floor(Date.now()/1000)}})}));assert.equal(prepared.status,200);
  const results=await Promise.all([claim(stub),claim(stub),claim(stub)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409,409]);ticket=(await results.find(r=>r.status===200).json()).ticket;
  for(let i=0;i<2;i++)await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket,event:'UNKNOWN_OR_REJECTED'})}));
  const status=await(await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:'{"action":"status"}'}))).json();assert.deepEqual(status.events,['UNKNOWN_OR_REJECTED']);assert.equal(status.ticket,undefined);assert.equal(status.status,'LOCKED_PENDING_RECONCILIATION');
 }finally{await mf.dispose();}
 mf=make();try{
  const ns=await mf.getDurableObjectNamespace('CURVE_OPERATIONS'),stub=ns.get(ns.idFromName('isolated-fixture-lifetime-operation'));assert.equal((await claim(stub)).status,409);
  const forbidden=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'record',ticket:'wrong',event:'WALLET_RESPONSE_UNVERIFIED'})}));assert.equal(forbidden.status,403);
 }finally{await mf.dispose();}
});
