'use strict';
// Offline immutable binding only; not a deployer or liquidity executor.
const fs=require('node:fs'),path=require('node:path'),lp=require('./lp-locker-v2'),ston=require('./stonfi-v22-addresses');
function build(core,o){
 const vaultCode=o.vaultCode??core.Cell.fromBase64(JSON.parse(fs.readFileSync(path.join(__dirname,'../build/anlgram-lp-locker-v2.compiled.json'),'utf8')).codeBocBase64);
 const normalized=lp.build(core,{...o,code:vaultCode,contributor:o.creator}).terms;
 const a=x=>typeof x==='string'?core.Address.parse(x):x;
 const cfg=core.beginCell().storeUint(normalized.percent,7).storeUint(normalized.duration,32).storeUint(BigInt(normalized.operationId),64)
  .storeRef(core.beginCell().storeAddress(a(o.router)).storeAddress(a(o.pairWallet0)).storeAddress(a(o.pairWallet1)).endCell())
  .storeRef(core.beginCell().storeAddress(a(o.creator)).storeAddress(a(normalized.beneficiary)).storeAddress(a(normalized.unlockedController)).endCell())
  .storeRef(ston.profileCell(core)).storeRef(vaultCode).endCell();
 const code=o.code??core.Cell.fromBase64(JSON.parse(fs.readFileSync(path.join(__dirname,'../build/anlgram-migration-v2-plan.compiled.json'),'utf8')).codeBocBase64);
 const observation=core.beginCell().storeUint(0,64).storeCoins(0).storeCoins(0).storeCoins(0).storeCoins(0).storeUint(0,64).endCell();
 let data=core.beginCell().storeUint(0x4d563250,32).storeRef(cfg).storeRef(observation);
 if(o.tokenMaster0||o.tokenMaster1){
  const m0=a(o.tokenMaster0),m1=a(o.tokenMaster1);if(!core.Address.isAddress(m0)||!core.Address.isAddress(m1)||m0.workChain!==0||m1.workChain!==0||m0.equals(m1))throw Error('Invalid token masters');
  const auth=core.beginCell().storeAddress(m0).storeAddress(m1).storeUint(BigInt('0x'+require('../stonfi-v22-development-profile.json').routerCodeReferenceHash),256).storeUint(0,64).storeUint(0,8).endCell();
  data=data.storeRef(core.beginCell().storeMaybeRef(auth).storeMaybeRef(null).endCell());
 }
 const init={code,data:data.endCell()},address=core.contractAddress(0,init);
 const vault=lp.build(core,{...o,code:vaultCode,contributor:address});
 return{init,address,vault,executorImplemented:false,migrationAuthorized:false};
}
module.exports={build};
