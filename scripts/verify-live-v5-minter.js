'use strict';
// Read-only verification of the historical first deployment. No wallet or BOC
// forwarding. A later operation changing state must be reconciled separately.
const fs=require('node:fs'),path=require('node:path'),{verify}=require('../lib/verify-live-v5-minter'),evidence=require('../lib/toncenter-evidence');
async function run(){
 const root=path.resolve(__dirname,'..'),observation=JSON.parse(fs.readFileSync(path.join(root,'docs/launchpad/testnet-minter-one-chain-observation.json'))),candidate=require('../docs/launchpad/testnet-v5-candidate.json'),intent=require('../testnet-interface/minter-intent.json'),approval=require('../docs/launchpad/testnet-minter-one-approved-request.json');
 const hash=Buffer.from(observation.observations.minter.lastTransaction.hash,'base64').toString('hex');
 const [trace,secondary]=await Promise.all([evidence.traces(hash,{selector:'transaction'}),fetch('https://testnet.tonapi.io/v2/blockchain/accounts/'+candidate.dependentAccounts.minter.raw,{redirect:'error',signal:AbortSignal.timeout(10000)}).then(async r=>({status:r.status,body:await r.json()}))]);
 if(trace.status!=='OBSERVED'||trace.traces?.length!==1)throw Error('Real trace unavailable; no verified outcome');
 return {...verify(trace.traces[0],observation.observations,secondary,candidate,intent,approval),scope:'HISTORICAL_FIRST_DEPLOYMENT_NOT_A_FRESH_FINANCIAL_PREFLIGHT',accountObservationUtc:observation.observedUtc};
}
if(require.main===module){if(!process.argv.includes('--read-only'))throw Error('--read-only required');run().then(r=>{if(process.argv.includes('--write'))fs.writeFileSync(path.resolve(__dirname,'../docs/launchpad/testnet-minter-one-finalized.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));}).catch(e=>{console.error('NOT VERIFIED: '+e.message);process.exitCode=1;});}
module.exports={run};
