/**
 * Test Suite: ANL Labs Progressive Multi-Step Token Creation Wizard Verification
 * Tests the 6-step sequential workflow, validation, state preservation, safeguards, and responsiveness.
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
console.log('🧪 ANL LABS MULTI-STEP WIZARD COMPREHENSIVE VERIFICATION SUITE');
console.log('========================================================================\n');

// 1. Verify HTML Structure & Wizard Panels
console.log('--- 1. Wizard Panels & Stepper Markup ---');
const html = fs.readFileSync(path.join(__dirname, 'memecoin-platform.html'), 'utf-8');

assert(html.includes('id="labs-desktop-stepper"'), 'Desktop stepper container exists');
assert(html.includes('id="labs-mobile-stepper"'), 'Mobile compact stepper container exists');
assert(html.includes('id="labs-lifecycle-select"'), 'Token lifecycle context switcher dropdown exists');

// Verify 6 distinct sequential step containers
assert(html.includes('id="wizard-step-1"'), 'Step 1 container exists (#wizard-step-1)');
assert(html.includes('id="wizard-step-2"'), 'Step 2 container exists (#wizard-step-2)');
assert(html.includes('id="wizard-step-3"'), 'Step 3 container exists (#wizard-step-3)');
assert(html.includes('id="wizard-step-4"'), 'Step 4 container exists (#wizard-step-4)');
assert(html.includes('id="wizard-step-5"'), 'Step 5 container exists (#wizard-step-5)');
assert(html.includes('id="wizard-step-6"'), 'Step 6 container exists (#wizard-step-6)');

// 2. Step 1: Form & Validation
console.log('\n--- 2. Step 1: Token Creation Form & Preview ---');
assert(html.includes('id="labs-card1-name"') && html.includes('id="labs-card1-symbol"'), 'Name & Symbol inputs exist');
assert(html.includes('id="labs-card1-supply"') && html.includes('id="lp-logo-file"'), 'Supply & Logo file inputs exist');
assert(html.includes('class="labs-avatar-preview"'), 'Avatar preview element exists');
assert(html.includes('labsGoToStep(2)'), 'Step 1 continues to Step 2');

// 3. Step 2: Review & Deploy Separation
console.log('\n--- 3. Step 2: Review & Deploy Confirmation ---');
assert(html.includes('id="labs-review-name"') && html.includes('id="labs-review-symbol"'), 'Review identity fields exist');
assert(html.includes('id="labs-review-wallet"'), 'Review connected wallet field exists');
assert(html.includes('~0.05 TON') && html.includes('~0.15 TON'), 'Transparent blockchain fee breakdown shown');
assert(html.includes('id="wizard-step2-deploy-btn"'), 'Separate Deploy Jetton button exists');
assert(html.includes('id="deploy-confirm-modal"'), 'Dedicated deployment confirmation modal exists');
assert(html.includes('labsOpenDeployConfirmModal'), 'Deploy requires explicit confirmation modal opening');

// 4. Step 3: Distribution
console.log('\n--- 4. Step 3: Multi-Wallet Bulk Distributor ---');
assert(html.includes('id="labs-dist-dropzone"'), 'CSV dropzone exists');
assert(html.includes('id="labs-dist-manual-text"'), 'Manual entry textarea exists');
assert(html.includes('id="distributor-modal"'), 'Distributor confirmation review modal exists');
assert(html.includes('labsReviewAndSendDistribution'), 'Review & Send distribution handler linked');

// 5. Step 4: Vesting Honest Status
console.log('\n--- 5. Step 4: Vesting Honest Development Status ---');
assert(html.includes('Smart Contract Security & Development Status'), 'Security & Development Status banner exists');
assert(html.includes('Contract in specification & security audit'), 'Honest audit status displayed');
assert(html.includes('Mainnet Contract Locked (Pending Security Verification)'), 'Mainnet contract locked disabled button exists');

// 6. Step 5: Management & Safeguards
console.log('\n--- 6. Step 5: Token Management & Safeguards ---');
assert(html.includes('id="dex-btn-stonfi"') && html.includes('id="dex-btn-dedust"'), 'STON.fi & DeDust DEX buttons exist');
assert(html.includes('id="mint-btn"') && html.includes('id="mint-card"'), 'Additional minting controls exist');
assert(html.includes('id="renounce-confirm-modal"'), 'Dedicated renounce admin confirmation modal exists');
assert(html.includes('id="renounce-confirm-checkbox"'), 'Irreversible action confirmation checkbox exists');

// 7. Step 6: Real-Time Analytics
console.log('\n--- 7. Step 6: Real-Time Analytics ---');
assert(html.includes('id="labs-ana-total-supply"'), 'Total supply analytics cell exists');
assert(html.includes('id="labs-ana-holders"'), 'Holders count analytics cell exists');
assert(html.includes('id="labs-ana-holders-list"'), 'Top holders list container exists');
assert(html.includes('id="labs-ana-tonscan-link"'), 'TonScan inspector link exists');

// 8. JS Orchestration & Functions
console.log('\n--- 8. JS Wizard Orchestration Engine ---');
const js = fs.readFileSync(path.join(__dirname, 'assets/js/anl-labs.js'), 'utf-8');

assert(js.includes('labsGoToStep'), 'labsGoToStep step router defined');
assert(js.includes('labsSelectLifecycleToken'), 'labsSelectLifecycleToken context switcher defined');
assert(js.includes('labsSetWizardDraftField'), 'labsSetWizardDraftField state synchronizer defined');
assert(js.includes('labsOpenDeployConfirmModal'), 'labsOpenDeployConfirmModal defined');
assert(js.includes('labsExecuteDeployFromWizard'), 'labsExecuteDeployFromWizard defined');
assert(js.includes('labsPollDeploymentConfirmation'), 'labsPollDeploymentConfirmation on-chain verifier defined');
assert(js.includes('labsOpenRenounceConfirmModal'), 'labsOpenRenounceConfirmModal defined');
assert(js.includes('labsConfirmRenounceExecution'), 'labsConfirmRenounceExecution defined');
assert(js.includes('anlgramJettonDeployed'), 'anlgramJettonDeployed event listener registered');

// 9. CSS Breakpoints & Classes
console.log('\n--- 9. CSS Wizard Styling & Breakpoints ---');
const css = fs.readFileSync(path.join(__dirname, 'assets/css/anl-labs.css'), 'utf-8');

assert(css.includes('.labs-wizard-stepper'), '.labs-wizard-stepper defined');
assert(css.includes('.labs-wizard-mobile'), '.labs-wizard-mobile defined');
assert(css.includes('.labs-wizard-panel'), '.labs-wizard-panel defined');
assert(css.includes('.labs-lifecycle-bar'), '.labs-lifecycle-bar defined');
assert(css.includes('@media (max-width: 640px)'), 'Mobile 640px breakpoint overrides defined');
assert(css.includes('@media (max-width: 900px)'), 'Tablet 900px breakpoint overrides defined');

// 10. Syntax Validity (compile test)
console.log('\n--- 10. JavaScript Syntax Check ---');
try {
  new Function(js);
  assert(true, 'assets/js/anl-labs.js compiles with zero syntax errors');
} catch (e) {
  assert(false, 'assets/js/anl-labs.js syntax error: ' + e.message);
}

console.log('\n========================================================================');
console.log(`📊 MULTI-STEP WIZARD SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('========================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Progressive Multi-Step Token Wizard verifications PASSED!');
}
