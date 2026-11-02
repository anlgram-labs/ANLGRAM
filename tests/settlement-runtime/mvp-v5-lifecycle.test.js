'use strict';
// Source-compiled local execution with the exact approved public V5 operator and
// deployed-minter genesis. Invalid zero signatures are allowed ONLY by Sandbox.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {compileFunc}=require('@ton-community/func-js');
const {setup,core,p}=require('./curve-two-support');
const {external}=require('../../scripts/preflight-v5-minter');
const {build,buy,sell,receiptQuery}=require('../../lib/testnet-mvp-plan');
const op=m=>m?.body?.bits.length>=32?m.body.beginParse().loadUint(32):null;
test('exact pinned V5 future messages initialize/mint/custody/renounce/activate/buy/recover/reject/sell with conserved reserves',async()=>{
 const c=await setup(),plan=build(),contractDir=path.resolve(__dirname,'../../minter-contract/contracts');
 for(const [role,name]of [['guard','anlgram-lp-auth-guard'],['migration','anlgram-migration-router']]){
  const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(contractDir,f),'utf8')});assert.equal(r.status,'ok',r.message);assert.equal(core.Cell.fromBase64(r.codeBoc).hash().toString('hex'),p.dependentAccounts[role].codeHash);
 }
 const curveWallet=core.Address.parse(plan.curveWallet),buyerWallet=core.Address.parse(plan.buyerWallet);
 const curveState=async()=>(await c.chain.runGetMethod(c.curve,'get_curve_state')).stack.map(x=>x.value);
 let seqno=1,deliveryId,delivered,exactPayout,totalFees=0n,buySnapshot,queries=0;
 async function send(message){const e=await external(c.w,message,seqno,c.chain.now+90,c.w.address,null),r=await c.chain.sendMessage(core.Cell.fromBase64(e.boc),{ignoreChksig:true});const source=r.transactions.find(t=>t.inMessage?.info.type==='external-in');assert(source&&!source.description.aborted);assert.equal(source.outMessages.size,1);assert.equal((await c.chain.runGetMethod(c.source,'seqno')).stackReader.readBigNumber(),BigInt(++seqno));totalFees+=r.transactions.reduce((n,t)=>n+t.totalFees.coins,0n);return r;}
 for(const step of plan.steps){
  let message=step.message;
  if(step.name==='small-test-buy'){
   const quote=(await c.chain.runGetMethod(c.curve,'get_buy_quote',[{type:'int',value:960000000n}])).stackReader.readBigNumber();
   const template=buy(plan,{network:'-3',operator:plan.operator,master:plan.minter,curve:plan.curve,curveState:3,admin:null,decimals:9,observedAt:Date.now(),quoteGrossNano:'960000000',quoteTokens:quote.toString()},{attachmentNano:'1000000000',quoteTokens:quote.toString()});message=template.message;buySnapshot=await curveState();
  }
  const beforeReject=step.name==='expected-slippage-rejection'?await curveState():null,r=await send(message);
  if(step.name==='initialize-curve')assert.equal((await curveState())[0],1n);
  if(step.name==='mandatory-creation-donation')assert(r.transactions.some(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.dest.equals(core.Address.parse(p.donation.recipient))&&t.inMessage.info.value.coins===20000000n&&!t.inMessage.info.bounced));
  if(step.name==='mandatory-creation-donation')assert.equal((await c.chain.getContract(core.Address.parse(p.donation.recipient))).balance,20000000n,'Native non-bounce credit to an uninitialized recipient is a balance credit, not successful VM execution');
  if(step.name==='mint-test-supply'){
   assert.equal((await c.chain.runGetMethod(curveWallet,'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);assert.equal((await curveState())[0],2n);assert(r.transactions.some(t=>t.description.computePhase?.exitCode===73));
  }
  if(step.name==='operator-renounce'){assert.equal((await curveState())[0],3n);const d=(await c.chain.runGetMethod(c.minter,'get_jetton_data')).stackReader;assert.equal(d.readBigNumber(),1000000000000000000n);d.readBigNumber();assert.equal(d.readAddressOpt(),null);}
  if(step.name==='small-test-buy'){
   const dispatched=r.transactions.find(t=>t.inMessage?.info.dest?.equals(curveWallet)&&op(t.inMessage)===0x414e5301);assert(dispatched);const s=dispatched.inMessage.body.beginParse();s.loadUint(32);deliveryId=s.loadUintBig(64);const result=(await c.chain.runGetMethod(curveWallet,'get_settlement',[{type:'int',value:deliveryId}])).stackReader;assert.equal(result.readBigNumber(),2n);result.readBigNumber();delivered=result.readBigNumber();assert.equal((await c.chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber(),delivered);assert(delivered>0n);
   const after=await curveState();assert.equal(after[4]-buySnapshot[4],950400000n);assert.equal(after[6]-buySnapshot[6],9600000n);assert.equal(buySnapshot[5]-after[5],delivered);
   // Two funded repetitions of the same *receipt query* route only evidence,
   // never the original principal. They deliberately change the wallet seqno.
   for(let i=0;i<2;i++){const q=await send(receiptQuery(plan,deliveryId).message);queries++;assert(q.transactions.some(t=>op(t.inMessage)===0x414e5304&&t.inMessage.info.src.equals(curveWallet)));assert(!q.transactions.some(t=>[0x414e5301,0x414e5302].includes(op(t.inMessage))));assert.deepEqual((await curveState()).slice(4,8),after.slice(4,8));}
  }
  if(beforeReject){assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(c.curve)&&t.description.computePhase?.exitCode===404));assert(r.transactions.some(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.bounced&&t.inMessage.info.dest.equals(c.source)&&t.inMessage.info.value.coins>0n));assert.deepEqual((await curveState()).slice(4,8),beforeReject.slice(4,8));}
 }
 exactPayout=(await c.chain.runGetMethod(c.curve,'get_sell_quote',[{type:'int',value:delivered}])).stackReader.readBigNumber();assert(exactPayout>0n);
 const message=sell(plan,{network:'-3',operator:plan.operator,master:plan.minter,curve:plan.curve,curveState:3,admin:null,decimals:9,observedAt:Date.now(),wallet:plan.buyerWallet,walletOwner:plan.operator,walletMaster:plan.minter,deliveredBalance:delivered.toString(),quotedAmount:delivered.toString(),netTonQuote:exactPayout.toString(),settlementStatus:2},{amount:delivered,minimumTon:exactPayout*9950n/10000n}).message;
 const r=await send(message);assert(r.transactions.some(t=>t.inMessage?.info.type==='internal'&&t.inMessage.info.src.equals(c.curve)&&t.inMessage.info.dest.equals(c.source)&&t.inMessage.info.value.coins===exactPayout));assert.equal((await c.chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber(),0n);assert.equal((await c.chain.runGetMethod(curveWallet,'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
 const final=await curveState();assert.equal(final[5],800000000000000000n);assert.equal(final[7],0n);assert.equal((await c.chain.runGetMethod(core.Address.parse(p.dependentAccounts.guard.raw),'is_migration_authorized')).stackReader.readBigNumber(),0n);
 console.log('EXACT_V5_LOCAL_MVP',JSON.stringify({evidence:'SOURCE_COMPILED_SANDBOX_ONLY',startingSeqno:1,finalSeqno:seqno,receiptQueries:queries,deliveredUnits:delivered.toString(),nativePayout:exactPayout.toString(),networkFees:totalFees.toString(),liveTransactions:0,contractsDeployedOnNetwork:0}));
});
