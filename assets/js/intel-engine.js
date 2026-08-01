// ANLGRAM Intel Exchange Engine - Powered by simulated live Web3 data
// Simulates real-time market data, AI indicators, and Lightweight Charts

const TOP_20_TOKENS = [
    { id: 'GRAM', name: 'GRAM', ticker: 'GRAM', price: 0.0025, change: 14.2, pool: 'DeDust', liq: '4.2M', fdv: '12.5M', holders: '14,203', color: '#0088cc' },
    { id: 'REDO', name: 'Resistance Dog', ticker: 'REDO', price: 1.14, change: 5.1, pool: 'Ston.fi', liq: '8.4M', fdv: '114M', holders: '25,102', color: '#ff007f' },
    { id: 'NOT', name: 'Notcoin', ticker: 'NOT', price: 0.015, change: 8.4, pool: 'Ston.fi', liq: '25M', fdv: '1.5B', holders: '2.5M', color: '#f3ba2f' },
    { id: 'SCALE', name: 'Scaleton', ticker: 'SCALE', price: 4.25, change: 12.1, pool: 'DeDust', liq: '3.1M', fdv: '42M', holders: '8,421', color: '#00e676' },
    { id: 'FISH', name: 'Ton Fish', ticker: 'FISH', price: 0.000045, change: -2.4, pool: 'Ston.fi', liq: '1.2M', fdv: '18M', holders: '45,210', color: '#00f0ff' },
    { id: 'PUNK', name: 'TON Punks', ticker: 'PUNK', price: 2.10, change: 4.2, pool: 'DeDust', liq: '800K', fdv: '10.5M', holders: '3,200', color: '#ff9900' },
    { id: 'STON', name: 'STON', ticker: 'STON', price: 18.5, change: 1.2, pool: 'Ston.fi', liq: '15M', fdv: '185M', holders: '12,400', color: '#0088cc' },
    { id: 'DUREV', name: 'Pavel Durev', ticker: 'DUREV', price: 0.045, change: -2.4, pool: 'DeDust', liq: '1.2M', fdv: '4.5M', holders: '5,210', color: '#f3ba2f' },
    { id: 'ARBUZ', name: 'Arbuz', ticker: 'ARBUZ', price: 1.85, change: 25.4, pool: 'Ston.fi', liq: '2.5M', fdv: '18.5M', holders: '9,842', color: '#00ff88' },
    { id: 'KINGY', name: 'Kingy', ticker: 'KINGY', price: 0.12, change: -5.1, pool: 'DeDust', liq: '900K', fdv: '1.2M', holders: '4,100', color: '#ff007f' },
    { id: 'DFC', name: 'DeFinder', ticker: 'DFC', price: 2.45, change: 8.9, pool: 'Ston.fi', liq: '4.1M', fdv: '24.5M', holders: '6,200', color: '#00f0ff' },
    { id: 'JETTON', name: 'Jetton', ticker: 'JETTON', price: 0.85, change: 2.1, pool: 'DeDust', liq: '1.5M', fdv: '8.5M', holders: '7,420', color: '#0088cc' },
    { id: 'RAFF', name: 'TonRaffles', ticker: 'RAFF', price: 1.15, change: -1.2, pool: 'Ston.fi', liq: '2.2M', fdv: '11.5M', holders: '5,100', color: '#ff9900' },
    { id: 'UP', name: 'Up', ticker: 'UP', price: 0.05, change: 45.2, pool: 'DeDust', liq: '500K', fdv: '5M', holders: '2,100', color: '#00e676' },
    { id: 'WALL', name: 'Wall', ticker: 'WALL', price: 0.002, change: 0.5, pool: 'Ston.fi', liq: '300K', fdv: '2M', holders: '1,500', color: '#64748b' },
    { id: 'MC', name: 'MasterContract', ticker: 'MC', price: 4.2, change: -8.4, pool: 'DeDust', liq: '1.8M', fdv: '42M', holders: '3,800', color: '#ff007f' },
    { id: 'TINY', name: 'Tiny', ticker: 'TINY', price: 0.0001, change: 110.5, pool: 'Ston.fi', liq: '150K', fdv: '1M', holders: '800', color: '#00f0ff' },
    { id: 'DOGS', name: 'Dogs', ticker: 'DOGS', price: 0.005, change: 12.4, pool: 'DeDust', liq: '3.5M', fdv: '50M', holders: '45,000', color: '#f3ba2f' },
    { id: 'CATI', name: 'Catizen', ticker: 'CATI', price: 0.85, change: 4.2, pool: 'Ston.fi', liq: '8M', fdv: '85M', holders: '120,000', color: '#0088cc' },
    { id: 'HMSTR', name: 'Hamster', ticker: 'HMSTR', price: 0.15, change: -1.5, pool: 'DeDust', liq: '12M', fdv: '150M', holders: '250,000', color: '#ff9900' }
];

let chart, candleSeries, volumeSeries;
let lastCandle = null;
let currentToken = TOP_20_TOKENS[0];
let liveActivityInterval = null;
let whaleAlertsOnly = false;

document.addEventListener("DOMContentLoaded", () => {
    initChart();
    renderTokenList(TOP_20_TOKENS);
    startLiveActivityFeed();
    startAIUpdateLoop();
    initUIBindings();
});

function initChart() {
    const chartContainer = document.getElementById('tvchart');
    if (!chartContainer) return;

    chart = LightweightCharts.createChart(chartContainer, {
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8' },
        grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.05)' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#00f0ff' }, horzLine: { color: '#00f0ff' } },
        rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
        timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)', timeVisible: true, secondsVisible: false }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00e676', downColor: '#ff007f', borderVisible: false, wickUpColor: '#00e676', wickDownColor: '#ff007f'
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: ''
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== chartContainer) return;
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(chartContainer);

    setToken(currentToken);
    setInterval(updateLiveChart, 1000);
}

function generateHistoricalData(basePrice) {
    const candles = [];
    const volumes = [];
    let time = Math.floor(Date.now() / 1000) - (100 * 60);
    let price = basePrice;

    for (let i = 0; i < 100; i++) {
        const volatility = basePrice * 0.02;
        const open = price;
        const close = open + (Math.random() - 0.48) * volatility;
        const high = Math.max(open, close) + Math.random() * (volatility / 2);
        const low = Math.min(open, close) - Math.random() * (volatility / 2);
        
        candles.push({ time, open, high, low, close });
        const isUp = close > open;
        volumes.push({ time, value: Math.random() * 50000 + 10000, color: isUp ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 0, 127, 0.3)' });
        price = close;
        time += 60;
    }
    return { candles, volumes };
}

function updateLiveChart() {
    if (!lastCandle) return;
    const now = Math.floor(Date.now() / 1000);
    const isNewCandle = now >= lastCandle.time + 60;
    const volatility = currentToken.price * 0.005;
    let newClose = lastCandle.close + (Math.random() - 0.5) * volatility;
    
    if (isNewCandle) {
        lastCandle = { time: Math.floor(now / 60) * 60, open: lastCandle.close, high: Math.max(lastCandle.close, newClose), low: Math.min(lastCandle.close, newClose), close: newClose };
    } else {
        lastCandle.close = newClose;
        lastCandle.high = Math.max(lastCandle.high, newClose);
        lastCandle.low = Math.min(lastCandle.low, newClose);
    }
    candleSeries.update(lastCandle);
    
    const priceEl = document.getElementById('tokenLivePrice');
    if(priceEl) priceEl.innerText = '$' + newClose.toFixed(newClose < 0.01 ? 5 : 2);
    
    const priceChangeEl = document.getElementById('tokenLiveChange');
    if(priceChangeEl) {
        const change = ((newClose - currentToken.price) / currentToken.price) * 100 + currentToken.change;
        priceChangeEl.innerText = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        priceChangeEl.style.color = change >= 0 ? '#00e676' : '#ff007f';
    }
}

// UI Controllers
function renderTokenList(tokens) {
    const container = document.getElementById('tokenListContainer');
    if(!container) return;
    
    container.innerHTML = tokens.map(t => \`
        <div class="token-list-item" onclick="window.setTokenById('\${t.id}')">
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="t-icon" style="background:\${t.color}; font-size:14px; font-weight:700;">\${t.ticker[0]}</div>
                <div>
                    <div style="font-weight:700; font-size:14px; color:#fff;">\${t.ticker}</div>
                    <div style="font-size:11px; color:#64748b;">\${t.pool}</div>
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-family:var(--font-mono); font-size:13px; color:#fff;">$\${t.price}</div>
                <div style="font-size:11px; color:\${t.change >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)'};">\${t.change >= 0 ? '+' : ''}\${t.change}%</div>
            </div>
        </div>
    \`).join('');
}

window.setTokenById = function(id) {
    const token = TOP_20_TOKENS.find(t => t.id === id);
    if(token) setToken(token);
};

function setToken(token) {
    currentToken = token;
    
    // Update Header
    document.getElementById('tokenTitle').innerText = token.name;
    document.getElementById('tokenTicker').innerText = '/ ' + token.ticker;
    document.querySelector('.chart-header .t-icon').style.background = token.color;
    document.querySelector('.chart-header .t-icon').innerText = token.ticker[0];
    
    const metaSpans = document.querySelectorAll('.chart-header span[style*="color:#fff"]');
    if(metaSpans.length >= 3) {
        metaSpans[0].innerText = token.liq;
        metaSpans[1].innerText = token.fdv;
        metaSpans[2].innerText = token.holders;
    }

    // Reset Chart Data
    const mockData = generateHistoricalData(token.price);
    candleSeries.setData(mockData.candles);
    volumeSeries.setData(mockData.volumes);
    lastCandle = mockData.candles[mockData.candles.length - 1];

    // Clear Feed & Randomize AI Risk
    document.getElementById('liveActivityFeed').innerHTML = '';
    const risks = document.querySelectorAll('.ai-risk-bar-fill');
    risks.forEach(bar => {
        bar.style.width = (Math.random() * 80 + 10) + '%';
    });
}

function startLiveActivityFeed() {
    if(liveActivityInterval) clearInterval(liveActivityInterval);
    
    liveActivityInterval = setInterval(() => {
        const tbody = document.getElementById('liveActivityFeed');
        if(!tbody) return;

        const isWhale = Math.random() > 0.8;
        if(whaleAlertsOnly && !isWhale) return; // Skip small txs if filter is on

        const isBuy = Math.random() > 0.4;
        const type = isBuy ? 'BUY' : 'SELL';
        const color = isBuy ? '#00e676' : '#ff007f';
        const tonAmount = isWhale ? (Math.random() * 5000 + 1000).toFixed(2) : (Math.random() * 500 + 10).toFixed(2);
        const tokenAmount = (tonAmount / currentToken.price).toFixed(0);
        const wallet = 'EQ' + Math.random().toString(36).substring(2, 6).toUpperCase() + '...' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const row = document.createElement('tr');
        row.style.animation = 'fadeDown 0.4s ease forwards';
        if(isWhale) row.style.background = 'rgba(0, 240, 255, 0.1)'; // Highlight whales

        row.innerHTML = \`
            <td style="color:\${color}; font-weight:700;">\${type} \${isWhale ? '🐋' : ''}</td>
            <td style="font-family:var(--font-mono); color:#cbd5e1;">\${tonAmount} TON</td>
            <td style="font-family:var(--font-mono); color:#94a3b8;">\${tokenAmount} \${currentToken.ticker}</td>
            <td style="font-family:var(--font-mono); color:#00f0ff; text-decoration:underline; cursor:pointer;">\${wallet}</td>
            <td style="color:#64748b; font-size:11px;">Just now</td>
        \`;

        tbody.prepend(row);
        if (tbody.children.length > 20) tbody.removeChild(tbody.lastChild);
    }, 1500);
}

function startAIUpdateLoop() {
    setInterval(() => {
        const risks = document.querySelectorAll('.ai-risk-bar-fill');
        risks.forEach(bar => {
            const current = parseInt(bar.style.width) || 50;
            const fluctuation = (Math.random() - 0.5) * 10;
            let newVal = Math.max(0, Math.min(100, current + fluctuation));
            bar.style.width = newVal + '%';
            if(newVal > 75) bar.style.background = '#ff007f';
            else if(newVal > 40) bar.style.background = '#f3ba2f';
            else bar.style.background = '#00e676';
        });
    }, 4000);
}

function initUIBindings() {
    // Global animation style
    if(!document.getElementById('anim-style')) {
        const style = document.createElement('style');
        style.id = 'anim-style';
        style.innerHTML = \`@keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }\`;
        document.head.appendChild(style);
    }

    // Whale Alerts Toggle
    const whaleBtn = document.querySelector('.live-feed-panel .btn-glass-sm');
    if(whaleBtn) {
        whaleBtn.addEventListener('click', () => {
            whaleAlertsOnly = !whaleAlertsOnly;
            whaleBtn.style.background = whaleAlertsOnly ? 'var(--neon-cyan)' : 'rgba(0, 240, 255, 0.1)';
            whaleBtn.style.color = whaleAlertsOnly ? '#000' : 'var(--neon-cyan)';
            if(window.Toast) window.Toast.info(whaleAlertsOnly ? 'Whale filter ON' : 'Whale filter OFF');
        });
    }

    // Filters (Trending, Top Gainers)
    const filterBadges = document.querySelectorAll('.col-left .badge');
    filterBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            filterBadges.forEach(b => {
                b.style.background = 'rgba(255,255,255,0.05)';
                b.style.color = '#cbd5e1';
            });
            badge.style.background = '#00f0ff';
            badge.style.color = '#000';
            
            // Re-sort tokens
            let sorted = [...TOP_20_TOKENS];
            if(badge.innerText === 'Top Gainers') sorted.sort((a,b) => b.change - a.change);
            if(badge.innerText === 'Trending') sorted = TOP_20_TOKENS;
            if(badge.innerText === 'New Pools') sorted.sort(() => Math.random() - 0.5);
            renderTokenList(sorted);
        });
    });

    // Search input
    const searchInput = document.querySelector('.col-left .search-box input');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = TOP_20_TOKENS.filter(t => t.name.toLowerCase().includes(term) || t.ticker.toLowerCase().includes(term));
            renderTokenList(filtered);
        });
    }
}
