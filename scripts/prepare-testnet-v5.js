'use strict';
// Offline preparation ONLY. Uses a public key, never signs or broadcasts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../minter-contract/node_modules/@ton/core');
const {WalletContractV5R1}=require('../minter-contract/node_modules/@ton/ton');
const {prepare}=require('./prepare-supervised-smoke');
const {candidate}=require('./prepare-migration-v2-plan');
const PUBLIC_KEY='94a010bf130bfceefdcba69f1dc18260277e1a3d073b632dd578b9c38b421a09';
const root=path.resolve(__dirname,'..');
const boc=c=>c.toBoc().toString('base64');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function wallets(){
 const make=id=>WalletContractV5R1.create({publicKey:Buffer.from(PUBLIC_KEY,'hex'),walletId:{networkGlobalId:id,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
 return{testnet:make(-3),mainnet:make(-239)};
}
function walletDescription(w,network){
 const d=w.init.data.beginParse();const signatureAllowed=d.loadBit(),initialSeqno=d.loadUint(32),walletId=d.loadInt(32);
 return{network:String(network),version:'V5R1',subwalletNumber:0,publicKey:PUBLIC_KEY,walletId,signatureAllowed,initialSeqno,
  raw:w.address.toRawString(),address:w.address.toString({testOnly:network===-3,bounceable:false}),
  codeHash:w.init.code.hash().toString('hex'),dataHash:w.init.data.hash().toString('hex'),stateInit:boc(core.beginCell().store(core.storeStateInit(w.init)).endCell())};
}
async function prepareV5(){
 const w=wallets(),operator=w.testnet.address;
 const p=await prepare({operator:operator.toRawString()}),component=await candidate({operator:operator.toRawString()});
 if(p.operator.raw!==operator.toRawString()||component.operator!==operator.toRawString())throw Error('Operator mismatch');
 for(const [role,account]of Object.entries(p.candidateAccounts))if(account.raw!==component.dependencies[role].raw)throw Error('Address mismatch');
 // Supersession is explicit; no old approval carries over to any new message.
 p.operator={...p.operator,version:'V5R1',walletId:2147483645,ownershipVerified:false,fundingVerified:false};
 p.status='BLOCKED_V5_OWNER_PROOF_HOSTING_FEES_AND_NEW_TRANSACTION_APPROVAL';
 return{schema:1,network:'-3',status:p.status,broadcastEnabled:false,readyForSigning:false,signaturesRequested:0,
  supersedes:{candidate:'supervised-smoke-candidate-2026-10-31.json',commit:'10e8a83',allV4MessagesAndDependentAddressesObsoleteForExecution:true,previousApprovalsCarryOver:false,historyPreserved:true},
  signingEnvironment:{origin:'https://testnet.anlgram.com',manifestUrl:'https://testnet.anlgram.com/tonconnect-manifest.json',published:false,financialActionsEnabled:false,sessionRestorationEnabled:false},
  wallet:walletDescription(w.testnet,-3),canonicalMainnetWalletForSamePublicKey:walletDescription(w.mainnet,-239),
  replay:{canonicalWalletIdsDiffer:true,canonicalAddressesDiffer:true,liveCrossNetworkCodeAndStateVerified:false,
   limitation:'V5 wallet_id separates standard network wallet configurations. It is not a global-ID opcode check: a deliberately deployed identical Testnet StateInit on another chain can accept the same signing domain. Verify the actual wallet app configuration, both chain states and exact request before any future signature. Never reuse V4.',
   signingPolicy:{network:'-3',oneMessage:true,expirationSeconds:120,seqnoMustBeFresh:true,gaslessAndRelayerForbidden:true,financialSigningEnabled:false}},
  walletApplicationCompatibility:{status:'PENDING_ACTUAL_OWNER_V5_TESTNET_CONNECTION_AND_TON_PROOF',doNotInferFromPublicKeyOrPreviousV4Connection:true},
  dependentAccounts:{...component.dependencies,...component.accounts},curveJettonWallet:require('../minter-contract/prepare-settlement-testnet').buildCandidate(operator).curveWallet.toString({testOnly:true}),
  buyerJettonWallet:p.buyerJettonWallet,pairDiscovery:component.pairSource,expectedPool:component.expectedPool,expectedLpWallet:component.expectedLpWallet,
  immutableLockSettings:component.terms,sourceVerification:p.sourceVerification,
  donation:{recipient:p.phaseA.donation.recipient,amountNano:'20000000',baseNano:'200000000',configurationChanged:false},
  smokePlan:p,componentPlan:component,
  expenditure:{attachmentNano:'100000000',feeEstimateNano:null,hardMaximumDebitNano:null,proposedTransactionOnePolicyCeilingNano:'120000000',ceilingApproved:false,
   note:'0.12 Testnet TON is a proposed review ceiling, not a wallet-enforced cap or authorization. Fresh V5 source/target simulation, bounded validity and explicit owner confirmation remain required; do not change the 0.10 attachment. Never transfer Mainnet TON.'},
  blockers:['Cloudflare account authentication and verified isolated HTTPS origin.','Actual owner V5R1 Testnet account, public key/StateInit and domain-bound single-use ton_proof.','Current source/target balances and both network states; replay review.','Fresh V5 fee estimate and explicit transaction-specific expenditure approval.','New metadata/admin/destination/payload approval; all old V4 transaction approvals invalid.','No migration, LP custody or withdrawal financial authorization.']};
}
async function main(){
 const value=await prepareV5(),data=JSON.stringify(value,null,2)+'\n';
 const file=path.join(root,'docs/launchpad/testnet-v5-candidate.json');
 const publicModule=`// Generated by scripts/prepare-testnet-v5.js; no signing authorization.\nexport const MINTER = '${value.dependentAccounts.minter.testnet}';\n`;
 const active={network:'-3',activeCandidate:'testnet-v5-candidate.json',candidateSha256:hash(value),version:'V5R1',readyForSigning:false,obsoleteForExecution:['supervised-smoke-candidate-2026-10-31.json','testnet-candidate-2026-10-30.json','financial-testnet-plan-2026-10-30.json','migration-v2-component-candidate-2026-10-30.json'],priorTransactionApprovalsInvalid:true};
 const files=[[file,data],[path.join(root,'testnet-interface/candidate-public.mjs'),publicModule],[path.join(root,'docs/launchpad/active-testnet-candidate.json'),JSON.stringify(active,null,2)+'\n']];
 if(process.argv.includes('--write'))for(const [f,text]of files)fs.writeFileSync(f,text);
 else if(process.argv.includes('--check'))for(const [f,text]of files)if(fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale V5 candidate: '+f);
 console.log(JSON.stringify({operator:value.wallet.address,operatorRaw:value.wallet.raw,accounts:Object.fromEntries(Object.entries(value.dependentAccounts).map(([k,v])=>[k,v.testnet])),buyerWallet:value.buyerJettonWallet,curveWallet:value.curveJettonWallet,candidateSha256:hash(value),readyForSigning:false},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={wallets,walletDescription,prepareV5};
