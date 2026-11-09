'use strict';
// Source-compiled locker + captured actual LP wallet code in Sandbox.
// Pool-origin mint messages are controlled fixtures, NOT real DEX migration.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{internal,createShardAccount}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support');
const api=require('../../minter-contract/scripts/lp-locker-v2');
const {beginCell,Address}=core,addr=n=>new Address(0,Buffer.alloc(32,n));let compiled;
async function fixture(percent=100,duration='permanent'){
 const chain=await setup(),creator=await chain.treasury('lock-creator'),other=await chain.treasury('other'),controller=await chain.treasury('free-controller');
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const code=await(compiled??=(async()=>{const r=await compileFunc({targets:['anlgram-lp-locker-v2.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);})());
 const vault=api.build(core,{code,creator:creator.address,unlockedController:controller.address,contributor:creator.address,router:Address.parse(snap.accounts.router.address),pairWallet0:addr(31),pairWallet1:addr(32),operationId:77,percent,duration});
 await creator.send({to:vault.address,value:100000000n,init:vault.init,body:beginCell().endCell()});
 const record=async()=>{const s=(await chain.runGetMethod(vault.address,'get_lock_v2')).stackReader;return{percent:s.readBigNumber(),duration:s.readBigNumber(),unlock:s.readBigNumber(),received:s.readBigNumber(),locked:s.readBigNumber(),free:s.readBigNumber(),pending:s.readBigNumber(),next:s.readBigNumber(),beneficiary:s.readAddress(),controller:s.readAddress(),pool:s.readAddress(),wallet:s.readAddress()};};
 const mint=async(amount=1001n,tag=77)=>{
  const body=beginCell().storeUint(0x178d4519,32).storeUint(tag,64).storeCoins(amount).storeAddress(creator.address).storeAddress(creator.address).storeCoins(50000000n)
   .storeBit(false).storeUint(0x414c5632,32).storeUint(tag,64).endCell();
  const m=internal({from:vault.pool,to:vault.lpWallet,value:200000000n,body});m.init=vault.lpInit;
  return chain.sendMessage(m);
 };
 const claim=(sender,locked,amount,q=1,value=150000000n)=>sender.send({to:vault.address,value,bounce:true,body:beginCell().storeUint(0x414c5633,32).storeUint(q,64).storeBit(locked).storeCoins(amount).endCell()});
 const balance=async owner=>{const {derive}=require('../../minter-contract/scripts/stonfi-v22-addresses');const a=derive(core,Address.parse(snap.accounts.router.address),addr(31),addr(32),owner).lpWallet;return(await chain.runGetMethod(a,'get_wallet_data')).stackReader.readBigNumber();};
 return{chain,creator,other,controller,vault,record,mint,claim,balance};
}
const exited=(r,to,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(to)&&t.description.computePhase?.exitCode===code);
test('default permanent 100% authentic custody, replay-safe observation and no admin/upgrade/withdraw bypass',async()=>{
 const f=await fixture();assert.equal((await f.record()).received,0n);const r=await f.mint();let s=await f.record();assert.equal(s.locked,1001n);assert.equal(s.free,0n);assert.equal(s.unlock,0xffffffffffffffffn);assert.equal(await f.balance(f.vault.address),1001n);
 const note=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x7362d09c).inMessage;
 await f.chain.sendMessage(note);assert.equal((await f.record()).received,1001n);
 assert(exited(await f.claim(f.creator,true,1n),f.vault.address,403));assert(exited(await f.claim(f.other,true,1n),f.vault.address,401));
 for(const op of[0x414e4c31,0x414e4c32,0x595f07bc,0x414c5002])assert(exited(await f.creator.send({to:f.vault.address,value:30000000n,body:beginCell().storeUint(op,32).storeUint(1,64).endCell()}),f.vault.address,404));
 assert.equal((await f.chain.runGetMethod(f.vault.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
for(const duration of['days180','days365'])test(duration+' rejects unauthorized/early withdrawal and delivers exactly at unlock; repeats cannot double-claim',async()=>{
 const f=await fixture(100,duration);await f.mint();const s=await f.record();assert.equal(s.unlock,BigInt(f.chain.now+api.DURATIONS[duration]));
 assert(exited(await f.claim(f.other,true,1001n),f.vault.address,401));f.chain.now=Number(s.unlock)-1;assert(exited(await f.claim(f.creator,true,1001n),f.vault.address,403));
 f.chain.now=Number(s.unlock);const r=await f.claim(f.creator,true,1001n);assert(exited(r,f.vault.address,0));assert.equal(await f.balance(f.creator.address),1001n);
 assert.equal((await f.record()).pending,1001n,'real recipient balance is observed by test; contract does not fabricate delivery receipt');assert.equal((await f.record()).locked,0n);
 assert(exited(await f.claim(f.creator,true,1001n),f.vault.address,409));assert.equal(await f.balance(f.creator.address),1001n);
});
for(const percent of[50,75,99])test(percent+'% separates balances, rounds upward and authenticates unlocked controller',async()=>{
 const f=await fixture(percent);await f.mint();const s=await f.record(),locked=(1001n*BigInt(percent)+99n)/100n;assert.equal(s.locked,locked);assert.equal(s.free,1001n-locked);
 assert(s.beneficiary.equals(f.creator.address));assert(s.controller.equals(f.controller.address));assert(exited(await f.claim(f.creator,false,s.free),f.vault.address,401));
 await f.claim(f.controller,false,s.free);assert.equal(await f.balance(f.controller.address),s.free);assert.equal(await f.balance(f.vault.address),locked);assert.equal((await f.record()).locked,locked);
});
test('later authenticated deposits extend timed expiry; split rounding preserves cumulative percentage',async()=>{
 const f=await fixture(50,'days180');await f.mint(1n);const a=await f.record();f.chain.now+=100;await f.mint(2n);const b=await f.record();assert.equal(b.locked,2n);assert.equal(b.free,1n);assert.equal(b.unlock,a.unlock+100n);
});
test('unlocked withdrawal does not strand later matured locked principal while delivery receipts remain pending',async()=>{
 const f=await fixture(50,'days180');await f.mint();const a=await f.record();await f.claim(f.controller,false,a.free,1);f.chain.now=Number(a.unlock);
 await f.claim(f.creator,true,a.locked,2);const b=await f.record();assert.equal(b.locked,0n);assert.equal(b.free,0n);assert.equal(b.pending,1001n);
 assert.equal(await f.balance(f.creator.address),a.locked);assert.equal(await f.balance(f.controller.address),a.free);assert.equal(await f.balance(f.vault.address),0n);
 for(const[q,amount]of[[1,a.free],[2,a.locked]]){const s=(await f.chain.runGetMethod(f.vault.address,'get_claim_v2',[{type:'int',value:BigInt(q)}])).stackReader;assert.equal(s.readBigNumber(),amount);}
 assert(exited(await f.claim(f.creator,true,1n,3),f.vault.address,408));
});
test('wrong wallet, wrong operation and absent notification never establish custody',async()=>{
 const f=await fixture();await f.mint(1001n,78);assert.equal((await f.record()).received,0n);assert.equal(await f.balance(f.vault.address),1001n,'actual custody alone is not a correlated receipt');
 const fake=beginCell().storeUint(0x7362d09c,32).storeUint(77,64).storeCoins(100n).storeAddress(f.creator.address).storeBit(false).storeUint(0x414c5632,32).storeUint(77,64).endCell();assert(exited(await f.other.send({to:f.vault.address,value:50000000n,body:fake}),f.vault.address,401));
 assert.equal((await f.record()).locked,0n);
});
test('insufficient claim gas preserves balances and immediate authenticated wallet bounce restores once',async()=>{
 const f=await fixture(50);await f.mint();assert(exited(await f.claim(f.controller,false,500n,1,20000000n),f.vault.address,407));assert.equal((await f.record()).free,500n);
 // Deliberately replace the foreign wallet with uninitialized state. Its bounce
 // is real Sandbox routing, but this is fault injection, not an authentic Pool.
 await f.chain.setShardAccount(f.vault.lpWallet,createShardAccount({address:f.vault.lpWallet,balance:0n}));
 const r=await f.claim(f.controller,false,500n);assert.equal((await f.record()).free,500n);assert.equal((await f.record()).pending,0n);assert.equal((await f.record()).next,2n);
 const bounce=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.info.bounced)?.inMessage;assert(bounce);await f.chain.sendMessage(bounce);assert.equal((await f.record()).free,500n);assert(exited(await f.claim(f.controller,false,500n,1),f.vault.address,409));
});
test('downstream frozen recipient restores foreign sender wallet but cannot fabricate a claim failure receipt',async()=>{
 const f=await fixture(50);await f.mint();const {derive}=require('../../minter-contract/scripts/stonfi-v22-addresses');
 const recipient=derive(core,Address.parse(snap.accounts.router.address),addr(31),addr(32),f.controller.address);
 // Existing non-genesis recipient state is a labeled fault-injection fixture.
 await f.chain.setShardAccount(recipient.lpWallet,createShardAccount({address:recipient.lpWallet,code:recipient.lpInit.code,balance:10000000n,
  data:beginCell().storeCoins(1).storeAddress(f.controller.address).storeAddress(f.vault.pool).storeRef(recipient.lpInit.code).endCell()}));
 const {freeze,restore}=require('./refund-receipts-support');const state=await freeze(f,recipient.lpWallet);
 await f.claim(f.controller,false,500n);await restore(f,recipient.lpWallet,state);
 assert.equal(await f.balance(f.vault.address),1001n,'actual foreign wallet restores bounced downstream amount');assert.equal(await f.balance(f.controller.address),1n);
 const a=await f.record();assert.equal(a.pending,500n);assert.equal(a.free,0n);assert.equal(a.locked,501n);
 assert(exited(await f.claim(f.controller,false,500n,2),f.vault.address,408),'absence of final receipt never permits a second transfer');
});
test('out-of-order immediate wallet bounces reconcile each pending claim once after newer requests',async()=>{
 const f=await fixture(50);await f.mint();const request=(q,amount)=>internal({from:f.controller.address,to:f.vault.address,value:150000000n,bounce:true,
  body:beginCell().storeUint(0x414c5633,32).storeUint(q,64).storeBit(false).storeCoins(amount).endCell()});
 const c=await f.chain.getContract(f.vault.address),first=await c.receiveMessage(request(1,200n)),second=await c.receiveMessage(request(2,300n));
 assert.equal(first.description.aborted,false);assert.equal(second.description.aborted,false);assert.equal((await f.record()).pending,500n);
 await f.chain.setShardAccount(f.vault.lpWallet,createShardAccount({address:f.vault.lpWallet,balance:0n}));
 const replies=[];
 for(const [tx,free,pending]of[[second,300n,200n],[first,500n,0n]]){
  const m=[...tx.outMessages.values()].find(m=>m.info.dest.equals(f.vault.lpWallet));assert(m);const r=await f.chain.sendMessage(m);
  replies.push(r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.info.bounced).inMessage);
  const s=await f.record();assert.equal(s.free,free);assert.equal(s.pending,pending);
 }
 for(const m of replies)await f.chain.sendMessage(m);assert.equal((await f.record()).free,500n);assert.equal((await f.record()).pending,0n);
});
test('invalid terms rejected; disclosure never promotes pending or getter-only custody into verified locking',async()=>{
 const f=await fixture();const common={creator:f.creator.address,contributor:f.creator.address,router:Address.parse(snap.accounts.router.address),pairWallet0:addr(31),pairWallet1:addr(32),operationId:77};
 for(const percent of[49,101,50.5])assert.throws(()=>api.build(core,{...common,percent}));assert.throws(()=>api.build(core,{...common,duration:'days30'}));
 const a=api.disclosure(f.vault.terms);assert.equal(a.custodyStatus,'PENDING_UNVERIFIED');const b=api.disclosure(f.vault.terms,{locked:'100',unlocked:'0',pending:'1',unlockTimestamp:null});assert.equal(b.custodyStatus,'CONTRACT_RECORD_UNVERIFIED');assert.equal(b.withdrawalStatus,'PENDING_WALLET_OUTCOME');assert.equal(b.migrationEnabled,false);
});
