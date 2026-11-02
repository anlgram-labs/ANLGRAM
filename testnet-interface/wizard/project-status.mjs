// Existing /api/projects/prepare has configuration, not live project evidence.
// Never attach the unrelated ANLTEST checkpoint to a creator's project.
export function projectStatus(prepared){
 if(prepared?.scope!=='OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'||prepared.network!=='-3'||prepared.financialSigningEnabled!==false||prepared.broadcastEnabled!==false)throw Error('Unsupported project observation scope');
 return{draftId:prepared.draftId,configurationFingerprint:prepared.configurationFingerprint,
  scope:'CONFIGURATION_ONLY_NO_PROJECT_OBSERVATION',deploymentStatus:'UNKNOWN',
  actualSupplyUnits:null,balanceUnits:null,reserveNano:null,custodyUnits:null,
  verifiedReceipts:null,distributedUnits:null,vestedUnits:null,unlockTimestamp:null,
  financialSigningEnabled:false};
}
export function projectStatusText(prepared){
 const s=projectStatus(prepared);
 return`Project ${s.draftId}\nDeployment: UNKNOWN\nActual supply, wallet balance and Curve reserves: UNKNOWN\nDistribution delivered, vesting escrow/claims and LP custody: UNKNOWN\nFinalized project receipts and on-chain LP unlock time: UNKNOWN\nDerived addresses and configured amounts below are preparation only. ANLTEST observations are a separate historical checkpoint. Financial execution remains disabled.`;
}
