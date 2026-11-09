'use strict';
// Local TVM message routing, not a blockchain deployment. Actual contract
// output bodies are delivered to the next contract; no fabricated ack is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, 'minter-contract/package.json'));
delete globalThis.fetch;
const ton = req('ton');
const core = req('@ton/core');
const BN = req('bn.js');
const { compileFunc } = req('@ton-community/func-js');
const { SmartContract, TvmRunnerAsynchronous, TvmRunnerSynchronous } = req('ton-contract-executor');
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();
const { buildLaunchpadInitialStates } = require('./minter-contract/deploy-launchpad-testnet');

async function activation() {
  const compile = async name => {
    const r = await compileFunc({ targets: [name + '.fc'], sources: f => fs.readFileSync(path.join(__dirname, 'minter-contract/contracts', f), 'utf8') });
    assert.equal(r.status, 'ok', r.message);
    return ton.Cell.fromBoc(Buffer.from(r.codeBoc, 'base64'))[0];
  };
  const [minterCode, curveCode, walletCode] = await Promise.all(['anlgram-launchpad-jetton-minter', 'anlgram-bonding-curve', 'jetton-wallet'].map(compile));
  const a = n => new ton.Address(0, Buffer.alloc(32, n));
  const ca = n => new core.Address(0, Buffer.alloc(32, n));
  const [operator, curveAddress, master, locker, migrator, dex, outsider] = [1,2,3,4,5,6,8].map(a);
  const states = buildLaunchpadInitialStates({ adminAddress: ca(1), creatorAddress: ca(1), treasuryAddress: ca(1),
    curveAddress: ca(2), minterAddress: ca(3), lpLockerAddress: ca(4), migrationRouterAddress: ca(5),
    dexRouterAddress: ca(6), ptonMinterAddress: ca(7), jettonWalletCode: core.Cell.fromBoc(walletCode.toBoc())[0] }, core);
  const minter = await SmartContract.fromCell(minterCode, ton.Cell.fromBoc(states.launchpadMinterData.toBoc())[0]);
  const curve = await SmartContract.fromCell(curveCode, ton.Cell.fromBoc(states.bondingCurveData.toBoc())[0]);
  minter.setC7Config({ myself: master }); curve.setC7Config({ myself: curveAddress });
  const send = (contract, to, from, body, value = '100000000') => contract.sendInternalMessage(new ton.InternalMessage({
    to, from, value: new BN(value), bounce: false, body: new ton.CommonMessageInfo({ body: new ton.CellMessage(body) }) }));
  const route = (contract, to, from, action) => {
    assert(action.message.info.dest.equals(to));
    return send(contract, to, from, action.message.body, action.message.info.value.coins.toString());
  };
  const state = async () => (await curve.invokeGetMethod('get_curve_state', [])).result[0].toNumber();
  const walletData = ton.beginCell().storeCoins(0).storeAddress(curveAddress).storeAddress(master).storeRef(walletCode).endCell();
  const init = ton.beginCell().storeUint(0,2).storeUint(1,1).storeRef(walletCode).storeUint(1,1).storeRef(walletData).storeUint(0,1).endCell();
  const walletAddress = new ton.Address(0, init.hash());
  const wallet = await SmartContract.fromCell(walletCode, walletData); wallet.setC7Config({ myself: walletAddress });
  const initBody = ton.beginCell().storeUint(0x414e4c01,32).storeUint(1,64).storeAddress(master).storeAddress(walletAddress)
    .storeRef(ton.beginCell().storeAddress(dex).storeAddress(locker).storeAddress(migrator).endCell()).storeRef(walletCode).endCell();
  assert.equal((await send(curve, curveAddress, outsider, initBody)).type, 'failed');
  assert.equal((await send(curve, curveAddress, operator, initBody)).type, 'success');
  assert.equal(await state(), 1);
  assert.equal((await send(curve, curveAddress, operator, initBody)).type, 'failed');
  const supply = new BN('1000000000000000000');
  const internal = ton.beginCell().storeUint(0x178d4519,32).storeUint(2,64).storeCoins(supply)
    .storeAddress(null).storeAddress(operator).storeCoins(new BN('60000000')).storeBit(0).endCell();
  const mintBody = ton.beginCell().storeUint(21,32).storeUint(2,64).storeAddress(curveAddress)
    .storeCoins(new BN('100000000')).storeRef(internal).endCell();
  assert.equal((await send(minter, master, outsider, mintBody)).type, 'failed');
  const mint = await send(minter, master, operator, mintBody, '200000000'); assert.equal(mint.type, 'success');
  const credit = await route(wallet, walletAddress, master, mint.actionList[0]); assert.equal(credit.type, 'success');
  assert.equal((await wallet.invokeGetMethod('get_wallet_data', [])).result[0].toString(), supply.toString());
  const notice = credit.actionList.find(x => x.message?.info?.dest?.equals(curveAddress)); assert(notice);
  const deposit = await route(curve, curveAddress, walletAddress, notice); assert.equal(deposit.type, 'success');
  assert.equal(await state(), 2);
  // The existing automatic attempt is unauthorized; consume the real rejection.
  const attempt = await route(minter, master, curveAddress, deposit.actionList[0]); assert.equal(attempt.exit_code, 73);
  const buy = ton.beginCell().storeUint(0x5fcc3d14,32).storeUint(3,64).storeCoins(1).endCell();
  assert.equal((await send(curve, curveAddress, outsider, buy)).type, 'failed');
  const renounce = ton.beginCell().storeUint(3,32).storeUint(4,64).storeAddress(null).endCell();
  assert.equal((await send(minter, master, outsider, renounce)).type, 'failed');
  assert.equal((await send(minter, master, operator, renounce)).type, 'success');
  const check = ton.beginCell().storeUint(0x51c9d382,32).storeUint(5,64).endCell();
  const checkResult = await send(curve, curveAddress, outsider, check);
  const query = await route(minter, master, curveAddress, checkResult.actionList[0]); assert.equal(query.type, 'success');
  const ack = query.actionList[0];
  assert.equal((await route(curve, curveAddress, master, ack)).type, 'success');
  assert.equal(await state(), 3);
  assert.equal((await route(curve, curveAddress, master, ack)).type, 'failed', 'duplicate ack cannot reactivate');
  assert.equal((await send(minter, master, operator, mintBody)).type, 'failed', 'renounce disables mint');
  assert.equal((await send(minter, master, operator, renounce)).type, 'failed', 'renounce is permanent');
  const bought = await send(curve, curveAddress, outsider, buy, '1000000000');
  assert.equal(bought.type, 'success');
  assert(bought.actionList.some(x => x.message?.info?.dest?.equals(walletAddress)));
  return { wallet, walletAddress, curveAddress, bought, route, walletCode, outsider, master, send, curve, state, buy, operator, migrator };
}
const fixture = activation();
test('operator renounce and permissionless recovery activate the funded launchpad', async () => { await fixture; });
test('purchased Jettons settle through wallets before selling and migration', async () => {
  const { wallet, walletAddress, curveAddress, bought, route, walletCode, outsider, master, send, curve, state, buy, operator, migrator } = await fixture;
  const delivery = await route(wallet, walletAddress, curveAddress, bought.actionList.find(x => x.message?.info?.dest?.equals(walletAddress)));
  assert.equal(delivery.type, 'success', `Curve-to-wallet delivery failed (exit ${delivery.exit_code}); do not increase funding silently`);
  const buyerData = ton.beginCell().storeCoins(0).storeAddress(outsider).storeAddress(master).storeRef(walletCode).endCell();
  const buyerInit = ton.beginCell().storeUint(0,2).storeUint(1,1).storeRef(walletCode).storeUint(1,1).storeRef(buyerData).storeUint(0,1).endCell();
  const buyerWalletAddress = new ton.Address(0, buyerInit.hash());
  const buyerWallet = await SmartContract.fromCell(walletCode, buyerData); buyerWallet.setC7Config({ myself: buyerWalletAddress });
  const buyerCredit = await route(buyerWallet, buyerWalletAddress, walletAddress, delivery.actionList.find(x => x.message?.info?.dest?.equals(buyerWalletAddress)));
  assert.equal(buyerCredit.type, 'success');
  const buyerBalance = (await buyerWallet.invokeGetMethod('get_wallet_data', [])).result[0];
  assert(buyerBalance.gt(new BN(0)));
  const sellAmount = buyerBalance.divn(2);
  const sellBody = ton.beginCell().storeUint(0x0f8a7ea5,32).storeUint(6,64).storeCoins(sellAmount)
    .storeAddress(curveAddress).storeAddress(outsider).storeBit(0).storeCoins(new BN('60000000'))
    .storeBit(1).storeRef(ton.beginCell().storeCoins(1).endCell()).endCell();
  const sellerDebit = await send(buyerWallet, buyerWalletAddress, outsider, sellBody, '200000000');
  assert.equal(sellerDebit.type, 'success');
  const curveCredit = await route(wallet, walletAddress, buyerWalletAddress, sellerDebit.actionList.find(x => x.message?.info?.dest?.equals(walletAddress)));
  assert.equal(curveCredit.type, 'success');
  const sold = await route(curve, curveAddress, walletAddress, curveCredit.actionList.find(x => x.message?.info?.dest?.equals(curveAddress)));
  assert.equal(sold.type, 'success');
  assert(sold.actionList.some(x => x.message?.info?.dest?.equals(outsider) && x.message.info.value.coins.gt(new BN(0))));
  assert.equal((await buyerWallet.invokeGetMethod('get_wallet_data', [])).result[0].toString(), buyerBalance.sub(sellAmount).toString());
  const capped = await send(curve, curveAddress, outsider, buy, '1000000000000'); assert.equal(capped.type, 'success');
  assert.equal(await state(), 4);
  const migrate = ton.beginCell().storeUint(0x414e4c35,32).storeUint(7,64).endCell();
  assert.equal((await send(curve, curveAddress, outsider, migrate, '300000000')).type, 'failed');
  const migration = await send(curve, curveAddress, operator, migrate, '300000000');
  assert.equal(migration.type, 'success'); assert.equal(await state(), 5);
  assert(migration.actionList.some(x => x.message?.info?.dest?.equals(migrator)));
  assert.equal((await send(curve, curveAddress, operator, migrate, '300000000')).type, 'failed');
});
