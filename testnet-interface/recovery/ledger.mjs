import {FinancialOperation} from '../operation-lock.mjs';
import {pinned,RECOVERY,SUCCESSOR,operationPolicy,validateSnapshot,digest,freeze,requireExecutionActivation} from './policy.mjs';
import {buildAndVerifyReceipt} from './receipts.mjs';
export {RECOVERY,SUCCESSOR,requireExecutionActivation};
const json=b=>new Request('https://offline-preparation.internal/',{method:'POST',body:JSON.stringify(b)});
const scopes=(tx,prefix)=>({get:key=>tx.get(prefix+key),put:(key,value)=>tx.put(prefix+key,value),transaction:fn=>fn(scopes(tx,prefix))});
// NOT registered as a Worker/Pages route, DO namespace or TON Connect policy.
// Reservation tickets model the existing single-attempt primitive offline;
// they are never financial dispatch authority. There is no activation toggle.
export class RecoveryPreparationLedger {
 constructor({storage,observe,estimate,context=pinned,clock=Date.now}){this.storage=storage;this.observe=observe;this.estimate=estimate;this.context=freeze(structuredClone(context));this.clock=clock;}
 async snapshot(expected){const s=await this.observe();return{snapshot:s,identity:validateSnapshot(this.context,s,expected,this.clock())};}
 async receipt(){const saved=await this.storage.get('receiptBundle');if(!saved)throw Error('Finalized invalidation receipt fields required; never infer from seqno alone');const prepared=await this.storage.get(RECOVERY+':prepared');if(!prepared)throw Error('Original recovery preparation required');const p=operationPolicy(this.context,RECOVERY,this.context.oldSeqno);const {default:receiptVerifier}=await import('../../lib/v5-self-transfer-receipt.js');return receiptVerifier.verifySelfTransferReceipt(saved,{...p.intent,seqno:p.intent.expectedSeqno,walletCodeHash:this.context.walletCodeHash,expectedSource:prepared.approval.sourceIdentity});}
 async prepare(kind){
  if(kind!==RECOVERY)throw Error('Successor runtime preparation remains disabled; candidate review only');
  const proof=kind===SUCCESSOR?await this.receipt():null,expected=proof?proof.seqnoAfter:this.context.oldSeqno;
  const {snapshot,identity}=await this.snapshot(expected),policy=operationPolicy(this.context,kind,identity.seqno),now=Math.floor(this.clock()/1000);
  if(proof&&(identity.dataHash!==proof.finalDataHash||identity.balanceNano!==proof.finalBalanceNano||identity.lastTransactionHash!==proof.finalLastTransactionHash))throw Error('Source changed after finalized receipt; reconcile again');
  const binding=await digest({network:'-3',operator:this.context.operator,curve:this.context.curve,candidate:this.context.candidateSha256,oldFingerprint:this.context.oldFingerprint});
  const reservation=await this.storage.transaction(async tx=>{
   const bound=await tx.get('recoveryBindingV1');if(bound&&bound!==binding)throw Error('Ledger wallet/destination binding changed');if(!bound)await tx.put('recoveryBindingV1',binding);
   if(await tx.get('destinationReservation'))throw Error('Wallet/destination already reserved; no rearm');
   const prior=await tx.get('quote'),legacyRevision=await tx.get('quoteRevision')??0;
   if(prior&&prior.revision!==legacyRevision)throw Error('Quote revision storage disagreement');
   const revision=(prior?.revision??legacyRevision)+1,used=(await tx.get('quoteDeadlines')??[]).filter(t=>t>now);let validUntil=now+90;while(used.includes(validUntil))validUntil--;
   if(validUntil<=now){const e=Error('No fresh deadline');e.status=429;e.reason='QUOTE_DEADLINES_EXHAUSTED';e.retryAfterSeconds=Math.max(1,Math.min(...used)-now);throw e;}
   const quote={revision,validUntil,scopeKey:kind+':'+binding};
   await tx.put('quote',quote);await tx.put('quoteRevision',revision);await tx.put('quoteDeadlines',[...used,validUntil]);await tx.put('draft',null);return quote;
  });
  const transaction={network:'-3',from:policy.intent.operator,validUntil:reservation.validUntil,messages:[structuredClone(policy.intent.message)]};policy.validateIntent(transaction,now);
  const fingerprint=await policy.fingerprint(transaction),model=structuredClone(await this.estimate({operation:kind,transaction:structuredClone(transaction),expectedSeqno:identity.seqno,fingerprint}));
  if(model?.network!=='-3'||model.fingerprint!==fingerprint||model.complete!==true||!Number.isSafeInteger(model.observedAt)||model.observedAt>this.clock()||this.clock()-model.observedAt>15000||!/^[0-9]+$/.test(model.senderFeesNano||'')||!/^[0-9]+$/.test(model.totalNetworkFeesNano||''))throw Error('Fresh exact complete fee emulation required');
  const policyLimit=kind===RECOVERY?20000000n:120000000n,gross=BigInt(policy.intent.message.amount)+BigInt(model.totalNetworkFeesNano);if(gross>policyLimit||BigInt(identity.balanceNano)<gross||BigInt(model.senderFeesNano)<=0n||BigInt(model.totalNetworkFeesNano)<BigInt(model.senderFeesNano))throw Error('Model exceeds fixed proposal policy');
  const quoteExpiresAt=Math.min(Math.floor(this.clock()/1000)+60,transaction.validUntil),approval={fingerprint,validUntil:transaction.validUntil,observedAt:Math.floor(this.clock()/1000),quoteExpiresAt,expectedSeqno:identity.seqno,walletId:this.context.walletId,sourceIdentity:identity,modeledGrossDebitNano:gross.toString(),kind,revision:reservation.revision,quoteRevision:reservation.revision,quoteScopeKey:reservation.scopeKey};
  const draft={transaction,approval,model,...(snapshot.chainEvidence?{chainExpiryEvidence:structuredClone(snapshot.chainEvidence)}:{}),originalFingerprint:this.context.oldFingerprint,scope:'OFFLINE_PREPARATION_ONLY',financialSigningEnabled:false,independentReviewComplete:false,independentAcquisitionVerified:false};
  await this.storage.transaction(async tx=>{if(await tx.get('destinationReservation')||(await tx.get('quoteRevision'))!==reservation.revision||(await tx.get('quote'))?.revision!==reservation.revision)throw Error('Concurrent quote superseded');if(Math.floor(this.clock()/1000)>=quoteExpiresAt)throw Error('Quote expired during preparation');await tx.put('draft',draft);});
  return freeze(structuredClone(draft));
 }
 async reserveOfflineAttempt(kind,fingerprint){
  const draft=await this.storage.get('draft');if(!draft||draft.approval.kind!==kind||draft.approval.fingerprint!==fingerprint)throw Error('Unknown exact draft');
  const {identity}=await this.snapshot(draft.approval.expectedSeqno);if(await digest(identity)!==await digest(draft.approval.sourceIdentity))throw Error('Source changed; never reuse quote');
  if(kind===SUCCESSOR){const proof=await this.receipt();if(proof.seqnoAfter!==identity.seqno)throw Error('Receipt/source nonce mismatch');}
  const policy=operationPolicy(this.context,kind,identity.seqno);
  return this.storage.transaction(async tx=>{
   const d=await tx.get('draft'),q=await tx.get('quote');if(await tx.get('destinationReservation')||d?.approval.fingerprint!==fingerprint||d.approval.quoteRevision===undefined||(await tx.get('quoteRevision'))!==d.approval.quoteRevision||q?.revision!==d.approval.quoteRevision||q?.validUntil!==d.transaction.validUntil||q?.scopeKey!==d.approval.quoteScopeKey)throw Error('Duplicate or superseded destination reservation');
   if(Math.floor(this.clock()/1000)>=d.approval.quoteExpiresAt)throw Error('Expired quote');
   const operation=new FinancialOperation({storage:scopes(tx,kind+':')});operation.policy=policy;
   await tx.put(kind+':quote',structuredClone(q));
   let response=await operation.fetch(json({action:'prepare',transaction:d.transaction,approval:d.approval}));if(!response.ok)throw Error('Preparation already reserved');
   response=await operation.fetch(json({action:'claim',transaction:d.transaction,fingerprint,requirePrepared:true,approvalReference:{scope:'OFFLINE_ONLY',originalFingerprint:this.context.oldFingerprint}}));if(!response.ok)throw Error('Existing permanent reservation');
   const result=await response.json();await tx.put('destinationReservation',{operation:kind,fingerprint,originalFingerprint:this.context.oldFingerprint,status:'RESERVED_PENDING_RECONCILIATION'});
   return{...result,scope:'OFFLINE_RESERVATION_NOT_DISPATCH_AUTHORITY',financialSigningEnabled:false};
  });
 }
 async recordUncertain(kind,ticket,event){
  if(kind!==RECOVERY)throw Error('Successor recording is not activated');const p=operationPolicy(this.context,kind,this.context.oldSeqno);
  return this.storage.transaction(async tx=>{const operation=new FinancialOperation({storage:scopes(tx,kind+':')});operation.policy=p;return operation.fetch(json({action:'record',ticket,event}));});
 }
 async verifyOfflineReceipt(inputBundle){
  const bundle=structuredClone(inputBundle);
  const prepared=await this.storage.get(RECOVERY+':prepared');if(!prepared)throw Error('Original recovery preparation required');
  const {default:receiptVerifier}=await import('../../lib/v5-self-transfer-receipt.js');const p=operationPolicy(this.context,RECOVERY,this.context.oldSeqno),verified=receiptVerifier.verifySelfTransferReceipt(bundle,{...p.intent,seqno:p.intent.expectedSeqno,walletCodeHash:this.context.walletCodeHash,expectedSource:prepared.approval.sourceIdentity});
  const current=await this.snapshot(verified.seqnoAfter);if(current.identity.dataHash!==verified.finalDataHash||current.identity.balanceNano!==verified.finalBalanceNano||current.identity.lastTransactionHash!==verified.finalLastTransactionHash)throw Error('Receipt is not current source state');
  await this.storage.transaction(async tx=>{
   const reservation=await tx.get('destinationReservation'),attempt=await tx.get(RECOVERY+':operation');if(reservation?.operation!==RECOVERY||!attempt||attempt.validUntil!==bundle.validUntil)throw Error('Receipt has no exact reserved recovery operation');
   const existing=await tx.get('receiptBundle');if(existing){if(await digest(existing)!==await digest(bundle))throw Error('Different receipt/replay');return;}
   await tx.put('receiptBundle',structuredClone(bundle));await tx.put('receiptSummary',{...verified,originalFingerprint:this.context.oldFingerprint,independentFinalityVerified:false});
   // Original attempt and recovery reservation are NEVER erased or reset.
   // A successor draft is separate from a dispatch reservation.
  });return verified;
 }
 async prepareSuccessorCandidate(){
  // A finalized-field fixture can produce a reviewable draft, NEVER live eligibility.
  const verified=await this.receipt(),{identity}=await this.snapshot(verified.seqnoAfter);
  if(identity.dataHash!==verified.finalDataHash||identity.balanceNano!==verified.finalBalanceNano||identity.lastTransactionHash!==verified.finalLastTransactionHash)throw Error('Fresh post-receipt state mismatch');
  const policy=operationPolicy(this.context,SUCCESSOR,identity.seqno);
  return freeze({scope:'VERSIONED_SUCCESSOR_OFFLINE_CANDIDATE',operation:SUCCESSOR,expectedSeqno:identity.seqno,message:structuredClone(policy.intent.message),originalFingerprint:this.context.oldFingerprint,recoveryReceiptHash:verified.sourceTransactionHash,financialSigningEnabled:false,eligibleForAuthorization:false,blockedBy:['INDEPENDENT_PROVIDER_ACQUISITION','INDEPENDENT_LEDGER_REVIEW','SEPARATE_OWNER_AUTHORIZATION'],requiresFreshRuntimeQuote:true});
 }
 async prepareSuccessorRuntimeQuote(){throw Error('SUCCESSOR_DISABLED: finalized independent acquisition and review required; original reservation remains locked');}
 async reconcileAcquired(checkpoint,journal){
  if(checkpoint.evidence?.proofInclusionVerified!==true||checkpoint.evidence.accountProof?.accountHash!==checkpoint.evidence.accountHash)throw Error('Server-acquired proven account checkpoint required');
  const prepared=await this.storage.get(RECOVERY+':prepared'),reservation=await this.storage.get('destinationReservation'),attempt=await this.storage.get(RECOVERY+':operation');
  let status={scope:'SERVER_RECEIPT_RECONCILIATION_REVIEW_PENDING',state:'NO_RESERVED_RECOVERY_OPERATION',accountHash:checkpoint.evidence.accountHash,sourceSeqno:checkpoint.evidence.seqno,originalFingerprint:this.context.oldFingerprint,proofInclusionVerified:true,providerReceiptVerified:false,independentFinalityVerified:false,validatorFinalityVerified:false,operationCompleted:false,financialSigningEnabled:false};
  if(prepared&&reservation&&attempt){
   if(checkpoint.evidence.seqno===this.context.oldSeqno)status.state='RECOVERY_NOT_OBSERVED';
   else{
    const root=checkpoint.rows[1],before=root?await journal.findAccount(root.tx.stateUpdate.oldHash.toString('hex')):null;
    if(!before)status.state='MISSING_BEFORE_ACCOUNT_EVIDENCE';
    else{
     let result;try{result=await buildAndVerifyReceipt(checkpoint,before,prepared,reservation,attempt,this.context);}catch{status.state='RECEIPT_MISMATCH_EXTERNAL_REVIEW_REQUIRED';}
     if(result){
      await this.verifyOfflineReceipt(result.bundle);
      await this.storage.transaction(async tx=>{const prior=await tx.get('serverReceiptAcquisition');if(prior&&await digest(prior.bundle)!==await digest(result.bundle))throw Error('Different acquired receipt; preserve existing evidence');if(!prior)await tx.put('serverReceiptAcquisition',structuredClone(result));});
      status={...status,...result.summary,state:'PROVIDER_RECEIPT_VERIFIED_EXTERNAL_REVIEW_PENDING',providerReceiptVerified:true};
     }
    }
   }
  }
  const id=await digest({protocol:'RECOVERY_RECEIPT_CHECK_V2',ancestor:this.context.oldFingerprint,account:status.accountHash,state:status.state,receipt:status.sourceTransactionHash??null});
  await this.storage.transaction(async tx=>{if(!await tx.get('receiptCheck:'+id))await tx.put('receiptCheck:'+id,{...status,observedAt:this.clock()});await tx.put('lastReceiptCheck',id);});
  return status;
 }
 async executionRequest(){return requireExecutionActivation();}
 async status(){const d=await this.storage.get('destinationReservation'),check=await this.storage.get('lastReceiptCheck');return{scope:'OFFLINE_PREPARATION_ONLY',destinationReservation:d??null,receiptFieldsVerified:!!await this.storage.get('receiptSummary'),lastReceiptCheck:check?await this.storage.get('receiptCheck:'+check):null,independentFinalityVerified:false,financialSigningEnabled:false,retryPermitted:false};}
}
