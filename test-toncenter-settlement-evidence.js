'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {account,traces}=require('./lib/toncenter-evidence');
const {createRequire}=require('node:module');const r=createRequire(require('node:path').resolve('minter-contract/package.json'));
const {beginCell,Address}=r('@ton/core');
const raw='0:'+'11'.repeat(32),hash='ab'.repeat(32),sentinel='LOCAL_TEST_CREDENTIAL_NOT_A_REAL_KEY';
const response=x=>new Response(JSON.stringify(x));
test('existing protected account client supplies real BOC hashes without returning the API key',async()=>{
 const code=beginCell().storeUint(7,8).endCell(),data=beginCell().storeUint(8,8).endCell();
 const result=await account(raw,{env:{TONCENTER_API_KEY:sentinel},fetchImpl:async(url,options)=>{
  assert(url.startsWith('https://testnet.toncenter.com/api/v2/getAddressInformation?'));
  assert.equal(options.headers['X-API-Key'],sentinel);assert.equal(options.redirect,'error');
  return response({ok:true,result:{state:'active',balance:'1234',code:code.toBoc().toString('base64'),data:data.toBoc().toString('base64')}});
 }});
 assert.equal(result.codeHash,code.hash().toString('hex'));assert.equal(result.balanceNano,'1234');
 assert.equal(result.financialOutcome,'NOT_VERIFIED');assert(!JSON.stringify(result).includes(sentinel));
});
test('mainnet-friendly address cannot silently query testnet',async()=>{
 await assert.rejects(account(Address.parse(raw).toString({testOnly:false})),/Testnet/);
});
test('account failure is unavailable and never means empty or deployable',async()=>{
 const result=await account(raw,{env:{},fetchImpl:async()=>new Response('rejected',{status:429})});
 assert.equal(result.status,'UNAVAILABLE');assert.equal(result.financialOutcome,'NOT_VERIFIED');
});
test('exact message hash selects v3 traces and credential never enters URL or output',async()=>{
 const result=await traces(hash,{env:{TONCENTER_API_KEY:sentinel},fetchImpl:async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://testnet.toncenter.com');assert.equal(u.searchParams.get('msg_hash'),hash);
  assert.equal(options.headers['X-API-Key'],sentinel);assert(!url.includes(sentinel));
  return response({traces:[{trace_id:'provider-test-fixture',trace_state:'complete'}]});
 }});
 assert.equal(result.status,'OBSERVED');assert.equal(result.financialOutcome,'NOT_VERIFIED');
});
test('unindexed and incomplete traces never establish success or authorize refunds',async()=>{
 for(const trace of[[],[{trace_state:'pending'}]] ){
  const result=await traces(hash,{env:{},fetchImpl:async()=>response({traces:trace})});assert.equal(result.financialOutcome,'NOT_VERIFIED');
 }
});
test('transaction and message hash filters remain distinct',async()=>{
 const result=await traces(hash,{selector:'transaction',env:{},fetchImpl:async(url)=>{
  const q=new URL(url).searchParams;assert.equal(q.get('tx_hash'),hash);assert.equal(q.has('msg_hash'),false);return response({traces:[]});
 }});assert.equal(result.lookup.kind,'transaction');
 await assert.rejects(traces(hash,{selector:'unknown'}),/selector/);
});
test('unknown schema, network error, rate limiting and oversized data fail closed without upstream details',async()=>{
 for(const fetchImpl of[async()=>response({error:sentinel}),async()=>{throw new Error(sentinel);},async()=>new Response(sentinel,{status:429}),async()=>new Response('x'.repeat(2*1024*1024+1))]){
  const result=await traces(hash,{env:{},fetchImpl});assert.equal(result.status,'UNAVAILABLE');assert(!JSON.stringify(result).includes(sentinel));
 }
 await assert.rejects(traces('https://attacker.invalid'),/Exact/);
});
test('backend forbids writes, unknown queries, malformed identifiers and mainnet-friendly account selectors',async()=>{
 const {server}=require('./server');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const[path,method,status]of[['traces/'+hash,'POST',405],['traces/'+hash+'?api_key=discarded','GET',400],['traces/not-a-hash','GET',400],['account/'+Address.parse(raw).toString({testOnly:false}),'GET',400]]){
   const res=await fetch(base+'/api/toncenter-testnet/'+path,{method});assert.equal(res.status,status);assert.equal(res.headers.get('cache-control'),'no-store');
  }
 }finally{await new Promise(resolve=>server.close(resolve));}
});
