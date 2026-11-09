'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js'),{setup}=require('./stonfi-snapshot-support');
const pkg=require('../../minter-contract/scripts/migration-package-dispatch-v2'),permits=require('../../minter-contract/scripts/vnext-permit'),{beginCell}=core;let compiled;
const exit=(r,a,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(a)&&t.description.computePhase?.exitCode===code&&(code!==0||(!t.description.aborted&&t.description.actionPhase?.success!==false)));
async function fixture(settings={}){
 const chain=await setup();const config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),chain.config);config.set(19,beginCell().storeInt(-3,32).endCell());chain.setConfig(beginCell().storeDictDirect(config).endCell());
 const owner=await chain.treasury('vnext-project-owner'),other=await chain.treasury('vnext-project-other'),keys=crypto.generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const options={creator:owner.address.toRawString(),projectId:settings.projectId??'one-shot-local-no-deployment',metadata:{name:'VNext local',symbol:'VNX'},operationId:77n,percent:settings.percent??100,duration:settings.duration??'permanent',beneficiary:owner.address,unlockedController:other.address,migrationAuthorityPublicKey:publicKey},c=pkg.build(core,options);
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');compiled??=Promise.all(['anlgram-bonding-curve-dispatch-v2','anlgram-guard-vnext','anlgram-migration-router-dispatch-v2'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);}));const codes=await compiled;for(const [i,n]of ['curve','guard','migration'].entries())assert(codes[i].equals(c.states[n].code));
 const {launchpadGenesisOperations}=await import('../../testnet-interface/projects/launchpad-gen2-operations.mjs');
 for(const {message} of launchpadGenesisOperations(c,core).slice(0,5)){
  const to=core.Address.parse(message.address),init=core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse());
  const deployed=await owner.send({to,init,value:BigInt(message.amount),body:core.Cell.fromBase64(message.payload),bounce:true});
  assert(exit(deployed,to,0));
 }
 const transactions=[],send=async(to,body,value=100000000n,actor=owner)=>{const r=await actor.send({to,body,value,bounce:true});transactions.push(...r.transactions);return r;},sign=p=>crypto.sign(null,p.digest,keys.privateKey),submit=p=>send(c.addresses.guard,permits.submission(core,c.guard,p,sign(p)),50000000n),request=(p,phase,revoke=false)=>{const m=pkg.request(core,c,p,phase,revoke);return send(m.to,m.body,m.value);};
 return{chain,owner,other,c,options,send,submit,request,transactions};
}

async function ready(settings={}){
 const f=await fixture(settings),c=f.c;await require('./vnext-package-support').bootstrap(f);
 // Real small trade roundtrip before graduating; exact source wallet delivery.
 await f.send(c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(101,64).storeCoins(1).endCell(),1000000000n);
 const buyer=core.contractAddress(0,{code:c.wallet,data:beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()}),bought=(await f.chain.runGetMethod(buyer,'get_wallet_data')).stackReader.readBigNumber();
 const sold=await f.send(buyer,beginCell().storeUint(0x0f8a7ea5,32).storeUint(102,64).storeCoins(bought/2n).storeAddress(c.addresses.curve).storeAddress(f.owner.address).storeBit(false).storeCoins(60000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell(),150000000n);assert(exit(sold,c.addresses.curve,0));
 await f.send(c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(103,64).storeCoins(1).endCell(),510000000000n);
 const state=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_state')).stack.map(x=>x.value);assert.equal(state[0],4n);assert(state[4]>=300000000000n);
 assert(exit(await f.send(c.addresses.migration,c.bind,50000000n),c.addresses.migration,0));assert(exit(await f.send(c.addresses.migration,c.walletBinding),c.addresses.migration,0));
 await f.send(c.addresses.curve,beginCell().storeUint(0x414e5801,32).storeUint(77,64).storeRef(beginCell().store(core.storeStateInit(c.states.guard)).endCell()).endCell());
 const prime=await f.send(c.addresses.curve,beginCell().storeUint(0x414e5802,32).storeUint(77,64).endCell(),180000000n);assert(exit(prime,c.addresses.migration,0));
 const life=async()=>(await f.chain.runGetMethod(c.addresses.migration,'get_migration_lifecycle',[{type:'int',value:77n}])).stack.map(x=>x.value);
 const stage=async()=>(await f.chain.runGetMethod(c.addresses.migration,'get_dispatch_state')).stack.map(x=>x.value);
 const fields=await life();assert(fields[4]>0n&&fields[5]>0n&&fields[6]>0n);
 const make=(phase,minimum=100n)=>permits.permit(core,c.guard,{phase,nonce:1n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:fields[0],jettonUnits:200000000000000000n,minimumLpUnits:minimum,curveEpoch:fields[4],fundingEpoch:phase===1?0n:fields[5],dexEpoch:phase===1?0n:fields[6]});
 const pre=make(1);assert(exit(await f.submit(pre),c.addresses.guard,0));assert(exit(await f.request(pre,'pre'),c.addresses.curve,0));
 const dispatch=()=>beginCell().storeUint(0x414e5803,32).storeUint(77,64).storeUint(pre.nonce,64).storeBuffer(pre.digest).endCell();
 const sync=()=>f.send(c.addresses.migration,beginCell().storeUint(0x414e5903,32).storeUint(77,64).endCell(),80000000n);
 const fund=async()=>{const r=await f.send(c.addresses.curve,dispatch(),250000000n);assert(exit(r,c.addresses.curve,0));await sync();return r;};
 const authorize=async(minimum=100n)=>{const p=make(2,minimum);assert(exit(await f.submit(p),c.addresses.guard,0));assert(exit(await f.request(p,'post'),c.addresses.migration,0));return p;};
 const execute=p=>{const m=pkg.execute(core,c,p);return f.send(m.to,m.body,m.value);};
 return{...f,life,stage,pre,dispatch,sync,fund,authorize,execute,buyer};
}
module.exports={fixture,ready,exit};
