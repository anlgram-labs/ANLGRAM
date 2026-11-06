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
   if(cp.thresholdNano)s.graduation.targetNano=cp.thresholdNano;
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

function returnLeg(original, funded, fundingBounced, inTransit, curveBooked) {
 const remaining = BigInt(original) - BigInt(curveBooked);
 if (remaining < 0n || BigInt(inTransit) > remaining) throw Error('Invalid principal accounting');
 return {original, funded, fundingBounced, inTransit, curveBooked,
  notBookedByCurve: remaining.toString(), dexTerminalOutcome: 'UNKNOWN'};
}

// Internal status projection. Identity and the previous checkpoint come from
// the server's project context. Clients cannot submit evidence to this path.
export function generation2Status(identity, {checkpoint, previous, curveCheckpoint, evidence = []} = {}) {
 const matches = cp => isMigrationCheckpoint(cp) && cp.generation === 2 && cp.role === 'migration'
  && cp.project === identity.project && cp.address === identity.migrator
  && cp.operationId === String(identity.operationId);
 const result = {
  schema: 2, generation: 2, project: identity.project, migrator: identity.migrator,
  operationId: String(identity.operationId), scope: 'REFERENCE_RELATIVE_READ_ONLY',
  dispatch: 'UNKNOWN', mint: 'NOT_VERIFIED', custody: 'UNKNOWN', lock: 'UNKNOWN',
  settlement: 'UNKNOWN', historicalLp: null, currentWalletUnits: null,
  unresolvedReturns: 'UNKNOWN', evidence: [], withdrawalEvidence: [], checkpoint: null, principalAccounting: null, curve: null,
  financialSigningEnabled: false, broadcastingEnabled: false, tradingEnabled: false,
  migrationAuthorized: false, withdrawalsEnabled: false, recoveryEnabled: false,
 };
 if (!checkpoint) return result;
 if (!matches(checkpoint)) throw Error('Wrong generation 2 project checkpoint');
 const proof = checkpoint.proof;
 const lt = BigInt(proof.lastTransactionLt);
 const observation = checkpoint.lpObservation;
 if (observation && BigInt(observation.lt) > lt) throw Error('Observation newer than account transaction');
 if (previous) {
  if (!matches(previous)) throw Error('Wrong previous project checkpoint');
  const old = previous.proof;
  if (proof.masterchainSeqno < old.masterchainSeqno || lt < BigInt(old.lastTransactionLt)
   || (proof.masterchainSeqno === old.masterchainSeqno &&
    (proof.masterchainRootHash !== old.masterchainRootHash || proof.masterchainFileHash !== old.masterchainFileHash || proof.accountHash !== old.accountHash))
   || (lt === BigInt(old.lastTransactionLt) &&
    (proof.lastTransactionHash !== old.lastTransactionHash || proof.accountHash !== old.accountHash))
   || (previous.lifecycle?.dexDispatched === '1' && checkpoint.lifecycle?.dexDispatched !== '1')
   || (previous.settlementPending && !checkpoint.settlementPending)
   || (previous.lpObservation && (!observation ||
    BigInt(observation.lt) < BigInt(previous.lpObservation.lt) ||
    (observation.lt === previous.lpObservation.lt && JSON.stringify(observation) !== JSON.stringify(previous.lpObservation))))) {
   throw Error('Stale or conflicting project checkpoint');
  }
 }
 result.checkpoint = proof;
 if(curveCheckpoint){
  const c=curveCheckpoint,p=c.proof;
  if(!isMigrationCheckpoint(c)||c.role!=='curve'||c.generation!==2||c.project!==identity.project||
    c.operationId!==result.operationId||p.masterchainSeqno!==proof.masterchainSeqno||
    p.masterchainRootHash!==proof.masterchainRootHash||p.masterchainFileHash!==proof.masterchainFileHash)throw Error('Wrong curve checkpoint');
  result.curve={address:c.address,thresholdNano:c.thresholdNano,reserveNano:c.reserveNano,inventoryUnits:c.curveTokenUnits,
   graduated:(c.stage>=4&&c.stage<=7)||BigInt(c.reserveNano)>=BigInt(c.thresholdNano),proof:p};
 }
 const life = checkpoint.lifecycle;
 if (checkpoint.activeOperationId === result.operationId && life) {
  const old = previous?.activeOperationId === result.operationId ? previous.lifecycle : null;
  if (old && (old.originalTonNano !== life.originalTonNano || old.originalJettonUnits !== life.originalJettonUnits ||
   ['fundedTonNano','fundedJettonUnits','fundingBouncedTonNano','fundingBouncedJettonUnits',
    'curveBookedTonNano','curveBookedJettonUnits'].some(field => BigInt(life[field]) < BigInt(old[field])))) {
   throw Error('Regressed operation principal accounting');
  }
  result.principalAccounting = {
   scope: 'REFERENCE_RELATIVE_CONTRACT_COUNTERS',
   tonNano: returnLeg(life.originalTonNano,life.fundedTonNano,life.fundingBouncedTonNano,
    life.returnTransitTonNano,life.curveBookedTonNano),
   jettonUnits: returnLeg(life.originalJettonUnits,life.fundedJettonUnits,life.fundingBouncedJettonUnits,
    life.returnTransitJettonUnits,life.curveBookedJettonUnits),
  };
 }
 const dispatched = checkpoint.activeOperationId === result.operationId && checkpoint.lifecycle?.dexDispatched === '1';
 if (dispatched) {
  result.dispatch = 'DEX_DISPATCHED';
  result.settlement = 'SETTLEMENT_PENDING';
  if (observation) {
   result.historicalLp = observation;
   result.custody = 'LP_CUSTODY_VERIFIED';
   result.lock = 'LP_LOCKED_VERIFIED';
  }
 }
 if (!Array.isArray(evidence) || evidence.length > 64) throw Error('Bounded evidence required');
 const reference = JSON.stringify([proof.masterchainSeqno, proof.masterchainRootHash, proof.masterchainFileHash]);
 const seen = new Set();
 for (const receipt of evidence) {
  if (!isIncludedLpEvidence(receipt) || !['LP_ISSUANCE','LP_WITHDRAWAL_IMMEDIATE_BOUNCE','LP_WITHDRAWAL_DELIVERY'].includes(receipt.kind) ||
   receipt.operationId !== result.operationId || receipt.reference !== reference ||
   receipt.locker !== checkpoint.locker || receipt.pool !== checkpoint.pool || receipt.lpWallet !== checkpoint.lpWallet) {
   throw Error('Wrong project mint evidence');
  }
  if (!dispatched) throw Error('LP evidence without dispatch');
  const key=receipt.kind+':'+receipt.walletTransactionHash;
  if (seen.has(key)) continue;
  seen.add(key);
  if(receipt.kind==='LP_ISSUANCE')result.evidence.push(receipt);
  else {
   if(!observation||receipt.newAttemptAuthorized!==false||receipt.operationCompleted!==false||
      (receipt.kind==='LP_WITHDRAWAL_IMMEDIATE_BOUNCE'&&
       (receipt.contractPrincipalRestoredFields!==true||receipt.deliveryVerified!==false))||
      (receipt.kind==='LP_WITHDRAWAL_DELIVERY'&&receipt.contractPendingMustRemain!==true))throw Error('Invalid withdrawal recovery evidence');
   result.withdrawalEvidence.push(receipt);
  }
 }
 result.evidence.sort((a,b) => {
  const delta = BigInt(a.walletTransactionLt) - BigInt(b.walletTransactionLt);
  return delta < 0n ? -1 : delta > 0n ? 1 : a.walletTransactionHash.localeCompare(b.walletTransactionHash);
 });
 if (result.evidence.length) result.mint = 'LP_MINTED_OBSERVED';
 return result;
}
