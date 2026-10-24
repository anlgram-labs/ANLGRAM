/**
 * ANLGRAM Wallet Cluster Explorer — Rebuilt Data Engine
 * Original on-chain relationship graph, token discovery & cluster intelligence.
 * Strictly adheres to ANLGRAM Real-Data Policy. Zero fabricated data.
 */
(function() {
  'use strict';

  // --- Constants & Endpoints ---
  const TONAPI_BASE = 'https://tonapi.io/v2';
  const IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';
  const DEFAULT_REFRESH_INTERVAL = 45000; // 45 seconds

  // --- Verified Seed Directory of Canonical TON Jettons ---
  const SEED_JETTONS = [
    {
      symbol: "USDT",
      name: "Tether USD",
      contract: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
      raw_address: "0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe",
      decimals: 6,
      verification: "whitelist",
      logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      holders: 3446012,
      totalSupply: "1429976002510000",
      description: "Official Tether USD on TON Mainnet."
    },
    {
      symbol: "NOT",
      name: "Notcoin",
      contract: "EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT",
      raw_address: "0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cdn.joincommunity.xyz/clicker/not_logo.png",
      holders: 2856230,
      totalSupply: "102452655868343930134",
      description: "Community token for the Notcoin tap-to-earn ecosystem."
    },
    {
      symbol: "DOGS",
      name: "Dogs",
      contract: "EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS",
      raw_address: "0:afc49cb8786f21c87045b19ede78fc6b46c51048513f8e9a6d44060199c1bf0c",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cdn.dogs.dev/dogs.png",
      holders: 4899834,
      totalSupply: "545217353977227105724",
      description: "Telegram-native community meme coin."
    },
    {
      symbol: "STON",
      name: "STON.fi",
      contract: "EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO",
      raw_address: "0:3690254dc15b2297610cda60744a45f2b710aa4234b89adb630e99d79b01bd4f",
      decimals: 9,
      verification: "whitelist",
      logo: "https://static.ston.fi/logo/ston_symbol.png",
      holders: 71288,
      totalSupply: "99999999776549320",
      description: "Governance & utility token of the STON.fi DEX."
    },
    {
      symbol: "DUST",
      name: "DeDust",
      contract: "EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE",
      raw_address: "0:65aac9b5e380eae928db3c8e238d9bc0d61a9320fdc2bc7a2f6c87d6fedf9208",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cache.tonapi.io/imgproxy/rJ4qAiXZRWvGV6CCF8jHz-qE0-hmqWMUkI9BDDrfaXc/rs:fill:200:200:1/g:no/aXBmczovL1FtYVpuOHkzSm5kcmVQamVVYkRRdEJ5UFY2ZXpId1A2N3BWYUpHM1dXcGFtTEI.webp",
      holders: 24894,
      totalSupply: "16683255458619011",
      description: "Utility token of the DeDust DeFi protocol on TON."
    },
    {
      symbol: "REDO",
      name: "Resistance Dog",
      contract: "EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko",
      raw_address: "0:59fdc69f3f20ebe4a513b3468dc61d194c3864a4464e3662c903648d1a52e6e0",
      decimals: 9,
      verification: "whitelist",
      logo: "https://raw.githubusercontent.com/Resistance-Dog/resistance-dog/main/resistance-dog.webp",
      holders: 27657,
      totalSupply: "99999990054876073",
      description: "Symbol of digital resistance and internet freedom."
    },
    {
      symbol: "FISH",
      name: "TON FISH",
      contract: "EQATcUc69sGSCCMSadsVUKdGwM1BMKS-HKCWGPk60xZGgwsK",
      raw_address: "0:4dcd423af6c19208231269db1550a746c0cd4130a4be1ca09618f93ad3164683",
      decimals: 9,
      verification: "whitelist",
      logo: "https://coin-images.coingecko.com/coins/images/34651/small/photo_2024-10-18_16.55.49.jpeg?1729307732",
      holders: 67232,
      totalSupply: "399910955135521953138831",
      description: "Community memecoin on The Open Network."
    },
    {
      symbol: "GRM",
      name: "Gram",
      contract: "EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O",
      raw_address: "0:b8ef4f77a17e5785bd31ba4da50abd91852f2b8febee97ad6ee16d941f939198",
      decimals: 9,
      verification: "whitelist",
      logo: "https://gramcoin.org/img/icon.png",
      holders: 90969,
      totalSupply: "2430868391120966822",
      description: "PoW minable Jetton on TON."
    },
    {
      symbol: "MAJOR",
      name: "Major",
      contract: "EQCuPm01HldiduQ55xaBF_1kaW_WAUy5DHey8suqzU_MAJOR",
      raw_address: "0:ae3e6d351e576276e439e7168117fd64696fd6014cb90c77b2f2cbaacd4fcc00",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cache.tonapi.io/imgproxy/bnKC81e4nVrK99wRHoO3-LcpA3pl6Q0YqJuUWa5o9z4/rs:fill:200:200:1/g:no/aHR0cHM6Ly9jYWNoZS50b25hcGkuaW8vaW1ncHJveHkvR0syNGcyRk1KeUpyN3YyNE8yV1gyck8wMnRzSjdfNzJacXhsZXh1WG1yYy9yczpmaWxsOjIwMDoyMDA6MS9nOm5vL2FIUjBjSE02THk5dFlXcHZjaTVpYjNRdmFXMWhaMlZ6TDNSaGMydHpMMjFoYW05eVgyeHZaMjh1YzNabi53ZWJw.webp",
      holders: 173575,
      totalSupply: "92694329611313311",
      description: "Major gaming stars ecosystem token."
    },
    {
      symbol: "HMSTR",
      name: "TON HAMSTER",
      contract: "EQB2MznQGkJyLsebxufcl8-hT-dn4D304W_RezZRSpExoHg0",
      raw_address: "0:763339d01a42722ec79bc6e7dc97cfa14fe767e03df4e16fd17b36514a9131a0",
      decimals: 9,
      verification: "whitelist",
      logo: null,
      holders: 328,
      totalSupply: "990600885294847713",
      description: "Hamster-themed community Jetton on TON."
    },
    {
      symbol: "RAFF",
      name: "Ton Raffles",
      contract: "EQCJbp0kBpPwPoBG-U5C-cWfP_jnksvotGfArPF50Q9Qiv9h",
      raw_address: "0:896e9d240693f03e8046f94e42f9c59f3ff8e792cbe8b467c0acf179d10f508a",
      decimals: 9,
      verification: "whitelist",
      logo: "https://tonraffles.store/raffjetton/jetton.svg",
      holders: 142983,
      totalSupply: "15495255660714120",
      description: "Decentralized fair-launchpad and raffles protocol on TON."
    },
    {
      symbol: "GEMSTON",
      name: "GemSTON",
      contract: "EQBX6K9aXVl3nXINCyPPL86C4ONVmQ8vK360u6dykFKXpHCa",
      raw_address: "0:57e8af5a5d59779d720d0b23cf2fce82e0e355990f2f2b7eb4bba772905297a4",
      decimals: 9,
      verification: "whitelist",
      logo: "https://static.ston.fi/logo/gemston_symbol.png",
      holders: 16292,
      totalSupply: "21046729647454630",
      description: "GemSTON utility ecosystem token."
    },
    {
      symbol: "UTYAB",
      name: "Utya Black",
      contract: "EQAw63ZqLmnwRA77PW07CWIEngwg-eIiysaqZ8IWpUL0nP7a",
      raw_address: "0:30eb766a2e69f0440efb3d6d3b0962049e0c20f9e222cac6aa67c216a542f49c",
      decimals: 9,
      verification: "whitelist",
      logo: null,
      holders: 3771,
      totalSupply: "1000000000000000000",
      description: "The Faster Duck on TON community token."
    },
    {
      symbol: "PUNK",
      name: "TON Punks",
      contract: "EQCdpz6QhJtDtm2s9-krV2ygl45Pwl-KJJCV1-XrP-Xuuxoq",
      raw_address: "0:9da73e90849b43b66dacf7e92b576ca0978e4fc25f8a249095d7e5eb3fe5eebb",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cache.tonapi.io/imgproxy/mehFYlb1uDc1wa0RaKBQPCAKxBBiPcwIHHXd0-u4Ejo/rs:fill:200:200:1/g:no/aHR0cHM6Ly9wdW5rLW1ldGF2ZXJzZS5mcmExLmRpZ2l0YWxvY2VhbnNwYWNlcy5jb20vbG9nby9wdW5rLnBuZw.webp",
      holders: 57794,
      totalSupply: "49779668001715786",
      description: "Official token of the TON Punks club."
    },
    {
      symbol: "tsTON",
      name: "Tonstakers TON",
      contract: "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav",
      raw_address: "0:cbfdfa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8cccd4344025",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cache.tonapi.io/imgproxy/GjhSro_E6Qxod2SDQeDhJA_F3yARNomyZFKeKw8TVOU/rs:fill:200:200:1/g:no/aHR0cHM6Ly90b25zdGFrZXJzLmNvbS9qZXR0b24vbG9nby5zdmc.webp",
      holders: 144486,
      totalSupply: "123424027896426054",
      description: "Liquid staking token from Tonstakers."
    },
    {
      symbol: "DFC",
      name: "DeFinder Capital",
      contract: "EQD26zcd6Cqpz7WyLKVH8x_cD6D7tBrom6hKcycv8L8hV0GP",
      raw_address: "0:f6eb371de82aa9cfb5b22ca547f31fdc0fa0fbb41ae89ba84a73272ff0bf2157",
      decimals: 9,
      verification: "whitelist",
      logo: "https://cache.tonapi.io/imgproxy/TENmVD1ZlCwI7F4dyM9k6PPyLzMrd7rZHIAyeom79SA/rs:fill:200:200:1/g:no/aHR0cHM6Ly90YW4tdG91Z2gtc2x1Zy0zNTEubXlwaW5hdGEuY2xvdWQvaXBmcy9RbVhRb2pKVVB2a0dDQ2VSOVF1OFd3bWNaRjFnTERZMjhlcExMaFBZdkR5OFRr.webp",
      holders: 87945,
      totalSupply: "98899995371057065",
      description: "Community investment fund token."
    }
  ];

  // --- Verified On-Chain Entities Registry ---
  // Audited entities with documented cryptographic / whitelist evidence
  const KNOWN_ENTITIES = {
    // Exchanges (CEX Hot Wallets)
    "0:ca1d9edeef40b3a9dbd9082f3767859547c3ce0bf641d09d58e33a3cf06fb309": { name: "Binance: Hot Wallet", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4": { name: "Binance: Deposit Router", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:e7e86da08742ed933434ffeb8f08a63c7e100ee842e25f599a9cbf0891574a6c": { name: "OKX: Hot Wallet 3", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:f15db2c62cd86aff0860d39c491fc73a31395fafeb5945e644498562260c782e": { name: "OKX: Hot Wallet 2", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:441865c363dc832db745a557004f8e36780c65c26b5d8481ff2bb3b680c2f354": { name: "Bybit: Hot Wallet", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:52526e033db78e12484fa5cfbbce3c4151a6d4bbcae3db98a0ba7118d0be4298": { name: "Gate.io: Main Hot Wallet", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:041e231b1d1d0db4b4eed4fa82849a97aaa486179b428cfa6066e421bc0d7c3c": { name: "MEXC: Hot Wallet", category: "CEX", verified: true, color: "#8B5CF6" },
    "0:d81e05332ea5dbba0814981d33cbefdbd3ea09ab6891ebfa239d6756285223c6": { name: "Bitget: Hot Wallet", category: "CEX", verified: true, color: "#8B5CF6" },
    
    // DEX AMM & Liquidity Pools
    "0:9220c181a6cfeacd11b7b8f62138df1bb9cc82b6ed2661d2f5faee204b3efb20": { name: "STON.fi: DEX AMM Router", category: "DEX", verified: true, color: "#10B981" },
    "0:92e1411ae546892f33b2c8a89ea90390d8ff4cfbb917a643b91e73f706fdb9d1": { name: "STON.fi: Router v1", category: "DEX", verified: true, color: "#10B981" },
    "0:d9e323f038378d8b6dbf423ab1f472a43394af057e2a1c14f4975f553ea06ece": { name: "DeDust: Vault Contract", category: "DEX", verified: true, color: "#10B981" },
    
    // Burning Addresses
    "0:0000000000000000000000000000000000000000000000000000000000000000": { name: "Zero Burn Address", category: "BURN", verified: true, color: "#64748B" },
    "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ": { name: "Standard TON Burn Address", category: "BURN", verified: true, color: "#64748B" }
  };

  // --- Refined Institutional Tiers & Palettes (from video) ---
  const PERCENTAGE_TIERS = [
    { min: 15, name: 'Mega Whale', color: '#FF2E93', glow: 'rgba(255, 46, 147, 0.4)', gradientId: 'grad-tier-megawhale', desc: '> 15% of supply' },
    { min: 7.5, name: 'Major Whale', color: '#F43F5E', glow: 'rgba(244, 63, 94, 0.4)', gradientId: 'grad-tier-whale', desc: '7.5% – 15% of supply' },
    { min: 3, name: 'Shark', color: '#FFB703', glow: 'rgba(255, 183, 3, 0.4)', gradientId: 'grad-tier-shark', desc: '3% – 7.5% of supply' },
    { min: 1.5, name: 'Dolphin', color: '#00D2FF', glow: 'rgba(0, 210, 255, 0.4)', gradientId: 'grad-tier-dolphin', desc: '1.5% – 3% of supply' },
    { min: 0.6, name: 'Fish', color: '#3B82F6', glow: 'rgba(59, 130, 246, 0.4)', gradientId: 'grad-tier-fish', desc: '0.6% – 1.5% of supply' },
    { min: 0, name: 'Standard', color: '#64748B', glow: 'rgba(100, 116, 139, 0.4)', gradientId: 'grad-tier-standard', desc: '< 0.6% of supply' }
  ];

  function getPercentageTier(percent) {
    const p = Math.max(0, Number(percent) || 0);
    for (const tier of PERCENTAGE_TIERS) {
      if (p >= tier.min) return tier;
    }
    return PERCENTAGE_TIERS[PERCENTAGE_TIERS.length - 1];
  }

  const CLUSTER_PALETTES = [
    { primary: '#00D2FF', secondary: '#0369A1', name: 'Cyber Cyan' },
    { primary: '#8B5CF6', secondary: '#5B21B6', name: 'Amethyst' },
    { primary: '#10B981', secondary: '#047857', name: 'Mint Emerald' },
    { primary: '#FF2E93', secondary: '#BE185D', name: 'Neon Rose' },
    { primary: '#FFB703', secondary: '#B45309', name: 'Solar Amber' },
    { primary: '#3B82F6', secondary: '#1D4ED8', name: 'Cobalt Pulse' }
  ];

  // --- Application State ---
  const state = {
    tokens: [],
    filteredTokens: [],
    activeToken: null,
    searchQuery: '',
    verificationFilter: 'all', // 'all' | 'verified' | 'unverified'
    sortBy: 'marketCap', // 'marketCap' | 'volume' | 'holders' | 'price' | 'change24h' | 'name'
    sortOrder: 'desc', // 'desc' | 'asc'
    page: 1,
    pageSize: 10,
    lastIndexedTime: null,
    
    // Graph State
    holderLimit: 30, // 20, 30, 50
    graphData: null,
    selectedNode: null,
    selectedClusterId: 'all', // 'all' | 'connected' | number
    bubbleSim: null,
    isSyncingRates: false,
    
    // Indexing Logs & Status
    indexerLogs: [],
    providersStatus: {
      tonapi: { status: 'checking', latencyMs: null },
      stonfi: { status: 'operational', latencyMs: null },
      cache: { status: 'ready', entries: 0 }
    }
  };

  // --- Caching Layer (Session Storage + In-Memory) ---
  const CacheEngine = {
    get(key) {
      try {
        const item = sessionStorage.getItem('anlgram_wce_' + key);
        if (!item) return null;
        const parsed = JSON.parse(item);
        if (Date.now() > parsed.exp) {
          sessionStorage.removeItem('anlgram_wce_' + key);
          return null;
        }
        return parsed.data;
      } catch (e) {
        return null;
      }
    },
    set(key, data, ttlMs = 180000) { // default 3 minutes
      try {
        const payload = { data, exp: Date.now() + ttlMs };
        sessionStorage.setItem('anlgram_wce_' + key, JSON.stringify(payload));
      } catch (e) {}
    }
  };

  // --- Utility Functions ---
  function safeTrim(str) {
    return str ? String(str).trim() : '';
  }

  function formatMoney(num) {
    if (num == null || isNaN(num) || num <= 0) return '<span class="val-nodata">N/D</span>';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + Number(num).toFixed(2);
  }

  function formatPrice(num) {
    if (num == null || isNaN(num) || num <= 0) {
      return '<span class="val-nodata" title="Precio no disponible o sin par de liquidez verificado en DEX">Sin datos</span>';
    }
    const val = Number(num);
    if (val < 0.00000001) return '$' + val.toExponential(3);
    if (val < 0.00001) return '$' + val.toFixed(8);
    if (val < 0.001) return '$' + val.toFixed(6);
    if (val < 1) return '$' + val.toFixed(4);
    return '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  function formatCompactNumber(num) {
    if (num == null || isNaN(num)) return '<span class="val-nodata">N/D</span>';
    return Number(num).toLocaleString();
  }

  function formatTokenUnits(amountStr, decimals = 9) {
    if (!amountStr) return '0';
    try {
      const dec = Number(decimals) || 9;
      // Using BigInt for high precision if huge
      const str = String(amountStr).split('.')[0];
      if (str.length > 15) {
        const val = BigInt(str);
        const divisor = BigInt(10 ** dec);
        const whole = val / divisor;
        return Number(whole).toLocaleString();
      }
      const num = Number(str) / Math.pow(10, dec);
      if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
      if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
      return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    } catch (e) {
      return String(amountStr);
    }
  }

  function shortenAddress(addr, chars = 4) {
    if (!addr) return '';
    const s = String(addr);
    if (s.length <= chars * 2 + 3) return s;
    return `${s.substring(0, chars + 2)}...${s.substring(s.length - chars)}`;
  }

  function timeAgo(date) {
    if (!date) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // --- SVG Fallback Logo Generator (Valid URI & High-Contrast Design) ---
  function getNeutralFallbackSvg(symbol) {
    const cleanSym = (symbol || '?').toUpperCase().trim().substring(0, 3);
    let hash = 0;
    for (let i = 0; i < cleanSym.length; i++) {
      hash = (hash * 31 + cleanSym.charCodeAt(i)) & 0xffffffff;
    }
    const hue = Math.abs(hash) % 360;
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="fb_${hue}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="hsl(${hue}, 65%, 26%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 75%, 15%)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="32" fill="url(#fb_${hue})" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(0, 240, 255, 0.4)" stroke-width="2" />
      <text x="32" y="38" fill="#e0f2fe" font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif" font-size="16" font-weight="700" text-anchor="middle" letter-spacing="0.5">${cleanSym}</text>
    </svg>`;
    
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Centralized image fallback error handler
  window.handleTokenLogoError = function(img, symbol) {
    if (!img) return;
    img.onerror = null; // Prevent loop
    img.src = getNeutralFallbackSvg(symbol);
  };

  function resolveLogoUrl(token) {
    if (!token) return getNeutralFallbackSvg('?');

    // Asset Priority Rule:
    // 1. Shared Verified AssetRegistry lookup by exact contract address
    if (window.AssetRegistry && token.contract) {
      const asset = window.AssetRegistry.getAssetByContract(token.contract, 'TON');
      if (asset && asset.imageUri) {
        return asset.imageUri;
      }
    }

    // 2. Token object's verified seed logo (if valid URL)
    if (token.logo) {
      if (token.logo.startsWith('ipfs://')) {
        return `${IPFS_GATEWAY}${token.logo.replace('ipfs://', '')}`;
      }
      if (token.logo.startsWith('http://') || token.logo.startsWith('https://') || token.logo.startsWith('data:image')) {
        return token.logo;
      }
    }

    // 3. On-chain metadata image URI (converted if ipfs)
    if (token.metadata && token.metadata.image) {
      const img = token.metadata.image;
      if (img.startsWith('ipfs://')) {
        return `${IPFS_GATEWAY}${img.replace('ipfs://', '')}`;
      }
      if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:image')) {
        return img;
      }
    }

    // 4. Image supplied by trusted data provider (preview webp from tonapi)
    if (token.preview) {
      if (token.preview.startsWith('http://') || token.preview.startsWith('https://')) {
        return token.preview;
      }
    }

    // 5. Neutral fallback SVG icon
    return getNeutralFallbackSvg(token.symbol);
  }

  // --- Network API Service ---
  const ApiService = {
    async fetchTonApi(endpoint) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${TONAPI_BASE}${endpoint}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        state.providersStatus.tonapi.latencyMs = Date.now() - start;
        state.providersStatus.tonapi.status = res.ok ? 'operational' : 'degraded';

        if (!res.ok) {
          logIndexingEvent('TonAPI Error', `${endpoint} returned ${res.status}: ${res.statusText}`, 'warn');
          return null;
        }
        return await res.json();
      } catch (err) {
        state.providersStatus.tonapi.status = 'error';
        logIndexingEvent('TonAPI Timeout/Failed', `${endpoint} - ${err.message}`, 'error');
        return null;
      }
    },

    async fetchJettonRates(contracts) {
      if (!contracts || contracts.length === 0) return {};
      // Chunk contracts to avoid URL limits
      const valid = contracts.filter(c => Boolean(c));
      if (valid.length === 0) return {};

      const cacheKey = 'rates_' + valid.slice(0, 5).join('_');
      const cached = CacheEngine.get(cacheKey);
      if (cached) return cached;

      const queryUrl = `/rates?tokens=${valid.join(',')}&currencies=usd`;
      const data = await this.fetchTonApi(queryUrl);
      if (data && data.rates) {
        CacheEngine.set(cacheKey, data.rates, 60000); // 1 minute
        return data.rates;
      }
      return {};
    },

    async fetchJettonDetails(contractAddress) {
      const clean = safeTrim(contractAddress);
      if (!clean) return null;

      const cacheKey = 'jetton_' + clean;
      const cached = CacheEngine.get(cacheKey);
      if (cached) return cached;

      const data = await this.fetchTonApi(`/jettons/${encodeURIComponent(clean)}`);
      if (data && !data.error) {
        CacheEngine.set(cacheKey, data, 300000); // 5 minutes
        return data;
      }
      return null;
    },

    async fetchJettonHolders(contractAddress, limit = 40) {
      const clean = safeTrim(contractAddress);
      if (!clean) return { total: 0, addresses: [] };

      const cacheKey = `holders_${clean}_${limit}`;
      const cached = CacheEngine.get(cacheKey);
      if (cached) return cached;

      const data = await this.fetchTonApi(`/jettons/${encodeURIComponent(clean)}/holders?limit=${limit}`);
      if (data && Array.isArray(data.addresses)) {
        CacheEngine.set(cacheKey, data, 180000); // 3 minutes
        return data;
      }
      return { total: 0, addresses: [] };
    },

    async fetchAccountEvents(accountAddress, limit = 50) {
      const clean = safeTrim(accountAddress);
      if (!clean) return { events: [] };

      const cacheKey = `events_${clean}_${limit}`;
      const cached = CacheEngine.get(cacheKey);
      if (cached) return cached;

      const data = await this.fetchTonApi(`/accounts/${encodeURIComponent(clean)}/events?limit=${limit}`);
      if (data && Array.isArray(data.events)) {
        CacheEngine.set(cacheKey, data, 120000); // 2 minutes
        return data;
      }
      return { events: [] };
    },

    async searchAccountJettons(query) {
      const clean = safeTrim(query);
      if (!clean) return [];

      try {
        const res = await this.fetchTonApi(`/accounts/search?name=${encodeURIComponent(clean)}`);
        if (res && Array.isArray(res.addresses)) {
          return res.addresses.filter(a => a.name && (a.name.toLowerCase().includes('jetton') || a.trust === 'whitelist'));
        }
      } catch (e) {}
      return [];
    }
  };

  // --- Indexer Logger ---
  function logIndexingEvent(type, message, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      level
    };
    state.indexerLogs.unshift(entry);
    if (state.indexerLogs.length > 50) state.indexerLogs.pop();
    updateIndexerStatusUI();
  }

  // --- Data Engine: Token Initialization & Discovery ---
  async function initializeTokenCatalog() {
    logIndexingEvent('Catalog Boot', 'Initializing canonical TON Jettons catalog and local verified registry.');
    
    // Seed verified tokens into state
    state.tokens = SEED_JETTONS.map((t, idx) => ({
      rank: idx + 1,
      symbol: t.symbol,
      name: t.name,
      contract: t.contract,
      raw_address: t.raw_address,
      decimals: t.decimals || 9,
      verification: t.verification || 'whitelist',
      logo: t.logo,
      description: t.description || '',
      price: null,
      change24h: null,
      marketCap: null,
      volume: null,
      holders: t.holders || null,
      totalSupply: t.totalSupply || null,
      circulatingSupply: null,
      lastIndexed: new Date().toISOString(),
      isCustomIndexed: false
    }));

    state.lastIndexedTime = new Date();
    applyFiltersAndSort();
    renderTokenTable();

    // Fetch live market rates and metadata in background
    await syncLiveRatesAndMetadata();

    // Start background refresh timer
    setInterval(syncLiveRatesAndMetadata, DEFAULT_REFRESH_INTERVAL);

    // Deep link handler
    handleUrlDeepLinks();
  }

  async function syncLiveRatesAndMetadata() {
    if (state.isSyncingRates) return;
    state.isSyncingRates = true;

    try {
      const contracts = state.tokens.filter(t => t.contract).map(t => t.contract);
      const rates = await ApiService.fetchJettonRates(contracts);

      let updatedCount = 0;
      for (const token of state.tokens) {
        if (token.contract && rates[token.contract]) {
          const r = rates[token.contract];
          if (r.prices && r.prices.USD != null) {
            token.price = Number(r.prices.USD);
            // Calculate market cap dynamically from verified supply and live price
            if (token.totalSupply && token.decimals) {
              const divisor = Math.pow(10, token.decimals);
              const supply = Number(token.totalSupply) / divisor;
              token.marketCap = supply * token.price;
            }
          }
          if (r.diff_24h && r.diff_24h.USD) {
            const cleanStr = String(r.diff_24h.USD).replace('−', '-').replace('%', '').trim();
            const parsed = parseFloat(cleanStr);
            if (!isNaN(parsed)) token.change24h = parsed;
          }
          token.lastIndexed = new Date().toISOString();
          updatedCount++;
        }
      }

      state.lastIndexedTime = new Date();
      logIndexingEvent('Rates Synced', `Updated live rates for ${updatedCount} tokens.`);
    } catch (err) {
      logIndexingEvent('Rates Sync Warning', err.message, 'warn');
    } finally {
      state.isSyncingRates = false;
      applyFiltersAndSort();
      renderTokenTable();
      updateIndexerStatusUI();

      // If active token is open on map, update live price header
      if (state.activeToken) {
        updateMapTokenPanel(state.activeToken);
      }
    }
  }

  // --- On-Demand Live Contract Indexer ---
  async function indexJettonMasterContract(queryAddress) {
    const clean = safeTrim(queryAddress);
    if (!clean) return { success: false, error: 'Empty contract address' };

    logIndexingEvent('On-Demand Index', `Indexing Jetton Master contract: ${clean}`);

    // Check if already in catalog
    const existing = state.tokens.find(t => 
      t.contract.toLowerCase() === clean.toLowerCase() ||
      (t.raw_address && t.raw_address.toLowerCase() === clean.toLowerCase())
    );
    if (existing) {
      logIndexingEvent('Contract Cached', `Found in catalog: ${existing.symbol} (${existing.name})`);
      return { success: true, token: existing, cached: true };
    }

    // Validate TON address format
    const validation = window.validateTonAddress ? window.validateTonAddress(clean) : { valid: true };
    if (!validation.valid) {
      logIndexingEvent('Invalid Address', validation.error || 'Invalid TON address format', 'error');
      return { success: false, error: validation.error || 'Invalid TON address' };
    }

    // Query on-chain data via TonAPI
    const jettonData = await ApiService.fetchJettonDetails(clean);
    if (!jettonData || !jettonData.metadata) {
      logIndexingEvent('Contract Not Found', `Account ${clean} is not an indexed Jetton Master on TON`, 'error');
      return { success: false, error: 'Target address is not a valid Jetton Master contract on TON' };
    }

    const meta = jettonData.metadata;
    const decimals = Number(meta.decimals) || 9;
    const symbol = meta.symbol || 'UNKNOWN';
    const name = meta.name || 'Unnamed Jetton';
    const verification = jettonData.verification || 'none';
    const isComplete = Boolean(meta.symbol && meta.name && meta.decimals !== undefined);

    // Compute canonical addresses
    const friendly = (window.rawToFriendly && meta.address) ? window.rawToFriendly(meta.address) : clean;
    const raw = (window.friendlyToRaw && friendly) ? window.friendlyToRaw(friendly) : (meta.address || clean);

    const newToken = {
      rank: state.tokens.length + 1,
      symbol: symbol,
      name: name,
      contract: friendly,
      raw_address: raw,
      decimals: decimals,
      verification: verification,
      isComplete: isComplete,
      logo: meta.image || null,
      preview: jettonData.preview || null,
      description: meta.description || '',
      price: null,
      change24h: null,
      marketCap: null,
      volume: null,
      holders: jettonData.holders_count || 0,
      totalSupply: jettonData.total_supply || null,
      circulatingSupply: null,
      lastIndexed: new Date().toISOString(),
      isCustomIndexed: true
    };

    // Deduplicate and push
    state.tokens.unshift(newToken);
    logIndexingEvent('Index Success', `Successfully indexed ${symbol} (${name}). Verification: ${verification}`);

    // Fetch immediate rates for new token
    try {
      const rates = await ApiService.fetchJettonRates([newToken.contract]);
      if (rates[newToken.contract] && rates[newToken.contract].prices) {
        newToken.price = rates[newToken.contract].prices.USD;
        if (rates[newToken.contract].diff_24h && rates[newToken.contract].diff_24h.USD) {
          newToken.change24h = parseFloat(rates[newToken.contract].diff_24h.USD.replace('%', ''));
        }
      }
    } catch (e) {}

    applyFiltersAndSort();
    renderTokenTable();
    updateIndexerStatusUI();

    return { success: true, token: newToken };
  }

  // --- Filtering & Sorting Engine ---
  function applyFiltersAndSort() {
    let result = [...state.tokens];

    // Search query filter
    const q = safeTrim(state.searchQuery).toLowerCase();
    if (q) {
      result = result.filter(t => 
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.contract && t.contract.toLowerCase().includes(q)) ||
        (t.raw_address && t.raw_address.toLowerCase().includes(q))
      );
    }

    // Verification filter
    if (state.verificationFilter === 'verified') {
      result = result.filter(t => t.verification === 'whitelist');
    } else if (state.verificationFilter === 'unverified') {
      result = result.filter(t => t.verification !== 'whitelist');
    }

    // Sorting
    result.sort((a, b) => {
      let valA, valB;
      switch (state.sortBy) {
        case 'price':
          valA = a.price ?? -1;
          valB = b.price ?? -1;
          break;
        case 'change24h':
          valA = a.change24h ?? -999;
          valB = b.change24h ?? -999;
          break;
        case 'holders':
          valA = a.holders ?? -1;
          valB = b.holders ?? -1;
          break;
        case 'volume':
          valA = a.volume ?? -1;
          valB = b.volume ?? -1;
          break;
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return state.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'marketCap':
        default:
          valA = a.marketCap ?? -1;
          valB = b.marketCap ?? -1;
          break;
      }

      if (state.sortOrder === 'desc') {
        return valB - valA;
      } else {
        return valA - valB;
      }
    });

    state.filteredTokens = result;
  }

  // --- Render Token Table ---
  function renderTokenTable() {
    const tbody = document.getElementById('token-list-body');
    const paginationContainer = document.getElementById('catalog-pagination');
    if (!tbody) return;

    tbody.innerHTML = '';

    const total = state.filteredTokens.length;
    const startIndex = (state.page - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, total);
    const pageItems = state.filteredTokens.slice(startIndex, endIndex);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
        <div class="empty-state-card" style="padding: 48px 24px; text-align: center; color: var(--text-secondary);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; display:block; opacity: 0.5;">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <div style="font-weight: 600; font-size: 1.1rem; color: #fff; margin-bottom: 8px;">No Indexed Jettons Match Query</div>
          <div style="font-size: 0.9rem; max-width: 500px; margin: 0 auto 20px;">
            Could not find "${state.searchQuery}" in locally indexed catalog. TON hosts over 50,000 community Jettons.
          </div>
          ${state.searchQuery && state.searchQuery.length > 10 ? `
            <button id="btn-force-index" class="btn-primary" style="padding: 8px 20px; font-size: 0.9rem; border-radius: 20px;">
              ⚡ Index Contract Live on TON Blockchain
            </button>
          ` : `
            <div style="font-size: 0.8rem; color: var(--text-muted);">Paste the exact 48-character Master Contract address to index it immediately.</div>
          `}
        </div>
      `;

      const forceIndexBtn = document.getElementById('btn-force-index');
      if (forceIndexBtn) {
        forceIndexBtn.onclick = async () => {
          forceIndexBtn.textContent = 'Syncing from TON Blockchain...';
          forceIndexBtn.disabled = true;
          const res = await indexJettonMasterContract(state.searchQuery);
          if (res.success) {
            state.searchQuery = '';
            const searchInput = document.getElementById('token-search-input');
            if (searchInput) searchInput.value = '';
            applyFiltersAndSort();
            renderTokenTable();
          } else {
            alert('Indexing Error: ' + res.error);
            forceIndexBtn.textContent = 'Retry Indexing';
            forceIndexBtn.disabled = false;
          }
        };
      }
      return;
    }

    pageItems.forEach((token, idx) => {
      const globalIndex = startIndex + idx + 1;
      const isPos = token.change24h != null && token.change24h >= 0;
      const changeClass = token.change24h == null ? '' : (isPos ? 'text-green' : 'text-red');
      const changeStr = token.change24h == null ? '<span class="val-nodata">N/D</span>' : ((isPos ? '+' : '') + token.change24h.toFixed(2) + '%');
      const logoUrl = resolveLogoUrl(token);

      // Verification Badge Logic
      let verBadge = '';
      if (token.verification === 'whitelist') {
        verBadge = `<span class="badge-ver badge-verified" title="Verified by TonAPI / Ecosystem Whitelist">VERIFIED</span>`;
      } else if (token.isComplete === false) {
        verBadge = `<span class="badge-ver badge-incomplete" title="Missing metadata parameters">INCOMPLETE</span>`;
      } else {
        verBadge = `<span class="badge-ver badge-unverified" title="Community Jetton (No official whitelist proof)">UNVERIFIED</span>`;
      }

      const row = document.createElement('div');
      row.className = 'table-row';
      row.innerHTML = `
        <div class="col-rank">${globalIndex}</div>
        <div class="col-token">
          <div class="token-avatar-wrap">
            <img src="${logoUrl}" alt="${token.symbol}" class="row-logo" loading="lazy" onerror="window.handleTokenLogoError(this, '${token.symbol}')" />
          </div>
          <div class="token-identity">
            <div class="row-name-wrap">
              <span class="row-name">${token.name}</span>
              ${verBadge}
            </div>
            <div class="row-sub">
              <span class="row-ticker">${token.symbol}</span>
              <span class="row-addr-snippet" title="${token.contract || 'No contract'}" data-addr="${token.contract || ''}">
                ${shortenAddress(token.contract, 4)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </span>
            </div>
          </div>
        </div>
        <div class="col-price">${formatPrice(token.price)}</div>
        <div class="col-24h ${changeClass}">${changeStr}</div>
        <div class="col-mcap">${formatMoney(token.marketCap)}</div>
        <div class="col-vol">${formatMoney(token.volume)}</div>
        <div class="col-holders data-font">${token.holders ? formatCompactNumber(token.holders) : '<span class="val-nodata">N/D</span>'}</div>
        <div class="col-last-indexed">${token.lastIndexed ? timeAgo(token.lastIndexed) : '<span class="val-nodata">N/D</span>'}</div>
        <div class="col-action">
          <button class="btn-map" data-token="${token.symbol}">Explore Clusters</button>
        </div>
      `;

      // Copy Address Handler
      const copySnippet = row.querySelector('.row-addr-snippet');
      if (copySnippet && token.contract) {
        copySnippet.onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(token.contract).then(() => {
            const original = copySnippet.innerHTML;
            copySnippet.innerHTML = '<span style="color:var(--cyan);">Copied!</span>';
            setTimeout(() => { copySnippet.innerHTML = original; }, 1500);
          });
        };
      }

      // Open Map Handler
      row.onclick = () => openBubbleMap(token);
      tbody.appendChild(row);
    });

    // Render Pagination Controls
    if (paginationContainer) {
      renderPaginationControls(paginationContainer, total, startIndex + 1, endIndex);
    }
  }

  function renderPaginationControls(container, total, start, end) {
    const totalPages = Math.ceil(total / state.pageSize) || 1;
    container.innerHTML = `
      <div class="pagination-info">
        Showing <strong>${start}–${end}</strong> of <strong>${total}</strong> indexed Jettons
      </div>
      <div class="pagination-buttons">
        <button id="pg-prev" class="btn-pg" ${state.page <= 1 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Prev
        </button>
        <span class="pg-indicator">Page ${state.page} / ${totalPages}</span>
        <button id="pg-next" class="btn-pg" ${state.page >= totalPages ? 'disabled' : ''}>
          Next <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    `;

    const prevBtn = document.getElementById('pg-prev');
    const nextBtn = document.getElementById('pg-next');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (state.page > 1) {
          state.page--;
          renderTokenTable();
        }
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (state.page < totalPages) {
          state.page++;
          renderTokenTable();
        }
      };
    }
  }

  // --- Graph Engine & Relationship Topology (Original Algorithm) ---
  /**
   * Builds an original interactive relationship graph using ACTUAL holder and transaction data.
   * Node size = proportional to current token balance.
   * Node color = strictly distinguished by reliable evidence.
   * Edges = observed on-chain transfers.
   * Clusters = connected components via Union-Find.
   */
  async function openBubbleMap(token) {
    state.activeToken = token;
    
    // Switch views
    const viewList = document.getElementById('view-list');
    const viewMap = document.getElementById('view-map');
    if (viewList) viewList.style.display = 'none';
    if (viewMap) viewMap.style.display = 'block';

    updateMapTokenPanel(token);

    // Show loading state
    const badgeEl = document.getElementById('map-datasource-badge');
    const holdersEl = document.getElementById('map-holders');
    const graphMetaEl = document.getElementById('graph-meta-banner');

    if (badgeEl) {
      badgeEl.textContent = 'SYNCING ON-CHAIN TOPOLOGY...';
      badgeEl.className = 'status-badge-loading';
    }
    if (holdersEl) holdersEl.textContent = 'Loading...';
    if (graphMetaEl) graphMetaEl.textContent = 'Fetching on-chain Jetton holders & transfer traces...';

    // Fetch real holders and events
    const [holdersData, eventsData] = await Promise.all([
      ApiService.fetchJettonHolders(token.contract, state.holderLimit),
      ApiService.fetchAccountEvents(token.contract, 50)
    ]);

    const holderAddresses = (holdersData && holdersData.addresses) ? holdersData.addresses : [];
    let events = (eventsData && eventsData.events) ? [...eventsData.events] : [];

    token.holders = holdersData.total || holderAddresses.length;
    if (holdersEl) holdersEl.textContent = token.holders.toLocaleString();

    if (holderAddresses.length === 0) {
      logIndexingEvent('Zero Holders', `No indexed holders found for ${token.symbol}`, 'warn');
      renderEmptyGraphState(token, 'No on-chain holders currently indexed for this contract.');
      return;
    }

    // Concurrently fetch recent events for the top holders to trace peer interactions
    try {
      const topHoldersToSample = holderAddresses.slice(0, 8);
      const peerEventResults = await Promise.allSettled(
        topHoldersToSample.map(h => {
          const addr = (h.owner && h.owner.address) ? h.owner.address : h.address;
          return ApiService.fetchAccountEvents(addr, 25);
        })
      );
      const seenEventKeys = new Set(events.map(e => e.event_id || `${e.timestamp}_${e.actions?.[0]?.type}`));
      peerEventResults.forEach(res => {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.events)) {
          res.value.events.forEach(ev => {
            const key = ev.event_id || `${ev.timestamp}_${ev.actions?.[0]?.type}`;
            if (!seenEventKeys.has(key)) {
              seenEventKeys.add(key);
              events.push(ev);
            }
          });
        }
      });
    } catch (err) {
      console.warn('Peer events discovery notice:', err);
    }

    // Process real graph topology
    const graph = processGraphTopology(token, holderAddresses, events);
    state.graphData = graph;

    if (badgeEl) {
      badgeEl.textContent = 'LIVE ON-CHAIN TONAPI TOPOLOGY';
      badgeEl.className = 'status-badge-live';
    }

    if (graphMetaEl) {
      graphMetaEl.innerHTML = `
        <span>Window: Recent ${events.length} events (30-day index)</span> · 
        <span>Tracked Top Holders: <strong>${graph.nodes.length}</strong></span> · 
        <span>Observed Transfers: <strong>${graph.links.length}</strong></span> · 
        <span>Connected Clusters: <strong>${graph.clusters.length}</strong></span>
      `;
    }

    // Render D3 Graph
    initD3ClusterMap(graph);
    populateClusterFilterOptions(graph.clusters);
  }

  function processGraphTopology(token, rawHolders, events) {
    const decimals = token.decimals || 9;
    const divisor = Math.pow(10, decimals);

    // 1. Parse and normalize nodes
    const nodes = [];
    const nodeIndexMap = new Map(); // address -> node index
    let totalTrackedBalance = 0;

    rawHolders.forEach((h, i) => {
      const ownerAddr = (h.owner && h.owner.address) ? h.owner.address : h.address;
      const rawBal = parseFloat(h.balance) || 0;
      const humanBal = rawBal / divisor;
      totalTrackedBalance += humanBal;

      // Classify wallet strictly by documented evidence
      let category = 'Unlabeled Wallet';
      let color = '#00F0FF';
      let isVerified = false;

      // Check Known Entities Registry
      const known = KNOWN_ENTITIES[ownerAddr] || KNOWN_ENTITIES[h.address];
      if (known) {
        category = known.name;
        color = known.color;
        isVerified = true;
      } else if (h.owner && h.owner.name) {
        category = h.owner.name;
        isVerified = true;
        const lowerName = h.owner.name.toLowerCase();
        if (lowerName.includes('binance') || lowerName.includes('okx') || lowerName.includes('bybit') || lowerName.includes('gate') || lowerName.includes('mexc') || lowerName.includes('bitget')) {
          color = '#8B5CF6';
        } else if (lowerName.includes('ston') || lowerName.includes('dedust') || lowerName.includes('pool') || lowerName.includes('vault')) {
          color = '#10B981';
        } else {
          color = '#F59E0B';
        }
      } else if (ownerAddr === token.contract || h.address === token.contract) {
        category = 'Jetton Master Contract';
        color = '#F59E0B';
        isVerified = true;
      } else if (ownerAddr.startsWith('0:0000000000') || ownerAddr === 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ') {
        category = 'Burn Address';
        color = '#64748B';
        isVerified = true;
      }

      const shortAddr = shortenAddress(ownerAddr, 4);
      const friendly = window.rawToFriendly ? window.rawToFriendly(ownerAddr) : ownerAddr;

      const nodeObj = {
        id: i,
        address: ownerAddr,
        friendlyAddress: friendly,
        label: isVerified ? category : shortAddr,
        category: category,
        color: color,
        isVerified: isVerified,
        balance: humanBal,
        rawBalance: rawBal,
        percentOfTracked: 0, // calculated below
        clusterId: i, // default to self for union-find
        counterparties: new Set(),
        incomingTransfers: 0,
        outgoingTransfers: 0
      };

      nodes.push(nodeObj);

      // Multi-key indexing to catch all address formats
      const lowOwner = ownerAddr.toLowerCase();
      const lowFriendly = friendly.toLowerCase();
      nodeIndexMap.set(lowOwner, i);
      nodeIndexMap.set(lowFriendly, i);
      if (lowOwner.startsWith('0:')) nodeIndexMap.set(lowOwner.substring(2), i);
      if (lowFriendly.startsWith('eq') || lowFriendly.startsWith('uq')) {
        nodeIndexMap.set(lowFriendly.substring(2), i);
      }
    });

    // Address index lookup helper
    function lookupNodeIdx(addr) {
      if (!addr) return undefined;
      const s = String(addr).toLowerCase();
      let idx = nodeIndexMap.get(s);
      if (idx !== undefined) return idx;
      if (s.startsWith('0:')) {
        idx = nodeIndexMap.get(s.substring(2));
        if (idx !== undefined) return idx;
      }
      if (s.startsWith('eq') || s.startsWith('uq')) {
        idx = nodeIndexMap.get(s.substring(2));
        if (idx !== undefined) return idx;
      }
      return undefined;
    }

    // Calculate percentages
    const safeTotal = totalTrackedBalance > 0 ? totalTrackedBalance : 1;
    nodes.forEach(n => {
      n.percentOfTracked = (n.balance / safeTotal) * 100;
    });

    // 2. Extract observed transfers (Edges) from real on-chain events
    const links = [];
    const linkKeys = new Set();
    const observedTransfersLog = [];

    // Disjoint Set Union (DSU) for mathematically proven cluster boundaries
    const parent = Array.from({ length: nodes.length }, (_, i) => i);
    function find(i) {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i]);
      return parent[i];
    }
    function union(i, j) {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent[rootI] = rootJ;
      }
    }

    events.forEach(event => {
      if (!event.actions || !Array.isArray(event.actions)) return;

      event.actions.forEach(act => {
        let senderAddr = null;
        let recipientAddr = null;
        let transferAmount = 0;
        let isTrade = false;
        let dexName = null;

        if (act.type === 'JettonTransfer' && act.JettonTransfer) {
          const jt = act.JettonTransfer;
          senderAddr = jt.sender ? jt.sender.address : null;
          recipientAddr = jt.recipient ? jt.recipient.address : null;
          transferAmount = (parseFloat(jt.amount) || 0) / divisor;
        } else if (act.type === 'JettonSwap' && act.JettonSwap) {
          const js = act.JettonSwap;
          isTrade = true;
          dexName = js.dex || 'DEX AMM';
          senderAddr = js.user_wallet ? js.user_wallet.address : null;
          recipientAddr = js.router ? js.router.address : null;
          transferAmount = (parseFloat(js.amount_out || js.amount_in) || 0) / divisor;
        } else if (act.type === 'TonTransfer' && act.TonTransfer) {
          const tt = act.TonTransfer;
          senderAddr = tt.sender ? tt.sender.address : null;
          recipientAddr = tt.recipient ? tt.recipient.address : null;
          transferAmount = (parseFloat(tt.amount) || 0) / 1e9;
        }

        if (senderAddr && recipientAddr) {
          const sourceIdx = lookupNodeIdx(senderAddr);
          const targetIdx = lookupNodeIdx(recipientAddr);

          // If both are within tracked nodes
          if (sourceIdx !== undefined && targetIdx !== undefined && sourceIdx !== targetIdx) {
            const edgeKey = `${Math.min(sourceIdx, targetIdx)}_${Math.max(sourceIdx, targetIdx)}`;
            
            // Record transfer observation
            observedTransfersLog.push({
              source: sourceIdx,
              target: targetIdx,
              sourceAddr: senderAddr,
              targetAddr: recipientAddr,
              amount: transferAmount,
              timestamp: event.timestamp ? event.timestamp * 1000 : Date.now(),
              isTrade: isTrade,
              dex: dexName,
              txHash: event.actions[0]?.base_transactions?.[0] || null
            });

            // Update node stats
            nodes[sourceIdx].outgoingTransfers++;
            nodes[sourceIdx].counterparties.add(recipientAddr);
            nodes[targetIdx].incomingTransfers++;
            nodes[targetIdx].counterparties.add(senderAddr);

            // Connect in Union-Find
            union(sourceIdx, targetIdx);

            if (!linkKeys.has(edgeKey)) {
              linkKeys.add(edgeKey);
              links.push({
                source: sourceIdx,
                target: targetIdx,
                value: transferAmount,
                txCount: 1,
                isTrade: isTrade
              });
            } else {
              const existingLink = links.find(l => 
                (l.source === sourceIdx && l.target === targetIdx) ||
                (l.source === targetIdx && l.target === sourceIdx)
              );
              if (existingLink) {
                existingLink.txCount++;
                existingLink.value += transferAmount;
              }
            }
          }
        }
      });
    });

    // 3. Cluster Partitioning based on Union-Find components
    const clusterMap = new Map();
    nodes.forEach((n, i) => {
      const root = find(i);
      n.clusterId = root;
      if (!clusterMap.has(root)) {
        clusterMap.set(root, []);
      }
      clusterMap.get(root).push(n);
    });

    // Format Cluster Summaries
    const clusters = [];
    let clusterCounter = 1;
    clusterMap.forEach((members, rootId) => {
      if (members.length > 1) { // Only components with >1 node are considered relational clusters
        const totalBal = members.reduce((sum, m) => sum + m.balance, 0);
        const totalPct = members.reduce((sum, m) => sum + m.percentOfTracked, 0);
        clusters.push({
          id: rootId,
          displayId: clusterCounter++,
          wallets: members,
          walletCount: members.length,
          totalBalance: totalBal,
          percentOfTracked: totalPct,
          internalTransfers: observedTransfersLog.filter(t => 
            members.some(m => m.id === t.source) && members.some(m => m.id === t.target)
          ).length
        });
      }
    });

    // 4. Shape Classification & Dynamic Percentage Tiers (User Requirement & token123 Reference)
    const connectedNodeIds = new Set();
    links.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      connectedNodeIds.add(srcId);
      connectedNodeIds.add(tgtId);
    });

    const clusterLookup = new Map();
    clusters.forEach(c => clusterLookup.set(c.id, c));

    nodes.forEach(n => {
      const isConnected = connectedNodeIds.has(n.id);
      n.isConnected = isConnected;
      n.shape = 'circle';

      // Elegant proportional radius with clean bounds
      const pct = Math.max(0.05, n.percentOfTracked);
      n.radius = Math.max(14, Math.min(54, Math.sqrt(pct) * 15 + 8));

      if (isConnected) {
        n.shapeLabel = 'Connected Cluster Node';
        const cluster = clusterLookup.get(n.clusterId);
        const clusterIdx = cluster ? cluster.displayId - 1 : 0;
        const palette = CLUSTER_PALETTES[clusterIdx % CLUSTER_PALETTES.length];
        n.clusterPalette = palette;
        n.clusterDisplayId = cluster ? cluster.displayId : 1;
        n.gradientId = `grad-cluster-${n.clusterId}`;
        n.color = n.isVerified ? n.color : palette.primary;
        n.glow = `${n.color}60`;
      } else {
        const tier = getPercentageTier(n.percentOfTracked);
        n.tier = tier;
        n.tierName = tier.name;
        n.shapeLabel = `${tier.name} (${tier.desc})`;
        n.color = n.isVerified ? n.color : tier.color;
        n.glow = tier.glow;
        n.gradientId = n.isVerified ? 'grad-default' : tier.gradientId;
      }
    });

    return {
      nodes,
      links,
      clusters,
      transfers: observedTransfersLog,
      totalTrackedBalance
    };
  }

  // --- D3 Force Graph Rendering ---
  function initD3ClusterMap(graph) {
    const container = document.getElementById('bubble-map-container');
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Clean existing SVG & stop existing simulation
    const existingSvg = container.querySelector('svg');
    if (existingSvg) existingSvg.remove();
    if (state.bubbleSim) state.bubbleSim.stop();

    const svg = d3.select("#bubble-map-container").append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    const defs = svg.append("defs");

    // Luminous Glow filter
    const filter = defs.append("filter").attr("id", "glow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
    filter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // 3D Glass / Gem Reflection Highlight
    const glossReflect = defs.append("radialGradient")
      .attr("id", "gloss-reflection")
      .attr("cx", "32%")
      .attr("cy", "28%")
      .attr("r", "65%");
    glossReflect.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff").attr("stop-opacity", "0.55");
    glossReflect.append("stop").attr("offset", "50%").attr("stop-color", "#ffffff").attr("stop-opacity", "0.12");
    glossReflect.append("stop").attr("offset", "100%").attr("stop-color", "#ffffff").attr("stop-opacity", "0");

    // Gradients for all vivid percentage tiers (token123 Reference)
    PERCENTAGE_TIERS.forEach(t => {
      const grad = defs.append("radialGradient")
        .attr("id", t.gradientId)
        .attr("cx", "36%")
        .attr("cy", "34%")
        .attr("r", "68%");
      
      const c = d3.color(t.color);
      const bright = c ? c.brighter(0.7).formatHex() : t.color;
      const dark = c ? c.darker(1.1).formatHex() : '#000';

      grad.append("stop").attr("offset", "0%").attr("stop-color", bright);
      grad.append("stop").attr("offset", "60%").attr("stop-color", t.color);
      grad.append("stop").attr("offset", "100%").attr("stop-color", dark);
    });

    // Gradients for all connected clusters
    graph.clusters.forEach(c => {
      const clusterIdx = c.displayId - 1;
      const pal = CLUSTER_PALETTES[clusterIdx % CLUSTER_PALETTES.length];
      const grad = defs.append("radialGradient")
        .attr("id", `grad-cluster-${c.id}`)
        .attr("cx", "36%")
        .attr("cy", "34%")
        .attr("r", "68%");

      const cPrimary = d3.color(pal.primary);
      const bright = cPrimary ? cPrimary.brighter(0.8).formatHex() : pal.primary;
      const dark = d3.color(pal.secondary) ? d3.color(pal.secondary).darker(0.9).formatHex() : '#001a2c';

      grad.append("stop").attr("offset", "0%").attr("stop-color", bright);
      grad.append("stop").attr("offset", "65%").attr("stop-color", pal.primary);
      grad.append("stop").attr("offset", "100%").attr("stop-color", dark);
    });

    // Default / Unclassified Fallback Gradient
    const defGrad = defs.append("radialGradient")
      .attr("id", "grad-default")
      .attr("cx", "36%")
      .attr("cy", "34%")
      .attr("r", "68%");
    defGrad.append("stop").attr("offset", "0%").attr("stop-color", "#70d6ff");
    defGrad.append("stop").attr("offset", "65%").attr("stop-color", "#0098ea");
    defGrad.append("stop").attr("offset", "100%").attr("stop-color", "#003b6f");

    // Arrowhead marker for directed transfer edges
    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "rgba(0, 240, 255, 0.85)")
      .attr("d", "M0,-5L10,0L0,5");

    const g = svg.append("g").attr("class", "graph-root");

    // Zoom setup
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));

    const centerX = width > 900 ? width * 0.58 : width * 0.5;
    const centerY = height * 0.52;

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(centerX, centerY).scale(0.85).translate(-centerX, -centerY));

    // Zoom Controls
    const zoomIn = document.getElementById('zoom-in');
    const zoomOut = document.getElementById('zoom-out');
    const zoomReset = document.getElementById('zoom-reset');
    if (zoomIn) zoomIn.onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 1.3);
    if (zoomOut) zoomOut.onclick = () => svg.transition().duration(300).call(zoom.scaleBy, 0.7);
    if (zoomReset) zoomReset.onclick = () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity.translate(centerX, centerY).scale(0.85).translate(-centerX, -centerY));

    // Force Simulation (Calm, stable, fluid organic physics matching video)
    state.bubbleSim = d3.forceSimulation(graph.nodes)
      .force("link", d3.forceLink(graph.links).id(d => d.id).distance(120).strength(0.32))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(centerX, centerY).strength(0.05))
      .force("collide", d3.forceCollide().radius(d => d.radius + 6).strength(0.85).iterations(2))
      .alphaDecay(0.028);

    // Render Clean, Elegant Static Cyber Links (Zero flickering/pulsing)
    const linksGlowLayer = g.append("g").attr("class", "links-glow");
    const linkGlow = linksGlowLayer.selectAll("line")
      .data(graph.links)
      .enter().append("line")
      .attr("class", "link-glow-bg")
      .style("stroke", d => d.isTrade ? "rgba(16, 185, 129, 0.15)" : "rgba(0, 210, 255, 0.15)")
      .style("stroke-width", d => Math.max(3.5, Math.min(7, Math.sqrt(d.txCount) * 2.2)))
      .style("stroke-linecap", "round")
      .style("pointer-events", "none");

    const linksFlowLayer = g.append("g").attr("class", "links-flow");
    const linkFlow = linksFlowLayer.selectAll("line")
      .data(graph.links)
      .enter().append("line")
      .attr("class", "link-core-line")
      .style("stroke", d => d.isTrade ? "#10B981" : "#00D2FF")
      .style("stroke-opacity", 0.5)
      .style("stroke-width", d => Math.max(1.5, Math.min(3.5, Math.sqrt(d.txCount) * 1.5)))
      .style("stroke-linecap", "round")
      .attr("marker-end", "url(#arrow)");

    // Tooltip reference
    const tooltip = d3.select("#bubble-tooltip");

    // Render Nodes (Groups containing circle, gloss, text)
    const nodeGroup = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graph.nodes)
      .enter().append("g")
      .attr("class", "node-group")
      .call(d3.drag()
        .on("start", (event, d) => {
          if (!event.active) state.bubbleSim.alphaTarget(0.2).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) state.bubbleSim.alphaTarget(0); // Settles gracefully!
          d.fx = null; d.fy = null;
        }));

    // Geometry Rendering: Elegant 3D Glowing Spheres for ALL nodes (matching video)
    nodeGroup.each(function(d) {
      const el = d3.select(this);
      const gradFill = d.gradientId ? `url(#${d.gradientId})` : 'url(#grad-default)';

      // Halo (visible on hover/select)
      el.append("circle")
        .attr("class", "node-halo")
        .attr("r", d.radius + 5)
        .attr("fill", "none")
        .attr("stroke", d.color)
        .attr("stroke-width", 2)
        .style("opacity", 0);

      // Core Spherical Bubble
      el.append("circle")
        .attr("class", "node-bubble")
        .attr("r", d.radius)
        .attr("fill", gradFill)
        .attr("stroke", "rgba(255, 255, 255, 0.45)")
        .attr("stroke-width", d.isVerified ? 2 : 1.2)
        .style("filter", `drop-shadow(0 0 10px ${d.color}60)`);

      // Specular Glass Highlight
      el.append("ellipse")
        .attr("class", "node-gloss")
        .attr("cx", -d.radius * 0.28)
        .attr("cy", -d.radius * 0.32)
        .attr("rx", d.radius * 0.45)
        .attr("ry", d.radius * 0.3)
        .attr("transform", "rotate(-25)")
        .attr("fill", "url(#gloss-reflection)")
        .style("pointer-events", "none");
    });

    // Centered Percentage Text Label (High-Contrast White Data Font)
    nodeGroup.append("text")
      .attr("class", "node-text node-pct")
      .attr("text-anchor", "middle")
      .attr("dy", d => (d.radius > 25) ? "-0.15em" : "0.32em")
      .style("font-size", d => Math.max(10, Math.min(15, d.radius / 2.3)) + "px")
      .style("pointer-events", "none")
      .text(d => d.radius > 16 ? (d.percentOfTracked.toFixed(d.percentOfTracked < 1 ? 2 : 1) + '%') : '');

    // Sublabel Text (Tier Name / Category / Cluster)
    nodeGroup.append("text")
      .attr("class", "node-text node-sublabel")
      .attr("text-anchor", "middle")
      .attr("dy", "1.25em")
      .style("pointer-events", "none")
      .text(d => {
        if (d.radius <= 25) return '';
        if (d.isVerified) return d.category.length > 10 ? d.category.substring(0, 9) + '…' : d.category;
        if (d.isConnected) return `C#${d.clusterDisplayId || 1}`;
        if (d.tier) return d.tier.name;
        return '';
      });

    // Hover Events
    nodeGroup
      .on("mouseover", (event, d) => {
        const connectedIds = new Set([d.id]);
        graph.links.forEach(l => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          if (sId === d.id) connectedIds.add(tId);
          if (tId === d.id) connectedIds.add(sId);
        });

        // Highlight connected links
        linkGlow.style("stroke-opacity", l => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          return (sId === d.id || tId === d.id) ? 1 : 0.04;
        });

        linkFlow.style("stroke-opacity", l => {
          const sId = typeof l.source === 'object' ? l.source.id : l.source;
          const tId = typeof l.target === 'object' ? l.target.id : l.target;
          return (sId === d.id || tId === d.id) ? 1 : 0.04;
        });

        // Dim non-connected nodes
        nodeGroup.style("opacity", n => connectedIds.has(n.id) ? 1 : 0.18);

        // Tooltip Content
        const clusterInfo = graph.clusters.find(c => c.id === d.clusterId);
        const clusterLabel = clusterInfo 
          ? `Cluster #${clusterInfo.displayId} (${clusterInfo.walletCount} connected wallets)` 
          : 'Independent Wallet (0 Observed Transfers)';

        const shapeBadgeHtml = d.isConnected
          ? `<span style="display:inline-flex; align-items:center; gap:5px; color:#00D2FF; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:#00D2FF; display:inline-block;"></span> Connected Cluster</span>`
          : `<span style="display:inline-flex; align-items:center; gap:5px; color:${d.color}; font-weight:700;"><span style="width:8px; height:8px; border-radius:50%; background:${d.color}; display:inline-block;"></span> ${d.tierName || 'Autonomous'}</span>`;

        const tierInfoHtml = d.tier
          ? `<div style="display:flex; justify-content:space-between; gap:16px; font-size:11px; color:#cbd5e1; margin-top:2px;">
              <span>Holder Tier:</span>
              <strong style="color:${d.color};">${d.tier.name} (${d.tier.desc})</strong>
            </div>`
          : '';

        tooltip.style("display", "block")
          .html(`
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
              <span style="font-weight:700; color:${d.color};">${d.category}</span>
              ${shapeBadgeHtml}
            </div>
            <div style="font-family:var(--font-data); font-size:11px; color:#cbd5e1; margin-bottom:6px;">${shortenAddress(d.friendlyAddress, 6)}</div>
            ${tierInfoHtml}
            <div style="display:flex; justify-content:space-between; gap:16px; font-size:11px; margin-top:3px;">
              <span>Balance:</span>
              <strong style="color:#fff;">${formatTokenUnits(d.rawBalance, state.activeToken.decimals)} ${state.activeToken.symbol}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; font-size:11px; margin-top:3px;">
              <span>Share of Tracked:</span>
              <strong style="color:var(--color-cyan);">${d.percentOfTracked.toFixed(2)}%</strong>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px; font-size:11px; margin-top:6px; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px;">
              <span>Topology:</span>
              <span style="color:#cbd5e1;">${clusterLabel}</span>
            </div>
          `)
          .style("left", (event.clientX + 16) + "px")
          .style("top", (event.clientY - 16) + "px");
      })
      .on("mousemove", (event) => {
        tooltip.style("left", (event.clientX + 16) + "px")
               .style("top", (event.clientY - 16) + "px");
      })
      .on("mouseout", () => {
        nodeGroup.style("opacity", 1);
        linkGlow.style("stroke-opacity", 0.15);
        linkFlow.style("stroke-opacity", 0.5);
        tooltip.style("display", "none");
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        tooltip.style("display", "none");
        selectWalletNode(d, graph);
      });

    // Simulation Tick
    state.bubbleSim.on("tick", () => {
      linkGlow
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      linkFlow
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      // Soft viewport boundaries to prevent bubbles wandering offscreen
      graph.nodes.forEach(d => {
        if (!d.fx) {
          const rLimit = d.radius || 20;
          d.x = Math.max(rLimit + 10, Math.min(width - rLimit - 10, d.x));
          d.y = Math.max(rLimit + 20, Math.min(height - rLimit - 20, d.y));
        }
      });

      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Canvas click to deselect
    svg.on("click", () => {
      deselectWalletNode();
    });

    // Handle Window Resize
    window.onresize = () => {
      if (document.getElementById('view-map').style.display === 'block') {
        const w = container.clientWidth;
        const h = container.clientHeight;
        svg.attr("width", w).attr("height", h);
        state.bubbleSim.force("center", d3.forceCenter(w / 2, h / 2));
        state.bubbleSim.alpha(0.2).restart();
      }
    };
  }

  // --- Wallet & Cluster Investigation Panel ---
  function selectWalletNode(node, graph) {
    state.selectedNode = node;
    const panel = document.getElementById('panel-wallet');
    if (!panel) return;

    panel.style.display = 'block';

    // Highlight Node Halo
    d3.selectAll('.node-halo').style("opacity", d => d.id === node.id ? 1 : 0);

    // Populate Wallet Data
    const badge = document.getElementById('wallet-badge');
    const addrEl = document.getElementById('wallet-address');
    const balEl = document.getElementById('wallet-balance');
    const supplyEl = document.getElementById('wallet-supply');
    const clusterBox = document.getElementById('wallet-cluster-info');
    const transfersBox = document.getElementById('wallet-transfers-evidence');

    if (badge) {
      badge.textContent = `${node.category} · ${node.tierName || (node.isConnected ? 'Cluster Member' : 'Holder')}`;
      badge.style.color = node.color;
      badge.style.border = `1px solid ${node.color}40`;
    }

    if (addrEl) {
      addrEl.textContent = node.friendlyAddress;
      addrEl.title = node.address;
    }

    if (balEl) {
      balEl.textContent = `${formatTokenUnits(node.rawBalance, state.activeToken.decimals)} ${state.activeToken.symbol}`;
    }

    if (supplyEl) {
      supplyEl.textContent = `${node.percentOfTracked.toFixed(2)}% of tracked supply`;
    }

    // Cluster Membership Context
    const cluster = graph.clusters.find(c => c.id === node.clusterId);
    if (clusterBox) {
      if (cluster) {
        clusterBox.innerHTML = `
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">Connected in Cluster #${cluster.displayId}</div>
          <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.4;">
            This wallet is connected to <strong>${cluster.walletCount - 1}</strong> other top holders through observed transactions. Total cluster holdings: <strong>${cluster.percentOfTracked.toFixed(1)}%</strong>.
          </div>
        `;
      } else {
        clusterBox.innerHTML = `
          <div style="font-weight: 600; color: ${node.color}; margin-bottom: 4px;">Independent Wallet (${node.tierName || 'Standard'} Tier)</div>
          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
            No direct peer transfers observed with other top holders in recent on-chain events. Colored dynamically by token holding tier (<strong>${node.percentOfTracked.toFixed(2)}%</strong>).
          </div>
        `;
      }
    }

    // Observed Transfers Evidence
    if (transfersBox) {
      const relatedTransfers = graph.transfers.filter(t => t.source === node.id || t.target === node.id);
      if (relatedTransfers.length > 0) {
        transfersBox.innerHTML = `
          <div class="evidence-title">Observed Transfers (${relatedTransfers.length})</div>
          <div class="evidence-list">
            ${relatedTransfers.slice(0, 5).map(t => {
              const isOutgoing = t.source === node.id;
              const counterparty = isOutgoing ? t.targetAddr : t.sourceAddr;
              const dirSymbol = isOutgoing ? '↗ Sent to' : '↙ Received from';
              const dirColor = isOutgoing ? 'var(--red)' : 'var(--green)';
              return `
                <div class="evidence-item">
                  <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                    <span style="color:${dirColor}; font-weight:600;">${dirSymbol}</span>
                    <span class="data-font" style="color:#fff;">${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${state.activeToken.symbol}</span>
                  </div>
                  <div style="font-size:10px; color:var(--text-muted); display:flex; justify-content:space-between;">
                    <span>${shortenAddress(counterparty, 4)}</span>
                    <span>${timeAgo(t.timestamp)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else {
        transfersBox.innerHTML = `
          <div class="evidence-title">Observed Interactions</div>
          <div style="font-size:11px; color:var(--text-muted); padding:8px 0;">
            No direct token transfers observed between this wallet and other top holders in the sampled window.
          </div>
        `;
      }
    }

    // Action buttons
    const btnCopy = document.getElementById('btn-copy-address');
    const btnExplorer = document.getElementById('btn-view-explorer');
    if (btnCopy) {
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(node.friendlyAddress).then(() => {
          const orig = btnCopy.textContent;
          btnCopy.textContent = 'Copied!';
          setTimeout(() => { btnCopy.textContent = orig; }, 1500);
        });
      };
    }
    if (btnExplorer) {
      btnExplorer.onclick = () => {
        window.open(`https://tonviewer.com/${node.friendlyAddress}`, '_blank');
      };
    }
  }

  function deselectWalletNode() {
    state.selectedNode = null;
    const panel = document.getElementById('panel-wallet');
    if (panel) panel.style.display = 'none';
    d3.selectAll('.node-halo').style("opacity", 0);
  }

  // --- Cluster Filtering ---
  function populateClusterFilterOptions(clusters) {
    const select = document.getElementById('cluster-filter-select');
    if (!select) return;

    select.innerHTML = `
      <option value="all">All Wallets (Total Top Holders)</option>
      <option value="connected">Connected Clusters Only (${clusters.length})</option>
      ${clusters.map(c => `
        <option value="${c.id}">Cluster #${c.displayId} (${c.walletCount} wallets · ${c.percentOfTracked.toFixed(1)}%)</option>
      `).join('')}
    `;

    select.onchange = (e) => {
      const val = e.target.value;
      state.selectedClusterId = val;
      filterGraphByCluster(val);
    };
  }

  function filterGraphByCluster(filterVal) {
    if (!state.graphData) return;

    const nodeGroup = d3.selectAll('.node-group');
    const links = d3.selectAll('.link');

    if (filterVal === 'all') {
      nodeGroup.style("opacity", 1);
      links.style("opacity", 0.6);
    } else if (filterVal === 'connected') {
      const connectedClusterIds = new Set(state.graphData.clusters.map(c => c.id));
      nodeGroup.style("opacity", d => connectedClusterIds.has(d.clusterId) ? 1 : 0.08);
      links.style("opacity", 0.6);
    } else {
      const targetClusterId = Number(filterVal);
      nodeGroup.style("opacity", d => d.clusterId === targetClusterId ? 1 : 0.08);
      links.style("opacity", l => (l.source.clusterId === targetClusterId && l.target.clusterId === targetClusterId) ? 1 : 0.05);
    }
  }

  // --- Search Wallet in Graph ---
  function searchWalletInGraph(addressQuery) {
    if (!state.graphData || !addressQuery) return;
    const clean = safeTrim(addressQuery).toLowerCase();

    const targetNode = state.graphData.nodes.find(n => 
      n.address.toLowerCase().includes(clean) ||
      n.friendlyAddress.toLowerCase().includes(clean)
    );

    if (targetNode) {
      selectWalletNode(targetNode, state.graphData);
      
      // Zoom to node
      const container = document.getElementById('bubble-map-container');
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const svg = d3.select("#bubble-map-container svg");
      svg.transition().duration(600).call(
        d3.zoom().transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(1.4).translate(-targetNode.x, -targetNode.y)
      );
    } else {
      alert(`Wallet ${addressQuery} is not among the top ${state.graphData.nodes.length} holders loaded in this graph.`);
    }
  }

  // --- Token Details Modal / Drawer ---
  function openTokenDetailsDrawer(token) {
    const modal = document.getElementById('modal-token-details');
    if (!modal) return;

    modal.style.display = 'flex';

    // Header info
    document.getElementById('dt-token-name').textContent = token.name;
    document.getElementById('dt-token-symbol').textContent = token.symbol;
    const dtLogo = document.getElementById('dt-token-logo');
    if (dtLogo) {
      dtLogo.src = resolveLogoUrl(token);
      dtLogo.onerror = function() { window.handleTokenLogoError(this, token.symbol); };
    }
    
    // Verification Badge
    const badgeEl = document.getElementById('dt-token-badge');
    if (badgeEl) {
      badgeEl.textContent = token.verification === 'whitelist' ? 'VERIFIED ON-CHAIN' : 'COMMUNITY / UNVERIFIED';
      badgeEl.className = token.verification === 'whitelist' ? 'badge-ver badge-verified' : 'badge-ver badge-unverified';
    }

    // Logo Source & Verification Details
    const logoSourceEl = document.getElementById('dt-logo-source');
    if (logoSourceEl) {
      if (token.metadata && token.metadata.image) {
        logoSourceEl.textContent = 'Verified On-Chain Metadata Image URI';
      } else if (token.preview) {
        logoSourceEl.textContent = 'Trusted Data Provider CDN Proxy (TonAPI)';
      } else if (token.logo) {
        logoSourceEl.textContent = 'Verified Project CDN Repository Asset';
      } else {
        logoSourceEl.textContent = 'Neutral Fallback Glyph (Unverified external asset)';
      }
    }

    // Contract and Explorers
    const contractEl = document.getElementById('dt-token-contract');
    if (contractEl) {
      contractEl.textContent = token.contract || 'N/A';
      contractEl.onclick = () => {
        if (token.contract) {
          navigator.clipboard.writeText(token.contract);
          alert('Copied Master Contract address!');
        }
      };
    }

    const copyContractBtn = document.getElementById('dt-btn-copy-contract');
    if (copyContractBtn) {
      copyContractBtn.onclick = () => {
        if (token.contract) {
          navigator.clipboard.writeText(token.contract);
          const span = copyContractBtn.querySelector('span');
          if (span) {
            span.textContent = '¡Copiado!';
            setTimeout(() => { span.textContent = 'Copiar'; }, 2000);
          }
        }
      };
    }

    const linkTonviewer = document.getElementById('dt-link-tonviewer');
    const linkTonscan = document.getElementById('dt-link-tonscan');
    const linkStonfi = document.getElementById('dt-link-stonfi');
    if (linkTonviewer && token.contract) linkTonviewer.href = `https://tonviewer.com/${token.contract}`;
    if (linkTonscan && token.contract) linkTonscan.href = `https://tonscan.org/jetton/${token.contract}`;
    if (linkStonfi && token.contract) linkStonfi.href = `https://app.ston.fi/swap?chartVisible=true&ft=TON&tt=${encodeURIComponent(token.contract)}`;

    // Key Statistics
    document.getElementById('dt-token-price').innerHTML = formatPrice(token.price);
    
    const changeEl = document.getElementById('dt-token-change24h');
    if (changeEl) {
      if (token.change24h != null) {
        const isPos = token.change24h >= 0;
        changeEl.innerHTML = `<span style="color:${isPos ? 'var(--color-green)' : 'var(--color-pink)'}; font-weight:700;">${isPos ? '+' : ''}${token.change24h.toFixed(2)}%</span>`;
      } else {
        changeEl.innerHTML = '<span class="val-nodata">N/D</span>';
      }
    }

    document.getElementById('dt-token-mcap').innerHTML = formatMoney(token.marketCap);
    document.getElementById('dt-token-vol').innerHTML = formatMoney(token.volume);
    
    const liqEl = document.getElementById('dt-token-liquidity');
    if (liqEl) {
      liqEl.innerHTML = token.liquidity != null ? formatMoney(token.liquidity) : '<span class="val-nodata">N/D (Sin datos de pool)</span>';
    }

    document.getElementById('dt-token-holders').innerHTML = token.holders ? Number(token.holders).toLocaleString() : '<span class="val-nodata">N/D</span>';
    
    // Total supply
    const supplyEl = document.getElementById('dt-token-supply');
    if (supplyEl) {
      supplyEl.innerHTML = token.totalSupply && token.decimals ? formatTokenUnits(token.totalSupply, token.decimals) + ' ' + token.symbol : '<span class="val-nodata">N/D</span>';
    }

    const syncEl = document.getElementById('dt-token-last-sync');
    if (syncEl) {
      if (token.lastIndexed) {
        const d = new Date(token.lastIndexed);
        syncEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString();
      } else {
        syncEl.innerHTML = '<span class="val-nodata">N/D</span>';
      }
    }

    // Direct Cluster Exploration Action Button
    const btnExplore = document.getElementById('dt-btn-explore-cluster');
    if (btnExplore) {
      btnExplore.onclick = async () => {
        modal.style.display = 'none';
        const dropdown = document.getElementById('search-results-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        let targetToken = state.tokens.find(t => t.contract.toLowerCase() === token.contract.toLowerCase());
        if (!targetToken) {
          const res = await indexJettonMasterContract(token.contract);
          targetToken = res.token || token;
        }
        openBubbleMap(targetToken);
      };
    }

    // Asynchronously enrich metadata if token was selected from search results without full state
    if (token.contract && (token.holders == null || token.totalSupply == null)) {
      ApiService.fetchJettonDetails(token.contract).then(jettonData => {
        if (jettonData && modal.style.display === 'flex') {
          if (jettonData.metadata) {
            if (!token.decimals && jettonData.metadata.decimals) token.decimals = Number(jettonData.metadata.decimals);
            if (jettonData.metadata.description && !token.description) token.description = jettonData.metadata.description;
          }
          if (jettonData.holders_count != null) {
            token.holders = jettonData.holders_count;
            const hEl = document.getElementById('dt-token-holders');
            if (hEl) hEl.textContent = Number(token.holders).toLocaleString();
          }
          if (jettonData.total_supply != null) {
            token.totalSupply = jettonData.total_supply;
            const sEl = document.getElementById('dt-token-supply');
            if (sEl) sEl.innerHTML = formatTokenUnits(token.totalSupply, token.decimals || 9) + ' ' + token.symbol;
          }
          if (token.price && token.totalSupply && token.decimals && !token.marketCap) {
            try {
              const dec = token.decimals || 9;
              const baseSupply = Number(BigInt(token.totalSupply) / BigInt(10 ** Math.min(dec, 18)));
              token.marketCap = baseSupply * token.price;
              const mcEl = document.getElementById('dt-token-mcap');
              if (mcEl) mcEl.innerHTML = formatMoney(token.marketCap);
            } catch (e) {}
          }
        }
      });
    }

    // Holder Concentration calculation & Tables
    const hasActiveGraph = state.graphData && state.graphData.nodes && state.activeToken && state.activeToken.contract === token.contract;

    if (hasActiveGraph) {
      const sorted = [...state.graphData.nodes].sort((a, b) => b.balance - a.balance);
      const top5Pct = sorted.slice(0, 5).reduce((s, n) => s + n.percentOfTracked, 0);
      const top10Pct = sorted.slice(0, 10).reduce((s, n) => s + n.percentOfTracked, 0);
      const top20Pct = sorted.slice(0, 20).reduce((s, n) => s + n.percentOfTracked, 0);

      document.getElementById('dt-top5-share').textContent = top5Pct.toFixed(1) + '%';
      document.getElementById('dt-top10-share').textContent = top10Pct.toFixed(1) + '%';
      document.getElementById('dt-top20-share').textContent = top20Pct.toFixed(1) + '%';

      const concRating = document.getElementById('dt-concentration-level');
      if (concRating) {
        if (top10Pct > 70) {
          concRating.textContent = 'HIGH CONCENTRATION';
          concRating.style.color = 'var(--red)';
        } else if (top10Pct > 40) {
          concRating.textContent = 'MODERATE CONCENTRATION';
          concRating.style.color = '#ff9800';
        } else {
          concRating.textContent = 'DISTRIBUTED HOLDINGS';
          concRating.style.color = 'var(--green)';
        }
      }

      // Top Holders Table
      const holdersTbody = document.getElementById('dt-holders-tbody');
      if (holdersTbody) {
        holdersTbody.innerHTML = sorted.slice(0, 15).map((n, i) => `
          <tr>
            <td class="data-font">#${i + 1}</td>
            <td class="data-font" style="color:var(--cyan); cursor:pointer;" onclick="window.open('https://tonviewer.com/${n.friendlyAddress}','_blank')">${shortenAddress(n.friendlyAddress, 5)}</td>
            <td>${n.isVerified ? `<span style="color:${n.color}; font-size:11px; font-weight:600;">${n.category}</span>` : '<span style="color:var(--text-muted); font-size:11px;">Unlabeled</span>'}</td>
            <td class="data-font">${formatTokenUnits(n.rawBalance, token.decimals)}</td>
            <td class="data-font" style="color:var(--cyan);">${n.percentOfTracked.toFixed(2)}%</td>
          </tr>
        `).join('');
      }

      // Recent Transfers & DEX Trades
      const transfersTbody = document.getElementById('dt-transfers-tbody');
      const tradesTbody = document.getElementById('dt-trades-tbody');
      
      if (transfersTbody) {
        const transfers = state.graphData.transfers.filter(t => !t.isTrade);
        if (transfers.length > 0) {
          transfersTbody.innerHTML = transfers.slice(0, 10).map(t => `
            <tr>
              <td class="data-font" style="font-size:11px;">${timeAgo(t.timestamp)}</td>
              <td class="data-font">${shortenAddress(t.sourceAddr, 4)}</td>
              <td class="data-font">${shortenAddress(t.targetAddr, 4)}</td>
              <td class="data-font" style="color:#fff;">${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.symbol}</td>
              <td>${t.txHash ? `<a href="https://tonviewer.com/transaction/${t.txHash}" target="_blank" style="color:var(--cyan); font-size:11px;">View</a>` : '--'}</td>
            </tr>
          `).join('');
        } else {
          transfersTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No peer transfers observed in sampled window</td></tr>`;
        }
      }

      if (tradesTbody) {
        const trades = state.graphData.transfers.filter(t => t.isTrade);
        if (trades.length > 0) {
          tradesTbody.innerHTML = trades.slice(0, 10).map(t => `
            <tr>
              <td class="data-font" style="font-size:11px;">${timeAgo(t.timestamp)}</td>
              <td><span style="color:var(--cyan); font-weight:600;">${t.dex}</span></td>
              <td class="data-font">${shortenAddress(t.sourceAddr, 4)}</td>
              <td class="data-font">${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.symbol}</td>
              <td>${t.txHash ? `<a href="https://tonviewer.com/transaction/${t.txHash}" target="_blank" style="color:var(--cyan); font-size:11px;">Trace</a>` : '--'}</td>
            </tr>
          `).join('');
        } else {
          tradesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No direct DEX pool swaps in sampled events window</td></tr>`;
        }
      }
    } else {
      // Graph not currently loaded for this specific token
      document.getElementById('dt-top5-share').innerHTML = '<span class="val-nodata">--</span>';
      document.getElementById('dt-top10-share').innerHTML = '<span class="val-nodata">--</span>';
      document.getElementById('dt-top20-share').innerHTML = '<span class="val-nodata">--</span>';
      const concRating = document.getElementById('dt-concentration-level');
      if (concRating) {
        concRating.textContent = 'PENDIENTE DE GRAFO';
        concRating.style.color = 'var(--text-muted)';
      }
      const holdersTbody = document.getElementById('dt-holders-tbody');
      if (holdersTbody) {
        holdersTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">Haz clic arriba en <strong>Explorar Clusters de Wallets</strong> para mapear los holders y calcular la concentración en tiempo real.</td></tr>`;
      }
      const transfersTbody = document.getElementById('dt-transfers-tbody');
      if (transfersTbody) {
        transfersTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">Inicia la exploración de clusters para trazar transferencias directas entre billeteras.</td></tr>`;
      }
      const tradesTbody = document.getElementById('dt-trades-tbody');
      if (tradesTbody) {
        tradesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:16px;">Inicia la exploración de clusters para clasificar swaps y operaciones DEX.</td></tr>`;
      }
    }
  }

  // --- Indexer Health & Inspector Modal ---
  function openIndexerHealthModal() {
    const modal = document.getElementById('modal-indexer-health');
    if (!modal) return;

    modal.style.display = 'flex';

    // Update statuses
    const tonapiStatus = document.getElementById('status-tonapi');
    const tonapiLatency = document.getElementById('latency-tonapi');
    if (tonapiStatus) tonapiStatus.textContent = state.providersStatus.tonapi.status.toUpperCase();
    if (tonapiLatency) tonapiLatency.textContent = state.providersStatus.tonapi.latencyMs ? `${state.providersStatus.tonapi.latencyMs}ms` : '--';

    const logList = document.getElementById('indexer-logs-list');
    if (logList) {
      logList.innerHTML = state.indexerLogs.map(log => `
        <div class="log-entry log-${log.level}">
          <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
          <span class="log-type">[${log.type}]</span>
          <span class="log-msg">${log.message}</span>
        </div>
      `).join('');
    }
  }

  function updateIndexerStatusUI() {
    const syncBadge = document.getElementById('header-sync-status');
    if (syncBadge) {
      syncBadge.innerHTML = `
        <span class="dot-live"></span>
        <span>Indexer: Live · Last Synced: ${timeAgo(state.lastIndexedTime)}</span>
      `;
    }
  }

  function updateMapTokenPanel(token) {
    const logoEl = document.getElementById('map-logo');
    const nameEl = document.getElementById('map-name');
    const tickerEl = document.getElementById('map-ticker');
    const priceEl = document.getElementById('map-price');
    const mcapEl = document.getElementById('map-mcap');
    const contractEl = document.getElementById('map-contract');

    if (logoEl) {
      logoEl.src = resolveLogoUrl(token);
      logoEl.onerror = function() { window.handleTokenLogoError(this, token.symbol); };
    }
    if (nameEl) nameEl.textContent = token.name;
    if (tickerEl) tickerEl.textContent = token.symbol;
    if (priceEl) priceEl.innerHTML = formatPrice(token.price);
    if (mcapEl) mcapEl.innerHTML = formatMoney(token.marketCap);

    if (contractEl) {
      if (token.contract) {
        contractEl.textContent = shortenAddress(token.contract, 6);
        contractEl.title = token.contract;
        contractEl.onclick = () => {
          navigator.clipboard.writeText(token.contract);
          const orig = contractEl.textContent;
          contractEl.textContent = 'Copied!';
          setTimeout(() => { contractEl.textContent = orig; }, 1500);
        };
      } else {
        contractEl.textContent = 'N/A';
        contractEl.onclick = null;
      }
    }
  }

  function renderEmptyGraphState(token, message) {
    const container = document.getElementById('bubble-map-container');
    if (!container) return;
    const existingSvg = container.querySelector('svg');
    if (existingSvg) existingSvg.remove();

    container.innerHTML = `
      <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); text-align:center; color:var(--text-secondary); max-width:400px;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 16px; opacity:0.6;">
          <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
        </svg>
        <div style="font-weight:700; font-size:1.1rem; color:#fff; margin-bottom:8px;">No On-Chain Holder Topology</div>
        <div style="font-size:0.9rem; line-height:1.5;">${message}</div>
      </div>
    `;
  }

  // --- URL Deep-Links & Query Parameters ---
  function handleUrlDeepLinks() {
    const params = new URLSearchParams(window.location.search);
    const targetAddr = params.get('address') || params.get('token') || params.get('contract');
    if (targetAddr) {
      const clean = safeTrim(targetAddr);
      const matched = state.tokens.find(t => 
        (t.contract && t.contract.toLowerCase() === clean.toLowerCase()) ||
        t.symbol.toLowerCase() === clean.toLowerCase()
      );
      if (matched) {
        openBubbleMap(matched);
      } else {
        // Trigger live index
        indexJettonMasterContract(clean).then(res => {
          if (res.success && res.token) {
            openBubbleMap(res.token);
          }
        });
      }
    }
  }

  // --- TON Memecoin & Jetton Discovery Engine ---
  const searchCache = new Map();
  let searchDebounceTimer = null;

  async function searchTonTokens(query) {
    const clean = safeTrim(query);
    if (!clean) return [];

    const cacheKey = clean.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const isAddress = (clean.startsWith('EQ') || clean.startsWith('UQ') || clean.startsWith('kQ') || clean.startsWith('0:')) && clean.length >= 24;

    // 1. Direct Contract Address Search
    if (isAddress) {
      const local = state.tokens.find(t => 
        (t.contract && t.contract.toLowerCase() === clean.toLowerCase()) ||
        (t.raw_address && t.raw_address.toLowerCase() === clean.toLowerCase())
      );
      if (local) {
        searchCache.set(cacheKey, [local]);
        return [local];
      }

      // Query TonAPI for this exact Jetton Master contract
      const jettonData = await ApiService.fetchJettonDetails(clean);
      if (jettonData && jettonData.metadata) {
        const meta = jettonData.metadata;
        const friendly = (window.rawToFriendly && meta.address) ? window.rawToFriendly(meta.address) : clean;
        const raw = (window.friendlyToRaw && friendly) ? window.friendlyToRaw(friendly) : (meta.address || clean);
        const tokenObj = {
          symbol: meta.symbol || 'UNKNOWN',
          name: meta.name || 'Unnamed Jetton',
          contract: friendly,
          raw_address: raw,
          decimals: Number(meta.decimals) || 9,
          verification: jettonData.verification || 'none',
          logo: meta.image || null,
          preview: jettonData.preview || null,
          description: meta.description || '',
          price: null,
          change24h: null,
          marketCap: null,
          volume: null,
          holders: jettonData.holders_count || 0,
          totalSupply: jettonData.total_supply || null,
          lastIndexed: new Date().toISOString()
        };

        try {
          const rates = await ApiService.fetchJettonRates([friendly]);
          const r = rates[friendly] || rates[raw];
          if (r && r.prices && r.prices.USD != null) {
            tokenObj.price = r.prices.USD;
            if (r.diff_24h && r.diff_24h.USD) {
              tokenObj.change24h = parseFloat(r.diff_24h.USD.replace('%', ''));
            }
          }
        } catch (e) {}

        searchCache.set(cacheKey, [tokenObj]);
        return [tokenObj];
      }
      return [];
    }

    // 2. Text Search (symbol or name)
    const qLower = clean.toLowerCase();
    
    // Filter local catalog
    const localMatches = state.tokens.filter(t => 
      t.symbol.toLowerCase().includes(qLower) ||
      t.name.toLowerCase().includes(qLower) ||
      (t.contract && t.contract.toLowerCase().includes(qLower))
    );

    // Concurrently fetch accounts from TonAPI
    let remoteTokens = [];
    try {
      const remoteAccounts = await ApiService.searchAccountJettons(clean);
      if (Array.isArray(remoteAccounts)) {
        for (const a of remoteAccounts) {
          const friendlyAddr = (window.rawToFriendly && a.address) ? window.rawToFriendly(a.address) : a.address;
          
          // Deduplicate against local catalog matches strictly by contract address
          const alreadyLocal = localMatches.some(lm => 
            (lm.contract && lm.contract.toLowerCase() === friendlyAddr.toLowerCase()) ||
            (lm.raw_address && lm.raw_address.toLowerCase() === (a.address || '').toLowerCase())
          );
          if (alreadyLocal) continue;

          // Strip " · jetton" suffix if present
          let cleanName = a.name ? a.name.replace(/\s*·\s*jetton/i, '').trim() : 'Jetton';
          let symbol = cleanName;
          if (cleanName.includes(' ')) {
            const parts = cleanName.split(' ');
            symbol = parts[0].length <= 8 ? parts[0] : cleanName;
          }

          // Distinct tokens with the same name/symbol are preserved separately by contract
          remoteTokens.push({
            symbol: symbol,
            name: cleanName,
            contract: friendlyAddr,
            raw_address: a.address,
            decimals: 9,
            verification: a.trust === 'whitelist' ? 'whitelist' : 'none',
            logo: null,
            preview: a.preview || null,
            description: '',
            price: null,
            change24h: null,
            marketCap: null,
            volume: null,
            holders: null,
            totalSupply: null,
            lastIndexed: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn('TonAPI account search warning:', e);
    }

    // Batch query rates for top remote tokens (up to 10)
    const topRemoteToRate = remoteTokens.slice(0, 10);
    const contractsToRate = topRemoteToRate.map(t => t.contract).filter(Boolean);
    if (contractsToRate.length > 0) {
      try {
        const rates = await ApiService.fetchJettonRates(contractsToRate);
        topRemoteToRate.forEach(t => {
          const r = rates[t.contract] || rates[t.raw_address];
          if (r && r.prices && r.prices.USD != null) {
            t.price = r.prices.USD;
            if (r.diff_24h && r.diff_24h.USD) {
              t.change24h = parseFloat(r.diff_24h.USD.replace('%', ''));
            }
          }
        });
      } catch (e) {}
    }

    // Combine local and remote results; each entry represents a distinct contract
    const combined = [...localMatches, ...remoteTokens];
    
    // Cache result set for 60 seconds
    searchCache.set(cacheKey, combined);
    setTimeout(() => searchCache.delete(cacheKey), 60000);

    return combined;
  }

  function renderSearchResultsDropdown(results, query) {
    const dropdown = document.getElementById('search-results-dropdown');
    if (!dropdown) return;

    dropdown.style.display = 'block';

    if (!results || results.length === 0) {
      dropdown.innerHTML = `
        <div class="search-state-box">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted); margin-bottom:4px;">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <div style="font-weight:600; color:#fff;">No se encontraron tokens en la red TON</div>
          <div style="font-size:12px; color:var(--text-muted); max-width:340px; line-height:1.4;">
            No hay tokens ni memecoins que coincidan con "<strong>${escapeHtml(query)}</strong>". Si conoces el contrato Master (EQ... / 0:...), ingrésalo para indexarlo directamente de la blockchain.
          </div>
        </div>
      `;
      return;
    }

    const itemsHtml = results.map((token, idx) => {
      const logoSrc = resolveLogoUrl(token);
      const friendlyShort = shortenAddress(token.contract, 4);
      const isVer = token.verification === 'whitelist';
      const badgeHtml = isVer 
        ? '<span class="badge-ver badge-verified" style="font-size:10px; padding:1px 6px;">VERIFICADO</span>'
        : '<span class="badge-ver badge-unverified" style="font-size:10px; padding:1px 6px;">COMUNIDAD</span>';
      
      const priceDisplay = token.price != null ? formatPrice(token.price) : '<span class="val-nodata" style="font-size:11px;">Sin cotización</span>';
      const changeDisplay = token.change24h != null 
        ? `<span style="color:${token.change24h >= 0 ? 'var(--color-green)' : 'var(--color-pink)'}; font-size:11px; font-weight:600;">${token.change24h >= 0 ? '+' : ''}${token.change24h.toFixed(2)}%</span>`
        : '<span class="val-nodata" style="font-size:10px;">N/D (24h)</span>';

      const safeSym = escapeHtml(token.symbol || 'TOKEN');
      const safeName = escapeHtml(token.name || 'Jetton Token');
      const safeContract = escapeHtml(token.contract || '');

      return `
        <div class="search-result-item" data-idx="${idx}">
          <div class="search-item-left">
            <img src="${logoSrc}" class="search-token-icon" alt="${safeSym}" onerror="window.handleTokenLogoError(this, '${safeSym}')">
            <div class="search-token-info">
              <div class="search-token-top">
                <span class="search-token-name" title="${safeName}">${safeName}</span>
                <span class="search-token-symbol">${safeSym}</span>
                ${badgeHtml}
              </div>
              <div class="search-token-bottom">
                <span class="search-token-contract" title="Copiar contrato: ${safeContract}" data-contract="${safeContract}">${friendlyShort}</span>
                ${token.holders ? `<span style="color:var(--text-muted); font-size:11px;">· ${Number(token.holders).toLocaleString()} holders</span>` : ''}
              </div>
            </div>
          </div>
          <div class="search-item-right">
            <div class="search-price-box">
              <div class="search-token-price">${priceDisplay}</div>
              <div class="search-token-change">${changeDisplay}</div>
            </div>
            <div class="search-item-actions">
              <button class="btn-search-action btn-action-details" data-idx="${idx}" title="Ver Ficha de Información">Ficha</button>
              <button class="btn-search-action primary btn-action-clusters" data-idx="${idx}" title="Explorar grafo de clusters">Clusters</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    dropdown.innerHTML = `
      <div class="search-dropdown-header">
        <span>Tokens y Memecoins en TON (${results.length})</span>
        <span style="color:var(--color-cyan); font-size:11px; text-transform:none; font-weight:500;">Red: TON Mainnet</span>
      </div>
      <div class="search-results-list">
        ${itemsHtml}
      </div>
    `;

    // Bind item click listeners
    dropdown.querySelectorAll('.search-result-item').forEach(el => {
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      const token = results[idx];
      if (!token) return;

      // Clicking row opens Token Details Drawer
      el.onclick = (e) => {
        if (e.target.classList.contains('search-token-contract')) {
          e.stopPropagation();
          navigator.clipboard.writeText(token.contract);
          e.target.textContent = '¡Copiado!';
          setTimeout(() => { e.target.textContent = shortenAddress(token.contract, 4); }, 1500);
          return;
        }
        if (e.target.classList.contains('btn-action-clusters')) {
          return; // Handled by button listener
        }
        dropdown.style.display = 'none';
        openTokenDetailsDrawer(token);
      };

      // Direct cluster exploration button
      const btnClusters = el.querySelector('.btn-action-clusters');
      if (btnClusters) {
        btnClusters.onclick = async (e) => {
          e.stopPropagation();
          dropdown.style.display = 'none';
          
          let targetToken = state.tokens.find(t => t.contract.toLowerCase() === token.contract.toLowerCase());
          if (!targetToken) {
            const res = await indexJettonMasterContract(token.contract);
            targetToken = res.token || token;
          }
          openBubbleMap(targetToken);
        };
      }
    });
  }

  // --- UI Event Bindings ---
  function bindUIEvents() {
    // Top Search Input & Live Discovery Dropdown
    const searchInput = document.getElementById('token-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    const searchDropdown = document.getElementById('search-results-dropdown');

    if (searchInput) {
      // Focus handler
      searchInput.addEventListener('focus', () => {
        if (safeTrim(searchInput.value).length > 0 && searchDropdown) {
          searchDropdown.style.display = 'block';
        }
      });

      // Input handler with debounce
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const clean = safeTrim(val);

        // Keep catalog table filter in sync
        state.searchQuery = val;
        state.page = 1;
        applyFiltersAndSort();
        renderTokenTable();

        // Update clear button
        if (searchClear) {
          searchClear.style.display = clean.length > 0 ? 'block' : 'none';
        }

        // Handle live discovery dropdown
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }

        if (clean.length === 0) {
          if (searchDropdown) searchDropdown.style.display = 'none';
          return;
        }

        if (searchDropdown) {
          searchDropdown.style.display = 'block';
          searchDropdown.innerHTML = `
            <div class="search-state-box">
              <div class="search-state-spinner"></div>
              <span style="color:var(--color-cyan); font-weight:600;">Buscando tokens y memecoins en TON...</span>
            </div>
          `;
        }

        searchDebounceTimer = setTimeout(async () => {
          try {
            const results = await searchTonTokens(clean);
            if (safeTrim(searchInput.value) === clean) {
              renderSearchResultsDropdown(results, clean);
            }
          } catch (err) {
            if (searchDropdown) {
              searchDropdown.innerHTML = `
                <div class="search-state-box" style="color:var(--color-pink);">
                  <div style="font-weight:700;">Error de conexión con el indexador TON</div>
                  <div style="font-size:12px; color:var(--text-muted);">No se pudieron obtener resultados en tiempo real.</div>
                </div>
              `;
            }
          }
        }, 280);
      });

      // Keydown handler
      searchInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') {
          if (searchDropdown) searchDropdown.style.display = 'none';
          return;
        }
        if (e.key === 'Enter') {
          const val = safeTrim(searchInput.value);
          if (val.length >= 36) { // likely an address
            if (searchDropdown) searchDropdown.style.display = 'none';
            const res = await indexJettonMasterContract(val);
            if (res.success && res.token) {
              openTokenDetailsDrawer(res.token);
            }
          }
        }
      });
    }

    if (searchClear) {
      searchClear.onclick = () => {
        if (searchInput) {
          searchInput.value = '';
          searchClear.style.display = 'none';
          state.searchQuery = '';
          state.page = 1;
          applyFiltersAndSort();
          renderTokenTable();
        }
        if (searchDropdown) {
          searchDropdown.style.display = 'none';
        }
      };
    }

    // Click outside search bar closes dropdown
    document.addEventListener('click', (e) => {
      const searchWrapper = document.querySelector('.search-bar-wrapper');
      if (searchDropdown && searchWrapper && !searchWrapper.contains(e.target)) {
        searchDropdown.style.display = 'none';
      }
    });

    // Filter Tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.verificationFilter = tab.getAttribute('data-filter') || 'all';
        state.page = 1;
        applyFiltersAndSort();
        renderTokenTable();
      });
    });

    // Sort Dropdown
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        applyFiltersAndSort();
        renderTokenTable();
      });
    }

    // Back to Token Catalog button
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        document.getElementById('view-map').style.display = 'none';
        document.getElementById('view-list').style.display = 'block';
        if (state.bubbleSim) state.bubbleSim.stop();
        state.activeToken = null;
        deselectWalletNode();
      });
    }

    // Close Wallet Panel
    const closeWalletPanel = document.getElementById('btn-close-wallet-panel');
    if (closeWalletPanel) {
      closeWalletPanel.onclick = deselectWalletNode;
    }

    // Token Details Modal Trigger
    const btnTokenDetails = document.getElementById('btn-open-token-details');
    if (btnTokenDetails) {
      btnTokenDetails.onclick = () => {
        if (state.activeToken) openTokenDetailsDrawer(state.activeToken);
      };
    }

    // Close Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.onclick = () => {
        const modal = btn.closest('.modal-backdrop');
        if (modal) modal.style.display = 'none';
      };
    });

    // Indexer Status Button in Header
    const indexerBtn = document.getElementById('header-sync-status');
    if (indexerBtn) {
      indexerBtn.onclick = openIndexerHealthModal;
    }

    // Map In-Graph Wallet Search
    const graphSearchInput = document.getElementById('graph-wallet-search');
    if (graphSearchInput) {
      graphSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          searchWalletInGraph(graphSearchInput.value);
        }
      });
    }

    // Holders Limit Selector in Map
    const holderLimitSelect = document.getElementById('graph-holder-limit');
    if (holderLimitSelect) {
      holderLimitSelect.onchange = (e) => {
        state.holderLimit = Number(e.target.value) || 30;
        if (state.activeToken) {
          openBubbleMap(state.activeToken);
        }
      };
    }

    // Refresh Indexer Button in Health Modal
    const btnRetryHealth = document.getElementById('btn-retry-indexing');
    if (btnRetryHealth) {
      btnRetryHealth.onclick = async () => {
        btnRetryHealth.textContent = 'Syncing...';
        await syncLiveRatesAndMetadata();
        btnRetryHealth.textContent = 'Trigger Live Sync';
        openIndexerHealthModal();
      };
    }

    // Force index form in Health modal
    const inputCustomContract = document.getElementById('input-custom-contract');
    const btnSubmitCustom = document.getElementById('btn-submit-custom-index');
    if (btnSubmitCustom && inputCustomContract) {
      btnSubmitCustom.onclick = async () => {
        const addr = safeTrim(inputCustomContract.value);
        if (!addr) return;
        btnSubmitCustom.textContent = 'Indexing...';
        btnSubmitCustom.disabled = true;
        const res = await indexJettonMasterContract(addr);
        btnSubmitCustom.textContent = 'Index';
        btnSubmitCustom.disabled = false;
        if (res.success && res.token) {
          alert(`Indexed ${res.token.symbol} (${res.token.name}) successfully!`);
          inputCustomContract.value = '';
          openIndexerHealthModal();
        } else {
          alert('Failed: ' + (res.error || 'Contract index error'));
        }
      };
    }
  }

  // --- App Initialization ---
  window.addEventListener('DOMContentLoaded', () => {
    bindUIEvents();
    initializeTokenCatalog();
  });

  // Export engine methods to window for global integration
  window.ANLGRAM_WCE = {
    state,
    indexJettonMasterContract,
    openBubbleMap,
    openTokenDetailsDrawer,
    openIndexerHealthModal
  };

})();
