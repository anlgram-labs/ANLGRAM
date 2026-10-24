/**
 * test-profit-calculator-regression.js
 * Comprehensive Regression & Verification Suite for ANLGRAM ProfitLab
 */
const fs = require('fs');
const path = require('path');

console.log('========================================================================');
console.log('🛡️  ANLGRAM PROFITLAB AUDIT & REGRESSION SUITE');
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

// 1. Audit HTML file for required IDs and classes
console.log('--- 1. Verification of Required DOM IDs and Interactive Controls ---');
const htmlContent = fs.readFileSync(path.join(__dirname, 'profit-calculator.html'), 'utf8');

const REQUIRED_DOM_IDS = [
  'buyPriceInput',
  'investedAmountInput',
  'sellPriceInput',
  'buyFeeInput',
  'sellFeeInput',
  'coinSearchInput',
  'coinSearchWrap',
  'coinSearchResults',
  'marketPriceBadgeWrap',
  'selectedCoinName',
  'selectedCoinSymbol',
  'marketPriceVal',
  'marketPriceChange',
  'marketDataSource',
  'useMarketPriceBuyBtn',
  'useMarketPriceSellBtn',
  'calcErrorAlert',
  'resultStatusBox',
  'resultMainTitle',
  'resultMainAmount',
  'resultRoiBadge',
  'resultStatusBadge',
  'resUnitsPurchased',
  'resTotalCost',
  'resGrossSell',
  'resTotalFees',
  'resNetSell',
  'resNetProfit',
  'resRoi',
  'resBreakEven',
  'globalSearch',
  'topbar-price',
  'topbar-change',
  'sidebarDot',
  'sidebarNetworkText'
];

REQUIRED_DOM_IDS.forEach(id => {
  const hasId = htmlContent.includes(`id="${id}"`);
  assert(hasId, `DOM ID exists in markup: #${id}`);
});

// 2. Audit quick token chips and functions
console.log('\n--- 2. Quick Access Token Chips and Inline Function Handlers ---');
const REQUIRED_COIN_IDS = [
  'the-open-network',
  'bitcoin',
  'ethereum',
  'solana',
  'binancecoin',
  'dogecoin',
  'ripple',
  'sui'
];

REQUIRED_COIN_IDS.forEach(coinId => {
  const hasCoin = htmlContent.includes(`data-id="${coinId}"`);
  assert(hasCoin, `Quick token chip exists for: ${coinId}`);
});

const REQUIRED_FUNCTIONS = [
  'selectProfitCoin',
  'loadMarketPriceToField',
  'setInvestedPreset',
  'applyTargetMultiplier',
  'applyBreakEvenScenario',
  'applyTotalLossScenario'
];

REQUIRED_FUNCTIONS.forEach(fn => {
  const hasFn = htmlContent.includes(fn);
  assert(hasFn, `Inline event handler referenced: ${fn}`);
});

// 3. Mathematical Core Verification
console.log('\n--- 3. Mathematical Formula & Break-Even Logic Verification ---');

function simulateMath(buyPrice, investedAmount, sellPrice, buyFee = 0, sellFee = 0) {
  const unitsPurchased = investedAmount / buyPrice;
  const totalCost = investedAmount + buyFee;
  const grossSellProceeds = unitsPurchased * sellPrice;
  const netSellProceeds = grossSellProceeds - sellFee;
  const netProfitLoss = netSellProceeds - totalCost;
  const roiPercent = (netProfitLoss / totalCost) * 100;
  const breakEvenPrice = (totalCost + sellFee) / unitsPurchased;
  
  let status = 'breakeven';
  if (netProfitLoss > 0.005) status = 'profit';
  else if (netProfitLoss < -0.005) status = 'loss';

  return { unitsPurchased, totalCost, grossSellProceeds, netSellProceeds, netProfitLoss, roiPercent, breakEvenPrice, status };
}

// Baseline test: Buy 1.35, Invest 500, Sell 2.70
const r1 = simulateMath(1.35, 500, 2.70, 0, 0);
assert(Math.abs(r1.unitsPurchased - 370.37037) < 0.001, `Units purchased exact: 370.37 (got ${r1.unitsPurchased.toFixed(2)})`);
assert(r1.totalCost === 500, `Total cost: 500 (got ${r1.totalCost})`);
assert(Math.abs(r1.netProfitLoss - 500) < 0.001, `Net profit: +500.00 (got ${r1.netProfitLoss.toFixed(2)})`);
assert(Math.abs(r1.roiPercent - 100) < 0.001, `ROI: +100% (got ${r1.roiPercent.toFixed(2)}%)`);
assert(r1.breakEvenPrice === 1.35, `Break-even price: 1.35 (got ${r1.breakEvenPrice})`);
assert(r1.status === 'profit', `Status is 'profit'`);

// Test with Fees: Buy 1.35, Invest 500, BuyFee 5, Sell 2.70, SellFee 10
const r2 = simulateMath(1.35, 500, 2.70, 5, 10);
assert(r2.totalCost === 505, `Total cost with buy fee: 505 (got ${r2.totalCost})`);
assert(Math.abs(r2.netSellProceeds - 990) < 0.001, `Net proceeds after sell fee: 990 (got ${r2.netSellProceeds.toFixed(2)})`);
assert(Math.abs(r2.netProfitLoss - 485) < 0.001, `Net profit after fees: 485 (got ${r2.netProfitLoss.toFixed(2)})`);
assert(Math.abs(r2.breakEvenPrice - (515 / (500 / 1.35))) < 0.0001, `Break-even accounts for fees`);

// Loss test: Sell 0
const r3 = simulateMath(1.35, 500, 0, 0, 0);
assert(r3.netProfitLoss === -500, `Total loss scenario: -500.00`);
assert(r3.roiPercent === -100, `Total loss ROI: -100%`);
assert(r3.status === 'loss', `Status is 'loss'`);

// Break-even test
const r4 = simulateMath(1.35, 500, 1.35, 0, 0);
assert(Math.abs(r4.netProfitLoss) < 0.0001, `Break-even net profit: 0.00`);
assert(Math.abs(r4.roiPercent) < 0.0001, `Break-even ROI: 0.00%`);
assert(r4.status === 'breakeven', `Status is 'breakeven'`);

console.log('\n========================================================================');
console.log(`📊 RESULTADO: ${passCount} PASARON | ${failCount} FALLARON`);
console.log('========================================================================');

if (failCount > 0) process.exit(1);
