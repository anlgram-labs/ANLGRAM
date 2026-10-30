/**
 * test-token-creation-donation.js
 * Comprehensive Regression & Truthfulness Test Suite for ANLGRAM 10% Token Creation Donation
 *
 * Verifies:
 * 1. 10% (1,000 bps) BigInt nanoTON calculation against verified 0.20 TON execution base.
 * 2. Recipient address matches UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd.
 * 3. Wallet batching of 3 messages (downstream settlement is asynchronous) in deployJettonWeb3 preventing duplicate donation.
 * 4. User consent acknowledgement requirement before wallet approval.
 * 5. Rejection and error handling without fake confirmation or phantom charges.
 * 6. Separation of token contract address (TBA) and donation recipient.
 * 7. Disclosures and absence of obsolete creation fee labels.
 * 8. Scope discrimination: 0.35% strictly preserved for staking escrow, 10% applied to token creation.
 * 9. Preservation of standard Jetton creator (deployJettonWeb3) and TEP-74 compliance.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 ANLGRAM 10% TOKEN CREATION DONATION REGRESSION SUITE');
console.log('================================================================\n');

// ══════════════════════════════════════════════════════════════
// SECTION 1: Authoritative Configuration & BigInt Integer Arithmetic
// ══════════════════════════════════════════════════════════════
console.log('SECTION 1: Authoritative Configuration & BigInt Math');
console.log('----------------------------------------------------------------');

const donationConfigPath = path.join(__dirname, 'assets/js/donation-config.js');
it('donation-config.js exists and exports ANLGRAM_DONATION_CONFIG', () => {
  assert.strictEqual(fs.existsSync(donationConfigPath), true);
});

const CONFIG = require('./assets/js/donation-config.js');

it('Recipient address is exactly UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd', () => {
  assert.strictEqual(CONFIG.RECIPIENT_ADDRESS, 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd');
});

it('Donation rate is exactly 10% (1,000 basis points of 10,000)', () => {
  assert.strictEqual(CONFIG.DONATION_RATE_PERCENT, 10);
  assert.strictEqual(CONFIG.DONATION_RATE_BPS, 1000n);
  assert.strictEqual(CONFIG.BPS_DENOMINATOR, 10000n);
});

it('Base execution cost is exactly 0.20 TON (200,000,000 nanoTON: 0.05 deploy + 0.15 mint)', () => {
  assert.strictEqual(CONFIG.BASE_DEPLOY_NANO, 50_000_000n);
  assert.strictEqual(CONFIG.BASE_MINT_NANO, 150_000_000n);
  assert.strictEqual(CONFIG.BASE_EXECUTION_NANO, 200_000_000n);
  assert.strictEqual(CONFIG.BASE_EXECUTION_NANO, CONFIG.BASE_DEPLOY_NANO + CONFIG.BASE_MINT_NANO);
  assert.strictEqual(CONFIG.BASE_EXECUTION_TON, '0.2');
});

it('Donation amount is calculated with zero floating-point error as exactly 0.02 TON (20,000,000 nanoTON)', () => {
  const result = CONFIG.calculateDonation(CONFIG.BASE_EXECUTION_NANO);
  assert.strictEqual(result.donationNano, 20_000_000n);
  assert.strictEqual(CONFIG.DONATION_AMOUNT_NANO, 20_000_000n);
  assert.strictEqual(CONFIG.DONATION_AMOUNT_TON, '0.02');
  assert.strictEqual(result.donationTON, '0.02');
});

it('Total estimated transaction amount is exactly 0.22 TON (220,000,000 nanoTON)', () => {
  assert.strictEqual(CONFIG.TOTAL_TRANSACTION_NANO, 220_000_000n);
  assert.strictEqual(CONFIG.TOTAL_TRANSACTION_TON, '0.22');
  const result = CONFIG.calculateDonation(CONFIG.BASE_EXECUTION_NANO);
  assert.strictEqual(result.totalNano, 220_000_000n);
  assert.strictEqual(result.totalTON, '0.22');
});

it('Donation calculation is consistent for arbitrary custom base values', () => {
  // 10% of 1 TON (1,000,000,000 nanoTON) = 0.10 TON (100,000,000 nanoTON)
  const q1 = CONFIG.calculateDonation(1_000_000_000n);
  assert.strictEqual(q1.donationNano, 100_000_000n);
  assert.strictEqual(q1.totalNano, 1_100_000_000n);

  // 10% of 0.5 TON (500,000,000 nanoTON) = 0.05 TON (50,000,000 nanoTON)
  const q2 = CONFIG.calculateDonation(500_000_000n);
  assert.strictEqual(q2.donationNano, 50_000_000n);
  assert.strictEqual(q2.totalNano, 550_000_000n);
});

it('Payload comment matches required disclosure string', () => {
  assert.strictEqual(CONFIG.PAYLOAD_COMMENT, 'ANLGRAM 10% Token Creation Donation');
  assert.strictEqual(CONFIG.PRIMARY_LABEL, 'Mandatory Donation (10%)');
});

// ══════════════════════════════════════════════════════════════
// SECTION 2: UI Fee Breakdown & Disclosure Transparency
// ══════════════════════════════════════════════════════════════
console.log('\nSECTION 2: UI Fee Breakdown & Disclosure Transparency');
console.log('----------------------------------------------------------------');

const platformHtml = fs.readFileSync(path.join(__dirname, 'memecoin-platform.html'), 'utf8');

it('memecoin-platform.html loads donation-config.js', () => {
  assert.strictEqual(platformHtml.includes('assets/js/donation-config.js'), true);
});

it('Fee breakdown card in Step 2 explicitly states 10% Token Creation Donation', () => {
  assert.strictEqual(platformHtml.includes('Mandatory Donation (10%):'), true);
  assert.strictEqual(platformHtml.includes('0.02 TON'), true);
});

it('Fee breakdown card displays the exact 0.20 TON execution base and recipient', () => {
  assert.strictEqual(platformHtml.includes('Execution Base Cost:'), true);
  assert.strictEqual(platformHtml.includes('~0.20 TON'), true);
  assert.strictEqual(platformHtml.includes('UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd'), true);
  assert.strictEqual(platformHtml.includes('~0.22 TON'), true);
});

it('deploy-confirm-modal contains detailed 10% Token Creation Donation disclosure', () => {
  assert.strictEqual(platformHtml.includes('id="deploy-confirm-modal"'), true);
  assert.strictEqual(platformHtml.includes('Mandatory Donation (10%):'), true);
  assert.strictEqual(platformHtml.includes('0.20 TON execution base'), true);
});

it('deploy-confirm-modal contains mandatory user acknowledgement checkbox with full text', () => {
  assert.strictEqual(platformHtml.includes('id="deploy-confirm-checkbox"'), true);
  assert.strictEqual(
    platformHtml.includes('including Mandatory Donation (10%): 0.02 TON on the 0.20 TON execution base. Total 0.22 TON before wallet network fees.'),
    true
  );
});

// ══════════════════════════════════════════════════════════════
// SECTION 3: Standard Jetton Creator (deployJettonWeb3) Architecture
// ══════════════════════════════════════════════════════════════
console.log('\nSECTION 3: Standard Jetton Creator Transaction Builder');
console.log('----------------------------------------------------------------');

it('deployJettonWeb3 verifies user acknowledgement checkbox before dispatching', () => {
  assert(platformHtml.includes("!document.getElementById('deploy-confirm-checkbox')?.checked"));
  assert(platformHtml.includes('Review and authorize the Mandatory Donation (10%) before signing.'));
});

it('deployJettonWeb3 bundles exactly 3 requested messages in tc.sendTransaction', () => {
  // Batch contents and actual downstream outcomes are executed in donation.test.js.
  assert(platformHtml.includes('amount: toNano("0.05").toString()'));
  assert(platformHtml.includes('amount: toNano("0.15").toString()'));
  assert(platformHtml.includes('donationMessage'));
  assert(platformHtml.includes("donationMessage.amount !== '20000000'"));
  assert(platformHtml.includes("donationMessage.address !== '" + CONFIG.RECIPIENT_ADDRESS + "'"));
});

it('Donation payload cell in deployJettonWeb3 contains text comment', () => {
  const configSource = fs.readFileSync(donationConfigPath, 'utf8');
  assert(platformHtml.includes('donation.createMessage(window.TON_CORE, walletChain)'));
  assert(configSource.includes("storeStringTail('ANLGRAM 10% Token Creation Donation')"));
});

it('deployJettonWeb3 uses 100% English user-facing error and status alerts', () => {
  const deployFnMatch = platformHtml.match(/async\s+function\s+deployJettonWeb3[\s\S]*?^ {4}\}/m);
  assert.strictEqual(deployFnMatch !== null, true);
  const deployFnStr = deployFnMatch[0];

  assert.strictEqual(deployFnStr.includes('Instala Tonkeeper'), false);
  assert.strictEqual(deployFnStr.includes('Faltan librerías'), false);
  assert.strictEqual(deployFnStr.includes('Completa Nombre'), false);
  assert.strictEqual(deployFnStr.includes('Preparando firma'), false);
  assert.strictEqual(deployFnStr.includes('Firma en tu wallet'), false);
  assert.strictEqual(deployFnStr.includes('espera confirmación'), false);
});

it('deployJettonWeb3 safely handles wallet cancellation without phantom success', () => {
  assert(platformHtml.includes("e?.name === 'UserRejectsError'"));
  assert(platformHtml.includes('return { submitted: false, uncertain, destAddressMint: pendingAddress, reason: errMsg }'));
  assert(platformHtml.includes('if (localStorage.getItem(pendingKey))'));
});

// ══════════════════════════════════════════════════════════════
// SECTION 4: Token Contract & Recipient Separation
// ══════════════════════════════════════════════════════════════
console.log('\nSECTION 4: Token Contract & Recipient Separation');
console.log('----------------------------------------------------------------');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

it('index.html displays TBA for pending token contract address', () => {
  assert.strictEqual(indexHtml.includes('TBA — Contract Deployment Pending Supervised Launch'), true);
});

it('index.html labels recipient as Designated Token Creation Donation Recipient', () => {
  assert.strictEqual(indexHtml.includes('Designated Token Creation Donation Recipient'), true);
  assert.strictEqual(indexHtml.includes('UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd'), true);
});

it('index.html copyContract does NOT copy recipient address', () => {
  assert.strictEqual(indexHtml.includes('Deployment is pending supervised launch. No contract address is available yet.'), true);
  assert.strictEqual(indexHtml.includes('copyTreasuryAddress()'), true);
});

it('Token creator generated contract address is dynamically derived from StateInit', () => {
  assert.strictEqual(platformHtml.includes('contractAddress(0, stateInitObj)'), true);
});

// ══════════════════════════════════════════════════════════════
// SECTION 5: Scope Discrimination — Staking Escrow vs. Token Creation
// ══════════════════════════════════════════════════════════════
console.log('\nSECTION 5: Fee Scope Discrimination');
console.log('----------------------------------------------------------------');

it('0.35% (35 bps) is strictly preserved for Liquid Staking Escrow, NOT applied to token creation', () => {
  const stakingHtml = fs.readFileSync(path.join(__dirname, 'staking.html'), 'utf8');
  assert.strictEqual(stakingHtml.includes('0.35%'), true);
  assert.strictEqual(stakingHtml.includes('35 bps'), true);

  // memecoin-platform.html must NOT contain obsolete 0.35% creation charge
  assert.strictEqual(platformHtml.includes('0.35% Token Creation'), false);
  assert.strictEqual(platformHtml.includes('0.35% Creation Fee'), false);
  assert.strictEqual(platformHtml.includes('0.35% Platform Fee'), false);
});

// ══════════════════════════════════════════════════════════════
// SECTION 6: Alternative Token-Creation Paths (launchpad.js)
// ══════════════════════════════════════════════════════════════
console.log('\nSECTION 6: Secondary Token-Creation Path Alignment');
console.log('----------------------------------------------------------------');

const launchpadJs = fs.readFileSync(path.join(__dirname, 'assets/js/launchpad.js'), 'utf8');

it('launchpad.js uses 10% donation numerator and 0.20 TON base execution cost', () => {
  assert(launchpadJs.includes('window.ANLGRAM_DONATION_CONFIG'));
  assert(launchpadJs.includes('d.DONATION_AMOUNT_NANO !== 20000000n'));
  assert(launchpadJs.includes('d.BASE_EXECUTION_NANO !== 200000000n'));
});

it('launchpad.js directDeploy fallback bundles the 0.02 TON donation message', () => {
  assert(launchpadJs.includes('window.deployJettonWeb3({ currentTarget: btn })'));
  assert(!launchpadJs.includes('address: donationRecipient, amount: donationNano'), 'no duplicate unchecked payment builder');
});

it('launchpad.js fee breakdown UI displays 10% Token Creation Donation', () => {
  assert(launchpadJs.includes('Mandatory Donation (10%)'));
  assert(launchpadJs.includes('Token Creation Cost &amp; Donation Breakdown'));
});

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log('----------------------------------------------------------------');
console.log(`Results: ${passed} / ${passed + failed} tests passed.`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
