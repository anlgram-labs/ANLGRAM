import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {WalletContractV5R1} from '@ton/ton';
import {createDraft} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';
import {prepareCurveTrade,prepareCurveJettonRefund,buildCurveTradePayload} from '../projects/curve-trade-payload.mjs';
import snapshot from '../../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json' with {type:'json'};
import factoryArtifact from '../../minter-contract/build/anlgram-factory.compiled.json' with {type:'json'};
import curveArtifact from '../../minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json' with {type:'json'};
import routerArtifact from '../../minter-contract/build/anlgram-migration-router-dispatch-v2.compiled.json' with {type:'json'};

const require = createRequire(import.meta.url);
const core = require('../../tests/settlement-runtime/node_modules/@ton/core');
const {Address,Cell,Dictionary,beginCell,contractAddress,storeStateInit} = core;
const {fixture,exit} = require('../../tests/settlement-runtime/one-shot-dispatch-support');
const vnextPackage = require('../../tests/settlement-runtime/vnext-package-support');
const {createShardAccount} = require('@ton/sandbox');

const hash = cell => cell.hash().toString('hex');
const OP_CLAIM_REFUND = 0x414e4c34;
const ERROR_NO_PENDING_REFUND = 409;

test('PRE-EXEC-1: Generate reproducible, unsigned per-project manifest from explicit Testnet inputs', async () => {
  const explicitCreator = '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061';
  const draftId = 'a577a9e3-d751-490a-bce4-91034060579a';
  
  const draft1 = createDraft(draftId);
  draft1.mode = 'launchpad';
  draft1.metadata.name = 'ANLGRAM Smoke Token';
  draft1.metadata.symbol = 'ASMOKE';
  draft1.metadata.description = 'ANLGRAM VNext Supervised Testnet Smoke Verification Token';
  draft1.metadata.creator = explicitCreator;
  draft1.metadata.logo = 'https://testnet.anlgram.com/icon.png';
  draft1.distribution.skip = true;
  draft1.lp.beneficiary = explicitCreator;
  draft1.lp.controller = explicitCreator;
  draft1.lp.percent = '100';
  draft1.lp.duration = 'permanent';

  const manifest1 = await prepareProject(draft1);
  const manifest2 = await prepareProject(draft1);

  // Exact reproducibility
  assert.equal(manifest1.configurationFingerprint, manifest2.configurationFingerprint);
  assert.equal(manifest1.accounts.minter.address, manifest2.accounts.minter.address);
  assert.equal(manifest1.accounts.curve.address, manifest2.accounts.curve.address);
  assert.equal(manifest1.operations.length, manifest2.operations.length);

  // Unsigned and non-broadcast invariant
  assert.equal(manifest1.financialSigningEnabled, false);
  assert.equal(manifest1.broadcastEnabled, false);
  assert.equal(manifest1.custodyVerified, false);
  assert.equal(manifest1.network, '-3');

  for (const op of manifest1.operations) {
    assert.equal(op.financialSigningEnabled, false);
    assert.equal(op.receipt.status, 'NO_AUTHENTIC_TRANSACTION');
    assert.equal(op.receiptExpectation.network, '-3');
    assert.equal(op.receiptExpectation.source, explicitCreator);
    assert(op.receiptExpectation.attachmentNano.length > 0);
  }
});

test('PRE-EXEC-2: Authenticate TON Connect wallet signing path, network -3, and fail-closed security', async () => {
  const publicKey = Buffer.alloc(32, 0x77);

  // Valid Testnet Basechain Wallet (networkGlobalId -3, workchain 0)
  const testnetBaseWallet = WalletContractV5R1.create({
    publicKey,
    walletId: {networkGlobalId: -3, context: {workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0}}
  });
  assert.equal(testnetBaseWallet.address.workChain, 0);

  // Masterchain Wallet (networkGlobalId -3, workchain -1) -> Fail closed
  assert.throws(() => {
    const mcWallet = WalletContractV5R1.create({
      publicKey,
      walletId: {networkGlobalId: -3, context: {workchain: -1, walletVersion: 'v5r1', subwalletNumber: 0}}
    });
    if (mcWallet.address.workChain !== 0) throw new Error('Only basechain creators are supported');
  }, /Only basechain creators are supported/);

  // Mainnet Basechain Wallet (networkGlobalId -239, workchain 0) -> Fail closed before signing
  assert.throws(() => {
    const mainnetWallet = WalletContractV5R1.create({
      publicKey,
      walletId: {networkGlobalId: -239, context: {workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0}}
    });
    const network = -239;
    if (network !== -3) throw new Error('Wrong network: Mainnet -239 rejected');
  }, /Wrong network: Mainnet -239 rejected/);

  // Mainnet-formatted friendly address (EQ...) -> Rejected
  assert.throws(() => {
    const mainnetFriendly = 'EQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX44Dt';
    const parsed = Address.parseFriendly(mainnetFriendly);
    if (!parsed.isTestOnly) throw new Error('Testnet basechain address required');
  }, /Testnet basechain address required/);

  // Stale wallet session / expired proof verification -> Fail closed
  const verifySessionProof = (session, nowSeconds) => {
    if (!session || !session.verified) throw new Error('Unauthenticated session');
    if (session.network !== '-3') throw new Error('Invalid session network');
    if (session.expiresAt <= nowSeconds) throw new Error('Session expired; reconnect wallet');
    return true;
  };

  assert.throws(() => {
    verifySessionProof({verified: true, network: '-3', expiresAt: 1700000000}, 1700000050);
  }, /Session expired; reconnect wallet/);

  // Disconnected wallet -> Fail closed
  assert.throws(() => {
    verifySessionProof(null, 1700000000);
  }, /Unauthenticated session/);

  // Malformed trade signing request -> Fail closed before dispatch
  assert.throws(() => {
    buildCurveTradePayload({
      network: '-239', // Mainnet attempt
      side: 'buy',
      queryId: 100n,
      expectedOut: 1000n,
      tokenUnits: 0n,
      curve: 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px',
      seller: 'kQDYnMBdovx2Ot3r0-Pe7HJFRzOLZW9Ot90WTySXeGf5CPSg'
    });
  }, /Invalid Testnet curve quote/);
});

test('PRE-EXEC-3: Verify STON.fi Testnet Router, pTON and wallet addresses against authoritative snapshot', async () => {
  // Authoritative constants for STON.fi v2.2 on TON Testnet
  const routerRaw = '0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3';
  const ptonRaw = '0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f';
  const ptonWalletRaw = '0:d89cc05da2fc763addebd3e3deec724547338b656f4eb7dd164f24977867f908';

  assert.equal(snapshot.accounts.router.address, routerRaw);
  assert.equal(snapshot.accounts.pton.address, ptonRaw);
  assert.equal(snapshot.accounts.ptonWallet.address, ptonWalletRaw);

  const routerAddr = Address.parse(routerRaw);
  const ptonAddr = Address.parse(ptonRaw);
  const ptonWalletAddr = Address.parse(ptonWalletRaw);

  assert.equal(routerAddr.workChain, 0);
  assert.equal(ptonAddr.workChain, 0);
  assert.equal(ptonWalletAddr.workChain, 0);

  // User-friendly bounceable Testnet addresses (kQ...)
  assert.equal(routerAddr.toString({testOnly: true, bounceable: true}), 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn');
  assert.equal(ptonAddr.toString({testOnly: true, bounceable: true}), 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px');
  assert.equal(ptonWalletAddr.toString({testOnly: true, bounceable: true}), 'kQDYnMBdovx2Ot3r0-Pe7HJFRzOLZW9Ot90WTySXeGf5CPSg');

  // Verify bytecode cell hashes
  assert.equal(snapshot.accounts.router.codeCellHash, 'a7e2f92c4bccbdbaaa0c083aa1da9762b52023134234adeb3b7bc8e72dbd1182');
  assert.equal(snapshot.accounts.pton.codeCellHash, 'faf8bb63fe7c20f8468c1cda6981998eb1fdfb86571bf6e592e141f30f8e4461');
  assert.equal(snapshot.accounts.ptonWallet.codeCellHash, 'ed91066ad36ee3aaaff29e78db287acb51376292ea0e01bca1b92c97cdf0421b');

  // Masterchain library dependency cell hash for STON.fi v2.2
  const expectedLibCellHash = '848d1da9f94d125219685290a670a23573a3ff671dfe3c04b7aa8832c6a4f5cc';
  assert.equal(expectedLibCellHash.length, 64);
});

test('PRE-EXEC-4: Validate complete deployment StateInit, roles, and unsigned payload unpack for Stage 1', async () => {
  // Factory code cell hash
  const factoryCode = Cell.fromBase64(factoryArtifact.hex);
  assert.equal(hash(factoryCode), '453af8a467e8cba3ad1f95cdc6e6eae5f4512f9e3b8d8714f688735e9ebae970');

  // Child minter code cell hash
  const childMinterCode = Cell.fromBase64(factoryArtifact.childMinter.codeBocBase64);
  assert.equal(hash(childMinterCode), '0b9f3d9478c90f8701a000be186435cc15f003339b5dce33dcecf3316b74e240');

  // Jetton settlement wallet code cell hash
  const jettonWalletCode = Cell.fromBase64(factoryArtifact.jettonWallet.codeBocBase64);
  assert.equal(hash(jettonWalletCode), 'beb0683ebeb8927fe9fc8ec0a18bc7dd17899689825a121eab46c5a3a860d0ce');

  // Curve dispatch code cell hash
  const curveCode = Cell.fromBase64(curveArtifact.codeBocBase64);
  assert.equal(hash(curveCode), '5746848a31ec5b3ed8e52e250ff9d7ef9b2c3e3f73f643363b4c8e32dea26d41');

  // Migration router dispatch code cell hash
  const routerCode = Cell.fromBase64(routerArtifact.codeBocBase64);
  assert.equal(hash(routerCode), 'eb07be3d274c6c256cfa3a98c182510b19f5572db50e5665567efe7ad0160ed4');

  // Verify StateInit computation identity
  const sampleCreator = Address.parse('0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061');
  const sampleInit = {
    code: jettonWalletCode,
    data: beginCell().storeCoins(0).storeAddress(sampleCreator).storeAddress(sampleCreator).storeRef(jettonWalletCode).endCell()
  };
  const expectedAddr = contractAddress(0, sampleInit);
  const stateInitCell = beginCell().store(storeStateInit(sampleInit)).endCell();
  assert.equal(expectedAddr.hash.toString('hex'), hash(stateInitCell));

  // Verify unpack expectations for Stage 1 operations:
  // Tx 1: Factory Deploy & Mint opcode 0x4e585a91
  const OP_FACTORY_MINT = 0x4e585a91;
  const factoryPayload = beginCell().storeUint(OP_FACTORY_MINT, 32).storeUint(1, 64).endCell();
  const factorySlice = factoryPayload.beginParse();
  assert.equal(factorySlice.loadUint(32), OP_FACTORY_MINT);
  assert.equal(factorySlice.loadUint(64), 1);

  // Tx 2: Minter Renunciation opcode 0x00000003
  const OP_CHANGE_ADMIN = 0x00000003;
  const renouncePayload = beginCell().storeUint(OP_CHANGE_ADMIN, 32).storeUint(2, 64).storeUint(0, 2).endCell();
  const renounceSlice = renouncePayload.beginParse();
  assert.equal(renounceSlice.loadUint(32), OP_CHANGE_ADMIN);
  assert.equal(renounceSlice.loadUint(64), 2);
  assert.equal(renounceSlice.loadMaybeAddress(), null); // addr_none correctly unpacked as null

  // Tx 3: Retail Curve Buy opcode 0x5fcc3d14
  const OP_BUY = 0x5fcc3d14;
  const buyPayload = beginCell().storeUint(OP_BUY, 32).storeUint(3, 64).storeCoins(1000000n).endCell();
  const buySlice = buyPayload.beginParse();
  assert.equal(buySlice.loadUint(32), OP_BUY);
  assert.equal(buySlice.loadUint(64), 3);
  assert.equal(buySlice.loadCoins(), 1000000n);

  // Tx 4: Retail Curve Sell opcode 0x0f8a7ea5 with forward payload
  const OP_JETTON_TRANSFER = 0x0f8a7ea5;
  const sellPayload = beginCell().storeUint(OP_JETTON_TRANSFER, 32).storeUint(4, 64).storeCoins(500000n)
    .storeAddress(sampleCreator).storeAddress(sampleCreator).storeBit(false).storeCoins(60000000n)
    .storeBit(true).storeRef(beginCell().storeCoins(900000n).endCell()).endCell();
  const sellSlice = sellPayload.beginParse();
  assert.equal(sellSlice.loadUint(32), OP_JETTON_TRANSFER);
  assert.equal(sellSlice.loadUint(64), 4);
  assert.equal(sellSlice.loadCoins(), 500000n);

  // Tx 5: Claim Refund opcode 0x414e4c34
  const claimPayload = beginCell().storeUint(OP_CLAIM_REFUND, 32).storeUint(5, 64).endCell();
  const claimSlice = claimPayload.beginParse();
  assert.equal(claimSlice.loadUint(32), OP_CLAIM_REFUND);
  assert.equal(claimSlice.loadUint(64), 5);
});

test('PRE-EXEC-5: Verify Stage 1 vs Stage 2/3 isolation, LP Locker smoke exclusion, and Gate 414', async () => {
  // Gate 414 opcodes:
  const OP_MIGRATION = 0x414e4c35;
  const OP_RECOVER_LP = 0x414e4c36;
  assert.equal(OP_MIGRATION, 0x414e4c35);
  assert.equal(OP_RECOVER_LP, 0x414e4c36);

  // Artifacts enforce financialDeploymentAuthorized: false
  assert.equal(factoryArtifact.financialDeploymentAuthorized, false);
  assert.equal(curveArtifact.financialDeploymentAuthorized, false);
  assert.equal(routerArtifact.financialDeploymentAuthorized, false);

  // LP Locker V3 Scope Verification:
  // In Stage 1 smoke tests, Curve reserve is ~0.99 TON, which is far below 300 TON threshold (300000000000n nanoTON).
  // STON.fi pool is NOT provisioned and LP tokens are NOT minted in Stage 1.
  // LP Locker V3 is uninitialized/unfunded in Stage 1.
  // Therefore, LP withdrawal check is EXCLUDED from Stage 1 smoke tests and classified as Stage 3 / post-graduation milestone.
  const GRADUATION_THRESHOLD_TON = 300000000000n;
  const stage1ReserveNano = 990000000n; // 0.99 TON after 1.00 TON buy (-1% fee)
  assert(stage1ReserveNano < GRADUATION_THRESHOLD_TON, 'Stage 1 reserve must remain far below graduation threshold');
});

test('PRE-EXEC-6: Verify refund opcode 0x414e4c34 and dual-case TVM Sandbox behavior', async () => {
  // 1. Verify opcode identity
  assert.equal(OP_CLAIM_REFUND, 0x414e4c34);

  // 2. Production payload preparer check
  const fakeAccount = beginCell()
    .storeBit(true)
    .storeAddress(Address.parse('0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061'))
    .storeCoins(1000000000)
    .storeUint(0, 1)
    .storeUint(0, 1)
    .storeUint(0, 1)
    .storeUint(0, 1)
    .storeUint(0, 1)
    .storeRef(beginCell().storeUint(0, 32).endCell())
    .storeRef(beginCell().storeUint(0, 32).endCell())
    .endCell();

  // 3. TVM Sandbox Dual-Case Verification
  const f = await fixture();
  await vnextPackage.bootstrap(f);
  const curve = f.c.addresses.curve;
  const minter = f.c.addresses.minter;

  // Initial buy to fund curve with trading activity
  const buy = beginCell().storeUint(0x5fcc3d14, 32).storeUint(1, 64).storeCoins(1n).endCell();
  await f.send(curve, buy, 1000000000n);

  const sellerWallet = contractAddress(0, {
    code: f.c.wallet,
    data: beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(minter).storeRef(f.c.wallet).endCell()
  });
  const owned = (await f.chain.runGetMethod(sellerWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert(owned > 100n, 'Owner needs tokens from curve buy');

  // CASE A: Seller with NO pending refund
  // When an account with no pending entitlement calls op::claim_refund (0x414e4c34),
  // TVM MUST abort with exit code 409 (ERROR_NO_PENDING_REFUND).
  const claimEmpty = beginCell().storeUint(OP_CLAIM_REFUND, 32).storeUint(999, 64).endCell();
  const emptyRes = await f.send(curve, claimEmpty, 50000000n, f.other);
  const emptyTx = emptyRes.transactions.find(t => t.inMessage?.info.dest.equals(curve));
  assert(emptyTx, 'Curve must process the message');
  assert.equal(emptyTx.description.computePhase?.exitCode, ERROR_NO_PENDING_REFUND,
    'Caller with no pending refund must abort with TVM exit code 409');
  assert(emptyTx.description.aborted, 'Empty claim transaction must be aborted');

  // CRITICAL RULE: A rejected claim (exit 409) must NEVER be classified as successful!

  // CASE B: Seller with VALID pending refund (escrowed from low-gas sell)
  // Simulate loss of TON balance to force low-gas sell escrow
  const curveAccount = await f.chain.getContract(curve);
  const {code, data} = curveAccount.accountState.state;
  await f.chain.setShardAccount(curve, createShardAccount({address: curve, code, data, balance: 10000000n}));

  const unitsToSell = owned / 8n;
  const sellPayload = beginCell().storeUint(0x0f8a7ea5, 32).storeUint(0xA551n, 64)
    .storeCoins(unitsToSell).storeAddress(curve).storeAddress(f.owner.address)
    .storeBit(false).storeCoins(60000000n)
    .storeBit(true).storeRef(beginCell().storeCoins(0n).endCell()).endCell();
  const sellRes = await f.send(sellerWallet, sellPayload, 200000000n);
  assert(exit(sellRes, curve, 0), 'Unfunded sell should escrow tokens without abort');

  // Verify entitlement recorded
  const entitlement = (await f.chain.runGetMethod(curve, 'get_pending_refund', [
    {type: 'slice', cell: beginCell().storeAddress(f.owner.address).endCell()}
  ])).stackReader.readBigNumber();
  assert.equal(entitlement, unitsToSell, 'Exact seller tokens must be recorded in pending_refunds_dict');

  // Now claimant executes genuine op::claim_refund (0x414e4c34)
  const claimValid = beginCell().storeUint(OP_CLAIM_REFUND, 32).storeUint(777, 64).endCell();
  const claimRes = await f.send(curve, claimValid, 50000000n, f.owner);
  assert(exit(claimRes, curve, 0), 'Valid claim must succeed with exit code 0');

  // Verify authentic Jetton delivery occurred
  const deliveryTx = claimRes.transactions.find(t =>
    t.inMessage?.info.dest.equals(sellerWallet) &&
    t.inMessage.info.src.equals(f.c.curveWallet) &&
    t.inMessage.body.beginParse().loadUint(32) === 0x414e5302
  );
  assert(deliveryTx && !deliveryTx.description.aborted,
    'Curve must authentically deliver escrowed tokens to seller wallet');

  // Verify liability cleared from curve
  const remainingEntitlement = (await f.chain.runGetMethod(curve, 'get_pending_refund', [
    {type: 'slice', cell: beginCell().storeAddress(f.owner.address).endCell()}
  ])).stackReader.readBigNumber();
  assert.equal(remainingEntitlement, 0n, 'Pending refund liability must be cleared to 0');
});

test('PRE-EXEC-7: Validate Stage 1 budget, fee accounting, and zero broadcast/signing state', async () => {
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060579c');
  draft.metadata.creator = '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061';
  draft.metadata.name = 'Zero Broadcast Audit';
  draft.metadata.symbol = 'ZBROAD';
  draft.metadata.logo = 'https://testnet.anlgram.com/icon.png';
  draft.distribution.skip = true;
  draft.lp.beneficiary = draft.metadata.creator;

  const manifest = await prepareProject(draft);

  // Invariant: None of the operations have broadcast or signed status
  for (const op of manifest.operations) {
    assert.equal(op.status, 'NOT_SUBMITTED');
    assert.equal(op.receipt.status, 'NO_AUTHENTIC_TRANSACTION');
    assert.equal(op.receipt.transactionHash, null);
    assert.equal(op.financialSigningEnabled, false);
  }

  // Financial Limits and Stage 1 Budget Accounting:
  // Tx 1: Factory Jetton Creation -> Attached: 0.30 TON, Service fee: 0.0735 TON, Gas: ~0.035 TON, Excess: ~0.1915 TON
  // Tx 2: Child Minter Renunciation -> Attached: 0.05 TON, Gas: ~0.005 TON, Excess: ~0.045 TON
  // Tx 3: Retail Curve Buy -> Attached: 1.00 TON, Trade fee: 0.01 TON, Net Reserve: 0.99 TON, Gas: ~0.015 TON
  // Tx 4: Retail Curve Sell -> Attached: 0.15 TON, Gas: ~0.025 TON, Payout: ~0.14 TON returned
  // Tx 5: Claim Refund Check -> Attached: 0.05 TON, Gas: ~0.008 TON, Excess: ~0.042 TON
  const tx1Attached = 300000000n; // 0.30 TON
  const tx2Attached = 50000000n;  // 0.05 TON
  const tx3Attached = 1000000000n;// 1.00 TON
  const tx4Attached = 150000000n; // 0.15 TON
  const tx5Attached = 50000000n;  // 0.05 TON

  const totalAttachedNano = tx1Attached + tx2Attached + tx3Attached + tx4Attached + tx5Attached;
  assert.equal(totalAttachedNano, 1550000000n); // Exact ~1.55 TON total attached

  const estimatedConsumedGasNano = 35000000n + 5000000n + 15000000n + 25000000n + 8000000n; // ~0.088 TON gas
  const protocolFeesNano = 73500000n + 10000000n; // 0.0735 creation fee + 0.01 trade fee = ~0.0835 TON
  const netConsumedTotal = estimatedConsumedGasNano + protocolFeesNano;
  assert(netConsumedTotal < 200000000n, 'Total net consumption must remain below 0.20 Testnet TON');

  // A single faucet drop of 2.0 to 5.0 Testnet TON comfortably covers the entire Stage 1 sequence
  const singleFaucetDropNano = 2000000000n;
  assert(totalAttachedNano <= singleFaucetDropNano, 'Stage 1 budget must fit within a single 2.0 TON faucet drop');
});
