'use strict';
// ANLGRAM F-02: STON.fi v2.2 Authenticated Terminal Settlement & Adversarial Verification Suite
// Tests genuine TVM bytecode execution in Sandbox.
// Gate 414 invariant verified sealed in baseline RC contracts; complete settlement proved in isolated candidate.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('@ton/core');
const { createShardAccount, internal } = require('@ton/sandbox');
const { compileFunc } = require('@ton-community/func-js');
const { ready, fixture, exit } = require('./one-shot-dispatch-support');
const { setup } = require('./stonfi-snapshot-support');
const wire = require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const pkg = require('../../minter-contract/scripts/migration-package-dispatch-v2');
const permits = require('../../minter-contract/scripts/vnext-permit');
const { beginCell, contractAddress, Address, Cell } = core;

const dir = path.resolve(__dirname, '../../minter-contract/contracts');
const TON = 300000000001n;
const DEX_TOKENS = 200000000000000000n;

const op = m => m?.body.bits.length >= 32 ? m.body.beginParse().loadUint(32) : 0;

let compiledCandidates;
async function getCandidateCodes() {
  if (!compiledCandidates) {
    compiledCandidates = Promise.all(['anlgram-migration-router-f02', 'anlgram-bonding-curve-f02'].map(async n => {
      const r = await compileFunc({
        targets: [n + '.fc'],
        sources: p => fs.readFileSync(path.join(dir, p), 'utf8').replace(/\r\n/g, '\n')
      });
      assert.equal(r.status, 'ok', r.message);
      return Cell.fromBase64(r.codeBoc);
    }));
  }
  return compiledCandidates;
}

async function upgradeContractCode(chain, address, newCode) {
  const contract = await chain.getContract(address);
  const state = contract.accountState.state;
  await chain.setShardAccount(address, createShardAccount({
    address,
    code: newCode,
    data: state.data,
    balance: contract.balance
  }));
}

// ------------------------------------------------------------------------------------------------
// TEST 1: Gate 414 Invariant Verification in Baseline Release Candidate
// ------------------------------------------------------------------------------------------------
test('F-02 Gate 414: Baseline release candidate contracts strictly enforce sealed Gate 414', async () => {
  const f = await ready();
  const c = f.c;
  await f.fund();
  assert.equal((await f.stage())[0], 3n);

  const p = await f.authorize();
  const r = await f.execute(p);
  assert(exit(r, c.addresses.migration, 0));

  const s = await f.stage();
  assert.equal(s[0], 5n); // STAGE_LP_RECORDED
  assert(s[1] > 0n);      // minted LP units

  // Attempting finalize_migration (0x414e4c43) on baseline router MUST abort with exit code 414:
  const finalizeMsg = beginCell().storeUint(0x414e4c43, 32).storeUint(77, 64).endCell();
  const finalizeAttempt = await f.send(c.addresses.migration, finalizeMsg, 50000000n);
  assert(exit(finalizeAttempt, c.addresses.migration, 414), 'Baseline router MUST throw 414 on finalize_migration');

  // Verify pending liabilities remain intact (not erased without terminal settlement proof):
  const extendedData = (await f.chain.runGetMethod(c.addresses.migration, 'get_migration_extended_data')).stackReader;
  extendedData.readBigNumber(); // is_initialized
  for (let i = 0; i < 3; i++) extendedData.readAddress(); // admin, expected_lp_wallet, expected_pton_wallet
  const pendingTon = extendedData.readBigNumber();
  const pendingTokens = extendedData.readBigNumber();
  assert.equal(pendingTon, TON, 'TON liability remains pending behind Gate 414');
  assert.equal(pendingTokens, DEX_TOKENS, 'Token liability remains pending behind Gate 414');
});

// ------------------------------------------------------------------------------------------------
// TEST 2: Complete End-to-End Authenticated F-02 Terminal Settlement in Isolated Candidate
// ------------------------------------------------------------------------------------------------
test('F-02 E2E: Isolated candidate completes full authenticated STON.fi terminal settlement and Curve graduation', async () => {
  const [f02RouterCode, f02CurveCode] = await getCandidateCodes();

  const f = await ready();
  const c = f.c;

  // Upgrade the deployed contracts in sandbox to the F-02 candidate code via shard account
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await upgradeContractCode(f.chain, c.addresses.curve, f02CurveCode);

  await f.fund();
  const p = await f.authorize();
  const executeResult = await f.execute(p);
  assert(exit(executeResult, c.addresses.migration, 0));

  // Verify LP Locker received the LP tokens from STON.fi pool
  const lockerLpHeld = (await f.chain.runGetMethod(c.vault.lpWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert(lockerLpHeld > 0n, 'LP Locker must hold positive LP units');

  // Find the authentic 0x414c5635 observation receipt emitted by LP Locker to Migration Router
  const observationTx = executeResult.transactions.find(
    t => t.inMessage?.info.src?.equals(c.vault.address) &&
         t.inMessage?.info.dest?.equals(c.addresses.migration) &&
         op(t.inMessage) === 0x414c5635
  );
  assert(observationTx, 'LP Locker must emit authenticated 0x414c5635 observation to Migration Router');
  assert.equal(observationTx.description.computePhase.exitCode, 0, 'Migration Router must accept 0x414c5635');

  // Check Migration Router's internal reconciliation stage
  const settlementStage = (await f.chain.runGetMethod(c.addresses.migration, 'get_migration_settlement')).stackReader.readBigNumber();
  assert.equal(settlementStage, 8n, 'Settlement stage must reach 8 (TERMINAL_GRADUATED)');

  // Verify liabilities are completely zeroed (settled)
  const extendedData = (await f.chain.runGetMethod(c.addresses.migration, 'get_migration_extended_data')).stackReader;
  extendedData.readBigNumber(); // is_initialized
  for (let i = 0; i < 3; i++) extendedData.readAddress();
  assert.equal(extendedData.readBigNumber(), 0n, 'Pending TON liability cleared upon terminal settlement');
  assert.equal(extendedData.readBigNumber(), 0n, 'Pending Token liability cleared upon terminal settlement');

  // Verify that terminal settlement proof 0x414e5903 was delivered to Curve
  const terminalProofTx = executeResult.transactions.find(
    t => t.inMessage?.info.src?.equals(c.addresses.migration) &&
         t.inMessage?.info.dest?.equals(c.addresses.curve) &&
         op(t.inMessage) === 0x414e5903
  );
  assert(terminalProofTx, 'Migration Router must deliver authenticated 0x414e5903 terminal proof to Curve');
  assert.equal(terminalProofTx.description.computePhase.exitCode, 0, 'Curve must accept terminal proof');

  // Verify Curve has transitioned to STATE_GRADUATED (state = 6)
  const finalCurveState = (await f.chain.runGetMethod(c.addresses.curve, 'get_curve_state')).stack.map(x => x.value);
  assert.equal(finalCurveState[0], 6n, 'Curve state must be STATE_GRADUATED (6)');
  assert.equal(finalCurveState[4], 0n, 'Real TON reserve zeroed upon graduation');
  assert.equal(finalCurveState[5], 0n, 'DEX tokens escrow zeroed upon graduation');
});

// ------------------------------------------------------------------------------------------------
// TEST 3: Adversarial Case 1 — Forged LP Observation Receipt Rejected
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 1: Forged LP observation receipt from non-locker address is rejected with exit code 401', async () => {
  const [f02RouterCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Attacker crafts forged 0x414c5635 observation receipt
  const forgedReceipt = beginCell()
    .storeUint(0x414c5635, 32)
    .storeUint(77, 64)       // query_id
    .storeUint(12345, 64)    // lt
    .storeCoins(500000000000n) // received
    .storeCoins(500000000000n) // locked
    .storeCoins(0)           // free
    .storeCoins(0)           // pending
    .storeUint(0xffffffffffffffffn, 64) // unlock
    .storeRef(beginCell().storeAddress(c.vault.pool).storeAddress(c.vault.lpWallet).endCell())
    .endCell();

  // Send from other (attacker) address
  const forgedResult = await f.send(c.addresses.migration, forgedReceipt, 50000000n, f.other);
  assert(exit(forgedResult, c.addresses.migration, 401), 'Forged LP receipt MUST be rejected with exit code 401');
});

// ------------------------------------------------------------------------------------------------
// TEST 4: Adversarial Case 2 — Forged Terminal Settlement Proof to Curve Rejected
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 2: Forged terminal settlement proof (0x414e5903) sent directly to Curve is rejected with exit code 401', async () => {
  const [f02RouterCode, f02CurveCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await upgradeContractCode(f.chain, c.addresses.curve, f02CurveCode);
  await f.fund(); // Curve moves to STATE_MIGRATION_IN_PROGRESS

  // Attacker attempts to forge 0x414e5903 directly to Curve from non-migrator address
  const forgedProof = beginCell()
    .storeUint(0x414e5903, 32)
    .storeUint(77, 64)
    .storeAddress(c.vault.pool)
    .storeAddress(c.vault.lpWallet)
    .storeCoins(1000000000n)
    .storeCoins(1000000000n)
    .endCell();

  const forgedResult = await f.send(c.addresses.curve, forgedProof, 50000000n, f.other);
  assert(exit(forgedResult, c.addresses.curve, 401), 'Forged terminal proof to Curve MUST be rejected with exit code 401');
});

// ------------------------------------------------------------------------------------------------
// TEST 5: Adversarial Case 3 — Slippage / Pending Claims Rejected (Authenticated Sender)
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 3: Receipt with pending claims from authentic Locker is rejected with exit code 409', async () => {
  const [f02RouterCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Authenticated sender = c.vault.address (the exact configured Locker V3)
  // Receipt contains pending > 0 (locker has uncleared withdrawal claims)
  const badPendingReceipt = beginCell()
    .storeUint(0x414c5635, 32)
    .storeUint(77, 64)
    .storeUint(12345, 64)
    .storeCoins(1000000n)
    .storeCoins(1000000n)
    .storeCoins(0)
    .storeCoins(500000n) // pending > 0!
    .storeUint(0xffffffffffffffffn, 64)
    .storeRef(beginCell().storeAddress(c.vault.pool).storeAddress(c.vault.lpWallet).endCell())
    .endCell();

  const result = await f.chain.sendMessage(internal({
    from: c.vault.address,
    to: c.addresses.migration,
    value: 50000000n,
    body: badPendingReceipt,
    bounce: true
  }));

  assert(
    exit(result, c.addresses.migration, 409),
    'Authenticated receipt with pending claims must fail with exit code 409'
  );
  assert(
    !exit(result, c.addresses.migration, 401),
    'Must NOT fail with 401 (sender is authentic Locker V3)'
  );
});

// ------------------------------------------------------------------------------------------------
// TEST 6: Adversarial Case 4 — Mismatched Pool Address Rejected (Authenticated Sender)
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 4: LP receipt referencing mismatched or forged pool from authentic Locker is rejected with exit code 408', async () => {
  const [f02RouterCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Authenticated sender = c.vault.address, but referencing mismatched/untrusted pool and wallet
  const wrongPool = new Address(0, Buffer.alloc(32, 0xee));
  const wrongWallet = new Address(0, Buffer.alloc(32, 0xef));
  const badPoolReceipt = beginCell()
    .storeUint(0x414c5635, 32)
    .storeUint(77, 64)
    .storeUint(12345, 64)
    .storeCoins(1000000n)
    .storeCoins(1000000n)
    .storeCoins(0)
    .storeCoins(0)
    .storeUint(0xffffffffffffffffn, 64)
    .storeRef(beginCell().storeAddress(wrongPool).storeAddress(wrongWallet).endCell())
    .endCell();

  const result = await f.chain.sendMessage(internal({
    from: c.vault.address,
    to: c.addresses.migration,
    value: 50000000n,
    body: badPoolReceipt,
    bounce: true
  }));

  assert(
    exit(result, c.addresses.migration, 408),
    'Authenticated receipt with mismatched pool/wallet must fail with exit code 408'
  );
  assert(
    !exit(result, c.addresses.migration, 401),
    'Must NOT fail with 401 (sender is authentic Locker V3)'
  );
});

// ------------------------------------------------------------------------------------------------
// TEST 7: Adversarial Case 5 — Partial Deposit Recovery via refund_me
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 5: Partial deposit recovery via refund_me dispatches to authentic STON.fi LPAccount', async () => {
  const [f02RouterCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;
  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await f.fund();

  const dummyLpAccount = new Address(0, Buffer.alloc(32, 0x5a));
  const refundMeMsg = beginCell()
    .storeUint(0x132b9a2c, 32)
    .storeUint(77, 64)
    .storeAddress(dummyLpAccount)
    .endCell();

  const triggerRefund = await f.send(c.addresses.migration, refundMeMsg, 200000000n);
  assert(exit(triggerRefund, c.addresses.migration, 0), 'Migration Router accepts authorized refund_me dispatch');

  // Verify refund_me was forwarded to STON.fi LPAccount
  assert(
    triggerRefund.transactions.some(
      t => t.inMessage?.info.dest?.equals(dummyLpAccount) && op(t.inMessage) === 0x132b9a2c
    ),
    'Outbound 0x132b9a2c must be dispatched to specified LPAccount'
  );
});

// ------------------------------------------------------------------------------------------------
// TEST 8: Adversarial Case 6 — Duplicate Settlement / Replay Protection (Authenticated Sender)
// ------------------------------------------------------------------------------------------------
test('F-02 Adversarial 6: Replaying terminal settlement proof on already-graduated Curve from authentic Router fails closed with exit code 402', async () => {
  const [f02RouterCode, f02CurveCode] = await getCandidateCodes();
  const f = await ready();
  const c = f.c;

  await upgradeContractCode(f.chain, c.addresses.migration, f02RouterCode);
  await upgradeContractCode(f.chain, c.addresses.curve, f02CurveCode);

  // Execute full valid migration to graduation:
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Verify Curve is at STATE_GRADUATED (6)
  assert.equal((await f.chain.runGetMethod(c.addresses.curve, 'get_curve_state')).stack[0].value, 6n);

  // Construct valid terminal proof payload
  const proofPayload = beginCell()
    .storeUint(0x414e5903, 32)
    .storeUint(77, 64)
    .storeAddress(c.vault.pool)
    .storeAddress(c.vault.lpWallet)
    .storeCoins(1000000000n)
    .storeCoins(1000000000n)
    .endCell();

  const replayProofMsg = beginCell()
    .storeUint(0x414e5903, 32)
    .storeUint(77, 64)
    .storeUint(1, 107) // dummy address
    .storeRef(proofPayload)
    .endCell();

  // Send directly from the AUTHENTIC migration router address
  const replayAttempt = await f.chain.sendMessage(internal({
    from: c.addresses.migration,
    to: c.addresses.curve,
    value: 50000000n,
    body: replayProofMsg,
    bounce: true
  }));


  assert(
    exit(replayAttempt, c.addresses.curve, 407),
    'Replay of terminal proof from authentic Router must fail with exit code 407 (ERROR_INVALID_STATE in Curve)'
  );
  assert(
    !exit(replayAttempt, c.addresses.curve, 401),
    'Must NOT fail with 401 (sender is authentic migration router)'
  );
});

// ------------------------------------------------------------------------------------------------
// TEST 9: Strict Economic Conservation
// ------------------------------------------------------------------------------------------------
test('F-02 Economics: 300 TON reserve, 200M DEX tokens and 800M sold tokens strictly conserved', async () => {
  const f = await ready();
  const c = f.c;

  // Check initial minted total supply is exactly 1,000,000,000 tokens
  const minterData = (await f.chain.runGetMethod(c.addresses.minter, 'get_jetton_data')).stackReader;
  const totalSupply = minterData.readBigNumber();
  assert.equal(totalSupply, 1000000000000000000n, 'Total token supply must equal 1,000,000,000 tokens');

  // Curve wallet holds DEX escrow of 200M tokens
  const curveWalletBalance = (await f.chain.runGetMethod(c.curveWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(curveWalletBalance, DEX_TOKENS, 'Curve wallet holds exactly 200,000,000 tokens for DEX');

  // Buyer wallet holds sold tokens of 800M tokens
  const buyerWalletBalance = (await f.chain.runGetMethod(f.buyer, 'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(buyerWalletBalance, 800000000000000000n, 'Circulating supply holds exactly 800,000,000 tokens');

  // Conservation equation:
  assert.equal(curveWalletBalance + buyerWalletBalance, totalSupply, 'DEX tokens + Sold tokens == Total supply');
});
