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
 const init={code,data:core.beginCell().storeUint(0x4d563250,32).storeRef(cfg).storeRef(observation).endCell()},address=core.contractAddress(0,init);
 const vault=lp.build(core,{...o,code:vaultCode,contributor:address});
 return{init,address,vault,executorImplemented:false,migrationAuthorized:false};
}
module.exports={build};
