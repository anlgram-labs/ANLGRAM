import {test} from 'node:test';import assert from 'node:assert/strict';
import {Cell,beginCell,loadStateInit} from '@ton/core';
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {pinned,RECOVERY,validateChainExpiry,requireExecutionActivation} from '../recovery/policy.mjs';
import {RecoveryEvidenceJournal} from '../recovery/evidence.mjs';import {RecoveryPreparationLedger} from '../recovery/ledger.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';import {observeRecovery,RecoveryRuntime} from '../recovery/runtime.mjs';
import {CurveFinancialOperation} from '../curve-operation.mjs';import execution from '../execution-version.json' with {type:'json'};
function memory(){let m=new Map(),tail=Promise.resolve();return{get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v)),transaction(fn){const p=tail.then(async()=>{const next=new Map(structuredClone([...m])),r=await fn({get:async k=>structuredClone(next.get(k)),put:async(k,v)=>next.set(k,structuredClone(v))});m=next;return r;});tail=p.catch(()=>{});return p;}};}
const lock=()=>({operation:pinned.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:pinned.oldFingerprint,claimedAt:pinned.oldClaimedAt,validUntil:pinned.oldValidUntil});
function evidence(){return{network:'-3',operator:pinned.operator,originalFingerprint:pinned.oldFingerprint,accountHash:'11'.repeat(32),lastTransactionHash:'22'.repeat(32),seqno:1,balanceNano:'5893016464',observedAt:Date.now(),referenceBlock:{seqno:1},scope:'CORROBORATED_RAW_ACCOUNT_NOT_FINALIZED_RECEIPT',proofInclusionVerified:false,validatorFinalityVerified:false,operationCompleted:false,financialSigningEnabled:false};}
function setup(){
 const s=memory(),w=loadStateInit(Cell.fromBase64(candidate.wallet.stateInit).beginParse()),m=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse()),data=beginCell().storeBit(true).storeUint(1,32).storeUint(pinned.walletId,32).storeBuffer(Buffer.from(pinned.publicKey,'hex')).storeBit(false).endCell();
 const snapshot={network:'-3',observedAt:Date.now(),source:{state:'active',code:w.code.toBoc().toString('base64'),data:data.toBoc().toString('base64'),balanceNano:'5893016464',lastTransactionHash:'22'.repeat(32)},minter:{state:'active',code:m.code.toBoc().toString('base64'),data:m.data.toBoc().toString('base64')},curve:{state:'uninitialized',code:'',balanceNano:'0'},originalLock:lock()};
 const ledger=new RecoveryPreparationLedger({storage:s,observe:async()=>({...structuredClone(snapshot),observedAt:Date.now()}),estimate:async q=>({network:'-3',fingerprint:q.fingerprint,observedAt:Date.now(),complete:true,senderFeesNano:'586674',totalNetworkFeesNano:'638542'})});return{s,snapshot,ledger};
}
test('F1: 300 different masterchain blocks retain one wallet-state record and its original historical timestamp',async()=>{
 const s=memory(),j=new RecoveryEvidenceJournal(s),e=evidence();await s.put('operation',lock());const first=await j.append(e);
 for(let n=2;n<=300;n++){const r=await j.append({...e,observedAt:e.observedAt+n,referenceBlock:{seqno:n}});assert.equal(r.id,first.id);assert.equal(r.count,1);assert.equal(r.observedAt,e.observedAt);}
 assert.deepEqual(await s.get('evidence:'+first.id),e);assert.deepEqual(await s.get('operation'),lock());
});
test('F1: saturated V1 journal is lazily adopted without deletion; genuinely new states can still be recorded',async()=>{
 const s=memory(),j=new RecoveryEvidenceJournal(s),e=evidence(),ids=Array.from({length:256},(_,i)=>'legacy-'+i);await s.put('evidence:index',ids);
 for(let i=0;i<256;i++)await s.put('evidence:'+ids[i],{...e,referenceBlock:{seqno:i+1}});
 const same=await j.append({...e,referenceBlock:{seqno:1000}});assert.equal(same.id,ids[0]);assert.equal(same.count,256);
 const fresh=await j.append({...e,accountHash:'33'.repeat(32),lastTransactionHash:'44'.repeat(32)});assert.equal(fresh.count,257);assert.equal((await s.get('evidence:statesV2')).length,1);
 for(let i=0;i<256;i++)assert.deepEqual(await s.get('evidence:'+ids[i]),{...e,referenceBlock:{seqno:i+1}});
});
test('F2: a stalled primary read does not serialize the independent provider; same-provider requests still deduplicate',async()=>{
 const save=globalThis.fetch,s=memory(),object=new TestnetReads({storage:s},{});let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);let primary=0,secondary=0;
 globalThis.fetch=async url=>{if(url.includes('toncenter')){primary++;started();await gate;return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});}secondary++;return Response.json({address:pinned.operator,status:'active',balance:'1',code:'controlled',data:'controlled',last_transaction_hash:'22'.repeat(32)});};
 const call=account=>object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({network:'-3',account,fresh:true})}));let pending;
 try{pending=[call('operator'),call('operator')];await entered;const r=await Promise.race([call('operatorSecondary'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Secondary serialized behind primary')),250))]);assert.equal(r.status,200);assert.equal(primary,1);assert.equal(secondary,1);}finally{release();if(pending)await Promise.all(pending);globalThis.fetch=save;}
});
test('F2: observer starts all independent reads concurrently and retains the 15-second phase bound',async t=>{
 const h=setup();let now=Date.now();t.mock.method(Date,'now',()=>now);let release;const gate=new Promise(r=>release=r),calls=[];
 const env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const b=await r.json();calls.push(b.account);if(b.account==='minter')await gate;const base={network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:now};return Response.json(b.account==='operatorSecondary'?{...base,independentAccount:{address:pinned.operator,status:'active',balance:h.snapshot.source.balanceNano,code:Cell.fromBase64(h.snapshot.source.code).toBoc().toString('hex'),data:Cell.fromBase64(h.snapshot.source.data).toBoc().toString('hex'),last_transaction_hash:h.snapshot.source.lastTransactionHash}}:{...base,account:b.account==='operator'?{state:'active',code:h.snapshot.source.code,data:h.snapshot.source.data,balance:h.snapshot.source.balanceNano,last_transaction_id:{hash:Buffer.from(h.snapshot.source.lastTransactionHash,'hex').toString('base64')}}:b.account==='curve'?{state:'uninitialized',code:'',balance:'0'}:h.snapshot.minter});}})}};
 const pending=observeRecovery(env,lock());for(let i=0;i<10&&calls.length<4;i++)await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['minter','curve','operator','operatorSecondary']);now+=15001;release();await assert.rejects(()=>pending,/Fresh|expired/);
});
test('F3: canonical quote metadata is bound into the shared FinancialOperation scope and tampering cannot reserve',async()=>{
 const h=setup();await h.s.put('operation',lock());const q=await h.ledger.prepare(RECOVERY),quote=await h.s.get('quote');assert.equal(q.approval.quoteRevision,quote.revision);assert.equal(q.approval.quoteScopeKey,quote.scopeKey);await h.ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint);assert.deepEqual(await h.s.get(RECOVERY+':quote'),quote);assert.deepEqual(await h.s.get('operation'),lock());
 const bad=setup(),draft=await bad.ledger.prepare(RECOVERY);await bad.s.put('quote',{...await bad.s.get('quote'),scopeKey:'wrong'});await assert.rejects(()=>bad.ledger.reserveOfflineAttempt(RECOVERY,draft.approval.fingerprint),/superseded/);assert.equal(await bad.s.get('destinationReservation'),undefined);
});
test('F4: a forward-skewed wall clock cannot substitute for chain expiry; no expiry proof releases the lock',()=>{
 const h=setup(),make=chainTime=>({...h.snapshot,chainEvidence:{proofInclusionVerified:true,chainTime,lastTransactionHash:h.snapshot.source.lastTransactionHash}});
 assert(Date.now()>pinned.oldValidUntil*1000);for(const time of [pinned.oldValidUntil-1,pinned.oldValidUntil])assert.throws(()=>validateChainExpiry(pinned,make(time)),/masterchain time/);validateChainExpiry(pinned,make(pinned.oldValidUntil+1));assert.throws(()=>validateChainExpiry(pinned,h.snapshot));assert.throws(()=>requireExecutionActivation(),/DISABLED/);assert.equal(h.snapshot.originalLock.state,'LOCKED_PENDING_RECONCILIATION');
});
test('F4: live preparation cannot omit the authenticated account/block proof or reach fee estimation without it',async()=>{
 const h=setup();let fees=0;const source=h.snapshot.source;
 const env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const {account}=await r.json();if(account==='recoveryFees'){fees++;throw Error('Must not estimate without proof');}if(account.startsWith('operatorRaw'))return Response.json({provider:'TONCENTER_TESTNET'},{status:503});const base={network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now()};return Response.json(account==='operatorSecondary'?{...base,independentAccount:{address:pinned.operator,status:'active',balance:source.balanceNano,code:Cell.fromBase64(source.code).toBoc().toString('hex'),data:Cell.fromBase64(source.data).toBoc().toString('hex'),last_transaction_hash:source.lastTransactionHash}}:{...base,account:account==='operator'?{state:'active',code:source.code,data:source.data,balance:source.balanceNano,last_transaction_id:{hash:Buffer.from(source.lastTransactionHash,'hex').toString('base64')}}:account==='minter'?h.snapshot.minter:{state:'uninitialized',code:'',balance:'0'}});}})}};
 const runtime=new RecoveryRuntime(h.s,env,async()=>lock());await assert.rejects(()=>runtime.fetch({action:'prepare'}));assert.equal(fees,0);assert.equal(await h.s.get('recovery-runtime:v1:draft'),undefined);assert.equal(await h.s.get('recovery-runtime:v1:destinationReservation'),undefined);
});
test('F5: exhausted deadlines return bounded Retry-After without invalidating the prior draft or changing the nonce lock',async()=>{
 const h=setup(),draft=await h.ledger.prepare(RECOVERY),now=Math.floor(Date.now()/1000);await h.s.put('quoteDeadlines',Array.from({length:90},(_,i)=>now+i+1));const revision=await h.s.get('quoteRevision');await assert.rejects(()=>h.ledger.prepare(RECOVERY),e=>e.status===429&&e.reason==='QUOTE_DEADLINES_EXHAUSTED'&&e.retryAfterSeconds===1);assert.deepEqual(await h.s.get('draft'),draft);assert.equal(await h.s.get('quoteRevision'),revision);assert.equal(await h.s.get('destinationReservation'),undefined);
});
test('F5: persisted endpoint admission returns local HTTP429 before RPC work, never provider blame or another claim',async()=>{
 const h=setup(),original={...lock(),status:'LOCKED_PENDING_RECONCILIATION',events:[]};await h.s.put('operation',original);await h.s.put('recovery-runtime:v1:prepareAdmission',Date.now());const o=new CurveFinancialOperation({storage:h.s},{}),r=await o.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'recovery:prepare',runtimeVersion:execution.sha256})}));const j=await r.json();assert.equal(r.status,429);assert.equal(j.reason,'RECOVERY_PREPARATION_RATE_LIMITED');assert.equal(j.provider,undefined);assert(Number(r.headers.get('Retry-After'))>0);assert.equal(j.financialSigningEnabled,false);assert.deepEqual(await h.s.get('operation'),original);
});
