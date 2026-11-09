'use strict';
// Source-compiled project contracts + actual captured Router/Pool/LP-wallet code.
// LP issuance is produced by real local DEX execution, never an injected mint.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js'),{fixture}=require('./migration-recovery-support');
const {build}=require('../../minter-contract/scripts/lp-locker-v2'),{build:planBuild}=require('../../minter-contract/scripts/migration-v2-plan');
const {beginCell}=core;let compiled;
async function setup({percent=100,duration='permanent',missing=true}={}){
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const [vaultCode,planCode]=await(compiled??=Promise.all(['anlgram-lp-locker-v2','anlgram-migration-v2-plan'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 let vault;
 const f=await fixture({lockerFactory:async x=>{vault=build(core,{code:vaultCode,creator:x.admin.address,contributor:x.migrator,router:x.dex,pairWallet0:x.dexTokenWallet,pairWallet1:x.ptonWallet,operationId:101,percent,duration});
  await x.admin.send({to:vault.address,init:vault.init,value:100000000n,body:beginCell().endCell()});return vault.address;}});
 const {freeze,restore}=require('./refund-receipts-support');let frozen,notification;
 await f.chain.sendMessage(f.token);
 for await(const t of await f.chain.sendMessageIter(f.ton)){
  if(missing&&!frozen&&t.inMessage?.info.dest?.equals(vault.lpWallet))frozen=await freeze(f,vault.address);
  for(const m of t.outMessages.values())if(m.info.dest.equals(vault.address)&&m.body.bits.length>=32&&m.body.beginParse().loadUint(32)===0x7362d09c)notification=m;
 }
 if(frozen)await restore(f,vault.address,frozen);
 const balance=async()=>{const r=(await f.chain.runGetMethod(vault.lpWallet,'get_wallet_data')).stackReader;const amount=r.readBigNumber();assert(r.readAddress().equals(vault.address));assert(r.readAddress().equals(f.pool));return amount;};
 const record=async()=>(await f.chain.runGetMethod(vault.address,'get_lock_v2')).stackReader;
 const proof=async()=>{const r=(await f.chain.runGetMethod(vault.address,'get_lp_recovery_v4')).stackReader;return Array.from({length:6},()=>r.readBigNumber());};
 const probe=(amount,value=120000000n,id=101)=>f.admin.send({to:vault.address,value,bounce:true,body:beginCell().storeUint(0x414c5636,32).storeUint(id,64).storeCoins(amount).endCell()});
 const retry=(value=120000000n)=>f.admin.send({to:vault.address,value,bounce:true,body:beginCell().storeUint(0x414c5638,32).storeUint(101,64).endCell()});
 const options={code:planCode,vaultCode,creator:f.admin.address,router:f.dex,pairWallet0:f.dexTokenWallet,pairWallet1:f.ptonWallet,operationId:101,tokenMaster0:f.master,tokenMaster1:f.pton};
 const p=planBuild(core,options);await f.admin.send({to:p.address,init:p.init,value:100000000n,body:beginCell().endCell()});
 const discover=()=>f.admin.send({to:p.address,value:180000000n,bounce:true,body:beginCell().storeUint(0x414e5640,32).storeUint(101,64).endCell()});
 const auth=async()=>{const r=(await f.chain.runGetMethod(p.address,'get_pair_discovery_v4')).stackReader;return{flags:r.readBigNumber(),nonce:r.readBigNumber(),m0:r.readAddressOpt(),m1:r.readAddressOpt(),pin:r.readBigNumber(),currentCodeVerified:r.readBigNumber()};};
 return{...f,vault,p,options,balance,record,proof,probe,retry,notification,discover,auth};
}
const failed=r=>r.transactions.some(t=>t.description.aborted);
test('lost FIRST actual DEX LP notification: real self-transfer proves custody floor without inventing exact balance or mint credit',async()=>{
 const f=await setup(),b=await f.balance();assert(b>0n);const s=await f.record();s.readBigNumber();s.readBigNumber();s.readBigNumber();assert.equal(s.readBigNumber(),0n);
 const r=await f.probe(b),p=await f.proof();assert.equal(p[0],2n);assert.equal(p[2],b);assert.equal(p[5],0n);assert.equal(await f.balance(),b,'LP never leaves its genuine original wallet');
 const q=await f.record();q.readBigNumber();q.readBigNumber();q.readBigNumber();assert.equal(q.readBigNumber(),0n,'floor is NOT attributed migration issuance');
 const notification=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x7362d09c).inMessage;
 await f.chain.sendMessage(notification);await f.retry(20000000n);assert.deepEqual(await f.proof(),p);assert.equal(await f.balance(),b);
});
test('partial custody floor and delayed original notification are separate; no double counting or full-balance assumption',async()=>{
 const f=await setup(),b=await f.balance();await f.probe(b/2n);assert.equal((await f.proof())[2],b/2n);assert.equal((await f.proof())[5],0n);
 assert(f.notification);await f.chain.sendMessage(f.notification);await f.chain.sendMessage(f.notification);
 const s=await f.record();s.readBigNumber();s.readBigNumber();s.readBigNumber();assert.equal(s.readBigNumber(),b);assert.equal(s.readBigNumber(),b);assert.equal(await f.balance(),b);
});
test('gas exhaustion, wrong operation and oversized candidate remain unconfirmed; funded retry cannot infer an upper balance bound from bounce',async()=>{
 const f=await setup(),b=await f.balance();assert(failed(await f.probe(b,10000000n)));assert(failed(await f.probe(b,120000000n,999)));assert.equal((await f.proof())[2],0n);
 await f.probe(b+1n);assert.equal((await f.proof())[0],1n);assert.equal((await f.proof())[2],0n);await f.retry();assert.equal((await f.proof())[2],0n);
 await f.probe(b);assert.equal((await f.proof())[2],b);assert.equal(await f.balance(),b);
});
test('lost recovery notification can be retried with real wallet messages; regular/pending withdrawal ledgers stay untouched',async()=>{
 const f=await setup(),b=await f.balance(),{freeze,restore}=require('./refund-receipts-support');let state;
 const m=core.external({to:f.admin.address,body:f.admin.createTransfer({messages:[core.internal({to:f.vault.address,value:120000000n,body:beginCell().storeUint(0x414c5636,32).storeUint(101,64).storeCoins(b).endCell()})],sendMode:1})});
 for await(const t of await f.chain.sendMessageIter(m))if(!state&&t.inMessage?.info.dest?.equals(f.vault.lpWallet)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x178d4519)state=await freeze(f,f.vault.address);
 assert(state);await restore(f,f.vault.address,state);assert.equal((await f.proof())[0],1n);assert.equal((await f.proof())[2],0n);await f.retry();assert.equal((await f.proof())[2],b);assert.equal(await f.balance(),b);
});
for(const [percent,duration]of[[50,'permanent'],[100,'days180'],[100,'days365']])test('bounded initial probe rejects '+percent+'% '+duration+' without changing immutable settings',async()=>{
 const f=await setup({percent,duration});assert(failed(await f.probe(await f.balance())));assert.equal((await f.proof())[2],0n);const r=await f.record();assert.equal(r.readBigNumber(),BigInt(percent));
});
test('actual masters -> Router -> Pool authenticate declared pair and derived LP owner; current Router code and financial approval stay unverified',async()=>{
 const f=await setup();await f.discover();const a=await f.auth();assert.equal(a.flags,15n);assert(a.m0.equals(f.master));assert(a.m1.equals(f.pton));assert.equal(a.currentCodeVerified,0n);
 assert.equal((await f.chain.runGetMethod(f.p.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 const d=(await f.chain.runGetMethod(f.p.address,'get_v2_destinations')).stackReader;assert(d.readAddress().equals(f.p.vault.address));assert(d.readAddress().equals(f.pool));assert(d.readAddress().equals(f.p.vault.lpWallet));
});
test('forged or stale master/Router/Pool evidence never changes authenticated discovery',async()=>{
 const f=await setup();await f.discover();const before=await f.auth();const op=(o,q)=>beginCell().storeUint(o,32).storeUint(q,64);
 const bad=await f.admin.send({to:f.p.address,value:40000000n,body:op(0x2993ade0,before.nonce).storeAddress(f.pool).endCell()});assert(failed(bad));
 const stale=await f.chain.sendMessage(require('@ton/sandbox').internal({from:f.dex,to:f.p.address,value:40000000n,body:op(0x2993ade0,before.nonce-1n).storeAddress(f.pool).endCell()}));assert(failed(stale));
 const wrong=await f.chain.sendMessage(require('@ton/sandbox').internal({from:f.pool,to:f.p.address,value:40000000n,body:op(0xd1735400,before.nonce).storeAddress(f.lp).storeMaybeRef(beginCell().storeAddress(f.p.vault.address).endCell()).endCell()}));assert(failed(wrong));const after=await f.auth();assert.equal(after.flags,before.flags);assert.equal(after.nonce,before.nonce);assert(after.m0.equals(before.m0));assert(after.m1.equals(before.m1));assert.equal(after.pin,before.pin);assert.equal(after.currentCodeVerified,0n);
});
test('real LP withdrawal succeeds once; frozen recipient restores wallet balance without inventing final owner receipts',async()=>{
 const f=await setup({percent:50,duration:'days180',missing:false}),b=await f.balance(),r=await f.record();r.readBigNumber();r.readBigNumber();const unlock=r.readBigNumber();r.readBigNumber();const locked=r.readBigNumber(),free=r.readBigNumber();
 const claim=(q,amount,which=false)=>f.admin.send({to:f.vault.address,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5633,32).storeUint(q,64).storeBit(which).storeCoins(amount).endCell()});
 await claim(1,1n);const recipient=require('../../minter-contract/scripts/stonfi-v22-addresses').derive(core,f.dex,f.dexTokenWallet,f.ptonWallet,f.admin.address).lpWallet;
 assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),1n);
 const {freeze,restore}=require('./refund-receipts-support'),state=await freeze(f,recipient);await claim(2,free-1n);await restore(f,recipient,state);assert.equal(await f.balance(),b-1n);
 const stateAfter=await f.record();for(let i=0;i<4;i++)stateAfter.readBigNumber();assert.equal(stateAfter.readBigNumber(),locked);assert.equal(stateAfter.readBigNumber(),0n);assert.equal(stateAfter.readBigNumber(),free,'no failure receipt: successful and failed requests stay pending');
 assert(failed(await claim(3,locked,true)));f.chain.now=Number(unlock);await claim(3,locked,true);assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),locked+1n);
 assert(failed(await claim(3,locked,true)));assert.equal(await f.balance(),free-1n,'unconfirmed restored tokens cannot be claimed again');
});
test('a wallet getter is not an internal balance-proof endpoint; permanent vault cannot use burn/withdraw bypass',async()=>{
 const f=await setup({missing:false}),b=await f.balance();
 const query=await f.admin.send({to:f.vault.lpWallet,value:30000000n,bounce:true,body:beginCell().storeUint(97026,32).storeUint(101,64).endCell()});assert(failed(query));assert.equal(await f.balance(),b);
 for(const op of[0x595f07bc,0x414e4c32])assert(failed(await f.admin.send({to:f.vault.address,value:40000000n,body:beginCell().storeUint(op,32).storeUint(101,64).endCell()})));
 assert(failed(await f.admin.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(1).endCell()})));assert.equal(await f.balance(),b);
});
test('wrong LP master cannot substitute a wallet with the same owner and captured wallet code',async()=>{
 const f=await setup(),fakeMaster=new core.Address(0,Buffer.alloc(32,91)),lpCode=f.vault.lpInit.code;
 const init={code:lpCode,data:beginCell().storeCoins(0).storeAddress(f.vault.address).storeAddress(fakeMaster).storeRef(lpCode).endCell()},address=core.contractAddress(0,init);
 // Explicit adversarial fake-master input; genuine custody was already minted by real DEX above.
 const m=require('@ton/sandbox').internal({from:fakeMaster,to:address,value:200000000n,body:beginCell().storeUint(0x178d4519,32).storeUint(101,64).storeCoins(10)
  .storeAddress(f.migrator).storeAddress(f.admin.address).storeCoins(30000000n).storeBit(false).storeUint(0x414c5003,32).storeUint(101,64).endCell()});m.init=init;
 const r=await f.chain.sendMessage(m);assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.description.computePhase?.exitCode===401));
 const s=await f.record();for(let i=0;i<3;i++)s.readBigNumber();assert.equal(s.readBigNumber(),0n);assert.equal((await f.proof())[2],0n);
});
test('real master replies for a swapped declared pair are rejected instead of trusting deterministic Pool alone',async()=>{
 const f=await setup(),p=planBuild(core,{...f.options,tokenMaster0:f.pton,tokenMaster1:f.master});await f.admin.send({to:p.address,init:p.init,value:100000000n,body:beginCell().endCell()});
 const r=await f.admin.send({to:p.address,value:180000000n,body:beginCell().storeUint(0x414e5640,32).storeUint(101,64).endCell()});assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(p.address)&&t.description.computePhase?.exitCode===408));
 const s=(await f.chain.runGetMethod(p.address,'get_pair_discovery_v4')).stackReader;assert.notEqual(s.readBigNumber(),15n);
});
test('authentic donated LP floor reaches canonical plan but never becomes migration issuance or financial authorization',async()=>{
 const f=await setup({percent:50,missing:false});await f.discover();await f.admin.send({to:f.p.vault.address,init:f.p.vault.init,value:100000000n,body:beginCell().endCell()});
 await f.admin.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(false).storeCoins(100).endCell()});
 const own=require('../../minter-contract/scripts/stonfi-v22-addresses').derive(core,f.dex,f.dexTokenWallet,f.ptonWallet,f.admin.address).lpWallet;
 await f.admin.send({to:own,value:120000000n,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(101,64).storeCoins(100).storeAddress(f.p.vault.address).storeAddress(f.admin.address).storeBit(false).storeCoins(20000000n)
  .storeBit(false).storeUint(0x414c5632,32).storeUint(101,64).endCell()});
 await f.admin.send({to:f.p.vault.address,value:120000000n,body:beginCell().storeUint(0x414c5636,32).storeUint(101,64).storeCoins(100).endCell()});
 const p=(await f.chain.runGetMethod(f.p.address,'get_custody_floor_v4')).stackReader;assert.equal(p.readBigNumber(),100n);assert(p.readBigNumber()>0n);assert.equal(p.readBigNumber(),0n);assert.equal(p.readBigNumber(),0n);
 const o=(await f.chain.runGetMethod(f.p.address,'get_v2_observation')).stackReader;o.readBigNumber();assert.equal(o.readBigNumber(),0n,'actual tokens exist, but their donation is not migration-origin proof');
 assert.equal((await f.chain.runGetMethod(f.p.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
