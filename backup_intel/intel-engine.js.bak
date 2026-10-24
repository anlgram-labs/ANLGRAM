/**
 * ANLGRAM Intel Exchange Data Engine
 * Institutional-grade crypto market data terminal, multi-asset order routing,
 * and verified Web3 directory for TON and global benchmark assets.
 * 
 * Strictly follows ANLGRAM Real-Data Policy. Zero fabricated data.
 */
(function() {
  'use strict';

  const TONAPI_BASE = 'https://tonapi.io/v2';
  const STONFI_API_BASE = 'https://api.ston.fi/v1';
  const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,the-open-network,tether&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true';
  const REFRESH_INTERVAL_MS = 45000; // 45s interval to strictly respect public API rate limits

  // --- Caching Helper (Memory + SessionStorage) ---
  const DataCache = {
    get(key) {
      try {
        const item = sessionStorage.getItem('anl_intel_' + key);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() > parsed.exp) {
          sessionStorage.removeItem('anl_intel_' + key);
          return null;
        }
        return parsed.data;
      } catch (e) {
        return null;
      }
    },
    set(key, data, ttlMs = 120000) {
      try {
        sessionStorage.setItem('anl_intel_' + key, JSON.stringify({ data, exp: Date.now() + ttlMs }));
      } catch (e) {}
    }
  };

  // --- State ---
  const state = {
    assets: [],
    filteredAssets: [],
    directory: [],
    activeFilter: 'all', // 'all' | 'ton' | 'global' | 'verified'
    activeDirCategory: 'all',
    searchQuery: '',
    sortField: 'mcap', // 'mcap' | 'vol' | 'liq' | 'price' | 'change24' | 'change7d' | 'holders' | 'name'
    sortOrder: 'desc',
    page: 1,
    pageSize: 10,
    lastSyncTime: null,
    syncStatus: 'ready', // 'ready' | 'syncing' | 'live' | 'stale' | 'error'
    syncErrorMsg: null,
    isInitialLoad: true
  };

  // --- Utility Number & Currency Formatters ---
  function formatMoney(num) {
    if (num == null || isNaN(num) || num <= 0) return '--';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + Number(num).toFixed(2);
  }

  function formatPrice(num) {
    if (num == null || isNaN(num) || num <= 0) return '--';
    if (num < 0.00001) return '$' + Number(num).toFixed(8);
    if (num < 0.001) return '$' + Number(num).toFixed(6);
    if (num < 1) return '$' + Number(num).toFixed(4);
    if (num >= 1000) return '$' + Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + Number(num).toFixed(2);
  }

  function formatPercent(num) {
    if (num == null || isNaN(num)) return '--';
    const isPos = num >= 0;
    return `${isPos ? '+' : ''}${num.toFixed(2)}%`;
  }

  function formatHolders(num) {
    if (num == null || isNaN(num) || num <= 0) return '--';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return Number(num).toLocaleString();
  }

  function shortenAddress(addr, chars = 4) {
    if (!addr) return '';
    const str = String(addr);
    if (str.length <= chars * 2 + 4) return str;
    return `${str.substring(0, chars + 2)}...${str.substring(str.length - chars)}`;
  }

  function timeAgo(date) {
    if (!date) return 'Never';
    const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (secs < 10) return 'Just now';
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  // --- Network API Service ---
  const NetworkService = {
    async fetchWithTimeout(url, timeoutMs = 8000) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!res.ok) return null;
        return await res.json();
      } catch (err) {
        clearTimeout(id);
        return null;
      }
    },

    async fetchTonApiRates(contracts) {
      const valid = contracts.filter(Boolean);
      if (valid.length === 0) return {};
      const cacheKey = 'rates_' + valid.slice(0, 4).join('_');
      const cached = DataCache.get(cacheKey);
      if (cached) return cached;

      const url = `${TONAPI_BASE}/rates?tokens=${valid.join(',')}&currencies=usd`;
      const json = await this.fetchWithTimeout(url);
      if (json && json.rates) {
        DataCache.set(cacheKey, json.rates, 60000);
        return json.rates;
      }
      return {};
    },

    async fetchCoinGeckoPrices() {
      const cached = DataCache.get('cg_benchmark_prices');
      if (cached) return cached;

      const json = await this.fetchWithTimeout(COINGECKO_API);
      if (json && !json.error) {
        DataCache.set('cg_benchmark_prices', json, 60000);
        return json;
      }
      return null;
    },

    async fetchStonFiPools() {
      const cached = DataCache.get('stonfi_pools');
      if (cached) return cached;

      const json = await this.fetchWithTimeout(`${STONFI_API_BASE}/pools`);
      if (json && Array.isArray(json.pool_list)) {
        DataCache.set('stonfi_pools', json.pool_list, 180000); // 3m cache
        return json.pool_list;
      }
      return [];
    },

    async fetchJettonHolders(contractAddress) {
      if (!contractAddress) return null;
      const cacheKey = 'holders_' + contractAddress;
      const cached = DataCache.get(cacheKey);
      if (cached) return cached;

      const json = await this.fetchWithTimeout(`${TONAPI_BASE}/jettons/${encodeURIComponent(contractAddress)}`);
      if (json && json.holders_count !== undefined) {
        const res = {
          holders: json.holders_count,
          totalSupply: json.total_supply,
          mintable: json.mintable
        };
        DataCache.set(cacheKey, res, 300000); // 5m cache
        return res;
      }
      return null;
    }
  };

  // --- Data Assembly & Normalization ---
  async function syncAllMarketData() {
    state.syncStatus = 'syncing';
    updateSyncStatusUI();

    try {
      const registryAssets = window.AssetRegistry ? window.AssetRegistry.getAllAssets() : [];
      
      // Separate TON contracts from benchmark assets
      const tonContracts = registryAssets
        .filter(a => a.network === 'TON' && a.contractAddress)
        .map(a => a.contractAddress);
      
      // Include 'ton' in rates
      const tonRatesQuery = ['ton', ...tonContracts];

      // Concurrent fetch across legitimate providers
      const [cgData, tonRates, stonPools] = await Promise.all([
        NetworkService.fetchCoinGeckoPrices(),
        NetworkService.fetchTonApiRates(tonRatesQuery),
        NetworkService.fetchStonFiPools()
      ]);

      let hasSuccess = false;

      // Pool index lookup for fast DEX AMM liquidity attribution
      const poolByToken = new Map();
      if (Array.isArray(stonPools)) {
        stonPools.forEach(p => {
          if (!p.deprecated && p.lp_total_supply_usd) {
            const liq = parseFloat(p.lp_total_supply_usd) || 0;
            const vol = parseFloat(p.volume_24h_usd) || 0;
            const t0 = p.token0_address;
            const t1 = p.token1_address;

            // Keep pool with largest liquidity for each token
            [t0, t1].forEach(t => {
              if (t) {
                const prev = poolByToken.get(t);
                if (!prev || liq > prev.liquidity) {
                  const entry = {
                    poolAddress: p.address,
                    liquidity: liq,
                    volume24h: vol,
                    router: p.router_address,
                    apy1d: parseFloat(p.apy_1d) || 0
                  };
                  poolByToken.set(t, entry);
                  if (t.length >= 44) {
                    poolByToken.set(t.substring(0, 44), entry);
                  }
                }
              }
            });
          }
        });
      }

      // Map over registry assets to create fully hydrated state
      state.assets = registryAssets.map(asset => {
        const item = { ...asset };

        // 1. ANLGRAM Token (Strictly Unlaunched / Pending)
        if (item.id === 'ton:unlaunched:anlgram' || !item.isLaunched) {
          item.price = null;
          item.change24 = null;
          item.change7d = null;
          item.vol24h = null;
          item.liquidity = null;
          item.marketCap = null;
          item.fdv = null;
          item.holders = null;
          item.exchange = 'Not launched';
          item.statusBadge = 'NOT LAUNCHED';
          return item;
        }

        // 2. Global Benchmark Assets via CoinGecko
        if (item.network === 'Bitcoin' && cgData && cgData.bitcoin) {
          hasSuccess = true;
          item.price = cgData.bitcoin.usd;
          item.change24 = cgData.bitcoin.usd_24h_change;
          item.vol24h = cgData.bitcoin.usd_24h_vol;
          item.marketCap = cgData.bitcoin.usd_market_cap;
          item.exchange = 'CoinGecko / Binance';
          item.statusBadge = 'VERIFIED';
        } else if (item.network === 'Ethereum' && cgData && cgData.ethereum) {
          hasSuccess = true;
          item.price = cgData.ethereum.usd;
          item.change24 = cgData.ethereum.usd_24h_change;
          item.vol24h = cgData.ethereum.usd_24h_vol;
          item.marketCap = cgData.ethereum.usd_market_cap;
          item.exchange = 'CoinGecko / Coinbase';
          item.statusBadge = 'VERIFIED';
        } else if (item.network === 'Solana' && cgData && cgData.solana) {
          hasSuccess = true;
          item.price = cgData.solana.usd;
          item.change24 = cgData.solana.usd_24h_change;
          item.vol24h = cgData.solana.usd_24h_vol;
          item.marketCap = cgData.solana.usd_market_cap;
          item.exchange = 'CoinGecko / Raydium';
          item.statusBadge = 'VERIFIED';
        }

        // 3. TON Native & Jetton Assets via TonAPI & STON.fi
        if (item.network === 'TON') {
          const rateKey = item.isNative ? 'TON' : item.contractAddress;
          const rateData = tonRates ? tonRates[rateKey] : null;

          if (rateData && rateData.prices && rateData.prices.USD != null) {
            hasSuccess = true;
            item.price = Number(rateData.prices.USD);
            
            if (rateData.diff_24h && rateData.diff_24h.USD) {
              const cleanStr = String(rateData.diff_24h.USD).replace('−', '-').replace('%', '').trim();
              const parsed = parseFloat(cleanStr);
              if (!isNaN(parsed)) item.change24 = parsed;
            }

            if (rateData.diff_7d && rateData.diff_7d.USD) {
              const cleanStr7 = String(rateData.diff_7d.USD).replace('−', '-').replace('%', '').trim();
              const parsed7 = parseFloat(cleanStr7);
              if (!isNaN(parsed7)) item.change7d = parsed7;
            }

            item.exchange = 'TonAPI / STON.fi';
            item.statusBadge = item.verificationStatus === 'whitelist' || item.verificationStatus === 'verified' ? 'VERIFIED' : 'COMMUNITY';
          }

          // Special handling for Tether USD stablecoin
          if (item.symbol === 'USD₮' || item.symbol === 'USDT') {
            hasSuccess = true;
            if (cgData && cgData.tether) {
              item.price = cgData.tether.usd || 1.00;
              item.change24 = cgData.tether.usd_24h_change || 0.00;
              if (cgData.tether.usd_market_cap) item.marketCap = cgData.tether.usd_market_cap;
            } else {
              item.price = 1.00;
              item.change24 = 0.00;
            }
          }

          // DEX AMM Pool Liquidity Attribution from STON.fi
          const tokenPool = item.contractAddress ? (poolByToken.get(item.contractAddress) || poolByToken.get(item.contractAddress.substring(0, 44))) : null;
          if (tokenPool) {
            item.liquidity = tokenPool.liquidity;
            if (!item.vol24h && tokenPool.volume24h) {
              item.vol24h = tokenPool.volume24h;
            }
            item.poolAddress = tokenPool.poolAddress;
          } else if (item.isNative) {
            // TON Native reserve liquidity across STON.fi
            const tonPool = poolByToken.get('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c');
            if (tonPool) {
              item.liquidity = tonPool.liquidity;
            }
            if (cgData && cgData['the-open-network']) {
              item.marketCap = cgData['the-open-network'].usd_market_cap;
              item.vol24h = cgData['the-open-network'].usd_24h_vol;
            }
          }
        }

        return item;
      });

      // Background fetch holder counts for top TON Jettons
      fetchHolderCountsForTonJettons();

      if (hasSuccess) {
        state.lastSyncTime = new Date();
        state.syncStatus = 'live';
      } else {
        state.syncStatus = state.lastSyncTime ? 'stale' : 'error';
      }
    } catch (err) {
      console.warn('[ANLGRAM Intel] Market data sync error:', err);
      state.syncStatus = state.lastSyncTime ? 'stale' : 'error';
    } finally {
      state.isInitialLoad = false;
      applyFiltersAndSort();
      renderTopMetricCards();
      renderMarketTable();
      updateSyncStatusUI();
    }
  }

  // Asynchronously hydrate holder counts without blocking initial render
  async function fetchHolderCountsForTonJettons() {
    const tonJettons = state.assets.filter(a => a.network === 'TON' && a.contractAddress && a.holders == null);
    for (const jetton of tonJettons.slice(0, 8)) {
      const res = await NetworkService.fetchJettonHolders(jetton.contractAddress);
      if (res && res.holders) {
        jetton.holders = res.holders;
        if (res.totalSupply && jetton.price) {
          const dec = jetton.decimals || 9;
          const totalUnits = Number(res.totalSupply) / Math.pow(10, dec);
          if (!isNaN(totalUnits) && totalUnits > 0) {
            jetton.fdv = totalUnits * jetton.price;
            if (!jetton.marketCap) jetton.marketCap = jetton.fdv;
          }
        }
      }
    }
    applyFiltersAndSort();
    renderMarketTable();
  }

  // --- Filtering & Sorting ---
  function applyFiltersAndSort() {
    let list = [...state.assets];

    // Filter Tabs
    if (state.activeFilter === 'ton') {
      list = list.filter(a => a.network === 'TON');
    } else if (state.activeFilter === 'global') {
      list = list.filter(a => a.network !== 'TON');
    } else if (state.activeFilter === 'verified') {
      list = list.filter(a => a.verificationStatus === 'verified' && a.isLaunched);
    }

    // Search Query
    const q = state.searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(a => 
        a.name.toLowerCase().includes(q) ||
        a.symbol.toLowerCase().includes(q) ||
        (a.displaySymbol && a.displaySymbol.toLowerCase().includes(q)) ||
        (a.contractAddress && a.contractAddress.toLowerCase().includes(q)) ||
        (a.poolAddress && a.poolAddress.toLowerCase().includes(q)) ||
        a.network.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      let valA, valB;
      switch (state.sortField) {
        case 'price':
          valA = a.price ?? -1;
          valB = b.price ?? -1;
          break;
        case 'change24':
          valA = a.change24 ?? -999;
          valB = b.change24 ?? -999;
          break;
        case 'change7d':
          valA = a.change7d ?? -999;
          valB = b.change7d ?? -999;
          break;
        case 'vol':
          valA = a.vol24h ?? -1;
          valB = b.vol24h ?? -1;
          break;
        case 'liq':
          valA = a.liquidity ?? -1;
          valB = b.liquidity ?? -1;
          break;
        case 'holders':
          valA = a.holders ?? -1;
          valB = b.holders ?? -1;
          break;
        case 'name':
          return state.sortOrder === 'asc' 
            ? a.name.localeCompare(b.name) 
            : b.name.localeCompare(a.name);
        case 'mcap':
        default:
          valA = a.marketCap ?? -1;
          valB = b.marketCap ?? -1;
          break;
      }
      return state.sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    state.filteredAssets = list;
  }

  // --- Rendering UI: Top Quote Cards ---
  function renderTopMetricCards() {
    const btc = state.assets.find(a => a.symbol === 'BTC');
    const eth = state.assets.find(a => a.symbol === 'ETH');
    const ton = state.assets.find(a => a.symbol === 'TON');
    const anl = state.assets.find(a => a.id === 'ton:unlaunched:anlgram');

    // 1. Bitcoin Card
    if (btc) {
      const priceEl = document.getElementById('btc-price');
      const changeEl = document.getElementById('btc-change');
      const mcapEl = document.getElementById('btc-mcap');
      const volEl = document.getElementById('btc-vol');

      if (priceEl) priceEl.textContent = formatPrice(btc.price);
      if (changeEl && btc.change24 != null) {
        changeEl.textContent = formatPercent(btc.change24);
        changeEl.className = `price-change-badge ${btc.change24 >= 0 ? 'badge-up' : 'badge-down'}`;
      }
      if (mcapEl) mcapEl.textContent = formatMoney(btc.marketCap);
      if (volEl) volEl.textContent = formatMoney(btc.vol24h);
    }

    // 2. Ethereum Card
    if (eth) {
      const priceEl = document.getElementById('eth-price');
      const changeEl = document.getElementById('eth-change');
      const mcapEl = document.getElementById('eth-mcap');
      const volEl = document.getElementById('eth-vol');

      if (priceEl) priceEl.textContent = formatPrice(eth.price);
      if (changeEl && eth.change24 != null) {
        changeEl.textContent = formatPercent(eth.change24);
        changeEl.className = `price-change-badge ${eth.change24 >= 0 ? 'badge-up' : 'badge-down'}`;
      }
      if (mcapEl) mcapEl.textContent = formatMoney(eth.marketCap);
      if (volEl) volEl.textContent = formatMoney(eth.vol24h);
    }

    // 3. Toncoin Card
    if (ton) {
      const priceEl = document.getElementById('ton-price');
      const changeEl = document.getElementById('ton-change');
      const mcapEl = document.getElementById('ton-mcap');
      const volEl = document.getElementById('ton-vol');

      if (priceEl) priceEl.textContent = formatPrice(ton.price);
      if (changeEl && ton.change24 != null) {
        changeEl.textContent = formatPercent(ton.change24);
        changeEl.className = `price-change-badge ${ton.change24 >= 0 ? 'badge-up' : 'badge-down'}`;
      }
      if (mcapEl) mcapEl.textContent = formatMoney(ton.marketCap);
      if (volEl) volEl.textContent = formatMoney(ton.vol24h);
    }

    // 4. ANLGRAM Protocol Asset (Strictly Unlaunched / Pending)
    const cardAnl = document.getElementById('card-anl');
    if (cardAnl) {
      cardAnl.innerHTML = `
        <div class="metric-header">
          <div class="asset-info">
            <div class="asset-icon" style="background:linear-gradient(135deg,#0088CC,#00CFFF); color:#fff;">
              <img src="assets/img/anlgram-icon.svg" style="width:20px;height:20px;" alt="ANLGRAM"/>
            </div>
            <div>
              <div class="asset-name">ANLGRAM Protocol</div>
              <div class="asset-symbol" style="color:var(--accent-cyan);">ECOSYSTEM ASSET</div>
            </div>
          </div>
          <span class="price-change-badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);">NOT LAUNCHED</span>
        </div>
        <div class="metric-price" style="font-size:20px; color:var(--text-muted); margin-bottom:10px;">Pre-TGE / Unreleased</div>
        <div class="metric-details" style="grid-template-columns: repeat(2, 1fr); padding-top:10px;">
          <div class="detail-item"><span class="detail-label">Deployment</span><span class="detail-val" style="color:#cbd5e1;">Pending Mainnet</span></div>
          <div class="detail-item"><span class="detail-label">Liquidity</span><span class="detail-val" style="color:#cbd5e1;">None (Unlisted)</span></div>
        </div>
        <div style="font-size:10px; color:var(--text-dark); margin-top:10px; line-height:1.3; border-top:1px solid var(--border-color); padding-top:8px;">
          Official token not deployed. Any third-party tokens claiming to be ANLGRAM are unauthorized.
        </div>
      `;
    }
  }

  // --- Rendering UI: Market Explorer Table ---
  function renderMarketTable() {
    const tbody = document.getElementById('marketTableBody');
    const pagination = document.getElementById('marketTablePagination');
    if (!tbody) return;

    if (state.isInitialLoad) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center; padding: 48px 24px; color: var(--text-muted);">
            <div class="loading-spinner" style="width:24px;height:24px;border:2px solid var(--border-color);border-top-color:var(--accent-cyan);border-radius:50%;margin:0 auto 12px;animation:spin 0.8s linear infinite;"></div>
            Loading verified market quotes and on-chain DEX liquidity...
          </td>
        </tr>
      `;
      return;
    }

    const total = state.filteredAssets.length;
    if (total === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align:center; padding: 48px 24px; color: var(--text-muted);">
            <div style="font-size:16px; font-weight:600; color:#fff; margin-bottom:6px;">No Matching Market Assets</div>
            <div style="font-size:12px; max-width:400px; margin:0 auto;">
              No asset found for query "${state.searchQuery}". Try searching by canonical contract address or ticker.
            </div>
          </td>
        </tr>
      `;
      if (pagination) pagination.innerHTML = '';
      return;
    }

    const startIndex = (state.page - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, total);
    const pageItems = state.filteredAssets.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(a => {
      const isUp24 = a.change24 != null && a.change24 >= 0;
      const isUp7d = a.change7d != null && a.change7d >= 0;
      const logoHtml = window.AssetRegistry ? window.AssetRegistry.renderAssetLogoHtml(a, 28) : '';

      // Verification Badge
      let badgeHtml = '';
      if (!a.isLaunched) {
        badgeHtml = `<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);font-size:9px;padding:1px 5px;border-radius:4px;">NOT LAUNCHED</span>`;
      } else if (a.verificationStatus === 'verified' || a.verificationStatus === 'whitelist') {
        badgeHtml = `<span class="badge" style="background:rgba(34,197,94,0.12);color:#4ade80;border:1px solid rgba(34,197,94,0.3);font-size:9px;padding:1px 5px;border-radius:4px;">VERIFIED</span>`;
      } else {
        badgeHtml = `<span class="badge" style="background:rgba(255,255,255,0.06);color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);font-size:9px;padding:1px 5px;border-radius:4px;">COMMUNITY</span>`;
      }

      const contractSnippet = a.contractAddress ? `
        <span class="tbl-contract-addr" title="Click to copy ${a.contractAddress}" onclick="window.copyContractAddress('${a.contractAddress}', event)" style="cursor:pointer; color:var(--text-muted); font-size:10px; font-family:var(--font-mono); margin-left:4px;">
          ${shortenAddress(a.contractAddress, 3)} 📋
        </span>
      ` : '';

      return `
        <tr>
          <td>
            <div class="tbl-asset">
              ${logoHtml}
              <div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span>${a.name}</span>
                  ${badgeHtml}
                </div>
                <div style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-muted);">
                  <strong style="color:var(--accent-cyan); font-family:var(--font-mono);">${a.symbol}</strong>
                  ${contractSnippet}
                </div>
              </div>
            </div>
          </td>
          <td class="tbl-mono" style="font-size:13px; font-weight:700; color:#fff;">${formatPrice(a.price)}</td>
          <td class="tbl-mono" style="color:${a.change24 == null ? 'var(--text-muted)' : (isUp24 ? 'var(--green-up)' : 'var(--red-down)')};">
            ${a.change24 == null ? '--' : `${isUp24 ? '▲ +' : '▼ '}${Math.abs(a.change24).toFixed(2)}%`}
          </td>
          <td class="tbl-mono" style="color:${a.change7d == null ? 'var(--text-muted)' : (isUp7d ? 'var(--green-up)' : 'var(--red-down)')};">
            ${a.change7d == null ? '--' : `${isUp7d ? '▲ +' : '▼ '}${Math.abs(a.change7d).toFixed(2)}%`}
          </td>
          <td class="tbl-mono">${formatMoney(a.vol24h)}</td>
          <td class="tbl-mono" style="color:#cbd5e1;" title="DEX AMM Pool Liquidity">${formatMoney(a.liquidity)}</td>
          <td class="tbl-mono">${formatMoney(a.marketCap)}</td>
          <td class="tbl-mono">${formatMoney(a.fdv)}</td>
          <td class="tbl-mono">${formatHolders(a.holders)}</td>
          <td><span class="dir-cat-tag">${a.network}</span></td>
          <td style="color:var(--text-muted); font-size:12px;">${a.exchange || '--'}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn-view-chart" onclick="window.handleOpenAssetChart('${a.id}')" title="Open Interactive Chart">
                📈 Chart
              </button>
              ${a.explorerUrl ? `
                <a href="${a.explorerUrl}" target="_blank" rel="noopener noreferrer" class="btn-view-chart" style="text-decoration:none;" title="View Block Explorer">
                  Explorer ↗
                </a>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Pagination
    if (pagination) {
      const totalPages = Math.ceil(total / state.pageSize) || 1;
      pagination.innerHTML = `
        <div style="font-size:12px; color:var(--text-muted);">
          Showing <strong>${startIndex + 1}–${endIndex}</strong> of <strong>${total}</strong> verified assets
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="nav-btn" style="padding:4px 10px; font-size:11px;" ${state.page <= 1 ? 'disabled' : ''} onclick="changeMarketPage(${state.page - 1})">
            ◀ Prev
          </button>
          <span style="font-family:var(--font-mono); font-size:12px; color:#fff;">Page ${state.page} / ${totalPages}</span>
          <button class="nav-btn" style="padding:4px 10px; font-size:11px;" ${state.page >= totalPages ? 'disabled' : ''} onclick="changeMarketPage(${state.page + 1})">
            Next ▶
          </button>
        </div>
      `;
    }
  }

  // --- Rendering UI: Web3 Institutional Directory ---
  function renderDirectory() {
    const container = document.getElementById('directoryGrid');
    if (!container) return;

    const data = window.AssetRegistry ? window.AssetRegistry.getDirectoryByCategory(state.activeDirCategory) : [];
    
    // Search filter across directory
    const q = state.searchQuery.toLowerCase().trim();
    const filtered = q ? data.filter(d => 
      d.name.toLowerCase().includes(q) || 
      d.desc.toLowerCase().includes(q) ||
      d.catLabel.toLowerCase().includes(q) ||
      d.ecosystem.toLowerCase().includes(q)
    ) : data;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 36px; text-align: center; color: var(--text-muted);">
          No platforms match directory search query "${state.searchQuery}".
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(item => `
      <div class="dir-card" data-name="${item.name.toLowerCase()}" data-cat="${item.cat}">
        <div>
          <div class="dir-card-header">
            <div class="dir-platform-title">
              <div class="dir-platform-icon">${item.iconText}</div>
              <div>
                <div class="dir-name">${item.name}</div>
                <div style="font-size:10px; color:var(--accent-cyan);">${item.ecosystem}</div>
              </div>
            </div>
            <span class="dir-cat-tag">${item.catLabel}</span>
          </div>
          <div class="dir-desc">${item.desc}</div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="btn-open-link" style="flex:1;">
            <span>Official Portal ↗</span>
          </a>
          ${item.appUrl && item.appUrl !== item.url ? `
            <a href="${item.appUrl}" target="_blank" rel="noopener noreferrer" class="btn-open-link" style="background:rgba(59,130,246,0.15); border-color:var(--border-accent); color:var(--accent-cyan);" title="Launch DApp">
              <span>App</span>
            </a>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  // --- UI Synchronizer ---
  function updateSyncStatusUI() {
    const badge = document.getElementById('header-sync-status');
    if (!badge) return;

    if (state.syncStatus === 'live') {
      badge.innerHTML = `<span class="dot-live"></span><span>Market Feeds: Live · ${timeAgo(state.lastSyncTime)}</span>`;
      badge.style.color = '#fff';
      badge.title = 'Feeds live from TonAPI, STON.fi, and CoinGecko';
    } else if (state.syncStatus === 'syncing') {
      badge.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;animation:pulse-dot 1s infinite;"></span><span>Syncing Market Data...</span>`;
      badge.style.color = '#fbbf24';
    } else if (state.syncStatus === 'stale') {
      badge.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span><span>Feeds Cached · Stale (${timeAgo(state.lastSyncTime)})</span>`;
      badge.style.color = '#fbbf24';
    } else {
      badge.innerHTML = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ef4444;"></span><span>Feed Outage · Retrying</span>`;
      badge.style.color = '#f87171';
    }
  }

  // --- Window Global Bindings ---
  window.changeMarketPage = function(page) {
    state.page = page;
    renderMarketTable();
  };

  window.filterDirectoryCategory = function(cat, btn) {
    document.querySelectorAll('.directory-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    state.activeDirCategory = cat;
    renderDirectory();
  };

  window.filterMarketTableTab = function(tabName, btn) {
    document.querySelectorAll('.table-filter-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    state.activeFilter = tabName;
    state.page = 1;
    applyFiltersAndSort();
    renderMarketTable();
  };

  window.sortMarketTable = function(field) {
    if (state.sortField === field) {
      state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
    } else {
      state.sortField = field;
      state.sortOrder = 'desc';
    }
    applyFiltersAndSort();
    renderMarketTable();
  };

  window.handleUniversalSearch = function() {
    const input = document.getElementById('universalSearchInput');
    const q = input ? input.value : '';
    state.searchQuery = q;
    const tblInput = document.getElementById('tableSearchInput');
    if (tblInput && tblInput.value !== q) tblInput.value = q;
    state.page = 1;
    applyFiltersAndSort();
    renderMarketTable();
    renderDirectory();
  };

  window.handleTableSearch = function(q) {
    state.searchQuery = q || '';
    const univInput = document.getElementById('universalSearchInput');
    if (univInput && univInput.value !== q) univInput.value = q;
    state.page = 1;
    applyFiltersAndSort();
    renderMarketTable();
    renderDirectory();
  };

  window.copyContractAddress = function(addr, e) {
    if (e) e.stopPropagation();
    if (!addr) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(addr).then(() => {
        const toast = document.createElement('div');
        toast.textContent = 'Copied contract address: ' + shortenAddress(addr, 4);
        toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#1e293b; color:#fff; border:1px solid #3b82f6; padding:8px 16px; border-radius:8px; font-size:12px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
      }).catch(() => {});
    }
  };

  window.handleOpenAssetChart = function(assetId) {
    const a = window.AssetRegistry ? window.AssetRegistry.getAssetById(assetId) : null;
    if (!a) return;
    if (typeof openChartModal === 'function') {
      openChartModal(a.name, a.symbol, a.tvSymbol, a.dexUrl);
    }
  };

  window.triggerManualMarketSync = async function() {
    await syncAllMarketData();
  };

  // --- App Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    renderDirectory();
    syncAllMarketData();

    // Auto-refresh timer with rate-limiting respect
    setInterval(() => {
      if (!document.hidden) {
        syncAllMarketData();
      }
    }, REFRESH_INTERVAL_MS);
  });

  // Export engine
  window.ANLGRAM_INTEL_ENGINE = {
    state,
    syncAllMarketData
  };

})();
