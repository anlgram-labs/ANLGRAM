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
async function fundedConsumerFixture({dispatched=false}={}){
 const f=await fixture();await bootstrap(f);await f.send(f.c.addresses.migration,f.c.bind,50000000n);
 const wrong=beginCell().storeUint(0x414e4c3b,32).storeUint(77,64).storeAddress(f.other.address).storeAddress(f.c.ptonWallet).endCell();assert(exit(await f.send(f.c.addresses.migration,wrong),f.c.addresses.migration,408));assert(exit(await f.send(f.c.addresses.migration,f.c.walletBinding),f.c.addresses.migration,0));
 // Explicit narrow fixture: canonical asset dispatch remains CLOSED, so only
 // seed funding counters/native balance to test the post-funding consumer.
 // This is not evidence of token custody or successful financial settlement.
 const a=(await f.chain.getContract(f.c.addresses.migration)).accountState.state.data.beginParse(),state=a.loadBit(),curve=a.loadAddress(),guard=a.loadAddress(),dex=a.loadAddress(),assets=a.loadRef().beginParse(),master=assets.loadAddress(),pton=assets.loadAddress();assets.loadCoins();assets.loadCoins();const admin=assets.loadAddress(),walletCell=a.loadRef(),wc=walletCell.beginParse(),wl=wc.loadMaybeAddress(),wp=wc.loadMaybeAddress();wc.loadCoins();wc.loadCoins();const wallets=beginCell().storeAddress(wl).storeAddress(wp).storeCoins(dispatched?500000000000n:0n).storeCoins(dispatched?200000000000000000n:0n).storeRef(wc.loadRef()).endCell(),flight=a.loadRef().beginParse();flight.loadUintBig(64);flight.loadUintBig(64);flight.loadUint(3);flight.loadMaybeAddress();flight.loadMaybeAddress();
 const inline={parse:s=>s.asCell(),serialize:(v,b)=>b.storeSlice(v.beginParse())},ids=flight.loadDict(core.Dictionary.Keys.BigUint(64),inline),fields=core.Dictionary.empty(core.Dictionary.Keys.Uint(8),core.Dictionary.Values.BigUint(256));
 for(const [i,v]of [[0,500000000000n],[1,200000000000000000n],[2,500000000000n],[3,200000000000000000n],[4,1n],[5,2n],[6,3n],[11,dispatched?1n:0n]])fields.set(i,v);ids.set(77n+(1n<<63n),beginCell().storeUint(0x4d494733,32).storeDict(fields).storeDict(null).endCell());
 const data=beginCell().storeBit(state).storeAddress(curve).storeAddress(guard).storeAddress(dex).storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(dispatched?0n:500000000000n).storeCoins(dispatched?0n:200000000000000000n).storeAddress(admin).endCell()).storeRef(wallets).storeRef(beginCell().storeUint(77,64).storeUint(0,64).storeUint(0,3).storeAddress(null).storeAddress(null).storeDict(ids).endCell()).endCell();
 await f.chain.setShardAccount(f.c.addresses.migration,createShardAccount({address:f.c.addresses.migration,code:f.c.states.migration.code,data,balance:dispatched?200000000n:500200000000n}));return f;
}
module.exports={fixture,bootstrap,graduate,fundedConsumerFixture,exit};
