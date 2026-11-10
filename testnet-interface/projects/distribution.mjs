import {Address,beginCell,contractAddress,storeStateInit} from '@ton/core';
import {units,effective,recipients,address} from '../wizard/model.mjs';
import {code} from './artifacts.mjs';
export const walletAddress=(owner,master,walletCode)=>contractAddress(0,{code:walletCode,data:beginCell().storeCoins(0).storeAddress(Address.parse(owner)).storeAddress(Address.parse(master)).storeRef(walletCode).endCell()});
// Wire layout is the existing TEP-74 transfer used by anl-labs.js.
export function transfer({queryId,amount,recipient,creator,forwardNano,comment,settled=false}){return beginCell().storeUint(settled?0x414e5301:0x0f8a7ea5,32).storeUint(BigInt(queryId),64).storeCoins(BigInt(amount)).storeAddress(Address.parse(recipient)).storeAddress(Address.parse(creator)).storeBit(false).storeCoins(BigInt(forwardNano)).storeBit(true).storeRef(beginCell().storeUint(0,32).storeStringTail(comment).endCell()).endCell().toBoc().toString('base64');}
export const settlementCompatibleWallet=walletCode=>['standard-jetton-settlement-wallet','anlgram-settlement-wallet','anlgram-dispatch-sell-wallet']
 .some(name=>walletCode.equals(code(name)));
export function prepareDistribution(d,{master,walletCode,seed}){
 const list=d.distribution.skip?[]:recipients(d),batchSize=Number(d.distribution.batchSize??'4');if(!Number.isInteger(batchSize)||batchSize<1||batchSize>4)throw Error('Invalid distribution batch size');
 const creator=address(d.metadata.creator),wallet=walletAddress(creator,master,walletCode),batches=[];
 const settled=settlementCompatibleWallet(walletCode),destination=wallet.toString({testOnly:true});
 for(let i=0;i<list.length;i+=batchSize){
  const group=list.slice(i,i+batchSize);
  const messages=group.map((recipient,n)=>{
   const queryId=(BigInt('0x'+seed.slice(0,12))*1024n+BigInt(i+n+1)).toString();
   const message={address:destination,amount:settled?'100000000':'50000000',queryId,
    payload:transfer({queryId,amount:recipient.amountUnits,recipient:recipient.address,creator,forwardNano:'10000000',comment:'ANL Labs Distribution',settled})};
   if(settled){
    message.receiptExpectation={operationId:seed+':distribution:recipient:'+(i+n),queryId,amountUnits:recipient.amountUnits,
     recipientWallet:walletAddress(recipient.address,master,walletCode).toRawString()};
    message.reconciliationQuery={address:destination,amount:'50000000',
     payload:beginCell().storeUint(0x414e5305,32).storeUint(BigInt(queryId),64).endCell().toBoc().toString('base64')};
   }
   return message;
  });
  batches.push({id:seed+':distribution:'+i/batchSize,status:'NOT_SUBMITTED',recipientCount:group.length,
   totalUnits:group.reduce((a,r)=>a+BigInt(r.amountUnits),0n).toString(),messages,recipients:group});
 }
 return{scope:'UNFUNDED_RECIPIENT_BATCH_TEMPLATES',creatorWallet:destination,creatorWalletRaw:wallet.toRawString(),batchSize,totalUnits:list.reduce((a,r)=>a+BigInt(r.amountUnits),0n).toString(),batches,availableBalanceUnits:null,networkFeesNano:null,requires:['AUTHENTIC_CREATOR_CUSTODY_AND_BALANCE','ACTUAL_WALLET_MESSAGE_CAPABILITY','FRESH_PER_BATCH_ESTIMATE','AUTHENTIC_DELIVERY_RECEIPTS','SEPARATE_OWNER_APPROVAL'],financialSigningEnabled:false};
}
export function vestingSchedule(d){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.vesting.startDate)||!['1','3','6'].includes(d.vesting.cliffMonths)||!['6','12','24'].includes(d.vesting.durationMonths))throw Error('Unsupported vesting schedule');
 const start=Math.floor(Date.parse(d.vesting.startDate+'T00:00:00Z')/1000),cliff=Number(d.vesting.cliffMonths)*30*86400,duration=Number(d.vesting.durationMonths)*30*86400;
 if(!Number.isSafeInteger(start)||start<0||!Number.isInteger(cliff)||cliff<0||!Number.isInteger(duration)||duration<=0||cliff>duration||start+duration>0xffffffff)throw Error('Vesting timestamps exceed the existing uint32 contract schedule');
 if(new Date(start*1000).toISOString().slice(0,10)!==d.vesting.startDate)throw Error('Invalid UTC vesting date');return{start,cliff,duration,cliffTimestamp:start+cliff,endTimestamp:start+duration,monthDefinition:'30 days, matching the existing contract builder'};
}
export function vestedUnits(schedule,total,now){const n=BigInt(total);if(n<0n||!Number.isSafeInteger(now))throw Error('Invalid vesting calculation');if(now<schedule.cliffTimestamp)return 0n;if(now>=schedule.endTimestamp)return n;return n*BigInt(Math.max(0,now-schedule.start))/BigInt(schedule.duration);}
export function prepareVesting(d,{master,walletCode,seed}){
 if(!d.vesting.enabled)return{status:'SKIPPED',financialSigningEnabled:false};
 const schedule=vestingSchedule(d),amount=units(d.vesting.amount,effective(d).decimals),creator=Address.parse(address(d.metadata.creator)),beneficiary=Address.parse(address(d.vesting.beneficiary));if(amount<=0n)throw Error('Positive vesting principal required');
 const standardSettlement=walletCode.equals(code('standard-jetton-settlement-wallet'));
 const dispatchSettlement=walletCode.equals(code('anlgram-dispatch-sell-wallet'));
 const settlementCompatible=settlementCompatibleWallet(walletCode);
 const vestingArtifact=standardSettlement?'anlgram-vesting-wallet-standard-v2'
  :dispatchSettlement?'anlgram-vesting-wallet-dispatch-v2'
  :settlementCompatible?'anlgram-vesting-wallet-v2':'anlgram-vesting-wallet';
 const init={code:code(vestingArtifact),data:beginCell().storeAddress(creator).storeAddress(beneficiary).storeAddress(Address.parse(master)).storeRef(walletCode).storeRef(beginCell().storeUint(schedule.start,32).storeUint(schedule.cliff,32).storeUint(schedule.duration,32).storeCoins(amount).storeCoins(0).storeBit(false).endCell()).endCell()},destination=contractAddress(0,init);
 return{scope:'UNFUNDED_IMMUTABLE_VESTING_TEMPLATE',settlementVersion:settlementCompatible?2:1,status:'NOT_SUBMITTED',address:destination.toString({testOnly:true}),raw:destination.toRawString(),codeHash:init.code.hash().toString('hex'),dataHash:init.data.hash().toString('hex'),stateInit:beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64'),schedule,amountUnits:amount.toString(),beneficiary:beneficiary.toRawString(),deposit:{address:walletAddress(creator.toRawString(),master,walletCode).toString({testOnly:true}),amount:'100000000',payload:transfer({queryId:BigInt('0x'+seed.slice(0,12)),amount,recipient:destination.toRawString(),creator:creator.toRawString(),forwardNano:'40000000',comment:''})},custodyVerified:false,networkFeesNano:null,blockedBy:[...(settlementCompatible?[]:['AUTHENTICATED_SETTLEMENT_WALLET_REQUIRED']),'SOURCE_REVIEW','AUTHENTIC_EXACT_DEPOSIT_CUSTODY','FINAL_CLAIM_DELIVERY_RECEIPTS','SEPARATE_OWNER_APPROVAL'],financialSigningEnabled:false};
}
