'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js'),{createShardAccount}=require('@ton/sandbox'),{setup}=require('./stonfi-snapshot-support');
const pkg=require('../../minter-contract/scripts/migration-package-vnext'),permits=require('../../minter-contract/scripts/vnext-permit'),{beginCell}=core;let compiled;
const exit=(r,a,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(a)&&t.description.computePhase?.exitCode===code);
async function fixture(){
 const chain=await setup();const config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),chain.config);config.set(19,beginCell().storeInt(-3,32).endCell());chain.setConfig(beginCell().storeDictDirect(config).endCell());
 const owner=await chain.treasury('vnext-project-owner'),other=await chain.treasury('vnext-project-other'),keys=crypto.generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const options={creator:owner.address.toRawString(),projectId:'vnext-local-not-deployment',metadata:{name:'VNext local',symbol:'VNX'},operationId:77n,percent:75,duration:'days180',beneficiary:owner.address,unlockedController:other.address,migrationAuthorityPublicKey:publicKey},c=pkg.build(core,options);
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');compiled??=Promise.all(['anlgram-bonding-curve-vnext','anlgram-guard-vnext','anlgram-migration-router-vnext'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);}));const codes=await compiled;for(const [i,n]of ['curve','guard','migration'].entries())assert(codes[i].equals(c.states[n].code));
 for(const [n,init]of Object.entries(c.states))await owner.send({to:c.addresses[n],init,value:100000000n,body:beginCell().endCell()});await owner.send({to:c.vault.address,init:c.vault.init,value:100000000n,body:beginCell().endCell()});
 const send=(to,body,value=100000000n,actor=owner)=>actor.send({to,body,value,bounce:true}),sign=p=>crypto.sign(null,p.digest,keys.privateKey),submit=p=>send(c.addresses.guard,permits.submission(core,c.guard,p,sign(p)),50000000n),request=(p,phase,revoke=false)=>{const m=pkg.request(core,c,p,phase,revoke);return send(m.to,m.body,m.value);};
 return{chain,owner,other,c,options,send,submit,request};
}
async function bootstrap(f){
 assert(exit(await f.send(f.c.addresses.curve,f.c.initCurve),f.c.addresses.curve,0));
 const mint=beginCell().storeUint(0x178d4519,32).storeUint(2,64).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(f.owner.address).storeCoins(60000000n).storeBit(false).endCell();
 await f.send(f.c.addresses.minter,beginCell().storeUint(21,32).storeUint(2,64).storeAddress(f.c.addresses.curve).storeCoins(100000000n).storeRef(mint).endCell(),200000000n);
 await f.send(f.c.addresses.minter,beginCell().storeUint(3,32).storeUint(0x414e4c4752454e4fn,64).storeAddress(null).storeAddress(f.c.addresses.curve).endCell(),50000000n);
 assert.equal((await f.chain.runGetMethod(f.c.addresses.curve,'get_curve_state')).stackReader.readBigNumber(),3n);
}
async function graduate(f){await bootstrap(f);await f.send(f.c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(11,64).storeCoins(1).endCell(),510000000000n);const state=(await f.chain.runGetMethod(f.c.addresses.curve,'get_curve_state')).stack.map(x=>x.value);assert.equal(state[0],4n);assert(state[4]>=500000000000n);
 const start=beginCell().storeUint(0x414e5801,32).storeUint(77,64).storeRef(beginCell().store(core.storeStateInit(f.c.states.guard)).endCell()).endCell();assert(exit(await f.send(f.c.addresses.curve,start),f.c.addresses.curve,0));
 const r=(await f.chain.runGetMethod(f.c.addresses.curve,'get_curve_return_v2',[{type:'int',value:77n}])).stack.map(x=>x.value);assert(r[5]>0n);return{state,epoch:r[5]};
}
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

async function fundedConsumerFixture(){
 const f=await fixture();await bootstrap(f);await f.send(f.c.addresses.migration,f.c.bind,50000000n);
 const wrong=beginCell().storeUint(0x414e4c3b,32).storeUint(77,64).storeAddress(f.other.address).storeAddress(f.c.ptonWallet).endCell();assert(exit(await f.send(f.c.addresses.migration,wrong),f.c.addresses.migration,408));assert(exit(await f.send(f.c.addresses.migration,f.c.walletBinding),f.c.addresses.migration,0));
 // Explicit narrow fixture: canonical asset dispatch remains CLOSED, so only
 // seed funding counters/native balance to test the post-funding consumer.
 // This is not evidence of token custody or successful financial settlement.
 const a=(await f.chain.getContract(f.c.addresses.migration)).accountState.state.data.beginParse(),state=a.loadBit(),curve=a.loadAddress(),guard=a.loadAddress(),dex=a.loadAddress(),assets=a.loadRef().beginParse(),master=assets.loadAddress(),pton=assets.loadAddress();assets.loadCoins();assets.loadCoins();const admin=assets.loadAddress(),wallets=a.loadRef(),flight=a.loadRef().beginParse();flight.loadUintBig(64);flight.loadUintBig(64);flight.loadUint(3);flight.loadMaybeAddress();flight.loadMaybeAddress();
 const inline={parse:s=>s.asCell(),serialize:(v,b)=>b.storeSlice(v.beginParse())},ids=flight.loadDict(core.Dictionary.Keys.BigUint(64),inline),fields=core.Dictionary.empty(core.Dictionary.Keys.Uint(8),core.Dictionary.Values.BigUint(256));
 for(const [i,v]of [[0,500000000000n],[1,200000000000000000n],[2,500000000000n],[3,200000000000000000n],[4,1n],[5,2n],[6,3n]])fields.set(i,v);ids.set(77n+(1n<<63n),beginCell().storeUint(0x4d494733,32).storeDict(fields).storeDict(null).endCell());
 const data=beginCell().storeBit(state).storeAddress(curve).storeAddress(guard).storeAddress(dex).storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(500000000000n).storeCoins(200000000000000000n).storeAddress(admin).endCell()).storeRef(wallets).storeRef(beginCell().storeUint(77,64).storeUint(0,64).storeUint(0,3).storeAddress(null).storeAddress(null).storeDict(ids).endCell()).endCell();
 await f.chain.setShardAccount(f.c.addresses.migration,createShardAccount({address:f.c.addresses.migration,code:f.c.states.migration.code,data,balance:500200000000n}));return f;
}
for(const lost of [false,true])test(`VNext post-funding consumer fixture renews with authenticated safe-phase revocation; lost grant=${lost}; stale execution fails`,async()=>{
 const f=await fundedConsumerFixture(),c=f.c,options={phase:2,nonce:1n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:500000000000n,jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:1n,fundingEpoch:2n,dexEpoch:3n},p=permits.permit(core,c.guard,options);assert(exit(await f.submit(p),c.addresses.guard,0));
 if(lost){const {internal}=require('@ton/sandbox'),{freeze,restore}=require('./refund-receipts-support'),message=pkg.request(core,c,p,'post');let old;
  for await(const t of await f.chain.sendMessageIter(internal({from:f.owner.address,to:message.to,value:message.value,body:message.body}))){if(!old&&t.inMessage?.info.dest?.equals(c.addresses.guard))old=await freeze(f,c.addresses.migration);}
  assert(old);await restore(f,c.addresses.migration,old);assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stackReader.readBigNumber(),0n);
 }else{assert(exit(await f.request(p,'post'),c.addresses.migration,0));assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stackReader.readBigNumber(),1n);const execution=pkg.execute(core,c,p);assert(exit(await f.send(execution.to,execution.body,execution.value),execution.to,414));}
 f.chain.now=options.deadline;assert(exit(await f.request(p,'post',true),c.addresses.guard,0));const next=permits.permit(core,c.guard,{...options,nonce:2n,starts:f.chain.now,deadline:f.chain.now+60});assert(exit(await f.submit(next),c.addresses.guard,0));assert(exit(await f.request(next,'post'),c.addresses.migration,0));
 const oldExec=pkg.execute(core,c,p),newExec=pkg.execute(core,c,next);assert(exit(await f.send(oldExec.to,oldExec.body,oldExec.value),oldExec.to,409));assert(exit(await f.send(newExec.to,newExec.body,newExec.value),newExec.to,414));assert((await f.chain.getContract(c.addresses.migration)).balance>=500000000000n);
});
