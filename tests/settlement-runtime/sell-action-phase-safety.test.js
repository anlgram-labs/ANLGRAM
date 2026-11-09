'use strict';
// Real FunC/TVM Sandbox regression for the previously untested VNext sell
// action-phase risk. No signing, deployment, keys, or network requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const {createShardAccount} = require('@ton/sandbox');
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

async function createFundedSell() {
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
  const walletBalance=async address=>(await f.chain.runGetMethod(address,'get_wallet_data')).stackReader.readBigNumber();
  const balance=()=>walletBalance(sellerWallet);
  const custody=()=>walletBalance(f.c.curveWallet);
  const entitlement=async address=>(await f.chain.runGetMethod(curve,'get_pending_refund',
    [{type:'slice',cell:beginCell().storeAddress(address).endCell()}])).stackReader.readBigNumber();
  const baselineState=await curveState();
  const initialCustody=await custody();
  return {f,curve,sellerWallet,owned,units,expectedNet,expectedFee:BigInt(quote[1].value),
    curveState,balance,custody,entitlement,baselineState,initialCustody,snapshot:f.chain.snapshot()};
}

let funded;
async function fundedSell() {
  funded??=createFundedSell();
  const fixture=await funded;
  await fixture.f.chain.loadFrom(fixture.snapshot);
  return fixture;
}

const claim=beginCell().storeUint(0x414e4c34,32).storeUint(0xA552n,64).endCell();

test('VNext real Sandbox sell: never debit the Curve reserve without delivering seller TON', async t => {
  const {f,curve,sellerWallet,owned,units,expectedNet,expectedFee,
    curveState,balance,custody,entitlement,baselineState,initialCustody}=await fundedSell();
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
    if (tx) t.diagnostic(JSON.stringify({
      forwardNano:String(forward),
      deliveredNano:String(tx.inMessage.info.value.coins),
      compute:tx.description.computePhase.type==='vm' ? tx.description.computePhase.exitCode : tx.description.computePhase.reason,
      action:tx.description.actionPhase?.resultCode,
      aborted:tx.description.aborted,
      payoutNano:String(payout),
      sellerDebit:String(sellerDebit),
      claimUnits:String(await entitlement(f.owner.address))
    }));
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
      assert.equal(state[4],baseline-expectedNet-expectedFee);
      assert.equal(state[5],baselineState[5]+units);
      assert.equal(state[6],baselineState[6]+expectedFee);
      assert.equal(await custody(),initialCustody+units);
      assert.equal(await entitlement(f.owner.address),0n);
      const receipt=result.transactions.find(t=>t.inMessage?.info.type==='internal' &&
        t.inMessage.info.src.equals(curve) && t.inMessage.info.dest.equals(f.owner.address) &&
        opcode(t.inMessage)===OP_EXCESSES);
      assert.equal(receipt.description.aborted,false);
      assert.equal(receipt.inMessage.body.beginParse().skip(32).loadUintBig(64),0xA551n);
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
      if (sellerDebit===units && newlyEscrowed===units) {
        // The aggregate get_curve_state()[7] is not the owner's claim right.
        // Require the exact seller-keyed ledger entry, then exercise the real
        // claim path and prove both token return and liability clearance.
        const owed=(await f.chain.runGetMethod(curve,'get_pending_refund',
          [{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}]))
          .stackReader.readBigNumber();
        assert.equal(owed,units,
          'UNCLAIMABLE ESCROW: aggregate pending increased without a seller-keyed claim');
        assert.equal(await custody(),initialCustody+units);
        assert.equal(state[5],baselineState[5]);
        assert.equal(state[6],baselineState[6]);
        assert.equal(await entitlement(f.other.address),0n);
        const claimed=await f.send(curve,claim,50000000n);
        assert(exit(claimed,curve,0),
          'REFUND FAILURE: authenticated seller claim did not execute');
        assert.equal(await balance(),owned,
          'REFUND FAILURE: seller Jettons not fully restored after claim');
        const cleared=(await f.chain.runGetMethod(curve,'get_pending_refund',
          [{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}]))
          .stackReader.readBigNumber();
        assert.equal(cleared,0n,
          'REFUND FAILURE: seller claim remained payable after delivery');
        assert.equal(await custody(),initialCustody);
        assert.deepEqual(await curveState(),baselineState);
      }
      if (tx.description.aborted && tx.description.actionPhase?.success===false) {
        assert.equal(sellerDebit,0n,
          'ACTION PHASE FAILURE: Curve reverted payout but seller Jettons stayed transferred');
      }
    }
    if (forward >= 20000000n) {
      assert.equal(payout,expectedNet,'Funded, solvent sell must pay the exact quote');
    } else {
      assert.equal(pending-initialPending,units,'Tiny forwards must create exact seller escrow');
    }
  }
});

test('VNext refuses an unfunded payout and the exact escrow survives invalid and duplicate claims', async t=>{
  const {f,curve,sellerWallet,owned,units,expectedNet,curveState,balance,custody,
    entitlement,baselineState,initialCustody}=await fundedSell();
  const curveAccount=await f.chain.getContract(curve);
  const {code,data}=curveAccount.accountState.state;
  // Keep genuine reserves, tokens and contract code. Simulate loss of physical
  // TON backing only, leaving even the fully funded notification below payout.
  const notification=60000000n;
  assert(expectedNet>notification+10000000n);
  await f.chain.setShardAccount(curve,createShardAccount({address:curve,code,data,balance:10000000n}));
  const sell=sellBody(curve,f.owner.address,units,notification);
  const result=await f.send(sellerWallet,sell,200000000n);
  const tx=curveTransaction(result,curve);
  assert(tx);
  t.diagnostic(JSON.stringify({
    compute:tx.description.computePhase.type==='vm' ? tx.description.computePhase.exitCode : tx.description.computePhase.reason,
    action:tx.description.actionPhase?.resultCode,
    aborted:tx.description.aborted,
    payoutNano:String(coinPayout(result,curve,f.owner.address)),
    sellerUnits:String(await balance()),
    curveWalletUnits:String(await custody()),
    claimUnits:String(await entitlement(f.owner.address))
  }));
  assert(exit(result,curve,0),'Unfunded payout must record escrow without an aborted action');
  assert.equal(coinPayout(result,curve,f.owner.address),0n);
  assert.equal(await balance(),owned-units);
  assert.equal(await custody(),initialCustody+units);
  const escrowState=[...baselineState];
  escrowState[7]+=units;
  assert.deepEqual(await curveState(),escrowState);
  assert.equal(await entitlement(f.owner.address),units);

  const forged=beginCell().storeUint(0x7362d09c,32).storeUint(0xA551n,64)
    .storeCoins(units).storeAddress(f.owner.address).storeBit(false).storeCoins(0).endCell();
  assert(exit(await f.send(curve,forged,60000000n,f.other),curve,401),'Forged notification');
  assert(exit(await f.send(curve,claim,50000000n,f.other),curve,409),'Unauthorized claimant');
  assert(exit(await f.send(curve,claim,10000000n),curve,405),'Insufficient claim gas');
  assert.equal(await entitlement(f.owner.address),units);
  assert.equal(await entitlement(f.other.address),0n);
  assert.deepEqual(await curveState(),escrowState);

  // A real second transfer can reuse a caller's TEP-74 query ID. It backs
  // its separate entitlement with another actual debit from the seller.
  const again=await f.send(sellerWallet,sell,200000000n);
  assert(exit(again,curve,0));
  assert.equal(await balance(),owned-2n*units);
  assert.equal(await custody(),initialCustody+2n*units);
  assert.equal(await entitlement(f.owner.address),2n*units);
  const returned=await f.send(curve,claim,50000000n);
  assert(exit(returned,curve,0));
  const delivery=returned.transactions.find(t=>t.inMessage?.info.dest.equals(sellerWallet) &&
    t.inMessage.info.src.equals(f.c.curveWallet) && opcode(t.inMessage)===0x414e5302);
  assert(delivery && !delivery.description.aborted,'Seller wallet accepted the correlated return');
  assert.equal(await entitlement(f.owner.address),0n);
  assert.deepEqual(await curveState(),baselineState);
  assert(exit(await f.send(curve,claim,50000000n),curve,409),'Duplicate claim');
  assert.equal(await balance(),owned);
  assert.equal(await custody(),initialCustody);
});

test('VNext wallet rolls back Jettons when notification is absent or cannot be funded',async t=>{
  const {f,curve,sellerWallet,owned,units,curveState,balance,custody,
    entitlement,baselineState,initialCustody}=await fundedSell();
  for(const [forward,attachment,rejectedBy] of [[0n,200000000n,f.c.curveWallet],[1n,10000000n,sellerWallet]]) {
    const result=await f.send(sellerWallet,sellBody(curve,f.owner.address,units,forward),attachment);
    t.diagnostic(JSON.stringify({forwardNano:String(forward),attachmentNano:String(attachment),
      transactions:result.transactions.map(tx=>({
        opcode:opcode(tx.inMessage),bounced:tx.inMessage.info.bounced,
        compute:tx.description.computePhase?.exitCode,action:tx.description.actionPhase?.resultCode
      }))}));
    assert(!curveTransaction(result,curve),'Unfunded transfer must not notify Curve');
    assert(exit(result,rejectedBy,709),'The wallet without a funded notification must reject');
    if (rejectedBy.equals(f.c.curveWallet)) {
      assert(result.transactions.some(t=>t.inMessage?.info.bounced &&
        t.inMessage.info.src.equals(f.c.curveWallet) && t.inMessage.info.dest.equals(sellerWallet) &&
        !t.description.aborted),'The bounced wallet-to-wallet transfer restores the seller');
    }
    assert.equal(await balance(),owned);
    assert.equal(await custody(),initialCustody);
    assert.equal(await entitlement(f.owner.address),0n);
    assert.deepEqual(await curveState(),baselineState);
  }
});

test('VNext settlement-wallet replay cannot create a second sell or refund entitlement',async()=>{
  const {f,curve,sellerWallet,owned,units,curveState,balance,custody,
    entitlement,baselineState,initialCustody}=await fundedSell();
  const body=beginCell().storeUint(0x414e5301,32)
    .storeSlice(sellBody(curve,f.owner.address,units,1n).beginParse().skip(32)).endCell();
  const first=await f.send(sellerWallet,body,200000000n);
  assert(exit(first,curve,0));
  const internalTransfer=first.transactions.find(t=>t.inMessage?.info.dest.equals(f.c.curveWallet) &&
    t.inMessage.info.src.equals(sellerWallet) && opcode(t.inMessage)===0x414e5302);
  assert(internalTransfer && !internalTransfer.description.aborted);
  assert.equal(await entitlement(f.owner.address),units);
  const escrowState=await curveState();

  const retried=await f.send(sellerWallet,body,200000000n);
  const replayed=await f.chain.sendMessage(internalTransfer.inMessage);
  for(const result of [retried,replayed]) {
    assert(!curveTransaction(result,curve),'Settlement replay must not notify Curve');
    assert.equal(coinPayout(result,curve,f.owner.address),0n);
  }
  assert.deepEqual(await curveState(),escrowState);
  assert.equal(await balance(),owned-units);
  assert.equal(await custody(),initialCustody+units);
  assert.equal(await entitlement(f.owner.address),units);

  const refund=await f.send(curve,claim,50000000n);
  const receipt=refund.transactions.find(t=>t.inMessage?.info.dest.equals(curve) &&
    t.inMessage.info.src.equals(f.c.curveWallet) && opcode(t.inMessage)===0x414e5304);
  assert(receipt && !receipt.description.aborted);
  assert(exit(await f.chain.sendMessage(receipt.inMessage),curve,0));
  assert.equal(await entitlement(f.owner.address),0n);
  assert.equal(await balance(),owned);
  assert.equal(await custody(),initialCustody);
  assert.deepEqual(await curveState(),baselineState);
});
