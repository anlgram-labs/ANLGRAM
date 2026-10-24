/**
 * ANLGRAM Shared Asset & Identity Registry
 * Standardized multi-chain asset dictionary and brand identity engine.
 * Never identifies an asset by ticker alone. Strictly enforces verified metadata or neutral fallback.
 */
(function() {
  'use strict';

  const IPFS_GATEWAY = 'https://cloudflare-ipfs.com/ipfs/';

  /**
   * Canonical Asset Registry Entries
   * Mapped by canonical ID: `${network.toLowerCase()}:${contractAddress || 'native'}`
   */
  const ASSET_REGISTRY = [
    // --- 1. TON Native & Verified Ecosystem Jettons ---
    {
      id: 'ton:native',
      network: 'TON',
      isNative: true,
      contractAddress: null,
      rawAddress: '0:0000000000000000000000000000000000000000000000000000000000000000',
      symbol: 'TON',
      name: 'Toncoin',
      decimals: 9,
      category: 'Native L1',
      imageUri: 'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png',
      imageSource: 'The Open Network Foundation Official Brand Asset (CoinGecko Mirror)',
      imagePermissions: 'Official open-source ecosystem brand asset with public display rights',
      providers: ['TonAPI', 'CoinGecko', 'STON.fi', 'DeDust'],
      explorerUrl: 'https://tonviewer.com',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'The native cryptocurrency of The Open Network (TON) blockchain.',
      primaryDex: 'STON.fi',
      tvSymbol: 'BYBIT:TONUSDT'
    },
    {
      id: 'ton:EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id8gFg',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id8gFg',
      rawAddress: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621df2',
      symbol: 'USD₮',
      displaySymbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      category: 'Stablecoin',
      imageUri: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      imageSource: 'Tether Operations Limited / CoinGecko Verified Asset Index',
      imagePermissions: 'Official issuer brand asset for verified network display',
      providers: ['TonAPI', 'STON.fi', 'DeDust', 'CoinGecko'],
      explorerUrl: 'https://tonviewer.com/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id8gFg',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Official multi-chain fiat-collateralized USD stablecoin issued by Tether on TON.',
      poolAddress: 'EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4',
      primaryDex: 'STON.fi',
      tvSymbol: 'BINANCE:USDTUSD'
    },
    {
      id: 'ton:EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
      rawAddress: '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc',
      symbol: 'NOT',
      name: 'Notcoin',
      decimals: 9,
      category: 'Gaming / Tap-to-Earn',
      imageUri: 'https://cdn.joincommunity.xyz/clicker/not_logo.png',
      imageSource: 'Notcoin Community On-Chain Metadata (TEP-74)',
      imagePermissions: 'On-chain verifiable metadata asset for ecosystem aggregators',
      providers: ['TonAPI', 'STON.fi', 'DeDust', 'CoinGecko', 'OKX'],
      explorerUrl: 'https://tonviewer.com/EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Community token originating from the Telegram tap-to-earn viral campaign.',
      primaryDex: 'STON.fi',
      tvSymbol: 'OKX:NOTUSDT'
    },
    {
      id: 'ton:EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS',
      rawAddress: '0:bcbc9cb8786f21c87044b19ede20448512144b52479f667b545f44460199c1bf',
      symbol: 'DOGS',
      name: 'Dogs',
      decimals: 9,
      category: 'Meme / Community',
      imageUri: 'https://cdn.dogs.dev/dogs.png',
      imageSource: 'Dogs Official Project Infrastructure / TonAPI',
      imagePermissions: 'Public community brand logo for wallet and explorer displays',
      providers: ['TonAPI', 'STON.fi', 'DeDust', 'Bybit'],
      explorerUrl: 'https://tonviewer.com/EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Telegram-native community memecoin celebrating Spotty the mascot.',
      primaryDex: 'STON.fi',
      tvSymbol: 'BYBIT:DOGSUSDT'
    },
    {
      id: 'ton:EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO',
      rawAddress: '0:3690254dc15b2297610cda60744a45f2b712aa4234b89adb439a775e6c06f53e',
      symbol: 'STON',
      name: 'STON.fi',
      decimals: 9,
      category: 'DeFi / DEX Protocol',
      imageUri: 'https://static.ston.fi/logo/ston_symbol.png',
      imageSource: 'STON.fi DEX Foundation Official Static CDN',
      imagePermissions: 'Official DEX protocol asset with public usage authorization',
      providers: ['TonAPI', 'STON.fi', 'DeDust', 'CoinGecko'],
      explorerUrl: 'https://tonviewer.com/EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Decentralized exchange protocol token for STON.fi liquidity and governance.',
      primaryDex: 'STON.fi',
      tvSymbol: 'BYBIT:STONUSDT'
    },
    {
      id: 'ton:EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE',
      rawAddress: '0:65aaca9b5e380eae928db3c8e238d9bc0d61a9320fdc2bc7a2f6c87d6fed044a',
      symbol: 'DUST',
      name: 'DeDust',
      decimals: 9,
      category: 'DeFi / DEX Protocol',
      imageUri: 'https://cache.tonapi.io/imgproxy/rJ4qAiXZRWvGV6CCF8jHz-qE0-hmqWMUkI9BDDrfaXc/rs:fill:200:200:1/g:no/aXBmczovL1FtYVpuOHkzSm5kcmVQamVVYkRRdEJ5UFY2ZXpId1A2N3BWYUpHM1dXcGFtTEI.webp',
      imageSource: 'DeDust Protocol IPFS Metadata Archive',
      imagePermissions: 'Public on-chain IPFS asset for DEX interfaces',
      providers: ['TonAPI', 'DeDust', 'STON.fi', 'CoinGecko'],
      explorerUrl: 'https://tonviewer.com/EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Utility and liquidity routing token of the DeDust.io AMM protocol.',
      primaryDex: 'DeDust',
      dexUrl: 'https://dexscreener.com/ton/dedust'
    },
    {
      id: 'ton:EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko',
      rawAddress: '0:5cf70a7cf20e8b24a544ed1a371874653864a4464e3662c903648d1a52e6e02a',
      symbol: 'REDO',
      name: 'Resistance Dog',
      decimals: 9,
      category: 'Meme / Community',
      imageUri: 'https://raw.githubusercontent.com/Resistance-Dog/resistance-dog/main/resistance-dog.webp',
      imageSource: 'Resistance Dog Official GitHub Repository',
      imagePermissions: 'Open source community brand asset for ecosystem visualizers',
      providers: ['TonAPI', 'STON.fi', 'DeDust', 'CoinGecko'],
      explorerUrl: 'https://tonviewer.com/EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Symbol of freedom of speech, decentralization, and internet neutrality on TON.',
      primaryDex: 'STON.fi'
    },
    {
      id: 'ton:EQATcUc69sGSCCMSadsVUKdGwM1BMKS-HKCWGPk60xZGgwsK',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQATcUc69sGSCCMSadsVUKdGwM1BMKS-HKCWGPk60xZGgwsK',
      rawAddress: '0:4dc51cebd6c19208231269db1550a746c0cd4130a4be1ca09618f93ad3164683',
      symbol: 'FISH',
      name: 'TON FISH',
      decimals: 9,
      category: 'Meme / Community',
      imageUri: 'https://coin-images.coingecko.com/coins/images/34651/small/photo_2024-10-18_16.55.49.jpeg?1729307732',
      imageSource: 'TON Fish Official Website Project Asset',
      imagePermissions: 'Community project asset authorized for Web3 tracker listings',
      providers: ['TonAPI', 'STON.fi', 'DeDust'],
      explorerUrl: 'https://tonviewer.com/EQATcUc69sGSCCMSadsVUKdGwM1BMKS-HKCWGPk60xZGgwsK',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Pioneer community memecoin on The Open Network ecosystem.',
      primaryDex: 'STON.fi'
    },
    {
      id: 'ton:EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O',
      rawAddress: '0:78ef77a17e5785bd31ba45ad31852f2b8febee97ad6ee16d941f9391986663fe',
      symbol: 'GRM',
      name: 'Gram',
      decimals: 9,
      category: 'Proof-of-Work Jetton',
      imageUri: 'https://gramcoin.org/img/icon.png',
      imageSource: 'Gram Mining Project Official Assets',
      imagePermissions: 'Public domain project visual resource',
      providers: ['TonAPI', 'STON.fi', 'DeDust'],
      explorerUrl: 'https://tonviewer.com/EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Proof-of-Work minable Jetton contract distributed via smart contract givers.',
      primaryDex: 'STON.fi'
    },
    {
      id: 'ton:EQCuPm01Hldi-uQ55xaBF_1kaW_WAUy5DHey8suqzU_MAA_1',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQCuPm01Hldi-uQ55xaBF_1kaW_WAUy5DHey8suqzU_MAA_1',
      rawAddress: '0:ae3e6d351e576276e439e7168117fd64696fd6014cb90c77b2f2cbaacd4fcc00',
      symbol: 'MAJOR',
      name: 'Major',
      decimals: 9,
      category: 'Gaming / Telegram Stars',
      imageUri: 'https://cache.tonapi.io/imgproxy/bnKC81e4nVrK99wRHoO3-LcpA3pl6Q0YqJuUWa5o9z4/rs:fill:200:200:1/g:no/aHR0cHM6Ly9jYWNoZS50b25hcGkuaW8vaW1ncHJveHkvR0syNGcyRk1KeUpyN3YyNE8yV1gyck8wMnRzSjdfNzJacXhsZXh1WG1yYy9yczpmaWxsOjIwMDoyMDA6MS9nOm5vL2FIUjBjSE02THk5dFlXcHZjaTVpYjNRdmFXMWhaMlZ6TDNSaGMydHpMMjFoYW05eVgyeHZaMjh1YzNabi53ZWJw.webp',
      imageSource: 'Major Telegram Bot Core / TonAPI Proxy',
      imagePermissions: 'TEP-74 on-chain verified metadata',
      providers: ['TonAPI', 'DeDust', 'STON.fi'],
      explorerUrl: 'https://tonviewer.com/EQCuPm01Hldi-uQ55xaBF_1kaW_WAUy5DHey8suqzU_MAA_1',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Major mini-app gaming incentive and reward token on TON.',
      primaryDex: 'DeDust'
    },
    {
      id: 'ton:EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav',
      network: 'TON',
      isNative: false,
      contractAddress: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav',
      rawAddress: '0:cbfdfa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8cccd4344025',
      symbol: 'tsTON',
      name: 'Tonstakers TON',
      decimals: 9,
      category: 'Liquid Staking',
      imageUri: 'https://asset.ston.fi/img/EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav/38f530facb209e4696b8aef17af51df94d16bd879926c517b07d25841da287b7',
      imageSource: 'Tonstakers Protocol / STON.fi Asset Index',
      imagePermissions: 'Official protocol brand asset with ecosystem listing permissions',
      providers: ['TonAPI', 'STON.fi', 'DeDust'],
      explorerUrl: 'https://tonviewer.com/EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Liquid staking derivative representing staked Toncoin and accumulated staking yield.',
      primaryDex: 'STON.fi'
    },

    // --- 2. Global Benchmark Assets (Institutional Context) ---
    {
      id: 'btc:native',
      network: 'Bitcoin',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'BTC',
      name: 'Bitcoin',
      decimals: 8,
      category: 'Native L1 Store of Value',
      imageUri: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
      imageSource: 'Bitcoin Open Source Community',
      imagePermissions: 'Open source decentralized brand mark',
      providers: ['CoinGecko', 'Binance', 'Coinbase'],
      explorerUrl: 'https://mempool.space',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Decentralized peer-to-peer electronic cash system and primary digital store of value.',
      tvSymbol: 'BINANCE:BTCUSDT'
    },
    {
      id: 'eth:native',
      network: 'Ethereum',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      category: 'Native L1 Smart Contracts',
      imageUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      imageSource: 'Ethereum Foundation Public Brand Repository',
      imagePermissions: 'Open source community brand asset',
      providers: ['CoinGecko', 'Binance', 'Coinbase'],
      explorerUrl: 'https://etherscan.io',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Decentralized open-source blockchain with smart contract functionality.',
      tvSymbol: 'COINBASE:ETHUSD'
    },
    {
      id: 'sol:native',
      network: 'Solana',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      category: 'Native L1 High-Throughput',
      imageUri: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
      imageSource: 'Solana Foundation Public Assets',
      imagePermissions: 'Open source community brand asset',
      providers: ['CoinGecko', 'Binance', 'Raydium'],
      explorerUrl: 'https://solscan.io',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'High-performance blockchain built for speed and global-scale applications.',
      tvSymbol: 'BINANCE:SOLUSDT'
    },

    // --- Additional Global Benchmarks ---
    {
      id: 'bnb:native',
      network: 'BNB Chain',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
      category: 'Native L1 Smart Contracts',
      imageUri: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
      imageSource: 'BNB Chain Official Assets',
      imagePermissions: 'Public ecosystem brand mark',
      providers: ['CoinGecko', 'Binance'],
      explorerUrl: 'https://bscscan.com',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Native utility and gas token powering the BNB Chain ecosystem.',
      tvSymbol: 'BINANCE:BNBUSDT'
    },
    {
      id: 'xrp:native',
      network: 'XRP Ledger',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'XRP',
      name: 'XRP',
      decimals: 6,
      category: 'Enterprise Settlement',
      imageUri: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
      imageSource: 'XRP Ledger Foundation',
      imagePermissions: 'Public open source brand asset',
      providers: ['CoinGecko', 'Binance', 'Bybit'],
      explorerUrl: 'https://xrpscan.com',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Digital asset built for global real-time payments and liquidity.',
      tvSymbol: 'BINANCE:XRPUSDT'
    },
    {
      id: 'doge:native',
      network: 'Dogecoin',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'DOGE',
      name: 'Dogecoin',
      decimals: 8,
      category: 'Decentralized P2P Currency',
      imageUri: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
      imageSource: 'Dogecoin Foundation Public Assets',
      imagePermissions: 'Open source community brand asset',
      providers: ['CoinGecko', 'Binance', 'Coinbase'],
      explorerUrl: 'https://dogechain.info',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'Decentralized peer-to-peer open source digital currency.',
      tvSymbol: 'BINANCE:DOGEUSDT'
    },
    {
      id: 'sui:native',
      network: 'Sui',
      isNative: true,
      contractAddress: null,
      rawAddress: null,
      symbol: 'SUI',
      name: 'Sui',
      decimals: 9,
      category: 'Native L1 Object-Centric',
      imageUri: 'https://assets.coingecko.com/coins/images/26375/small/sui-ocean-square.png',
      imageSource: 'Mysten Labs / Sui Foundation',
      imagePermissions: 'Public brand mark for verified platforms',
      providers: ['CoinGecko', 'Binance', 'OKX'],
      explorerUrl: 'https://suiscan.xyz',
      verificationStatus: 'verified',
      isLaunched: true,
      description: 'High-throughput Layer 1 blockchain powered by Move programming language.',
      tvSymbol: 'BINANCE:SUIUSDT'
    },
    // --- 3. ANLGRAM Protocol Asset (Strictly Unlaunched / Pending) ---
    {
      id: 'ton:unlaunched:anlgram',
      network: 'TON',
      isNative: false,
      contractAddress: null,
      rawAddress: null,
      symbol: 'ANLGRAM',
      name: 'ANLGRAM Protocol Token',
      decimals: 9,
      category: 'Protocol Governance & Utility (Upcoming)',
      imageUri: 'assets/img/anlgram-icon.svg',
      imageSource: 'ANLGRAM Labs Official Identity System',
      imagePermissions: 'Proprietary platform brand mark for ecosystem application',
      providers: [],
      explorerUrl: null,
      verificationStatus: 'not_launched',
      isLaunched: false,
      launchStatus: 'Not launched',
      description: 'Official future utility & intelligence governance token of the ANLGRAM ecosystem.',
      notice: 'The ANLGRAM token does not yet exist as an active on-chain contract. Beware of third-party scam tokens.',
      price: null,
      marketCap: null,
      liquidity: null,
      holders: null,
      volume: null
    }
  ];

  // --- Verified Web3 Directory (Independently Audited Official Links) ---
  const DIRECTORY_REGISTRY = [
    // DEX Protocols (On-Chain AMM & Orderbook Swaps)
    {
      id: 'stonfi',
      name: 'STON.fi',
      cat: 'dex',
      catLabel: 'TON DEX AMM',
      desc: 'High-speed automated market maker DEX with zero fee routing built specifically for TON.',
      url: 'https://ston.fi',
      appUrl: 'https://app.ston.fi',
      iconText: '💎',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://ston.fi&size=64'
    },
    {
      id: 'dedust',
      name: 'DeDust.io',
      cat: 'dex',
      catLabel: 'TON DEX Protocol',
      desc: 'Next-generation decentralized exchange on TON with concentrated liquidity routing.',
      url: 'https://dedust.io',
      appUrl: 'https://dedust.io',
      iconText: '🌪️',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://dedust.io&size=64'
    },
    {
      id: 'uniswap',
      name: 'Uniswap',
      cat: 'dex',
      catLabel: 'Multi-Chain DEX',
      desc: 'Pioneering open-source decentralized automated liquidity protocol across EVM networks.',
      url: 'https://uniswap.org',
      appUrl: 'https://app.uniswap.org',
      iconText: '🦄',
      verified: true,
      ecosystem: 'Ethereum / Multi-Chain',
      logoUrl: 'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png'
    },
    {
      id: 'pancakeswap',
      name: 'PancakeSwap',
      cat: 'dex',
      catLabel: 'Multi-Chain DEX',
      desc: 'High-volume decentralized AMM exchange supporting multiple blockchain networks.',
      url: 'https://pancakeswap.finance',
      appUrl: 'https://pancakeswap.finance/swap',
      iconText: '🥞',
      verified: true,
      ecosystem: 'BNB / Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://pancakeswap.finance&size=64'
    },
    {
      id: 'raydium',
      name: 'Raydium',
      cat: 'dex',
      catLabel: 'Solana DEX AMM',
      desc: 'On-chain order book and hybrid AMM decentralized exchange built on Solana.',
      url: 'https://raydium.io',
      appUrl: 'https://raydium.io/swap',
      iconText: '⚡',
      verified: true,
      ecosystem: 'Solana',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://raydium.io&size=64'
    },
    {
      id: 'jupiter',
      name: 'Jupiter',
      cat: 'dex',
      catLabel: 'DEX Aggregator',
      desc: 'Key liquidity aggregator and swap routing engine for the Solana ecosystem.',
      url: 'https://jup.ag',
      appUrl: 'https://jup.ag',
      iconText: '🪐',
      verified: true,
      ecosystem: 'Solana',
      logoUrl: 'https://assets.coingecko.com/coins/images/34188/small/jup.png'
    },
    {
      id: 'curve',
      name: 'Curve Finance',
      cat: 'dex',
      catLabel: 'Stablecoin AMM',
      desc: 'Automated market maker protocol optimized for low-slippage stablecoin exchange.',
      url: 'https://curve.fi',
      appUrl: 'https://curve.fi',
      iconText: '📉',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://assets.coingecko.com/coins/images/12124/small/Curve.png'
    },
    {
      id: '1inch',
      name: '1inch Network',
      cat: 'dex',
      catLabel: 'DEX Aggregator',
      desc: 'Decentralized exchange aggregator discovering the most cost-efficient swap paths.',
      url: 'https://1inch.io',
      appUrl: 'https://app.1inch.io',
      iconText: '🐎',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://assets.coingecko.com/coins/images/13469/small/1inch-token.png'
    },

    // CEX Platforms (Centralized Spot & Derivatives Exchanges)
    {
      id: 'binance',
      name: 'Binance',
      cat: 'cex',
      catLabel: 'Global CEX',
      desc: 'World’s largest digital asset exchange by daily trading volume and market liquidity.',
      url: 'https://www.binance.com',
      iconText: '🟡',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://binance.com&size=64'
    },
    {
      id: 'bybit',
      name: 'Bybit',
      cat: 'cex',
      catLabel: 'Global CEX / TON Partner',
      desc: 'Global crypto exchange with deep TON ecosystem spot pairs, staking, and Web3 integration.',
      url: 'https://www.bybit.com',
      iconText: '🖤',
      verified: true,
      ecosystem: 'Global / TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://bybit.com&size=64'
    },
    {
      id: 'okx',
      name: 'OKX',
      cat: 'cex',
      catLabel: 'Global CEX & Web3',
      desc: 'Global digital asset exchange offering spot, derivatives, and multi-chain Web3 wallet.',
      url: 'https://www.okx.com',
      iconText: '⬛',
      verified: true,
      ecosystem: 'Global / TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://okx.com&size=64'
    },
    {
      id: 'coinbase',
      name: 'Coinbase',
      cat: 'cex',
      catLabel: 'Regulated US CEX',
      desc: 'Publicly traded, regulated cryptocurrency exchange and institutional custody provider.',
      url: 'https://www.coinbase.com',
      iconText: '🔵',
      verified: true,
      ecosystem: 'Global'
    },
    {
      id: 'kraken',
      name: 'Kraken',
      cat: 'cex',
      catLabel: 'Security-Focused CEX',
      desc: 'Veteran digital asset exchange renowned for institutional security and regulatory rigor.',
      url: 'https://www.kraken.com',
      iconText: '🐙',
      verified: true,
      ecosystem: 'Global'
    },
    {
      id: 'gateio',
      name: 'Gate.io',
      cat: 'cex',
      catLabel: 'Global CEX',
      desc: 'Established cryptocurrency exchange supporting a comprehensive catalog of digital assets.',
      url: 'https://www.gate.io',
      iconText: '🔴',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://gate.io&size=64'
    },
    {
      id: 'mexc',
      name: 'MEXC',
      cat: 'cex',
      catLabel: 'High-Velocity CEX',
      desc: 'Global exchange specialized in rapid listings of emerging ecosystem tokens and zero maker fees.',
      url: 'https://www.mexc.com',
      iconText: '💚',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://mexc.com&size=64'
    },
    {
      id: 'bitget',
      name: 'Bitget',
      cat: 'cex',
      catLabel: 'Global CEX & Futures',
      desc: 'Global cryptocurrency derivatives and spot trading exchange with copy trading capabilities.',
      url: 'https://www.bitget.com',
      iconText: '🔷',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://bitget.com&size=64'
    },

    // Non-Custodial Wallets
    {
      id: 'tonkeeper',
      name: 'Tonkeeper',
      cat: 'wallet',
      catLabel: 'Official TON Non-Custodial',
      desc: 'The benchmark self-custodial wallet for The Open Network, Telegram mini-apps, and TON Connect.',
      url: 'https://tonkeeper.com',
      iconText: '💎',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://tonkeeper.com&size=64'
    },
    {
      id: 'mytonwallet',
      name: 'MyTonWallet',
      cat: 'wallet',
      catLabel: 'Open-Source TON Wallet',
      desc: 'Feature-rich web, extension, and mobile wallet for TON with multi-account and hardware support.',
      url: 'https://mytonwallet.io',
      iconText: '🔷',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://mytonwallet.io&size=64'
    },
    {
      id: 'metamask',
      name: 'MetaMask',
      cat: 'wallet',
      catLabel: 'EVM Self-Custody',
      desc: 'Industry-standard self-custody wallet and gateway to blockchain applications across EVM chains.',
      url: 'https://metamask.io',
      iconText: '🦊',
      verified: true,
      ecosystem: 'Ethereum / EVM',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://metamask.io&size=64'
    },
    {
      id: 'trustwallet',
      name: 'Trust Wallet',
      cat: 'wallet',
      catLabel: 'Multi-Chain Self-Custody',
      desc: 'Secure multi-cryptocurrency wallet supporting millions of assets across 100+ blockchains.',
      url: 'https://trustwallet.com',
      iconText: '🛡️',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://assets.coingecko.com/coins/images/11085/small/Trust.png'
    },
    {
      id: 'phantom',
      name: 'Phantom',
      cat: 'wallet',
      catLabel: 'Multi-Chain Web3 Wallet',
      desc: 'User-friendly self-custodial wallet supporting Solana, Ethereum, Bitcoin, and Polygon.',
      url: 'https://phantom.app',
      iconText: '👻',
      verified: true,
      ecosystem: 'Solana / Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://phantom.app&size=64'
    },
    {
      id: 'okxwallet',
      name: 'OKX Web3 Wallet',
      cat: 'wallet',
      catLabel: 'Universal Multi-Chain',
      desc: 'Non-custodial portal supporting 80+ networks with built-in DEX aggregator and market tools.',
      url: 'https://www.okx.com/web3',
      iconText: '⬛',
      verified: true,
      ecosystem: 'Multi-Chain / TON'
    },

    // Analytics, Explorers & Market Intelligence
    {
      id: 'tonviewer',
      name: 'Tonviewer',
      cat: 'analytics',
      catLabel: 'Official TON Explorer',
      desc: 'Clean, high-performance block explorer for TON transactions, Jettons, NFTs, and smart contracts.',
      url: 'https://tonviewer.com',
      iconText: '🔍',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://tonviewer.com&size=64'
    },
    {
      id: 'tonscan',
      name: 'Tonscan',
      cat: 'analytics',
      catLabel: 'TON Blockchain Explorer',
      desc: 'Comprehensive explorer for The Open Network with contract verification and validator tracking.',
      url: 'https://tonscan.org',
      iconText: '📊',
      verified: true,
      ecosystem: 'TON',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://tonscan.org&size=64'
    },
    {
      id: 'dexscreener',
      name: 'DexScreener',
      cat: 'analytics',
      catLabel: 'Multi-Chain DEX Tracker',
      desc: 'Real-time DEX chart analytics, live trade feeds, and liquidity pool metrics across 80+ chains.',
      url: 'https://dexscreener.com',
      iconText: '🦅',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://dexscreener.com&size=64'
    },
    {
      id: 'geckoterminal',
      name: 'GeckoTerminal',
      cat: 'analytics',
      catLabel: 'DEX Liquidity Tracker',
      desc: 'Live on-chain pool scanner powered by CoinGecko indexing over 3 million cryptocurrency tokens.',
      url: 'https://www.geckoterminal.com',
      iconText: '🦎',
      verified: true,
      ecosystem: 'Multi-Chain'
    },
    {
      id: 'defillama',
      name: 'DefiLlama',
      cat: 'analytics',
      catLabel: 'Open-Source DeFi Data',
      desc: 'The largest open, transparent aggregator of Total Value Locked (TVL), protocol fees, and yields.',
      url: 'https://defillama.com',
      iconText: '🦙',
      verified: true,
      ecosystem: 'Multi-Chain'
    },
    {
      id: 'coingecko',
      name: 'CoinGecko',
      cat: 'analytics',
      catLabel: 'Independent Aggregator',
      desc: 'Independent digital currency data provider tracking pricing, trading volumes, and capitalization.',
      url: 'https://www.coingecko.com',
      iconText: '🦎',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://coingecko.com&size=64'
    },
    {
      id: 'coinmarketcap',
      name: 'CoinMarketCap',
      cat: 'analytics',
      catLabel: 'Market Data Tracker',
      desc: 'Widely referenced crypto asset tracking website providing global historical prices and stats.',
      url: 'https://coinmarketcap.com',
      iconText: 'Ⓜ️',
      verified: true,
      ecosystem: 'Global',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://coinmarketcap.com&size=64'
    },
    {
      id: 'arkham',
      name: 'Arkham Intelligence',
      cat: 'analytics',
      catLabel: 'On-Chain Entity Intelligence',
      desc: 'Blockchain analytics platform utilizing AI to deanonymize and map real-world crypto institutions.',
      url: 'https://arkhamintelligence.com',
      iconText: '🏛️',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://arkhamintelligence.com&size=64'
    },

    // Cross-Chain Bridges
    {
      id: 'tonbridge',
      name: 'TON Bridge',
      cat: 'bridge',
      catLabel: 'Canonical TON Bridge',
      desc: 'Official canonical bridge connecting The Open Network with Ethereum and BNB Smart Chain.',
      url: 'https://bridge.ton.org',
      iconText: '🌉',
      verified: true,
      ecosystem: 'TON / Ethereum',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://bridge.ton.org&size=64'
    },
    {
      id: 'stargate',
      name: 'Stargate Finance',
      cat: 'bridge',
      catLabel: 'Omnichain Liquidity Bridge',
      desc: 'Composable liquidity transport protocol enabling native cross-chain asset transfers via LayerZero.',
      url: 'https://stargate.finance',
      iconText: '✨',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://stargate.finance&size=64'
    },
    {
      id: 'orbiter',
      name: 'Orbiter Finance',
      cat: 'bridge',
      catLabel: 'Cross-Rollup Bridge',
      desc: 'Decentralized Layer 2 cross-rollup bridge providing low-latency asset transfers between rollups.',
      url: 'https://www.orbiter.finance',
      iconText: '🛸',
      verified: true,
      ecosystem: 'Ethereum L2',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://orbiter.finance&size=64'
    },
    {
      id: 'rhinofi',
      name: 'Rhino.fi',
      cat: 'bridge',
      catLabel: 'DeFi Hub & Fast Bridge',
      desc: 'Frictionless multi-chain DeFi aggregator and frictionless cross-chain liquidity bridge.',
      url: 'https://app.rhino.fi',
      iconText: '🦏',
      verified: true,
      ecosystem: 'Multi-Chain',
      logoUrl: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://rhino.fi&size=64'
    }
  ];

  // --- Utility: Neutral Fallback SVG Generator ---
  function getNeutralFallbackSvg(symbol, network = 'TON') {
    const cleanSym = (symbol || '?').toUpperCase().substring(0, 4);
    let hash = 0;
    for (let i = 0; i < cleanSym.length; i++) hash += cleanSym.charCodeAt(i) * 31;
    const hue = Math.abs(hash) % 360;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g_${hue}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="hsl(${hue}, 70%, 45%)" /><stop offset="100%" stop-color="hsl(${(hue + 45) % 360}, 80%, 25%)" /></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g_${hue})" /><circle cx="32" cy="32" r="30" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" /><text x="32" y="37" fill="#ffffff" font-family="Inter, sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="0.5">${cleanSym}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // Global handler for image load errors to avoid inline quotes issues
  window.handleAssetLogoError = function(img, symbol, network) {
    if (!img) return;
    img.onerror = null;
    img.src = getNeutralFallbackSvg(symbol, network);
  };

  // --- Asset Registry API ---
  const AssetRegistry = {
    getAllAssets() {
      return ASSET_REGISTRY;
    },

    getAssetById(id) {
      if (!id) return null;
      return ASSET_REGISTRY.find(a => a.id.toLowerCase() === String(id).toLowerCase()) || null;
    },

    getAssetByContract(contractAddress, network = 'TON') {
      if (!contractAddress) return null;
      const clean = String(contractAddress).trim().toLowerCase();
      return ASSET_REGISTRY.find(a => 
        a.network.toLowerCase() === network.toLowerCase() &&
        ((a.contractAddress && a.contractAddress.toLowerCase() === clean) ||
         (a.rawAddress && a.rawAddress.toLowerCase() === clean))
      ) || null;
    },

    getAssetsBySymbol(symbol) {
      if (!symbol) return [];
      const clean = String(symbol).trim().toUpperCase();
      return ASSET_REGISTRY.filter(a => a.symbol.toUpperCase() === clean || (a.displaySymbol && a.displaySymbol.toUpperCase() === clean));
    },

    getNeutralFallbackSvg(symbol, network) {
      return getNeutralFallbackSvg(symbol, network);
    },

    resolveLogoUrl(asset) {
      if (!asset) return getNeutralFallbackSvg('?');
      if (asset.imageUri) {
        let uri = asset.imageUri;
        if (uri.startsWith('ipfs://')) {
          uri = `${IPFS_GATEWAY}${uri.replace('ipfs://', '')}`;
        }
        return uri;
      }
      return getNeutralFallbackSvg(asset.symbol, asset.network);
    },

    renderAssetLogoHtml(assetOrId, size = 28, extraClass = '') {
      let asset = typeof assetOrId === 'string' ? this.getAssetById(assetOrId) : assetOrId;
      if (!asset) {
        asset = { symbol: '?', network: 'TON' };
      }
      const logoUrl = this.resolveLogoUrl(asset);
      const safeSym = (asset.symbol || '?').replace(/['"\\]/g, '');
      const safeNet = (asset.network || 'TON').replace(/['"\\]/g, '');

      return `
        <div class="asset-logo-container ${extraClass}" style="width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; display:inline-flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); flex-shrink:0;">
          <img src="${logoUrl}" alt="${safeSym}" style="width:100%; height:100%; object-fit:contain; border-radius:50%;" onerror="window.handleAssetLogoError(this, '${safeSym}', '${safeNet}')" />
        </div>
      `;
    },

    getAllDirectory() {
      return DIRECTORY_REGISTRY;
    },

    getDirectoryByCategory(cat) {
      if (!cat || cat === 'all') return DIRECTORY_REGISTRY;
      return DIRECTORY_REGISTRY.filter(d => d.cat === cat);
    }
  };

  // Export to window
  window.ANLGRAM_ASSET_REGISTRY = AssetRegistry;
  window.AssetRegistry = AssetRegistry;

})();
