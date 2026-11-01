import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {curveEmulation} from '../curve-emulation.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';
import worker from '../worker.mjs';
import intent from '../curve-two-intent.json' with {type:'json'};
const require=createRequire(import.meta.url),{external}=require('../../scripts/preflight-v5-minter'),{wallets}=require('../../scripts/prepare-testnet-v5');
function storage(){const values=new Map();return {storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)}};}
test('Curve emulator independently matches exact approved V5 seqno1 external with NO source StateInit',async()=>{
 const r=await curveEmulation(),w=wallets().testnet,reference=await external(w,intent.message,1,r.validUntil,w.address,null);assert.equal(r.request.boc,reference.boc);assert.equal(r.bodyHash,reference.body.hash().toString('hex'));assert.equal(r.request.ignore_chksig,true);assert.equal(intent.message.amount,'100000000');
});
test('protected Curve read and minter getter use only fixed Testnet methods and include the internal Pages key',async()=>{
 const original=globalThis.fetch;
 try{for(const name of ['curve','jettonData','curveFees']){
  const object=new TestnetReads(storage(),{});let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.headers['X-API-Key'],'fixture-testnet-key');assert.equal(options.redirect,'manual');const body=JSON.parse(options.body);
   if(name==='curveFees'){assert.equal(url,'https://testnet.toncenter.com/api/emulate/v1/emulateTrace');assert.equal(body.ignore_chksig,true);return Response.json({is_incomplete:false,transactions:{fixture:{}}});}
   assert.equal(url,'https://testnet.toncenter.com/api/v2/jsonRPC');assert.equal(body.method,name==='curve'?'getAddressInformation':'runGetMethod');assert.equal(body.params.address,name==='curve'?intent.message.address:'kQA5PEDpb0UPGsGUD0jByO9qNFd6PqyXPpMkTUyngd5-IYq8');if(name==='jettonData'){assert.equal(body.params.method,'get_jetton_data');assert.deepEqual(body.params.stack,[]);return Response.json({ok:true,result:{exit_code:0,stack:Array(5).fill(['num','0x0'])}});}return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});
  };
  const r=await object.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'fixture-testnet-key'},body:JSON.stringify({network:'-3',account:name,fresh:true})}));assert.equal(r.status,200);assert.equal(calls,1);assert.equal((await r.json()).authentication,'TESTNET_KEY_ACCEPTED');
 }}finally{globalThis.fetch=original;}
});
test('Curve endpoint returns five fresh observations, stays read-only, rejects supplied transactions and foreign origin',async()=>{
 const seen=[],env={APP_ORIGIN:'https://testnet.anlgram.com',TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const j=await r.json();seen.push(j);return Response.json({network:'-3',dataStatus:'FRESH_PROVIDER_OBSERVATION'});}})}};
 const req=(body='{}',origin='https://testnet.anlgram.com')=>new Request('https://testnet.anlgram.com/api/preflight/curve',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
 const r=await worker.fetch(req(),env),j=await r.json();assert.equal(r.status,200);assert.equal(j.curveSigningEnabled,false);assert.equal(j.financialSigningEnabled,false);assert.deepEqual(seen.map(s=>s.account),['operator','minter','curve','jettonData','curveFees']);assert(seen.every(s=>s.fresh===true&&s.network==='-3'));
 assert.equal((await worker.fetch(req('{"transaction":{}}'),env)).status,400);assert.equal((await worker.fetch(req('{}','https://anlgram.com'),env)).status,403);assert.equal(seen.length,5);
});
test('a failing getter or rate-limited read cannot become a successful Curve preflight',async()=>{
 const original=globalThis.fetch;try{const obj=new TestnetReads(storage(),{});globalThis.fetch=async()=>Response.json({ok:true,result:{exit_code:11,stack:[]}});const r=await obj.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'jettonData',fresh:true})}));assert.equal(r.status,503);assert.equal((await r.json()).getterResult,undefined);}finally{globalThis.fetch=original;}
});
