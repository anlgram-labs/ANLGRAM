'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {internal}=require('@ton/sandbox');const {beginCell}=require('@ton/core');
const {setup,settlement,tokens,freeze,restore,controlled,opcode,body}=require('./refund-receipts-support');
const total=200000000000000000n,half=total/2n;
async function conserved(s){assert.equal(await tokens(s,s.ownWallet)+await tokens(s,s.sourceWallet)+await tokens(s,s.address(s.curve.address)),1000000000000000000n);}
for(const forward of[0n,20000000n])test(`cumulative refunds with ${forward} notification gas reconcile once and preserve native principal`,async()=>{
 const s=await setup(),before=(await s.chain.getContract(s.migrator)).balance;
 await s.refund(half,forward);assert.equal((await settlement(s)).returnedTokens,0n,'neither an absent nor a present notification substitutes for custody proof');
 const first=await s.sync();assert.equal((await settlement(s)).returnedTokens,half);assert.equal((await settlement(s)).stage,4n);
 const old=first.transactions.find(t=>t.inMessage?.info.dest?.equals(s.migrator)&&opcode(t.inMessage)===0x414e530a).inMessage;
 await s.refund(half,forward);const last=await s.sync();const r=await settlement(s);assert.equal(r.returnedTokens,total);assert.equal(r.returnedTon,500000000000n);assert.equal(r.stage,5n);
 await s.chain.sendMessage(old);assert.deepEqual(await settlement(s),r,'stale cumulative proof cannot subtract or re-credit');
 const receipt=last.transactions.find(t=>t.inMessage?.info.dest?.equals(s.migrator)&&opcode(t.inMessage)===0x414e530a).inMessage;
 await s.chain.sendMessage(receipt);await s.sync();assert.deepEqual(await settlement(s),r);
 assert((await s.chain.getContract(s.migrator)).balance>=before,'queries cannot consume old native principal');assert.equal(await tokens(s,s.ownWallet),total);await conserved(s);
 assert.deepEqual(await settlement(s,101n),r,'per-operation original and confirmed totals persist');
});
test('replayed standard delivery cannot duplicate observed Jettons or cumulative credit',async()=>{
 const s=await setup(),r=await s.refund(half),msg=r.transactions.find(t=>t.inMessage?.info.dest?.equals(s.ownWallet)&&opcode(t.inMessage)===0x178d4519).inMessage;
 await s.chain.sendMessage(msg);assert.equal(await tokens(s,s.ownWallet),half);await s.sync();assert.equal((await settlement(s)).returnedTokens,half);await conserved(s);
});
test('frozen recipient restores counterparty tokens; missing delivery never creates a recovered refund',async()=>{
 const s=await setup(),old=await freeze(s,s.ownWallet),r=await s.refund(total);
 const bounce=r.transactions.find(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(s.sourceWallet)).inMessage;
 assert.equal(await tokens(s,s.sourceWallet),total);await s.chain.sendMessage(bounce);assert.equal(await tokens(s,s.sourceWallet),total,'duplicate authentic bounce never restores twice');
 await restore(s,s.ownWallet,old);await s.sync();assert.equal((await settlement(s)).returnedTokens,0n);
 await s.refund(total);await s.sync();assert.equal((await settlement(s)).returnedTokens,total);await conserved(s);
});
test('lost owner receipt remains pending and funded retry recovers from persistent wallet state',async()=>{
 const s=await setup();await s.refund(total);let frozen;
 await controlled(s,0x414e4c3e,async t=>{if(!frozen&&t.inMessage?.info.dest?.equals(s.ownWallet)&&opcode(t.inMessage)===0x414e5309)frozen=await freeze(s,s.migrator);});
 assert(frozen);await restore(s,s.migrator,frozen);assert.equal((await settlement(s)).returnedTokens,0n);
 await s.sync();assert.equal((await settlement(s)).returnedTokens,total);await s.sync();assert.equal((await settlement(s)).returnedTokens,total);await conserved(s);
});
test('lost epoch acknowledgement retries the same baseline without resetting or spending principal',async()=>{
 const s=await setup({prime:false,execute:false});let frozen;
 await controlled(s,0x414e4c3d,async t=>{if(!frozen&&t.inMessage?.info.dest?.equals(s.ownWallet)&&opcode(t.inMessage)===0x414e5308)frozen=await freeze(s,s.migrator);});
 await restore(s,s.migrator,frozen);assert.equal((await settlement(s)).stage,1n);
 const epoch=(await s.chain.runGetMethod(s.ownWallet,'get_credit_epoch',[{type:'int',value:101n}])).stackReader;epoch.readAddress();const id=epoch.readBigNumber();
 await s.prime();assert.equal((await settlement(s)).stage,2n);assert.equal((await settlement(s)).epoch,id);assert.equal((await settlement(s)).returnedTokens,0n);
});
test('underfunded transfer/query and forged origins cannot create refund credit',async()=>{
 const s=await setup(),before=await settlement(s);
 const failed=await s.refund(total,0n,20000000n);assert(failed.transactions.some(t=>t.description.computePhase?.exitCode===709));assert.equal(await tokens(s,s.sourceWallet),total);
 const insufficient=await s.admin.send({to:s.migrator,value:10000000n,bounce:true,body:body(0x414e4c3e).endCell()});assert(insufficient.transactions.some(t=>t.description.computePhase?.exitCode===405));
 const fake=await s.router.send({to:s.migrator,value:40000000n,bounce:true,body:body(0x414e530a).storeUint(before.epoch,64).storeAddress(s.router.address).storeCoins(total).storeCoins(total).endCell()});assert(fake.transactions.some(t=>t.description.computePhase?.exitCode===401));
 const owner=await s.router.send({to:s.ownWallet,value:20000000n,bounce:true,body:body(0x414e5308).storeAddress(s.router.address).endCell()});assert(owner.transactions.some(t=>t.description.computePhase?.exitCode===705));
 await s.sync();assert.equal((await settlement(s)).returnedTokens,0n);await conserved(s);
});
test('partial native and token receipts can arrive out of order with independent principal caps',async()=>{
 const s=await setup({nativeActor:true});
 await s.refund(half);await s.sync();assert.equal((await settlement(s)).returnedTon,0n);
 const first=await s.nativeRefund(250000000000n);assert.equal((await settlement(s)).returnedTon,250000000000n);
 const duplicate=first.transactions.find(t=>t.inMessage?.info.dest?.equals(s.migrator)&&opcode(t.inMessage)===0x01f3835d).inMessage;
 // Replaying a valid partial transfer cannot masquerade as a second partial:
 // the native receipt message identity must also be consumed once.
 const before=await settlement(s);await s.chain.sendMessage(duplicate);assert.deepEqual(await settlement(s),before);
 await s.nativeRefund(250000000000n);await s.refund(half);await s.sync();const final=await settlement(s);
 assert.equal(final.stage,5n);assert.equal(final.returnedTon,final.originalTon);assert.equal(final.returnedTokens,final.originalTokens);await conserved(s);
});
test('completed operation totals persist when a new epoch opens; old receipts cannot alter it',async()=>{
 const s=await setup();await s.refund(total);const r=await s.sync(),old=await settlement(s,101n);
 const receipt=r.transactions.find(t=>t.inMessage?.info.dest?.equals(s.migrator)&&opcode(t.inMessage)===0x414e530a).inMessage;
 await s.prime(102n);const current=await settlement(s);assert.equal(current.stage,2n);assert.equal(current.returnedTokens,0n);
 await s.chain.sendMessage(receipt);assert.deepEqual(await settlement(s),current);assert.deepEqual(await settlement(s,101n),old);
});
test('zero transfers do not grow the owner-opened refund ledger or clear a liability',async()=>{
 const s=await setup(),data=()=>(s.chain.getContract(s.ownWallet)).then(c=>c.accountState.state.data.hash());const before=await data();
 for(let i=0;i<5;i++)await s.refund(0n,0n,100000000n,i?BigInt(i):101n);
 assert((await data()).equals(before));await s.sync();assert.equal((await settlement(s)).returnedTokens,0n);
});
test('skipped receipt action under higher fees remains recoverable with explicitly increased caller funding',async()=>{
 const s=await setup();await s.refund(total);let original;
 const result=await controlled(s,0x414e4c3e,async t=>{
  if(!original&&t.inMessage?.info.dest?.equals(s.migrator)&&opcode(t.inMessage)===0x414e4c3e){
   original=s.chain.config;const {Dictionary}=require('@ton/core'),d=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),original),field=d.get(25).beginParse();assert.equal(field.loadUint(8),0xea);field.loadUintBig(64);
   d.set(25,beginCell().storeUint(0xea,8).storeUint(50000000n,64).storeSlice(field).endCell());s.chain.setConfig(beginCell().storeDictDirect(d).endCell());
  }
 });
 assert(result.transactions.some(t=>(t.description.actionPhase?.skippedActions||0)>0));assert.equal((await settlement(s)).returnedTokens,0n);
 const protectedBalance=(await s.chain.getContract(s.migrator)).balance;
 await s.admin.send({to:s.migrator,value:500000000n,bounce:true,body:body(0x414e4c3e).storeCoins(300000000n).endCell()});
 assert.equal((await settlement(s)).returnedTokens,total);assert((await s.chain.getContract(s.migrator)).balance>=protectedBalance);await conserved(s);
 s.chain.setConfig(original);
});
