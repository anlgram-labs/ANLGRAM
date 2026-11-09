'use strict';
// Offline extraction from the existing public snapshot, not source approval.
const fs=require('node:fs'),path=require('node:path');
const {setup,snap}=require('../tests/settlement-runtime/stonfi-snapshot-support');
const {Address}=require('../tests/settlement-runtime/node_modules/@ton/core');
(async()=>{
 const chain=await setup(),r=(await chain.runGetMethod(Address.parse(snap.accounts.router.address),'get_router_data')).stackReader;
 r.readBigNumber();r.readString();r.readBoolean();r.readAddress();r.readCell();
 const cells={pool:r.readCell(),lpWallet:r.readCell(),lpAccount:r.readCell()};
 const profile={version:1,tag:0x53543232,scope:'Development code identity only; not independently audited source or deployment authorization',
  sourceAuditVerified:false,migrationAuthorized:false,routerCodeReferenceHash:snap.accounts.router.codeCellHash,
  snapshotObservedUtc:snap.observedUtc,abiReference:'https://github.com/ton-blockchain/abis/tree/7dc57067d85c95dc25c09ccaaf108eaba62f6303/data/stonfi',
  genesisLpFee:20,genesisProtocolFee:10,genesisProtocolFeeAddress:null,
  codes:Object.fromEntries(Object.entries(cells).map(([name,code])=>[name,{hash:code.hash().toString('hex'),boc:code.toBoc().toString('base64')}]))};
 const file=path.resolve(__dirname,'../minter-contract/stonfi-v22-development-profile.json'),text=JSON.stringify(profile,null,2)+'\n';
 if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw new Error('Development profile mismatch');}
 else fs.writeFileSync(file,text);
 console.log(JSON.stringify({profile:file,sourceAuditVerified:false,codes:Object.fromEntries(Object.entries(profile.codes).map(([name,c])=>[name,c.hash]))}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
