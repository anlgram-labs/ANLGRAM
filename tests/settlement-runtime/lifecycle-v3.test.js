'use strict';
// Fresh PRE-dispatch Curve state; no obligations, epochs, in-flight records or
// post-dispatch state are seeded. Minting/funding/dispatch/returns are transactions.
// Only the independent LP authorization dependency is replaced at its canonical
// address for positive tests; production guard code and Curve checks stay intact.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{createShardAccount}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support'),{profileCell,derive}=require('../../minter-contract/scripts/stonfi-v22-addresses');
const {beginCell,Address,contractAddress,storeStateInit}=core,addr=n=>new Address(0,Buffer.alloc(32,n));let compiled;
const source=`#include "imports/stdlib.fc";
() recv_internal(int b,int v,cell m,slice s) impure { if(s.slice_bits() < 96) { return (); } slice h = m.begin_parse();h~load_uint(4);slice a = h~load_msg_addr();int op = s~load_uint(32);int q = s~load_uint(64);if(op == 0x414e5701) { raw_reserve(b - v,0);send_raw_message(begin_cell().store_uint(0x10,6).store_slice(a).store_coins(0).store_uint(0,107).store_uint(0x414e5702,32).store_uint(q,64).store_uint(1,1).end_cell(),128); } }`;
async function fixture({allow=true}={}){
 const chain=await setup(),admin=await chain.treasury('life-admin'),other=await chain.treasury('life-other'),dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const codes=await(compiled??=Promise.all(['anlgram-bonding-curve','anlgram-migration-router','anlgram-settlement-wallet','anlgram-lp-auth-guard','anlgram-launchpad-jetton-minter','fixture'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>f==='fixture.fc'?source:fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 const [curveCode,migCode,walletCode,guardCode,minterCode,gate]=codes,curve=addr(2),migrator=addr(5),master=addr(3),dex=Address.parse(snap.accounts.router.address),pton=Address.parse(snap.accounts.pton.address),q=123n;
 const walletData=(owner,amount=0n)=>beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).storeRef(walletCode).endCell(),wallet=owner=>contractAddress(0,{code:walletCode,data:walletData(owner)});
 const empty=beginCell().storeAddress(null).storeAddress(null).endCell();
 const guardInit={code:guardCode,data:beginCell().storeUint(0,8).storeUint(0,64).storeRef(beginCell().storeAddress(dex).storeAddress(master).storeAddress(pton)
  .storeRef(beginCell().storeAddress(admin.address).storeAddress(curve).endCell()).storeRef(profileCell(core)).endCell()).storeRef(empty).storeRef(empty).endCell()},locker=contractAddress(0,guardInit);
 await chain.setShardAccount(locker,createShardAccount({address:locker,code:allow?gate:guardCode,data:guardInit.data,balance:10000000n}));
 const arg=a=>({type:'slice',cell:beginCell().storeAddress(a).endCell()}),pw=(await chain.runGetMethod(pton,'get_wallet_address',[arg(dex)])).stackReader.readAddress(),lp=derive(core,dex,wallet(dex),pw,locker).lpWallet;
 const data=beginCell().storeUint(4,8).storeUint(100,16).storeRef(beginCell().storeAddress(admin.address).storeAddress(admin.address).storeAddress(admin.address)
  .storeRef(beginCell().storeAddress(master).storeAddress(wallet(curve)).storeAddress(dex).storeRef(beginCell().storeAddress(locker).storeAddress(migrator).endCell()).endCell()).endCell())
  .storeRef(beginCell().storeCoins(500000000000n).storeCoins(800000000000000000n).storeCoins(0).storeCoins(0).storeCoins(30000000000n).storeCoins(1000000000000000000n).storeCoins(500000000000n).storeCoins(200000000000000000n).endCell())
  .storeRef(beginCell().storeDict(null).storeRef(walletCode).endCell()).endCell();
 await chain.setShardAccount(curve,createShardAccount({address:curve,code:curveCode,data,balance:0n}));
 await admin.send({to:curve,value:500100000000n,body:beginCell().endCell()});
 const migData=beginCell().storeBit(false).storeAddress(curve).storeAddress(locker).storeAddress(dex)
  .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(0).storeCoins(0).storeAddress(admin.address).endCell())
  .storeRef(beginCell().storeAddress(lp).storeAddress(pw).storeCoins(0).storeCoins(0).storeRef(walletCode).endCell()).endCell();
 await chain.setShardAccount(migrator,createShardAccount({address:migrator,code:migCode,data:migData,balance:10000000n}));
 await chain.setShardAccount(master,createShardAccount({address:master,code:minterCode,balance:10000000n,data:beginCell().storeCoins(0).storeAddress(admin.address).storeRef(beginCell().endCell()).storeRef(walletCode).endCell()}));
 const mint=beginCell().storeUint(0x178d4519,32).storeUint(1,64).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(admin.address).storeCoins(0).storeBit(false).endCell();
 await admin.send({to:master,value:200000000n,body:beginCell().storeUint(21,32).storeUint(1,64).storeAddress(curve).storeCoins(100000000n).storeRef(mint).endCell()});
 const send=(to,op,id=q,value=250000000n,extra)=>admin.send({to,value,bounce:true,body:(extra??beginCell().storeUint(op,32).storeUint(id,64)).endCell()});
 const begin=()=>send(curve,0x414e5801,q,100000000n,beginCell().storeUint(0x414e5801,32).storeUint(q,64).storeRef(beginCell().store(storeStateInit(guardInit)).endCell()));
 const arm=()=>send(curve,0x414e5802,q,180000000n),dispatch=()=>send(curve,0x414e5803),funding=()=>send(migrator,0x414e5903,q,80000000n),abort=()=>send(migrator,0x414e5904,q,120000000n),sync=()=>send(curve,0x414e4831,q,40000000n);
 const execute=()=>send(migrator,0x414e4c37,q,400000000n,beginCell().storeUint(0x414e4c37,32).storeUint(q,64).storeAddress(wallet(dex)).storeAddress(lp).storeAddress(pw));
 const life=async()=>(await chain.runGetMethod(migrator,'get_migration_lifecycle',[{type:'int',value:q}])).stackReader;
 return{chain,admin,other,curve,migrator,master,dex,pton,locker,guardInit,q,wallet,arg,pw,lp,send,begin,arm,dispatch,funding,abort,sync,execute,life};
}
const ok=(r,a)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(a)&&t.description.computePhase?.exitCode===0&&!t.description.aborted);
async function ready(f){assert(ok(await f.begin(),f.curve));assert(ok(await f.arm(),f.curve));}
test('transaction-driven preflight initializes all epochs, then dispatch funds real migrator with one root ID',async()=>{
 const f=await fixture();assert.equal((await f.chain.runGetMethod(f.curve,'get_curve_return_v2',[{type:'int',value:f.q}])).stackReader.readBigNumber(),0n);
 await ready(f);assert(ok(await f.dispatch(),f.curve));assert(ok(await f.funding(),f.migrator));const s=await f.life();const fields=Array.from({length:12},()=>s.readBigNumber());
 assert.equal(fields[0],500000000000n);assert.equal(fields[1],200000000000000000n);assert.equal(fields[2],fields[0]);assert.equal(fields[3],fields[1]);assert(fields[4]>0n&&fields[5]>0n&&fields[6]>0n);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.migrator),'get_wallet_data')).stackReader.readBigNumber(),fields[1]);
});
test('real production guard denies dispatch; no positive proof or principal transfer is fabricated',async()=>{
 const f=await fixture({allow:false});await ready(f);const r=await f.dispatch();assert(r.transactions.some(t=>t.description.computePhase?.exitCode===414));assert.equal((await f.chain.runGetMethod(f.wallet(f.curve),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
});
module.exports={fixture,ready,ok};
async function funded(f){await ready(f);assert(ok(await f.dispatch(),f.curve));assert(ok(await f.funding(),f.migrator));}
async function fields(f){const s=await f.life();return Array.from({length:12},()=>s.readBigNumber());}
async function balances(f){const s=(await f.chain.runGetMethod(f.migrator,'get_migration_data')).stackReader;s.readBigNumber();for(let i=0;i<5;i++)s.readAddress();const ton=s.readBigNumber(),tokens=s.readBigNumber();const e=(await f.chain.runGetMethod(f.migrator,'get_migration_extended_data')).stackReader;e.readBigNumber();for(let i=0;i<3;i++)e.readAddress();return{ton,tokens,dt:e.readBigNumber(),dj:e.readBigNumber()};}
test('both real captured DEX legs succeed with root ID; absent final LP proof remains pending',async()=>{
 const f=await fixture();await funded(f);const r=await f.execute();assert(ok(r,f.migrator));assert.equal((await fields(f))[11],1n);
 const lp=(await f.chain.runGetMethod(f.lp,'get_wallet_data')).stackReader;assert(lp.readBigNumber()>0n);assert(lp.readAddress().equals(f.locker));assert.deepEqual(await balances(f),{ton:0n,tokens:0n,dt:500000000000n,dj:200000000000000000n});
});
test('abort before DEX execution returns both funded principals with no prepared return state',async()=>{
 const f=await fixture();await funded(f);assert(ok(await f.abort(),f.migrator));await f.sync();const a=await fields(f);assert.equal(a[9],500000000000n);assert.equal(a[10],200000000000000000n);assert.equal(a[7]+a[8],0n);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.curve),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);assert.deepEqual(await balances(f),{ton:0n,tokens:0n,dt:0n,dj:0n});
 assert(ok(await f.dispatch(),f.curve),'idempotent repeat emits no new principal');assert.equal((await f.chain.runGetMethod(f.wallet(f.curve),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
});
test('Jetton leg gas failure: return restored Jettons while pTON is still at DEX, then recover and return TON',async()=>{
 const f=await fixture();await funded(f);
 const body=beginCell().storeUint(0x414e4c37,32).storeUint(f.q,64).storeAddress(f.wallet(f.dex)).storeAddress(f.lp).storeAddress(f.pw).endCell();
 // Execute actual source transaction, then fault only one outgoing gas value.
 const tx=await(await f.chain.getContract(f.migrator)).receiveMessage(require('@ton/sandbox').internal({from:f.admin.address,to:f.migrator,value:400000000n,body,bounce:true}));assert.equal(tx.description.aborted,false);
 const out=[...tx.outMessages.values()],token=out.find(m=>m.info.dest.equals(f.wallet(f.migrator))),ton=out.find(m=>m.info.dest.equals(f.pw));token.info.value.coins=20000000n;
 await f.chain.sendMessage(ton);const bad=await f.chain.sendMessage(token);assert(bad.transactions.some(t=>t.description.computePhase?.exitCode===709));
 assert.deepEqual(await balances(f),{ton:0n,tokens:200000000000000000n,dt:500000000000n,dj:0n});
 await f.abort();await f.sync();assert.equal((await fields(f))[10],200000000000000000n);assert.equal((await balances(f)).dt,500000000000n);
 await f.send(f.migrator,0x414e4c3c,999n,900000000n);assert.equal((await balances(f)).ton,500000000000n);await f.abort();await f.sync();const a=await fields(f);assert.equal(a[9],500000000000n);assert.equal(a[10],200000000000000000n);
});
test('native leg authentically bounces: return TON while Jettons stay at DEX, then recover late Jettons',async()=>{
 const f=await fixture();await funded(f);const {freeze,restore}=require('./refund-receipts-support');const saved=await freeze(f,f.pw);
 const r=await f.execute();await restore(f,f.pw,saved);assert.deepEqual(await balances(f),{ton:500000000000n,tokens:0n,dt:0n,dj:200000000000000000n});
 const bounce=r.transactions.find(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.migrator)).inMessage;await f.chain.sendMessage(bounce);assert.equal((await balances(f)).ton,500000000000n);
 await f.abort();assert.equal((await fields(f))[9],500000000000n);assert.equal((await balances(f)).dj,200000000000000000n);
 await f.send(f.migrator,0x414e4c3c,999n,900000000n);await f.send(f.migrator,0x414e4c3e,f.q,40000000n);assert.equal((await balances(f)).tokens,200000000000000000n);
 await f.abort();await f.sync();assert.equal((await fields(f))[10],200000000000000000n);assert.deepEqual(await balances(f),{ton:0n,tokens:0n,dt:0n,dj:0n});
});
test('lost readiness and final Curve acknowledgments recover idempotently without resetting epochs',async()=>{
 const f=await fixture();await f.begin();const {freeze,restore}=require('./refund-receipts-support');let frozen;
 const body=beginCell().storeUint(0x414e5802,32).storeUint(f.q,64).endCell();
 const root=core.external({to:f.admin.address,body:f.admin.createTransfer({messages:[core.internal({to:f.curve,value:180000000n,body,bounce:true})],sendMode:1})});
 for await(const t of await f.chain.sendMessageIter(root))if(!frozen&&[...t.outMessages.values()].some(m=>m.info.dest.equals(f.curve)&&m.body.bits.length>=32&&m.body.beginParse().loadUint(32)===0x414e5902))frozen=await freeze(f,f.curve);
 assert(frozen);await restore(f,f.curve,frozen);assert((await f.dispatch()).transactions.some(t=>t.description.computePhase?.exitCode===409));
 await f.arm();await f.dispatch();await f.funding();const before=await fields(f);await f.abort();const state=await freeze(f,f.migrator);await f.sync();await restore(f,f.migrator,state);assert.equal((await fields(f))[10],0n);
 await f.sync();const after=await fields(f);assert.equal(after[10],200000000000000000n);assert.deepEqual(after.slice(4,7),before.slice(4,7));await f.sync();assert.deepEqual(await fields(f),after);
});
test('failed epoch initialization and insufficient preparation gas prevent dispatch; funded retry succeeds',async()=>{
 const f=await fixture(),{freeze,restore}=require('./refund-receipts-support');const saved=await freeze(f,f.wallet(f.curve));await f.begin();
 assert((await f.arm()).transactions.some(t=>t.description.computePhase?.exitCode===409));await restore(f,f.wallet(f.curve),saved);
 await f.begin();assert((await f.send(f.curve,0x414e5802,f.q,10000000n)).transactions.some(t=>t.description.computePhase?.exitCode===407));await f.arm();assert(ok(await f.dispatch(),f.curve));await f.funding();assert.equal((await fields(f))[3],200000000000000000n);
});
test('wrong IDs, forged approval/funding and duplicate dispatch cannot move or credit principal twice',async()=>{
 const f=await fixture();await ready(f);const forged=await f.other.send({to:f.curve,value:30000000n,body:beginCell().storeUint(0x414e5702,32).storeUint(f.q,64).storeBit(true).endCell()});assert(forged.transactions.some(t=>t.description.computePhase?.exitCode===401));
 const r=await f.dispatch();await f.funding();const a=await fields(f);await f.dispatch();assert.deepEqual(await fields(f),a);
 assert((await f.send(f.migrator,0x414e4c37,999n,400000000n,beginCell().storeUint(0x414e4c37,32).storeUint(999,64).storeAddress(f.wallet(f.dex)).storeAddress(f.lp).storeAddress(f.pw))).transactions.some(t=>t.description.aborted));
 const funding=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.migrator)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x414e4c36).inMessage;await f.chain.sendMessage(funding);assert.deepEqual(await fields(f),a);
 assert((await f.send(f.migrator,0x414e4c38,f.q,150000000n)).transactions.some(t=>t.description.computePhase?.exitCode===409),'legacy abort cannot replace root ID');
 assert((await f.send(f.migrator,0x414e4c38,999n,150000000n)).transactions.some(t=>t.description.computePhase?.exitCode===409));
 assert((await f.send(f.migrator,0x414e4c3d,999n,40000000n)).transactions.some(t=>t.description.computePhase?.exitCode===409));
});
test('authentic return first-hop bounces restore only Curve transit and allow same-root retry once',async()=>{
 const f=await fixture();await funded(f);const {freeze,restore}=require('./refund-receipts-support'),saved=await freeze(f,f.curve);
 const body=beginCell().storeUint(0x414e5904,32).storeUint(f.q,64).endCell();const tx=await(await f.chain.getContract(f.migrator)).receiveMessage(require('@ton/sandbox').internal({from:f.admin.address,to:f.migrator,value:120000000n,body,bounce:true}));assert.equal(tx.description.aborted,false);
 const out=[...tx.outMessages.values()],token=out.find(m=>m.info.dest.equals(f.wallet(f.migrator))),native=out.find(m=>m.info.dest.equals(f.curve));token.info.value.coins=20000000n;
 const responses=[];for(const m of[token,native]){const r=await f.chain.sendMessage(m);responses.push(...r.transactions.filter(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.migrator)).map(t=>t.inMessage));}
 await restore(f,f.curve,saved);assert.deepEqual(await balances(f),{ton:500000000000n,tokens:200000000000000000n,dt:0n,dj:0n});for(const m of responses)await f.chain.sendMessage(m);assert.equal((await balances(f)).ton,500000000000n);
 await f.abort();await f.sync();const a=await fields(f);assert.equal(a[7]+a[8],0n);assert.equal(a[9],500000000000n);assert.equal(a[10],200000000000000000n);
});
test('funding first-hop bounces reconcile upstream principal without treating it as a Migrator return',async()=>{
 for(const target of['token','native']){
  const f=await fixture();await ready(f);const {freeze,restore}=require('./refund-receipts-support');const address=target==='token'?f.wallet(f.curve):f.migrator,saved=await freeze(f,address);
  const r=await f.dispatch();await restore(f,address,saved);await f.funding();await f.sync();
  const bounced=r.transactions.find(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.curve)).inMessage;await f.chain.sendMessage(bounced);
  await f.abort();await f.sync();const a=await fields(f);assert.equal(a[9],500000000000n);assert.equal(a[10],200000000000000000n);assert.equal(a[7]+a[8],0n);
  assert.equal((await f.chain.runGetMethod(f.wallet(f.curve),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
 }
});
