/**
 * Regression & Integration Test Suite for ANLGRAM Flow Visualizer & Explorer
 */
const fs = require('fs');
const assert = require('assert');

console.log('========================================================================');
console.log('🛡️  ANLGRAM FLOW VISUALIZER & EXPLORER INTEGRATION TEST SUITE');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
  }
}

// 1. Verification of DOM Elements in visualizer.html
console.log('--- 1. Verification of Required DOM Elements in visualizer.html ---');
const visualizerHtml = fs.readFileSync('visualizer.html', 'utf8');

const requiredVisualizerIds = [
  '#tab-nav-flow',
  '#tab-nav-clusters',
  '#view-flow',
  '#flow-wallet-input',
  '#flow-wallet-search-btn',
  '#flow-wallet-clear-btn',
  '#flow-date-range-pills',
  '#flow-toggle-in',
  '#flow-toggle-out',
  '#flow-asset-select',
  '#flow-min-amount',
  '#flow-max-conn-select',
  '#flow-btn-expand',
  '#flow-btn-fit',
  '#flow-btn-reset',
  '#flow-btn-refresh',
  '#flow-btn-clear-filters',
  '#flow-active-chips',
  '#flow-canvas-container',
  '#flow-svg',
  '#flow-tooltip',
  '#flow-loading',
  '#flow-empty',
  '#flow-empty-action',
  '#flow-panel-right',
  '#flow-panel-wallet',
  '#flow-panel-edge',
  '#fp-wallet-badge',
  '#fp-btn-close',
  '#fp-wallet-name',
  '#fp-wallet-address',
  '#fp-btn-copy-addr',
  '#fp-ton-balance',
  '#fp-ton-usd',
  '#fp-jetton-count',
  '#fp-in-total',
  '#fp-out-total',
  '#fp-net-total',
  '#fp-first-seen',
  '#fp-last-seen',
  '#fp-provider-info',
  '#fp-btn-recenter',
  '#fp-btn-open-explorer',
  '#fp-link-tonviewer',
  '#flow-timeline-panel',
  '#flow-timeline-count',
  '#flow-timeline-start',
  '#flow-timeline-end',
  '#flow-timeline-histogram',
  '#timeline-svg'
];

requiredVisualizerIds.forEach(id => {
  const cleanId = id.replace('#', '');
  runTest(`DOM ID exists in visualizer.html: ${id}`, () => {
    assert(visualizerHtml.includes(`id="${cleanId}"`), `Missing ID in visualizer.html: ${id}`);
  });
});

// 2. Verification of Flow Visualizer JS Module
console.log('\n--- 2. Verification of Flow Visualizer Engine Logic ---');
const flowEngine = require('./assets/js/wallet-flow-visualizer.js');

// Mock Verified TON Registry on global for testing
global.VERIFIED_TON_REGISTRY = [
  {
    address: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
    raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8',
    name: 'TON Foundation: Treasury',
    category: 'official',
    isVerified: true
  },
  {
    address: 'EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO',
    raw: '0:3690254dc15b2297610cda60744a45f2b710aa4234b89adb630e99d79b01bd4f',
    name: 'STON.fi: Router v1',
    category: 'dex',
    isVerified: true
  }
];

runTest('Entity resolution identifies TON Foundation Treasury', () => {
  const res = flowEngine.resolveEntityInfo('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
  assert.strictEqual(res.name, 'TON Foundation: Treasury');
  assert.strictEqual(res.isVerified, true);
});

runTest('Entity resolution identifies STON.fi Router DEX', () => {
  const res = flowEngine.resolveEntityInfo('EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO');
  assert.strictEqual(res.name, 'STON.fi: Router v1');
  assert.strictEqual(res.category, 'dex');
});

runTest('Entity resolution gracefully handles unknown address', () => {
  const res = flowEngine.resolveEntityInfo('EQD__________________________________________0vo');
  assert.strictEqual(res.name, 'Unknown Wallet');
  assert.strictEqual(res.isVerified, false);
});

runTest('Category colors match Arkham visual palette specification', () => {
  assert.strictEqual(flowEngine.getCategoryColor('center'), '#00CFFF'); // Signature Cyan
  assert.strictEqual(flowEngine.getCategoryColor('cex'), '#8B5CF6');    // Purple
  assert.strictEqual(flowEngine.getCategoryColor('dex'), '#10B981');    // Emerald
  assert.strictEqual(flowEngine.getCategoryColor('bridge'), '#F59E0B'); // Amber
  assert.strictEqual(flowEngine.getCategoryColor('whale'), '#EC4899');  // Pink
  assert.strictEqual(flowEngine.getCategoryColor('unknown'), '#64748B');// Slate
});

runTest('Crypto amounts format cleanly without float drift', () => {
  assert.strictEqual(flowEngine.formatCryptoAmount(1250.5), '1,250.5');
  assert.strictEqual(flowEngine.formatCryptoAmount(0.00005), '< 0.0001');
  assert.strictEqual(flowEngine.formatCryptoAmount(0), '0');
});

runTest('Addresses shorten correctly for compact readability', () => {
  assert.strictEqual(flowEngine.shortenAddr('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N', 4, 4), 'EQCD...qB2N');
});

// 3. Testing Event Parsing Logic
console.log('\n--- 3. Testing Event & Transfer Parsing ---');
const mockEvents = [
  {
    event_id: 'evt_ton_transfer_1',
    timestamp: 1730000000,
    extra: 5000000,
    actions: [
      {
        type: 'TonTransfer',
        status: 'ok',
        base_transactions: ['tx_hash_1'],
        TonTransfer: {
          sender: { address: '0:sender1' },
          recipient: { address: '0:target' },
          amount: 5000000000, // 5 TON
          comment: 'Deposit'
        }
      }
    ]
  },
  {
    event_id: 'evt_jetton_transfer_2',
    timestamp: 1730001000,
    extra: 8000000,
    actions: [
      {
        type: 'JettonTransfer',
        status: 'ok',
        base_transactions: ['tx_hash_2'],
        JettonTransfer: {
          sender: { address: '0:target' },
          recipient: { address: '0:recipient2' },
          amount: '100000000', // 100 USDT (6 dec)
          jetton: { symbol: 'USDT', decimals: 6, address: '0:usdt_master' },
          comment: 'Payment'
        }
      }
    ]
  },
  {
    event_id: 'evt_unrelated_3',
    timestamp: 1730002000,
    actions: [
      {
        type: 'TonTransfer',
        status: 'ok',
        TonTransfer: {
          sender: { address: '0:unrelated_a' },
          recipient: { address: '0:unrelated_b' },
          amount: 1000000000
        }
      }
    ]
  }
];

// Helper mock conversion
global.friendlyToRaw = (addr) => addr;
global.rawToFriendly = (addr) => addr;

const parsed = flowEngine.parseTransfersFromEvents(mockEvents, '0:target');

runTest('Parses exactly the transfers involving the target wallet', () => {
  assert.strictEqual(parsed.length, 2);
});

runTest('Accurately identifies incoming TON transfer', () => {
  const t = parsed.find(x => x.asset === 'TON');
  assert(t, 'TON transfer not found');
  assert.strictEqual(t.isIncoming, true);
  assert.strictEqual(t.isOutgoing, false);
  assert.strictEqual(t.amount, 5);
  assert.strictEqual(t.counterparty, '0:sender1');
  assert.strictEqual(t.txHash, 'tx_hash_1');
});

runTest('Accurately identifies outgoing Jetton transfer with decimals', () => {
  const t = parsed.find(x => x.asset === 'USDT');
  assert(t, 'USDT transfer not found');
  assert.strictEqual(t.isIncoming, false);
  assert.strictEqual(t.isOutgoing, true);
  assert.strictEqual(t.amount, 100);
  assert.strictEqual(t.counterparty, '0:recipient2');
  assert.strictEqual(t.txHash, 'tx_hash_2');
});

// 4. Verification of Bidirectional Integration Between visualizer.html and explorer.html
console.log('\n--- 4. Verification of Bidirectional Explorer <-> Visualizer Links ---');
const explorerHtml = fs.readFileSync('explorer.html', 'utf8');

runTest('explorer.html links to visualizer.html with ?address= parameter', () => {
  assert(explorerHtml.includes('visualizer.html?address='), 'explorer.html must link to visualizer.html?address=');
});

runTest('visualizer.html links back to explorer.html with ?address= parameter', () => {
  assert(visualizerHtml.includes('explorer.html?address='), 'visualizer.html must link to explorer.html?address=');
});

runTest('visualizer.html loads wallet-flow-visualizer.js script', () => {
  assert(visualizerHtml.includes('wallet-flow-visualizer.js'), 'visualizer.html must load wallet-flow-visualizer.js');
});

runTest('visualizer.html supports switching between Flow and Token Cluster views', () => {
  assert(visualizerHtml.includes('switchVisualizerTab'), 'visualizer.html must include switchVisualizerTab function');
});

// Summary
console.log('\n========================================================================');
console.log(`📊 TEST SUITE SUMMARY: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
console.log('========================================================================\n');

if (totalTests === passedTests) {
  console.log('🎉 All Flow Visualizer & Explorer tests passed successfully!\n');
} else {
  process.exit(1);
}
