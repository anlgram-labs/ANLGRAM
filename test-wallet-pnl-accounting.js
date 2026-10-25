/**
 * Comprehensive Unit Test Suite for ANLGRAM PnL & Wallet Intelligence Accounting Engine
 * Verifies the 16 mandatory controlled cases specified in USER_REQUEST.
 */

const assert = require('assert');
const {
  CANONICAL_GRAM_CONTRACT,
  normalizeAddress,
  TransactionClassifier,
  TradeDeduplicator,
  AccountingEngine,
  TraderPerformanceEvaluator,
  HistoricalChartEngine
} = require('./assets/js/wallet-intelligence-engine.js');

console.log('========================================================================');
console.log('🧪 ANLGRAM EXPLORER V2 - 16 CONTROLLED PnL & ACCOUNTING AUDIT SUITE');
console.log('========================================================================\n');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// TEST CASE 1: Compra y venta rentable (Profitable Buy & Sell)
// -----------------------------------------------------------------------------
it('Case 1: Compra y venta rentable calcula PnL positivo y ROI exacto', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_GRAM_MASTER_01', symbol: 'GRAM', name: 'Gram' };

  // Buy 1,000 GRAM at $0.05 ($50 cost) + $1.00 fee = $51.00 total cost basis ($0.051/unit)
  engine.processBuy({
    txHash: 'tx_buy_1',
    timestamp: 1000,
    token,
    tokenAmount: 1000,
    unitPriceUsd: 0.05,
    valueUsd: 50.0,
    feeUsd: 1.0,
    dex: 'STON.fi'
  });

  // Sell 1,000 GRAM at $0.10 ($100 gross proceeds) - $2.00 fee = $98.00 net proceeds
  const sellResult = engine.processSell({
    txHash: 'tx_sell_1',
    timestamp: 2000,
    token,
    tokenAmount: 1000,
    unitPriceUsd: 0.10,
    valueUsd: 100.0,
    feeUsd: 2.0,
    dex: 'STON.fi'
  });

  // Expected Realized PnL: $98.00 - $51.00 = +$47.00
  assert.strictEqual(sellResult.pnlStatus, 'VALID');
  assert.strictEqual(sellResult.realizedPnlUsd, 47.0);
  assert.strictEqual(Math.round(sellResult.roiPct * 100) / 100, 92.16); // (47 / 51) * 100 = 92.1568%
  assert.strictEqual(sellResult.isProfitable, true);
});

// -----------------------------------------------------------------------------
// TEST CASE 2: Compra y venta con pérdidas (Buy & Sell with Loss)
// -----------------------------------------------------------------------------
it('Case 2: Compra y venta con pérdidas calcula PnL negativo y desglosa comisiones', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_DUST_MASTER', symbol: 'DUST', name: 'DeDust' };

  // Buy 500 DUST at $2.00 ($1,000) + $5 fee = $1,005 cost basis ($2.01/unit)
  engine.processBuy({
    txHash: 'tx_buy_loss',
    timestamp: 1000,
    token,
    tokenAmount: 500,
    unitPriceUsd: 2.00,
    valueUsd: 1000.0,
    feeUsd: 5.0
  });

  // Sell 500 DUST at $1.20 ($600 gross proceeds) - $3 fee = $597.00 net proceeds
  const sellResult = engine.processSell({
    txHash: 'tx_sell_loss',
    timestamp: 2000,
    token,
    tokenAmount: 500,
    unitPriceUsd: 1.20,
    valueUsd: 600.0,
    feeUsd: 3.0
  });

  // Expected Realized PnL: $597 - $1005 = -$408.00
  assert.strictEqual(sellResult.pnlStatus, 'VALID');
  assert.strictEqual(sellResult.realizedPnlUsd, -408.0);
  assert.strictEqual(Math.round(sellResult.roiPct * 100) / 100, -40.6); // (-408 / 1005) * 100 = -40.597%
  assert.strictEqual(sellResult.isProfitable, false);
});

// -----------------------------------------------------------------------------
// TEST CASE 3: Posición abierta con ganancias no realizadas (Unrealized Gain)
// -----------------------------------------------------------------------------
it('Case 3: Posición abierta con ganancias no realizadas calcula plusvalía latente', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_NOT_MASTER', symbol: 'NOT', name: 'Notcoin' };

  // Buy 2,000 NOT at $0.01 = $20.00 cost basis
  engine.processBuy({
    txHash: 'tx_buy_not',
    timestamp: 1000,
    token,
    tokenAmount: 2000,
    unitPriceUsd: 0.01,
    valueUsd: 20.0,
    feeUsd: 0
  });

  // Current market price $0.025 with $50,000 pool liquidity
  const portfolio = engine.evaluatePortfolio([], {
    'EQ_NOT_MASTER': { priceUsd: 0.025, liquidityUsd: 50000, isVerifiedMajor: true }
  });

  const pos = portfolio.positions.find(p => p.contractAddress === 'EQ_NOT_MASTER');
  assert(pos, 'Position should exist');
  assert.strictEqual(pos.currentValueUsd, 50.0);
  assert.strictEqual(pos.unrealizedPnlUsd, 30.0); // $50 - $20 = +$30
  assert.strictEqual(pos.unrealizedRoiPct, 150.0);
  assert.strictEqual(pos.isLossMaking, false);
  assert.strictEqual(pos.valuationStatus, 'CONFIDENT');
});

// -----------------------------------------------------------------------------
// TEST CASE 4: Posición abierta con pérdidas no realizadas (Unrealized Loss)
// -----------------------------------------------------------------------------
it('Case 4: Posición abierta con pérdidas no realizadas se identifica en Posiciones Deficitarias', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_MEME_MASTER', symbol: 'MEME', name: 'MemeCoin' };

  // Buy 1,000 MEME at $0.10 = $100.00 cost basis
  engine.processBuy({
    txHash: 'tx_buy_meme',
    timestamp: 1000,
    token,
    tokenAmount: 1000,
    unitPriceUsd: 0.10,
    valueUsd: 100.0,
    feeUsd: 0
  });

  // Price dropped to $0.04 with $10,000 liquidity
  const portfolio = engine.evaluatePortfolio([], {
    'EQ_MEME_MASTER': { priceUsd: 0.04, liquidityUsd: 10000, isVerifiedMajor: false }
  });

  const pos = portfolio.positions.find(p => p.contractAddress === 'EQ_MEME_MASTER');
  assert.strictEqual(pos.currentValueUsd, 40.0);
  assert.strictEqual(pos.unrealizedPnlUsd, -60.0); // $40 - $100 = -$60
  assert.strictEqual(pos.isLossMaking, true);
  assert.strictEqual(portfolio.lossMakingPositions.length, 1);
  assert.strictEqual(portfolio.lossMakingPositions[0].contractAddress, 'EQ_MEME_MASTER');
});

// -----------------------------------------------------------------------------
// TEST CASE 5: Transferencia entrante sin coste de adquisición conocido
// -----------------------------------------------------------------------------
it('Case 5: Transferencia entrante sin coste documentado NO se asume a coste cero', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_AIRDROP_UNKNOWN', symbol: 'UNKNOWN', name: 'Unknown Inflow' };

  // Received 10,000 tokens from peer without buy price
  engine.processTransferIn({
    txHash: 'tx_transfer_in_1',
    timestamp: 1000,
    token,
    tokenAmount: 10000
  });

  // Sell all 10,000 tokens for $500
  const sellResult = engine.processSell({
    txHash: 'tx_sell_unknown',
    timestamp: 2000,
    token,
    tokenAmount: 10000,
    valueUsd: 500.0,
    feeUsd: 1.0
  });

  // Per Rule 5: Cannot present exact PnL without known cost basis!
  assert.strictEqual(sellResult.pnlStatus, 'UNKNOWN_COST');
  assert.strictEqual(sellResult.realizedPnlUsd, null);
  assert.strictEqual(sellResult.roiPct, null);
  assert.strictEqual(engine.cumulativeRealizedPnlUsd, 0); // Does NOT invent artificial profit!
});

// -----------------------------------------------------------------------------
// TEST CASE 6: Transferencia entre dos wallets propias (Internal Transfer)
// -----------------------------------------------------------------------------
it('Case 6: Transferencia entre dos wallets propias conserva coste y no genera venta ficticia', () => {
  const classifier = new TransactionClassifier({
    ownWallets: ['EQ_WALLET_A', 'EQ_WALLET_B']
  });

  const event = {
    event_id: 'tx_internal_swap',
    timestamp: 1500,
    actions: [{
      type: 'JettonTransfer',
      JettonTransfer: {
        sender: { address: 'EQ_WALLET_A' },
        recipient: { address: 'EQ_WALLET_B' },
        amount: '500000000000', // 500 tokens
        jetton: { address: 'EQ_GRAM_MASTER_01', symbol: 'GRAM', decimals: 9 }
      }
    }]
  };

  const classified = classifier.classifyEvent(event, 'EQ_WALLET_A');
  assert.strictEqual(classified.type, 'INTERNAL_TRANSFER');
  assert.strictEqual(classified.evidence, 'Transferencia verificada entre wallets propias declaradas');

  // Verify in AccountingEngine
  const engine = new AccountingEngine();
  const originalLot = { hasKnownCost: true, unitCostUsd: 0.08 };
  engine.processInternalTransfer(classified, originalLot);

  const queue = engine._getLotQueue('EQ_GRAM_MASTER_01');
  assert.strictEqual(queue[0].source, 'INTERNAL_TRANSFER');
  assert.strictEqual(queue[0].unitCostUsd, 0.08); // Carries over original cost basis
});

// -----------------------------------------------------------------------------
// TEST CASE 7: Token recibido como recompensa (Reward/Airdrop)
// -----------------------------------------------------------------------------
it('Case 7: Token recibido como recompensa se documenta explícitamente como REWARD', () => {
  const classifier = new TransactionClassifier();
  const event = {
    event_id: 'tx_mining_giver',
    timestamp: 1500,
    actions: [{
      type: 'JettonTransfer',
      JettonTransfer: {
        sender: { address: '0:0000000000000000000000000000000000000000000000000000000000000000' },
        recipient: { address: 'EQ_USER_WALLET' },
        amount: '100000000000', // 100 GRAM
        comment: 'Mining reward from PoW Giver',
        jetton: { address: CANONICAL_GRAM_CONTRACT, symbol: 'GRAM', decimals: 9 }
      }
    }]
  };

  const classified = classifier.classifyEvent(event, 'EQ_USER_WALLET');
  assert.strictEqual(classified.type, 'REWARD');

  const engine = new AccountingEngine();
  engine.processReward(classified);
  const queue = engine._getLotQueue(CANONICAL_GRAM_CONTRACT);
  assert.strictEqual(queue[0].source, 'REWARD');
  assert.strictEqual(queue[0].unitCostUsd, 0);
  assert.strictEqual(queue[0].hasKnownCost, true);
});

// -----------------------------------------------------------------------------
// TEST CASE 8: Swap entre dos Jettons (Jetton A -> Jetton B)
// -----------------------------------------------------------------------------
it('Case 8: Swap entre dos Jettons deduce coste de adquisición a partir del contra-activo', () => {
  const classifier = new TransactionClassifier();
  const event = {
    event_id: 'tx_jetton_swap_usdt_gram',
    timestamp: 1600,
    actions: [{
      type: 'JettonSwap',
      JettonSwap: {
        dex: 'stonfi',
        amount_in: '100000000', // 100 USDT (6 dec)
        amount_out: '1000000000000', // 1,000 GRAM (9 dec)
        jetton_master_in: { address: 'EQ_USDT_MASTER', symbol: 'USDT', decimals: 6 },
        jetton_master_out: { address: CANONICAL_GRAM_CONTRACT, symbol: 'GRAM', decimals: 9 },
        router: { address: 'EQCSIMGBps_qzRG3uPYhON8bucyCtu0mYdL1-u4gSz77IBa3', name: 'STON.fi DEX' }
      }
    }]
  };

  const classified = classifier.classifyEvent(event, 'EQ_USER_WALLET');
  assert.strictEqual(classified.type, 'BUY');
  assert.strictEqual(classified.token.symbol, 'GRAM');
  assert.strictEqual(classified.tokenAmount, 1000);
  assert.strictEqual(classified.counterAmount, 100);
  assert.strictEqual(classified.unitPriceUsd, 0.10); // $100 / 1000 = $0.10
});

// -----------------------------------------------------------------------------
// TEST CASE 9: Comisiones de red y DEX sin doble conteo
// -----------------------------------------------------------------------------
it('Case 9: Comisiones de red y DEX se registran sin doble descuento', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_TOKEN_FEE', symbol: 'FEETOK', name: 'Fee Token' };

  // Buy with $1.50 fee
  engine.processBuy({
    txHash: 'tx_fee_buy',
    timestamp: 1000,
    token,
    tokenAmount: 100,
    unitPriceUsd: 1.0,
    valueUsd: 100.0,
    feeUsd: 1.50
  });

  // Sell with $2.50 fee
  engine.processSell({
    txHash: 'tx_fee_sell',
    timestamp: 2000,
    token,
    tokenAmount: 100,
    unitPriceUsd: 1.5,
    valueUsd: 150.0,
    feeUsd: 2.50
  });

  // Total cumulative fees: $1.50 + $2.50 = $4.00
  assert.strictEqual(engine.cumulativeFeesUsd, 4.00);
  // Realized PnL: Net Proceeds ($150 - $2.50 = $147.50) - Cost Basis ($100 + $1.50 = $101.50) = $46.00
  assert.strictEqual(engine.cumulativeRealizedPnlUsd, 46.00);
});

// -----------------------------------------------------------------------------
// TEST CASE 10: Venta parcial de una posición (Partial Sale)
// -----------------------------------------------------------------------------
it('Case 10: Venta parcial de posición actualiza lotes y separa PnL realizado de remanente', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_PARTIAL_TOKEN', symbol: 'PART', name: 'Partial' };

  // Buy 1,000 PART at $0.10 ($100 total cost)
  engine.processBuy({
    txHash: 'tx_buy_part',
    timestamp: 1000,
    token,
    tokenAmount: 1000,
    unitPriceUsd: 0.10,
    valueUsd: 100.0,
    feeUsd: 0
  });

  // Sell 400 PART at $0.20 ($80 gross proceeds)
  const sellResult = engine.processSell({
    txHash: 'tx_sell_part',
    timestamp: 2000,
    token,
    tokenAmount: 400,
    unitPriceUsd: 0.20,
    valueUsd: 80.0,
    feeUsd: 0
  });

  // Consumed: 400 units * $0.10 = $40 cost basis. Proceeds = $80. Realized PnL = +$40.
  assert.strictEqual(sellResult.costBasisUsd, 40.0);
  assert.strictEqual(sellResult.realizedPnlUsd, 40.0);

  // Remaining in queue: 600 units with cost $60
  const queue = engine._getLotQueue('EQ_PARTIAL_TOKEN');
  assert.strictEqual(queue[0].amountRemaining, 600);

  // Evaluate remaining portfolio at $0.25 market price
  const portfolio = engine.evaluatePortfolio([], {
    'EQ_PARTIAL_TOKEN': { priceUsd: 0.25, liquidityUsd: 20000, isVerifiedMajor: false }
  });
  const pos = portfolio.positions.find(p => p.contractAddress === 'EQ_PARTIAL_TOKEN');
  assert.strictEqual(pos.balance, 600);
  assert.strictEqual(pos.currentValueUsd, 150.0); // 600 * $0.25
  assert.strictEqual(pos.unrealizedPnlUsd, 90.0); // $150 - $60 = $90
});

// -----------------------------------------------------------------------------
// TEST CASE 11: Múltiples compras a precios diferentes (FIFO Lot Consumption)
// -----------------------------------------------------------------------------
it('Case 11: Múltiples compras a diferentes precios consumen lotes en orden FIFO riguroso', () => {
  const engine = new AccountingEngine({ tonPriceUsd: 5.0 });
  const token = { address: 'EQ_MULTI_BUY', symbol: 'MBUY', name: 'MultiBuy' };

  // Lot 1: Buy 500 at $0.10 ($50)
  engine.processBuy({
    txHash: 'tx_lot1',
    timestamp: 1000,
    token,
    tokenAmount: 500,
    unitPriceUsd: 0.10,
    valueUsd: 50.0,
    feeUsd: 0
  });

  // Lot 2: Buy 500 at $0.20 ($100)
  engine.processBuy({
    txHash: 'tx_lot2',
    timestamp: 2000,
    token,
    tokenAmount: 500,
    unitPriceUsd: 0.20,
    valueUsd: 100.0,
    feeUsd: 0
  });

  // Sell 700 units at $0.25 ($175 gross proceeds)
  // FIFO should consume: 500 units from Lot 1 ($50) + 200 units from Lot 2 ($40) = $90 cost basis
  const sellResult = engine.processSell({
    txHash: 'tx_sell_fifo',
    timestamp: 3000,
    token,
    tokenAmount: 700,
    unitPriceUsd: 0.25,
    valueUsd: 175.0,
    feeUsd: 0
  });

  assert.strictEqual(sellResult.costBasisUsd, 90.0);
  assert.strictEqual(sellResult.realizedPnlUsd, 85.0); // $175 - $90 = $85
  assert.strictEqual(sellResult.consumedLots.length, 2);
  assert.strictEqual(sellResult.consumedLots[0].amountConsumed, 500);
  assert.strictEqual(sellResult.consumedLots[1].amountConsumed, 200);

  // Remaining: 300 units in Lot 2 at $0.20 ($60 remaining cost basis)
  const queue = engine._getLotQueue('EQ_MULTI_BUY');
  assert.strictEqual(queue[0].amountRemaining, 0);
  assert.strictEqual(queue[1].amountRemaining, 300);
});

// -----------------------------------------------------------------------------
// TEST CASE 12: Token sin precio fiable (Missing Price)
// -----------------------------------------------------------------------------
it('Case 12: Token sin precio fiable se etiqueta con PRECIO NO DISPONIBLE y excluye PnL falso', () => {
  const engine = new AccountingEngine();
  const token = { address: 'EQ_OBSCURE_TOKEN', symbol: 'OBSCURE', name: 'Obscure Token' };

  engine.processBuy({
    txHash: 'tx_buy_obs',
    timestamp: 1000,
    token,
    tokenAmount: 1000,
    unitPriceUsd: 0.05,
    valueUsd: 50.0,
    feeUsd: 0
  });

  // No price provided in oracle
  const portfolio = engine.evaluatePortfolio([], {});
  const pos = portfolio.positions.find(p => p.contractAddress === 'EQ_OBSCURE_TOKEN');
  assert.strictEqual(pos.currentPriceUsd, null);
  assert.strictEqual(pos.currentValueUsd, null);
  assert.strictEqual(pos.unrealizedPnlUsd, null);
  assert.strictEqual(pos.valuationStatus, 'PRICE_UNAVAILABLE');
});

// -----------------------------------------------------------------------------
// TEST CASE 13: Historial incompleto (Incomplete History / Truncation)
// -----------------------------------------------------------------------------
it('Case 13: Historial incompleto notifica el rango analizado y advierte cobertura parcial', () => {
  const operations = [
    { txHash: 'tx_old_1', timestamp: Math.floor(Date.now() / 1000) - 40 * 86400, type: 'BUY', valueUsd: 100 },
    { txHash: 'tx_recent', timestamp: Math.floor(Date.now() / 1000) - 5 * 86400, type: 'BUY', valueUsd: 50 }
  ];

  // Request 7-day range
  const chart7d = HistoricalChartEngine.buildTrajectory(operations, '7d');
  assert.strictEqual(chart7d.dataPointsCount, 1); // Only 1 tx in last 7d
  assert(chart7d.hasCoverage);
  assert(chart7d.coverageNotice.includes('1 puntos de datos'));

  // Request range with 0 data points
  const chart24h = HistoricalChartEngine.buildTrajectory(operations, '24h');
  assert.strictEqual(chart24h.dataPointsCount, 0);
  assert.strictEqual(chart24h.hasCoverage, false);
  assert.strictEqual(chart24h.coverageNotice, 'Sin transacciones indexadas en el intervalo seleccionado.');
});

// -----------------------------------------------------------------------------
// TEST CASE 14: Operaciones duplicadas procedentes de dos fuentes (Deduplication)
// -----------------------------------------------------------------------------
it('Case 14: Operaciones idénticas indexadas por dos APIs se desduplican limpiamente', () => {
  const deduplicator = new TradeDeduplicator();
  const rawList = [
    { txHash: 'hash_tonapi_1', type: 'BUY', token: { address: 'EQ_GRAM' }, tokenAmount: 100 },
    { txHash: 'hash_tonapi_1', type: 'BUY', token: { address: 'EQ_GRAM' }, tokenAmount: 100 }, // Exact duplicate
    { txHash: 'hash_stonfi_2', type: 'SELL', token: { address: 'EQ_GRAM' }, tokenAmount: 50 }
  ];

  const uniqueOps = deduplicator.deduplicate(rawList);
  assert.strictEqual(uniqueOps.length, 2);
  assert.strictEqual(uniqueOps[0].txHash, 'hash_tonapi_1');
  assert.strictEqual(uniqueOps[1].txHash, 'hash_stonfi_2');
});

// -----------------------------------------------------------------------------
// TEST CASE 15: Token con el mismo símbolo que otro contrato (Homonym distinction)
// -----------------------------------------------------------------------------
it('Case 15: Tokens homónimos se aíslan estrictamente por dirección de contrato master', () => {
  const engine = new AccountingEngine();
  const realGram = { address: CANONICAL_GRAM_CONTRACT, symbol: 'GRAM', name: 'Gram Official' };
  const fakeGram = { address: 'EQ_FAKE_SCAM_GRAM_ADDRESS', symbol: 'GRAM', name: 'Fake Scam Gram' };

  // Buy 100 Real Gram at $0.08
  engine.processBuy({
    txHash: 'tx_real_gram',
    timestamp: 1000,
    token: realGram,
    tokenAmount: 100,
    unitPriceUsd: 0.08,
    valueUsd: 8.0,
    feeUsd: 0
  });

  // Buy 1,000,000 Fake Gram at $0.000001
  engine.processBuy({
    txHash: 'tx_fake_gram',
    timestamp: 1000,
    token: fakeGram,
    tokenAmount: 1000000,
    unitPriceUsd: 0.000001,
    valueUsd: 1.0,
    feeUsd: 0
  });

  const portfolio = engine.evaluatePortfolio([], {
    [CANONICAL_GRAM_CONTRACT]: { priceUsd: 0.10, liquidityUsd: 500000, isVerifiedMajor: true },
    'EQ_FAKE_SCAM_GRAM_ADDRESS': { priceUsd: 0, liquidityUsd: 0, isVerifiedMajor: false }
  });

  const posReal = portfolio.positions.find(p => p.contractAddress === CANONICAL_GRAM_CONTRACT);
  const posFake = portfolio.positions.find(p => p.contractAddress === 'EQ_FAKE_SCAM_GRAM_ADDRESS');

  assert.strictEqual(posReal.balance, 100);
  assert.strictEqual(posReal.currentValueUsd, 10.0);
  assert.strictEqual(posReal.unrealizedPnlUsd, 2.0); // +$2

  assert.strictEqual(posFake.balance, 1000000);
  assert.strictEqual(posFake.valuationStatus, 'PRICE_UNAVAILABLE');
  assert.strictEqual(posFake.unrealizedPnlUsd, null); // Fake token never inherits real token's price!
});

// -----------------------------------------------------------------------------
// TEST CASE 16: Liquidez insuficiente para una valoración fiable (Low Liquidity)
// -----------------------------------------------------------------------------
it('Case 16: Token con liquidez baja (<$1,000) se etiqueta como VALORACIÓN DE BAJA FIABILIDAD', () => {
  const engine = new AccountingEngine();
  const token = { address: 'EQ_ILLIQUID_TOKEN', symbol: 'LOWLIQ', name: 'Low Liquidity Meme' };

  engine.processBuy({
    txHash: 'tx_low_liq_buy',
    timestamp: 1000,
    token,
    tokenAmount: 5000,
    unitPriceUsd: 0.20,
    valueUsd: 1000.0,
    feeUsd: 0
  });

  // Pool has only $150 liquidity!
  const portfolio = engine.evaluatePortfolio([], {
    'EQ_ILLIQUID_TOKEN': { priceUsd: 0.50, liquidityUsd: 150, isVerifiedMajor: false }
  });

  const pos = portfolio.positions.find(p => p.contractAddress === 'EQ_ILLIQUID_TOKEN');
  assert.strictEqual(pos.valuationStatus, 'LOW_LIQUIDITY_WARNING');
  assert.strictEqual(pos.liquidityUsd, 150);
  // Excluded from confident unrealized PnL because dumping position would crash pool
  assert.strictEqual(pos.unrealizedPnlUsd, null);
});

// -----------------------------------------------------------------------------
// BONUS: Trader Performance Evaluator test
// -----------------------------------------------------------------------------
it('Bonus: Trader Performance Scorecard calcula métricas cuantitativas reproducibles', () => {
  const closedTrades = [
    { realizedPnlUsd: 100, timestamp: 2000, consumedLots: [{ timestamp: 1000 }] },
    { realizedPnlUsd: 50, timestamp: 3000, consumedLots: [{ timestamp: 2500 }] },
    { realizedPnlUsd: -30, timestamp: 4000, consumedLots: [{ timestamp: 3500 }] }
  ];

  const scorecard = TraderPerformanceEvaluator.evaluate(closedTrades, [
    { portfolioSharePct: 70, currentValueUsd: 700 },
    { portfolioSharePct: 30, currentValueUsd: 300 }
  ]);

  assert.strictEqual(scorecard.hasSufficientData, true);
  assert.strictEqual(scorecard.winningTradesCount, 2);
  assert.strictEqual(scorecard.losingTradesCount, 1);
  assert.strictEqual(Math.round(scorecard.winRatePct * 100) / 100, 66.67);
  assert.strictEqual(scorecard.avgWinUsd, 75.0);
  assert.strictEqual(scorecard.avgLossUsd, 30.0);
  assert.strictEqual(scorecard.profitFactor, 5.0); // 150 win / 30 loss = 5.0
  assert.strictEqual(scorecard.netRealizedPnlUsd, 120.0);
  assert.strictEqual(scorecard.concentrationHhi, 5800); // 70^2 + 30^2 = 4900 + 900 = 5800
});

// -----------------------------------------------------------------------------
// TEST CASE 17: Paginación - Validación estricta de Logical Time (lt) y rechazo de fallback timestamp
// -----------------------------------------------------------------------------
it('Case 17: Paginación valida estrictamente Logical Time y rechaza fallbacks a timestamp o cursores corruptos', () => {
  const { PaginationHelper } = require('./assets/js/wallet-intelligence-engine.js');
  assert.ok(PaginationHelper, 'PaginationHelper debe estar exportado');

  // Valid Logical Times on TON Mainnet (typically 64-bit sequence counters > 10^12)
  assert.strictEqual(PaginationHelper.isValidLt(109633787000013), true);
  assert.strictEqual(PaginationHelper.isValidLt('109633787000013'), true);
  assert.strictEqual(PaginationHelper.isValidLt(109633787000013n), true);

  // Prohibited: Timestamps unix (~1.7 * 10^9) MUST NOT be accepted as lt
  assert.strictEqual(PaginationHelper.isValidLt(1729870000), false, 'Unix timestamp no debe aceptarse como lt');
  assert.strictEqual(PaginationHelper.isValidLt('1729870000'), false, 'Unix timestamp en string no debe aceptarse como lt');

  // Corrupted or empty values
  assert.strictEqual(PaginationHelper.isValidLt(null), false);
  assert.strictEqual(PaginationHelper.isValidLt(undefined), false);
  assert.strictEqual(PaginationHelper.isValidLt(''), false);
  assert.strictEqual(PaginationHelper.isValidLt('invalid_cursor_xyz'), false);
  assert.strictEqual(PaginationHelper.isValidLt(-500), false);
  assert.strictEqual(PaginationHelper.isValidLt(0), false);
});

// -----------------------------------------------------------------------------
// TEST CASE 18: Paginación - Eventos sin lt y extracción segura de cursor
// -----------------------------------------------------------------------------
it('Case 18: Paginación extrae el lt válido más antiguo y no usa fallback timestamp si faltan lts', () => {
  const { PaginationHelper } = require('./assets/js/wallet-intelligence-engine.js');

  const eventsWithMixedLt = [
    { event_id: 'ev1', lt: '109633787000050', timestamp: 1729870050 },
    { event_id: 'ev2', lt: '109633787000030', timestamp: 1729870030 },
    { event_id: 'ev3', lt: null, timestamp: 1729870010 } // Oldest event lacks lt
  ];

  // Oldest valid lt is ev2 (109633787000030)
  const oldestLt = PaginationHelper.extractOldestValidLt(eventsWithMixedLt);
  assert.strictEqual(oldestLt, '109633787000030');

  // All events lack lt -> must return null, NEVER timestamp
  const eventsWithoutLt = [
    { event_id: 'ev_no_lt_1', timestamp: 1729870020 },
    { event_id: 'ev_no_lt_2', timestamp: 1729870010 }
  ];
  assert.strictEqual(PaginationHelper.extractOldestValidLt(eventsWithoutLt), null);
});

// -----------------------------------------------------------------------------
// TEST CASE 19: Paginación - Manejo de páginas vacías, repetidas y orden cronológico
// -----------------------------------------------------------------------------
it('Case 19: Paginación detecta páginas vacías, páginas repetidas y fusiona sin duplicados', () => {
  const { PaginationHelper } = require('./assets/js/wallet-intelligence-engine.js');

  const initialEvents = [
    { event_id: 'tx_page1_1', lt: '109633787000090', timestamp: 1729870090 },
    { event_id: 'tx_page1_2', lt: '109633787000080', timestamp: 1729870080 }
  ];

  // 1. Empty Page from provider
  const emptyRes = PaginationHelper.mergePages(initialEvents, []);
  assert.strictEqual(emptyRes.status, 'EMPTY_PAGE');
  assert.strictEqual(emptyRes.addedCount, 0);

  // 2. Repeated Page (all events already seen)
  const repeatedRes = PaginationHelper.mergePages(initialEvents, [
    { event_id: 'tx_page1_1', lt: '109633787000090', timestamp: 1729870090 }
  ]);
  assert.strictEqual(repeatedRes.status, 'REPEATED_PAGE');
  assert.strictEqual(repeatedRes.addedCount, 0);
  assert.strictEqual(repeatedRes.duplicateCount, 1);

  // 3. New valid historical page
  const newPage = [
    { event_id: 'tx_page1_2', lt: '109633787000080', timestamp: 1729870080 }, // overlap duplicate
    { event_id: 'tx_page2_1', lt: '109633787000070', timestamp: 1729870070 }  // new event
  ];
  const okRes = PaginationHelper.mergePages(initialEvents, newPage);
  assert.strictEqual(okRes.status, 'OK');
  assert.strictEqual(okRes.addedCount, 1);
  assert.strictEqual(okRes.duplicateCount, 1);
  assert.strictEqual(okRes.deduplicatedEvents.length, 3);
  // Verify strict descending order
  assert.strictEqual(okRes.deduplicatedEvents[0].event_id, 'tx_page1_1');
  assert.strictEqual(okRes.deduplicatedEvents[2].event_id, 'tx_page2_1');
});

// -----------------------------------------------------------------------------
// TEST CASE 20: Comisiones - Atribución estricta al emisor y no cobro a receptores
// -----------------------------------------------------------------------------
it('Case 20: Comisiones de red no se atribuyen a la wallet cuando recibe transferencias entrantes', () => {
  const { TransactionClassifier } = require('./assets/js/wallet-intelligence-engine.js');
  const classifier = new TransactionClassifier();
  const myWallet = '0:9220c181a6cfeacd11b7b8f62138df1bb9cc82b6ed2661d2f5faee204b3efb20';
  const otherSender = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8';

  // 1. Incoming transfer: sender paid 0.05 TON total_fees
  const incomingEvent = {
    event_id: 'tx_in_fee_test',
    timestamp: 1729870000,
    total_fees: 50000000, // 0.05 TON
    actions: [{
      type: 'TonTransfer',
      TonTransfer: {
        sender: otherSender,
        recipient: myWallet,
        amount: 1000000000 // 1 TON
      }
    }]
  };

  const classifiedIn = classifier.classifyEvent(incomingEvent, myWallet);
  assert.strictEqual(classifiedIn.type, 'TRANSFER_IN');
  assert.strictEqual(classifiedIn.feeTon, 0, 'La wallet receptora NO pagó la comisión del emisor');

  // 2. Outgoing transfer: my wallet paid 0.02 TON total_fees
  const outgoingEvent = {
    event_id: 'tx_out_fee_test',
    timestamp: 1729870100,
    total_fees: 20000000, // 0.02 TON
    actions: [{
      type: 'TonTransfer',
      TonTransfer: {
        sender: myWallet,
        recipient: otherSender,
        amount: 500000000
      }
    }]
  };

  const classifiedOut = classifier.classifyEvent(outgoingEvent, myWallet);
  assert.strictEqual(classifiedOut.type, 'TRANSFER_OUT');
  assert.strictEqual(classifiedOut.feeTon, 0.02, 'La wallet emisora SÍ asume la comisión de su envío');
});

// -----------------------------------------------------------------------------
// TEST CASE 21: Scorecard - Exclusión honesta de ventas con coste desconocido
// -----------------------------------------------------------------------------
it('Case 21: Scorecard excluye ventas con coste desconocido del Win Rate y documenta ratio de calculabilidad', () => {
  const { TraderPerformanceEvaluator } = require('./assets/js/wallet-intelligence-engine.js');

  // Sample replicating real wallet: 15 closed sales total.
  // 4 have known cost (1 win of +$10, 3 losses of -$5 each = -$15).
  // 11 have unknown cost (realizedPnlUsd: null).
  const closedTrades = [
    { realizedPnlUsd: 10.0, timestamp: 1000 },
    { realizedPnlUsd: -5.0, timestamp: 1100 },
    { realizedPnlUsd: -5.0, timestamp: 1200 },
    { realizedPnlUsd: -5.0, timestamp: 1300 }
  ];
  for (let i = 0; i < 11; i++) {
    closedTrades.push({ realizedPnlUsd: null, timestamp: 1400 + i, grossProceedsUsd: 2.0 });
  }

  const scorecard = TraderPerformanceEvaluator.evaluate(closedTrades, []);
  assert.strictEqual(scorecard.hasSufficientData, true);
  assert.strictEqual(scorecard.totalClosedTrades, 15, 'Total 15 ventas detectadas');
  assert.strictEqual(scorecard.evaluableClosedTrades, 4, 'Solo 4 evaluables con coste');
  assert.strictEqual(scorecard.uncalculableTradesCount, 11, '11 con coste no documentado');
  assert.strictEqual(scorecard.winningTradesCount, 1);
  assert.strictEqual(scorecard.losingTradesCount, 3);

  // Win Rate must be 1 / 4 = 25.0% (NOT 1 / 15 = 6.67% assuming unknowns lost, NOR 12 / 15 assuming unknowns won!)
  assert.strictEqual(scorecard.winRatePct, 25.0);
  assert.strictEqual(scorecard.accountedRatioPct, 26.666666666666668);
  assert.ok(scorecard.disclaimer.includes('4 de 15 operaciones contabilizadas'));
});

console.log('\n========================================================================');
console.log(`📊 SUITE COMPLETED: ${passCount} PASSED | ${failCount} FAILED`);
console.log('========================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
