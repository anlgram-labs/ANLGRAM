'use strict';
// Public offline component candidate. Captured pTON getter execution is local;
// this never connects to a provider, deploys, signs, funds or broadcasts.
const fs=require('node:fs'),path=require('node:path'),core=require('../tests/settlement-runtime/node_modules/@ton/core');
const {buildCandidate}=require('../minter-contract/prepare-settlement-testnet'),{build}=require('../minter-contract/scripts/migration-v2-plan');
const {setup,snap}=require('../tests/settlement-runtime/stonfi-snapshot-support');
const {verifyArtifacts}=require('../lib/verified-contract-artifacts');
async function candidate(options={}){
 // Refuse stale bytecode BEFORE preparing addresses or unsigned templates.
 const sourceVerification=await verifyArtifacts();
 const base=buildCandidate(options.operator,core),chain=await setup();
 if(!core.Address.parse(snap.accounts.pton.address).equals(base.pton)||!core.Address.parse(snap.accounts.router.address).equals(base.dex))throw Error('Foreign snapshot endpoint mismatch');
 const ptonWallet=(await chain.runGetMethod(base.pton,'get_wallet_address',[{type:'slice',cell:core.beginCell().storeAddress(base.dex).endCell()}])).stackReader.readAddress();
 const tokenWallet=core.contractAddress(0,{code:base.wallet,data:core.beginCell().storeCoins(0).storeAddress(base.dex).storeAddress(base.addresses.minter).storeRef(base.wallet).endCell()});
 const p=build(core,{creator:base.operator,router:base.dex,pairWallet0:tokenWallet,pairWallet1:ptonWallet,operationId:options.operationId??77,tokenMaster0:base.addresses.minter,tokenMaster1:base.pton,percent:options.percent??100,duration:options.duration??'permanent',beneficiary:options.beneficiary,unlockedController:options.unlockedController});
 const account=x=>({raw:x.address.toRawString(),testnet:x.address.toString({testOnly:true}),codeHash:x.init.code.hash().toString('hex'),dataHash:x.init.data.hash().toString('hex'),stateInit:core.beginCell().store(core.storeStateInit(x.init)).endCell().toBoc().toString('base64')});
 return{network:'-3',status:'BLOCKED_COMPONENT_CANDIDATE_NOT_DEPLOYMENT_PLAN',broadcastEnabled:false,signaturesRequested:0,
  pairDiscoveryConfigured:true,pairDiscoveryVerifiedLive:false,currentRouterCodeProvenOnChain:false,operatorControlVerified:false,accountStateCheckedLive:false,metadataApproved:false,testnetDonationRecipientApproved:false,
  pairSource:{kind:'OFFLINE_CAPTURED_GETTER_NOT_LIVE',capturedUtc:snap.observedUtc,router:base.dex.toRawString(),pton:base.pton.toRawString(),tokenMaster:base.addresses.minter.toRawString(),pairWallets:[tokenWallet.toRawString(),ptonWallet.toRawString()]},
  sourceVerification,operator:base.operator.toRawString(),
  dependencies:Object.fromEntries(Object.entries(base.states).map(([role,init])=>[role,account({init,address:base.addresses[role]})])),
  accounts:{binding:account(p),locker:account(p.vault)},expectedPool:p.vault.pool.toRawString(),expectedLpWallet:p.vault.lpWallet.toRawString(),
  componentQueries:[{name:'discoverDeclaredPair',sender:base.operator.toRawString(),destination:p.address.toRawString(),minimumAttachedNano:'180000000',opcode:'414e5640'},
   {name:'refreshStoredCustodyObservation',sender:base.operator.toRawString(),destination:p.address.toRawString(),minimumAttachedNano:'40000000',opcode:'414e5632'}]
   .map(x=>({...x,operationId:p.vault.terms.operationId,body:core.beginCell().storeUint(parseInt(x.opcode,16),32).storeUint(BigInt(p.vault.terms.operationId),64).endCell().toBoc().toString('base64'),requiresSeparateApproval:true})),
  lifecycle:{version:3,locallyVerified:true,liveVerified:false,bindingIsLiquidityExecutor:false},
  terms:p.vault.terms,lpIssued:false,lpCustodyVerified:false,foreignSourceAuditVerified:false,migrationAuthorized:false,liquidityExecutorImplemented:false,
  blockers:['Exact operation-correlated LP issuance and first-notification recovery are unavailable beyond the restricted custody floor.',
   'Foreign LP wallet final withdrawal receipts are unavailable.',
   'Declared pair discovery is locally verified, but current Router/Pool code, upgrade trust and independent review remain unapproved for financial execution.',
   'The V2 binding has no liquidity executor; complete migration finalization and reconciliation remain blocked.',
   'No verified operator control/funding, approved Testnet donation recipient, current cost quote, live transaction sequence or deployment approval.']};
}
if(require.main===module)candidate().then(c=>{
 const f=path.join(__dirname,'../docs/launchpad/migration-v2-component-candidate-2026-10-30.json'),text=JSON.stringify(c,null,2)+'\n';
 if(process.argv.includes('--check')){
  if(fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale component candidate; review and regenerate offline.');
  console.log('Seven source/artifact checks and deterministic component candidate match. No live authorization.');
 }else if(process.argv.includes('--write')){fs.writeFileSync(f,text);console.log(f);}
 else console.log(text.trimEnd());
}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={candidate};
