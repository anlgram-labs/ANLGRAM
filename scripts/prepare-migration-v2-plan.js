'use strict';
// Public offline component candidate. Captured pTON getter execution is local;
// this never connects to a provider, deploys, signs, funds or broadcasts.
const fs=require('node:fs'),path=require('node:path'),core=require('../tests/settlement-runtime/node_modules/@ton/core');
const {buildCandidate}=require('../minter-contract/prepare-settlement-testnet'),{build}=require('../minter-contract/scripts/migration-v2-plan');
const {setup,snap}=require('../tests/settlement-runtime/stonfi-snapshot-support');
async function candidate(){
 const base=buildCandidate(undefined,core),chain=await setup();
 if(!core.Address.parse(snap.accounts.pton.address).equals(base.pton)||!core.Address.parse(snap.accounts.router.address).equals(base.dex))throw Error('Foreign snapshot endpoint mismatch');
 const ptonWallet=(await chain.runGetMethod(base.pton,'get_wallet_address',[{type:'slice',cell:core.beginCell().storeAddress(base.dex).endCell()}])).stackReader.readAddress();
 const tokenWallet=core.contractAddress(0,{code:base.wallet,data:core.beginCell().storeCoins(0).storeAddress(base.dex).storeAddress(base.addresses.minter).storeRef(base.wallet).endCell()});
 const p=build(core,{creator:base.operator,router:base.dex,pairWallet0:tokenWallet,pairWallet1:ptonWallet,operationId:77,percent:100,duration:'permanent'});
 const account=x=>({raw:x.address.toRawString(),testnet:x.address.toString({testOnly:true}),codeHash:x.init.code.hash().toString('hex'),dataHash:x.init.data.hash().toString('hex')});
 return{network:'-3',status:'BLOCKED_COMPONENT_CANDIDATE_NOT_DEPLOYMENT_PLAN',broadcastEnabled:false,signaturesRequested:0,
  operatorControlVerified:false,accountStateCheckedLive:false,metadataApproved:false,testnetDonationRecipientApproved:false,
  pairSource:{kind:'OFFLINE_CAPTURED_GETTER_NOT_LIVE',capturedUtc:snap.observedUtc,router:base.dex.toRawString(),pton:base.pton.toRawString(),tokenMaster:base.addresses.minter.toRawString(),pairWallets:[tokenWallet.toRawString(),ptonWallet.toRawString()]},
  accounts:{binding:account(p),locker:account(p.vault)},expectedPool:p.vault.pool.toRawString(),expectedLpWallet:p.vault.lpWallet.toRawString(),
  terms:p.vault.terms,lpIssued:false,lpCustodyVerified:false,foreignSourceAuditVerified:false,migrationAuthorized:false,liquidityExecutorImplemented:false,
  blockers:['Actual versioned Curve/DEX/abort ID and epoch handshake is incomplete.','Foreign LP wallet final withdrawal receipts are unavailable.','Pair-master authentication and independent STON.fi review are incomplete.','No signer, funding, cost quote, exact live sequence or deployment approval.']};
}
if(require.main===module)candidate().then(c=>{
 if(process.argv.includes('--write')){const f=path.join(__dirname,'../docs/launchpad/migration-v2-component-candidate-2026-10-30.json');fs.writeFileSync(f,JSON.stringify(c,null,2)+'\n');console.log(f);}
 else console.log(JSON.stringify(c,null,2));
}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={candidate};
