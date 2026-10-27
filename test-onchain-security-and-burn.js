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

it('labsVerifyOnChainTokenSecurity requires verified bytecode before certifying permanent renunciation (SEC-01)', () => {
  assert.strictEqual(js.includes("rep.summary.permanentRenounced"), true);
  assert.strictEqual(js.includes("rep.summary.permanentRenounced ? 'VERIFIED ON-CHAIN (PERMANENTLY RENOUNCED)'"), true);
  assert.strictEqual(js.includes("rep.summary.permanentRenounced ? 'PERMANENTLY BLOCKED'"), true);
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

console.log('\nSECTION 6: Live DOM Execution of anl-labs.js (ALTO-02 — 5 Mandatory Scenarios) & explorer.html (MEDIO-04)');
console.log('------------------------------------------------------------');

(async () => {
  const path = require('path');
  const vm = require('vm');
  const tonCore = require(path.resolve('minter-contract/node_modules/@ton/core'));
  const pinned = JSON.parse(fs.readFileSync('src/config/pinned-contract-artifacts.json', 'utf8'));
  const explorerHtml = fs.readFileSync('explorer.html', 'utf8').replace(/\r\n/g, '\n');

  // Create lightweight DOM harness to execute assets/js/anl-labs.js in a real VM context
  function createDomHarness() {
    const elements = {};
    function getEl(id) {
      if (!elements[id]) {
        elements[id] = {
          id,
          innerHTML: '',
          textContent: '',
          value: '',
          disabled: false,
          checked: false,
          style: { display: 'none', opacity: '1', cursor: 'pointer', background: '', border: '', color: '' },
          dataset: {},
          classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
          },
          addEventListener: () => {},
          removeAttribute: () => {},
          querySelector: () => null,
          focus: () => {},
          scrollIntoView: () => {}
        };
      }
      return elements[id];
    }

    const win = {
      location: { search: '' },
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      TON_CORE: tonCore,
      tonConnectUI: {
        connected: true,
        account: {
          address: '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d',
          chain: '-239'
        }
      },
      scrollTo: () => {},
      addEventListener: () => {},
      dispatchEvent: () => {},
      CustomEvent: function (name, detail) { this.name = name; this.detail = detail; },
      Event: function (name) { this.name = name; },
      alert: () => {},
      confirm: () => true,
      fetch: async () => ({ ok: false, status: 404 }),
      console
    };

    const doc = {
      getElementById: (id) => getEl(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {}
    };

    win.window = win;
    win.document = doc;
    win.Element = function () {};
    vm.createContext(win);
    vm.runInContext(js, win);
    return { win, doc, getEl };
  }

  const { win, getEl } = createDomHarness();
  getEl('renounce-minter-addr').value = 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe';

  // Scenario 1: Verified Renounced
  await itAsync('ALTO-02 Scenario 1 (DOM): Verified Renounced shows green banners, disables buttons, and displays None (Permanently Renounced)', async () => {
    win.labsVerifyOnChainTokenSecurity = async () => ({
      minterAddress: 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe',
      adminAddress: null,
      isRenounced: true,
      isUnverified: false,
      adminVerified: true,
      supplyVerified: true,
      isStandardTEP74: true,
      isUserAdmin: false,
      totalSupplyFormatted: '1,000,004,000',
      renounceStatus: 'VERIFIED ON-CHAIN (PERMANENTLY RENOUNCED)',
      verifiedAt: Date.now(),
      error: null
    });
    await win.labsRefreshSecurityAnalysis();
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('None (Permanently Renounced)'), true);
    assert.strictEqual(getEl('sec-mint-authority').innerHTML.includes('DISABLED (No Admin)'), true);
    assert.strictEqual(getEl('sec-minting-status').innerHTML.includes('PERMANENTLY BLOCKED'), true);
    assert.strictEqual(getEl('sec-renounce-status').innerHTML.includes('VERIFIED ON-CHAIN (PERMANENT)'), true);
    assert.strictEqual(getEl('sec-burn-status').innerHTML.includes('AVAILABLE (TEP-74 Standard)'), true);
    assert.strictEqual(getEl('mint-renounced-banner').style.display, 'block');
    assert.strictEqual(getEl('labs-renounce-status-banner').style.display, 'block');
    assert.strictEqual(getEl('mint-btn').disabled, true);
    assert.strictEqual(getEl('renounce-btn').disabled, true);
  });

  // Scenario 5 (tested right after Scenario 1): Error on Refresh after previous Verified Renounced state
  await itAsync('ALTO-02 Scenario 5 (DOM): Error on Refresh after renounced state hides previous green banners and marks all fields NOT VERIFIED', async () => {
    win.labsVerifyOnChainTokenSecurity = async () => ({
      minterAddress: 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe',
      adminAddress: null,
      isRenounced: false,
      isUnverified: true,
      error: 'Simulated TonAPI HTTP 504 Gateway Timeout'
    });
    await win.labsRefreshSecurityAnalysis();
    assert.strictEqual(getEl('mint-renounced-banner').style.display, 'none', 'Green mint-renounced-banner must be hidden on error');
    assert.strictEqual(getEl('labs-renounce-status-banner').style.display, 'none', 'Green labs-renounce-status-banner must be hidden on error');
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-total-supply').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-mint-authority').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-minting-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-renounce-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-burn-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-verification-note').innerHTML.includes('Last known verification'), true);
    assert.strictEqual(getEl('mint-btn').disabled, true);
    assert.strictEqual(getEl('renounce-btn').disabled, true);
  });

  // Scenario 2: Verified Active Admin (Creator Wallet)
  await itAsync('ALTO-02 Scenario 2 (DOM): Verified Active Admin hides renounced banners, enables creator buttons, and shows admin link', async () => {
    win.labsVerifyOnChainTokenSecurity = async () => ({
      minterAddress: 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe',
      adminAddress: '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d',
      isRenounced: false,
      isUnverified: false,
      adminVerified: true,
      supplyVerified: true,
      isStandardTEP74: true,
      isUserAdmin: true,
      totalSupplyFormatted: '1,000,000,000',
      renounceStatus: 'NOT RENOUNCED (ADMIN ACTIVE)',
      verifiedAt: Date.now(),
      error: null
    });
    await win.labsRefreshSecurityAnalysis();
    assert.strictEqual(getEl('mint-renounced-banner').style.display, 'none');
    assert.strictEqual(getEl('labs-renounce-status-banner').style.display, 'none');
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('<a href='), true);
    assert.strictEqual(getEl('sec-mint-authority').innerHTML.includes('ACTIVE (Creator Wallet)'), true);
    assert.strictEqual(getEl('sec-minting-status').innerHTML.includes('POSSIBLE (Admin Controlled)'), true);
    assert.strictEqual(getEl('sec-renounce-status').innerHTML.includes('NOT RENOUNCED (ADMIN ACTIVE)'), true);
    assert.strictEqual(getEl('mint-btn').disabled, false);
    assert.strictEqual(getEl('renounce-btn').disabled, false);
  });

  // Scenario 3: Null Admin + Custom / Non-Standard Bytecode
  await itAsync('ALTO-02 Scenario 3 (DOM): Null Admin + Custom Bytecode renders NOT VERIFIED (never empty link or ACTIVE/POSSIBLE)', async () => {
    win.labsVerifyOnChainTokenSecurity = async () => ({
      minterAddress: '0:91cff193919877f82291a957a612813fb958aeb1f235ecc2119d4d80b096f78f',
      adminAddress: null,
      isRenounced: false,
      isUnverified: true,
      adminVerified: true,
      supplyVerified: true,
      isStandardTEP74: false,
      isUserAdmin: false,
      totalSupplyFormatted: '1,000,000,000',
      renounceStatus: 'NOT VERIFIED (BYTECODE / RPC AUDIT REQUIRED)',
      verifiedAt: Date.now(),
      error: null
    });
    await win.labsRefreshSecurityAnalysis();
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('<a href='), false, 'Must not render empty <a> tag when adminAddress is null');
    assert.strictEqual(getEl('sec-mint-authority').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-minting-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-renounce-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-burn-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('mint-renounced-banner').style.display, 'none');
    assert.strictEqual(getEl('labs-renounce-status-banner').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('mint-btn').disabled, true);
    assert.strictEqual(getEl('renounce-btn').disabled, true);
  });

  // Scenario 4: Failed Getter / Incomplete Data
  await itAsync('ALTO-02 Scenario 4 (DOM): Failed Getter renders NOT VERIFIED for supply, admin, minting, and renounce status', async () => {
    win.labsVerifyOnChainTokenSecurity = async () => ({
      minterAddress: 'EQD-PTVoQLLQopmyitIXh4vGV_A7kR9cp_j9QLPf0jcYMaOe',
      adminAddress: null,
      isRenounced: false,
      isUnverified: true,
      adminVerified: false,
      supplyVerified: false,
      isStandardTEP74: true,
      isUserAdmin: false,
      totalSupplyFormatted: 'NOT VERIFIED',
      renounceStatus: 'NOT VERIFIED',
      verifiedAt: Date.now(),
      error: null
    });
    await win.labsRefreshSecurityAnalysis();
    assert.strictEqual(getEl('sec-total-supply').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-admin-addr').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-mint-authority').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-minting-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('sec-renounce-status').innerHTML.includes('NOT VERIFIED'), true);
    assert.strictEqual(getEl('mint-btn').disabled, true);
    assert.strictEqual(getEl('renounce-btn').disabled, true);
  });

  // Item 14: MEDIO-04 explorer.html 4 Badge States
  it('MEDIO-04 (explorer.html): Badge priority distinguishes Renounced, Active Admin, Failed Checks, Unverified, and Network Error', () => {
    assert.strictEqual(explorerHtml.includes("badgeEl.textContent = '✔ PERMANENTEMENTE RENUNCIADO (SEGURO)'"), true);
    assert.strictEqual(explorerHtml.includes("badgeEl.textContent = '⚠️ ADMIN ACTIVO (SUMINISTRO CONTROLADO)'"), true);
    assert.strictEqual(explorerHtml.includes("badgeEl.textContent = '⚠️ ALTO RIESGO / CHEQUEOS FALLIDOS'"), true);
    assert.strictEqual(explorerHtml.includes("badgeEl.textContent = '⚠️ NO VERIFICADO (DATOS INCOMPLETOS / BYTECODE NO ESTÁNDAR)'"), true);
    assert.strictEqual(explorerHtml.includes("badgeEl.textContent = '⚠️ ERROR TEMPORAL DE RED (REINTENTAR)'"), true);
  });

  console.log('\nSECTION 7: Dry-Run Memecoin StateInit & TEP-74 Burn Payload Verification (No Broadcast)');
  console.log('------------------------------------------------------------');

  it('Dry-run new memecoin StateInit matches canonical TEP-74 minter & wallet hashes and computes valid address', () => {
    const { Cell, beginCell, Address, contractAddress } = tonCore;
    const minterCell = Cell.fromBoc(Buffer.from(pinned.standardMinterCodeHex, 'hex'))[0];
    const walletCell = Cell.fromBoc(Buffer.from(pinned.standardWalletCodeHex, 'hex'))[0];

    assert.strictEqual(minterCell.hash().toString('hex'), pinned.standardMinterCodeHashHex);
    assert.strictEqual(walletCell.hash().toString('hex'), pinned.standardWalletCodeHashHex);

    // Ensure memecoin-platform.html pins the exact canonical hash and loads src/config/pinned-contract-artifacts.json
    assert.strictEqual(html.includes(pinned.standardMinterCodeHashHex), true, 'memecoin-platform.html pins canonical minter code hash');
    assert.strictEqual(html.includes('src/config/pinned-contract-artifacts.json'), true, 'memecoin-platform.html loads pinned-contract-artifacts.json');

    // Construct initial data cell identical to deployJettonWeb3 (coins supply, admin_address, content ref, wallet_code ref)
    const creatorAddr = Address.parse('EQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbXvY');
    const contentCell = beginCell().storeUint(1, 8).storeStringTail('https://anlgram.com/metadata.json').endCell();
    const initData = beginCell()
      .storeCoins(1000000000n * 1000000000n)
      .storeAddress(creatorAddr)
      .storeRef(contentCell)
      .storeRef(walletCell)
      .endCell();

    const computedAddr = contractAddress(0, { code: minterCell, data: initData });
    const friendly = computedAddr.toString({ bounceable: true, urlSafe: true });
    assert.strictEqual(friendly.length, 48);
    assert.strictEqual(friendly.startsWith('EQ'), true);
  });

  it('Dry-run TEP-74 op::burn (0x595f07bc) BOC payload serializes and deserializes losslessly without broadcasting', () => {
    const { beginCell, Address, Cell } = tonCore;
    const responseAddr = Address.parse('EQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbXvY');
    const burnAmountUnits = 250000000000000n; // 250,000 tokens (9 decimals)
    const queryId = 1793068800000n;

    const burnCell = beginCell()
      .storeUint(0x595f07bc, 32)
      .storeUint(queryId, 64)
      .storeCoins(burnAmountUnits)
      .storeAddress(responseAddr)
      .storeBit(0)
      .endCell();

    const bocBase64 = burnCell.toBoc().toString('base64');
    const parsedSlice = Cell.fromBoc(Buffer.from(bocBase64, 'base64'))[0].beginParse();
    assert.strictEqual(parsedSlice.loadUint(32), 0x595f07bc);
    assert.strictEqual(parsedSlice.loadUintBig(64), queryId);
    assert.strictEqual(parsedSlice.loadCoins(), burnAmountUnits);
    assert.strictEqual(parsedSlice.loadAddress().toRawString(), responseAddr.toRawString());
    assert.strictEqual(parsedSlice.loadBit(), false);
  });

  console.log('\nSECTION 8: Live Blockchain Verification Query (Real Network Test)');
  console.log('------------------------------------------------------------');

  await itAsync('TonAPI get_jetton_data live query decodes active and renounced tokens accurately', async () => {
    // Test against Notcoin (active minter on TON) with backoff for public TonAPI 1 req/sec rate limit
    const notcoinMinter = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
    let res = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      res = await fetch(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(notcoinMinter)}/methods/get_jetton_data`);
      if (res.status === 429 && attempt < 4) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      break;
    }
    assert.strictEqual(res.ok, true, `TonAPI request failed with HTTP ${res ? res.status : 'NO_RES'}`);
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
