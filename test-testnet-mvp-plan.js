'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('./minter-contract/node_modules/@ton/core');
const {build,buy,sell,receiptQuery,units}=require('./lib/testnet-mvp-plan');
const p=require('./docs/launchpad/testnet-v5-candidate.json');
function observation(plan){return{network:'-3',operator:plan.operator,master:plan.minter,curve:plan.curve,curveState:3,admin:null,decimals:9,observedAt:Date.now(),quoteGrossNano:'960000000',quoteTokens:'1000000000000',wallet:plan.buyerWallet,walletOwner:plan.operator,walletMaster:plan.minter,deliveredBalance:'1000000000000',quotedAmount:'1000000000000',netTonQuote:'900000000',settlementStatus:2};}
test('offline MVP preserves active V5 identities and exact existing messages, never repeats first deployment or enables signing',()=>{
 const plan=build();assert.equal(plan.steps.length,9);assert.equal(new Set(plan.steps.map(s=>s.operationId)).size,9);assert.equal(plan.steps.some(s=>s.name==='deploy-minter'),false);assert(plan.firstDeployment.consumed);assert.equal(plan.signingEnabled,false);assert.equal(plan.broadcastEnabled,false);assert.equal(plan.migrationEnabled,false);assert.equal(plan.lpWithdrawalsEnabled,false);assert.equal(plan.donation.amountNano,'20000000');assert.equal(plan.sell.message,null);assert.equal(plan.recovery.message,null);
 for(const s of plan.steps){assert.deepEqual(s.message,p.smokePlan.steps.find(t=>t.name===s.name).message);assert.equal(s.requiresSeparateOwnerApproval,true);assert(!('validUntil' in s));assert(s.seqnoMustBeReadFresh);}
 const changed=structuredClone(p);changed.wallet.walletId=0;assert.throws(()=>build(changed));
});
test('buy review uses exact integer units, fresh state and quote of value minus existing gas; never quote a full attachment',()=>{
 const plan=build(),e=observation(plan),options={attachmentNano:'1000000000',quoteTokens:e.quoteTokens,queryId:'18446744073709551615'};
 const r=buy(plan,e,options),s=core.Cell.fromBase64(r.message.payload).beginParse();assert.equal(s.loadUint(32),0x5fcc3d14);assert.equal(s.loadUintBig(64),0xffffffffffffffffn);assert.equal(s.loadCoins(),995000000000n);s.endParse();
 for(const change of[{network:'-239'},{admin:plan.operator},{curveState:2},{decimals:6},{observedAt:1},{quoteGrossNano:'1000000000'},{quoteTokens:'1'}])assert.throws(()=>buy(plan,{...e,...change},options));
 for(const bad of[{attachmentNano:'40000000'},{slippageBps:'1001'},{quoteTokens:1e18},{queryId:'18446744073709551616'}])assert.throws(()=>buy(plan,e,{...options,...bad}));
});
test('sell requires actual matched wallet/delivered balance, positive quote/minimum and final settlement evidence',()=>{
 const plan=build(),e=observation(plan),options={amount:e.deliveredBalance,minimumTon:'890000000'};
 const r=sell(plan,e,options);assert.equal(r.message.address,plan.buyerWallet);assert.equal(r.message.amount,'100000000');
 for(const change of[{walletMaster:plan.curve},{walletOwner:plan.curve},{wallet:p.curveJettonWallet},{settlementStatus:1},{deliveredBalance:'1'},{quotedAmount:'1'},{netTonQuote:'1'}])assert.throws(()=>sell(plan,{...e,...change},options));
 assert.throws(()=>sell(plan,e,{...options,amount:1e18}));assert.throws(()=>sell(plan,e,{...options,minimumTon:'0'}));
});
test('recovery template is correlated gas-only, supports uint64 operation and cannot become a repeated buy or zero-ID receipt',()=>{
 const plan=build(),r=receiptQuery(plan,'18446744073709551615'),s=core.Cell.fromBase64(r.message.payload).beginParse();assert.equal(s.loadUint(32),0x414e5305);assert.equal(s.loadUintBig(64),0xffffffffffffffffn);s.endParse();assert.equal(r.resendPrincipal,false);assert.equal(r.message.amount,'20000000');assert(r.requiresSeparateOwnerApproval);assert.throws(()=>receiptQuery(plan,0));assert.throws(()=>units(9007199254740992));assert.throws(()=>units('1e18'));assert.throws(()=>units(true));
});
module.exports={observation};
