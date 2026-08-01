(function() {
    'use strict';

    // === MODULE 6: Utility Functions ===
    
    // Deterministic random generator based on a string seed
    function seededRandom(seed) {
        let h = 0xdeadbeef;
        for(let i = 0; i < seed.length; i++)
            h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
        return function() {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            return ((h ^= h >>> 16) >>> 0) / 4294967296;
        };
    }

    function randomRange(min, max, randomFn = Math.random) {
        return min + randomFn() * (max - min);
    }

    function formatNumber(num) {
        if (num === null || num === undefined) return '-';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function formatPrice(price) {
        if (price === null || price === undefined) return '-';
        if (price < 0.0001) return '$' + price.toExponential(2);
        if (price < 0.01) return '$' + price.toFixed(6);
        if (price < 1) return '$' + price.toFixed(4);
        return '$' + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatPct(pct) {
        if (pct === null || pct === undefined) return '-';
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct.toFixed(2)}%`;
    }

    function formatAddress(addr) {
        if (!addr || addr.length < 10) return addr;
        return addr.substring(0, 4) + '...' + addr.substring(addr.length - 4);
    }

    function formatTimeAgo(timestamp) {
        const seconds = Math.floor((new Date() - timestamp) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + 'y ago';
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + 'mo ago';
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + 'd ago';
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + 'h ago';
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + 'm ago';
        return Math.floor(seconds) + 's ago';
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            if (window.showWalletToast) {
                window.showWalletToast('Copied to clipboard');
            } else {
                alert('Copied: ' + text);
            }
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }

    function showSkeleton(containerId) {
        const el = document.getElementById(containerId);
        if (el) {
            el.innerHTML = '<div class="terminal-skeleton"><div class="skeleton-pulse"></div></div>';
        }
    }

    function hideSkeleton(containerId) {
        // Handled by rendering over it
    }

    function animateNumber(element, target, duration) {
        if (!element) return;
        const start = parseFloat(element.getAttribute('data-value') || 0);
        const change = target - start;
        const startTime = performance.now();
        
        element.setAttribute('data-value', target);
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const current = start + change * easeProgress;
            
            if (element.classList.contains('is-price')) {
                element.textContent = formatPrice(current);
            } else if (element.classList.contains('is-pct')) {
                element.textContent = formatPct(current);
            } else {
                element.textContent = formatNumber(current);
            }
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.classList.remove('val-up', 'val-down');
                if (change > 0) {
                    element.classList.add('val-up');
                    setTimeout(() => element.classList.remove('val-up'), 500);
                } else if (change < 0) {
                    element.classList.add('val-down');
                    setTimeout(() => element.classList.remove('val-down'), 500);
                }
            }
        }
        requestAnimationFrame(update);
    }


    // === MODULE 1: GramDataEngine ===

    const GRAM_TOKENS = [
        { symbol: 'GRAM', name: 'GRAM', logo: '💎', basePrice: 0.0847, baseMcap: 84700000, baseVol: 12500000, baseLiq: 8200000, holders: 48520, maxSupply: 5000000000, circSupply: 3200000000 },
        { symbol: 'REDO', name: 'Resistance Dog', logo: '🐕', basePrice: 0.0234, baseMcap: 23400000, baseVol: 4800000, baseLiq: 3100000, holders: 32100, maxSupply: 2000000000, circSupply: 1500000000 },
        { symbol: 'NOT', name: 'Notcoin', logo: '⚡', basePrice: 0.0156, baseMcap: 156000000, baseVol: 28000000, baseLiq: 15600000, holders: 125000, maxSupply: 10000000000, circSupply: 8200000000 },
        { symbol: 'STON', name: 'STON.fi', logo: '🔷', basePrice: 4.82, baseMcap: 48200000, baseVol: 6200000, baseLiq: 5800000, holders: 18900, maxSupply: 100000000, circSupply: 10000000 },
        { symbol: 'UTYA', name: 'Utya', logo: '🦆', basePrice: 0.00089, baseMcap: 89000, baseVol: 320000, baseLiq: 280000, holders: 8900, maxSupply: 1000000000, circSupply: 850000000 },
        { symbol: 'DOGS', name: 'Dogs', logo: '🐶', basePrice: 0.00072, baseMcap: 72000000, baseVol: 18000000, baseLiq: 9500000, holders: 89000, maxSupply: 100000000000, circSupply: 95000000000 },
        { symbol: 'FISH', name: 'Fishcoin', logo: '🐟', basePrice: 0.0012, baseMcap: 1200000, baseVol: 450000, baseLiq: 380000, holders: 5600, maxSupply: 5000000000, circSupply: 4200000000 },
        { symbol: 'SCALE', name: 'Scaleton', logo: '⚖️', basePrice: 0.045, baseMcap: 4500000, baseVol: 890000, baseLiq: 720000, holders: 7200, maxSupply: 500000000, circSupply: 100000000 },
        { symbol: 'BOLT', name: 'Bolt', logo: '⚡', basePrice: 0.0089, baseMcap: 8900000, baseVol: 1200000, baseLiq: 950000, holders: 12400, maxSupply: 2000000000, circSupply: 1000000000 },
        { symbol: 'DUST', name: 'Dust', logo: '🌫️', basePrice: 0.00034, baseMcap: 340000, baseVol: 120000, baseLiq: 95000, holders: 3200, maxSupply: 10000000000, circSupply: 8500000000 },
        { symbol: 'JET', name: 'Jetton', logo: '🚀', basePrice: 0.067, baseMcap: 6700000, baseVol: 980000, baseLiq: 850000, holders: 9800, maxSupply: 200000000, circSupply: 100000000 },
        { symbol: 'ORBIT', name: 'Orbit', logo: '🪐', basePrice: 0.023, baseMcap: 2300000, baseVol: 560000, baseLiq: 420000, holders: 6100, maxSupply: 500000000, circSupply: 100000000 },
        { symbol: 'PULSE', name: 'Pulse', logo: '💓', basePrice: 0.0156, baseMcap: 1560000, baseVol: 380000, baseLiq: 310000, holders: 4800, maxSupply: 1000000000, circSupply: 100000000 },
        { symbol: 'FLASH', name: 'Flash', logo: '⚡', basePrice: 0.0078, baseMcap: 780000, baseVol: 210000, baseLiq: 180000, holders: 3400, maxSupply: 2000000000, circSupply: 100000000 },
        { symbol: 'STORM', name: 'Storm', logo: '🌪️', basePrice: 0.034, baseMcap: 3400000, baseVol: 670000, baseLiq: 520000, holders: 7800, maxSupply: 500000000, circSupply: 100000000 },
        { symbol: 'NOVA', name: 'Nova', logo: '🌟', basePrice: 0.089, baseMcap: 8900000, baseVol: 1500000, baseLiq: 1200000, holders: 11200, maxSupply: 200000000, circSupply: 100000000 },
        { symbol: 'DRIFT', name: 'Drift', logo: '🏄', basePrice: 0.0045, baseMcap: 450000, baseVol: 95000, baseLiq: 78000, holders: 2800, maxSupply: 1000000000, circSupply: 100000000 },
        { symbol: 'APEX', name: 'Apex', logo: '🔺', basePrice: 0.156, baseMcap: 15600000, baseVol: 2800000, baseLiq: 2200000, holders: 14500, maxSupply: 100000000, circSupply: 100000000 },
        { symbol: 'WAVE', name: 'Wave', logo: '🌊', basePrice: 0.012, baseMcap: 1200000, baseVol: 280000, baseLiq: 220000, holders: 4200, maxSupply: 500000000, circSupply: 100000000 },
        { symbol: 'PRIME', name: 'Prime', logo: '👑', basePrice: 0.234, baseMcap: 23400000, baseVol: 3800000, baseLiq: 3200000, holders: 16800, maxSupply: 100000000, circSupply: 100000000 },
        { symbol: 'VAULT', name: 'Vault', logo: '🏦', basePrice: 0.078, baseMcap: 7800000, baseVol: 1100000, baseLiq: 920000, holders: 8600, maxSupply: 200000000, circSupply: 100000000 },
        { symbol: 'SPARK', name: 'Spark', logo: '✨', basePrice: 0.0023, baseMcap: 2300000, baseVol: 520000, baseLiq: 410000, holders: 6400, maxSupply: 1000000000, circSupply: 900000000 },
        { symbol: 'HYDRA', name: 'Hydra', logo: '🐉', basePrice: 0.045, baseMcap: 4500000, baseVol: 780000, baseLiq: 620000, holders: 7100, maxSupply: 300000000, circSupply: 100000000 },
        { symbol: 'NEXUS', name: 'Nexus', logo: '🔗', basePrice: 0.067, baseMcap: 6700000, baseVol: 920000, baseLiq: 780000, holders: 8200, maxSupply: 200000000, circSupply: 100000000 },
        { symbol: 'CRYPT', name: 'Crypt', logo: '🔐', basePrice: 0.034, baseMcap: 3400000, baseVol: 610000, baseLiq: 490000, holders: 5900, maxSupply: 400000000, circSupply: 100000000 },
        { symbol: 'FORGE', name: 'Forge', logo: '🔨', basePrice: 0.0156, baseMcap: 1560000, baseVol: 340000, baseLiq: 270000, holders: 4100, maxSupply: 800000000, circSupply: 100000000 },
        { symbol: 'BLADE', name: 'Blade', logo: '⚔️', basePrice: 0.089, baseMcap: 8900000, baseVol: 1300000, baseLiq: 1050000, holders: 10200, maxSupply: 200000000, circSupply: 100000000 },
        { symbol: 'ECHO', name: 'Echo', logo: '📡', basePrice: 0.0067, baseMcap: 670000, baseVol: 180000, baseLiq: 140000, holders: 3600, maxSupply: 1000000000, circSupply: 100000000 },
        { symbol: 'LUNAR', name: 'Lunar', logo: '🌙', basePrice: 0.023, baseMcap: 2300000, baseVol: 490000, baseLiq: 380000, holders: 5500, maxSupply: 500000000, circSupply: 100000000 },
        { symbol: 'TITAN', name: 'Titan', logo: '🏛️', basePrice: 0.178, baseMcap: 17800000, baseVol: 3200000, baseLiq: 2600000, holders: 15200, maxSupply: 100000000, circSupply: 100000000 }
    ];

    const GramDataEngine = {
        tokensData: {},
        transactionsByToken: {},
        walletsData: {},

        init() {
            // Restore from session storage or generate initial data
            const savedData = sessionStorage.getItem('gramTerminalData');
            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    this.tokensData = parsed.tokensData;
                    // We re-generate transient things like txs for liveliness, unless we want to persist them
                } catch (e) {
                    console.error('Failed to parse session data', e);
                    this.generateInitialData();
                }
            } else {
                this.generateInitialData();
            }

            // Always init transient feeds
            GRAM_TOKENS.forEach(t => {
                this.transactionsByToken[t.symbol] = this.generateTransactions(t.symbol, true);
            });
        },

        saveData() {
            sessionStorage.setItem('gramTerminalData', JSON.stringify({
                tokensData: this.tokensData
            }));
        },

        generateInitialData() {
            GRAM_TOKENS.forEach((t, i) => {
                const seedFn = seededRandom(t.symbol);
                const priceJitter = randomRange(-0.05, 0.05, seedFn);
                const price = t.basePrice * (1 + priceJitter);
                const ath = t.basePrice * randomRange(1.5, 8, seedFn);
                const atl = t.basePrice * randomRange(0.01, 0.3, seedFn);

                this.tokensData[t.symbol] = {
                    ...t,
                    price: price,
                    change24h: randomRange(-15, 20, seedFn),
                    change7d: randomRange(-25, 35, seedFn),
                    mcap: price * t.circSupply,
                    fdv: price * t.maxSupply,
                    volume24h: t.baseVol * (1 + randomRange(-0.3, 0.3, seedFn)),
                    liquidity: t.baseLiq * (1 + randomRange(-0.1, 0.1, seedFn)),
                    transactions: Math.floor(randomRange(500, 50000, seedFn)),
                    whaleScore: Math.floor(randomRange(10, 95, seedFn)),
                    riskScore: Math.floor(randomRange(10, 85, seedFn)),
                    smartMoneyScore: Math.floor(randomRange(15, 90, seedFn)),
                    trendingScore: Math.floor(randomRange(10, 99, seedFn)),
                    launchDate: new Date(Date.now() - Math.floor(randomRange(30, 365, seedFn)) * 86400000).toISOString(),
                    ath: ath,
                    atl: atl,
                    mintable: seedFn() > 0.5,
                    ownershipRenounced: seedFn() > 0.4,
                    liquidityLocked: seedFn() > 0.2,
                    burnedPct: randomRange(0, 30, seedFn),
                    website: `https://${t.symbol.toLowerCase()}.org`,
                    explorer: `https://tonviewer.com/${t.symbol}`,
                    telegram: `https://t.me/${t.symbol.toLowerCase()}_official`,
                    twitter: `https://twitter.com/${t.symbol.toLowerCase()}_coin`,
                    holdersData: this.generateHolders(t, price),
                    riskAnalysis: this.generateRiskAnalysis(t.symbol),
                    healthScore: this.generateHealthScore(t.symbol),
                    smartMoney: this.generateSmartMoney(t.symbol),
                    insights: this.generateInsights(t.symbol)
                };
            });
            this.saveData();
        },

        updateTokenPrices() {
            Object.keys(this.tokensData).forEach(symbol => {
                const token = this.tokensData[symbol];
                const jitter = randomRange(-0.02, 0.02);
                const oldPrice = token.price;
                token.price = token.price * (1 + jitter);
                token.mcap = token.price * token.circSupply;
                token.fdv = token.price * token.maxSupply;
                
                // Small random updates to other fields to simulate live market
                token.volume24h += token.volume24h * randomRange(-0.01, 0.02);
                token.change24h = token.change24h + (token.price - oldPrice) / oldPrice * 100;
                
                // Add new transaction
                if (Math.random() > 0.3) {
                    this.transactionsByToken[symbol].unshift(this.generateSingleTransaction(symbol));
                    if (this.transactionsByToken[symbol].length > 50) {
                        this.transactionsByToken[symbol].pop();
                    }
                    token.transactions++;
                }
            });
            this.saveData();
        },

        generateHolders(token, price) {
            const holders = [];
            let remainingSupply = token.circSupply;
            const seedFn = seededRandom(token.symbol + '_holders');
            
            const labels = ["Liquidity Pool", "Team Wallet", "Burn Address", "Treasury", "STON.fi Pool", "DeDust Pool", "OKX Hot Wallet", "Bybit Hot Wallet", "Unknown"];
            
            for (let i = 0; i < 100; i++) {
                const address = 'EQ' + Array.from({length: 46}, () => Math.floor(seedFn() * 16).toString(16)).join('');
                let balance;
                if (i === 0) {
                    balance = token.circSupply * randomRange(0.05, 0.15, seedFn);
                } else if (i < 10) {
                    balance = token.circSupply * randomRange(0.01, 0.05, seedFn) / i;
                } else {
                    balance = remainingSupply * randomRange(0.001, 0.01, seedFn);
                }
                remainingSupply -= balance;

                const label = i < 5 ? labels[Math.floor(seedFn() * labels.length)] : (seedFn() > 0.9 ? labels[Math.floor(seedFn() * labels.length)] : "Unknown");
                const avgBuyPrice = token.basePrice * randomRange(0.5, 1.5, seedFn);
                const pnl = ((price - avgBuyPrice) / avgBuyPrice) * 100;

                holders.push({
                    address,
                    label,
                    balance,
                    pct: (balance / token.circSupply) * 100,
                    usdValue: balance * price,
                    lastActivity: new Date(Date.now() - Math.floor(randomRange(1000, 10000000, seedFn))),
                    buyDate: new Date(Date.now() - Math.floor(randomRange(10000000, 50000000, seedFn))),
                    avgBuyPrice,
                    pnl,
                    walletAge: Math.floor(randomRange(10, 365, seedFn)),
                    riskLevel: label.includes('Burn') ? 'Low' : (balance / token.circSupply > 0.05 && label === 'Unknown' ? 'High' : 'Medium'),
                    type: label.includes('Pool') ? 'lp' : (label.includes('Team') ? 'team' : (label.includes('Burn') ? 'burn' : (i < 5 ? 'whale' : 'unknown')))
                });
            }
            return holders.sort((a, b) => b.balance - a.balance);
        },

        generateRiskAnalysis(symbol) {
            const seedFn = seededRandom(symbol + '_risk');
            const genScore = () => Math.floor(randomRange(0, 100, seedFn));
            
            const analysis = {
                liquidityRisk: genScore(),
                ownershipRisk: genScore(),
                whaleConcentration: genScore(),
                devWalletPct: genScore(),
                unlockedSupply: genScore(),
                mintFunction: genScore(),
                blacklistFunction: genScore(),
                pauseFunction: genScore(),
                proxyContract: genScore(),
                upgradeableContract: genScore(),
                lpLockPct: genScore(),
                topHolderPct: genScore(),
                rugPullProbability: genScore(),
                scamProbability: genScore(),
                centralizationScore: genScore(),
                securityScore: genScore(),
            };
            
            analysis.overallRiskScore = Math.floor(Object.values(analysis).reduce((a,b) => a + b, 0) / 16);
            return analysis;
        },

        generateHealthScore(symbol) {
            const seedFn = seededRandom(symbol + '_health');
            const genScore = () => Math.floor(randomRange(40, 100, seedFn));
            const factors = {
                security: genScore(),
                liquidity: genScore(),
                decentralization: genScore(),
                holderDistribution: genScore(),
                tradingActivity: genScore(),
                communityGrowth: genScore(),
                developerActivity: genScore(),
                contractQuality: genScore(),
                transparency: genScore()
            };
            const overall = Math.floor(Object.values(factors).reduce((a,b) => a+b, 0) / 9);
            return { overall, factors };
        },

        generateSmartMoney(symbol) {
            const seedFn = seededRandom(symbol + '_smart');
            const wallets = [];
            for (let i = 0; i < 12; i++) {
                wallets.push({
                    address: 'EQ' + Array.from({length: 46}, () => Math.floor(seedFn() * 16).toString(16)).join(''),
                    recentPurchases: Math.floor(randomRange(0, 50, seedFn)),
                    recentSales: Math.floor(randomRange(0, 50, seedFn)),
                    avgEntry: randomRange(0.001, 5, seedFn),
                    holdingTime: Math.floor(randomRange(1, 100, seedFn)) + ' days',
                    accumulationTrend: seedFn() > 0.5 ? 'Up' : 'Down',
                    distributionTrend: seedFn() > 0.5 ? 'High' : 'Low',
                    netPosition: seedFn() > 0.4 ? 'Long' : 'Short'
                });
            }
            return wallets;
        },

        generateTransactions(symbol, initial = false) {
            const txs = [];
            const count = initial ? 50 : 1;
            for (let i = 0; i < count; i++) {
                txs.push(this.generateSingleTransaction(symbol));
            }
            return txs;
        },

        generateSingleTransaction(symbol) {
            const types = ['buy', 'sell', 'whale_buy', 'whale_sell', 'dev_tx', 'exchange_deposit', 'exchange_withdrawal'];
            const type = types[Math.floor(Math.random() * types.length)];
            const token = this.tokensData[symbol] || GRAM_TOKENS.find(t => t.symbol === symbol);
            const amount = randomRange(10, 50000) * (type.includes('whale') ? 10 : 1);
            return {
                type,
                amount: amount,
                tokenAmount: amount / token.basePrice, // Approx
                address: 'EQ' + Array.from({length: 46}, () => Math.floor(Math.random() * 16).toString(16)).join(''),
                timestamp: Date.now() - Math.floor(Math.random() * 10000)
            };
        },

        generateInsights(symbol) {
            const seedFn = seededRandom(symbol + '_insights');
            const insights = [
                { text: `Whales ${seedFn() > 0.5 ? 'accumulated' : 'distributed'} ${Math.floor(randomRange(1, 15, seedFn))}% during the last 24 hours.`, sentiment: seedFn() > 0.5 ? 'positive' : 'negative' },
                { text: `Liquidity ${seedFn() > 0.5 ? 'increased' : 'decreased'} by ${Math.floor(randomRange(1, 20, seedFn))}% in the last 6 hours.`, sentiment: seedFn() > 0.5 ? 'positive' : 'negative' },
                { text: `Top holders ${seedFn() > 0.5 ? 'reduced' : 'increased'} concentration by ${Math.floor(randomRange(1, 5, seedFn))}%.`, sentiment: 'neutral' },
                { text: `Developer wallet has remained inactive for ${Math.floor(randomRange(5, 90, seedFn))} days.`, sentiment: 'positive' },
                { text: `Exchange inflows are ${seedFn() > 0.5 ? 'increasing — possible sell pressure' : 'decreasing — holding sentiment strong'}.`, sentiment: seedFn() > 0.5 ? 'negative' : 'positive' },
                { text: `Holder count reached a new all-time high.`, sentiment: 'positive' },
                { text: `Smart money wallets opened ${Math.floor(randomRange(1, 10, seedFn))} new positions.`, sentiment: 'positive' },
                { text: `Risk score ${seedFn() > 0.5 ? 'improved' : 'worsened'} after recent contract analysis.`, sentiment: seedFn() > 0.5 ? 'positive' : 'negative' }
            ];
            // Randomly select 6
            return insights.sort(() => 0.5 - seedFn()).slice(0, 6).map(ins => ({ ...ins, timestamp: Date.now() - Math.floor(randomRange(1000, 86400000, seedFn))}));
        },
        
        getToken(symbol) {
            return this.tokensData[symbol];
        }
    };


    // === MODULE 2: TerminalRouter ===

    const TerminalRouter = {
        init() {
            window.addEventListener('hashchange', () => this.route());
            this.route();
        },
        route() {
            const hash = location.hash || '#rankings';
            
            // Hide all views
            document.querySelectorAll('.terminal-view').forEach(el => {
                el.style.display = 'none';
                el.classList.remove('view-active');
            });

            if (hash === '#rankings') {
                const view = document.getElementById('view-rankings');
                if (view) {
                    view.style.display = 'block';
                    view.classList.add('view-active');
                    RankingsView.show();
                }
            } else if (hash.startsWith('#token/')) {
                const view = document.getElementById('view-token-detail');
                if (view) {
                    view.style.display = 'block';
                    view.classList.add('view-active');
                    TokenDetailView.show(hash.split('/')[1]);
                }
            } else if (hash.startsWith('#wallet/')) {
                const view = document.getElementById('view-wallet-detail');
                if (view) {
                    view.style.display = 'block';
                    view.classList.add('view-active');
                    WalletDetailView.show(hash.split('/')[1]);
                }
            } else {
                this.navigate('#rankings');
            }
        },
        navigate(hash) {
            location.hash = hash;
        }
    };

    // Export globally for external use
    window.navigateToToken = (symbol) => TerminalRouter.navigate('#token/' + symbol);
    window.navigateToWallet = (addr) => TerminalRouter.navigate('#wallet/' + addr);


    // === MODULE 3: RankingsView ===

    const RankingsView = {
        currentSort: 'mcap',
        currentOrder: 'desc',
        searchQuery: '',
        
        show() {
            this.render();
            const searchInput = document.getElementById('terminalSearchInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    this.filter(e.target.value);
                });
            }
            
            // Attach sort listeners
            document.querySelectorAll('.sort-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sortField = e.target.getAttribute('data-sort');
                    if (this.currentSort === sortField) {
                        this.currentOrder = this.currentOrder === 'desc' ? 'asc' : 'desc';
                    } else {
                        this.currentSort = sortField;
                        this.currentOrder = 'desc';
                    }
                    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('sort-active'));
                    e.target.classList.add('sort-active');
                    this.render();
                });
            });
        },

        sort(tokens) {
            return tokens.sort((a, b) => {
                let valA = a[this.currentSort];
                let valB = b[this.currentSort];
                
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();

                if (valA < valB) return this.currentOrder === 'desc' ? 1 : -1;
                if (valA > valB) return this.currentOrder === 'desc' ? -1 : 1;
                return 0;
            });
        },

        filter(query) {
            this.searchQuery = query.toLowerCase();
            this.render();
        },

        getScoreClass(score) {
            if (score >= 80) return 'score-high';
            if (score >= 40) return 'score-medium';
            return 'score-low';
        },

        getRiskClass(score) {
            if (score >= 70) return 'score-low'; // high risk is bad (red)
            if (score >= 40) return 'score-medium'; // medium risk is yellow
            return 'score-high'; // low risk is good (green)
        },

        render() {
            const tbody = document.querySelector('#rankingsTable tbody');
            if (!tbody) return;

            let tokens = Object.values(GramDataEngine.tokensData);
            
            if (this.searchQuery) {
                tokens = tokens.filter(t => t.symbol.toLowerCase().includes(this.searchQuery) || t.name.toLowerCase().includes(this.searchQuery));
            }

            tokens = this.sort(tokens);

            tbody.innerHTML = '';
            tokens.forEach((t, index) => {
                const tr = document.createElement('tr');
                tr.onclick = () => window.navigateToToken(t.symbol);
                tr.style.cursor = 'pointer';
                
                const pctClass24 = t.change24h >= 0 ? 'color-green' : 'color-red';
                const pctClass7 = t.change7d >= 0 ? 'color-green' : 'color-red';

                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td><div style="font-size: 1.5em">${t.logo}</div></td>
                    <td><strong>${t.name}</strong></td>
                    <td>${t.symbol}</td>
                    <td class="font-mono is-price" data-value="${t.price}">${formatPrice(t.price)}</td>
                    <td class="font-mono ${pctClass24} is-pct" data-value="${t.change24h}">${formatPct(t.change24h)}</td>
                    <td class="font-mono ${pctClass7}">${formatPct(t.change7d)}</td>
                    <td class="font-mono" data-value="${t.mcap}">$${formatNumber(t.mcap)}</td>
                    <td class="font-mono" data-value="${t.liquidity}">$${formatNumber(t.liquidity)}</td>
                    <td class="font-mono" data-value="${t.fdv}">$${formatNumber(t.fdv)}</td>
                    <td class="font-mono" data-value="${t.volume24h}">$${formatNumber(t.volume24h)}</td>
                    <td class="font-mono">${formatNumber(t.transactions)}</td>
                    <td class="font-mono">${formatNumber(t.holders)}</td>
                    <td><span class="score-badge ${this.getScoreClass(t.whaleScore)}">${t.whaleScore}</span></td>
                    <td><span class="score-badge ${this.getRiskClass(t.riskScore)}">${t.riskScore}</span></td>
                    <td><span class="score-badge ${this.getScoreClass(t.smartMoneyScore)}">${t.smartMoneyScore}</span></td>
                    <td><span class="score-badge ${this.getScoreClass(t.trendingScore)}">${t.trendingScore}</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    };


    // === MODULE 4: TokenDetailView ===

    const TokenDetailView = {
        currentToken: null,
        chartInstance: null,
        txInterval: null,

        show(symbol) {
            this.currentToken = GramDataEngine.getToken(symbol);
            if (!this.currentToken) {
                TerminalRouter.navigate('#rankings');
                return;
            }
            this.render();
            
            // Start tx feed polling for this view
            if (this.txInterval) clearInterval(this.txInterval);
            this.txInterval = setInterval(() => {
                this.renderTransactionFeed(this.currentToken, true); // true = append mode
            }, 3000);
        },

        hide() {
            if (this.txInterval) clearInterval(this.txInterval);
            if (this.chartInstance) {
                this.chartInstance.remove();
                this.chartInstance = null;
            }
        },

        render() {
            const container = document.getElementById('view-token-detail');
            if (!container) return;

            // Base Layout
            container.innerHTML = `
                <div class="terminal-header">
                    <button class="back-btn" onclick="history.back()">← Back</button>
                    <div id="td-header"></div>
                </div>
                <div class="td-grid">
                    <div class="td-main">
                        <div id="td-overview" class="td-card"></div>
                        <div id="td-chart" class="td-card" style="height: 400px; position: relative;">
                            <div id="chartContainer" style="width: 100%; height: 100%;"></div>
                        </div>
                        <div id="td-holders" class="td-card"></div>
                    </div>
                    <div class="td-sidebar">
                        <div id="td-health" class="td-card"></div>
                        <div id="td-risk" class="td-card"></div>
                        <div id="td-smart" class="td-card"></div>
                        <div id="td-insights" class="td-card"></div>
                        <div id="td-feed" class="td-card feed-container"></div>
                    </div>
                </div>
            `;

            const t = this.currentToken;
            this.renderHeader(t);
            this.renderOverview(t);
            this.renderChart(t);
            this.renderHolders(t, 10);
            this.renderHealthScore(t);
            this.renderRiskAnalysis(t);
            this.renderSmartMoney(t);
            this.renderInsights(t);
            this.renderTransactionFeed(t, false);
        },

        renderHeader(token) {
            const el = document.getElementById('td-header');
            if (!el) return;
            el.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 2.5em;">${token.logo}</span>
                    <div>
                        <h1 style="margin:0;">${token.name} <span style="color: #666;">${token.symbol}</span></h1>
                        <div class="font-mono" style="font-size: 1.5em; display:flex; gap:15px; align-items: baseline;">
                            <span class="is-price" data-value="${token.price}">${formatPrice(token.price)}</span>
                            <span class="${token.change24h >= 0 ? 'color-green' : 'color-red'} is-pct" data-value="${token.change24h}" style="font-size: 0.6em;">${formatPct(token.change24h)} 24H</span>
                        </div>
                    </div>
                </div>
            `;
        },

        renderOverview(token) {
            const el = document.getElementById('td-overview');
            if (!el) return;
            el.innerHTML = `
                <h3>Overview</h3>
                <div class="overview-grid">
                    <div class="stat-box">
                        <div class="stat-label">Market Cap</div>
                        <div class="stat-val font-mono" data-value="${token.mcap}">$${formatNumber(token.mcap)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">FDV</div>
                        <div class="stat-val font-mono" data-value="${token.fdv}">$${formatNumber(token.fdv)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">24H Volume</div>
                        <div class="stat-val font-mono" data-value="${token.volume24h}">$${formatNumber(token.volume24h)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Liquidity</div>
                        <div class="stat-val font-mono" data-value="${token.liquidity}">$${formatNumber(token.liquidity)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Holders</div>
                        <div class="stat-val font-mono">${formatNumber(token.holders)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Circ. Supply</div>
                        <div class="stat-val font-mono">${formatNumber(token.circSupply)} ${token.symbol}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Max Supply</div>
                        <div class="stat-val font-mono">${formatNumber(token.maxSupply)} ${token.symbol}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">ATH / ATL</div>
                        <div class="stat-val font-mono">${formatPrice(token.ath)} / ${formatPrice(token.atl)}</div>
                    </div>
                </div>
                <div class="links-row" style="margin-top: 15px; display:flex; gap:10px;">
                    <a href="${token.website}" target="_blank" class="terminal-btn">Website</a>
                    <a href="${token.explorer}" target="_blank" class="terminal-btn">Explorer</a>
                    <a href="${token.twitter}" target="_blank" class="terminal-btn">Twitter</a>
                    <a href="${token.telegram}" target="_blank" class="terminal-btn">Telegram</a>
                </div>
            `;
        },

        renderChart(token) {
            const container = document.getElementById('chartContainer');
            if (!container) return;
            
            // Generate mock OHLCV data
            const data = [];
            const volData = [];
            const markers = [];
            let currentPrice = token.basePrice * 0.5; // Start lower
            const now = Math.floor(Date.now() / 1000);
            const seedFn = seededRandom(token.symbol + '_chart');

            for (let i = 90; i >= 0; i--) {
                const time = now - i * 86400;
                const jitter = randomRange(-0.1, 0.1, seedFn);
                const open = currentPrice;
                const close = currentPrice * (1 + jitter);
                const high = Math.max(open, close) * (1 + randomRange(0, 0.05, seedFn));
                const low = Math.min(open, close) * (1 - randomRange(0, 0.05, seedFn));
                const volume = token.baseVol * randomRange(0.5, 1.5, seedFn) / 90;
                
                data.push({ time, open, high, low, close });
                volData.push({ time, value: volume, color: close >= open ? '#26a69a' : '#ef5350' });
                
                if (seedFn() > 0.9) {
                    markers.push({
                        time,
                        position: close >= open ? 'belowBar' : 'aboveBar',
                        color: close >= open ? '#2196F3' : '#FF9800',
                        shape: close >= open ? 'arrowUp' : 'arrowDown',
                        text: close >= open ? 'Whale Buy' : 'Whale Sell'
                    });
                }
                
                currentPrice = close;
            }
            // Ensure last price matches current live price
            data[data.length-1].close = token.price;

            if (window.LightweightCharts) {
                const chart = LightweightCharts.createChart(container, {
                    layout: { background: { color: 'transparent' }, textColor: '#d1d4dc' },
                    grid: { vertLines: { color: '#2B2B43' }, horzLines: { color: '#2B2B43' } },
                    timeScale: { borderColor: '#2B2B43' }
                });
                this.chartInstance = chart;

                const mainSeries = chart.addAreaSeries({
                    topColor: 'rgba(38, 166, 154, 0.56)',
                    bottomColor: 'rgba(38, 166, 154, 0.04)',
                    lineColor: 'rgba(38, 166, 154, 1)',
                    lineWidth: 2
                });
                // Note: LightweightCharts AreaSeries expects {time, value}
                const areaData = data.map(d => ({time: d.time, value: d.close}));
                mainSeries.setData(areaData);
                mainSeries.setMarkers(markers);

                chart.timeScale().fitContent();
            } else {
                // Fallback canvas chart
                container.innerHTML = '<canvas id="fallbackChart" width="800" height="400" style="width:100%; height:100%;"></canvas>';
                const ctx = document.getElementById('fallbackChart').getContext('2d');
                if(ctx) {
                    ctx.fillStyle = '#26a69a';
                    ctx.strokeStyle = '#26a69a';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    const width = 800;
                    const height = 400;
                    const minPrice = Math.min(...data.map(d => d.close));
                    const maxPrice = Math.max(...data.map(d => d.close));
                    
                    data.forEach((d, i) => {
                        const x = (i / data.length) * width;
                        const y = height - ((d.close - minPrice) / (maxPrice - minPrice)) * height;
                        if(i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();
                }
            }
        },

        renderHolders(token, count) {
            const el = document.getElementById('td-holders');
            if (!el) return;

            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Holder Distribution</h3>
                    <div class="tabs">
                        <button class="terminal-btn ${count===10?'active':''}" onclick="TokenDetailView.renderHolders(TokenDetailView.currentToken, 10)">Top 10</button>
                        <button class="terminal-btn ${count===25?'active':''}" onclick="TokenDetailView.renderHolders(TokenDetailView.currentToken, 25)">Top 25</button>
                        <button class="terminal-btn ${count===50?'active':''}" onclick="TokenDetailView.renderHolders(TokenDetailView.currentToken, 50)">Top 50</button>
                        <button class="terminal-btn ${count===100?'active':''}" onclick="TokenDetailView.renderHolders(TokenDetailView.currentToken, 100)">Top 100</button>
                    </div>
                </div>
                <div class="terminal-table-wrapper" style="max-height: 400px;">
                    <table class="terminal-table">
                        <thead>
                            <tr>
                                <th>Address</th>
                                <th>Label / Type</th>
                                <th>Balance</th>
                                <th>%</th>
                                <th>Value</th>
                                <th>P&L</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            const holdersToShow = token.holdersData.slice(0, count);
            
            holdersToShow.forEach(h => {
                const pnlClass = h.pnl >= 0 ? 'color-green' : 'color-red';
                html += `
                    <tr>
                        <td class="font-mono">
                            <a href="javascript:void(0)" onclick="window.navigateToWallet('${h.address}')" style="color: #64b5f6; text-decoration: none;">${formatAddress(h.address)}</a>
                            <button onclick="copyToClipboard('${h.address}')" class="terminal-btn" style="padding:2px 5px; font-size:0.7em; margin-left:5px;">Copy</button>
                        </td>
                        <td>
                            <span class="badge badge-${h.type}">${h.type}</span>
                            ${h.label !== 'Unknown' ? `<span style="font-size:0.8em; color:#aaa; margin-left:5px;">${h.label}</span>` : ''}
                        </td>
                        <td class="font-mono">${formatNumber(h.balance)}</td>
                        <td class="font-mono">${h.pct.toFixed(2)}%</td>
                        <td class="font-mono">$${formatNumber(h.usdValue)}</td>
                        <td class="font-mono ${pnlClass}">${formatPct(h.pnl)}</td>
                    </tr>
                `;
            });

            html += `</tbody></table></div>`;
            el.innerHTML = html;
        },

        renderRiskAnalysis(token) {
            const el = document.getElementById('td-risk');
            if (!el) return;
            
            const r = token.riskAnalysis;
            const getRiskColor = (val) => val <= 25 ? '#4caf50' : (val <= 50 ? '#ffeb3b' : (val <= 75 ? '#ff9800' : '#f44336'));
            
            let html = `<h3>Risk Analysis</h3><div class="risk-grid">`;
            
            const renderBar = (label, value) => `
                <div class="risk-item">
                    <div style="display:flex; justify-content:space-between; font-size: 0.8em; margin-bottom: 2px;">
                        <span>${label}</span>
                        <span class="font-mono">${value}/100</span>
                    </div>
                    <div style="width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                        <div style="width:${value}%; height:100%; background:${getRiskColor(value)};"></div>
                    </div>
                </div>
            `;

            html += renderBar('Liquidity Risk', r.liquidityRisk);
            html += renderBar('Ownership Risk', r.ownershipRisk);
            html += renderBar('Whale Concen.', r.whaleConcentration);
            html += renderBar('Dev Wallet', r.devWalletPct);
            html += renderBar('Unlocked Supply', r.unlockedSupply);
            html += renderBar('Centralization', r.centralizationScore);
            
            html += `</div>
                <div style="margin-top:15px; text-align:center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px;">
                    <div style="font-size: 0.8em; color: #888;">OVERALL RISK SCORE</div>
                    <div style="font-size: 2em; font-weight: bold; color: ${getRiskColor(r.overallRiskScore)}">${r.overallRiskScore}</div>
                </div>
            `;
            
            el.innerHTML = html;
        },

        renderHealthScore(token) {
            const el = document.getElementById('td-health');
            if (!el) return;
            const h = token.healthScore;
            
            // Generate a simple SVG circle
            const radius = 40;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (h.overall / 100) * circumference;
            const color = h.overall >= 70 ? '#4caf50' : (h.overall >= 40 ? '#ff9800' : '#f44336');

            let html = `
                <h3>Project Health</h3>
                <div style="display:flex; align-items:center; gap: 20px; margin-bottom: 15px;">
                    <div style="position:relative; width: 100px; height: 100px;">
                        <svg width="100" height="100" style="transform: rotate(-90deg);">
                            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="#222" stroke-width="8"></circle>
                            <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"></circle>
                        </svg>
                        <div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size: 1.5em; font-weight:bold;">
                            ${h.overall}
                        </div>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:0.9em; margin-bottom:5px;">Top Factors:</div>
                        <div style="font-size:0.8em; display:flex; justify-content:space-between;"><span>Security</span><span>${h.factors.security}</span></div>
                        <div style="font-size:0.8em; display:flex; justify-content:space-between;"><span>Liquidity</span><span>${h.factors.liquidity}</span></div>
                        <div style="font-size:0.8em; display:flex; justify-content:space-between;"><span>Dev Activity</span><span>${h.factors.developerActivity}</span></div>
                    </div>
                </div>
            `;
            el.innerHTML = html;
        },

        renderSmartMoney(token) {
            const el = document.getElementById('td-smart');
            if (!el) return;
            
            let html = `<h3>Smart Money Flow</h3>
                <div class="terminal-table-wrapper" style="max-height: 200px;">
                    <table class="terminal-table" style="font-size: 0.85em;">
                        <thead><tr><th>Wallet</th><th>Trend</th><th>Hold Time</th></tr></thead>
                        <tbody>
            `;
            
            token.smartMoney.forEach(sm => {
                const trendColor = sm.accumulationTrend === 'Up' ? 'color-green' : 'color-red';
                html += `
                    <tr>
                        <td class="font-mono"><a href="javascript:void(0)" onclick="window.navigateToWallet('${sm.address}')">${formatAddress(sm.address)}</a></td>
                        <td class="${trendColor}">${sm.accumulationTrend}</td>
                        <td>${sm.holdingTime}</td>
                    </tr>
                `;
            });
            html += `</tbody></table></div>`;
            el.innerHTML = html;
        },

        renderInsights(token) {
            const el = document.getElementById('td-insights');
            if (!el) return;
            
            let html = `<h3>AI Insights</h3><div style="display:flex; flex-direction:column; gap:10px;">`;
            token.insights.forEach(ins => {
                let borderCol = '#888';
                if(ins.sentiment === 'positive') borderCol = '#4caf50';
                if(ins.sentiment === 'negative') borderCol = '#f44336';
                
                html += `
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-left: 3px solid ${borderCol}; border-radius: 4px; font-size: 0.9em;">
                        <div style="margin-bottom: 5px;">${ins.text}</div>
                        <div style="font-size: 0.75em; color: #666;">${formatTimeAgo(ins.timestamp)}</div>
                    </div>
                `;
            });
            html += `</div>`;
            el.innerHTML = html;
        },

        renderTransactionFeed(token, append = false) {
            const el = document.getElementById('td-feed');
            if (!el) return;

            if (!append) {
                el.innerHTML = `<h3>Live Transactions</h3><div id="tx-feed-list" style="display:flex; flex-direction:column; gap:5px; max-height:400px; overflow-y:auto; overflow-x:hidden;"></div>`;
            }

            const listEl = document.getElementById('tx-feed-list');
            if (!listEl) return;

            const txs = GramDataEngine.transactionsByToken[token.symbol];
            if (!txs) return;
            
            // If append, just prepend the latest one if it's new
            const txsToRender = append ? [txs[0]] : txs;

            txsToRender.forEach(tx => {
                const div = document.createElement('div');
                div.className = 'tx-item';
                if (append) {
                    div.style.animation = 'slideIn 0.3s ease-out forwards';
                }
                
                let typeColor = '#888';
                let icon = '•';
                if (tx.type.includes('buy')) { typeColor = '#4caf50'; icon = '▲'; }
                if (tx.type.includes('sell')) { typeColor = '#f44336'; icon = '▼'; }
                if (tx.type.includes('whale')) icon = '🐋 ' + icon;

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size: 0.85em; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                        <div style="display:flex; gap: 10px; align-items:center;">
                            <span style="color:${typeColor}; width: 25px;">${icon}</span>
                            <span class="font-mono"><a href="javascript:void(0)" onclick="window.navigateToWallet('${tx.address}')">${formatAddress(tx.address)}</a></span>
                        </div>
                        <div style="text-align:right;">
                            <div class="font-mono" style="color:${typeColor};">${formatNumber(tx.tokenAmount)} ${token.symbol}</div>
                            <div style="font-size: 0.8em; color: #666;">$${formatNumber(tx.amount)} • ${formatTimeAgo(tx.timestamp)}</div>
                        </div>
                    </div>
                `;
                
                if (append) {
                    listEl.insertBefore(div, listEl.firstChild);
                    if (listEl.children.length > 50) {
                        listEl.removeChild(listEl.lastChild);
                    }
                } else {
                    listEl.appendChild(div);
                }
            });
        }
    };


    // === MODULE 5: WalletDetailView ===

    const WalletDetailView = {
        currentWallet: null,

        show(address) {
            this.currentWallet = { address };
            this.render();
        },

        hide() {
        },

        render() {
            const container = document.getElementById('view-wallet-detail');
            if (!container) return;
            
            // Generate mock portfolio
            const seedFn = seededRandom(this.currentWallet.address);
            const numHoldings = Math.floor(randomRange(3, 8, seedFn));
            const holdings = [];
            let totalVal = 0;
            let totalCost = 0;

            const shuffledTokens = [...GRAM_TOKENS].sort(() => 0.5 - seedFn());
            
            for(let i=0; i<numHoldings; i++) {
                const t = shuffledTokens[i];
                const liveT = GramDataEngine.getToken(t.symbol);
                const amount = randomRange(100, 1000000, seedFn);
                const val = amount * liveT.price;
                const cost = amount * (liveT.basePrice * randomRange(0.5, 2, seedFn));
                
                holdings.push({
                    symbol: t.symbol,
                    name: t.name,
                    logo: t.logo,
                    amount: amount,
                    value: val,
                    cost: cost,
                    pnl: ((val - cost) / cost) * 100
                });
                totalVal += val;
                totalCost += cost;
            }

            const totalPnl = ((totalVal - totalCost) / totalCost) * 100;

            container.innerHTML = `
                <div class="terminal-header">
                    <button class="back-btn" onclick="history.back()">← Back</button>
                    <div style="margin-top: 20px;">
                        <h2>Wallet <span class="font-mono" style="color:#64b5f6;">${this.currentWallet.address}</span></h2>
                        <div style="display:flex; gap: 30px; margin-top: 15px;">
                            <div>
                                <div style="font-size:0.8em; color:#888;">Total Value</div>
                                <div class="font-mono" style="font-size:1.8em;">$${formatNumber(totalVal)}</div>
                            </div>
                            <div>
                                <div style="font-size:0.8em; color:#888;">Est. P&L</div>
                                <div class="font-mono ${totalPnl >= 0 ? 'color-green' : 'color-red'}" style="font-size:1.8em;">${formatPct(totalPnl)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 30px;">
                    <h3>Portfolio</h3>
                    <div class="terminal-table-wrapper">
                        <table class="terminal-table">
                            <thead>
                                <tr>
                                    <th>Asset</th>
                                    <th>Amount</th>
                                    <th>Value</th>
                                    <th>Avg Cost</th>
                                    <th>P&L</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${holdings.map(h => `
                                    <tr onclick="window.navigateToToken('${h.symbol}')" style="cursor:pointer;">
                                        <td>${h.logo} <strong>${h.symbol}</strong></td>
                                        <td class="font-mono">${formatNumber(h.amount)}</td>
                                        <td class="font-mono">$${formatNumber(h.value)}</td>
                                        <td class="font-mono">$${formatPrice(h.cost / h.amount)}</td>
                                        <td class="font-mono ${h.pnl >= 0 ? 'color-green' : 'color-red'}">${formatPct(h.pnl)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
    };


    // === MODULE 7: Initialization ===

    function updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.textContent = navigator.onLine ? '🟢 CONNECTED' : '🔴 OFFLINE';
            statusEl.style.color = navigator.onLine ? '#4caf50' : '#f44336';
        }
    }

    function initGramTerminal() {
        console.log("Initializing GRAM Terminal...");
        
        // Ensure DOM structure exists (if not, warn or create basic stubs)
        if (!document.getElementById('view-rankings')) {
            console.warn("GRAM Terminal: Missing required DOM containers. Injecting stubs for testing.");
            const root = document.createElement('div');
            root.innerHTML = `
                <div id="connection-status" style="position:absolute; top:10px; right:10px; font-family:monospace;"></div>
                <div id="view-rankings" class="terminal-view">
                    <div class="rankings-toolbar">
                        <div>
                            <h1 class="rankings-title">GRAM Network — Top 30 Tokens</h1>
                            <div class="sort-group">
                                <button class="sort-btn sort-active" data-sort="mcap">Market Cap</button>
                                <button class="sort-btn" data-sort="volume24h">24H Volume</button>
                                <button class="sort-btn" data-sort="liquidity">Liquidity</button>
                                <button class="sort-btn" data-sort="holders">Holders</button>
                                <button class="sort-btn" data-sort="change24h">Price Change</button>
                                <button class="sort-btn" data-sort="smartMoneyScore">Smart Money</button>
                                <button class="sort-btn" data-sort="whaleScore">Whale Activity</button>
                                <button class="sort-btn" data-sort="trendingScore">Trending</button>
                            </div>
                        </div>
                        <div class="search-container">
                            <input type="text" class="terminal-search" placeholder="Search tokens..." id="terminalSearchInput">
                        </div>
                    </div>
                    <div class="terminal-table-wrapper">
                        <table class="terminal-table" id="rankingsTable">
                            <thead>
                                <tr>
                                    <th>#</th><th></th><th>Token</th><th>Ticker</th><th>Price</th><th>24H%</th><th>7D%</th>
                                    <th>Mkt Cap</th><th>Liquidity</th><th>FDV</th><th>24H Vol</th><th>TXs</th><th>Holders</th>
                                    <th>Whale</th><th>Risk</th><th>Smart $</th><th>Trend</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
                <div id="view-token-detail" class="terminal-view" style="display:none;"></div>
                <div id="view-wallet-detail" class="terminal-view" style="display:none;"></div>
            `;
            document.body.appendChild(root);
        }

        GramDataEngine.init();
        TerminalRouter.init();
        
        // Start real-time updates
        setInterval(() => {
            GramDataEngine.updateTokenPrices();
            if (location.hash === '#rankings' || !location.hash) {
                // Update specific DOM elements without full re-render if possible to allow animations
                const tbody = document.querySelector('#rankingsTable tbody');
                if (tbody && tbody.children.length > 0) {
                    const rows = Array.from(tbody.children);
                    // Fast path: just update values
                    rows.forEach(row => {
                        const symbol = row.children[3].textContent;
                        const token = GramDataEngine.getToken(symbol);
                        if (token) {
                            animateNumber(row.children[4], token.price, 500); // Price
                            animateNumber(row.children[5], token.change24h, 500); // 24h%
                            animateNumber(row.children[7], token.mcap, 500); // Mcap
                            animateNumber(row.children[10], token.volume24h, 500); // Vol
                        }
                    });
                } else {
                    RankingsView.render();
                }
            } else if (location.hash.startsWith('#token/')) {
                // Update live values in token view
                if (TokenDetailView.currentToken) {
                    const t = GramDataEngine.getToken(TokenDetailView.currentToken.symbol);
                    if (t) {
                        const priceEls = document.querySelectorAll('.is-price');
                        priceEls.forEach(el => animateNumber(el, t.price, 500));
                        const pctEls = document.querySelectorAll('.is-pct');
                        pctEls.forEach(el => animateNumber(el, t.change24h, 500));
                        
                        // Update chart last point if lightweight charts
                        if (TokenDetailView.chartInstance && window.LightweightCharts) {
                            // Can't easily update single point without keeping series reference, 
                            // simplistic approach: just let it be, or re-render
                        }
                    }
                }
            }
        }, 4000);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (location.hash !== '#rankings' && location.hash !== '') {
                    history.back();
                }
            }
            if (e.key === '/' && !e.ctrlKey) {
                const activeEl = document.activeElement;
                if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                    return; // already focused on an input
                }
                e.preventDefault();
                const searchInput = document.getElementById('terminalSearchInput');
                if (searchInput) searchInput.focus();
            }
        });
        
        // Online/offline detection
        window.addEventListener('online', updateConnectionStatus);
        window.addEventListener('offline', updateConnectionStatus);
        updateConnectionStatus();

        // Inject basic CSS if not present for slide animations
        if (!document.getElementById('gram-terminal-styles')) {
            const style = document.createElement('style');
            style.id = 'gram-terminal-styles';
            style.innerHTML = `
                @keyframes slideIn {
                    from { transform: translateX(-20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .val-up { color: #4caf50 !important; transition: color 0.3s; }
                .val-down { color: #f44336 !important; transition: color 0.3s; }
                .color-green { color: #4caf50; }
                .color-red { color: #f44336; }
                .score-badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: monospace; }
                .score-high { background: rgba(76, 175, 80, 0.2); color: #4caf50; }
                .score-medium { background: rgba(255, 152, 0, 0.2); color: #ff9800; }
                .score-low { background: rgba(244, 67, 54, 0.2); color: #f44336; }
                .badge { padding: 2px 5px; border-radius: 3px; font-size: 0.8em; text-transform: uppercase; }
                .badge-lp { background: #3f51b5; color: #fff; }
                .badge-team { background: #9c27b0; color: #fff; }
                .badge-burn { background: #000; color: #ffeb3b; border: 1px solid #ffeb3b; }
                .badge-whale { background: #e91e63; color: #fff; }
                .badge-unknown { background: #607d8b; color: #fff; }
                .td-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 20px; }
                .td-card { background: rgba(0,0,0,0.4); border: 1px solid #333; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
                .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
                .stat-box { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 5px; }
                .stat-label { font-size: 0.8em; color: #888; text-transform: uppercase; margin-bottom: 5px; }
                .stat-val { font-size: 1.2em; font-weight: bold; }
                .terminal-btn { background: #222; color: #fff; border: 1px solid #444; padding: 5px 10px; cursor: pointer; border-radius: 4px; }
                .terminal-btn:hover { background: #333; }
                .terminal-btn.active { background: #4caf50; border-color: #4caf50; }
                .tabs { display: flex; gap: 10px; }
                @media (max-width: 1024px) {
                    .td-grid { grid-template-columns: 1fr; }
                    .overview-grid { grid-template-columns: repeat(2, 1fr); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGramTerminal);
    } else {
        initGramTerminal();
    }

})();
