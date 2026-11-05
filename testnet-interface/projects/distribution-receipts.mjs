import {Address,beginCell,Dictionary} from '@ton/core';
import {includedActiveState} from './standard-registration.mjs';
import {settlementCompatibleWallet,walletAddress} from './distribution.mjs';

const key=(tag,id)=>BigInt('0x'+beginCell().storeUint(tag,32).storeUint(id,64).endCell().hash().toString('hex'));
const inline={parse:s=>s.asCell(),serialize(){throw Error('Read-only receipt decoder');}};

// Receipts are wallet contract records. They do not establish validator finality.
export function distributionReceiptRecords(data, plan) {
 const s=data.beginParse();
 s.loadCoins();
 const creator=s.loadAddress(),master=s.loadAddress(),walletCode=s.loadRef();
 if(!creator.equals(Address.parse(plan.operator.address))||!master.equals(Address.parse(plan.minter.raw))||
    !settlementCompatibleWallet(walletCode)||walletCode.hash().toString('hex')!==plan.walletCodeHash||
    !walletAddress(creator.toRawString(),master.toRawString(),walletCode).equals(Address.parse(plan.distribution.creatorWallet))) {
  throw Error('Distribution wallet identity mismatch');
 }
 const records=s.remainingBits?s.loadDict(Dictionary.Keys.BigUint(256),inline):null;
 return plan.distribution.batches.flatMap(batch=>batch.messages.map(({receiptExpectation:expected})=>{
  const {operationId,queryId,amountUnits,recipientWallet}=expected;
  const result={operationId,queryId,amountUnits,recipientWallet,outcome:'UNKNOWN',wireId:null};
  const index=records?.get(key(0x4f574e51,BigInt(queryId)))?.beginParse();
  if(!index)return result;
  const wireId=index.loadUintBig(64);index.endParse();
  const record=records.get(key(0x4f555447,wireId))?.beginParse();
  if(!record)throw Error('Incomplete distribution receipt record');
  const status=record.loadUint(2);
  if(![1,2,3].includes(status)||record.loadUintBig(64)!==BigInt(queryId)||
    record.loadCoins()!==BigInt(amountUnits)||!record.loadAddress().equals(Address.parse(recipientWallet))) {
   throw Error('Distribution receipt does not match operation');
  }
  record.endParse();
  return {...result,wireId:String(wireId),outcome:['UNKNOWN','PENDING','DELIVERY_RECORDED','RETURN_RECORDED'][status]};
 }));
}

export async function acquireDistributionReceipts(plan,providers,registrationReference,now=Date.now()) {
 const source=Address.parse(plan.distribution.creatorWallet).toRawString();
 const bundle=await providers.account(source);
 const {proof,reference}=bundle;
 if(!proof||!registrationReference||reference.seqno<registrationReference.seqno||
   (reference.seqno===registrationReference.seqno&&
    (reference.root_hash!==registrationReference.root_hash||reference.file_hash!==registrationReference.file_hash))||
   !Number.isSafeInteger(proof.chainTime)||Math.abs(now/1000-proof.chainTime)>120)throw Error('Distribution checkpoint unavailable');
 const {state}=includedActiveState(bundle,plan.walletCodeHash);
 return {scope:'WALLET_RECORDS_RELATIVE_TO_TESTNET_REFERENCE',source,proof,validatorFinalityVerified:false,
  recipients:distributionReceiptRecords(state.data,plan)};
}
