const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('🛡️  ANLGRAM EXCHANGE INTEL AUDIT & REGRESSION SUITE');
console.log('========================================================================\n');

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

// 1. Audit DOM IDs in intel-exchange.html
console.log('--- 1. Verification of Required DOM IDs in intel-exchange.html ---');
const html = fs.readFileSync(path.join(__dirname, 'intel-exchange.html'), 'utf8');

const REQUIRED_DOM_IDS = [
  'card-btc',
  'btc-price',
  'btc-change',
  'btc-mcap',
  'btc-vol',
  'card-eth',
  'eth-price',
  'eth-change',
  'eth-mcap',
  'eth-vol',
  'card-ton',
  'ton-price',
  'ton-change',
  'ton-mcap',
  'ton-vol',
  'card-anl',
  'header-sync-status',
  'tableSearchInput',
  'marketTable',
  'marketTableBody',
  'marketTablePagination',
  'directoryGrid',
  'chartModal',
  'chartModalTitle',
  'chartModalIcon',
  'chartModalName',
  'chartModalBody',
  'topbarWalletBtn'
];

REQUIRED_DOM_IDS.forEach(id => {
  const hasId = html.includes(`id="${id}"`);
  assert(hasId, `DOM ID exists in markup: #${id}`);
});

// 2. Audit Function Handlers
console.log('\n--- 2. Verification of Event Handlers in intel-exchange.html ---');
const REQUIRED_HANDLERS = [
  'triggerManualMarketSync',
  'filterMarketTableTab',
  'sortMarketTable',
  'filterDirectoryCategory',
  'closeChartModal'
];

REQUIRED_HANDLERS.forEach(fn => {
  const hasFn = html.includes(fn);
  assert(hasFn, `Handler referenced: ${fn}`);
});

// 3. Audit AssetRegistry in Node
console.log('\n--- 3. AssetRegistry Token Verification ---');
global.window = global;
const registryCode = fs.readFileSync(path.join(__dirname, 'assets/js/asset-registry.js'), 'utf8');
eval(registryCode);

const assets = window.AssetRegistry.getAllAssets();
const symbols = assets.map(a => a.symbol);
console.log(`  Total assets registered: ${assets.length}`);

const EXPECTED_TOKENS = ['TON', 'USD₮', 'NOT', 'DOGS', 'STON', 'DUST', 'REDO', 'FISH', 'GRM', 'MAJOR', 'tsTON', 'BTC', 'ETH', 'SOL', 'ANLGRAM'];
EXPECTED_TOKENS.forEach(sym => {
  assert(symbols.includes(sym), `Asset symbol registered: ${sym}`);
});

// Check that every asset has an imageUri that is not empty
assets.forEach(a => {
  const hasImg = a.imageUri && a.imageUri.length > 0;
  assert(hasImg, `Asset ${a.symbol} has valid imageUri (${a.imageUri})`);
});

console.log('\n========================================================================');
console.log(`📊 RESULTADO: ${passCount} PASARON | ${failCount} FALLARON`);
console.log('========================================================================');

if (failCount > 0) process.exit(1);
