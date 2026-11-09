'use strict';
// Authentic captured STON.fi contracts, local Sandbox only. Matching advertised
// and instantiated code does not independently audit that code or trust upgrades.
const test=require('node:test'),assert=require('node:assert/strict');
const {beginCell,contractAddress}=require('@ton/core');const {fixture}=require('./migration-recovery-support');
test('uninitialized Pool blocks LP discovery; actual bootstrap code matches Router-advertised cells without authorizing custody',async()=>{
 const f=await fixture();
 assert.notEqual((await f.chain.getContract(f.pool)).accountState?.type,'active');
 const code=(await f.chain.runGetMethod(f.dex,'get_router_data')).stackReader;
 code.readBigNumber();code.readString();code.readBoolean();const admin=code.readAddress(),upgrade=code.readCell();
 const poolCode=code.readCell(),lpWalletCode=code.readCell(),lpAccountCode=code.readCell();
 const start=()=>f.admin.send({to:f.locker,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5001,32).storeUint(1,64).endCell()});
 await start();assert.equal((await f.chain.runGetMethod(f.locker,'get_auth_state')).stackReader.readBigNumber(),4n,'Pool address is known but undeployed Pool cannot authenticate LP wallet');
 const token=await f.chain.sendMessage(f.token);
 const poolInit=token.transactions.find(t=>t.inMessage?.info.dest?.equals(f.pool)&&t.inMessage.init)?.inMessage.init;
 assert(poolInit);assert(poolInit.code.hash().equals(poolCode.hash()));assert(contractAddress(0,poolInit).equals(f.pool));
 const accountInit=token.transactions.find(t=>t.inMessage?.init?.code?.hash().equals(lpAccountCode.hash()))?.inMessage.init;
 assert(accountInit,'actual first-leg execution instantiates the advertised LP-account code');
 await start();assert.equal((await f.chain.runGetMethod(f.locker,'get_auth_state')).stackReader.readBigNumber(),5n);
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n,'address discovery without issued LP is never custody');
 const actualLp=(await f.chain.runGetMethod(f.pool,'get_wallet_address',[f.arg(f.locker)])).stackReader.readAddress();
 assert.notEqual((await f.chain.getContract(actualLp)).accountState?.type,'active');
 const ton=await f.chain.sendMessage(f.ton);
 const init=ton.transactions.find(t=>t.inMessage?.info.dest?.equals(actualLp)&&t.inMessage.init)?.inMessage.init;
 assert(init);assert(init.code.hash().equals(lpWalletCode.hash()));assert(contractAddress(0,init).equals(actualLp));
 const custody=(await f.chain.runGetMethod(actualLp,'get_wallet_data')).stackReader;
 assert(custody.readBigNumber()>0n);assert(custody.readAddress().equals(f.locker));assert(custody.readAddress().equals(f.pool));
 assert.equal((await f.chain.runGetMethod(f.locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 console.log('DEX_CODE_PROFILE',JSON.stringify({routerAdmin:admin.toRawString(),upgradeCellHash:upgrade.hash().toString('hex'),poolCode:poolCode.hash().toString('hex'),lpWalletCode:lpWalletCode.hash().toString('hex'),lpAccountCode:lpAccountCode.hash().toString('hex'),sourceAuditVerified:false}));
});
