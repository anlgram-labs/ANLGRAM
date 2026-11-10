'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('@ton/core');
const {beginCell}=core,{createShardAccount}=require('@ton/sandbox');
const pkg=require('../../minter-contract/scripts/migration-package-vnext'),permits=require('../../minter-contract/scripts/vnext-permit');
const {fixture,graduate,fundedConsumerFixture,exit}=require('./vnext-package-support');
test('coordinated VNext fresh genesis authenticates real500TON graduation and signed pre-dispatch grant, renews safely, but never releases assets',async()=>{
 const f=await fixture(),{state,epoch}=await graduate(f),c=f.c;
 const wrongRoot=beginCell().storeUint(0x414e5801,32).storeUint(78,64).storeRef(beginCell().store(core.storeStateInit(c.states.guard)).endCell()).endCell();assert(exit(await f.send(c.addresses.curve,wrongRoot),c.addresses.curve,409));
 let p=permits.permit(core,c.guard,{phase:1,nonce:1n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:state[4],jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:epoch,fundingEpoch:0n,dexEpoch:0n});assert(exit(await f.submit(p),c.addresses.guard,0));assert(exit(await f.request(p,'pre'),c.addresses.curve,0));
 let auth=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_permit_vnext',[{type:'int',value:77n}])).stack.map(x=>x.value);assert.equal(auth[0],1n);assert.equal(auth[4],1n);assert.equal(auth[5],0n);
 const dispatch=p=>beginCell().storeUint(0x414e5803,32).storeUint(77,64).storeUint(p.nonce,64).storeBuffer(p.digest).endCell();assert(exit(await f.send(c.addresses.curve,dispatch(p),250000000n),c.addresses.curve,414));
 const prior=p;f.chain.now+=60;assert(exit(await f.send(c.addresses.curve,dispatch(prior),250000000n),c.addresses.curve,409));assert(exit(await f.request(prior,'pre',true),c.addresses.guard,0));
 p=permits.permit(core,c.guard,{phase:1,nonce:2n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:state[4],jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:epoch,fundingEpoch:0n,dexEpoch:0n});assert(exit(await f.submit(p),c.addresses.guard,0));assert(exit(await f.request(p,'pre'),c.addresses.curve,0));assert(exit(await f.send(c.addresses.curve,dispatch(prior),250000000n),c.addresses.curve,409));assert(exit(await f.send(c.addresses.curve,dispatch(p),250000000n),c.addresses.curve,414));
 const after=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_state')).stack.map(x=>x.value);assert.equal(after[4],state[4]);assert.equal(after[6],state[6]);const recovery=(await f.chain.runGetMethod(c.addresses.curve,'get_emergency_recovery_vnext')).stackReader;recovery.readBigNumber();assert.equal(recovery.readBigNumber(),0n);
});
test('VNext deployment graph rejects wrong public authority/genesis binding and enforces immutable1% fee instead of rewriting it',async()=>{
 const f=await fixture();const other=pkg.build(core,{...f.options,migrationAuthorityPublicKey:'33'.repeat(32)});assert(!other.addresses.guard.equals(f.c.addresses.guard));assert(!other.addresses.migration.equals(f.c.addresses.migration));assert.throws(()=>pkg.build(core,{...f.options,migrationAuthorityPublicKey:undefined}));
 const body=f.c.initCurve.beginParse(),wrong=beginCell().storeBits(body.loadBits(body.remainingBits)).storeRef(body.loadRef()).storeRef(body.loadRef()).storeRef(body.loadRef()).storeRef(beginCell().store(core.storeStateInit(other.states.guard)).endCell()).endCell();assert(exit(await f.send(f.c.addresses.curve,wrong),f.c.addresses.curve,408));
 const old=f.c.states.curve.data.beginParse(),data=beginCell().storeUint(old.loadUint(8),8).storeUint(101,16);old.loadUint(16);while(old.remainingRefs)data.storeRef(old.loadRef());await f.chain.setShardAccount(f.c.addresses.curve,createShardAccount({address:f.c.addresses.curve,code:f.c.states.curve.code,data:data.endCell(),balance:100000000n}));await assert.rejects(()=>f.chain.runGetMethod(f.c.addresses.curve,'get_curve_state'));
});
test('VNext one-time binding can be recovered by an authenticated funded query after the initial Guard message fails',async()=>{
 const f=await fixture(),{freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,f.c.addresses.guard);assert(exit(await f.send(f.c.addresses.curve,f.c.initCurve),f.c.addresses.curve,0));await restore(f,f.c.addresses.guard,old);
 assert.equal((await f.chain.runGetMethod(f.c.addresses.guard,'get_binding_vnext')).stackReader.readAddressOpt(),null);
 const retry=beginCell().storeUint(0x414e5b21,32).storeUint(77,64).storeRef(beginCell().store(core.storeStateInit(f.c.states.migration)).endCell()).endCell();assert(exit(await f.send(f.c.addresses.curve,retry,80000000n,f.other),f.c.addresses.curve,401));
 assert(exit(await f.send(f.c.addresses.curve,retry,80000000n),f.c.addresses.guard,0));let binding=(await f.chain.runGetMethod(f.c.addresses.guard,'get_binding_vnext')).stackReader;assert(binding.readAddress().equals(f.c.addresses.migration));const hash=binding.readBigNumber();
 assert(exit(await f.send(f.c.addresses.curve,retry,80000000n),f.c.addresses.guard,0));binding=(await f.chain.runGetMethod(f.c.addresses.guard,'get_binding_vnext')).stackReader;binding.readAddress();assert.equal(binding.readBigNumber(),hash);
});

for(const lost of [false,true])test(`VNext post-funding consumer fixture renews with authenticated safe-phase revocation; lost grant=${lost}; stale execution fails`,async()=>{
 const f=await fundedConsumerFixture(),c=f.c,options={phase:2,nonce:1n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:300000000000n,jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:1n,fundingEpoch:2n,dexEpoch:3n},p=permits.permit(core,c.guard,options);assert(exit(await f.submit(p),c.addresses.guard,0));
 if(lost){const {internal}=require('@ton/sandbox'),{freeze,restore}=require('./refund-receipts-support'),message=pkg.request(core,c,p,'post');let old;
  for await(const t of await f.chain.sendMessageIter(internal({from:f.owner.address,to:message.to,value:message.value,body:message.body}))){if(!old&&t.inMessage?.info.dest?.equals(c.addresses.guard))old=await freeze(f,c.addresses.migration);}
  assert(old);await restore(f,c.addresses.migration,old);assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stackReader.readBigNumber(),0n);
 }else{assert(exit(await f.request(p,'post'),c.addresses.migration,0));assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stackReader.readBigNumber(),1n);const execution=pkg.execute(core,c,p);assert(exit(await f.send(execution.to,execution.body,execution.value),execution.to,414));}
 f.chain.now=options.deadline;assert(exit(await f.request(p,'post',true),c.addresses.guard,0));const next=permits.permit(core,c.guard,{...options,nonce:2n,starts:f.chain.now,deadline:f.chain.now+60});assert(exit(await f.submit(next),c.addresses.guard,0));assert(exit(await f.request(next,'post'),c.addresses.migration,0));
 const oldExec=pkg.execute(core,c,p),newExec=pkg.execute(core,c,next);assert(exit(await f.send(oldExec.to,oldExec.body,oldExec.value),oldExec.to,409));assert(exit(await f.send(newExec.to,newExec.body,newExec.value),newExec.to,414));assert((await f.chain.getContract(c.addresses.migration)).balance>=300000000000n);
});
