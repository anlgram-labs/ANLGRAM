'use strict';
// Exact existing STON.fi v2.1/v2.2 wire with Locker V2's immutable receipt tag.
// Offline preparation only: not an executor, authorization or ledger.
function build(core,o){
 const a=x=>typeof x==='string'?core.Address.parse(x):x;
 const owner=a(o.owner),router=a(o.router),vault=a(o.vault),tokenWallet=a(o.tokenWallet),routerTokenWallet=a(o.routerTokenWallet),ptonWallet=a(o.ptonWallet);
 for(const x of [owner,router,vault,tokenWallet,routerTokenWallet,ptonWallet])if(!core.Address.isAddress(x)||x.workChain!==0)throw Error('Basechain endpoints required');
 const exact=(x,max)=>{if(typeof x!=='bigint'&&!(typeof x==='string'&&/^\d+$/.test(x)))throw Error('Exact unsigned integer required');const n=BigInt(x);if(n<=0n||n>max)throw Error('Integer out of range');return n;};
 const q=exact(o.operationId,(1n<<62n)-1n),tokens=exact(o.tokenUnits,(1n<<120n)-1n),ton=exact(o.tonNano,(1n<<120n)-1n),min=exact(o.minimumLpUnits,(1n<<120n)-1n);
 if(!Number.isSafeInteger(o.deadline)||o.deadline<1||o.deadline>0xffffffff)throw Error('Explicit transaction deadline required');
 if(routerTokenWallet.equals(ptonWallet)||tokenWallet.equals(routerTokenWallet)||vault.equals(owner))throw Error('Invalid endpoint substitution');
 const b=core.beginCell,tag=b().storeUint(0x414c5632,32).storeUint(q,64).endCell();
 const cross=b().storeCoins(min).storeAddress(vault).storeBit(true).storeCoins(20000000).storeBit(true).storeRef(tag).endCell();
 const payload=pair=>b().storeUint(0x37c096df,32).storeAddress(pair).storeAddress(owner).storeAddress(owner).storeUint(o.deadline,64).storeRef(cross).endCell();
 const token=b().storeUint(0x0f8a7ea5,32).storeUint(q,64).storeCoins(tokens).storeAddress(router).storeAddress(owner).storeBit(false).storeCoins(150000000).storeBit(true).storeRef(payload(ptonWallet)).endCell();
 const native=b().storeUint(0x01f3835d,32).storeUint(q,64).storeCoins(ton).storeAddress(owner).storeBit(true).storeRef(payload(routerTokenWallet)).endCell();
 return{operationId:q.toString(),receiver:vault,receiptTag:0x414c5632,messages:[{to:tokenWallet,value:200000000n,body:token},{to:ptonWallet,value:ton+150000000n,body:native}],principal:{tonNano:ton.toString(),tokenUnits:tokens.toString()},gasAttachmentsNano:'350000000',migrationAuthorized:false,financialSigningEnabled:false,requiresAuthenticatedEndpoints:true,isFeeQuote:false,
  compatibility:'Requires immutable Locker V2 contributor to equal the actual provider owner. V1 router tag/set-wallet protocol is not compatible. Not a slippage quote or fee maximum.'};
}
function refund(core,{operationId,lpAccount}){
 if(typeof operationId!=='bigint'&&!(typeof operationId==='string'&&/^\d+$/.test(operationId)))throw Error('Exact operation ID required');const q=BigInt(operationId);if(q<=0n||q>=(1n<<62n))throw Error('Operation out of range');const to=core.Address.parse(lpAccount);if(to.workChain!==0)throw Error('Basechain LPAccount required');
 return{to,value:900000000n,body:core.beginCell().storeUint(0x132b9a2c,32).storeUint(q,64).storeUint(0,2).endCell(),requiresAuthenticatedOwnerAndPool:true,financialSigningEnabled:false,isFeeQuote:false};
}
module.exports={build,refund};
