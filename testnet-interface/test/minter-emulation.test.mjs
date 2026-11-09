import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {minterEmulation} from '../minter-emulation.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';
import intent from '../minter-intent.json' with {type:'json'};
const require=createRequire(import.meta.url),{external}=require('../../scripts/preflight-v5-minter.js'),{wallets}=require('../../scripts/prepare-testnet-v5.js');
test('server-only invalid-signature emulation exactly matches independent approved V5 builder',async()=>{
 const value=await minterEmulation(),reference=await external(wallets().testnet,intent.message,0,value.validUntil);assert.equal(value.bodyHash,reference.body.hash().toString('hex'));assert.equal(value.request.boc,reference.boc);assert.equal(value.request.ignore_chksig,true);assert.equal(value.request.include_code_data,true);assert(value.validUntil<=Math.floor(Date.now()/1000)+120);
});
test('fee read uses only pinned Testnet emulator and server key; incomplete traces never pass',async()=>{
 const original=globalThis.fetch;
 try{for(const complete of [true,false]){
  const values=new Map(),obj=new TestnetReads({storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)}},{});let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://testnet.toncenter.com/api/emulate/v1/emulateTrace');assert.equal(options.headers['X-API-Key'],'fixture');assert.equal(options.redirect,'manual');const body=JSON.parse(options.body);assert.equal(body.ignore_chksig,true);assert.equal(body.with_actions,false);return Response.json({is_incomplete:!complete,transactions:{fixture:{}}});};
  const r=await obj.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'fixture'},body:JSON.stringify({network:'-3',account:'fees',fresh:true})})),j=await r.json();assert.equal(r.status,complete?200:503);assert.equal(calls,1);assert.equal(j.trace!==undefined,complete);assert(!JSON.stringify(j).includes('X-API-Key'));
 }}finally{globalThis.fetch=original;}
});
