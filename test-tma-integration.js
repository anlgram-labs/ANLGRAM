/**
 * ANLGRAM Telegram Mini App (TMA) Comprehensive Integration Suite
 * File: test-tma-integration.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

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

console.log('========================================================================');
console.log('🛡️  ANLGRAM TELEGRAM MINI APP (TMA) INTEGRATION & COMPATIBILITY SUITE');
console.log('========================================================================\n');

// ── 1. Verification of SDK and TMA Script Inclusion in HTML Files ─────────────
console.log('--- 1. Verification of SDK and TMA Script Inclusion Across All Pages ---');
const primaryHtmlFiles = [
  'index.html',
  'explorer.html',
  'visualizer.html',
  'staking.html',
  'intel-exchange.html',
  'profit-calculator.html',
  'alerts.html',
  'dashboard.html',
  'memecoin-platform.html'
];

primaryHtmlFiles.forEach(fileName => {
  const content = fs.readFileSync(path.resolve(fileName), 'utf8');
  assert(content.includes('telegram-web-app.js'), `${fileName} loads official Telegram WebApp SDK`);
  assert(content.includes('telegram-mini-app.js'), `${fileName} loads ANLGRAM TMA engine`);
  assert(content.includes('https://telegram.org'), `${fileName} CSP permits https://telegram.org`);
});

// ── 2. Verification of Universal Wallet Buttons & Scripts ────────────────────
console.log('\n--- 2. Universal Wallet Connection Compatibility ---');
primaryHtmlFiles.forEach(fileName => {
  const content = fs.readFileSync(path.resolve(fileName), 'utf8');
  assert(
    content.includes('topbarWalletBtn') || content.includes('connect-wallet-btn'),
    `${fileName} provides accessible Connect Wallet button`
  );
});

const visualizerHtml = fs.readFileSync(path.resolve('visualizer.html'), 'utf8');
assert(visualizerHtml.includes('tonconnect-ui.min.js'), 'visualizer.html loads TonConnect UI SDK');
assert(visualizerHtml.includes('wallet-connect.js'), 'visualizer.html loads wallet-connect.js');

// ── 3. Verification of CNAME and Production Domain Manifest ──────────────────
console.log('\n--- 3. Production Domain & Manifest Verification ---');
assert(fs.existsSync(path.resolve('CNAME')), 'CNAME file exists at repository root');
const cnameContent = fs.readFileSync(path.resolve('CNAME'), 'utf8').trim();
assert(cnameContent === 'anlgram.com', 'CNAME is configured for anlgram.com', cnameContent);

const tcManifest = JSON.parse(fs.readFileSync(path.resolve('tonconnect-manifest.json'), 'utf8'));
assert(tcManifest.url === 'https://anlgram.com/', 'tonconnect-manifest.json url matches production root', tcManifest.url);
assert(tcManifest.iconUrl.startsWith('https://anlgram.com/'), 'tonconnect-manifest.json iconUrl matches production root', tcManifest.iconUrl);

const webManifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
assert(webManifest.name === 'ANLGRAM On-Chain Intelligence', 'Web App manifest name verified', webManifest.name);
assert(webManifest.start_url === './index.html' || webManifest.start_url === './', 'Web App manifest start_url verified', webManifest.start_url);

// ── 4. Verification of TMA Engine Logic and Lifecycle Methods ────────────────
console.log('\n--- 4. Verification of TMA Lifecycle & Navigation Engine ---');
const tmaEngine = require('./assets/js/telegram-mini-app.js');

assert(typeof tmaEngine.initTelegramMiniApp === 'function', 'initTelegramMiniApp function exported');
assert(typeof tmaEngine.isTelegramEnvironment === 'function', 'isTelegramEnvironment function exported');
assert(typeof tmaEngine.getTelegramUser === 'function', 'getTelegramUser function exported');
assert(typeof tmaEngine.triggerHaptic === 'function', 'triggerHaptic function exported');
assert(Array.isArray(tmaEngine.TMA_NAV_CONFIG), 'TMA_NAV_CONFIG navigation array exported');
assert(tmaEngine.TMA_NAV_CONFIG.length === 5, 'TMA_NAV_CONFIG provides 5 core modules (Home, Explorer, Flow, Staking, Intel)');

// Verify that regex matches work accurately
const navConfig = tmaEngine.TMA_NAV_CONFIG;
assert(navConfig.find(it => it.id === 'nav-home').matchRegex.test('index.html'), 'nav-home matches index.html');
assert(navConfig.find(it => it.id === 'nav-explorer').matchRegex.test('explorer.html'), 'nav-explorer matches explorer.html');
assert(navConfig.find(it => it.id === 'nav-flow').matchRegex.test('visualizer.html'), 'nav-flow matches visualizer.html');
assert(navConfig.find(it => it.id === 'nav-staking').matchRegex.test('staking.html'), 'nav-staking matches staking.html');
assert(navConfig.find(it => it.id === 'nav-intel').matchRegex.test('intel-exchange.html'), 'nav-intel matches intel-exchange.html');

// ── 5. Verification of server.js Iframe & Frame-Ancestors Security ────────────
console.log('\n--- 5. Verification of server.js Frame Headers for Telegram Web ---');
const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');
assert(!serverJs.includes("'X-Frame-Options': 'SAMEORIGIN'"), 'server.js does NOT block Telegram Web with X-Frame-Options: SAMEORIGIN');
assert(serverJs.includes("frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org;"), 'server.js allows framing from Telegram clients in CSP');

// ── 6. Verification of Index Navigation and Ecosystem Hub ─────────────────────
console.log('\n--- 6. Verification of index.html Navigation and Ecosystem Launcher ---');
const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
assert(indexHtml.includes('explorer.html'), 'index.html links directly to explorer.html');
assert(indexHtml.includes('visualizer.html'), 'index.html links directly to visualizer.html');
assert(indexHtml.includes('staking.html'), 'index.html links directly to staking.html');
assert(indexHtml.includes('intel-exchange.html'), 'index.html links directly to intel-exchange.html');
assert(indexHtml.includes('profit-calculator.html'), 'index.html links directly to profit-calculator.html');
assert(indexHtml.includes('id="ecosystem"'), 'index.html includes ecosystem launcher hub');
assert(indexHtml.includes('tma-user-greeting'), 'index.html includes TMA user greeting slot');

console.log('\n========================================================================');
console.log(`📊 TMA TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Telegram Mini App integration tests passed successfully!\n');
}
