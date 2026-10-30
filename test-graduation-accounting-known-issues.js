/** Regression checks for a capped buy after earlier trades.
 * Local TVM simulation, compiled from current sources; no blockchain calls.
 * Former failing reproductions retained as regression requirements.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, 'minter-contract', 'package.json'));
delete globalThis.fetch;
const { SmartContract, TvmRunnerSynchronous, TvmRunnerAsynchronous } = req('ton-contract-executor');
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();
const { compileFunc } = req('@ton-community/func-js');
const { Address, beginCell, Cell, InternalMessage, CommonMessageInfo, CellMessage } = req('ton');
const BN = req('bn.js');

const ONE = 1_000_000_000n;
const initialTokens = 800_000_000n * ONE;
const virtualTon = 166_666_666_666n;
const virtualToken = 266_666_666_665_600_000n;
const initialK = virtualTon * (initialTokens + virtualToken);
const addr = byte => new Address(0, Buffer.alloc(32, byte));
const curveAddress = addr(18);
const buyer = addr(5);
const big = n => new BN(n.toString());

async function scenario() {
  const dir = path.join(__dirname, 'minter-contract', 'contracts');
  const compile = async file => {
    const result = await compileFunc({ targets: [file], sources: f => fs.readFileSync(path.join(dir, f), 'utf8') });
    assert.equal(result.status, 'ok', result.message);
    return Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  };
  const [curveCode, walletCode] = await Promise.all([compile('anlgram-bonding-curve.fc'), compile('jetton-wallet.fc')]);
  const master = addr(4);
  const jettonWalletAddress = owner => {
    const walletData = beginCell().storeCoins(0).storeAddress(owner).storeAddress(master).storeRef(walletCode).endCell();
    const init = beginCell().storeUint(0, 2).storeUint(1, 1).storeRef(walletCode)
      .storeUint(1, 1).storeRef(walletData).storeUint(0, 1).endCell();
    return new Address(0, init.hash());
  };
  const curveJettonWallet = jettonWalletAddress(curveAddress);
  const buyerJettonWallet = jettonWalletAddress(buyer);
  const data = beginCell()
    .storeUint(3, 8).storeUint(100, 16) // Active fixture; does not simulate bootstrap.
    .storeRef(beginCell().storeAddress(addr(1)).storeAddress(addr(2)).storeAddress(addr(3))
      .storeRef(beginCell().storeAddress(addr(4)).storeAddress(curveJettonWallet).storeAddress(addr(8))
        .storeRef(beginCell().storeAddress(addr(9)).storeAddress(addr(10)).endCell()).endCell()).endCell())
    .storeRef(beginCell().storeCoins(0).storeCoins(big(initialTokens)).storeCoins(0).storeCoins(0)
      .storeCoins(big(virtualTon)).storeCoins(big(virtualToken)).storeCoins(big(500n * ONE))
      .storeCoins(big(200_000_000n * ONE)).endCell())
    .storeRef(beginCell().storeDict(null).storeRef(walletCode).endCell()).endCell();
  const curve = await SmartContract.fromCell(curveCode, data);
  curve.setC7Config({ myself: curveAddress });
  const buy = amount => curve.sendInternalMessage(new InternalMessage({
    to: curveAddress, from: buyer, value: big(amount), bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(beginCell()
      .storeUint(0x5fcc3d14, 32).storeUint(1, 64).storeCoins(0).endCell()) }),
  }));
  const first = await buy(10n * ONE);
  assert.equal(first.type, 'success');
  const before = await curve.invokeGetMethod('get_curve_state', []);
  const beforeTon = BigInt(before.result[4].toString());
  const beforeTokens = BigInt(before.result[5].toString());
  const beforeFees = BigInt(before.result[6].toString());
  assert(beforeTon > 0n && beforeTokens < initialTokens);
  // The destination Jetton wallet credits a simulated incoming transfer and
  // emits its real notification; sender-wallet debit is not simulated here.
  // A 4-bit VarUInteger length prefix of 15 requires 120 further bits.
  const walletData = beginCell().storeCoins(0).storeAddress(curveAddress).storeAddress(master).storeRef(walletCode).endCell();
  const wallet = await SmartContract.fromCell(walletCode, walletData);
  wallet.setC7Config({ myself: curveJettonWallet });
  const transferIn = await wallet.sendInternalMessage(new InternalMessage({
    to: curveJettonWallet, from: buyerJettonWallet, value: big(200_000_000n), bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(beginCell()
      .storeUint(0x178d4519, 32).storeUint(2, 64).storeCoins(big(1_000_000n * ONE))
      .storeAddress(buyer).storeAddress(buyer).storeCoins(big(60_000_000n))
      .storeUint(0, 1).storeUint(15, 4).endCell()) }),
  }));
  assert.equal(transferIn.type, 'success', 'Jetton wallet credits the incoming transfer');
  const credited = await wallet.invokeGetMethod('get_wallet_data', []);
  assert.equal(credited.result[0].toString(), (1_000_000n * ONE).toString());
  const notification = transferIn.actionList.find(a => a.message?.info?.dest?.equals(curveAddress));
  assert(notification, 'Jetton wallet emits notification to curve');
  const malformedSell = await curve.sendInternalMessage(new InternalMessage({
    to: curveAddress, from: curveJettonWallet, value: notification.message.info.value.coins, bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(notification.message.body) }),
  }));
  const afterMalformed = await curve.invokeGetMethod('get_curve_state', []);
  assert.equal(afterMalformed.result[4].toString(), before.result[4].toString());
  assert.equal(afterMalformed.result[5].toString(), before.result[5].toString());
  assert.equal(afterMalformed.result[6].toString(), before.result[6].toString());
  if (malformedSell.type === 'success') {
    const refundBody = malformedSell.actionList[0].message.body.beginParse();
    assert.equal(refundBody.readUint(32).toNumber(), 0x0f8a7ea5);
    refundBody.readUint(64);
    assert.equal(refundBody.readCoins().toString(), (1_000_000n * ONE).toString());
    assert(refundBody.readAddress().equals(buyer));
  }
  // Synthetic notifications exercise structural payload variants and the
  // existing underfunded escrow/claim path independently of sender debit.
  for (const variant of ['missing-tag', 'missing-ref', 'short-prefix', 'truncated-inline', 'truncated-ref']) {
    const body = beginCell().storeUint(0x7362d09c, 32).storeUint(3, 64)
      .storeCoins(big(100n)).storeAddress(buyer);
    if (variant === 'missing-ref') body.storeBit(1);
    if (variant === 'short-prefix') body.storeBit(0).storeUint(7, 3);
    if (variant === 'truncated-inline') body.storeBit(0).storeUint(15, 4);
    if (variant === 'truncated-ref') body.storeBit(1).storeRef(beginCell().storeUint(15, 4).endCell());
    const result = await curve.sendInternalMessage(new InternalMessage({
      to: curveAddress, from: curveJettonWallet, value: big(60_000_000n), bounce: false,
      body: new CommonMessageInfo({ body: new CellMessage(body.endCell()) }),
    }));
    assert.equal(result.type, 'success', variant);
    assert.equal(result.actionList.length, 1, variant + ' must refund');
  }
  const lowGas = await curve.sendInternalMessage(new InternalMessage({
    to: curveAddress, from: curveJettonWallet, value: big(5_000_000n), bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(beginCell().storeUint(0x7362d09c, 32)
      .storeUint(4, 64).storeCoins(big(123n)).storeAddress(buyer).storeBit(0).storeUint(15, 4).endCell()) }),
  }));
  assert.equal(lowGas.type, 'success');
  assert.equal(lowGas.actionList.length, 0);
  const pending = await curve.invokeGetMethod('get_curve_state', []);
  assert.equal(pending.result[7].toString(), '123');
  assert.equal(pending.result[4].toString(), before.result[4].toString());
  assert.equal(pending.result[5].toString(), before.result[5].toString());
  const claim = () => curve.sendInternalMessage(new InternalMessage({
    to: curveAddress, from: buyer, value: big(100_000_000n), bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(beginCell().storeUint(0x414e4c34, 32).storeUint(5, 64).endCell()) }),
  }));
  assert.equal((await claim()).type, 'success');
  assert.equal((await claim()).type, 'failed', 'claim cannot be executed twice');
  assert.equal((await curve.invokeGetMethod('get_curve_state', [])).result[7].toString(), '0');
  console.log('Malformed sell TVM result:', JSON.stringify(malformedSell, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value));
  const second = await buy(1000n * ONE);
  assert.equal(second.type, 'success');
  const after = await curve.invokeGetMethod('get_curve_state', []);
  const actualTon = BigInt(after.result[4].toString());
  const remainingTokens = BigInt(after.result[5].toString());
  const afterFees = BigInt(after.result[6].toString());
  assert.equal(remainingTokens, 0n, 'second trade exhausts inventory');
  const expectedTon = (initialK + virtualToken - 1n) / virtualToken - virtualTon;
  const expectedNet = expectedTon - beforeTon;
  const expectedGross = (expectedNet * 10_000n + 9_900n - 1n) / 9_900n;
  const expectedRefund = 1000n * ONE - 40_000_000n - expectedGross;
  const unaccountedBeforeExecutionFees = 1000n * ONE - 40_000_000n - (actualTon - beforeTon) - (afterFees - beforeFees);
  const actions = second.actionList || [];
  // Explicit unspent trade refund; the separate mode-128 message returns
  // operational gas and is settled/tested with actual action fees in Sandbox.
  const buyerRefunds = actions.filter(a => a.message?.info?.dest?.equals(buyer) && a.message.info.value.coins.gt(new BN(0)));
  console.log('TVM capped buy after first trade:', JSON.stringify({
    beforeTon: String(beforeTon), beforeTokens: String(beforeTokens), actualTon: String(actualTon),
    expectedTon: String(expectedTon), expectedRefund: String(expectedRefund),
    reserveDelta: String(actualTon - beforeTon), feeDelta: String(afterFees - beforeFees),
    unaccountedBeforeExecutionFees: String(unaccountedBeforeExecutionFees),
    outputMessages: actions.length, refundMessages: buyerRefunds.length,
    malformedSellType: malformedSell.type, malformedSellExit: malformedSell.exit_code,
    malformedSellActionResult: malformedSell.action_result_code,
    pendingRefundBefore: before.result[7].toString(), pendingRefundAfter: afterMalformed.result[7].toString(),
  }));
  return { actualTon, expectedTon, expectedRefund, buyerRefunds, malformedSell };
}

const observed = scenario();
test('capped purchase preserves the constant-product graduation accounting', async () => {
  const result = await observed;
  assert.equal(result.actualTon, result.expectedTon, 'actual reserve must follow initial invariant');
});
test('capped purchase refunds excess TON to the buyer', async () => {
  const result = await observed;
  assert(result.expectedRefund > 0n);
  assert.equal(result.buyerRefunds.length, 1, 'buyer must receive an excess TON refund');
  assert.equal(BigInt(result.buyerRefunds[0].message.info.value.coins.toString()), result.expectedRefund);
});
test('malformed sell payload is handled without aborting the refund path', async () => {
  const result = await observed;
  assert.equal(result.malformedSell.type, 'success', 'malformed forward payload should not abort after Jetton delivery');
  assert(result.malformedSell.actionList?.length > 0, 'malformed sell must produce a refund');
});
