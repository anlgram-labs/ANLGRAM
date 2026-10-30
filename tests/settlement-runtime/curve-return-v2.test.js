'use strict';
// Source compiled Curve/wallet/migrator. Dispatch obligations are explicit
// fixtures because live settlement migration dispatch correctly remains gated.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{Blockchain,createShardAccount}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const {beginCell,Address,contractAddress}=core,addr=n=>new Address(0,Buffer.alloc(32,n));let compiled;
async function fixture({tokens=1000n,expected=1000n}={}){
 const chain=await Blockchain.create();chain.now=1800000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
 const admin=await chain.treasury('return-admin'),other=await chain.treasury('return-other');
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const [curveCode,walletCode,migCode]=await(compiled??=Promise.all(['anlgram-bonding-curve','anlgram-settlement-wallet','anlgram-migration-router'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 const curve=addr(2),master=addr(3),migrator=addr(5),dex=addr(6),pton=addr(7),locker=addr(4),id=77n;
 const walletData=(owner,amount=0n)=>beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).storeRef(walletCode).endCell();
 const wallet=owner=>contractAddress(0,{code:walletCode,data:walletData(owner)}),curveWallet=wallet(curve),migWallet=wallet(migrator);
 for(const[owner,amount]of[[curve,6000n],[migrator,tokens]])await chain.setShardAccount(wallet(owner),createShardAccount({address:wallet(owner),code:walletCode,balance:10000000n,data:walletData(owner,amount)}));
 const key=BigInt('0x'+beginCell().storeUint(0x52455432,32).storeUint(id,64).endCell().hash().toString('hex'));
 const values={serialize:(v,b)=>b.storeSlice(v.beginParse()),parse:s=>s.asCell()},records=core.Dictionary.empty(core.Dictionary.Keys.BigUint(256),values);
 records.set(key,beginCell().storeCoins(1000000000n).storeCoins(expected).storeCoins(0).storeCoins(0).storeUint(0,64).storeDict(null).endCell());
 const data=beginCell().storeUint(5,8).storeUint(100,16)
  .storeRef(beginCell().storeAddress(admin.address).storeAddress(admin.address).storeAddress(admin.address).storeRef(beginCell().storeAddress(master).storeAddress(curveWallet).storeAddress(dex).storeRef(beginCell().storeAddress(locker).storeAddress(migrator).endCell()).endCell()).endCell())
  .storeRef(beginCell().storeCoins(0).storeCoins(6000).storeCoins(0).storeCoins(0).storeCoins(30000000000n).storeCoins(1000000000000000000n).storeCoins(500000000000n).storeCoins(0).endCell())
  .storeRef(beginCell().storeDict(records).storeRef(walletCode).endCell()).endCell();
 await chain.setShardAccount(curve,createShardAccount({address:curve,code:curveCode,data,balance:50000000n}));
 const migData=beginCell().storeBit(false).storeAddress(curve).storeAddress(locker).storeAddress(dex)
  .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(1000000000n).storeCoins(tokens).storeAddress(admin.address).endCell())
  .storeRef(beginCell().storeAddress(null).storeAddress(null).storeCoins(0).storeCoins(0).storeRef(walletCode).endCell()).endCell();
 await chain.setShardAccount(migrator,createShardAccount({address:migrator,code:migCode,data:migData,balance:1050000000n}));
 const sync=(sender=admin,q=id,value=40000000n)=>sender.send({to:curve,value,bounce:true,body:beginCell().storeUint(0x414e4831,32).storeUint(q,64).endCell()});
 const abort=()=>admin.send({to:migrator,value:150000000n,bounce:true,body:beginCell().storeUint(0x414e4c38,32).storeUint(id,64).endCell()});
 const record=async()=>{const s=(await chain.runGetMethod(curve,'get_curve_return_v2',[{type:'int',value:id}])).stackReader;return{found:s.readBigNumber(),ot:s.readBigNumber(),oj:s.readBigNumber(),rt:s.readBigNumber(),rj:s.readBigNumber(),epoch:s.readBigNumber()};};
 return{chain,admin,other,curve,migrator,curveWallet,migWallet,id,sync,abort,record};
}
const op=m=>m.body.bits.length>=32?m.body.beginParse().loadUint(32):0;
async function handoff(f){const s=(await f.chain.runGetMethod(f.migrator,'get_curve_handoff_v2')).stackReader;return[s.readBigNumber(),s.readBigNumber(),s.readBigNumber()];}
test('Curve authentic wallet proof confirms delivered principal and actual migrator consumes cumulative acknowledgment once',async()=>{
 const f=await fixture();await f.sync();assert((await f.record()).epoch>0n);await f.abort();assert.equal((await f.record()).rj,0n,'owner notification is only a hint');
 const r=await f.sync();assert.equal((await f.record()).rj,1000n);assert.equal((await f.record()).rt,1000000000n);assert.deepEqual(await handoff(f),[1000000000n,1000n,-1n]);
 assert.equal((await f.chain.runGetMethod(f.curveWallet,'get_wallet_data')).stackReader.readBigNumber(),7000n);assert.equal((await f.chain.runGetMethod(f.migWallet,'get_wallet_data')).stackReader.readBigNumber(),0n);
 const evidence=r.transactions.filter(t=>t.inMessage&&(op(t.inMessage)===0x414e530a||op(t.inMessage)===0x414e4833)).map(t=>t.inMessage);
 for(const m of evidence)await f.chain.sendMessage(m);await f.sync();assert.equal((await f.record()).rj,1000n);assert.deepEqual(await handoff(f),[1000000000n,1000n,-1n]);
 assert.equal((await f.chain.runGetMethod(f.migrator,'get_migration_settlement')).stackReader.readBigNumber(),8n,'Curve booked principal; not DEX finalized');
});
test('lost owner notification and lost final acknowledgment recover through funded queries without duplicate principal',async()=>{
 const f=await fixture();await f.sync();const {freeze,restore}=require('./refund-receipts-support');let frozen;
 const root=core.external({to:f.admin.address,body:f.admin.createTransfer({messages:[core.internal({to:f.migrator,value:150000000n,bounce:true,body:beginCell().storeUint(0x414e4c38,32).storeUint(77,64).endCell()})],sendMode:1})});
 for await(const t of await f.chain.sendMessageIter(root))if(!frozen&&t.inMessage?.info.dest?.equals(f.curveWallet)&&op(t.inMessage)===0x178d4519)frozen=await freeze(f,f.curve);
 assert(frozen);await restore(f,f.curve,frozen);assert.equal((await f.record()).rj,0n);
 const state=await freeze(f,f.migrator);await f.sync();assert.equal((await f.record()).rj,1000n);await restore(f,f.migrator,state);
 assert.equal((await handoff(f))[1],0n);await f.sync();assert.deepEqual(await handoff(f),[1000000000n,1000n,-1n]);
});
test('frozen receiving wallet creates no delivered-principal credit; sender retains restored tokens',async()=>{
 const f=await fixture();await f.sync();const {freeze,restore}=require('./refund-receipts-support');const state=await freeze(f,f.curveWallet);await f.abort();await restore(f,f.curveWallet,state);await f.sync();
 assert.equal((await f.record()).rj,0n);assert.equal((await handoff(f))[1],0n);assert.equal((await f.chain.runGetMethod(f.migWallet,'get_wallet_data')).stackReader.readBigNumber(),1000n);
});
test('partial delivered Jettons remain partial and cannot complete an original principal obligation',async()=>{
 const f=await fixture({tokens:500n});await f.sync();await f.abort();await f.sync();assert.equal((await f.record()).rj,500n);assert.equal((await f.record()).oj,1000n);assert.notEqual((await handoff(f))[2],-1n);
});
test('unregistered IDs, unauthorized wallet evidence and unfunded sync cannot authorize recovery',async()=>{
 const f=await fixture();for(const r of[await f.sync(f.other),await f.sync(f.admin,78n),await f.sync(f.admin,77n,10000000n)])assert(r.transactions.some(t=>t.description.aborted));
 const fake=await f.other.send({to:f.curve,value:30000000n,bounce:true,body:beginCell().storeUint(0x414e530a,32).storeUint(77,64).storeUint(123,64).storeAddress(f.migrator).storeCoins(1000).storeCoins(7000).endCell()});assert(fake.transactions.some(t=>t.description.computePhase?.exitCode===401));assert.equal((await f.record()).rj,0n);
});
