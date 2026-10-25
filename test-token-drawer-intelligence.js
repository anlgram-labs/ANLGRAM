/**
 * ANLGRAM Token Intelligence & Details Drawer Audit & Regression Suite
 */
const fs = require('fs');
const path = require('path');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

console.log('========================================================================');
console.log('🧪 ANLGRAM TOKEN DETAILS & INTELLIGENCE DRAWER AUDIT SUITE');
console.log('========================================================================\n');

const htmlPath = path.join(__dirname, 'visualizer.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const jsPath = path.join(__dirname, 'assets', 'js', 'wallet-cluster-explorer.js');
const js = fs.readFileSync(jsPath, 'utf8');

const cssPath = path.join(__dirname, 'assets', 'css', 'gram-terminal-v2.css');
const css = fs.readFileSync(cssPath, 'utf8');

console.log('--- 1. Markup & DOM Element Verification in visualizer.html ---');
const requiredIds = [
  'modal-token-details',
  'dt-token-logo',
  'dt-token-name',
  'dt-token-badge',
  'dt-token-symbol',
  'dt-token-contract',
  'dt-btn-copy-contract',
  'dt-sync-banner',
  'dt-sync-message',
  'dt-btn-retry',
  'dt-btn-explore-cluster',
  'dt-token-price',
  'dt-token-change24h',
  'dt-token-mcap',
  'dt-token-vol',
  'dt-token-liquidity',
  'dt-token-holders',
  'dt-token-supply',
  'dt-token-last-sync',
  'dt-top5-share',
  'dt-top10-share',
  'dt-top20-share',
  'dt-concentration-level',
  'dt-concentration-rule',
  'dt-conc-notice',
  'dt-conc-denominator',
  'dt-conc-warning',
  'dt-holders-count-indicator',
  'dt-holders-tbody',
  'dt-transfers-indicator',
  'dt-transfers-tbody',
  'dt-trades-indicator',
  'dt-trades-tbody'
];

requiredIds.forEach(id => {
  assert(html.includes(`id="${id}"`), `DOM element exists in visualizer.html: #${id}`);
});

assert(html.includes('TON Mainnet'), 'Network indicator "TON Mainnet" badge is present in modal header');
assert(html.includes('Fuente: TonAPI Rates / STON.fi'), 'Source attribution for Price is present');
assert(html.includes('Fuente: STON.fi Pool Reportado'), 'Source attribution for Volume is present');
assert(html.includes('TVL en STON.fi Pools'), 'Source attribution for Liquidity is present');

console.log('\n--- 2. CSS Styles in gram-terminal-v2.css ---');
assert(css.includes('.dt-sync-banner'), 'CSS defines .dt-sync-banner');
assert(css.includes('.dt-sync-banner.loading'), 'CSS defines .dt-sync-banner.loading');
assert(css.includes('.dt-sync-banner.error'), 'CSS defines .dt-sync-banner.error');
assert(css.includes('.dt-sync-banner.success'), 'CSS defines .dt-sync-banner.success');
assert(css.includes('.dt-methodology-box'), 'CSS defines .dt-methodology-box');
assert(css.includes('.btn-token-intel'), 'CSS defines .btn-token-intel');
assert(css.includes('.dt-table'), 'CSS defines .dt-table');
assert(css.includes('min-width: 580px'), 'CSS ensures .dt-table has horizontal scroll container');

console.log('\n--- 3. Logic & Engine Verification in wallet-cluster-explorer.js ---');
assert(js.includes('const KNOWN_STONFI_POOLS'), 'Defines KNOWN_STONFI_POOLS mapping');
assert(js.includes('fetchStonfiPool('), 'ApiService implements fetchStonfiPool');
assert(js.includes('fetchStonfiAsset('), 'ApiService implements fetchStonfiAsset');
assert(js.includes('function openTokenDetailsDrawer('), 'Defines function openTokenDetailsDrawer');
assert(js.includes('function renderInitialTokenDetails('), 'Defines function renderInitialTokenDetails');
assert(js.includes('function loadTokenDetailsData('), 'Defines function loadTokenDetailsData');
assert(js.includes('function renderHoldersAndConcentration('), 'Defines function renderHoldersAndConcentration');
assert(js.includes('function renderTransfersAndTrades('), 'Defines function renderTransfersAndTrades');
assert(js.includes('btn-token-intel'), 'Catalog table generates .btn-token-intel button');
assert(js.includes('ALTA CONCENTRACIÓN'), 'Includes explicit ALTA CONCENTRACIÓN tier rule');
assert(js.includes('CONCENTRACIÓN MODERADA'), 'Includes explicit CONCENTRACIÓN MODERADA tier rule');
assert(js.includes('DISTRIBUCIÓN AMPLIA'), 'Includes explicit DISTRIBUCIÓN AMPLIA tier rule');
assert(js.includes('PENDIENTE DE DATOS'), 'Includes explicit PENDIENTE DE DATOS tier rule');
assert(js.includes('Desconocida'), 'Shows "Desconocida" for unverified holder category');
assert(js.includes('BigInt'), 'Uses BigInt for accurate on-chain supply and balance calculations');

console.log('\n========================================================================');
console.log(`📊 TEST RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
console.log('========================================================================');

if (failCount > 0) process.exit(1);
