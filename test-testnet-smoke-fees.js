'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./tests/settlement-runtime/node_modules/@ton/core'),{WalletContractV4}=require('./minter-contract/node_modules/@ton/ton');
const {unsignedEnvelope,feesNano,quote}=require('./scripts/quote-testnet-smoke-fees');
const key='94a010bf130bfceefdcba69f1dc18260277e1a3d073b632dd578b9c38b421a09';
const wallet=WalletContractV4.create({workchain:0,publicKey:Buffer.from(key,'hex')}),dest=new core.Address(0,Buffer.alloc(32,31));
const message={address:dest.toString({testOnly:true}),amount:'100000000',payload:core.beginCell().endCell().toBoc().toString('base64')};
const plan={network:'-3',broadcastEnabled:false,operator:{raw:wallet.address.toRawString()},steps:[{name:'review-only',message}],proposedSmokeBudget:{maximumTestnetNano:'2500000000'}};
test('fee envelope is standard V4 with an invalid all-zero signature and preserves the exact internal message',()=>{
 const s=unsignedEnvelope(wallet,message,0).beginParse();assert(s.loadBuffer(64).equals(Buffer.alloc(64)));assert.equal(s.loadUint(32),wallet.walletId);s.loadUint(32);assert.equal(s.loadUint(32),0);assert.equal(s.loadUint(8),0);assert.equal(s.loadUint(8),3);
 const m=core.loadMessageRelaxed(s.loadRef().beginParse());assert(m.info.dest.equals(dest));assert.equal(m.info.value.coins,100000000n);s.endParse();
 assert.throws(()=>unsignedEnvelope(wallet,{...message,address:dest.toString({testOnly:false})},0),/Testnet/);
 assert.throws(()=>unsignedEnvelope(wallet,message,-1),/seqno/);
});
test('fee accounting rejects missing, negative and lossy amounts',()=>{
 assert.equal(feesNano({in_fwd_fee:1,storage_fee:'2',gas_fee:3,fwd_fee:4}),10n);
 for(const value of[-1,1.2,9007199254740992,null])assert.throws(()=>feesNano({in_fwd_fee:value,storage_fee:0,gas_fee:0,fwd_fee:0}),/Malformed/);
});
test('quote uses only public GETs and explicit Testnet estimation, never treats absent destination fees as full readiness',async()=>{
 const calls=[],sentinel='LOCAL_TEST_CREDENTIAL_NOT_A_REAL_KEY';
 const result=await quote(plan,{env:{TONCENTER_API_KEY:sentinel},delay:async()=>{},fetchImpl:async(url,o)=>{
  calls.push({url,method:o.method});assert.equal(o.redirect,'error');
  if(url.includes('/methods/get_public_key')){assert.equal(o.method,'GET');return Response.json({success:true,exit_code:0,stack:[{type:'num',num:'0x'+key}]});}
  if(url.includes('/methods/seqno'))return Response.json({success:true,exit_code:0,stack:[{type:'num',num:'0x2c'}]});
  if(url.includes('/getAddressInformation?'))return Response.json({ok:true,result:{state:'uninitialized',balance:'3500000',code:'',data:''}});
  assert.equal(url,'https://testnet.toncenter.com/api/v2/estimateFee');assert.equal(o.method,'POST');const args=JSON.parse(o.body);assert.equal(args.ignore_chksig,true);assert(core.Cell.fromBase64(args.body).beginParse().loadBuffer(64).equals(Buffer.alloc(64)));
  return Response.json({ok:true,result:{source_fees:{in_fwd_fee:1,storage_fee:2,gas_fee:3,fwd_fee:4},destination_fees:[]}});
 }});
 assert.equal(calls.length,4);assert.equal(result.firstTransactionEstimatedRequiredNano,'100000010');assert.equal(result.firstTransactionEstimatedShortfallNano,'96500010');assert.equal(result.liveEndToEndFeeQuoteComplete,false);assert.equal(result.readyForSigning,false);assert.equal(result.signed,false);assert.equal(result.broadcast,false);assert.equal(result.ownershipCryptographicallyVerified,false);assert.equal(result.mainnetReplayObservation.mainnetSeqno,44);assert(!JSON.stringify(result).includes(sentinel));
});
test('a shared V4 nonce overlap halts before any Testnet fee call or financial action',async()=>{
 await assert.rejects(quote(plan,{env:{},delay:async()=>{},fetchImpl:async(url)=>{
  if(url.includes('get_public_key'))return Response.json({success:true,exit_code:0,stack:[{type:'num',num:'0x'+key}]});
  assert(url.includes('/methods/seqno'));return Response.json({success:true,exit_code:0,stack:[{type:'num',num:'0x0'}]});
 }}),/overlaps Mainnet/);
});
test('Mainnet and wrong operator are rejected before any network request',async()=>{
 for(const bad of[{network:'-239'},{operator:{raw:dest.toRawString()}}])await assert.rejects(quote({...plan,...bad},{fetchImpl:()=>assert.fail('no network')}),/Unapproved/);
});
