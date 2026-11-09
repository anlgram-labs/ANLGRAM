'use strict';
// Bounded result B. No patched gates, post-dispatch preload, fabricated receipt,
// RPC, deployment, external wallet signature or live blockchain transaction.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {fixture,bootstrap,exit}=require('./vnext-package-support');
const {fixture:externalProvider}=require('./stonfi-locker-v2-support');
const permits=require('../../minter-contract/scripts/vnext-permit');
const {beginCell}=core,dir=path.resolve(__dirname,'../../minter-contract/contracts');
const opcode=m=>m?.info.type==='internal'&&m.body.bits.length>=32?m.body.beginParse().loadUint(32):null;
const nano=n=>n.toString();
function trace(label,result){
 const txs=result.transactions;
 return{label,totalFeesNano:nano(txs.reduce((sum,t)=>sum+t.totalFees.coins,0n)),transactions:txs.map(t=>({hash:t.hash().toString('hex'),address:t.inMessage?.info.dest?.toRawString(),from:t.inMessage?.info.type==='internal'?t.inMessage.info.src.toRawString():null,incomingMessageHash:t.inMessage?beginCell().store(core.storeMessage(t.inMessage)).endCell().hash().toString('hex'):null,queryId:opcode(t.inMessage)!==null&&t.inMessage.body.bits.length>=96?t.inMessage.body.beginParse().skip(32).loadUintBig(64).toString():null,opcode:opcode(t.inMessage),bounced:t.inMessage?.info.bounced===true,inValueNano:t.inMessage?.info.type==='internal'?nano(t.inMessage.info.value.coins):null,totalFeesNano:nano(t.totalFees.coins),gasUsed:t.description.computePhase.type==='vm'?nano(t.description.computePhase.gasUsed):null,exitCode:t.description.computePhase.type==='vm'?t.description.computePhase.exitCode:null,aborted:t.description.aborted,outgoing:Array.from(t.outMessages.values()).map(m=>({hash:beginCell().store(core.storeMessage(m)).endCell().hash().toString('hex'),to:m.info.dest?.toRawString(),opcode:opcode(m),valueNano:m.info.type==='internal'?nano(m.info.value.coins):null}))}))};
}
function evidence(section,data){
 console.log('VNEXT_HAPPY_PATH_EVIDENCE '+JSON.stringify({section,...data}));
 if(process.env.ANLGRAM_LOCAL_PROOF_OUTPUT){
  const file=process.env.ANLGRAM_LOCAL_PROOF_OUTPUT,all=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  all[section]=data;fs.writeFileSync(file,JSON.stringify(all,null,2)+'\n');
 }
}
const curveState=async f=>(await f.chain.runGetMethod(f.c.addresses.curve,'get_curve_state')).stack.map(x=>x.value);
const walletBalance=async(f,address)=>(await f.chain.runGetMethod(address,'get_wallet_data')).stackReader.readBigNumber();

test('B: fresh source-compiled VNext initialization, mint, renounce, buy, sell, 500TON graduation and real grant reach the exact unchanged414 dispatch blocker',async()=>{
 const f=await fixture(),c=f.c,records=[],send=f.send;
 f.send=async(...args)=>{const r=await send(...args);records.push(trace('source-initiated '+args[1].beginParse().loadUint(32).toString(16),r));return r;};
 // Independently compile unchanged dependencies as well as the three VNext
 // sources already compiled/compared by fixture(). Foreign code is captured.
 for(const [name,expected]of [['anlgram-settlement-wallet',c.wallet],['anlgram-launchpad-jetton-minter',c.states.minter.code],['anlgram-lp-locker-v2',c.vault.init.code]]){
  const r=await compileFunc({targets:[name+'.fc'],sources:p=>fs.readFileSync(path.join(dir,p),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);assert(core.Cell.fromBase64(r.codeBoc).equals(expected));
 }
 assert.equal((await f.chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader.readBigNumber(),0n);
 await bootstrap(f);assert.equal((await curveState(f))[0],3n);assert.equal(await walletBalance(f,c.curveWallet),1000000000000000000n);
 const buyerWallet=core.contractAddress(0,{code:c.wallet,data:beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});
 const buy=await f.send(c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(101,64).storeCoins(1).endCell(),1000000000n);assert(exit(buy,c.addresses.curve,0));const bought=await walletBalance(f,buyerWallet);assert(bought>0n);
 const prior=(await curveState(f))[4],sell=await f.send(buyerWallet,beginCell().storeUint(0x0f8a7ea5,32).storeUint(102,64).storeCoins(bought/2n).storeAddress(c.addresses.curve).storeAddress(f.owner.address).storeBit(false).storeCoins(60000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell(),150000000n);
 assert(exit(sell,c.addresses.curve,0));assert((await curveState(f))[4]<prior);assert.equal(await walletBalance(f,buyerWallet),bought-bought/2n);
 await f.send(c.addresses.curve,beginCell().storeUint(0x5fcc3d14,32).storeUint(103,64).storeCoins(1).endCell(),510000000000n);
 const graduated=await curveState(f);assert.equal(graduated[0],4n);assert(graduated[4]>=300000000000n);assert.equal(graduated[5],0n);assert.equal(graduated[7],0n);assert.equal(await walletBalance(f,c.curveWallet),200000000000000000n);assert.equal(await walletBalance(f,buyerWallet),800000000000000000n);
 const prime=await f.send(c.addresses.curve,beginCell().storeUint(0x414e5801,32).storeUint(c.operationId,64).storeRef(beginCell().store(core.storeStateInit(c.states.guard)).endCell()).endCell());assert(exit(prime,c.addresses.curve,0));
 const epoch=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_return_v2',[{type:'int',value:c.operationId}])).stack[5].value;assert(epoch>0n);
 assert(exit(await f.send(c.addresses.migration,c.bind,50000000n),c.addresses.migration,0));assert(exit(await f.send(c.addresses.migration,c.walletBinding),c.addresses.migration,0));
 const primed=await f.send(c.addresses.curve,beginCell().storeUint(0x414e5802,32).storeUint(c.operationId,64).endCell(),180000000n);assert(exit(primed,c.addresses.migration,0));
 const p=permits.permit(core,c.guard,{phase:1,nonce:1n,starts:f.chain.now,deadline:f.chain.now+60,tonNano:graduated[4],jettonUnits:200000000000000000n,minimumLpUnits:100n,curveEpoch:epoch,fundingEpoch:0n,dexEpoch:0n});
 const submitted=await f.submit(p);records.push(trace('ephemeral local migration permit submission',submitted));assert(exit(submitted,c.addresses.guard,0));
 const approved=await f.request(p,'pre');records.push(trace('actual Curve->Guard->Curve grant',approved));assert(exit(approved,c.addresses.guard,0));assert(exit(approved,c.addresses.curve,0));
 const grant=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_permit_vnext',[{type:'int',value:c.operationId}])).stack.map(x=>x.value);assert.equal(grant[0],1n);assert.equal(grant[1],BigInt('0x'+p.digest.toString('hex')));assert.equal(grant[4],1n);assert(grant[2]>BigInt(f.chain.now));
 const ready=(await f.chain.runGetMethod(c.addresses.curve,'get_curve_lifecycle',[{type:'int',value:c.operationId}])).stackReader.readBigNumber();assert.equal(ready&3n,3n,'both permission and genuine Migrator receiver epochs are acknowledged before dispatch');
 const opened=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_lifecycle',[{type:'int',value:c.operationId}])).stack.map(x=>x.value);assert.equal(opened[0],graduated[4]);assert.equal(opened[1],200000000000000000n);assert(opened[4]>0n&&opened[5]>0n&&opened[6]>0n);assert.equal(opened[2],0n);assert.equal(opened[3],0n);
 const before=await curveState(f),native=(await f.chain.getContract(c.addresses.curve)).balance,migratorNative=(await f.chain.getContract(c.addresses.migration)).balance;
 const dispatch=digest=>beginCell().storeUint(0x414e5803,32).storeUint(c.operationId,64).storeUint(p.nonce,64).storeBuffer(digest).endCell();
 const wrong=await f.send(c.addresses.curve,dispatch(Buffer.alloc(32)),250000000n);assert(exit(wrong,c.addresses.curve,409));assert.deepEqual(await curveState(f),before);
 const result=await f.send(c.addresses.curve,dispatch(p.digest),250000000n),root=result.transactions.find(t=>t.inMessage?.info.dest?.equals(c.addresses.curve));
 assert.equal(root.description.computePhase.exitCode,414);assert.equal(root.description.aborted,true);
 assert(![...root.outMessages.values()].some(m=>m.info.dest?.equals(c.addresses.migration)||m.info.dest?.equals(c.curveWallet)),'no TON deposit or token transfer action emitted');
 assert.deepEqual(await curveState(f),before);assert.equal((await f.chain.getContract(c.addresses.curve)).balance,native);assert.equal((await f.chain.getContract(c.addresses.migration)).balance,migratorNative);assert.equal(await walletBalance(f,c.curveWallet),200000000000000000n);
 const life=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_lifecycle',[{type:'int',value:c.operationId}])).stack.map(x=>x.value);assert.equal(life[2],0n);assert.equal(life[3],0n);assert.equal(life[11],0n);
 const attempted=trace('correctly authorized dispatch stopped at414',result),outValue=[...root.outMessages.values()].reduce((n,m)=>n+(m.info.type==='internal'?m.info.value.coins:0n),0n);
 const remainingForwardFees=[...root.outMessages.values()].reduce((n,m)=>n+(m.info.type==='internal'?m.info.forwardFee:0n),0n);
 assert.equal(250000000n-outValue,root.totalFees.coins+remainingForwardFees,'input minus bounce value reconciles exact contract fees plus forwarding fee carried by the outgoing message');
 evidence('canonicalBlocker',{scope:'LOCAL_TVM_NO_POST_DISPATCH_SEED_NO_PATCHED_GATES',operationId:c.operationId.toString(),network:-3,curve:c.addresses.curve.toRawString(),migrator:c.addresses.migration.toRawString(),guard:c.addresses.guard.toRawString(),reserveNano:before[4].toString(),protocolFeesNano:before[6].toString(),curveWalletJettonUnits:'200000000000000000',authorized:true,curveReadinessFlags:ready.toString(),curveEpoch:opened[4].toString(),fundingEpoch:opened[5].toString(),dexReturnEpoch:opened[6].toString(),firstBlockedOpcode:'0x414e5803',exitCode:414,dispatchPrincipalSentNano:'0',dispatchJettonsSent:'0',attachmentNano:'250000000',curveComputeGas:root.description.computePhase.gasUsed.toString(),curveTransactionFeesNano:root.totalFees.coins.toString(),bounceValueNano:outValue.toString(),bounceRemainingForwardFeesNano:remainingForwardFees.toString(),localRecordFeesNano:records.reduce((sum,r)=>sum+BigInt(r.totalFeesNano),0n).toString(),transactions:records,attempt:attempted,canonicalMigrationComplete:false});
});

test('compatible alternative wire: actual provider contract mints/deposits both legs through captured DEX and delivers authentic LP into immutable Locker; this is not Curve migration completion',async()=>{
 const f=await externalProvider(100,'permanent'),records=[];assert.equal((await f.chain.runGetMethod(f.master,'get_jetton_data')).stackReader.readBigNumber(),1000000000000000000n);
 for(const [index,m]of f.deposit.messages.entries())records.push(trace('independent provider leg '+index,await f.owner.send({...m,bounce:true})));
 const rows=records.flatMap(r=>r.transactions),delivery=rows.find(t=>t.address===f.vault.lpWallet.toRawString()&&t.opcode===0x178d4519),credited=rows.find(t=>t.address===f.vault.address.toRawString()&&t.opcode===0x7362d09c);assert(delivery&&!delivery.aborted&&credited&&!credited.aborted);assert.equal(delivery.from,f.vault.pool.toRawString());assert.equal(credited.from,f.vault.lpWallet.toRawString());assert.equal(delivery.queryId,'77');assert.equal(credited.queryId,'77');assert(rows.some(t=>t.address===f.vault.pool.toRawString()&&t.outgoing.some(m=>m.hash===delivery.incomingMessageHash)));assert(rows.some(t=>t.address===f.vault.lpWallet.toRawString()&&t.outgoing.some(m=>m.hash===credited.incomingMessageHash)));
 const held=(await f.chain.runGetMethod(f.vault.lpWallet,'get_wallet_data')).stackReader,amount=held.readBigNumber();assert(amount>0n);assert(held.readAddress().equals(f.vault.address));assert(held.readAddress().equals(f.vault.pool));
 const terms=(await f.read());assert.equal(terms.readBigNumber(),100n);assert.equal(terms.readBigNumber(),0n);assert.equal(terms.readBigNumber(),0xffffffffffffffffn);assert.equal(terms.readBigNumber(),amount);assert.equal(terms.readBigNumber(),amount);assert.equal(terms.readBigNumber(),0n);assert.equal(terms.readBigNumber(),0n);
 const observation=await f.owner.send({to:f.vault.address,value:20000000n,body:beginCell().storeUint(0x414c5634,32).storeUint(77,64).endCell()});
 const observationTx=observation.transactions.find(t=>t.inMessage?.info.src?.equals(f.vault.address)&&opcode(t.inMessage)===0x414c5635);assert(observationTx);assert(observationTx.inMessage.info.dest.equals(f.owner.address));const observed=observationTx.inMessage.body.beginParse();observed.loadUint(32);assert.equal(observed.loadUintBig(64),77n);assert(observed.loadUintBig(64)>0n);assert.equal(observed.loadCoins(),amount);assert.equal(observed.loadCoins(),amount);assert.equal(observed.loadCoins(),0n);assert.equal(observed.loadCoins(),0n);assert.equal(observed.loadUintBig(64),0xffffffffffffffffn);const endpoints=observed.loadRef().beginParse();assert(endpoints.loadAddress().equals(f.vault.pool));assert(endpoints.loadAddress().equals(f.vault.lpWallet));observed.endParse();endpoints.endParse();
 const observationRecord=trace('source-compiled Locker emits authentic custody observation to provider',observation);

 const blocked=await f.owner.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(amount).endCell()});assert(exit(blocked,f.vault.address,403));
 const fake=await f.other.send({to:f.vault.address,value:50000000n,body:beginCell().storeUint(0x7362d09c,32).storeUint(77,64).storeCoins(amount).storeAddress(f.owner.address).storeBit(false).storeUint(0x414c5632,32).storeUint(77,64).endCell()});assert(exit(fake,f.vault.address,401));
 assert.equal((await f.chain.runGetMethod(f.vault.address,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 evidence('compatibleProvider',{scope:'INDEPENDENT_SOURCE_MINTED_PROVIDER_NOT_CANONICAL_VNEXT_DISPATCH',operationId:'77',provider:f.owner.address.toRawString(),pool:f.vault.pool.toRawString(),locker:f.vault.address.toRawString(),lpWallet:f.vault.lpWallet.toRawString(),mintedLpUnits:amount.toString(),creditedLockedLpUnits:amount.toString(),creditedUnlockedLpUnits:'0',tonAttachedNano:f.deposit.messages.reduce((n,m)=>n+m.value,0n).toString(),jettonsDepositedUnits:'200000000000000000',nativePrincipalNano:'500000000000',localDepositFeesNano:records.reduce((n,r)=>n+BigInt(r.totalFeesNano),0n).toString(),observationFeesNano:observationRecord.totalFeesNano,lockerObservationOpcode:'0x414c5635',lockerObservationAcceptedByMigrator:false,transactions:records,observation:observationRecord,canonicalMigrationComplete:false,validatorFinalityVerified:false,oneShotEscrowImplemented:false});
});
