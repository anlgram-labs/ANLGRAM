(function() {
    'use strict';

    // === GLOBALS & CONFIG ===
    const TOKEN_NAMES = [
        "GRAM", "REDO", "NOT", "STON", "UTYA", "DOGS", "FISH", "SCALE", "BOLT", "DUST", 
        "JET", "ORBIT", "PULSE", "FLASH", "STORM", "NOVA", "DRIFT", "APEX", "WAVE", "PRIME",
        "LUMI", "AURA", "NEXUS", "ZEN", "VOID", "FLUX", "CORE", "ECHO", "SPARK", "VORTEX"
    ];

    const tokens = [];
    const miniCharts = {}; // tokenSymbol -> chart object
    let mainChart = null;
    let mainCandleSeries = null;
    let activeToken = null;
    let dataInterval = null;

    // === UTILS ===
    // Deterministic PRNG
    function mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    const rand = mulberry32(42);

    function formatMoney(num) {
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toFixed(2);
    }

    function formatPrice(num) {
        if (num < 0.01) return num.toFixed(6);
        return num.toFixed(4);
    }

    // === DATA ENGINE ===
    function generateTokens() {
        for (let i = 0; i < TOKEN_NAMES.length; i++) {
            const sym = TOKEN_NAMES[i];
            const basePrice = 0.001 + rand() * 10;
            const isPositive = rand() > 0.5;
            const change24h = (rand() * 20) * (isPositive ? 1 : -1);
            
            // Image URLs
            const imgId = Math.floor(rand() * 1000) + 1;
            const logo = `https://s2.coinmarketcap.com/static/img/coins/64x64/${imgId}.png`;

            tokens.push({
                symbol: sym,
                name: sym + " Token",
                logo: logo,
                price: basePrice,
                change24h: change24h,
                marketCap: (rand() * 50000000) + 1000000,
                liquidity: (rand() * 5000000) + 100000,
                volume: (rand() * 10000000) + 50000,
                holders: Math.floor(rand() * 50000) + 500,
                riskScore: Math.floor(rand() * 100),
                timeseries: generateTimeseries(basePrice, 500)
            });
        }
    }

    function generateTimeseries(currentPrice, count) {
        const series = [];
        let p = currentPrice * (1 - (rand() * 0.2 - 0.1)); // start price somewhere near
        
        // Let's create past candles going forwards
        let time = Math.floor(Date.now() / 1000) - (count * 3600); // hourly candles
        
        for (let i = 0; i < count; i++) {
            const open = p;
            const close = p * (1 + (rand() * 0.04 - 0.02));
            const high = Math.max(open, close) * (1 + rand() * 0.02);
            const low = Math.min(open, close) * (1 - rand() * 0.02);
            
            series.push({
                time: time + (i * 3600),
                open: open,
                high: high,
                low: low,
                close: close,
                value: close // for line chart
            });
            p = close;
        }
        
        // ensure last candle matches current price
        series[series.length - 1].close = currentPrice;
        series[series.length - 1].value = currentPrice;

        return series;
    }

    // === DOM RENDERING ===
    function renderGrid() {
        const grid = document.getElementById('token-grid');
        if (!grid) return;
        
        grid.innerHTML = '';

        tokens.forEach(token => {
            const isUp = token.change24h >= 0;
            const colorClass = isUp ? 'text-green-500' : 'text-red-500';
            const sign = isUp ? '+' : '';

            const card = document.createElement('div');
            card.className = 'token-card bg-gray-800 p-4 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors flex flex-col gap-2 border border-gray-700';
            card.dataset.symbol = token.symbol;

            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <img src="${token.logo}" class="w-8 h-8 rounded-full bg-gray-900" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiM1NTUiLz48L3N2Zz4='">
                        <div>
                            <div class="font-bold text-white">${token.symbol}</div>
                            <div class="text-xs text-gray-400">Vol: $${formatMoney(token.volume)}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-white" id="price-${token.symbol}">$${formatPrice(token.price)}</div>
                        <div class="text-sm ${colorClass}" id="change-${token.symbol}">${sign}${token.change24h.toFixed(2)}%</div>
                    </div>
                </div>
                <div class="card-chart h-16 w-full mt-2" id="chart-${token.symbol}"></div>
                <div class="flex justify-between text-xs text-gray-400 mt-1">
                    <span>MCap: $${formatMoney(token.marketCap)}</span>
                    <span>Liq: $${formatMoney(token.liquidity)}</span>
                </div>
            `;

            card.addEventListener('click', () => openDetailView(token));
            grid.appendChild(card);
        });

        // Init mini charts
        setTimeout(() => {
            tokens.forEach(token => {
                const container = document.getElementById(`chart-${token.symbol}`);
                if (!container || !window.LightweightCharts) return;

                const chart = window.LightweightCharts.createChart(container, {
                    width: container.clientWidth,
                    height: container.clientHeight,
                    layout: { background: { color: 'transparent' }, textColor: 'transparent' },
                    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
                    rightPriceScale: { visible: false },
                    timeScale: { visible: false },
                    handleScroll: false,
                    handleScale: false,
                    crosshair: { mode: 0 }
                });

                const lineSeries = chart.addLineSeries({
                    color: token.change24h >= 0 ? '#10B981' : '#EF4444',
                    lineWidth: 2,
                    crosshairMarkerVisible: false,
                    priceLineVisible: false
                });

                // Use last 100 candles
                const data = token.timeseries.slice(-100).map(c => ({ time: c.time, value: c.value }));
                lineSeries.setData(data);
                
                miniCharts[token.symbol] = { chart, lineSeries, container };
            });
        }, 100);
    }

    // === NAVIGATION & DETAIL VIEW ===
    function openDetailView(token) {
        activeToken = token;
        
        const viewGrid = document.getElementById('view-grid');
        const viewDetail = document.getElementById('view-detail');
        
        if (viewGrid && viewDetail) {
            viewGrid.classList.add('hidden');
            viewDetail.classList.remove('hidden');
            // Basic animation trigger
            viewDetail.classList.add('animate-fade-in');
        }

        renderDetailInfo();
        renderMainChart();
        renderRecentTrades();
    }

    function closeDetailView() {
        activeToken = null;
        
        const viewGrid = document.getElementById('view-grid');
        const viewDetail = document.getElementById('view-detail');
        
        if (viewGrid && viewDetail) {
            viewDetail.classList.add('hidden');
            viewGrid.classList.remove('hidden');
            viewGrid.classList.add('animate-fade-in');
        }

        if (mainChart) {
            mainChart.remove();
            mainChart = null;
            mainCandleSeries = null;
        }
    }

    function renderDetailInfo() {
        if (!activeToken) return;

        const elSymbol = document.getElementById('detail-symbol');
        const elPrice = document.getElementById('detail-price');
        const elChange = document.getElementById('detail-change');
        
        if (elSymbol) elSymbol.textContent = activeToken.symbol;
        if (elPrice) elPrice.textContent = '$' + formatPrice(activeToken.price);
        
        if (elChange) {
            const isUp = activeToken.change24h >= 0;
            elChange.textContent = (isUp ? '+' : '') + activeToken.change24h.toFixed(2) + '%';
            elChange.className = isUp ? 'text-green-500' : 'text-red-500';
        }
        
        // Other stats
        const updateStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        updateStat('detail-mcap', '$' + formatMoney(activeToken.marketCap));
        updateStat('detail-liq', '$' + formatMoney(activeToken.liquidity));
        updateStat('detail-vol', '$' + formatMoney(activeToken.volume));
        updateStat('detail-holders', activeToken.holders.toLocaleString());
        updateStat('detail-risk', activeToken.riskScore + '/100');
    }

    function renderMainChart() {
        const container = document.getElementById('main-chart-container');
        if (!container || !window.LightweightCharts || !activeToken) return;
        
        container.innerHTML = ''; // clear

        mainChart = window.LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight || 400,
            layout: {
                background: { color: '#111827' }, // gray-900
                textColor: '#9CA3AF' // gray-400
            },
            grid: {
                vertLines: { color: '#374151' }, // gray-700
                horzLines: { color: '#374151' }
            },
            crosshair: {
                mode: window.LightweightCharts.CrosshairMode.Normal,
            },
            timeScale: {
                borderColor: '#4B5563'
            },
            rightPriceScale: {
                borderColor: '#4B5563'
            }
        });

        mainCandleSeries = mainChart.addCandlestickSeries({
            upColor: '#10B981',
            downColor: '#EF4444',
            borderVisible: false,
            wickUpColor: '#10B981',
            wickDownColor: '#EF4444'
        });

        const data = activeToken.timeseries.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        mainCandleSeries.setData(data);
        
        // Handle resize
        window.addEventListener('resize', () => {
            if (mainChart && container) {
                mainChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
            }
        });
    }

    function renderRecentTrades() {
        const list = document.getElementById('recent-trades-list');
        if (!list || !activeToken) return;
        
        list.innerHTML = '';
        // Mock 10 trades
        for(let i=0; i<10; i++) {
            const isBuy = Math.random() > 0.5;
            const amt = Math.random() * 1000 + 10;
            const price = activeToken.price * (1 + (Math.random() * 0.002 - 0.001));
            
            const tr = document.createElement('div');
            tr.className = `flex justify-between text-sm py-1 border-b border-gray-800 ${isBuy ? 'text-green-400' : 'text-red-400'}`;
            tr.innerHTML = `
                <span>${isBuy ? 'BUY' : 'SELL'}</span>
                <span>$${formatPrice(price)}</span>
                <span>${formatMoney(amt)} ${activeToken.symbol}</span>
                <span class="text-gray-500">${new Date().toLocaleTimeString()}</span>
            `;
            list.appendChild(tr);
        }
    }

    // === LIVE UPDATES ===
    function startDataEngine() {
        if (dataInterval) clearInterval(dataInterval);
        
        dataInterval = setInterval(() => {
            const now = Math.floor(Date.now() / 1000);
            
            tokens.forEach(token => {
                // Random flutter
                const change = 1 + (Math.random() * 0.01 - 0.005);
                token.price = token.price * change;
                
                // Update 24h change slightly
                token.change24h += (Math.random() * 0.2 - 0.1);
                
                // Add new data point to series
                const last = token.timeseries[token.timeseries.length - 1];
                let isNewCandle = false;
                
                let currentCandle;
                if (now - last.time >= 3600) {
                    // new candle
                    isNewCandle = true;
                    currentCandle = {
                        time: now,
                        open: last.close,
                        high: Math.max(last.close, token.price),
                        low: Math.min(last.close, token.price),
                        close: token.price,
                        value: token.price
                    };
                    token.timeseries.push(currentCandle);
                    if(token.timeseries.length > 1000) token.timeseries.shift();
                } else {
                    currentCandle = last;
                    currentCandle.close = token.price;
                    currentCandle.value = token.price;
                    currentCandle.high = Math.max(currentCandle.high, token.price);
                    currentCandle.low = Math.min(currentCandle.low, token.price);
                }

                // Update Grid UI
                const priceEl = document.getElementById(`price-${token.symbol}`);
                if (priceEl) {
                    priceEl.textContent = '$' + formatPrice(token.price);
                    // Flash effect
                    priceEl.classList.add(change > 1 ? 'text-green-300' : 'text-red-300');
                    setTimeout(() => {
                        priceEl.classList.remove('text-green-300', 'text-red-300');
                    }, 500);
                }
                
                const changeEl = document.getElementById(`change-${token.symbol}`);
                if (changeEl) {
                    const isUp = token.change24h >= 0;
                    changeEl.textContent = (isUp ? '+' : '') + token.change24h.toFixed(2) + '%';
                    changeEl.className = `text-sm ${isUp ? 'text-green-500' : 'text-red-500'}`;
                }

                // Update mini chart
                if (miniCharts[token.symbol]) {
                    const { lineSeries } = miniCharts[token.symbol];
                    lineSeries.update({ time: currentCandle.time, value: currentCandle.value });
                }

                // Update Detail UI if active
                if (activeToken && activeToken.symbol === token.symbol) {
                    const detailPrice = document.getElementById('detail-price');
                    if (detailPrice) detailPrice.textContent = '$' + formatPrice(token.price);
                    
                    const detailChange = document.getElementById('detail-change');
                    if (detailChange) {
                        const isUp = token.change24h >= 0;
                        detailChange.textContent = (isUp ? '+' : '') + token.change24h.toFixed(2) + '%';
                        detailChange.className = isUp ? 'text-green-500' : 'text-red-500';
                    }

                    if (mainCandleSeries) {
                        mainCandleSeries.update({
                            time: currentCandle.time,
                            open: currentCandle.open,
                            high: currentCandle.high,
                            low: currentCandle.low,
                            close: currentCandle.close
                        });
                    }
                }
            });
            
            // Add a new mock trade for active token occasionally
            if (activeToken && Math.random() > 0.3) {
                renderRecentTrades();
            }

        }, 5000);
    }

    // === INIT ===
    function init() {
        generateTokens();
        
        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupApp);
        } else {
            setupApp();
        }
    }

    function setupApp() {
        renderGrid();
        
        const backBtn = document.getElementById('back-button');
        if (backBtn) {
            backBtn.addEventListener('click', closeDetailView);
        }

        startDataEngine();
    }

    // Run
    init();

})();
