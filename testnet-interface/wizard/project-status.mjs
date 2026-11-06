// Existing /api/projects/prepare and /api/projects/status provide configuration
// and reference-anchored records, never unverified finality or authorization.
import {CURVE,GRADUATION_TARGET_NANO,units,format} from './model.mjs';

export const LIFECYCLE_STAGES=Object.freeze([
 {id:'DRAFT',label:'Draft',short:'Draft',description:'Saved locally on this browser/device. No contract deployed, no tokens minted.'},
 {id:'DEPLOYMENT_PENDING',label:'Deployment pending',short:'Deploy Pending',description:'Offline preparation generated or deployment awaiting finalized on-chain receipt.'},
 {id:'MINTER_DEPLOYED',label:'Minter deployed',short:'Minter Deployed',description:'Jetton Minter verified active on TON Testnet (-3) with matching code and content hashes.'},
 {id:'CURVE_INITIALIZATION_PENDING',label:'Curve initialization pending',short:'Curve Init Pending',description:'Minter deployed; Bonding Curve deployment, 800M Curve / 200M DEX minting or custody verification pending.'},
 {id:'TRADING_ACTIVE',label:'Trading active',short:'Trading Active',description:'Curve initialized, 800M Jetton custody verified and minter admin renounced; trading toward the 300 TON target for the new release.'},
 {id:'GRADUATION_REACHED',label:'Graduation reached',short:'Graduated',description:'Accumulated real TON reserve reached the verified project threshold. The new release targets 300 TON.'},
 {id:'MIGRATION_PENDING',label:'Migration pending',short:'Migration Pending',description:'Graduated; awaiting STON.fi v2.2 router liquidity deposit (200M tokens + graduated TON).'},
 {id:'LP_CUSTODY_PENDING',label:'LP custody pending',short:'LP Custody Pending',description:'Liquidity deposit submitted; awaiting finalized STON.fi LP token delivery receipt into LP Locker V2.'},
 {id:'LP_LOCKED',label:'LP locked',short:'LP Locked',description:'LP tokens verified in LP Locker V2 custody under immutable beneficiary, controller and unlock terms.'},
 {id:'MIGRATION_FAILED_OR_PARTIAL',label:'Migration failed or partially completed',short:'Migration Failed/Partial',description:'Migration router transfer or multi-hop liquidity deposit failed or partially completed; manual reconciliation required (retry prohibited).'}
]);

export const MIGRATION_LIFECYCLE_STEPS=Object.freeze([
 {step:1,id:'TRADING_ON_CURVE',label:'Trading on Curve',description:'Active Curve V2 trading toward the 500 real TON graduation threshold (800M Curve supply, 1% fee).'},
 {step:2,id:'GRADUATION_THRESHOLD_REACHED',label:'Graduation threshold reached',description:'Verify the real TON reserve against the project threshold. The new release targets 300 TON (300,000,000,000 nanoTON).'},
 {step:3,id:'MIGRATION_AUTHORIZED',label:'Migration authorized',description:'Positive V2 Curve-to-Migrator authorization and security gates satisfied (currently gated/disabled).'},
 {step:4,id:'LIQUIDITY_DEPOSIT_SUBMITTED',label:'Liquidity deposit submitted',description:'200,000,000 DEX tokens and graduated TON dispatched to STON.fi v2.2 Router and pair wallets.'},
 {step:5,id:'EXTERNAL_SETTLEMENT_PENDING',label:'External settlement pending',description:'Multi-hop STON.fi v2.2 Router → Pool liquidity minting in progress across shard blocks.'},
 {step:6,id:'LP_RECEIPT_PENDING',label:'LP receipt pending',description:'Awaiting authenticated 0x414c5632 LP token transfer notification from Locker LP wallet to LP Locker V2.'},
 {step:7,id:'LP_CUSTODY_VERIFIED',label:'LP custody verified',description:'On-chain LP Jetton custody and contributor provenance verified in LP Locker V2 vault.'},
 {step:8,id:'LP_LOCK_VERIFIED',label:'LP lock verified',description:'Immutable lock percentage (50%–100%), beneficiary, controller and unlock timer verified on-chain.'},
 {step:9,id:'MIGRATION_FINALIZED',label:'Migration finalized',description:'Full Curve V2 → STON.fi v2.2 → LP Locker V2 lifecycle reconciled with finalized receipts.'}
]);

export const MIGRATION_ANOMALY_STATES=Object.freeze({
 PARTIAL:{code:'PARTIAL',label:'Partial liquidity deposit (HOLD)',badge:'PARTIAL · HOLD · NO RETRY',detail:'Single token/TON leg delivered to external LPAccount without pool completion. Official refund_me reconciliation required; blind retry prohibited.'},
 FAILED:{code:'FAILED',label:'Migration failed or bounced',badge:'FAILED · NO RETRY',detail:'Router or migrator execution gate rejected or bounced. Reserves remain held pending audited reconciliation.'},
 EXPIRED:{code:'EXPIRED',label:'Expired quote or validity window',badge:'EXPIRED · NO RETRY',detail:'Transaction valid_until window elapsed before confirmed inclusion. Expiry alone never releases a V5 operation lock without finalized chain proof.'},
 UNCERTAIN:{code:'UNCERTAIN',label:'Outcome uncertain (Reconciliation required)',badge:'UNCERTAIN · LOCKED · NO RETRY',detail:'Transport or notification interrupted across multi-hop settlement. Never retry an uncertain financial operation.'}
});

export const FINANCIAL_STATE_CATALOG=Object.freeze({
 WALLET_DISCONNECTED:{code:'WALLET_DISCONNECTED',title:'Wallet disconnected',severity:'info',retryAllowed:false,statusLabel:'DISCONNECTED',detail:'No Testnet wallet connected. You can configure all 6 stages, calculate initial curve previews, save drafts locally and prepare offline plans without connecting.'},
 WRONG_NETWORK:{code:'WRONG_NETWORK',title:'Wrong TON network',severity:'error',retryAllowed:false,statusLabel:'REJECTED (MAINNET -239)',detail:'Connected wallet is not on TON Testnet (-3). Mainnet (-239) connections are rejected automatically; switch wallet to Testnet (-3). No financial request was sent.'},
 EXPIRED_QUOTE:{code:'EXPIRED_QUOTE',title:'Expired quote or validity window',severity:'warning',retryAllowed:false,statusLabel:'EXPIRED',detail:'Preview or transaction validity window (valid_until) has elapsed. Recalculate against fresh verified reserves. Note: an expired V5 validity window never releases a prior operation lock without finalized chain proof.'},
 TRANSACTION_REJECTED:{code:'TRANSACTION_REJECTED',title:'Transaction rejected in wallet',severity:'warning',retryAllowed:false,statusLabel:'NOT SIGNED',detail:'The wallet user declined signature approval before broadcast. No new transaction was submitted by this action.'},
 TRANSACTION_PENDING:{code:'TRANSACTION_PENDING',title:'Transaction pending finality',severity:'info',retryAllowed:false,statusLabel:'PENDING FINALITY',detail:'Operation is awaiting shard and masterchain block inclusion and descendant trace verification. Do not resubmit while pending.'},
 TRANSACTION_OUTCOME_UNCERTAIN:{code:'TRANSACTION_OUTCOME_UNCERTAIN',title:'Transaction outcome uncertain',severity:'error',retryAllowed:false,statusLabel:'LOCKED · NO RETRY',detail:'Wallet response or network transport was interrupted before finality confirmation. Automatic or manual retry is strictly disabled to prevent duplicate execution or V5 nonce replay.'},
 PROVIDER_RATE_LIMITED:{code:'PROVIDER_RATE_LIMITED',title:'Rate-limited RPC provider (HTTP 429)',severity:'warning',retryAllowed:false,statusLabel:'RATE LIMITED',detail:'Authenticated TON Testnet provider returned HTTP 429. Wait for the Retry-After cooldown window; stale or fabricated balances are never substituted.'},
 MISSING_FINALITY_EVIDENCE:{code:'MISSING_FINALITY_EVIDENCE',title:'Missing finality evidence',severity:'warning',retryAllowed:false,statusLabel:'NOT VERIFIED',detail:'Account getter snapshots or unauthenticated API responses do not prove transaction finality. Requires masterchain/shard inclusion proof and finalized compute/action phases.'},
 MIGRATION_FAILED:{code:'MIGRATION_FAILED',title:'Failed migration',severity:'error',retryAllowed:false,statusLabel:'MIGRATION FAILED',detail:'STON.fi migration router handoff or pool initialization bounced or failed validation. Reserves remain locked pending audited reconciliation; blind retry is disabled.'},
 PARTIAL_LIQUIDITY_DEPOSIT:{code:'PARTIAL_LIQUIDITY_DEPOSIT',title:'Partial liquidity deposit',severity:'error',retryAllowed:false,statusLabel:'PARTIAL DEPOSIT · HOLD',detail:'Only one leg of the 200M Jetton / TON pair reached the STON.fi router or pair wallet without completing pool minting. Requires multi-hop receipt reconciliation before any recovery action.'},
 LP_CUSTODY_NOT_VERIFIED:{code:'LP_CUSTODY_NOT_VERIFIED',title:'LP custody not verified',severity:'info',retryAllowed:false,statusLabel:'NOT VERIFIED',detail:'LP Locker V2 deterministic address is derived, but no authenticated LP Jetton transfer receipt confirms on-chain LP token custody. Reported LP balance remains UNKNOWN.'}
});

const VALID_STATUS_SCOPES=new Set([
 'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION',
 'REFERENCE_ANCHORED_PARTIAL_EVIDENCE_NOT_VALIDATOR_FINALITY',
 'REFERENCE_ANCHORED_ACCOUNT_RECORDS_NOT_VALIDATOR_FINALITY',
 'REFERENCE_RELATIVE_READ_ONLY',
 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'
]);

export function isAuthenticTxHash(hash){
 return typeof hash==='string'&&/^[a-f0-9]{64}$/i.test(hash.trim());
}

export function tonviewerTxUrl(hash){
 return isAuthenticTxHash(hash)?`https://testnet.tonviewer.com/transaction/${hash.trim().toLowerCase()}`:null;
}

export function tonviewerAccountUrl(addr){
 if(typeof addr!=='string'||!addr.trim()||addr.length>80)return null;
 return `https://testnet.tonviewer.com/${encodeURIComponent(addr.trim())}`;
}

export function describeFinancialState(code,extra={}){
 const base=FINANCIAL_STATE_CATALOG[code]||FINANCIAL_STATE_CATALOG.MISSING_FINALITY_EVIDENCE;
 const detail=code==='PROVIDER_RATE_LIMITED'&&extra.retryAfterSeconds?`Provider rate limited (429). Wait ${extra.retryAfterSeconds}s. No stale values substituted.`:base.detail;
 return{...base,detail,retryAllowed:false};
}

// Validates the exact POST /api/projects/status response contract (schema 2).
export function validateProjectStatusResponse(resp,expectedFingerprint,expectedMode='launchpad'){
 if(!resp||typeof resp!=='object'||resp.schema!==2||resp.network!=='-3')throw Error('Incompatible or malformed /api/projects/status response');
 if(resp.financialSigningEnabled!==false||resp.migrationAuthorized!==false||resp.withdrawalsEnabled!==false)throw Error('Unsafe financial flags in /api/projects/status response');
 if(expectedFingerprint&&resp.configurationFingerprint!==expectedFingerprint)throw Error('Stale /api/projects/status response: configurationFingerprint mismatch');
 if(expectedMode==='standard'){
  if(resp.status!==null||resp.unavailableReason!=='STANDARD_JETTON_HAS_NO_LAUNCHPAD_MIGRATION')throw Error('Invalid Standard mode /api/projects/status payload');
  return resp;
 }
 if(resp.generation===2){
  if(resp.scope!=='REFERENCE_RELATIVE_READ_ONLY'&&resp.scope!=='PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE')throw Error('Invalid Generation 2 status response scope');
  if(resp.settlement==='SETTLEMENT_COMPLETE')throw Error('Gate 414 violation: SETTLEMENT_COMPLETE is unreachable');
  return resp;
 }
 if(resp.scope!=='PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE')throw Error('Invalid Launchpad statusView in /api/projects/status response');
 if(!resp.status||!VALID_STATUS_SCOPES.has(resp.status.scope)||resp.status.financialSigningEnabled!==false||resp.status.migrationAuthorized!==false||resp.status.withdrawalsEnabled!==false)throw Error('Invalid Launchpad statusView in /api/projects/status response');
 return resp;
}

// Adapter isolating PR #21 migration.statusView, Generation 2 projections, and POST /api/projects/status responses.
export function normalizeMigrationStatusView(input){
 const sv=input?.statusView??(input?.schema===2&&input?.scope==='PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE'?input.status:input);
 const unavailableReason=input?.unavailableReason??null;
 const isGen2=Boolean(input?.generation===2||sv?.generation===2||input?.dispatch||sv?.dispatch);
 const validScope=Boolean(sv&&VALID_STATUS_SCOPES.has(sv.scope)&&sv.financialSigningEnabled===false&&sv.migrationAuthorized===false&&sv.withdrawalsEnabled===false);

 if(isGen2){
  const g=sv||input;
  const custodyVerified=g.custody==='LP_CUSTODY_VERIFIED';
  const lockVerified=g.lock==='LP_LOCKED_VERIFIED';
  const dispatched=g.dispatch==='DEX_DISPATCHED';
  const mintObserved=g.mint==='LP_MINTED_OBSERVED';
  const hist=g.historicalLp||null;
  const lt=hist?.lt||null;
  const receipts=Array.isArray(g.evidence)?g.evidence:null;
  const ton=g.principalAccounting?.tonNano, jettons=g.principalAccounting?.jettonUnits;

  return{
   scope:g.scope||'REFERENCE_RELATIVE_READ_ONLY',
   generation:2,
   dataStatus:dispatched?'PARTIAL':'UNKNOWN',
   unavailableReason,
   dispatch:g.dispatch||'UNKNOWN',
   mint:g.mint||'NOT_VERIFIED',
   custody:g.custody||'UNKNOWN',
   lock:g.lock||'UNKNOWN',
   settlement:g.settlement||'UNKNOWN',
   historicalLp:hist,
   lifecycle:{
    stage:lockVerified?'LP_LOCKED_VERIFIED':custodyVerified?'LP_CUSTODY_VERIFIED':dispatched?'DEX_DISPATCHED':'UNKNOWN',
    authenticated:true,
    operationId:g.operationId?String(g.operationId):null
   },
   deposits:{
    ton:{
     status:dispatched?'DISPATCHED_TO_STONFI_ROUTER':'UNAVAILABLE',
     principalNano:ton?.original??null,
     fundedNano:ton?.funded??null,
     returnedNano:ton?.curveBooked??null,
     inTransitNano:ton?.inTransit??null
    },
    jettons:{
     status:dispatched?'DISPATCHED_TO_STONFI_ROUTER':'UNAVAILABLE',
     principalUnits:jettons?.original??null,
     fundedUnits:jettons?.funded??null,
     returnedUnits:jettons?.curveBooked??null,
     inTransitUnits:jettons?.inTransit??null
    }
   },
   targetNano:GRADUATION_TARGET_NANO.toString(),
   realReserveNano:null,
   progressBps:null,
   eligible:false,
   localReserveEligible:null,
   routerVerification:'VERIFIED_VNEXT_DISPATCH',
   poolVerification:'VERIFIED_VNEXT_DISPATCH',
   transactionReceipts:receipts,
   lpCustodyStatus:custodyVerified?'LP_CUSTODY_VERIFIED':'UNKNOWN',
   lpCustodyUnits:null,
   lpReceivedUnits:hist?.receivedUnits??null,
   lpRecordedLockedUnits:hist?.lockedUnits??null,
   lpRecordedUnlockedUnits:hist?.freeUnits??null,
   lpUnlockTimestamp:hist?.unlockTimestamp??null,
   lpObservedLt:lt,
   currentWalletUnits:null,
   unresolvedReturns:'UNKNOWN',
   lpWithdrawalEligible:false,
   lpWithdrawalReceipts:validScope&&Array.isArray(g.withdrawalEvidence)&&g.withdrawalEvidence.some(r=>r.kind==='LP_WITHDRAWAL_DELIVERY')
    ?g.withdrawalEvidence.filter(r=>r.kind==='LP_WITHDRAWAL_DELIVERY'&&r.contractPendingMustRemain===true&&r.operationCompleted===false):null,
   lpWithdrawalBounceCount:validScope&&Array.isArray(g.withdrawalEvidence)?g.withdrawalEvidence.filter(r=>
    r.kind==='LP_WITHDRAWAL_IMMEDIATE_BOUNCE'&&r.contractPrincipalRestoredFields===true&&r.deliveryVerified===false).length:0,
   versionedPackage:{availableForLocalReview:true,selectedForThisLegacyPlan:true,financialAuthorization:false},
   migrationAuthorized:false,
   financialSigningEnabled:false,
   withdrawalsEnabled:false
  };
 }

 const tonDep=validScope&&sv.deposits?.ton?sv.deposits.ton:null;
 const jetDep=validScope&&sv.deposits?.jettons?sv.deposits.jettons:null;
 return{
  scope:validScope?sv.scope:'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION',
  generation:1,
  dataStatus:validScope&&typeof sv.dataStatus==='string'?sv.dataStatus:'UNKNOWN',
  unavailableReason,
  dispatch:'UNKNOWN',
  mint:'NOT_VERIFIED',
  custody:'UNKNOWN',
  lock:'UNKNOWN',
  settlement:'UNKNOWN',
  historicalLp:null,
  lifecycle:{
   stage:validScope&&typeof sv.lifecycle?.stage==='string'?sv.lifecycle.stage:'UNKNOWN',
   authenticated:Boolean(validScope&&sv.lifecycle?.authenticated===true),
   operationId:validScope&&sv.lifecycle?.operationId?String(sv.lifecycle.operationId):null
  },
  deposits:{
   ton:{
    status:tonDep&&typeof tonDep.status==='string'?tonDep.status:'UNAVAILABLE',
    principalNano:tonDep&&typeof tonDep.principalNano==='string'&&/^\d+$/.test(tonDep.principalNano)?tonDep.principalNano:null,
    fundedNano:tonDep&&typeof tonDep.fundedNano==='string'&&/^\d+$/.test(tonDep.fundedNano)?tonDep.fundedNano:null,
    returnedNano:tonDep&&typeof tonDep.returnedNano==='string'&&/^\d+$/.test(tonDep.returnedNano)?tonDep.returnedNano:null,
    inTransitNano:tonDep&&typeof tonDep.inTransitNano==='string'&&/^\d+$/.test(tonDep.inTransitNano)?tonDep.inTransitNano:null
   },
   jettons:{
    status:jetDep&&typeof jetDep.status==='string'?jetDep.status:'UNAVAILABLE',
    principalUnits:jetDep&&typeof jetDep.principalUnits==='string'&&/^\d+$/.test(jetDep.principalUnits)?jetDep.principalUnits:null,
    fundedUnits:jetDep&&typeof jetDep.fundedUnits==='string'&&/^\d+$/.test(jetDep.fundedUnits)?jetDep.fundedUnits:null,
    returnedUnits:jetDep&&typeof jetDep.returnedUnits==='string'&&/^\d+$/.test(jetDep.returnedUnits)?jetDep.returnedUnits:null,
    inTransitUnits:jetDep&&typeof jetDep.inTransitUnits==='string'&&/^\d+$/.test(jetDep.inTransitUnits)?jetDep.inTransitUnits:null
   }
  },
  targetNano:validScope&&sv.graduation?.realReserveNano!=null&&sv.graduation?.targetNano?
   String(sv.graduation.targetNano):GRADUATION_TARGET_NANO.toString(),
  realReserveNano:validScope&&typeof sv.graduation?.realReserveNano==='string'&&/^\d+$/.test(sv.graduation.realReserveNano)?sv.graduation.realReserveNano:null,
  progressBps:validScope&&Number.isInteger(sv.graduation?.progressBps)?sv.graduation.progressBps:null,
  eligible:validScope&&typeof sv.graduation?.eligible==='boolean'?sv.graduation.eligible:null,
  localReserveEligible:validScope&&typeof sv.graduation?.localReserveEligible==='boolean'?sv.graduation.localReserveEligible:null,
  routerVerification:validScope&&typeof sv.routerVerification==='string'?sv.routerVerification:'NOT_VERIFIED',
  poolVerification:validScope&&typeof sv.poolVerification==='string'?sv.poolVerification:'NOT_VERIFIED',
  transactionReceipts:validScope&&Array.isArray(sv.transactionReceipts)?sv.transactionReceipts:null,
  lpCustodyStatus:validScope&&typeof sv.lp?.custodyStatus==='string'?sv.lp.custodyStatus:'UNKNOWN',
  lpCustodyUnits:validScope&&typeof sv.lp?.custodyUnits==='string'&&/^\d+$/.test(sv.lp.custodyUnits)?sv.lp.custodyUnits:null,
  lpReceivedUnits:validScope&&typeof sv.lp?.receivedUnits==='string'&&/^\d+$/.test(sv.lp.receivedUnits)?sv.lp.receivedUnits:null,
  lpRecordedLockedUnits:validScope&&typeof sv.lp?.recordedLockedUnits==='string'&&/^\d+$/.test(sv.lp.recordedLockedUnits)?sv.lp.recordedLockedUnits:null,
  lpRecordedUnlockedUnits:validScope&&typeof sv.lp?.recordedUnlockedUnits==='string'&&/^\d+$/.test(sv.lp.recordedUnlockedUnits)?sv.lp.recordedUnlockedUnits:null,
  lpUnlockTimestamp:validScope&&typeof sv.lp?.unlockTimestamp==='string'&&/^\d+$/.test(sv.lp.unlockTimestamp)?sv.lp.unlockTimestamp:null,
  lpObservedLt:null,
  currentWalletUnits:null,
  unresolvedReturns:'UNKNOWN',
  lpWithdrawalEligible:validScope&&typeof sv.lp?.withdrawalEligible==='boolean'?sv.lp.withdrawalEligible:null,
  lpWithdrawalReceipts:validScope&&Array.isArray(sv.lp?.withdrawalReceipts)?sv.lp.withdrawalReceipts:null,
  versionedPackage:validScope&&sv.versionedPackage?{
   availableForLocalReview:Boolean(sv.versionedPackage.availableForLocalReview),
   selectedForThisLegacyPlan:Boolean(sv.versionedPackage.selectedForThisLegacyPlan),
   financialAuthorization:false
  }:{availableForLocalReview:false,selectedForThisLegacyPlan:false,financialAuthorization:false},
  migrationAuthorized:false,
  financialSigningEnabled:false,
  withdrawalsEnabled:false
 };
}

export function deriveMigrationLifecycle(draft,prepared=null,observation=null){
 const launch=draft?.mode==='launchpad';
 const sv=normalizeMigrationStatusView(observation??prepared?.migration);
 const anomalyCode=observation?.scope==='AUTHENTICATED_PROJECT_OBSERVATION'&&MIGRATION_ANOMALY_STATES[observation.migrationAnomaly]?observation.migrationAnomaly:(sv.dataStatus==='PARTIAL'?'PARTIAL':null);

 if(sv.generation===2&&sv.dispatch==='DEX_DISPATCHED'){
  const steps=MIGRATION_LIFECYCLE_STEPS.map(s=>{
   let verified=false;
   if(s.step===1||s.step===2||s.step===3||s.step===4||s.step===5)verified=true;
   if(s.step===6&&sv.mint==='LP_MINTED_OBSERVED')verified=true;
   if(s.step===7&&sv.lpCustodyStatus==='LP_CUSTODY_VERIFIED')verified=true;
   if(s.step===8&&sv.lock==='LP_LOCKED_VERIFIED')verified=true;
   // Step 9: MIGRATION_FINALIZED remains false under Gate 414
   return{
    ...s,
    status:!launch?'NOT_APPLICABLE':verified?'VERIFIED_ON_CHAIN':'NOT_VERIFIED',
    badgeText:!launch?'N/A (Standard mode)':verified?'VERIFIED':'NOT VERIFIED · PENDING'
   };
  });
  const confirmedStep=sv.lock==='LP_LOCKED_VERIFIED'?8:sv.lpCustodyStatus==='LP_CUSTODY_VERIFIED'?7:5;
  return{
   applicable:launch,
   confirmedStep,
   summaryBadge:sv.lock==='LP_LOCKED_VERIFIED'?'Step 8/9 Verified · Settlement Pending (Gate 414)':sv.lpCustodyStatus==='LP_CUSTODY_VERIFIED'?`Step 7/9 Verified · Custody at LT ${sv.lpObservedLt}`:'Step 5/9 Verified · Dispatched to STON.fi',
   anomaly:null,
   retryAllowed:false,
   steps
  };
 }

 const confirmedStep=observation?.scope==='AUTHENTICATED_PROJECT_OBSERVATION'&&Number.isInteger(observation.migrationStep)&&observation.migrationStep>=1&&observation.migrationStep<=9?observation.migrationStep:0;
 const steps=MIGRATION_LIFECYCLE_STEPS.map(s=>({
  ...s,
  status:!launch?'NOT_APPLICABLE':confirmedStep>=s.step?'VERIFIED_ON_CHAIN':'NOT_VERIFIED',
  badgeText:!launch?'N/A (Standard mode)':confirmedStep>=s.step?'VERIFIED':'NOT VERIFIED · PENDING'
 }));
 return{
  applicable:launch,
  confirmedStep,
  summaryBadge:!launch?'Not applicable (Standard Jetton)':anomalyCode?MIGRATION_ANOMALY_STATES[anomalyCode].badge:confirmedStep>0?`Step ${confirmedStep}/9 Verified`:'0/9 Verified · Migration Gated & Disabled',
  anomaly:anomalyCode?MIGRATION_ANOMALY_STATES[anomalyCode]:null,
  retryAllowed:false,
  steps
 };
}

export function projectStatus(prepared){
 if(prepared?.scope!=='OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'||prepared.network!=='-3'||prepared.financialSigningEnabled!==false||prepared.broadcastEnabled!==false)throw Error('Unsupported project observation scope');
 return{draftId:prepared.draftId,configurationFingerprint:prepared.configurationFingerprint,
  scope:'CONFIGURATION_ONLY_NO_PROJECT_OBSERVATION',deploymentStatus:'UNKNOWN',
  actualSupplyUnits:null,balanceUnits:null,reserveNano:null,custodyUnits:null,
  verifiedReceipts:null,distributedUnits:null,vestedUnits:null,unlockTimestamp:null,
  financialSigningEnabled:false};
}

export function projectStatusText(prepared,statusResponse=null){
 const s=projectStatus(prepared);
 const sv=statusResponse?normalizeMigrationStatusView(statusResponse):normalizeMigrationStatusView(prepared?.migration);
 const reason=statusResponse?.unavailableReason||sv.unavailableReason||'NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS';
 return`Project ${s.draftId}\nDeployment: UNKNOWN (${reason})\nLifecycle stage: ${sv.lifecycle.stage} (authenticated: ${sv.lifecycle.authenticated?'YES':'NO'})\nActual supply, wallet balance and Curve reserves: ${sv.realReserveNano?format(sv.realReserveNano,9)+' TON (reference-anchored record, not validator finality)':'UNKNOWN'}\nDistribution delivered, vesting escrow/claims and LP custody: ${sv.lpCustodyStatus}${sv.lpObservedLt?' (at LT '+sv.lpObservedLt+')':''}\nFinalized project receipts and on-chain LP unlock time: UNKNOWN\nDerived addresses and configured amounts below are preparation only. ANLTEST observations are a separate historical checkpoint. Financial execution remains disabled.`;
}

export function deriveLifecycleStage(draft,prepared=null,observation=null){
 // Never fabricate confirmed on-chain states from a local draft or offline preparation.
 if(observation&&observation.scope==='AUTHENTICATED_PROJECT_OBSERVATION'&&observation.network==='-3'&&observation.draftId===draft?.id){
  const map={
   DRAFT:'DRAFT',
   DEPLOYMENT_PENDING:'DEPLOYMENT_PENDING',
   MINTER_DEPLOYED:'MINTER_DEPLOYED',
   CURVE_INITIALIZATION_PENDING:'CURVE_INITIALIZATION_PENDING',
   TRADING_ACTIVE:'TRADING_ACTIVE',
   GRADUATION_REACHED:'GRADUATION_REACHED',
   MIGRATION_PENDING:'MIGRATION_PENDING',
   LP_CUSTODY_PENDING:'LP_CUSTODY_PENDING',
   LP_LOCKED:'LP_LOCKED',
   MIGRATION_FAILED_OR_PARTIAL:'MIGRATION_FAILED_OR_PARTIAL'
  };
  const stageId=map[observation.lifecycleStage]||'DRAFT';
  const entry=LIFECYCLE_STAGES.find(s=>s.id===stageId)||LIFECYCLE_STAGES[0];
  return{...entry,confirmedOnChain:stageId!=='DRAFT'&&stageId!=='DEPLOYMENT_PENDING',observationStatus:'VERIFIED_OBSERVATION',preparedOffline:Boolean(prepared)};
 }
 const sv=normalizeMigrationStatusView(observation??prepared?.migration);
 if(sv.generation===2&&sv.dispatch==='DEX_DISPATCHED'){
  if(sv.lock==='LP_LOCKED_VERIFIED'){
   const entry=LIFECYCLE_STAGES.find(s=>s.id==='LP_LOCKED')||LIFECYCLE_STAGES[8];
   return{...entry,confirmedOnChain:true,observationStatus:'VERIFIED_OBSERVATION',displayBadge:`LP LOCKED (Historical LT: ${sv.lpObservedLt})`,preparedOffline:Boolean(prepared)};
  }
  if(sv.lpCustodyStatus==='LP_CUSTODY_VERIFIED'){
   const entry=LIFECYCLE_STAGES.find(s=>s.id==='LP_CUSTODY_PENDING')||LIFECYCLE_STAGES[7];
   return{...entry,confirmedOnChain:true,observationStatus:'VERIFIED_OBSERVATION',displayBadge:`LP CUSTODY VERIFIED (LT: ${sv.lpObservedLt})`,preparedOffline:Boolean(prepared)};
  }
  const entry=LIFECYCLE_STAGES.find(s=>s.id==='MIGRATION_PENDING')||LIFECYCLE_STAGES[6];
  return{...entry,confirmedOnChain:true,observationStatus:'VERIFIED_OBSERVATION',displayBadge:'DEX DISPATCHED · SETTLEMENT PENDING',preparedOffline:Boolean(prepared)};
 }

 const entry=LIFECYCLE_STAGES[0];
 const hasRefRecord=sv.lifecycle.stage!=='UNKNOWN'&&!sv.lifecycle.authenticated;
 return{
  ...entry,
  confirmedOnChain:false,
  observationStatus:hasRefRecord?'REFERENCE_ANCHORED_RECORD_NOT_FINALITY':prepared?'OFFLINE_PLAN_PREPARED_DEPLOYMENT_UNKNOWN':'LOCAL_DRAFT_ONLY',
  preparedOffline:Boolean(prepared),
  displayBadge:hasRefRecord?`RECORD: ${sv.lifecycle.stage} (Unauthenticated · Not Finality)`:prepared?'DRAFT · Plan Prepared (Deployment UNKNOWN)':'DRAFT · Local Only'
 };
}

export function migrationSummary(draft,prepared=null,observation=null){
 const launch=draft?.mode==='launchpad';
 const mig=launch&&prepared?.migration?prepared.migration:null;
 const sv=normalizeMigrationStatusView(observation??mig);
 const thresholdNano=BigInt(sv.targetNano||GRADUATION_TARGET_NANO);
 const thresholdTon=format(thresholdNano);
 const obsReserve=observation?.scope==='AUTHENTICATED_PROJECT_OBSERVATION'&&typeof observation.realTonReserveNano==='string'&&/^\d+$/.test(observation.realTonReserveNano)?observation.realTonReserveNano:sv.realReserveNano;
 const verifiedReserveNano=obsReserve!==null?BigInt(obsReserve):null;
 const progressPercent=verifiedReserveNano!==null?Number((verifiedReserveNano*10000n)/thresholdNano)/100:(sv.progressBps!==null?sv.progressBps/100:null);
 const graduated=verifiedReserveNano!==null&&verifiedReserveNano>=thresholdNano;
 const tonDep=sv.deposits.ton,jetDep=sv.deposits.jettons;
 const depositSummary=!launch?'NOT_APPLICABLE':tonDep.principalNano!==null||jetDep.principalUnits!==null?`TON (${tonDep.status}): principal ${tonDep.principalNano??'UNKNOWN'} / funded ${tonDep.fundedNano??'UNKNOWN'} / returned ${tonDep.returnedNano??'UNKNOWN'} / in-transit ${tonDep.inTransitNano??'UNKNOWN'} nanoTON · Jettons (${jetDep.status}): principal ${jetDep.principalUnits??'UNKNOWN'} / funded ${jetDep.fundedUnits??'UNKNOWN'} / returned ${jetDep.returnedUnits??'UNKNOWN'} / in-transit ${jetDep.inTransitUnits??'UNKNOWN'} units`:`NOT_SUBMITTED · BLOCKED (TON deposit: ${tonDep.status} · Jetton deposit: ${jetDep.status}; 200,000,000 DEX tokens & graduated TON not deposited)`;
 return{
  applicable:launch,
  thresholdTon,
  thresholdNano:thresholdNano.toString(),
  curveAllocationTokens:CURVE.curve,
  dexReserveTokens:CURVE.dex,
  protocolFeeBps:CURVE.feeBps,
  observedRealTonReserveNano:verifiedReserveNano!==null?verifiedReserveNano.toString():null,
  observedRealTonReserveDisplay:verifiedReserveNano!==null?`${format(verifiedReserveNano,9)} TON (${sv.scope==='MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION'?'verified':'reference-anchored record · not validator finality'})`:'UNAVAILABLE (deployment UNKNOWN)',
  observedCurveInventoryDisplay:observation?.scope==='AUTHENTICATED_PROJECT_OBSERVATION'&&observation.curveInventoryUnits?`${format(observation.curveInventoryUnits,9)} tokens`:'UNAVAILABLE (configured 800,000,000; on-chain reserve UNKNOWN)',
  graduationProgressPercent:progressPercent,
  graduationProgressDisplay:progressPercent!==null?`${Math.min(100,progressPercent).toFixed(2)}% (${format(verifiedReserveNano??0n,9)} / ${thresholdTon} TON)`:`UNKNOWN (0% verified · target ${thresholdTon} real TON)`,
  migrationEligibility:!launch?'NOT_APPLICABLE (Standard Jetton mode)':graduated&&mig?.migrationAuthorized?'ELIGIBLE':`BLOCKED · NOT ELIGIBLE (financial eligibility: ${sv.eligible===null?'UNKNOWN':sv.eligible}${sv.localReserveEligible!==null?` · local reserve check: ${sv.localReserveEligible} [not authorization]`:''}; requires verified ${thresholdTon} TON graduation, V2 Curve/migrator handoff & external audit)`,
  routerVerification:sv.routerVerification,
  poolVerification:sv.poolVerification,
  versionedPackageStatus:sv.versionedPackage.availableForLocalReview?`Local V2 package available for review · selected for legacy plan: ${sv.versionedPackage.selectedForThisLegacyPlan?'YES':'NO'} · financial authorization: NONE`:'Legacy offline plan · V2 execution package not authorized',
  stonfiPoolAddress:mig?.expectedPool||'NOT PREPARED (prepare offline plan in Step 5)',
  migrationBindingAddress:mig?.binding?.address||'NOT PREPARED',
  lpLockerAddress:mig?.locker?.address||'NOT PREPARED',
  expectedLpWalletAddress:mig?.expectedLpWallet||'NOT PREPARED',
  pairWallet0:mig?.pair?.pairWallet0||'NOT PREPARED',
  pairWallet1:mig?.pair?.pairWallet1||'NOT PREPARED',
  routerCodeReferenceHash:mig?.routerCodeReferenceHash||'UNAVAILABLE',
  liquidityDepositStatus:depositSummary,
  migrationReceiptStatus:sv.transactionReceipts===null?'UNKNOWN · NO_AUTHENTIC_TRANSACTION':`${sv.transactionReceipts.length} reference-anchored receipt(s) (NOT validator finality; custody ${sv.lpCustodyStatus})`,
  transactionReceipts:sv.transactionReceipts||[],
  missingOrDelayedLpReceiptState:'PENDING / UNVERIFIED — STON.fi v2.2 minting is multi-hop (Curve → Migration Binding → Router → Pool → LP Wallet → LP Locker V2). Delayed or missing LP receipts never prove failure or custody and never allow blind retry.',
  blockedBy:mig?.blockedBy||['QUALIFIED_EXTERNAL_REVIEW','AUTHENTIC_ROUTER_AND_PAIR_DISCOVERY','VERSIONED_CURVE_MIGRATOR_HANDOFF','ACTUAL_DEPOSIT_AND_LP_CUSTODY_RECEIPTS','FOREIGN_LP_WITHDRAWAL_DELIVERY_EVIDENCE'],
  migrationAuthorized:false,
  withdrawalsEnabled:false
 };
}

export function lpLockerSummary(draft,prepared=null,observation=null){
 const launch=draft?.mode==='launchpad';
 let percentNum=null,validPercent=false;
 try{const p=units(draft?.lp?.percent??'100',0);if(p>=50n&&p<=100n){percentNum=Number(p);validPercent=true;}}catch{}
 const durationRaw=draft?.lp?.duration||'permanent';
 const isPermanent=durationRaw==='permanent';
 const durationLabel=isPermanent?'Permanent (duration = 0 · never unlocks)':durationRaw==='180'?'180 days (15,552,000 seconds)':durationRaw==='365'?'365 days (31,536,000 seconds)':'Unsupported duration';
 const mig=launch&&prepared?.migration?prepared.migration:null;
 const sv=normalizeMigrationStatusView(observation??mig);
 const custodyStatus=sv.lpCustodyStatus!=='UNKNOWN'?sv.lpCustodyStatus:(mig?.custody?.status||'NOT_VERIFIED');
 const receivedUnits=mig?.custody?.received??sv.lpReceivedUnits??sv.lpCustodyUnits??null;
 const lockedUnits=mig?.custody?.locked??sv.lpRecordedLockedUnits??null;
 const unlockedUnits=mig?.custody?.unlocked??sv.lpRecordedUnlockedUnits??null;
 const unlockTimestamp=mig?.custody?.unlockTimestamp??sv.lpUnlockTimestamp??null;
 const beneficiary=draft?.lp?.beneficiary?.trim()||(mig?.terms?.beneficiary)||'Not set (required)';
 const controller=percentNum===100?'None (100% of received LP tokens locked)':(draft?.lp?.controller?.trim()||mig?.terms?.unlockedController||'Not set (required when lock < 100%)');
 const withdrawalReceiptsText=sv.lpWithdrawalReceipts===null?'NONE VERIFIED · UNKNOWN (foreign LP wallet provides no authenticated final-delivery receipt)':sv.lpWithdrawalReceipts.length?`${sv.lpWithdrawalReceipts.length} reference-anchored delivery receipt(s) (locker request remains pending without contract callback)`:'0 withdrawal receipts';

 const actualVerifiedLpReceivedDisplay=receivedUnits!==null
  ?`${receivedUnits} LP units (${sv.lpObservedLt?`Historical on-chain record at LT ${sv.lpObservedLt}`:'On-chain record'})`
  :'UNKNOWN (0 verified · no authenticated LP receipt)';
 const lockedLpDisplay=lockedUnits!==null
  ?`${lockedUnits} LP units (${sv.lpObservedLt?`Historical locked share at LT ${sv.lpObservedLt}`:'On-chain record'})`
  :`UNKNOWN on-chain (Configured share: ${validPercent?percentNum:'—'}% of received LP tokens, rounded upward; custody NOT VERIFIED)`;
 const unlockedLpDisplay=unlockedUnits!==null
  ?`${unlockedUnits} LP units (${sv.lpObservedLt?`Historical unlocked share at LT ${sv.lpObservedLt}`:'On-chain record'})`
  :`UNKNOWN on-chain (Configured share: ${validPercent?100-percentNum:'—'}% of received LP tokens; custody NOT VERIFIED)`;

 return{
  applicable:launch,
  validPercent,
  percent:validPercent?percentNum:null,
  unlockedPercent:validPercent?100-percentNum:null,
  percentDisplay:validPercent?`${percentNum}% locked / ${100-percentNum}% unlocked (Configured)`:'INVALID (must be whole integer 50%–100%)',
  durationRaw,
  isPermanent,
  durationLabel,
  actualVerifiedLpReceivedDisplay,
  lockedLpDisplay,
  unlockedLpDisplay,
  currentWalletUnits:null,
  beneficiary,
  unlockedController:controller,
  unlockDateDisplay:isPermanent?'Permanent lock — no unlock date (never withdrawable)':unlockTimestamp==='18446744073709551615'?'Permanent lock — sentinel 18446744073709551615 (never withdrawable)':unlockTimestamp?new Date(Number(unlockTimestamp)*1000).toISOString():`UNKNOWN until confirmed on-chain lock start (${durationRaw} days from authenticated LP deposit)`,
  permanentWarning:isPermanent?'PERMANENT LOCK ACTIVE (DEFAULT): 100% permanent locks have no withdrawal path, no unlock timestamp and no admin bypass. Once LP tokens are deposited on-chain, locked principal can never be withdrawn.':'TIMED LOCK WARNING: Locked LP tokens cannot be withdrawn before the on-chain unlock timestamp. Every subsequent authenticated LP deposit extends the unlock timer for all remaining locked LP principal.',
  custodyStatus,
  custodyBadgeText:`LP Custody: ${custodyStatus.replaceAll('_',' ')}${sv.lpObservedLt?` (at LT ${sv.lpObservedLt})`:''} · Current LP balance: UNKNOWN`,
  withdrawalEligibility:isPermanent?'NEVER ELIGIBLE (Permanent lock · withdrawals permanently disabled in Locker V2)':`NOT ELIGIBLE · BLOCKED (eligible: ${sv.lpWithdrawalEligible===null?'UNKNOWN':sv.lpWithdrawalEligible}; requires verified LP custody, elapsed on-chain unlock timestamp, beneficiary signature & FOREIGN_LP_WITHDRAWAL_DELIVERY_EVIDENCE)`,
  authenticatedWithdrawalReceipts:withdrawalReceiptsText+(sv.lpWithdrawalBounceCount?
   ` · ${sv.lpWithdrawalBounceCount} immediate bounce restoration(s) observed`:''),
  withdrawalReceipts:sv.lpWithdrawalReceipts||[],
  extensionPolicy:mig?.terms?.extensionPolicy||'each authenticated deposit extends all remaining timed principal',
  lockerAddress:mig?.locker?.address||'NOT PREPARED (prepare offline plan in Step 5)',
  expectedLpWallet:mig?.expectedLpWallet||'NOT PREPARED',
  withdrawalsEnabled:false
 };
}
