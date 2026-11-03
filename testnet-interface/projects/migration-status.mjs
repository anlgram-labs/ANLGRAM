// The existing project preparation API is configuration, not a chain read.
import math from '../../minter-contract/scripts/bonding-curve-math.js';
export function migrationStatus(terms){
 return{scope:'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION',dataStatus:'UNKNOWN',
  graduation:{targetNano:math.DEFAULT_CONFIG.graduationThresholdTon.toString(),realReserveNano:null,progressBps:null,eligible:null},
  routerVerification:'NOT_VERIFIED',poolVerification:'NOT_VERIFIED',transactionReceipts:null,
  lp:{configuredPercent:terms.percent,configuredDurationSeconds:terms.duration,beneficiary:terms.beneficiary,unlockedController:terms.unlockedController,custodyUnits:null,recordedLockedUnits:null,unlockTimestamp:null,withdrawalEligible:null},
  versionedPackage:{availableForLocalReview:true,selectedForThisLegacyPlan:false,financialAuthorization:false},
  migrationAuthorized:false,financialSigningEnabled:false,withdrawalsEnabled:false};
}
