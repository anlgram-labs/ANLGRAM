'use strict';
// Contract-level protocol unit fixtures, NOT genuine STON.fi liquidity or code.
// Masters execute project source; Router/Pool replies are explicitly injected.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Blockchain,createShardAccount,internal}=require('@ton/sandbox');
const core=require('@ton/core');const {Address,beginCell,Cell,contractAddress}=core;
const {compileFunc}=require('@ton-community/func-js');
const contracts=path.resolve(__dirname,'../../minter-contract/contracts');
async function compile(name){const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(contracts,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return Cell.fromBase64(r.codeBoc);}
const codes=Promise.all([compile('anlgram-lp-auth-guard'),compile('anlgram-launchpad-jetton-minter'),compile('jetton-wallet')]);
const addr=n=>new Address(0,Buffer.alloc(32,n));const guard=addr(9),router=addr(4),m0=addr(5),m1=addr(6),pool=addr(8),lp=addr(10);
async function state(chain){const r=(await chain.runGetMethod(guard,'get_auth_state')).stackReader;return{phase:r.readBigNumber(),nonce:r.readBigNumber(),w0:r.readAddressOpt(),w1:r.readAddressOpt(),pool:r.readAddressOpt(),lp:r.readAddressOpt()};}
async function setup(masters=true){
 const [code,minter,wallet]=await codes;const chain=await Blockchain.create();chain.now=1800000000;
 const admin=await chain.treasury('auth-admin'),attacker=await chain.treasury('attacker');
 const cfg=beginCell().storeAddress(router).storeAddress(m0).storeAddress(m1).storeRef(beginCell().storeAddress(admin.address).endCell()).endCell();
 const empty=beginCell().storeAddress(null).storeAddress(null).endCell();
 const data=beginCell().storeUint(0,8).storeUint(0,64).storeRef(cfg).storeRef(empty).storeRef(empty).endCell();
 await chain.setShardAccount(guard,createShardAccount({address:guard,code,data,balance:10000000n}));
 if(masters)for(const master of[m0,m1])await chain.setShardAccount(master,createShardAccount({address:master,code:minter,balance:10000000n,
  data:beginCell().storeCoins(0).storeAddress(admin.address).storeRef(beginCell().endCell()).storeRef(wallet).endCell()}));
 const start=()=>admin.send({to:guard,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5001,32).storeUint(0,64).endCell()});
 return{chain,admin,attacker,start,wallet};
}
const reply=(s,from,body)=>s.chain.sendMessage(internal({from,to:guard,value:50000000n,bounce:true,body}));
const walletReply=(nonce,wallet,owner)=>beginCell().storeUint(0xd1735400,32).storeUint(nonce,64).storeAddress(wallet)
 .storeMaybeRef(owner===undefined?null:beginCell().storeAddress(owner).endCell()).endCell();
test('on-chain master discovery and authenticated Router/Pool owner binding never authorize unproved migration',async()=>{
 const s=await setup();const started=await s.start();let a=await state(s.chain);assert.equal(a.phase,3n);
 for(const [master,actual]of[[m0,a.w0],[m1,a.w1]]){
  const data=beginCell().storeCoins(0).storeAddress(router).storeAddress(master).storeRef(s.wallet).endCell();
  assert(actual.equals(contractAddress(0,{code:s.wallet,data})));
 }
 const query=started.transactions.find(t=>t.inMessage?.info.dest?.equals(router));const b=query.inMessage.body.beginParse();
 assert.equal(b.loadUint(32),0x2993ade0);assert.equal(b.loadUintBig(64),a.nonce);assert(b.loadAddress().equals(a.w0));assert(b.loadAddress().equals(a.w1));
 await reply(s,router,beginCell().storeUint(0x2993ade0,32).storeUint(a.nonce,64).storeAddress(pool).endCell());
 a=await state(s.chain);assert.equal(a.phase,4n);
 await reply(s,pool,walletReply(a.nonce,lp,guard));a=await state(s.chain);assert.equal(a.phase,5n);assert(a.pool.equals(pool));assert(a.lp.equals(lp));
 assert.equal((await s.chain.runGetMethod(guard,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 const replay=await reply(s,pool,walletReply(a.nonce,lp,guard));assert(replay.transactions.some(t=>t.description.computePhase?.exitCode===407));
});
for(const [name,from,make,exit]of[
 ['forged router',addr(22),n=>beginCell().storeUint(0x2993ade0,32).storeUint(n,64).storeAddress(pool).endCell(),401],
 ['stale nonce',router,n=>beginCell().storeUint(0x2993ade0,32).storeUint(n+1n,64).storeAddress(pool).endCell(),407],
 ['substituted router as pool',router,n=>beginCell().storeUint(0x2993ade0,32).storeUint(n,64).storeAddress(router).endCell(),408],
])test(`${name} cannot bind LP state`,async()=>{
 const s=await setup();await s.start();const a=await state(s.chain);const r=await reply(s,from,make(a.nonce));
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));assert.equal((await state(s.chain)).phase,3n);
});
for(const [name,from,owner,exit]of[['wrong pool sender',addr(22),guard,401],['wrong LP owner',pool,router,408],['missing included owner',pool,undefined,408]])test(`${name} stays unauthenticated`,async()=>{
 const s=await setup();await s.start();const a=await state(s.chain);
 await reply(s,router,beginCell().storeUint(0x2993ade0,32).storeUint(a.nonce,64).storeAddress(pool).endCell());
 const r=await reply(s,from,walletReply(a.nonce,lp,owner));assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));
 assert.equal((await state(s.chain)).phase,4n);assert.equal((await s.chain.runGetMethod(guard,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('unauthorized restart, insufficient funding and privileged wallet injection cannot bypass handshake',async()=>{
 const s=await setup();
 for(const [sender,value,op,exit]of[[s.attacker,150000000n,0x414c5001,401],[s.admin,1000000n,0x414c5001,405],[s.admin,50000000n,0x414e4c31,407]]){
  const r=await sender.send({to:guard,value,bounce:true,body:beginCell().storeUint(op,32).storeUint(0,64).storeAddress(lp).endCell()});
  assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));
 }
 assert.equal((await state(s.chain)).phase,0n);
});
