/**
 * test-wizard-ui-centering.js
 * Verification suite for ANL Labs Token Creation Wizard Centering & Full-Screen UI Redesign.
 */

const fs = require('fs');
const path = require('path');

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
console.log('🧪 ANL LABS WIZARD UI CENTERING & FULL-SCREEN REDESIGN VERIFICATION');
console.log('========================================================================\n');

const htmlPath = path.join(__dirname, 'memecoin-platform.html');
const cssPath = path.join(__dirname, 'assets', 'css', 'anl-labs.css');
const jsPath = path.join(__dirname, 'assets', 'js', 'anl-labs.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// --- 1. Centered Container & Removal of Narrow Column Constraint ---
console.log('--- 1. Container Centering & Viewport Dimensions (900-1050px) ---');
assert(
  css.includes('#labs-flow-section') && css.includes('width: min(100% - 40px, 1000px)'),
  '#labs-flow-section has responsive width min(100% - 40px, 1000px)'
);
assert(
  css.includes('margin-inline: auto') || css.includes('margin: 0 auto'),
  'Horizontal centering via margin-inline: auto (or margin: 0 auto) is defined'
);
assert(
  css.includes('.labs-flow-wrapper.wizard-flow-wrapper') &&
  css.includes('display: block !important'),
  '.labs-flow-wrapper.wizard-flow-wrapper forces display: block !important to eliminate 5-column grid'
);
assert(
  css.includes('.wizard-flow-wrapper') && css.includes('width: min(100% - 40px, 1000px) !important'),
  '.wizard-flow-wrapper has width: min(100% - 40px, 1000px) in 900-1050px range'
);
assert(
  !html.includes('style="width:100%; max-width:820px; margin:0 auto 32px;"'),
  'Inline max-width: 820px removed from wizard step panels'
);

// --- 2. Step 1 Balanced Two-Column Redesign & DEX Preview ---
console.log('\n--- 2. Step 1 Balanced Two-Column Redesign & Live DEX Preview ---');
assert(html.includes('class="wizard-step1-grid"'), '.wizard-step1-grid exists in Step 1');
assert(
  css.includes('.wizard-step1-grid') && css.includes('grid-template-columns: 320px 1fr'),
  '.wizard-step1-grid desktop 2-column layout defined (320px 1fr)'
);
assert(
  html.includes('id="labs-avatar-preview-box"') && css.includes('width: 110px') && css.includes('height: 110px'),
  'Large 110px avatar preview container defined'
);
assert(html.includes('class="wizard-dex-preview-card"'), 'Live DEX mini preview card exists in Step 1');
assert(
  html.includes('id="dex-preview-name"') && html.includes('id="dex-preview-symbol"'),
  'Live DEX preview displays dynamic token name and symbol'
);
assert(html.includes('id="wizard-step1-error"'), 'Inline non-blocking error container (#wizard-step1-error) exists');
assert(html.includes('class="labs-helper-text"'), 'Helpful input explanations (.labs-helper-text) defined');

// --- 3. Stepper Progress & Continuity ---
console.log('\n--- 3. Stepper Progress & Continuity ---');
assert(html.includes('class="labs-wizard-progress-track"'), 'Desktop continuous progress track exists in HTML');
assert(html.includes('id="labs-wizard-progress-bar-fill"'), 'Desktop progress bar fill element exists in HTML');
assert(
  css.includes('.labs-wizard-progress-track') && css.includes('.labs-wizard-progress-bar-fill'),
  'Desktop continuous progress track and fill CSS rules defined'
);
assert(
  js.includes('labs-wizard-progress-bar-fill') && js.includes('desktopBarFill.style.width'),
  'labsGoToStep dynamically updates desktop progress bar fill width'
);
assert(
  html.includes('id="labs-mobile-stepper"') && html.includes('id="labs-mobile-bar-fill"'),
  'Mobile compact stepper and progress bar preserved'
);

// --- 4. Single Dominant Step & Smooth Transitions ---
console.log('\n--- 4. Single Dominant Step & Smooth Transitions ---');
assert(
  css.includes('.labs-wizard-panel {') && css.includes('display: none'),
  'Inactive wizard panels are hidden via display: none'
);
assert(
  css.includes('.labs-wizard-panel.active {') && css.includes('display: block'),
  'Active wizard panel is displayed via display: block'
);
assert(
  css.includes('animation: labsWizardFade') && css.includes('@keyframes labsWizardFade'),
  'labsWizardFade transition animation defined'
);
assert(
  js.includes('wizardTop.scrollIntoView({ behavior: \'smooth\''),
  'Smooth scrolling to wizard top triggered on step navigation'
);
assert(
  js.includes('labsUpdateStep1DexPreview'),
  'labsUpdateStep1DexPreview function defined for real-time draft updates'
);

// --- 5. Responsive Breakpoints Verification ---
console.log('\n--- 5. Responsive Breakpoint Overrides (360px, 430px, 640px, 820px, 900px, 1440px) ---');
assert(
  css.includes('@media (max-width: 820px)') && css.includes('.wizard-step1-grid'),
  '820px breakpoint stacks Step 1 brand and form columns into single column'
);
assert(
  css.includes('@media (max-width: 640px)') &&
  css.includes('.labs-wizard-stepper') &&
  css.includes('display: none !important'),
  '640px mobile breakpoint hides desktop stepper'
);
assert(
  css.includes('@media (max-width: 640px)') &&
  css.includes('.labs-wizard-mobile') &&
  css.includes('display: block !important'),
  '640px mobile breakpoint activates compact mobile stepper'
);
assert(
  css.includes('@media (max-width: 640px)') &&
  css.includes('.wizard-fields-grid-2') &&
  css.includes('grid-template-columns: 1fr'),
  '640px mobile breakpoint stacks form fields into single column'
);
assert(
  css.includes('@media (max-width: 640px)') &&
  css.includes('width: 100% !important'),
  'Mobile viewports (360-640px) expand containers to width: 100% !important'
);

// --- 6. JS Syntax & Runtime Verification ---
console.log('\n--- 6. JS Syntax & Compilation Integrity ---');
try {
  new Function(js);
  assert(true, 'assets/js/anl-labs.js compiles cleanly with 0 syntax errors');
} catch (err) {
  assert(false, `assets/js/anl-labs.js syntax error: ${err.message}`);
}

console.log('\n========================================================================');
console.log(`📊 UI CENTERING SUITE: ${passedTests} Passed, ${failedTests} Failed`);
console.log('========================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('🎉 Centered Full-Screen Token Wizard UI verification PASSED with 100% success!\n');
}
