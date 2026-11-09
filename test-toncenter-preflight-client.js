'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createClient}=require('./lib/toncenter-preflight-client');
const url='https://testnet.toncenter.com/api/v2/getAddressInformation?address=fixture';
test('local preflight schedules Testnet-only key and never forwards it to Mainnet',async()=>{
 let now=1900000000000;const seen=[],client=createClient({key:'fixture',now:()=>now,sleep:async ms=>{now+=ms;},fetchImpl:async(u,o)=>{seen.push({url:u,options:o,at:now});return Response.json({ok:true,result:{}});}});
 await Promise.all([client(url),client(url.replace('testnet.',''))]);assert.equal(seen[0].options.headers['X-API-Key'],'fixture');assert.equal(seen[1].options.headers['X-API-Key'],undefined);assert(seen[1].at-seen[0].at>=1500);
});
test('local reader obeys Retry-After without repeated polling or unlimited retry',async()=>{
 let now=1900000000000,calls=0;const client=createClient({now:()=>now,sleep:async ms=>{now+=ms;},fetchImpl:async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});}});assert.equal((await client(url)).status,429);assert.equal(calls,1);await assert.rejects(client(url),/cooldown/);assert.equal(calls,1);
});
test('local reader short transient outage retries once and recovers; never retries signing',async()=>{
 let now=0,calls=0;const client=createClient({now:()=>now,sleep:async ms=>{now+=ms;},fetchImpl:async()=>++calls===1?new Response('{}',{status:503}):Response.json({ok:true})});assert.equal((await client(url)).status,200);assert.equal(calls,2);
 for(const u of ['https://testnet.toncenter.com/api/v2/sendBoc','https://evil.example/api/v2/getAddressInformation','https://toncenter.com/api/v2/getAddressInformation?api_key=secret'])await assert.rejects(client(u),/rejected/);
 await assert.rejects(client('https://testnet.toncenter.com/api/emulate/v1/emulateTrace',{boc:'fixture',ignore_chksig:false}),/unsigned/);assert.equal(calls,2);
});
