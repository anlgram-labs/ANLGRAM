'use strict';
// Public/server-side reads only. No wallet, signer, POST, deployment or secrets.
const fs=require('node:fs'),path=require('node:path');
const evidence=require('../lib/toncenter-evidence');
const snap=require('../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json');
async function inspect(){
 const observations=[];
 for(const role of['router','pton']){
  const expected=snap.accounts[role],actual=await evidence.account(expected.address);
  observations.push({role,address:expected.address,...actual,snapshotCodeReferenceMatches:actual.codeHash===expected.codeCellHash});
  await new Promise(resolve=>setTimeout(resolve,1100)); // respect public 1 RPS
 }
 const router=observations[0];
 let trace={status:'UNAVAILABLE'};
 if(router.lastTransaction?.hash){
  const value=router.lastTransaction.hash;
  const hash=/^[a-fA-F0-9]{64}$/.test(value)?value:Buffer.from(value,'base64').toString('hex');
  trace=await evidence.traces(hash,{selector:'transaction'});
 }
 // No code-source attestation or contract authorization follows from HTTP data.
 return{observedUtc:new Date().toISOString(),scope:'Read-only independent provider observations, not cryptographic state proofs or ANLGRAM live transactions',credentialsAvailable:{TONCENTER_API_KEY:!!process.env.TONCENTER_API_KEY},observations,trace,migrationAuthorized:false};
}
if(require.main===module){
 if(!process.argv.includes('--read-only'))throw new Error('Explicit --read-only required; no requests sent');
 inspect().then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Read-only evidence unavailable');process.exitCode=1;});
}
module.exports={inspect};
