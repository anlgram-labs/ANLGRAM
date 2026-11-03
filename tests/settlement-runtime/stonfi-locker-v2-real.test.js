'use strict';
// Genuine captured external bytecode in local Sandbox, NOT on-chain execution.
// Provider is a local treasury actor; Curve authorization is NOT bypassed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support'),lp=require('../../minter-contract/scripts/lp-locker-v2'),wire=require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const {beginCell,contractAddress,Address}=core;let compiled;
async function fixture(percent=75,duration='days180'){
 const chain=await setup(),owner=await chain.treasury('v2-external-provider'),other=await chain.treasury('v2-other'),dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const [minterCode,walletCode,vaultCode]=await(compiled??=Promise.all(['anlgram-launchpad-jetton-minter','anlgram-settlement-wallet','anlgram-lp-locker-v2'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 const mi={code:minterCode,data:beginCell().storeCoins(0).storeAddress(owner.address).storeRef(beginCell().endCell()).storeRef(walletCode).endCell()},master=contractAddress(0,mi),router=Address.parse(snap.accounts.router.address),pton=Address.parse(snap.accounts.pton.address);
 const wallet=who=>contractAddress(0,{code:walletCode,data:beginCell().storeCoins(0).storeAddress(who).storeAddress(master).storeRef(walletCode).endCell()});
 const args=who=>[{type:'slice',cell:beginCell().storeAddress(who).endCell()}],ptonWallet=(await chain.runGetMethod(pton,'get_wallet_address',args(router))).stackReader.readAddress();
 await owner.send({to:master,value:100000000n,init:mi,body:beginCell().endCell()});
 const mint=beginCell().storeUint(0x178d4519,32).storeUint(1,64).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(owner.address).storeCoins(0).storeBit(false).endCell();
 await owner.send({to:master,value:200000000n,body:beginCell().storeUint(21,32).storeUint(1,64).storeAddress(owner.address).storeCoins(100000000n).storeRef(mint).endCell()});
 const vault=lp.build(core,{code:vaultCode,creator:owner.address,beneficiary:owner.address,unlockedController:other.address,contributor:owner.address,router,pairWallet0:wallet(router),pairWallet1:ptonWallet,operationId:77,percent,duration});await owner.send({to:vault.address,value:100000000n,init:vault.init,body:beginCell().endCell()});
 const deposit=wire.build(core,{owner:owner.address,router,vault:vault.address,tokenWallet:wallet(owner.address),routerTokenWallet:wallet(router),ptonWallet,operationId:77n,tokenUnits:200000000000000000n,tonNano:500000000000n,deadline:chain.now+1800,minimumLpUnits:1n});
 const read=async()=>(await chain.runGetMethod(vault.address,'get_lock_v2')).stackReader;
 return{chain,owner,other,master,router,ptonWallet,vault,deposit,read,wallet};
}
test('actual captured STON.fi Pool mints LP with V2 tag into source-compiled partial timed Locker V2',async()=>{
 const f=await fixture();let all=[];for(const m of f.deposit.messages){const r=await f.owner.send({...m,bounce:true});all.push(...r.transactions);}
 const held=(await f.chain.runGetMethod(f.vault.lpWallet,'get_wallet_data')).stackReader;const amount=held.readBigNumber();assert(amount>0n);assert(held.readAddress().equals(f.vault.address));assert(held.readAddress().equals(f.vault.pool));
 const notifications=all.filter(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x7362d09c);assert.equal(notifications.length,1);assert.equal(notifications[0].description.computePhase.exitCode,0);
 const r=await f.read();assert.equal(r.readBigNumber(),75n);assert.equal(r.readBigNumber(),15552000n);assert(r.readBigNumber()>BigInt(f.chain.now));assert.equal(r.readBigNumber(),amount);assert.equal(r.readBigNumber(),(amount*75n+99n)/100n);assert.equal(r.readBigNumber(),amount-(amount*75n+99n)/100n);assert.equal(r.readBigNumber(),0n);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),800000000000000000n);assert.equal(f.deposit.migrationAuthorized,false);
 // Replay the exact actual LP-wallet emitted notification, not forged JSON.
 await f.chain.sendMessage(notifications[0].inMessage);const again=await f.read();again.readBigNumber();again.readBigNumber();again.readBigNumber();assert.equal(again.readBigNumber(),amount);
});
module.exports={fixture};
test('single token deposit stays in authentic LPAccount, then official refund_me restores exact Jettons without claiming LP or migration completion',async()=>{
 const f=await fixture();await f.owner.send({...f.deposit.messages[0],bounce:true});const account=(await f.chain.runGetMethod(f.vault.pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress();
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),800000000000000000n);
 const refund=await f.owner.send({...wire.refund(core,{operationId:77n,lpAccount:account.toRawString()}),bounce:true});assert(refund.transactions.length>2);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);const r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n);
});
for(const [percent,duration]of [[100,'permanent'],[50,'days180'],[75,'days365']])test(`actual DEX LP preserves ${percent}% / ${duration} and authentic unlock/beneficiary restrictions`,async()=>{
 const f=await fixture(percent,duration);for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});const r=await f.read();assert.equal(r.readBigNumber(),BigInt(percent));r.readBigNumber();const unlock=r.readBigNumber(),received=r.readBigNumber(),locked=r.readBigNumber(),free=r.readBigNumber();assert.equal(locked,(received*BigInt(percent)+99n)/100n);assert.equal(locked+free,received);
 const claim=actor=>actor.send({to:f.vault.address,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(locked).endCell()});
 assert((await claim(f.other)).transactions.some(t=>t.description.computePhase?.exitCode===401));
 assert((await claim(f.owner)).transactions.some(t=>t.description.computePhase?.exitCode===403));
 if(duration==='permanent'){assert.equal(unlock,0xffffffffffffffffn);return;}
 f.chain.now=Number(unlock);await claim(f.owner);const recipient=(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress();assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),locked);
 const duplicate=await claim(f.owner);assert(duplicate.transactions.some(t=>t.description.computePhase?.exitCode===409));assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),locked,'no second delivery');
 const pending=await f.read();for(let i=0;i<6;i++)pending.readBigNumber();assert.equal(pending.readBigNumber(),locked,'actual delivery is not a foreign authenticated final receipt');
});
test('first LP notification lost during actual DEX mint: bounded recovery proves only custody floor, never issuance or a withdrawal credit',async()=>{
 const f=await fixture(100,'permanent'),{freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,f.vault.address);for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});await restore(f,f.vault.address,old);
 const actual=(await f.chain.runGetMethod(f.vault.lpWallet,'get_wallet_data')).stackReader.readBigNumber();assert(actual>0n);let r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n);
 const query=beginCell().storeUint(0x414c5636,32).storeUint(77,64).storeCoins(actual).endCell();await f.owner.send({to:f.vault.address,value:150000000n,bounce:true,body:query});const floor=(await f.chain.runGetMethod(f.vault.address,'get_lp_recovery_v4')).stackReader;assert.equal(floor.readBigNumber(),2n);floor.readBigNumber();assert.equal(floor.readBigNumber(),actual);floor.readBigNumber();floor.readBigNumber();assert.equal(floor.readBigNumber(),0n,'not exact balance proof');r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n,'a floor is not a reconstructed initial mint receipt');
});
