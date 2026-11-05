// Offline, public configuration preparation only. No session, quote, signer or RPC.
import * as core from '@ton/core';
import candidate from '../../minter-contract/prepare-settlement-testnet.js';
import lifecycle from '../../scripts/prepare-financial-testnet-plan.js';
import charges from '../../assets/js/donation-config.js';
import snapshot from '../../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json' with {type:'json'};
import {artifacts,code,standardV2Code} from './artifacts.mjs';
import {normalizeDraft,validate,effective,units} from '../wizard/model.mjs';
import {configurationFingerprint} from '../wizard/preparation-model.mjs';
import {prepareDistribution,prepareVesting,walletAddress} from './distribution.mjs';
import {prepareMigration} from './migration.mjs';
const boc=c=>c.toBoc().toString('base64');
const encoded=(init)=>({address:core.contractAddress(0,init).toString({testOnly:true}),raw:core.contractAddress(0,init).toRawString(),codeHash:init.code.hash().toString('hex'),dataHash:init.data.hash().toString('hex'),stateInit:boc(core.beginCell().store(core.storeStateInit(init)).endCell())});
export async function prepareProject(input){
 const d=normalizeDraft(input),v=validate(d);if(!v.valid)throw Error(v.errors.join('\n'));
 const creator=core.Address.parse(d.metadata.creator);if(creator.workChain!==0)throw Error('Only basechain creators are supported');
 if(d.metadata.logo.startsWith('data:'))throw Error('Save the local image draft, then use a public HTTPS logo before preparing on-chain metadata. No image was uploaded.');
 const fingerprint=await configurationFingerprint(d),e=effective(d),metadata={name:d.metadata.name.trim(),symbol:d.metadata.symbol,decimals:String(e.decimals),description:d.metadata.description,anlgram_project_id:d.id,...(d.metadata.logo?{image:d.metadata.logo}:{})};
 const options={metadata,artifacts},c=candidate.buildCandidate(creator,core,options),launch=d.mode==='launchpad';
 const content=c.states.minter.data.beginParse().loadRef();
 const walletCode=launch?c.wallet:d.walletProfile?code('standard-jetton-settlement-wallet'):standardV2Code('wallet');
 const minter=launch?c.states.minter:{code:standardV2Code('minter'),data:core.beginCell().storeCoins(0).storeAddress(creator).storeRef(content).storeRef(walletCode).endCell()};
 const master=core.contractAddress(0,minter),accounts=Object.fromEntries(Object.entries(launch?c.states:{minter}).map(([k,init])=>[k,encoded(init)]));
 const queryId=BigInt('0x'+fingerprint.slice(0,12)),total=units(e.supply,e.decimals);
 let operations;
 if(launch){operations=lifecycle.buildPlan({operator:creator.toRawString(),candidateOptions:options}).steps.filter(s=>!s.name.includes('buy'));}
 else{
  operations=[{name:'deploy-minter',message:{address:accounts.minter.address,amount:'50000000',stateInit:accounts.minter.stateInit,payload:boc(core.beginCell().endCell())}},{name:'mint-configured-supply',message:{address:accounts.minter.address,amount:'150000000',payload:boc(core.beginCell().storeUint(21,32).storeUint(queryId||1n,64).storeAddress(creator).storeCoins(total).endCell())}}];
 }
 const operationId=i=>fingerprint+':'+i+(launch?'':':standard-v2');
 operations=operations.map((o,i)=>({...o,id:operationId(i),status:'NOT_SUBMITTED',requiresSeparateApproval:true,feesNano:null,receipt:{status:'NO_AUTHENTIC_TRANSACTION',transactionHash:null},receiptExpectation:{operationId:operationId(i),network:'-3',source:creator.toRawString(),destination:core.Address.parse(o.message.address).toRawString(),attachmentNano:o.message.amount,payloadHash:core.Cell.fromBase64(o.message.payload).hash().toString('hex'),stateInitHash:o.message.stateInit?core.Cell.fromBase64(o.message.stateInit).hash().toString('hex'):null,requires:'AUTHENTIC_FINALIZED_SOURCE_AND_DESCENDANTS_NOT_API_JSON_OR_WALLET_RESPONSE'},financialSigningEnabled:false}));
 const migration=launch?prepareMigration({creator:creator.toRawString(),router:c.dex.toRawString(),pairWallet0:walletAddress(c.dex.toRawString(),master.toRawString(),walletCode).toRawString(),pairWallet1:snapshot.accounts.ptonWallet.address,tokenMaster0:master.toRawString(),tokenMaster1:c.pton.toRawString(),operationId:queryId.toString(),settings:d.lp}):null;
 return{schema:1,scope:'OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION',network:'-3',draftId:d.id,configurationFingerprint:fingerprint,metadata,creator:creator.toRawString(),configuredSupplyUnits:total.toString(),actualSupplyUnits:null,accounts,operations,walletCodeHash:walletCode.hash().toString('hex'),
  distribution:prepareDistribution(d,{master:master.toRawString(),walletCode,seed:fingerprint}),vesting:prepareVesting(d,{master:master.toRawString(),walletCode,seed:fingerprint}),migration,
  creationCharge:{baseNano:charges.BASE_EXECUTION_NANO.toString(),mandatoryDonationNano:charges.DONATION_AMOUNT_NANO.toString(),totalBeforeNetworkNano:charges.TOTAL_TRANSACTION_NANO.toString(),proposedOperationAttachmentsNano:operations.reduce((n,o)=>n+BigInt(o.message.amount),0n).toString(),networkFeesNano:null,isFeeQuote:false,baseChargeReconciliationRequired:true,recipientPreserved:true,paymentVerified:false,donationMessage:{address:core.Address.parse(charges.RECIPIENT_ADDRESS).toString({testOnly:true,bounceable:false}),amount:charges.DONATION_AMOUNT_NANO.toString(),payload:boc(core.beginCell().storeUint(0,32).storeStringTail('ANLGRAM 10% Token Creation Donation').endCell())}},
  requirements:['CREATOR_OWNERSHIP_AND_SIGNER_NETWORK_ISOLATION','FRESH_ACCOUNT_STATE_AND_TRANSACTION_FEES','CREATION_CHARGE_AND_DONATION_RECONCILIATION','EXACT_MESSAGE_OWNER_APPROVAL','AUTHENTIC_FINALIZED_TRANSACTION_RECEIPTS'],
  receiptPolicy:'StateInit or wallet approval is not deployment evidence. Each receipt must bind the exact source, destination, message hash, operation ID, finalized compute/action phases and recipient balance changes. No client-supplied receipt can set completion.',
  compatibility:'Existing artifact code and storage layouts unchanged. Custom TEP-64 anlgram_project_id metadata separates new user projects; it changes only their new deterministic destinations. Existing ANLTEST candidate and original Curve #2 lock are untouched. No V2 migration handoff is authorized.',
  financialSigningEnabled:false,broadcastEnabled:false,custodyVerified:false};
}
