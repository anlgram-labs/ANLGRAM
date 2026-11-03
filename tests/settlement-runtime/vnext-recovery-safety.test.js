'use strict';
// Source-compiled VNext consumers; explicitly SEEDED post-dispatch/funding state.
// Actual captured DEX execution below is not a canonical Curve dispatch or live evidence.
const test=require('node:test'),assert=require('node:assert/strict'),core=require('@ton/core');
const {internal,createShardAccount}=require('@ton/sandbox'),{beginCell,contractAddress}=core;
const {fundedConsumerFixture,exit}=require('./vnext-package-support');
const wire=require('../../minter-contract/scripts/stonfi-lp-v2-wire'),ston=require('../../minter-contract/scripts/stonfi-v22-addresses');
const op=t=>t?.inMessage?.body?.bits.length>=32?t.inMessage.body.beginParse().loadUint(32):0;
const request=(code=0x414e5c10,q=77n)=>beginCell().storeUint(code,32).storeUint(q,64).endCell();
async function fixture(){
 const f=await fundedConsumerFixture({dispatched:true}),c=f.c;
 const data=n=>beginCell().storeCoins(n).storeAddress(c.addresses.migration).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell();
 const own=contractAddress(0,{code:c.wallet,data:data(0n)});
 await f.chain.setShardAccount(own,createShardAccount({address:own,code:c.wallet,data:data(200000000000000000n),balance:100000000n}));
 const deposit=wire.build(core,{owner:c.addresses.migration,router:c.dex,vault:c.vault.address,tokenWallet:own,routerTokenWallet:c.routerTokenWallet,ptonWallet:c.ptonWallet,operationId:77n,tokenUnits:200000000000000000n,tonNano:500000000000n,deadline:f.chain.now+1800,minimumLpUnits:1n});
 const leg=i=>f.chain.sendMessage(internal({from:c.addresses.migration,...deposit.messages[i],bounce:true}));
 const read=async()=>(await f.chain.runGetMethod(c.addresses.migration,'get_recovery_observation_vnext')).stack.map(x=>x.value);
 const pending=async()=>{const r=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_extended_data')).stackReader;r.readBigNumber();for(let i=0;i<3;i++)r.readAddress();return[r.readBigNumber(),r.readBigNumber()];};
 return{...f,own,deposit,leg,read,pending};
}
test('VNext observes authentic token-only LPAccount with exact deterministic identities, but cannot automatically cancel a delayed counterpart',async()=>{
 const f=await fixture(),c=f.c;await f.leg(0);const before=await f.pending();
 const r=await f.send(c.addresses.migration,request(),150000000n);assert(exit(r,c.addresses.migration,0));
 const s=await f.read();assert.equal(s[0],77n);assert.equal(s[2],4n);assert.equal(s[3],200000000000000000n);assert.equal(s[4],0n);assert(s[5]>0n);assert.equal(s[6],0n);assert.equal(s[7],0n);
 assert(!r.transactions.some(t=>op(t)===0x132b9a2c));assert.deepEqual(await f.pending(),before);
 const expected=ston.derive(core,c.dex,c.routerTokenWallet,c.ptonWallet,c.addresses.migration).pool;
 const account=(await f.chain.runGetMethod(expected,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(c.addresses.migration).endCell()}])).stackReader.readAddress();
 const callback=r.transactions.find(t=>op(t)===0x24cfc100&&t.inMessage.info.dest.equals(c.addresses.migration));assert(callback.inMessage.info.src.equals(account));
 const again=await f.send(c.addresses.migration,request(),150000000n);assert(!again.transactions.some(t=>op(t)===0x132b9a2c));assert.deepEqual(await f.read(),s);
 assert(exit(await f.send(c.addresses.migration,request(0x414e4c3c),900000000n),c.addresses.migration,414));
 // Delayed genuine second leg still mints LP: observing the first held leg
 // had NOT proved cancellation, finality or a quiescent deposit graph.
 await f.leg(1);const lp=(await f.chain.runGetMethod(c.vault.lpWallet,'get_wallet_data')).stackReader.readBigNumber();assert(lp>0n);assert.deepEqual(await f.pending(),before);
 assert.equal((await f.read())[7],0n);assert.equal((await f.chain.runGetMethod(c.vault.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
});
test('VNext read-only recovery rejects wrong root, unauthorized/underfunded calls, absent DEX dispatch, and substituted replies; funded retries keep correlation',async()=>{
 const f=await fixture(),c=f.c;await f.leg(0);
 for(const [body,value,actor,code]of [[request(0x414e5c10,78n),150000000n,f.owner,409],[request(),150000000n,f.other,401],[request(),10000000n,f.owner,407]])assert(exit(await f.send(c.addresses.migration,body,value,actor),c.addresses.migration,code));
 // Deliver only the authentic request transaction; its child query is held
 // locally so controlled malicious callback messages can be checked.
 const tx=await(await f.chain.getContract(c.addresses.migration)).receiveMessage(internal({from:f.owner.address,to:c.addresses.migration,value:150000000n,body:request()}));assert(!tx.description.aborted);const s=await f.read(),nonce=s[1];assert.equal(s[2],1n);
 for(const [from,q,address,code]of [[f.other.address,nonce,c.vault.pool,401],[c.dex,nonce+1n,c.vault.pool,409],[c.dex,nonce,f.other.address,408]]){
  const r=await f.chain.sendMessage(internal({from,to:c.addresses.migration,value:50000000n,body:beginCell().storeUint(0x2993ade0,32).storeUint(q,64).storeAddress(address).endCell()}));assert(exit(r,c.addresses.migration,code));
 }
 // Narrow injected counterparty callbacks test each identity boundary. They
 // are not financial receipts; only actual LPAccount query routing ends below.
 const receive=body=>(f.chain.getContract(c.addresses.migration)).then(x=>x.receiveMessage(body));
 const pool=ston.derive(core,c.dex,c.routerTokenWallet,c.ptonWallet,c.addresses.migration).pool;
 const account=(await f.chain.runGetMethod(pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(c.addresses.migration).endCell()}])).stackReader.readAddress();
 await receive(internal({from:c.dex,to:c.addresses.migration,value:100000000n,body:beginCell().storeUint(0x2993ade0,32).storeUint(nonce,64).storeAddress(pool).endCell()}));
 const badAccount=await f.chain.sendMessage(internal({from:pool,to:c.addresses.migration,value:50000000n,body:beginCell().storeUint(0x15fbca95,32).storeUint(nonce,64).storeAddress(f.other.address).endCell()}));
 assert(exit(badAccount,c.addresses.migration,408));
 const valid=await receive(internal({from:pool,to:c.addresses.migration,value:100000000n,body:beginCell().storeUint(0x15fbca95,32).storeUint(nonce,64).storeAddress(account).endCell()}));assert(!valid.description.aborted);
 const wrongOwner=await f.chain.sendMessage(internal({from:account,to:c.addresses.migration,value:50000000n,body:beginCell().storeUint(0x24cfc100,32).storeUint(nonce,64).storeAddress(f.other.address).storeAddress(pool).storeCoins(0).storeCoins(0).endCell()}));assert(exit(wrongOwner,c.addresses.migration,408));
 const r=await f.send(c.addresses.migration,request(),150000000n);assert(exit(r,c.addresses.migration,0));const after=await f.read();assert.equal(after[1],nonce);assert.equal(after[2],4n);
 const stale=await f.chain.sendMessage(internal({from:c.dex,to:c.addresses.migration,value:50000000n,body:beginCell().storeUint(0x2993ade0,32).storeUint(nonce,64).storeAddress(c.vault.pool).endCell()}));assert(exit(stale,c.addresses.migration,409));assert.deepEqual(await f.read(),after);
 const g=await fundedConsumerFixture();assert(exit(await g.send(g.c.addresses.migration,request(),150000000n),g.c.addresses.migration,409));
});
test('lost LPAccount observation remains unknown; funded same-nonce retry queries restored foreign code without refunding or overwriting obligations',async()=>{
 const f=await fixture(),c=f.c;await f.leg(0);const {freeze,restore}=require('./refund-receipts-support');
 const account=(await f.chain.runGetMethod(c.vault.pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(c.addresses.migration).endCell()}])).stackReader.readAddress(),old=await freeze(f,account),before=await f.pending();
 await f.send(c.addresses.migration,request(),150000000n);const unresolved=await f.read();assert.equal(unresolved[2],3n);assert.equal(unresolved[5],0n);assert.equal(unresolved[7],0n);
 await f.send(c.addresses.migration,request(),150000000n);assert.equal((await f.read())[1],unresolved[1]);assert.deepEqual(await f.pending(),before);
 await restore(f,account,old);const r=await f.send(c.addresses.migration,request(),150000000n);const result=await f.read();assert.equal(result[1],unresolved[1]);assert.equal(result[2],4n);assert.equal(result[3],200000000000000000n);assert.equal(result[7],0n);assert.deepEqual(await f.pending(),before);assert(!r.transactions.some(t=>op(t)===0x132b9a2c));
});
