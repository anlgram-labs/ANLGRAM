'use strict';
// Design arithmetic only. This is NOT a receipt verifier, ledger, payout
// builder, deployable recovery entry point or permission to release reserves.
const CURVE_UNITS=800000000000000000n;
const exact=(x,name)=>{if(typeof x!=='bigint'&&!(typeof x==='string'&&/^\d+$/.test(x)))throw Error('Exact '+name+' required');const n=BigInt(x);if(n<0n||n>=(1n<<120n))throw Error('Invalid '+name);return n;};
function evaluate(s){
 if(s.stage!=='GRADUATION_PENDING'||s.everDispatched!==false)throw Error('No recovery after migration dispatch or ambiguous phase');
 const reserve=exact(s.reserveNano,'reserve'),native=exact(s.nativeBalanceNano,'native balance'),fees=exact(s.protocolFeesNano,'protocol fees'),storage=exact(s.protectedStorageNano,'storage reserve'),pending=exact(s.pendingRefundUnits,'pending refunds'),credited=exact(s.cumulativeDeliveredUnits,'delivered units'),redeemed=exact(s.previouslyRedeemedUnits,'redeemed units'),eligible=exact(s.remainingEligibleUnits,'eligible units');
 if(pending!==0n||native<reserve+fees+storage)throw Error('Unfunded recovery or unresolved obligations');
 if(credited<redeemed||eligible>CURVE_UNITS)throw Error('Cumulative redemption accounting mismatch');
 const delta=credited-redeemed;if(delta>eligible)throw Error('Redemption exceeds eligible supply');
 const output={scope:'MATHEMATICAL_NO_DISPATCH_SCENARIO_NOT_AUTHENTICATED_EVIDENCE',financialExecutionAuthorized:false,contractPayoutImplemented:false,gasBudgetVerified:false,nonceRecoveryAuthorized:false,payoutNano:'0',remainingReserveNano:reserve.toString(),remainingEligibleUnits:eligible.toString(),newRedeemedUnits:redeemed.toString(),preservedProtocolFeesNano:fees.toString()};
 if(delta===0n)return{...output,status:'NO_NEW_CREDIT_NO_REPEAT_PAYMENT'};
 const payout=reserve*delta/eligible;
 if(payout===0n)return{...output,status:'ROUNDING_DUST_REMAINS_UNSETTLED'};
 return{...output,status:'MATH_CONSERVES_PRINCIPAL_REQUIRES_CONTRACT_VERIFICATION',payoutNano:payout.toString(),remainingReserveNano:(reserve-payout).toString(),remainingEligibleUnits:(eligible-delta).toString(),newRedeemedUnits:credited.toString()};
}
module.exports={evaluate,CURVE_UNITS};
