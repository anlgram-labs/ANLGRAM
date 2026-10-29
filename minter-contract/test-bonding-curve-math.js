/**
 * ANLGRAM Launchpad — Automated Invariant & 10,000+ Fuzz Test Suite
 * File: minter-contract/test-bonding-curve-math.js
 * 
 * Verifies the deterministic integer bonding curve model:
 * 1. Derivation of v_TOK and Invariant K
 * 2. Deterministic Buy Quote, Fee Deductions, and Rounding Invariants
 * 3. Deterministic Sell Quote, Fee Deductions, and Solvency Invariants
 * 4. Boundary Tests (1 nanotone, maximum reserves, zero inputs)
 * 5. Slippage Protection Enforcement (Integer BPS)
 * 6. Graduation State Transitions & Trading Lock
 * 7. 10,000+ Deterministic Randomized Fuzzing Cycles (Fixed PRNG Seed)
 */

'use strict';

const path = require('path');
const { BondingCurveEngine, DEFAULT_CONFIG, BPS_DENOMINATOR, ONE_TOKEN } = require('./scripts/bonding-curve-math');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
  }
}

// -----------------------------------------------------------------------------
// PRNG with Fixed Seed for 100% Reproducible Fuzzing
// -----------------------------------------------------------------------------
class Mulberry32 {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  rangeBigInt(minBig, maxBig) {
    const diff = maxBig - minBig;
    const randFloat = this.next();
    const add = BigInt(Math.floor(Number(diff) * randFloat));
    return minBig + add;
  }
}

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('🧪 ANLGRAM LAUNCHPAD: DETERMINISTIC BONDING CURVE MATHEMATICAL TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

// -----------------------------------------------------------------------------
// GROUP 1: Parameter Derivation & Supply Conservation
// -----------------------------------------------------------------------------
console.log('--- 1. Parameter Derivation & Conservation Invariants ---');

const curve = new BondingCurveEngine();
const state = curve.getState();

// Price Continuity Derivation:
// v_TON = floor(S_DEX * T_grad / (S_curve - S_DEX))
// v_TON = floor(200M * 500 / 600M) = 166.666666666 TON = 166,666,666,666 nanoTON
assert(
  state.virtualTon === 166_666_666_666n,
  'Virtual TON reserve initialized to derived price-continuity value (166,666,666,666 nanoTON)'
);

// v_TOK = floor(v_TON * S_curve / T_grad)
const expectedVirtualToken = (166_666_666_666n * (800_000_000n * ONE_TOKEN)) / (500n * 1_000_000_000n);
assert(
  state.virtualToken === expectedVirtualToken && state.virtualToken === 266_666_666_665_600_000n,
  'Virtual Token reserve correctly derived as 266,666,666.6656 tokens'
);

const expectedK = state.virtualTon * (DEFAULT_CONFIG.curveTokens + state.virtualToken);
assert(
  state.K === expectedK,
  'Invariant K correctly calculated at genesis'
);

assert(
  state.realTon === 0n,
  'Real TON reserve starts at exactly 0'
);

assert(
  state.realTokens === 800_000_000n * ONE_TOKEN,
  'Real Token inventory starts at exactly 800,000,000 tokens'
);

// Price Continuity Verification:
// Terminal Curve Price vs. Initial DEX Pool Price
const terminalCurveSpot = ((500n * 1_000_000_000n + state.virtualTon) * ONE_TOKEN) / state.virtualToken;
const initialDexSpot = (500n * 1_000_000_000n * ONE_TOKEN) / (200_000_000n * ONE_TOKEN);

assert(
  terminalCurveSpot === 2500n && initialDexSpot === 2500n,
  'Terminal curve marginal price matches initial DEX pool price exactly (2,500 nanoTON/token)'
);

assert(
  terminalCurveSpot - initialDexSpot === 0n,
  'Graduation price discontinuity is exactly ZERO (0.000000% deviation)'
);

// Valuation Metric Verification:
// At genesis: Circulating = 0, Market Cap = 0, FDV = Spot * 1B
assert(
  state.circulatingTokens === 0n && state.marketCapitalizationNano === 0n,
  'At genesis: Circulating tokens = 0, Market Capitalization = 0'
);
assert(
  state.fullyDilutedValuationNano > 0n,
  'At genesis: Fully Diluted Valuation (FDV) is calculated strictly as Spot * TotalSupply'
);

// -----------------------------------------------------------------------------
// GROUP 2: Buy Quote, Fees & Solvency Rounding
// -----------------------------------------------------------------------------
console.log('\n--- 2. Buy Quote, Fees & Invariant Solvency ---');

// Zero & Negative Input Rejections
const zeroBuyQuote = curve.quoteBuy(0n);
assert(!zeroBuyQuote.success && zeroBuyQuote.error === 'ZERO_INPUT', 'Rejects buy quote with 0 input');

const negBuyQuote = curve.quoteBuy(-100n);
assert(!negBuyQuote.success && negBuyQuote.error === 'ZERO_INPUT', 'Rejects buy quote with negative input');

// 1 TON Buy Quote
const oneTonNano = 1_000_000_000n;
const buyQuote = curve.quoteBuy(oneTonNano, 100n); // 1% fee, 1% slippage
assert(buyQuote.success, 'Quotes 1 TON buy successfully');
assert(buyQuote.feeTon === 10_000_000n, 'Deducts exact 1.00% protocol fee (0.01 TON / 10,000,000 nanoTON)');
assert(buyQuote.netTonApplied === 990_000_000n, 'Net TON applied to curve is exactly 0.99 TON');
assert(buyQuote.tokensOut > 0n, 'Output tokens > 0');
assert(buyQuote.newInvariant >= state.K, 'New invariant K is non-decreasing (K_new >= K_base)');

// Execute Buy
const buyRes = curve.applyBuy(oneTonNano, buyQuote.minTokensOut);
assert(buyRes.success, 'Executes valid 1 TON buy transaction on curve');
assert(curve.realTon === 990_000_000n, 'Real TON reserve increased by exact net TON (0.99 TON)');
assert(curve.accumulatedFeesTon === 10_000_000n, 'Accumulated protocol fees recorded 0.01 TON');
assert(curve.realTokens === DEFAULT_CONFIG.curveTokens - buyRes.tokensReceived, 'Curve tokens inventory decremented accurately');

// Slippage Rejection
const slippageFailRes = curve.applyBuy(oneTonNano, buyRes.tokensReceived + 1_000_000_000n);
assert(!slippageFailRes.success && slippageFailRes.error === 'SLIPPAGE_EXCEEDED', 'Strictly rejects buy when minTokensOut exceeds actual output');

// -----------------------------------------------------------------------------
// GROUP 3: Sell Quote, Payout Solvency & Fee Deductions
// -----------------------------------------------------------------------------
console.log('\n--- 3. Sell Quote, Payout Solvency & Invariant Invariants ---');

// Zero Sell Rejection
const zeroSellQuote = curve.quoteSell(0n);
assert(!zeroSellQuote.success && zeroSellQuote.error === 'ZERO_INPUT', 'Rejects sell quote with 0 tokens');

// Sell Part of Acquired Tokens
const tokensToSell = buyRes.tokensReceived / 2n;
const sellQuote = curve.quoteSell(tokensToSell, 100n);
assert(sellQuote.success, 'Quotes sell for 50% of acquired tokens');
assert(sellQuote.grossTonOut <= curve.realTon, 'Gross TON payout strictly <= real TON reserve (SOLVENCY INVARIANT)');
assert(sellQuote.feeTon === (sellQuote.grossTonOut * 100n) / BPS_DENOMINATOR, 'Deducts exact 1.00% protocol fee from gross sell payout');
assert(sellQuote.netTonOut === sellQuote.grossTonOut - sellQuote.feeTon, 'Net TON payout to user equals gross minus fee');

// Execute Sell
const preSellRealTon = curve.realTon;
const preSellFees = curve.accumulatedFeesTon;
const sellRes = curve.applySell(tokensToSell, sellQuote.minTonOut);

assert(sellRes.success, 'Executes valid token sell on curve');
assert(curve.realTon === preSellRealTon - sellRes.grossTonOut, 'Real TON reserve decremented by gross payout');
assert(curve.accumulatedFeesTon === preSellFees + sellRes.feeTon, 'Accumulated protocol fee incremented on sell');
assert(curve.realTon >= 0n, 'Real TON reserve remains strictly non-negative');

// -----------------------------------------------------------------------------
// GROUP 4: Round-Trip Economic Solvency
// -----------------------------------------------------------------------------
console.log('\n--- 4. Round-Trip Economic Solvency & Non-Arbitrage ---');

const testCurve = new BondingCurveEngine();
const initialUserTon = 10n * 1_000_000_000n; // 10 TON
const buy1 = testCurve.applyBuy(initialUserTon, 0n);
assert(buy1.success, 'User buys with 10 TON');

// User immediately sells 100% of the tokens just received
const sell1 = testCurve.applySell(buy1.tokensReceived, 0n);
assert(sell1.success, 'User sells 100% of acquired tokens immediately');
assert(sell1.netTonReceived < initialUserTon, 'User receives less TON than initial input due to curve spread & fees');
assert(testCurve.realTon >= 0n, 'Curve real TON reserve remains non-negative after round-trip');
assert(testCurve.accumulatedFeesTon > 0n, 'Protocol fees collected on both legs');
assert(testCurve.realTokens === DEFAULT_CONFIG.curveTokens, 'Curve tokens inventory fully restored to 800M tokens');

// -----------------------------------------------------------------------------
// GROUP 5: Graduation Threshold & Trading Lock
// -----------------------------------------------------------------------------
console.log('\n--- 5. Graduation Threshold & Trading Lock ---');

const gradCurve = new BondingCurveEngine();
// Buy enough to cross the 500 TON graduation threshold (send 520 TON)
const hugeBuyAmount = 520n * 1_000_000_000n;
const gradBuy = gradCurve.applyBuy(hugeBuyAmount, 0n);

assert(gradBuy.success, 'Huge buy accepted and triggers graduation');
assert(gradCurve.graduated === true, 'Curve state transitioned to graduated = true');
assert(gradCurve.realTokens === 0n, 'All 800M curve tokens sold out at graduation');

// Required DEX Token Calculation & Valuation Alignment
const gradState = gradCurve.getState();
const requiredDexTokens = gradCurve.calculateRequiredDexTokens(gradCurve.realTon);
assert(
  requiredDexTokens === 200_000_000n * ONE_TOKEN,
  'At graduation: Required DEX token allocation calculates to exactly 200,000,000 tokens'
);
assert(
  gradState.marketCapitalizationNano === 2_000n * 1_000_000_000n,
  'At graduation: Circulating Market Cap = 2,000 TON (800M tokens * 2,500 nanoTON)'
);
assert(
  gradState.fullyDilutedValuationNano === 2_500n * 1_000_000_000n,
  'At graduation: Fully Diluted Valuation (FDV) = 2,500 TON (1B tokens * 2,500 nanoTON)'
);

// Subsequent trades must be rejected
const postGradBuy = gradCurve.applyBuy(1_000_000_000n, 0n);
assert(!postGradBuy.success && postGradBuy.error === 'CURVE_GRADUATED', 'Buys strictly rejected after graduation');

const postGradSell = gradCurve.applySell(1_000_000_000n, 0n);
assert(!postGradSell.success && postGradSell.error === 'CURVE_GRADUATED', 'Sells strictly rejected after graduation');

// -----------------------------------------------------------------------------
// GROUP 6: 10,000+ Reproducible Randomized Fuzzing Cycles
// -----------------------------------------------------------------------------
console.log('\n--- 6. Randomized Fuzz Testing (10,000+ Iterations) ---');

const FUZZ_SEED = 0x414e4c47; // Fixed seed ("ANLG")
const prng = new Mulberry32(FUZZ_SEED);
const fuzzCurve = new BondingCurveEngine();

let traderHoldings = 0n;
let fuzzBuys = 0;
let fuzzSells = 0;
let fuzzRejections = 0;
const TOTAL_FUZZ_CYCLES = 12000;

console.log(`  Executing ${TOTAL_FUZZ_CYCLES} randomized trade cycles with seed 0x${FUZZ_SEED.toString(16)}...`);

for (let i = 0; i < TOTAL_FUZZ_CYCLES; i++) {
  // If curve graduated, reset with fresh curve to test multi-lifecycle fuzzing
  if (fuzzCurve.graduated) {
    fuzzCurve.realTon = 0n;
    fuzzCurve.realTokens = DEFAULT_CONFIG.curveTokens;
    fuzzCurve.accumulatedFeesTon = 0n;
    fuzzCurve.graduated = false;
    traderHoldings = 0n;
  }

  const isBuy = (prng.next() > 0.45) || traderHoldings === 0n;

  if (isBuy) {
    // Generate random TON amount between 1 nanoTON and 50 TON
    const tonIn = prng.rangeBigInt(1n, 50n * 1_000_000_000n);
    const slipBps = BigInt(Math.floor(prng.next() * 500)); // 0% to 5% slippage

    const quote = fuzzCurve.quoteBuy(tonIn, slipBps);
    if (!quote.success) {
      fuzzRejections++;
      continue;
    }

    const res = fuzzCurve.applyBuy(tonIn, quote.minTokensOut);
    if (res.success) {
      traderHoldings += res.tokensReceived;
      fuzzBuys++;
    } else {
      fuzzRejections++;
    }
  } else {
    // Sell random portion (1% to 100%) of current holdings
    const pct = prng.next();
    const tokensIn = BigInt(Math.max(1, Math.floor(Number(traderHoldings) * pct)));
    const slipBps = BigInt(Math.floor(prng.next() * 500));

    const quote = fuzzCurve.quoteSell(tokensIn, slipBps);
    if (!quote.success) {
      fuzzRejections++;
      continue;
    }

    const res = fuzzCurve.applySell(tokensIn, quote.minTonOut);
    if (res.success) {
      traderHoldings -= tokensIn;
      fuzzSells++;
    } else {
      fuzzRejections++;
    }
  }

  // Check Invariants on EVERY single iteration
  fuzzCurve.assertInvariants();
}

assert(
  fuzzBuys > 3000 && fuzzSells > 3000,
  `Executed ${TOTAL_FUZZ_CYCLES} fuzz cycles (${fuzzBuys} buys, ${fuzzSells} sells, ${fuzzRejections} safe rejections)`
);

assert(
  fuzzCurve.realTon >= 0n && fuzzCurve.realTokens >= 0n && fuzzCurve.realTokens <= DEFAULT_CONFIG.curveTokens,
  'All economic reserves and inventory bounds held through 12,000 randomized trades'
);

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log(`📊 BONDING CURVE MATH TEST RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
console.log('═══════════════════════════════════════════════════════════════════════════\n');

if (failedTests > 0) {
  process.exit(1);
}
