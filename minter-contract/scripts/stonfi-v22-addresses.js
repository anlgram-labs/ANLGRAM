'use strict';
// Development schema: matched to captured Router/Pool execution and pinned TON
// ABI revision. This is not independently verified foreign source/build proof.
const profile=require('../stonfi-v22-development-profile.json');
function codes(core){
 return Object.fromEntries(Object.entries(profile.codes).map(([name,v])=>{
  const cell=core.Cell.fromBase64(v.boc);if(cell.hash().toString('hex')!==v.hash)throw new Error('Code identity mismatch: '+name);return[name,cell];
 }));
}
function profileCell(core){
 const c=codes(core);return core.beginCell().storeUint(profile.tag,32).storeUint(profile.genesisLpFee,16).storeUint(profile.genesisProtocolFee,16)
  .storeRef(c.pool).storeRef(c.lpWallet).storeRef(c.lpAccount).endCell();
}
function derive(core,router,w0,w1,owner){
 if(w0.equals(w1)||[router,w0,w1,owner].some(a=>a.workChain!==0))throw new Error('Invalid pair/owner/workchain');
 const c=codes(core),hash=a=>core.beginCell().storeAddress(a).endCell().hash();
 // Captured v2.2 Router sorts by descending serialized-address cell hash.
 const [a,b]=hash(w0).compare(hash(w1))>0?[w0,w1]:[w1,w0];
 const poolInit={code:c.pool,data:core.beginCell().storeBit(false).storeCoins(0).storeCoins(0).storeCoins(0).storeCoins(0).storeCoins(0)
  .storeAddress(null).storeUint(profile.genesisLpFee,16).storeUint(profile.genesisProtocolFee,16)
  .storeRef(core.beginCell().storeAddress(router).storeAddress(a).storeAddress(b).storeRef(c.lpWallet).storeRef(c.lpAccount).endCell()).endCell()};
 const pool=core.contractAddress(0,poolInit);
 const lpInit={code:c.lpWallet,data:core.beginCell().storeCoins(0).storeAddress(owner).storeAddress(pool).storeRef(c.lpWallet).endCell()};
 return{pool,lpWallet:core.contractAddress(0,lpInit),poolInit,lpInit};
}
module.exports={profileCell,derive};
