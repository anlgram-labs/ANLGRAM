/**
 * ANLGRAM ProfitLab — Calculadora de Ganancias Cripto
 * assets/js/profit-calculator.js
 *
 * Real-Data Informative Crypto Profit & Loss Simulator
 * Integrates CoinGecko Public API v3 with client-side rate-limit caching,
 * input validation, accurate floating-point arithmetic, and transparent disclosures.
 *
 * NON-CUSTODIAL & PRIVACY-FIRST:
 * - 100% Client-side browser calculation.
 * - Zero wallet connection required.
 * - Zero private keys, seed phrases, or sensitive data requested or stored.
 */

'use strict';

// ── Configuration & State ──────────────────────────────────────
const PROFIT_LAB_CONFIG = {
  COINGECKO_BASE: 'https://api.coingecko.com/api/v3',
  PRICE_CACHE_TTL_MS: 30000,   // 30 seconds cache to respect public rate limits
  SEARCH_CACHE_TTL_MS: 60000,  // 60 seconds search cache
  SEARCH_DEBOUNCE_MS: 350,     // 350ms typing debounce
  DEFAULT_COIN: {
    id: 'the-open-network',
    symbol: 'TON',
    name: 'Toncoin',
    icon: '💎'
  },
  POPULAR_COINS: [
    { id: 'the-open-network', symbol: 'TON', name: 'Toncoin', icon: '💎' },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { id: 'solana', symbol: 'SOL', name: 'Solana', icon: '◎' },
    { id: 'binancecoin', symbol: 'BNB', name: 'BNB', icon: '🟡' },
    { id: 'ripple', symbol: 'XRP', name: 'XRP', icon: '✕' },
    { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', icon: '🐕' },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano', icon: '₳' },
    { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', icon: '🔺' },
    { id: 'sui', symbol: 'SUI', name: 'Sui', icon: '💧' }
  ]
};

const ProfitLabState = {
  selectedCoin: { ...PROFIT_LAB_CONFIG.DEFAULT_COIN },
  marketPrice: null,
  marketPriceTime: null,
  marketChange24h: null,
  dataSource: 'Waiting for market data...',
  isRateLimited: false,
  isLoadingPrice: false,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  // Calculator inputs
  buyPrice: 1.35,
  investedAmount: 500,
  sellPrice: 2.70,
  buyFee: 0,
  sellFee: 0,
  buyFeeType: 'usd',   // 'usd' | 'percent'
  sellFeeType: 'usd',  // 'usd' | 'percent'
  buyFeePercent: 0.1,
  sellFeePercent: 0.1,

  // Calculation outputs
  calculation: {
    isValid: true,
    errorMessage: null,
    unitsPurchased: 0,
    actualBuyFee: 0,
    totalCost: 0,
    grossSellProceeds: 0,
    actualSellFee: 0,
    netSellProceeds: 0,
    netProfitLoss: 0,
    roiPercent: 0,
    breakEvenPrice: 0,
    status: 'neutral' // 'profit' | 'loss' | 'breakeven' | 'invalid'
  }
};

// ── In-Memory API Cache ────────────────────────────────────────
const _priceCache = new Map();
const _searchCache = new Map();
let _searchDebounceTimer = null;

// ── Mathematical Core (Real Calculations, Exact Formulas) ───────
function setInvalidCalculation(errorMessage) {
  ProfitLabState.calculation = {
    isValid: false,
    errorMessage,
    status: 'invalid',
    unitsPurchased: 0,
    actualBuyFee: 0,
    totalCost: 0,
    grossSellProceeds: 0,
    actualSellFee: 0,
    netSellProceeds: 0,
    netProfitLoss: 0,
    roiPercent: 0,
    breakEvenPrice: 0
  };
  renderCalculatorOutputs();
}

/**
 * Executes full financial simulation according to specified formulas:
 * 1. Units purchased = invested amount / buy price
 * 2. Total cost = invested amount + buy fee
 * 3. Gross sell proceeds = units purchased * sell price
 * 4. Net sell proceeds = gross sell proceeds - sell fee
 * 5. Net profit or loss = net sell proceeds - total cost
 * 6. ROI (%) = (net profit or loss / total cost) * 100
 */
function calculateProfitLab() {
  const buyEl = document.getElementById('buyPriceInput');
  const investedEl = document.getElementById('investedAmountInput');
  const sellEl = document.getElementById('sellPriceInput');
  const buyFeeEl = document.getElementById('buyFeeInput');
  const sellFeeEl = document.getElementById('sellFeeInput');

  // Check badInput on native inputs (e.g. typing letters in number input)
  if (buyEl && buyEl.validity && buyEl.validity.badInput) {
    return setInvalidCalculation('Buy price contains invalid non-numeric characters.');
  }
  if (investedEl && investedEl.validity && investedEl.validity.badInput) {
    return setInvalidCalculation('Invested amount contains invalid non-numeric characters.');
  }
  if (sellEl && sellEl.validity && sellEl.validity.badInput) {
    return setInvalidCalculation('Sell price contains invalid non-numeric characters.');
  }
  if (buyFeeEl && buyFeeEl.validity && buyFeeEl.validity.badInput) {
    return setInvalidCalculation('Buy fee contains invalid non-numeric characters.');
  }
  if (sellFeeEl && sellFeeEl.validity && sellFeeEl.validity.badInput) {
    return setInvalidCalculation('Sell fee contains invalid non-numeric characters.');
  }

  // Check empty or whitespace values
  const rawBuy = String(ProfitLabState.buyPrice ?? '').trim();
  const rawInvested = String(ProfitLabState.investedAmount ?? '').trim();
  const rawSell = String(ProfitLabState.sellPrice ?? '').trim();
  const rawBuyFee = String(ProfitLabState.buyFee ?? '').trim();
  const rawSellFee = String(ProfitLabState.sellFee ?? '').trim();

  if (rawBuy === '') {
    return setInvalidCalculation('Buy price cannot be empty.');
  }
  if (rawInvested === '') {
    return setInvalidCalculation('Invested amount cannot be empty.');
  }
  if (rawSell === '') {
    return setInvalidCalculation('Sell price cannot be empty.');
  }

  const buyPrice = Number(rawBuy);
  const investedAmount = Number(rawInvested);
  const sellPrice = Number(rawSell);

  // Input Validations
  if (isNaN(buyPrice) || buyPrice <= 0) {
    return setInvalidCalculation('Buy price must be a number greater than 0.');
  }

  if (isNaN(investedAmount) || investedAmount < 0) {
    return setInvalidCalculation('Invested amount cannot be negative.');
  }

  if (isNaN(sellPrice) || sellPrice < 0) {
    return setInvalidCalculation('Sell price cannot be negative.');
  }

  // Fees computation & validation
  let actualBuyFee = 0;
  if (ProfitLabState.buyFeeType === 'percent') {
    const rawPct = String(ProfitLabState.buyFeePercent ?? '').trim();
    const pct = Number(rawPct);
    if (isNaN(pct) || pct < 0) {
      return setInvalidCalculation('Buy fee percentage cannot be negative.');
    }
    actualBuyFee = (investedAmount * pct) / 100;
  } else {
    if (rawBuyFee !== '') {
      const feeNum = Number(rawBuyFee);
      if (isNaN(feeNum) || feeNum < 0) {
        return setInvalidCalculation('Buy fee cannot be negative.');
      }
      actualBuyFee = feeNum;
    } else {
      actualBuyFee = 0;
    }
  }

  // 1. Unidades compradas = monto invertido / precio de compra
  const unitsPurchased = investedAmount / buyPrice;

  // 2. Costo total = monto invertido + comisión de compra
  const totalCost = investedAmount + actualBuyFee;

  // 3. Valor bruto de venta = unidades compradas * precio de venta
  const grossSellProceeds = unitsPurchased * sellPrice;

  // Calculate actual sell fee & validate
  let actualSellFee = 0;
  if (ProfitLabState.sellFeeType === 'percent') {
    const rawPct = String(ProfitLabState.sellFeePercent ?? '').trim();
    const pct = Number(rawPct);
    if (isNaN(pct) || pct < 0) {
      return setInvalidCalculation('Sell fee percentage cannot be negative.');
    }
    actualSellFee = (grossSellProceeds * pct) / 100;
  } else {
    if (rawSellFee !== '') {
      const feeNum = Number(rawSellFee);
      if (isNaN(feeNum) || feeNum < 0) {
        return setInvalidCalculation('Sell fee cannot be negative.');
      }
      actualSellFee = feeNum;
    } else {
      actualSellFee = 0;
    }
  }

  // 4. Ingreso neto de venta = valor bruto de venta - comisión de venta
  const netSellProceeds = grossSellProceeds - actualSellFee;

  // 5. Ganancia o pérdida neta = ingreso neto de venta - costo total
  const netProfitLoss = netSellProceeds - totalCost;

  // 6. ROI (%) = ganancia o pérdida neta / costo total * 100
  let roiPercent = 0;
  if (totalCost > 0) {
    roiPercent = (netProfitLoss / totalCost) * 100;
  }

  // 7. Break-even Price (Precio unitario mínimo necesario para no perder capital)
  let breakEvenPrice = 0;
  if (unitsPurchased > 0) {
    if (ProfitLabState.sellFeeType === 'percent') {
      const sellFeeRatio = (Number(ProfitLabState.sellFeePercent) || 0) / 100;
      if (sellFeeRatio < 1) {
        breakEvenPrice = totalCost / (unitsPurchased * (1 - sellFeeRatio));
      }
    } else {
      breakEvenPrice = (totalCost + actualSellFee) / unitsPurchased;
    }
  }

  // Determine status (allowing delta threshold of $0.005 for breakeven)
  let status = 'breakeven';
  if (netProfitLoss > 0.005) {
    status = 'profit';
  } else if (netProfitLoss < -0.005) {
    status = 'loss';
  }

  ProfitLabState.calculation = {
    isValid: true,
    errorMessage: null,
    unitsPurchased,
    actualBuyFee,
    totalCost,
    grossSellProceeds,
    actualSellFee,
    netSellProceeds,
    netProfitLoss,
    roiPercent,
    breakEvenPrice,
    status
  };

  renderCalculatorOutputs();
}

// ── Market Data Service (CoinGecko Public API & Fallbacks) ───────
/**
 * Fetches live market price for a given coin ID
 */
async function fetchCoinPrice(coinId) {
  if (!coinId) return;

  const now = Date.now();
  const cached = _priceCache.get(coinId);
  if (cached && (now - cached.timestamp < PROFIT_LAB_CONFIG.PRICE_CACHE_TTL_MS)) {
    applyMarketPriceData(cached.price, cached.change24h, cached.lastUpdatedAt, cached.source, false);
    return;
  }

  ProfitLabState.isLoadingPrice = true;
  updateMarketBadgeUI('loading');

  try {
    const url = `${PROFIT_LAB_CONFIG.COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (res.status === 429) {
      ProfitLabState.isRateLimited = true;
      updateMarketBadgeUI('rate-limited');
      ProfitLabState.isLoadingPrice = false;
      return;
    }

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = await res.json();
    if (data && data[coinId] && data[coinId].usd !== undefined) {
      const price = Number(data[coinId].usd);
      const change24h = data[coinId].usd_24h_change !== undefined ? Number(data[coinId].usd_24h_change) : null;
      const lastUpdatedAt = data[coinId].last_updated_at ? new Date(data[coinId].last_updated_at * 1000) : new Date();

      _priceCache.set(coinId, {
        price,
        change24h,
        lastUpdatedAt,
        timestamp: now,
        source: 'CoinGecko Public API v3'
      });

      applyMarketPriceData(price, change24h, lastUpdatedAt, 'CoinGecko Public API v3', false);
    } else {
      updateMarketBadgeUI('unavailable');
    }
  } catch (err) {
    console.warn(`[ProfitLab] Price fetch failed for ${coinId}:`, err);
    // If querying TON and CoinGecko fails, fallback to TonAPI rates
    if (coinId === 'the-open-network') {
      tryFallbackTonApi();
      return;
    }
    updateMarketBadgeUI('unavailable');
  } finally {
    ProfitLabState.isLoadingPrice = false;
  }
}

/**
 * Fallback to TonAPI if querying TON token rate fails
 */
async function tryFallbackTonApi() {
  try {
    const res = await fetch('https://tonapi.io/v2/rates?tokens=ton&currencies=usd');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.TON && data.rates.TON.prices && data.rates.TON.prices.USD) {
        const price = Number(data.rates.TON.prices.USD);
        const change24h = data.rates.TON.diff_24h && data.rates.TON.diff_24h.USD ? parseFloat(data.rates.TON.diff_24h.USD) : null;
        const lastUpdatedAt = new Date();
        applyMarketPriceData(price, change24h, lastUpdatedAt, 'TonAPI v2 Public Rates', false);
        return;
      }
    }
  } catch (e) {}
  updateMarketBadgeUI('unavailable');
}

/**
 * Applies retrieved price to state without overwriting user inputs
 */
function applyMarketPriceData(price, change24h, lastUpdatedAt, source, isRateLimited) {
  ProfitLabState.marketPrice = price;
  ProfitLabState.marketChange24h = change24h;
  ProfitLabState.marketPriceTime = lastUpdatedAt;
  ProfitLabState.dataSource = source;
  ProfitLabState.isRateLimited = isRateLimited;
  updateMarketBadgeUI('ready');
}

/**
 * Searches coins via CoinGecko Search API
 */
async function searchCoins(query) {
  const clean = query.trim().toLowerCase();
  if (!clean) {
    ProfitLabState.searchResults = [];
    renderSearchResults([]);
    return;
  }

  const cached = _searchCache.get(clean);
  if (cached && (Date.now() - cached.timestamp < PROFIT_LAB_CONFIG.SEARCH_CACHE_TTL_MS)) {
    renderSearchResults(cached.results);
    return;
  }

  ProfitLabState.isSearching = true;
  renderSearchLoading(true);

  try {
    const res = await fetch(`${PROFIT_LAB_CONFIG.COINGECKO_BASE}/search?query=${encodeURIComponent(clean)}`);
    if (res.status === 429) {
      renderSearchRateLimited();
      return;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const coins = (data.coins || []).slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      symbol: (c.symbol || '').toUpperCase(),
      rank: c.market_cap_rank,
      thumb: c.thumb,
      icon: '🪙'
    }));

    _searchCache.set(clean, { results: coins, timestamp: Date.now() });
    renderSearchResults(coins);
  } catch (err) {
    console.warn('[ProfitLab] Coin search error:', err);
    renderSearchError();
  } finally {
    ProfitLabState.isSearching = false;
    renderSearchLoading(false);
  }
}

// ── UI Rendering & Event Handling ──────────────────────────────
function updateMarketBadgeUI(status) {
  const badgeWrap = document.getElementById('marketPriceBadgeWrap');
  const priceVal = document.getElementById('marketPriceVal');
  const changeVal = document.getElementById('marketPriceChange');
  const sourceVal = document.getElementById('marketDataSource');
  const loadBuyBtn = document.getElementById('useMarketPriceBuyBtn');
  const loadSellBtn = document.getElementById('useMarketPriceSellBtn');

  if (!badgeWrap) return;

  if (status === 'loading') {
    if (priceVal) priceVal.textContent = 'Fetching price...';
    if (changeVal) changeVal.textContent = '';
    if (sourceVal) sourceVal.textContent = 'Connecting to CoinGecko...';
    if (loadBuyBtn) loadBuyBtn.disabled = true;
    if (loadSellBtn) loadSellBtn.disabled = true;
  } else if (status === 'rate-limited') {
    if (priceVal) priceVal.textContent = 'Public API Rate Limit Reached';
    if (changeVal) changeVal.textContent = '';
    if (sourceVal) sourceVal.innerHTML = '<span style="color:#f59e0b;">Public rate quota temporarily exceeded (CoinGecko). Enter price manually.</span>';
    if (loadBuyBtn) loadBuyBtn.disabled = true;
    if (loadSellBtn) loadSellBtn.disabled = true;
  } else if (status === 'unavailable') {
    if (priceVal) priceVal.textContent = 'Price Unavailable';
    if (changeVal) changeVal.textContent = '';
    if (sourceVal) sourceVal.textContent = 'Market quote unavailable. You can enter prices manually.';
    if (loadBuyBtn) loadBuyBtn.disabled = true;
    if (loadSellBtn) loadSellBtn.disabled = true;
  } else if (status === 'ready' && ProfitLabState.marketPrice !== null) {
    const formattedPrice = formatCurrencyUSD(ProfitLabState.marketPrice);
    if (priceVal) priceVal.textContent = `${formattedPrice} USD`;

    if (changeVal) {
      if (ProfitLabState.marketChange24h !== null) {
        const sign = ProfitLabState.marketChange24h >= 0 ? '+' : '';
        const cls = ProfitLabState.marketChange24h >= 0 ? 'text-green' : 'text-red';
        changeVal.className = cls;
        changeVal.textContent = ` (${sign}${ProfitLabState.marketChange24h.toFixed(2)}% 24h)`;
      } else {
        changeVal.textContent = '';
      }
    }

    if (sourceVal) {
      const timeStr = ProfitLabState.marketPriceTime ? ProfitLabState.marketPriceTime.toLocaleTimeString() : 'Recent';
      sourceVal.textContent = `Source: ${ProfitLabState.dataSource} · Last updated: ${timeStr}`;
    }

    if (loadBuyBtn) loadBuyBtn.disabled = false;
    if (loadSellBtn) loadSellBtn.disabled = false;
  }
}

function renderCalculatorOutputs() {
  const calc = ProfitLabState.calculation;
  const statusBox = document.getElementById('resultStatusBox');
  const mainTitle = document.getElementById('resultMainTitle');
  const mainAmount = document.getElementById('resultMainAmount');
  const roiBadge = document.getElementById('resultRoiBadge');
  const statusBadge = document.getElementById('resultStatusBadge');
  const errorAlert = document.getElementById('calcErrorAlert');

  // Specific detail metric spans
  const elUnits = document.getElementById('resUnitsPurchased');
  const elTotalCost = document.getElementById('resTotalCost');
  const elGrossSell = document.getElementById('resGrossSell');
  const elTotalFees = document.getElementById('resTotalFees');
  const elNetSell = document.getElementById('resNetSell');
  const elNetProfit = document.getElementById('resNetProfit');
  const elRoi = document.getElementById('resRoi');
  const elBreakEven = document.getElementById('resBreakEven');

  if (!calc.isValid) {
    if (errorAlert) {
      errorAlert.style.display = 'block';
      errorAlert.textContent = calc.errorMessage || 'Invalid numerical values.';
    }
    if (statusBox) {
      statusBox.className = 'calc-summary-card card-invalid';
    }
    if (mainTitle) mainTitle.textContent = 'Calculation Blocked';
    if (mainAmount) {
      mainAmount.textContent = '— USD';
      mainAmount.className = 'summary-amount text-muted';
    }
    if (roiBadge) {
      roiBadge.textContent = '0.00% ROI';
      roiBadge.className = 'badge badge-muted';
    }
    if (statusBadge) {
      statusBadge.textContent = 'CHECK INPUT VALUES';
      statusBadge.className = 'badge badge-muted';
    }
    if (elUnits) elUnits.textContent = '— ' + (ProfitLabState.selectedCoin.symbol || 'UNITS');
    if (elTotalCost) elTotalCost.textContent = '— USD';
    if (elGrossSell) elGrossSell.textContent = '— USD';
    if (elTotalFees) elTotalFees.textContent = '— USD';
    if (elNetSell) elNetSell.textContent = '— USD';
    if (elNetProfit) {
      elNetProfit.textContent = '— USD';
      elNetProfit.className = 'metric-mini-val text-muted';
    }
    if (elRoi) {
      elRoi.textContent = '— %';
      elRoi.className = 'metric-mini-val text-muted';
    }
    if (elBreakEven) elBreakEven.textContent = '— USD';
    return;
  }

  if (errorAlert) errorAlert.style.display = 'none';

  // Format outputs
  const symbol = ProfitLabState.selectedCoin.symbol || 'UNITS';
  const formattedUnits = formatCryptoUnits(calc.unitsPurchased);
  const formattedTotalCost = formatCurrencyUSD(calc.totalCost);
  const formattedGrossSell = formatCurrencyUSD(calc.grossSellProceeds);
  const formattedTotalFees = formatCurrencyUSD(calc.actualBuyFee + calc.actualSellFee);
  const formattedNetSell = formatCurrencyUSD(calc.netSellProceeds);
  const formattedNetProfit = formatCurrencyUSD(Math.abs(calc.netProfitLoss));
  const formattedBreakEven = formatCurrencyUSD(calc.breakEvenPrice);
  const formattedRoi = (calc.roiPercent >= 0 ? '+' : '') + calc.roiPercent.toFixed(2) + '%';

  if (elUnits) elUnits.textContent = `${formattedUnits} ${symbol}`;
  if (elTotalCost) elTotalCost.textContent = `${formattedTotalCost} USD`;
  if (elGrossSell) elGrossSell.textContent = `${formattedGrossSell} USD`;
  if (elTotalFees) elTotalFees.textContent = `${formattedTotalFees} USD`;
  if (elNetSell) elNetSell.textContent = `${formattedNetSell} USD`;
  if (elNetProfit) {
    const sign = calc.netProfitLoss >= 0 ? '+' : '-';
    elNetProfit.textContent = `${sign}${formattedNetProfit} USD`;
    elNetProfit.className = calc.netProfitLoss >= 0 ? 'metric-val text-green' : 'metric-val text-red';
  }
  if (elRoi) {
    elRoi.textContent = formattedRoi;
    elRoi.className = calc.roiPercent >= 0 ? 'metric-val text-green' : 'metric-val text-red';
  }
  if (elBreakEven) elBreakEven.textContent = `${formattedBreakEven} USD`;

  // Main Banner Visual Styling
  if (calc.status === 'profit') {
    if (statusBox) statusBox.className = 'calc-summary-card card-profit';
    if (mainTitle) mainTitle.textContent = 'Estimated Net Profit';
    if (mainAmount) {
      mainAmount.textContent = `+${formattedNetProfit} USD`;
      mainAmount.className = 'summary-amount text-green';
    }
    if (roiBadge) {
      roiBadge.textContent = `▲ ${formattedRoi} ROI`;
      roiBadge.className = 'badge badge-green';
    }
    if (statusBadge) {
      statusBadge.textContent = 'PROFITABLE SCENARIO';
      statusBadge.className = 'badge badge-green';
    }
  } else if (calc.status === 'loss') {
    if (statusBox) statusBox.className = 'calc-summary-card card-loss';
    if (mainTitle) mainTitle.textContent = 'Estimated Net Loss';
    if (mainAmount) {
      mainAmount.textContent = `-${formattedNetProfit} USD`;
      mainAmount.className = 'summary-amount text-red';
    }
    if (roiBadge) {
      roiBadge.textContent = `▼ ${formattedRoi} ROI`;
      roiBadge.className = 'badge badge-red';
    }
    if (statusBadge) {
      statusBadge.textContent = 'LOSS SCENARIO';
      statusBadge.className = 'badge badge-red';
    }
  } else {
    // Breakeven
    if (statusBox) statusBox.className = 'calc-summary-card card-breakeven';
    if (mainTitle) mainTitle.textContent = 'Break-Even';
    if (mainAmount) {
      mainAmount.textContent = `$0.00 USD`;
      mainAmount.className = 'summary-amount text-cyan';
    }
    if (roiBadge) {
      roiBadge.textContent = `0.00% ROI`;
      roiBadge.className = 'badge badge-cyan';
    }
    if (statusBadge) {
      statusBadge.textContent = 'BREAK-EVEN (NO P&L)';
      statusBadge.className = 'badge badge-muted';
    }
  }
}

// ── Search & Dropdown Rendering ────────────────────────────────
function renderSearchResults(coins) {
  const list = document.getElementById('coinSearchResults');
  if (!list) return;

  if (!coins || coins.length === 0) {
    list.innerHTML = '<div class="search-empty">No matching cryptocurrencies found. You can enter prices manually.</div>';
    list.style.display = 'block';
    return;
  }

  list.innerHTML = coins.map(coin => `
    <div class="search-item" onclick="window.selectProfitCoin('${escapeAttr(coin.id)}', '${escapeAttr(coin.name)}', '${escapeAttr(coin.symbol)}')">
      <div class="search-item-icon">
        ${coin.thumb ? `<img src="${escapeAttr(coin.thumb)}" alt="${escapeAttr(coin.symbol)}" onerror="this.src='';this.innerText='🪙';"/>` : '🪙'}
      </div>
      <div class="search-item-info">
        <span class="search-item-name">${escapeText(coin.name)}</span>
        <span class="search-item-symbol">${escapeText(coin.symbol)}</span>
      </div>
      ${coin.rank ? `<span class="badge badge-muted" style="margin-left:auto;font-size:10px;">#${coin.rank}</span>` : ''}
    </div>
  `).join('');

  list.style.display = 'block';
}

function renderSearchLoading(isLoading) {
  const list = document.getElementById('coinSearchResults');
  if (!list) return;
  if (isLoading) {
    list.innerHTML = '<div class="search-loading"><div class="mini-spinner"></div> Searching CoinGecko catalog...</div>';
    list.style.display = 'block';
  }
}

function renderSearchRateLimited() {
  const list = document.getElementById('coinSearchResults');
  if (!list) return;
  list.innerHTML = '<div class="search-empty" style="color:#f59e0b;">Public catalog search limit reached temporarily. You can enter buy and sell prices manually.</div>';
  list.style.display = 'block';
}

function renderSearchError() {
  const list = document.getElementById('coinSearchResults');
  if (!list) return;
  list.innerHTML = '<div class="search-empty">Could not query catalog at this time. Please enter values manually.</div>';
  list.style.display = 'block';
}

// ── Actions & Helpers ──────────────────────────────────────────
function selectProfitCoin(id, name, symbol) {
  ProfitLabState.selectedCoin = { id, name, symbol };

  const nameEl = document.getElementById('selectedCoinName');
  const symbolEl = document.getElementById('selectedCoinSymbol');
  const searchInput = document.getElementById('coinSearchInput');
  const list = document.getElementById('coinSearchResults');

  if (nameEl) nameEl.textContent = name;
  if (symbolEl) symbolEl.textContent = symbol;
  if (searchInput) searchInput.value = '';
  if (list) list.style.display = 'none';

  // Highlight active chips
  document.querySelectorAll('.coin-chip').forEach(chip => {
    if (chip.getAttribute('data-id') === id) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // Fetch live market price
  fetchCoinPrice(id);
}

function loadMarketPriceToField(targetField) {
  if (ProfitLabState.marketPrice === null || ProfitLabState.marketPrice <= 0) return;

  if (targetField === 'buy') {
    ProfitLabState.buyPrice = ProfitLabState.marketPrice;
    const input = document.getElementById('buyPriceInput');
    if (input) input.value = ProfitLabState.marketPrice;
  } else if (targetField === 'sell') {
    ProfitLabState.sellPrice = ProfitLabState.marketPrice;
    const input = document.getElementById('sellPriceInput');
    if (input) input.value = ProfitLabState.marketPrice;
  }

  calculateProfitLab();
}

function applyTargetMultiplier(multiplierPct) {
  const buyPrice = Number(ProfitLabState.buyPrice);
  if (isNaN(buyPrice) || buyPrice <= 0) {
    alert('Please enter a valid buy price first to project target.');
    return;
  }

  const targetSellPrice = buyPrice * (1 + (multiplierPct / 100));
  ProfitLabState.sellPrice = Number(targetSellPrice.toFixed(8));

  const input = document.getElementById('sellPriceInput');
  if (input) input.value = ProfitLabState.sellPrice;

  calculateProfitLab();
}

function applyTotalLossScenario() {
  ProfitLabState.sellPrice = 0;
  const input = document.getElementById('sellPriceInput');
  if (input) input.value = 0;
  calculateProfitLab();
}

function applyBreakEvenScenario() {
  const calc = ProfitLabState.calculation;
  if (!calc.isValid || calc.breakEvenPrice <= 0) return;

  ProfitLabState.sellPrice = Number(calc.breakEvenPrice.toFixed(8));
  const input = document.getElementById('sellPriceInput');
  if (input) input.value = ProfitLabState.sellPrice;
  calculateProfitLab();
}

function setInvestedPreset(amount) {
  ProfitLabState.investedAmount = amount;
  const input = document.getElementById('investedAmountInput');
  if (input) input.value = amount;
  calculateProfitLab();
}

// ── Formatting Utilities ───────────────────────────────────────
function formatCurrencyUSD(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  const num = Number(val);
  if (Math.abs(num) >= 1) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  }
  if (Math.abs(num) >= 0.0001) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(num);
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 8
  }).format(num);
}

function formatCryptoUnits(val) {
  if (!val || isNaN(val)) return '0';
  const num = Number(val);
  if (num >= 1000) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }
  if (num >= 1) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(num);
}

function escapeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Initialization ─────────────────────────────────────────────
function initProfitLab() {
  // Bind inputs
  const buyPriceInput = document.getElementById('buyPriceInput');
  const investedAmountInput = document.getElementById('investedAmountInput');
  const sellPriceInput = document.getElementById('sellPriceInput');
  const buyFeeInput = document.getElementById('buyFeeInput');
  const sellFeeInput = document.getElementById('sellFeeInput');
  const coinSearchInput = document.getElementById('coinSearchInput');

  if (buyPriceInput) {
    buyPriceInput.value = ProfitLabState.buyPrice;
    buyPriceInput.addEventListener('input', e => {
      ProfitLabState.buyPrice = e.target.value;
      calculateProfitLab();
    });
  }

  if (investedAmountInput) {
    investedAmountInput.value = ProfitLabState.investedAmount;
    investedAmountInput.addEventListener('input', e => {
      ProfitLabState.investedAmount = e.target.value;
      calculateProfitLab();
    });
  }

  if (sellPriceInput) {
    sellPriceInput.value = ProfitLabState.sellPrice;
    sellPriceInput.addEventListener('input', e => {
      ProfitLabState.sellPrice = e.target.value;
      calculateProfitLab();
    });
  }

  if (buyFeeInput) {
    buyFeeInput.value = ProfitLabState.buyFee;
    buyFeeInput.addEventListener('input', e => {
      ProfitLabState.buyFee = e.target.value;
      calculateProfitLab();
    });
  }

  if (sellFeeInput) {
    sellFeeInput.value = ProfitLabState.sellFee;
    sellFeeInput.addEventListener('input', e => {
      ProfitLabState.sellFee = e.target.value;
      calculateProfitLab();
    });
  }

  if (coinSearchInput) {
    coinSearchInput.addEventListener('input', e => {
      const q = e.target.value;
      clearTimeout(_searchDebounceTimer);
      if (!q.trim()) {
        const list = document.getElementById('coinSearchResults');
        if (list) list.style.display = 'none';
        return;
      }
      _searchDebounceTimer = setTimeout(() => searchCoins(q), PROFIT_LAB_CONFIG.SEARCH_DEBOUNCE_MS);
    });

    // Close dropdown on outside click
    document.addEventListener('click', e => {
      const searchWrap = document.getElementById('coinSearchWrap');
      const list = document.getElementById('coinSearchResults');
      if (searchWrap && !searchWrap.contains(e.target) && list) {
        list.style.display = 'none';
      }
    });
  }

  // Initial calculation and price fetch for default coin (TON)
  fetchCoinPrice(ProfitLabState.selectedCoin.id);
  calculateProfitLab();
}

// Global exports
window.ProfitLabState = ProfitLabState;
window.selectProfitCoin = selectProfitCoin;
window.loadMarketPriceToField = loadMarketPriceToField;
window.applyTargetMultiplier = applyTargetMultiplier;
window.applyTotalLossScenario = applyTotalLossScenario;
window.applyBreakEvenScenario = applyBreakEvenScenario;
window.setInvestedPreset = setInvestedPreset;
window.calculateProfitLab = calculateProfitLab;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfitLab);
} else {
  initProfitLab();
}
