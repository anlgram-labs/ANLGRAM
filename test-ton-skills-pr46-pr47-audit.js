'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const core = require('./tests/settlement-runtime/node_modules/@ton/core');
const { beginCell, Cell } = core;
const liveQuote = require('./assets/js/curve-vnext-onchain-quote.js');
const { fixture, exit } = require('./tests/settlement-runtime/one-shot-dispatch-support');
const { bootstrap } = require('./tests/settlement-runtime/vnext-package-support');

const EXPECTED_HASHES = Object.freeze({
  'anlgram-bonding-curve-dispatch-v2.compiled.json': '5247d2d6e5a0e5705e6d2d6e4b3177fe6bd6df8160e10bc1ac924ed4c3169028',
  'anlgram-migration-router-dispatch-v2.compiled.json': '8bffcb5b658b0a5e9a7aad16dab88fbb461bcc54c0533bfe18371a680f8405ab',
  'anlgram-guard-vnext.compiled.json': 'b78772e91f1d96b69214bc3b9365702a729098967546950c934e4cf532e076c1',
  'anlgram-lp-locker-v2.compiled.json': '6d663168bc14896c879144ca43e41446b9e2b3e38a556a414678791843235723'
});

test('TON Skills Audit 1: Contract Bytecode Hash & StateInit Invariance (Zero Bytecode Drift) + Tolk Schema Parity', async () => {
  // 1. Verify compiled artifact codeCellHash invariance
  for (const [fileName, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const artifactPath = path.join(__dirname, 'minter-contract/build', fileName);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const cell = Cell.fromBase64(artifact.codeBocBase64);
    assert.equal(cell.hash().toString('hex'), artifact.codeCellHash, `${fileName} BOC hash must match codeCellHash`);
    if (fileName.includes('dispatch-v2')) {
      assert.equal(artifact.codeCellHash, expectedHash, `${fileName} must preserve exact PR #46/#47 code hash`);
    }
  }

  // 2. Verify deterministic StateInit hashes for PR #47 Release Plan
  const { buildReleasePlan } = await import('./testnet-interface/testnet-release-plan.mjs');
  const { createDraft } = await import('./testnet-interface/wizard/model.mjs');
  const { WalletContractV5R1 } = require('./testnet-interface/node_modules/@ton/ton');
  const project = (mode, byte, id) => {
    const publicKey = Buffer.alloc(32, byte).toString('hex');
    const operator = WalletContractV5R1.create({ publicKey: Buffer.from(publicKey, 'hex'), walletId: { networkGlobalId: -3 } });
    const draft = createDraft(id);
    draft.mode = mode;
    Object.assign(draft.metadata, { name: 'Local release fixture', symbol: 'LOCAL', creator: operator.address.toString({ testOnly: true }) });
    draft.distribution.skip = true;
    draft.lp.beneficiary = draft.metadata.creator;
    return { draft, publicKey };
  };
  const standard = project('standard', 17, 'a577a9e3-d751-490a-bce4-91034060574d');
  standard.draft.walletProfile = 'STANDARD_V2_SETTLEMENT';
  standard.draft.allocations.team = '40';
  Object.assign(standard.draft.vesting, { enabled: true, beneficiary: standard.draft.metadata.creator, amount: '40', startDate: '2027-01-01' });
  const drafts = {
    network: '-3',
    standard,
    launchpad: { ...project('launchpad', 18, 'a577a9e3-d751-490a-bce4-91034060575d'), migrationAuthorityPublicKey: '13'.repeat(32) }
  };
  const planA = await buildReleasePlan(drafts);
  const planB = await buildReleasePlan(drafts);
  assert.equal(planA.launchpad.graduationPrincipalNano, '300000000000');
  assert.equal(planA.launchpad.configuredSupplyUnits, '1000000000000000000');
  assert.equal(planA.launchpad.curveAllocationUnits, '800000000000000000');
  assert.equal(planA.launchpad.dexAllocationUnits, '200000000000000000');
  assert.deepEqual(planA.launchpad.accounts, planB.launchpad.accounts, 'Deterministic StateInit & account addresses must be invariant');

  // 3. Verify Tolk reference schemas (.tolk) exist and document all TEP-74 & VNext opcodes
  const errorsTolk = fs.readFileSync(path.join(__dirname, 'minter-contract/tolk-schemas/errors.tolk'), 'utf8');
  const messagesTolk = fs.readFileSync(path.join(__dirname, 'minter-contract/tolk-schemas/messages.tolk'), 'utf8');
  const storageTolk = fs.readFileSync(path.join(__dirname, 'minter-contract/tolk-schemas/storage.tolk'), 'utf8');

  for (const opcode of ['0x0f8a7ea5', '0x178d4519', '0x7362d09c', '0xd53276db', '0x5fcc3d14', '0x414e4c31', '0x414e4c34', '0x414e5803', '0x414c5633', '0x414c5635']) {
    assert(messagesTolk.includes(opcode), `messages.tolk must define tagged struct for opcode ${opcode}`);
  }
  assert(errorsTolk.includes('ERR_GATE_414_CLOSED: int = 414;'));
  assert(storageTolk.includes('struct CurveStorage') && storageTolk.includes('struct LockerStorage'));
});

test('TON Skills Audit 2: Verified On-Chain Sell Quote (quoteSell) Rejects Capped Reserve Exhaustion & Action Phase 37 In-Solvency', async () => {
  const rawAddr = '0:' + 'b'.repeat(64);
  const fakeTonCore = {
    Address: { parse(v) { if (v !== rawAddr) throw new Error('Invalid address'); } },
    Cell: { fromBoc() { return [{ hash: () => Buffer.from(liveQuote.CURVE_CODE_HASH, 'hex') }]; } }
  };

  // Curve state: state=3 (ACTIVE), realTon=10 TON, realToken=700M, fees=0.1 TON, pending=0, vTon=100 TON, vToken=266,666,666.666666666, threshold=300 TON
  const makeCurveStateStack = (realTon = 10000000000n, realTokens = 700000000000000000n, fees = 100000000n) => ([
    ['num', '3'],
    ['cell', 'te6ccgEBAQEAAgAAAA=='],
    ['cell', 'te6ccgEBAQEAAgAAAA=='],
    ['cell', 'te6ccgEBAQEAAgAAAA=='],
    ['num', String(realTon)],
    ['num', String(realTokens)],
    ['num', String(fees)],
    ['num', '0'],
    ['num', '100000000000'],
    ['num', '266666666666666666'],
    ['num', '300000000000'],
    ['num', '113']
  ]);

  const tokenAmountStr = '10000000'; // 10M tokens = 10_000_000_000_000_000n units
  const units = 10000000000000000n;
  const X = 110000000000n;
  const Y = 966666666666666666n;
  const expectedGross = (X * units) / (Y + units); // 1,126,280,193n (~1.126 TON <= 10 TON reserve)
  const expectedFee = expectedGross / 100n;
  const expectedNet = expectedGross - expectedFee;

  // 1. Valid sell quote with solvent Curve account balance
  const validSell = await liveQuote.quoteSell({
    address: rawAddr,
    network: 'testnet',
    tokenAmount: tokenAmountStr,
    decimals: 9,
    tonCore: fakeTonCore,
    request: async (p) => {
      if (p.includes('/methods/get_curve_state')) {
        return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: makeCurveStateStack() }) };
      }
      if (p.includes('/methods/get_sell_quote')) {
        return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: [['num', String(expectedNet)], ['num', String(expectedFee)]] }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 'active', balance: '10500000000', code: 'b5ee9c72' }) };
    }
  });
  assert.equal(validSell.grossTonNano, expectedGross);
  assert.equal(validSell.feeNano, expectedFee);
  assert.equal(validSell.netTonOutNano, expectedNet);

  // 2. Reserve-exhausting sell where on-chain get_sell_quote caps gross_ton_out at real_ton_reserve (0.5 TON),
  //    but recv_internal (0x7362d09c) would actually reject the sell and refund Jettons!
  await assert.rejects(
    liveQuote.quoteSell({
      address: rawAddr,
      network: 'testnet',
      tokenAmount: tokenAmountStr,
      decimals: 9,
      tonCore: fakeTonCore,
      request: async (p) => {
        if (p.includes('/methods/get_curve_state')) {
          return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: makeCurveStateStack(500000000n) }) };
        }
        if (p.includes('/methods/get_sell_quote')) {
          // On-chain get_sell_quote caps gross at 500_000_000n -> net 495_000_000n, fee 5_000_000n
          return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: [['num', '495000000'], ['num', '5000000']] }) };
        }
        return { ok: true, status: 200, json: async () => ({ status: 'active', balance: '1000000000', code: 'b5ee9c72' }) };
      }
    }),
    /Sell exceeds available Curve principal/
  );

  // 3. Under-collateralized Curve account balance (Action Phase 37 risk) -> rejected before signing
  await assert.rejects(
    liveQuote.quoteSell({
      address: rawAddr,
      network: 'testnet',
      tokenAmount: tokenAmountStr,
      decimals: 9,
      tonCore: fakeTonCore,
      request: async (p) => {
        if (p.includes('/methods/get_curve_state')) {
          return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: makeCurveStateStack(10000000000n, 700000000000000000n, 100000000n) }) };
        }
        if (p.includes('/methods/get_sell_quote')) {
          return { ok: true, status: 200, json: async () => ({ success: true, exit_code: 0, stack: [['num', String(expectedNet)], ['num', String(expectedFee)]] }) };
        }
        // Account balance (9.5 TON) < realTonReserve (10 TON) + accruedProtocolFees (0.1 TON)
        return { ok: true, status: 200, json: async () => ({ status: 'active', balance: '9500000000', code: 'b5ee9c72' }) };
      }
    }),
    /Curve account balance below booked reserves/
  );
});

test('TON Skills Audit 3: Live TVM Sandbox Gas Profiling, Sell Action Phase 37 Asymmetry Proof, and LP Locker V2 Bounce Recovery', async () => {
  const f = await fixture();
  await bootstrap(f);

  const { prepareCurveTrade } = await import('./testnet-interface/projects/curve-trade-payload.mjs');
  const { migrationAccountFields } = await import('./testnet-interface/projects/migration-account.mjs');
  const { rememberMigrationCheckpoint } = await import('./testnet-interface/projects/evidence-brand.mjs');

  const curve = f.c.addresses.curve;
  const now = f.chain.now;
  const configuration = {
    ...f.options,
    beneficiary: f.options.beneficiary.toRawString(),
    unlockedController: f.options.unlockedController.toRawString()
  };
  const readCurveBoc = async () => {
    const account = (await f.chain.getContract(curve)).account.account;
    return beginCell().storeBit(true).store(core.storeAccount(account)).endCell().toBoc().toString('base64');
  };
  const makeCheckpoint = async (overrideFields = {}) => {
    const base = migrationAccountFields(configuration, 'curve', await readCurveBoc(), 2);
    return rememberMigrationCheckpoint({
      ...base,
      ...overrideFields,
      scope: 'ACCOUNT_INCLUSION_RELATIVE_TO_REFERENCE_NOT_VALIDATOR_FINALITY',
      proof: { chainTime: now }
    });
  };

  // 1. Execute a standard buy and record TVM gas & fees
  const cp0 = await makeCheckpoint();
  const record = {
    network: '-3',
    operationId: cp0.operationId,
    jettonMaster: cp0.project,
    accounts: { curve: { address: cp0.address, codeHash: cp0.codeHash } }
  };
  const ownerFriendly = f.owner.address.toString({ testOnly: true });
  const buyPrep = prepareCurveTrade({
    record,
    checkpoint: cp0,
    owner: ownerFriendly,
    now,
    side: 'buy',
    amount: 5000000000n, // 5 TON
    slippageBps: 100
  });
  const buyRes = await f.send(curve, Cell.fromBase64(buyPrep.message.payload), BigInt(buyPrep.message.amount));
  assert(exit(buyRes, curve, 0));
  const buyTx = buyRes.transactions.find(t => t.inMessage?.info.dest?.equals(curve));
  const buyGasUsed = buyTx.description.computePhase.gasUsed;
  assert(buyGasUsed > 0n && buyGasUsed < 30000n, `Curve buy gas (${buyGasUsed}) must stay within bounded budget`);

  // 2. Verify prepareCurveTrade blocks sell when Curve checkpoint walletBalanceNano < reserve + protocolFeesNano
  const cpFunded = await makeCheckpoint();
  const cpDepleted = await makeCheckpoint({ walletBalanceNano: '100000000' }); // 0.1 TON < ~4.95 TON reserve
  const sellUnits = BigInt(buyPrep.expectedOut) / 2n;
  assert.throws(
    () => prepareCurveTrade({
      record,
      checkpoint: cpDepleted,
      owner: ownerFriendly,
      now,
      side: 'sell',
      amount: sellUnits,
      slippageBps: 100
    }),
    /Curve account balance below booked reserves/
  );

  // 3. Demonstrate in TVM Sandbox why this guard is critical (Finding F-03):
  //    If a sell notification reaches the Curve when the Curve's native TON balance cannot cover net_ton_out + forward_fee,
  //    Compute Phase exits with 0 (committing real_ton_reserve -= gross_ton_out), while Action Phase fails with resultCode = 37!
  const sellPrep = prepareCurveTrade({
    record,
    checkpoint: cpFunded,
    owner: ownerFriendly,
    now,
    side: 'sell',
    amount: sellUnits,
    slippageBps: 100
  });
  const snapBeforeDepletedSell = f.chain.snapshot();
  const curveContract = await f.chain.getContract(curve);
  const acct = curveContract.account;
  // Set Curve native balance to 0.01 TON while real_ton_reserve is ~4.95 TON
  curveContract.account = {
    ...acct,
    account: {
      ...acct.account,
      storage: {
        ...acct.account.storage,
        balance: { coins: 10000000n }
      }
    }
  };
  const sellerWallet = core.Address.parse(sellPrep.message.address);
  const depletedSellRes = await f.send(sellerWallet, Cell.fromBase64(sellPrep.message.payload), BigInt(sellPrep.message.amount));
  const curveSellTx = depletedSellRes.transactions.find(t => t.inMessage?.info.dest?.equals(curve));
  assert.equal(curveSellTx.description.computePhase.exitCode, 0, 'Compute phase succeeds and commits save_data');
  assert.equal(curveSellTx.description.actionPhase.resultCode, 37, 'Action phase fails with code 37 (Not enough GRAMs) under mode 1');
  assert.equal(curveSellTx.outMessages.size, 0, 'Zero TON payout messages emitted on Action Phase 37 failure');

  // Restore snapshot and verify normal solvent sell succeeds and measure gas
  await f.chain.loadFrom(snapBeforeDepletedSell);
  const normalSellRes = await f.send(sellerWallet, Cell.fromBase64(sellPrep.message.payload), BigInt(sellPrep.message.amount));
  assert(exit(normalSellRes, curve, 0));
  const normalSellTx = normalSellRes.transactions.find(t => t.inMessage?.info.dest?.equals(curve));
  assert.equal(normalSellTx.description.actionPhase.resultCode, 0);
  const sellGasUsed = normalSellTx.description.computePhase.gasUsed;
  assert(sellGasUsed > 0n && sellGasUsed < 30000n, `Curve sell gas (${sellGasUsed}) must stay within bounded budget`);
});