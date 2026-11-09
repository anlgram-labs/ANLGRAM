'use strict';
// Offline public configuration review only. No signing, provider or broadcasting.
const fs=require('node:fs'),core=require('@ton/core'),api=require('./scripts/lp-locker-v2');
try{
 if(process.argv.length!==3)throw Error('Usage: node minter-contract/preview-lp-locker-v2.js PUBLIC_CONFIG.json');
 const candidate=api.build(core,JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
 console.log(JSON.stringify({status:'DEVELOPMENT_ONLY_NOT_DEPLOYED',broadcastEnabled:false,
  address:candidate.address.toRawString(),pool:candidate.pool.toRawString(),lpWallet:candidate.lpWallet.toRawString(),
  codeHash:candidate.init.code.hash().toString('hex'),disclosure:api.disclosure(candidate.terms),
  unlockPolicy:'Timed unlock is set on chain by authenticated LP receipts; subsequent receipts extend remaining locked principal.',
  withdrawalFunding:'Each request requires at least 0.10 TON explicitly supplied by the claimant; real network fee sufficiency remains unverified.'},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
