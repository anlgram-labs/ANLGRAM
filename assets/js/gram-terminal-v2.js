(function() {
    'use strict';

    // === OFFICIAL TOP TON TOKENS ===
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
    let bubbleSim = null; 
    let dataInterval = null;
    let activeToken = null;

    // === UTILS ===
    function mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    const rand = mulberry32(888);

    function formatMoney(num) {
        if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
        return '$' + num.toFixed(2);
    }

    function formatPrice(num) {
        if (num < 0.01) return '$' + num.toFixed(6);
        return '$' + num.toFixed(4);
    }

    // === DATA ENGINE ===
    function generateTokens() {
        for (let i = 0; i < TON_TOKENS.length; i++) {
            const sym = TON_TOKENS[i].symbol;
            const name = TON_TOKENS[i].name;
            const basePrice = 0.001 + rand() * 10;
            const isPositive = rand() > 0.5;
            const change24h = (rand() * 20) * (isPositive ? 1 : -1);
            
            tokens.push({
                rank: i + 1,
                symbol: sym,
                name: name,
                logo: TON_TOKENS[i].logo,
                price: basePrice,
                change24h: change24h,
                marketCap: (rand() * 100000000) + 5000000,
                volume: (rand() * 10000000) + 100000,
                holders: Math.floor(rand() * 50000) + 1000
            });
        }
    }

    // === RENDERING TABLE ===
    function renderTable() {
        const tbody = document.getElementById('token-list-body');
        tbody.innerHTML = '';

        tokens.forEach(token => {
            const isPos = token.change24h >= 0;
            const changeClass = isPos ? 'text-green' : 'text-red';
            const changeStr = (isPos ? '+' : '') + token.change24h.toFixed(2) + '%';
            
            const row = document.createElement('div');
            row.className = 'table-row';
            row.onclick = () => openMap(token);
            
            row.innerHTML = `
                <div class="col-rank">${token.rank}</div>
                <div class="col-token">
                    <img src="${token.logo}" alt="${token.symbol}" class="row-logo" onerror="this.src='assets/img/anlgram-icon.svg'">
                    <div>
                        <div class="row-name">${token.name}</div>
                        <div class="row-ticker">${token.symbol}</div>
                    </div>
                </div>
                <div class="col-price" id="row-price-${token.symbol}">${formatPrice(token.price)}</div>
                <div class="col-24h ${changeClass}" id="row-change-${token.symbol}">${changeStr}</div>
                <div class="col-mcap">${formatMoney(token.marketCap)}</div>
                <div class="col-vol">${formatMoney(token.volume)}</div>
                <div class="col-action">
                    <button class="btn-map">View Map</button>
                </div>
            `;
            tbody.appendChild(row);
        });
    }

    // === BUBBLE MAP (D3) ===
    function openMap(token) {
        activeToken = token;
        document.getElementById('view-list').style.display = 'none';
        document.getElementById('view-map').style.display = 'block';

        // Update Panel Info
        document.getElementById('map-logo').src = token.logo;
        document.getElementById('map-logo').onerror = function() { this.src = 'assets/img/anlgram-icon.svg'; };
        document.getElementById('map-name').textContent = token.name;
        document.getElementById('map-ticker').textContent = token.symbol;
        document.getElementById('map-price').textContent = formatPrice(token.price);
        document.getElementById('map-mcap').textContent = formatMoney(token.marketCap);
        document.getElementById('map-holders').textContent = token.holders.toLocaleString();
        
        // Hide wallet panel initially
        document.getElementById('panel-wallet').style.display = 'none';

        initD3(token);
    }

    function initD3(token) {
        const container = document.getElementById('bubble-map-container');
        const existingSvg = container.querySelector('svg');
        if (existingSvg) existingSvg.remove();
        if (bubbleSim) bubbleSim.stop();

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;

        const nodes = [];
        const links = [];
        const numNodes = 100 + Math.floor(rand() * 50);

        // Advanced Arkham-style palette
        const clusters = [
            { name: "Top Holders", color: "#d500f9", sizeMult: 12 }, // Deep purple/magenta
            { name: "CEX", color: "#651fff", sizeMult: 16 }, // Deep violet
            { name: "Liquidity Pools", color: "#00e5ff", sizeMult: 9 }, // Cyan
            { name: "Insiders", color: "#ff9100", sizeMult: 6 }, // Orange
            { name: "Retail", color: "#b388ff", sizeMult: 2 } // Light purple
        ];

        for (let i = 0; i < numNodes; i++) {
            const cluster = clusters[Math.floor(rand() * clusters.length)];
            const size = (rand() * 5 + 2) * cluster.sizeMult;
            nodes.push({
                id: i,
                address: `EQ${Array.from({length:6}, ()=>Math.random().toString(36)[2]).join('')}...${Array.from({length:4}, ()=>Math.random().toString(36)[2]).join('')}`.toUpperCase(),
                group: cluster.name,
                color: cluster.color,
                radius: size,
                isHollow: rand() > 0.5, // 50% chance to be a hollow glowing ring
                balance: (size * 1000).toFixed(0),
                percent: ((size * 1000) / (token.marketCap / token.price) * 100).toFixed(2)
            });
        }

        for (let i = 0; i < numNodes * 1.5; i++) {
            links.push({
                source: Math.floor(rand() * numNodes),
                target: Math.floor(rand() * numNodes),
                value: rand() * 4
            });
        }

        const svg = d3.select("#bubble-map-container").append("svg")
            .attr("width", width)
            .attr("height", height);

        // --- DEFINE FILTERS & MARKERS ---
        const defs = svg.append("defs");

        // Arrow marker for directed links
        defs.append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 20) // offset to prevent overlapping node
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("fill", "rgba(255,255,255,0.4)")
            .attr("d", "M0,-5L10,0L0,5");

        // Glow filter
        const filter = defs.append("filter").attr("id", "glow");
        filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        const g = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.05, 5])
            .on("zoom", (event) => g.attr("transform", event.transform));
        
        svg.call(zoom);
        
        // Initial zoom out slightly to see the wide network
        svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.6).translate(-width/2, -height/2));

        document.getElementById('zoom-in').onclick = () => svg.transition().call(zoom.scaleBy, 1.3);
        document.getElementById('zoom-out').onclick = () => svg.transition().call(zoom.scaleBy, 0.7);
        document.getElementById('zoom-reset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

        // Network Physics (Arkham style: spread out, visible links)
        bubbleSim = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-400)) // Strong repulsion
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(d => d.radius + 10).iterations(2));

        const link = g.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke-width", d => Math.max(1, Math.sqrt(d.value)))
            .attr("marker-end", "url(#arrow)");

        const tooltip = d3.select("#bubble-tooltip");
        const panelWallet = document.getElementById('panel-wallet');

        const node = g.append("g")
            .attr("class", "nodes")
            .selectAll("circle")
            .data(nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", d => d.radius)
            .attr("fill", d => d.isHollow ? "var(--bg-navy)" : d.color) // Hollow or filled
            .attr("stroke", d => d.color)
            .attr("stroke-width", d => d.isHollow ? 3 : 1)
            .style("filter", "url(#glow)") // Glow effect
            .call(d3.drag()
                .on("start", (event, d) => {
                    if (!event.active) bubbleSim.alphaTarget(0.3).restart();
                    d.fx = d.x; d.fy = d.y;
                })
                .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
                .on("end", (event, d) => {
                    if (!event.active) bubbleSim.alphaTarget(0);
                    d.fx = null; d.fy = null;
                }))
            .on("mouseover", (event, d) => {
                // Highlight connected nodes and dim others
                const connected = new Set();
                connected.add(d.id);
                
                link.style("stroke-opacity", l => {
                    if (l.source.id === d.id || l.target.id === d.id) {
                        connected.add(l.source.id);
                        connected.add(l.target.id);
                        return 1;
                    }
                    return 0.1;
                });
                
                node.style("opacity", n => connected.has(n.id) ? 1 : 0.1);

                tooltip.style("display", "block")
                       .html(`<strong>${d.group}</strong><br/>${d.address}`)
                       .style("left", (event.pageX + 15) + "px")
                       .style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", () => {
                // Restore all opacities
                node.style("opacity", 1);
                link.style("stroke-opacity", 0.6);
                tooltip.style("display", "none");
            })
            .on("click", (event, d) => {
                panelWallet.style.display = 'block';
                document.getElementById('wallet-badge').textContent = d.group;
                document.getElementById('wallet-badge').style.color = d.color;
                document.getElementById('wallet-address').textContent = d.address;
                document.getElementById('wallet-balance').textContent = `${parseFloat(d.balance).toLocaleString()} ${token.symbol}`;
                document.getElementById('wallet-supply').textContent = `${d.percent}%`;
            });

        bubbleSim.on("tick", () => {
            // Update link positions
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            // Re-calculate refX for markers to stop exactly at the node's edge instead of center
            link.attr("marker-end", d => {
                // Math to put arrow on edge of target node instead of center
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const r = d.target.radius + 3; // +3 for stroke
                // We'll just let d3 marker refX handle it dynamically via a rough estimate, or set refX in defs.
                return "url(#arrow)";
            });

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);
        });
        
        window.onresize = () => {
            if (document.getElementById('view-map').style.display === 'block') {
                const w = container.clientWidth;
                const h = container.clientHeight;
                svg.attr("width", w).attr("height", h);
                bubbleSim.force("center", d3.forceCenter(w / 2, h / 2));
                bubbleSim.alpha(0.3).restart();
            }
        };
    }

    // === LIVE SIMULATION ===
    function startLiveUpdates() {
        if (dataInterval) clearInterval(dataInterval);
        dataInterval = setInterval(() => {
            tokens.forEach(token => {
                const move = token.price * (rand() * 0.004 - 0.002);
                token.price += move;
                token.change24h += (move / token.price) * 100;
                
                // Update table row if exists
                const rowPrice = document.getElementById(`row-price-${token.symbol}`);
                if (rowPrice) {
                    rowPrice.textContent = formatPrice(token.price);
                    rowPrice.style.color = move >= 0 ? '#4caf50' : '#f44336';
                    setTimeout(() => rowPrice.style.color = '', 1000);
                }
                
                const rowChange = document.getElementById(`row-change-${token.symbol}`);
                if (rowChange) {
                    const isPos = token.change24h >= 0;
                    rowChange.textContent = (isPos ? '+' : '') + token.change24h.toFixed(2) + '%';
                    rowChange.className = `col-24h ${isPos ? 'text-green' : 'text-red'}`;
                }
                
                // Update active map panel if viewing this token
                if (activeToken && activeToken.symbol === token.symbol) {
                    const mapPrice = document.getElementById('map-price');
                    mapPrice.textContent = formatPrice(token.price);
                    mapPrice.style.color = move >= 0 ? '#4caf50' : '#f44336';
                    setTimeout(() => mapPrice.style.color = '', 1000);
                }
            });
        }, 3000);
    }

    // === INIT ===
    window.addEventListener('DOMContentLoaded', () => {
        generateTokens();
        renderTable();
        startLiveUpdates();

        document.getElementById('btn-back').addEventListener('click', () => {
            document.getElementById('view-map').style.display = 'none';
            document.getElementById('view-list').style.display = 'block';
            if (bubbleSim) bubbleSim.stop();
            activeToken = null;
        });
    });

})();
