import {test} from 'node:test';import assert from 'node:assert/strict';
import {Cell,beginCell,loadStateInit} from '@ton/core';
import {RecoveryPreparationLedger,RECOVERY,SUCCESSOR} from '../recovery/ledger.mjs';
import {pinned,operationPolicy,requireExecutionActivation} from '../recovery/policy.mjs';
import {buildRecoveryEmulation} from '../recovery/emulation.mjs';
import {makeLocalReceipt,normalizeLocalBundle} from './recovery-local-fixture.mjs';
import verifier from '../../lib/v5-self-transfer-receipt.js';
import {guardedMinterSend} from '../single-attempt.mjs';
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
function memory(){let values=new Map(),tail=Promise.resolve();const storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>{values.set(k,structuredClone(v));},transaction(fn){const run=tail.then(async()=>{const next=new Map(structuredClone([...values])),tx={get:async k=>structuredClone(next.get(k)),put:async(k,v)=>next.set(k,structuredClone(v))};const result=await fn(tx);values=next;return result;});tail=run.catch(()=>{});return run;},get values(){return values;}};return storage;}
const minter=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse());
function baseSnapshot(context=pinned){return{network:'-3',observedAt:Date.now(),source:{state:'active',code:Cell.fromBase64(candidate.wallet.stateInit).refs[0].toBoc().toString('base64'),data:'',balanceNano:'5893016464',lastTransactionHash:'d2'.repeat(32)},curve:{state:'uninitialized',code:null,balanceNano:'0'},minter:{state:'active',code:minter.code.toBoc().toString('base64'),data:minter.data.toBoc().toString('base64')},originalLock:{operation:context.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:context.oldFingerprint,validUntil:context.oldValidUntil,claimedAt:context.oldClaimedAt}};}
function walletData(context,seq){return beginCell().storeBit(true).storeUint(seq,32).storeUint(context.walletId,32).storeBuffer(Buffer.from(context.publicKey,'hex')).storeBit(false).endCell().toBoc().toString('base64');}
function setup(context=pinned){const storage=memory(),snapshot=baseSnapshot(context);snapshot.source.data=walletData(context,context.oldSeqno);let reads=0;
 const args={storage,context,observe:async()=>{reads++;return structuredClone(snapshot)},estimate:async({fingerprint})=>({network:'-3',observedAt:Date.now(),fingerprint,complete:true,senderFeesNano:'586674',totalNetworkFeesNano:'638542'})};
 return{storage,snapshot,args,ledger:new RecoveryPreparationLedger(args),reads:()=>reads};}

test('pinned recovery prepares exact0.01TON self-transfer without StateInit, separate ID/fingerprint and no signing authority',async()=>{
 const h=setup(),old=structuredClone(h.snapshot.originalLock),q=await h.ledger.prepare(RECOVERY);assert.equal(q.transaction.network,'-3');assert.equal(q.transaction.from,pinned.operator);assert.equal(q.transaction.messages.length,1);assert.equal(q.transaction.messages[0].amount,'10000000');assert.equal(Cell.fromBase64(q.transaction.messages[0].payload).beginParse().loadUint(32),0);assert(!Object.hasOwn(q.transaction.messages[0],'stateInit'));assert.equal(q.approval.kind,RECOVERY);assert.notEqual(q.approval.fingerprint,pinned.oldFingerprint);assert.equal(q.financialSigningEnabled,false);assert.equal(q.independentReviewComplete,false);assert.deepEqual(h.snapshot.originalLock,old);assert.throws(requireExecutionActivation,/DISABLED/);await assert.rejects(h.ledger.executionRequest(),/DISABLED/);
});
test('existing production TON Connect guard refuses the new candidate before invoking transport',async()=>{
 const q=await setup().ledger.prepare(RECOVERY);let calls=0;await assert.rejects(guardedMinterSend(q.transaction,{account:{chain:'-3',address:pinned.operator},provider:'http'},{},()=>{calls++;}));assert.equal(calls,0);
});
test('new transaction policy rejects changed wallet/network/amount/body/StateInit, expiry and extra fields',async()=>{
 const q=await setup().ledger.prepare(RECOVERY),p=operationPolicy(pinned,RECOVERY,1);
 for(const mutate of [x=>x.network='-239',x=>x.from='wrong',x=>x.messages[0].amount='10000001',x=>x.messages[0].payload='AA==',x=>x.messages[0].stateInit=candidate.wallet.stateInit,x=>x.validUntil=0,x=>x.validUntil+=91,x=>x.messages.push(x.messages[0]),x=>x.extra=true]){const tx=structuredClone(q.transaction);mutate(tx);assert.throws(()=>p.validateIntent(tx));}
});
test('fresh source, Curve, minter and old-lock contradictions fail closed',async()=>{
 for(const change of [s=>s.network='-239',s=>s.observedAt-=15001,s=>s.source.data=walletData(pinned,2),s=>s.source.balanceNano='1',s=>s.curve.state='active',s=>s.curve.balanceNano='1',s=>s.minter.data=s.source.data,s=>s.originalLock.fingerprint='ff'.repeat(32),s=>s.originalLock.state='NOT_CLAIMED']){const h=setup();change(h.snapshot);await assert.rejects(h.ledger.prepare(RECOVERY));assert(!h.storage.values.has('destinationReservation'));}
});
test('all fees including self-receipt fees and available balance are included in fixed conservative policy',async()=>{
 for(const fees of [{senderFeesNano:'1',totalNetworkFeesNano:'10000001'},{senderFeesNano:'10',totalNetworkFeesNano:'9'},{senderFeesNano:'0',totalNetworkFeesNano:'0'}]){const h=setup();h.args.estimate=async({fingerprint})=>({network:'-3',observedAt:Date.now(),fingerprint,complete:true,...fees});await assert.rejects(new RecoveryPreparationLedger(h.args).prepare(RECOVERY),/policy/);}
});
test('concurrent prepare supersedes old quote; concurrent reservations produce exactly one lifetime claim',async()=>{
 const h=setup(),qs=await Promise.allSettled([h.ledger.prepare(RECOVERY),h.ledger.prepare(RECOVERY)]);assert(qs.some(q=>q.status==='fulfilled'));const draft=await h.storage.get('draft');
 const rs=await Promise.allSettled([h.ledger.reserveOfflineAttempt(RECOVERY,draft.approval.fingerprint),h.ledger.reserveOfflineAttempt(RECOVERY,draft.approval.fingerprint)]);assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(h.storage.values.get('destinationReservation').operation,RECOVERY);await assert.rejects(h.ledger.prepare(RECOVERY),/reserved/);
});
for(const event of ['rejected signature','timeout','interrupted request','unknown response'])test(event+' keeps original and new reservations locked across reload; duplicate callbacks cannot rearm',async()=>{
 const h=setup(),q=await h.ledger.prepare(RECOVERY),c=await h.ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint),reload=new RecoveryPreparationLedger(h.args);
 for(let i=0;i<2;i++)assert.equal((await reload.recordUncertain(RECOVERY,c.ticket,'UNKNOWN_OR_REJECTED')).status,200);
 assert.deepEqual(h.storage.values.get(RECOVERY+':operation').events,['UNKNOWN_OR_REJECTED']);await assert.rejects(reload.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint));assert.equal((await reload.status()).retryPermitted,false);assert.equal(h.snapshot.originalLock.fingerprint,pinned.oldFingerprint);
});
test('expired quotes and changed source immediately before reservation cannot consume the attempt',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);const h=setup(),q=await h.ledger.prepare(RECOVERY);now+=61000;h.snapshot.observedAt=now;await assert.rejects(h.ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint),/Expired/);assert(!h.storage.values.has('destinationReservation'));
 const next=setup(),newQ=await next.ledger.prepare(RECOVERY);next.snapshot.source.data=walletData(pinned,2);await assert.rejects(next.ledger.reserveOfflineAttempt(RECOVERY,newQ.approval.fingerprint),/seqno/);assert(!next.storage.values.has('destinationReservation'));
});
test('refreshing a runtime quote changes fingerprint without redeployment; forged/incomplete models fail',async()=>{
 const h=setup(),a=await h.ledger.prepare(RECOVERY),b=await h.ledger.prepare(RECOVERY);assert.notEqual(a.approval.fingerprint,b.approval.fingerprint);await assert.rejects(h.ledger.reserveOfflineAttempt(RECOVERY,a.approval.fingerprint));
 h.args.estimate=async()=>({network:'-3',observedAt:Date.now(),fingerprint:'forged',complete:true,senderFeesNano:'1',totalNetworkFeesNano:'1'});await assert.rejects(new RecoveryPreparationLedger(h.args).prepare(RECOVERY),/emulation/);
});
test('successor cannot be prepared or reserved from a caller-supplied nonce or balance snapshot',async()=>{
 const h=setup();h.snapshot.source.data=walletData(pinned,2);await assert.rejects(h.ledger.prepare(SUCCESSOR),/disabled/);await assert.rejects(h.ledger.prepareSuccessorCandidate(),/receipt/);await assert.rejects(h.ledger.prepareSuccessorRuntimeQuote(),/DISABLED/);
});
test('read-only emulator has zero signature, explicit Testnet V5 identity and no source init',async()=>{
 const e=await buildRecoveryEmulation(RECOVERY,1,Math.floor(Date.now()/1000)+90);assert.equal(e.signatureAllZero,true);assert.equal(e.financialSigningEnabled,false);await assert.rejects(buildRecoveryEmulation(RECOVERY,2,Math.floor(Date.now()/1000)+90),/nonce/);
});

test('actual local V5 self-transfer receipt authenticates both transactions/account states; successor derives observed nonce and stays disabled',async t=>{
 const epoch=Math.floor(Date.now()/1000);t.mock.method(Date,'now',()=>epoch*1000);const x=await makeLocalReceipt(),bundle=normalizeLocalBundle(x),h=setup(x.context);
 h.snapshot.source={state:'active',code:x.beforeCode.toBoc().toString('base64'),data:x.beforeData.toBoc().toString('base64'),balanceNano:x.balanceBefore.toString(),lastTransactionHash:x.beforeLastTransactionHash};
 const q=await h.ledger.prepare(RECOVERY);assert.equal(q.transaction.validUntil,x.validUntil);await h.ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint);
 h.snapshot.source={state:'active',code:x.afterCode.toBoc().toString('base64'),data:x.afterData.toBoc().toString('base64'),balanceNano:x.balanceAfter.toString(),lastTransactionHash:bundle.after.lastTransactionHash};
 const v=await h.ledger.verifyOfflineReceipt(bundle);assert.equal(v.seqnoAfter,2);assert(v.signatureValid);assert.equal(v.independentAcquisitionVerified,false);
 const next=await h.ledger.prepareSuccessorCandidate();assert.equal(next.expectedSeqno,v.seqnoAfter);assert.equal(next.message.amount,'100000000');assert.equal(next.message.stateInit,pinned.curveMessage.stateInit);assert.equal(next.message.address,pinned.curveMessage.address);assert.equal(next.eligibleForAuthorization,false);assert.equal(next.financialSigningEnabled,false);assert.equal(h.storage.values.get('destinationReservation').operation,RECOVERY);
 await h.ledger.verifyOfflineReceipt(bundle);assert.equal((await h.ledger.status()).independentFinalityVerified,false);await assert.rejects(h.ledger.prepareSuccessorRuntimeQuote(),/DISABLED/);
 const p={...x.policy.intent,seqno:1,walletCodeHash:x.context.walletCodeHash};
 for(const change of [b=>b.trace.is_incomplete=true,b=>b.independent.provider=b.after.provider,b=>b.after.balanceNano='1',b=>b.after.data=x.beforeData.toBoc().toString('base64'),b=>b.after.block.rootHash='ff'.repeat(32),b=>b.after.lastTransactionHash='00'.repeat(32),b=>b.validUntil++,b=>b.trace.transactions[Object.keys(b.trace.transactions)[0]].account='0:'+'1'.repeat(64),b=>b.trace.transactions[Object.keys(b.trace.transactions)[0]].orig_status='uninit']){const bad=structuredClone(bundle);change(bad);assert.throws(()=>verifier.verifySelfTransferReceipt(bad,p));}
 // A valid local actor's signature cannot satisfy the real pinned operator.
 assert.throws(()=>verifier.verifySelfTransferReceipt(bundle,{...operationPolicy(pinned,RECOVERY,1).intent,seqno:1,walletCodeHash:pinned.walletCodeHash}));
 const wrongState=structuredClone(h.snapshot);wrongState.source.data=walletData(x.context,3);h.snapshot.source=wrongState.source;await assert.rejects(h.ledger.prepareSuccessorCandidate(),/seqno/);
});

test('ledger storage is bound to one wallet/destination lineage and successor policy cannot reuse the old nonce or replace Curve StateInit',async()=>{
 const h=setup();await h.ledger.prepare(RECOVERY);const shifted={...pinned,candidateSha256:'11'.repeat(32)};await assert.rejects(new RecoveryPreparationLedger({...h.args,context:shifted}).prepare(RECOVERY),/binding/);
 assert.throws(()=>operationPolicy(pinned,SUCCESSOR,1),/nonce/);assert.throws(()=>operationPolicy({...pinned,curveMessage:{...pinned.curveMessage,stateInit:candidate.wallet.stateInit}},SUCCESSOR,2),/identity/);assert.throws(()=>operationPolicy({...pinned,operator:'0:'+'0'.repeat(64)},RECOVERY,1),/derived/);
});

test('real V5 TVM rejects repeated nonce, expired request, and invalid signature without further balance/nonce changes',async()=>{
 const x=await makeLocalReceipt(),before=x.balanceAfter;const m=x.policy.intent.message;
 const coreLocal=await import('@ton/core');const message=coreLocal.internal({to:x.w.address,value:10000000n,bounce:false,body:coreLocal.Cell.fromBase64(m.payload)});
 await assert.rejects(x.send(1,[message]),e=>e.exitCode===133);
 await assert.rejects(x.send(2,[message],x.chain.now-1),e=>e.exitCode===136);
 const zero=await buildRecoveryEmulation(RECOVERY,1,Math.floor(Date.now()/1000)+90,x.context);
 await assert.rejects(x.chain.sendMessage(x.core.Cell.fromBase64(zero.boc)),e=>e.exitCode===135);
 const after=await x.chain.getContract(x.core.Address.parse(x.context.operator));assert.equal(after.balance,before);assert.equal((await x.chain.runGetMethod(x.core.Address.parse(x.context.operator),'seqno')).stackReader.readBigNumber(),2n);
});

test('receipt verifier rejects changed raw transaction account/status, transplanted account snapshots and forged signed body',async()=>{
 const x=await makeLocalReceipt(),bundle=normalizeLocalBundle(x),policy={...x.policy.intent,seqno:1,walletCodeHash:x.context.walletCodeHash};
 function mutateRoot(b,mutate){const key=Object.keys(b.trace.transactions)[0],t=b.trace.transactions[key],d=x.core.loadTransaction(x.core.Cell.fromBase64(t.raw).beginParse());mutate(d,t);const raw=x.core.beginCell().store(x.core.storeTransaction(d)).endCell();t.raw=raw.toBoc().toString('base64');t.hash=raw.hash().toString('base64');}
 const wrongAddress=structuredClone(bundle);mutateRoot(wrongAddress,d=>{d.address=1n});assert.throws(()=>verifier.verifySelfTransferReceipt(wrongAddress,policy));
 const wrongStatus=structuredClone(bundle);mutateRoot(wrongStatus,d=>{d.oldStatus='uninitialized'});assert.throws(()=>verifier.verifySelfTransferReceipt(wrongStatus,policy));
 const transplanted=structuredClone(bundle);transplanted.afterAccountBoc=transplanted.beforeAccountBoc;assert.throws(()=>verifier.verifySelfTransferReceipt(transplanted,policy));
 const missingChild=structuredClone(bundle);delete missingChild.trace.transactions[Object.keys(missingChild.trace.transactions)[1]];assert.throws(()=>verifier.verifySelfTransferReceipt(missingChild,policy));
 const zeroSignature=structuredClone(bundle);mutateRoot(zeroSignature,(d,t)=>{const old=d.inMessage.body,s=old.beginParse(),b=x.core.beginCell().storeBits(s.loadBits(old.bits.length-512)).storeBuffer(Buffer.alloc(64));s.loadBuffer(64);while(s.remainingRefs)b.storeRef(s.loadRef());d.inMessage.body=b.endCell();t.in_msg.message_content.body=d.inMessage.body.toBoc().toString('base64');t.in_msg.message_content.hash=d.inMessage.body.hash().toString('base64');});assert.throws(()=>verifier.verifySelfTransferReceipt(zeroSignature,policy),/Invalid V5 signature/);
});

test('receipt input is snapshotted before awaits; a changing caller cannot poison persistent evidence',async t=>{
 const epoch=Math.floor(Date.now()/1000);t.mock.method(Date,'now',()=>epoch*1000);const x=await makeLocalReceipt(),bundle=normalizeLocalBundle(x),h=setup(x.context);
 h.snapshot.source={state:'active',code:x.beforeCode.toBoc().toString('base64'),data:x.beforeData.toBoc().toString('base64'),balanceNano:x.balanceBefore.toString(),lastTransactionHash:x.beforeLastTransactionHash};
 const q=await h.ledger.prepare(RECOVERY);await h.ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint);
 h.snapshot.source={state:'active',code:x.afterCode.toBoc().toString('base64'),data:x.afterData.toBoc().toString('base64'),balanceNano:x.balanceAfter.toString(),lastTransactionHash:bundle.after.lastTransactionHash};
 const original=structuredClone(bundle),observe=async()=>{bundle.after.balanceNano='1';return structuredClone(h.snapshot)};
 const result=await new RecoveryPreparationLedger({...h.args,observe}).verifyOfflineReceipt(bundle);assert(result.signatureValid);assert.deepEqual(await h.storage.get('receiptBundle'),original);assert.equal((await h.ledger.prepareSuccessorCandidate()).expectedSeqno,result.seqnoAfter);
});
