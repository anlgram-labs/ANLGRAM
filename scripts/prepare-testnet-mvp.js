'use strict';
// Offline only: never changes the active candidate or creates a signing request.
const fs=require('node:fs'),path=require('node:path');
const p=require('../docs/launchpad/testnet-v5-candidate.json');
const {verifyUnchangedSources}=require('./preflight-v5-minter');
const {build}=require('../lib/testnet-mvp-plan');
if(require.main===module){
 verifyUnchangedSources(p);const plan=build(),text=JSON.stringify(plan,null,2)+'\n',file=path.resolve(__dirname,'../docs/launchpad/testnet-mvp-offline-plan.json');
 if(process.argv.includes('--write'))fs.writeFileSync(file,text);
 else if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale offline MVP plan');}
 console.log(JSON.stringify({steps:plan.steps.map(s=>({name:s.name,operationId:s.operationId,nominalSeqno:s.nominalSeqno})),signingEnabled:false,broadcastEnabled:false}));
}
