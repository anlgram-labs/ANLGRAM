import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Address,Cell,beginCell,loadStateInit,storeShardAccount} from '@ton/core';
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {pinned} from '../recovery/policy.mjs';
import {matchRawAccounts,RecoveryEvidenceJournal,acquireRawAccounts} from '../recovery/evidence.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';
import worker from '../worker.mjs';
import {RecoveryRuntime} from '../recovery/runtime.mjs';

function memory(){const map=new Map();let tail=Promise.resolve();return{get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),transaction(fn){const p=tail.then(()=>fn(this));tail=p.catch(()=>{});return p;}};}
function fixture(){
 const init=loadStateInit(Cell.fromBase64(candidate.wallet.stateInit).beginParse()),m=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse());
 init.data=beginCell().storeBit(true).storeUint(1,32).storeUint(pinned.walletId,32).storeBuffer(Buffer.from(pinned.publicKey,'hex')).storeBit(false).endCell();
 const source={state:'active',code:init.code.toBoc().toString('base64'),data:init.data.toBoc().toString('base64'),balanceNano:'5893016464',lastTransactionHash:'d2'.repeat(32)};
 const account={addr:Address.parse(pinned.operator),storageStats:{used:{cells:1n,bits:1n},lastPaid:1,duePayment:null},storage:{lastTransLt:102n,balance:{coins:5893016464n},state:{type:'active',state:init}}};
 const shard=beginCell().store(storeShardAccount({account,lastTransactionHash:BigInt('0x'+source.lastTransactionHash),lastTransactionLt:100n})).endCell();
 const snapshot={network:'-3',observedAt:Date.now(),source,minter:{state:'active',code:m.code.toBoc().toString('base64'),data:m.data.toBoc().toString('base64')},curve:{state:'uninitialized',code:'',balanceNano:'0'},originalLock:{operation:pinned.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:pinned.oldFingerprint,claimedAt:pinned.oldClaimedAt,validUntil:pinned.oldValidUntil}};
 const common={network:'-3',observedAt:Date.now(),dataStatus:'FRESH_PROVIDER_OBSERVATION'};
 return{snapshot,primary:{...common,provider:'TONCENTER_TESTNET',authentication:'TESTNET_KEY_ACCEPTED',rawAccount:{bytes:shard.toBoc().toString('base64')}},secondary:{...common,provider:'TONAPI_TESTNET',rawAccount:{state:shard.refs[0].toBoc().toString('hex'),id:{workchain:-1,shard:'8000000000000000',seqno:10,root_hash:'11'.repeat(32),file_hash:'22'.repeat(32)},proof:'unverified-provider-proof'}}};
}

test('full Account cells match pinned V5 identity; proof bytes never establish finality or unlock',()=>{
 const h=fixture(),e=matchRawAccounts(h.primary,h.secondary,h.snapshot);
 assert.equal(e.seqno,1);assert.equal(e.lastTransactionHash,h.snapshot.source.lastTransactionHash);assert.equal(e.originalFingerprint,pinned.oldFingerprint);assert.equal(e.proofInclusionVerified,false);assert.equal(e.validatorFinalityVerified,false);assert.equal(e.operationCompleted,false);assert.equal(e.financialSigningEnabled,false);assert.equal(Cell.fromBase64(e.accountBoc).hash().toString('hex'),e.accountHash);
});
test('forged, stale, wrong-network, wrong-source, changed ancestor and mismatched raw cells fail closed',()=>{
 const mutations=[h=>h.primary.authentication='ANONYMOUS',h=>h.secondary.network='-239',h=>h.primary.observedAt=1,h=>h.snapshot.source.balanceNano='0',h=>h.snapshot.source.lastTransactionHash='00'.repeat(32),h=>h.snapshot.originalLock.fingerprint='00'.repeat(32),h=>h.secondary.rawAccount.state=beginCell().endCell().toBoc().toString('hex'),h=>h.primary.rawAccount.bytes='bad',h=>h.secondary.rawAccount.id.workchain=0,h=>h.secondary.rawAccount.id.root_hash='bad'];
 for(const mutate of mutations){const h=fixture();mutate(h);assert.throws(()=>matchRawAccounts(h.primary,h.secondary,h.snapshot));}
});
test('append-only journal deduplicates concurrent capture, survives reload, never modifies ancestor or claims a receipt',async()=>{
 const h=fixture(),s=memory();await s.put('operation',h.snapshot.originalLock);const j=new RecoveryEvidenceJournal(s),e=matchRawAccounts(h.primary,h.secondary,h.snapshot);
 const entries=await Promise.all(Array.from({length:8},()=>j.append(e)));assert(entries.every(x=>x.id===entries[0].id&&x.count===1));
 const status=await new RecoveryEvidenceJournal(s).status();assert.equal(status.state,'NO_EXECUTION_OBSERVED_RECEIPT_ABSENT');assert.equal(status.operationCompleted,false);assert.deepEqual(await s.get('operation'),h.snapshot.originalLock);
 const next=structuredClone(e);next.seqno=2;next.accountHash='33'.repeat(32);next.referenceBlock.seqno++;const changed=await j.append(next);assert.equal(changed.count,2);assert.equal(changed.state,'SOURCE_CHANGED_RECEIPT_REQUIRED');assert.equal(changed.financialSigningEnabled,false);assert.deepEqual(await s.get('evidence:'+entries[0].id),e);
});
test('fixed server acquisition does not accept browser accounts or turn 429 into stale evidence',async()=>{
 const h=fixture(),calls=[],env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const b=await r.json();calls.push(b);return Response.json(b.account==='operatorRaw'?h.primary:h.secondary);}})}};
 assert.equal((await acquireRawAccounts(env,h.snapshot)).seqno,1);assert.deepEqual(calls.map(x=>x.account),['operatorRaw','operatorRawSecondary']);assert(calls.every(x=>x.network==='-3'&&x.fresh===true&&Object.keys(x).length===3));
 env.TESTNET_READS.get=()=>({fetch:async()=>Response.json({provider:'TONAPI_TESTNET',retryAfterSeconds:30},{status:429})});await assert.rejects(()=>acquireRawAccounts(env,h.snapshot),e=>e.status===429&&e.retryAfterSeconds===30);
});
test('capture route requires fresh domain proof, forbids caller evidence and financial routes remain closed',async()=>{
 const origin='https://testnet.anlgram.com',env={APP_ORIGIN:origin},request=b=>new Request(origin+'/api/recovery/capture',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(b)});
 assert.equal((await worker.fetch(request({}),env)).status,403);assert.equal((await worker.fetch(request({state:'forged'}),env)).status,400);assert.equal((await worker.fetch(new Request(origin+'/api/recovery/capture'),env)).status,405);assert.equal((await worker.fetch(new Request(origin+'/api/recovery/execute',{method:'POST'}),env)).status,403);
});
test('runtime captures only server-acquired cells, exposes the persisted summary after restart and leaves financial ledgers untouched',async()=>{
 const h=fixture(),s=memory(),source=h.snapshot.source,counts=[];
 const env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async req=>{const {account}=await req.json();counts.push(account);
  if(account==='operatorRaw')return Response.json({...h.primary,observedAt:Date.now()});if(account==='operatorRawSecondary')return Response.json({...h.secondary,observedAt:Date.now()});
  const base={network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now()};
  if(account==='operatorSecondary')return Response.json({...base,independentAccount:{address:pinned.operator,status:'active',balance:source.balanceNano,code:Cell.fromBase64(source.code).toBoc().toString('hex'),data:Cell.fromBase64(source.data).toBoc().toString('hex'),last_transaction_hash:source.lastTransactionHash}});
  return Response.json({...base,account:account==='operator'?{state:'active',code:source.code,data:source.data,balance:source.balanceNano,last_transaction_id:{hash:Buffer.from(source.lastTransactionHash,'hex').toString('base64')}}:account==='minter'?h.snapshot.minter:{state:'uninitialized',code:'',balance:'0'}});
 }})}};
 await s.put('operation',h.snapshot.originalLock);const runtime=new RecoveryRuntime(s,env,()=>s.get('operation'));
 const result=await(await runtime.fetch({action:'capture'})).json();assert.equal(result.evidence.seqno,1);assert.equal(result.evidence.operationCompleted,false);assert.equal(result.financialSigningEnabled,false);assert.deepEqual(counts,['minter','curve','operator','operatorSecondary','operatorRaw','operatorRawSecondary']);
 const status=await(await new RecoveryRuntime(s,env,()=>s.get('operation')).fetch({action:'status'})).json();assert.equal(status.capturedAccountEvidence.id,result.evidence.id);assert.equal(status.successor.expectedSeqno,null);assert.equal(status.independentFinalityVerified,false);assert.equal(await s.get('recovery-runtime:v1:destinationReservation'),undefined);assert.equal(await s.get('recovery-runtime:v1:receiptSummary'),undefined);assert.deepEqual(await s.get('operation'),h.snapshot.originalLock);
});
test('raw account scheduler uses exact read-only Testnet RPC and separates provider credentials',async()=>{
 const h=fixture(),save=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(url,o)=>{calls++;if(url.includes('toncenter')){assert.equal(o.headers['X-API-Key'],'TEST_CENTER_ONLY');assert.equal(o.headers.Authorization,undefined);assert.deepEqual(JSON.parse(o.body),{jsonrpc:'2.0',id:1,method:'getShardAccountCell',params:{address:pinned.operator}});return Response.json({ok:true,result:h.primary.rawAccount});}
   assert.equal(url,'https://testnet.tonapi.io/v2/liteserver/get_account_state/'+pinned.operator);assert.equal(o.method,'GET');assert.equal(o.headers.Authorization,'Bearer TEST_API_ONLY');assert.equal(o.headers['X-API-Key'],undefined);return Response.json(h.secondary.rawAccount);};
  const object=new TestnetReads({storage:memory()},{}),call=account=>object.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'TEST_CENTER_ONLY','X-Internal-Tonapi-Testnet-Key':'TEST_API_ONLY'},body:JSON.stringify({network:'-3',account,fresh:true})}));
  for(const name of ['operatorRaw','operatorRawSecondary']){const r=await call(name);assert.equal(r.status,200);const body=await r.json();assert(body.rawAccount);assert(!JSON.stringify(body).includes('TEST_CENTER_ONLY'));assert(!JSON.stringify(body).includes('TEST_API_ONLY'));}assert.equal(calls,2);
 }finally{globalThis.fetch=save;}
});
test('capture cannot overwrite an ancestor, claim finality or silently prune a full journal',async()=>{
 const h=fixture(),s=memory(),journal=new RecoveryEvidenceJournal(s),e=matchRawAccounts(h.primary,h.secondary,h.snapshot);
 for(const mutate of [x=>x.originalFingerprint='bad',x=>x.operationCompleted=true,x=>x.validatorFinalityVerified=true,x=>x.financialSigningEnabled=true]){const bad=structuredClone(e);mutate(bad);await assert.rejects(()=>journal.append(bad));}
 await s.put('evidence:statesV2',Array.from({length:256},(_,i)=>String(i)));await assert.rejects(()=>journal.append(e),/capacity/);assert.equal((await s.get('evidence:statesV2')).length,256);assert.equal(await s.get('evidence:last'),undefined);
});
test('oversized raw provider response is rejected, never cached or interpreted as valid account evidence',async()=>{
 const save=globalThis.fetch,s=memory();let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({ok:true,result:{bytes:'a'.repeat(524289)}}));};
  const object=new TestnetReads({storage:s},{}),r=await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account:'operatorRaw',fresh:true})}));assert.equal(r.status,503);assert.equal(calls,1);assert.equal(await s.get('account:operatorRaw'),undefined);assert.equal((await r.json()).dataStatus,'UNAVAILABLE');
 }finally{globalThis.fetch=save;}
});
