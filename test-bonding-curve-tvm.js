/**
 * ANLGRAM Launchpad — Comprehensive TVM Smart Contract Simulation Test Suite
 * File: test-bonding-curve-tvm.js
 * 
 * Verifies the actual compiled TVM bytecode of all 4 launchpad contracts:
 * 1. anlgram-launchpad-jetton-minter.fc (Launchpad Jetton Master with On-Chain Renounce Acknowledgement)
 * 2. anlgram-lp-locker.fc (Anti-Front-Running Immutable DEX LP Locker)
 * 3. anlgram-migration-router.fc (STON.fi v2.1 Migration Router with TEP-74 Compliance & Recovery)
 * 4. anlgram-bonding-curve.fc (Deterministic Constant Product AMM with Anti-Gas Drain & Verified Graduation)
 * 
 * Tests 55+ comprehensive assertions including all adversarial attacks, failure paths,
 * reserve solvency, anti-drain escrow, TEP-74 transfer compliance, bounce recovery,
 * and permanent LP lock.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const minterRequire = createRequire(path.join(__dirname, 'minter-contract', 'package.json'));
delete globalThis.fetch; // Bypass Node 18+ wasm fetch in ton-contract-executor
const { SmartContract, TvmRunnerAsynchronous, TvmRunnerSynchronous } = minterRequire('ton-contract-executor');
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();

const ton = minterRequire('ton');
const { Cell, beginCell, Address, Slice, InternalMessage, CommonMessageInfo, CellMessage } = ton;
const BN = minterRequire('bn.js');
const { compileFunc } = minterRequire('@ton-community/func-js');

let passed = 0;
let failed = 0;

function isJettonSend(action) {
  return action.type === 'send_msg' && action.message.body.beginParse().readUint(32).toNumber() === 0x0f8a7ea5;
}

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
const migrationRouter  = new Address(0, Buffer.alloc(32, 9));
const spamAttackerAddr = new Address(0, Buffer.alloc(32, 10));
const spamTokenWallet  = new Address(0, Buffer.alloc(32, 11));
const lpTokenWallet    = new Address(0, Buffer.alloc(32, 12));
const ptonWallet       = new Address(0, Buffer.alloc(32, 13));
const curveContractAddr = new Address(0, Buffer.alloc(32, 18));

// STON.fi v2.1 Testnet pTON Minter (verified on-chain: 0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f)
const ptonMinterAddr   = Address.parseFriendly('kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px').address;

const ONE_TON = 1000000000n;
const ONE_TOKEN = 1000000000n;

// Standard TEP-74 Jetton Wallet Address Derivation Helper
function calculateJettonWalletAddress(ownerAddress, jettonMasterAddress, jettonWalletCode) {
  const walletData = beginCell()
    .storeCoins(0)
    .storeAddress(ownerAddress)
    .storeAddress(jettonMasterAddress)
    .storeRef(jettonWalletCode)
    .endCell();
  const stateInit = beginCell()
    .storeUint(0, 2)
    .storeUint(1, 1)
    .storeRef(jettonWalletCode)
    .storeUint(1, 1)
    .storeRef(walletData)
    .storeUint(0, 1)
    .endCell();
  return new Address(0, stateInit.hash());
}

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
  // Compile jetton-wallet.fc in-memory for authentic wallet simulation & derivation
  const contractsDir = path.join(__dirname, 'minter-contract', 'contracts');
  const sources = (filePath) => {
    const p = path.isAbsolute(filePath) ? filePath : path.join(contractsDir, filePath);
    return fs.readFileSync(p, 'utf-8');
  };
  const walletComp = await compileFunc({ targets: ['jetton-wallet.fc'], sources });
  if (walletComp.status === 'error') {
    throw new Error(`Failed to compile jetton-wallet.fc: ${walletComp.message}`);
  }
  const walletCodeCell = Cell.fromBoc(Buffer.from(walletComp.codeBoc, 'base64'))[0];

  // Authentic Derived Jetton Wallets
  const mockCurveWallet      = calculateJettonWalletAddress(curveContractAddr, masterAddr, walletCodeCell);
  const myJettonWallet       = calculateJettonWalletAddress(migrationRouter, masterAddr, walletCodeCell);
  const dexRouterTokenWallet = calculateJettonWalletAddress(routerAddr, masterAddr, walletCodeCell);

  console.log(`Authentic Derived Curve Jetton Wallet: ${mockCurveWallet.toFriendly()}`);
  console.log(`Authentic Derived Migrator Jetton Wallet: ${myJettonWallet.toFriendly()}`);
  console.log(`Authentic Derived DEX Router Jetton Wallet: ${dexRouterTokenWallet.toFriendly()}\n`);

  // ===========================================================================
  // TEST SUITE 1: ANLGRAM LAUNCHPAD JETTON MINTER (Blocker 1 Remediation)
  // ===========================================================================
  console.log('--- 1. AnlgramLaunchpadJettonMinter (On-Chain Renounce & Anti-Mint) ---');

  const initialMinterData = beginCell()
    .storeCoins(0)               // total_supply
    .storeAddress(adminAddr)     // admin_address (the Curve / Deployer)
    .storeRef(new Cell())        // content
    .storeRef(walletCodeCell)    // jetton_wallet_code
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

  // 1.3 Renounce Admin: Admin sends op == 3 setting admin to addr_none
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
          .endCell()
      )
    })
  });
  const renounceRes = await minterContract.sendInternalMessage(renounceMsg);
  assert(renounceRes.type === 'success', 'Processes op == 3 to renounce admin to addr_none');
  assert(renounceRes.actionList && renounceRes.actionList.length === 1, 'Emits on-chain acknowledgement message back to Curve');

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
  // TEST SUITE 2: ANLGRAM LP LOCKER (Blocker 3 Remediation & Hardened Authorizations)
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
    .storeAddress(curveContractAddr)      // curve_address
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
  lockerContract.setC7Config({ myself: lockerAddr });

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

  // 2.3B Adversarial Test: Initializing router with colliding address (adminAddr or curveContractAddr) rejected with exit code 408
  const collidingInitRouterMsg = new InternalMessage({
    to: lockerAddr,
    from: adminAddr,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c39, 32)
          .storeUint(31, 64)
          .storeAddress(curveContractAddr)
          .endCell()
      )
    })
  });
  const collidingInitRouterRes = await lockerContract.sendInternalMessage(collidingInitRouterMsg);
  assert(collidingInitRouterRes.type === 'failed' && collidingInitRouterRes.exit_code === 408, 'Initializing router with colliding address rejected with exit code 408');

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

  // 2.6B Adversarial Test: Configuring LP wallet with colliding address (routerAddr) rejected with exit code 408
  const badLpWalletMsg = new InternalMessage({
    to: lockerAddr,
    from: migrationRouter,
    value: new BN('30000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c31, 32)
          .storeUint(51, 64)
          .storeAddress(routerAddr) // Collides with pool/router!
          .endCell()
      )
    })
  });
  const badLpWalletRes = await lockerContract.sendInternalMessage(badLpWalletMsg);
  assert(badLpWalletRes.type === 'failed' && badLpWalletRes.exit_code === 408, 'Configuring LP wallet with colliding address rejected with exit code 408');

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

  // 2.9B Adversarial Test: Transfer notification with 0 LP token amount rejected with 406
  const zeroLpTransferMsg = new InternalMessage({
    to: lockerAddr,
    from: lpWalletMock,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(100, 64)
          .storeCoins(0)                // 0 tokens!
          .storeAddress(routerAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const zeroLpTransferRes = await lockerContract.sendInternalMessage(zeroLpTransferMsg);
  assert(zeroLpTransferRes.type === 'failed' && zeroLpTransferRes.exit_code === 406, 'Transfer notification with 0 LP token amount strictly rejected with exit code 406');

  // 2.9C Adversarial Test: Transfer notification with forged from_address rejected with 401
  const forgedFromTransferMsg = new InternalMessage({
    to: lockerAddr,
    from: lpWalletMock,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(100, 64)
          .storeCoins(new BN('1000000000'))
          .storeAddress(spamAttackerAddr) // Forged sender!
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const forgedFromTransferRes = await lockerContract.sendInternalMessage(forgedFromTransferMsg);
  assert(forgedFromTransferRes.type === 'failed' && forgedFromTransferRes.exit_code === 401, 'Transfer notification with forged from_address rejected with exit code 401');

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
  // TEST SUITE 3: ANLGRAM BONDING CURVE (AMM, Renounce, Anti-Drain, Recovery)
  // ===========================================================================
  console.log('\n--- 3. AnlgramBondingCurve TVM Verification (AMM, Renounce, Anti-Drain) ---');

  const vTon = 166666666666n;
  const vTok = 266666666665600000n;
  const tGrad = 500n * ONE_TON;
  const curveTokens = 800000000n * ONE_TOKEN;
  const dexEscrow = 200000000n * ONE_TOKEN;

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
        .storeRef(walletCodeCell)         // jetton_wallet_code
        .endCell()
    )
    .endCell();

  const curveContract = await SmartContract.fromCell(curveCodeCell, initialCurveData);
  curveContract.setC7Config({ myself: curveContractAddr });

  // 3.1 Initial Getters
  const curveStateRes = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(curveStateRes.type === 'success', 'get_curve_state getter executes successfully');
  assert(curveStateRes.result[0].toString() === '0', 'Initial state is STATE_UNINITIALIZED (0)');
  assert(curveStateRes.result[4].toString() === '0', 'Initial real_ton_reserve is 0');
  assert(curveStateRes.result[5].toString() === curveTokens.toString(), 'Initial real_token_reserve is 800M tokens');
  assert(curveStateRes.result[7].toString() === '0', 'Initial pending_refunds_tokens is 0');

  // 3.1B Adversarial Test: op::init_launchpad with forged/unauthentic curve wallet rejected with 408
  const fakeInitCurveMsg = new InternalMessage({
    to: curveContractAddr,
    from: adminAddr,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(masterAddr)
          .storeAddress(adminAddr)        // Attacker forged wallet!
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migrationRouter)
              .endCell()
          )
          .storeRef(walletCodeCell)
          .endCell()
      )
    })
  });
  const fakeInitCurveRes = await curveContract.sendInternalMessage(fakeInitCurveMsg);
  assert(fakeInitCurveRes.type === 'failed' && fakeInitCurveRes.exit_code === 408, 'op::init_launchpad with forged wallet strictly rejected with exit code 408');

  // 3.2 Initialize Launchpad with authentic derived wallet
  const initMsg = new InternalMessage({
    to: curveContractAddr,
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
          .storeRef(walletCodeCell)
          .endCell()
      )
    })
  });
  const initRes = await curveContract.sendInternalMessage(initMsg);
  assert(initRes.type === 'success', 'op::init_launchpad transitions to STATE_INITIALIZING (1)');

  // 3.2B Adversarial Test: Duplicate op::init_launchpad rejected with exit code 407
  const dupInitCurveRes = await curveContract.sendInternalMessage(initMsg);
  assert(dupInitCurveRes.type === 'failed' && dupInitCurveRes.exit_code === 407, 'Duplicate op::init_launchpad strictly rejected with exit code 407');

  // 3.3 Receive 1 Billion Token Custody from authentic curve jetton wallet
  const total1B = curveTokens + dexEscrow;
  const depositMsg = new InternalMessage({
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
      to: curveContractAddr,
      from: buyerAddr,
      value: new BN(buyAmountTon.toString()),
      bounce: false,
      body: new CommonMessageInfo({
        body: new CellMessage(beginCell().storeUint(0x5fcc3d14, 32).storeUint(20, 64).storeCoins(0).endCell())
      })
    })
  );
  assert(buyRes.type === 'success', 'Buy order executes on TVM curve successfully');
  assert(buyRes.actionList && buyRes.actionList.filter(isJettonSend).length === 1 &&
    buyRes.actionList.some(a => a.type === 'reserve_currency'), 'Buy reserves protected TON and emits one outbound Jetton transfer');

  // 3.8B Adversarial Test: Inbound sell notification from unauthorized Jetton wallet rejected with exit code 401
  const fakeWalletSellMsg = new InternalMessage({
    to: curveContractAddr,
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
    to: curveContractAddr,
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
  assert(sufficientGasSellRes.actionList?.filter(isJettonSend).length === 1 &&
    sufficientGasSellRes.actionList.some(a => a.type === 'reserve_currency') &&
    sufficientGasSellRes.actionList.filter(a => a.type === 'send_msg').length === 2,
    'Reserves prior TON, refunds tokens and returns unused notification gas');

  const stateAfterSufficient = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterSufficient.result[4].toString() === tonReserveBefore, 'Curve real TON reserve remains 100% UNCHANGED (Zero gas subsidy paid from reserve)');
  assert(stateAfterSufficient.result[5].toString() === tokenReserveBefore, 'Curve real token reserve remains 100% UNCHANGED after immediate refund');

  // 3.10 Blocker 4 Remediation: Slippage Rejection with Underfunded Gas (< 0.035 TON) -> Escrow in Pending Refunds
  const underfundedGasSellMsg = new InternalMessage({
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
    to: curveContractAddr,
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
  assert(claimRefundRes.actionList?.filter(isJettonSend).length === 1 && claimRefundRes.actionList.some(a => a.type === 'reserve_currency'), 'Reserves prior balance and emits claimant-funded return transfer');

  const stateAfterClaim = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterClaim.result[7].toString() === '0', 'pending_refunds_tokens reset to 0 after successful claim');

  // 3.12 Adversarial Test: Double claim attempt rejected with exit code 409
  const doubleClaimRes = await curveContract.sendInternalMessage(claimRefundMsg);
  assert(doubleClaimRes.type === 'failed' && doubleClaimRes.exit_code === 409, 'Double claim attempt strictly rejected with exit code 409 (ERROR_NO_PENDING_REFUND)');

  // 3.12A1 Adversarial Test: Bounced message from unauthorized sender safely ignored
  const bouncedTokensAmount = 5000000n * ONE_TOKEN;
  const fakeBouncedMsg = new InternalMessage({
    to: curveContractAddr,
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
    to: curveContractAddr,
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
  const bouncedMsg = new InternalMessage({
    to: curveContractAddr,
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
    to: curveContractAddr,
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
  assert(claimBouncedRes.actionList?.filter(isJettonSend).length === 1 && claimBouncedRes.actionList.some(a => a.type === 'reserve_currency'), 'Reserves prior balance and dispatches bounced-token claim');

  const stateAfterClaimBounced = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterClaimBounced.result[7].toString() === '0', 'pending_refunds_tokens reset to 0 after claiming recovered bounce');

  // 3.13 Huge Buy triggers Graduation Threshold -> STATE_GRADUATION_PENDING
  const hugeBuyMsg = new InternalMessage({
    to: curveContractAddr,
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
  console.log('GRAD STATE RESULT:', gradPendingState.result.map(x => x.toString()));
  assert(gradPendingState.result[0].toString() === '4', 'State transitioned to STATE_GRADUATION_PENDING (4)');
  assert(gradPendingState.result[5].toString() === '0', 'All 800M curve tokens sold out at graduation');

  // 3.14 Blocker 2 Remediation: op::initiate_migration dispatches to Migration Router
  const preMigState = await curveContract.invokeGetMethod('get_curve_state', []);
  const tonToMigrate = BigInt(preMigState.result[4].toString());

  const initiateMigMsg = new InternalMessage({
    to: curveContractAddr,
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
  assert(initiateMigRes.actionList && initiateMigRes.actionList.length === 2, 'Emits 2 outbound messages: 200M DEX tokens + TON liquidity to Migration Router');

  const migInProgressState = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(migInProgressState.result[0].toString() === '5', 'Curve transitions to STATE_MIGRATION_IN_PROGRESS (5) - NOT prematurely graduated');

  // 3.14B Migration Abort/Recovery Verification: Curve accepts returned TON & Tokens from Migration Router
  // Simulate Migration Router aborting and refunding reserves back to Curve
  const refundTonMsg = new InternalMessage({
    to: curveContractAddr,
    from: migrationRouter,
    value: new BN(tonToMigrate.toString()),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c36, 32)    // op::deposit_ton_liquidity
          .storeUint(52, 64)
          .storeCoins(new BN(tonToMigrate.toString()))
          .endCell()
      )
    })
  });
  const refundTonRes = await curveContract.sendInternalMessage(refundTonMsg);
  assert(refundTonRes.type === 'success', 'Curve safely accepts returned TON reserves from Migration Router in abort flow');

  const refundTokensMsg = new InternalMessage({
    to: curveContractAddr,
    from: mockCurveWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)    // op::transfer_notification
          .storeUint(53, 64)
          .storeCoins(new BN(dexEscrow.toString()))
          .storeAddress(migrationRouter) // from_address == migrationRouter!
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const refundTokensRes = await curveContract.sendInternalMessage(refundTokensMsg);
  assert(refundTokensRes.type === 'success', 'Curve safely accepts returned 200M DEX tokens from Migration Router in abort flow');

  const stateAfterAbortRefund = await curveContract.invokeGetMethod('get_curve_state', []);
  assert(stateAfterAbortRefund.result[0].toString() === '4', 'State safely restored to STATE_GRADUATION_PENDING (4) upon receiving full reserve refund');
  assert(stateAfterAbortRefund.result[4].toString() === tonToMigrate.toString(), 'real_ton_reserve 100% restored to pre-migration amount');
  const escrowStateRes = await curveContract.invokeGetMethod('get_dex_escrow_state', []);
  assert(escrowStateRes.result[2].toString() === dexEscrow.toString(), 'dex_tokens_escrow 100% restored to 200M tokens');

  // Re-dispatch migration to advance back to STATE_MIGRATION_IN_PROGRESS
  const reMigRes = await curveContract.sendInternalMessage(initiateMigMsg);
  assert(reMigRes.type === 'success', 'Re-dispatches migration back to STATE_MIGRATION_IN_PROGRESS');

  // 3.15 Adversarial Test: Fake LP confirmation from attacker rejected with 401
  const fakeLpConfirmMsg = new InternalMessage({
    to: curveContractAddr,
    from: spamAttackerAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c33, 32)    // op::lp_locked_confirmation
          .storeUint(54, 64)
          .storeCoins(new BN('1000000000'))
          .endCell()
      )
    })
  });
  const fakeLpConfirmRes = await curveContract.sendInternalMessage(fakeLpConfirmMsg);
  assert(fakeLpConfirmRes.type === 'failed' && fakeLpConfirmRes.exit_code === 401, 'Fake LP confirmation from attacker strictly rejected with exit code 401');

  // 3.15B Adversarial Test: LP confirmation with 0 locked LP tokens rejected with 406
  const zeroLpConfirmMsg = new InternalMessage({
    to: curveContractAddr,
    from: lockerAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c33, 32)
          .storeUint(55, 64)
          .storeCoins(0)                // 0 LP tokens!
          .endCell()
      )
    })
  });
  const zeroLpConfirmRes = await curveContract.sendInternalMessage(zeroLpConfirmMsg);
  assert(zeroLpConfirmRes.type === 'failed' && zeroLpConfirmRes.exit_code === 406, 'LP confirmation with 0 LP tokens strictly rejected with exit code 406');

  // 3.15C Verified Graduation upon op::lp_locked_confirmation from authentic LP Locker
  const lpConfirmMsg = new InternalMessage({
    to: curveContractAddr,
    from: lockerAddr,
    value: new BN('20000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c33, 32)    // op::lp_locked_confirmation
          .storeUint(56, 64)
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
    to: curveContractAddr,
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
  // TEST SUITE 4: ANLGRAM MIGRATION ROUTER (STON.fi v2.1 TL-B, TEP-74, Abort & Bounce)
  // ===========================================================================
  console.log('\n--- 4. AnlgramMigrationRouter TVM Verification (STON.fi v2.1 TL-B & TEP-74) ---');

  const initialMigratorData = beginCell()
    .storeUint(0, 1)                      // is_initialized: 0
    .storeAddress(curveContractAddr)      // curve_address
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
    .storeRef(
      beginCell()
        .storeAddress(lpTokenWallet)      // expected_lp_wallet
        .storeAddress(ptonWallet)         // expected_pton_wallet
        .storeCoins(0)                    // pending_ton
        .storeCoins(0)                    // pending_tokens
        .storeRef(walletCodeCell)         // jetton_wallet_code
        .endCell()
    )
    .endCell();

  const migratorContract = await SmartContract.fromCell(migratorCodeCell, initialMigratorData);
  migratorContract.setC7Config({ myself: migrationRouter });

  // 4.1 Initial Getters & Derivation Verification
  const migInitState = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(migInitState.type === 'success', 'get_migration_data getter executes successfully');
  assert(migInitState.result[0].toString() === '0', 'Migration router initially uninitialized');
  assert(migInitState.result[6].toString() === '0', 'Initial ton_liquidity is 0');
  assert(migInitState.result[7].toString() === '0', 'Initial tokens_liquidity is 0');

  const extRes = await migratorContract.invokeGetMethod('get_migration_extended_data', []);
  assert(extRes.type === 'success', 'get_migration_extended_data getter executes successfully');
  const tvmMyWallet = extRes.result[6].readAddress();
  const tvmDexWallet = extRes.result[7].readAddress();
  assert(tvmMyWallet.equals(myJettonWallet), 'On-chain TVM derivation of my_jetton_wallet exactly matches TEP-74 specification');
  assert(tvmDexWallet.equals(dexRouterTokenWallet), 'On-chain TVM derivation of dex_router_token_wallet exactly matches TEP-74 specification');

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

  // 4.2B Adversarial Test: Token transfer_notification from unauthorized sender rejected with 401
  const fakeWalletTokenMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr, // NOT my_jetton_wallet!
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(21, 64)
          .storeCoins(new BN((200000000n * ONE_TOKEN).toString()))
          .storeAddress(curveContractAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const fakeWalletTokenRes = await migratorContract.sendInternalMessage(fakeWalletTokenMsg);
  assert(fakeWalletTokenRes.type === 'failed' && fakeWalletTokenRes.exit_code === 401, 'Token transfer_notification from unauthorized sender strictly rejected with exit code 401');

  // 4.2C Adversarial Test: Token transfer_notification from wrong from_address rejected with 401
  const fakeFromTokenMsg = new InternalMessage({
    to: migrationRouter,
    from: myJettonWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(22, 64)
          .storeCoins(new BN((200000000n * ONE_TOKEN).toString()))
          .storeAddress(spamAttackerAddr) // NOT curve_address!
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const fakeFromTokenRes = await migratorContract.sendInternalMessage(fakeFromTokenMsg);
  assert(fakeFromTokenRes.type === 'failed' && fakeFromTokenRes.exit_code === 401, 'Token transfer_notification from wrong from_address strictly rejected with exit code 401');

  // 4.2D Adversarial Test: Token transfer_notification with 0 amount rejected with 406
  const zeroTokenMsg = new InternalMessage({
    to: migrationRouter,
    from: myJettonWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)
          .storeUint(23, 64)
          .storeCoins(0)                // 0 tokens!
          .storeAddress(curveContractAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const zeroTokenRes = await migratorContract.sendInternalMessage(zeroTokenMsg);
  assert(zeroTokenRes.type === 'failed' && zeroTokenRes.exit_code === 406, 'Token transfer_notification with 0 amount strictly rejected with exit code 406');

  // 4.3 Authorized TON deposit from authentic Curve
  const authTonDepMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
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

  // 4.4 Inbound 200M DEX token liquidity from authentic my_jetton_wallet
  const dexTokenDeposit = 200000000n * ONE_TOKEN;
  const tokenDepMsg = new InternalMessage({
    to: migrationRouter,
    from: myJettonWallet,
    value: new BN('50000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x7362d09c, 32)      // op::transfer_notification
          .storeUint(3, 64)
          .storeCoins(new BN(dexTokenDeposit.toString()))
          .storeAddress(curveContractAddr)
          .storeUint(0, 1)
          .endCell()
      )
    })
  });
  const tokenDepRes = await migratorContract.sendInternalMessage(tokenDepMsg);
  assert(tokenDepRes.type === 'success', 'Inbound 200M DEX token liquidity received from authentic Jetton wallet');

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
          .storeAddress(dexRouterTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const fakeExecRes = await migratorContract.sendInternalMessage(fakeExecMsg);
  assert(fakeExecRes.type === 'failed' && fakeExecRes.exit_code === 401, 'Unauthorized execute_dex_provision strictly rejected with exit code 401');

  // 4.5A Adversarial Test: Underfunded gas (< 0.40 TON) rejected with exit code 405
  const underfundedGasExecMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('350000000'),          // 0.35 TON < 0.40 TON minimum required
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(41, 64)
          .storeAddress(dexRouterTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const underfundedGasExecRes = await migratorContract.sendInternalMessage(underfundedGasExecMsg);
  assert(underfundedGasExecRes.type === 'failed' && underfundedGasExecRes.exit_code === 405, 'execute_dex_provision with underfunded gas (< 0.40 TON) strictly rejected with exit code 405');

  // 4.5B Adversarial Test: Wrong router_token_wallet in execute_dex_provision rejected with exit code 408
  const wrongRouterWalletMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('600000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(42, 64)
          .storeAddress(myJettonWallet)  // Passing wrong wallet!
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const wrongRouterWalletRes = await migratorContract.sendInternalMessage(wrongRouterWalletMsg);
  assert(wrongRouterWalletRes.type === 'failed' && wrongRouterWalletRes.exit_code === 408, 'execute_dex_provision with unauthentic router_token_wallet rejected with exit code 408');

  // 4.5C Adversarial Test: Mismatched lp_token_wallet rejected with exit code 408
  const wrongLpWalletMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('600000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(43, 64)
          .storeAddress(dexRouterTokenWallet)
          .storeAddress(spamAttackerAddr) // Mismatched LP wallet!
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const wrongLpWalletRes = await migratorContract.sendInternalMessage(wrongLpWalletMsg);
  assert(wrongLpWalletRes.type === 'failed' && wrongLpWalletRes.exit_code === 408, 'execute_dex_provision with mismatched lp_token_wallet rejected with exit code 408');

  // 4.6 Authorized execute_dex_provision: Verifies TEP-74 Transfer Dispatch
  const authExecMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('600000000'),          // 0.60 TON attached gas (> 0.40 TON)
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0x414e4c37, 32)
          .storeUint(5, 64)
          .storeAddress(dexRouterTokenWallet)
          .storeAddress(lpTokenWallet)
          .storeAddress(ptonWallet)
          .endCell()
      )
    })
  });
  const authExecRes = await migratorContract.sendInternalMessage(authExecMsg);
  assert(authExecRes.type === 'success', 'execute_dex_provision executes successfully with authentic derived wallets');
  assert(authExecRes.actionList && authExecRes.actionList.length === 3, 'Emits exactly 3 messages: set_lp_wallet, Jetton provide_lp, and pTON ton_transfer');

  // Inspect the 3 outbound messages emitted by execute_dex_provision
  const msg1 = authExecRes.actionList[0].message; // set_lp_wallet to LP Locker
  const msg2 = authExecRes.actionList[1].message; // op::transfer to my_jetton_wallet (TEP-74!)
  const msg3 = authExecRes.actionList[2].message; // op::ton_transfer to pton_wallet

  assert(msg1.info.dest.equals(lockerAddr), 'Message 1 is set_lp_wallet directed to authentic LP Locker');
  assert(msg2.info.dest.equals(myJettonWallet), 'Finding 1 Remediated: Message 2 op::transfer directed to authentic my_jetton_wallet (NOT router_token_wallet)');
  assert(msg3.info.dest.equals(ptonWallet), 'Message 3 op::ton_transfer directed to authentic pTON wallet');

  // Parse Message 2 payload to verify TEP-74 structure and STON.fi v2.1 provide_lp forward_payload
  const msg2Slice = msg2.body.beginParse();
  const msg2Op = msg2Slice.readUint(32).toNumber();
  const msg2QueryId = msg2Slice.readUint(64);
  const msg2Amount = msg2Slice.readCoins();
  const msg2Dest = msg2Slice.readAddress();
  assert(msg2Op === 0x0f8a7ea5, 'Message 2 opcode is op::transfer() (0x0f8a7ea5)');
  assert(msg2Amount.toString() === dexTokenDeposit.toString(), 'Message 2 transfers exact 200M DEX token liquidity');
  assert(msg2Dest.equals(routerAddr), 'Message 2 TEP-74 destination is STON.fi DEX Router');

  // 4.6B Adversarial Test: Duplicate execute_dex_provision rejected with exit code 407
  const dupExecRes = await migratorContract.sendInternalMessage(authExecMsg);
  assert(dupExecRes.type === 'failed' && dupExecRes.exit_code === 407, 'Duplicate execute_dex_provision strictly rejected with exit code 407 (ALREADY_INITIALIZED)');

  // 4.6C LIVE TVM EXECUTION OF JETTON-WALLET.FC: Proves Finding 1
  // We feed Message 2 into an actual SmartContract instance of jetton-wallet.fc
  const initialMyWalletData = beginCell()
    .storeCoins(new BN(dexTokenDeposit.toString())) // 200M tokens balance
    .storeAddress(migrationRouter)                   // owner_address: migrationRouter
    .storeAddress(masterAddr)                        // jetton_master_address
    .storeRef(walletCodeCell)                        // jetton_wallet_code
    .endCell();
  const myWalletContract = await SmartContract.fromCell(walletCodeCell, initialMyWalletData);
  myWalletContract.setC7Config({ myself: myJettonWallet });

  // Deliver the exact message emitted by MigrationRouter to myJettonWallet
  const liveWalletTransferMsg = new InternalMessage({
    to: myJettonWallet,
    from: migrationRouter,
    value: msg2.info.value.coins,
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(msg2.body) })
  });
  const liveWalletRes = await myWalletContract.sendInternalMessage(liveWalletTransferMsg);
  assert(liveWalletRes.type === 'success', 'LIVE JETTON WALLET: Transfer sent to my_jetton_wallet succeeds with exit code 0');

  // Now prove: If the transfer was mistakenly sent to dexRouterTokenWallet, TVM reverts with 705!
  const initialDexWalletData = beginCell()
    .storeCoins(0)
    .storeAddress(routerAddr)                        // owner_address: routerAddr (STON.fi DEX router)
    .storeAddress(masterAddr)
    .storeRef(walletCodeCell)
    .endCell();
  const dexWalletContract = await SmartContract.fromCell(walletCodeCell, initialDexWalletData);
  dexWalletContract.setC7Config({ myself: dexRouterTokenWallet });

  const buggyTransferMsg = new InternalMessage({
    to: dexRouterTokenWallet,
    from: migrationRouter,                           // Sender is migrationRouter, NOT routerAddr!
    value: msg2.info.value.coins,
    bounce: false,
    body: new CommonMessageInfo({ body: new CellMessage(msg2.body) })
  });
  const buggyWalletRes = await dexWalletContract.sendInternalMessage(buggyTransferMsg);
  assert(buggyWalletRes.type === 'failed' && buggyWalletRes.exit_code === 705, 'LIVE JETTON WALLET PROOF: Transfer directed to dexRouterTokenWallet reverts with exit code 705 (TEP-74 ownership check)');

  // 4.7 Bounce Recovery Flow in Migration Router
  // Simulate bounced Jetton transfer from my_jetton_wallet
  const bouncedJettonMsg = new InternalMessage({
    to: migrationRouter,
    from: myJettonWallet,
    value: new BN('50000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x0f8a7ea5, 32)                 // op::transfer()
          .storeUint(5, 64)
          .storeCoins(new BN(dexTokenDeposit.toString()))
          .endCell()
      )
    })
  });
  const bouncedJettonRes = await migratorContract.sendInternalMessage(bouncedJettonMsg);
  assert(bouncedJettonRes.type === 'success', 'Bounced Jetton transfer parsed and handled safely by Migration Router');

  const stateAfterBouncedJetton = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(stateAfterBouncedJetton.result[0].toString() === '0', 'is_initialized reset to 0 following bounced message');
  assert(stateAfterBouncedJetton.result[7].toString() === dexTokenDeposit.toString(), 'tokens_liquidity 100% restored to 200M tokens upon bounce');

  // Simulate bounced pTON transfer from ptonWallet
  const bouncedPtonMsg = new InternalMessage({
    to: migrationRouter,
    from: ptonWallet,
    value: new BN('50000000'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({
      body: new CellMessage(
        beginCell()
          .storeUint(0xffffffff, 32)
          .storeUint(0x01f3835d, 32)                 // op::ton_transfer()
          .storeUint(5, 64)
          .storeCoins(new BN((500n * ONE_TON).toString()))
          .endCell()
      )
    })
  });
  const bouncedPtonRes = await migratorContract.sendInternalMessage(bouncedPtonMsg);
  assert(bouncedPtonRes.type === 'success', 'Bounced pTON transfer parsed and handled safely by Migration Router');

  const stateAfterBouncedPton = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(stateAfterBouncedPton.result[6].toString() === (500n * ONE_TON).toString(), 'ton_liquidity 100% restored to 500 TON upon bounce');

  // 4.8 Abort / Emergency Refund Flow (op::abort_migration)
  // When migration fails or is aborted, both TON and tokens must be refunded to Curve
  // Adversarial: non-curve cannot abort
  const fakeAbortMsg = new InternalMessage({
    to: migrationRouter,
    from: spamAttackerAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c38, 32).storeUint(6, 64).endCell())
    })
  });
  const fakeAbortRes = await migratorContract.sendInternalMessage(fakeAbortMsg);
  assert(fakeAbortRes.type === 'failed' && fakeAbortRes.exit_code === 401, 'Unauthorized abort_migration strictly rejected with exit code 401');

  // Authorized abort from curve_address
  const authAbortMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('100000000'),          // 0.10 TON attached
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c38, 32).storeUint(7, 64).endCell())
    })
  });
  const authAbortRes = await migratorContract.sendInternalMessage(authAbortMsg);
  assert(authAbortRes.type === 'success', 'Authorized abort_migration executes successfully');
  assert(authAbortRes.actionList && authAbortRes.actionList.length === 2, 'Emits 2 outbound refund messages: token refund via my_jetton_wallet and TON refund to Curve');

  const abortFinal = await migratorContract.invokeGetMethod('get_migration_data', []);
  assert(abortFinal.result[6].toString() === '0', 'ton_liquidity reset to 0 following successful abort refund');
  assert(abortFinal.result[7].toString() === '0', 'tokens_liquidity reset to 0 following successful abort refund');

  // 4.9 Storage Serialization Integrity Verification
  // Missing admin_address (truncated storage) MUST fail on load
  const truncatedMigratorData = beginCell()
    .storeUint(0, 1)
    .storeAddress(curveContractAddr)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(0)
        .storeCoins(0)
        // Missing admin_address!
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(lpTokenWallet)
        .storeAddress(ptonWallet)
        .storeCoins(0)
        .storeCoins(0)
        .storeRef(walletCodeCell)
        .endCell()
    )
    .endCell();
  const truncatedContract = await SmartContract.fromCell(migratorCodeCell, truncatedMigratorData);
  truncatedContract.setC7Config({ myself: migrationRouter });
  const truncatedRes = await truncatedContract.invokeGetMethod('get_migration_data', []);
  assert(truncatedRes.type === 'failed', 'Truncated state without admin_address strictly fails on load');

  const truncMsg = new InternalMessage({
    to: migrationRouter,
    from: curveContractAddr,
    value: new BN('100000000'),
    bounce: false,
    body: new CommonMessageInfo({
      body: new CellMessage(beginCell().storeUint(0x414e4c36, 32).storeUint(1, 64).storeCoins(100).endCell())
    })
  });
  const truncMsgRes = await truncatedContract.sendInternalMessage(truncMsg);
  assert(truncMsgRes.type === 'failed', 'Internal transaction on truncated state strictly fails with TVM cell underflow');

  // Verify that setting admin_address to addr_none triggers exit code 408 (ERROR_INVALID_ADDRESS)
  const badAdminData = beginCell()
    .storeUint(0, 1)
    .storeAddress(curveContractAddr)
    .storeAddress(lockerAddr)
    .storeAddress(routerAddr)
    .storeRef(
      beginCell()
        .storeAddress(masterAddr)
        .storeAddress(ptonMinterAddr)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 2) // addr_none
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(lpTokenWallet)
        .storeAddress(ptonWallet)
        .storeCoins(0)
        .storeCoins(0)
        .storeRef(walletCodeCell)
        .endCell()
    )
    .endCell();
  const badAdminContract = await SmartContract.fromCell(migratorCodeCell, badAdminData);
  badAdminContract.setC7Config({ myself: migrationRouter });
  const badAdminRes = await badAdminContract.sendInternalMessage(truncMsg);
  assert(badAdminRes.type === 'failed' && badAdminRes.exit_code === 408, 'Initial state with addr_none admin_address strictly rejected with exit code 408');

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
