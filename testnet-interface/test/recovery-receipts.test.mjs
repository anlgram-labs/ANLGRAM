import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {Cell,beginCell,loadStateInit,loadTransaction} from '@ton/core';
import live from './fixtures/v5-account-proof-live-2026-11-02.json' with {type:'json'};
import liveHistory from './fixtures/v5-source-history-live-2026-11-02.json' with {type:'json'};
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {verifyAccountInclusion} from '../recovery/account-proof.mjs';
import {matchHistory,buildAndVerifyReceipt} from '../recovery/receipts.mjs';
import {RecoveryPreparationLedger,RECOVERY} from '../recovery/ledger.mjs';
import {pinned,hash} from '../recovery/policy.mjs';
import {makeLocalReceipt,normalizeLocalBundle} from './recovery-local-fixture.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';import worker from '../worker.mjs';

function memory(){const m=new Map();let tail=Promise.resolve();return{get:async k=>structuredClone(m.get(k)),put:async(k,v)=>m.set(k,structuredClone(v)),transaction(fn){const p=tail.then(()=>fn(this));tail=p.catch(()=>{});return p;}};}
test('real acquired Testnet fixture verifies masterchain -> shard -> Account inclusion, without claiming validator consensus',()=>{
 const p=verifyAccountInclusion(live.raw,live.toncenterReference,pinned.operator);assert.equal(p.accountHash,'2c9a3c46e7d68b6dcfa350699e82306aca04a009a957e53ff71725c082593058');assert.equal(p.lastTransactionHash,'d2e8fd5233eb8bf05a428605ea3735d67a1b50741826bb6996156ec49020dc21');assert.equal(p.lastTransactionLt,'106958981000003');assert.equal(p.proofInclusionVerified,true);assert.equal(p.validatorFinalityVerified,false);assert.equal(p.financialSigningEnabled,false);
});
test('forged account, shard/masterchain, wrong operator and truncated proof fail cryptographic inclusion',()=>{
 for(const change of [r=>r.state=beginCell().endCell().toBoc().toString('hex'),r=>r.proof=r.shard_proof,r=>r.shardblk.root_hash='00'.repeat(32),r=>r.shardblk.seqno++,r=>r.id.workchain=0,r=>r.shard_proof=r.shard_proof.slice(0,-2)]){const r=structuredClone(live.raw);change(r);assert.throws(()=>verifyAccountInclusion(r,live.toncenterReference,pinned.operator));}
 assert.throws(()=>verifyAccountInclusion(live.raw,{...live.toncenterReference,root_hash:Buffer.alloc(32).toString('base64')},pinned.operator));assert.throws(()=>verifyAccountInclusion(live.raw,live.toncenterReference,'0:'+'ff'.repeat(32)));
});
test('actual five-transaction Testnet history from independent providers is hash/LT-linked to the included account tip',()=>{
 const proof=verifyAccountInclusion(live.raw,live.toncenterReference,pinned.operator),rows=matchHistory(liveHistory.primary,liveHistory.secondary,proof);assert.equal(rows.length,5);assert.equal(rows[0].hash,proof.lastTransactionHash);assert.equal(rows.at(-1).tx.prevTransactionHash,0n);
});
test('fixed history/reference RPC selectors cannot request arbitrary blocks, accounts, Mainnet or outbound messages',async()=>{
 const save=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(url,o)=>{calls++;if(url.includes('tonapi')){assert.equal(url,'https://testnet.tonapi.io/v2/blockchain/accounts/'+pinned.operator+'/transactions?limit=16&sort_order=desc');assert.equal(o.method,'GET');assert.equal(o.headers['X-API-Key'],undefined);return Response.json({transactions:liveHistory.secondary});}const q=JSON.parse(o.body);assert.equal(url,'https://testnet.toncenter.com/api/v2/jsonRPC');assert.equal(o.headers['X-API-Key'],'LOCAL_TESTNET_ONLY');if(q.method==='lookupBlock'){assert.deepEqual(q.params,{workchain:-1,shard:'-9223372036854775808',seqno:live.raw.id.seqno});return Response.json({ok:true,result:live.toncenterReference});}assert.deepEqual(q.params,{address:pinned.operator,limit:16,archival:false});assert.equal(q.method,'getTransactions');return Response.json({ok:true,result:liveHistory.primary});};
  const call=async body=>new TestnetReads({storage:memory()},{}).fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'LOCAL_TESTNET_ONLY'},body:JSON.stringify(body)}));
  for(const account of ['operatorHistory','operatorHistorySecondary','recoveryMasterBlock']){const r=await call({network:'-3',account,fresh:true,...(account==='recoveryMasterBlock'?{referenceSeqno:live.raw.id.seqno}:{})});assert.equal(r.status,200);}
  for(const body of [{network:'-239',account:'operatorHistory',fresh:true},{network:'-3',account:'recoveryMasterBlock',fresh:false,referenceSeqno:10},{network:'-3',account:'operatorHistory',fresh:true,referenceSeqno:10},{network:'-3',account:'operatorHistory',fresh:true,address:pinned.operator},{network:'-3',account:'recoveryMasterBlock',fresh:true,referenceSeqno:-1},{network:'-3',account:'recoveryMasterBlock',fresh:true,referenceSeqno:1,boc:'forged'}])assert.equal((await call(body)).status,400);assert.equal(calls,3);
 }finally{globalThis.fetch=save;}
});
async function local(){
 const x=await makeLocalReceipt(),bundle=normalizeLocalBundle(x),rows=x.txs.map(t=>{const cell=x.core.beginCell().store(x.core.storeTransaction(t)).endCell();return{cell:Cell.fromBase64(cell.toBoc().toString('base64')),tx:loadTransaction(Cell.fromBase64(cell.toBoc().toString('base64')).beginParse()),hash:cell.hash().toString('hex')};}).reverse();
 const expected={codeHash:x.beforeCode.hash().toString('hex'),dataHash:x.beforeData.hash().toString('hex'),balanceNano:x.balanceBefore.toString(),lastTransactionHash:x.beforeLastTransactionHash,seqno:1};
 const before={accountHash:x.beforeAccountCell.hash().toString('hex'),accountBoc:x.beforeAccountCell.toBoc().toString('base64'),lastTransactionHash:x.beforeLastTransactionHash,codeHash:expected.codeHash,dataHash:expected.dataHash,balanceNano:expected.balanceNano};
 const accountHash=x.afterAccountCell.hash().toString('hex'),last=rows[0],evidence={accountHash,accountBoc:x.afterAccountCell.toBoc().toString('base64'),lastTransactionHash:last.hash,lastTransactionLt:last.tx.lt.toString(),seqno:2,proofInclusionVerified:true,referenceBlock:{seqno:1},accountProof:{accountHash,lastTransactionHash:last.hash,masterchainSeqno:1,masterchainRootHash:'11'.repeat(32),masterchainFileHash:'22'.repeat(32),chainTime:last.tx.now,proofInclusionVerified:true}};
 const transaction={network:'-3',from:x.context.operator,validUntil:x.validUntil,messages:[structuredClone(x.policy.intent.message)]},fingerprint=await x.policy.fingerprint(transaction),prepared={transaction,approval:{kind:RECOVERY,expectedSeqno:1,fingerprint,sourceIdentity:expected}},reservation={operation:RECOVERY,originalFingerprint:x.context.oldFingerprint,fingerprint},attempt={fingerprint,validUntil:x.validUntil};
 return{x,rows,before,prepared,reservation,attempt,checkpoint:{evidence,rows},primary:rows.map(r=>({data:r.cell.toBoc().toString('base64')})),secondary:rows.map(r=>({raw:r.cell.toBoc().toString('hex')}))};
}
test('actual local V5 transactions authenticate raw independent history and complete exact signed two-transaction receipt accounting',async()=>{
 const h=await local(),rows=matchHistory(h.primary,h.secondary,h.checkpoint.evidence,h.x.context.operator);assert.equal(rows.length,2);
 const result=await buildAndVerifyReceipt(h.checkpoint,h.before,h.prepared,h.reservation,h.attempt,h.x.context);assert.equal(result.summary.signatureValid,true);assert.equal(result.summary.seqnoAfter,2);assert.equal(result.summary.providerAcquisitionVerified,true);assert.equal(result.summary.independentFinalityVerified,false);assert.equal(result.summary.operationCompleted,false);assert.equal(result.summary.financialSigningEnabled,false);
 assert.equal(BigInt(result.summary.totalNetworkCostNano),h.x.balanceBefore-h.x.balanceAfter);
});
test('missing/duplicate/foreign/broken history and changed proven tip cannot be accepted',async()=>{
 const h=await local();for(const [a,b,e] of [[[],h.secondary,h.checkpoint.evidence],[h.primary,[h.secondary[0]],h.checkpoint.evidence],[[h.primary[0],h.primary[0]],h.secondary,h.checkpoint.evidence],[h.primary,h.secondary,{...h.checkpoint.evidence,lastTransactionHash:'00'.repeat(32)}]])assert.throws(()=>matchHistory(a,b,e,h.x.context.operator));
 assert.throws(()=>matchHistory(h.primary,h.secondary,h.checkpoint.evidence,pinned.operator));const changed=structuredClone(h.secondary);changed[1].raw=changed[0].raw;assert.throws(()=>matchHistory(h.primary,changed,h.checkpoint.evidence,h.x.context.operator));
});
test('receipt cannot substitute a reservation, source snapshot, expiry, full Account or missing self-delivery',async()=>{
 const h=await local();for(const mutate of [v=>v.reservation.fingerprint='bad',v=>v.before.balanceNano='0',v=>v.before.accountBoc=h.x.afterAccountCell.toBoc().toString('base64'),v=>v.attempt.validUntil++,v=>v.checkpoint.evidence.proofInclusionVerified=false]){const v={before:structuredClone(h.before),prepared:structuredClone(h.prepared),reservation:structuredClone(h.reservation),attempt:structuredClone(h.attempt),checkpoint:{evidence:structuredClone(h.checkpoint.evidence),rows:h.rows}};mutate(v);await assert.rejects(()=>buildAndVerifyReceipt(v.checkpoint,v.before,v.prepared,v.reservation,v.attempt,h.x.context));}
 await assert.rejects(()=>buildAndVerifyReceipt({...h.checkpoint,rows:h.rows.slice(0,1)},h.before,h.prepared,h.reservation,h.attempt,h.x.context));
});
test('real reserved local ledger stores provider receipt separately, preserves uncertain lock and idempotent reconciliation',async t=>{
 t.mock.method(Date,'now',()=>1793634000000);
 const h=await local(),s=memory(),m=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse()),context=h.x.context;
 let source={state:'active',code:h.x.beforeCode.toBoc().toString('base64'),data:h.x.beforeData.toBoc().toString('base64'),balanceNano:h.x.balanceBefore.toString(),lastTransactionHash:h.x.beforeLastTransactionHash};
 const originalLock={operation:context.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:context.oldFingerprint,validUntil:context.oldValidUntil,claimedAt:context.oldClaimedAt},args={storage:s,context,observe:async()=>({network:'-3',observedAt:Date.now(),source,originalLock,curve:{state:'uninitialized',code:'',balanceNano:'0'},minter:{state:'active',code:m.code.toBoc().toString('base64'),data:m.data.toBoc().toString('base64')}}),estimate:async q=>({network:'-3',observedAt:Date.now(),fingerprint:q.fingerprint,complete:true,senderFeesNano:'586674',totalNetworkFeesNano:'638542'})};
 const ledger=new RecoveryPreparationLedger(args),q=await ledger.prepare(RECOVERY);assert.equal(q.transaction.validUntil,h.x.validUntil);await ledger.reserveOfflineAttempt(RECOVERY,q.approval.fingerprint);
 source={state:'active',code:h.x.afterCode.toBoc().toString('base64'),data:h.x.afterData.toBoc().toString('base64'),balanceNano:h.x.balanceAfter.toString(),lastTransactionHash:h.rows[0].hash};
 assert.equal((await ledger.reconcileAcquired(h.checkpoint,{findAccount:async()=>null})).state,'MISSING_BEFORE_ACCOUNT_EVIDENCE');
 assert.equal((await ledger.reconcileAcquired(h.checkpoint,{findAccount:async()=>({...h.before,balanceNano:'0'})})).state,'RECEIPT_MISMATCH_EXTERNAL_REVIEW_REQUIRED');assert.equal(await s.get('receiptSummary'),undefined);
 const journal={findAccount:async()=>h.before};for(let i=0;i<2;i++){const status=await ledger.reconcileAcquired(h.checkpoint,journal);assert.equal(status.state,'PROVIDER_RECEIPT_VERIFIED_EXTERNAL_REVIEW_PENDING');assert.equal(status.providerReceiptVerified,true);assert.equal(status.independentFinalityVerified,false);assert.equal(status.operationCompleted,false);}
 const reload=new RecoveryPreparationLedger(args);assert.equal((await reload.status()).lastReceiptCheck.providerReceiptVerified,true);assert.equal((await s.get('destinationReservation')).fingerprint,q.approval.fingerprint);assert(await s.get('serverReceiptAcquisition'));await assert.rejects(()=>reload.executionRequest());await assert.rejects(()=>reload.prepareSuccessorRuntimeQuote());
});
test('no reservation produces a pending checkpoint, never a consumed nonce or completed operation',async()=>{
 const s=memory(),ledger=new RecoveryPreparationLedger({storage:s});const status=await ledger.reconcileAcquired({evidence:{accountHash:'11'.repeat(32),accountProof:{accountHash:'11'.repeat(32)},proofInclusionVerified:true,referenceBlock:{seqno:1},seqno:1}},{});assert.equal(status.state,'NO_RESERVED_RECOVERY_OPERATION');assert.equal(status.operationCompleted,false);assert.equal(status.providerReceiptVerified,false);assert.equal(await s.get('receiptSummary'),undefined);assert.equal(await s.get('destinationReservation'),undefined);
});
test('protected receipts route refuses browser evidence, wrong origin, absent proof and every signing route',async()=>{
 const origin='https://testnet.anlgram.com',env={APP_ORIGIN:origin},req=(body,site=origin)=>new Request(origin+'/api/recovery/receipts',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req({}),env)).status,403);assert.equal((await worker.fetch(req({raw:'forged'}),env)).status,400);assert.equal((await worker.fetch(req({},'https://anlgram.com'),env)).status,403);assert.equal((await worker.fetch(new Request(origin+'/api/recovery/receipts'),env)).status,405);
});
test('read-only receipt controller deduplicates clicks and reports missing receipt without invoking wallet or automatic retries',async()=>{
 const nodes=Object.fromEntries(['recovery-refresh','recovery-prepare','recovery-receipts','recovery-status'].map(x=>[x,{disabled:false,textContent:''}]));let calls=0;const script=readFileSync(new URL('../recovery-status.js',import.meta.url),'utf8');vm.runInNewContext(script,{document:{getElementById:id=>nodes[id]},Date,BigInt,AbortSignal,fetch:async(url,o)=>{calls++;assert.equal(url,'/api/recovery/receipts');assert.equal(o.method,'POST');assert.equal(o.body,'{}');return Response.json({scope:'SERVER_RECOVERY_PREPARATION_NOT_EXECUTION',financialSigningEnabled:false,executionEnabled:false,evidence:{proofInclusionVerified:true,accountHash:'11'},receipt:{state:'NO_RESERVED_RECOVERY_OPERATION',financialSigningEnabled:false,operationCompleted:false,providerReceiptVerified:false}});}});
 await Promise.all([nodes['recovery-receipts'].onclick(),nodes['recovery-receipts'].onclick()]);assert.equal(calls,1);assert.match(nodes['recovery-status'].textContent,/NO; no hay un recibo/);assert(!script.includes('sendTransaction'));
});
