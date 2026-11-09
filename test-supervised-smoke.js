'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./tests/settlement-runtime/node_modules/@ton/core');
const {Blockchain}=require('./tests/settlement-runtime/node_modules/@ton/sandbox');
const {prepare,sellTemplate,testnetDonation}=require('./scripts/prepare-supervised-smoke');
const {buildCandidate}=require('./minter-contract/prepare-settlement-testnet');
const {beginCell,Cell,Address,loadStateInit}=core;
let fixture;
const setup=()=>fixture??=(async()=>{const chain=await Blockchain.create();chain.now=1800000000;const operator=await chain.treasury('supervised-plan-operator');return{chain,operator,plan:await prepare({operator:operator.address})};})();
const op=m=>m?.body?.bits.length>=32?m.body.beginParse().loadUint(32):null;
async function send(operator,message){const to=Address.parseFriendly(message.address);return operator.send({to:to.address,value:BigInt(message.amount),body:Cell.fromBase64(message.payload),bounce:to.isBounceable,...(message.stateInit?{init:loadStateInit(Cell.fromBase64(message.stateInit).beginParse())}:{})});}

test('source-verified smoke has a bounded balanced budget, exact pre-dispatch payloads and no migration allowlist',async()=>{
 const {plan:p}=await setup();assert.equal(Object.keys(p.sourceVerification.contracts).length,7);assert.equal(p.steps.length,10);assert.equal(p.broadcastEnabled,false);assert.equal(p.readyForSigning,false);assert(p.phaseA.donation.recipientApproved);assert.equal(p.phaseA.donation.paymentAuthorized,false);assert.equal(p.phaseB.message,null);assert.equal(p.recovery.gasQuery.payload,null);assert.deepEqual(p.migration.templates,[]);
 const b=p.proposedSmokeBudget;assert.equal(BigInt(b.phaseAAttachmentsNano)+BigInt(b.subsequentSellAttachmentNano)+BigInt(b.creationBaseReserveNano)+BigInt(b.feesAndContingencyReserveNano),BigInt(b.maximumTestnetNano));assert.equal(b.donationIncludedInPhaseA,true);assert.equal(b.mandatoryDonationNano,'20000000');assert.equal(b.isLiveFeeQuote,false);
 assert(p.steps.every(s=>s.requiresSeparateApproval&&Address.parseFriendly(s.message.address).isTestOnly));
});

test('the exact serialized plan deploys fresh contracts, activates, buys, rejects slippage with real native bounce, retries receipt and sells in local Sandbox',async()=>{
 const {chain,operator,plan:p}=await setup(),c=buildCandidate(operator.address,core);
 const curveState=async()=>(await chain.runGetMethod(c.addresses.curve,'get_curve_state')).stack.map(x=>x.value);
 let deliveryId,delivered,bounced=0n,fees=0n;
 for(const step of p.steps){
  const before=step.expectedContractExit?await curveState():null;
  const r=await send(operator,step.message);fees+=r.transactions.reduce((n,t)=>n+t.totalFees.coins,0n);
  if(step.name==='mandatory-creation-donation'){
   const recipient=Address.parse(p.phaseA.donation.recipient);assert(!recipient.equals(operator.address),'test operator never substitutes the fixed recipient');
   const tx=r.transactions.find(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.dest.equals(recipient)&&t.inMessage.info.src.equals(operator.address)&&!t.inMessage.info.bounced);
   assert(tx);assert.equal(tx.inMessage.info.value.coins,20000000n);assert.equal((await chain.getContract(recipient)).balance,20000000n);
  }
  if(step.name==='small-test-buy'){
   const transfer=r.transactions.find(t=>t.inMessage?.info.dest?.equals(c.curveWallet)&&op(t.inMessage)===0x414e5301);assert(transfer);const s=transfer.inMessage.body.beginParse();s.loadUint(32);deliveryId=s.loadUintBig(64);
   const receipt=(await chain.runGetMethod(c.curveWallet,'get_settlement',[{type:'int',value:deliveryId}])).stackReader;assert.equal(receipt.readBigNumber(),2n);receipt.readBigNumber();delivered=receipt.readBigNumber();assert(delivered>0n);
  }
  if(step.expectedContractExit){
   assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(c.addresses.curve)&&t.description.computePhase?.exitCode===404));
   const refund=r.transactions.find(t=>t.inMessage?.info.dest?.equals(operator.address)&&t.inMessage.info.type==='internal'&&t.inMessage.info.bounced&&t.inMessage.info.src.equals(c.addresses.curve));assert(refund,'actual routed bounce, not inferred refund');bounced=refund.inMessage.info.value.coins;
   assert(bounced>0n&&bounced<BigInt(step.message.amount));assert.deepEqual((await curveState()).slice(4,8),before.slice(4,8));
  }
 }
 assert.equal((await curveState())[0],3n);const md=(await chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader;md.readBigNumber();md.readBigNumber();assert.equal(md.readAddressOpt(),null);
 const wallet=Address.parse(p.buyerJettonWallet),wd=(await chain.runGetMethod(wallet,'get_wallet_data')).stackReader;assert.equal(wd.readBigNumber(),delivered);assert(wd.readAddress().equals(operator.address));assert(wd.readAddress().equals(c.addresses.minter));
 const beforeRetry=await curveState();for(let i=0;i<2;i++){
  const replay=await operator.send({to:c.addresses.curve,value:20000000n,body:beginCell().storeUint(0x414e5305,32).storeUint(deliveryId,64).endCell()});
  assert(replay.transactions.some(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.dest.equals(c.addresses.curve)&&t.inMessage.info.src.equals(c.curveWallet)&&op(t.inMessage)===0x414e5304&&!t.description.aborted),'authenticated final receipt actually reaches Curve');
  assert(!replay.transactions.some(t=>op(t.inMessage)===0x414e5301||op(t.inMessage)===0x414e5302),'funded query never resends token principal');
 }
 assert.equal((await chain.runGetMethod(wallet,'get_wallet_data')).stackReader.readBigNumber(),delivered);assert.deepEqual((await curveState()).slice(4,8),beforeRetry.slice(4,8));
 const quote=(await chain.runGetMethod(c.addresses.curve,'get_sell_quote',[{type:'int',value:delivered}])).stackReader.readBigNumber();assert(quote>0n);
 const sell=sellTemplate({wallet,curve:c.addresses.curve,owner:operator.address,amount:delivered,minimumTon:quote*9950n/10000n}),r=await send(operator,sell.message);
 assert(r.transactions.some(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.src.equals(c.addresses.curve)&&t.inMessage.info.dest.equals(operator.address)&&t.inMessage.info.value.coins===quote),'actual routed TON sale payout');
 assert.equal((await chain.runGetMethod(wallet,'get_wallet_data')).stackReader.readBigNumber(),0n);assert.equal((await chain.runGetMethod(c.curveWallet,'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
 const final=await curveState();assert.equal(final[5],800000000000000000n);assert.equal(final[7],0n);assert.equal((await chain.runGetMethod(c.addresses.guard,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 console.log('LOCAL_PLAN_EVIDENCE',JSON.stringify({network:'Sandbox only',deliveredUnits:delivered.toString(),actualNativeBounceNano:bounced.toString(),quotedAndExecutedSellPayoutNano:quote.toString(),phaseASimulatedTransactionFeesNano:fees.toString(),notLiveFeeQuote:true}));
});

test('approved Testnet donation retains the permanent recipient, amount and comment while production Testnet gate remains intact',()=>{
 const original=require('./assets/js/donation-config'),d=testnetDonation();assert(Address.parse(d.message.address).equals(Address.parse(original.RECIPIENT_ADDRESS)));
 assert(Address.parseFriendly(d.message.address).isTestOnly);assert.equal(d.message.amount,original.DONATION_AMOUNT_NANO.toString());
 const s=Cell.fromBase64(d.message.payload).beginParse();assert.equal(s.loadUint(32),0);assert.equal(s.loadStringTail(),original.PAYLOAD_COMMENT);
 assert.throws(()=>testnetDonation('-239'),/Testnet-only/);assert.throws(()=>original.createMessage(core,'-3'),/No approved testnet/);
});

test('sell review builder rejects zero minimum output and unsafe ranges, preserves complete uint64 query and exact recipients',()=>{
 const a=new Address(0,Buffer.alloc(32,31)),b=new Address(0,Buffer.alloc(32,32)),o={wallet:a,curve:b,owner:a,amount:99n,minimumTon:1n,queryId:0xffffffffffffffffn};
 const p=sellTemplate(o),s=Cell.fromBase64(p.message.payload).beginParse();assert.equal(s.loadUint(32),0x0f8a7ea5);assert.equal(s.loadUintBig(64),o.queryId);assert.equal(s.loadCoins(),99n);assert(s.loadAddress().equals(b));assert(s.loadAddress().equals(a));assert.equal(s.loadBit(),false);assert.equal(s.loadCoins(),50000000n);assert.equal(s.loadBit(),true);assert.equal(s.loadRef().beginParse().loadCoins(),1n);s.endParse();
 for(const bad of[{amount:0},{minimumTon:0},{queryId:2n**64n},{amount:2n**120n}])assert.throws(()=>sellTemplate({...o,...bad}),/Invalid fresh sell terms/);
});
