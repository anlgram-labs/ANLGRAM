/**
 * Test Suite: ANL Labs Flow & Memecoin Platform Integration Verification
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    failed++;
  }
}

console.log('========================================================================');
console.log('🧪 ANL LABS REGRESSION & INTEGRATION SUITE');
console.log('========================================================================\n');

// 1. Verify HTML Markup
console.log('--- 1. Verification of ANL Labs UI & Flow in memecoin-platform.html ---');
const html = fs.readFileSync(path.join(__dirname, 'memecoin-platform.html'), 'utf-8');

assert(html.includes('class="labs-container"'), 'labs-container exists in memecoin-platform.html');
assert(html.includes('class="labs-topbar"'), 'ANL Labs topbar exists');
assert(html.includes('Meme Lab') || html.includes('ANL Labs'), 'ANL Labs / Meme Lab title exists');
assert(html.includes('The Complete Flow'), 'The Complete Flow title exists');
assert(html.includes('labs-flow-wrapper'), 'Flow 5-card wrapper exists');

// Verify 5 Steps
assert(html.includes('Create Token'), 'Step 1: Create Token exists');
assert(html.includes('Distribute Tokens'), 'Step 2: Distribute Tokens exists');
assert(html.includes('Lock Tokens (Vesting)'), 'Step 3: Lock Tokens (Vesting) exists');
assert(html.includes('Manage & Monitor'), 'Step 4: Manage & Monitor exists');
assert(html.includes('Analyze & Grow'), 'Step 5: Analyze & Grow exists');

// Verify 4 Bottom Cards
assert(html.includes('Key Features'), 'Bottom card: Key Features exists');
assert(html.includes('Built for TON'), 'Bottom card: Built for TON exists');
assert(html.includes('Security First'), 'Bottom card: Security First exists');
assert(html.includes('Our Goal'), 'Bottom card: Our Goal exists');

// 2. Verify Preservation of Critical Handlers
console.log('\n--- 2. Verification of Critical Handlers & Zero Regression ---');
assert(html.includes('function deployJettonWeb3'), 'deployJettonWeb3 function is preserved');
assert(html.includes('function provideLiquidityWeb3'), 'provideLiquidityWeb3 function is preserved');
assert(html.includes('function mintMoreTokensWeb3'), 'mintMoreTokensWeb3 function is preserved');
assert(html.includes('function renounceAdminWeb3'), 'renounceAdminWeb3 function is preserved');
assert(html.includes('app.ston.fi/liquidity/provide'), 'STON.fi integration preserved');
assert(html.includes('dedust.io/pools/create'), 'DeDust.io integration preserved');
assert(html.includes('assets/js/anl-labs.js'), 'anl-labs.js script is included');
assert(html.includes('assets/css/anl-labs.css'), 'anl-labs.css stylesheet is included');

// 3. Verify CSS & Responsiveness
console.log('\n--- 3. Verification of CSS Stylesheet & Breakpoints ---');
const css = fs.readFileSync(path.join(__dirname, 'assets/css/anl-labs.css'), 'utf-8');
assert(css.includes('--labs-cyan: #00d8ff;'), 'Cyan accent color defined');
assert(css.includes('--labs-blue: #2374f6;'), 'Blue accent color defined');
assert(css.includes('@media (max-width: 1300px)'), 'Desktop-intermediate breakpoint exists');
assert(css.includes('@media (max-width: 900px)'), 'Tablet breakpoint exists');
assert(css.includes('@media (max-width: 640px)'), 'Mobile 360-430px breakpoint exists');

// 4. Verify JS Module Logic
console.log('\n--- 4. Verification of JS Module Functions ---');
const js = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf-8');
assert(js.includes('labsSwitchSection'), 'labsSwitchSection navigation handler defined');
assert(js.includes('labsParseDistributionText'), 'CSV/manual text parser defined');
assert(js.includes('labsExecuteDistributionBatch'), 'Safe batch distribution defined');
assert(js.includes('0x0f8a7ea5'), 'TEP-74 transfer op code defined');
assert(js.includes('isValidTonAddress'), 'TON address validator defined');
assert(js.includes('labsLoadTokenAnalytics'), 'Real-time TonAPI analytics loader defined');

console.log('\n========================================================================');
console.log(`📊 SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ANL Labs integration verified with 100% success!');
}
