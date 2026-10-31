'use strict';
// Pure offline preparation. No provider, signer, connection or broadcasting API.
const fs=require('node:fs'),path=require('node:path');
const core=require('../tests/settlement-runtime/node_modules/@ton/core');
const {buildCandidate,manifest}=require('../minter-contract/prepare-settlement-testnet');
const {BondingCurveEngine}=require('../minter-contract/scripts/bonding-curve-math');
const {derive}=require('../minter-contract/scripts/stonfi-v22-addresses');
function buildPlan(options={}){
 const c=buildCandidate(options.operator,core),m=manifest(c),cell=core.beginCell,body=(op,q)=>cell().storeUint(op,32).storeUint(q,64);
 const boc=x=>x.toBoc().toString('base64'),init=x=>boc(cell().store(core.storeStateInit(x)).endCell());
 const steps=[];
 const add=(name,address,value,payload,stateInit)=>steps.push({name,status:'BLOCKED_NOT_APPROVED',requiresSeparateApproval:true,message:{address:address.toString({testOnly:true}),amount:value.toString(),...(payload?{payload:boc(payload)}:{}),...(stateInit?{stateInit:init(stateInit)}:{})}});
 for(const[name,state]of Object.entries(c.states))add('deploy-'+name,c.addresses[name],100000000n,cell().endCell(),state);
 add('initialize-curve',c.addresses.curve,100000000n,body(0x414e4c01,1n).storeAddress(c.addresses.minter).storeAddress(c.curveWallet)
  .storeRef(cell().storeAddress(c.dex).storeAddress(c.addresses.guard).storeAddress(c.addresses.migration).endCell()).storeRef(c.wallet).endCell());
 const mint=body(0x178d4519,2n).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(c.operator).storeCoins(60000000n).storeBit(false).endCell();
 add('mint-test-supply',c.addresses.minter,200000000n,body(21,2n).storeAddress(c.addresses.curve).storeCoins(100000000n).storeRef(mint).endCell());
 add('operator-renounce',c.addresses.minter,50000000n,body(3,0x414e4c4752454e4fn).storeAddress(null).storeAddress(c.addresses.curve).endCell());
 const quote=new BondingCurveEngine().quoteBuy(960000000n,50n);if(!quote.success)throw new Error('Local genesis quote failed');
 add('small-test-buy',c.addresses.curve,1000000000n,body(0x5fcc3d14,10n).storeCoins(quote.minTokensOut).endCell());
 const routerWallet=core.contractAddress(0,{code:c.wallet,data:cell().storeCoins(0).storeAddress(c.dex).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});
 const ptonWallet=core.Address.parse(require('../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json').accounts.ptonWallet.address);
 const dex=derive(core,c.dex,routerWallet,ptonWallet,c.addresses.guard);
 const templates=[];
 const template=(name,address,value,payload)=>templates.push({name,status:'BLOCKED_FINANCIAL_VERIFICATION',notPartOfSmokeBudget:true,message:{address:address.toString({testOnly:true}),amount:value.toString(),payload:boc(payload)}});
 template('initialize-migration-wallets',c.addresses.migration,50000000n,body(0x414e4c3b,901n).storeAddress(dex.lpWallet).storeAddress(ptonWallet).endCell());
 template('discover-guard-endpoints',c.addresses.guard,150000000n,body(0x414c5001,901n).endCell());
 template('register-lp-operation',c.addresses.guard,30000000n,body(0x414c5002,901n).storeAddress(c.addresses.migration).storeRef(cell().store(core.storeStateInit(c.states.migration)).endCell()).endCell());
 template('prime-refund-epoch',c.addresses.migration,40000000n,body(0x414e4c3d,901n).endCell());
 template('deposit-dex-liquidity',c.addresses.migration,400000000n,body(0x414e4c37,901n).storeAddress(routerWallet).storeAddress(dex.lpWallet).storeAddress(ptonWallet).endCell());
 template('recover-lp-account',c.addresses.migration,900000000n,body(0x414e4c3c,901n).endCell());
 template('sync-refund-custody',c.addresses.migration,40000000n,body(0x414e4c3e,901n).endCell());
 template('replay-persisted-lp-observation',c.addresses.guard,30000000n,body(0x414c5004,901n).endCell());
 return{network:'-3',status:'BLOCKED_NOT_APPROVED',broadcastEnabled:false,signaturesRequested:0,operatorRaw:m.operatorRaw,
  candidateAccounts:m.accounts,codeHashes:{wallet:c.wallet.hash().toString('hex'),...Object.fromEntries(Object.entries(c.states).map(([k,v])=>[k,v.code.hash().toString('hex')]))},
  proposedSmokeBudget:{maximumTestnetNano:'2500000000',preparedMessageAttachmentsNano:steps.reduce((sum,s)=>sum+BigInt(s.message.amount),0n).toString(),
   sellAttachmentReserveNano:'100000000',creationBaseNano:'200000000',mandatoryDonationNano:'20000000',feesAndContingencyReserveNano:'430000000',isFeeQuote:false},
  creationCharge:{status:'BLOCKED_TESTNET_RECIPIENT_APPROVAL',totalNanoBeforeFees:'220000000',recipient:null,note:'Existing production recipient/network configuration is preserved; no Testnet recipient or donation waiver is assumed.'},
  steps,buyEstimate:{scope:'Local pristine-genesis estimate, not a live quote; revalidate before approval',proposedSlippageBps:'50',expectedTokens:quote.tokensOut.toString(),minimumTokens:quote.minTokensOut.toString()},
  preconditions:{deploy:'Exact StateInit/code/data hashes; account must have no conflicting active/frozen code.',initialize:'Curve uninitialized, expected admin and all four candidate identities.',
   mint:'Curve INITIALIZING, master supply zero, operator still admin. Mint exactly once; poll original message on uncertainty, never resubmit blindly.',
   renounce:'Master supply exactly 1B and actual Curve-wallet custody verified; Curve RENOUNCE_PENDING; operator admin. Renunciation is irreversible.',
   buy:'Master admin null, Curve ACTIVE, same network and approved fresh min-out quote; verify delivered Jettons and persistent receipt, not wallet approval.',
   sell:'Read actual owned wallet balance and fresh net-TON quote; approve a new exact min-out payload after buy confirmation.'},
  sell:{status:'REQUIRES_ACTUAL_CONFIRMED_BALANCE_AND_FRESH_QUOTE',message:null,queryId:'11',proposedSlippageBps:'50',attachmentReserveNano:'100000000'},
  migration:{status:'BLOCKED',requiredPrincipalNano:'500000000000',requiredJettonUnits:'200000000000000000',templates,
   reason:'Curve dispatch/finalization and migration finalize remain blocked with 414; no approved real transition or funding plan.'},
  mainnet:{maximumAuthorizedCeilingNano:'5000000000',authorizedTransactionPlan:false,spentNano:'0'},
  requirements:['Verify connected operator raw address and Testnet chain -3, account control, funding, current code/data and fee estimates.',
   'Approve Testnet metadata and creation charge recipient; preserve mandatory 0.20 + 0.02 TON.',
   'Approve exact individual messages and fresh quote limits before any signature. No validUntil/signing session is generated here.',
   'For every action verify exact external/inbound message hashes, transaction compute/action phases, descendants and persistent operation records through protected TON Center reads.',
   'LP receipt lost before locker execution cannot be backfilled from an off-chain snapshot. Independent foreign source/code/custody review and Curve handoff confirmation remain required.',
   'Stop on unknown outcomes; retry gas-only queries of the same operation. Never resend principal because an acknowledgement is absent.']};
}
if(require.main===module){
 const text=JSON.stringify(buildPlan(),null,2)+'\n';
 if(process.argv.includes('--write')){const p=path.resolve(__dirname,'../docs/launchpad/financial-testnet-plan-2026-10-30.json');fs.writeFileSync(p,text);console.log(p);}
 else console.log(text);
}
module.exports={buildPlan};
