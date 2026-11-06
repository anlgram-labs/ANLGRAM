import {Address,beginCell} from '@ton/core';

// Wire encoding only. A future executor must supply a fresh, verified getter
// result and independently authorize the exact request. No wallet is called.
export function buildCurveTradePayload({network,side,queryId,expectedOut,tokenUnits,curve,seller}) {
 if(network!=='-3'||!['buy','sell'].includes(side)||typeof queryId!=='bigint'||queryId<=0n||queryId>=1n<<64n||
   typeof expectedOut!=='bigint'||expectedOut<=0n||expectedOut>=1n<<120n)throw Error('Invalid Testnet curve quote');
 const minimum=(expectedOut*99n+99n)/100n;
 if(side==='buy')return {minimum,body:beginCell().storeUint(0x5fcc3d14,32).storeUint(queryId,64).storeCoins(minimum).endCell()};
 const curveAddress=Address.parseFriendly(curve),sellerAddress=Address.parseFriendly(seller);
 if(!curveAddress.isTestOnly||!sellerAddress.isTestOnly||curveAddress.address.workChain!==0||sellerAddress.address.workChain!==0||
   typeof tokenUnits!=='bigint'||tokenUnits<=0n||tokenUnits>=1n<<120n)throw Error('Invalid Testnet sell input');
 const forwardTonAmount=60000000n;
 return {minimum,forwardTonAmount,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(queryId,64).storeCoins(tokenUnits)
  .storeAddress(curveAddress.address).storeAddress(sellerAddress.address).storeBit(false).storeCoins(forwardTonAmount)
  .storeBit(true).storeRef(beginCell().storeCoins(minimum).endCell()).endCell()};
}
