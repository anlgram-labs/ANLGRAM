'use strict';
// Source-compiled Locker/Curve plus captured foreign bytecode in local Sandbox.
// These tests refute unsafe recovery prescriptions; they authorize no payout.
const test=require('node:test'),assert=require('node:assert/strict'),core=require('@ton/core');
const {internal}=require('@ton/sandbox'),{beginCell}=core;
const {fixture}=require('./stonfi-locker-v2-support');
const {freeze,restore}=require('./refund-receipts-support');
const failed=(r,a,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(a)&&t.description.computePhase?.exitCode===code);
const walletFor=async(f,owner)=>(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(owner).endCell()}])).stackReader.readAddress();
const balance=async(f,a)=>(await f.chain.runGetMethod(a,'get_wallet_data')).stackReader.readBigNumber();
const lock=async f=>{const s=await f.read();return Array.from({length:8},()=>s.readBigNumber());};
const claim=(f,q,amount,locked,actor)=>actor.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(q,64).storeBit(locked).storeCoins(amount).endCell()});
const transfer=(to,q,amount,response)=>beginCell().storeUint(0x0f8a7ea5,32).storeUint(q,64).storeCoins(amount).storeAddress(to).storeAddress(response).storeBit(false).storeCoins(0).storeBit(false).endCell();

for(const percent of [50,100])for(const duration of ['permanent','days180','days365'])test(`lost first notification ${percent}%/${duration}: a probe never invents exact custody; delayed authentic mint is credited once`,async()=>{
 const f=await fixture(percent,duration),old=await freeze(f,f.vault.address),rows=[];
 for(const m of f.deposit.messages)rows.push(...(await f.owner.send({...m,bounce:true})).transactions);
 await restore(f,f.vault.address,old);const actual=await balance(f,f.vault.lpWallet),initial=await lock(f);assert(actual>1n);assert.equal(initial[3],0n);
 const probe=await f.owner.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5636,32).storeUint(77,64).storeCoins(actual/2n).endCell()});
 if(percent===100&&duration==='permanent')assert.equal((await f.chain.runGetMethod(f.vault.address,'get_lp_recovery_v4')).stackReader.readBigNumber(),2n);
 else assert(failed(probe,f.vault.address,409));
 assert.equal((await lock(f))[3],0n);assert.equal(await balance(f,f.vault.lpWallet),actual);
 const notification=rows.find(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x7362d09c).inMessage;
 f.chain.now+=3600;await f.chain.sendMessage(notification);const settled=await lock(f);assert.equal(settled[3],actual);assert.equal(settled[4],(actual*BigInt(percent)+99n)/100n);assert.equal(settled[4]+settled[5],actual);
 if(duration!=='permanent')assert(settled[2]>=BigInt(f.chain.now)+(duration==='days180'?15552000n:31536000n));
 await f.chain.sendMessage(notification);assert.deepEqual(await lock(f),settled);
});

test('two successful LP withdrawals plus later real returned transfers satisfy the proposed balance inequality without proving either claim failed',async()=>{
 const f=await fixture(50,'days180');for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});let s=await lock(f);f.chain.now=Number(s[2]);const a=s[4],b=s[5];
 await claim(f,1n,a,true,f.owner);await claim(f,2n,b,false,f.other);
 const beneficiary=await walletFor(f,f.owner.address),controller=await walletFor(f,f.other.address);assert.equal(await balance(f,beneficiary),a);assert.equal(await balance(f,controller),b);
 s=await lock(f);assert.equal(s[6],a+b);assert.equal(await balance(f,f.vault.lpWallet),0n);
 // Both claims already delivered. These later independent transfers cannot
 // turn delivery into failure, even when they recreate the original balance.
 for(const [actor,w,amount]of [[f.owner,beneficiary,a],[f.other,controller,b]])await actor.send({to:w,value:150000000n,body:transfer(f.vault.address,991n,amount,actor.address)});
 f.chain.now+=3601;s=await lock(f);assert((await balance(f,f.vault.lpWallet))>=s[4]+s[5]+s[6]);assert.equal(s[6],a+b);
 for(const [q,amount]of [[1n,a],[2n,b]])assert.equal((await f.chain.runGetMethod(f.vault.address,'get_claim_v2',[{type:'int',value:q}])).stackReader.readBigNumber(),amount);
 const probe=await f.owner.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5636,32).storeUint(77,64).storeCoins(a+b).endCell()});assert(failed(probe,f.vault.address,409));assert.equal((await lock(f))[6],a+b);
});

test('wallet balance below the pending floor can mean a still-queued recipient transfer, not successful final delivery',async()=>{
 const f=await fixture(100,'days180');for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});const s=await lock(f);f.chain.now=Number(s[2]);const amount=s[4];
 const first=await(await f.chain.getContract(f.vault.address)).receiveMessage(internal({from:f.owner.address,to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(amount).endCell()}));
 const request=[...first.outMessages.values()].find(m=>m.info.dest.equals(f.vault.lpWallet));assert(request);
 const sent=await(await f.chain.getContract(f.vault.lpWallet)).receiveMessage(request),recipient=await walletFor(f,f.owner.address),held=[...sent.outMessages.values()].find(m=>m.info.dest.equals(recipient));assert(held);
 assert.equal(await balance(f,f.vault.lpWallet),0n);assert.equal((await lock(f))[6],amount);assert.notEqual((await f.chain.getContract(recipient)).accountState?.type,'active');
 f.chain.now+=3601;assert.equal((await lock(f))[6],amount,'timeout never clears the still-queued claim');await f.chain.sendMessage(held);assert.equal(await balance(f,recipient),amount);assert.equal((await lock(f))[6],amount,'actual delivery still needs a contract-consumable receipt');
});

test('VNext actual buy/sell and failed burn routing demonstrate burn debit is not atomic destruction or TON payout evidence',async()=>{
 const {fixture:project,bootstrap,exit}=require('./vnext-package-support'),f=await project(),c=f.c;await bootstrap(f);
 const own=core.contractAddress(0,{code:c.wallet,data:beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});
 await f.send(c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(101,64).storeCoins(1).endCell(),1000000000n);
 const tokens=await balance(f,own);assert(tokens>0n);const part=tokens/2n;
 const sold=await f.send(own,beginCell().storeUint(0x0f8a7ea5,32).storeUint(102,64).storeCoins(part).storeAddress(c.addresses.curve).storeAddress(f.owner.address).storeBit(false).storeCoins(60000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell(),150000000n);assert(exit(sold,c.addresses.curve,0));assert.equal(await balance(f,own),tokens-part);
 const remaining=tokens-part,supply=(await f.chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader.readBigNumber(),curveBefore=(await f.chain.getContract(c.addresses.curve)).balance,old=await freeze(f,c.addresses.minter);
 const burn=await(await f.chain.getContract(own)).receiveMessage(internal({from:f.owner.address,to:own,value:150000000n,body:beginCell().storeUint(0x595f07bc,32).storeUint(103,64).storeCoins(remaining).storeAddress(f.owner.address).endCell()}));assert(!burn.description.aborted);assert.equal(await balance(f,own),0n);
 const notification=[...burn.outMessages.values()].find(m=>m.info.dest.equals(c.addresses.minter));assert(notification);await f.chain.sendMessage(notification);assert.equal(await balance(f,own),remaining,'genuine bounced burn restores tokens after the intermediate debit');
 await restore(f,c.addresses.minter,old);assert.equal((await f.chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader.readBigNumber(),supply);assert.equal((await f.chain.getContract(c.addresses.curve)).balance,curveBefore);
 const gate=(await f.chain.runGetMethod(c.addresses.curve,'get_emergency_recovery_vnext')).stackReader;gate.readBigNumber();assert.equal(gate.readBigNumber(),0n);
});
