// ANLGRAM Intel Exchange Engine - Powered by simulated live Web3 data
// Simulates real-time market data, AI indicators, and Lightweight Charts

document.addEventListener("DOMContentLoaded", () => {
    initChart();
    startLiveActivityFeed();
    startAIUpdateLoop();
    initSearchFilters();
});

let chart, candleSeries, volumeSeries;
let lastCandle = null;

function initChart() {
    const chartContainer = document.getElementById('tvchart');
    if (!chartContainer) return;

    // Create Lightweight Chart
    chart = LightweightCharts.createChart(chartContainer, {
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#00f0ff', labelBackgroundColor: '#00f0ff' },
            horzLine: { color: '#00f0ff', labelBackgroundColor: '#00f0ff' },
        },
        rightPriceScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
            borderColor: 'rgba(255, 255, 255, 0.1)',
            timeVisible: true,
            secondsVisible: false,
        }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#00e676',
        downColor: '#ff007f',
        borderVisible: false,
        wickUpColor: '#00e676',
        wickDownColor: '#ff007f',
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
    });
    
    volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Generate Mock Historical Data
    const mockData = generateHistoricalData();
    candleSeries.setData(mockData.candles);
    volumeSeries.setData(mockData.volumes);

    lastCandle = mockData.candles[mockData.candles.length - 1];

    // Responsive chart
    new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
        const newRect = entries[0].contentRect;
        chart.applyOptions({ height: newRect.height, width: newRect.width });
    }).observe(chartContainer);

    // Start Live Ticker
    setInterval(updateLiveChart, 1000);
}

function generateHistoricalData() {
    const candles = [];
    const volumes = [];
    let time = Math.floor(Date.now() / 1000) - (100 * 60); // 100 minutes ago
    let price = 0.0025;

    for (let i = 0; i < 100; i++) {
        const open = price;
        const close = open + (Math.random() - 0.45) * 0.0005;
        const high = Math.max(open, close) + Math.random() * 0.0002;
        const low = Math.min(open, close) - Math.random() * 0.0002;
        
        candles.push({ time: time, open, high, low, close });
        
        const isUp = close > open;
        volumes.push({
            time: time,
            value: Math.random() * 50000 + 10000,
            color: isUp ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 0, 127, 0.3)'
        });

        price = close;
        time += 60; // 1 min interval
    }
    return { candles, volumes };
}

function updateLiveChart() {
    if (!lastCandle) return;
    
    const now = Math.floor(Date.now() / 1000);
    const isNewCandle = now >= lastCandle.time + 60;

    let newClose = lastCandle.close + (Math.random() - 0.5) * 0.0002;
    
    if (isNewCandle) {
        lastCandle = {
            time: Math.floor(now / 60) * 60,
            open: lastCandle.close,
            high: Math.max(lastCandle.close, newClose),
            low: Math.min(lastCandle.close, newClose),
            close: newClose
        };
    } else {
        lastCandle.close = newClose;
        lastCandle.high = Math.max(lastCandle.high, newClose);
        lastCandle.low = Math.min(lastCandle.low, newClose);
    }

    candleSeries.update(lastCandle);
    
    // Update live price header
    const priceEl = document.getElementById('tokenLivePrice');
    if(priceEl) priceEl.innerText = '$' + newClose.toFixed(5);
    
    const priceChangeEl = document.getElementById('tokenLiveChange');
    if(priceChangeEl) {
        const change = ((newClose - 0.0025) / 0.0025) * 100;
        priceChangeEl.innerText = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        priceChangeEl.style.color = change >= 0 ? '#00e676' : '#ff007f';
    }
}

// Live Activity Feed
function startLiveActivityFeed() {
    setInterval(() => {
        const tbody = document.getElementById('liveActivityFeed');
        if(!tbody) return;

        const isBuy = Math.random() > 0.4;
        const type = isBuy ? 'BUY' : 'SELL';
        const color = isBuy ? '#00e676' : '#ff007f';
        const tonAmount = (Math.random() * 500 + 10).toFixed(2);
        const tokenAmount = (tonAmount * 400).toFixed(0);
        const wallet = 'EQ' + Math.random().toString(36).substring(2, 6).toUpperCase() + '...' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const row = document.createElement('tr');
        row.style.animation = 'fadeDown 0.4s ease forwards';
        row.innerHTML = \`
            <td style="color:\${color}; font-weight:700;">\${type}</td>
            <td style="font-family:var(--font-mono); color:#cbd5e1;">\${tonAmount} TON</td>
            <td style="font-family:var(--font-mono); color:#94a3b8;">\${tokenAmount} GRAM</td>
            <td style="font-family:var(--font-mono); color:#00f0ff; text-decoration:underline; cursor:pointer;">\${wallet}</td>
            <td style="color:#64748b; font-size:11px;">Just now</td>
        \`;

        tbody.prepend(row);
        if (tbody.children.length > 20) {
            tbody.removeChild(tbody.lastChild);
        }
    }, 1500); // New activity every 1.5s
}

// AI Intelligence Loop
function startAIUpdateLoop() {
    setInterval(() => {
        const risks = document.querySelectorAll('.ai-risk-bar-fill');
        risks.forEach(bar => {
            const current = parseInt(bar.style.width) || 50;
            const fluctuation = (Math.random() - 0.5) * 10;
            let newVal = Math.max(0, Math.min(100, current + fluctuation));
            bar.style.width = newVal + '%';
            
            if(newVal > 75) bar.style.background = '#ff007f'; // High Risk
            else if(newVal > 40) bar.style.background = '#f3ba2f'; // Med Risk
            else bar.style.background = '#00e676'; // Low Risk
        });
    }, 4000);
}

// UI Filters
function initSearchFilters() {
    window.setToken = function(name, ticker, price) {
        document.getElementById('tokenTitle').innerText = name;
        document.getElementById('tokenTicker').innerText = ticker;
        // Re-init chart data here in a real app
    };
    
    // Quick add fadeDown animation globally
    const style = document.createElement('style');
    style.innerHTML = \`
        @keyframes fadeDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    \`;
    document.head.appendChild(style);
}
