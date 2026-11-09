'use strict';
// Source-compiled local TVM/Sandbox tests. Never broadcasts.
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { Blockchain, createShardAccount } = require('@ton/sandbox');
const { Address,beginCell,Cell,internal,external,contractAddress,storeStateInit } = require('@ton/core');
const { compileFunc } = require('@ton-community/func-js');
const root = path.resolve(__dirname,'../..'); const contracts = path.join(root,'minter-contract/contracts');
const { buildLaunchpadInitialStates } = require(path.join(root,'minter-contract/deploy-launchpad-testnet'));
async function compile(name) { const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(contracts,f),'utf8').replace(/\r\n/g,'\n')}); assert.equal(r.status,'ok',r.message);return Cell.fromBase64(r.codeBoc); }
const codes=Promise.all([compile('anlgram-bonding-curve'),compile('anlgram-settlement-wallet')]);
const addr=n=>new Address(0,Buffer.alloc(32,n)); const curveAddress=addr(2),master=addr(3); const supply=1000000000000000000n;
const OP={transfer:0x414e5301,internal:0x414e5302,ack:0x414e5303,receipt:0x414e5304,retry:0x414e5305,query:0x414e5306};
function opcode(msg) { try{return msg.body.beginParse().loadUint(32);}catch{return 0;} }
function operation(result,s) { const tx=result.transactions.find(t=>t.inMessage?.info.dest?.equals(s.curveWallet)&&opcode(t.inMessage)===OP.transfer);assert(tx,'custom transfer dispatched');const b=tx.inMessage.body.beginParse();b.loadUint(32);return b.loadUintBig(64); }
async function tokens(s,address) {return (await s.chain.runGetMethod(address,'get_wallet_data')).stackReader.readBigNumber();}
async function state(s,id) {return (await s.chain.runGetMethod(s.curveWallet,'get_settlement',[{type:'int',value:id}])).stackReader;}
async function setup(curveCode, walletCode, existing = false, senderTokens = supply) {
  const chain = await Blockchain.create(); chain.verbosity = { print: false, blockchainLogs: false, vmLogs: 'none', debugLogs: false };
  // Stable transaction time: wall-clock second changes otherwise introduce
  // incidental storage fees into assertions about transaction gas funding.
  chain.now = 1800000000;
  const buyer = await chain.treasury('buyer');
  const admin = await chain.treasury('admin');
  const walletData = owner => beginCell().storeCoins(owner.equals(curveAddress) ? senderTokens : 0n).storeAddress(owner).storeAddress(master).storeRef(walletCode).endCell();
  const buyerWallet = contractAddress(0, { code: walletCode, data: walletData(buyer.address) });
  // Wallet addresses use zero initial token balance even when preloaded funded.
  const zeroCurveData = beginCell().storeCoins(0n).storeAddress(curveAddress).storeAddress(master).storeRef(walletCode).endCell();
  const actualCurveWallet = contractAddress(0, { code: walletCode, data: zeroCurveData });
  const states = buildLaunchpadInitialStates({ adminAddress: admin.address, curveAddress, minterAddress: master, lpLockerAddress: addr(4), migrationRouterAddress: addr(5), dexRouterAddress: addr(6), ptonMinterAddress: addr(7), jettonWalletCode: walletCode }, require('@ton/core'));
  const data = beginCell().storeUint(3,8).storeUint(100,16)
    .storeRef(beginCell().storeAddress(admin.address).storeAddress(admin.address).storeAddress(admin.address)
      .storeRef(beginCell().storeAddress(master).storeAddress(actualCurveWallet).storeAddress(addr(6))
        .storeRef(beginCell().storeAddress(addr(4)).storeAddress(addr(5)).endCell()).endCell()).endCell())
    .storeRef(states.bondingCurveData.refs[1]).storeRef(states.bondingCurveData.refs[2]).endCell();
  await chain.setShardAccount(curveAddress, createShardAccount({ address: curveAddress, code: curveCode, data, balance: 50000000n }));
  await chain.setShardAccount(actualCurveWallet, createShardAccount({ address: actualCurveWallet, code: walletCode, data: walletData(curveAddress), balance: 10000000n }));
  if (existing) await chain.setShardAccount(buyerWallet, createShardAccount({ address: buyerWallet, code: walletCode, data: walletData(buyer.address), balance: 10000000n }));
  const buy = (value = 1000000000n, query = 1n) => buyer.send({ to: curveAddress, value, bounce: true,
    body: beginCell().storeUint(0x5fcc3d14,32).storeUint(query,64).storeCoins(1).endCell() });
  return { chain, buyer, admin, buyerWallet, curveWallet: actualCurveWallet, buy };
}

for (const existing of [false,true]) test(`authenticated delivery to ${existing?'existing':'new'} wallet reconciles reserves and sends receipt`,async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet,existing);const before=(await s.chain.getContract(curveAddress)).balance;
 const r=await s.buy(); const failures=r.transactions.filter(t=>t.description.computePhase?.type==='vm'&&![0,1].includes(t.description.computePhase.exitCode));
 console.log('AUTH_GAS',JSON.stringify({existing,attachment:'35000000',recipientValue:r.transactions.find(t=>opcode(t.inMessage)===OP.internal)?.inMessage.info.value.coins.toString(),receiptValue:r.transactions.find(t=>opcode(t.inMessage)===OP.receipt)?.inMessage.info.value.coins.toString()}));
 assert.deepEqual(failures.map(t=>t.description.computePhase.exitCode),[]);
 const id=operation(r,s);const status=await state(s,id);assert.equal(status.readBigNumber(),2n);status.readBigNumber();const amount=status.readBigNumber();
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);
 const reserves=(await s.chain.runGetMethod(curveAddress,'get_curve_state')).stack;
 assert.equal(reserves[4].value,950400000n);assert.equal(reserves[6].value,9600000n);assert.equal(reserves[7].value,0n);
 assert.equal((await s.chain.getContract(curveAddress)).balance,before+960000000n);
 assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(curveAddress)&&opcode(t.inMessage)===OP.receipt));
});

async function sellAll(s) {
 const amount=await tokens(s,s.buyerWallet);
 return s.buyer.send({to:s.buyerWallet,value:100000000n,bounce:true,
  body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(50,64).storeCoins(amount).storeAddress(curveAddress)
    .storeAddress(s.buyer.address).storeBit(false).storeCoins(50000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell()});
}
async function freeze(s,address) {
 const account=await s.chain.getContract(address);const state=account.accountState;
 assert.equal(state?.type,'active');
 const frozen=createShardAccount({address,code:state.state.code,data:state.state.data,balance:account.balance});
 frozen.account.storage.state={type:'frozen',stateHash:BigInt('0x'+beginCell().store(storeStateInit(state.state)).endCell().hash().toString('hex'))};
 await s.chain.setShardAccount(address,frozen);return state.state;
}
async function restore(s,address,state) {
 const account=await s.chain.getContract(address);
 await s.chain.setShardAccount(address,createShardAccount({address,code:state.code,data:state.data,balance:account.balance}));
}
const claim=s=>s.buyer.send({to:curveAddress,value:40000000n,bounce:true,body:beginCell().storeUint(0x414e4c34,32).storeUint(90,64).endCell()});
const retry=(s,id)=>s.buyer.send({to:curveAddress,value:20000000n,bounce:true,body:beginCell().storeUint(OP.retry,32).storeUint(id,64).endCell()});
async function escrow(s) {return (await s.chain.runGetMethod(curveAddress,'get_curve_state')).stack[7].value;}

test('40 persistent settlements survive 30 days of real simulated rent and funded receipt replay',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);
 const size=async()=>(await s.chain.getContract(s.curveWallet)).accountState.state.data.toBoc().length;
 const initialSize=await size(),ids=[];
 for(let i=0;i<40;i++)ids.push(operation(await s.buy(100000000n,BigInt(i+1)),s));
 const storedSize=await size();assert(storedSize>initialSize,'persistent dictionaries consume storage; not a constant-space claim');
 const amount=await tokens(s,s.buyerWallet);
 // createShardAccount fixtures start with zero storage-usage counters. Supply
 // a measured, deduplicated StateInit DAG so the TVM rent phase is exercised;
 // this is a local usage model, not a quote for a deployed account.
 for(const address of[curveAddress,s.curveWallet,s.buyerWallet]){
  const c=await s.chain.getContract(address),a=c.account,seen=new Set();let cells=0n,bits=0n;
  function visit(cell){const key=cell.hash().toString('hex');if(seen.has(key))return;seen.add(key);cells++;bits+=BigInt(cell.bits.length);cell.refs.forEach(visit);}
  visit(beginCell().store(storeStateInit(c.accountState.state)).endCell());
  c.account={...a,account:{...a.account,storageStats:{...a.account.storageStats,used:{cells,bits},lastPaid:s.chain.now}}};
 }
 s.chain.now+=30*24*60*60;
 let storageFees=0n;
 for(const id of[ids[0],ids[39]]){
  const r=await retry(s,id);assert.equal((await state(s,id)).readBigNumber(),2n);
  storageFees+=r.transactions.reduce((sum,t)=>sum+(t.description.storagePhase?.storageFeesCollected||0n),0n);
 }
 assert(storageFees>0n,'TVM actually charges storage rent after the elapsed interval');
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
 console.log('SETTLEMENT_RENT_SAMPLE',JSON.stringify({operations:40,days:30,modeledStorageFeesNano:storageFees.toString(),initialWalletDataBocBytes:initialSize,finalWalletDataBocBytes:storedSize}));
});

test('frozen recipient: authenticated failure restores sender custody, escrows once, and recovers exactly once',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);
 await s.buy();await sellAll(s);
 assert.equal(await tokens(s,s.buyerWallet),0n);assert.equal(await tokens(s,s.curveWallet),supply);
 // Freeze an actually reached zero-balance state with persistent receipts.
 // Its StateInit differs from the zero-record deployment state, so transfer cannot unfreeze it.
 const actual=await freeze(s,s.buyerWallet);
 const before=(await s.chain.getContract(curveAddress)).balance;
 const r=await s.buy();const id=operation(r,s);const result=await state(s,id);
 assert.equal(result.readBigNumber(),3n);result.readBigNumber();const amount=result.readBigNumber();
 assert.equal(await tokens(s,s.curveWallet),supply);assert.equal(await escrow(s),amount);
 assert.equal((await s.chain.getContract(s.buyerWallet)).accountState.type,'frozen');
 assert.equal((await s.chain.getContract(curveAddress)).balance,before+960000000n);
 const bounced=r.transactions.find(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(s.curveWallet));assert(bounced);
 await s.chain.sendMessage(bounced.inMessage); // explicitly injected replay of consumed genuine bounce
 assert.equal(await tokens(s,s.curveWallet),supply);assert.equal(await escrow(s),amount);
 const receipt=r.transactions.find(t=>t.inMessage?.info.dest?.equals(curveAddress)&&opcode(t.inMessage)===OP.receipt);assert(receipt);
 await s.chain.sendMessage(receipt.inMessage);assert.equal(await escrow(s),amount);
 await claim(s); // still frozen: a second distinct operation fails and re-escrows, without double credit
 assert.equal(await escrow(s),amount);assert.equal(await tokens(s,s.curveWallet),supply);
 await restore(s,s.buyerWallet,actual);await claim(s);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
 await retry(s,id);assert.equal(await escrow(s),0n);assert.equal(await tokens(s,s.buyerWallet),amount);
 const again=await claim(s);assert(again.transactions.some(t=>t.description.computePhase?.exitCode===409));
});

test('duplicate successful delivery and receipts cannot duplicate tokens or create a refund',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);const r=await s.buy();const id=operation(r,s);
 const amount=await tokens(s,s.buyerWallet);
 const delivery=r.transactions.find(t=>t.inMessage?.info.dest?.equals(s.buyerWallet)&&opcode(t.inMessage)===OP.internal);
 await s.chain.sendMessage(delivery.inMessage); // deliberate replay fixture, not a second owner transfer
 await retry(s,id);await retry(s,id);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
});

test('forged acknowledgements and owner receipts fail sender authentication',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);const r=await s.buy();const id=operation(r,s);
 const result=await state(s,id);result.readBigNumber();const wire=result.readBigNumber(),amount=result.readBigNumber();
 const fakeAck=await s.buyer.send({to:s.curveWallet,value:20000000n,bounce:true,
  body:beginCell().storeUint(OP.ack,32).storeUint(wire,64).storeCoins(amount).endCell()});
 assert(fakeAck.transactions.some(t=>t.description.computePhase?.exitCode===707));
 const fakeReceipt=await s.buyer.send({to:curveAddress,value:20000000n,bounce:true,
  body:beginCell().storeUint(OP.receipt,32).storeUint(id,64).storeUint(wire,64).storeCoins(amount).storeUint(3,2).endCell()});
 assert(fakeReceipt.transactions.some(t=>t.description.computePhase?.exitCode===401));
 assert.equal(await escrow(s),0n);assert.equal(await tokens(s,s.buyerWallet),amount);
});

async function controlledBuy(s,after) {
 const body=beginCell().storeUint(0x5fcc3d14,32).storeUint(201,64).storeCoins(1).endCell();
 const message=external({to:s.buyer.address,body:s.buyer.createTransfer({messages:[internal({to:curveAddress,value:1000000000n,bounce:true,body})],sendMode:1})});
 const transactions=[];
 for await(const tx of await s.chain.sendMessageIter(message)) {transactions.push(tx);await after(tx);}
 return {transactions};
}
test('lost recipient acknowledgement remains pending and funded query recovers without another token send',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);let saved;
 const r=await controlledBuy(s,async tx=>{
  if(!saved&&tx.inMessage?.info.dest?.equals(s.buyerWallet)&&opcode(tx.inMessage)===OP.internal) saved=await freeze(s,s.curveWallet);
 });
 assert(saved);const id=operation(r,s),amount=await tokens(s,s.buyerWallet);assert(amount>0n);
 assert.equal(await escrow(s),0n);const premature=await claim(s);assert(premature.transactions.some(t=>t.description.computePhase?.exitCode===409));
 await restore(s,s.curveWallet,saved);
 assert.equal((await state(s,id)).readBigNumber(),1n);
 const recovery=await retry(s,id);assert.equal((await state(s,id)).readBigNumber(),2n);
 assert(!recovery.transactions.some(t=>opcode(t.inMessage)===OP.internal),'query never retransfers Jettons');
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);
 const request=r.transactions.find(t=>t.inMessage?.info.dest?.equals(s.curveWallet)&&opcode(t.inMessage)===OP.transfer);
 const duplicate=await s.chain.sendMessage(request.inMessage);
 assert(!duplicate.transactions.some(t=>opcode(t.inMessage)===OP.internal));
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await escrow(s),0n);
});

test('lost owner receipt can be retried from persistent wallet outcome without double delivery',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);let saved;
 const r=await controlledBuy(s,async tx=>{
  if(!saved&&tx.inMessage?.info.dest?.equals(s.curveWallet)&&opcode(tx.inMessage)===OP.ack) saved=await freeze(s,curveAddress);
 });
 assert(saved);const id=operation(r,s);assert.equal((await state(s,id)).readBigNumber(),2n);
 const amount=await tokens(s,s.buyerWallet);await restore(s,curveAddress,saved);
 await retry(s,id);await retry(s,id);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await escrow(s),0n);
 assert.equal(await tokens(s,s.curveWallet),supply-amount);
});

test('first-hop rejection is not a failure proof: unseen ledger retry uses the same owner id once',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet,false,0n); // explicit custody-shortage fault fixture
 const r=await s.buy();const id=operation(r,s);
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===706));
 assert.equal((await state(s,id)).readBigNumber(),0n);assert.equal(await escrow(s),0n);
 const old=await s.chain.getContract(s.curveWallet);
 await s.chain.setShardAccount(s.curveWallet,createShardAccount({address:s.curveWallet,code:wallet,balance:old.balance,
  data:beginCell().storeCoins(supply).storeAddress(curveAddress).storeAddress(master).storeRef(wallet).endCell()}));
 const recovered=await s.buyer.send({to:curveAddress,value:60000000n,bounce:true,body:beginCell().storeUint(OP.retry,32).storeUint(id,64).endCell()});
 assert.equal((await state(s,id)).readBigNumber(),2n);
 const amount=await tokens(s,s.buyerWallet);assert(amount>0n);
 assert.equal(operation(recovered,s),id,'resubmission retains original owner id');
 await s.chain.sendMessage(r.transactions.find(t=>t.inMessage?.info.dest?.equals(s.curveWallet)&&opcode(t.inMessage)===OP.transfer).inMessage);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
});

test('insufficient trade gas and unknown or underfunded retries never create a claim',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);
 const r=await s.buy(45000000n);assert(r.transactions.some(t=>t.description.computePhase?.exitCode===405));
 const unknown=await retry(s,999n);assert(unknown.transactions.some(t=>t.description.computePhase?.exitCode===407));
 const low=await s.buyer.send({to:curveAddress,value:1000000n,bounce:true,body:beginCell().storeUint(OP.retry,32).storeUint(1,64).endCell()});
 assert(low.transactions.some(t=>t.description.computePhase?.exitCode===405));assert.equal(await escrow(s),0n);assert.equal(await tokens(s,s.curveWallet),supply);
});

test('graduation allocations reconcile but opt-in migration cannot bypass missing LP code/custody proof',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);await s.buy(1000000000000n);
 const before=(await s.chain.runGetMethod(curveAddress,'get_curve_state')).stack;
 assert.equal(before[0].value,4n);assert.equal(before[4].value,500000000000n);assert.equal(before[5].value,0n);
 assert.equal(await tokens(s,s.buyerWallet),800000000000000000n);assert.equal(await tokens(s,s.curveWallet),200000000000000000n);
 const r=await s.admin.send({to:curveAddress,value:300000000n,bounce:true,body:beginCell().storeUint(0x414e4c35,32).storeUint(9,64).endCell()});
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===414));
 const after=(await s.chain.runGetMethod(curveAddress,'get_curve_state')).stack;
 for(const i of[0,4,5,6,7])assert.equal(after[i].value,before[i].value);
});

test('lost failure receipt does not create a claim until authenticated retry and never restores twice',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);await s.buy();await sellAll(s);
 const recipient=await freeze(s,s.buyerWallet);let owner;
 const r=await controlledBuy(s,async tx=>{
  if(!owner&&tx.inMessage?.info.type==='internal'&&tx.inMessage.info.bounced&&tx.inMessage.info.dest.equals(s.curveWallet))owner=await freeze(s,curveAddress);
 });
 assert(owner);const id=operation(r,s),record=await state(s,id);assert.equal(record.readBigNumber(),3n);record.readBigNumber();const amount=record.readBigNumber();
 assert.equal(await tokens(s,s.curveWallet),supply);
 await restore(s,curveAddress,owner);assert.equal(await escrow(s),0n);
 await retry(s,id);await retry(s,id);assert.equal(await escrow(s),amount);assert.equal(await tokens(s,s.curveWallet),supply);
 await restore(s,s.buyerWallet,recipient);await claim(s);assert.equal(await escrow(s),0n);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);
});

test('sender wallet rejects insufficient gas and malformed referenced payload before debiting tokens',async()=>{
 const [,wallet]=await codes;const chain=await Blockchain.create();chain.now=1800000000;
 const owner=await chain.treasury('direct-owner'),recipient=await chain.treasury('direct-recipient');
 const data=beginCell().storeCoins(1000).storeAddress(owner.address).storeAddress(master).storeRef(wallet).endCell();
 const address=contractAddress(0,{code:wallet,data:beginCell().storeCoins(0).storeAddress(owner.address).storeAddress(master).storeRef(wallet).endCell()});
 await chain.setShardAccount(address,createShardAccount({address,code:wallet,data,balance:10000000n}));
 for(const[value,reference,exit]of[[20000000n,false,709],[35000000n,true,708]]){
  const r=await owner.send({to:address,value,bounce:true,body:beginCell().storeUint(OP.transfer,32).storeUint(500,64).storeCoins(10)
   .storeAddress(recipient.address).storeAddress(owner.address).storeBit(false).storeCoins(1).storeBit(reference).endCell()});
  assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));
  assert.equal((await chain.runGetMethod(address,'get_wallet_data')).stackReader.readBigNumber(),1000n);
  assert.equal((await chain.runGetMethod(address,'get_settlement',[{type:'int',value:500n}])).stackReader.readBigNumber(),0n);
 }
});

function expensiveForwarding(chain){
 // Explicit local gas-schedule fault between messages, not a claim about live fees.
 const old=chain.config,dict=require('@ton/core').Dictionary.loadDirect(require('@ton/core').Dictionary.Keys.Int(32),require('@ton/core').Dictionary.Values.Cell(),old);
 const field=dict.get(25).beginParse();assert.equal(field.loadUint(8),0xea);field.loadUintBig(64);
 dict.set(25,beginCell().storeUint(0xea,8).storeUint(50000000n,64).storeSlice(field).endCell());
 chain.setConfig(beginCell().storeDictDirect(dict).endCell());return old;
}
for(const stage of['recipient acknowledgement','owner receipt'])test(`${stage} action funding failure preserves authoritative token outcome and supports funded retry`,async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);let original;
 const r=await controlledBuy(s,async tx=>{
  const wanted=stage==='recipient acknowledgement'?OP.transfer:OP.internal;
  if(!original&&opcode(tx.inMessage)===wanted)original=expensiveForwarding(s.chain);
 });
 assert(original);const id=operation(r,s);
 const expected=stage==='owner receipt'?2n:1n;
 assert.equal((await state(s,id)).readBigNumber(),expected,'outgoing receipt action failure must not roll back ownership/outcome');
 const amount=await tokens(s,s.buyerWallet);assert(amount>0n);
 assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
 assert(r.transactions.some(t=>(t.description.actionPhase?.skippedActions||0)>0),'receipt action was genuinely skipped for insufficient funding');
 s.chain.setConfig(original);await retry(s,id);
 assert.equal((await state(s,id)).readBigNumber(),2n);assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await escrow(s),0n);
});

test('failure receipt action funding failure preserves restored sender tokens and the final failure record',async()=>{
 const [curve,wallet]=await codes;const s=await setup(curve,wallet);await s.buy();await sellAll(s);
 const recipient=await freeze(s,s.buyerWallet);let original;
 const r=await controlledBuy(s,async tx=>{
  if(!original&&tx.inMessage?.info.dest?.equals(s.buyerWallet)&&opcode(tx.inMessage)===OP.internal)original=expensiveForwarding(s.chain);
 });
 const id=operation(r,s),outcome=await state(s,id);assert.equal(outcome.readBigNumber(),3n);outcome.readBigNumber();const amount=outcome.readBigNumber();
 assert.equal(await tokens(s,s.curveWallet),supply);assert.equal(await escrow(s),0n);
 assert(r.transactions.some(t=>(t.description.actionPhase?.skippedActions||0)>0));
 s.chain.setConfig(original);await retry(s,id);await retry(s,id);assert.equal(await escrow(s),amount);
 await restore(s,s.buyerWallet,recipient);await claim(s);
 assert.equal(await tokens(s,s.buyerWallet),amount);assert.equal(await tokens(s,s.curveWallet),supply-amount);assert.equal(await escrow(s),0n);
});
