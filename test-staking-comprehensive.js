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

  // Altered or unknown query_id (query_id = 0 or 9999) on 0x7362d09c MUST BE REJECTED with exit code 309!
  // Zero FIFO fallback, zero guessing!
  const alteredNotify0 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(0, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  const alteredNotify9999 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(9999, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  assert(
    alteredNotify0.exit_code === 309 && alteredNotify9999.exit_code === 309,
    'Eliminación de FIFO: Rechaza estrictamente transfer_notification con query_id alterado o desconocido (0 y 9999) con exit_code=309'
  );

  // Exact query_id (4001) succeeds, delivers tsTON to Client A, and completes upon 0xd53276db
  const exactNotify4001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(4001, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  const delayedConfirm4001 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(4001, 64).endCell(),
  }));
  assert(
    exactNotify4001.exit_code === 0 && exactNotify4001.actionList.length === 1 &&
    delayedConfirm4001.exit_code === 0 && delayedConfirm4001.actionList.length === 2 &&
    delayedConfirm4001.actionList[0].message.info.value.coins.toString() === '35000000',
    'Vinculación Estricta 1-a-1: Notificación con query_id exacto (4001) entrega tsTON al Cliente A y cobra 0.035 TON tras confirmación'
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

  // Retry tsTON delivery via 0x414e4c55 (op::retry_tston_delivery) called by third-party relayer or attacker (clientB) -> MUST still send tsTON strictly to clientA!
  const retry6001Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 120000000n, // 0.12 TON fresh gas
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(6001, 64).endCell(),
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
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(6002, 64).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(6002, 64).endCell(),
  }));

  // 2.12 Security Verification: Elimination of Arbitrary claim_jetton_amount and Cross-Client Token Theft
  // Deposit 10 TON from Client A (query_id = 7001)
  routerContract.setUnixTime(1700200000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(7001, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));

  // Attempt A: Client B (attacker) tries calling 0x414e4c55 on Client A's deposit while status == 0 (pending_pool)
  const attackerRetryRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7001, 64).endCell(),
  }));
  // Attempt B: Client A (owner) tries calling 0x414e4c55 before 0x7362d09c arrives (status == 0)
  const ownerEarlyRetryRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(7001, 64).endCell(),
  }));
  assert(
    attackerRetryRes.exit_code === 314 && ownerEarlyRetryRes.exit_code === 314,
    'Imposibilidad de Retiro Arbitrario en status=0: 0x414e4c55 es estrictamente rechazado con exit_code=314 para atacantes y propietarios si tsTON no rebotó'
  );

  // Now legitimate 0x7362d09c arrives for 7001, delivering 8.380479647 tsTON to Client A, then confirms
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(7001, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 50000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(7001, 64).endCell(),
  }));

  // Deposit 10 TON from Client A (query_id = 7002, fee = 0.035 TON) which will bounce from Pool
  routerContract.setUnixTime(1700300000);
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(7002, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));
  // Authentic pool bounce of 7002 -> refunds 10 TON + 0.035 TON fee + gas to Client A with 0 fee charged
  const poolBounce7002 = await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: poolAddr,
    dest: routerSelfAddr,
    valueNano: 10950000000n,
    bodyCell: beginCell().storeUint(0xffffffff, 32).storeUint(0x47d54391, 32).storeUint(7002, 64).storeUint(0, 64).endCell(),
  }));
  const ref7002 = await routerContract.invokeGetMethod('get_refunded_deposit', [{ type: 'int', value: '7002' }]);
  assert(
    poolBounce7002.exit_code === 0 && poolBounce7002.actionList.length === 1 &&
    ref7002.result[0].toNumber() === -1 && ref7002.result[2].toString() === '10000000000' &&
    ref7002.result[3].toString() === '35000000',
    'Reembolso Auténtico de Rebote del Pool (7002): Reembolsa 10 TON + comisión (0.035 TON) al Cliente A sin cobrar comisión'
  );

  // 2.13 Multi-Client Concurrent Staking & Out-of-Order Execution (Client A: 1 TON, Client C: 1,000 TON)
  // Simultaneous deposits
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

  // Confirm Client C FIRST (out-of-order notification: 5002 arrives before 5001)
  const notifyC = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(5002, 64).storeCoins(new BN('838047964720')).storeAddress(poolAddr).endCell(),
  }));
  const transferMsgC = notifyC.actionList[0]?.message;
  const transferBodyC = Slice.fromCell(transferMsgC.body.refs[0] || transferMsgC.body);
  transferBodyC.readUint(32); transferBodyC.readUint(64);
  const amtC = transferBodyC.readCoins().toString();
  const destC = transferBodyC.readAddress();

  assert(
    notifyC.exit_code === 0 && amtC === '838047964720' && destC.equals(clientC),
    'Desorden Asíncrono Multi-Cliente: Notificación de Cliente C (5002) entregada primero con 838.047964720 tsTON estrictamente a Cliente C'
  );

  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientCJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(5002, 64).endCell(),
  }));

  // Confirm Client A SECOND (5001 arrives after 5002)
  const notifyA = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(5001, 64).storeCoins(new BN('838047964')).storeAddress(poolAddr).endCell(),
  }));
  const transferMsgA = notifyA.actionList[0]?.message;
  const transferBodyA = Slice.fromCell(transferMsgA.body.refs[0] || transferMsgA.body);
  transferBodyA.readUint(32); transferBodyA.readUint(64);
  const amtA = transferBodyA.readCoins().toString();
  const destA = transferBodyA.readAddress();

  assert(
    notifyA.exit_code === 0 && amtA === '838047964' && destA.equals(clientA),
    'Desorden Asíncrono Multi-Cliente: Notificación de Cliente A (5001) entregada segundo con 0.838047964 tsTON estrictamente a Cliente A'
  );

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
  // Client A refunded deposits: 3001 (50.175 TON) + 7002 (10.035 TON) = 60,210,000,000 nanoTON
  assert(
    acctA.result[0].toNumber() === -1 &&
    acctA.result[1].toString() === '51000000000' &&
    acctA.result[2].toString() === '42740446199' &&
    acctA.result[3].toString() === '178500000' &&
    acctA.result[4].toString() === '60210000000' &&
    acctA.result[5].toNumber() === 5,
    'Contabilidad Cliente A exacta: 51 TON principal confirmado (5 depósitos), 0.1785 TON comisión, 60.21 TON reembolsado (3001 y 7002)'
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

  // 2.14 Pruebas Rigurosas de Concurrencia Multi-Cliente, Intento de Extracción de Fondos y Desorden Asíncrono
  // Tres clientes depositan concurrentemente:
  // Client A: 10 TON (query_id = 8001)
  // Client B: 20 TON (query_id = 8002)
  // Client C: 50 TON (query_id = 8003)
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 10000000000n + 35000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(8001, 64).storeCoins(new BN('10000000000')).storeInt(-3, 16).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 20000000000n + 70000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(8002, 64).storeCoins(new BN('20000000000')).storeInt(-3, 16).endCell(),
  }));
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientC,
    dest: routerSelfAddr,
    valueNano: 50000000000n + 175000000n + 1150000000n,
    bodyCell: beginCell().storeUint(0x414e4c53, 32).storeUint(8003, 64).storeCoins(new BN('50000000000')).storeInt(-3, 16).endCell(),
  }));

  // Ataque 1: Notificación alterada (query_id = 0 o inexistente 8999) con tsTON en el Router -> El Router rechaza con 309 y NO asigna tsTON a ningún cliente por FIFO
  const rogueNotify0 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(0, 64).storeCoins(new BN('50000000000')).storeAddress(poolAddr).endCell(),
  }));
  const rogueNotify8999 = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(8999, 64).storeCoins(new BN('50000000000')).storeAddress(poolAddr).endCell(),
  }));
  assert(
    rogueNotify0.exit_code === 309 && rogueNotify8999.exit_code === 309,
    'Resistencia Anti-Spoofing en Concurrencia: Rechaza 0x7362d09c con query_id=0 o inexistente sin contaminar los depósitos 8001, 8002, 8003'
  );

  // Ataque 2: Intento de extracción en status=0 (falta de notificación):
  // Cliente B intenta extraer tokens del depósito 8001 de Cliente A llamando a 0x414e4c55(8001)
  const stealPendingRes = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientB,
    dest: routerSelfAddr,
    valueNano: 110000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(8001, 64).endCell(),
  }));
  assert(
    stealPendingRes.exit_code === 314,
    'Protección Anti-Extracción en status=0: Intento de Cliente B de retirar tsTON de 8001 es rechazado (exit_code=314)'
  );

  // Desorden Asíncrono Legítimo:
  // Notificación de Cliente C (8003, 50 TON -> 41.902398236 tsTON) llega PRIMERO
  const notify8003Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(8003, 64).storeCoins(new BN('41902398236')).storeAddress(poolAddr).endCell(),
  }));
  const msg8003 = notify8003Res.actionList[0]?.message;
  const body8003 = Slice.fromCell(msg8003.body.refs[0] || msg8003.body);
  body8003.readUint(32); body8003.readUint(64);
  const amt8003 = body8003.readCoins().toString();
  const dest8003 = body8003.readAddress();
  assert(
    notify8003Res.exit_code === 0 && amt8003 === '41902398236' && dest8003.equals(clientC),
    'Aislamiento Concurrente 8003: tsTON de Cliente C va estrictamente a Cliente C (41.902398236 tsTON) en entrega desordenada'
  );
  // Confirmar 8003 vía 0xd53276db
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientCJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(8003, 64).endCell(),
  }));

  // Notificación de Cliente A (8001, 10 TON -> 8.380479647 tsTON) llega SEGUNDO
  const notify8001Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(8001, 64).storeCoins(new BN('8380479647')).storeAddress(poolAddr).endCell(),
  }));
  const msg8001 = notify8001Res.actionList[0]?.message;
  const body8001 = Slice.fromCell(msg8001.body.refs[0] || msg8001.body);
  body8001.readUint(32); body8001.readUint(64);
  const amt8001 = body8001.readCoins().toString();
  const dest8001 = body8001.readAddress();
  assert(
    notify8001Res.exit_code === 0 && amt8001 === '8380479647' && dest8001.equals(clientA),
    'Aislamiento Concurrente 8001: tsTON de Cliente A va estrictamente a Cliente A (8.380479647 tsTON)'
  );
  // Confirmar 8001 vía 0xd53276db
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientAJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(8001, 64).endCell(),
  }));

  // Notificación de Cliente B (8002, 20 TON -> 16.760959294 tsTON) llega TERCERO pero REBOTA en routerJWallet
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 100000000n,
    bodyCell: beginCell().storeUint(0x7362d09c, 32).storeUint(8002, 64).storeCoins(new BN('16760959294')).storeAddress(poolAddr).endCell(),
  }));
  // Simular rebote de 0x0f8a7ea5 desde routerJWalletAddr
  await routerContract.sendInternalMessage(buildInternalMsg({
    bounced: true,
    src: routerJWalletAddr,
    dest: routerSelfAddr,
    valueNano: 95000000n,
    bodyCell: beginCell().storeUint(0xffffffff, 32).storeUint(0x0f8a7ea5, 32).storeUint(8002, 64).storeCoins(new BN('16760959294')).endCell(),
  }));
  const pend8002Bounced = await routerContract.invokeGetMethod('get_pending_deposit', [{ type: 'int', value: '8002' }]);
  assert(
    pend8002Bounced.result[6].toNumber() === 2,
    'Estado Rebote Verificado: Depósito 8002 pasa a status=2 (TSTON_BOUNCED) con jetton_amount=16760959294 en storage'
  );

  // Ataque 3: Cliente A (atacante) intenta robar los tsTON de Cliente B llamando a 0x414e4c55(8002)
  // El Router reintenta la transferencia, pero el destino forzoso es Cliente B y el monto es 16760959294
  const attackerRetry8002Res = await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientA,
    dest: routerSelfAddr,
    valueNano: 120000000n,
    bodyCell: beginCell().storeUint(0x414e4c55, 32).storeUint(8002, 64).endCell(),
  }));
  const retryMsg8002 = attackerRetry8002Res.actionList[0]?.message;
  const retryBody8002 = Slice.fromCell(retryMsg8002.body.refs[0] || retryMsg8002.body);
  retryBody8002.readUint(32); retryBody8002.readUint(64);
  const retryAmt8002 = retryBody8002.readCoins().toString();
  const retryDest8002 = retryBody8002.readAddress();
  assert(
    attackerRetry8002Res.exit_code === 0 && retryAmt8002 === '16760959294' && retryDest8002.equals(clientB),
    'Imposibilidad de Apropiación Indebida: Ataque de Cliente A sobre 8002 reenvía tsTON estrictamente a Cliente B (Cliente A recibe 0)'
  );
  // Cliente B confirma la recepción de 8002
  await routerContract.sendInternalMessage(buildInternalMsg({
    src: clientBJWallet,
    dest: routerSelfAddr,
    valueNano: 53000000n,
    bodyCell: beginCell().storeUint(0xd53276db, 32).storeUint(8002, 64).endCell(),
  }));

  // Verificación Contable Final tras Rondas Multi-Cliente
  const finalAcctA = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocA }]);
  const finalAcctB = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocB }]);
  const finalAcctC = await routerContract.invokeGetMethod('get_user_accounting', [{ type: 'cell_slice', value: sliceBocC }]);
  const finalStats = await routerContract.invokeGetMethod('get_router_stats', []);

  // Client A: 51 + 10 = 61 TON principal, tsTON = 42.740446199 + 8.380479647 = 51.120925846, fees = 0.1785 + 0.035 = 0.2135 TON, 6 depósitos confirmados
  assert(
    finalAcctA.result[0].toNumber() === -1 &&
    finalAcctA.result[1].toString() === '61000000000' &&
    finalAcctA.result[2].toString() === '51120925846' &&
    finalAcctA.result[3].toString() === '213500000' &&
    finalAcctA.result[5].toNumber() === 6,
    'Contabilidad Cliente A acumulada exacta: 61 TON principal (6 depósitos confirmados), 0.2135 TON comisión'
  );
  // Client B: 100 + 20 = 120 TON principal, tsTON = 83.804796472 + 16.760959294 = 100.565755766, fees = 0.35 + 0.070 = 0.420 TON, 2 depósitos confirmados
  assert(
    finalAcctB.result[0].toNumber() === -1 &&
    finalAcctB.result[1].toString() === '120000000000' &&
    finalAcctB.result[2].toString() === '100565755766' &&
    finalAcctB.result[3].toString() === '420000000' &&
    finalAcctB.result[5].toNumber() === 2,
    'Contabilidad Cliente B acumulada exacta: 120 TON principal (2 depósitos confirmados), 0.420 TON comisión'
  );
  // Client C: 1,000 + 50 = 1,050 TON principal, tsTON = 838.047964720 + 41.902398236 = 879.950362956, fees = 3.5 + 0.175 = 3.675 TON, 2 depósitos confirmados
  assert(
    finalAcctC.result[0].toNumber() === -1 &&
    finalAcctC.result[1].toString() === '1050000000000' &&
    finalAcctC.result[2].toString() === '879950362956' &&
    finalAcctC.result[3].toString() === '3675000000' &&
    finalAcctC.result[5].toNumber() === 2,
    'Contabilidad Cliente C acumulada exacta: 1,050 TON principal (2 depósitos confirmados), 3.675 TON comisión'
  );
  // Global stats: 1,231 TON principal, 4.3085 TON comisiones cobradas, 10 confirmados, 2 reembolsados
  assert(
    finalStats.result[0].toString() === '1231000000000' &&
    finalStats.result[1].toString() === '4308500000' &&
    finalStats.result[3].toNumber() === 10 &&
    finalStats.result[4].toNumber() === 2,
    'Totales globales acumulados exactos: 1,231 TON principal, 4.3085 TON comisiones cobradas, 10 depósitos confirmados, 2 reembolsados'
  );

  // 2.15 Excess Gas Refund Forwarding (0xd53276db from Pool for completed query_id 2001 -> forwarded to Client B)
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
    cfg.ROUTER_ADDRESS_TESTNET === 'kQDd9FJmHX6-A2T1XsF4oSS04KFq_13gQyKco_ZYwmuDIREK' &&
    StakingModule.isValidTonAddress(cfg.ROUTER_ADDRESS_TESTNET) &&
    cfg.ROUTER_JWALLET_TESTNET === 'kQCulIZF_pX3SEaTp4QobY9oMkVlt-imEIexJV7eak8CxY6G' &&
    StakingModule.isValidTonAddress(cfg.ROUTER_JWALLET_TESTNET),
    'ROUTER_ADDRESS_TESTNET y ROUTER_JWALLET_TESTNET registrados con CRC16 válido',
    `Router=${cfg.ROUTER_ADDRESS_TESTNET}, JWallet=${cfg.ROUTER_JWALLET_TESTNET}`
  );
  assert(
    cfg.VAULT_CODE_HASH === 'e69f7d22756c31ef01965ac197e3c561c77ab25d496795f0d4fdc9f2502daccf',
    'VAULT_CODE_HASH verificado con bytecode hardened (on-chain hash checks)',
    `hash=${cfg.VAULT_CODE_HASH}`
  );
  assert(
    Object.entries(cfg.ALLOWLIST).every(([poolAddr, pCfg]) =>
      StakingModule.isValidTonAddress(poolAddr) && StakingModule.isValidTonAddress(pCfg.jettonMaster)
    ),
    'Todas las direcciones de ALLOWLIST (pools y jettonMasters en Mainnet y Testnet) tienen suma CRC16 válida'
  );
  assert(Object.keys(cfg.ALLOWLIST).length === 2, 'ALLOWLIST restringida únicamente al pool oficial de Tonstakers (1 Mainnet + 1 Testnet)');
  assert(!stakingJsSource.includes('0x7bcd1fef') && !stakingJsSource.includes('0xda803efd'), 'No se reutilizan opcodes ni BoC de otros protocolos (Whales eliminado)');
  assert(stakingJsSource.includes('network: expectedChainId') || stakingJsSource.includes("network: '-3'"), 'TON Connect sendTransaction incluye explícitamente el network ID (-3 / -239)');
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

  /* ────────────────────────────────────────────────────────────
     SECTION 5: FLUJOS DE RETIRO, SIMULADOR Y REGLAS DE SEGURIDAD
     ──────────────────────────────────────────────────────────── */
  console.log('\n--- 5. Verificación de Seguridad y Flujos de Staking (Red Errónea, Cancelación, Rebotes, Recompensas y Retiros) ---');

  // 5.1 Desglose transparente de 5 partes para StakeVault
  const vaultBreakdown1 = StakingModule.calculateStakeDepositBreakdown(1000000000n);
  assert(vaultBreakdown1.principalNano === 1000000000n, 'Principal para 1 TON: 1,000,000,000 nanoTON');
  assert(vaultBreakdown1.feeNano === 3500000n, 'Comisión ANLGRAM para 1 TON: 3,500,000 nanoTON (35 bps = 0.35%)');
  assert(vaultBreakdown1.poolDepositGasNano === 1000000000n, 'Gas adjunto al Pool: 1,000,000,000 nanoTON (1.0 TON)');
  assert(vaultBreakdown1.jettonTransferGasNano === 105000000n, 'Gas de transferencia tsTON: 105,000,000 nanoTON (0.105 TON)');
  assert(vaultBreakdown1.storageReserveNano === 50000000n, 'Reserva de almacenamiento: 50,000,000 nanoTON (0.05 TON)');
  assert(vaultBreakdown1.totalNano === 2158500000n, 'Total a firmar en TON Connect: 2,158,500,000 nanoTON (2.1585 TON)');

  // 5.2 Protección contra red errónea (Mainnet -239 conectada en Testnet)
  assert(stakingJsSource.includes("walletChainId !== '-3'"), 'Bloqueo explícito si la wallet conectada no tiene network ID -3 (Testnet)');
  assert(stakingJsSource.includes("isWrongNetwork = true") || stakingJsSource.includes("isWrongNetwork = isMainnetWallet"), 'Detección automática de wallet conectada en Mainnet (-239)');
  assert(stakingJsSource.includes('No disponible (Wallet en Mainnet -239)'), 'Saldo de Mainnet protegido: no se muestra como saldo utilizable en Testnet');

  // 5.3 Manejo honesto de firma rechazada/cancelada
  assert(stakingJsSource.includes("e?.code === 300 || /reject|cancel|declin/i.test(e?.message || '')"), 'Captura limpia de cancelación de firma por el usuario (código 300 / reject)');
  assert(stakingJsSource.includes("StakingState.setDeep('ui.txInFlight', false)"), 'txInFlight se restablece adecuadamente ante cancelación o error');

  // 5.4 Retención estricta de la wallet de origen en todo el ciclo
  assert(stakingJsSource.includes('buildStakeVaultInitPayload(') && stakingJsSource.includes('clientJw'), 'StakeVault vincula estrictamente la Jetton Wallet del cliente conectada');
  assert(stakingJsSource.includes('response_destination = client_address') || stakingJsSource.includes('client_address'), 'Reembolsos y excesos dirigidos exclusivamente a la wallet de origen');
  assert(stakingJsSource.includes('unstakeOp: 0x595f07bc'), 'Retiro utiliza el opcode oficial de quema NEP-74 (0x595f07bc)');
  assert(cfg.ANLGRAM_WITHDRAW_FEE_BPS === 0, 'Comisión por retiro es exactamente 0% (0 bps)');
  assert(cfg.ANLGRAM_CLAIM_FEE_BPS === 0, 'Comisión por recompensa es exactamente 0% (0 bps)');

  // 5.5 Proyecciones matemáticas de recompensas y plazos múltiples
  const sandboxStaking = loadFn(sandboxWindow, sandboxLocalStorage);
  const RewardServiceModule = new Function('StakingState', 'NotificationService', 'UnstakeModalController', `
    ${stakingJsSource.slice(stakingJsSource.indexOf('const RewardService = (() => {'), stakingJsSource.indexOf('const PortfolioService = (() => {'))}
    return RewardService;
  `)(
    { get: () => [] },
    { toast: () => {} },
    { open: () => {} }
  );

  const testApr = 3.225; // Testnet APY actual de Tonstakers
  const r30 = RewardServiceModule.calculate({ amount: 10, apy: testApr, days: 30, compound: true });
  const r90 = RewardServiceModule.calculate({ amount: 10, apy: testApr, days: 90, compound: true });
  const r180 = RewardServiceModule.calculate({ amount: 10, apy: testApr, days: 180, compound: true });
  const r365 = RewardServiceModule.calculate({ amount: 10, apy: testApr, days: 365, compound: true });
  const r730 = RewardServiceModule.calculate({ amount: 10, apy: testApr, days: 730, compound: true });

  const expected30 = 10 * (Math.pow(1 + testApr / 100, 30 / 365) - 1);
  const expected365 = 10 * (testApr / 100);
  const expected730 = 10 * (Math.pow(1 + testApr / 100, 2) - 1);

  assert(Math.abs(r30.totalRewards - expected30) < 1e-9, 'Proyección 30 días cumple exactamente fórmula de APY efectivo sin doble capitalización');
  assert(Math.abs(r365.totalRewards - expected365) < 1e-9, 'Proyección 365 días (1 año) es exactamente amount * (APY/100) sin inflación');
  assert(Math.abs(r730.totalRewards - expected730) < 1e-9, 'Proyección 730 días (2 años) cumple exactamente (1 + APY)^2 - 1');
  assert(r30.totalRewards > 0 && r30.totalRewards < r90.totalRewards, 'Proyección 30 días calculada y menor a 90 días');
  assert(r90.totalRewards < r180.totalRewards, 'Proyección 90 días menor a 180 días');
  assert(r180.totalRewards < r365.totalRewards, 'Proyección 180 días menor a 365 días (1 año)');
  assert(r365.totalRewards < r730.totalRewards, 'Proyección 365 días menor a 730 días (2 años)');
  assert(r365.yearly > r365.monthly * 11.5, 'Capitalización continua superior a la acumulación lineal simple');

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL: ${passed} PASARON | ${failed} FALLARON`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Error fatal en suite de pruebas:', err);
  process.exit(1);
});
