'use strict';
// All funds/accounts below are local Sandbox fixtures; real captured DEX code.
const test=require('node:test'),assert=require('node:assert/strict');
const {beginCell,Cell,storeStateInit}=require('@ton/core');const {internal}=require('@ton/sandbox');
const {fixture,lpAccount}=require('./migration-recovery-support');
const op=(m)=>m.body.bits.length>=32?m.body.beginParse().loadUint(32):0;
async function balances(f){
 const d=(await f.chain.runGetMethod(f.migrator,'get_migration_data')).stackReader;const initialized=d.readBigNumber();for(let i=0;i<5;i++)d.readAddress();
 const ton=d.readBigNumber(),tokens=d.readBigNumber();const e=(await f.chain.runGetMethod(f.migrator,'get_migration_extended_data')).stackReader;
 e.readBigNumber();for(let i=0;i<3;i++)e.readAddress();return{initialized,ton,tokens,pendingTon:e.readBigNumber(),pendingTokens:e.readBigNumber()};
}
const recover=f=>f.admin.send({to:f.migrator,value:900000000n,bounce:true,body:beginCell().storeUint(0x414e4c3c,32).storeUint(999,64).endCell()});
async function expectRecovered(f){
 assert.deepEqual(await balances(f),{initialized:0n,ton:500000000000n,tokens:200000000000000000n,pendingTon:0n,pendingTokens:0n});
 assert.equal((await f.chain.runGetMethod(f.ownWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);
 assert((await f.chain.getContract(f.migrator)).balance>=500000000000n,'native principal is really present');
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 const replay=await f.admin.send({to:f.migrator,value:400000000n,bounce:true,body:f.body});
 assert(replay.transactions.some(t=>t.description.computePhase?.exitCode===407),'used provision ID cannot be resubmitted after refunds');
}
test('pTON deposited, Jetton first-hop rejects: authentic LP refund unwraps TON; duplicate bounce never credits twice',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.ton);
 const account=await lpAccount(f);const d=(await f.chain.runGetMethod(account,'get_lp_account_data')).stackReader;
 assert(d.readAddress().equals(f.migrator));assert(d.readAddress().equals(f.pool));assert.equal(d.readBigNumber()+d.readBigNumber(),500000000000n);
 // Explicit local gas fault; the real sender wallet rejects before token debit.
 f.token.info.value.coins=20000000n;const failed=await f.chain.sendMessage(f.token);
 assert(failed.transactions.some(t=>t.description.computePhase?.exitCode===709));
 const bounce=failed.transactions.find(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.migrator)).inMessage;
 const before=await balances(f);assert.equal(before.pendingTon,500000000000n);assert.equal(before.pendingTokens,0n);assert.equal(before.initialized,1n);
 await f.chain.sendMessage(bounce);assert.deepEqual(await balances(f),before);
 const r=await recover(f);assert(r.transactions.some(t=>op(t.inMessage)===0x01f3835d&&t.inMessage.info.dest.equals(f.migrator)&&t.description.computePhase?.exitCode===0));
 await expectRecovered(f);
 const refund=r.transactions.find(t=>op(t.inMessage)===0x01f3835d&&t.inMessage.info.dest.equals(f.migrator)).inMessage;
 const old=await balances(f);const duplicate=await f.chain.sendMessage(refund);assert(duplicate.transactions.some(t=>t.description.computePhase?.exitCode===402));assert.deepEqual(await balances(f),old);
});
test('Jettons deposited, frozen pTON rejects: custody recovers but missing token notification cannot clear pending accounting',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.token);
 const c=await f.chain.getContract(f.ptonWallet),original=c.account;
 const state=c.accountState.state;
 c.account={...original,account:{...original.account,storage:{...original.account.storage,state:{type:'frozen',stateHash:BigInt('0x'+beginCell().store(storeStateInit(state)).endCell().hash().toString('hex'))}}}};
 const failed=await f.chain.sendMessage(f.ton);assert(failed.transactions.some(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.migrator)));
 const b=await balances(f);assert.equal(b.ton,500000000000n);assert.equal(b.pendingTokens,200000000000000000n);assert.equal(b.initialized,1n);
 c.account={...c.account,account:{...c.account.account,storage:{...c.account.account.storage,state:original.account.storage.state}}};
 await recover(f);
 assert.equal((await f.chain.runGetMethod(f.ownWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);
 assert.deepEqual(await balances(f),{initialized:1n,ton:500000000000n,tokens:0n,pendingTon:0n,pendingTokens:200000000000000000n});
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('delayed counterpart after first LP refund is recovered by another query without duplicate funding',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.ton);await recover(f);
 assert.equal((await balances(f)).pendingTokens,200000000000000000n,'a missing Jetton leg remains pending');
 const blocked=await f.admin.send({to:f.migrator,value:80000000n,bounce:true,body:beginCell().storeUint(0x414e4c38,32).storeUint(102,64).endCell()});
 assert(blocked.transactions.some(t=>t.description.computePhase?.exitCode===402));
 await f.chain.sendMessage(f.token);await recover(f);
 assert.equal((await f.chain.runGetMethod(f.ownWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);
 assert.equal((await balances(f)).pendingTokens,200000000000000000n,'real zero-forward DEX refund has no authenticated owner notification; finalization stays blocked');
});
test('LP already issued: absent receipts and refund queries cannot restore dispatched principal or finalize graduation',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.token);await f.chain.sendMessage(f.ton);
 const before=await balances(f);await recover(f);assert.deepEqual(await balances(f),before);
 assert.equal(before.pendingTon,500000000000n);assert.equal(before.pendingTokens,200000000000000000n);
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('expired delayed token leg is refunded by real Router code; pTON recovers without fabricating a token receipt',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.ton);f.chain.now+=1801;
 const rejected=await f.chain.sendMessage(f.token);
 assert(rejected.transactions.some(t=>op(t.inMessage)===0x7362d09c&&t.inMessage.info.dest.equals(f.dex)),'actual Router processes the expired payload');
 assert.equal((await f.chain.runGetMethod(f.ownWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n,'expired deposit genuinely returns Jettons to sender custody');
 await recover(f);
 const b=await balances(f);assert.equal(b.ton,500000000000n);assert.equal(b.pendingTon,0n);assert.equal(b.pendingTokens,200000000000000000n);
 const p=(await f.chain.runGetMethod(f.pool,'get_pool_data')).stackReader;p.readBigNumber();p.readAddress();assert.equal(p.readBigNumber(),0n,'no LP is issued for the partial expired deposit');
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('recovery rejects unauthorized callers, underfunding, substituted replies and stale query IDs',async()=>{
 const f=await fixture(),attacker=await f.chain.treasury('recovery-attacker');
 const body=beginCell().storeUint(0x414e4c3c,32).storeUint(1,64).endCell();
 for(const [sender,value,expected]of[[attacker,900000000n,401],[f.admin,10000000n,405]]){
  const r=await sender.send({to:f.migrator,value,bounce:true,body});assert(r.transactions.some(t=>t.description.computePhase?.exitCode===expected));
 }
 // Query nonce is established by a real first transaction. Suppress its
 // outbound children only to inject adversarial replies in local Sandbox.
 await (await f.chain.getContract(f.migrator)).receiveMessage(internal({from:f.admin.address,to:f.migrator,value:900000000n,bounce:true,body}));
 const q=(await f.chain.runGetMethod(f.migrator,'get_migration_recovery')).stackReader;q.readBigNumber();const nonce=q.readBigNumber();
 for(const [from,id,expected]of[[attacker.address,nonce,401],[f.dex,nonce-1n,402]]){
  const r=await f.chain.sendMessage(internal({from,to:f.migrator,value:50000000n,bounce:true,body:beginCell().storeUint(0x2993ade0,32).storeUint(id,64).storeAddress(f.pool).endCell()}));
  assert(r.transactions.some(t=>t.description.computePhase?.exitCode===expected));
 }
});
test('pTON principal credits require exact sender, origin, operation ID and sufficient actual native TON',async()=>{
 const f=await fixture(),before=await balances(f);
 for(const[from,origin,id,value,exit]of[
  [f.ptonWallet,f.dex,101n,50000000n,402],
  [f.ptonWallet,f.dex,102n,500150000000n,402],
  [f.admin.address,f.dex,101n,500150000000n,401],
  [f.ptonWallet,f.admin.address,101n,500150000000n,401]]){
  const body=beginCell().storeUint(0x01f3835d,32).storeUint(id,64).storeCoins(500000000000n).storeAddress(origin).storeBit(false).endCell();
  const r=await f.chain.sendMessage(internal({from,to:f.migrator,value,bounce:true,body}));
  assert(r.transactions.some(t=>t.description.computePhase?.exitCode===exit));assert.deepEqual(await balances(f),before);
 }
});
test('abort handoff obligations survive a frozen sender wallet and failed native Curve delivery without double credits',async()=>{
 const f=await fixture();await f.chain.sendMessage(f.ton);f.token.info.value.coins=20000000n;await f.chain.sendMessage(f.token);await recover(f);await expectRecovered(f);
 const body=beginCell().storeUint(0x414e4c38,32).storeUint(102,64).endCell();
 const underfunded=await f.admin.send({to:f.migrator,value:80000000n,bounce:true,body});assert(underfunded.transactions.some(t=>t.description.computePhase?.exitCode===405));
 const c=await f.chain.getContract(f.ownWallet),original=c.account,st=c.accountState.state;
 c.account={...original,account:{...original.account,storage:{...original.account.storage,state:{type:'frozen',stateHash:BigInt('0x'+beginCell().store(storeStateInit(st)).endCell().hash().toString('hex'))}}}};
 const r=await f.admin.send({to:f.migrator,value:100000000n,bounce:true,body});
 const bounces=r.transactions.filter(t=>t.inMessage?.info.bounced&&t.inMessage.info.dest.equals(f.migrator));assert.equal(bounces.length,2);
 assert.deepEqual(await balances(f),{initialized:0n,ton:500000000000n,tokens:200000000000000000n,pendingTon:0n,pendingTokens:0n});
 for(const t of bounces)await f.chain.sendMessage(t.inMessage);
 c.account={...c.account,account:{...c.account.account,storage:{...c.account.account.storage,state:original.account.storage.state}}};
 await expectRecovered(f);
 const duplicate=await f.admin.send({to:f.migrator,value:100000000n,bounce:true,body});assert(duplicate.transactions.some(t=>t.description.computePhase?.exitCode===407));
});
