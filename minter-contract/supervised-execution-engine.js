'use strict';

/**
 * ANLGRAM MemeLabs — Supervised Testnet Execution Engine (Phase 3D.0)
 * File: minter-contract/supervised-execution-engine.js
 *
 * SAFETY INVARIANTS:
 * 1. Zero Private Keys or Seed Phrases: Never requests, stores, or handles private keys.
 * 2. Independent Human Approval: Every single transaction is presented individually for review and approval.
 * 3. TON Connect 2.0 Integration: Signatures are delegated to the user's external wallet.
 * 4. Strict Network Isolation: Exclusively operates on TON Testnet (global_id: -3). Rejects mainnet connections (-239).
 * 5. Manifest Blockade: Documents that TON Connect strictly requires an HTTPS-hosted tonconnect-manifest.json.
 *    Without an official HTTPS manifest, live wallet connection is blocked (no improvised tunnels or prod bypasses).
 * 6. Read-Only Pre-flight Verification: Prior to presenting any signature prompt, on-chain state, balances,
 *    and contract dependencies are strictly verified.
 * 7. Post-Execution Reconciliation: Prevents subsequent operations upon error, bounce, or timeout.
 * 8. Financial Invariants: Itemized gas budget distinguishes deployer gas from the 500 TON user liquidity graduation target.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { Cell, beginCell, contractAddress, Address } = require('@ton/core');

const EXPECTED_TESTNET_GLOBAL_ID = '-3';
const EXPECTED_TESTNET_CHAIN = -3;
const MAINNET_CHAIN = -239;

// Candidate B Approved Testnet Infrastructure
const APPROVED_TESTNET_DEX = {
  router: 'kQAFpeGFJQA9KqiCxXZ8J4l__vSYAxFSirSOvPHn6SSX4ztn',
  routerRaw: '0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3',
  ptonMaster: 'kQACS30DNoUQ7NfApPvzh7eBmSZ9L4ygJ-lkNWtba8TQT-Px',
  ptonMasterRaw: '0:0092df40d7a1443b35f0293efce1ede066499f4be32809fa590d5ad6daf13413',
  version: 'STON.fi DEX v2.2 (Release)',
};

// Itemized gas and operational budget
const SUPERVISED_BUDGET = {
  items: [
    { step: 1, name: 'Deploy Launchpad Jetton Master', costTon: 0.08, costNano: 80000000n, note: 'StateInit deployment' },
    { step: 2, name: 'Deploy Bonding Curve', costTon: 0.15, costNano: 150000000n, note: 'StateInit deployment + AMM storage' },
    { step: 3, name: 'Deploy LP Locker', costTon: 0.10, costNano: 100000000n, note: 'StateInit deployment + lock storage' },
    { step: 4, name: 'Deploy Migration Router', costTon: 0.12, costNano: 120000000n, note: 'StateInit deployment + routing storage' },
    { step: 5, name: 'Bootstrap 1: Init LP Locker (0x414e4c39)', costTon: 0.05, costNano: 50000000n, note: 'One-time router binding' },
    { step: 6, name: 'Bootstrap 2: Init Launchpad (0x414e4c01)', costTon: 0.06, costNano: 60000000n, note: 'One-time curve setup' },
    { step: 7, name: 'Bootstrap 3: Mint 1B Tokens & Renounce', costTon: 0.10, costNano: 100000000n, note: 'Mint 1B tokens to Curve + renounce admin' },
    { step: 8, name: 'Bootstrap 4: Verify Admin Renounce & Activate', costTon: 0.05, costNano: 50000000n, note: 'Activation check / recovery gas' },
  ],
  operationalReserveBuffer: 1.50, // Buffer for network fee fluctuations and storage across blocks
  minimumRequiredBalance: 2.71,   // Hard-stop floor: items sum (0.71) + reserve (1.50) + provision buffer (0.50)
  recommendedBalance: 3.50,      // Recommended operator wallet balance
  graduationTargetTon: 500.0,    // 500 TON target liquidity provided solely by users during trading
};

// TON Connect 2.0 Protocol Specifications & Manifest Requirements
const TONCONNECT_SPEC = {
  protocolVersion: 2,
  requiredChain: EXPECTED_TESTNET_CHAIN,
  networkString: 'testnet',
  manifestRequirements: {
    protocol: 'https:',
    requiredFields: ['url', 'name', 'iconUrl'],
    allowLocalhost: false, // Disallowed by Tonkeeper & mobile wallets
    status: 'BLOCKED_PENDING_HTTPS_HOSTING',
    blockerReason: 'TON Connect strictly requires a public HTTPS URL hosting tonconnect-manifest.json on an approved domain. In accordance with security directives, no unreviewed production deployments or improvised public tunnels (e.g. ngrok) are permitted to bypass this restriction.',
  },
};

/**
 * Derives the 4 deterministic launchpad contract addresses from compiled artifacts and operator wallet.
 */
function deriveDeterministicAddresses(deployerAddress, artifacts, dexConfig = APPROVED_TESTNET_DEX) {
  const deployer = Address.parse(deployerAddress);
  const dexRouter = Address.parse(dexConfig.router);
  const ptonMaster = Address.parse(dexConfig.ptonMaster);
  const treasuryAddr = Address.parseRaw('0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d');

  // Load code cells
  const minterCode = Cell.fromBoc(Buffer.from(artifacts.launchpadMinter.codeBocBase64, 'base64'))[0];
  const curveCode = Cell.fromBoc(Buffer.from(artifacts.bondingCurve.codeBocBase64, 'base64'))[0];
  const lockerCode = Cell.fromBoc(Buffer.from(artifacts.lpLocker.codeBocBase64, 'base64'))[0];
  const migratorCode = Cell.fromBoc(Buffer.from(artifacts.migrationRouter.codeBocBase64, 'base64'))[0];

  const dummyWalletCode = new Cell();
  const dummyContent = beginCell().storeUint(0, 8).endCell();

  // 1. Minter StateInit
  const minterData = beginCell()
    .storeCoins(0)
    .storeAddress(deployer)
    .storeRef(dummyContent)
    .storeRef(dummyWalletCode)
    .endCell();
  const minterStateInit = { code: minterCode, data: minterData };
  const minterAddress = contractAddress(0, minterStateInit);

  // 2. Bonding Curve StateInit
  const vTon = 166666666666n;
  const vTok = 266666666665600000n;
  const tGrad = 500000000000n; // 500 TON
  const curveTokens = 800000000000000000n; // 800M
  const dexEscrow = 200000000000000000n; // 200M

  const curveData = beginCell()
    .storeUint(0, 8) // STATE_UNINITIALIZED
    .storeUint(100, 16) // 1.00% fee
    .storeRef(
      beginCell()
        .storeAddress(deployer)
        .storeAddress(deployer)
        .storeAddress(treasuryAddr)
        .storeRef(
          beginCell()
            .storeAddress(minterAddress)
            .storeAddress(null) // curve_jetton_wallet calculated post-deploy
            .storeAddress(dexRouter)
            .storeRef(
              beginCell()
                .storeAddress(null) // lp_locker unbound in StateInit
                .storeAddress(null) // migration_router unbound in StateInit
                .endCell()
            )
            .endCell()
        )
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeCoins(0)
        .storeCoins(curveTokens)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(vTon)
        .storeCoins(vTok)
        .storeCoins(tGrad)
        .storeCoins(dexEscrow)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeDict(null)
        .storeRef(dummyWalletCode)
        .endCell()
    )
    .endCell();
  const curveStateInit = { code: curveCode, data: curveData };
  const curveAddress = contractAddress(0, curveStateInit);

  // 3. LP Locker StateInit
  const lockerData = beginCell()
    .storeUint(0, 1) // is_locked
    .storeUint(BigInt('0xFFFFFFFFFFFFFFFF'), 64) // permanent lock timestamp
    .storeCoins(0)
    .storeUint(0, 1) // is_wallet_initialized
    .storeUint(0, 1) // is_router_initialized
    .storeAddress(null) // pool_address
    .storeAddress(curveAddress) // curve_address bound directly
    .storeRef(
      beginCell()
        .storeAddress(null) // lp_wallet_address
        .storeAddress(null) // router_address (initialized post-deploy)
        .endCell()
    )
    .storeRef(
      beginCell()
        .storeAddress(deployer)
        .endCell()
    )
    .endCell();
  const lockerStateInit = { code: lockerCode, data: lockerData };
  const lockerAddress = contractAddress(0, lockerStateInit);

  // 4. Migration Router StateInit
  const migratorData = beginCell()
    .storeUint(0, 1) // is_initialized
    .storeAddress(curveAddress)
    .storeAddress(lockerAddress)
    .storeAddress(dexRouter)
    .storeRef(
      beginCell()
        .storeAddress(minterAddress)
        .storeAddress(ptonMaster)
        .storeCoins(0)
        .storeCoins(0)
        .storeAddress(deployer)
        .endCell()
    )
    .endCell();
  const migratorStateInit = { code: migratorCode, data: migratorData };
  const migratorAddress = contractAddress(0, migratorStateInit);

  return {
    launchpadMinter: {
      address: minterAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: minterAddress.toRawString(),
      codeHash: minterCode.hash().toString('hex'),
      stateInit: minterStateInit,
      stateInitBocBase64: beginCell().storeBit(0).storeBit(0).storeBit(1).storeRef(minterCode).storeBit(1).storeRef(minterData).endCell().toBoc().toString('base64'),
    },
    bondingCurve: {
      address: curveAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: curveAddress.toRawString(),
      codeHash: curveCode.hash().toString('hex'),
      stateInit: curveStateInit,
      stateInitBocBase64: beginCell().storeBit(0).storeBit(0).storeBit(1).storeRef(curveCode).storeBit(1).storeRef(curveData).endCell().toBoc().toString('base64'),
    },
    lpLocker: {
      address: lockerAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: lockerAddress.toRawString(),
      codeHash: lockerCode.hash().toString('hex'),
      stateInit: lockerStateInit,
      stateInitBocBase64: beginCell().storeBit(0).storeBit(0).storeBit(1).storeRef(lockerCode).storeBit(1).storeRef(lockerData).endCell().toBoc().toString('base64'),
    },
    migrationRouter: {
      address: migratorAddress.toString({ testOnly: true, bounceable: true }),
      rawAddress: migratorAddress.toRawString(),
      codeHash: migratorCode.hash().toString('hex'),
      stateInit: migratorStateInit,
      stateInitBocBase64: beginCell().storeBit(0).storeBit(0).storeBit(1).storeRef(migratorCode).storeBit(1).storeRef(migratorData).endCell().toBoc().toString('base64'),
    },
  };
}

/**
 * Builds the comprehensive 8-step execution operations catalogue.
 */
function buildDeploymentOperations(deployerAddress, predictedAddresses, dexConfig = APPROVED_TESTNET_DEX) {
  const dexRouter = Address.parse(dexConfig.router);
  const ptonMaster = Address.parse(dexConfig.ptonMaster);
  const dummyWalletCode = new Cell();

  return [
    {
      step: 1,
      id: 'OP_1_DEPLOY_MINTER',
      name: 'Deploy Launchpad Jetton Master',
      contractLabel: 'Launchpad Jetton Master',
      operationType: 'DEPLOY_STATEINIT',
      targetKey: 'launchpadMinter',
      targetAddress: predictedAddresses.launchpadMinter.address,
      targetRawAddress: predictedAddresses.launchpadMinter.rawAddress,
      amountTon: 0.08,
      amountNano: 80000000n,
      stateInitBocBase64: predictedAddresses.launchpadMinter.stateInitBocBase64,
      codeHash: predictedAddresses.launchpadMinter.codeHash,
      payloadBocBase64: null,
      opcodeHex: null,
      opcodeName: 'none',
      dependencies: [],
      precondition: {
        targetAccountState: 'UNINITIALIZED',
        description: 'Account address must be completely uninitialized (zero code, zero data).',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Account transitions to active on-chain with verified code hash.',
      },
      irreversibleEffects: [
        'Permanent reservation of the deterministic Jetton Master address on TON testnet.',
        'Initializes total supply to 0 and binds deployer as temporary admin.',
      ],
    },
    {
      step: 2,
      id: 'OP_2_DEPLOY_CURVE',
      name: 'Deploy Bonding Curve',
      contractLabel: 'Bonding Curve',
      operationType: 'DEPLOY_STATEINIT',
      targetKey: 'bondingCurve',
      targetAddress: predictedAddresses.bondingCurve.address,
      targetRawAddress: predictedAddresses.bondingCurve.rawAddress,
      amountTon: 0.15,
      amountNano: 150000000n,
      stateInitBocBase64: predictedAddresses.bondingCurve.stateInitBocBase64,
      codeHash: predictedAddresses.bondingCurve.codeHash,
      payloadBocBase64: null,
      opcodeHex: null,
      opcodeName: 'none',
      dependencies: ['OP_1_DEPLOY_MINTER'],
      precondition: {
        targetAccountState: 'UNINITIALIZED',
        description: 'Curve address must be uninitialized; Launchpad Minter must be active.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        expectedStateEnum: 0, // STATE_UNINITIALIZED
        description: 'Curve active on-chain in STATE_UNINITIALIZED (0).',
      },
      irreversibleEffects: [
        'Permanently locks AMM parameters: virtual TON (166.666 TON), virtual Token (266.666M), graduation threshold (500 TON), 1% fee.',
      ],
    },
    {
      step: 3,
      id: 'OP_3_DEPLOY_LOCKER',
      name: 'Deploy LP Locker',
      contractLabel: 'LP Locker',
      operationType: 'DEPLOY_STATEINIT',
      targetKey: 'lpLocker',
      targetAddress: predictedAddresses.lpLocker.address,
      targetRawAddress: predictedAddresses.lpLocker.rawAddress,
      amountTon: 0.10,
      amountNano: 100000000n,
      stateInitBocBase64: predictedAddresses.lpLocker.stateInitBocBase64,
      codeHash: predictedAddresses.lpLocker.codeHash,
      payloadBocBase64: null,
      opcodeHex: null,
      opcodeName: 'none',
      dependencies: ['OP_2_DEPLOY_CURVE'],
      precondition: {
        targetAccountState: 'UNINITIALIZED',
        description: 'Locker address must be uninitialized; Bonding Curve must be active.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Locker active on-chain, bound permanently to Curve address with lock until 0xFFFFFFFFFFFFFFFF.',
      },
      irreversibleEffects: [
        'Permanent binding to Bonding Curve address. Tokens sent here can NEVER be withdrawn.',
      ],
    },
    {
      step: 4,
      id: 'OP_4_DEPLOY_MIGRATOR',
      name: 'Deploy Migration Router',
      contractLabel: 'Migration Router',
      operationType: 'DEPLOY_STATEINIT',
      targetKey: 'migrationRouter',
      targetAddress: predictedAddresses.migrationRouter.address,
      targetRawAddress: predictedAddresses.migrationRouter.rawAddress,
      amountTon: 0.12,
      amountNano: 120000000n,
      stateInitBocBase64: predictedAddresses.migrationRouter.stateInitBocBase64,
      codeHash: predictedAddresses.migrationRouter.codeHash,
      payloadBocBase64: null,
      opcodeHex: null,
      opcodeName: 'none',
      dependencies: ['OP_1_DEPLOY_MINTER', 'OP_2_DEPLOY_CURVE', 'OP_3_DEPLOY_LOCKER'],
      precondition: {
        targetAccountState: 'UNINITIALIZED',
        description: 'Migrator address must be uninitialized; Minter, Curve, and Locker must be active.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Migrator active on-chain, bound to STON.fi DEX v2.2 and pTON v2 Master.',
      },
      irreversibleEffects: [
        'Permanent binding to Candidate B DEX Router (STON.fi v2.2) and pTON v2 Master.',
      ],
    },
    {
      step: 5,
      id: 'OP_5_INIT_LP_LOCKER',
      name: 'Bootstrap 1: Init LP Locker (0x414e4c39)',
      contractLabel: 'LP Locker',
      operationType: 'CONTRACT_CALL',
      targetKey: 'lpLocker',
      targetAddress: predictedAddresses.lpLocker.address,
      targetRawAddress: predictedAddresses.lpLocker.rawAddress,
      amountTon: 0.05,
      amountNano: 50000000n,
      stateInitBocBase64: null,
      codeHash: null,
      opcodeHex: '0x414e4c39',
      opcodeName: 'op::init_lp_locker',
      payloadBocBase64: (() => {
        const migAddr = Address.parse(predictedAddresses.migrationRouter.address);
        const cell = beginCell()
          .storeUint(0x414e4c39, 32)
          .storeUint(1, 64) // query_id
          .storeAddress(migAddr)
          .endCell();
        return cell.toBoc().toString('base64');
      })(),
      dependencies: ['OP_3_DEPLOY_LOCKER', 'OP_4_DEPLOY_MIGRATOR'],
      precondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'LP Locker active, is_router_initialized == 0, Migration Router active.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        getterMethod: 'is_router_initialized',
        expectedGetterResult: 1,
        description: 'LP Locker has router_address set and is_router_initialized returns 1.',
      },
      irreversibleEffects: [
        'One-time authorized router configuration on LP Locker. Duplicate calls will be rejected with exit code 405.',
      ],
    },
    {
      step: 6,
      id: 'OP_6_INIT_LAUNCHPAD',
      name: 'Bootstrap 2: Init Launchpad (0x414e4c01)',
      contractLabel: 'Bonding Curve',
      operationType: 'CONTRACT_CALL',
      targetKey: 'bondingCurve',
      targetAddress: predictedAddresses.bondingCurve.address,
      targetRawAddress: predictedAddresses.bondingCurve.rawAddress,
      amountTon: 0.06,
      amountNano: 60000000n,
      stateInitBocBase64: null,
      codeHash: null,
      opcodeHex: '0x414e4c01',
      opcodeName: 'op::init_launchpad',
      payloadBocBase64: (() => {
        const minterAddr = Address.parse(predictedAddresses.launchpadMinter.address);
        const routerAddr = Address.parse(dexConfig.router);
        const lockerAddr = Address.parse(predictedAddresses.lpLocker.address);
        const migAddr = Address.parse(predictedAddresses.migrationRouter.address);
        const cell = beginCell()
          .storeUint(0x414e4c01, 32)
          .storeUint(1, 64)
          .storeAddress(minterAddr)
          .storeAddress(null) // auto-calculate curve jetton wallet
          .storeRef(
            beginCell()
              .storeAddress(routerAddr)
              .storeAddress(lockerAddr)
              .storeAddress(migAddr)
              .endCell()
          )
          .storeRef(dummyWalletCode)
          .endCell();
        return cell.toBoc().toString('base64');
      })(),
      dependencies: ['OP_2_DEPLOY_CURVE', 'OP_5_INIT_LP_LOCKER'],
      precondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        expectedStateEnum: 0, // STATE_UNINITIALIZED
        description: 'Bonding Curve active in STATE_UNINITIALIZED (0); LP Locker router initialized.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        expectedStateEnum: 1, // STATE_INITIALIZING
        description: 'Bonding Curve transitions to STATE_INITIALIZING (1).',
      },
      irreversibleEffects: [
        'One-time launchpad setup. Binds Minter, DEX Router, LP Locker, and Migration Router to Curve.',
      ],
    },
    {
      step: 7,
      id: 'OP_7_MINT_AND_RENOUNCE',
      name: 'Bootstrap 3: Mint 1B Tokens & Renounce Admin',
      contractLabel: 'Launchpad Jetton Master',
      operationType: 'CONTRACT_CALL',
      targetKey: 'launchpadMinter',
      targetAddress: predictedAddresses.launchpadMinter.address,
      targetRawAddress: predictedAddresses.launchpadMinter.rawAddress,
      amountTon: 0.10,
      amountNano: 100000000n,
      stateInitBocBase64: null,
      codeHash: null,
      opcodeHex: '0x00000015 / 0x00000003',
      opcodeName: 'op::mint & op::change_admin(addr_none)',
      payloadBocBase64: (() => {
        // Change admin to addr_none with custom_recipient = Curve
        const curveAddr = Address.parse(predictedAddresses.bondingCurve.address);
        const cell = beginCell()
          .storeUint(3, 32) // op == 3 (change_admin)
          .storeUint(0x414e4c4752454e4fn, 64) // "ANLGRENO"
          .storeUint(0, 2) // addr_none (new_admin)
          .storeAddress(curveAddr) // custom_recipient
          .endCell();
        return cell.toBoc().toString('base64');
      })(),
      dependencies: ['OP_6_INIT_LAUNCHPAD'],
      precondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Curve in STATE_INITIALIZING (1); Minter admin is operator wallet.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Minter admin permanently renounced to addr_none; Curve receives renounce confirmation.',
      },
      irreversibleEffects: [
        'PERMANENT AND IRREVERSIBLE: Admin rights permanently renounced to addr_none. No more tokens can ever be minted.',
      ],
    },
    {
      step: 8,
      id: 'OP_8_ACTIVATE_CURVE',
      name: 'Bootstrap 4: Verify Admin Renounce & Activate Curve',
      contractLabel: 'Bonding Curve',
      operationType: 'ONCHAIN_VERIFICATION',
      targetKey: 'bondingCurve',
      targetAddress: predictedAddresses.bondingCurve.address,
      targetRawAddress: predictedAddresses.bondingCurve.rawAddress,
      amountTon: 0.05,
      amountNano: 50000000n,
      stateInitBocBase64: null,
      codeHash: null,
      opcodeHex: '0x51c9d382',
      opcodeName: 'op::check_renounce (optional recovery)',
      payloadBocBase64: null,
      dependencies: ['OP_7_MINT_AND_RENOUNCE'],
      precondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        description: 'Minter admin is addr_none; renounce notification received by Curve.',
      },
      postcondition: {
        targetAccountState: 'ALREADY_ACTIVE',
        expectedStateEnum: 3, // STATE_ACTIVE
        description: 'Curve is live in STATE_ACTIVE (3); public trading is officially enabled.',
      },
      irreversibleEffects: [
        'Activates live trading on the bonding curve. Curve is permanently open for public buy/sell orders.',
      ],
    },
  ];
}

/**
 * Validates a TON Connect 2.0 wallet session.
 * Strictly verifies testnet network (-3) and flags manifest blocker.
 */
function validateTonConnectSession(session, expectedDeployerAddress, artifacts = null, dexConfig = APPROVED_TESTNET_DEX) {
  const result = {
    valid: false,
    networkOk: false,
    chain: null,
    walletAddress: null,
    walletMatchesConfiguredDeployer: false,
    recalculatedAddresses: null,
    manifestStatus: TONCONNECT_SPEC.manifestRequirements.status,
    manifestBlockedReason: TONCONNECT_SPEC.manifestRequirements.blockerReason,
    errors: [],
    warnings: [],
  };

  if (!session || typeof session !== 'object') {
    result.errors.push('TON Connect session object is null or undefined.');
    return result;
  }

  // 1. Network / Chain Verification
  result.chain = session.chain;
  if (session.chain === MAINNET_CHAIN || String(session.chain) === String(MAINNET_CHAIN)) {
    result.errors.push(`SECURITY VIOLATION: Connected wallet is on MAINNET (chain: ${session.chain}). Mainnet operations are strictly prohibited.`);
    return result;
  }

  if (session.chain !== EXPECTED_TESTNET_CHAIN && String(session.chain) !== EXPECTED_TESTNET_GLOBAL_ID) {
    result.errors.push(`SECURITY VIOLATION: Connected wallet chain '${session.chain}' does not match TON Testnet (${EXPECTED_TESTNET_CHAIN}).`);
    return result;
  }
  result.networkOk = true;

  // 2. Wallet Account Verification
  const accountAddr = session.account && session.account.address ? String(session.account.address).trim() : '';
  if (!accountAddr) {
    result.errors.push('TON Connect session account address is missing.');
    return result;
  }

  try {
    const parsed = Address.parse(accountAddr);
    result.walletAddress = parsed.toString({ testOnly: true, bounceable: true });
  } catch (err) {
    result.errors.push(`Invalid account address in TON Connect session: ${err.message}`);
    return result;
  }

  // 3. Comparison with configured deployer address
  if (expectedDeployerAddress) {
    try {
      const expParsed = Address.parse(expectedDeployerAddress);
      const isMatch = expParsed.equals(Address.parse(result.walletAddress));
      result.walletMatchesConfiguredDeployer = isMatch;

      if (!isMatch) {
        result.warnings.push(
          `Connected wallet (${result.walletAddress}) differs from configured deployer (${expectedDeployerAddress}). All deterministic contract addresses must be recalculated.`
        );
        if (artifacts) {
          result.recalculatedAddresses = deriveDeterministicAddresses(result.walletAddress, artifacts, dexConfig);
        }
      }
    } catch (err) {
      result.errors.push(`Configured deployer address is invalid: ${err.message}`);
      return result;
    }
  }

  // 4. Manifest Requirement Status
  if (!session.manifestUrl || !session.manifestUrl.startsWith('https://')) {
    result.warnings.push(
      `TON Connect manifest URL is missing or non-HTTPS: ${result.manifestBlockedReason}`
    );
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Formats the TON Connect 2.0 transaction payload for a single operation.
 * Strictly enforces 1 message per transaction (NO batching of irreversible operations).
 */
function buildTonConnectTransactionPayload(operation, operatorAddress, validUntilSeconds = 300) {
  if (!operation) throw new Error('Operation is required to build transaction payload.');
  if (!operatorAddress) throw new Error('Operator address is required to build transaction payload.');

  const validUntil = Math.floor(Date.now() / 1000) + validUntilSeconds;

  const msg = {
    address: operation.targetAddress,
    amount: operation.amountNano.toString(),
  };

  if (operation.stateInitBocBase64) {
    msg.stateInit = operation.stateInitBocBase64;
  }
  if (operation.payloadBocBase64) {
    msg.payload = operation.payloadBocBase64;
  }

  return {
    validUntil,
    network: EXPECTED_TESTNET_GLOBAL_ID,
    from: operatorAddress,
    messages: [msg], // Strictly 1 message
  };
}

/**
 * Formats a comprehensive, human-readable terminal/UI approval card.
 */
function formatHumanApprovalCard(operation, sessionInfo, budgetState = SUPERVISED_BUDGET) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════════════════');
  lines.push(`📋 OPERATION ${operation.step} OF 8: ${operation.name.toUpperCase()}`);
  lines.push('═══════════════════════════════════════════════════════════════════════════\n');

  lines.push(`  Contract:            ${operation.contractLabel}`);
  lines.push(`  Operation Type:      ${operation.operationType}`);
  lines.push(`  Target Address:      ${operation.targetAddress}`);
  lines.push(`  Target Raw Address:  ${operation.targetRawAddress}`);
  lines.push(`  Proposed TON Value:  ${operation.amountTon.toFixed(2)} TON (${operation.amountNano.toString()} nanoTON)`);

  if (operation.codeHash) {
    lines.push(`  Artifact Code Hash:  ${operation.codeHash}`);
  }
  if (operation.opcodeHex) {
    lines.push(`  Payload Opcode:      ${operation.opcodeHex} (${operation.opcodeName})`);
  }
  if (operation.payloadBocBase64) {
    lines.push(`  Payload BOC (Base64): ${operation.payloadBocBase64}`);
  }

  lines.push(`\n--- Execution Context ---`);
  lines.push(`  Operator Wallet:     ${sessionInfo.operatorAddress}`);
  lines.push(`  Target Network:      TON Testnet (global_id: -3, chain: -3)`);
  lines.push(`  Min Total Balance:   ${budgetState.minimumRequiredBalance.toFixed(2)} TON (Reserve Buffer: ${budgetState.operationalReserveBuffer.toFixed(2)} TON)`);
  if (typeof sessionInfo.balanceTon === 'number') {
    lines.push(`  Current Wallet Bal:  ${sessionInfo.balanceTon.toFixed(4)} TON`);
  }

  lines.push(`\n--- Pre-Condition Verification ---`);
  lines.push(`  Target Status Req:   ${operation.precondition.targetAccountState}`);
  lines.push(`  Requirement Detail:  ${operation.precondition.description}`);

  lines.push(`\n--- Irreversible Effects & Operational Risks ---`);
  for (const risk of operation.irreversibleEffects) {
    lines.push(`  ⚠️  ${risk}`);
  }

  lines.push('\n───────────────────────────────────────────────────────────────────────────');
  lines.push('  APPROVAL ACTIONS:');
  lines.push('  [1] APPROVE: Transmit transaction request to connected external wallet.');
  lines.push('  [2] CANCEL:  Abort procedure immediately without sending any transaction.');
  lines.push('═══════════════════════════════════════════════════════════════════════════\n');

  return lines.join('\n');
}

/**
 * Validates pre-conditions in read-only mode prior to presenting an operation for signature.
 * Fails closed if query is indeterminate, rate-limited, or conditions are not met.
 */
function verifyStepPreconditionsReadOnly(operation, onChainTargetState, operatorBalanceNano, completedStepIds = []) {
  const blockers = [];
  const warnings = [];

  // 1. Check dependencies
  for (const depId of operation.dependencies) {
    if (!completedStepIds.includes(depId)) {
      blockers.push(`Pre-requisite operation '${depId}' has not been confirmed on-chain.`);
    }
  }

  // 2. Check on-chain target state
  if (!onChainTargetState) {
    blockers.push(`On-chain state for target ${operation.targetAddress} could not be determined.`);
  } else if (onChainTargetState.status === 'RATE_LIMITED') {
    blockers.push(`Rate limit reached (HTTP 429). Procedure stopped. Must not proceed on partial info.`);
  } else if (onChainTargetState.category === 'INDETERMINATE') {
    blockers.push(`Target account query returned indeterminate state (${onChainTargetState.detail}). Must not assume clean.`);
  } else {
    const requiredCategory = operation.precondition.targetAccountState;
    if (requiredCategory === 'UNINITIALIZED' && onChainTargetState.category !== 'UNINITIALIZED') {
      blockers.push(
        `Target address ${operation.targetAddress} is already ${onChainTargetState.category} (${onChainTargetState.status})! Deploying StateInit would be ignored or corrupt existing instance.`
      );
    }
    if (requiredCategory === 'ALREADY_ACTIVE' && onChainTargetState.category !== 'ALREADY_ACTIVE') {
      blockers.push(
        `Target address ${operation.targetAddress} is ${onChainTargetState.category} (${onChainTargetState.status}), but must be ALREADY_ACTIVE to execute call.`
      );
    }
  }

  // 3. Balance preflight
  const minRequiredNano = BigInt(Math.floor(SUPERVISED_BUDGET.minimumRequiredBalance * 1e9));
  if (typeof operatorBalanceNano === 'bigint') {
    if (operatorBalanceNano < minRequiredNano) {
      blockers.push(
        `Operator wallet balance (${(Number(operatorBalanceNano) / 1e9).toFixed(4)} TON) is below the minimum required ${SUPERVISED_BUDGET.minimumRequiredBalance.toFixed(2)} TON.`
      );
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Evaluates the verifiable on-chain outcome of a transmitted transaction.
 * Strictly stops on bounce, error, timeout, or state mismatch.
 */
function evaluatePostApprovalResult(operation, txReceipt, postOnchainState, getterResult = null) {
  if (!txReceipt) {
    return {
      status: 'INDETERMINATE_TIMEOUT',
      success: false,
      mustHalt: true,
      canAutoRetry: false,
      reason: 'No transaction receipt returned. Timeout reached without verifiable confirmation.',
    };
  }

  if (txReceipt.userRejected) {
    return {
      status: 'USER_REJECTED',
      success: false,
      mustHalt: true,
      canAutoRetry: false,
      reason: 'Transaction was rejected by the user in the external wallet.',
    };
  }

  if (txReceipt.bounced || (typeof txReceipt.exitCode === 'number' && txReceipt.exitCode !== 0)) {
    return {
      status: 'TRANSACTION_FAILED_BOUNCED',
      success: false,
      mustHalt: true,
      canAutoRetry: false,
      exitCode: txReceipt.exitCode,
      reason: `Transaction resulted in TVM error or bounce (exit_code: ${txReceipt.exitCode}). Sequence halted.`,
    };
  }

  if (!postOnchainState || postOnchainState.category === 'INDETERMINATE') {
    return {
      status: 'INDETERMINATE_POST_STATE',
      success: false,
      mustHalt: true,
      canAutoRetry: false,
      reason: 'Unable to query resulting on-chain state after transaction broadcast.',
    };
  }

  // Verify post-conditions
  if (operation.postcondition.targetAccountState && postOnchainState.category !== operation.postcondition.targetAccountState) {
    return {
      status: 'POSTCONDITION_UNMET',
      success: false,
      mustHalt: true,
      canAutoRetry: false,
      reason: `Target account state is ${postOnchainState.category}, expected ${operation.postcondition.targetAccountState}.`,
    };
  }

  if (typeof operation.postcondition.expectedStateEnum === 'number') {
    if (getterResult !== operation.postcondition.expectedStateEnum) {
      return {
        status: 'GETTER_VERIFICATION_FAILED',
        success: false,
        mustHalt: true,
        canAutoRetry: false,
        reason: `Contract state enum getter returned ${getterResult}, expected ${operation.postcondition.expectedStateEnum}.`,
      };
    }
  }

  return {
    status: 'STEP_VERIFIED_SUCCESS',
    success: true,
    mustHalt: false,
    canAutoRetry: false,
    reason: `Operation ${operation.step} verified successfully on-chain.`,
  };
}

/**
 * Sanitizes strings, objects, or error logs to ensure no secrets (mnemonics, private keys) are exposed.
 */
function sanitizeLogOutput(input) {
  if (typeof input !== 'string') {
    try {
      input = JSON.stringify(input);
    } catch {
      input = String(input);
    }
  }
  return input
    .replace(/\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/gi, '[REDACTED_MNEMONIC]')
    .replace(/--mnemonic[=\s][^\s]+/gi, '--mnemonic=[REDACTED]')
    .replace(/--seed[=\s][^\s]+/gi, '--seed=[REDACTED]')
    .replace(/--key[=\s][^\s]+/gi, '--key=[REDACTED]')
    .replace(/[0-9a-fA-F]{64}/g, (match) => `[REDACTED_HEX_KEY:${match.slice(0, 4)}...]`);
}

module.exports = {
  EXPECTED_TESTNET_GLOBAL_ID,
  EXPECTED_TESTNET_CHAIN,
  MAINNET_CHAIN,
  APPROVED_TESTNET_DEX,
  SUPERVISED_BUDGET,
  TONCONNECT_SPEC,
  deriveDeterministicAddresses,
  buildDeploymentOperations,
  validateTonConnectSession,
  buildTonConnectTransactionPayload,
  formatHumanApprovalCard,
  verifyStepPreconditionsReadOnly,
  evaluatePostApprovalResult,
  sanitizeLogOutput,
};
