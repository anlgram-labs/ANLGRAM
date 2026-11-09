'use strict';
// OFFLINE evidence inspection only. Does not fetch, approve, persist a lock,
// request a signature, broadcast or authorize the next transaction.
const fs=require('node:fs');
const {verify}=require('../lib/curve-two-receipt');
function inspect(input){
 if(input?.network!=='-3')throw Error('Testnet-only evidence required');
 return{...verify(input.trace,input.approval,input.observations,input.secondary),inputIsOfflineEvidence:true,liveProviderAcquisitionVerifiedByThisTool:false,financialSigningEnabled:false,newOperationAllowed:false};
}
if(require.main===module){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--offline-evidence')throw Error('Usage: node scripts/verify-curve-two-receipt.js --offline-evidence <public-evidence.json>');
 try{const bytes=fs.readFileSync(args[1]);if(bytes.length>2*1024*1024)throw Error('Oversized evidence');console.log(JSON.stringify(inspect(JSON.parse(bytes)),null,2));}
 catch(e){console.error('CURVE #2 NOT VERIFIED: '+e.message);process.exitCode=1;}
}
module.exports={inspect};
