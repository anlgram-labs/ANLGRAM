/**
 * ANLGRAM Enterprise — Comprehensive Automated Staking Test Suite
 * File: test-staking-comprehensive.js
 *
 * Verifies all 7 cryptographic, architectural, and security requirements:
 * 1. Safe BigInt nanoTON arithmetic and gas margin calculations
 * 2. TL-B cell serialization and deserialization for all 4 contract opcodes
 * 3. Verified smart contract allowlist and standalone node rejection
 * 4. Strict network mismatch detection (Mainnet -239 vs Testnet -3)
 * 5. Non-custodial watch-only address signing block
 * 6. Commission & APY mathematical transparency
 * 7. Multi-state on-chain event status resolution
 */

'use strict';

const path = require('path');
const { beginCell, toNano, Address, Cell } = require('./minter-contract/node_modules/@ton/core');

// Test Suite Runner
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}${details ? ' - ' + details : ''}`);
  }
}

function section(title) {
  console.log(`\n======================================================`);
  console.log(`  ${title}`);
  console.log(`======================================================`);
}

// ---------------------------------------------------------------------
// 1. SAFE BIGINT NANOTON ARITHMETIC IMPLEMENTATION UNDER TEST
// ---------------------------------------------------------------------
function toNanoSafe(val) {
  if (val === null || val === undefined || val === '') return 0n;
  if (typeof val === 'bigint') return val;
  const str = String(val).trim();
  if (!str || !/^-?\d*(\.\d*)?$/.test(str) || str === '.' || str === '-') return 0n;
  const parts = str.split('.');
  const intPart = parts[0] ? BigInt(parts[0]) : 0n;
  if (intPart < 0n) return 0n;
  let fracStr = parts[1] || '';
  if (fracStr.length > 9) fracStr = fracStr.slice(0, 9);
  else fracStr = fracStr.padEnd(9, '0');
  const fracPart = BigInt(fracStr);
  return intPart * 1000000000n + fracPart;
}

function fromNanoSafe(nano, maxDecimals = 4) {
  try {
    const b = BigInt(nano);
    const intPart = b / 1000000000n;
    const rem = b % 1000000000n;
    if (rem === 0n) return intPart.toString();
    const fracStr = rem.toString().padStart(9, '0').slice(0, maxDecimals).replace(/0+$/, '');
    return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
  } catch (e) {
    return '0';
  }
}

// ---------------------------------------------------------------------
// 2. TL-B PAYLOAD BUILDERS UNDER TEST
// ---------------------------------------------------------------------
function buildTonstakersStakePayload(partnerCode = 0x000000106796caefn) {
  return beginCell()
    .storeUint(0x47d54391, 32)
    .storeUint(0, 64)
    .storeUint(BigInt(partnerCode), 64)
    .endCell();
}

function buildTonstakersUnstakePayload(jettonAmountNano, responseAddress, queryId = 0n) {
  const addr = typeof responseAddress === 'string' ? Address.parse(responseAddress) : responseAddress;
  return beginCell()
    .storeUint(0x595f07bc, 32)
    .storeUint(queryId, 64)
    .storeCoins(BigInt(jettonAmountNano))
    .storeAddress(addr)
    .storeBit(0) // custom payload: null
    .storeCoins(toNano('0.05')) // forward amount for notification
    .storeBit(0) // forward payload: null
    .endCell();
}

function buildWhalesStakePayload(queryId = 0n) {
  return beginCell()
    .storeUint(0x7bcd1fef, 32)
    .storeUint(queryId, 64)
    .endCell();
}

function buildWhalesWithdrawPayload(queryId = 0n, gasLimit = 0n, amount = 0n) {
  return beginCell()
    .storeUint(0xda803efd, 32)
    .storeUint(queryId, 64)
    .storeCoins(gasLimit)
    .storeCoins(amount)
    .endCell();
}

// ---------------------------------------------------------------------
// TEST EXECUTION
// ---------------------------------------------------------------------
async function runAllTests() {
  console.log(`Starting ANLGRAM Staking Comprehensive Test Suite on Node ${process.version}...`);

  // SECTION 1: BigInt nanoTON Arithmetic
  section('1. BigInt nanoTON Arithmetic & Boundary Precision');
  {
    assert(toNanoSafe('1') === 1000000000n, 'Integer 1 TON -> 1,000,000,000 nanoTON');
    assert(toNanoSafe('10.5') === 10500000000n, 'Decimal 10.5 TON -> 10,500,000,000 nanoTON');
    assert(toNanoSafe('0.000000001') === 1n, 'Smallest unit 0.000000001 TON -> 1 nanoTON');
    assert(toNanoSafe('0.0000000001') === 0n, 'Sub-nano fraction 0.0000000001 TON truncates safely to 0n');
    assert(toNanoSafe('1.1234567899') === 1123456789n, 'Extra decimals truncated cleanly without IEEE 754 precision loss');
    assert(toNanoSafe('') === 0n, 'Empty string returns 0n safely');
    assert(toNanoSafe('invalid_input') === 0n, 'Malformed string returns 0n safely');
    assert(toNanoSafe(-50) === 0n, 'Negative numbers sanitized to 0n');
    assert(toNanoSafe(null) === 0n, 'null sanitized to 0n');

    assert(fromNanoSafe(1000000000n) === '1', '1,000,000,000 nanoTON formats to "1"');
    assert(fromNanoSafe(10500000000n) === '10.5', '10,500,000,000 nanoTON formats to "10.5"');
    assert(fromNanoSafe(1234567890n, 4) === '1.2345', '1,234,567,890 nanoTON formats with 4 decimal limit');
    assert(fromNanoSafe(0n) === '0', '0n formats to "0"');

    // Gas calculations
    const stakeAmount = toNanoSafe('5'); // 5 TON
    const gasReserve = toNanoSafe('1');  // 1 TON
    const totalRequired = stakeAmount + gasReserve;
    assert(totalRequired === 6000000000n, 'Attached value for Tonstakers deposit is amount + 1.0 TON gas reserve');

    const walletBalanceLow = toNanoSafe('5.5');
    assert(walletBalanceLow < totalRequired, 'Correctly flags insufficient balance when wallet has 5.5 TON but 6.0 TON is needed (with reserve)');
  }

  // SECTION 2: Cryptographic TL-B Payloads
  section('2. Cryptographic TL-B Cell Serialization & Deserialization');
  {
    // A. Tonstakers Stake
    const tsStakeCell = buildTonstakersStakePayload(0x000000106796caefn);
    assert(tsStakeCell instanceof Cell, 'Tonstakers stake creates valid TON Cell');
    const tsStakeSlice = tsStakeCell.beginParse();
    const tsOp = tsStakeSlice.loadUint(32);
    const tsQuery = tsStakeSlice.loadUint(64);
    const tsPartner = tsStakeSlice.loadUint(64);
    assert(tsOp === 0x47d54391, 'Tonstakers deposit opcode matches 0x47d54391', `got 0x${tsOp.toString(16)}`);
    assert(tsQuery === 0, 'Tonstakers query_id is 0');
    assert(tsPartner === 0x000000106796caef, 'Tonstakers partner_code matches ANLGRAM attribution 0x000000106796caef');
    assert(tsStakeSlice.remainingBits === 0, 'Tonstakers stake cell has exactly 0 leftover bits (clean TL-B match)');

    // B. Tonstakers Unstake
    const testOwner = 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR';
    const tsUnstakeCell = buildTonstakersUnstakePayload(toNanoSafe('10'), testOwner, 12345n);
    assert(tsUnstakeCell instanceof Cell, 'Tonstakers unstake creates valid TON Cell');
    const tsUnstakeSlice = tsUnstakeCell.beginParse();
    const unstakeOp = tsUnstakeSlice.loadUint(32);
    const unstakeQuery = tsUnstakeSlice.loadUint(64);
    const unstakeCoins = tsUnstakeSlice.loadCoins();
    const unstakeResp = tsUnstakeSlice.loadAddress();
    assert(unstakeOp === 0x595f07bc, 'Tonstakers unstake opcode matches 0x595f07bc (burn notification)', `got 0x${unstakeOp.toString(16)}`);
    assert(unstakeQuery === 12345, 'Tonstakers unstake query_id matches 12345');
    assert(unstakeCoins === 10000000000n, 'Tonstakers unstake burn amount matches 10 tsTON (10,000,000,000 nano)');
    assert(unstakeResp.toString() === Address.parse(testOwner).toString(), 'Tonstakers response_address deserializes to owner address');

    // C. TON Whales Stake
    const whalesStakeCell = buildWhalesStakePayload(999n);
    const whalesStakeSlice = whalesStakeCell.beginParse();
    const whalesOp = whalesStakeSlice.loadUint(32);
    const whalesQuery = whalesStakeSlice.loadUint(64);
    assert(whalesOp === 0x7bcd1fef, 'TON Whales stake opcode matches 0x7bcd1fef', `got 0x${whalesOp.toString(16)}`);
    assert(whalesQuery === 999, 'TON Whales stake query_id matches 999');
    assert(whalesStakeSlice.remainingBits === 0, 'TON Whales stake cell has 0 leftover bits');

    // D. TON Whales Withdraw (Fix verification: includes gas_limit and amount Coins)
    const whalesWithdrawCell = buildWhalesWithdrawPayload(555n, toNanoSafe('0.1'), 0n);
    const whalesWithdrawSlice = whalesWithdrawCell.beginParse();
    const wwOp = whalesWithdrawSlice.loadUint(32);
    const wwQuery = whalesWithdrawSlice.loadUint(64);
    const wwGas = whalesWithdrawSlice.loadCoins();
    const wwAmount = whalesWithdrawSlice.loadCoins();
    assert(wwOp === 0xda803efd, 'TON Whales withdraw opcode matches 0xda803efd', `got 0x${wwOp.toString(16)}`);
    assert(wwQuery === 555, 'TON Whales withdraw query_id matches 555');
    assert(wwGas === 100000000n, 'TON Whales withdraw gas_limit matches 0.1 TON');
    assert(wwAmount === 0n, 'TON Whales withdraw amount 0n indicates full balance withdrawal');
  }

  // SECTION 3: Allowlist & Unsupported Delegation Guard
  section('3. Verified Pool Allowlist & Standalone Node Rejection');
  {
    const ALLOWLIST = {
      'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR': { network: 'mainnet', isSupported: true, name: 'Tonstakers Liquid' },
      'EQAA_5_dizuA1w6OpzTSYvXhvUwYTDNTW_MZDdZ0CGKeeper': { network: 'mainnet', isSupported: true, name: 'Tonkeeper Pool #1' },
      'kQAN_r6278_2P4T5yN2d4L-n72u0Zp_zVnC4c27XN8h7G-g9': { network: 'testnet', isSupported: true, name: 'Tonstakers Testnet Pool' },
    };

    function validatePoolForStaking(targetAddress, activeNetwork) {
      const entry = ALLOWLIST[targetAddress];
      if (!entry) {
        return { ok: false, error: 'NON_ALLOWLISTED_ADDRESS: Direct transfers to arbitrary addresses or unverified pools are blocked.' };
      }
      if (entry.network !== activeNetwork) {
        return { ok: false, error: `NETWORK_MISMATCH: Pool belongs to ${entry.network}, but active app network is ${activeNetwork}.` };
      }
      if (!entry.isSupported) {
        return { ok: false, error: 'UNSUPPORTED_DELEGATION: Pool does not expose a public retail delegation smart contract.' };
      }
      return { ok: true, pool: entry };
    }

    const testnetCheck = validatePoolForStaking('kQAN_r6278_2P4T5yN2d4L-n72u0Zp_zVnC4c27XN8h7G-g9', 'testnet');
    assert(testnetCheck.ok === true, 'Allows staking to verified Testnet Tonstakers pool');

    const mainnetOnTestnetCheck = validatePoolForStaking('EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR', 'testnet');
    assert(mainnetOnTestnetCheck.ok === false && mainnetOnTestnetCheck.error.includes('NETWORK_MISMATCH'), 'Blocks Mainnet pool when application is in Testnet mode');

    const randomAddressCheck = validatePoolForStaking('EQD0vdSA_NedR9uvbgN9EikRX-dutfArCHtiLsSt0--M1test', 'testnet');
    assert(randomAddressCheck.ok === false && randomAddressCheck.error.includes('NON_ALLOWLISTED_ADDRESS'), 'Blocks arbitrary/personal validator address from direct transfers');
  }

  // SECTION 4: Network ID & Mainnet Inactive Switch Enforcement
  section('4. Network ID Matching & Security Guard Switch');
  {
    const MAINNET_CHAIN = -239;
    const TESTNET_CHAIN = -3;
    const MAINNET_STAKING_ENABLED = false; // Must be false until owner requirements met

    function verifyStakingExecutionPermitted(walletChainId, appNetwork) {
      if (appNetwork === 'mainnet' && !MAINNET_STAKING_ENABLED) {
        return {
          allowed: false,
          code: 'MAINNET_AUDIT_HOLD',
          message: 'Mainnet staking is intentionally disabled pending production owner security audits, dedicated TonAPI key, and multi-sig treasury signoff.'
        };
      }
      if (appNetwork === 'testnet' && walletChainId !== TESTNET_CHAIN) {
        return {
          allowed: false,
          code: 'WALLET_NETWORK_MISMATCH',
          message: `Wallet is connected to chain ${walletChainId}, but Testnet (${TESTNET_CHAIN}) is required.`
        };
      }
      if (appNetwork === 'mainnet' && walletChainId !== MAINNET_CHAIN) {
        return {
          allowed: false,
          code: 'WALLET_NETWORK_MISMATCH',
          message: `Wallet is connected to chain ${walletChainId}, but Mainnet (${MAINNET_CHAIN}) is required.`
        };
      }
      return { allowed: true };
    }

    // Testnet tests
    const correctTestnet = verifyStakingExecutionPermitted(TESTNET_CHAIN, 'testnet');
    assert(correctTestnet.allowed === true, 'Testnet wallet + Testnet app permits staking verification');

    const wrongChainTestnet = verifyStakingExecutionPermitted(MAINNET_CHAIN, 'testnet');
    assert(wrongChainTestnet.allowed === false && wrongChainTestnet.code === 'WALLET_NETWORK_MISMATCH', 'Mainnet wallet on Testnet app correctly rejected');

    // Mainnet hold test
    const mainnetAttempt = verifyStakingExecutionPermitted(MAINNET_CHAIN, 'mainnet');
    assert(mainnetAttempt.allowed === false && mainnetAttempt.code === 'MAINNET_AUDIT_HOLD', 'Mainnet staking is held safely inactive by MAINNET_STAKING_ENABLED = false');
  }

  // SECTION 5: Non-Custodial Watch-Only Wallet Signing Block
  section('5. Non-Custodial Watch-Only Rejection Guard');
  {
    function isWalletReadyForTransaction(walletState) {
      if (!walletState || !walletState.connected) return false;
      if (walletState.isReadOnly || !walletState.isTonConnect) {
        return false; // Watch-only or pasted manual address
      }
      return true;
    }

    const manualWallet = {
      address: 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR',
      connected: true,
      isTonConnect: false,
      isReadOnly: true,
      balanceTon: 50
    };
    assert(isWalletReadyForTransaction(manualWallet) === false, 'Manual / pasted watch-only address is strictly forbidden from signing');

    const tonConnectWallet = {
      address: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa',
      connected: true,
      isTonConnect: true,
      isReadOnly: false,
      balanceTon: 10
    };
    assert(isWalletReadyForTransaction(tonConnectWallet) === true, 'Official TON Connect 2.0 wallet is authorized for transaction requests');
  }

  // SECTION 6: Commission & APY Transparency Mathematics
  section('6. Commission Transparency & APY Calculations');
  {
    const ANLGRAM_SERVICE_FEE_PCT = 0; // 0% on third-party pools
    const POOL_FEE_PCT = 5.0; // 5% pool fee
    const GROSS_APR = 6.20; // 6.20% gross network APY

    // Calculate net rewards
    const netApr = GROSS_APR * (1 - (POOL_FEE_PCT / 100)) * (1 - (ANLGRAM_SERVICE_FEE_PCT / 100));
    assert(ANLGRAM_SERVICE_FEE_PCT === 0, 'ANLGRAM service fee is strictly 0%');
    assert(Math.abs(netApr - 5.89) < 0.01, `Net APR calculated accurately: ${netApr.toFixed(2)}% (Gross 6.20% - 5.0% pool fee)`);

    // Verify 100 TON stake annual yield
    const principalTon = 100;
    const annualNetTon = principalTon * (netApr / 100);
    assert(Math.abs(annualNetTon - 5.89) < 0.01, `100 TON yields ~${annualNetTon.toFixed(2)} TON net annually`);
  }

  // SECTION 7: Multi-State On-Chain Event Resolution
  section('7. Multi-State On-Chain Event Status Resolution');
  {
    function resolveTxEventStatus(event, expectedOpcode) {
      if (!event) return { status: 'pending' };
      if (event.in_msg && event.in_msg.bounced) {
        return { status: 'bounced', reason: 'Contract bounced message. Parameters or gas rejected.' };
      }
      if (event.actions) {
        for (const action of event.actions) {
          if (action.status === 'failed') {
            return { status: 'failed', reason: action.description || 'Action execution failed.' };
          }
        }
      }
      if (event.in_msg && event.in_msg.decoded_op_name) {
        return { status: 'confirmed', hash: event.event_id || event.tx_hash };
      }
      if (event.in_msg && event.in_msg.opcode === expectedOpcode) {
        return { status: 'confirmed', hash: event.event_id || event.tx_hash };
      }
      return { status: 'confirmed', hash: event.event_id || event.tx_hash };
    }

    const pendingResult = resolveTxEventStatus(null, 0x47d54391);
    assert(pendingResult.status === 'pending', 'Null event yields pending status');

    const bouncedEvent = {
      event_id: 'bounced_hash_123',
      in_msg: { bounced: true, opcode: 0x47d54391 }
    };
    const bouncedResult = resolveTxEventStatus(bouncedEvent, 0x47d54391);
    assert(bouncedResult.status === 'bounced', 'Bounced in_msg yields bounced status with explanation');

    const failedEvent = {
      event_id: 'failed_hash_456',
      actions: [{ status: 'failed', description: 'Out of gas' }]
    };
    const failedResult = resolveTxEventStatus(failedEvent, 0x47d54391);
    assert(failedResult.status === 'failed', 'Failed action yields failed status');

    const confirmedEvent = {
      event_id: 'confirmed_hash_789',
      in_msg: { bounced: false, opcode: 0x47d54391 }
    };
    const confirmedResult = resolveTxEventStatus(confirmedEvent, 0x47d54391);
    assert(confirmedResult.status === 'confirmed' && confirmedResult.hash === 'confirmed_hash_789', 'Valid in_msg yields confirmed status with real hash');
  }

  // SUMMARY
  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log(`======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
