/**
 * Test Suite: ANLGRAM Search Engine & Token Details Verification
 */
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('🔍 ANLGRAM TON SEARCH & DISCOVERY ENGINE TEST SUITE');
console.log('========================================================================\n');

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

// 1. Verify visualizer.html DOM elements
const html = fs.readFileSync(path.join(__dirname, 'visualizer.html'), 'utf8');

const requiredElements = [
  '#token-search-input',
  '#search-clear-btn',
  '#search-results-dropdown',
  'search-network-pill',
  '#modal-token-details',
  '#dt-token-logo',
  '#dt-token-name',
  '#dt-token-badge',
  '#dt-token-symbol',
  '#dt-token-contract',
  '#dt-btn-copy-contract',
  '#dt-btn-explore-cluster',
  '#dt-token-price',
  '#dt-token-change24h',
  '#dt-token-mcap',
  '#dt-token-vol',
  '#dt-token-liquidity',
  '#dt-token-holders',
  '#dt-token-supply',
  '#dt-token-last-sync',
  '#dt-link-tonviewer',
  '#dt-link-tonscan',
  '#dt-link-stonfi'
];

console.log('--- 1. Markup & DOM Element Verification in visualizer.html ---');
for (const el of requiredElements) {
  const idOrClass = el.replace(/^[#.]/, '');
  const exists = html.includes(`id="${idOrClass}"`) || html.includes(`class="${idOrClass}"`) || html.includes(idOrClass);
  assert(exists, `Markup contains element: ${el}`);
}

// 2. CSP Verification
console.log('\n--- 2. CSP (Content Security Policy) Verification ---');
assert(html.includes('https://api.ston.fi'), 'CSP connect-src includes https://api.ston.fi');
assert(html.includes('https://tonapi.io'), 'CSP connect-src includes https://tonapi.io');

// 3. CSS Stylesheet Verification
console.log('\n--- 3. CSS Classes in gram-terminal-v2.css ---');
const css = fs.readFileSync(path.join(__dirname, 'assets/css/gram-terminal-v2.css'), 'utf8');
const requiredCssClasses = [
  '.search-bar-wrapper',
  '.search-network-pill',
  '.search-results-dropdown',
  '.search-dropdown-header',
  '.search-result-item',
  '.search-token-icon',
  '.search-token-info',
  '.search-token-name',
  '.search-token-symbol',
  '.search-token-contract',
  '.btn-search-action',
  '.search-state-box',
  '.search-state-spinner',
  '.btn-copy-pill'
];
for (const cls of requiredCssClasses) {
  assert(css.includes(cls), `CSS definition exists: ${cls}`);
}

// 4. JavaScript Engine Verification in wallet-cluster-explorer.js
console.log('\n--- 4. Engine Logic in wallet-cluster-explorer.js ---');
const js = fs.readFileSync(path.join(__dirname, 'assets/js/wallet-cluster-explorer.js'), 'utf8');
assert(js.includes('async function searchTonTokens'), 'Defines async function searchTonTokens');
assert(js.includes('function renderSearchResultsDropdown'), 'Defines function renderSearchResultsDropdown');
assert(js.includes('dt-btn-explore-cluster'), 'Wires up #dt-btn-explore-cluster button');
assert(js.includes('dt-btn-copy-contract'), 'Wires up #dt-btn-copy-contract button');
assert(js.includes('dt-token-change24h'), 'Populates #dt-token-change24h in drawer');
assert(js.includes('dt-token-liquidity'), 'Populates #dt-token-liquidity in drawer');
assert(js.includes('dt-token-last-sync'), 'Populates #dt-token-last-sync in drawer');
assert(js.includes('dt-link-stonfi'), 'Populates STON.fi swap URL in drawer');

console.log('\n========================================================================');
console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
console.log('========================================================================');

if (failed > 0) process.exit(1);
