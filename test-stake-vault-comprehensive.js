/**
 * ANLGRAM Isolated StakeVault — Comprehensive Verification Suite
 * File: test-stake-vault-comprehensive.js
 *
 * Verifies the 1-Vault-Per-Deposit Architecture:
 * 1. Exact 35 bps (0.35%) fee quote and BigInt integer math.
 * 2. Complete single-message StateInit deployment & initialization (op::vault_init 0x414e4c70).
 * 3. Exact 1.00 TON pool forwarding & escrow of 0.35% fee.
 * 4. Authenticated pool bounce handling: 100% refund of principal + fee (0 fee charged).
 * 5. Normal 2-phase delivery: tsTON notification (0x7362d09c) and fee release only upon
 *    client receipt confirmation (0xd53276db from client_jwallet).
 * 6. Missing / late notification rescue (op::vault_rescue 0x414e4c72):
 *    Recovers tsTON strictly to client_address without touching any other client's balance.
 * 7. Jetton transfer bounce handling: transitions to STATUS_TSTON_BOUNCED (3), 0 fee paid, retryable.
 * 8. Duplicate notification protection: rejection with exit_code 410, no duplicate transfers.
 * 9. Multi-client concurrent isolated vaults: Client A (10 TON), Client B (50 TON), Client C (100 TON),
 *    proving distinct contract addresses, distinct Jetton Wallets, and zero cross-client token co-mingling.
 * 10. Non-destruction invariant: contract remains alive in STATUS_COMPLETED to catch late tokens.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const minterRequire = createRequire(path.resolve('./minter-contract/package.json'));
const nativeFetch = globalThis.fetch;
delete globalThis.fetch; // Node 24 wasm loader compatibility for ton-contract-executor
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

// ── Addresses & Constants ──────────────────────────────────────────────────
const FEE_RECIPIENT_RAW = '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d'; // UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd
const POOL_TESTNET_RAW  = '0:0d16c632627f86499e286a350999ba03511654fae74c1dff49c733b8bd833f84'; // kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3

const CLIENT_A_RAW = '0:1111111111111111111111111111111111111111111111111111111111111111';
const CLIENT_B_RAW = '0:2222222222222222222222222222222222222222222222222222222222222222';
const CLIENT_C_RAW = '0:3333333333333333333333333333333333333333333333333333333333333333';

const VAULT_A_JWALLET_RAW  = '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLIENT_A_JWALLET_RAW = '0:a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';

const VAULT_B_JWALLET_RAW  = '0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CLIENT_B_JWALLET_RAW = '0:b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1';

const VAULT_C_JWALLET_RAW  = '0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const CLIENT_C_JWALLET_RAW = '0:c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';

const ATTACKER_RAW = '0:bad0000000000000000000000000000000000000000000000000000000000bad';

const OP_VAULT_INIT            = 0x414e4c70;
const OP_VAULT_RESCUE          = 0x414e4c72;
const OP_VAULT_RETRY           = 0x414e4c73;
const OP_VAULT_REFUNDED        = 0x414e4c74;
const OP_TONSTAKERS_DEPOSIT    = 0x47d54391;
const OP_TRANSFER_NOTIFICATION = 0x7362d09c;
const OP_JETTON_TRANSFER       = 0x0f8a7ea5;
const OP_EXCESSES              = 0xd53276db;

const STATUS_UNINITIALIZED     = 0;
const STATUS_PENDING_POOL      = 1;
const STATUS_DELIVERING_TSTON  = 2;
const STATUS_TSTON_BOUNCED     = 3;
const STATUS_COMPLETED         = 4;
const STATUS_REFUNDED          = 5;

// Load compiled bytecode
const compiledJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'minter-contract', 'build', 'anlgram-stake-vault.compiled.json'), 'utf8')
);
const vaultCodeCell = Cell.fromBoc(Buffer.from(compiledJson.codeHex, 'hex'))[0];

// Helper: build initial storage cell
function buildInitialVaultData({
  clientRaw,
  feeRecipientRaw = FEE_RECIPIENT_RAW,
  poolRaw = POOL_TESTNET_RAW,
  networkId = -3,
  queryId = 1001,
  partnerCode = 0x000000106796caefn,
}) {
  const jettonRef = beginCell()
    .storeUint(0, 2) // vault_jwallet: addr_none
    .storeUint(0, 2) // client_jwallet: addr_none
    .endCell();

  const staticRef = beginCell()
    .storeAddress(Address.parseRaw(clientRaw))
    .storeAddress(Address.parseRaw(feeRecipientRaw))
    .storeAddress(Address.parseRaw(poolRaw))
    .storeRef(jettonRef)
    .endCell();

  return beginCell()
    .storeUint(STATUS_UNINITIALIZED, 8)
    .storeInt(networkId, 16)
    .storeUint(queryId, 64)
    .storeCoins(0)
    .storeCoins(0)
    .storeCoins(0)
    .storeUint(0, 64)
    .storeUint(partnerCode, 64)
    .storeRef(staticRef)
    .endCell();
}

// Helper: instantiate SmartContract
async function createVaultContract(clientRaw, queryId = 1001, networkId = -3) {
  const dataCell = buildInitialVaultData({ clientRaw, queryId, networkId });
  const contract = await SmartContract.fromCell(vaultCodeCell, dataCell);
  return contract;
}

// Helper: create inbound internal message
function makeInboundMsg({ fromRaw, toRaw = '0:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', valueNano, bodyCell, bounced = false }) {
  return new InternalMessage({
    to: Address.parseRaw(toRaw),
    from: Address.parseRaw(fromRaw),
    value: new BN(valueNano.toString()),
    bounce: true,
    bounced: bounced,
    body: new CommonMessageInfo({
      body: new CellMessage(bodyCell),
    }),
  });
}

(async function runAllVaultTests() {
  console.log('========================================================================');
  console.log('🛡️  ANLGRAM ISOLATED STAKE VAULT (1-VAULT-PER-DEPOSIT) TVM VERIFICATION');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Fee Math & On-Chain Getter Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. Cálculo de Comisión (35 bps = 0.35%) y Getter On-Chain ---');
  {
    const vault = await createVaultContract(CLIENT_A_RAW, 1001);
    
    // Test get_vault_fee_quote for 1 TON
    const res1 = await vault.invokeGetMethod('get_vault_fee_quote', [{ type: 'int', value: '1000000000' }]);
    assert(res1.type === 'success', 'get_vault_fee_quote se ejecuta exitosamente');
    const fee1 = BigInt(res1.result[0].toString());
    const total1 = BigInt(res1.result[1].toString());
    assert(fee1 === 3500000n, '1 TON -> 0.0035 TON (3,500,000 nanoTON = 35 bps exactos)', `fee=${fee1}`);
    assert(total1 === 1000000000n + 3500000n + 1000000000n + 105000000n, '1 TON total quote incluye 1.0 pool gas + 0.105 jwallet gas');

    // Test for 10 TON
    const res10 = await vault.invokeGetMethod('get_vault_fee_quote', [{ type: 'int', value: '10000000000' }]);
    assert(BigInt(res10.result[0].toString()) === 35000000n, '10 TON -> 0.035 TON (35,000,000 nanoTON)');

    // Test for 100 TON
    const res100 = await vault.invokeGetMethod('get_vault_fee_quote', [{ type: 'int', value: '100000000000' }]);
    assert(BigInt(res100.result[0].toString()) === 350000000n, '100 TON -> 0.35 TON (350,000,000 nanoTON)');

    // Test for 1,000 TON
    const res1000 = await vault.invokeGetMethod('get_vault_fee_quote', [{ type: 'int', value: '1000000000000' }]);
    assert(BigInt(res1000.result[0].toString()) === 3500000000n, '1,000 TON -> 3.5 TON (3,500,000,000 nanoTON)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Vault Deployment & Initialization (op::vault_init) Validations
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Despliegue e Inicialización Atómica (op::vault_init 0x414e4c70) ---');
  {
    // Attacker cannot initialize someone else's vault
    const vault = await createVaultContract(CLIENT_A_RAW, 2001);
    const initBodyAttacker = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(2001, 64)
      .storeCoins(10000000000n)
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();

    const badCallerRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: ATTACKER_RAW,
      valueNano: 12000000000n,
      bodyCell: initBodyAttacker,
    }));
    assert(badCallerRes.exit_code === 401, 'Rechaza inicialización si el remitente no es el cliente (exit_code=401)');

    // Reject query_id mismatch
    const badQueryBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(9999, 64) // mismatch with storage query_id 2001
      .storeCoins(10000000000n)
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();
    const badQueryRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 12000000000n,
      bodyCell: badQueryBody,
    }));
    assert(badQueryRes.exit_code === 401, 'Rechaza inicialización con query_id discrepante (exit_code=401)');

    // Reject wrong network (-239 on Testnet vault)
    const badNetBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(2001, 64)
      .storeCoins(10000000000n)
      .storeInt(-239, 16) // Mainnet network ID on Testnet vault
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();
    const badNetRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 12000000000n,
      bodyCell: badNetBody,
    }));
    assert(badNetRes.exit_code === 403, 'Rechaza inicialización con red equivocada (exit_code=403)');

    // Reject below minimum stake (< 1 TON)
    const lowStakeBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(2001, 64)
      .storeCoins(500000000n) // 0.5 TON
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();
    const lowStakeRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 2000000000n,
      bodyCell: lowStakeBody,
    }));
    assert(lowStakeRes.exit_code === 404, 'Rechaza principal menor a 1 TON (exit_code=404)');

    // Reject unauthorized fee_recipient (Anti-Theft Hardening)
    const badFeeDataCell = buildInitialVaultData({
      clientRaw: CLIENT_A_RAW,
      feeRecipientRaw: ATTACKER_RAW, // Attacker tries to set their own wallet as fee recipient
      poolRaw: POOL_TESTNET_RAW,
      networkId: -3,
      queryId: 2001,
    });
    const badFeeVault = await SmartContract.fromCell(vaultCodeCell, badFeeDataCell);
    const badFeeInitBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(2001, 64)
      .storeCoins(10000000000n)
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();
    const badFeeRes = await badFeeVault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 12000000000n,
      bodyCell: badFeeInitBody,
    }));
    assert(badFeeRes.exit_code === 412, 'Rechaza inicialización con fee_recipient no autorizado (exit_code=412)');

    // Reject unauthorized pool_address (Anti-Theft Hardening)
    const badPoolDataCell = buildInitialVaultData({
      clientRaw: CLIENT_A_RAW,
      feeRecipientRaw: FEE_RECIPIENT_RAW,
      poolRaw: ATTACKER_RAW, // Attacker tries to set a fake pool
      networkId: -3,
      queryId: 2001,
    });
    const badPoolVault = await SmartContract.fromCell(vaultCodeCell, badPoolDataCell);
    const badPoolRes = await badPoolVault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 12000000000n,
      bodyCell: badFeeInitBody,
    }));
    assert(badPoolRes.exit_code === 413, 'Rechaza inicialización con pool_address no autorizado (exit_code=413)');

    // Reject insufficient message value
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(2001, 64)
      .storeCoins(10000000000n) // 10 TON principal
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();
    const lowValRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 5000000000n, // Only 5 TON attached for 10 TON stake
      bodyCell: validBody,
    }));
    assert(lowValRes.exit_code === 405, 'Rechaza valor adjunto insuficiente para principal + fee + gas (exit_code=405)');

    // SUCCESSFUL INITIALIZATION: 10 TON Principal
    const initRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 11140000000n, // 10 TON principal + 0.035 TON fee + 1.0 pool gas + 0.105 jwallet gas
      bodyCell: validBody,
    }));
    assert(initRes.exit_code === 0, 'Inicialización exitosa del StakeVault (exit_code=0)');
    assert(initRes.actionList.length === 1, 'Emite exactamente 1 mensaje saliente (al Pool Tonstakers)');

    // Verify outgoing message to pool
    const poolMsg = initRes.actionList[0].message;
    assert(poolMsg.info.dest.equals(Address.parseRaw(POOL_TESTNET_RAW)), 'Mensaje dirigido al Pool Tonstakers oficial');
    assert(BigInt(poolMsg.info.value.coins.toString()) === 11000000000n, 'Transfiere 11 TON al pool (10 TON principal + 1.0 TON gas)');

    // Verify stored state
    const stateRes = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(stateRes.result[9].toString()) === STATUS_PENDING_POOL, 'Estado pasa a STATUS_PENDING_POOL (1)');
    assert(BigInt(stateRes.result[5].toString()) === 10000000000n, 'Principal almacenado: 10 TON');
    assert(BigInt(stateRes.result[6].toString()) === 35000000n, 'Comisión en custodia: 0.035 TON (35 bps exactos)');

    // Cannot re-initialize
    const reinitRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 11140000000n,
      bodyCell: validBody,
    }));
    assert(reinitRes.exit_code === 402, 'Protección anti-reinicialización: ya inicializado (exit_code=402)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Authenticated Pool Bounce Handling (100% Refund, 0 Fee)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Manejo de Rebote Auténtico del Pool (100% Reembolso, 0 Comisión) ---');
  {
    const vault = await createVaultContract(CLIENT_A_RAW, 3001);
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(3001, 64)
      .storeCoins(20000000000n) // 20 TON
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();

    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 21175000000n, // 20 TON + 0.07 TON fee + 1.0 pool gas + 0.105 jwallet gas
      bodyCell: validBody,
    }));

    // Forged bounce from attacker must be ignored
    const fakeBounceBody = beginCell()
      .storeUint(0xffffffff, 32)
      .storeUint(OP_TONSTAKERS_DEPOSIT, 32)
      .endCell();
    const fakeBounceRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: ATTACKER_RAW,
      valueNano: 20500000000n,
      bodyCell: fakeBounceBody,
      bounced: true,
    }));
    assert(fakeBounceRes.actionList.length === 0, 'Ignora rebote falsificado de atacante (0 acciones)');

    // Genuine bounce from Tonstakers Pool
    const poolBounceBody = beginCell()
      .storeUint(0xffffffff, 32)
      .storeUint(OP_TONSTAKERS_DEPOSIT, 32)
      .endCell();
    const poolBounceRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: POOL_TESTNET_RAW,
      valueNano: 20950000000n, // Bounced TON value from pool
      bodyCell: poolBounceBody,
      bounced: true,
    }));
    assert(poolBounceRes.actionList.length === 1, 'Rebote del pool emite reembolso al cliente');
    const refundMsg = poolBounceRes.actionList[0].message;
    assert(refundMsg.info.dest.equals(Address.parseRaw(CLIENT_A_RAW)), 'Reembolso dirigido exclusivamente a client_address');
    
    // Total refund = msg_value (20.95 TON) + fee_nano (0.07 TON) + jetton_transfer_gas (0.105 TON) = 21.125 TON
    const expectedRefund = 20950000000n + 70000000n + 105000000n;
    assert(BigInt(refundMsg.info.value.coins.toString()) === expectedRefund, 'Reembolsa 100% del principal rebotado + 100% comisión + 100% gas de jetton no utilizado (0 cobrado)', `refund=${refundMsg.info.value.coins.toString()}`);

    // Verify status updated to STATUS_REFUNDED (5)
    const stRes = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(stRes.result[9].toString()) === STATUS_REFUNDED, 'Estado pasa a STATUS_REFUNDED (5)');

    // Second bounce ignored (no double refund)
    const secondBounceRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: POOL_TESTNET_RAW,
      valueNano: 20950000000n,
      bodyCell: poolBounceBody,
      bounced: true,
    }));
    assert(secondBounceRes.actionList.length === 0, 'Ausencia de doble reembolso: segundo rebote ignorado (0 acciones)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Normal 2-Phase Flow (Happy Path: Notification -> Delivery -> Receipt -> Fee)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. Flujo Completo de 2 Fases (Entrega tsTON y Liberación de Comisión) ---');
  {
    const vault = await createVaultContract(CLIENT_B_RAW, 4001);
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(4001, 64)
      .storeCoins(50000000000n) // 50 TON principal
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_B_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_B_JWALLET_RAW))
      .endCell();

    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_RAW,
      valueNano: 51280000000n, // 50 TON + 0.175 TON fee + 1.0 + 0.105
      bodyCell: validBody,
    }));

    // Transfer notification from UNKNOWN Jetton Wallet must be rejected
    const fakeNotifyBody = beginCell()
      .storeUint(OP_TRANSFER_NOTIFICATION, 32)
      .storeUint(4001, 64)
      .storeCoins(41902398236n) // ~41.9 tsTON
      .storeAddress(Address.parseRaw(POOL_TESTNET_RAW))
      .storeUint(0, 1)
      .endCell();
    const fakeNotifyRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: ATTACKER_RAW,
      valueNano: 100000000n,
      bodyCell: fakeNotifyBody,
    }));
    assert(fakeNotifyRes.exit_code === 406, 'Rechaza notificación de tsTON de wallet no autorizada (exit_code=406)');

    // Genuine transfer notification from vault's dedicated tsTON Jetton Wallet
    const validNotifyBody = beginCell()
      .storeUint(OP_TRANSFER_NOTIFICATION, 32)
      .storeUint(4001, 64)
      .storeCoins(41902398236n) // 41.902398236 tsTON minted
      .storeAddress(Address.parseRaw(POOL_TESTNET_RAW))
      .storeUint(0, 1)
      .endCell();
    const notifyRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_B_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: validNotifyBody,
    }));
    assert(notifyRes.exit_code === 0, 'Notificación de tsTON procesada exitosamente (exit_code=0)');
    assert(notifyRes.actionList.length === 1, 'Emite mensaje de transferencia op::jetton_transfer (0x0f8a7ea5)');

    // Verify jetton_transfer message details
    const jTransferMsg = notifyRes.actionList[0].message;
    assert(jTransferMsg.info.dest.equals(Address.parseRaw(VAULT_B_JWALLET_RAW)), 'Dirigido a vault_jwallet_address');
    
    // Status must be STATUS_DELIVERING_TSTON (2) - fee NOT yet paid!
    const st2Res = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(st2Res.result[9].toString()) === STATUS_DELIVERING_TSTON, 'Estado pasa a STATUS_DELIVERING_TSTON (2)');
    assert(BigInt(st2Res.result[10].toString()) === 41902398236n, 'tsTON acuñado registrado: 41.902398236 tsTON');

    // Intermediate pool gas excess (0xd53276db from pool or vault_jwallet) forwarded to client without fee release
    const poolExcessBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(4001, 64)
      .endCell();
    const poolExcessRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: POOL_TESTNET_RAW,
      valueNano: 850000000n, // ~0.85 TON surplus gas from pool
      bodyCell: poolExcessBody,
    }));
    assert(poolExcessRes.actionList.length === 1, 'Reenvía exceso de gas del pool al cliente');
    assert(poolExcessRes.actionList[0].message.info.dest.equals(Address.parseRaw(CLIENT_B_RAW)), 'Exceso de gas dirigido a client_address');
    
    // Status MUST still be STATUS_DELIVERING_TSTON
    const st2Still = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(st2Still.result[9].toString()) === STATUS_DELIVERING_TSTON, 'Estado permanece en STATUS_DELIVERING_TSTON (comisión sigue en custodia)');

    // CLIENT RECEIPT CONFIRMATION: 0xd53276db from client's tsTON Jetton Wallet
    // Spoofed receipt confirmation from random address must not release fee
    const fakeReceiptRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: ATTACKER_RAW,
      valueNano: 50000000n,
      bodyCell: poolExcessBody,
    }));
    assert(fakeReceiptRes.actionList.length === 0, 'Ignora confirmación de recibo falsa de atacante (0 acciones)');

    // Receipt with mismatched query_id must not release fee
    const badQueryReceiptBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(9999, 64) // Wrong query_id
      .endCell();
    const badQueryReceiptRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_JWALLET_RAW,
      valueNano: 50000000n,
      bodyCell: badQueryReceiptBody,
    }));
    assert(badQueryReceiptRes.actionList.length === 0, 'Ignora confirmación de recibo con query_id discrepante');

    // GENUINE RECEIPT CONFIRMATION from CLIENT_B_JWALLET_RAW with exact query_id 4001
    const receiptBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(4001, 64)
      .endCell();
    const receiptRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_JWALLET_RAW,
      valueNano: 80000000n, // 0.08 TON remaining gas
      bodyCell: receiptBody,
    }));
    assert(receiptRes.exit_code === 0, 'Confirmación de recibo del cliente procesada (exit_code=0)');
    assert(receiptRes.actionList.length >= 1, 'Emite liberación de comisión 0.35% y reenvío de gas');

    // Verify 0.35% fee paid to fee_recipient
    const feeMsg = receiptRes.actionList[0].message;
    assert(feeMsg.info.dest.equals(Address.parseRaw(FEE_RECIPIENT_RAW)), 'Comisión enviada a UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    assert(BigInt(feeMsg.info.value.coins.toString()) === 175000000n, 'Comisión exacta: 0.175 TON (175,000,000 nanoTON = 0.35% de 50 TON)', `fee=${feeMsg.info.value.coins.toString()}`);

    // Verify final status is STATUS_COMPLETED (4)
    const finalSt = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(finalSt.result[9].toString()) === STATUS_COMPLETED, 'Estado final pasa a STATUS_COMPLETED (4)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Missing / Late Notification Rescue (op::vault_rescue 0x414e4c72)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. Rescate por Notificación Perdida o Tardía (op::vault_rescue 0x414e4c72) ---');
  {
    // Vault initialized for 100 TON, but 0x7362d09c never arrives
    const vault = await createVaultContract(CLIENT_C_RAW, 5001);
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(5001, 64)
      .storeCoins(100000000000n) // 100 TON
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_C_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_C_JWALLET_RAW))
      .endCell();

    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_C_RAW,
      valueNano: 101455000000n,
      bodyCell: validBody,
    }));

    // Attacker tries to rescue Client C's vault -> rejected
    const rescueBodyAttacker = beginCell()
      .storeUint(OP_VAULT_RESCUE, 32)
      .storeUint(5001, 64)
      .storeCoins(83804796472n) // ~83.8 tsTON
      .endCell();
    const fakeRescueRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: ATTACKER_RAW,
      valueNano: 150000000n,
      bodyCell: rescueBodyAttacker,
    }));
    assert(fakeRescueRes.exit_code === 401, 'Rechaza rescate si el remitente no es client_address (exit_code=401)');

    // Client C calls vault_rescue with verified off-chain balance (83.804796472 tsTON)
    const validRescueBody = beginCell()
      .storeUint(OP_VAULT_RESCUE, 32)
      .storeUint(5001, 64)
      .storeCoins(83804796472n)
      .endCell();
    const rescueRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_C_RAW,
      valueNano: 150000000n,
      bodyCell: validRescueBody,
    }));
    assert(rescueRes.exit_code === 0, 'Rescate por el cliente exitoso sin depender de 0x7362d09c (exit_code=0)');
    assert(rescueRes.actionList.length === 1, 'Emite transferencia de tsTON a la Jetton Wallet de la bóveda');

    // Verify jetton_transfer strictly delivers to Client C
    const rescueJMsg = rescueRes.actionList[0].message;
    assert(rescueJMsg.info.dest.equals(Address.parseRaw(VAULT_C_JWALLET_RAW)), 'Transferencia enviada a la Jetton Wallet única de la bóveda C');

    // Now Client C's Jetton Wallet confirms receipt (0xd53276db)
    const receiptBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(5001, 64)
      .endCell();
    const receiptRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_C_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: receiptBody,
    }));
    assert(receiptRes.exit_code === 0, 'Recibo de rescate confirmado exitosamente');
    
    // Fee released: 0.35% of 100 TON = 0.35 TON (350,000,000 nanoTON)
    const feeMsg = receiptRes.actionList[0].message;
    assert(BigInt(feeMsg.info.value.coins.toString()) === 350000000n, 'Comisión exacta cobrada tras rescate: 0.35 TON (350,000,000 nanoTON)', `fee=${feeMsg.info.value.coins.toString()}`);

    const postRescueSt = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(postRescueSt.result[9].toString()) === STATUS_COMPLETED, 'Bóveda completada exitosamente tras rescate');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Jetton Transfer Bounce Handling & Retry (op::vault_retry 0x414e4c73)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. Manejo de Rebote de Jetton Transfer y Reintento Seguro (0x414e4c73) ---');
  {
    const vault = await createVaultContract(CLIENT_A_RAW, 6001);
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(6001, 64)
      .storeCoins(10000000000n)
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW))
      .endCell();

    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 11140000000n,
      bodyCell: validBody,
    }));

    // Trigger delivery
    const notifyBody = beginCell()
      .storeUint(OP_TRANSFER_NOTIFICATION, 32)
      .storeUint(6001, 64)
      .storeCoins(8380479647n)
      .storeAddress(Address.parseRaw(POOL_TESTNET_RAW))
      .storeUint(0, 1)
      .endCell();
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_A_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: notifyBody,
    }));

    // Jetton transfer bounces (e.g. temporary congestion or wrong claim balance)
    const jBounceBody = beginCell()
      .storeUint(0xffffffff, 32)
      .storeUint(OP_JETTON_TRANSFER, 32)
      .endCell();
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_A_JWALLET_RAW,
      valueNano: 90000000n,
      bodyCell: jBounceBody,
      bounced: true,
    }));

    // State must transition to STATUS_TSTON_BOUNCED (3)
    const bouncedSt = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(bouncedSt.result[9].toString()) === STATUS_TSTON_BOUNCED, 'Rebote de transferencia pasa a STATUS_TSTON_BOUNCED (3)');

    // Client retries via vault_retry (0x414e4c73)
    const retryBody = beginCell()
      .storeUint(OP_VAULT_RETRY, 32)
      .storeUint(6001, 64)
      .endCell();
    const retryRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 150000000n,
      bodyCell: retryBody,
    }));
    assert(retryRes.exit_code === 0, 'Reintento de entrega ejecutado exitosamente (exit_code=0)');
    assert(retryRes.actionList.length === 1, 'Reenvía op::jetton_transfer con la cantidad de tsTON original');

    const retriedSt = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(retriedSt.result[9].toString()) === STATUS_DELIVERING_TSTON, 'Estado vuelve a STATUS_DELIVERING_TSTON (2)');

    // Client Jetton Wallet confirms receipt after retry (0xd53276db)
    const retryReceiptBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(6001, 64)
      .endCell();
    const retryReceiptRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: retryReceiptBody,
    }));
    assert(retryReceiptRes.exit_code === 0, 'Confirmación de recibo tras reintento procesada (exit_code=0)');
    assert(retryReceiptRes.actionList.length >= 1, 'Emite liberación de comisión 0.35% y reenvío de gas');

    // Verify 0.35% fee paid to fee_recipient (0.035 TON on 10 TON)
    const retryFeeMsg = retryReceiptRes.actionList[0].message;
    assert(retryFeeMsg.info.dest.equals(Address.parseRaw(FEE_RECIPIENT_RAW)), 'Comisión tras reintento enviada a UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
    assert(BigInt(retryFeeMsg.info.value.coins.toString()) === 35000000n, 'Comisión exacta: 0.035 TON (35,000,000 nanoTON = 0.35% de 10 TON)', `fee=${retryFeeMsg.info.value.coins.toString()}`);

    // Verify final status is STATUS_COMPLETED (4)
    const finalRetrySt = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(finalRetrySt.result[9].toString()) === STATUS_COMPLETED, 'Estado final tras reintento pasa a STATUS_COMPLETED (4)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Duplicate Notification & Anti-Replay Protection
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. Protección Anti-Duplicados y Re-Emisión ---');
  {
    const vault = await createVaultContract(CLIENT_B_RAW, 7001);
    const validBody = beginCell()
      .storeUint(OP_VAULT_INIT, 32)
      .storeUint(7001, 64)
      .storeCoins(10000000000n)
      .storeInt(-3, 16)
      .storeAddress(Address.parseRaw(VAULT_B_JWALLET_RAW))
      .storeAddress(Address.parseRaw(CLIENT_B_JWALLET_RAW))
      .endCell();

    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_RAW,
      valueNano: 11140000000n,
      bodyCell: validBody,
    }));

    const notifyBody = beginCell()
      .storeUint(OP_TRANSFER_NOTIFICATION, 32)
      .storeUint(7001, 64)
      .storeCoins(8380479647n)
      .storeAddress(Address.parseRaw(POOL_TESTNET_RAW))
      .storeUint(0, 1)
      .endCell();
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_B_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: notifyBody,
    }));

    // Duplicate notification while already delivering must be rejected
    const dupDeliveringRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_B_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: notifyBody,
    }));
    assert(dupDeliveringRes.exit_code === 411, 'Rechaza notificación duplicada en vuelo (exit_code=411)');

    // Complete the vault
    const receiptBody = beginCell()
      .storeUint(OP_EXCESSES, 32)
      .storeUint(7001, 64)
      .endCell();
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: receiptBody,
    }));

    // Duplicate notification post-completion must be rejected
    const dupCompletedRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_B_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: notifyBody,
    }));
    assert(dupCompletedRes.exit_code === 410, 'Rechaza notificación duplicada tras completarse (exit_code=410)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Multi-Client Concurrent Isolated Vaults (Zero Co-Mingling Proof)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. Aislamiento Concurrente Multi-Cliente (Bóvedas Separadas, Cero Mezcla) ---');
  {
    // Client A: 10 TON (Vault A)
    const vaultA = await createVaultContract(CLIENT_A_RAW, 8001);
    await vaultA.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 11140000000n,
      bodyCell: beginCell()
        .storeUint(OP_VAULT_INIT, 32).storeUint(8001, 64).storeCoins(10000000000n).storeInt(-3, 16)
        .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW)).storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW)).endCell(),
    }));

    // Client B: 50 TON (Vault B)
    const vaultB = await createVaultContract(CLIENT_B_RAW, 8002);
    await vaultB.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_RAW,
      valueNano: 51280000000n,
      bodyCell: beginCell()
        .storeUint(OP_VAULT_INIT, 32).storeUint(8002, 64).storeCoins(50000000000n).storeInt(-3, 16)
        .storeAddress(Address.parseRaw(VAULT_B_JWALLET_RAW)).storeAddress(Address.parseRaw(CLIENT_B_JWALLET_RAW)).endCell(),
    }));

    // Client C: 100 TON (Vault C)
    const vaultC = await createVaultContract(CLIENT_C_RAW, 8003);
    await vaultC.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_C_RAW,
      valueNano: 101455000000n,
      bodyCell: beginCell()
        .storeUint(OP_VAULT_INIT, 32).storeUint(8003, 64).storeCoins(100000000000n).storeInt(-3, 16)
        .storeAddress(Address.parseRaw(VAULT_C_JWALLET_RAW)).storeAddress(Address.parseRaw(CLIENT_C_JWALLET_RAW)).endCell(),
    }));

    // Prove Client A cannot call rescue on Vault B or Vault C
    const attackOnVaultB = await vaultB.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 150000000n,
      bodyCell: beginCell().storeUint(OP_VAULT_RESCUE, 32).storeUint(8002, 64).storeCoins(41902398236n).endCell(),
    }));
    assert(attackOnVaultB.exit_code === 401, 'Cliente A no puede rescatar ni tocar fondos de la Bóveda B (exit_code=401)');

    const attackOnVaultC = await vaultC.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 150000000n,
      bodyCell: beginCell().storeUint(OP_VAULT_RESCUE, 32).storeUint(8003, 64).storeCoins(83804796472n).endCell(),
    }));
    assert(attackOnVaultC.exit_code === 401, 'Cliente A no puede rescatar ni tocar fondos de la Bóveda C (exit_code=401)');

    // Out-of-order execution: Vault C completes first!
    await vaultC.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_C_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: beginCell().storeUint(OP_TRANSFER_NOTIFICATION, 32).storeUint(8003, 64).storeCoins(83804796472n).storeAddress(Address.parseRaw(POOL_TESTNET_RAW)).storeUint(0, 1).endCell(),
    }));
    const feeResC = await vaultC.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_C_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: beginCell().storeUint(OP_EXCESSES, 32).storeUint(8003, 64).endCell(),
    }));
    assert(BigInt(feeResC.actionList[0].message.info.value.coins.toString()) === 350000000n, 'Bóveda C completada en desorden: comisión 0.35 TON enviada');

    // Vault A completes second
    await vaultA.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_A_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: beginCell().storeUint(OP_TRANSFER_NOTIFICATION, 32).storeUint(8001, 64).storeCoins(8380479647n).storeAddress(Address.parseRaw(POOL_TESTNET_RAW)).storeUint(0, 1).endCell(),
    }));
    const feeResA = await vaultA.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: beginCell().storeUint(OP_EXCESSES, 32).storeUint(8001, 64).endCell(),
    }));
    assert(BigInt(feeResA.actionList[0].message.info.value.coins.toString()) === 35000000n, 'Bóveda A completada: comisión 0.035 TON enviada');

    // Vault B completes third
    await vaultB.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_B_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: beginCell().storeUint(OP_TRANSFER_NOTIFICATION, 32).storeUint(8002, 64).storeCoins(41902398236n).storeAddress(Address.parseRaw(POOL_TESTNET_RAW)).storeUint(0, 1).endCell(),
    }));
    const feeResB = await vaultB.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_B_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: beginCell().storeUint(OP_EXCESSES, 32).storeUint(8002, 64).endCell(),
    }));
    assert(BigInt(feeResB.actionList[0].message.info.value.coins.toString()) === 175000000n, 'Bóveda B completada: comisión 0.175 TON enviada');

    // Verify all three vaults reached STATUS_COMPLETED independently
    const stA = await vaultA.invokeGetMethod('get_vault_data', []);
    const stB = await vaultB.invokeGetMethod('get_vault_data', []);
    const stC = await vaultC.invokeGetMethod('get_vault_data', []);
    assert(Number(stA.result[9].toString()) === STATUS_COMPLETED, 'Bóveda A: STATUS_COMPLETED (4)');
    assert(Number(stB.result[9].toString()) === STATUS_COMPLETED, 'Bóveda B: STATUS_COMPLETED (4)');
    assert(Number(stC.result[9].toString()) === STATUS_COMPLETED, 'Bóveda C: STATUS_COMPLETED (4)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Non-Destruction Invariant Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. Invariante de No Destrucción (Contrato Intacto Post-Completado) ---');
  {
    const vault = await createVaultContract(CLIENT_A_RAW, 9001);
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_RAW,
      valueNano: 11140000000n,
      bodyCell: beginCell().storeUint(OP_VAULT_INIT, 32).storeUint(9001, 64).storeCoins(10000000000n).storeInt(-3, 16)
        .storeAddress(Address.parseRaw(VAULT_A_JWALLET_RAW)).storeAddress(Address.parseRaw(CLIENT_A_JWALLET_RAW)).endCell(),
    }));
    await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: VAULT_A_JWALLET_RAW,
      valueNano: 200000000n,
      bodyCell: beginCell().storeUint(OP_TRANSFER_NOTIFICATION, 32).storeUint(9001, 64).storeCoins(8380479647n).storeAddress(Address.parseRaw(POOL_TESTNET_RAW)).storeUint(0, 1).endCell(),
    }));
    const compRes = await vault.sendInternalMessage(makeInboundMsg({
      fromRaw: CLIENT_A_JWALLET_RAW,
      valueNano: 80000000n,
      bodyCell: beginCell().storeUint(OP_EXCESSES, 32).storeUint(9001, 64).endCell(),
    }));

    // Check action flags: NO sendmode 128 + 32 (mode 160) was emitted
    for (const action of compRes.actionList) {
      if (action.type === 'send_msg') {
        assert(action.mode !== 128 && action.mode !== 160, `Mensaje no usa modo destructivo 128/160 (modo=${action.mode})`);
      }
    }

    // Get-methods still work cleanly post completion
    const postCompData = await vault.invokeGetMethod('get_vault_data', []);
    assert(Number(postCompData.result[9].toString()) === STATUS_COMPLETED, 'Estado accesible en post-completado');
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO FINAL STAKEVAULT: ${passed} PASARON | ${failed} FALLARON`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
})();
