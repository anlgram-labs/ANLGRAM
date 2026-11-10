'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {setup}=require('./stonfi-snapshot-support'),pkg=require('../../minter-contract/scripts/migration-package-v2'),lp=require('../../minter-contract/scripts/lp-locker-v2');
const {beginCell}=core;let codes;
async function fixture(settings={}){
 const chain=await setup(),creator=await chain.treasury('v2-creator'),buyer=await chain.treasury('v2-buyer'),other=await chain.treasury('v2-other');
 const c=pkg.build(core,{creator:creator.address.toRawString(),projectId:'v2-sandbox-not-a-deployment-approval',metadata:{name:'V2 Sandbox',symbol:'V2S'},operationId:77n,percent:settings.percent??75,duration:settings.duration??'days180',beneficiary:creator.address,unlockedController:other.address});
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');codes??=Promise.all(['anlgram-migration-router-v2','anlgram-bonding-curve-v2'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);}));const [m,v]=await codes;assert(m.equals(c.states.migration.code));assert(v.equals(c.states.curve.code));
 for(const [role,init]of Object.entries(c.states))await creator.send({to:c.addresses[role],init,value:100000000n,body:beginCell().endCell()});await creator.send({to:c.vault.address,init:c.vault.init,value:100000000n,body:beginCell().endCell()});
 const send=(to,body,value=100000000n,actor=creator)=>actor.send({to,body,value,bounce:true});
 const state=async()=>(await chain.runGetMethod(c.addresses.curve,'get_curve_state')).stack.map(x=>x.value),v2=async()=>(await chain.runGetMethod(c.addresses.migration,'get_lp_v2_state')).stack.map(x=>x.value);
 return{chain,creator,buyer,other,c,send,state,v2};
}
const exit=(r,address,code)=>r.transactions.some(t=>t.inMessage?.info.dest?.equals(address)&&t.description.computePhase?.exitCode===code);
async function bootstrap(f){
 assert(exit(await f.send(f.c.addresses.curve,f.c.initCurve),f.c.addresses.curve,0));
 const mint=beginCell().storeUint(0x178d4519,32).storeUint(2,64).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(f.creator.address).storeCoins(60000000n).storeBit(false).endCell();
 await f.send(f.c.addresses.minter,beginCell().storeUint(21,32).storeUint(2,64).storeAddress(f.c.addresses.curve).storeCoins(100000000n).storeRef(mint).endCell(),200000000n);
 await f.send(f.c.addresses.minter,beginCell().storeUint(3,32).storeUint(0x414e4c4752454e4fn,64).storeAddress(null).storeAddress(f.c.addresses.curve).endCell(),50000000n);assert.equal((await f.state())[0],3n);
}
test('V2 exact StateInit handshake rejects legacy or substituted migration initialization and preserves V1 artifact identities',async()=>{
 const f=await fixture(),b=f.c.initCurve.beginParse(),legacy=beginCell().storeBits(b.loadBits(b.remainingBits));legacy.storeRef(b.loadRef()).storeRef(b.loadRef());const bad=await f.send(f.c.addresses.curve,legacy.endCell());assert(!exit(bad,f.c.addresses.curve,0));assert.equal((await f.state())[0],0n);
 const s=f.c.initCurve.beginParse(),changed=beginCell().storeBits(s.loadBits(s.remainingBits)).storeRef(s.loadRef()).storeRef(s.loadRef()).storeRef(beginCell().store(core.storeStateInit(f.c.states.guard)).endCell()).endCell();assert(exit(await f.send(f.c.addresses.curve,changed),f.c.addresses.curve,408));
 const before=JSON.stringify(require('../../minter-contract/build/anlgram-bonding-curve.compiled.json'));await bootstrap(f);assert.equal(JSON.stringify(require('../../minter-contract/build/anlgram-bonding-curve.compiled.json')),before);assert.equal((await f.state())[10],300000000000n);
});
test('authentic V2 locker observation lost at frozen Migrator recovers by funded query; delayed old message cannot regress or complete migration',async()=>{
 const f=await fixture(),{freeze,restore}=require('./refund-receipts-support');await f.send(f.c.addresses.migration,f.c.bind,50000000n);const frozen=await freeze(f,f.c.addresses.migration);
 const lost=await f.send(f.c.vault.address,beginCell().storeUint(0x414c5634,32).storeUint(77,64).endCell(),50000000n);const message=lost.transactions.find(t=>t.inMessage?.info.dest?.equals(f.c.addresses.migration)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x414c5635).inMessage;await restore(f,f.c.addresses.migration,frozen);assert.equal((await f.v2())[2],0n);
 await f.send(f.c.addresses.migration,beginCell().storeUint(0x414e5a02,32).storeUint(77,64).endCell(),50000000n);const observed=await f.v2();assert(observed[2]>0n);await f.chain.sendMessage(message);assert.deepEqual(await f.v2(),observed);assert.equal(observed[8],0n);
});
test('V2 immutable LP binding rejects unauthorized parties, changed lock terms and wrong contributors; duplicate funded bind is idempotent',async()=>{
 const f=await fixture();assert(exit(await f.send(f.c.addresses.migration,f.c.bind,50000000n,f.other),f.c.addresses.migration,401));
 const wrong=lp.build(core,{creator:f.creator.address,contributor:f.c.addresses.migration,router:f.c.dex,pairWallet0:f.c.routerTokenWallet,pairWallet1:f.c.ptonWallet,operationId:77n,percent:100,duration:'permanent'});
 const bind=x=>beginCell().storeUint(0x414e5a01,32).storeUint(77,64).storeRef(beginCell().store(core.storeStateInit(x.init)).endCell()).endCell();assert(exit(await f.send(f.c.addresses.migration,bind(wrong),50000000n),f.c.addresses.migration,408));
 assert(exit(await f.send(f.c.addresses.migration,f.c.bind,50000000n),f.c.addresses.migration,0));const before=await f.v2();assert.equal(before[1],-1n);assert(exit(await f.send(f.c.addresses.migration,f.c.bind,50000000n),f.c.addresses.migration,0));assert.deepEqual(await f.v2(),before);
 const query=beginCell().storeUint(0x414e5a02,32).storeUint(77,64).endCell();assert(exit(await f.send(f.c.addresses.migration,query,50000000n),f.c.addresses.migration,0));const observed=await f.v2();assert(observed[2]>0n);assert.equal(observed[3],0n);assert.equal(observed[8],0n);
 const forged=beginCell().storeUint(0x414c5635,32).storeUint(77,64).storeUint(999,64).endCell();assert(exit(await f.send(f.c.addresses.migration,forged,50000000n,f.other),f.c.addresses.migration,401));
});

test('V2 immutable root rejects a different authenticated Curve epoch and forged readiness without creating a second lifecycle',async()=>{
 const f=await fixture(),message=q=>beginCell().storeUint(0x414e5901,32).storeUint(q,64).storeCoins(500000000000n).storeCoins(200000000000000000n).storeUint(1,64).endCell();
 assert(exit(await f.send(f.c.addresses.migration,message(78n),140000000n),f.c.addresses.migration,401));
 const r=await f.chain.sendMessage({info:{type:'internal',ihrDisabled:true,bounce:true,bounced:false,src:f.c.addresses.curve,dest:f.c.addresses.migration,value:{coins:140000000n},ihrFee:0n,forwardFee:0n,createdLt:0n,createdAt:f.chain.now},body:message(78n)});
 assert(exit(r,f.c.addresses.migration,409));
 const local=(await f.chain.runGetMethod(f.c.addresses.migration,'get_local_authorization_v2',[{type:'int',value:77n}])).stackReader;assert.equal(local.readBigNumber(),0n);assert.equal(local.readBigNumber(),0n);
 const life=(await f.chain.runGetMethod(f.c.addresses.migration,'get_migration_lifecycle',[{type:'int',value:78n}])).stackReader;for(let i=0;i<12;i++)assert.equal(life.readBigNumber(),0n);
});

test('isolated registration consumer fixture: exact guard, immutable operation, reserves, epochs, expiry and duplicate protection; execution stays sealed',async()=>{
 const f=await fixture(),m=f.c.addresses.migration,q=77n,ton=500000000000n,tokens=200000000000000000n;
 const options={starts:f.chain.now,deadline:f.chain.now+60,minimumLpUnits:100n,curveEpoch:1n,fundingEpoch:2n,dexEpoch:3n,tonNano:ton,jettonUnits:tokens};
 const registration=pkg.prepareRegistration(core,f.c,options);
 assert.equal(registration.guardCurrentlySupportsPositiveRegistration,false);assert.throws(()=>pkg.prepareRegistration(core,f.c,{...options,deadline:f.chain.now+61}));
 assert(exit(await f.send(m,registration.body,40000000n),m,401));
 await f.send(m,f.c.bind,50000000n);
 const injected=(body,source=f.c.addresses.guard)=>f.chain.sendMessage({info:{type:'internal',ihrDisabled:true,bounce:true,bounced:false,src:source,dest:m,value:{coins:40000000n},ihrFee:0n,forwardFee:0n,createdLt:0n,createdAt:f.chain.now},body});
 assert(exit(await injected(registration.body),m,409),'premature registration cannot fund itself');
 // Narrow parser/accounting unit fixture, NOT real dispatch/guard approval:
 // seed authenticated funding counters to exercise the unreachable positive
 // consumer branch. Canonical guard code and production gate are untouched.
 const original=(await f.chain.getContract(m)).accountState.state.data.beginParse(),prefix=beginCell().storeBit(original.loadBit()).storeAddress(original.loadAddress()).storeAddress(original.loadAddress()).storeAddress(original.loadAddress());
 const a=original.loadRef().beginParse(),master=a.loadAddress(),pton=a.loadAddress();a.loadCoins();a.loadCoins();const admin=a.loadAddress();a.endParse();const wallets=original.loadRef(),flight=original.loadRef().beginParse();flight.loadUintBig(64);flight.loadUintBig(64);flight.loadUint(3);flight.loadMaybeAddress();flight.loadMaybeAddress();
 const inline={parse:s=>s.asCell(),serialize:(v,b)=>b.storeSlice(v.beginParse())},ids=flight.loadDict(core.Dictionary.Keys.BigUint(64),inline),fields=core.Dictionary.empty(core.Dictionary.Keys.Uint(8),core.Dictionary.Values.BigUint(256));for(const [i,v]of [[0,ton],[1,tokens],[2,ton],[3,tokens],[4,1n],[5,2n],[6,3n]])fields.set(i,v);
 ids.set(q+(1n<<63n),beginCell().storeUint(0x4d494733,32).storeDict(fields).storeDict(null).endCell());
 const data=prefix.storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(ton).storeCoins(tokens).storeAddress(admin).endCell()).storeRef(wallets).storeRef(beginCell().storeUint(q,64).storeUint(0,64).storeUint(0,3).storeAddress(null).storeAddress(null).storeDict(ids).endCell()).endCell();
 await f.chain.setShardAccount(m,require('@ton/sandbox').createShardAccount({address:m,code:f.c.states.migration.code,data,balance:ton+200000000n}));
 assert.equal((await f.chain.runGetMethod(m,'get_local_authorization_v2',[{type:'int',value:q}])).stackReader.readBigNumber(),-1n);
 assert(exit(await injected(pkg.prepareRegistration(core,f.c,{...options,curveEpoch:2n}).body),m,409));
 const foreign=pkg.build(core,{creator:f.creator.address.toRawString(),projectId:'another-project',metadata:{name:'Another',symbol:'OTHER'},operationId:77n,percent:75,duration:'days180'});assert(exit(await injected(pkg.prepareRegistration(core,foreign,options).body),m,408),'same query cannot authorize another project');
 const wrong=registration.body.beginParse();wrong.loadUint(32);wrong.loadUintBig(64);const differentRoot=beginCell().storeUint(0x414e5a03,32).storeUint(78,64).storeSlice(wrong).endCell();assert(exit(await injected(differentRoot),m,409));
 assert(exit(await injected(registration.body),m,0));const before=(await f.chain.getContract(m)).accountState.state.data;
 assert(exit(await injected(registration.body),m,0));assert((await f.chain.getContract(m)).accountState.state.data.equals(before));
 assert(exit(await injected(pkg.prepareRegistration(core,f.c,{...options,minimumLpUnits:101n}).body),m,409));
 let r=(await f.chain.runGetMethod(m,'get_registration_v2',[{type:'int',value:q}])).stackReader;assert.equal(r.readBigNumber(),-1n);assert.equal(r.readBigNumber(),-1n);assert.equal(r.readBigNumber(),0n);
 assert(exit(await f.send(m,pkg.prepareExecution(core,f.c,99n).body,400000000n),m,409));assert(exit(await f.send(m,pkg.prepareExecution(core,f.c,100n).body,400000000n),m,414),'registration does not enable execution');
 f.chain.now=options.deadline;r=(await f.chain.runGetMethod(m,'get_registration_v2',[{type:'int',value:q}])).stackReader;r.readBigNumber();assert.equal(r.readBigNumber(),0n);assert(exit(await injected(registration.body),m,409));
 assert(exit(await injected(pkg.prepareRegistration(core,f.c,{...options,starts:f.chain.now,deadline:f.chain.now+60}).body),m,409),'expired permit cannot be replaced/rearmed');
});

test('authenticated floor receipt consumption preserves UNKNOWN custody, blocks new authorization and survives observation retries without credit',async()=>{
 const f=await fixture({percent:100,duration:'permanent'});await f.send(f.c.addresses.migration,f.c.bind,50000000n);const m=f.c.addresses.migration;
 const body=(lt,amount,flags=0,pool=f.c.vault.pool)=>beginCell().storeUint(0x414c5639,32).storeUint(77,64).storeUint(lt,64).storeCoins(amount).storeUint(flags,2).storeRef(beginCell().storeAddress(pool).storeAddress(f.c.vault.lpWallet).endCell()).endCell();
 const deliver=b=>f.chain.sendMessage({info:{type:'internal',ihrDisabled:true,bounce:true,bounced:false,src:f.c.vault.address,dest:m,value:{coins:50000000n},ihrFee:0n,forwardFee:0n,createdLt:0n,createdAt:f.chain.now},body:b});
 assert(exit(await f.send(m,body(100n,50n)),m,401));assert(exit(await deliver(body(100n,50n,1)),m,409));assert(exit(await deliver(body(100n,50n,0,f.other.address)),m,408));
 assert(exit(await deliver(body(100n,50n)),m,0));let r=(await f.chain.runGetMethod(m,'get_lp_floor_v2')).stackReader;assert.equal(r.readBigNumber(),100n);assert.equal(r.readBigNumber(),50n);assert.equal(r.readBigNumber(),0n);assert.equal(r.readBigNumber(),0n);
 const before=await f.v2();assert.equal(before[3],0n);assert(exit(await deliver(body(100n,50n)),m,0));assert(exit(await deliver(body(99n,100n)),m,0));assert(exit(await deliver(body(101n,49n)),m,409));assert.deepEqual(await f.v2(),before);
 await f.send(m,beginCell().storeUint(0x414e5a02,32).storeUint(77,64).endCell(),50000000n);assert.equal((await f.v2())[3],0n);r=(await f.chain.runGetMethod(m,'get_lp_floor_v2')).stackReader;r.readBigNumber();assert.equal(r.readBigNumber(),50n,'fresh locker record cannot erase recovery evidence');
 const probe=pkg.prepareCustodyRecovery(core,f.c,{candidateUnits:50n}),retry=pkg.prepareCustodyRecovery(core,f.c,{retry:true});assert.equal(probe.financialSigningEnabled,false);assert.throws(()=>pkg.prepareCustodyRecovery(core,f.c,{retry:true,candidateUnits:51n}));
 assert(exit(await f.send(m,probe.body,150000000n,f.other),m,401));assert(exit(await f.send(m,probe.body,100000000n),m,407));
 const principal=(await f.chain.getContract(m)).balance;for(const [message,op] of [[probe,0x414c5636],[retry,0x414c5638]]){const result=await f.send(m,message.body,message.value);assert(result.transactions.some(t=>t.inMessage?.info.dest?.equals(f.c.vault.address)&&t.inMessage.body.beginParse().loadUint(32)===op));assert((await f.chain.getContract(m)).balance>=principal,'caller-funded probe cannot spend existing native balance');}
 assert.equal((await f.chain.runGetMethod(m,'get_local_authorization_v2',[{type:'int',value:77n}])).stackReader.readBigNumber(),0n);
 const partial=await fixture();await partial.send(partial.c.addresses.migration,partial.c.bind,50000000n);assert.throws(()=>pkg.prepareCustodyRecovery(core,partial.c,{candidateUnits:50n}));const otherBody=beginCell().storeUint(0x414c5639,32).storeUint(77,64).storeUint(200,64).storeCoins(50).storeUint(0,2).storeRef(beginCell().storeAddress(partial.c.vault.pool).storeAddress(partial.c.vault.lpWallet).endCell()).endCell();
 const bad=await partial.chain.sendMessage({info:{type:'internal',ihrDisabled:true,bounce:true,bounced:false,src:partial.c.vault.address,dest:partial.c.addresses.migration,value:{coins:50000000n},ihrFee:0n,forwardFee:0n,createdLt:0n,createdAt:partial.chain.now},body:otherBody});assert(exit(bad,partial.c.addresses.migration,409),'floor protocol cannot be expanded to partial/timed custody');
});
test('fresh V2 genesis buys/sells, reaches actual500TON graduation, primes persistent return epochs but cannot bypass financial authorization',async()=>{
 const f=await fixture();await bootstrap(f);const curve=f.c.addresses.curve,root=77n;
 assert(exit(await f.send(f.c.addresses.migration,f.c.bind,50000000n),f.c.addresses.migration,0));
 const begin=()=>f.send(curve,beginCell().storeUint(0x414e5801,32).storeUint(root,64).storeRef(beginCell().store(core.storeStateInit(f.c.states.guard)).endCell()).endCell());assert(exit(await begin(),curve,409));
 await f.send(curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(10,64).storeCoins(1).endCell(),1000000000n,f.buyer);
 const buyerWallet=(await f.chain.runGetMethod(f.c.addresses.minter,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(f.buyer.address).endCell()}])).stackReader.readAddress(),balance=(await f.chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber();assert(balance>0n);
 await f.send(buyerWallet,beginCell().storeUint(0x0f8a7ea5,32).storeUint(11,64).storeCoins(balance).storeAddress(curve).storeAddress(f.buyer.address).storeBit(false).storeCoins(50000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell(),100000000n,f.buyer);assert.equal((await f.chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber(),0n);
 await f.send(curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(12,64).storeCoins(1).endCell(),510000000000n);const graduated=await f.state();assert.equal(graduated[0],4n);assert(graduated[4]>=300000000000n);assert.equal(graduated[5],0n);assert.equal((await f.chain.runGetMethod(curve,'get_dex_escrow')).stackReader.readBigNumber(),200000000000000000n);
 const ready=(await f.chain.runGetMethod(curve,'get_local_authorization_v2')).stackReader;assert.equal(ready.readBigNumber(),-1n);assert.equal(ready.readBigNumber(),0n,'positive local eligibility never grants external execution');
 assert(exit(await begin(),curve,0));assert(exit(await f.send(curve,beginCell().storeUint(0x414e5802,32).storeUint(root,64).endCell(),180000000n),curve,0));assert.equal((await f.v2())[1],-1n,'epoch persistence must preserve reserved binding key0');
 const funds=await f.state();const dispatch=await f.send(curve,beginCell().storeUint(0x414e5803,32).storeUint(root,64).endCell(),250000000n);assert(exit(dispatch,curve,414));const after=await f.state();assert.equal(after[4],funds[4]);assert.equal(after[6],funds[6]);
 const accountApi=await import('../../testnet-interface/projects/migration-account.mjs'),configuration={creator:f.creator.address.toRawString(),projectId:'v2-sandbox-not-a-deployment-approval',metadata:{name:'V2 Sandbox',symbol:'V2S'},operationId:77n,percent:75,duration:'days180',beneficiary:f.creator.address.toRawString(),unlockedController:f.other.address.toRawString()};
 const rawAccount=async address=>beginCell().storeBit(true).store(core.storeAccount((await f.chain.getContract(address)).account.account)).endCell().toBoc().toString('base64');
 const curveFields=accountApi.migrationAccountFields(configuration,'curve',await rawAccount(curve));assert.equal(curveFields.reserveNano,funds[4].toString());assert.equal(curveFields.localReserveEligible,true);assert.equal(curveFields.migrationAuthorized,false);
 const migrationFields=accountApi.migrationAccountFields(configuration,'migration',await rawAccount(f.c.addresses.migration));assert.equal(migrationFields.lifecycle.originalTonNano,funds[4].toString());assert.equal(migrationFields.lifecycle.originalJettonUnits,'200000000000000000');assert.equal(migrationFields.lifecycle.fundedTonNano,'0');assert.equal(accountApi.isMigrationCheckpoint(migrationFields),false);
 const settlement=(await f.chain.runGetMethod(f.c.addresses.migration,'get_settlement_v2',[{type:'int',value:77n}])).stackReader;assert.equal(settlement.readBigNumber(),1n,'funding pending, never COMPLETE');
 const dex=beginCell().storeUint(0x414e4c37,32).storeUint(root,64).endCell();assert(exit(await f.send(f.c.addresses.migration,dex,400000000n,f.other),f.c.addresses.migration,401));assert(exit(await f.send(f.c.addresses.migration,dex,400000000n),f.c.addresses.migration,414));assert.equal((await f.v2())[8],0n);
 const proposal=pkg.prepareExecution(core,f.c,100n),payload=proposal.body.beginParse();payload.loadUint(32);payload.loadUintBig(64);payload.loadAddress();payload.loadAddress();payload.loadAddress();assert.equal(payload.loadCoins(),100n);payload.endParse();assert.equal(proposal.migrationAuthorized,false);assert.throws(()=>pkg.prepareExecution(core,f.c,undefined));assert.throws(()=>pkg.prepareExecution(core,f.c,0n));
});
