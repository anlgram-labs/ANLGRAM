'use strict';
// Source-compiled binding/locker + actual captured LP-wallet bytecode. Controlled
// Pool-origin mint fixture, NOT end-to-end DEX provisioning or live liquidity.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{internal}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support'),{build}=require('../../minter-contract/scripts/migration-v2-plan');
const {beginCell,Address}=core,addr=n=>new Address(0,Buffer.alloc(32,n));let compiled;
async function fixture(percent=75,duration='days180'){
 const chain=await setup(),creator=await chain.treasury('plan-creator'),other=await chain.treasury('plan-other');
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const [code,vaultCode]=await(compiled??=Promise.all(['anlgram-migration-v2-plan','anlgram-lp-locker-v2'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 const options={code,vaultCode,creator:creator.address,router:Address.parse(snap.accounts.router.address),pairWallet0:addr(31),pairWallet1:addr(32),operationId:77,percent,duration},p=build(core,options);
 for(const x of[p,p.vault])await creator.send({to:x.address,init:x.init,value:100000000n,body:beginCell().endCell()});
 const mint=async()=>{const body=beginCell().storeUint(0x178d4519,32).storeUint(77,64).storeCoins(1001).storeAddress(p.address).storeAddress(creator.address).storeCoins(20000000n).storeBit(false).storeUint(0x414c5632,32).storeUint(77,64).endCell();const m=internal({from:p.vault.pool,to:p.vault.lpWallet,value:200000000n,body});m.init=p.vault.lpInit;return chain.sendMessage(m);};
 const observed=async()=>{const s=(await chain.runGetMethod(p.address,'get_v2_observation')).stackReader;return{lt:s.readBigNumber(),received:s.readBigNumber(),locked:s.readBigNumber(),free:s.readBigNumber(),pending:s.readBigNumber(),unlock:s.readBigNumber()};};
 const sync=(sender=creator)=>sender.send({to:p.address,value:50000000n,bounce:true,body:beginCell().storeUint(0x414e5632,32).storeUint(77,64).endCell()});
 return{chain,creator,other,p,options,mint,observed,sync};
}
test('acyclic canonical StateInit binds exact creator settings, derived LP owner and authentic custody observation',async()=>{
 const f=await fixture(),d=(await f.chain.runGetMethod(f.p.address,'get_v2_destinations')).stackReader;
 assert(d.readAddress().equals(f.p.vault.address));assert(d.readAddress().equals(f.p.vault.pool));assert(d.readAddress().equals(f.p.vault.lpWallet));assert.equal(d.readBigNumber(),75n);assert.equal(d.readBigNumber(),15552000n);
 await f.mint();const r=await f.observed();assert.equal(r.received,1001n);assert.equal(r.locked,751n);assert.equal(r.free,250n);assert.equal(r.pending,0n);
 const wallet=(await f.chain.runGetMethod(f.p.vault.lpWallet,'get_wallet_data')).stackReader;assert.equal(wallet.readBigNumber(),1001n);assert(wallet.readAddress().equals(f.p.vault.address));assert(wallet.readAddress().equals(f.p.vault.pool));
 assert.equal((await f.chain.runGetMethod(f.p.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 assert(!build(core,{...f.options,percent:50}).address.equals(f.p.address));assert(!build(core,{...f.options,duration:'permanent'}).vault.address.equals(f.p.vault.address));
});
test('lost LP observation recovers with funded query; replayed old observation cannot replace a later withdrawal state',async()=>{
 const f=await fixture(),{freeze,restore}=require('./refund-receipts-support'),state=await freeze(f,f.p.address);await f.mint();await restore(f,f.p.address,state);assert.equal((await f.observed()).received,0n);
 const r=await f.sync(),old=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.p.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x414c5635).inMessage;
 const first=await f.observed();assert.equal(first.received,1001n);
 await f.creator.send({to:f.p.vault.address,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(false).storeCoins(250).endCell()});
 await f.sync();const current=await f.observed();assert.equal(current.free,0n);assert.equal(current.pending,250n);assert(current.lt>first.lt);
 await f.chain.sendMessage(old);assert.deepEqual(await f.observed(),current);
});
test('permanent default terms survive receipt replay and unauthorized query; migration dispatch/finalization stay closed',async()=>{
 const f=await fixture(100,'permanent');const r=await f.mint();const a=await f.observed();assert.equal(a.locked,1001n);assert.equal(a.free,0n);assert.equal(a.unlock,0xffffffffffffffffn);
 for(const t of r.transactions)if(t.inMessage?.info.dest?.equals(f.p.address))await f.chain.sendMessage(t.inMessage);assert.deepEqual(await f.observed(),a);
 assert((await f.sync(f.other)).transactions.some(t=>t.description.computePhase?.exitCode===401));
 for(const op of[0x414e4c37,0x414e4c43])assert((await f.creator.send({to:f.p.address,value:50000000n,body:beginCell().storeUint(op,32).storeUint(77,64).endCell()})).transactions.some(t=>t.description.computePhase?.exitCode===414));
});
