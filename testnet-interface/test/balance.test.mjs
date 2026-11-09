import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TestnetReads} from '../testnet-rpc.mjs';
import worker from '../worker.mjs';
import {OPERATOR,TESTNET_RPC} from '../config.mjs';
const request=()=>new Request('https://testnet.anlgram.com/api/operator');
const makeEnv=()=>{const values=new Map(),object=new TestnetReads({storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)}},{});return {APP_ORIGIN:'https://anlgram-testnet-preparation.pages.dev',TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:r=>object.fetch(r)})}};};
test('read-only balance uses Worker-compatible manual redirect and exact Testnet RPC',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(url,TESTNET_RPC+'/jsonRPC');assert.equal(options.redirect,'manual');assert.equal(options.method,'POST');
   assert.deepEqual(JSON.parse(options.body),{jsonrpc:'2.0',id:1,method:'getAddressInformation',params:{address:OPERATOR}});
   return Response.json({ok:true,result:{balance:'123456789123456789',state:'active'}}); // synthetic provider fixture only
  };
  const r=await worker.fetch(request(),makeEnv()),j=await r.json();assert.equal(r.status,200);assert.equal(j.balanceNano,'123456789123456789');assert.equal(j.address,OPERATOR);assert.equal(j.network,'-3');assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('provider redirects are rejected without following or reporting a fabricated balance',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://toncenter.com/api/v2/jsonRPC'}});};
  const r=await worker.fetch(request(),makeEnv()),j=await r.json();assert.equal(r.status,503);assert.equal(j.reason,'PROVIDER_RESPONSE_REJECTED');assert.equal(j.balanceNano,undefined);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('malformed, rate-limited and failed providers stay explicitly unavailable',async()=>{
 const original=globalThis.fetch;
 try{
  for(const reply of [()=>Response.json({ok:true,result:{balance:'not-an-amount'}}),()=>new Response(null,{status:429}),()=>{throw Error('offline');}]){
   globalThis.fetch=async()=>reply();const r=await worker.fetch(request(),makeEnv()),j=await r.json();assert([429,503].includes(r.status));assert.equal(j.balanceNano,undefined);
  }
 }finally{globalThis.fetch=original;}
});
