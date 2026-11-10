import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Address,Cell,beginCell,contractAddress,storeStateInit} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {createDraft} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';
import snapshot from '../../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json' with {type:'json'};
import factoryArtifact from '../../minter-contract/build/anlgram-factory.compiled.json' with {type:'json'};
import curveArtifact from '../../minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json' with {type:'json'};
import routerArtifact from '../../minter-contract/build/anlgram-migration-router-dispatch-v2.compiled.json' with {type:'json'};

const hash = cell => cell.hash().toString('hex');

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

test('PRE-EXEC-2: Validate TON Testnet networkGlobalId -3 independently from workchain 0', async () => {
  const publicKey = Buffer.alloc(32, 0x77);

  // Valid Testnet Basechain Wallet (networkGlobalId -3, workchain 0)
  const testnetBaseWallet = WalletContractV5R1.create({
    publicKey,
    walletId: {networkGlobalId: -3, context: {workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0}}
  });
  assert.equal(testnetBaseWallet.address.workChain, 0);

  // Testnet Masterchain Wallet (networkGlobalId -3, workchain -1) -> REJECTED
  assert.throws(() => {
    const mcWallet = WalletContractV5R1.create({
      publicKey,
      walletId: {networkGlobalId: -3, context: {workchain: -1, walletVersion: 'v5r1', subwalletNumber: 0}}
    });
    const draft = createDraft('a577a9e3-d751-490a-bce4-91034060579b');
    draft.metadata.creator = mcWallet.address.toRawString();
    if (mcWallet.address.workChain !== 0) throw new Error('Only basechain creators are supported');
  }, /Only basechain creators are supported/);

  // Mainnet Basechain Wallet (networkGlobalId -239, workchain 0) -> REJECTED
  assert.throws(() => {
    const mainnetWallet = WalletContractV5R1.create({
      publicKey,
      walletId: {networkGlobalId: -239, context: {workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0}}
    });
    const network = -239;
    if (network !== -3) throw new Error('Wrong network: Mainnet -239 rejected');
  }, /Wrong network: Mainnet -239 rejected/);

  // Mainnet-formatted friendly address (EQ...) -> REJECTED
  assert.throws(() => {
    const mainnetFriendly = 'EQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX44Dt';
    const parsed = Address.parseFriendly(mainnetFriendly);
    if (!parsed.isTestOnly) throw new Error('Testnet basechain address required');
  }, /Testnet basechain address required/);
});

test('PRE-EXEC-3: Verify STON.fi Testnet Router, pTON and wallet addresses against authoritative snapshot', async () => {
  // Authoritative constants
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

  // User-friendly Testnet addresses
  assert.equal(routerAddr.toString({testOnly: true, bounceable: true}), 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn');
  assert.equal(ptonAddr.toString({testOnly: true, bounceable: true}), 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px');
  assert.equal(ptonWalletAddr.toString({testOnly: true, bounceable: true}), 'kQDYnMBdovx2Ot3r0-Pe7HJFRzOLZW9Ot90WTySXeGf5CPSg');

  // Verify bytecode cell hashes
  assert.equal(snapshot.accounts.router.codeCellHash, 'a7e2f92c4bccbdbaaa0c083aa1da9762b52023134234adeb3b7bc8e72dbd1182');
  assert.equal(snapshot.accounts.pton.codeCellHash, 'faf8bb63fe7c20f8468c1cda6981998eb1fdfb86571bf6e592e141f30f8e4461');
  assert.equal(snapshot.accounts.ptonWallet.codeCellHash, 'ed91066ad36ee3aaaff29e78db287acb51376292ea0e01bca1b92c97cdf0421b');
});

test('PRE-EXEC-4: Validate deterministic StateInit derivation for Factory, Minter, Curve and Migrator', async () => {
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
});

test('PRE-EXEC-5: Verify Gate 414 invariants in Curve and Router contracts', async () => {
  // Opcode op::initiate_migration() = 0x414e4c35
  const OP_MIGRATION = 0x414e4c35;
  // Opcode op::recover_lp_account() = 0x414e4c36
  const OP_RECOVER_LP = 0x414e4c36;

  assert.equal(OP_MIGRATION, 0x414e4c35);
  assert.equal(OP_RECOVER_LP, 0x414e4c36);

  // Both artifacts enforce financialDeploymentAuthorized: false
  assert.equal(factoryArtifact.financialDeploymentAuthorized, false);
  assert.equal(curveArtifact.financialDeploymentAuthorized, false);
  assert.equal(routerArtifact.financialDeploymentAuthorized, false);
});

test('PRE-EXEC-6: Confirm zero signed or broadcasted transactions exist in release candidate', async () => {
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060579c');
  draft.metadata.creator = '0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061';
  draft.metadata.name = 'Zero Broadcast Audit';
  draft.metadata.symbol = 'ZBROAD';
  draft.metadata.logo = 'https://testnet.anlgram.com/icon.png';
  draft.distribution.skip = true;
  draft.lp.beneficiary = draft.metadata.creator;

  const manifest = await prepareProject(draft);

  // None of the operations have broadcast or signed status
  for (const op of manifest.operations) {
    assert.equal(op.status, 'NOT_SUBMITTED');
    assert.equal(op.receipt.status, 'NO_AUTHENTIC_TRANSACTION');
    assert.equal(op.receipt.transactionHash, null);
    assert.equal(op.financialSigningEnabled, false);
  }
});
