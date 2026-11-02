import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Cell,beginCell,loadStateInit} from '@ton/core';
import {RecoveryRuntime,observeRecovery,analyzeRecoveryFees} from '../recovery/runtime.mjs';
import {RECOVERY,pinned,hash} from '../recovery/policy.mjs';
import {buildRecoveryEmulation} from '../recovery/emulation.mjs';
import {CurveFinancialOperation} from '../curve-operation.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';
import execution from '../execution-version.json' with {type:'json'};
import worker from '../worker.mjs';
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
const origin='https://testnet.anlgram.com';
function memory(){const m=new Map();let tail=Promise.resolve();return{get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v)),transaction(fn){const p=tail.then(()=>fn(this));tail=p.catch(()=>{});return p;}};}
function fixture(){
 const w=loadStateInit(Cell.fromBase64(candidate.wallet.stateInit).beginParse()),m=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse()),data=n=>beginCell().storeBit(true).storeUint(n,32).storeUint(pinned.walletId,32).storeBuffer(Buffer.from(pinned.publicKey,'hex')).storeBit(false).endCell().toBoc().toString('base64');
 const source={state:'active',code:w.code.toBoc().toString('base64'),data:data(1),balance:'5893016464',last_transaction_id:{hash:Buffer.from('d2'.repeat(32),'hex').toString('base64')}};
 const other={address:pinned.operator,status:'active',balance:source.balance,code:w.code.toBoc().toString('hex'),data:Cell.fromBase64(source.data).toBoc().toString('hex'),last_transaction_hash:'d2'.repeat(32)};
 const lock={operation:pinned.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:pinned.oldFingerprint,validUntil:pinned.oldValidUntil,claimedAt:pinned.oldClaimedAt};
 const snapshot={network:'-3',observedAt:Date.now(),source:{state:source.state,code:source.code,data:source.data,balanceNano:source.balance,lastTransactionHash:'d2'.repeat(32)},curve:{state:'uninitialized',code:'',balanceNano:'0'},minter:{state:'active',code:m.code.toBoc().toString('base64'),data:m.data.toBoc().toString('base64')},originalLock:lock};
 async function fees(until){
  const request=await buildRecoveryEmulation(RECOVERY,1,until),b64=h=>Buffer.from(h,'hex').toString('base64'),dh=b64(hash(data(2))),ch=b64(pinned.walletCodeHash),state=(balance,dh)=>({balance:String(balance),code_hash:ch,data_hash:dh});
  const desc={aborted:false,compute_ph:{success:true,exit_code:0},action:{success:true,result_code:0,msgs_created:1}},common={account:pinned.operator,emulated:true,orig_status:'active',end_status:'active',description:desc};
  const out={destination:pinned.operator,value:'10000000',hash:'controlled-self-link',fwd_fee:'71290',init_state:null,message_content:{hash:b64('2134252d51fa928a00bcfca26a87051a66bdfa0c0e46a03d4cc3358af2c3201e')}};
  return{network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now(),validUntil:until,bodyHash:request.bodyHash,trace:{is_incomplete:false,data_cells:{[dh]:data(2)},transactions:{root:{...common,total_fees:'515384',in_msg:{source:null,init_state:null,message_content:{hash:b64(request.bodyHash)}},out_msgs:[out],account_state_before:state(source.balance,b64(hash(source.data))),account_state_after:state('5882429790',dh)},child:{...common,total_fees:'51868',in_msg:{source:pinned.operator,hash:out.hash},out_msgs:[],account_state_after:state('5892377922',dh)}}}};
 }
 const env={TESTNET_READS:{idFromName:x=>x,get:()=>({fetch:async r=>{const b=await r.json();assert.equal(b.network,'-3');assert.equal(b.fresh,true);if(b.account==='recoveryFees')return Response.json(await fees(b.validUntil));return Response.json({network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now(),account:b.account==='operator'?source:b.account==='minter'?snapshot.minter:{state:'uninitialized',code:'',balance:'0'}});}})}};
 return{source,other,snapshot,lock,fees,env,data};
}
test('server runtime prepares exact fresh quote with two-provider source match, preserves old lock, no execution/reservation or nonce consumption',async()=>{
 const h=fixture(),s=memory(),originalFetch=globalThis.fetch;let requests=0;
 globalThis.fetch=async url=>{requests++;assert.equal(url,'https://testnet.tonapi.io/v2/blockchain/accounts/'+pinned.operator);return Response.json(h.other);};
 try{
  const runtime=new RecoveryRuntime(s,h.env,async()=>structuredClone(h.lock));
  const a=await(await runtime.fetch({action:'prepare'})).json(),b=await(await runtime.fetch({action:'prepare'})).json();
  assert.notEqual(a.approval.fingerprint,b.approval.fingerprint);assert.equal(a.financialSigningEnabled,false);assert.equal(a.requestAllowed,false);assert.equal(a.approval.modeledGrossDebitNano,'10638542');assert.equal(a.model.totalNetworkFeesNano,'638542');assert.equal(a.corroboration.finalityVerified,false);assert.equal(a.transaction.messages[0].stateInit,undefined);assert.equal(requests,4);
  assert.equal(await s.get('operation'),undefined);assert.equal(await s.get('recovery-runtime:v1:destinationReservation'),undefined);assert.deepEqual(h.lock,h.snapshot.originalLock);
  for(const action of ['claim','reserve','execute','reconcile','receipt','authorize','successor','reset'])assert.equal((await runtime.fetch({action})).status,403);
  const status=await(await new RecoveryRuntime(s,h.env,async()=>h.lock).fetch({action:'status'})).json();assert.equal(status.executionEnabled,false);assert.equal(status.independentFinalityVerified,false);assert.equal(status.successor.expectedSeqno,null);assert.equal(status.successor.eligibleForAuthorization,false);
 }finally{globalThis.fetch=originalFetch;}
});
test('fixed-provider observer rejects disagreement, missing state and provider errors without fake fallback',async()=>{
 const h=fixture(),save=globalThis.fetch;
 try{for(const mutate of [x=>x.balance='0',x=>x.last_transaction_hash='00'.repeat(32),x=>x.data=h.data(2),x=>x.status='frozen',x=>x.address='-1:bad']){const other=structuredClone(h.other);mutate(other);globalThis.fetch=async()=>Response.json(other);await assert.rejects(()=>observeRecovery(h.env,h.lock));}globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>observeRecovery(h.env,h.lock));}finally{globalThis.fetch=save;}
});
test('exact emulator rejects partial traces, foreign actions, changed code/nonce, fee imbalance and stale models',async()=>{
 const h=fixture(),until=Math.floor(Date.now()/1000)+90,q=await h.fees(until),request=await buildRecoveryEmulation(RECOVERY,1,until);
 assert.equal(analyzeRecoveryFees(q,h.snapshot,request,'local-fixture').totalNetworkFeesNano,'638542');
 for(const mutate of [o=>o.trace.is_incomplete=true,o=>o.observedAt=1,o=>o.authentication='ANONYMOUS',o=>o.trace.transactions.root.out_msgs[0].value='10000001',o=>o.trace.transactions.child.account_state_after.balance='5892377923',o=>o.trace.transactions.root.in_msg.init_state={hash:'extra-init'},o=>o.trace.transactions.root.description.compute_ph.success=false,o=>o.trace.transactions.root.account_state_before.data_hash='bad',o=>o.bodyHash='bad']){const x=structuredClone(q);mutate(x);assert.throws(()=>analyzeRecoveryFees(x,h.snapshot,request,'x'));}
});
test('Pages routes require canonical origin and fresh server proof, reject caller parameters and every signing/reconciliation endpoint',async()=>{
 let calls=0;const h=fixture(),env={APP_ORIGIN:origin,CURVE_OPERATIONS:{idFromName:x=>x,get:()=>({fetch:async r=>{calls++;const j=await r.json();assert.equal(j.action,'recovery:status');return Response.json({financialSigningEnabled:false});}})}};
 assert.equal((await worker.fetch(new Request(origin+'/api/recovery/status'),env)).status,200);assert.equal(calls,1);
 const req=(path,body={},headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 for(const path of ['claim','execute','reset','reconcile','receipt','authorize','successor'])assert.equal((await worker.fetch(req('/api/recovery/'+path),env)).status,403);
 assert.equal((await worker.fetch(req('/api/recovery/prepare'),env)).status,403);
 assert.equal((await worker.fetch(req('/api/recovery/prepare',{seqno:1}),env)).status,400);
 assert.equal((await worker.fetch(req('/api/recovery/prepare',{}, {Origin:'https://anlgram.com'}),env)).status,403);
 assert.equal((await worker.fetch(new Request('https://anlgram.com/api/recovery/status'),env)).status,403);
 assert.equal((await worker.fetch(new Request(origin+'/api/recovery/status?network=-239'),env)).status,400);assert.equal(calls,1);
});
test('existing Curve ledger handles read-only recovery status with permanent original record and denies incompatible runtime',async()=>{
 const h=fixture(),s=memory();await s.put('operation',{...h.lock,status:h.lock.state,ticket:'PRIVATE_FIXTURE',events:[]});const object=new CurveFinancialOperation({storage:s},{});
 const r=await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'recovery:status',runtimeVersion:execution.sha256})}));const j=await r.json();assert.equal(j.originalLock.fingerprint,h.lock.fingerprint);assert(!JSON.stringify(j).includes('PRIVATE_FIXTURE'));assert.equal(j.executionEnabled,false);assert.equal((await s.get('operation')).ticket,'PRIVATE_FIXTURE');
 assert.equal((await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'recovery:status',runtimeVersion:'bad'})}))).status,409);
});
test('live configuration retires original Curve controls when its permanent lock exists or cannot be read, regardless of legacy approval',async()=>{
 const h=fixture(),s=memory();await s.put('operation',{status:h.lock.state,fingerprint:h.lock.fingerprint,claimedAt:h.lock.claimedAt,validUntil:h.lock.validUntil,events:[]});
 const object=new CurveFinancialOperation({storage:s},{}),env={APP_ORIGIN:origin,CURVE_OPERATIONS:{idFromName:n=>n,get:()=>object}};
 const j=await(await worker.fetch(new Request(origin+'/api/config'),env)).json();assert.equal(j.curveTransactionTwoRetired,true);assert.equal(j.curveTransactionTwoPreparationEnabled,false);assert.equal(j.curveTransactionTwoSigningEnabled,false);
 const missing=await(await worker.fetch(new Request(origin+'/api/config'),{APP_ORIGIN:origin})).json();assert.equal(missing.curveTransactionTwoRetired,true);assert.equal(missing.curveTransactionTwoSigningEnabled,false);
 const rateEnv={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async()=>Response.json({reason:'PROVIDER_RATE_LIMITED',retryAfterSeconds:30},{status:429,headers:{'Retry-After':'30'}})})}};
 const limited=new CurveFinancialOperation({storage:s},rateEnv),response=await limited.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'recovery:observe',runtimeVersion:execution.sha256})}));assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'30');const failure=await response.json();assert.equal(failure.reason,'PROVIDER_RATE_LIMITED');assert.equal(failure.financialSigningEnabled,false);assert.equal(failure.currentChain,undefined);
});
test('new emulator RPC selector cannot forward BOCs, select Mainnet, omit expiry or expose key',async()=>{
 const save=globalThis.fetch,s=memory(),object=new TestnetReads({storage:s},{});let calls=0;
 globalThis.fetch=async(url,o)=>{calls++;assert.equal(url,'https://testnet.toncenter.com/api/emulate/v1/emulateTrace');assert.equal(o.headers['X-API-Key'],'LOCAL_ONLY');const b=JSON.parse(o.body);assert.equal(b.ignore_chksig,true);assert.equal(b.include_code_data,true);assert.equal(b.with_actions,false);assert.equal(typeof b.boc,'string');return Response.json({is_incomplete:false,transactions:{}});};
 try{const base={account:'recoveryFees',network:'-3',fresh:true,validUntil:Math.floor(Date.now()/1000)+90},call=x=>object.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'LOCAL_ONLY'},body:JSON.stringify(x)}));for(const b of [{...base,network:'-239'},{...base,boc:'forged'},{...base,validUntil:undefined},{...base,fresh:false}])assert.equal((await call(b)).status,400);const r=await call(base);assert.equal(r.status,200);assert(!JSON.stringify(await r.json()).includes('LOCAL_ONLY'));assert.equal(calls,1);}finally{globalThis.fetch=save;}
});
test('actual read-only controller survives double clicks, reload and errors without any wallet financial request',async()=>{
 const source=readFileSync(new URL('../recovery-status.js',import.meta.url),'utf8'),nodes=()=>Object.fromEntries(['recovery-refresh','recovery-prepare','recovery-status'].map(x=>[x,{disabled:false,textContent:''}]));
 let calls=0;const n=nodes();let release;const gate=new Promise(r=>release=r);
 vm.runInNewContext(source,{document:{getElementById:id=>n[id]},BigInt,AbortSignal,Date,fetch:async url=>{calls++;await gate;return Response.json({scope:'SERVER_RECOVERY_PREPARATION_NOT_EXECUTION',financialSigningEnabled:false,executionEnabled:false,successor:{eligibleForAuthorization:false},operation:RECOVERY,successorOperation:'S',originalLock:{state:'LOCKED_PENDING_RECONCILIATION',fingerprint:pinned.oldFingerprint},independentFinalityVerified:false,blockedBy:['REVIEW']});}});
 const a=n['recovery-refresh'].onclick(),b=n['recovery-refresh'].onclick();release();await Promise.all([a,b]);assert.equal(calls,1);assert.match(n['recovery-status'].textContent,/NO verificado/);assert.match(n['recovery-status'].textContent,/No hay solicitud/);
 const reload=nodes();vm.runInNewContext(source,{document:{getElementById:id=>reload[id]},BigInt,AbortSignal,fetch:async()=>Response.json({error:'Fresh proof required'},{status:403})});await reload['recovery-prepare'].onclick();assert.match(reload['recovery-status'].textContent,/Fresh proof required/);assert.equal(reload['recovery-prepare'].disabled,false);
 assert(!source.includes('sendTransaction'));assert(!source.includes('localStorage'));
});
