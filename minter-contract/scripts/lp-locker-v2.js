'use strict';
// Offline immutable configuration and disclosures. No signer/provider/UI activation.
const fs=require('node:fs'),path=require('node:path');
const ston=require('./stonfi-v22-addresses');
const DURATIONS=Object.freeze({permanent:0,days180:180*86400,days365:365*86400});
function build(core,o){
 const percent=o.percent??100,duration=DURATIONS[o.duration??'permanent'];
 if(!Number.isInteger(percent)||percent<50||percent>100||duration===undefined)throw Error('Invalid LP lock terms');
 const q=BigInt(o.operationId);if(q<0n||q>0xffffffffffffffffn)throw Error('Invalid operation ID');
 const a=x=>typeof x==='string'?core.Address.parse(x):x;
 const creator=a(o.creator),beneficiary=a(o.beneficiary??creator),controller=a(o.unlockedController??creator),contributor=a(o.contributor);
 const router=a(o.router),w0=a(o.pairWallet0),w1=a(o.pairWallet1);
 for(const v of[creator,beneficiary,controller,contributor,router,w0,w1])if(!core.Address.isAddress(v)||v.workChain!==0)throw Error('Invalid address');
 const cfg=core.beginCell().storeUint(percent,7).storeUint(duration,32).storeUint(q,64)
  .storeRef(core.beginCell().storeAddress(router).storeAddress(w0).storeAddress(w1).endCell())
  .storeRef(core.beginCell().storeAddress(beneficiary).storeAddress(controller).storeAddress(contributor).endCell())
  .storeRef(ston.profileCell(core)).endCell();
 const accounting=core.beginCell().storeCoins(0).storeCoins(0).storeCoins(0).storeCoins(0).storeBit(false).storeUint(0,64).storeUint(1,64).storeUint(0,64).endCell();
 const code=o.code??core.Cell.fromBase64(JSON.parse(fs.readFileSync(path.join(__dirname,'../build/anlgram-lp-locker-v2.compiled.json'),'utf8')).codeBocBase64);
 const init={code,data:core.beginCell().storeUint(2,8).storeRef(cfg).storeRef(accounting).storeDict(null).storeDict(null).endCell()};
 const address=core.contractAddress(0,init),dest=ston.derive(core,router,w0,w1,address);
 return{init,address,...dest,terms:{version:2,percent,duration,operationId:q.toString(),beneficiary:beneficiary.toRawString(),unlockedController:controller.toRawString(),extensionPolicy:'each authenticated deposit extends all remaining timed principal',migrationEnabled:false}};
}
function disclosure(terms,observed){
 // A getter alone, or an expected address, cannot establish verifiable custody.
 // The existing v1 snapshot verifier does not support this new storage/interface.
 return{...terms,unlockTimestamp:observed?.unlockTimestamp??null,
  recordedLocked:observed?.locked??'0',recordedUnlocked:observed?.unlocked??'0',pendingWithdrawal:observed?.pending??'0',
  custodyStatus:observed?'CONTRACT_RECORD_UNVERIFIED':'PENDING_UNVERIFIED',
  label:observed?'LP contract record; custody verification pending':'LP custody pending',
  withdrawalStatus:BigInt(observed?.pending??0)>0n?'PENDING_WALLET_OUTCOME':'NO_PENDING_REQUEST',
  externalCustodyVerifierSupported:false,migrationEnabled:false};
}
module.exports={build,disclosure,DURATIONS};
