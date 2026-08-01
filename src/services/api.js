import { sleep } from '../utils/helpers.js';

class MockApiService {
    
    async fetchTokens() {
        await sleep(600); // Simulate network latency
        return [
            { id: 'GRAM', name: 'GRAM', ticker: 'GRAM', price: 0.0025, change24h: 14.2, liq: '4.2M', vol: '1.1M' },
            { id: 'REDO', name: 'Resistance Dog', ticker: 'REDO', price: 1.14, change24h: 5.1, liq: '8.4M', vol: '2.5M' },
            { id: 'DUREV', name: 'Pavel Durev', ticker: 'DUREV', price: 0.045, change24h: -2.4, liq: '1.2M', vol: '300K' },
            { id: 'NOT', name: 'Notcoin', ticker: 'NOT', price: 0.015, change24h: 8.4, liq: '25M', vol: '14M' }
        ];
    }

    async analyzeWallet(address) {
        await sleep(1200);
        if(!address || address.length < 10) throw new Error("Invalid wallet address");
        return {
            address: address,
            balanceTON: (Math.random() * 5000).toFixed(2),
            winRate: Math.floor(Math.random() * 100) + '%',
            pnl: (Math.random() > 0.3 ? '+' : '-') + '$' + (Math.random() * 10000).toFixed(2),
            tags: ['Smart Money', 'Airdrop Hunter']
        };
    }

    async fetchTokenAnalytics(tokenId) {
        await sleep(800);
        return {
            rugPullRisk: Math.floor(Math.random() * 20),
            honeypotRisk: Math.floor(Math.random() * 10),
            holderConcentration: Math.floor(Math.random() * 50) + 10,
            aiScore: Math.floor(Math.random() * 40) + 60,
            alerts: [
                "Unusual buying volume detected.",
                "Contract verified and audited.",
                "Liquidity locked for 1 year."
            ]
        };
    }

    async executeSwap(tokenIn, tokenOut, amount) {
        await sleep(2000); // Swaps take time
        return {
            success: true,
            txHash: '0x' + Math.random().toString(16).substr(2, 40),
            received: (amount * 0.98).toFixed(2) // 2% slippage
        };
    }
}

export const API = new MockApiService();
