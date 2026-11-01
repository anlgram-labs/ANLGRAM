import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intent,fingerprint} from '../minter-policy.mjs';
import {operationRoute} from '../operation-lock.mjs';
import worker from '../worker.mjs';
const tx=()=>({network:'-3',from:intent.operator,validUntil:Math.floor(Date.now()/1000)+90,messages:[structuredClone(intent.message)]});
function envFor(transaction){let claims=0;
 const env={MINTER_TX1_APPROVAL:JSON.stringify({fingerprint:'',candidateSha256:intent.candidateSha256,completeEmulation:true,traceSha256:'a'.repeat(64),validUntil:transaction.validUntil,observedAt:Math.floor(Date.now()/1000),modeledDebitNano:'106876940',sourceBalanceNano:'1999999999',sourceLastTransactionHash:'fixture-last-hash'}),OPERATIONS:{idFromName:n=>n,get:()=>({fetch:async r=>{claims++;return Response.json({claimed:true,received:await r.json()});}})}};
 return{env,claims:()=>claims};
}
const proof={verified:true,address:intent.operator,network:'-3',expiresAt:Math.floor(Date.now()/1000)+300};
test('public operation gate without explicit approval remains disabled before storage/provider calls',async()=>{
 const r=await worker.fetch(new Request('https://testnet.anlgram.com/api/operation/claim',{method:'POST',headers:{Origin:'https://testnet.anlgram.com','Content-Type':'application/json'},body:'{}'}),{APP_ORIGIN:'https://testnet.anlgram.com'});
 assert.equal(r.status,403);assert.match((await r.json()).error,/disabled/);
});
test('authorization pins exact fingerprint, fresh fee ceiling, proof and chain state before claiming',async()=>{
 const transaction=tx(),hash=await fingerprint(transaction),ctx=envFor(transaction),approval=JSON.parse(ctx.env.MINTER_TX1_APPROVAL);approval.fingerprint=hash;ctx.env.MINTER_TX1_APPROVAL=JSON.stringify(approval);
 const original=globalThis.fetch;const requests=[];
 try{
  globalThis.fetch=async(url,options)=>{requests.push({url,options});assert.equal(url,'https://testnet.toncenter.com/api/v2/jsonRPC');assert.equal(options.redirect,'manual');const address=JSON.parse(options.body).params.address;return Response.json({ok:true,result:address===intent.operator?{state:'uninitialized',code:'',balance:'1999999999',last_transaction_id:{hash:'fixture-last-hash'}}:{state:'uninitialized',code:'',balance:'0'}});};
  const r=await operationRoute('/api/operation/claim',{transaction,fingerprint:hash,action:'erase',approvalReference:{modeledDebitNano:'0'}},ctx.env,proof);assert.equal(r.status,200);const received=(await r.json()).received;assert.equal(received.action,'claim');assert.equal(received.approvalReference.modeledDebitNano,'106876940');assert.equal(ctx.claims(),1);assert.equal(requests.length,2);
 }finally{globalThis.fetch=original;}
});
test('wrong/stale approval, excessive modeled cost and expired proof cannot touch bridge or claim',async()=>{
 const transaction=tx(),hash=await fingerprint(transaction);for(const change of [{fingerprint:'0'.repeat(64)},{observedAt:1},{modeledDebitNano:'120000001'},{candidateSha256:'0'.repeat(64)},{completeEmulation:false},{traceSha256:''}]){const ctx=envFor(transaction),a={...JSON.parse(ctx.env.MINTER_TX1_APPROVAL),fingerprint:hash,...change};ctx.env.MINTER_TX1_APPROVAL=JSON.stringify(a);const r=await operationRoute('/api/operation/claim',{transaction,fingerprint:hash},ctx.env,proof);assert.equal(r.status,403);assert.equal(ctx.claims(),0);}
 const ctx=envFor(transaction);assert.equal((await operationRoute('/api/operation/claim',{transaction,fingerprint:hash},ctx.env,{...proof,expiresAt:1})).status,403);assert.equal(ctx.claims(),0);
});
test('changed on-chain source or destination cannot create an operation claim',async()=>{
 const original=globalThis.fetch;
 try{for(const mutation of ['active-source','balance-drift','active-destination']){
  const transaction=tx(),hash=await fingerprint(transaction),ctx=envFor(transaction),a=JSON.parse(ctx.env.MINTER_TX1_APPROVAL);a.fingerprint=hash;ctx.env.MINTER_TX1_APPROVAL=JSON.stringify(a);
  globalThis.fetch=async(url,options)=>{const source=JSON.parse(options.body).params.address===intent.operator;return Response.json({ok:true,result:source?{state:mutation==='active-source'?'active':'uninitialized',code:'',balance:mutation==='balance-drift'?'1999999998':'1999999999',last_transaction_id:{hash:'fixture-last-hash'}}:{state:mutation==='active-destination'?'active':'uninitialized',code:'',balance:'0'}});};
  assert.equal((await operationRoute('/api/operation/claim',{transaction,fingerprint:hash},ctx.env,proof)).status,409);assert.equal(ctx.claims(),0);
 }}finally{globalThis.fetch=original;}
});
test('reconciliation returns authentic fixed-network observations, never unlocks from snapshots',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://testnet.toncenter.com/api/v2/jsonRPC');return Response.json({ok:true,result:{state:'uninitialized',balance:'0',last_transaction_id:{hash:'fixture'}}});};
 const transaction=tx(),ctx=envFor(transaction),r=await operationRoute('/api/operation/reconcile',{},ctx.env,proof),body=await r.json();assert.equal(body.newOperationAllowed,false);assert.match(body.status,/EXACT_TRACE_REVIEW/);assert.equal(body.network,'-3');
 }finally{globalThis.fetch=original;}
});
