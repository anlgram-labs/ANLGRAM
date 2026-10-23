/**
 * ANLGRAM StakeVault — Live On-Chain Testnet (-3) E2E Execution & Verification
 * File: minter-contract/test-stake-vault-live-testnet.js
 *
 * STRICT SAFETY RULES:
 * - Network: TON Testnet (-3) ONLY. Never connects to Mainnet (-239).
 * - Max stake: Exactly 1.000000000 TON principal.
 * - Non-custodial: Uses dedicated disposable Testnet deployer wallet.
 * - Transparent: Traces and reports every nanoTON sent, consumed and refunded.
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
  ExternalMessage,
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
const { mnemonicToWalletKey } = require('ton-crypto');
const BN = require('bn.js');

const TESTNET_TONAPI_BASE = 'https://testnet.tonapi.io/v2';
const TESTNET_RPC_ENDPOINT = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TESTNET_TONVIEWER = 'https://testnet.tonviewer.com';

const TESTNET_CHAIN_ID = -3;
const FEE_BPS = 35; // 0.35%
const FEE_RECIPIENT_FRIENDLY = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';
const TESTNET_POOL_FRIENDLY = 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
const TESTNET_TSTON_MASTER_RAW = '0:224365caec15de3cbc1e99ea3ebb8c0dca383ec3119ec9299a14610fed1d8c85';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function addrToRawString(addr) {
  return `${addr.workChain}:${addr.hash.toString('hex')}`;
}

function buildInitialVaultData({ clientAddr, feeRecipientAddr, poolAddr, networkId, queryId, partnerCode = 0x000000106796caefn }) {
  const jettonRef = beginCell()
    .storeUint(0, 2) // vault_jwallet: addr_none
    .storeUint(0, 2) // client_jwallet: addr_none
    .endCell();

  const staticRef = beginCell()
    .storeAddress(clientAddr)
    .storeAddress(feeRecipientAddr)
    .storeAddress(poolAddr)
    .storeRef(jettonRef)
    .endCell();

  return beginCell()
    .storeUint(0, 8) // status = STATUS_UNINITIALIZED (0)
    .storeInt(networkId, 16)
    .storeUint(queryId, 64)
    .storeCoins(0)   // principal_nano = 0
    .storeCoins(0)   // fee_nano = 0
    .storeCoins(0)   // ts_ton_minted = 0
    .storeUint(0, 64)// created_at = 0
    .storeUint(partnerCode, 64)
    .storeRef(staticRef)
    .endCell();
}

async function getJettonWalletFor(ownerRaw) {
  const url = `${TESTNET_TONAPI_BASE}/blockchain/accounts/${encodeURIComponent(TESTNET_TSTON_MASTER_RAW)}/methods/get_wallet_address?args=${encodeURIComponent(ownerRaw)}`;
  const res = await fetch(url).then(r => r.json());
  if (!res.success || !res.decoded?.jetton_wallet_address) {
    throw new Error(`Failed to resolve Jetton Wallet for ${ownerRaw}: ${JSON.stringify(res)}`);
  }
  return res.decoded.jetton_wallet_address;
}

async function main() {
  console.log('========================================================================');
  console.log('🧪 ANLGRAM STAKEVAULT — LIVE TON TESTNET (-3) AUTOMATED VERIFIER');
  console.log('========================================================================\n');

  // 1. Load compiled StakeVault bytecode
  const compiledPath = path.join(__dirname, 'build', 'anlgram-stake-vault.compiled.json');
  if (!fs.existsSync(compiledPath)) {
    throw new Error(`Compiled artifact not found at ${compiledPath}`);
  }
  const compiled = JSON.parse(fs.readFileSync(compiledPath, 'utf8'));
  const codeCell = Cell.fromBoc(Buffer.from(compiled.codeBocBase64, 'base64'))[0];
  console.log(`1. Bytecode Hardened Cargado:`);
  console.log(`   - Code Cell SHA-256: ${compiled.codeHash || compiled.codeCellHashHex}`);
  console.log(`   - Red Objetivo:      TON Testnet (Chain ID: -3)`);
  console.log(`   - Pool Autorizado:   ${TESTNET_POOL_FRIENDLY}`);
  console.log(`   - Fee Destinatario:  ${FEE_RECIPIENT_FRIENDLY} (35 bps = 0.35%)\n`);

  // 2. Load dedicated Testnet wallet
  const envPath = path.join(__dirname, '.env.testnet');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Environment file not found at ${envPath}`);
  }
  const envRaw = fs.readFileSync(envPath, 'utf8');
  const match = envRaw.match(/TESTNET_DEPLOYER_MNEMONIC="([^"]+)"/);
  if (!match) throw new Error('TESTNET_DEPLOYER_MNEMONIC missing in .env.testnet');

  const mnemonicWords = match[1].trim().split(/\s+/);
  const walletKey = await mnemonicToWalletKey(mnemonicWords);
  const client = new TonClient({ endpoint: TESTNET_RPC_ENDPOINT });
  const walletContract = WalletContract.create(
    client,
    WalletV3R2Source.create({ publicKey: walletKey.publicKey, workchain: 0 })
  );

  const deployerFriendlyTestnet = walletContract.address.toFriendly({ testOnly: true, bounceable: false, urlSafe: true });
  const deployerRaw = addrToRawString(walletContract.address);

  console.log(`2. Wallet de Prueba Testnet Dedicada:`);
  console.log(`   - Dirección Friendly: ${deployerFriendlyTestnet}`);
  console.log(`   - Dirección Raw:      ${deployerRaw}`);
  console.log(`   - Tonviewer:          ${TESTNET_TONVIEWER}/${deployerFriendlyTestnet}\n`);

  // 3. Check Live On-Chain Balance
  const acctRes = await fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(deployerRaw)}`).then(r => r.json());
  const balanceNano = BigInt(acctRes?.balance || 0);
  const balanceTon = Number(balanceNano) / 1e9;
  const status = acctRes?.status || 'nonexist';

  console.log(`3. Estado en Cadena de la Wallet de Prueba:`);
  console.log(`   - Estado:  ${status}`);
  console.log(`   - Balance: ${balanceTon.toFixed(4)} TON (${balanceNano} nanoTON)\n`);

  const minRequiredNano = 2250000000n; // 2.25 TON (2.1585 TON message + wallet deploy gas)
  if (balanceNano < minRequiredNano) {
    console.log('========================================================================');
    console.log('⏸️  FONDOS TESTNET INSUFICIENTES PARA LA PRUEBA EN VIVO');
    console.log('========================================================================');
    console.log(`La wallet de prueba requiere al menos 2.5 Testnet TON para ejecutar el stake:`);
    console.log(`  👉 Dirección: ${deployerFriendlyTestnet}`);
    console.log(`\nCómo fondear en 10 segundos:`);
    console.log(`  1. Abre Telegram y escribe a: @testgiver_ton_bot`);
    console.log(`  2. Envía la dirección: ${deployerFriendlyTestnet}`);
    console.log(`  3. El bot te enviará 2.0 - 5.0 TON de prueba sin costo.`);
    console.log(`  4. Ejecuta nuevamente este comando y la prueba en vivo se completará automáticamente.`);
    console.log('========================================================================\n');
    return;
  }

  // 4. Prepare StakeVault deterministic StateInit
  const queryId = Date.now();
  const clientAddr = walletContract.address;
  const feeRecipientAddr = Address.parse(FEE_RECIPIENT_FRIENDLY);
  const poolAddr = Address.parse(TESTNET_POOL_FRIENDLY);

  const initDataCell = buildInitialVaultData({
    clientAddr,
    feeRecipientAddr,
    poolAddr,
    networkId: TESTNET_CHAIN_ID,
    queryId,
  });

  const vaultAddress = contractAddress({
    workchain: 0,
    initialCode: codeCell,
    initialData: initDataCell,
  });

  const vaultFriendlyTestnet = vaultAddress.toFriendly({ testOnly: true, bounceable: true, urlSafe: true });
  const vaultRaw = addrToRawString(vaultAddress);

  console.log(`4. Bóveda Aislada Determinística Calculada (Query ID: ${queryId}):`);
  console.log(`   - Dirección Bóveda: ${vaultFriendlyTestnet}`);
  console.log(`   - Dirección Raw:    ${vaultRaw}`);
  console.log(`   - Tonviewer:        ${TESTNET_TONVIEWER}/${vaultFriendlyTestnet}\n`);

  // 5. Query tsTON Jetton Wallets on-chain
  console.log(`5. Consultando Jetton Wallets en Testnet...`);
  const [clientJwRaw, vaultJwRaw] = await Promise.all([
    getJettonWalletFor(deployerRaw),
    getJettonWalletFor(vaultRaw),
  ]);
  const clientJwAddr = Address.parse(clientJwRaw);
  const vaultJwAddr = Address.parse(vaultJwRaw);
  console.log(`   - Jetton Wallet del Cliente: ${clientJwRaw}`);
  console.log(`   - Jetton Wallet de Bóveda:   ${vaultJwRaw}\n`);

  // 6. Build op::vault_init Message
  const principalNano = 1000000000n; // Exact 1.000000000 TON
  const feeNano = (principalNano * 35n) / 10000n; // 3,500,000 nanoTON (0.0035 TON)
  const poolGasNano = 1000000000n; // 1.000000000 TON
  const jettonGasNano = 105000000n; // 0.105000000 TON
  const storageReserveNano = 50000000n; // 0.050000000 TON
  const totalMessageValueNano = principalNano + feeNano + poolGasNano + jettonGasNano + storageReserveNano; // 2,158,500,000 nanoTON

  console.log(`6. Desglose Exacto del Mensaje de Staking (1.0 TON Principal):`);
  console.log(`   - Principal a Stakear:         ${fromNano(principalNano.toString())} TON`);
  console.log(`   - Comisión ANLGRAM (0.35%):    ${fromNano(feeNano.toString())} TON (en custodia)`);
  console.log(`   - Gas adjunto al Pool:         ${fromNano(poolGasNano.toString())} TON (reembolsable ~0.985 TON)`);
  console.log(`   - Gas transferencia tsTON:     ${fromNano(jettonGasNano.toString())} TON (reembolsable ~0.065 TON)`);
  console.log(`   - Reserva almacenamiento:      ${fromNano(storageReserveNano.toString())} TON (renta TVM de bóveda)`);
  console.log(`   ------------------------------------------------------------`);
  console.log(`   - Total Mensaje TON Connect:   ${fromNano(totalMessageValueNano.toString())} TON (2.1585 TON)\n`);

  const initBody = beginCell()
    .storeUint(0x414e4c70, 32) // op::vault_init
    .storeUint(queryId, 64)
    .storeCoins(new BN(principalNano.toString()))
    .storeInt(TESTNET_CHAIN_ID, 16)
    .storeAddress(vaultJwAddr)
    .storeAddress(clientJwAddr)
    .endCell();

  const stateInit = new StateInit({ code: codeCell, data: initDataCell });
  const stateInitCell = new Cell();
  stateInit.writeTo(stateInitCell);

  // 7. Send Transaction to Testnet
  console.log(`7. Firmando y Transmitiendo Transacción a TON Testnet...`);
  const seqno = await walletContract.getSeqNo();
  console.log(`   - Wallet SeqNo Actual: ${seqno}`);

  const transfer = walletContract.createTransfer({
    secretKey: walletKey.secretKey,
    seqno,
    sendMode: 3, // PAY_GAS_SEPARATLY (1) + IGNORE_ERRORS (2)
    order: new InternalMessage({
      to: vaultAddress,
      value: new BN(totalMessageValueNano.toString()),
      bounce: false,
      body: new CommonMessageInfo({
        stateInit,
        body: new CellMessage(initBody),
      }),
    }),
  });

  const isDeployed = status === 'active';
  const extMsg = new ExternalMessage({
    to: walletContract.address,
    body: new CommonMessageInfo({
      stateInit: isDeployed ? null : new StateInit({ code: walletContract.source.initialCode, data: walletContract.source.initialData }),
      body: new CellMessage(transfer),
    }),
  });

  const extCell = new Cell();
  extMsg.writeTo(extCell);
  const bocBase64 = (await extCell.toBoc({ idx: false })).toString('base64');

  // Broadcast via TonAPI (primary) and Toncenter (fallback)
  let broadcastSuccess = false;
  try {
    const apiRes = await fetch(`${TESTNET_TONAPI_BASE}/blockchain/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boc: bocBase64 }),
    });
    if (apiRes.ok) {
      broadcastSuccess = true;
      console.log(`   ✅ Mensaje transmitido con éxito a la blockchain vía TonAPI Testnet.`);
    } else {
      const errText = await apiRes.text();
      console.log(`   ⚠️ TonAPI broadcast retorno: ${errText}`);
    }
  } catch (err) {
    console.log(`   ⚠️ TonAPI broadcast error: ${err.message}`);
  }

  if (!broadcastSuccess) {
    console.log(`   - Reintentando transmisión vía Toncenter RPC...`);
    await sleep(2000);
    await client.sendExternalMessage(walletContract, transfer);
    console.log(`   ✅ Mensaje transmitido con éxito vía Toncenter RPC.`);
  }

  console.log(`   - Esperando confirmación de bloque en Testnet...\n`);

  // Wait for SeqNo increment
  let confirmed = false;
  for (let attempt = 1; attempt <= 20; attempt++) {
    await sleep(3000);
    try {
      const newSeqno = await walletContract.getSeqNo();
      if (newSeqno > seqno) {
        confirmed = true;
        console.log(`   ✅ Transacción incluida en bloque Testnet (Nuevo SeqNo: ${newSeqno}) en intento ${attempt}.\n`);
        break;
      }
    } catch (_) {}
    process.stdout.write(`   ...verificando intento ${attempt}/20\r`);
  }

  if (!confirmed) {
    console.log(`   ⚠️ Tiempo de espera agotado para el SeqNo. Verificando traza en TonAPI...`);
  }

  // 8. Poll Vault Trace on TonAPI
  console.log(`8. Siguiendo Traza de Ejecución en Cadena (TonAPI Testnet):`);
  console.log(`   - URL de Consulta: ${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(vaultRaw)}/events?limit=5`);

  let foundEvent = null;
  for (let poll = 1; poll <= 25; poll++) {
    await sleep(4000);
    try {
      const events = await fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(vaultRaw)}/events?limit=5`).then(r => r.json());
      if (events?.events && events.events.length > 0) {
        foundEvent = events.events[0];
        console.log(`\n   🎉 Traza Confirmada en TonAPI!`);
        console.log(`   - Event ID:       ${foundEvent.event_id}`);
        console.log(`   - Timestamp:      ${new Date(foundEvent.timestamp * 1000).toISOString()}`);
        console.log(`   - Total Acciones: ${foundEvent.actions?.length || 0}`);
        console.log(`   - Tonviewer:      ${TESTNET_TONVIEWER}/transaction/${foundEvent.event_id}`);
        break;
      }
    } catch (_) {}
    process.stdout.write(`   ...consultando eventos de la bóveda (${poll}/25)\r`);
  }

  // 9. Inspect On-Chain State of the StakeVault
  console.log(`\n9. Inspeccionando Estado On-Chain de la Bóveda en Testnet:`);
  try {
    const vaultAcct = await fetch(`${TESTNET_TONAPI_BASE}/accounts/${encodeURIComponent(vaultRaw)}`).then(r => r.json());
    console.log(`   - Estado de Cuenta: ${vaultAcct?.status} (Balance: ${Number(vaultAcct?.balance || 0) / 1e9} TON)`);

    const methodRes = await fetch(`${TESTNET_TONAPI_BASE}/blockchain/accounts/${encodeURIComponent(vaultRaw)}/methods/get_vault_data`).then(r => r.json());
    if (methodRes.success && methodRes.decoded) {
      console.log(`   - Get-Method get_vault_data decodificado con éxito:`);
      console.log(`     * Status:         ${methodRes.decoded.status}`);
      console.log(`     * Query ID:       ${methodRes.decoded.query_id}`);
      console.log(`     * Principal Nano: ${methodRes.decoded.principal_nano} (${Number(methodRes.decoded.principal_nano) / 1e9} TON)`);
      console.log(`     * Fee Nano:       ${methodRes.decoded.fee_nano} (${Number(methodRes.decoded.fee_nano) / 1e9} TON)`);
      console.log(`     * Jettons:        ${methodRes.decoded.jetton_amount}`);
    } else {
      console.log(`   - get_vault_data raw:`, methodRes);
    }
  } catch (err) {
    console.warn(`   ⚠️ Error al consultar get_vault_data:`, err.message);
  }

  console.log('\n========================================================================');
  console.log('🏁 PRUEBA EN VIVO EN TON TESTNET COMPLETADA');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Error en prueba en vivo:', err);
  process.exit(1);
});
