'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{evaluate,CURVE_UNITS}=require('../../minter-contract/scripts/recovery-liability-model-vnext');
const scenario=()=>({stage:'GRADUATION_PENDING',everDispatched:false,reserveNano:500000000000n,nativeBalanceNano:505010000000n,protocolFeesNano:5000000000n,protectedStorageNano:10000000n,pendingRefundUnits:0n,cumulativeDeliveredUnits:0n,previouslyRedeemedUnits:0n,remainingEligibleUnits:CURVE_UNITS});
test('emergency design arithmetic preserves principal/fees and cannot pay a cumulative token credit twice',()=>{
 const s=scenario();s.cumulativeDeliveredUnits=CURVE_UNITS/4n;let r=evaluate(s);assert.equal(r.payoutNano,'125000000000');assert.equal(r.preservedProtocolFeesNano,'5000000000');assert.equal(r.financialExecutionAuthorized,false);
 const next={...s,reserveNano:r.remainingReserveNano,nativeBalanceNano:(BigInt(s.nativeBalanceNano)-BigInt(r.payoutNano)).toString(),previouslyRedeemedUnits:r.newRedeemedUnits,remainingEligibleUnits:r.remainingEligibleUnits};assert.equal(evaluate(next).payoutNano,'0');assert.equal(evaluate(next).status,'NO_NEW_CREDIT_NO_REPEAT_PAYMENT');
 next.cumulativeDeliveredUnits=CURVE_UNITS;const last=evaluate(next);assert.equal(BigInt(last.payoutNano)+BigInt(r.payoutNano),500000000000n);assert.equal(last.remainingReserveNano,'0');assert.equal(last.remainingEligibleUnits,'0');assert.equal(last.contractPayoutImplemented,false);
});
test('elapsed time, authority permission or an admin label cannot override dispatch races, insolvency or pending obligations',()=>{
 for(const change of [{everDispatched:true,elapsedDays:999},{everDispatched:undefined},{stage:'MIGRATION_FAILED'},{stage:'MIGRATION_IN_PROGRESS'},{nativeBalanceNano:499999999999n},{pendingRefundUnits:1n}])assert.throws(()=>evaluate({...scenario(),...change,authoritySigned:true,administrator:true}));
 assert.throws(()=>evaluate({...scenario(),nativeBalanceNano:null}));assert.throws(()=>evaluate({...scenario(),cumulativeDeliveredUnits:CURVE_UNITS+1n}));
});
test('redemption rounding never invents payout or consumes an unpaid credit',()=>{
 const r=evaluate({...scenario(),reserveNano:1n,cumulativeDeliveredUnits:1n});assert.equal(r.payoutNano,'0');assert.equal(r.newRedeemedUnits,'0');assert.equal(r.status,'ROUNDING_DUST_REMAINS_UNSETTLED');assert.equal(r.gasBudgetVerified,false);
});
