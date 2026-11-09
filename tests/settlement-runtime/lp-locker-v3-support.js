'use strict';
// Genuine captured external bytecode in local Sandbox, NOT on-chain execution.
// Provider is a local treasury actor; Curve authorization is NOT bypassed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support'),lp=require('../../minter-contract/scripts/lp-locker-v3'),wire=require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const {beginCell,contractAddress,Address}=core;let compiled;
async function fixture(percent=75,duration='days180'){
 const chain=await setup(),owner=await chain.treasury('v2-external-provider'),other=await chain.treasury('v2-other'),dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const [minterCode,walletCode,vaultCode,escrowCode]=await(compiled??=Promise.all(['anlgram-launchpad-jetton-minter','anlgram-settlement-wallet','anlgram-lp-locker-v3','anlgram-lp-withdrawal-escrow'].map(async n=>{const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);} )));
 const mi={code:minterCode,data:beginCell().storeCoins(0).storeAddress(owner.address).storeRef(beginCell().endCell()).storeRef(walletCode).endCell()},master=contractAddress(0,mi),router=Address.parse(snap.accounts.router.address),pton=Address.parse(snap.accounts.pton.address);
 const wallet=who=>contractAddress(0,{code:walletCode,data:beginCell().storeCoins(0).storeAddress(who).storeAddress(master).storeRef(walletCode).endCell()});
 const args=who=>[{type:'slice',cell:beginCell().storeAddress(who).endCell()}],ptonWallet=(await chain.runGetMethod(pton,'get_wallet_address',args(router))).stackReader.readAddress();
 await owner.send({to:master,value:100000000n,init:mi,body:beginCell().endCell()});
 const mint=beginCell().storeUint(0x178d4519,32).storeUint(1,64).storeCoins(1000000000000000000n).storeAddress(null).storeAddress(owner.address).storeCoins(0).storeBit(false).endCell();
 await owner.send({to:master,value:200000000n,body:beginCell().storeUint(21,32).storeUint(1,64).storeAddress(owner.address).storeCoins(100000000n).storeRef(mint).endCell()});
 const vault=lp.build(core,{code:vaultCode,escrowCode,creator:owner.address,beneficiary:owner.address,unlockedController:other.address,contributor:owner.address,router,pairWallet0:wallet(router),pairWallet1:ptonWallet,operationId:77,percent,duration});await owner.send({to:vault.address,value:100000000n,init:vault.init,body:beginCell().endCell()});
 const deposit=wire.build(core,{owner:owner.address,router,vault:vault.address,tokenWallet:wallet(owner.address),routerTokenWallet:wallet(router),ptonWallet,operationId:77n,tokenUnits:200000000000000000n,tonNano:500000000000n,deadline:chain.now+1800,minimumLpUnits:1n});
 const read=async()=>(await chain.runGetMethod(vault.address,'get_lock_v3')).stackReader;
 return{chain,owner,other,master,router,ptonWallet,vault,deposit,read,wallet,escrowCode};
}
module.exports={fixture};
