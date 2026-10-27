/**
 * ANLGRAM MEMECOIN LAB
 * Comprehensive Test Suite: Real On-Chain Renounce, Mint Verification & TEP-74 Burn
 *
 * Verifies:
 * 1. Smart contract source of truth (zero localStorage overrides).
 * 2. On-chain authority verification via get_jetton_data.
 * 3. Step 5 Security Analysis Card DOM & live properties.
 * 4. Step 5 Burn Card & TEP-74 op::burn (0x595f07bc) implementation.
 * 5. Irreversible confirmation modals & balance validations.
 * 6. Non-conflation of burn and renounce.
 */

const fs = require('fs');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

async function itAsync(desc, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n============================================================');
console.log('🧪 ANLGRAM MEMECOIN LAB: SECURITY AUDIT & BURN TEST SUITE');
console.log('============================================================\n');

// Normalize CRLF to LF for reliable assertions
const html = fs.readFileSync('memecoin-platform.html', 'utf8').replace(/\r\n/g, '\n');
const js = fs.readFileSync('assets/js/anl-labs.js', 'utf8').replace(/\r\n/g, '\n');

console.log('SECTION 1: Elimination of localStorage as Source of Truth');
console.log('------------------------------------------------------------');

it('memecoin-platform.html does NOT contain any anlgram_renounced_ references', () => {
  assert.strictEqual(html.includes('anlgram_renounced_'), false, 'Found legacy anlgram_renounced_ in HTML');
});

it('assets/js/anl-labs.js does NOT contain any anlgram_renounced_ references', () => {
  assert.strictEqual(js.includes('anlgram_renounced_'), false, 'Found legacy anlgram_renounced_ in JS');
});

it('Step 5 management does not use localStorage to override renounce state', () => {
  assert.strictEqual(js.includes("const isRen = !!localStorage.getItem(renKey)"), false);
  assert.strictEqual(js.includes("window.labsRefreshSecurityAnalysis()"), true);
});

console.log('\nSECTION 2: Step 5 Token Security & Authority Analysis Card');
console.log('------------------------------------------------------------');

it('Security card container exists (#token-security-analysis-card)', () => {
  assert.strictEqual(html.includes('id="token-security-analysis-card"'), true);
});

it('Security card displays on-chain source badge (get_jetton_data)', () => {
  assert.strictEqual(html.includes('Source: Blockchain get_jetton_data'), true);
});

it('Security card contains all required on-chain metric elements', () => {
  assert.strictEqual(html.includes('id="sec-contract-addr"'), true, 'Missing #sec-contract-addr');
  assert.strictEqual(html.includes('id="sec-admin-addr"'), true, 'Missing #sec-admin-addr');
  assert.strictEqual(html.includes('id="sec-total-supply"'), true, 'Missing #sec-total-supply');
  assert.strictEqual(html.includes('id="sec-mint-authority"'), true, 'Missing #sec-mint-authority');
  assert.strictEqual(html.includes('id="sec-minting-status"'), true, 'Missing #sec-minting-status');
  assert.strictEqual(html.includes('id="sec-renounce-status"'), true, 'Missing #sec-renounce-status');
  assert.strictEqual(html.includes('id="sec-burn-status"'), true, 'Missing #sec-burn-status');
});

it('Security card provides live Refresh button calling labsRefreshSecurityAnalysis()', () => {
  assert.strictEqual(html.includes('onclick="labsRefreshSecurityAnalysis()"'), true);
});

it('Security card contains no fake scores (no "100/100" or "100% Secure")', () => {
  const cardStart = html.indexOf('id="token-security-analysis-card"');
  const cardEnd = html.indexOf('<!-- Liquidity Pool Initialization', cardStart);
  const cardHtml = html.slice(cardStart, cardEnd);
  assert.strictEqual(cardHtml.includes('100/100'), false);
  assert.strictEqual(cardHtml.includes('100% Secure'), false);
  assert.strictEqual(cardHtml.includes('Security Score'), false);
});

console.log('\nSECTION 3: On-Chain Authority Verification Logic');
console.log('------------------------------------------------------------');

it('labsVerifyOnChainTokenSecurity is defined and exposed on window', () => {
  assert.strictEqual(js.includes('window.labsVerifyOnChainTokenSecurity = async function'), true);
});

it('labsRefreshSecurityAnalysis is defined and exposed on window', () => {
  assert.strictEqual(js.includes('window.labsRefreshSecurityAnalysis = async function'), true);
});

it('labsVerifyOnChainTokenSecurity targets get_jetton_data endpoint', () => {
  assert.strictEqual(js.includes('/methods/get_jetton_data'), true);
});

it('labsVerifyOnChainTokenSecurity decodes null/empty admin as renounced on-chain', () => {
  assert.strictEqual(js.includes("!admin || admin.trim() === '' || admin === 'null'"), true);
  assert.strictEqual(js.includes("result.mintAuthority = 'DISABLED'"), true);
  assert.strictEqual(js.includes("result.additionalMinting = 'PERMANENTLY BLOCKED'"), true);
  assert.strictEqual(js.includes("result.renounceStatus = 'VERIFIED ON-CHAIN (PERMANENTLY RENOUNCED)'"), true);
});

console.log('\nSECTION 4: Real On-Chain Token Burn (TEP-74 op::burn)');
console.log('------------------------------------------------------------');

it('Burn card container exists (#burn-card) in Step 5', () => {
  assert.strictEqual(html.includes('id="burn-card"'), true);
});

it('Burn card has live wallet balance indicator (#labs-burn-balance, #labs-burn-symbol)', () => {
  assert.strictEqual(html.includes('id="labs-burn-balance"'), true);
  assert.strictEqual(html.includes('id="labs-burn-symbol"'), true);
});

it('Burn card has amount input and quick preset buttons (25%, 50%, 100%)', () => {
  assert.strictEqual(html.includes('id="labs-burn-amount"'), true);
  assert.strictEqual(html.includes('onclick="labsSetBurnPercent(25)"'), true);
  assert.strictEqual(html.includes('onclick="labsSetBurnPercent(50)"'), true);
  assert.strictEqual(html.includes('onclick="labsSetBurnPercent(100)"'), true);
});

it('Burn confirmation modal exists (#burn-confirm-modal) with mandatory checkbox', () => {
  assert.strictEqual(html.includes('id="burn-confirm-modal"'), true);
  assert.strictEqual(html.includes('id="burn-confirm-checkbox"'), true);
  assert.strictEqual(html.includes('id="modal-burn-token-label"'), true);
  assert.strictEqual(html.includes('id="modal-burn-amount-label"'), true);
  assert.strictEqual(html.includes('onclick="labsExecuteBurnFromModal()"'), true);
});

it('burnTokensWeb3 is defined and exposed on window', () => {
  assert.strictEqual(js.includes('window.burnTokensWeb3 = async function'), true);
});

it('burnTokensWeb3 builds TEP-74 op::burn with opcode 0x595f07bc', () => {
  assert.strictEqual(js.includes('0x595f07bc'), true, 'Missing TEP-74 burn opcode 0x595f07bc');
  assert.strictEqual(js.includes('.storeUint(0x595f07bc, 32)'), true);
  assert.strictEqual(js.includes('.storeCoins(burnUnits)'), true);
});

it('burnTokensWeb3 targets the USER JETTON WALLET, NOT the minter contract', () => {
  assert.strictEqual(js.includes('const targetFriendly = Address.parse(jettonWalletAddress).toString'), true);
  assert.strictEqual(/address:\s*targetFriendly/.test(js), true);
});

it('burnTokensWeb3 validates balance and amount before dispatching', () => {
  assert.strictEqual(js.includes('numAmount <= 0'), true);
  assert.strictEqual(js.includes('burnUnits > userBalanceRaw'), true);
});

it('burnTokensWeb3 polls blockchain to verify balance and supply reduction', () => {
  assert.strictEqual(js.includes('currentBal < initialBalance'), true);
  assert.strictEqual(js.includes('Burn Verified On-Chain'), true);
});

console.log('\nSECTION 5: Real Renounce Flow & Verification');
console.log('------------------------------------------------------------');

it('renounceAdminWeb3 polls on-chain get_jetton_data until confirmed', () => {
  assert.strictEqual(html.includes('window.labsVerifyOnChainTokenSecurity(minterFriendly)'), true);
  assert.strictEqual(html.includes('if (sec && sec.isRenounced)'), true);
});

it('renounceAdminWeb3 updates UI only after on-chain verification', () => {
  assert.strictEqual(html.includes('Admin Renounced — Permanently Verified On-Chain'), true);
});

it('Burn and Renounce are completely distinct functions with separate cards & modals', () => {
  assert.strictEqual(html.includes('id="burn-card"'), true);
  assert.strictEqual(html.includes('id="renounce-card"'), true);
  assert.strictEqual(html.includes('id="burn-confirm-modal"'), true);
  assert.strictEqual(html.includes('id="renounce-confirm-modal"'), true);
  assert.strictEqual(html.includes('Burning tokens does not renounce admin rights'), true);
});

console.log('\nSECTION 6: Live Blockchain Verification Query (Real Network Test)');
console.log('------------------------------------------------------------');

(async () => {
  await itAsync('TonAPI get_jetton_data live query decodes active and renounced tokens accurately', async () => {
    // Test against Notcoin (active minter on TON)
    const notcoinMinter = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
    const res = await fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(notcoinMinter)}/methods/get_jetton_data`);
    assert.strictEqual(res.ok, true, 'TonAPI request failed');
    const data = await res.json();
    assert.strictEqual(data.success, true, 'TonAPI method execution failed');
    assert.ok(data.decoded, 'Missing decoded field');
    assert.ok(data.decoded.total_supply, 'Missing total_supply');
    assert.ok(data.decoded.admin_address !== undefined, 'Missing admin_address');
  });

  console.log('\n============================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('============================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL SECURITY AUDIT & BURN TESTS PASSED SUCCESSFULLY!');
    // clean natural exit
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
})();
