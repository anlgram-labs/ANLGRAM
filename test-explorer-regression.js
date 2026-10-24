const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('🛡️  ANLGRAM ENTITY EXPLORER ON-CHAIN REGRESSION & AUDIT SUITE');
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

// ----------------------------------------------------------------------
// 1. Audit DOM Structure & IDs in explorer.html
// ----------------------------------------------------------------------
console.log('--- 1. Verification of Required DOM Elements in explorer.html ---');
const html = fs.readFileSync(path.join(__dirname, 'explorer.html'), 'utf8');

const REQUIRED_DOM_IDS = [
  'searchInput',
  'searchTypeBadge',
  'clearSearchBtn',
  'analyzeBtn',
  'demoPillBtn',
  'provenanceStrip',
  'provSource',
  'provScope',
  'provTimestamp',
  'disambiguationPanel',
  'disambiguationList',
  'errorBanner',
  'errorMessageText',
  'explorerResult',
  'profileCard',
  'entityAvatar',
  'entityName',
  'entityCategoryBadge',
  'entityTrustBadge',
  'demoModeBadge',
  'entityAddressDisplay',
  'tonviewerLink',
  'tonscanLink',
  'auditStatus',
  'auditSource',
  'auditReview',
  'auditEvidence',
  'statBalanceVal',
  'statBalanceUsd',
  'statJettonCountVal',
  'statNetFlowVal',
  'statObservedTxVal',
  'btnToggleWatchlist',
  'btnSetAlert',
  'btnViewVisualizer',
  'btnRefresh',
  'topbarTonPrice',
  'topbarWalletBtn',
  // Tabs
  'pane-overview',
  'pane-holdings',
  'pane-transactions',
  'pane-swaps',
  'pane-counterparties',
  'pane-bridges',
  'pane-anomalies',
  'pane-watchlist',
  // Tab Badges
  'tabHoldingsCount',
  'tabTxCount',
  'tabSwapsCount',
  'tabCpCount',
  'tabBridgesCount',
  'tabAnomaliesCount',
  'tabWatchlistCount',
  // Tables & Content
  'inflowProgressBar',
  'outflowProgressBar',
  'netFlowText',
  'inflowVolText',
  'outflowVolText',
  'balChart',
  'cpChart',
  'cpCenterVol',
  'topologyCanvas',
  'topologyCanvasFull',
  'jettonMasterCard',
  'jmSupply',
  'jmMintable',
  'jmHolders',
  'jmAdmin',
  'jettonHoldersTableBody',
  'jettonsTableFullBody',
  'txHistoryBody',
  'overviewRecentTxBody',
  'swapsTableBody',
  'confirmedSwapsBadge',
  'counterpartiesFullTableBody',
  'bridgesTableBody',
  'bridgesCountBadge',
  'anomaliesListContainer',
  'anomaliesCountBadge',
  'watchlistTableBody',
  'btnLoadMoreTx',
  'copyToast',
  'qrModal'
];

REQUIRED_DOM_IDS.forEach(id => {
  const hasId = html.includes(`id="${id}"`);
  assert(hasId, `DOM ID exists in markup: #${id}`);
});

// ----------------------------------------------------------------------
// 2. Audit Core Functions in explorer.html
// ----------------------------------------------------------------------
console.log('\n--- 2. Verification of JavaScript Logic & Functions in explorer.html ---');
const REQUIRED_FUNCTIONS = [
  'detectInputType',
  'handleSearchSubmit',
  'showDisambiguationPanel',
  'closeDisambiguation',
  'loadTargetAddress',
  'performSearch',
  'renderProfileHeader',
  'renderHoldingsView',
  'renderJettonMasterView',
  'switchExplorerTab',
  'setDateRange',
  'setTxFilter',
  'handleAssetFilterChange',
  'handleTxSearchInput',
  'handleTxSortChange',
  'parseEventAction',
  'renderFilteredEvents',
  'renderConfirmedSwapsTable',
  'renderBridgesTable',
  'renderAnomaliesSignals',
  'updateHistoricalAnalytics',
  'renderCounterpartyChart',
  'renderBalanceTrajectoryChart',
  'renderTopologyCanvas',
  'renderTopologyCanvasFull',
  'toggleWatchlistCurrent',
  'renderWatchlistTable',
  'loadMoreTransactions',
  'exportDataToCsv',
  'exportDataToJson',
  'toggleDemoMode',
  'copyCurrentAddress',
  'openQrModal',
  'closeQrModal'
];

REQUIRED_FUNCTIONS.forEach(fn => {
  const hasFn = html.includes(`function ${fn}`) || html.includes(`${fn} =`) || html.includes(`${fn}(`);
  assert(hasFn, `Core function defined: ${fn}()`);
});

// ----------------------------------------------------------------------
// 3. Pure Logic Tests using api.js and asset-registry.js
// ----------------------------------------------------------------------
console.log('\n--- 3. Testing API, Registry, and Classification Logic in Node ---');
const api = require('./assets/js/api.js');
const { AssetRegistry } = require('./assets/js/asset-registry.js');

// 3.1 Address Validator Tests
const friendlyAddr = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
const validResult = api.validateTonAddress(friendlyAddr);
assert(validResult.valid === true, `Validates friendly TON address correctly: ${friendlyAddr}`);
assert(validResult.raw.startsWith('0:'), `Converts friendly to raw: ${validResult.raw}`);

const invalidAddr = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB99'; // Wrong checksum
const invalidResult = api.validateTonAddress(invalidAddr);
assert(invalidResult.valid === false, 'Detects corrupted address with invalid CRC checksum');

// 3.2 Pure Formatting Tests
assert(api.formatNanoTon('1500000000') === '1.5', `Formats 1.5 TON correctly: ${api.formatNanoTon('1500000000')}`);
assert(api.formatTokenUnits('1000000', 6) === '1', `Formats 1 USDT (6 dec): ${api.formatTokenUnits('1000000', 6)}`);
assert(api.shortenAddress(friendlyAddr) === 'EQCD39...xqB2N', `Shortens address: ${api.shortenAddress(friendlyAddr)}`);

// 3.3 DEX Swap Classification vs Normal Transfer
console.log('\n--- 4. Verification of Strict DEX Swap vs Transfer Classification ---');
// Case A: Real DEX Swap event
const realSwapAction = {
  type: 'JettonSwap',
  JettonSwap: {
    dex: 'stonfi',
    ton_out: 1500000000000,
    amount_in: '15000000000',
    router: { address: 'EQCSIMGBps_qzRG3uPYhON8bucyCtu0mYdL1-u4gSz77IBa3', name: 'STON.fi DEX' },
    jetton_master_in: { symbol: 'USDT', name: 'Tether USD', decimals: 6 }
  }
};
const swapDetection = api.detectConfirmedSwap(realSwapAction, friendlyAddr);
assert(swapDetection.isSwap === true, 'Accurately recognizes confirmed JettonSwap action');
assert(swapDetection.dex === 'STON.fi', `Identifies DEX router: ${swapDetection.dex}`);
assert(swapDetection.swapType === 'sell', `Identifies swap type: ${swapDetection.swapType}`);

// Case B: Regular peer-to-peer TonTransfer (MUST NOT BE CLASSIFIED AS SWAP)
const normalTransferAction = {
  type: 'TonTransfer',
  TonTransfer: {
    sender: { address: 'EQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCXmC', name: 'Alice' },
    recipient: { address: friendlyAddr, name: 'Bob' },
    amount: 1000000000
  }
};
const normalDetection = api.detectConfirmedSwap(normalTransferAction, friendlyAddr);
assert(normalDetection.isSwap === false, 'Standard peer-to-peer transfer is NOT classified as a swap');

// Case C: Transfer into STON.fi DEX Router
const routerTransferAction = {
  type: 'TonTransfer',
  TonTransfer: {
    sender: { address: friendlyAddr },
    recipient: { address: 'EQCSIMGBps_qzRG3uPYhON8bucyCtu0mYdL1-u4gSz77IBa3' }, // STON.fi router
    amount: 5000000000
  }
};
const routerDetection = api.detectConfirmedSwap(routerTransferAction, friendlyAddr);
assert(routerDetection.isSwap === true && routerDetection.dex === 'STON.fi', 'Transfer directly into STON.fi router recognized as DEX Swap initiation');

// ----------------------------------------------------------------------
// 5. Cross-Chain Bridge Detection Tests
// ----------------------------------------------------------------------
console.log('\n--- 5. Verification of Cross-Chain Bridge Identification ---');
const bridgeAction = {
  type: 'TonTransfer',
  TonTransfer: {
    sender: { address: friendlyAddr },
    recipient: { address: 'Ef_dJMSh8riPi3BTUTtcxsWjG8RLKnLctNjAM4rw8NN-xWdr' }, // Official ETH Bridge
    amount: 2500000000000
  }
};
const bridgeDetection = api.detectBridgeOperation(bridgeAction);
assert(bridgeDetection.isBridge === true, 'Identifies interaction with TON Official Ethereum Bridge');
assert(bridgeDetection.targetChain === 'Ethereum', `Identifies target cross-chain network: ${bridgeDetection.targetChain}`);

const nonBridgeAction = {
  type: 'TonTransfer',
  TonTransfer: {
    sender: { address: friendlyAddr },
    recipient: { address: 'EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb' }, // Binance
    amount: 500000000
  }
};
const nonBridgeDetection = api.detectBridgeOperation(nonBridgeAction);
assert(nonBridgeDetection.isBridge === false, 'Exchange transfer is not flagged as a bridge transfer');

// ----------------------------------------------------------------------
// 6. Explainable Anomaly Detection Heuristics Tests
// ----------------------------------------------------------------------
console.log('\n--- 6. Verification of Explainable Anomaly Detection Heuristics ---');
const mockAccount = {
  address: friendlyAddr,
  raw_address: validResult.raw,
  balance: 1000000000000, // 1,000 TON
  is_wallet: true
};

const nowSec = Math.floor(Date.now() / 1000);
// Generate test events with a surge (12 tx in 24h) and a whale outflow (400 TON = 40% of balance)
const mockEvents = [
  {
    event_id: 'tx_whale_1',
    timestamp: nowSec - 100,
    actions: [{
      type: 'TonTransfer',
      status: 'ok',
      TonTransfer: {
        sender: { address: friendlyAddr },
        recipient: { address: 'EQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCXmC' },
        amount: 400000000000 // 400 TON
      }
    }]
  }
];

// Add 11 more recent events within 24h
for (let i = 1; i <= 11; i++) {
  mockEvents.push({
    event_id: 'tx_surge_' + i,
    timestamp: nowSec - (i * 30), // intervals under 45s to also trigger HFT pattern
    actions: [{
      type: 'TonTransfer',
      status: 'ok',
      TonTransfer: {
        sender: { address: friendlyAddr },
        recipient: { address: 'EQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCXmC' },
        amount: 1000000000
      }
    }]
  });
}
// Add an older event from 10 days ago so timespan is 10 days
mockEvents.push({
  event_id: 'tx_old',
  timestamp: nowSec - (10 * 86400),
  actions: [{ type: 'TonTransfer', status: 'ok', TonTransfer: { amount: 1000000000 } }]
});

const anomalies = api.detectAnomalies(mockAccount, mockEvents, []);
assert(anomalies.length > 0, `Detected ${anomalies.length} observable signals`);

const hasSurge = anomalies.some(a => a.type === 'activity_surge');
assert(hasSurge, 'Successfully flagged activity surge (pico de actividad on-chain)');

const hasWhale = anomalies.some(a => a.type === 'whale_flow');
assert(hasWhale, 'Successfully flagged high-volume whale movement (>30% of balance)');

const hasHft = anomalies.some(a => a.type === 'high_freq');
assert(hasHft, 'Successfully flagged high-frequency automated execution pattern');

anomalies.forEach(a => {
  assert(a.confidence && (a.confidence === 'Alta' || a.confidence === 'Media' || a.confidence === 'Baja'), `Anomaly #${a.id} has valid confidence rating: ${a.confidence}`);
  assert(a.disclaimer.includes('No implica') || a.disclaimer.includes('investigación'), `Anomaly #${a.id} includes non-accusatory investigative framing`);
});

// ----------------------------------------------------------------------
// 7. Server Proxy & Environment Variable Support
// ----------------------------------------------------------------------
console.log('\n--- 7. Verification of Server Proxy & Environment Variable Support ---');
const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert(serverJs.includes('/api/ton/'), 'server.js implements /api/ton/ proxy route');
assert(serverJs.includes('process.env.TONAPI_KEY'), 'server.js securely checks process.env.TONAPI_KEY');
assert(serverJs.includes('https://tonapi.io/v2'), 'server.js proxies upstream to official TonAPI v2');
assert(!html.includes('process.env.TONAPI_KEY'), 'No private environment variables or server keys exposed in client HTML');

// ----------------------------------------------------------------------
// 8. Design System & Theme Consistency
// ----------------------------------------------------------------------
console.log('\n--- 8. Verification of Visual Identity & Theme Consistency ---');
assert(html.includes('design-system.css'), 'Includes ANLGRAM design-system.css');
assert(html.includes('--cyan') || html.includes('#00CFFF'), 'Preserves signature ANLGRAM cyan accents');
assert(html.includes('sidebar-nav') && html.includes('Entity Explorer'), 'Preserves unified ANLGRAM navigation sidebar');

console.log('\n========================================================================');
console.log(`📊 TEST SUITE SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('========================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 All regression tests passed successfully!');
  process.exit(0);
}
