'use strict';
/**
 * Independent AI Security Review — Non-Destructive Sandbox Verification Suite
 * Target Baseline: PR #21 (e1dacb7dd82d628064950af43e1a20cc3ec2a48f / 0c3ab18bb9455fb4753021b6fa260b826ccc852e)
 *
 * Verifies contract-level and architectural findings in local @ton/sandbox without
 * modifying any contract sources, signing transactions, or touching live networks.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('@ton/core');
const { compileFunc } = require('@ton-community/func-js');
const { setup, snap } = require('./stonfi-snapshot-support');
const pkg = require('../../minter-contract/scripts/migration-package-v2');
const lp = require('../../minter-contract/scripts/lp-locker-v2');
const wire = require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const { freeze } = require('./refund-receipts-support');

const { beginCell, contractAddress, Address } = core;
let compiledV2Codes;
let compiledLockerCodes;

async function createV2Fixture(settings = {}) {
  const chain = await setup();
  const creator = await chain.treasury('audit-creator');
  const buyer = await chain.treasury('audit-buyer');
  const other = await chain.treasury('audit-other');
  const c = pkg.build(core, {
    creator: creator.address.toRawString(),
    projectId: 'audit-review-sandbox-fixture',
    metadata: { name: 'Audit Review Token', symbol: 'AUDT' },
    operationId: 77n,
    percent: settings.percent ?? 75,
    duration: settings.duration ?? 'days180',
    beneficiary: creator.address,
    unlockedController: other.address,
  });
  const dir = path.resolve(__dirname, '../../minter-contract/contracts');
  compiledV2Codes ??= Promise.all(
    ['anlgram-migration-router-v2', 'anlgram-bonding-curve-v2'].map(async (n) => {
      const r = await compileFunc({
        targets: [n + '.fc'],
        sources: (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'),
      });
      assert.equal(r.status, 'ok', r.message);
      return core.Cell.fromBase64(r.codeBoc);
    })
  );
  const [mCode, vCode] = await compiledV2Codes;
  assert(mCode.equals(c.states.migration.code));
  assert(vCode.equals(c.states.curve.code));

  for (const [role, init] of Object.entries(c.states)) {
    await creator.send({ to: c.addresses[role], init, value: 100000000n, body: beginCell().endCell() });
  }
  await creator.send({ to: c.vault.address, init: c.vault.init, value: 100000000n, body: beginCell().endCell() });

  const send = (to, body, value = 100000000n, actor = creator) =>
    actor.send({ to, body, value, bounce: true });
  const curveState = async () =>
    (await chain.runGetMethod(c.addresses.curve, 'get_curve_state')).stack.map((x) => x.value);

  return { chain, creator, buyer, other, c, send, curveState };
}

async function createLockerFixture(percent = 75, duration = 'days180') {
  const chain = await setup();
  const owner = await chain.treasury('v2-external-provider');
  const other = await chain.treasury('v2-other');
  const dir = path.resolve(__dirname, '../../minter-contract/contracts');
  const [minterCode, walletCode, vaultCode] = await (compiledLockerCodes ??= Promise.all(
    ['anlgram-launchpad-jetton-minter', 'anlgram-settlement-wallet', 'anlgram-lp-locker-v2'].map(async (n) => {
      const r = await compileFunc({
        targets: [n + '.fc'],
        sources: (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'),
      });
      assert.equal(r.status, 'ok', r.message);
      return core.Cell.fromBase64(r.codeBoc);
    })
  ));
  const mi = {
    code: minterCode,
    data: beginCell().storeCoins(0).storeAddress(owner.address).storeRef(beginCell().endCell()).storeRef(walletCode).endCell(),
  };
  const master = contractAddress(0, mi);
  const router = Address.parse(snap.accounts.router.address);
  const pton = Address.parse(snap.accounts.pton.address);
  const wallet = (who) =>
    contractAddress(0, {
      code: walletCode,
      data: beginCell().storeCoins(0).storeAddress(who).storeAddress(master).storeRef(walletCode).endCell(),
    });
  const args = (who) => [{ type: 'slice', cell: beginCell().storeAddress(who).endCell() }];
  const ptonWallet = (await chain.runGetMethod(pton, 'get_wallet_address', args(router))).stackReader.readAddress();
  await owner.send({ to: master, value: 100000000n, init: mi, body: beginCell().endCell() });
  const mint = beginCell()
    .storeUint(0x178d4519, 32)
    .storeUint(1, 64)
    .storeCoins(1000000000000000000n)
    .storeAddress(null)
    .storeAddress(owner.address)
    .storeCoins(0)
    .storeBit(false)
    .endCell();
  await owner.send({
    to: master,
    value: 200000000n,
    body: beginCell().storeUint(21, 32).storeUint(1, 64).storeAddress(owner.address).storeCoins(100000000n).storeRef(mint).endCell(),
  });
  const vault = lp.build(core, {
    code: vaultCode,
    creator: owner.address,
    beneficiary: owner.address,
    unlockedController: other.address,
    contributor: owner.address,
    router,
    pairWallet0: wallet(router),
    pairWallet1: ptonWallet,
    operationId: 77,
    percent,
    duration,
  });
  await owner.send({ to: vault.address, value: 100000000n, init: vault.init, body: beginCell().endCell() });
  const deposit = wire.build(core, {
    owner: owner.address,
    router,
    vault: vault.address,
    tokenWallet: wallet(owner.address),
    routerTokenWallet: wallet(router),
    ptonWallet,
    operationId: 77n,
    tokenUnits: 200000000000000000n,
    tonNano: 500000000000n,
    deadline: chain.now + 1800,
    minimumLpUnits: 1n,
  });
  const read = async () => (await chain.runGetMethod(vault.address, 'get_lock_v2')).stackReader;
  return { chain, owner, other, master, router, ptonWallet, vault, deposit, read, wallet };
}

const hasExitCode = (res, address, code) =>
  res.transactions.some(
    (t) => t.inMessage?.info.dest?.equals(address) && t.description.computePhase?.exitCode === code
  );

async function bootstrapActiveCurve(f) {
  assert(hasExitCode(await f.send(f.c.addresses.curve, f.c.initCurve), f.c.addresses.curve, 0));
  const mint = beginCell()
    .storeUint(0x178d4519, 32)
    .storeUint(2, 64)
    .storeCoins(1000000000000000000n)
    .storeAddress(null)
    .storeAddress(f.creator.address)
    .storeCoins(60000000n)
    .storeBit(false)
    .endCell();
  await f.send(
    f.c.addresses.minter,
    beginCell()
      .storeUint(21, 32)
      .storeUint(2, 64)
      .storeAddress(f.c.addresses.curve)
      .storeCoins(100000000n)
      .storeRef(mint)
      .endCell(),
    200000000n
  );
  await f.send(
    f.c.addresses.minter,
    beginCell()
      .storeUint(3, 32)
      .storeUint(0x414e4c4752454e4fn, 64)
      .storeAddress(null)
      .storeAddress(f.c.addresses.curve)
      .endCell(),
    50000000n
  );
  assert.equal((await f.curveState())[0], 3n); // STATE_ACTIVE == 3
}

test('PoC F-01: Curve V2 reaching 500 TON enters irreversible STATE_GRADUATION_PENDING deadlock under pinned Guard code hash', async () => {
  const f = await createV2Fixture();
  await bootstrapActiveCurve(f);
  const curve = f.c.addresses.curve;

  // Bind Migrator V2 to Locker V2
  assert(hasExitCode(await f.send(f.c.addresses.migration, f.c.bind, 50000000n), f.c.addresses.migration, 0));

  // Buyer purchases across the 500 TON graduation threshold
  await f.send(
    curve,
    beginCell().storeUint(0x5fcc3d14, 32).storeUint(101, 64).storeCoins(1n).endCell(),
    510000000000n,
    f.buyer
  );
  const stateAfterBuy = await f.curveState();
  assert.equal(stateAfterBuy[0], 4n, 'Curve transitions to STATE_GRADUATION_PENDING (4)');
  assert.equal(stateAfterBuy[4], 500000000000n, '500 TON real reserve locked in Curve V2');

  // Verify buyer received 800M tokens
  const buyerWallet = (
    await f.chain.runGetMethod(f.c.addresses.minter, 'get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(f.buyer.address).endCell() },
    ])
  ).stackReader.readAddress();
  const buyerTokenBalBefore = (
    await f.chain.runGetMethod(buyerWallet, 'get_wallet_data')
  ).stackReader.readBigNumber();
  assert.equal(buyerTokenBalBefore, 800000000000000000n);

  // 1. Buyer cannot sell tokens back for TON once STATE_GRADUATION_PENDING (4) is reached:
  //    transfer_notification sees state != STATE_ACTIVE and only refunds Jettons, leaving 500 TON untouched.
  const sellAttempt = await f.send(
    buyerWallet,
    beginCell()
      .storeUint(0x0f8a7ea5, 32)
      .storeUint(102, 64)
      .storeCoins(100000000000000000n)
      .storeAddress(curve)
      .storeAddress(f.buyer.address)
      .storeBit(false)
      .storeCoins(60000000n)
      .storeBit(true)
      .storeRef(beginCell().storeCoins(0).endCell())
      .endCell(),
    120000000n,
    f.buyer
  );
  assert(hasExitCode(sellAttempt, curve, 0));
  const stateAfterSellAttempt = await f.curveState();
  assert.equal(stateAfterSellAttempt[4], 500000000000n, 'Real TON reserve remains 500 TON; sell blocked in state 4');

  // 2. Legacy op::initiate_migration (0x414e4c35) is unconditionally blocked with 414
  const legacyMigrate = await f.send(
    curve,
    beginCell().storeUint(0x414e4c35, 32).storeUint(77, 64).endCell(),
    600000000n,
    f.creator
  );
  assert(hasExitCode(legacyMigrate, curve, 414));

  // 3. V2 Guard handshake (0x414e5801) contacts pinned Guard (LP_AUTH_GUARD_CODE_HASH),
  //    which hardcodes allowed = 0 in 0x414e5702.
  const guardHandshake = await f.send(
    curve,
    beginCell()
      .storeUint(0x414e5801, 32)
      .storeUint(77, 64)
      .storeRef(beginCell().store(core.storeStateInit(f.c.states.guard)).endCell())
      .endCell(),
    100000000n,
    f.creator
  );
  assert(hasExitCode(guardHandshake, curve, 0));
  assert(hasExitCode(guardHandshake, f.c.addresses.guard, 0));

  // 4. Epoch priming (0x414e5802) succeeds, setting flags = 5 (bits 0 and 2), but bit 1 (Guard allowed) is 0.
  const primeEpochs = await f.send(
    curve,
    beginCell().storeUint(0x414e5802, 32).storeUint(77, 64).endCell(),
    180000000n,
    f.creator
  );
  assert(hasExitCode(primeEpochs, curve, 0));

  // 5. V2 Reserve Dispatch (0x414e5803) fails with 414 because flags (5) != 7, and Guard has no upgrade or positive path.
  const dispatchReserves = await f.send(
    curve,
    beginCell().storeUint(0x414e5803, 32).storeUint(77, 64).endCell(),
    250000000n,
    f.creator
  );
  assert(hasExitCode(dispatchReserves, curve, 414));
  assert.equal((await f.curveState())[4], 500000000000n, '500 TON remains permanently locked in Curve V2');
});

test('PoC F-02: One-shot 60-second v2_register permit permanently locks out Migrator V2 after deadline expiry', async () => {
  const f = await createV2Fixture();
  const m = f.c.addresses.migration;
  const q = 77n;
  const ton = 500000000000n;
  const tokens = 200000000000000000n;

  await f.send(m, f.c.bind, 50000000n);

  // Seed authenticated funding state in Migrator V2 to reach v2_register consumer check
  const original = (await f.chain.getContract(m)).accountState.state.data.beginParse();
  const prefix = beginCell()
    .storeBit(original.loadBit())
    .storeAddress(original.loadAddress())
    .storeAddress(original.loadAddress())
    .storeAddress(original.loadAddress());
  const a = original.loadRef().beginParse();
  const master = a.loadAddress();
  const pton = a.loadAddress();
  a.loadCoins();
  a.loadCoins();
  const admin = a.loadAddress();
  a.endParse();
  const wallets = original.loadRef();
  const flight = original.loadRef().beginParse();
  flight.loadUintBig(64);
  flight.loadUintBig(64);
  flight.loadUint(3);
  flight.loadMaybeAddress();
  flight.loadMaybeAddress();
  const inline = { parse: (s) => s.asCell(), serialize: (v, b) => b.storeSlice(v.beginParse()) };
  const ids = flight.loadDict(core.Dictionary.Keys.BigUint(64), inline);
  const fields = core.Dictionary.empty(core.Dictionary.Keys.Uint(8), core.Dictionary.Values.BigUint(256));
  for (const [i, v] of [
    [0, ton],
    [1, tokens],
    [2, ton],
    [3, tokens],
    [4, 1n],
    [5, 2n],
    [6, 3n],
  ]) {
    fields.set(i, v);
  }
  ids.set(q + (1n << 63n), beginCell().storeUint(0x4d494733, 32).storeDict(fields).storeDict(null).endCell());
  const data = prefix
    .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(ton).storeCoins(tokens).storeAddress(admin).endCell())
    .storeRef(wallets)
    .storeRef(beginCell().storeUint(q, 64).storeUint(0, 64).storeUint(0, 3).storeAddress(null).storeAddress(null).storeDict(ids).endCell())
    .endCell();
  await f.chain.setShardAccount(
    m,
    require('@ton/sandbox').createShardAccount({
      address: m,
      code: f.c.states.migration.code,
      data,
      balance: ton + 200000000n,
    })
  );

  const options = {
    starts: f.chain.now,
    deadline: f.chain.now + 60,
    minimumLpUnits: 100n,
    curveEpoch: 1n,
    fundingEpoch: 2n,
    dexEpoch: 3n,
    tonNano: ton,
    jettonUnits: tokens,
  };
  const reg1 = pkg.prepareRegistration(core, f.c, options);
  const sendAsGuard = (body) =>
    f.chain.sendMessage({
      info: {
        type: 'internal',
        ihrDisabled: true,
        bounce: true,
        bounced: false,
        src: f.c.addresses.guard,
        dest: m,
        value: { coins: 40000000n },
        ihrFee: 0n,
        forwardFee: 0n,
        createdLt: 0n,
        createdAt: f.chain.now,
      },
      body,
    });

  // First registration succeeds
  assert(hasExitCode(await sendAsGuard(reg1.body), m, 0));

  // Advance chain time by 60 seconds (e.g. operator missed 60s window or network delay)
  f.chain.now = options.deadline;

  // Permit is now expired (active == 0)
  const regState = (await f.chain.runGetMethod(m, 'get_registration_v2', [{ type: 'int', value: q }])).stackReader;
  assert.equal(regState.readBigNumber(), -1n, 'Permit remains stored in slot 0');
  assert.equal(regState.readBigNumber(), 0n, 'Permit is no longer active at deadline');

  // Attempting to register a fresh 60-second window for the same Migrator V2 instance fails with 409!
  const reg2 = pkg.prepareRegistration(core, f.c, {
    ...options,
    starts: f.chain.now,
    deadline: f.chain.now + 60,
  });
  assert(
    hasExitCode(await sendAsGuard(reg2.body), m, 409),
    'v2_register rejects any refreshed deadline because prior permit cell in used_ids[0] is write-once'
  );
});

test('PoC F-03a: Downstream recipient wallet bounce (non-zero prior stateHash) permanently traps LP tokens in Locker V2 pending state', async () => {
  const f = await createLockerFixture(75, 'days180');
  for (const m of f.deposit.messages) {
    await f.owner.send({ ...m, bounce: true });
  }
  const s0 = await f.read();
  s0.readBigNumber(); // percent
  s0.readBigNumber(); // duration
  const unlock = s0.readBigNumber();
  const totalReceived = s0.readBigNumber();
  const initialLocked = s0.readBigNumber();
  const initialFree = s0.readBigNumber();
  const initialPending = s0.readBigNumber();
  assert.equal(initialPending, 0n);
  assert(initialLocked > 1n);

  // Advance time to unlock
  f.chain.now = Number(unlock);

  const destination = (
    await f.chain.runGetMethod(f.vault.pool, 'get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(f.owner.address).endCell() },
    ])
  ).stackReader.readAddress();

  // First, beneficiary withdraws 1 unit (query_id = 1) so destination LP wallet is active with balance == 1n
  await f.owner.send({
    to: f.vault.address,
    value: 150000000n,
    bounce: true,
    body: beginCell().storeUint(0x414c5633, 32).storeUint(1, 64).storeBit(true).storeCoins(1n).endCell(),
  });
  assert.equal(
    (await f.chain.runGetMethod(destination, 'get_wallet_data')).stackReader.readBigNumber(),
    1n,
    'Destination LP wallet is initialized with non-zero balance (1n)'
  );

  // Now destination LP wallet becomes frozen (with stateHash corresponding to balance == 1n, NOT initial StateInit(balance=0))
  await freeze(f, destination);

  // Beneficiary claims the remaining locked LP tokens (query_id = 2, amount = initialLocked - 1n)
  const remainingLocked = initialLocked - 1n;
  await f.owner.send({
    to: f.vault.address,
    value: 150000000n,
    bounce: true,
    body: beginCell().storeUint(0x414c5633, 32).storeUint(2, 64).storeBit(true).storeCoins(remainingLocked).endCell(),
  });

  // 1. Because destination is frozen with stateHash(balance=1n) != hash(StateInit(balance=0)),
  //    destination bounces internal_transfer back to f.vault.lpWallet, which restores remainingLocked!
  const lockerLpWalletBalance = (
    await f.chain.runGetMethod(f.vault.lpWallet, 'get_wallet_data')
  ).stackReader.readBigNumber();
  assert.equal(
    lockerLpWalletBalance,
    totalReceived - 1n,
    'Locker LP wallet recovered all bounced remainingLocked LP tokens from frozen recipient wallet'
  );

  // 2. However, Locker V2 never received a bounce from f.vault.lpWallet!
  //    So Locker V2 permanently records locked = 0 and pending = initialLocked!
  const s1 = await f.read();
  s1.readBigNumber();
  s1.readBigNumber();
  s1.readBigNumber();
  s1.readBigNumber();
  const lockedAfter = s1.readBigNumber();
  const freeAfter = s1.readBigNumber();
  const pendingAfter = s1.readBigNumber();
  assert.equal(lockedAfter, 0n, 'Locked balance was debited to 0');
  assert.equal(freeAfter, initialFree);
  assert.equal(pendingAfter, initialLocked, 'All claimed LP tokens remain permanently stuck in pending');

  // 3. Beneficiary cannot re-claim query_id = 2 (throws 409) or query_id = 3 (throws 408 because locked == 0):
  const retrySameQuery = await f.owner.send({
    to: f.vault.address,
    value: 150000000n,
    bounce: true,
    body: beginCell().storeUint(0x414c5633, 32).storeUint(2, 64).storeBit(true).storeCoins(remainingLocked).endCell(),
  });
  assert(hasExitCode(retrySameQuery, f.vault.address, 409));

  const retryNextQuery = await f.owner.send({
    to: f.vault.address,
    value: 150000000n,
    bounce: true,
    body: beginCell().storeUint(0x414c5633, 32).storeUint(3, 64).storeBit(true).storeCoins(remainingLocked).endCell(),
  });
  assert(hasExitCode(retryNextQuery, f.vault.address, 408));
});

test('PoC F-03b: Off-chain verifyLpWithdrawalFields falsely rejects valid on-chain LP withdrawal that unfreezes an empty frozen recipient LP wallet', async () => {
  const api = await import('../../testnet-interface/projects/lp-evidence.mjs');
  const f = await createLockerFixture(75, 'days180');
  for (const m of f.deposit.messages) {
    await f.owner.send({ ...m, bounce: true });
  }
  const s0 = await f.read();
  s0.readBigNumber();
  s0.readBigNumber();
  const unlock = s0.readBigNumber();
  s0.readBigNumber();
  const initialLocked = s0.readBigNumber();
  f.chain.now = Number(unlock);

  const destination = (
    await f.chain.runGetMethod(f.vault.pool, 'get_wallet_address', [
      { type: 'slice', cell: beginCell().storeAddress(f.owner.address).endCell() },
    ])
  ).stackReader.readAddress();

  // Deploy recipient wallet with balance = 0 and freeze it (matching initial StateInit)
  const recipientInit = {
    code: f.vault.lpInit.code,
    data: beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(f.vault.pool).storeRef(f.vault.lpInit.code).endCell(),
  };
  await f.owner.send({ to: destination, init: recipientInit, value: 100000000n, body: beginCell().endCell() });
  await freeze(f, destination);

  // Record before/after Account snapshots across the withdrawal
  const addresses = [f.vault.pool, f.vault.address, f.vault.lpWallet, destination];
  const snapshot = async (a) => {
    const x = (await f.chain.getContract(a)).account.account;
    return beginCell()
      .storeBit(!!x)
      .store(x ? core.storeAccount(x) : () => {})
      .endCell()
      .toBoc()
      .toString('base64');
  };
  const m = core.internal({
    to: f.vault.address,
    value: 150000000n,
    body: beginCell().storeUint(0x414c5633, 32).storeUint(1, 64).storeBit(true).storeCoins(initialLocked).endCell(),
    bounce: true,
  });
  const iter = await f.chain.sendMessageIter({ ...m, info: { ...m.info, src: f.owner.address } });
  const rows = [];
  while (true) {
    const before = new Map(await Promise.all(addresses.map(async (a) => [a.toRawString(), await snapshot(a)])));
    const next = await iter.next();
    if (next.done) break;
    const t = next.value;
    const a = t.inMessage?.info.dest;
    if (a && addresses.some((x) => x.equals(a))) {
      rows.push({
        tx: t,
        raw: beginCell().store(core.storeTransaction(t)).endCell().toBoc().toString('base64'),
        before: before.get(a.toRawString()),
        after: await snapshot(a),
      });
    }
  }

  // On-chain, TON validly unfroze destination (because StateInit matched stateHash) and credited initialLocked!
  const destBalAfter = (await f.chain.runGetMethod(destination, 'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(destBalAfter, initialLocked, 'On-chain recipient LP wallet was validly unfrozen and credited with initialLocked');

  // Yet verifyLpWithdrawalFields throws "Active Account required" because wallet(dest.before) only checks absent/uninit!
  const policy = api.lpEvidencePolicy(beginCell().store(core.storeStateInit(f.vault.init)).endCell().toBoc().toString('base64'));
  const locker = rows.find((r) => r.tx.inMessage.info.dest.equals(f.vault.address));
  const wallet = rows.find((r) => r.tx.inMessage.info.dest.equals(f.vault.lpWallet));
  const recipient = rows.find((r) => r.tx.inMessage.info.dest.equals(destination));
  assert.equal(recipient.tx.description.computePhase.exitCode, 0, 'Recipient transaction succeeded on-chain');

  const raw = {
    lockerTransaction: locker.raw,
    walletTransaction: wallet.raw,
    recipientTransaction: recipient.raw,
    locker: { before: locker.before, after: locker.after },
    wallet: { before: wallet.before, after: wallet.after },
    recipient: { before: recipient.before, after: recipient.after },
  };
  assert.throws(
    () => api.verifyLpWithdrawalFields(policy, raw),
    /Active Account required/,
    'verifyLpWithdrawalFields falsely rejects a valid unfreeze delivery because dest.before is frozen (balance 0)'
  );
});

test('PoC F-04: Curve V2 save_data overwrites custom protocol_fee_bps with hardcoded 100 and retains unpruned completed_delivery_key records', async () => {
  const f = await createV2Fixture();
  await bootstrapActiveCurve(f);
  const curve = f.c.addresses.curve;

  // Execute 3 buys and verify completed_delivery_key entries accumulate permanently in pending_refunds_dict
  for (let i = 1; i <= 3; i++) {
    await f.send(
      curve,
      beginCell().storeUint(0x5fcc3d14, 32).storeUint(300 + i, 64).storeCoins(1n).endCell(),
      1000000000n,
      f.buyer
    );
  }

  const curveData = (await f.chain.getContract(curve)).accountState.state.data.beginParse();
  curveData.loadUint(8); // state
  const feeBps = curveData.loadUint(16);
  assert.equal(feeBps, 100);
  curveData.loadRef(); // addrs
  curveData.loadRef(); // reserves
  const dictSlice = curveData.loadRef().beginParse();
  const inline = { parse: (s) => s.asCell(), serialize: (v, b) => b.storeSlice(v.beginParse()) };
  const dict = dictSlice.loadDict(core.Dictionary.Keys.BigUint(256), inline);
  assert.equal(dict.size, 3, 'Each completed buy permanently adds an unpruned DONE delivery record to pending_refunds_dict');
});
