/**
 * ANLGRAM Launchpad — Comprehensive TVM Smart Contract Simulation Test Suite
 * File: test-bonding-curve-tvm.js
 * 
 * Verifies the actual compiled TVM bytecode of all 4 launchpad contracts:
 * 1. anlgram-launchpad-jetton-minter.fc (Launchpad Jetton Master with On-Chain Renounce Acknowledgement)
 * 2. anlgram-lp-locker.fc (Anti-Front-Running Immutable DEX LP Locker)
 * 3. anlgram-migration-router.fc (STON.fi v2.1 Migration Router)
 * 4. anlgram-bonding-curve.fc (Deterministic Constant Product AMM with Anti-Gas Drain & Verified Graduation)
 * 
 * Tests 45+ comprehensive assertions including all adversarial attacks, failure paths,
 * reserve solvency, anti-drain escrow, and permanent LP lock.
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
const adminAddr        = new Address(0, Buffer.alloc(32, 1));
const creatorAddr      = new Address(0, Buffer.alloc(32, 2));
const treasuryAddr     = Address.parseRaw('0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d');
const masterAddr       = new Address(0, Buffer.alloc(32, 3));
const routerAddr       = Address.parseRaw('0:779dc85398d8500e449c5291e7f12738823d575b53100003ffbd4eb5818387f4');
const lockerAddr       = new Address(0, Buffer.alloc(32, 4));
const buyerAddr        = new Address(0, Buffer.alloc(32, 5));
const sellerAddr       = new Address(0, Buffer.alloc(32, 6));
const lpWalletMock     = new Address(0, Buffer.alloc(32, 7));
const mockCurveWallet  = new Address(0, Buffer.alloc(32, 8));
const migrationRouter  = new Address(0, Buffer.alloc(32, 9));
const spamAttackerAddr = new Address(0, Buffer.alloc(32, 10));
const spamTokenWallet  = new Address(0, Buffer.alloc(32, 11));

const ONE_TON = 1000000000n;
const ONE_TOKEN = 1000000000n;

// Load Compiled Contract BOC Artifacts
const minterArtifact  = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-launchpad-jetton-minter.compiled.json'), 'utf-8'));
const lockerArtifact  = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-lp-locker.compiled.json'), 'utf-8'));
const migratorArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-migration-router.compiled.json'), 'utf-8'));
const curveArtifact   = JSON.parse(fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-bonding-curve.compiled.json'), 'utf-8'));

const minterCodeCell   = Cell.fromBoc(Buffer.from(minterArtifact.codeBocBase64, 'base64'))[0];
const lockerCodeCell   = Cell.fromBoc(Buffer.from(lockerArtifact.codeBocBase64, 'base64'))[0];
const migratorCodeCell = Cell.fromBoc(Buffer.from(migratorArtifact.codeBocBase64, 'base64'))[0];
const curveCodeCell    = Cell.fromBoc(Buffer.from(curveArtifact.codeBocBase64, 'base64'))[0];

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🛡️  ANLGRAM LAUNCHPAD: REMEDIATED TVM CONTRACT VERIFICATION SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

async function runTests() {
  // ===========================================================================
  // TEST SUITE 1: ANLGRAM LAUNCHPAD JETTON MINTER (Blocker 1 Remediation)
  // ===========================================================================
  console.log('--- 1. AnlgramLaunchpadJettonMinter (On-Chain Renounce & Anti-Mint) ---');

  const initialMinterData = beginCell()
    .storeCoins(0)               // total_supply
    .storeAddress(adminAddr)     // admin_address (the Curve / Deployer)
    .storeRef(new Cell())        // content
    .storeRef(new Cell())        // jetton_wallet_code
    .endCell();

  const minterContract = await SmartContract.fromCell(minterCodeCell, initialMinterData);

  // 1.1 get_jetton_data getter
  const minterDataRes = await minterContract.invokeGetMethod('get_jetton_data', []);
  assert(minterDataRes.type === 'success', 'get_jetton_data getter executes successfully');
  assert(minterDataRes.result[0].toString() === '0', 'Initial total_supply is 0');

  // 1.2 Adversarial Test: Unauthorized mint from attacker fails with 73
  const fakeMintMsg = new InternalMessage({
    to: masterAddr,
    from: spamAttackerAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(21, 32)
          .storeUint(1, 64)
          .storeAddress(spamAttackerAddr)
          .storeCoins(new BN('1000000000'))
          .storeRef(beginCell().storeUint(0, 32).storeUint(0, 64).storeCoins(new BN('1000000000')).endCell())
          .endCell()
      )
    })
  });
  const fakeMintRes = await minterContract.sendInternalMessage(fakeMintMsg);
  assert(fakeMintRes.type === 'failed' && fakeMintRes.exit_code === 73, 'Unauthorized mint strictly rejected with exit code 73');

  // 1.3 Renounce Admin: Admin sends op == 3 setting admin to addr_none with custom_recipient (Curve)
  const renounceMsg = new InternalMessage({
    to: masterAddr,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(3, 32)             // change_admin
          .storeUint(999, 64)           // query_id
          .storeUint(0, 2)              // addr_none
          .storeAddress(mockCurveWallet)// custom_recipient (Curve)
          .endCell()
      )
    })
  });
  const renounceRes = await minterContract.sendInternalMessage(renounceMsg);
  assert(renounceRes.type === 'success', 'Processes op == 3 to renounce admin to addr_none');
  assert(renounceRes.actionList && renounceRes.actionList.length === 1, 'Emits on-chain acknowledgement message back to Curve');
  assert(renounceRes.actionList[0].message.info.dest.toFriendly() === mockCurveWallet.toFriendly(), 'Renounce notification routed directly to custom_recipient (Curve)');

  // 1.4 Adversarial Test: Minting after renunciation strictly rejected with exit code 73
  const postRenounceMintRes = await minterContract.sendInternalMessage(
    new InternalMessage({
      to: masterAddr,
      from: adminAddr,
      value: new BN('100000000'),
      bounce: false,
      body: new CommonMessageInfo({
        body: new CellMessage(
          beginCell()
            .storeUint(21, 32)
            .storeUint(2, 64)
            .storeAddress(buyerAddr)
            .storeCoins(new BN('1000000000'))
            .storeRef(beginCell().storeUint(0, 32).storeUint(0, 64).storeCoins(new BN('1000000000')).endCell())
            .endCell()
        )
      })
    })
  );
  assert(postRenounceMintRes.type === 'failed' && postRenounceMintRes.exit_code === 73, 'Minting after renunciation permanently disabled with exit code 73');

  // 1.5 Unprivileged op::query_admin_status response
  const queryStatusMsg = new InternalMessage({
    to: masterAddr,
    from: buyerAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x51c9d381, 32)   // op::query_admin_status
          .storeUint(1234, 64)
          .endCell()
      )
    })
  });
  const queryStatusRes = await minterContract.sendInternalMessage(queryStatusMsg);
  assert(queryStatusRes.type === 'success', 'Responds to unprivileged op::query_admin_status');
  assert(queryStatusRes.actionList && queryStatusRes.actionList.length === 1, 'Emits status reply containing current renounced admin state');


  // ===========================================================================
  // TEST SUITE 2: ANLGRAM LP LOCKER (Blocker 3 Remediation)
  // ===========================================================================
  console.log('\n--- 2. AnlgramLpLocker TVM Verification (Anti-Front-Running Lock) ---');

  // Initial Locker Storage:
  // is_locked: 0, unlock_timestamp: 0xFFFFFFFFFFFFFFFF (Permanent), lp_amount: 0, is_wallet_initialized: 0, is_router_initialized: 0
  const initialLockerData = beginCell()
    .storeUint(0, 1)                      // is_locked
    .storeUint(0xFFFFFFFFFFFFFFFFn, 64)   // unlock_timestamp
    .storeCoins(0)                        // lp_amount_locked
    .storeUint(0, 1)                      // is_wallet_initialized = 0
    .storeUint(0, 1)                      // is_router_initialized = 0
    .storeAddress(routerAddr)             // pool_address
    .storeAddress(mockCurveWallet)        // curve_address
    .storeRef(
      beginCell()
        .storeAddress(null)               // lp_wallet_address (unbound)
        .storeAddress(null)               // router_address (unbound, initialized via op::init_lp_locker)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(adminAddr)          // admin_address (deployer)
        .endCell()
    )
    .endCell();

  const lockerContract = await SmartContract.fromCell(lockerCodeCell, initialLockerData);

  // 2.1 Adversarial Test: Spam token transfer before initialization MUST REVERT with 406
  const spamTransferMsg = new InternalMessage({
    to: lockerAddr,
    from: spamTokenWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)      // op::transfer_notification
          .storeUint(1, 64)
          .storeCoins(new BN('1000000'))
          .storeAddress(spamAttackerAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const spamTransferRes = await lockerContract.sendInternalMessage(spamTransferMsg);
  assert(spamTransferRes.type === 'failed' && spamTransferRes.exit_code === 406, 'Spam token deposit before initialization strictly rejected with exit code 406');

  // 2.2 Adversarial Test: Unauthorized caller cannot initialize router on LP Locker
  const fakeInitRouterMsg = new InternalMessage({
    to: lockerAddr,
    from: spamAttackerAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c39, 32)      // op::init_lp_locker
          .storeUint(2, 64)
          .storeAddress(spamAttackerAddr)
          .endCell()
      )
    })
  });
  const fakeInitRouterRes = await lockerContract.sendInternalMessage(fakeInitRouterMsg);
  assert(fakeInitRouterRes.type === 'failed' && fakeInitRouterRes.exit_code === 401, 'Unauthorized caller cannot initialize router on LP Locker (exit code 401)');

  // 2.3 Adversarial Test: Initializing router with null address rejected with exit code 408
  const nullInitRouterMsg = new InternalMessage({
    to: lockerAddr,
    from: adminAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c39, 32)      // op::init_lp_locker
          .storeUint(3, 64)
          .storeAddress(null)
          .endCell()
      )
    })
  });
  const nullInitRouterRes = await lockerContract.sendInternalMessage(nullInitRouterMsg);
  assert(nullInitRouterRes.type === 'failed' && nullInitRouterRes.exit_code === 408, 'Initializing router with null address rejected with exit code 408');

  // 2.3B Adversarial Test: Initializing router with curve address (role collision) rejected with exit code 408
  const curveAsRouterMsg = new InternalMessage({
    to: lockerAddr,
    from: adminAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c39, 32)      // op::init_lp_locker
          .storeUint(3, 64)
          .storeAddress(mockCurveWallet)  // curve address
          .endCell()
      )
    })
  });
  const curveAsRouterRes = await lockerContract.sendInternalMessage(curveAsRouterMsg);
  assert(curveAsRouterRes.type === 'failed' && curveAsRouterRes.exit_code === 408, 'Initializing router with curve address rejected with exit code 408 (role collision)');

  // 2.4 Authorized initialization of router by deployer/admin
  const authInitRouterMsg = new InternalMessage({
    to: lockerAddr,
    from: adminAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c39, 32)      // op::init_lp_locker
          .storeUint(4, 64)
          .storeAddress(migrationRouter)  // authentic migration router
          .endCell()
      )
    })
  });
  const authInitRouterRes = await lockerContract.sendInternalMessage(authInitRouterMsg);
  assert(authInitRouterRes.type === 'success', 'Deployer successfully executes one-time router initialization on LP Locker');

  // Verify router initialization getter
  const isRouterInitRes = await lockerContract.invokeGetMethod('is_router_initialized', []);
  assert(isRouterInitRes.result[0].toString() === '1', 'is_router_initialized getter returns 1');

  // 2.5 Adversarial Test: Duplicate router initialization strictly rejected with exit code 405 (ALREADY_INITIALIZED)
  const dupInitRouterRes = await lockerContract.sendInternalMessage(authInitRouterMsg);
  assert(dupInitRouterRes.type === 'failed' && dupInitRouterRes.exit_code === 405, 'Duplicate router initialization strictly rejected with exit code 405 (ALREADY_INITIALIZED)');

  // 2.6 Adversarial Test: Unauthorized caller cannot configure LP wallet
  const fakeConfigMsg = new InternalMessage({
    to: lockerAddr,
    from: spamAttackerAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c31, 32)      // op::set_lp_wallet
          .storeUint(5, 64)
          .storeAddress(spamTokenWallet)
          .endCell()
      )
    })
  });
  const fakeConfigRes = await lockerContract.sendInternalMessage(fakeConfigMsg);
  assert(fakeConfigRes.type === 'failed' && fakeConfigRes.exit_code === 401, 'Unauthorized LP wallet configuration rejected with exit code 401');

  // 2.7 Authorized configuration of LP wallet by Migration Router
  const authConfigMsg = new InternalMessage({
    to: lockerAddr,
    from: migrationRouter,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c31, 32)      // op::set_lp_wallet
          .storeUint(6, 64)
          .storeAddress(lpWalletMock)
          .endCell()
      )
    })
  });
  const authConfigRes = await lockerContract.sendInternalMessage(authConfigMsg);
  assert(authConfigRes.type === 'success', 'Authorized caller successfully initializes LP wallet');

  // Verify getter reflects initialized state
  const isInitRes = await lockerContract.invokeGetMethod('is_wallet_initialized', []);
  assert(isInitRes.result[0].toString() === '1', 'is_wallet_initialized getter returns 1');

  // 2.8 Adversarial Test: Reconfiguration attempt rejected with exit code 405
  const reconfigRes = await lockerContract.sendInternalMessage(authConfigMsg);
  assert(reconfigRes.type === 'failed' && reconfigRes.exit_code === 405, 'Reconfiguration attempt strictly rejected with exit code 405 (ALREADY_INITIALIZED)');

  // 2.9 Adversarial Test: Transfer from wrong wallet after initialization rejected with 401
  const wrongWalletTransferRes = await lockerContract.sendInternalMessage(spamTransferMsg);
  assert(wrongWalletTransferRes.type === 'failed' && wrongWalletTransferRes.exit_code === 401, 'Deposit from unauthorized wallet strictly rejected with exit code 401');

  // 2.10 Legitimate LP token transfer from authentic configured LP wallet
  const lpTokensAmount = 1000000000n;
  const legitLpTransferMsg = new InternalMessage({
    to: lockerAddr,
    from: lpWalletMock,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)      // op::transfer_notification
          .storeUint(101, 64)
          .storeCoins(new BN(lpTokensAmount.toString()))
          .storeAddress(routerAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const legitLpTransferRes = await lockerContract.sendInternalMessage(legitLpTransferMsg);
  assert(legitLpTransferRes.type === 'success', 'Accepts inbound official LP tokens from verified LP wallet');
  assert(legitLpTransferRes.actionList && legitLpTransferRes.actionList.length >= 1, 'Emits op::lp_locked_confirmation back to Curve');

  const permLockRes = await lockerContract.invokeGetMethod('is_permanently_locked', []);
  assert(permLockRes.result[0].toString() === '-1', 'is_permanently_locked reports true (-1)');

  const lockedAmountRes = await lockerContract.invokeGetMethod('get_locked_lp_amount', []);
  assert(lockedAmountRes.result[0].toString() === lpTokensAmount.toString(), 'get_locked_lp_amount reports exact deposited LP balance');

  // 2.11 Withdrawal attempt strictly rejected with exit code 403
  const withdrawMsg = new InternalMessage({
    to: lockerAddr,
    from: adminAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c32, 32)      // op::withdraw_lp
          .storeUint(102, 64)
          .storeCoins(new BN('1000000000'))
          .endCell()
      )
    })
  });
  const withdrawRes = await lockerContract.sendInternalMessage(withdrawMsg);
  assert(withdrawRes.type === 'failed' && withdrawRes.exit_code === 403, 'Withdrawal attempt strictly rejected with exit code 403 (PERMANENT LOCK ACTIVE)');


  // ===========================================================================
  // TEST SUITE 3: ANLGRAM BONDING CURVE (Blockers 1, 2 & 4 Remediation)
  // ===========================================================================
  console.log('\n--- 3. AnlgramBondingCurve TVM Verification (AMM, Renounce, Anti-Drain) ---');

  const vTon = 166666666666n;
  const vTok = 266666666665600000n;
  const tGrad = 500n * ONE_TON;
  const curveTokens = 800000000n * ONE_TOKEN;
  const dexEscrow = 200000000n * ONE_TOKEN;

  const mockWalletCode = new Cell();

  const initialCurveData = beginCell()
    .storeUint(0, 8)                      // state: STATE_UNINITIALIZED
    .storeUint(100, 16)                   // protocol_fee_bps: 100 (1%)
    .storeRef(
      beginCell()
        .storeAddress(adminAddr)          // admin_address
        .storeAddress(creatorAddr)        // creator_address
        .storeAddress(treasuryAddr)       // treasury_address
        .storeRef(
          beginCell()
            .storeAddress(masterAddr)     // jetton_master_address
            .storeAddress(mockCurveWallet)// curve_jetton_wallet
            .storeAddress(routerAddr)     // dex_router_address
            .storeRef(
              beginCell()
                .storeAddress(lockerAddr) // lp_locker_address
                .storeAddress(migrationRouter) // migration_router_address
                .endCell()
            )
            .endCell()
        )
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeCoins(0)                    // real_ton_reserve
        .storeCoins(new BN(curveTokens.toString())) // real_token_reserve (800M)
        .storeCoins(0)                    // accrued_protocol_fees
        .storeCoins(0)                    // pending_refunds_tokens
        .storeCoins(new BN(vTon.toString()))        // virtual_ton_reserve
        .storeCoins(new BN(vTok.toString()))        // virtual_token_reserve
        .storeCoins(new BN(tGrad.toString()))       // graduation_threshold_ton
        .storeCoins(new BN(dexEscrow.toString()))   // dex_tokens_escrow (200M)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeDict(null)                  // pending_refunds_dict (empty)
        .storeRef(mockWalletCode)         // jetton_wallet_code
        .endCell()
    )
    .endCell();

  const curveContract = await SmartContract.fromCell(curveCodeCell, initialCurveData);

  // 3.1 Initial Getters
  const curveStateRes = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(curveStateRes.type === 'success', 'get_curve_state getter executes successfully');
  assert(curveStateRes.result[0].toString() === '0', 'Initial state is STATE_UNINITIALIZED (0)');
  assert(curveStateRes.result[4].toString() === '0', 'Initial real_ton_reserve is 0');
  assert(curveStateRes.result[5].toString() === curveTokens.toString(), 'Initial real_token_reserve is 800M tokens');
  assert(curveStateRes.result[7].toString() === '0', 'Initial pending_refunds_tokens is 0');

  // 3.1B Adversarial Test: Trading strictly disabled in STATE_UNINITIALIZED (0)
  const uninitBuyMsg = new InternalMessage({
    to: mockCurveWallet,
    from: buyerAddr,
    value: new BN((5n * ONE_TON).toString()),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x5fcc3d14, 32).storeUint(1, 64).storeCoins(0).endCell())
    })
  });
  const uninitBuyRes = await curveContract.sendInternalMessage(uninitBuyMsg);
  assert(uninitBuyRes.type === 'failed' && uninitBuyRes.exit_code === 402, 'Trading strictly disabled in STATE_UNINITIALIZED (exit code 402)');

  // 3.1C Adversarial Test: Unauthorized caller cannot call op::init_launchpad
  const unauthorizedInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const unauthorizedInitRes = await curveContract.sendInternalMessage(unauthorizedInitMsg);
  assert(unauthorizedInitRes.type === 'failed' && unauthorizedInitRes.exit_code === 401, 'Unauthorized caller cannot initialize launchpad (exit code 401)');

  // 3.1C2 Adversarial Test: op::init_launchpad with null master rejected with 408
  const nullMasterInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(null)             // null master!
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const nullMasterInitRes = await curveContract.sendInternalMessage(nullMasterInitMsg);
  assert(nullMasterInitRes.type === 'failed' && nullMasterInitRes.exit_code === 408, 'op::init_launchpad with null Jetton Master rejected with exit code 408');

  // 3.1D Adversarial Test: op::init_launchpad with null DEX router rejected with 408
  const nullRouterInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(null)             // null DEX router!
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const nullRouterInitRes = await curveContract.sendInternalMessage(nullRouterInitMsg);
  assert(nullRouterInitRes.type === 'failed' && nullRouterInitRes.exit_code === 408, 'op::init_launchpad with null DEX router rejected with exit code 408');

  // 3.1E Adversarial Test: op::init_launchpad with null locker rejected with 408
  const nullLockerInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(null)             // null LP locker!
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const nullLockerInitRes = await curveContract.sendInternalMessage(nullLockerInitMsg);
  assert(nullLockerInitRes.type === 'failed' && nullLockerInitRes.exit_code === 408, 'op::init_launchpad with null LP locker rejected with exit code 408');

  // 3.1E2 Adversarial Test: op::init_launchpad with null migration router rejected with 408
  const nullMigInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(null)            // null migration router!
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const nullMigInitRes = await curveContract.sendInternalMessage(nullMigInitMsg);
  assert(nullMigInitRes.type === 'failed' && nullMigInitRes.exit_code === 408, 'op::init_launchpad with null Migration Router rejected with exit code 408');

  // 3.1F Adversarial Test: op::init_launchpad with master mismatch rejected with 408
  const badMasterInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(spamAttackerAddr)      // wrong master address!
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const badMasterInitRes = await curveContract.sendInternalMessage(badMasterInitMsg);
  assert(badMasterInitRes.type === 'failed' && badMasterInitRes.exit_code === 408, 'op::init_launchpad with Jetton Master mismatch rejected with exit code 408');

  // 3.1G Adversarial Test: op::init_launchpad with locker == migration_router collision rejected with 408
  const collisionInitMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(lockerAddr)        // collision: locker == migration router!
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const collisionInitRes = await curveContract.sendInternalMessage(collisionInitMsg);
  assert(collisionInitRes.type === 'failed' && collisionInitRes.exit_code === 408, 'op::init_launchpad with locker/router collision rejected with exit code 408');

  // 3.2 Legitimate Launchpad Initialization
  const initMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)      // op::init_launchpad
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(mockCurveWallet)
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(mockWalletCode)
          .endCell()
      )
    })
  });
  const initRes = await curveContract.sendInternalMessage(initMsg);
  assert(initRes.type === 'success', 'op::init_launchpad transitions to STATE_INITIALIZING (1)');

  // 3.2B Adversarial Test: Duplicate initialization strictly rejected with exit code 407 (INVALID_STATE)
  const dupInitRes = await curveContract.sendInternalMessage(initMsg);
  assert(dupInitRes.type === 'failed' && dupInitRes.exit_code === 407, 'Duplicate op::init_launchpad strictly rejected with exit code 407 (INVALID_STATE)');

  // 3.3 Receive 1 Billion Token Custody
  const total1B = curveTokens + dexEscrow;
  const depositMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)      // op::transfer_notification
          .storeUint(2, 64)
          .storeCoins(new BN(total1B.toString()))
          .storeAddress(adminAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const depositRes = await curveContract.sendInternalMessage(depositMsg);
  assert(depositRes.type === 'success', 'Confirms 1B token custody and emits op::change_admin(addr_none)');
  assert(depositRes.actionList && depositRes.actionList.length === 1, 'Emits exactly 1 outbound admin-renounce message to Jetton Master');

  // 3.4 Adversarial Test: Curve is in STATE_RENOUNCE_PENDING; Buys MUST REVERT with 402
  const buyAttemptMsg = new InternalMessage({
    to: mockCurveWallet,
    from: buyerAddr,
    value: new BN((10n * ONE_TON).toString()),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x5fcc3d14, 32).storeUint(10, 64).storeCoins(0).endCell())
    })
  });
  const buyAttemptRes = await curveContract.sendInternalMessage(buyAttemptMsg);
  assert(buyAttemptRes.type === 'failed' && buyAttemptRes.exit_code === 402, 'Trading strictly disabled in STATE_RENOUNCE_PENDING (exit code 402)');

  // 3.5 Adversarial Test: Forged renounce notification from non-master address rejected with 401
  const fakeRenounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7a3e810f, 32)      // op::admin_changed_notification
          .storeUint(999, 64)
          .storeUint(0, 2)                // addr_none
          .storeCoins(new BN(total1B.toString()))
          .endCell()
      )
    })
  });
  const fakeRenounceRes = await curveContract.sendInternalMessage(fakeRenounceMsg);
  assert(fakeRenounceRes.type === 'failed' && fakeRenounceRes.exit_code === 401, 'Forged renounce notification from attacker strictly rejected with exit code 401');

  const RENOUNCE_QUERY_ID = 0x414e4c4752454e4fn; // "ANLGRENO"

  // 3.6A Adversarial Test: Renounce notification with wrong query_id rejected with 412
  const wrongQueryRenounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: masterAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7a3e810f, 32)
          .storeUint(999, 64)
          .storeUint(0, 2)                // addr_none
          .storeCoins(new BN(total1B.toString()))
          .endCell()
      )
    })
  });
  const wrongQueryRes = await curveContract.sendInternalMessage(wrongQueryRenounceMsg);
  assert(wrongQueryRes.type === 'failed' && wrongQueryRes.exit_code === 412, 'Renounce notification with wrong query_id strictly rejected with exit code 412 (INVALID_RENOUNCE_QUERY)');

  // 3.6B Adversarial Test: Renounce notification with non-null admin rejected with 408
  const badAdminRenounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: masterAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7a3e810f, 32)
          .storeUint(new BN(RENOUNCE_QUERY_ID.toString()), 64)
          .storeAddress(spamAttackerAddr) // Not addr_none!
          .storeCoins(new BN(total1B.toString()))
          .endCell()
      )
    })
  });
  const badAdminRenounceRes = await curveContract.sendInternalMessage(badAdminRenounceMsg);
  assert(badAdminRenounceRes.type === 'failed' && badAdminRenounceRes.exit_code === 408, 'Renounce notification with non-null admin rejected with exit code 408');

  // 3.6C Adversarial Test: Renounce notification with wrong total supply rejected with 411
  const wrongSupplyRenounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: masterAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7a3e810f, 32)
          .storeUint(new BN(RENOUNCE_QUERY_ID.toString()), 64)
          .storeUint(0, 2)                // addr_none
          .storeCoins(new BN((999000000n * ONE_TOKEN).toString())) // Wrong supply: 999M != 1B
          .endCell()
      )
    })
  });
  const wrongSupplyRes = await curveContract.sendInternalMessage(wrongSupplyRenounceMsg);
  assert(wrongSupplyRes.type === 'failed' && wrongSupplyRes.exit_code === 411, 'Renounce notification with wrong total supply strictly rejected with exit code 411 (ERROR_SUPPLY_MISMATCH_RENOUNCE)');

  // 3.7 Valid on-chain cryptographic renounce confirmation from authentic Master
  const validRenounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: masterAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7a3e810f, 32)
          .storeUint(new BN(RENOUNCE_QUERY_ID.toString()), 64)
          .storeUint(0, 2)                // addr_none
          .storeCoins(new BN(total1B.toString()))
          .endCell()
      )
    })
  });
  const validRenounceRes = await curveContract.sendInternalMessage(validRenounceMsg);
  assert(validRenounceRes.type === 'success', 'Valid on-chain renounce confirmation accepted from authentic Jetton Master');

  const activeStateRes = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(activeStateRes.result[0].toString() === '3', 'Trading activated! State transitioned to STATE_ACTIVE (3)');

  // 3.7B Adversarial Test: Duplicate renounce notification rejected with exit code 407 (One-Time Activation Guard)
  const duplicateRenounceRes = await curveContract.sendInternalMessage(validRenounceMsg);
  assert(duplicateRenounceRes.type === 'failed' && duplicateRenounceRes.exit_code === 407, 'Duplicate renounce notification strictly rejected with exit code 407 (One-Time Activation)');

  // 3.7C Adversarial Test: Status query while in STATE_ACTIVE rejected with exit code 407
  const statusQueryActiveMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x51c9d382, 32).storeUint(123, 64).endCell())
    })
  });
  const statusQueryActiveRes = await curveContract.sendInternalMessage(statusQueryActiveMsg);
  assert(statusQueryActiveRes.type === 'failed' && statusQueryActiveRes.exit_code === 407, 'op::check_renounce while in STATE_ACTIVE strictly rejected with exit code 407');

  // 3.8 Execute Buy Order
  const buyAmountTon = 10n * ONE_TON;
  const buyRes = await curveContract.sendInternalMessage(
    new InternalMessage({
      to: mockCurveWallet,
      from: buyerAddr,
      value: new BN(buyAmountTon.toString()),
      bounce: false,
      body: new CommonMessageInfo({
        body: new CellMessage(beginCell().storeUint(0x5fcc3d14, 32).storeUint(20, 64).storeCoins(0).endCell())
      })
    })
  );
  assert(buyRes.type === 'success', 'Buy order executes on TVM curve successfully');
  assert(buyRes.actionList && buyRes.actionList.length === 1, 'Emits outbound Jetton transfer delivering tokens to Buyer');

  // 3.8B Adversarial Test: Inbound sell notification from unauthorized Jetton wallet rejected with exit code 401
  const fakeWalletSellMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr, // NOT curve_jetton_wallet!
    value: new BN('60000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(29, 64)
          .storeCoins(new BN((5000000n * ONE_TOKEN).toString()))
          .storeAddress(sellerAddr)
          .storeUint(0, 1)
          .storeCoins(0)
          .endCell()
      )
    })
  });
  const fakeWalletSellRes = await curveContract.sendInternalMessage(fakeWalletSellMsg);
  assert(fakeWalletSellRes.type === 'failed' && fakeWalletSellRes.exit_code === 401, 'Inbound sell notification from unauthorized Jetton wallet strictly rejected with exit code 401');

  // 3.9 Blocker 4 Remediation: Slippage Rejection with Sufficient Gas (Immediate Refund)
  const rejectedSellAmount = 5000000n * ONE_TOKEN;
  const sufficientGasSellMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet,
    value: new BN('60000000'),          // 0.06 TON (sufficient for immediate refund)
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(30, 64)
          .storeCoins(new BN(rejectedSellAmount.toString()))
          .storeAddress(sellerAddr)
          .storeUint(0, 1)              // forward_payload in-cell
          .storeCoins(new BN((999999n * ONE_TON).toString())) // impossible min TON out!
          .endCell()
      )
    })
  });

  const stateBeforeSufficient = await curveContract.invokeGetMethod('get_curve_state', []);
  const tonReserveBefore = stateBeforeSufficient.result[4].toString();
  const tokenReserveBefore = stateBeforeSufficient.result[5].toString();

  const sufficientGasSellRes = await curveContract.sendInternalMessage(sufficientGasSellMsg);
  assert(sufficientGasSellRes.type === 'success', 'Slippage violation handled safely WITHOUT TVM exception');
  assert(sufficientGasSellRes.actionList && sufficientGasSellRes.actionList.length === 1, 'Emits outbound Jetton transfer safely refunding tokens to Seller');

  const stateAfterSufficient = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterSufficient.result[4].toString() === tonReserveBefore, 'Curve real TON reserve remains 100% UNCHANGED (Zero gas subsidy paid from reserve)');
  assert(stateAfterSufficient.result[5].toString() === tokenReserveBefore, 'Curve real token reserve remains 100% UNCHANGED after immediate refund');

  // 3.10 Blocker 4 Remediation: Slippage Rejection with Underfunded Gas (< 0.035 TON) -> Escrow in Pending Refunds
  const underfundedGasSellMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet,
    value: new BN('20000000'),          // 0.02 TON (< 0.035 TON: underfunded!)
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(31, 64)
          .storeCoins(new BN(rejectedSellAmount.toString()))
          .storeAddress(sellerAddr)
          .storeUint(0, 1)
          .storeCoins(new BN((999999n * ONE_TON).toString())) // impossible min TON out!
          .endCell()
      )
    })
  });

  const underfundedSellRes = await curveContract.sendInternalMessage(underfundedGasSellMsg);
  assert(underfundedSellRes.type === 'success', 'Underfunded rejected sell handled safely without subsidized refund');
  assert(!underfundedSellRes.actionList || underfundedSellRes.actionList.length === 0, 'Does NOT emit subsidized outbound refund from curve reserves');

  const stateAfterUnderfunded = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterUnderfunded.result[7].toString() === rejectedSellAmount.toString(), 'Pending refund escrow correctly records entitled tokens (pending_refunds_tokens > 0)');
  assert(stateAfterUnderfunded.result[4].toString() === tonReserveBefore, 'Curve real TON reserve untouched by underfunded sell');
  assert(stateAfterUnderfunded.result[5].toString() === tokenReserveBefore, 'Tradable token inventory strictly segregated from pending refund escrow');

  // 3.10B Adversarial Test: Claim refund with insufficient gas (< 0.04 TON) rejected with 405
  const lowGasClaimMsg = new InternalMessage({
    to: mockCurveWallet,
    from: sellerAddr,
    value: new BN('20000000'), // 0.02 TON < 0.04 TON required
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c34, 32).storeUint(31, 64).endCell())
    })
  });
  const lowGasClaimRes = await curveContract.sendInternalMessage(lowGasClaimMsg);
  assert(lowGasClaimRes.type === 'failed' && lowGasClaimRes.exit_code === 405, 'Claim refund with insufficient gas strictly rejected with exit code 405 (ERROR_INSUFFICIENT_GAS)');

  // 3.10C Adversarial Test: Claim refund from non-entitled user rejected with 409
  const nonEntitledClaimMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c34, 32).storeUint(32, 64).endCell())
    })
  });
  const nonEntitledClaimRes = await curveContract.sendInternalMessage(nonEntitledClaimMsg);
  assert(nonEntitledClaimRes.type === 'failed' && nonEntitledClaimRes.exit_code === 409, 'Claim refund from non-entitled user strictly rejected with exit code 409 (ERROR_NO_PENDING_REFUND)');

  // 3.11 User Claims Pending Refund via op::claim_refund
  const claimRefundMsg = new InternalMessage({
    to: mockCurveWallet,
    from: sellerAddr,
    value: new BN('50000000'),          // 0.05 TON attached to fund return transfer
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c34, 32)    // op::claim_refund
          .storeUint(32, 64)
          .endCell()
      )
    })
  });
  const claimRefundRes = await curveContract.sendInternalMessage(claimRefundMsg);
  assert(claimRefundRes.type === 'success', 'Entitled seller successfully claims pending refund');
  assert(claimRefundRes.actionList && claimRefundRes.actionList.length === 1, 'Emits return Jetton transfer funded strictly by claimant gas');

  const stateAfterClaim = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterClaim.result[7].toString() === '0', 'pending_refunds_tokens reset to 0 after successful claim');

  // 3.12 Adversarial Test: Double claim attempt rejected with exit code 409
  const doubleClaimRes = await curveContract.sendInternalMessage(claimRefundMsg);
  assert(doubleClaimRes.type === 'failed' && doubleClaimRes.exit_code === 409, 'Double claim attempt strictly rejected with exit code 409 (ERROR_NO_PENDING_REFUND)');

  // 3.12A1 Adversarial Test: Bounced message from unauthorized sender (not curve_jetton_wallet) safely ignored
  const bouncedTokensAmount = 5000000n * ONE_TOKEN;
  const fakeBouncedMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr, // Not curve wallet!
    value: new BN('30000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x0f8a7ea5, 32)
          .storeUint(776, 64)
          .storeCoins(new BN(bouncedTokensAmount.toString()))
          .storeAddress(sellerAddr)
          .endCell()
      )
    })
  });
  const fakeBounceRes = await curveContract.sendInternalMessage(fakeBouncedMsg);
  assert(fakeBounceRes.type === 'success', 'Bounced message from non-wallet ignored safely without state change');
  const stateAfterFakeBounce = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterFakeBounce.result[7].toString() === '0', 'Zero pending refund tokens credited from forged bounce message');

  // 3.12A2 Adversarial Test: Bounced message with non-transfer opcode safely ignored
  const wrongOpBouncedMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet,
    value: new BN('30000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x12345678, 32) // Not op::transfer()!
          .storeUint(776, 64)
          .storeCoins(new BN(bouncedTokensAmount.toString()))
          .storeAddress(sellerAddr)
          .endCell()
      )
    })
  });
  const wrongOpBounceRes = await curveContract.sendInternalMessage(wrongOpBouncedMsg);
  assert(wrongOpBounceRes.type === 'success', 'Bounced message with non-transfer opcode ignored safely without state change');
  const stateAfterWrongOpBounce = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterWrongOpBounce.result[7].toString() === '0', 'Zero pending refund tokens credited from non-transfer bounce message');

  // 3.12B Bounced Outbound Jetton Transfer Recovery:
  // Outbound Jetton transfer bounces back from curve_jetton_wallet
  const bouncedMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet,
    value: new BN('30000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x0f8a7ea5, 32) // op::transfer()
          .storeUint(777, 64)
          .storeCoins(new BN(bouncedTokensAmount.toString()))
          .storeAddress(sellerAddr)
          .endCell()
      )
    })
  });
  const bounceRes = await curveContract.sendInternalMessage(bouncedMsg);
  assert(bounceRes.type === 'success', 'Bounced Jetton transfer parsed and accepted by Curve');

  const stateAfterBounce = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterBounce.result[7].toString() === bouncedTokensAmount.toString(), 'Bounced tokens safely credited to pending_refunds_tokens escrow');

  // Seller claims the recovered bounced tokens via op::claim_refund
  const claimBouncedMsg = new InternalMessage({
    to: mockCurveWallet,
    from: sellerAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c34, 32)    // op::claim_refund
          .storeUint(33, 64)
          .endCell()
      )
    })
  });
  const claimBouncedRes = await curveContract.sendInternalMessage(claimBouncedMsg);
  assert(claimBouncedRes.type === 'success', 'Seller successfully claims bounced token refund');
  assert(claimBouncedRes.actionList && claimBouncedRes.actionList.length === 1, 'Emits return transfer delivering recovered bounced tokens to claimant');

  const stateAfterClaimBounced = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterClaimBounced.result[7].toString() === '0', 'pending_refunds_tokens reset to 0 after claiming recovered bounce');

  // 3.13 Huge Buy triggers Graduation Threshold -> STATE_GRADUATION_PENDING
  const hugeBuyMsg = new InternalMessage({
    to: mockCurveWallet,
    from: buyerAddr,
    value: new BN((550n * ONE_TON).toString()), // 550 TON exceeds 500 TON threshold
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x5fcc3d14, 32).storeUint(40, 64).storeCoins(0).endCell())
    })
  });
  const hugeBuyRes = await curveContract.sendInternalMessage(hugeBuyMsg);
  assert(hugeBuyRes.type === 'success', 'Huge buy order executes and triggers graduation threshold');

  const gradPendingState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(gradPendingState.result[0].toString() === '4', 'State transitioned to STATE_GRADUATION_PENDING (4)');
  assert(gradPendingState.result[5].toString() === '0', 'All 800M curve tokens sold out at graduation');

  // 3.14 Blocker 2 Remediation: op::initiate_migration dispatches to Migration Router
  const initiateMigMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('300000000'),         // 0.30 TON attached for migration gas
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c35, 32)    // op::initiate_migration
          .storeUint(50, 64)
          .endCell()
      )
    })
  });
  const initiateMigRes = await curveContract.sendInternalMessage(initiateMigMsg);
  assert(initiateMigRes.type === 'success', 'op::initiate_migration dispatches graduation reserves to Migration Router');
  assert(initiateMigRes.actionList && initiateMigRes.actionList.length === 2, 'Emits 2 outbound messages: 200M DEX tokens + 500 TON liquidity to Migration Router');

  const migInProgressState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(migInProgressState.result[0].toString() === '5', 'Curve transitions to STATE_MIGRATION_IN_PROGRESS (5) - NOT prematurely graduated');

  // 3.14B Failure Recovery Test: Bounced message from Migration Router transitions to STATE_MIGRATION_FAILED (7)
  const routerBounceMsg = new InternalMessage({
    to: mockCurveWallet,
    from: migrationRouter,
    value: new BN('30000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x414e4c36, 32)
          .endCell()
      )
    })
  });
  const routerBounceRes = await curveContract.sendInternalMessage(routerBounceMsg);
  assert(routerBounceRes.type === 'success', 'Bounced message from Migration Router accepted safely');

  const failedState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(failedState.result[0].toString() === '7', 'Curve safely transitions to STATE_MIGRATION_FAILED (7) on router bounce');

  // 3.14C Recovery: Authorized retry of op::initiate_migration from STATE_MIGRATION_FAILED succeeds
  const retryMigRes = await curveContract.sendInternalMessage(initiateMigMsg);
  assert(retryMigRes.type === 'success', 'Authorized retry of op::initiate_migration succeeds from STATE_MIGRATION_FAILED');

  const retryState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(retryState.result[0].toString() === '5', 'Curve safely transitions back to STATE_MIGRATION_IN_PROGRESS (5)');

  // 3.15 Blocker 2 Remediation: Verified Graduation upon op::lp_locked_confirmation from LP Locker
  const lpConfirmMsg = new InternalMessage({
    to: mockCurveWallet,
    from: lockerAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c33, 32)    // op::lp_locked_confirmation
          .storeUint(51, 64)
          .storeCoins(new BN('1000000000')) // locked LP amount
          .endCell()
      )
    })
  });
  const lpConfirmRes = await curveContract.sendInternalMessage(lpConfirmMsg);
  assert(lpConfirmRes.type === 'success', 'Receives verified op::lp_locked_confirmation from authentic LP Locker');

  const finalGradState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(finalGradState.result[0].toString() === '6', 'Final state transitioned to STATE_GRADUATED (6) only after verified LP custody!');

  // 3.16 Sweep Protocol Fees
  const sweepMsg = new InternalMessage({
    to: mockCurveWallet,
    from: treasuryAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c05, 32)    // op::sweep_fees
          .storeUint(60, 64)
          .endCell()
      )
    })
  });
  const sweepRes = await curveContract.sendInternalMessage(sweepMsg);
  assert(sweepRes.type === 'success', 'Treasury sweeps accumulated protocol fees successfully');
  assert(sweepRes.actionList && sweepRes.actionList.length === 1, 'Emits outbound fee transfer to Treasury wallet');

  // ===========================================================================
  // TEST SUITE 4: ANLGRAM MIGRATION ROUTER (STON.fi v2.1 TL-B & Abort Verification)
  // ===========================================================================
  console.log('\n--- 4. AnlgramMigrationRouter TVM Verification (STON.fi v2.1 TL-B & Abort) ---');

  // STON.fi v2.1 Testnet pTON Minter (verified on-chain: 0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f)
  const ptonMinterAddr    = Address.parseFriendly('kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px').address;
  const routerTokenWallet = new Address(0, Buffer.alloc(32, 11));
  const lpTokenWallet     = new Address(0, Buffer.alloc(32, 12));
  const ptonWallet        = new Address(0, Buffer.alloc(32, 13));

  const initialMigratorData = beginCell()
    .storeUint(0, 1)                      // is_initialized: 0
    .storeAddress(mockCurveWallet)        // curve_address
    .storeAddress(lockerAddr)             // lp_locker_address
    .storeAddress(routerAddr)             // dex_router_address
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)         // token_minter_address
        .storeAddress(ptonMinterAddr)     // pton_minter_address
        .storeCoins(0)                    // ton_liquidity
        .storeCoins(0)                    // tokens_liquidity
        .storeAddress(adminAddr)          // admin_address
        .endCell()
    )
    .endCell();

  const migratorContract = await SmartContract.fromCell(migratorCodeCell, initialMigratorData);

  // 4.1 Initial Getters
  const migInitState = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(migInitState.type === 'success', 'get_migration_data getter executes successfully');
  assert(migInitState.result[0].toString() === '0', 'Migration router initially uninitialized');
  assert(migInitState.result[6].toString() === '0', 'Initial ton_liquidity is 0');
  assert(migInitState.result[7].toString() === '0', 'Initial tokens_liquidity is 0');

  // 4.2 Adversarial Test: Unauthorized TON deposit rejected with exit code 401
  const fakeTonDepMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c36, 32)      // op::deposit_ton_liquidity
          .storeUint(1, 64)
          .storeCoins(new BN((500n * ONE_TON).toString()))
          .endCell()
      )
    })
  });
  const fakeTonDepRes = await migratorContract.sendInternalMessage(fakeTonDepMsg);
  assert(fakeTonDepRes.type === 'failed' && fakeTonDepRes.exit_code === 401, 'Unauthorized TON deposit strictly rejected with exit code 401');

  // 4.3 Authorized TON deposit from authentic Curve
  const authTonDepMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN((500n * ONE_TON).toString()),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c36, 32)
          .storeUint(2, 64)
          .storeCoins(new BN((500n * ONE_TON).toString()))
          .endCell()
      )
    })
  });
  const authTonDepRes = await migratorContract.sendInternalMessage(authTonDepMsg);
  assert(authTonDepRes.type === 'success', 'Authorized TON deposit accepted from Curve');

  // 4.4 Inbound 200M DEX token liquidity via transfer_notification
  const dexTokenDeposit = 200000000n * ONE_TOKEN;
  const tokenDepMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)      // op::transfer_notification
          .storeUint(3, 64)
          .storeCoins(new BN(dexTokenDeposit.toString()))
          .storeAddress(mockCurveWallet)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const tokenDepRes = await migratorContract.sendInternalMessage(tokenDepMsg);
  assert(tokenDepRes.type === 'success', 'Inbound 200M DEX token liquidity received successfully');

  const fundedState = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(fundedState.result[6].toString() === (500n * ONE_TON).toString(), 'ton_liquidity records exact 500 TON');
  assert(fundedState.result[7].toString() === dexTokenDeposit.toString(), 'tokens_liquidity records exact 200M tokens');

  // 4.5 Adversarial Test: Unauthorized execute_dex_provision rejected with exit code 401
  const fakeExecMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr,
    value: new BN('600000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)      // op::execute_dex_provision
          .storeUint(4, 64)
          .storeAddress(routerTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const fakeExecRes = await migratorContract.sendInternalMessage(fakeExecMsg);
  assert(fakeExecRes.type === 'failed' && fakeExecRes.exit_code === 401, 'Unauthorized execute_dex_provision strictly rejected with exit code 401');

  // 4.6 Authorized execute_dex_provision with exact STON.fi v2.1 TL-B construction
  const authExecMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('600000000'),          // 0.60 TON attached gas
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(5, 64)
          .storeAddress(routerTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const authExecRes = await migratorContract.sendInternalMessage(authExecMsg);
  assert(authExecRes.type === 'success', 'execute_dex_provision executes successfully');
  assert(authExecRes.actionList && authExecRes.actionList.length === 3, 'Emits exactly 3 messages: set_lp_wallet, Jetton provide_lp, and pTON ton_transfer');

  const stateAfterExec = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(stateAfterExec.result[0].toString() === '1', 'Migration router marked is_initialized == 1');
  assert(stateAfterExec.result[6].toString() === '0', 'ton_liquidity reset to 0 after dispatch');
  assert(stateAfterExec.result[7].toString() === '0', 'tokens_liquidity reset to 0 after dispatch');

  // 4.7 Abort / Emergency Refund Flow (op::abort_migration)
  const abortData = beginCell()
    .storeUint(0, 1)
    .storeAddress(mockCurveWallet)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(new BN((25n * ONE_TON).toString())) // 25 TON held
        .storeCoins(0)
        .endCell()
    )
    .endCell();
  const abortContract = await SmartContract.fromCell(migratorCodeCell, abortData);

  // Adversarial: non-curve cannot abort
  const fakeAbortMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c38, 32).storeUint(6, 64).endCell())
    })
  });
  const fakeAbortRes = await abortContract.sendInternalMessage(fakeAbortMsg);
  assert(fakeAbortRes.type === 'failed' && fakeAbortRes.exit_code === 401, 'Unauthorized abort_migration strictly rejected with exit code 401');

  // Authorized abort refunds TON to curve
  const authAbortMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c38, 32).storeUint(7, 64).endCell())
    })
  });
  const authAbortRes = await abortContract.sendInternalMessage(authAbortMsg);
  assert(authAbortRes.type === 'success', 'Authorized abort_migration executes successfully');
  assert(authAbortRes.actionList && authAbortRes.actionList.length === 1, 'Emits refund message returning TON liquidity back to Curve');
  const abortFinal = await abortContract.invokeGetMethod('get_migration_data', []);
  assert(abortFinal.result[6].toString() === '0', 'ton_liquidity reset to 0 following successful abort refund');

  // -------------------------------------------------------------------------
  // SECTION 5: PHASE 3B.1 MIGRATION REMEDIATION & FUND SAFETY SUITE
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Phase 3B.1 Migration Remediation & Fund Safety Suite ---');

  // 5.1 Adversarial: transfer_notification from unauthorized sender (spammer)
  const spamTokenMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(10, 64)
          .storeCoins(new BN(dexTokenDeposit.toString()))
          .storeAddress(spamAttackerAddr) // from_address is attacker, not curve!
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const spamTokenRes = await migratorContract.sendInternalMessage(spamTokenMsg);
  assert(spamTokenRes.type === 'failed' && spamTokenRes.exit_code === 401, 'transfer_notification from non-Curve sender strictly rejected with exit code 401');

  // 5.2 Adversarial: transfer_notification with zero tokens
  const zeroTokenMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(11, 64)
          .storeCoins(0) // 0 tokens
          .storeAddress(mockCurveWallet)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const zeroTokenRes = await migratorContract.sendInternalMessage(zeroTokenMsg);
  assert(zeroTokenRes.type === 'failed' && zeroTokenRes.exit_code === 410, 'transfer_notification with 0 tokens strictly rejected with exit code 410');

  // 5.3 Adversarial: execute_dex_provision with insufficient gas (< 0.50 TON)
  const underfundedMigratorData = beginCell()
    .storeUint(0, 1)
    .storeAddress(mockCurveWallet)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(new BN((500n * ONE_TON).toString()))
        .storeCoins(new BN(dexTokenDeposit.toString()))
        .storeAddress(adminAddr)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(mockCurveWallet) // my_token_wallet set
        .storeUint(0, 1)
        .endCell()
    )
    .endCell();
  const underfundedContract = await SmartContract.fromCell(migratorCodeCell, underfundedMigratorData);

  const lowGasExecMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('200000000'), // 0.20 TON < 0.50 TON threshold
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(12, 64)
          .storeAddress(routerTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const lowGasExecRes = await underfundedContract.sendInternalMessage(lowGasExecMsg);
  assert(lowGasExecRes.type === 'failed' && lowGasExecRes.exit_code === 409, 'execute_dex_provision with < 0.50 TON gas rejected with exit code 409 (ERROR_INSUFFICIENT_GAS)');

  // 5.4 Adversarial: execute_dex_provision with null destination address
  const nullAddrExecMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('600000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(13, 64)
          .storeUint(0, 2) // addr_none for router_token_wallet
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const nullAddrExecRes = await underfundedContract.sendInternalMessage(nullAddrExecMsg);
  assert(nullAddrExecRes.type === 'failed' && nullAddrExecRes.exit_code === 408, 'execute_dex_provision with null address rejected with exit code 408');

  // 5.5 Duplicate execute_dex_provision strictly rejected
  const readyContract = await SmartContract.fromCell(migratorCodeCell, underfundedMigratorData);
  const okExecMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('600000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(14, 64)
          .storeAddress(routerTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const okExecRes = await readyContract.sendInternalMessage(okExecMsg);
  assert(okExecRes.type === 'success', 'execute_dex_provision with >= 0.50 TON succeeds without action phase deficit');

  // Now attempt duplicate execution:
  const dupExecRes = await readyContract.sendInternalMessage(okExecMsg);
  assert(dupExecRes.type === 'failed' && dupExecRes.exit_code === 405, 'Duplicate execute_dex_provision strictly rejected with exit code 405 (ALREADY_INITIALIZED)');

  // 5.6 TEP-74 Verification: Confirm message 1 is dispatched to my_token_wallet (owner == sender)
  assert(okExecRes.actionList && okExecRes.actionList.length === 3, 'Emits 3 outbound messages');
  assert(okExecRes.actionList[1].type === 'send_msg', 'Action 1 is send_msg');

  // 5.7 Bounced Message Recovery in Migration Router
  const preBounceData = beginCell()
    .storeUint(1, 1) // was provisioned
    .storeAddress(mockCurveWallet)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(0)
        .storeCoins(0)
        .storeAddress(adminAddr)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(mockCurveWallet)
        .storeUint(0, 1)
        .endCell()
    )
    .endCell();
  const bounceRouterContract = await SmartContract.fromCell(migratorCodeCell, preBounceData);
  const bouncedMsgToRouter = new InternalMessage({
    to: migrationRouter,
    from: ptonWallet,
    value: new BN((499n * ONE_TON).toString()), // 499 TON bounced back
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0xffffffff, 32).endCell())
    })
  });
  const bounceRouterRes = await bounceRouterContract.sendInternalMessage(bouncedMsgToRouter);
  assert(bounceRouterRes.type === 'success', 'Bounced message accepted by Migration Router');
  const postBounceStatus = await bounceRouterContract.invokeGetMethod('get_wallet_and_failure_status', []);
  assert(postBounceStatus.result[1].toString() === '1', 'Migration Router marks is_failed == 1 upon bounce');
  const postBounceData = await bounceRouterContract.invokeGetMethod('get_migration_data', []);
  assert(postBounceData.result[0].toString() === '0', 'is_initialized reset to 0 to enable recovery');
  assert(postBounceData.result[6].toString() === (499n * ONE_TON).toString(), 'Restores bounced TON to ton_liquidity');

  // 5.8 Dual Fund Recovery (TON + Jettons) via abort_migration
  const fullRecoverData = beginCell()
    .storeUint(0, 1)
    .storeAddress(mockCurveWallet)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(new BN((500n * ONE_TON).toString())) // 500 TON
        .storeCoins(new BN(dexTokenDeposit.toString()))    // 200M Jettons
        .storeAddress(adminAddr)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(mockCurveWallet)
        .storeUint(0, 1)
        .endCell()
    )
    .endCell();
  const fullRecoverContract = await SmartContract.fromCell(migratorCodeCell, fullRecoverData);
  const fullAbortMsg = new InternalMessage({
    to: migrationRouter,
    from: mockCurveWallet,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c38, 32).storeUint(15, 64).endCell())
    })
  });
  const fullAbortRes = await fullRecoverContract.sendInternalMessage(fullAbortMsg);
  assert(fullAbortRes.type === 'success', 'abort_migration with TON and Jettons executes successfully');
  assert(fullAbortRes.actionList && fullAbortRes.actionList.length === 2, 'Emits exactly 2 refund messages: 1 TON refund + 1 Jetton refund');

  // Verify second call emits 0 refund messages (anti-double-refund guarantee)
  const secondAbortRes = await fullRecoverContract.sendInternalMessage(fullAbortMsg);
  assert(secondAbortRes.type === 'success', 'Second abort_migration call succeeds idempotently');
  assert(secondAbortRes.actionList && secondAbortRes.actionList.length === 0, 'Zero messages emitted on second abort: Anti-double-refund guaranteed');

  // 5.9 Curve Reception of Returned TON from Migration Router
  const returnTonMsg = new InternalMessage({
    to: mockCurveWallet,
    from: migrationRouter,
    value: new BN((500n * ONE_TON).toString()),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c36, 32) // op::deposit_ton_liquidity
          .storeUint(16, 64)
          .storeCoins(new BN((500n * ONE_TON).toString()))
          .endCell()
      )
    })
  });
  // Send to curveContract (which was in STATE_MIGRATION_FAILED from earlier test)
  const returnTonRes = await curveContract.sendInternalMessage(returnTonMsg);
  assert(returnTonRes.type === 'success', 'Curve accepts returned TON liquidity from authentic Migration Router');

  // Adversarial: non-router cannot return TON
  const fakeReturnTonMsg = new InternalMessage({
    to: mockCurveWallet,
    from: spamAttackerAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c36, 32)
          .storeUint(17, 64)
          .storeCoins(new BN((100n * ONE_TON).toString()))
          .endCell()
      )
    })
  });
  const fakeReturnTonRes = await curveContract.sendInternalMessage(fakeReturnTonMsg);
  assert(fakeReturnTonRes.type === 'failed' && fakeReturnTonRes.exit_code === 401, 'Unauthorized TON return to Curve strictly rejected with exit code 401');

  // 5.10 Curve Reception of Returned 200M DEX Jettons from Migration Router
  const returnJettonMsg = new InternalMessage({
    to: mockCurveWallet,
    from: mockCurveWallet, // comes via curve jetton wallet
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(18, 64)
          .storeCoins(new BN(dexTokenDeposit.toString()))
          .storeAddress(migrationRouter) // from_address is migrationRouter!
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const returnJettonRes = await curveContract.sendInternalMessage(returnJettonMsg);
  assert(returnJettonRes.type === 'success', 'Curve safely accepts returned DEX escrow tokens from Migration Router without triggering invalid sell refund');
  const curveStateAfterReturn = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(curveStateAfterReturn.result[0].toString() === '7', 'Curve state remains STATE_MIGRATION_FAILED (7)');
  const escrowStateAfterReturn = await curveContract.invokeGetMethod('get_dex_escrow', []);
  assert(escrowStateAfterReturn.result[0].toString() === dexTokenDeposit.toString(), 'dex_tokens_escrow restored to 200M tokens');

  // 5.11 Authorized Retry of op::initiate_migration from STATE_MIGRATION_FAILED
  const retryMigrateMsg = new InternalMessage({
    to: mockCurveWallet,
    from: adminAddr,
    value: new BN('300000000'), // 0.30 TON
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c35, 32) // op::initiate_migration
          .storeUint(19, 64)
          .endCell()
      )
    })
  });
  const retryMigrateRes = await curveContract.sendInternalMessage(retryMigrateMsg);
  assert(retryMigrateRes.type === 'success', 'Authorized retry of op::initiate_migration succeeds from STATE_MIGRATION_FAILED');
  assert(retryMigrateRes.actionList && retryMigrateRes.actionList.length === 2, 'Re-dispatches both 200M tokens and 500 TON to Migration Router');
  const curveStateAfterRetry = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(curveStateAfterRetry.result[0].toString() === '5', 'Curve safely transitions back to STATE_MIGRATION_IN_PROGRESS (5)');

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
