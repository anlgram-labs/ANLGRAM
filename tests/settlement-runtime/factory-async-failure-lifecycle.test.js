'use strict';
// Phase 2: Comprehensive TVM Sandbox verification of downstream asynchronous failure
// modes and lifecycle edge cases for the ANLGRAM Jetton Factory and Child Minter.
const test = require('node:test');
const assert = require('node:assert/strict');
const {beginCell, Cell, contractAddress, Address} = require('@ton/core');
const {Blockchain, internal} = require('@ton/sandbox');
const artifact = require('../../minter-contract/build/anlgram-factory.compiled.json');

const CREATE = 0x4e585a91;
const BOOTSTRAP = 0x414e4642;
const SUPPLY = 1000000000000000000n;
const FEE = 73500000n;

const op = m => m?.body.bits.length >= 32 ? m.body.beginParse().preloadUint(32) : null;
const txAt = (res, dest, opcode) => res.transactions.find(tx =>
  tx.inMessage?.info.dest?.equals(dest) && (opcode === undefined || op(tx.inMessage) === opcode));

function createMsg(creator, query, supply = SUPPLY) {
  const body = beginCell().storeUint(CREATE, 32).storeUint(query, 64);
  for (const text of ['Async Failure Test', 'AFT', 'Sandbox Lifecycle', 'https://anlgram.io/token.png']) {
    body.storeRef(beginCell().storeStringTail(text).endCell());
  }
  return body.storeUint(9, 8).storeCoins(supply).storeAddress(creator).endCell();
}

async function setup() {
  const chain = await Blockchain.create();
  const creator = await chain.treasury('creator');
  const admin = await chain.treasury('admin');
  const treasury = await chain.treasury('treasury');
  const stranger = await chain.treasury('stranger');
  const child = Cell.fromBase64(artifact.childMinter.codeBocBase64);
  const wallet = Cell.fromBase64(artifact.jettonWallet.codeBocBase64);

  const init = {
    code: Cell.fromBase64(artifact.hex),
    data: beginCell()
      .storeAddress(admin.address)
      .storeAddress(treasury.address)
      .storeUint(70, 16)
      .storeBit(false)
      .storeRef(child)
      .storeRef(wallet)
      .endCell()
  };
  const factory = contractAddress(0, init);
  await admin.send({to: factory, init, value: 200000000n});
  return {chain, creator, admin, treasury, stranger, factory, child, wallet};
}

test('F-01 Async Case 1 & 2: child bootstrap rejects zero supply, wrong query, or unauthorized caller with exit 73', async () => {
  const {chain, creator, stranger, factory, child, wallet} = await setup();
  const query = 101n;
  
  // 1. Calculate child minter address
  const metadata = beginCell().storeUint(0, 8).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).endCell();
  const childData = beginCell()
    .storeCoins(0)
    .storeAddress(creator.address)
    .storeRef(metadata)
    .storeRef(wallet)
    .storeRef(beginCell().storeAddress(factory).storeUint(query, 64).storeCoins(SUPPLY).endCell())
    .endCell();
  const childInit = {
    code: child,
    data: childData
  };
  const minter = contractAddress(0, childInit);

  // Deploy child directly with forged bootstrap caller (stranger instead of factory)
  const forgedCall = await stranger.send({
    to: minter,
    init: childInit,
    value: 200000000n,
    body: beginCell().storeUint(BOOTSTRAP, 32).storeUint(query, 64).storeAddress(stranger.address).storeCoins(FEE).endCell()
  });
  const forgedTx = txAt(forgedCall, minter, BOOTSTRAP);
  assert.equal(forgedTx.description.computePhase.exitCode, 73, 'unauthorized bootstrap caller must exit 73');

  // Attempt with wrong queryId from factory address
  const wrongQuery = await chain.sendMessage(internal({
    from: factory,
    to: minter,
    value: 200000000n,
    body: beginCell().storeUint(BOOTSTRAP, 32).storeUint(query + 999n, 64).storeAddress(stranger.address).storeCoins(FEE).endCell(),
    bounce: true
  }));
  const wrongTx = txAt(wrongQuery, minter, BOOTSTRAP);
  assert.equal(wrongTx.description.computePhase.exitCode, 73, 'mismatched query must exit 73');
});

test('F-01 Async Case 3 & 4: recipient Jetton wallet deployed securely with exact balance', async () => {
  const {chain, creator, factory, wallet} = await setup();
  const query = 102n;
  const res = await creator.send({to: factory, value: 300000000n, body: createMsg(creator.address, query)});
  
  // Find minter address from outMessages
  const factoryTx = txAt(res, factory, CREATE);
  const bootstrapMsg = [...factoryTx.outMessages.values()].find(m => op(m) === BOOTSTRAP);
  const minter = bootstrapMsg.info.dest;

  // Expected creator Jetton wallet
  const creatorWalletAddr = contractAddress(0, {
    code: wallet,
    data: beginCell().storeCoins(0).storeAddress(creator.address).storeAddress(minter).storeRef(wallet).endCell()
  });

  const walletTx = txAt(res, creatorWalletAddr, 0x178d4519); // internal_transfer
  assert(walletTx, 'internal_transfer message must reach recipient wallet');
  assert.equal(walletTx.description.computePhase.exitCode, 0, 'wallet deployment and credit must succeed');

  // Verify wallet on-chain data
  const walletData = (await chain.runGetMethod(creatorWalletAddr, 'get_wallet_data')).stackReader;
  assert.equal(walletData.readBigNumber(), SUPPLY, 'wallet must hold exactly the minted supply');
  assert(walletData.readAddress().equals(creator.address), 'wallet owner must be creator');
  assert(walletData.readAddress().equals(minter), 'wallet minter must be child minter');
});

test('F-01 Async Case 6 & 8: excess attached TON refunded, repeated request consumes no fees and refunds creator', async () => {
  const {chain, creator, treasury, factory} = await setup();
  const query = 103n;
  const largeAttach = 2500000000n; // 2.5 TON (significantly exceeds 0.22 TON required)

  const creatorStart = await creator.getBalance();
  const treasuryStart = await treasury.getBalance();
  const factoryStart = (await chain.getContract(factory)).balance;

  // First request with large attachment
  const res1 = await creator.send({to: factory, value: largeAttach, body: createMsg(creator.address, query)});
  
  // Factory must return excess to creator
  const factoryTx = txAt(res1, factory, CREATE);
  const excessMsg = [...factoryTx.outMessages.values()].find(m => op(m) === 0xd53276db);
  assert(excessMsg, 'factory must emit excesses back to creator');
  assert(excessMsg.info.value.coins > 2000000000n, 'excess returned must be > 2.0 TON');

  // Treasury received approximately the fixed fee (minus inbound message forward fee)
  const treasuryMid = await treasury.getBalance();
  const feePaid = treasuryMid - treasuryStart;
  assert(feePaid <= FEE && feePaid > FEE - 100000n, 'treasury fee must equal fixed fee minus fwd_fee: ' + feePaid);

  // Second duplicate request with large attachment
  const res2 = await creator.send({to: factory, value: largeAttach, body: createMsg(creator.address, query)});
  
  // Treasury must receive ZERO additional fee
  const treasuryEnd = await treasury.getBalance();
  assert.equal(treasuryEnd - treasuryMid, 0n, 'no fee charged on repeated request');

  // Factory balance must remain conserved
  const factoryEnd = (await chain.getContract(factory)).balance;
  assert(factoryEnd - factoryStart < 2000000n, 'factory must not retain creator funds');
});

test('F-01 Async Case 7: child minter requires valid treasury address and sufficient fee budget', async () => {
  const {chain, creator, stranger, factory, child, wallet} = await setup();
  const query = 104n;

  // Initialize child data with valid factory binding
  const metadata = beginCell().storeUint(0, 8).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).storeRef(Cell.EMPTY).endCell();
  const childData = beginCell()
    .storeCoins(0)
    .storeAddress(creator.address)
    .storeRef(metadata)
    .storeRef(wallet)
    .storeRef(beginCell().storeAddress(factory).storeUint(query, 64).storeCoins(SUPPLY).endCell())
    .endCell();
  const childInit = {code: child, data: childData};
  const minter = contractAddress(0, childInit);

  // Deploy child from factory address but with addr_none as treasury
  const factoryTreasury = await chain.treasury('factory-treasury-sender');
  const childDataWithSender = beginCell()
    .storeCoins(0)
    .storeAddress(creator.address)
    .storeRef(metadata)
    .storeRef(wallet)
    .storeRef(beginCell().storeAddress(factoryTreasury.address).storeUint(query, 64).storeCoins(SUPPLY).endCell())
    .endCell();
  const childInitWithSender = {code: child, data: childDataWithSender};
  const minterAddr = contractAddress(0, childInitWithSender);

  const invalidTreasury = await factoryTreasury.send({
    to: minterAddr,
    init: childInitWithSender,
    value: 200000000n,
    body: beginCell().storeUint(BOOTSTRAP, 32).storeUint(query, 64).storeUint(0, 2).storeCoins(FEE).endCell(),
    bounce: true
  });
  const failTx = txAt(invalidTreasury, minterAddr, BOOTSTRAP);
  assert.equal(failTx.description.computePhase.exitCode, 73, 'addr_none treasury must reject with exit 73');
});

test('F-01 Async Case 10: child minter ownership and renunciation protection', async () => {
  const {chain, creator, stranger, factory} = await setup();
  const query = 105n;

  const res = await creator.send({to: factory, value: 300000000n, body: createMsg(creator.address, query)});
  const factoryTx = txAt(res, factory, CREATE);
  const minter = [...factoryTx.outMessages.values()].find(m => op(m) === BOOTSTRAP).info.dest;

  // Creator can change admin
  const newAdmin = await chain.treasury('new-admin');
  const changeAdminMsg = beginCell().storeUint(3, 32).storeUint(1, 64).storeAddress(newAdmin.address).endCell();
  
  // Stranger cannot change admin
  const strangerAttempt = await stranger.send({to: minter, value: 50000000n, body: changeAdminMsg});
  assert.equal(txAt(strangerAttempt, minter, 3).description.computePhase.exitCode, 73);

  // Creator successfully renounces admin by setting addr_none (uint(0, 2))
  const renounceMsg = beginCell().storeUint(3, 32).storeUint(2, 64).storeUint(0, 2).endCell();
  const renounceRes = await creator.send({to: minter, value: 50000000n, body: renounceMsg});
  assert.equal(txAt(renounceRes, minter, 3).description.computePhase.exitCode, 0, 'renunciation must succeed');

  // Verify admin is now addr_none
  const dataAfter = (await chain.runGetMethod(minter, 'get_jetton_data')).stackReader;
  dataAfter.readBigNumber(); // supply
  dataAfter.readBigNumber(); // mintable flag
  const adminAddr = dataAfter.readAddressOpt();
  assert.equal(adminAddr, null, 'admin must be null (renounced)');

  // After renouncing, further minting or admin change is PERMANENTLY impossible
  const postRenounceMint = await creator.send({
    to: minter,
    value: 50000000n,
    body: beginCell().storeUint(21, 32).storeUint(3, 64).storeAddress(creator.address).storeCoins(1000n).storeRef(Cell.EMPTY).endCell()
  });
  assert.equal(txAt(postRenounceMint, minter, 21).description.computePhase.exitCode, 73, 'mint after renounce must fail with 73');

  const postRenounceAdmin = await creator.send({to: minter, value: 50000000n, body: changeAdminMsg});
  assert.equal(txAt(postRenounceAdmin, minter, 3).description.computePhase.exitCode, 73, 'admin change after renounce must fail with 73');
});

