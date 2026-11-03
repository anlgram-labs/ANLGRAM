// The existing project preparation API is configuration, not a chain read.
import math from '../../minter-contract/scripts/bonding-curve-math.js';
import {isIncludedLpEvidence} from './lp-evidence.mjs';
import {isMigrationCheckpoint} from './evidence-brand.mjs';
export function migrationStatus(terms){
 return{scope:'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION',dataStatus:'UNKNOWN',
  schema:2,lifecycle:{stage:'UNKNOWN',authenticated:false,operationId:terms.operationId??null},
  deposits:{ton:{status:'UNAVAILABLE',principalNano:null,returnedNano:null},jettons:{status:'UNAVAILABLE',principalUnits:null,returnedUnits:null}},
  graduation:{targetNano:math.DEFAULT_CONFIG.graduationThresholdTon.toString(),realReserveNano:null,progressBps:null,eligible:null},
  routerVerification:'NOT_VERIFIED',poolVerification:'NOT_VERIFIED',transactionReceipts:null,
  lp:{configuredPercent:terms.percent,configuredDurationSeconds:terms.duration,beneficiary:terms.beneficiary,unlockedController:terms.unlockedController,custodyUnits:null,receivedUnits:null,recordedLockedUnits:null,recordedUnlockedUnits:null,custodyStatus:'UNKNOWN',unlockTimestamp:null,withdrawalEligible:null,withdrawalReceipts:null},
  versionedPackage:{availableForLocalReview:true,selectedForThisLegacyPlan:false,financialAuthorization:false},
  migrationAuthorized:false,financialSigningEnabled:false,withdrawalsEnabled:false};
}
// Server-only projection over this adapter's verified inclusion results, never
// a second ledger. Serialized client/indexer flags cannot establish evidence.
export function migrationEvidenceStatus(terms,evidence=[],checkpoints=[]){
 const s=migrationStatus(terms);if(!Array.isArray(evidence)||evidence.length>64)throw Error('Bounded evidence required');
 const seen=new Set(),receipts=[];
 for(const e of evidence){
  if(!isIncludedLpEvidence(e)||e.operationId!==String(terms.operationId))throw Error('Included operation-bound evidence required');
  const id=e.kind+':'+e.walletTransactionHash;if(seen.has(id))continue;seen.add(id);
  receipts.push(e);
 }
 if(receipts.length){s.scope='REFERENCE_ANCHORED_PARTIAL_EVIDENCE_NOT_VALIDATOR_FINALITY';s.dataStatus='PARTIAL';s.transactionReceipts=receipts;
  s.lp.custodyStatus='NOT_VERIFIED_PENDING_FINALITY_AND_MIGRATION_ATTRIBUTION';s.lp.withdrawalReceipts=receipts.filter(e=>e.kind==='LP_WITHDRAWAL_DELIVERY');}
 if(!Array.isArray(checkpoints)||checkpoints.length>2)throw Error('Bounded checkpoints required');
 const roles=new Set();let reference;
 for(const cp of checkpoints){
  if(!isMigrationCheckpoint(cp)||cp.operationId!==String(terms.operationId)||roles.has(cp.role))throw Error('Exact included account required');roles.add(cp.role);
  const ref=cp.proof.masterchainRootHash;if(reference&&reference!==ref)throw Error('Account reference mismatch');reference=ref;
  s.scope='REFERENCE_ANCHORED_ACCOUNT_RECORDS_NOT_VALIDATOR_FINALITY';s.dataStatus='PARTIAL';
  if(cp.role==='curve'){
   s.graduation.realReserveNano=cp.reserveNano;s.graduation.progressBps=cp.progressBps;
   s.graduation.localReserveEligible=cp.localReserveEligible;s.lifecycle={stage:cp.stage,authenticated:false,operationId:cp.operationId,scope:cp.scope};
  }else if(cp.lifecycle){const l=cp.lifecycle;
   s.deposits.ton={status:'CONTRACT_RECORD_NOT_DEX_FINALITY',principalNano:l.originalTonNano,fundedNano:l.fundedTonNano,returnedNano:l.curveBookedTonNano,inTransitNano:l.returnTransitTonNano};
   s.deposits.jettons={status:'CONTRACT_RECORD_NOT_DEX_FINALITY',principalUnits:l.originalJettonUnits,fundedUnits:l.fundedJettonUnits,returnedUnits:l.curveBookedJettonUnits,inTransitUnits:l.returnTransitJettonUnits};
  }
 }
 // No sum of wallet receipts establishes total current custody or contract
 // credit. Keep these null until a reviewed finality/attribution path exists.
 return s;
}
