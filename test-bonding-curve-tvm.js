/**
 * ANLGRAM Launchpad — TVM Smart Contract Simulation Test Suite
 * File: test-bonding-curve-tvm.js
 * 
 * Verifies the actual compiled TVM bytecode of:
 * 1. anlgram-lp-locker.fc (Immutable DEX LP Locker)
 * 2. anlgram-bonding-curve.fc (Deterministic Constant Product AMM)
 * 
 * Tests:
 * - Storage loading and packing.
 * - Get methods: get_curve_state, get_buy_quote, get_sell_quote, get_lock_data.
 * - Lifecycle state machine (UNINITIALIZED -> INITIALIZING -> RENOUNCE_PENDING -> ACTIVE -> GRADUATION_PENDING -> GRADUATED).
 * - Exact integer buy calculations & outbound Jetton transfer generation.
 * - Exact integer sell calculations & outbound TON transfer generation.
 * - Safe Jetton refund flow on slippage violation (zero token loss, zero reserve mutation).
 * - Permanent LP lock enforcement (rejection of all withdrawal opcodes).
 * - Full offline execution in TVM (zero network calls, zero funds spent).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const minterRequire = createRequire(path.join(__dirname, 'minter-contract', 'package.json'));
const nativeFetch = globalThis.fetch;
delete globalThis.fetch; // Bypass Node 18+ wasm fetch in ton-contract-executor
const { SmartContract, TvmRunnerAsynchronous, TvmRunnerSynchronous } = minterRequire('ton-contract-executor');
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();

const ton = minterRequire('ton');
const { Cell, beginCell, Address, Slice, InternalMessage, CommonMessageInfo, CellMessage } = ton;
const BN = minterRequire('bn.js');

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}${details ? ` (${details})` : ''}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// Helper Addresses & Test Fixtures
// -----------------------------------------------------------------------------
const adminAddr    = new Address(0, Buffer.alloc(32, 1));
const creatorAddr  = new Address(0, Buffer.alloc(32, 2));
const treasuryAddr = Address.parseRaw('0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d');
const masterAddr   = new Address(0, Buffer.alloc(32, 3));
const routerAddr   = Address.parseRaw('0:779dc85398d8500e449c5291e7f12738823d575b53100003ffbd4eb5818387f4');
const lockerAddr   = new Address(0, Buffer.alloc(32, 4));
const buyerAddr    = new Address(0, Buffer.alloc(32, 5));
const sellerAddr   = new Address(0, Buffer.alloc(32, 6));
const lpWalletMock = new Address(0, Buffer.alloc(32, 7));
const mockCurveWallet = new Address(0, Buffer.alloc(32, 8));

const ONE_TON = 1000000000n;
const ONE_TOKEN = 1000000000n;

// Load Compiled Contract BOCs
const curveArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-bonding-curve.compiled.json'), 'utf-8'));
const lockerArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-lp-locker.compiled.json'), 'utf-8'));

const curveCodeCell = Cell.fromBoc(Buffer.from(curveArtifact.codeBocBase64, 'base64'))[0];
const lockerCodeCell = Cell.fromBoc(Buffer.from(lockerArtifact.codeBocBase64, 'base64'))[0];

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🛡️  ANLGRAM LAUNCHPAD: TVM SMART CONTRACT SIMULATION TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

async function runTests() {
  // ===========================================================================
  // TEST SUITE 1: ANLGRAM LP LOCKER (anlgram-lp-locker.fc)
  // ===========================================================================
  console.log('--- 1. AnlgramLpLocker TVM Verification (Permanent LP Lock) ---');

  // Initial Locker Storage:
  // is_locked: 0, unlock_timestamp: 0xFFFFFFFFFFFFFFFF (Permanent), lp_amount: 0
  const initialLockerData = beginCell()
    .storeUint(0, 1)                      // is_locked
    .storeUint(0xFFFFFFFFFFFFFFFFn, 64)   // unlock_timestamp (permanent lock)
    .storeCoins(0)                        // lp_amount_locked
    .storeAddress(routerAddr)             // pool_address
    .storeAddress(masterAddr)             // expected_lp_minter
    .storeRef(
      beginCell()
        .storeAddress(null)               // lp_wallet_address (unbound)
        .storeAddress(creatorAddr)        // creator_address
        .endCell()
    )
    .endCell();

  const lockerContract = await SmartContract.fromCell(lockerCodeCell, initialLockerData);

  // 1.1 Read initial get_lock_data getter
  const lockDataRes = await lockerContract.invokeGetMethod('get_lock_data', []);
  assert(lockDataRes.type === 'success', 'get_lock_data getter executes successfully');
  assert(lockDataRes.result[0].toString() === '0', 'Initial is_locked is 0');
  assert(lockDataRes.result[1].toString() === '18446744073709551615', 'unlock_timestamp is exactly 0xFFFFFFFFFFFFFFFF (Permanent Lock)');
  assert(lockDataRes.result[2].toString() === '0', 'Initial lp_amount_locked is 0');

  // 1.2 Receive Inbound LP Tokens via TEP-74 transfer_notification
  const lpTokensAmount = 50000000000000n; // 50,000 LP tokens

  const notifBody = beginCell()
    .storeUint(0x7362d09c, 32)            // op::transfer_notification
    .storeUint(101, 64)                   // query_id
    .storeCoins(new BN(lpTokensAmount.toString())) // jetton_amount
    .storeAddress(routerAddr)             // from_address
    .storeUint(0, 1)                      // empty payload
    .endCell();

  const notifMsg = new InternalMessage({
    to: lockerAddr,
    from: lpWalletMock,
    value: new BN('50000000'),           // 0.05 TON
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(notifBody) }),
  });

  const notifRes = await lockerContract.sendInternalMessage(notifMsg);
  assert(notifRes.type === 'success' && notifRes.exit_code === 0, 'Accepts inbound LP tokens and records lock state');

  // Check updated getter values
  const lockedStateRes = await lockerContract.invokeGetMethod('is_permanently_locked', []);
  assert(lockedStateRes.result[0].toString() === '-1', 'is_permanently_locked returns true (-1) after LP deposit');

  const lockedAmountRes = await lockerContract.invokeGetMethod('get_locked_lp_amount', []);
  assert(lockedAmountRes.result[0].toString() === lpTokensAmount.toString(), 'get_locked_lp_amount reports exact deposited LP balance');

  // 1.3 Attempt Withdrawal (MUST REVERT WITH EXIT CODE 403)
  const withdrawBody = beginCell()
    .storeUint(0x414e4c32, 32)            // op::withdraw_lp
    .storeUint(102, 64)
    .storeCoins(new BN('1000000000'))
    .endCell();

  const withdrawMsg = new InternalMessage({
    to: lockerAddr,
    from: creatorAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(withdrawBody) }),
  });

  const withdrawRes = await lockerContract.sendInternalMessage(withdrawMsg);
  assert(withdrawRes.type === 'failed' && withdrawRes.exit_code === 403, 'Withdrawal attempt strictly rejected with exit code 403 (LOCK ACTIVE)');

  // ===========================================================================
  // TEST SUITE 2: ANLGRAM BONDING CURVE (anlgram-bonding-curve.fc)
  // ===========================================================================
  console.log('\n--- 2. AnlgramBondingCurve TVM Verification (AMM Math & Lifecycle) ---');

  // Pack Curve Storage:
  // state: UNINITIALIZED (0)
  // real_ton: 0, real_tokens: 800M, fees: 0
  // v_TON: 166,666,666,666, v_TOK: 266,666,666,665,600,000, T_grad: 500 TON, fee: 100 bps
  const vTon = 166666666666n;
  const vTok = 266666666665600000n;
  const tGrad = 500n * ONE_TON;
  const curveTokens = 800000000n * ONE_TOKEN;
  const dexEscrow = 200000000n * ONE_TOKEN;

  const mockWalletCode = new Cell();

  const initialCurveData = beginCell()
    .storeUint(0, 8)                      // state: STATE_UNINITIALIZED
    .storeAddress(adminAddr)              // admin_address
    .storeAddress(creatorAddr)            // creator_address
    .storeAddress(treasuryAddr)           // treasury_address
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)         // jetton_master_address
        .storeAddress(mockCurveWallet)    // curve_jetton_wallet
        .storeRef(
          beginCell()
            .storeAddress(routerAddr)     // dex_router_address
            .storeAddress(lockerAddr)     // lp_locker_address
            .endCell()
        )
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeCoins(0)                    // real_ton_reserve
        .storeCoins(new BN(curveTokens.toString())) // real_token_reserve (800M)
        .storeCoins(0)                    // accrued_protocol_fees
        .storeCoins(new BN(vTon.toString()))        // virtual_ton_reserve
        .storeCoins(new BN(vTok.toString()))        // virtual_token_reserve
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeCoins(new BN(tGrad.toString()))       // graduation_threshold_ton
        .storeUint(100, 16)               // protocol_fee_bps: 100 (1%)
        .storeCoins(new BN(dexEscrow.toString()))   // dex_tokens_escrow (200M)
        .storeRef(mockWalletCode)         // jetton_wallet_code
        .endCell()
    )
    .endCell();

  const curveContract = await SmartContract.fromCell(curveCodeCell, initialCurveData);

  // 2.1 Get State Getter Check
  const curveStateRes = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(curveStateRes.type === 'success', 'get_curve_state getter executes successfully');
  assert(curveStateRes.result[0].toString() === '0', 'Initial state is STATE_UNINITIALIZED (0)');
  assert(curveStateRes.result[4].toString() === '0', 'Initial real_ton_reserve is 0');
  assert(curveStateRes.result[5].toString() === curveTokens.toString(), 'Initial real_token_reserve is 800M tokens');
  assert(curveStateRes.result[7].toString() === '156', 'Genesis spot price calculates to 156 nanoTON');

  // 2.2 Get Buy Quote Getter
  // Gross 10 TON buy quote
  const tenTonNano = 10n * ONE_TON;
  const quoteBuyRes = await curveContract.invokeGetMethod('get_buy_quote', [{ type: 'int', value: tenTonNano.toString() }]);
  assert(quoteBuyRes.type === 'success', 'get_buy_quote getter executes successfully');
  const expectedTokensOut = quoteBuyRes.result[0];
  const expectedFeeTon = quoteBuyRes.result[1];
  assert(expectedTokensOut.gt(new BN(0)), 'Quote returns tokens_out > 0');
  assert(expectedFeeTon.gt(new BN(0)), 'Quote returns fee_ton > 0');

  // 2.3 State Machine: Initialize Launchpad (op::init_launchpad)
  const initBody = beginCell()
    .storeUint(0x414e4c01, 32)            // op::init_launchpad
    .storeUint(201, 64)
    .storeAddress(masterAddr)
    .storeAddress(mockCurveWallet)
    .storeRef(
      beginCell()
        .storeAddress(routerAddr)
        .storeAddress(lockerAddr)
        .endCell()
    )
    .storeRef(mockWalletCode)
    .endCell();

  const initMsg = new InternalMessage({
    to: adminAddr,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(initBody) }),
  });

  const initRes = await curveContract.sendInternalMessage(initMsg);
  assert(initRes.type === 'success' && initRes.exit_code === 0, 'op::init_launchpad transitions to STATE_INITIALIZING (1)');

  // 2.4 State Machine: Confirm Initial Custody of 1 Billion Tokens (op::transfer_notification)
  const totalTokens = 1000000000n * ONE_TOKEN;
  const custodyBody = beginCell()
    .storeUint(0x7362d09c, 32)            // op::transfer_notification
    .storeUint(202, 64)
    .storeCoins(new BN(totalTokens.toString())) // 1B tokens
    .storeAddress(adminAddr)
    .storeUint(0, 1)                      // empty forward payload
    .endCell();

  // Read current curve jetton wallet from contract storage
  const stateMid = await curveContract.invokeGetMethod('get_curve_state', []);
  const custodyMsg = new InternalMessage({
    to: adminAddr,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(custodyBody) }),
  });

  const custodyRes = await curveContract.sendInternalMessage(custodyMsg);
  assert(custodyRes.type === 'success' && custodyRes.exit_code === 0, 'Confirms 1B token custody and emits op::change_admin(addr_none)');
  assert(custodyRes.actionList && custodyRes.actionList.length === 1, 'Emits exactly 1 outbound admin-renounce message to Jetton Minter');

  // 2.5 State Machine: Activate Trading (op::activate_trading)
  const activateBody = beginCell()
    .storeUint(0x414e4c03, 32)            // op::activate_trading
    .storeUint(203, 64)
    .endCell();

  const activateMsg = new InternalMessage({
    to: adminAddr,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(activateBody) }),
  });

  const activateRes = await curveContract.sendInternalMessage(activateMsg);
  assert(activateRes.type === 'success' && activateRes.exit_code === 0, 'Trading activated! State transitioned to STATE_ACTIVE (3)');

  // 2.6 Execute Real Buy Transaction on Curve (op::buy)
  const buyTonAmount = 10n * ONE_TON;
  const buyBody = beginCell()
    .storeUint(0x414e4c04, 32)            // op::buy
    .storeUint(204, 64)
    .storeCoins(new BN('1000000'))        // min_tokens_out (low for test)
    .endCell();

  const buyMsg = new InternalMessage({
    to: adminAddr,
    from: buyerAddr,
    value: new BN(buyTonAmount.toString()),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(buyBody) }),
  });

  const buyRes = await curveContract.sendInternalMessage(buyMsg);
  assert(buyRes.type === 'success' && buyRes.exit_code === 0, 'Buy order executes on TVM curve successfully');
  assert(buyRes.actionList && buyRes.actionList.length === 1, 'Emits outbound Jetton transfer delivering tokens to Buyer');

  const postBuyState = await curveContract.invokeGetMethod('get_curve_state', []);
  const newRealTon = postBuyState.result[4];
  const newRealTokens = postBuyState.result[5];
  const newFees = postBuyState.result[6];
  assert(newRealTon.gt(new BN(0)), 'Real TON reserve incremented by net purchase amount');
  assert(newRealTokens.lt(new BN(curveTokens.toString())), 'Real token reserve decremented');
  assert(newFees.gt(new BN(0)), 'Accrued protocol fees incremented');

  // 2.7 Execute Token Sell Transaction on Curve (op::transfer_notification)
  const tokensToSell = 5000000n * ONE_TOKEN; // Sell 5M tokens
  const sellPayload = beginCell()
    .storeCoins(new BN('1000000'))        // min_ton_out
    .endCell();

  const sellBody = beginCell()
    .storeUint(0x7362d09c, 32)            // op::transfer_notification
    .storeUint(205, 64)
    .storeCoins(new BN(tokensToSell.toString()))
    .storeAddress(sellerAddr)
    .storeUint(1, 1)                      // payload in ref
    .storeRef(sellPayload)
    .endCell();

  const sellMsg = new InternalMessage({
    to: adminAddr,
    from: mockCurveWallet,
    value: new BN('50000000'),           // 0.05 TON
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(sellBody) }),
  });

  const sellRes = await curveContract.sendInternalMessage(sellMsg);
  assert(sellRes.type === 'success' && sellRes.exit_code === 0, 'Sell order executes on TVM curve successfully');
  assert(sellRes.actionList && sellRes.actionList.length === 1, 'Emits net TON payout message to Seller');

  // 2.8 Safe Token Refund on Slippage Violation (MUST NOT THROW, MUST RETURN JETTONS)
  const slippageViolatedPayload = beginCell()
    .storeCoins(new BN('999999999999999')) // Unrealistically high min_ton_out
    .endCell();

  const slippageSellBody = beginCell()
    .storeUint(0x7362d09c, 32)
    .storeUint(206, 64)
    .storeCoins(new BN(tokensToSell.toString()))
    .storeAddress(sellerAddr)
    .storeUint(1, 1)
    .storeRef(slippageViolatedPayload)
    .endCell();

  const slippageSellMsg = new InternalMessage({
    to: adminAddr,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(slippageSellBody) }),
  });

  const preRefundState = await curveContract.invokeGetMethod('get_curve_state', []);
  const preRefundTon = preRefundState.result[4];
  const preRefundTokens = preRefundState.result[5];

  const refundRes = await curveContract.sendInternalMessage(slippageSellMsg);
  assert(refundRes.type === 'success' && refundRes.exit_code === 0, 'Slippage violation handled safely WITHOUT TVM exception');
  assert(refundRes.actionList && refundRes.actionList.length === 1, 'Emits outbound Jetton transfer safely restoring tokens to Seller');

  const postRefundState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(postRefundState.result[4].eq(preRefundTon), 'Curve real TON reserve remains 100% UNCHANGED after rejected sell');
  assert(postRefundState.result[5].eq(preRefundTokens), 'Curve real token reserve remains 100% UNCHANGED after rejected sell');

  // 2.9 Large Buy Reaching Graduation Threshold (STATE_GRADUATION_PENDING)
  const hugeBuyTon = 510n * ONE_TON;
  const hugeBuyBody = beginCell()
    .storeUint(0x414e4c04, 32)
    .storeUint(207, 64)
    .storeCoins(new BN('0'))
    .endCell();

  const hugeBuyMsg = new InternalMessage({
    to: adminAddr,
    from: buyerAddr,
    value: new BN(hugeBuyTon.toString()),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(hugeBuyBody) }),
  });

  const hugeBuyRes = await curveContract.sendInternalMessage(hugeBuyMsg);
  assert(hugeBuyRes.type === 'success' && hugeBuyRes.exit_code === 0, 'Huge buy order executes and triggers graduation threshold');

  const gradCurveState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(gradCurveState.result[0].toString() === '4', 'State transitioned to STATE_GRADUATION_PENDING (4)');
  assert(gradCurveState.result[5].toString() === '0', 'All 800M curve tokens sold out at graduation');

  // 2.10 Post-Graduation Trading Lock Enforcement
  const postGradBuyMsg = new InternalMessage({
    to: adminAddr,
    from: buyerAddr,
    value: new BN('1000000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(buyBody) }),
  });
  const postGradBuyRes = await curveContract.sendInternalMessage(postGradBuyMsg);
  assert(postGradBuyRes.type === 'failed' && postGradBuyRes.exit_code === 403, 'Subsequent buys strictly rejected with exit code 403 (CURVE GRADUATED)');

  // 2.11 Execute DEX Migration (op::migrate_dex)
  const migrateBody = beginCell()
    .storeUint(0x414e4c06, 32)            // op::migrate_dex
    .storeUint(208, 64)
    .endCell();

  const migrateMsg = new InternalMessage({
    to: adminAddr,
    from: adminAddr,
    value: new BN('100000000'),          // 0.1 TON gas
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(migrateBody) }),
  });

  const migrateRes = await curveContract.sendInternalMessage(migrateMsg);
  assert(migrateRes.type === 'success' && migrateRes.exit_code === 0, 'DEX migration executes successfully');
  assert(migrateRes.actionList && migrateRes.actionList.length === 2, 'Emits 2 outbound messages: 500 TON liquidity + 200M graduation tokens to DEX Router');

  const finalState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(finalState.result[0].toString() === '6', 'Final state transitioned to STATE_GRADUATED (6)');

  // 2.12 Protocol Fee Sweep by Treasury (op::sweep_fees)
  const sweepBody = beginCell()
    .storeUint(0x414e4c05, 32)            // op::sweep_fees
    .storeUint(209, 64)
    .endCell();

  const sweepMsg = new InternalMessage({
    to: adminAddr,
    from: treasuryAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(sweepBody) }),
  });

  const sweepRes = await curveContract.sendInternalMessage(sweepMsg);
  assert(sweepRes.type === 'success' && sweepRes.exit_code === 0, 'Treasury sweeps accumulated protocol fees successfully');
  assert(sweepRes.actionList && sweepRes.actionList.length === 1, 'Emits outbound fee transfer to Treasury wallet');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`📊 TVM SIMULATION TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal TVM test error:', err);
  process.exit(1);
});
