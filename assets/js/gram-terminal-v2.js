(function() {
    'use strict';

    // === DICTIONARY OF OFFICIAL TOP TON TOKENS ===
    const TON_TOKENS = [
        { symbol: "GRAM", name: "GRAM Token", logo: "https://tonviewer.com/logo/GRAM.png" },
        { symbol: "REDO", name: "Resistance Dog", logo: "https://tonviewer.com/logo/REDO.png" },
        { symbol: "NOT", name: "Notcoin", logo: "https://tonviewer.com/logo/NOT.png" },
        { symbol: "STON", name: "STON.fi", logo: "https://tonviewer.com/logo/STON.png" },
        { symbol: "DOGS", name: "DOGS", logo: "https://tonviewer.com/logo/DOGS.png" },
        { symbol: "FISH", name: "Ton Fish", logo: "https://tonviewer.com/logo/FISH.png" },
        { symbol: "SCALE", name: "Scale", logo: "https://tonviewer.com/logo/SCALE.png" },
        { symbol: "UP", name: "TonUP", logo: "https://tonviewer.com/logo/UP.png" },
        { symbol: "RAFF", name: "TonRaffles", logo: "https://tonviewer.com/logo/RAFF.png" },
        { symbol: "PUNK", name: "TON Punks", logo: "https://tonviewer.com/logo/PUNK.png" },
        { symbol: "KING", name: "Kingy", logo: "https://tonviewer.com/logo/KING.png" },
        { symbol: "DFC", name: "DeFinder", logo: "https://tonviewer.com/logo/DFC.png" },
        { symbol: "FNZ", name: "Fanton", logo: "https://tonviewer.com/logo/FNZ.png" },
        { symbol: "TGR", name: "Tegro", logo: "https://tonviewer.com/logo/TGR.png" },
        { symbol: "ARBUZ", name: "Arbuz", logo: "https://tonviewer.com/logo/ARBUZ.png" },
        { symbol: "MC", name: "Margin", logo: "https://tonviewer.com/logo/MC.png" },
        { symbol: "KOTE", name: "Kote", logo: "https://tonviewer.com/logo/KOTE.png" },
        { symbol: "WALL", name: "Wall Street", logo: "https://tonviewer.com/logo/WALL.png" },
        { symbol: "HEDGE", name: "Hedge", logo: "https://tonviewer.com/logo/HEDGE.png" },
        { symbol: "WEB3", name: "Web3", logo: "https://tonviewer.com/logo/WEB3.png" }
    ];

    const tokens = [];
    const miniCharts = {}; // tokenSymbol -> chart object
    let mainChart = null;
    let mainCandleSeries = null;
    let activeToken = null;
    let dataInterval = null;
    let bubbleSim = null; // D3 Simulation

    // === UTILS ===
    function mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    const rand = mulberry32(1337); // fixed seed for consistency

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
        for (let i = 0; i < TON_TOKENS.length; i++) {
            const sym = TON_TOKENS[i].symbol;
            const name = TON_TOKENS[i].name;
            const basePrice = 0.001 + rand() * 10;
            const isPositive = rand() > 0.5;
            const change24h = (rand() * 20) * (isPositive ? 1 : -1);
            
            // Fallback generic logo if loading fails
            const logo = TON_TOKENS[i].logo;

            tokens.push({
                symbol: sym,
                name: name,
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
        let p = currentPrice * (1 - (rand() * 0.2 - 0.1));
        let time = Math.floor(Date.now() / 1000) - (count * 3600);
        
        for (let i = 0; i < count; i++) {
            const open = p;
            const close = p * (1 + (rand() * 0.04 - 0.02));
            const high = Math.max(open, close) * (1 + rand() * 0.02);
            const low = Math.min(open, close) * (1 - rand() * 0.02);
            
            series.push({
                time: time + (i * 3600),
                open: open, high: high, low: low, close: close,
                value: close
            });
            p = close;
        }
        series[series.length - 1].close = currentPrice;
        series[series.length - 1].value = currentPrice;
        return series;
    }

    // === BUBBLE MAP ENGINE (D3) ===
    function initBubbleMap(token) {
        const container = document.getElementById('bubble-map-container');
        // Clear previous
        const existingSvg = container.querySelector('svg');
        if (existingSvg) existingSvg.remove();
        
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;
        
        // Generate mock wallets for this token
        const nodes = [];
        const links = [];
        const numNodes = 100 + Math.floor(rand() * 50);
        
        const clusters = [
            { id: 1, name: "Whales", color: "#E91E63", sizeMult: 10 },
            { id: 2, name: "Exchanges", color: "#3F51B5", sizeMult: 15 },
            { id: 3, name: "Liquidity", color: "#00BCD4", sizeMult: 8 },
            { id: 4, name: "Retail", color: "#9E9E9E", sizeMult: 2 }
        ];

        for (let i = 0; i < numNodes; i++) {
            const cluster = clusters[Math.floor(rand() * clusters.length)];
            const size = (rand() * 5 + 2) * cluster.sizeMult;
            nodes.push({
                id: i,
                address: `EQ...${Math.floor(rand()*10000)}`,
                group: cluster.name,
                color: cluster.color,
                radius: size,
                balance: (size * 1000).toFixed(0)
            });
        }

        // Random links
        for (let i = 0; i < numNodes * 1.5; i++) {
            links.push({
                source: Math.floor(rand() * numNodes),
                target: Math.floor(rand() * numNodes),
                value: rand() * 5
            });
        }

        const svg = d3.select("#bubble-map-container").append("svg")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
        svg.call(zoom);

        // Controls
        document.getElementById('btn-zoom-in').onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
        document.getElementById('btn-zoom-out').onclick = () => svg.transition().call(zoom.scaleBy, 0.7);
        document.getElementById('btn-zoom-reset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

        // Simulation
        bubbleSim = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-100))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(d => d.radius + 2));

        const link = g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", d => Math.sqrt(d.value));

        const tooltip = d3.select("#bubble-tooltip");

        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", d => d.radius)
            .attr("fill", d => d.color)
            .call(d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) bubbleSim.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on("drag", (event, d) => {
                    d.fx = event.x; d.fy = event.y;
                })
                .on("end", (event, d) => {
                    if (!event.active) bubbleSim.alphaTarget(0);
                    d.fx = null; d.fy = null;
                }))
            .on("mouseover", (event, d) => {
                tooltip.style("display", "block")
                       .html(`<strong>${d.group}</strong><br/>Addr: ${d.address}<br/>Bal: ${d.balance} ${token.symbol}`)
                       .style("left", (event.pageX + 15) + "px")
                       .style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", () => tooltip.style("display", "none"));

        bubbleSim.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });
    }

    // === DOM RENDERING ===
    function renderGrid() {
        const grid = document.getElementById('token-grid');
        grid.innerHTML = '';

        tokens.forEach(token => {
            const isPositive = token.change24h >= 0;
            const changeClass = isPositive ? 'text-green' : 'text-red';
            const changeSign = isPositive ? '+' : '';
            const riskClass = token.riskScore < 30 ? 'badge-risk-green' : (token.riskScore < 70 ? 'badge-risk-orange' : 'badge-risk-red');

            const card = document.createElement('div');
            card.className = 'token-card';
            card.innerHTML = `
                <div class="card-header">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${token.logo}" alt="${token.symbol}" class="card-logo" onerror="this.src='assets/img/anlgram-icon.svg'">
                        <div class="card-name-ticker">
                            <span class="card-name">${token.name}</span>
                            <span class="card-ticker">${token.symbol}</span>
                        </div>
                    </div>
                    <span class="badge ${riskClass}">Risk ${token.riskScore}</span>
                </div>
                <div class="card-stats">
                    <div>
                        <div class="stat-label">Price</div>
                        <div class="stat-value data-font" id="price-${token.symbol}">$${formatPrice(token.price)}</div>
                    </div>
                    <div>
                        <div class="stat-label">24H</div>
                        <div class="stat-value data-font ${changeClass}" id="change-${token.symbol}">${changeSign}${token.change24h.toFixed(2)}%</div>
                    </div>
                    <div>
                        <div class="stat-label">Market Cap</div>
                        <div class="stat-value data-font">$${formatMoney(token.marketCap)}</div>
                    </div>
                    <div>
                        <div class="stat-label">Volume</div>
                        <div class="stat-value data-font">$${formatMoney(token.volume)}</div>
                    </div>
                </div>
                <div id="chart-${token.symbol}" class="card-chart"></div>
                <div class="card-footer">
                    <span class="badge badge-glass">Liq $${formatMoney(token.liquidity)}</span>
                    <span class="badge badge-glass">Holders ${formatMoney(token.holders)}</span>
                </div>
            `;
            
            card.addEventListener('click', () => openDetailView(token));
            grid.appendChild(card);
        });

        setTimeout(() => {
            tokens.forEach(token => {
                const container = document.getElementById(`chart-${token.symbol}`);
                if (!container) return;
                const chart = LightweightCharts.createChart(container, {
                    width: container.clientWidth,
                    height: 60,
                    layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'transparent' },
                    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
                    rightPriceScale: { visible: false },
                    timeScale: { visible: false },
                    handleScroll: false,
                    handleScale: false,
                    crosshair: { mode: LightweightCharts.CrosshairMode.Hidden }
                });
                const lineSeries = chart.addLineSeries({
                    color: token.change24h >= 0 ? '#4caf50' : '#f44336',
                    lineWidth: 2,
                    crosshairMarkerVisible: false
                });
                lineSeries.setData(token.timeseries.slice(-100));
                miniCharts[token.symbol] = lineSeries;
            });
        }, 100);
    }

    function openDetailView(token) {
        activeToken = token;
        document.getElementById('view-grid').style.display = 'none';
        document.getElementById('view-detail').style.display = 'block';

        document.getElementById('detail-symbol').innerHTML = `<img src="${token.logo}" class="detail-logo-large" onerror="this.src='assets/img/anlgram-icon.svg'" style="vertical-align:middle; margin-right:12px;">${token.symbol}`;
        document.getElementById('detail-price').textContent = `$${formatPrice(token.price)}`;
        
        const isPos = token.change24h >= 0;
        const changeEl = document.getElementById('detail-change');
        changeEl.textContent = `${isPos ? '+' : ''}${token.change24h.toFixed(2)}%`;
        changeEl.className = `detail-change data-font ${isPos ? 'text-green' : 'text-red'}`;

        document.getElementById('detail-mcap').textContent = `$${formatMoney(token.marketCap)}`;
        document.getElementById('detail-liq').textContent = `$${formatMoney(token.liquidity)}`;
        document.getElementById('detail-vol').textContent = `$${formatMoney(token.volume)}`;
        document.getElementById('detail-holders').textContent = formatMoney(token.holders);
        document.getElementById('detail-risk').textContent = `${token.riskScore}/100`;

        initMainChart(token);
        renderRecentTrades(token);
        
        // Make sure chart view is active by default
        showChart();
    }

    function initMainChart(token) {
        const container = document.getElementById('main-chart-container');
        container.innerHTML = '';
        
        const chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight || 400,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#A0AEC0' },
            grid: { vertLines: { color: 'rgba(255, 255, 255, 0.05)' }, horzLines: { color: 'rgba(255, 255, 255, 0.05)' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
            timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)' }
        });

        mainCandleSeries = chart.addCandlestickSeries({
            upColor: '#4caf50', downColor: '#f44336', borderVisible: false,
            wickUpColor: '#4caf50', wickDownColor: '#f44336'
        });
        
        mainCandleSeries.setData(token.timeseries);
        mainChart = chart;
        
        window.addEventListener('resize', () => {
            if (document.getElementById('view-detail').style.display === 'block') {
                chart.resize(container.clientWidth, container.clientHeight);
            }
        });
    }

    function renderRecentTrades(token) {
        const list = document.getElementById('recent-trades-list');
        list.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const isBuy = rand() > 0.5;
            const price = token.price * (1 + (rand() * 0.002 - 0.001));
            const amt = (rand() * 10000).toFixed(0);
            const time = new Date(Date.now() - (i * 5000)).toLocaleTimeString([], {hour12:false});
            
            const row = document.createElement('div');
            row.className = 'trade-row data-font';
            row.innerHTML = `
                <span class="trade-time">${time}</span>
                <span class="trade-price ${isBuy ? 'text-green' : 'text-red'}">$${formatPrice(price)}</span>
                <span class="trade-amt">${amt}</span>
            `;
            list.appendChild(row);
        }
    }

    // === VIEW TOGGLES ===
    function showChart() {
        document.getElementById('main-chart-container').style.display = 'block';
        document.getElementById('bubble-map-container').style.display = 'none';
        document.getElementById('btn-show-chart').classList.add('active');
        document.getElementById('btn-show-bubbles').classList.remove('active');
        document.getElementById('chart-timeframes').style.display = 'flex';
        
        if (mainChart) {
            mainChart.resize(document.getElementById('main-chart-container').clientWidth, document.getElementById('main-chart-container').clientHeight);
        }
    }

    function showBubbles() {
        document.getElementById('main-chart-container').style.display = 'none';
        document.getElementById('bubble-map-container').style.display = 'block';
        document.getElementById('btn-show-chart').classList.remove('active');
        document.getElementById('btn-show-bubbles').classList.add('active');
        document.getElementById('chart-timeframes').style.display = 'none';
        
        if (activeToken) {
            initBubbleMap(activeToken);
        }
    }

    // === LIVE SIMULATION ===
    function startLiveUpdates() {
        if (dataInterval) clearInterval(dataInterval);
        dataInterval = setInterval(() => {
            tokens.forEach(token => {
                const move = token.price * (rand() * 0.004 - 0.002);
                token.price += move;
                token.change24h += (move / token.price) * 100;
                
                // Update grid
                const priceEl = document.getElementById(`price-${token.symbol}`);
                if (priceEl) {
                    priceEl.textContent = `$${formatPrice(token.price)}`;
                    priceEl.style.color = move >= 0 ? '#4caf50' : '#f44336';
                    setTimeout(() => priceEl.style.color = '', 1000);
                }
                
                const changeEl = document.getElementById(`change-${token.symbol}`);
                if (changeEl) {
                    const isPos = token.change24h >= 0;
                    changeEl.textContent = `${isPos ? '+' : ''}${token.change24h.toFixed(2)}%`;
                    changeEl.className = `stat-value data-font ${isPos ? 'text-green' : 'text-red'}`;
                }
                
                // Update chart
                const lastTick = token.timeseries[token.timeseries.length - 1];
                const newTime = Math.floor(Date.now() / 1000);
                
                if (newTime - lastTick.time > 3600) {
                    const newCandle = {
                        time: newTime,
                        open: token.price, high: token.price, low: token.price, close: token.price, value: token.price
                    };
                    token.timeseries.push(newCandle);
                } else {
                    lastTick.close = token.price;
                    lastTick.value = token.price;
                    if (token.price > lastTick.high) lastTick.high = token.price;
                    if (token.price < lastTick.low) lastTick.low = token.price;
                }
                
                if (miniCharts[token.symbol]) {
                    miniCharts[token.symbol].update(token.timeseries[token.timeseries.length - 1]);
                }
                
                // Update detail view if active
                if (activeToken && activeToken.symbol === token.symbol) {
                    const dp = document.getElementById('detail-price');
                    dp.textContent = `$${formatPrice(token.price)}`;
                    dp.style.color = move >= 0 ? '#4caf50' : '#f44336';
                    setTimeout(() => dp.style.color = '', 1000);
                    
                    const isPos = token.change24h >= 0;
                    const dc = document.getElementById('detail-change');
                    dc.textContent = `${isPos ? '+' : ''}${token.change24h.toFixed(2)}%`;
                    dc.className = `detail-change data-font ${isPos ? 'text-green' : 'text-red'}`;
                    
                    if (mainCandleSeries) {
                        mainCandleSeries.update(token.timeseries[token.timeseries.length - 1]);
                    }
                }
            });
        }, 5000);
    }

    // === INIT ===
    window.addEventListener('DOMContentLoaded', () => {
        generateTokens();
        renderGrid();
        startLiveUpdates();

        document.getElementById('back-button').addEventListener('click', () => {
            document.getElementById('view-detail').style.display = 'none';
            document.getElementById('view-grid').style.display = 'block';
            activeToken = null;
        });

        document.getElementById('btn-show-chart').addEventListener('click', showChart);
        document.getElementById('btn-show-bubbles').addEventListener('click', showBubbles);
    });

})();
