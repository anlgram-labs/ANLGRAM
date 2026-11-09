'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BondingCurveEngine,DEFAULT_CONFIG}=require('../../minter-contract/scripts/bonding-curve-math');

const target=300000000000n;
const inventory=800000000000000000n;
const virtualTon=100000000000n;
const virtualTokens=266666666666666666n;
const overhead=40000000n;
const netOf=gross=>gross-gross/100n;
const outputFor=net=>(inventory+virtualTokens)*net/(virtualTon+net);

// Search the actual monotone pricing rule independently of the cap formula.
function firstSufficient(high,predicate){
 let low=0n;
 assert(predicate(high));
 while(low<high){
  const mid=(low+high)/2n;
  if(predicate(mid))high=mid;
  else low=mid+1n;
 }
 return low;
}

test('integer reference separates graduation from the first full-inventory purchase',()=>{
 assert.equal(DEFAULT_CONFIG.graduationThresholdTon,target);
 const exactTargetGross=firstSufficient(610000000000n,gross=>netOf(gross)>=target);
 const fullInventoryGross=firstSufficient(610000000000n,gross=>outputFor(netOf(gross))>=inventory);
 assert.equal(exactTargetGross,303030303030n);
 assert.equal(netOf(exactTargetGross-1n),target-1n);
 assert.equal(inventory-outputFor(netOf(exactTargetGross-1n)),666668n);
 assert.equal(inventory-outputFor(netOf(exactTargetGross)),1n);
 assert.equal(fullInventoryGross,exactTargetGross+1n);
 assert.equal(netOf(fullInventoryGross),target+1n);

 const engine=new BondingCurveEngine();
 const atThreshold=engine.quoteBuy(exactTargetGross);
 assert.equal(atThreshold.willGraduate,false);
 assert.equal(atThreshold.tokensOut,inventory-1n);
 const refunds=[510000000000n,610000000000n].map(attachment=>{
  const quote=engine.quoteBuy(attachment-overhead);
  assert.equal(quote.tokensOut,inventory);
  assert.equal(quote.netTonApplied,target+1n);
  assert.equal(quote.grossTonIn,fullInventoryGross);
  assert.equal(quote.feeTon,fullInventoryGross/100n);
  const refund=attachment-overhead-quote.grossTonIn;
  assert.equal(overhead+quote.netTonApplied+quote.feeTon+refund,attachment);
  return refund;
 });
 assert.equal(refunds[1]-refunds[0],100000000000n);
 assert.equal(engine.applyBuy(exactTargetGross).success,true);
 assert.equal(engine.graduated,false);
 const finalAtom=engine.applyBuy(11000000n,1n);
 assert.equal(finalAtom.success,true);
 assert.equal(engine.realTokens,0n);
 assert.equal(engine.realTon,target+1n);
 assert.equal(engine.graduated,true);
});
