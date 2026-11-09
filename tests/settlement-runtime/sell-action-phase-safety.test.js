'use strict';
// Real FunC/TVM Sandbox regression for the previously untested VNext sell
// action-phase risk. No signing, deployment, keys, or network requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const {fixture,exit} = require('./one-shot-dispatch-support');
const {beginCell} = core;
const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_BUY = 0x5fcc3d14;
const OP_EXCESSES = 0xd53276db;

function opcode(msg) {
  return msg?.body?.bits?.length >= 32 ? msg.body.beginParse().loadUint(32) : null;
}
function curveTransaction(result, curve) {
  return result.transactions.find(t =>
    t.inMessage?.info.type === 'internal' && t.inMessage.info.dest.equals(curve) &&
    opcode(t.inMessage) === 0x7362d09c);
}
function coinPayout(result, curve, owner) {
  return result.transactions.filter(t => t.inMessage?.info.type === 'internal' &&
    t.inMessage.info.src.equals(curve) && t.inMessage.info.dest.equals(owner) &&
    opcode(t.inMessage) === OP_EXCESSES).reduce((sum,t)=>sum+t.inMessage.info.value.coins,0n);
}
function sellBody(curve, owner, amount, forward) {
  return beginCell().storeUint(OP_JETTON_TRANSFER,32).storeUint(0xA551n,64)
    .storeCoins(amount).storeAddress(curve).storeAddress(owner)
    .storeBit(false).storeCoins(forward)
    .storeBit(true).storeRef(beginCell().storeCoins(0n).endCell()).endCell();
}

test('VNext real Sandbox sell: never debit the Curve reserve without delivering seller TON', async () => {
  const f = await fixture();
  await require('./vnext-package-support').bootstrap(f);
  const curve=f.c.addresses.curve, master=f.c.addresses.minter;
  const buy=beginCell().storeUint(OP_BUY,32).storeUint(2000,64).storeCoins(1n).endCell();
  assert(exit(await f.send(curve,buy,1000000000n),curve,0),'Initial buy should succeed');
  const sellerWallet=core.contractAddress(0,{code:f.c.wallet,data:beginCell()
    .storeCoins(0).storeAddress(f.owner.address).storeAddress(master)
    .storeRef(f.c.wallet).endCell()});
  const owned=(await f.chain.runGetMethod(sellerWallet,'get_wallet_data')).stackReader.readBigNumber();
  assert(owned>100n,'Owner needs genuine Curve tokens');
  const units=owned/8n;
  const quote=(await f.chain.runGetMethod(curve,'get_sell_quote',[{type:'int',value:units}])).stack;
  const expectedNet=BigInt(quote[0].value);
  assert(expectedNet>0n,'Must exercise a real solvent sale');
  const curveState=async()=>(await f.chain.runGetMethod(curve,'get_curve_state')).stack.map(x=>x.value);
  const balance=async()=>(await f.chain.runGetMethod(sellerWallet,'get_wallet_data')).stackReader.readBigNumber();
  const baselineState=await curveState();
  const baseline=baselineState[4], initialPending=baselineState[7];
  const snapshot=f.chain.snapshot();

  // Sender wallet attaches enough to send each notification; deliberately
  // vary forward value to the Curve, including almost-zero gas budgets.
  // Any case that books the sale must deliver the actual seller payout.
  for(const forward of [1n,1000n,1000000n,5000000n,20000000n,60000000n]) {
    await f.chain.loadFrom(snapshot);
    const result=await f.send(sellerWallet,sellBody(curve,f.owner.address,units,forward),
      200000000n);
    const tx=curveTransaction(result,curve);
    const state=await curveState();
    const after=state[4], pending=state[7];
    const sellerAfter=await balance();
    const sellerDebit=owned-sellerAfter;
    const payout=coinPayout(result,curve,f.owner.address);
    if (!tx) {
      assert.equal(after,baseline,'No Curve notification may debit reserve');
      assert.equal(sellerDebit,0n,
        'CUSTODY VIOLATION: seller Jettons moved without Curve receipt or refund');
      assert.equal(payout,0n);
      continue;
    }
    if (after<baseline) {
      assert.equal(payout,expectedNet,
        'SOLVENCY VIOLATION: booked a real sell without full seller TON payout '+
        '(forward='+forward+', action='+String(tx.description.actionPhase?.resultCode)+')');
      assert.equal(tx.description.aborted,false);
      assert.equal(tx.description.actionPhase?.success,true);
      assert.equal(sellerDebit,units,'Paid sale must consume exactly the sold Jettons');
      assert.equal(pending,initialPending,'Paid sale must not create an unpaid token claim');
    } else {
      assert.equal(after,baseline,
        'Curve reserve unexpectedly increased during a sell attempt');
      assert.equal(payout,0n,
        'Unbooked sale must not emit seller TON payout');
      const newlyEscrowed=pending-initialPending;
      // An Action Phase failure rolls back Curve state, but does NOT
      // automatically roll back the preceding external Jetton transfer.
      // Do not accept unbooked sales unless the seller recovered the tokens
      // or an actual Curve escrow liability accounts for the full debit.
      assert(sellerDebit===0n || (sellerDebit===units && newlyEscrowed===units),
        'CUSTODY VIOLATION: seller lost tokens without a verified return or pending escrow '+
        '(forward='+forward+', debit='+sellerDebit+', escrow='+newlyEscrowed+
        ', aborted='+String(tx.description.aborted)+
        ', action='+String(tx.description.actionPhase?.resultCode)+')');
      if (tx.description.aborted && tx.description.actionPhase?.success===false) {
        assert.equal(sellerDebit,0n,
          'ACTION PHASE FAILURE: Curve reverted payout but seller Jettons stayed transferred');
      }
    }
  }
});
