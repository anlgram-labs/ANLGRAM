import {Address,Cell,Dictionary,beginCell,contractAddress,loadAccount} from '@ton/core';
import {isMigrationCheckpoint} from './evidence-brand.mjs';
import {code} from './artifacts.mjs';

// Wire encoding only. A future executor must supply a fresh, verified getter
// result and independently authorize the exact request. No wallet is called.
export function buildCurveTradePayload({network,side,queryId,expectedOut,tokenUnits,curve,seller,slippageBps=100}) {
 if(network!=='-3'||!['buy','sell'].includes(side)||typeof queryId!=='bigint'||queryId<=0n||queryId>=1n<<64n||
   typeof expectedOut!=='bigint'||expectedOut<=0n||expectedOut>=1n<<120n)throw Error('Invalid Testnet curve quote');
 if(!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>100)throw Error('Invalid slippage');
 const minimum=(expectedOut*BigInt(10000-slippageBps)+9999n)/10000n;
 if(side==='buy')return {minimum,body:beginCell().storeUint(0x5fcc3d14,32).storeUint(queryId,64).storeCoins(minimum).endCell()};
 const curveAddress=Address.parseFriendly(curve),sellerAddress=Address.parseFriendly(seller);
 if(!curveAddress.isTestOnly||!sellerAddress.isTestOnly||curveAddress.address.workChain!==0||sellerAddress.address.workChain!==0||
   typeof tokenUnits!=='bigint'||tokenUnits<=0n||tokenUnits>=1n<<120n)throw Error('Invalid Testnet sell input');
 const forwardTonAmount=60000000n;
 return {minimum,forwardTonAmount,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(queryId,64).storeCoins(tokenUnits)
  .storeAddress(curveAddress.address).storeAddress(sellerAddress.address).storeBit(false).storeCoins(forwardTonAmount)
  .storeBit(true).storeRef(beginCell().storeCoins(minimum).endCell()).endCell()};
}

// Internal unsigned preparation only. The checkpoint must have passed account
// inclusion and code identity verification, and cannot be supplied by a client.
function requireRegisteredCurve(record,cp,now) {
 if(!isMigrationCheckpoint(cp)||cp.scope!=='ACCOUNT_INCLUSION_RELATIVE_TO_REFERENCE_NOT_VALIDATOR_FINALITY'||
    record?.network!=='-3'||cp.generation!==2||cp.role!=='curve'||
    cp.project!==record.jettonMaster||cp.address!==record.accounts?.curve?.address||cp.codeHash!==record.accounts.curve.codeHash||
    cp.operationId!==record.operationId||
    cp.thresholdNano!=='300000000000'||!Number.isSafeInteger(cp.proof?.chainTime)||
    !Number.isSafeInteger(now)||cp.proof.chainTime>now||now-cp.proof.chainTime>=30)throw Error('Fresh registered Curve checkpoint required');
}

export function prepareCurveTrade({record,checkpoint:cp,owner,side,amount,slippageBps=100,now=Math.floor(Date.now()/1000)}) {
 requireRegisteredCurve(record,cp,now);
 if(cp.stage!==3)throw Error('Curve trading is inactive');
 if(!['buy','sell'].includes(side)||typeof amount!=='bigint'||amount<=0n||amount>=1n<<119n)throw Error('Invalid trade input');
 const wallet=Address.parseFriendly(owner);
 if(!wallet.isTestOnly||wallet.address.workChain!==0)throw Error('Testnet basechain wallet required');
 const curve=Address.parseRaw(cp.address);
 const [reserve,inventory,virtualTon,virtualTokens]=[cp.reserveNano,cp.curveTokenUnits,cp.virtualTonNano,cp.virtualJettonUnits].map(BigInt);
 const x=reserve+virtualTon,y=inventory+virtualTokens;
 let expectedOut,fee,gross,refund=0n,destination=curve,attachment=amount+40000000n;
 if(side==='buy'){
  if(amount<=10000000n||inventory===0n||virtualTokens<=0n)throw Error('Buy below minimum or inactive inventory');
  gross=amount;
  fee=gross/100n;
  let net=gross-fee;
  expectedOut=y*net/(x+net);
  if(expectedOut>=inventory){
   expectedOut=inventory;
   const initialK=virtualTon*(800000000000000000n+virtualTokens);
   const requiredX=(initialK+virtualTokens-1n)/virtualTokens;
   if(requiredX>x){
    net=requiredX-x;
    gross=(net-1n)*10000n/9900n+1n;
    fee=gross-net;
   }
   if(reserve+net<300000000000n)throw Error('Graduation principal below minimum');
  }
  if(gross>amount)throw Error('Buy gross exceeds attachment');
  refund=amount-gross;
 }else{
  gross=x*amount/(y+amount);
  // The legacy getter caps its result, while the sell handler refunds
  // instead of selling if the Curve cannot cover the full gross amount.
  if(gross>reserve)throw Error('Sell exceeds available Curve principal');
  fee=gross/100n;
  expectedOut=gross-fee;
  const walletCode=code('anlgram-settlement-wallet');
  const data=beginCell().storeCoins(0).storeAddress(wallet.address).storeAddress(Address.parseRaw(cp.project))
   .storeRef(walletCode).endCell();
  destination=contractAddress(0,{code:walletCode,data});
  attachment=150000000n; // Sandbox-verified attachment, not a live gas quote.
 }
 const nonce=crypto.getRandomValues(new Uint32Array(2));
 const queryId=(BigInt(nonce[0])<<32n|BigInt(nonce[1]))||1n;
 const {body,minimum}=buildCurveTradePayload({network:'-3',side,queryId,expectedOut,tokenUnits:amount,
  curve:curve.toString({testOnly:true}),seller:owner,slippageBps});
 return {status:'PREPARED',network:'-3',operationId:cp.operationId,queryId:String(queryId),side,source:wallet.address.toRawString(),
  scope:'UNSIGNED_REFERENCE_RELATIVE_PROJECTION',accountHash:cp.accountHash,
  expectedOut:String(expectedOut),minimum:String(minimum),grossNano:String(gross),feeNano:String(fee),
  principalRefundNano:String(refund),validUntil:cp.proof.chainTime+30,
  message:{address:destination.toString({testOnly:true,bounceable:true}),amount:String(attachment),payload:body.toBoc().toString('base64')},
  walletApproved:false,broadcastingEnabled:false,financialSigningEnabled:false,executionEligible:false};
}

// Read the exact owner-scoped Jetton entitlement from the same proven Account
// cell. This opcode cannot claim native TON from a failed action or a bounce
// that never occurred. The contract consumes/re-escrows its own entitlement.
export function prepareCurveJettonRefund({record,checkpoint:cp,accountBoc,owner,now=Math.floor(Date.now()/1000)}) {
 requireRegisteredCurve(record,cp,now);
 const wallet=Address.parseFriendly(owner);
 if(!wallet.isTestOnly||wallet.address.workChain!==0)throw Error('Testnet basechain wallet required');
 if(typeof accountBoc!=='string'||accountBoc.length>524288)throw Error('Bounded Curve Account required');
 const root=Cell.fromBase64(accountBoc), accountHash=root.hash().toString('hex');
 if(accountHash!==cp.accountHash)throw Error('Curve Account differs from checkpoint');
 const slice=root.beginParse();
 if(!slice.loadBit())throw Error('Curve Account unavailable');
 const account=loadAccount(slice);
 slice.endParse();
 if(account.storage.state.type!=='active')throw Error('Curve Account inactive');
 const data=account.storage.state.state.data.beginParse();
 data.skip(24);data.loadRef();data.loadRef();
 const dict=data.loadRef().beginParse().loadDict(Dictionary.Keys.BigUint(256),{
  parse:value=>value.asCell(),serialize(){throw Error('Read only');}
 });
 const ownerHash=beginCell().storeAddress(wallet.address).endCell().hash().toString('hex');
 const entitlement=dict.get(BigInt('0x'+ownerHash))?.beginParse();
 const units=entitlement?.loadCoins()??0n;
 entitlement?.endParse();
 if(units<=0n||units>BigInt(cp.pendingRefundUnits))throw Error('No authenticated owner Jetton refund');
 const nonce=crypto.getRandomValues(new Uint32Array(2));
 const queryId=(BigInt(nonce[0])<<32n|BigInt(nonce[1]))||1n;
 const body=beginCell().storeUint(0x414e4c34,32).storeUint(queryId,64).endCell();
 return {status:'PREPARED',scope:'UNSIGNED_OWNER_JETTON_REFUND',network:'-3',source:wallet.address.toRawString(),
  operationId:cp.operationId,queryId:String(queryId),accountHash,claimableJettonUnits:String(units),
  validUntil:cp.proof.chainTime+30,message:{address:account.addr.toString({testOnly:true,bounceable:true}),
   amount:'50000000',payload:body.toBoc().toString('base64')},
  deliveryVerified:false,broadcastingEnabled:false,financialSigningEnabled:false,executionEligible:false};
}
