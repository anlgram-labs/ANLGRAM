'use strict';
// Real captured code for derivation/getter tests. Adversarial reply injection
// below is an explicitly local protocol fixture, not a live sender signature.
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('@ton/core'),{internal}=require('@ton/sandbox');
const {beginCell,Address}=core;const {fixture}=require('./migration-recovery-support');
const {derive,profileCell}=require('../../minter-contract/scripts/stonfi-v22-addresses');
const addr=n=>new Address(0,Buffer.alloc(32,n));
async function expected(f){const r=(await f.chain.runGetMethod(f.locker,'get_expected_destinations')).stackReader;return{profile:r.readBigNumber()!==0n,pool:r.readAddressOpt(),lp:r.readAddressOpt()};}
const start=f=>f.admin.send({to:f.locker,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5001,32).storeUint(1,64).endCell()});
async function staged(f,phase,profile=profileCell(core)){
 const c=await f.chain.getContract(f.locker),a=c.account,e=derive(core,f.dex,f.dexTokenWallet,f.ptonWallet,f.locker);
 const cfg=beginCell().storeAddress(f.dex).storeAddress(f.master).storeAddress(f.pton).storeRef(beginCell().storeAddress(f.admin.address).endCell()).storeRef(profile).endCell();
 const data=beginCell().storeUint(phase,8).storeUint(55,64).storeRef(cfg)
  .storeRef(beginCell().storeAddress(f.dexTokenWallet).storeAddress(f.ptonWallet).endCell())
  .storeRef(beginCell().storeAddress(e.pool).storeAddress(e.lpWallet).endCell()).endCell();
 c.account={...a,account:{...a.account,storage:{...a.account.storage,state:{type:'active',state:{...c.accountState.state,data}}}}};
 return e;
}
test('32 pair derivations, both input orders, match captured real Router getters',async()=>{
 const f=await fixture();
 for(let i=1;i<=32;i++){
  const a=addr(i),b=addr(255-i),e=derive(core,f.dex,a,b,f.locker),swapped=derive(core,f.dex,b,a,f.locker);
  const actual=(await f.chain.runGetMethod(f.dex,'get_pool_address',[f.arg(a),f.arg(b)])).stackReader.readAddress();
  const reverse=(await f.chain.runGetMethod(f.dex,'get_pool_address',[f.arg(b),f.arg(a)])).stackReader.readAddress();
  assert(e.pool.equals(actual));assert(swapped.pool.equals(reverse));assert(swapped.pool.equals(actual));assert(swapped.lpWallet.equals(e.lpWallet));
 }
});
test('pinned contract computes Pool and LP before Pool deployment and validates actual later bootstrap',async()=>{
 const f=await fixture({pinned:true}),e=derive(core,f.dex,f.dexTokenWallet,f.ptonWallet,f.locker);
 await start(f);const p=await expected(f);assert(p.profile);assert(p.pool.equals(e.pool));assert(p.lp.equals(e.lpWallet));assert(p.pool.equals(f.pool));
 assert.notEqual((await f.chain.getContract(f.pool)).accountState?.type,'active');
 assert.equal((await f.chain.runGetMethod(f.locker,'get_auth_state')).stackReader.readBigNumber(),4n);
 await f.chain.sendMessage(f.token);
 const actualLp=(await f.chain.runGetMethod(f.pool,'get_wallet_address',[f.arg(f.locker)])).stackReader.readAddress();assert(actualLp.equals(e.lpWallet));
 await f.chain.sendMessage(f.ton);await start(f);
 assert.equal((await f.chain.runGetMethod(f.locker,'get_auth_state')).stackReader.readBigNumber(),5n);
 assert((await f.chain.runGetMethod(actualLp,'get_wallet_data')).stackReader.readBigNumber()>0n);
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('even an authenticated Router response cannot substitute the independently derived Pool',async()=>{
 const f=await fixture({pinned:true});await staged(f,3);const before=await expected(f);
 const r=await f.chain.sendMessage(internal({from:f.dex,to:f.locker,value:50000000n,bounce:true,body:beginCell().storeUint(0x2993ade0,32).storeUint(55,64).storeAddress(addr(44)).endCell()}));
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===408));assert((await expected(f)).pool.equals(before.pool));
});
test('even an authenticated Pool response with correct owner cannot substitute the derived LP wallet',async()=>{
 const f=await fixture({pinned:true}),e=await staged(f,4);
 const r=await f.chain.sendMessage(internal({from:e.pool,to:f.locker,value:50000000n,bounce:true,body:beginCell().storeUint(0xd1735400,32).storeUint(55,64).storeAddress(addr(45))
  .storeMaybeRef(beginCell().storeAddress(f.locker).endCell()).endCell()}));
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===408));assert((await expected(f)).lp.equals(e.lpWallet));
});
test('substituted code, malformed profiles and changed genesis DEX fees fail before any query dispatch',async()=>{
 const f=await fixture({pinned:true}),p=profileCell(core),s=p.beginParse();s.loadUint(32);s.loadUint(16);s.loadUint(16);const codes=[s.loadRef(),s.loadRef(),s.loadRef()];
 for(let i=0;i<5;i++){
  const refs=codes.map((c,j)=>i===j?beginCell().storeUint(7,8).endCell():c);
  const profile=beginCell().storeUint(i===4?0:0x53543232,32).storeUint(i===3?21:20,16).storeUint(10,16).storeRef(refs[0]).storeRef(refs[1]).storeRef(refs[2]).endCell();
  await staged(f,0,profile);const r=await start(f);assert(r.transactions.some(t=>t.description.computePhase?.exitCode===408));
  assert.equal((await f.chain.runGetMethod(f.locker,'get_auth_state')).stackReader.readBigNumber(),0n);
 }
});
