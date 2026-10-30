'use strict';
// Full local Sandbox compute/action/storage/bounce simulation. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Blockchain, createShardAccount } = require('@ton/sandbox');
const { Address, beginCell, Cell, internal, external, contractAddress, storeStateInit } = require('@ton/core');
const { compileFunc } = require('@ton-community/func-js');
const root = path.resolve(__dirname, '../..');
const contracts = path.join(root, 'minter-contract/contracts');
const { buildLaunchpadInitialStates } = require(path.join(root, 'minter-contract/deploy-launchpad-testnet'));
async function compile(name, source) {
  const r = await compileFunc({ targets: [name + '.fc'], sources: f => f === name + '.fc' && source != null ? source : fs.readFileSync(path.join(contracts, f), 'utf8') });
  assert.equal(r.status, 'ok', r.message); return Cell.fromBase64(r.codeBoc);
}
const codes = Promise.all([compile('anlgram-bonding-curve'), compile('jetton-wallet'), compile('anlgram-bonding-curve', execFileSync('git', ['show', '7905672:minter-contract/contracts/anlgram-bonding-curve.fc'], { cwd: root, encoding: 'utf8' }))]);
const addr = n => new Address(0, Buffer.alloc(32, n));
const curveAddress = addr(2), master = addr(3);
const supply = 1000000000000000000n;
async function setup(curveCode, walletCode, existing = false, senderTokens = supply) {
  const chain = await Blockchain.create(); chain.verbosity = { print: false, blockchainLogs: false, vmLogs: 'none', debugLogs: false };
  const buyer = await chain.treasury('buyer');
  const walletData = owner => beginCell().storeCoins(owner.equals(curveAddress) ? senderTokens : 0n).storeAddress(owner).storeAddress(master).storeRef(walletCode).endCell();
  const buyerWallet = contractAddress(0, { code: walletCode, data: walletData(buyer.address) });
  // Wallet addresses use zero initial token balance even when preloaded funded.
  const zeroCurveData = beginCell().storeCoins(0n).storeAddress(curveAddress).storeAddress(master).storeRef(walletCode).endCell();
  const actualCurveWallet = contractAddress(0, { code: walletCode, data: zeroCurveData });
  const states = buildLaunchpadInitialStates({ adminAddress: addr(1), curveAddress, minterAddress: master, lpLockerAddress: addr(4), migrationRouterAddress: addr(5), dexRouterAddress: addr(6), ptonMinterAddress: addr(7), jettonWalletCode: walletCode }, require('@ton/core'));
  const data = beginCell().storeUint(3,8).storeUint(100,16)
    .storeRef(beginCell().storeAddress(addr(1)).storeAddress(addr(1)).storeAddress(addr(1))
      .storeRef(beginCell().storeAddress(master).storeAddress(actualCurveWallet).storeAddress(addr(6))
        .storeRef(beginCell().storeAddress(addr(4)).storeAddress(addr(5)).endCell()).endCell()).endCell())
    .storeRef(states.bondingCurveData.refs[1]).storeRef(states.bondingCurveData.refs[2]).endCell();
  await chain.setShardAccount(curveAddress, createShardAccount({ address: curveAddress, code: curveCode, data, balance: 50000000n }));
  await chain.setShardAccount(actualCurveWallet, createShardAccount({ address: actualCurveWallet, code: walletCode, data: walletData(curveAddress), balance: 10000000n }));
  if (existing) await chain.setShardAccount(buyerWallet, createShardAccount({ address: buyerWallet, code: walletCode, data: walletData(buyer.address), balance: 10000000n }));
  const buy = (value = 1000000000n, query = 1n) => buyer.send({ to: curveAddress, value, bounce: true,
    body: beginCell().storeUint(0x5fcc3d14,32).storeUint(query,64).storeCoins(1).endCell() });
  return { chain, buyer, buyerWallet, curveWallet: actualCurveWallet, buy };
}
function summary(result) {
  return result.transactions.map(tx => ({ account: tx.inMessage?.info.dest?.toString(), value: tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.value.coins.toString() : null,
    fees: tx.totalFees.coins.toString(), aborted: tx.description.aborted, compute: tx.description.computePhase?.type === 'vm' ? tx.description.computePhase.exitCode : null,
    action: tx.description.actionPhase?.resultCode, deployed: tx.oldStatus !== 'active' && tx.endStatus === 'active',
    inboundForwardFee: tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.forwardFee.toString() : null,
    storageFee: tx.description.storagePhase?.storageFeesCollected?.toString(),
    gasFee: tx.description.computePhase?.type === 'vm' ? tx.description.computePhase.gasFees.toString() : null,
    actionForwardFees: tx.description.actionPhase?.totalFwdFees?.toString() }));
}
test('baseline demonstrates actual sender Jetton wallet rejection 709', async () => {
  const [, wallet, baseline] = await codes; const s = await setup(baseline, wallet); const result = await s.buy();
  console.log('BASELINE', JSON.stringify(summary(result)));
  assert(result.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 709));
});
for (const existing of [false, true]) test(`purchase settles with ${existing ? 'existing' : 'new'} recipient wallet without spending prior curve balance`, async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet, existing); const before = (await s.chain.getContract(curveAddress)).balance;
  const result = await s.buy(); console.log('CURRENT', existing, JSON.stringify(summary(result)));
  const recipient = await s.chain.getContract(s.buyerWallet);
  assert.equal(recipient.accountState?.type, 'active');
  const balance = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber(); assert(balance > 0n);
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  const booked = state.stack[4].value + state.stack[6].value;
  assert.equal(state.stack[4].value, 950400000n);
  assert.equal(state.stack[6].value, 9600000n);
  assert.equal(state.stack[7].value, 0n);
  assert(result.transactions.some(tx => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.dest.equals(s.buyer.address) && tx.inMessage.info.value.coins > 1000000n), 'operational excess returns to buyer');
  assert.equal((await s.chain.getContract(curveAddress)).balance, before + booked, 'all unbooked input is refunded after compute/action fees; prior funds untouched');
  console.log('BALANCES', existing, JSON.stringify({ curveBefore: before.toString(), curveAfter: (await s.chain.getContract(curveAddress)).balance.toString(),
    sourceWalletAfter: (await s.chain.getContract(s.curveWallet)).balance.toString(), recipientWalletAfter: recipient.balance.toString(),
    liquidity: state.stack[4].value.toString(), protocolFee: state.stack[6].value.toString(), buyerTokens: balance.toString() }));
  assert(!result.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 709));
});
test('insufficient buyer input is rejected without reserve or token changes', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet);
  const result = await s.buy(45000000n);
  assert(result.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 405));
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  assert.equal(state.stack[4].value, 0n); assert.equal(state.stack[6].value, 0n);
  assert.equal((await s.chain.getContract(s.buyerWallet)).accountState?.type, 'uninit');
});
test('capped buy refunds the exact unspent input and delivers the full curve inventory', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet);
  const result = await s.buy(1000000000000n);
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  assert.equal(state.stack[4].value, 500000000000n); assert.equal(state.stack[5].value, 0n);
  const recipient = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(recipient, 800000000000000000n);
  const fees = state.stack[6].value;
  const expected = 1000000000000n - 40000000n - state.stack[4].value - fees;
  assert(result.transactions.some(tx => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.src.equals(curveAddress) && tx.inMessage.info.dest.equals(s.buyer.address) && tx.inMessage.info.value.coins === expected));
});
test('repeated query id is a new paid purchase, not replay protection', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet);
  await s.buy(); const balance1 = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  await s.buy(); const balance2 = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert(balance2 > balance1);
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  assert.equal(state.stack[4].value, 1900800000n); assert.equal(state.stack[6].value, 19200000n);
  assert.equal(state.stack[7].value, 0n);
});
test('actual truncated first-hop bounce retains buyer token entitlement without double credit', async () => {
  const [curve, wallet] = await codes;
  // Explicit fault injection: authentic sender wallet has insufficient tokens.
  // This tests bounce handling, not healthy custody or a real deployment.
  const s = await setup(curve, wallet, false, 0n);
  const result = await s.buy();
  assert(result.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 706));
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  assert(state.stack[7].value > 0n);
  const bounce = result.transactions.find(tx => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.bounced && tx.inMessage.info.dest.equals(curveAddress));
  assert(bounce); assert.equal(bounce.description.aborted, false);
  const amount = state.stack[7].value;
  const claim = () => s.buyer.send({ to: curveAddress, value: 40000000n, bounce: true,
    body: beginCell().storeUint(0x414e4c34,32).storeUint(9,64).endCell() });
  await claim(); // injected shortage still present: failed claim re-escrows.
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, amount);
  // Deliberate synthetic replay of the already-consumed bounce; no new claim.
  const replay = await s.chain.sendMessage(bounce.inMessage);
  assert.equal(replay.transactions.find(tx => tx.inMessage?.info.dest?.equals(curveAddress)).description.aborted, false);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, amount);
  // Clear the deliberately injected shortage in the local fixture, then use
  // the actual public claim path and route all resulting wallet transactions.
  const fundedData = beginCell().storeCoins(supply).storeAddress(curveAddress).storeAddress(master).storeRef(wallet).endCell();
  const prior = await s.chain.getContract(s.curveWallet);
  await s.chain.setShardAccount(s.curveWallet, createShardAccount({ address: s.curveWallet, code: wallet, data: fundedData, balance: prior.balance }));
  await claim();
  assert.equal((await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber(), amount);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, 0n);
  const again = await claim();
  assert(again.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 409));
});
test('frozen recipient failure restores sender tokens but cannot authorize a Curve refund', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet);
  // Explicit local frozen-account fixture: state contains a previous token
  // balance, so the zero-balance StateInit supplied by transfer cannot unfreeze it.
  const data = beginCell().storeCoins(42n).storeAddress(s.buyer.address).storeAddress(master).storeRef(wallet).endCell();
  const frozen = createShardAccount({ address: s.buyerWallet, code: wallet, data, balance: 10000000n });
  const stateHash = beginCell().store(storeStateInit({ code: wallet, data })).endCell().hash();
  frozen.account.storage.state = { type: 'frozen', stateHash: BigInt('0x' + stateHash.toString('hex')) };
  await s.chain.setShardAccount(s.buyerWallet, frozen);
  const result = await s.buy();
  const failed = result.transactions.find(tx => tx.inMessage?.info.dest?.equals(s.buyerWallet));
  assert(failed); assert.equal(failed.description.aborted, true);
  const restored = result.transactions.find(tx => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.bounced && tx.inMessage.info.dest.equals(s.curveWallet));
  assert(restored); assert.equal(restored.description.aborted, false);
  assert.equal((await s.chain.runGetMethod(s.curveWallet, 'get_wallet_data')).stackReader.readBigNumber(), supply);
  assert.equal((await s.chain.getContract(s.buyerWallet)).accountState.type, 'frozen');
  const state = await s.chain.runGetMethod(curveAddress, 'get_curve_state');
  assert.equal(state.stack[7].value, 0n, 'absence of a success notice is not failure proof at Curve');
  const claim = await s.buyer.send({ to: curveAddress, value: 40000000n, bounce: true,
    body: beginCell().storeUint(0x414e4c34,32).storeUint(90,64).endCell() });
  assert(claim.transactions.some(tx => tx.description.computePhase?.type === 'vm' && tx.description.computePhase.exitCode === 409));
  console.log('RECIPIENT_FAILURE_BLOCKER: sender custody restored, Curve receives no authenticated failure receipt; no refund authorized.');
});

for (const [malformed, forward] of [[false,50000000n], [true,45000000n], [true,50000000n], [true,60000000n]]) test(`actual buy then ${malformed ? 'malformed sell refund' : 'sell payout'} (${forward} nanoTON) reconciles wallet ownership and reserves`, async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet);
  await s.buy();
  const tokens = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  const before = (await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack;
  const priorTon = (await s.chain.getContract(curveAddress)).balance;
  const payload = malformed ? beginCell().storeUint(15, 4).endCell() : beginCell().storeCoins(0).endCell();
  const result = await s.buyer.send({ to: s.buyerWallet, value: 100000000n, bounce: true,
    body: beginCell().storeUint(0x0f8a7ea5,32).storeUint(100,64).storeCoins(tokens).storeAddress(curveAddress)
      .storeAddress(s.buyer.address).storeBit(false).storeCoins(forward).storeBit(true).storeRef(payload).endCell() });
  const failures = result.transactions.filter(tx => tx.description.computePhase?.type === 'vm' && ![0,1].includes(tx.description.computePhase.exitCode));
  assert.deepEqual(failures.map(tx => tx.description.computePhase.exitCode), [], JSON.stringify(summary(result)));
  const after = (await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack;
  const balance = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  const custody = (await s.chain.runGetMethod(s.curveWallet, 'get_wallet_data')).stackReader.readBigNumber();
  if (malformed) {
    assert.equal(balance, tokens); assert.equal(custody, supply - tokens);
    for (const i of [4,5,6,7]) assert.equal(after[i].value, before[i].value);
    assert.equal((await s.chain.getContract(curveAddress)).balance, priorTon, 'refund consumes no protected balance and returns unused gas');
  } else {
    assert.equal(balance, 0n); assert.equal(custody, supply);
    const gross = (before[4].value + before[8].value) * tokens / (before[5].value + before[9].value + tokens);
    const fee = gross * 100n / 10000n;
    assert.equal(after[4].value, before[4].value - gross); assert.equal(after[6].value, before[6].value + fee);
    assert(result.transactions.some(tx => tx.inMessage?.info.type === 'internal' && tx.inMessage.info.src.equals(curveAddress) &&
      tx.inMessage.info.dest.equals(s.buyer.address) && tx.inMessage.info.value.coins === gross - fee));
  }
});

test('malformed sell with underfunded notification escrows actual tokens and permits exactly one funded claim', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet); await s.buy();
  const amount = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  await s.buyer.send({ to: s.buyerWallet, value: 100000000n, bounce: true,
    body: beginCell().storeUint(0x0f8a7ea5,32).storeUint(101,64).storeCoins(amount).storeAddress(curveAddress)
      .storeAddress(s.buyer.address).storeBit(false).storeCoins(20000000n).storeBit(true).storeRef(beginCell().storeUint(15,4).endCell()).endCell() });
  assert.equal((await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber(), 0n);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, amount);
  const claim = () => s.buyer.send({ to: curveAddress, value: 40000000n, bounce: true, body: beginCell().storeUint(0x414e4c34,32).storeUint(102,64).endCell() });
  await claim();
  assert.equal((await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber(), amount);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, 0n);
  const again = await claim(); assert(again.transactions.some(t => t.description.computePhase?.exitCode === 409));
});

test('actual immediate refund first-hop bounce re-escrows once and recovers after wallet fault is cleared', async () => {
  const [curve, wallet] = await codes; const s = await setup(curve, wallet); await s.buy();
  const amount = (await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  const body = beginCell().storeUint(0x0f8a7ea5,32).storeUint(103,64).storeCoins(amount).storeAddress(curveAddress)
    .storeAddress(s.buyer.address).storeBit(false).storeCoins(50000000n).storeBit(true).storeRef(beginCell().storeUint(15,4).endCell()).endCell();
  const message = external({ to: s.buyer.address, body: s.buyer.createTransfer({ messages: [internal({ to: s.buyerWallet, value: 100000000n, bounce: true, body })], sendMode: 1 }) });
  let injected = false, bounce;
  for await (const tx of await s.chain.sendMessageIter(message)) {
    if (!injected && tx.inMessage?.info.dest?.equals(curveAddress)) {
      // Explicit local account freeze between sell notification and refund.
      // Actual custody is preserved; the next real wallet message must bounce.
      const prior = await s.chain.getContract(s.curveWallet);
      const data = beginCell().storeCoins(supply).storeAddress(curveAddress).storeAddress(master).storeRef(wallet).endCell();
      const frozen = createShardAccount({ address: s.curveWallet, code: wallet, data, balance: prior.balance });
      frozen.account.storage.state = { type: 'frozen', stateHash: BigInt('0x' + beginCell().store(storeStateInit({ code: wallet, data })).endCell().hash().toString('hex')) };
      await s.chain.setShardAccount(s.curveWallet, frozen); injected = true;
    }
    if (tx.inMessage?.info.type === 'internal' && tx.inMessage.info.bounced && tx.inMessage.info.dest.equals(curveAddress)) bounce = tx.inMessage;
  }
  assert(injected); assert(bounce);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, amount);
  await s.chain.sendMessage(bounce); // deliberately replay consumed authentic bounce
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, amount);
  const prior = await s.chain.getContract(s.curveWallet);
  await s.chain.setShardAccount(s.curveWallet, createShardAccount({ address: s.curveWallet, code: wallet,
    data: beginCell().storeCoins(supply).storeAddress(curveAddress).storeAddress(master).storeRef(wallet).endCell(), balance: prior.balance }));
  await s.buyer.send({ to: curveAddress, value: 40000000n, bounce: true, body: beginCell().storeUint(0x414e4c34,32).storeUint(104,64).endCell() });
  assert.equal((await s.chain.runGetMethod(s.buyerWallet, 'get_wallet_data')).stackReader.readBigNumber(), amount);
  assert.equal((await s.chain.runGetMethod(s.curveWallet, 'get_wallet_data')).stackReader.readBigNumber(), supply - amount);
  assert.equal((await s.chain.runGetMethod(curveAddress, 'get_curve_state')).stack[7].value, 0n);
});
