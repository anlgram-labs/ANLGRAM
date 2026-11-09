'use strict';
// Offline unsigned review material. No signer, provider or execution API.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../tests/settlement-runtime/node_modules/@ton/core');
const {candidate}=require('./prepare-migration-v2-plan'),{buildPlan}=require('./prepare-financial-testnet-plan');
const {buildCandidate}=require('../minter-contract/prepare-settlement-testnet');
const donation=require('../assets/js/donation-config');
const {unsigned}=require('../lib/exact-integer');
const boc=c=>c.toBoc().toString('base64');
// Owner-approved destination for Testnet preparation only. Payment still needs
// the separately approved transaction plan. Production configuration is untouched.
function testnetDonation(chain='-3'){
 if(chain!=='-3')throw Error('Testnet-only preparation');
 const recipient=core.Address.parse(donation.RECIPIENT_ADDRESS);
 return{amountNano:donation.DONATION_AMOUNT_NANO.toString(),recipient:recipient.toRawString(),recipientApproved:true,paymentAuthorized:false,
  status:'RECIPIENT_APPROVED_TRANSACTION_NOT_AUTHORIZED',productionConfigurationChanged:false,
  message:{address:recipient.toString({testOnly:true,bounceable:false}),amount:donation.DONATION_AMOUNT_NANO.toString(),
   payload:boc(core.beginCell().storeUint(0,32).storeStringTail(donation.PAYLOAD_COMMENT).endCell())}};
}
function sellTemplate({wallet,curve,owner,amount,minimumTon,queryId=11n}){
 amount=unsigned(amount,{min:1n,error:'Invalid fresh sell terms'});minimumTon=unsigned(minimumTon,{min:1n,error:'Invalid fresh sell terms'});queryId=unsigned(queryId,{max:0xffffffffffffffffn,error:'Invalid fresh sell terms'});
 if(amount<=0n||amount>=2n**120n||minimumTon<=0n||minimumTon>=2n**120n||queryId<0n||queryId>0xffffffffffffffffn)throw Error('Invalid fresh sell terms');
 const a=x=>typeof x==='string'?core.Address.parse(x):x;
 const w=a(wallet),c=a(curve),o=a(owner);if([w,c,o].some(x=>x.workChain!==0))throw Error('Unsupported workchain');
 return{status:'UNSIGNED_REQUIRES_FRESH_EVIDENCE_AND_SEPARATE_APPROVAL',requiresSeparateApproval:true,
  message:{address:w.toString({testOnly:true}),amount:'100000000',payload:boc(core.beginCell().storeUint(0x0f8a7ea5,32).storeUint(queryId,64).storeCoins(amount)
   .storeAddress(c).storeAddress(o).storeBit(false).storeCoins(50000000n).storeBit(true).storeRef(core.beginCell().storeCoins(minimumTon).endCell()).endCell())}};
}
async function prepare(options={}){
 const component=await candidate({operator:options.operator}),p=buildPlan({operator:options.operator}),c=buildCandidate(options.operator,core);
 for(const[role,a]of Object.entries(p.candidateAccounts)){
  const d=component.dependencies[role];if(!d||a.raw!==d.raw||a.codeHash!==d.codeHash||a.dataHash!==d.dataHash)throw Error('Component/smoke version mismatch: '+role);
 }
 const approvedDonation=testnetDonation();
 p.steps.splice(p.steps.findIndex(s=>s.name==='mint-test-supply'),0,{name:'mandatory-creation-donation',status:'BLOCKED_NOT_APPROVED',requiresSeparateApproval:true,message:approvedDonation.message,
  acceptance:'Exactly one executed 0.02 TON message with the approved comment to the fixed recipient. Receipt and wallet debit must be reconciled; self-transfer is not an independent-payer test.'});
 const rejected=core.beginCell().storeUint(0x5fcc3d14,32).storeUint(12,64).storeCoins(1000000000000000001n).endCell();
 p.steps.push({name:'expected-slippage-rejection',status:'BLOCKED_NOT_APPROVED',requiresSeparateApproval:true,expectedContractExit:404,
  message:{address:c.addresses.curve.toString({testOnly:true}),amount:'100000000',payload:boc(rejected)},
  acceptance:'Curve compute rejection 404, actual bounced native return, unchanged TON/token reserves. Gas fees are not refunded.'});
 const walletInit={code:c.wallet,data:core.beginCell().storeCoins(0).storeAddress(c.operator).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()};
 const buyerWallet=core.contractAddress(0,walletInit);
 return{...p,formatVersion:2,scope:'SUPERVISED_TESTNET_CREATION_ACTIVATION_BUY_SELL_AND_BOUNCE_ONLY',
  sourceVerification:component.sourceVerification,componentCandidateSha256:crypto.createHash('sha256').update(JSON.stringify(component)).digest('hex'),
  operator:{raw:p.operatorRaw,testnet:c.operator.toString({testOnly:true,bounceable:false}),ownershipVerified:false,fundingVerified:false},
  buyerJettonWallet:buyerWallet.toString({testOnly:true}),
  proposedSmokeBudget:{maximumTestnetNano:'2500000000',phaseAAttachmentsNano:p.steps.reduce((n,x)=>n+BigInt(x.message.amount),0n).toString(),
   subsequentSellAttachmentNano:'100000000',creationBaseReserveNano:'200000000',mandatoryDonationNano:'20000000',feesAndContingencyReserveNano:'330000000',
   donationIncludedInPhaseA:true,isLiveFeeQuote:false,note:'Donation is included in Phase A, never added twice. Attachments include principal and retained contract funding, not just fees. Base reserve is not an extra authorized payment. No unused contract balance is assumed recoverable.'},
  creationCharge:{...p.creationCharge,status:'RECIPIENT_APPROVED_TRANSACTION_NOT_AUTHORIZED',recipient:approvedDonation.recipient,
   note:'Owner approved the identical raw recipient for this isolated Testnet plan. Production configuration is unchanged; payment still requires exact transaction approval.'},
  requirements:p.requirements.map(x=>x.startsWith('Approve Testnet metadata')?'Approve Testnet metadata and exact messages; the fixed 0.02 TON recipient is already approved for this isolated Testnet plan.':x),
  phaseA:{status:'BLOCKED_METADATA_FEES_FUNDING_AND_APPROVAL',approvalRequiredBeforeEverySignature:true,transactionCount:p.steps.length,
   metadata:{name:'ANLGRAM Testnet Settlement',symbol:'ANLTEST',decimals:9,approved:false},
   donation:approvedDonation},
  phaseB:{status:'BLOCKED_UNTIL_REAL_BUY_DELIVERY_AND_FRESH_SELL_QUOTE',message:null,
   requiredEvidence:['Exact included buy message and child receipt hashes; not just wallet acceptance.',
    'Buyer wallet code/master/owner and actual delivered Jetton units; source-wallet authenticated settlement status 2.',
    'Fresh Curve get_sell_quote for the exact sell amount and minimum TON after approved slippage.',
    'New exact unsigned sell payload and current fee estimate, reviewed before signing.'],
   acceptance:['Actual buyer Jetton debit, Curve-wallet credit and executed native payout to this operator.',
    'Exact reserve/fee reconciliation and no pending refund before considering the smoke complete.']},
  recovery:{status:'GAS_ONLY_AFTER_AUTHENTICATED_OPERATION_CORRELATION',
   nativeBounce:'The planned impossible-minimum buy tests native bounce recovery; principal return must be observed, never inferred from rejection alone.',
   jettonFailure:'Frozen recipient and lost-receipt recovery remain local Sandbox evidence; do not claim they were induced on Testnet.',
   missingReceipt:'Stop. Read the exact source-wallet operation record and replay a funded receipt query. Do not resubmit buy, mint or sell principal.',
   gasQuery:{destination:c.addresses.curve.toString({testOnly:true}),amountNano:'20000000',opcode:'414e5305',operationId:null,payload:null,requiresSeparateApproval:true},
   rollback:'No reset of blockchain history. Stop signing, retain transaction/operation hashes, reconcile receipts; renounced mint authority cannot be restored.'},
  v2Components:{deployedByThisPlan:false,binding:component.accounts.binding.raw,locker:component.accounts.locker.raw,terms:component.terms,
   migrationAuthorized:false,reason:'V2 is a separate destination-binding component; no mixing with V3 principal dispatch or external LP finalization.'},
  migration:{status:'BLOCKED_NOT_IN_TRANSACTION_ALLOWLIST',requiredPrincipalNano:'500000000000',templates:[],reason:'External exact LP evidence and independent review missing.'},
  noBroadcastCode:true,readyForSigning:false};
}
if(require.main===module)prepare().then(p=>{
 const text=JSON.stringify(p,null,2)+'\n',file=path.join(__dirname,'../docs/launchpad/supervised-smoke-candidate-2026-10-31.json');
 if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale supervised smoke candidate');console.log('Source-verified unsigned smoke candidate matches; signing remains blocked.');}
 else if(process.argv.includes('--write')){fs.writeFileSync(file,text);console.log(file);}else console.log(text);
}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare,sellTemplate,testnetDonation};
