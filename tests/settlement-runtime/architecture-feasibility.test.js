'use strict';
// Compatibility evidence only. The direct source messages / bound-discovery
// state are narrow local fixtures, NOT an executed external authorization.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{Blockchain,createShardAccount,internal}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const pkg=require('../../minter-contract/scripts/migration-package-v2'),ston=require('../../minter-contract/scripts/stonfi-v22-addresses');
const {beginCell}=core;let compiled;
async function fixture(){
 const chain=await Blockchain.create();chain.now=1800000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};const owner=await chain.treasury('architecture-owner');
 const c=pkg.build(core,{creator:owner.address.toRawString(),projectId:'architecture-evidence-only',metadata:{name:'Architecture',symbol:'ARCH'},operationId:77n});
 const dir=path.resolve(__dirname,'../../minter-contract/contracts'),code=await(compiled??=(async()=>{const r=await compileFunc({targets:['anlgram-lp-auth-guard.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);})());assert(code.equals(c.states.guard.code));
 await owner.send({to:c.addresses.guard,value:100000000n,init:c.states.guard,body:beginCell().endCell()});return{chain,owner,c,code};
}
test('Guard feasibility: exact compiled guard always returns denial and has no V2 registration producer',async()=>{
 const f=await fixture(),r=await f.chain.sendMessage(internal({from:f.c.addresses.curve,to:f.c.addresses.guard,value:50000000n,bounce:true,body:beginCell().storeUint(0x414e5701,32).storeUint(77,64).endCell()}));
 const guardTx=r.transactions.find(t=>t.inMessage?.info.dest?.equals(f.c.addresses.guard));assert.equal(guardTx.description.computePhase.exitCode,0);
 const messages=Array.from(guardTx.outMessages.values()),response=messages.find(m=>m.info.dest?.equals(f.c.addresses.curve)&&m.body.beginParse().loadUint(32)===0x414e5702);assert(response);const s=response.body.beginParse();s.loadUint(32);assert.equal(s.loadUintBig(64),77n);assert.equal(s.loadBit(),false);s.endParse();assert(!messages.some(m=>m.body.bits.length>=32&&m.body.beginParse().loadUint(32)===0x414e5a03));
 assert.equal((await f.chain.runGetMethod(f.c.addresses.guard,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 const pin=fs.readFileSync(path.resolve(__dirname,'../../minter-contract/contracts/imports/lp-auth-guard-code.fc'),'utf8');assert(pin.includes(f.code.hash().toString('hex')));
});
test('Guard feasibility: legacy registration rejects the exact current Migrator V2 StateInit even with bound address discovery',async()=>{
 const f=await fixture(),gen=f.c.states.guard.data.beginParse();gen.loadUint(8);gen.loadUintBig(64);const cfg=gen.loadRef(),derived=ston.derive(core,f.c.dex,f.c.routerTokenWallet,f.c.ptonWallet,f.c.addresses.guard);
 // Seed only discovered endpoint state to isolate genesis registration, without
 // rerunning the existing discovery suite or claiming source/build finality.
 await f.chain.setShardAccount(f.c.addresses.guard,createShardAccount({address:f.c.addresses.guard,code:f.code,balance:100000000n,data:beginCell().storeUint(5,8).storeUint(123,64).storeRef(cfg).storeRef(beginCell().storeAddress(f.c.routerTokenWallet).storeAddress(f.c.ptonWallet).endCell()).storeRef(beginCell().storeAddress(derived.pool).storeAddress(derived.lpWallet).endCell()).endCell()}));
 const body=beginCell().storeUint(0x414c5002,32).storeUint(77,64).storeAddress(f.c.addresses.migration).storeRef(beginCell().store(core.storeStateInit(f.c.states.migration)).endCell()).endCell(),r=await f.owner.send({to:f.c.addresses.guard,value:50000000n,bounce:true,body});
 assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(f.c.addresses.guard)&&t.description.computePhase?.exitCode===408));assert.equal((await f.chain.runGetMethod(f.c.addresses.guard,'get_lp_receipt',[{type:'int',value:77n}])).stackReader.readBigNumber(),0n);
 const old=fs.readFileSync(path.resolve(__dirname,'../../minter-contract/contracts/imports/migration-router-code.fc'),'utf8');assert(!old.includes(f.c.states.migration.code.hash().toString('hex')));assert(!derived.lpWallet.equals(f.c.vault.lpWallet),'Guard-owned and Locker-owned LP wallets are distinct');
});
