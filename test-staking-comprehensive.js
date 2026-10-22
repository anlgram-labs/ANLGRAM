/**
 * ANLGRAM Staking Module — Comprehensive Automated Verification Suite
 * File: test-staking-comprehensive.js
 *
 * Verifies:
 * 1. Exact BigInt nanoTON fee math (`ANLGRAM_STAKE_FEE_BPS = 35` = 0.35%, NEVER 3500):
 *    - 1 TON -> 0.0035 TON (3,500,000 nanoTON)
 *    - 100 TON -> 0.35 TON (350,000,000 nanoTON)
 *    - 1,000 TON -> 3.5 TON (3,500,000,000 nanoTON)
 *    - Rounding down to nanoTON, no max cap, 0% fee on withdrawals/claims.
 * 2. Full TVM Smart Contract Execution of `AnlgramStakingRouter` (`anlgram-staking-router.fc`):
 *    - Phase 1 deposit escrow (`0x414e4c53` -> forwards `0x47d54391` to Tonstakers Pool, holds fee in escrow).
 *    - Phase 2 confirmation (`0x7362d09c` from router tsTON wallet -> releases 0.35% fee to
 *      `UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd` and transfers 100% of minted tsTON to client).
 *    - Pool bounce handling (`flags & 1` on `0x47d54391` -> refunds principal + fee to client, 0 fee charged).
 *    - Timeout refund handling (`0x414e4c54` after 900s -> refunds escrowed fee + gas to client, 0 fee charged).
 *    - Replay protection, wrong chain ID rejection (`-239` vs `-3`), under-minimum rejection,
 *      unauthorized Jetton wallet rejection, and non-custodial admin restrictions.
 *    - Multi-client concurrent accounting (`Client A: 1 TON`, `Client B: 100 TON`, `Client C: 1,000 TON`).
 * 3. Live On-Chain Verification against TonAPI v2 (Testnet `-3` and Mainnet `-239`).
 * 4. Static & Behavioral Frontend Audit of `assets/js/staking.js`, `staking.html`, `assets/js/wallet-connect.js`, and `assets/js/api.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const minterRequire = createRequire(path.join(__dirname, 'minter-contract', 'package.json'));
const nativeFetch = globalThis.fetch;
delete globalThis.fetch; // Ensure Emscripten in ton-contract-executor loads vm-exec.wasm via fs.readFileSync on Node 24
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

// Load staking.js helpers in Node context
const stakingJsSource = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'staking.js'), 'utf8');
const stakingHtmlSource = fs.readFileSync(path.join(__dirname, 'staking.html'), 'utf8');
const walletConnectSource = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'wallet-connect.js'), 'utf8');
const apiJsSource = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'api.js'), 'utf8');

const sandboxWindow = {};
const sandboxLocalStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
};
const loadFn = new Function('window', 'localStorage', `
  ${stakingJsSource}
  return {
    STAKING_CONFIG,
    toNanoSafe,
    fromNanoSafe,
    calculateAnlgramStakeFeeNano,
    calculateStakeDepositBreakdown,
    isValidTonAddress,
    friendlyToRawAddress,
    rawToFriendlyAddress,
  };
`);
const StakingModule = loadFn(sandboxWindow, sandboxLocalStorage);

/* ══════════════════════════════════════════════════════════════
   HELPER: BUILD ROUTER DATA CELL & INTERNAL MESSAGES FOR TVM
   ══════════════════════════════════════════════════════════════ */

function buildRouterDataCell({
  adminAddr,
  feeRecipientAddr,
  feeBps = 35,
  paused = 0,
  networkId = -3,
  totalPendingEscrow = 0n,
  poolAddr,
  routerJWalletAddr,
  minStakeNano = 1000000000n,
  partnerCode = new BN('106796caef', 16),
  timeoutSec = 900,
}) {
  const cfgCell = beginCell()
    .storeAddress(poolAddr)
    .storeAddress(routerJWalletAddr)
    .storeCoins(new BN(minStakeNano.toString()))
    .storeUint(partnerCode, 64)
    .storeUint(timeoutSec, 32)
    .endCell();

  const statsCell = beginCell()
    .storeCoins(0)
    .storeCoins(0)
    .storeCoins(0)
    .storeUint(0, 64)
    .storeUint(0, 64)
    .endCell();

  const dictsCell = beginCell()
    .storeBit(0) // pending_deposits = null
    .storeBit(0) // completed_deposits = null
    .storeBit(0) // user_accounting = null
    .storeBit(0) // refunded_deposits = null
    .endCell();

  return beginCell()
    .storeAddress(adminAddr)
    .storeAddress(feeRecipientAddr)
    .storeUint(feeBps, 16)
    .storeUint(paused, 1)
    .storeInt(networkId, 16)
    .storeCoins(new BN(totalPendingEscrow.toString()))
    .storeRef(cfgCell)
    .storeRef(statsCell)
    .storeRef(dictsCell)
    .endCell();
}

function buildInternalMsg({ bounced = false, src, dest, valueNano, bodyCell }) {
  return new InternalMessage({
    from: src,
    to: dest,
    value: new BN(valueNano.toString()),
    bounce: true,
    bounced,
    body: new CommonMessageInfo({
      body: new CellMessage(bodyCell),
    }),
  });
}

async function runTests() {
  console.log('========================================================================');
  console.log('🛡️  ANLGRAM STAKING MODULE & ROUTER TVM VERIFICATION SUITE');
  console.log('========================================================================\n');

  /* ────────────────────────────────────────────────────────────
     SECTION 1: FEE ARITHMETIC & ADDRESS VERIFICATION
     ──────────────────────────────────────────────────────────── */
  console.log('--- 1. Comisión ANLGRAM (0.35% = 35 bps) y Aritmética Entera BigInt ---');

  const cfg = StakingModule.STAKING_CONFIG;
  assert(cfg.ANLGRAM_STAKE_FEE_BPS === 35, 'ANLGRAM_STAKE_FEE_BPS configurado exactamente en 35 (0.35%)', `valor=${cfg.ANLGRAM_STAKE_FEE_BPS}`);
  assert(cfg.ANLGRAM_STAKE_FEE_BPS !== 3500, 'ANLGRAM_STAKE_FEE_BPS NO usa 3500');
  assert(cfg.ANLGRAM_WITHDRAW_FEE_BPS === 0, 'Comisión por retiro es 0% (0 bps)');
  assert(cfg.ANLGRAM_CLAIM_FEE_BPS === 0, 'Comisión por reclamo de recompensas es 0% (0 bps)');

  const expectedFeeWallet = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';
  const expectedFeeWalletRaw = '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d';
  assert(cfg.ANLGRAM_FEE_RECIPIENT === expectedFeeWallet, 'Wallet receptora coincide exactamente', cfg.ANLGRAM_FEE_RECIPIENT);
  assert(StakingModule.isValidTonAddress(expectedFeeWallet), 'Wallet receptora pasa validación CRC16');
  assert(StakingModule.friendlyToRawAddress(expectedFeeWallet) === expectedFeeWalletRaw, 'Conversión friendly -> raw de wallet receptora exacta', expectedFeeWalletRaw);

  // Required test cases: 1 TON -> 0.0035 TON; 100 TON -> 0.35 TON; 1,000 TON -> 3.5 TON
  const b1 = StakingModule.calculateStakeDepositBreakdown('1');
  assert(b1.principalNano === 1000000000n && b1.feeNano === 3500000n && b1.feeTonStr === '0.0035', '1 TON -> 0.0035 TON (3,500,000 nanoTON)', `${b1.feeTonStr} TON / ${b1.feeNano} nanoTON`);

  const b100 = StakingModule.calculateStakeDepositBreakdown('100');
  assert(b100.principalNano === 100000000000n && b100.feeNano === 350000000n && b100.feeTonStr === '0.35', '100 TON -> 0.35 TON (350,000,000 nanoTON)', `${b100.feeTonStr} TON / ${b100.feeNano} nanoTON`);

  const b1000 = StakingModule.calculateStakeDepositBreakdown('1000');
  assert(b1000.principalNano === 1000000000000n && b1000.feeNano === 3500000000n && b1000.feeTonStr === '3.50', '1,000 TON -> 3.5 TON (3,500,000,000 nanoTON)', `${b1000.feeTonStr} TON / ${b1000.feeNano} nanoTON`);

  // No maximum cap test: 1,000,000 TON -> 3,500 TON
  const b1M = StakingModule.calculateStakeDepositBreakdown('1000000');
  assert(b1M.feeNano === 3500000000000n && b1M.feeTonStr === '3500.00', 'Sin límite máximo: 1,000,000 TON -> 3,500 TON', `${b1M.feeNano} nanoTON`);

  // Floor rounding to nanoTON test
  const feeRound1 = StakingModule.calculateAnlgramStakeFeeNano(1000000001n);
  const feeRound2 = StakingModule.calculateAnlgramStakeFeeNano(1000002857n);
  const feeRound3 = StakingModule.calculateAnlgramStakeFeeNano(1000002858n);
  assert(feeRound1 === 3500000n && feeRound2 === 3500009n && feeRound3 === 3500010n, 'Redondeo exacto hacia abajo a nanoTON (división entera BigInt)', `${feeRound1}, ${feeRound2}, ${feeRound3}`);

  /* ────────────────────────────────────────────────────────────
     SECTION 2: TVM SMART CONTRACT TESTS (`AnlgramStakingRouter`)
     ──────────────────────────────────────────────────────────── */
  console.log('\n--- 2. Pruebas en TVM de AnlgramStakingRouter (Escrow Asíncrono, Rebotes, Timeout y Multi-Cliente) ---');

  const compiledPath = path.join(__dirname, 'minter-contract', 'build', 'anlgram-staking-router.compiled.json');
  const compiledRouter = JSON.parse(fs.readFileSync(compiledPath, 'utf8'));
  const routerCodeCell = Cell.fromBoc(Buffer.from(compiledRouter.codeBocBase64, 'base64'))[0];

  const adminAddr = Address.parse('0:1111111111111111111111111111111111111111111111111111111111111111');
  const poolAddr = Address.parse('kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3'); // Official Testnet Tonstakers Pool
  const feeRecipientAddr = Address.parse(expectedFeeWallet);
  const routerJWalletAddr = Address.parse('0:7777777777777777777777777777777777777777777777777777777777777777');
  const routerSelfAddr = Address.parse('0:8888888888888888888888888888888888888888888888888888888888888888');

  const clientA = Address.parse('0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const clientB = Address.parse('0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  const clientC = Address.parse('0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');

  const initDataCell = buildRouterDataCell({
    adminAddr,
    feeRecipientAddr,
    feeBps: 35,
    paused: 0,
    networkId: -3,
    poolAddr,
    routerJWalletAddr,
  });

  const routerContract = await SmartContract.fromCell(routerCodeCell, initDataCell);
  routerContract.setC7Config({ myself: routerSelfAddr, balance: new BN('5000000000') });
  routerContract.setUnixTime(1700000000);

  // 2.1 Verify get_router_config & get_quote_for_principal getters on-chain
  const cfgRes = await routerContract.invokeGetMethod('get_router_config', []);
  assert(
    cfgRes.exit_code === 0 &&
    cfgRes.result[2].toNumber() === 35 &&
    cfgRes.result[3].toNumber() === 0 &&
    cfgRes.result[4].toNumber() === -3,
    'Getter get_router_config devuelve fee_bps=35, paused=0, network_id=-3'
  );

  const fee1Res = await routerContract.invokeGetMethod('get_quote_for_principal', [{ type: 'int', value: '1000000000' }]);
  const fee100Res = await routerContract.invokeGetMethod('get_quote_for_principal', [{ type: 'int', value: '100000000000' }]);
  const fee1000Res = await routerContract.invokeGetMethod('get_quote_for_principal', [{ type: 'int', value: '1000000000000' }]);
  assert(
    fee1Res.result[0].toString() === '3500000' &&
    fee100Res.result[0].toString() === '350000000' &&
    fee1000Res.result[0].toString() === '3500000000',
    'Getter on-chain get_quote_for_principal calcula exactamente 1 TON->3,500,000n, 100 TON->350,000,000n, 1,000 TON->3,500,000,000n'
  );

  // 2.2 Reject wrong network ID (-239 sent to Testnet -3 router -> exit_code 303)
  const wrongNetBody = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(1001, 64)
    .storeCoins(new BN('100000000000'))
    .storeInt(-239, 16)
    .endCell();
  const wrongNetRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 101500000000n,
    bodyCell: wrongNetBody,
  }));
  assert(wrongNetRes.exit_code === 303, 'Rechaza depósito con Chain ID incorrecto (-239 en Router Testnet -3)', `exit_code=${wrongNetRes.exit_code}`);

  // 2.3 Reject under-minimum stake (< 1 TON -> exit_code 305)
  const smallStakeBody = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(1002, 64)
    .storeCoins(new BN('500000000')) // 0.5 TON
    .storeInt(-3, 16)
    .endCell();
  const smallStakeRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 2000000000n,
    bodyCell: smallStakeBody,
  }));
  assert(smallStakeRes.exit_code === 305, 'Rechaza principal menor al mínimo de 1 TON', `exit_code=${smallStakeRes.exit_code}`);

  // 2.4 Reject insufficient attached TON (missing gas or fee -> exit_code 307)
  const underfundedBody = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(1003, 64)
    .storeCoins(new BN('100000000000')) // 100 TON
    .storeInt(-3, 16)
    .endCell();
  const underfundedRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 101000000000n, // Needs 100 + 0.35 + 1.15 = 101.50 TON
    bodyCell: underfundedBody,
  }));
  assert(underfundedRes.exit_code === 307, 'Rechaza transacción con valor adjunto insuficiente para cubrir principal + fee + gas', `exit_code=${underfundedRes.exit_code}`);

  // 2.5 Phase 1: Valid Deposit of 100 TON from Client B (query_id = 2001)
  const stake100Body = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(2001, 64)
    .storeCoins(new BN('100000000000')) // 100 TON principal
    .storeInt(-3, 16)
    .endCell();
  const phase1Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 101500000000n, // 100 TON principal + 0.35 TON fee + 1.15 TON gas
    bodyCell: stake100Body,
  }));
  assert(
    phase1Res.exit_code === 0 && phase1Res.actionList.length === 1,
    'Fase 1 (op::router_stake): Acepta depósito, retiene comisión en escrow y emite SOLO 1 mensaje al Pool Tonstakers',
    `exit_code=${phase1Res.exit_code}, actions=${phase1Res.actionList.length}`
  );

  const phase1Msg = phase1Res.actionList[0].message;
  const phase1BodySlice = Slice.fromCell(phase1Msg.body);
  const phase1Op = phase1BodySlice.readUint(32).toNumber();
  const phase1Qid = phase1BodySlice.readUint(64).toNumber();
  assert(
    phase1Op === 0x47d54391 && phase1Qid === 2001,
    'Fase 1 envía opcode oficial 0x47d54391 con query_id=2001 al Pool Tonstakers (NO cobra la comisión prematuramente)'
  );

  const pendingCheck = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '2001' }]);
  assert(
    pendingCheck.result[0].toNumber() === -1 &&
    pendingCheck.result[2].toString() === '100000000000' &&
    pendingCheck.result[3].toString() === '350000000',
    'get_pending_deposit(2001) muestra principal=100 TON y fee_nano=0.35 TON retenidos en custodia'
  );

  // 2.6 Replay Protection: Reject duplicate query_id 2001 while pending (exit_code 306)
  const replayRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 101500000000n,
    bodyCell: stake100Body,
  }));
  assert(replayRes.exit_code === 306, 'Protección anti-replay: Rechaza query_id duplicado activo (exit_code=306)');

  // 2.7 Reject fake transfer_notification (0x7362d09c) from unauthorized sender (exit_code 308)
  const fakeJWallet = Address.parse('0:9999999999999999999999999999999999999999999999999999999999999999');
  const notify2001Body = beginCell()
    .storeUint(0x7362d09c, 32)
    .storeUint(2001, 64)
    .storeCoins(new BN('83804796472')) // ~83.804796472 tsTON minted for 100 TON
    .storeAddress(poolAddr)
    .endCell();
  const fakeNotifyRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: fakeJWallet,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: notify2001Body,
  }));
  assert(fakeNotifyRes.exit_code === 308, 'Seguridad Jetton: Rechaza transfer_notification (0x7362d09c) de un contrato Jetton Wallet no autorizado (exit_code=308)');

  // 2.8 Phase 2a: Authentic transfer_notification (0x7362d09c) from routerJWalletAddr for query_id = 2001
  const clientAJWallet = Address.parse('0:aaaa00000000000000000000000000000000000000000000000000000000aaaa');
  const clientBJWallet = Address.parse('0:bbbb00000000000000000000000000000000000000000000000000000000bbbb');
  const clientCJWallet = Address.parse('0:cccc00000000000000000000000000000000000000000000000000000000cccc');

  const phase2aRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: notify2001Body,
  }));
  assert(
    phase2aRes.exit_code === 0 && phase2aRes.actionList.length === 1,
    'Fase 2a (0x7362d09c): Al recibir tsTON en el Router, pasa a status=1 (DELIVERING_TSTON), envía 0x0f8a7ea5 (0.105 TON gas) y NO cobra comisión aún',
    `exit_code=${phase2aRes.exit_code}, actions=${phase2aRes.actionList.length}`
  );

  const jettonMsg = phase2aRes.actionList[0].message;
  const jettonMsgTonVal = jettonMsg.info.value.coins.toString();
  const jettonMsgBody = Slice.fromCell(jettonMsg.body.refs[0] || jettonMsg.body);
  const jettonMsgOp = jettonMsgBody.readUint(32).toNumber();
  const jettonMsgQid = jettonMsgBody.readUint(64).toNumber();
  const jettonMsgAmt = jettonMsgBody.readCoins().toString();
  const jettonMsgDest = jettonMsgBody.readAddress();
  const jettonMsgRespDest = jettonMsgBody.readAddress();

  assert(
    jettonMsgOp === 0x0f8a7ea5 && jettonMsgQid === 2001 && jettonMsgAmt === '83804796472' &&
    jettonMsgDest.equals(clientB) && jettonMsgRespDest.equals(routerSelfAddr) &&
    jettonMsgTonVal === '105000000',
    'Mensaje 0x0f8a7ea5 verificado: transfiere 83.804796472 tsTON al Cliente B con 0.105 TON gas y response_destination=Router',
    `gas=${jettonMsgTonVal} nanoTON`
  );

  // Verify deposit 2001 is STILL in pending_deposits (status=1) and NOT in completed_deposits, and 0 fee collected yet!
  const pend2001After2a = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '2001' }]);
  const comp2001After2a = await routerContract.invokeGetMethod('get_completed_deposit', [{ type: 'int', value: '2001' }]);
  const statsAfter2a = await routerContract.invokeGetMethod('get_router_stats', []);
  assert(
    pend2001After2a.result[0].toNumber() === -1 &&
    pend2001After2a.result[6].toNumber() === 1 &&
    pend2001After2a.result[7].toString() === '83804796472' &&
    comp2001After2a.result[0].toNumber() === 0 &&
    statsAfter2a.result[1].toString() === '0',
    'Protección pre-entrega: Mientras 0x0f8a7ea5 está en vuelo (status=1), completed_deposits=0 y total_fees_collected=0'
  );

  // Pool / routerJWalletAddr excess gas (0xd53276db) arriving while status=1 -> forwards gas to Client B without prematurely completing status=1!
  const poolExcess2001Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 887025061n, // ~0.887 TON unused pool deposit gas
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(2001, 64).endCell(),
  }));
  const comp2001AfterPoolExcess = await routerContract.invokeGetMethod('get_completed_deposit', [{ type: 'int', value: '2001' }]);
  assert(
    poolExcess2001Res.exit_code === 0 &&
    poolExcess2001Res.actionList.length === 1 &&
    poolExcess2001Res.actionList[0].message.info.dest.equals(clientB) &&
    comp2001AfterPoolExcess.result[0].toNumber() === 0,
    'Exceso de gas del Pool (0xd53276db desde routerJWallet) se reenvía al Cliente B (~0.887 TON) sin marcar el depósito como completado prematuramente'
  );

  // Phase 2b: Client B's tsTON Jetton Wallet (clientBJWallet) finishes crediting tsTON and sends 0xd53276db (excesses) to Router
  const phase2bRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientBJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n, // ~0.053 TON remaining from 0.105 TON after TEP-74 transfer
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(2001, 64).endCell(),
  }));
  const feeMsg = phase2bRes.actionList[0]?.message;
  const feeMsgValue = feeMsg ? feeMsg.info.value.coins.toString() : '0';
  const feeDestFriendly = feeMsg ? feeMsg.info.dest.toFriendly({ urlSafe: true, bounceable: false }) : '';
  const comp2001After2b = await routerContract.invokeGetMethod('get_completed_deposit', [{ type: 'int', value: '2001' }]);

  assert(
    phase2bRes.exit_code === 0 && phase2bRes.actionList.length === 2 &&
    feeMsgValue === '350000000' && feeDestFriendly === expectedFeeWallet &&
    comp2001After2b.result[0].toNumber() === -1,
    'Fase 2b (0xd53276db desde Jetton Wallet del cliente): Confirma entrega de tsTON al Cliente B, marca completed_deposits y cobra exactamente 0.35 TON (350,000,000 nanoTON)',
    `dest=${feeDestFriendly}, value=${feeMsgValue}`
  );

  // 2.9 Pool Bounce Handling: Deposit 50 TON (query_id = 3001) that bounces from the Pool
  const stake50Body = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(3001, 64)
    .storeCoins(new BN('50000000000')) // 50 TON principal -> 0.175 TON fee (175,000,000 nanoTON)
    .storeInt(-3, 16)
    .endCell();
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 51325000000n, // 50 + 0.175 + 1.15 TON
    bodyCell: stake50Body,
  }));

  // Simulate bounced 0x47d54391 message from poolAddr
  const bouncedPoolBody = beginCell()
    .storeUint(0xffffffff, 32) // TVM bounce prefix
    .storeUint(0x47d54391, 32) // Original op::tonstakers_deposit
    .storeUint(3001, 64)       // Original query_id
    .storeUint(0, 64)
    .endCell();

  // Forged bounce from non-pool sender (clientA) -> must be ignored
  const forgedBounceRes = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 50950000000n,
    bodyCell: bouncedPoolBody,
  }));
  assert(
    forgedBounceRes.exit_code === 0 && forgedBounceRes.actionList.length === 0,
    'Seguridad Anti-Falsificación de Rebote: Ignora mensajes rebotados cuyo remitente NO sea el Pool Tonstakers verificado'
  );

  // Authentic bounce from poolAddr
  const bounceRes = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: poolAddr,
    dest: routerSelfAddr,
    valueNano: 50950000000n,
    bodyCell: bouncedPoolBody,
  }));
  const refundMsg = bounceRes.actionList[0]?.message;
  const refundBody = refundMsg ? Slice.fromCell(refundMsg.body) : null;
  const refundOp = refundBody ? refundBody.readUint(32).toNumber() : 0;
  const refundAmt = refundMsg ? BigInt(refundMsg.info.value.coins.toString()) : 0n;
  assert(
    bounceRes.exit_code === 0 && bounceRes.actionList.length === 1 &&
    refundOp === 0x414e4c52 && refundMsg.info.dest.equals(clientA) &&
    refundAmt === 50950000000n + 175000000n,
    'Manejo de Rebote Asíncrono: Si el pool rebota 0x47d54391, el Router reembolsa principal + comisión (0.175 TON) al cliente y cobra 0 comisión',
    `reembolsado=${refundAmt} nanoTON`
  );

  // Duplicate bounce for the same query_id 3001 -> must NOT double-refund
  const dupBounceRes = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: poolAddr,
    dest: routerSelfAddr,
    valueNano: 50950000000n,
    bodyCell: bouncedPoolBody,
  }));
  assert(
    dupBounceRes.exit_code === 0 && dupBounceRes.actionList.length === 0,
    'Ausencia de Doble Reembolso: Un segundo rebote con el mismo query_id (3001) es ignorado y produce 0 transferencias'
  );

  // Replay of 0x414e4c53 with already-refunded query_id 3001 -> must fail with 306
  const replayRefundedRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 51325000000n,
    bodyCell: stake50Body,
  }));
  assert(
    replayRefundedRes.exit_code === 306,
    'Protección Anti-Replay Post-Reembolso: Rechaza reutilizar un query_id ya reembolsado (exit_code=306)'
  );

  // 2.10 Elimination of 900s Timeout Double-Refund Risk & Delayed Round-End Completion (query_id = 4001, 10 TON)
  const stakeDelayedBody = beginCell()
    .storeUint(0x414e4c53, 32)
    .storeUint(4001, 64)
    .storeCoins(new BN('10000000000')) // 10 TON -> 0.035 TON fee (35,000,000 nanoTON)
    .storeInt(-3, 16)
    .endCell();
  routerContract.setUnixTime(1700000000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 11185000000n,
    bodyCell: stakeDelayedBody,
  }));

  const timeoutReqBody = beginCell()
    .storeUint(0x414e4c54, 32) // op::reclaim_timeout
    .storeUint(4001, 64)
    .endCell();

  // Attempt timeout before 900s (at +500s) -> rejected with 311
  routerContract.setUnixTime(1700000500);
  const earlyTimeoutRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: timeoutReqBody,
  }));
  assert(earlyTimeoutRes.exit_code === 311, 'Bloqueo de Timeout (<900s): Rechaza reclamo unilateral de timeout a +500s (exit_code=311)');

  // Attempt timeout after 900s (at +905s and +36h) while deposit was accepted by Pool / still completable -> rejected with 311!
  routerContract.setUnixTime(1700000905);
  const after900TimeoutRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: timeoutReqBody,
  }));
  routerContract.setUnixTime(1700000000 + 36 * 3600); // +36 hours (end of validation cycle)
  const after36hTimeoutRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: timeoutReqBody,
  }));
  assert(
    after900TimeoutRes.exit_code === 311 && after36hTimeoutRes.exit_code === 311,
    'Riesgo de Timeout Eliminado (>900s y +36h): Jamás reembolsa por reloj si Tonstakers aceptó el depósito o aún puede completarse (exit_code=311)'
  );

  // Now Tonstakers completes the deposit at +36 hours, AND suppose round-end minting altered query_id to 0!
  // Router matches earliest FIFO deposit in status=0 (4001) so tsTON is never stranded!
  const delayedNotify4001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(0, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  const delayedConfirm4001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(4001, 64).endCell(),
  }));
  assert(
    delayedNotify4001.exit_code === 0 && delayedNotify4001.actionList.length === 1 &&
    delayedConfirm4001.exit_code === 0 && delayedConfirm4001.actionList.length === 2 &&
    delayedConfirm4001.actionList[0].message.info.value.coins.toString() === '35000000',
    'Completado Tardío (+36h con resolución FIFO de query_id=0 -> 4001): Entrega tsTON al Cliente A y cobra 0.035 TON tras confirmación'
  );

  // Duplicate 0x7362d09c for already-confirmed query_id 4001 -> rejected with 309 (zero double fee collection)
  const dupConfirm4001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(4001, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  assert(
    dupConfirm4001.exit_code === 309,
    'Ausencia de Doble Cobro: Una segunda notificación 0x7362d09c para el mismo query_id (4001) es rechazada (exit_code=309)'
  );

  // Late bounce after confirmation for query_id 4001 -> ignored (zero refund after confirmation)
  const bounceAfterConfirmRes = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: poolAddr,
    dest: routerSelfAddr,
    valueNano: 10950000000n,
    bodyCell: beginCell().storeUint(0xffffffff, 32).storeUint(0x47d54391, 32).storeUint(4001, 64).storeUint(0, 64).endCell(),
  }));
  assert(
    bounceAfterConfirmRes.exit_code === 0 && bounceAfterConfirmRes.actionList.length === 0,
    'Inmutabilidad Post-Confirmación: Un rebote tardío tras haberse confirmado el depósito 4001 es ignorado (0 reembolsos)'
  );

  // 2.11 Risk 2 Verification: Bounce of 0x0f8a7ea5 (tsTON transfer) & Low-Gas Notification Handling
  // Case 2.11a: Deposit 20 TON from Client A (query_id = 6001, fee = 0.07 TON = 70,000,000 nanoTON)
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 20000000000n + 70000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(6001, 64).storeCoins(new BN('20000000000')).storeInt(-3, 16).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(6001, 64).storeCoins(new BN('16760959294')).storeAddress(poolAddr).endCell(),
  }));

  // Now simulate routerJWalletAddr BOUNCING 0x0f8a7ea5 (e.g., TEP-74 error 709/706)
  const bouncedJettonBody6001 = beginCell()
    .storeUint(0xffffffff, 32)
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(6001, 64)
    .storeCoins(new BN('16760959294'))
    .endCell();

  // Forged bounce of 0x0f8a7ea5 from non-routerJWalletAddr -> ignored
  await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 95000000n,
    bodyCell: bouncedJettonBody6001,
  }));
  const pend6001AfterFakeBounce = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '6001' }]);
  assert(
    pend6001AfterFakeBounce.result[6].toNumber() === 1,
    'Seguridad Anti-Falsificación 0x0f8a7ea5: Ignora rebote de transferencia tsTON que NO provenga de router_jwallet_address'
  );

  // Authentic bounce of 0x0f8a7ea5 from routerJWalletAddr -> status becomes 2 (STATUS_TSTON_BOUNCED), 0 fee charged, not completed!
  const jwalletBounceRes = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 95000000n,
    bodyCell: bouncedJettonBody6001,
  }));
  const pend6001AfterBounce = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '6001' }]);
  const comp6001AfterBounce = await routerContract.invokeGetMethod('get_completed_deposit', [{ type: 'int', value: '6001' }]);
  const statsAfterJWalletBounce = await routerContract.invokeGetMethod('get_router_stats', []);
  assert(
    jwalletBounceRes.exit_code === 0 &&
    pend6001AfterBounce.result[0].toNumber() === -1 &&
    pend6001AfterBounce.result[6].toNumber() === 2 &&
    pend6001AfterBounce.result[7].toString() === '16760959294' &&
    comp6001AfterBounce.result[0].toNumber() === 0 &&
    statsAfterJWalletBounce.result[1].toString() === '385000000', // Still only 350M (2001) + 35M (4001)!
    'Rebote de 0x0f8a7ea5 Manejado con Seguridad: Pasa a status=2 (TSTON_BOUNCED), NO marca completado y NO cobra comisión si el cliente no recibió sus tsTON'
  );

  // Retry tsTON delivery via 0x414e4c55 (op::retry_tston_delivery) called by third-party relayer (clientB) -> MUST still send tsTON strictly to clientA!
  const retry6001Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 120000000n, // 0.12 TON fresh gas
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(6001, 64).storeCoins(1).endCell(),
  }));
  const retryJettonMsg = retry6001Res.actionList[0]?.message;
  const retryJettonBody = Slice.fromCell(retryJettonMsg.body.refs[0] || retryJettonMsg.body);
  retryJettonBody.readUint(32);
  retryJettonBody.readUint(64);
  const retryAmt = retryJettonBody.readCoins().toString();
  const retryDest = retryJettonBody.readAddress();
  assert(
    retry6001Res.exit_code === 0 && retry6001Res.actionList.length === 1 &&
    retryAmt === '16760959294' && retryDest.equals(clientA),
    'Recuperación No Custodial (0x414e4c55 en status=2): Reenvía 16.760959294 tsTON estrictamente al depositante original (Cliente A), nunca al relayer'
  );

  // Now clientAJWallet confirms receipt of 6001 via 0xd53276db -> completes 6001 and pays 0.07 TON fee!
  const confirm6001Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 55000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(6001, 64).endCell(),
  }));
  assert(
    confirm6001Res.exit_code === 0 && confirm6001Res.actionList.length === 2 &&
    confirm6001Res.actionList[0].message.info.value.coins.toString() === '70000000',
    'Confirmación Post-Reintento (6001): Tras recibir tsTON el Cliente A, se marca completado y se cobra la comisión exacta de 0.07 TON'
  );

  // Case 2.11b: Low-gas 0x7362d09c (< 0.05 TON) queues deposit in status=2 without throwing (so non-bounceable 0x7362d09c is never lost!)
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n, // 10 TON (query_id = 6002)
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(6002, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));
  const lowGasNotifyRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 10000000n, // Only 0.01 TON (< 0.05 TON threshold)
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(6002, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  const pend6002AfterLowGas = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '6002' }]);
  assert(
    lowGasNotifyRes.exit_code === 0 && lowGasNotifyRes.actionList.length === 0 &&
    pend6002AfterLowGas.result[6].toNumber() === 2 &&
    pend6002AfterLowGas.result[7].toString() === '8380479647',
    'Protección Gas Insuficiente en 0x7362d09c: No revierte la notificación no-rebotable; guarda tsTON en status=2 para entrega vía 0x414e4c55'
  );
  // Complete 6002 via 0x414e4c55 + 0xd53276db
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(6002, 64).storeCoins(1).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(6002, 64).endCell(),
  }));

  // 2.12 Risk 1 Verification: What if 0x7362d09c NEVER arrives at all (status == 0 after timeout_sec)?
  // Case 2.12a: Tonstakers minted tsTON to routerJWalletAddr without sending 0x7362d09c (query_id = 7001, 10 TON)
  routerContract.setUnixTime(1700200000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(7001, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));
  // Calling 0x414e4c55 on status=0 BEFORE timeout_sec -> rejected with 311
  routerContract.setUnixTime(1700200500);
  const earlyRec7001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7001, 64).storeCoins(new BN('8380479647')).endCell(),
  }));
  // Calling 0x414e4c55 on status=0 AFTER timeout_sec by unauthorized user (clientB) -> rejected with 301
  routerContract.setUnixTime(1700201000);
  const unauthRec7001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7001, 64).storeCoins(new BN('8380479647')).endCell(),
  }));
  assert(
    earlyRec7001.exit_code === 311 && unauthRec7001.exit_code === 301,
    'Seguridad Recuperación status=0: Bloquea antes de timeout_sec (311) y bloquea a terceros no propietarios (301)'
  );

  // Calling 0x414e4c55 on status=0 AFTER timeout_sec by owner (clientA) -> sends 0x0f8a7ea5 (status=3) and completes upon 0xd53276db!
  const validRec7001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7001, 64).storeCoins(new BN('8380479647')).endCell(),
  }));
  const confirmRec7001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(7001, 64).endCell(),
  }));
  assert(
    validRec7001.exit_code === 0 && validRec7001.actionList.length === 1 &&
    confirmRec7001.exit_code === 0 && confirmRec7001.actionList.length === 2,
    'Recuperación Sin 0x7362d09c (7001): Si la notificación nunca llega pero tsTON fue emitido, el Cliente A recupera sus tsTON vía 0x414e4c55'
  );

  // Case 2.12b: 0x7362d09c never arrives AND routerJWalletAddr has 0 tsTON (probe claim_jetton_amount=1 bounces -> refunds escrowed fee + gas!)
  routerContract.setUnixTime(1700300000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n, // 10 TON (query_id = 7002, fee = 0.035 TON)
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(7002, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));
  routerContract.setUnixTime(1700301000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7002, 64).storeCoins(1).endCell(), // 1 nano-tsTON probe
  }));
  // routerJWalletAddr bounces the 1 nano-tsTON probe (proving 0 tsTON balance on-chain)
  const probeBounce7002 = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 95000000n,
    bodyCell: beginCell().storeUint(0xffffffff, 32).storeUint(0x0f8a7ea5, 32).storeUint(7002, 64).storeCoins(1).endCell(),
  }));
  const ref7002 = await routerContract.invokeGetMethod('get_refunded_deposit', [{ type: 'int', value: '7002' }]);
  assert(
    probeBounce7002.exit_code === 0 && probeBounce7002.actionList.length === 1 &&
    ref7002.result[0].toNumber() === -1,
    'Prueba Criptográfica de No-Emisión (7002): Si el probe de 1 nano-tsTON rebota tras timeout_sec, reembolsa el escrow al Cliente A con 0 comisión'
  );

  // 2.13 Multi-Client Concurrent Accounting Test (Client A: +1 TON = 51 TON total confirmed, Client B: 100 TON, Client C: 1,000 TON)
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 1000000000n + 3500000n + 1150000000n, // 1 TON + 0.0035 TON + 1.15 TON
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(5001, 64).storeCoins(new BN('1000000000')).storeInt(-3, 16).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientC,
    dest: routerSelfAddr,
    valueNano: 1000000000000n + 3500000000n + 1150000000n, // 1,000 TON + 3.5 TON + 1.15 TON
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(5002, 64).storeCoins(new BN('1000000000000')).storeInt(-3, 16).endCell(),
  }));

  // Confirm Client C first (out-of-order async completion), then Client A (both Phase 2a 0x7362d09c + Phase 2b 0xd53276db)
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(5002, 64).storeCoins(new BN('838047964720')).storeAddress(poolAddr).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientCJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(5002, 64).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(5001, 64).storeCoins(new BN('838047964')).storeAddress(poolAddr).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(5001, 64).endCell(),
  }));

  const sliceBocA = (await beginCell().storeAddress(clientA).endCell().toBoc({ idx: false })).toString('base64');
  const sliceBocB = (await beginCell().storeAddress(clientB).endCell().toBoc({ idx: false })).toString('base64');
  const sliceBocC = (await beginCell().storeAddress(clientC).endCell().toBoc({ idx: false })).toString('base64');

  const acctA = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocA }]);
  const acctB = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocB }]);
  const acctC = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocC }]);
  const globalStats = await routerContract.invokeGetMethod('get_router_stats', []);

  // Client A confirmed deposits: 4001 (10 TON), 6001 (20 TON), 6002 (10 TON), 7001 (10 TON), 5001 (1 TON) = 51 TON (5 deposits), fees = 0.1785 TON (178,500,000 nanoTON)
  // Client A refunded deposits: 3001 (50.175 TON) + 7002 (0.035 TON fee escrow) = 50,210,000,000 nanoTON
  assert(
    acctA.result[0].toNumber() === -1 &&
    acctA.result[1].toString() === '51000000000' &&
    acctA.result[2].toString() === '42740446199' &&
    acctA.result[3].toString() === '178500000' &&
    acctA.result[4].toString() === '50210000000' &&
    acctA.result[5].toNumber() === 5,
    'Contabilidad Cliente A exacta: 51 TON principal confirmado (5 depósitos), 0.1785 TON comisión, 50.21 TON reembolsado (3001 y 7002)'
  );
  assert(
    acctB.result[0].toNumber() === -1 &&
    acctB.result[1].toString() === '100000000000' &&
    acctB.result[2].toString() === '83804796472' &&
    acctB.result[3].toString() === '350000000',
    'Contabilidad Cliente B exacta: 100 TON principal, 0.35 TON comisión, 83.804796472 tsTON'
  );
  assert(
    acctC.result[0].toNumber() === -1 &&
    acctC.result[1].toString() === '1000000000000' &&
    acctC.result[2].toString() === '838047964720' &&
    acctC.result[3].toString() === '3500000000',
    'Contabilidad Cliente C exacta: 1,000 TON principal, 3.5 TON comisión, 838.047964720 tsTON'
  );
  // get_router_stats returns: (total_principal_routed, total_fees_collected, total_tston_forwarded, total_deposits_confirmed, total_deposits_refunded)
  assert(
    globalStats.result[0].toString() === '1151000000000' &&
    globalStats.result[1].toString() === '4028500000' &&
    globalStats.result[3].toNumber() === 7 &&
    globalStats.result[4].toNumber() === 2,
    'Totales globales del Router exactos: 1,151 TON principal confirmado, 4.0285 TON comisiones cobradas, 7 confirmados, 2 reembolsados'
  );

  // 2.14 Excess Gas Refund Forwarding (0xd53276db from Pool for completed query_id 2001 -> forwarded to Client B)
  const excessBody = beginCell()
    .storeUint(0xd53276db, 32)
    .storeUint(2001, 64)
    .endCell();
  const excessRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: poolAddr,
    dest: routerSelfAddr,
    valueNano: 887025061n, // Real Tonstakers excess gas amount (~0.887 TON)
    bodyCell: excessBody,
  }));
  assert(
    excessRes.exit_code === 0 &&
    excessRes.actionList.length === 1 &&
    excessRes.actionList[0].message.info.dest.equals(clientB),
    'Reenvío de Exceso de Gas Post-Completado (0xd53276db): El Router reenvía el sobrante del pool (~0.887 TON) al Cliente B'
  );

  // 2.15 Non-Custodial & Admin Security Checks
  // Unauthorized user trying to pause router -> exit_code 301
  const unauthPauseRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0x414e4c61, 32).storeUint(1, 64).storeUint(1, 1).endCell(),
  }));
  assert(unauthPauseRes.exit_code === 301, 'Seguridad Admin: Usuario no autorizado no puede pausar el Router (exit_code=301)');

  // Admin trying to execute an arbitrary withdrawal opcode -> exit_code 399 (no admin drain function exists)
  const adminDrainAttemptRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: adminAddr,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0xdeadbeef, 32).storeUint(1, 64).endCell(),
  }));
  assert(adminDrainAttemptRes.exit_code === 399, 'Inmutabilidad de Fondos: El propietario/admin NO tiene función para retirar fondos de clientes (exit_code=399)');

  /* ────────────────────────────────────────────────────────────
     SECTION 3: LIVE ON-CHAIN VERIFICATION (TESTNET -3 & MAINNET -239)
     ──────────────────────────────────────────────────────────── */
  globalThis.fetch = nativeFetch;
  console.log('\n--- 3. Verificación en Vivo contra TonAPI v2 (Testnet -3 y Mainnet -239) ---');

  try {
    const testnetPoolAddr = 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
    const mainnetPoolAddr = 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR';

    const [tAcctRes, tMethodRes, mAcctRes, mMethodRes] = await Promise.all([
      fetch(`https://testnet.tonapi.io/v2/accounts/${testnetPoolAddr}`).then(r => r.json()),
      fetch(`https://testnet.tonapi.io/v2/blockchain/accounts/${testnetPoolAddr}/methods/get_pool_full_data`).then(r => r.json()),
      fetch(`https://tonapi.io/v2/accounts/${mainnetPoolAddr}`).then(r => r.json()),
      fetch(`https://tonapi.io/v2/blockchain/accounts/${mainnetPoolAddr}/methods/get_pool_full_data`).then(r => r.json()),
    ]);

    assert(
      tAcctRes.status === 'active' && (tAcctRes.interfaces || []).includes('tonstake_pool'),
      'Pool Tonstakers Testnet (-3) activo y verificado en cadena',
      `${testnetPoolAddr} (${tAcctRes.address})`
    );
    const tRate = (BigInt(tMethodRes.decoded.total_balance) * 1000000000n) / BigInt(tMethodRes.decoded.supply);
    assert(
      tMethodRes.success && !tMethodRes.decoded.halted && tMethodRes.decoded.deposits_open && tRate > 1000000000n,
      'get_pool_full_data Testnet (-3) verificado: pool abierto y tasa tsTON > 1 TON',
      `1 tsTON = ${(Number(tRate) / 1e9).toFixed(6)} TON`
    );

    assert(
      mAcctRes.status === 'active' && (mAcctRes.interfaces || []).includes('tonstake_pool'),
      'Pool Tonstakers Mainnet (-239) activo y verificado en cadena',
      `${mainnetPoolAddr} (${mAcctRes.address})`
    );
    const mRate = (BigInt(mMethodRes.decoded.total_balance) * 1000000000n) / BigInt(mMethodRes.decoded.supply);
    assert(
      mMethodRes.success && !mMethodRes.decoded.halted && mMethodRes.decoded.deposits_open && mRate > 1000000000n,
      'get_pool_full_data Mainnet (-239) verificado: pool abierto y tasa tsTON > 1 TON',
      `1 tsTON = ${(Number(mRate) / 1e9).toFixed(6)} TON`
    );
  } catch (err) {
    console.warn('  ⚠️ Nota de red al consultar TonAPI en vivo:', err.message);
  }

  /* ────────────────────────────────────────────────────────────
     SECTION 4: FRONTEND & SECURITY POLICY AUDIT
     ──────────────────────────────────────────────────────────── */
  console.log('\n--- 4. Auditoría de Seguridad Frontend (staking.js, staking.html, wallet-connect.js, api.js) ---');

  assert(cfg.MAINNET_STAKING_ENABLED === false, 'MAINNET_STAKING_ENABLED está en false (Mainnet bloqueado hasta auditoría y aprobación)');
  assert(
    cfg.ROUTER_ADDRESS_TESTNET === 'kQB0zhRVcCVnnApIlxowyk4yvgFuXXRSdDea2e-bKCei2z-M' &&
    StakingModule.isValidTonAddress(cfg.ROUTER_ADDRESS_TESTNET) &&
    cfg.ROUTER_JWALLET_TESTNET === 'kQBccUarychCErZG-4S8a_jKuIzRgon-1h4z9b7uI4n8yjjH' &&
    StakingModule.isValidTonAddress(cfg.ROUTER_JWALLET_TESTNET),
    'ROUTER_ADDRESS_TESTNET y ROUTER_JWALLET_TESTNET registrados con CRC16 válido',
    `Router=${cfg.ROUTER_ADDRESS_TESTNET}, JWallet=${cfg.ROUTER_JWALLET_TESTNET}`
  );
  assert(
    Object.entries(cfg.ALLOWLIST).every(([poolAddr, pCfg]) =>
      StakingModule.isValidTonAddress(poolAddr) && StakingModule.isValidTonAddress(pCfg.jettonMaster)
    ),
    'Todas las direcciones de ALLOWLIST (pools y jettonMasters en Mainnet y Testnet) tienen suma CRC16 válida'
  );
  assert(Object.keys(cfg.ALLOWLIST).length === 2, 'ALLOWLIST restringida únicamente al pool oficial de Tonstakers (1 Mainnet + 1 Testnet)');
  assert(!stakingJsSource.includes('0x7bcd1fef') && !stakingJsSource.includes('0xda803efd'), 'No se reutilizan opcodes ni BoC de otros protocolos (Whales eliminado)');
  assert(stakingJsSource.includes('network: expectedChainId'), 'TON Connect sendTransaction incluye explícitamente el network ID (-3 / -239)');
  assert(stakingHtmlSource.includes('id="stake-accept-terms-checkbox"'), 'Modal de staking incluye casilla obligatoria de aceptación del cliente antes de firmar');
  assert(stakingHtmlSource.includes('UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd'), 'Modal de staking muestra la wallet receptora completa UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
  assert(
    stakingHtmlSource.includes('id="badge-state-sent"') &&
    stakingHtmlSource.includes('id="badge-state-pending"') &&
    stakingHtmlSource.includes('id="badge-state-confirmed"') &&
    stakingHtmlSource.includes('id="badge-state-failed"') &&
    stakingHtmlSource.includes('id="badge-state-fee"'),
    'UI distingue los 5 estados: transacción enviada, pendiente, confirmada, fallida/reembolsada y comisión cobrada'
  );
  assert(!apiJsSource.includes('_cachedTonPrice = 1.46'), 'Eliminado precio simulado 1.46 en assets/js/api.js');
  assert(!stakingHtmlSource.includes('$5.42') && !stakingHtmlSource.includes('4.82%'), 'Eliminados precios y APRs simulados ($5.42, 4.82%) en staking.html');

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} PASARON | ${failed} FALLARON`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
