'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('@ton/core'),{Blockchain,internal}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js'),builder=require('../../minter-contract/scripts/vnext-permit'),pkg=require('../../minter-contract/scripts/migration-package-vnext');
const {beginCell}=core;let compiled;
async function fixture(){
 const chain=await Blockchain.create();chain.now=1800000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
 const config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),chain.config);config.set(19,beginCell().storeInt(-3,32).endCell());chain.setConfig(beginCell().storeDictDirect(config).endCell());
 const actor=await chain.treasury('vnext-payer');
 const dir=path.resolve(__dirname,'../../minter-contract/contracts'),code=await(compiled??=(async()=>{const r=await compileFunc({targets:['anlgram-guard-vnext.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);})());
 const keys=crypto.generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'),c=pkg.build(core,{creator:actor.address.toRawString(),projectId:'guard-component-fixture',metadata:{name:'Guard fixture',symbol:'GUARD'},operationId:77n,migrationAuthorityPublicKey:publicKey}),g=c.guard,curve={address:c.addresses.curve},migrator={address:c.addresses.migration};assert(code.equals(g.init.code));
 await actor.send({to:g.address,init:g.init,value:100000000n,body:beginCell().endCell()});
 // Counterparty messages are narrow source-auth fixtures, not real financial dispatch.
 await chain.sendMessage(internal({from:curve.address,to:g.address,value:50000000n,body:beginCell().storeUint(0x414e5b20,32).storeUint(77,64).storeRef(beginCell().store(core.storeStateInit(c.states.migration)).endCell()).endCell()}));
 const options={phase:1,nonce:1n,starts:chain.now,deadline:chain.now+60,tonNano:500000000000n,jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:9n,fundingEpoch:0n,dexEpoch:0n};
 const sign=p=>crypto.sign(null,p.digest,keys.privateKey),send=body=>actor.send({to:g.address,value:50000000n,body}),query=(p,from=curve.address)=>chain.sendMessage(internal({from,to:g.address,value:50000000n,body:p.query}));
 return{chain,g,options,sign,send,query,actor,curve,migrator};
}
const exits=(r,a,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(a)&&t.description.computePhase?.exitCode===code);
test('VNext source-compiled signature verification and authenticated pre/post grants are migration-only, with measured actual TVM gas',async()=>{
 const f=await fixture(),p=builder.permit(core,f.g,f.options),sig=f.sign(p),measurement=await f.chain.runGetMethod(f.g.address,'verify_signature_vnext',[{type:'cell',cell:p.body},{type:'slice',cell:beginCell().storeBuffer(sig).endCell()}]);assert.equal(measurement.stackReader.readBigNumber(),-1n);
 const submitted=await f.send(builder.submission(core,f.g,p,sig));assert(exits(submitted,f.g.address,0));const granted=await f.query(p);assert(exits(granted,f.g.address,0));const tx=granted.transactions.find(t=>t.inMessage?.info.dest?.equals(f.g.address)),reply=Array.from(tx.outMessages.values()).find(m=>m.body.bits.length>=32&&m.body.beginParse().loadUint(32)===0x414e5b02);assert(reply);const r=reply.body.beginParse();r.loadUint(32);assert.equal(r.loadUintBig(64),77n);assert.equal(r.loadUintBig(64),1n);assert.equal(r.loadUint(32),f.options.deadline);assert(r.loadBuffer(32).equals(p.digest));assert(r.loadRef().equals(p.body));r.endParse();
 const post=builder.permit(core,f.g,{...f.options,phase:2,fundingEpoch:10n,dexEpoch:11n});assert(exits(await f.send(builder.submission(core,f.g,post,f.sign(post))),f.g.address,0));assert(exits(await f.query(post),f.g.address,401));assert(exits(await f.query(post,f.migrator.address),f.g.address,0));
 const state=(await f.chain.runGetMethod(f.g.address,'get_permit_vnext',[{type:'int',value:1n}])).stackReader;state.readBigNumber();state.readBigNumber();assert.equal(state.readBigNumber(),1n);state.readBigNumber();assert.equal(state.readBigNumber(),0n);
 const submit=submitted.transactions.find(t=>t.inMessage?.info.dest?.equals(f.g.address));const costs={signatureGetterGas:measurement.gasUsed.toString(),submitGas:submit.description.computePhase.gasUsed.toString(),grantGas:tx.description.computePhase.gasUsed.toString(),submitFeesNano:submit.totalFees.coins.toString(),grantFeesNano:tx.totalFees.coins.toString(),scope:'LOCAL_SANDBOX_CONFIG_NOT_NETWORK_FEE_QUOTE'};console.log('VNEXT_GAS '+JSON.stringify(costs));
});
test('VNext invalid signatures, wrong source, wrong network and unauthorized custody phases cannot create approval',async()=>{
 const f=await fixture(),p=builder.permit(core,f.g,f.options),signature=f.sign(p),bad=Buffer.from(signature);bad[0]^=1;assert(exits(await f.send(builder.submission(core,f.g,p,bad)),f.g.address,401));assert(exits(await f.query(p),f.g.address,409));
 assert.throws(()=>builder.permit(core,f.g,{...f.options,phase:3}));const cfg=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),f.chain.config);cfg.set(19,beginCell().storeInt(-239,32).endCell());f.chain.setConfig(beginCell().storeDictDirect(cfg).endCell());assert(exits(await f.send(builder.submission(core,f.g,p,signature)),f.g.address,408));
});
test('even a valid authority signature cannot authorize a custody phase, another project or unapproved version commitments',async()=>{
 const f=await fixture(),p=builder.permit(core,f.g,f.options),s=p.body.beginParse();const prefix=s.loadBits(72);s.loadUint(8);const b=beginCell().storeBits(prefix).storeUint(3,8).storeBits(s.loadBits(s.remainingBits));while(s.remainingRefs)b.storeRef(s.loadRef());const body=b.endCell(),custody={...p,body,digest:body.hash()};assert(exits(await f.send(builder.submission(core,f.g,custody,f.sign(custody))),f.g.address,409));
 for(const changed of [{...f.g,lpIntentHash:'33'.repeat(32)},{...f.g,versionsHash:'44'.repeat(32)}]){const wrong=builder.permit(core,changed,f.options);assert(exits(await f.send(builder.submission(core,f.g,wrong,f.sign(wrong))),f.g.address,408));}
});
test('VNext renews only expired unconsumed permissions and never lets an old digest or consumed revision rearm',async()=>{
 const f=await fixture(),p=builder.permit(core,f.g,f.options);assert(exits(await f.send(builder.submission(core,f.g,p,f.sign(p))),f.g.address,0));assert(exits(await f.send(builder.submission(core,f.g,p,f.sign(p))),f.g.address,0));
 const tooSoon=builder.permit(core,f.g,{...f.options,nonce:2n,minimumLpUnits:101n});assert(exits(await f.send(builder.submission(core,f.g,tooSoon,f.sign(tooSoon))),f.g.address,409));
 f.chain.now=f.options.deadline;assert(exits(await f.query(p),f.g.address,409));const next=builder.permit(core,f.g,{...f.options,nonce:2n,starts:f.chain.now,deadline:f.chain.now+60});assert(exits(await f.send(builder.submission(core,f.g,next,f.sign(next))),f.g.address,0));assert(exits(await f.query(p),f.g.address,409));assert(exits(await f.query(next),f.g.address,0));assert(exits(await f.query(next),f.g.address,0),'funded identical status request may repeat a bound response, not asset execution');
 f.chain.now+=60;const third=builder.permit(core,f.g,{...f.options,nonce:3n,starts:f.chain.now,deadline:f.chain.now+60});assert(exits(await f.send(builder.submission(core,f.g,third,f.sign(third))),f.g.address,409));
});
