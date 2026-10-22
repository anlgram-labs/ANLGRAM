/**
 * ANLGRAM Staking Router — Testnet (-3) Deployment & End-to-End Verification Script
 * File: minter-contract/deploy-staking-router-testnet.js
 *
 * STRICT POLICY:
 * - Targets TON Testnet (-3) ONLY. Never touches Mainnet (-239).
 * - Never invents transaction hashes or claims on-chain execution if the Testnet
 *   deployer wallet has not been funded with Testnet TON.
 *
 * Usage:
 *   node minter-contract/deploy-staking-router-testnet.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  Address,
  Cell,
  beginCell,
  Slice,
  InternalMessage,
  CommonMessageInfo,
  CellMessage,
  StateInit,
  TonClient,
  WalletContract,
  WalletV3R2Source,
  contractAddress,
  SendMode,
  toNano,
  fromNano,
} = require('ton');
const { mnemonicNew, mnemonicToWalletKey } = require('ton-crypto');
const BN = require('bn.js');

const TESTNET_TONAPI_BASE = 'https://testnet.tonapi.io/v2';
const TESTNET_RPC_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TESTNET_TONVIEWER = 'https://testnet.tonviewer.com';

// Verified Testnet Constants
const TESTNET_CHAIN_ID = -3;
const FEE_BPS = 35; // 0.35% (NEVER 3500)
const FEE_RECIPIENT_FRIENDLY = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';
const TESTNET_POOL_FRIENDLY = 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
const TESTNET_TSTON_MASTER_RAW = '0:224365caec15de3cbc1e99ea3ebb8c0dca383ec3119ec9299a14610fed1d8c85';
const TESTNET_TSTON_MASTER_FRIENDLY = 'kQAiQ2XK7BXePLwemeo-u4wNyjg-wxGeySmaFGEP7R2Mhf4m';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function addrToRawString(addr) {
  return `${addr.workChain}:${addr.hash.toString('hex')}`;
}

function buildRouterInitialData({ adminAddr, feeRecipientAddr, poolAddr }) {
  const cfgCell = beginCell()
    .storeAddress(poolAddr)
    .storeAddress(null) // router_jwallet_address = addr_none in StateInit; set atomically via 0x414e4c60 in deploy msg
    .storeCoins(new BN('1000000000')) // 1 TON min stake
    .storeUint(new BN('106796caef', 16), 64) // partner_code
    .storeUint(900, 32)
    .endCell();

  const statsCell = beginCell()
    .storeCoins(0)
    .storeCoins(0)
    .storeCoins(0)
    .storeUint(0, 64)
    .storeUint(0, 64)
    .endCell();

  const dictsCell = beginCell()
    .storeBit(0) // pending_deposits
    .storeBit(0) // completed_deposits
    .storeBit(0) // user_accounting
    .storeBit(0) // refunded_deposits
    .endCell();

  return beginCell()
    .storeAddress(adminAddr)
    .storeAddress(feeRecipientAddr)
    .storeUint(FEE_BPS, 16)
    .storeUint(0, 1) // paused = 0
    .storeInt(TESTNET_CHAIN_ID, 16)
    .storeCoins(0)   // total_pending_escrow = 0
    .storeRef(cfgCell)
    .storeRef(statsCell)
    .storeRef(dictsCell)
    .endCell();
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 ANLGRAM STAKING ROUTER — TESTNET (-3) DEPLOY & E2E VERIFIER');
  console.log('========================================================================\n');

  // 1. Load compiled bytecode
  const compiledPath = path.join(__dirname, 'build', 'anlgram-staking-router.compiled.json');
  if (!fs.existsSync(compiledPath)) {
    throw new Error(`Compiled artifact not found at ${compiledPath}. Run node minter-contract/compile-staking-router.js first.`);
  }
  const compiled = JSON.parse(fs.readFileSync(compiledPath, 'utf8'));
  const codeCell = Cell.fromBoc(Buffer.from(compiled.codeBocBase64, 'base64'))[0];
  console.log(`1. Bytecode cargado:`);
  console.log(`   - Archivo: ${compiledPath}`);
  console.log(`   - Code Cell SHA-256: ${compiled.codeCellHashHex}`);

  // 2. Load or create dedicated Testnet wallet in minter-contract/.env.testnet
  const envPath = path.join(__dirname, '.env.testnet');
  let mnemonicWords;
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8').trim();
    const match = raw.match(/TESTNET_DEPLOYER_MNEMONIC="([^"]+)"/);
    if (match && match[1]) {
      mnemonicWords = match[1].trim().split(/\s+/);
    }
  }
  if (!mnemonicWords || mnemonicWords.length !== 24) {
    mnemonicWords = await mnemonicNew(24);
    fs.writeFileSync(
      envPath,
      `# Dedicated TON Testnet (-3) Wallet for ANLGRAM Staking Router Deployment & E2E Tests\nTESTNET_DEPLOYER_MNEMONIC="${mnemonicWords.join(' ')}"\n`,
      { mode: 0o600 }
    );
    console.log(`\n2. Nueva wallet de prueba Testnet (-3) generada en ${envPath}`);
  } else {
    console.log(`\n2. Wallet de prueba Testnet (-3) cargada desde ${envPath}`);
  }

  const walletKey = await mnemonicToWalletKey(mnemonicWords);
  const client = new TonClient({ endpoint: TESTNET_RPC_ENDPOINT });
  const walletContract = WalletContract.create(
    client,
    WalletV3R2Source.create({ publicKey: walletKey.publicKey, workchain: 0 })
  );

  const deployerFriendlyTestnet = walletContract.address.toFriendly({ testOnly: true, bounceable: false, urlSafe: true });
  const deployerRaw = addrToRawString(walletContract.address);

  console.log(`   - Dirección Wallet de Prueba (Testnet): ${deployerFriendlyTestnet}`);
  console.log(`   - Dirección Raw:                        ${deployerRaw}`);
  console.log(`   - Explorador Testnet:                   ${TESTNET_TONVIEWER}/${deployerFriendlyTestnet}`);

  // 3. Build deterministic StateInit & compute ROUTER_ADDRESS_TESTNET
  const feeRecipientAddr = Address.parse(FEE_RECIPIENT_FRIENDLY);
  const poolAddr = Address.parse(TESTNET_POOL_FRIENDLY);

  const initDataCell = buildRouterInitialData({
    adminAddr: walletContract.address,
    feeRecipientAddr,
    poolAddr,
  });

  const routerAddress = contractAddress({
    workchain: 0,
    initialCode: codeCell,
    initialData: initDataCell,
  });

  const routerFriendlyTestnet = routerAddress.toFriendly({ testOnly: true, bounceable: true, urlSafe: true });
  const routerFriendlyStandard = routerAddress.toFriendly({ testOnly: false, bounceable: true, urlSafe: true });
  const routerRaw = addrToRawString(routerAddress);

  console.log(`\n3. Dirección Determinística de AnlgramStakingRouter en Testnet (-3):`);
  console.log(`   - ROUTER_ADDRESS_TESTNET (kQ...): ${routerFriendlyTestnet}`);
  console.log(`   - Dirección Estándar (EQ...):     ${routerFriendlyStandard}`);
  console.log(`   - Dirección Raw:                  ${routerRaw}`);
  console.log(`   - Explorador Testnet:             ${TESTNET_TONVIEWER}/${routerFriendlyTestnet}`);

  // 4. Query on-chain Testnet tsTON Jetton Master for the Router's exact Jetton Wallet address
  const jwalletRes = await fetch(
    `${TESTNET_TONAPI_BASE}/blockchain/accounts/${encodeURIComponent(TESTNET_TSTON_MASTER_RAW)}/methods/get_wallet_address?args=${encodeURIComponent(routerRaw)}`
  ).then(r => r.json());

  if (!jwalletRes.success || !jwalletRes.decoded?.jetton_wallet_address) {
    throw new Error(`Failed to compute router tsTON Jetton Wallet from Testnet Master: ${JSON.stringify(jwalletRes)}`);
  }

  const routerJWalletRaw = jwalletRes.decoded.jetton_wallet_address;
  const routerJWalletAddr = Address.parse(routerJWalletRaw);
  const routerJWalletFriendlyTestnet = routerJWalletAddr.toFriendly({ testOnly: true, bounceable: true, urlSafe: true });

  console.log(`\n4. Jetton Wallet de tsTON para el Router (calculada on-chain desde ${TESTNET_TSTON_MASTER_FRIENDLY}):`);
  console.log(`   - Router tsTON JWallet (kQ...):   ${routerJWalletFriendlyTestnet}`);
  console.log(`   - Router tsTON JWallet (Raw):     ${routerJWalletRaw}`);

  // 5. Build atomic deployment + set_router_jwallet (0x414e4c60) payload
  const setJWalletBody = beginCell()
    .storeUint(0x414e4c60, 32) // op::set_router_jwallet
    .storeUint(1, 64)          // query_id = 1
    .storeAddress(routerJWalletAddr)
    .endCell();

  const stateInit = new StateInit({ code: codeCell, data: initDataCell });
  const stateInitCell = new Cell();
  stateInit.writeTo(stateInitCell);

  const stateInitBocBase64 = (await stateInitCell.toBoc({ idx: false })).toString('base64');
  const setJWalletBocBase64 = (await setJWalletBody.toBoc({ idx: false })).toString('base64');

  // Save deployment manifest so frontend & tests have the exact pre-computed addresses and BoCs
  const manifestPath = path.join(__dirname, 'build', 'anlgram-staking-router.testnet-manifest.json');
  const manifest = {
    network: 'testnet',
    chainId: '-3',
    codeCellHashHex: compiled.codeCellHashHex,
    feeBps: FEE_BPS,
    feeRecipient: FEE_RECIPIENT_FRIENDLY,
    feeRecipientRaw: addrToRawString(feeRecipientAddr),
    poolAddressTestnet: TESTNET_POOL_FRIENDLY,
    poolAddressRaw: addrToRawString(poolAddr),
    tsTonMasterTestnet: TESTNET_TSTON_MASTER_FRIENDLY,
    tsTonMasterRaw: TESTNET_TSTON_MASTER_RAW,
    deployerWalletTestnet: deployerFriendlyTestnet,
    deployerWalletRaw: deployerRaw,
    routerAddressTestnet: routerFriendlyTestnet,
    routerAddressStandard: routerFriendlyStandard,
    routerAddressRaw: routerRaw,
    routerJWalletTestnet: routerJWalletFriendlyTestnet,
    routerJWalletRaw: routerJWalletRaw,
    stateInitBocBase64,
    deployPayloadBocBase64: setJWalletBocBase64,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n5. Manifiesto de despliegue Testnet guardado en: ${manifestPath}`);

  // 6. Check on-chain Testnet balance of deployer wallet and router status
  const [deployerAcct, routerAcct] = await Promise.all([
    fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(deployerRaw)}`).then(r => r.json()),
    fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(routerRaw)}`).then(r => r.json()),
  ]);

  const deployerBalanceNano = BigInt(deployerAcct?.balance || 0);
  const routerStatus = routerAcct?.status || 'nonexist';
  const routerBalanceNano = BigInt(routerAcct?.balance || 0);

  console.log(`\n6. Estado Actual en Cadena (TON Testnet -3):`);
  console.log(`   - Estado del Contrato Router: ${routerStatus} (balance: ${Number(routerBalanceNano) / 1e9} TON)`);
  console.log(`   - Balance Wallet de Prueba:   ${Number(deployerBalanceNano) / 1e9} TON (${deployerBalanceNano} nanoTON)`);

  const minRequiredNano = 2300000000n; // 2.30 TON (0.10 TON deploy + 2.1535 TON for 1 TON stake E2E + gas)
  if (deployerBalanceNano < minRequiredNano && routerStatus !== 'active') {
    console.log('\n========================================================================');
    console.log('⏸️  DETENIDO POR FALTA DE FONDOS EN WALLET DE PRUEBA TESTNET (-3)');
    console.log('========================================================================');
    console.log(`Para completar el despliegue on-chain y la prueba E2E real en Testnet:`);
    console.log(`  1. Envía al menos 2.5 TON Testnet a la wallet de prueba:`);
    console.log(`     👉 ${deployerFriendlyTestnet}`);
    console.log(`     (Puedes usar @testgiver_ton_bot en Telegram o transferir desde tu wallet Testnet)`);
    console.log(`  2. Ejecuta nuevamente:`);
    console.log(`     node minter-contract/deploy-staking-router-testnet.js`);
    console.log('========================================================================\n');
    return;
  }

  // 7. If funded, deploy Router on Testnet if not yet active
  if (routerStatus !== 'active') {
    console.log(`\n7. Desplegando AnlgramStakingRouter en Testnet (${routerFriendlyTestnet})...`);
    const seqno = await walletContract.getSeqNo();
    const deployTx = walletContract.createTransfer({
      secretKey: walletKey.secretKey,
      seqno,
      sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
      order: new InternalMessage({
        to: routerAddress,
        value: toNano('0.10'),
        bounce: false,
        body: new CommonMessageInfo({
          stateInit,
          body: new CellMessage(setJWalletBody),
        }),
      }),
    });

    await client.sendExternalMessage(walletContract, deployTx);
    console.log('   - Transacción de despliegue enviada. Esperando confirmación en bloque Testnet...');

    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const check = await fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(routerRaw)}`).then(r => r.json());
      if (check.status === 'active') {
        console.log(`   ✅ Router desplegado y activo en Testnet: ${TESTNET_TONVIEWER}/${routerFriendlyTestnet}`);
        break;
      }
    }
  }

  // 8. Verify get_router_config on-chain
  const cfgCheck = await fetch(
    `${TESTNET_TONAPI_BASE}/blockchain/accounts/${encodeURIComponent(routerRaw)}/methods/get_router_config`
  ).then(r => r.json());
  console.log(`\n8. Verificación get_router_config on-chain:`, JSON.stringify(cfgCheck, null, 2));

  // 9. Execute live 1 TON E2E stake deposit if deployer has >= 2.2 TON remaining
  const postDeployAcct = await fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(deployerRaw)}`).then(r => r.json());
  const postDeployBalNano = BigInt(postDeployAcct?.balance || 0);
  const stakeTotalNano = 1000000000n + 3500000n + 1150000000n; // 1 TON + 0.0035 TON + 1.15 TON = 2.1535 TON

  if (postDeployBalNano >= stakeTotalNano + 50000000n) {
    const queryId = Date.now();
    console.log(`\n9. Ejecutando depósito E2E real de 1 TON (query_id=${queryId}) en Testnet...`);
    const stakeBody = beginCell()
      .storeUint(0x414e4c53, 32)
      .storeUint(queryId, 64)
      .storeCoins(new BN('1000000000')) // 1 TON principal
      .storeInt(-3, 16)                 // network_id = -3
      .endCell();

    const seqno = await walletContract.getSeqNo();
    const stakeTx = walletContract.createTransfer({
      secretKey: walletKey.secretKey,
      seqno,
      sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
      order: new InternalMessage({
        to: routerAddress,
        value: new BN(stakeTotalNano.toString()),
        bounce: true,
        body: new CommonMessageInfo({
          body: new CellMessage(stakeTx ? stakeBody : stakeBody),
        }),
      }),
    });

    await client.sendExternalMessage(walletContract, stakeTx);
    console.log(`   - Depósito enviado. Consultando traza en ${TESTNET_TONVIEWER}/${routerFriendlyTestnet} ...`);
  }
}

main().catch(err => {
  console.error('Error en deploy-staking-router-testnet:', err);
  process.exit(1);
});
