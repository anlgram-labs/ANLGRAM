/**
 * test-distribution-wizard-flow.js
 * Verification suite for Step 3 Distribution Completion & Step 4 Navigation.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

console.log('========================================================================');
console.log('🧪 ANL LABS STEP 3 DISTRIBUTION & STEP 4 TRANSITION VERIFICATION SUITE');
console.log('========================================================================\n');

const htmlPath = path.join(__dirname, 'memecoin-platform.html');
const jsPath = path.join(__dirname, 'assets', 'js', 'anl-labs.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// --- 1. Step 3 DOM Elements & Actions Structure ---
console.log('--- 1. Step 3 DOM Elements & Actions Structure ---');
assert(html.includes('id="wizard-step3-send-btn"'), 'wizard-step3-send-btn exists in HTML');
assert(html.includes('id="wizard-step3-continue-btn"'), 'wizard-step3-continue-btn exists in HTML');
assert(html.includes('id="wizard-step3-skip-btn"'), 'wizard-step3-skip-btn ("Continue without Distributing") exists in HTML');
assert(html.includes('id="labs-dist-success-banner"'), 'labs-dist-success-banner container exists in HTML');
assert(html.includes('id="labs-dist-error-banner"'), 'labs-dist-error-banner container exists in HTML');
assert(html.includes('id="labs-dist-modal-status-banner"'), 'labs-dist-modal-status-banner exists in distribution modal');
assert(!html.includes('Skip to Vesting →'), '"Skip to Vesting →" replaced with clear sequential actions');

// --- 2. Handlers & Functions Defined ---
console.log('\n--- 2. Handlers & State Functions Defined in JS ---');
assert(js.includes('labsContinueToVesting'), 'labsContinueToVesting navigation handler defined');
assert(js.includes('labsContinueWithoutDistributing'), 'labsContinueWithoutDistributing navigation handler defined');
assert(js.includes('labsSetDistributionUiState'), 'labsSetDistributionUiState state renderer defined');
assert(js.includes('labsOnDistributionComplete'), 'labsOnDistributionComplete coordinator defined');
assert(js.includes('successfulBatches'), 'successfulBatches state tracker defined');

// --- 3. Behavioral Unit Simulation in JSDOM-like environment ---
console.log('\n--- 3. Distribution Lifecycle Behavioral Tests ---');

const domElements = {};
function createMockElement(id) {
  return {
    id,
    style: {},
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    addEventListener: () => {},
    dataset: {}
  };
}

const mockIds = [
  'wizard-step3-send-btn',
  'wizard-step3-continue-btn',
  'wizard-step3-skip-btn',
  'labs-dist-success-banner',
  'labs-dist-error-banner',
  'labs-dist-modal-status-banner',
  'labs-dist-modal-submit',
  'labs-dist-modal-cancel',
  'labs-dist-status-text',
  'labs-dist-modal-tbody',
  'labs-dist-amount',
  'labs-dist-manual-text',
  'user-jetton-select',
  'labs-flow-section'
];

mockIds.forEach(id => {
  domElements[id] = createMockElement(id);
});

// Setup mock global window
const mockWindow = {
  tonConnectUI: {
    connected: true,
    account: { address: 'UQ000000000000000000000000000000000000000000000000' },
    sendTransaction: async () => ({ boc: 'fake-boc' })
  },
  TON_CORE: {
    Address: { parse: (a) => ({ toString: () => a }) },
    beginCell: () => {
      const cell = {
        storeUint: () => cell,
        storeCoins: () => cell,
        storeAddress: () => cell,
        storeBit: () => cell,
        storeRef: () => cell,
        storeStringTail: () => cell,
        endCell: () => cell,
        toBoc: () => ({ toString: () => 'mock-base64' })
      };
      return cell;
    },
    toNano: (val) => BigInt(Math.floor(parseFloat(val) * 1e9))
  },
  document: {
    getElementById: (id) => domElements[id] || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  },
  fetch: async () => ({
    ok: true,
    json: async () => ({
      wallet_address: { address: 'EQJettonWallet11111111111111111111111111111111111' },
      events: []
    })
  }),
  alert: () => {},
  confirm: () => true,
  setTimeout: setTimeout,
  scrollTo: () => {},
  addEventListener: () => {}
};
mockWindow.window = mockWindow;

const context = vm.createContext(mockWindow);
vm.runInContext(js, context);

// Test 3.1: Idle State Initialization
context.labsSetDistributionUiState('idle');
assert(
  domElements['wizard-step3-send-btn'].style.display === 'inline-block' &&
  domElements['wizard-step3-continue-btn'].style.display === 'none' &&
  domElements['wizard-step3-send-btn'].innerHTML === 'Review & Send Distribution',
  'Idle state displays "Review & Send Distribution" and hides Continue button'
);

// Test 3.2: In-Progress State disables concurrent duplicate submissions
context.labsSetDistributionUiState('in_progress');
assert(
  domElements['wizard-step3-send-btn'].disabled === true &&
  domElements['wizard-step3-send-btn'].style.pointerEvents === 'none' &&
  domElements['wizard-step3-send-btn'].innerHTML.includes('Distribution in Progress'),
  'In-progress state disables submit button with "Distribution in Progress..."'
);

// Test 3.3: Failed State offers safe retry and does not advance
context.labsSetDistributionUiState('failed', {
  completedCount: 1,
  totalBatches: 3,
  errorMessage: 'User cancelled signature in wallet'
});
assert(
  domElements['wizard-step3-send-btn'].disabled === false &&
  domElements['wizard-step3-continue-btn'].style.display === 'none' &&
  domElements['labs-dist-error-banner'].style.display === 'block' &&
  domElements['wizard-step3-send-btn'].innerHTML.includes('Retry Remaining Batches (2/3)'),
  'Failed state displays error banner, preserves completed batch count, and offers Resume/Retry'
);

// Test 3.4: Completed State displays success banner and reveals Continue button
context.labsSetDistributionUiState('completed', {
  recipientCount: 8,
  totalAmount: 50000,
  totalBatches: 2
});
assert(
  domElements['wizard-step3-continue-btn'].style.display === 'inline-block' &&
  domElements['wizard-step3-send-btn'].style.display === 'none' &&
  domElements['labs-dist-success-banner'].style.display === 'block' &&
  domElements['labs-dist-success-banner'].innerHTML.includes('Distribution Successfully Verified'),
  'Completed state renders success banner and prominent "Continue to Vesting →" button'
);

// Test 3.5: Manual Continue button strictly navigates without sending transfers
let sendTransactionCalled = false;
context.tonConnectUI.sendTransaction = async () => {
  sendTransactionCalled = true;
  return { boc: 'mock' };
};

let stepNavigated = 0;
context.labsGoToStep = (s) => {
  stepNavigated = s;
};

context.labsContinueToVesting({ preventDefault: () => {} });
assert(
  stepNavigated === 4 && sendTransactionCalled === false,
  'Clicking Continue to Vesting navigates to Step 4 without initiating token transfers'
);

// Test 3.6: Continue without Distributing strictly navigates without sending transfers
stepNavigated = 0;
context.labsContinueWithoutDistributing();
assert(
  stepNavigated === 4 && sendTransactionCalled === false,
  'Clicking Continue without Distributing navigates to Step 4 safely'
);

// --- 4. Vesting Security Notice Safeguards ---
console.log('\n--- 4. Step 4 Vesting Safeguards Preservation ---');
assert(
  html.includes('Smart Contract Security & Development Status'),
  'Step 4 honest security & development status banner preserved'
);
assert(
  html.includes('Mainnet Contract Locked (Pending Security Verification)'),
  'Mainnet contract lock disabled button preserved'
);
assert(
  js.includes('Non-Custodial Vesting Smart Contract — Development Status'),
  'Vesting submission alert explains formal audit status and disables execution'
);

console.log('\n========================================================================');
console.log(`📊 DISTRIBUTION SUITE: ${passedTests} Passed, ${failedTests} Failed`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Step 3 Distribution Completion & Step 4 Transition tests PASSED!\n');
}
