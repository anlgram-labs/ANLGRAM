'use strict';
// Captured real STON.fi code executes in local Sandbox. Project starting
// allocations are explicit fixture state; no live pool or deployment is claimed.
const test=require('node:test'),assert=require('node:assert/strict');
const {beginCell,storeStateInit,contractAddress}=require('@ton/core'),{internal}=require('@ton/sandbox');
const {fixture}=require('./migration-recovery-support');
const op=m=>m.body.bits.length>=32?m.body.beginParse().loadUint(32):0;
async function ready(){const f=await fixture({pinned:true,canonical:true});
 await f.admin.send({to:f.locker,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5001,32).storeUint(1,64).endCell()});
 const init=beginCell().store(storeStateInit(f.migratorInit)).endCell();
 const registration=beginCell().storeUint(0x414c5002,32).storeUint(101,64).storeAddress(f.migrator).storeRef(init).endCell();
 return{...f,registration};
}
async function receipt(f){const r=(await f.chain.runGetMethod(f.locker,'get_lp_receipt',[{type:'int',value:101n}])).stackReader;return{status:r.readBigNumber(),owner:r.readAddressOpt(),pool:r.readAddressOpt(),wallet:r.readAddressOpt(),amount:r.readBigNumber()};}
test('actual LP mint delivers an operation-bound authenticated receipt with immutable locker ownership',async()=>{
 const f=await ready(),bound=await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:f.registration});assert(bound.transactions.some(t=>t.inMessage?.info.dest?.equals(f.locker)&&t.description.computePhase?.exitCode===0));
 assert.equal((await receipt(f)).status,1n);
 await f.chain.sendMessage(f.token);const minted=await f.chain.sendMessage(f.ton),r=await receipt(f);assert.equal(r.status,2n);assert(r.amount>0n);assert(r.owner.equals(f.migrator));assert(r.pool.equals(f.pool));
 const data=(await f.chain.runGetMethod(r.wallet,'get_wallet_data')).stackReader;assert.equal(data.readBigNumber(),r.amount);assert(data.readAddress().equals(f.locker));assert(data.readAddress().equals(f.pool));
 const notification=minted.transactions.find(t=>t.inMessage?.info.dest?.equals(f.locker)&&op(t.inMessage)===0x7362d09c).inMessage;
 await f.chain.sendMessage(notification);assert.equal((await receipt(f)).amount,r.amount);
 await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:f.registration});assert.equal((await receipt(f)).amount,r.amount,'repeated registration never resets a receipt');
 for(const code of[0x414e4c32,0x595f07bc]){const denied=await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:beginCell().storeUint(code,32).storeUint(101,64).endCell()});assert(denied.transactions.some(t=>t.description.aborted));}
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n,'observed delivery is not independently reviewed authorization');
 assert.equal((await f.chain.runGetMethod(f.migrator,'get_migration_settlement')).stackReader.readBigNumber(),7n,'authenticated observation reaches reconciliation, not LP_VERIFIED');
 const evidence=(await f.chain.runGetMethod(f.migrator,'get_migration_lp_receipt')).stackReader;assert(evidence.readAddress().equals(f.pool));assert(evidence.readAddress().equals(r.wallet));assert.equal(evidence.readBigNumber(),r.amount);assert.equal(evidence.readBigNumber(),0n);
 const finalize=await f.admin.send({to:f.migrator,value:20000000n,bounce:true,body:beginCell().storeUint(0x414e4c43,32).storeUint(101,64).endCell()});assert(finalize.transactions.some(t=>t.description.computePhase?.exitCode===414));
});
test('an admin cannot bind a substituted migration address or altered genesis owner/pair',async()=>{
 const f=await ready();
 const altered={...f.migratorInit,data:beginCell().storeUint(0,1).storeAddress(f.admin.address).storeAddress(f.locker).storeAddress(f.dex)
  .storeRef(f.migratorInit.data.refs[0]).storeRef(f.migratorInit.data.refs[1]).endCell()};
 for(const[owner,init]of[[f.admin.address,f.migratorInit],[contractAddress(0,altered),altered]]){
  const body=beginCell().storeUint(0x414c5002,32).storeUint(101,64).storeAddress(owner).storeRef(beginCell().store(storeStateInit(init)).endCell()).endCell();
  const r=await f.admin.send({to:f.locker,value:30000000n,bounce:true,body});assert(r.transactions.some(t=>t.description.computePhase?.exitCode===408));assert.equal((await receipt(f)).status,0n);
 }
});
test('wrong LP sender, wrong funding origin and wrong operation payload cannot create custody',async()=>{
 const f=await ready();await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:f.registration});const e=await receipt(f);
 for(const[from,origin,payloadQ,exit]of[[f.admin.address,f.migrator,101n,401],[e.wallet,f.admin.address,101n,408],[e.wallet,f.migrator,102n,408]]){
  const body=beginCell().storeUint(0x7362d09c,32).storeUint(101,64).storeCoins(100).storeAddress(origin).storeBit(true)
   .storeRef(beginCell().storeUint(0x414c5003,32).storeUint(payloadQ,64).endCell()).endCell();
  const r=await f.chain.sendMessage(internal({from,to:f.locker,value:20000000n,bounce:true,body}));assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));assert.equal((await receipt(f)).amount,0n);
 }
});
test('optional gas-return action failure cannot erase a received LP custody record',async()=>{
 const f=await ready();await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:f.registration});const registered=await receipt(f);
 await f.chain.sendMessage(f.token);let old;const txs=[];
 for await(const t of await f.chain.sendMessageIter(f.ton)){
  txs.push(t);
  if(!old&&t.inMessage?.info.dest?.equals(registered.wallet)){
   old=f.chain.config;const {Dictionary}=require('@ton/core'),d=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),old),s=d.get(25).beginParse();assert.equal(s.loadUint(8),0xea);s.loadUintBig(64);
   d.set(25,beginCell().storeUint(0xea,8).storeUint(50000000n,64).storeSlice(s).endCell());f.chain.setConfig(beginCell().storeDictDirect(d).endCell());
  }
 }
 assert(old);assert(txs.some(t=>t.inMessage?.info.dest?.equals(f.locker)&&(t.description.actionPhase?.skippedActions||0)>0));
 const r=await receipt(f);assert(r.amount>0n);assert.equal((await f.chain.runGetMethod(r.wallet,'get_wallet_data')).stackReader.readBigNumber(),r.amount);f.chain.setConfig(old);
 assert.equal((await f.chain.runGetMethod(f.migrator,'get_migration_settlement')).stackReader.readBigNumber(),3n,'lost guard receipt cannot mark the migrator reconciled');
 await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:beginCell().storeUint(0x414c5004,32).storeUint(101,64).endCell()});
 assert.equal((await f.chain.runGetMethod(f.migrator,'get_migration_settlement')).stackReader.readBigNumber(),7n,'funded query regenerates the persisted authenticated observation');
});
test('frozen locker loses an LP notification without inventing custody or migration authorization',async()=>{
 const f=await ready();await f.admin.send({to:f.locker,value:30000000n,bounce:true,body:f.registration});const registered=await receipt(f);await f.chain.sendMessage(f.token);
 const {freeze,restore}=require('./refund-receipts-support');let state;
 for await(const t of await f.chain.sendMessageIter(f.ton))if(!state&&t.inMessage?.info.dest?.equals(registered.wallet))state=await freeze(f,f.locker);
 assert(state);await restore(f,f.locker,state);
 assert((await f.chain.runGetMethod(registered.wallet,'get_wallet_data')).stackReader.readBigNumber()>0n);assert.equal((await receipt(f)).amount,0n,'a missing notification is not an authenticated balance proof');
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
