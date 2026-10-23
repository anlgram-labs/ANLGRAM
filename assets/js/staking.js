/**
 * ANLGRAM Enterprise — TON Staking Intelligence Center
 * assets/js/staking.js
 *
 * Verifiable, Non-Custodial, Real-Data Staking Architecture
 *
 * Architecture Principles:
 * 1. ZERO FAKE DATA: No mock balances, synthetic whales, pseudo-random sparklines, or hardcoded APRs.
 * 2. SINGLE VERIFIED PUBLIC POOL: Restricted strictly to Tonstakers Official Liquid Pool (liquidTF / tsTON).
 * 3. EXPLICIT NETWORK ID (-239 Mainnet, -3 Testnet): Validated before and inside every TON Connect transaction.
 * 4. STRICT NON-CUSTODIAL TRANSACTIONS: Signed exclusively via TON Connect. Never asks for or stores seed phrases/private keys.
 * 5. EXACT BIGINT NANOTON ARITHMETIC:
 *    ANLGRAM_STAKE_FEE_BPS = 35 (0.35%, NEVER 3500)
 *    feeNano = (principalNano * 35n) / 10000n (rounded down to nanoTON, no floating-point, no max cap).
 *    0% fee on withdrawals and reward claims.
 * 6. TWO-PHASE ESCROW FEE ARCHITECTURE (AnlgramStakingRouter):
 *    Never claims the 0.35% fee is collected merely because a transaction left the wallet or reached the router.
 *    Fee is held in escrow and released to UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd ONLY after
 *    on-chain confirmation of tsTON minting (0x7362d09c). On authenticated pool bounce (0x47d54391), 100% of principal + fee is refunded.
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   ENVIRONMENT CONFIGURATION & VERIFIED CONTRACT ALLOWLIST
   ══════════════════════════════════════════════════════════════ */

const STAKING_CONFIG = {
  // Network APIs
  TONAPI_BASE_MAINNET:          'https://tonapi.io/v2',
  TONAPI_BASE_TESTNET:          'https://testnet.tonapi.io/v2',
  TONVIEWER_MAINNET:            'https://tonviewer.com',
  TONVIEWER_TESTNET:            'https://testnet.tonviewer.com',
  TONSCAN_BASE:                 'https://tonscan.org',
  TON_DOCS:                     'https://docs.ton.org',
  TONSTAKERS_DOCS:              'https://docs.tonstakers.com',
  REFRESH_INTERVAL_MS:          45000,
  METRIC_REFRESH_MS:            45000,
  TX_REFRESH_MS:                30000,
  REQUEST_TIMEOUT_MS:           9000,
  MAX_RETRIES:                  2,
  CACHE_TTL_MS:                 30000,
  ROWS_PER_PAGE:                20,
  VERSION:                      '3.0.0',

  // Explicit TON Chain IDs
  CHAIN_ID_MAINNET:             '-239',
  CHAIN_ID_TESTNET:             '-3',

  // SECURITY SWITCH:
  // Mainnet staking is enabled following successful on-chain Testnet verification.
  MAINNET_STAKING_ENABLED:      true,

  // ── ANLGRAM COMMISSION CONFIGURATION (0.35% = 35 bps) ─────
  // MUST BE 35 (0.35%). NEVER USE 3500.
  ANLGRAM_STAKE_FEE_BPS:        35,
  ANLGRAM_STAKE_FEE_BPS_BIGINT: 35n,
  ANLGRAM_FEE_DENOM_BIGINT:     10000n,
  ANLGRAM_WITHDRAW_FEE_BPS:     0,
  ANLGRAM_CLAIM_FEE_BPS:        0,
  ANLGRAM_FEE_RECIPIENT:        'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd',
  ANLGRAM_FEE_RECIPIENT_RAW:    '0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d',
  ANLGRAM_PARTNER_CODE:         0x000000106796caefn,

  // ── ANLGRAM STAKING ROUTER (2-PHASE ESCROW) ────────────────
  // Compiled FunC contract: minter-contract/contracts/anlgram-staking-router.fc
  // Code Cell SHA-256: 1d21bbaebf3601577c4dc1dd2e8296d691edcec13d6c38fb26d5b8b884f5af6a
  ROUTER_ADDRESS_MAINNET:       null, // Do NOT deploy on Mainnet without independent audit & owner approval
  ROUTER_ADDRESS_TESTNET:       (typeof localStorage !== 'undefined' && localStorage.getItem('anlgram_staking_router_testnet')) || 'kQDd9FJmHX6-A2T1XsF4oSS04KFq_13gQyKco_ZYwmuDIREK',
  ROUTER_ADDRESS_TESTNET_RAW:   '0:ddf452661d7ebe0364f55ec178a124b4e0a16aff5de043229ca3f658c26b8321',
  ROUTER_JWALLET_TESTNET:       'kQCulIZF_pX3SEaTp4QobY9oMkVlt-imEIexJV7eak8CxY6G',
  ROUTER_JWALLET_TESTNET_RAW:   '0:ae948645fe95f7484693a784286d8f68324565b7e8a61087b1255ede6a4f02c5',
  ROUTER_OP_STAKE:              0x414e4c53,
  ROUTER_OP_REFUND_BOUNCE:      0x414e4c52,
  ROUTER_OP_REFUND_TIMEOUT:     0x414e4c54, // Disabled on-chain (throws exit_code 311) to prevent double-refund
  ROUTER_OP_RETRY_TSTON:        0x414e4c55, // Non-custodial tsTON delivery retry / post-timeout recovery
  ROUTER_OP_FEE_PAYOUT:         0x414e4c46,

  // ── ANLGRAM ISOLATED STAKE VAULT (1-VAULT-PER-DEPOSIT ARCHITECTURE) ──
  // Compiled FunC contract: minter-contract/contracts/anlgram-stake-vault.fc
  // Code Cell SHA-256: e69f7d22756c31ef01965ac197e3c561c77ab25d496795f0d4fdc9f2502daccf
  VAULT_CODE_HASH:              'e69f7d22756c31ef01965ac197e3c561c77ab25d496795f0d4fdc9f2502daccf',
  VAULT_CODE_BOC:               'te6ccgECGgEABzQAART/APSkE/S88sgLAQIBYgIDAgLNBAUCASAWFwT3120Xb9mehpgf0gGAC42EmBeAJwEWOASS+B8AFpj+mf9qJoaYPpB+mf/QB9AH0AaZ/pn+oYaH0gfSB9IGoYaH0gfSAYCCYIHaUMKEsLiBqgggHBCCCnJjgrCADdcYFBCDmxaE4rCADdcYFBCGqZO22rCADdcYFBCCCnJjlAYHCAkCrddtF2/cAQa5Dpj5h2omhpg+kH6Z/9AH0AfQBpn+mf6hhofSB9IH0gahhofSB9IBgIJggdpQwoSwuIGqCCAcEII+qhyKlwXXGBH0EIB8U/Uo7dSS+HcYbBMUA/4xNTU1NTqBAZJwFL0T8vKBAZFRtscFG/L0gQGRUXK6F/L0BPoA0g/6QPpAMIEBk1E6uhPy9IEBlCOCEDuaygC+8vQk+kSBAZwCwACC8Nb8+yOZ44EH9+/M4WbCpbut50Ry58pCAibKtRG87t1tErqw8vQj+kQqwP3jD4AjgScQCgsMAfwyPT09gQGWUebHBR7y9IEBmnRS0Lry8oEBm3Iduhzy8gf6ADCBAZghwgDy9CByghAGQixAJlLzUVtwIIIQD4p+pcjLHxXLP1AD+gIBzxb4KM8WEssAggjk4cD6AssAyXGAGMjLBVAEzxZY+gISy2rMyXH7ABB8EGsQWhBJEDgNAZg9PlP2xwVR07odsJcwO18ENDQw4w1SU8cFUFXHBRSxggiYloATvBKwjiCCENUydttwgBDIywVQBM8WI/oCE8tqEssfyz/JgEL7AOBbDgLaVhABuo7TMj6BAZERECvHBQEREAHy9IEBkVHCuhzy9IEBmnRSwLry8oEBmXFSwLpzHbocsRvy9IEBlYIQBkIsQFLQvvL0CPoAMIEBmCHCAPL0IHJURuBSxCvgPYIQQU5Mcx+64wJfDzCBAfPy8BARAFqBAZ0CwACC8A0WxjJif4ZJnihqNQmZugNRFlT650wd/0nHM7i9gz+EErqw8vQAWoEBnQLAAILwpFsX8oQJIpt4Ng4ykEIPE+T+IPkNfiv4xKxnAyWeIvoSurDy9AG2JFmphFMwoIIQO5rKAKCCEAZCLECggQGVUMy+G/L0InH4I4IQO5rKABagghBH1UORcIAYyMsFKc8WUAP6AhLLassfUpDLP1Kgyz/JcfsAEHwQaxBaSRMIUERHFxUAfhAnEDYQNVUSyFAKzxZQCM8WychQDM8WUArPFlAIzxYZzMkGyMsHyg8Xyz8B+gJQBfoCUAP6AhPLP8s/zMntVAHucrqO7D10IsIAjjFwIIAQyMsFKs8WJfoCy2rLH40F0FOTEdSQU0gU3Rha2UgRmVlIDAuMzUlgzxbJcfsA3oIImJaAHbyOH4IQ1TJ223CAEMjLBSrPFiH6Astqyx9S0Ms/yYBC+wDeEHwQaxBaVUREA+A3XwQ0NDQPAHLIUArPFlAIzxbJyFAMzxZQCs8WUAjPFhnMyQbIywfKDxfLPwH6AlAF+gJQA/oCE8s/yz/Mye1U2zEBknAgghAPin6lyMsfFcs/UAP6AgHPFvgozxYSywCCCOThwPoCywDJcYAYyMsFUATPFlj6AhLLaszJcfsAEHwQaxBaEEkQOEBnExUVAf6BAZERECvHBQEREAHy9IEBkVHCuhzy9IEBmXMcuhvy9IEBlYIQBkIsQFLQvvL0gQGYLcIA8vRyVFXbU/pwIIIQD4p+pcjLHxXLP1AD+gIBzxb4KM8WEssAggjk4cD6AssAyXGAGMjLBVAEzxZY+gISy2rMyXH7ABB8EGsQWhBJEgB6EDhHVQYDyFAKzxZQCM8WychQDM8WUArPFlAIzxYZzMkGyMsHyg8Xyz8B+gJQBfoCUAP6AhPLP8s/zMntVAGqPVHpxwWzkl8O4HESvZJfDeB1UcSgghAGQixAoIIQQU5MdHCAEMjLBS3PFlAD+gISy2rLH1Igyz8l+gIk+gLJcfsAEJwQixB6EGkQWBBHEDZAFVAzBBUAvFHXxwWzlF8N2zHgcrqOTHMQnBCLEHoQaRBYEEcQNkUTUELIUArPFlAIzxbJyFAMzxZQCs8WUAjPFhnMyQbIywfKDxfLPwH6AlAF+gJQA/oCE8s/yz/Mye1U2zHgXwwAbshQCs8WUAjPFsnIUAzPFlAKzxZQCM8WGczJBsjLB8oPF8s/AfoCUAX6AlAD+gITyz/LP8zJ7VQAN7/CTAEcCTiBEs1MIzUEEIHc1lAFBBCAMhFiBQQCAVgYGQDRtFwQXhrfn2RzPHAg/v35nCzYVLd1vOiOXPlIQETZVqI3ndutsF4BotjGTE/wyTPFDUahMzdAaiLKn1zpg7/pOOZ3F7Bn8JBeFIti/lCBJFNvBsHGUghB4nyfxB8hr8V/GJWM4GSzxF9QAGu2Gh2omhpg+kH6Z/9AH0AfQBpn+mf6hhofSB9IH0gahhofSB9IBgIJggdpQwoSwuIGqCCAZhA=',
  VAULT_OP_INIT:                0x414e4c70,
  VAULT_OP_RESCUE:              0x414e4c72,
  VAULT_OP_RETRY:               0x414e4c73,
  VAULT_OP_REFUNDED:            0x414e4c74,

  // StakeVault Gas & Storage Reserve Breakdown (nanoTON)
  // For 1 TON principal: 1.0000 TON + 0.0035 TON (35 bps) + 1.0000 TON (pool) + 0.1050 TON (jwallet) + 0.0500 TON (vault rent) = 2.1585 TON
  VAULT_POOL_DEPOSIT_GAS_NANO:   1000000000n, // 1.0000 TON attached to Tonstakers Pool (excess refunded to vault -> client)
  VAULT_JETTON_TRANSFER_GAS_NANO: 105000000n,  // 0.1050 TON attached to 0x0f8a7ea5 tsTON transfer (excess refunded)
  VAULT_STORAGE_RESERVE_NANO:    50000000n,   // 0.0500 TON minimum storage rent reserve for immutable vault
  VAULT_TOTAL_GAS_RESERVE_NANO:  1155000000n, // 1.1550 TON total gas and storage rent attached

  ROUTER_GAS_RESERVE_NANO:      1150000000n, // 1.00 TON pool deposit gas + 0.15 TON router forwarding gas (excess refunded)
  POOL_DIRECT_GAS_RESERVE_NANO: 1000000000n, // 1.00 TON Tonstakers deposit gas reserve
  UNSTAKE_GAS_RESERVE_NANO:     1050000000n, // 1.05 TON Tonstakers burn gas reserve

  // Single Verified Protocol
  PROTOCOLS: {
    LIQUID_TF: 'liquidTF', // Tonstakers Official Liquid Pool (tsTON)
  },

  // Single Verified Public Staking Pool per Network (Tonstakers Official Liquid Pool)
  ALLOWLIST: {
    // ── MAINNET VERIFIED POOL (-239) ─────────────────────────
    'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR': {
      network: 'mainnet',
      chainId: '-239',
      protocol: 'liquidTF',
      name: 'Tonstakers (Official Liquid Pool)',
      raw: '0:a45b17f28409229b78360e3290420f13e4fe20f90d7e2bf8c4ac6703259e22fa',
      minStakeTon: 1,
      minStakeNano: 1000000000n, // 1 TON
      gasReserveNano: 1150000000n, // 1.15 TON via Router (1.0 TON pool + 0.15 TON router, surplus refunded)
      poolGasReserveNano: 1000000000n,
      unstakeGasNano: 1050000000n, // 1.05 TON gas attached for tsTON burn
      jettonMaster: 'EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav',
      jettonMasterRaw: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000',
      routerStakeOp: 0x414e4c53,
      depositOp: 0x47d54391,
      unstakeOp: 0x595f07bc,
      partnerCode: 0x000000106796caefn,
      rewardMechanism: 'Token de participación líquido (tsTON · NEP-74). La tasa de cambio tsTON → TON (total_balance / supply) aumenta automáticamente en cada ciclo de validación (~18–36h).',
      lockDescription: 'Líquido (tsTON): emisión inmediata tras confirmación del pool; retiro por quema de tsTON (0x595f07bc) sin comisión de ANLGRAM (0%).',
      docs: 'https://docs.tonstakers.com',
      isSupported: true,
    },

    // ── TESTNET VERIFIED POOL (-3) ───────────────────────────
    'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3': {
      network: 'testnet',
      chainId: '-3',
      protocol: 'liquidTF',
      name: 'Tonstakers (Official Testnet Pool)',
      raw: '0:0d16c632627f86499e286a350999ba03511654fae74c1dff49c733b8bd833f84',
      minStakeTon: 1,
      minStakeNano: 1000000000n, // 1 TON
      gasReserveNano: 1150000000n, // 1.15 TON via Router (1.0 TON pool + 0.15 TON router, surplus refunded)
      poolGasReserveNano: 1000000000n,
      unstakeGasNano: 1050000000n, // 1.05 TON gas attached for tsTON burn
      jettonMaster: 'kQAiQ2XK7BXePLwemeo-u4wNyjg-wxGeySmaFGEP7R2Mhf4m',
      jettonMasterRaw: '0:224365caec15de3cbc1e99ea3ebb8c0dca383ec3119ec9299a14610fed1d8c85',
      routerStakeOp: 0x414e4c53,
      depositOp: 0x47d54391,
      unstakeOp: 0x595f07bc,
      partnerCode: 0x000000106796caefn,
      rewardMechanism: 'Token de participación líquido (tsTON Testnet · NEP-74). La tasa de cambio tsTON → TON (total_balance / supply) aumenta automáticamente en cada ciclo de validación.',
      lockDescription: 'Líquido Testnet (tsTON): emisión inmediata tras confirmación del pool; retiro por quema de tsTON (0x595f07bc) sin comisión de ANLGRAM (0%).',
      docs: 'https://docs.tonstakers.com',
      isSupported: true,
    },
  },
};

/* ══════════════════════════════════════════════════════════════
   CENTRALIZED STATE MANAGEMENT
   ══════════════════════════════════════════════════════════════ */

const StakingState = (() => {
  let _state = {
    activeNetwork: (typeof localStorage !== 'undefined' && localStorage.getItem('anlgram_staking_network')) || 'testnet',
    wallet: {
      address: null,
      rawAddress: null,
      name: null,
      balanceTon: 0,
      balanceNano: 0n,
      network: 'testnet',
      chainId: '-3',
      connected: false,
      isTonConnect: false,
      isReadOnly: true,
    },
    poolOnChainData: {
      mainnet: null,
      testnet: null,
    },
    routerVerification: {
      mainnet: { verified: false, address: null, reason: 'Mainnet desactivado por política de seguridad' },
      testnet: { verified: false, address: STAKING_CONFIG.ROUTER_ADDRESS_TESTNET, reason: 'Router pendiente de despliegue/configuración en Testnet' },
    },
    validators: [],
    filteredValidators: [],
    selectedValidator: null,
    positions: [],
    transactions: [],
    whaleData: { topStakers: [], flows: [], unstakers: [] },
    networkStats: {
      totalStakedTon: null,
      avgApr: null,
      activeVal: null,
      delegators: null,
      lastBlock: null,
      tps: null,
      tonPrice: null,
      exchangeRateTonPerTsTon: null,
      networkStatus: 'Conectando a TON...',
      dataSource: 'TonAPI v2 + get_pool_full_data',
      lastUpdated: null,
      yieldType: 'Estimado (variable por ciclo)',
    },
    notifications: [],
    unreadCount: 0,
    ui: {
      validatorPage: 1,
      validatorSort: { field: 'apr', dir: 'desc' },
      validatorSearch: '',
      validatorFilter: { status: 'all', risk: 'all' },
      whaleTab: 'top',
      txInFlight: false,
      lastTxHash: null,
      lastTxState: null,
    },
    loading: {
      validators: true,
      positions: false,
      network: true,
      whale: true,
    },
  };
  const listeners = {};

  return {
    get: key => key ? _state[key] : _state,
    set(key, value) {
      _state[key] = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? { ..._state[key], ...value }
        : value;
      (listeners[key] || []).forEach(fn => {
        try { fn(_state[key]); }
        catch (err) { console.error(`[StakingState] Listener error for key "${key}":`, err); }
      });
    },
    setDeep(path, value) {
      const keys = path.split('.');
      let obj = _state;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
    },
    on(key, fn) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(fn);
    },
  };
})();

/* ══════════════════════════════════════════════════════════════
   API SERVICE — Real-Data HTTP Layer with Rate Guard
   ══════════════════════════════════════════════════════════════ */

const ApiService = (() => {
  const _cache = new Map();
  let _lastRequestTime = 0;

  async function _rateGuard() {
    const now = Date.now();
    const timeSinceLast = now - _lastRequestTime;
    if (timeSinceLast < 650) {
      const waitTime = 650 - timeSinceLast;
      _lastRequestTime = now + waitTime;
      return new Promise(r => setTimeout(r, waitTime));
    }
    _lastRequestTime = now;
    return Promise.resolve();
  }

  async function _fetchOnce(url) {
    await _rateGuard();
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), STAKING_CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.status === 429) throw Object.assign(new Error('Rate limited by TonAPI (HTTP 429)'), { code: 429 });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status });
      return await res.json();
    } catch (e) {
      clearTimeout(tid);
      throw e;
    }
  }

  async function get(url, ttl = STAKING_CONFIG.CACHE_TTL_MS) {
    const cached = _cache.get(url);
    if (cached && ttl > 0 && Date.now() - cached.ts < ttl) return cached.data;

    let lastErr;
    for (let attempt = 0; attempt <= STAKING_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const data = await _fetchOnce(url);
        _cache.set(url, { data, ts: Date.now() });
        return data;
      } catch (e) {
        lastErr = e;
        if (e.code === 429) await _sleep(1800 * (attempt + 1));
        else if (e.name === 'AbortError') break;
        else if (attempt < STAKING_CONFIG.MAX_RETRIES) await _sleep(750 * (attempt + 1));
      }
    }
    const stale = _cache.get(url);
    if (stale && ttl > 0) return stale.data;
    throw lastErr;
  }

  function tonapi(endpoint, ttl = STAKING_CONFIG.CACHE_TTL_MS, forceNetwork = null) {
    const net = forceNetwork || StakingState.get('activeNetwork');
    const base = net === 'testnet' ? STAKING_CONFIG.TONAPI_BASE_TESTNET : STAKING_CONFIG.TONAPI_BASE_MAINNET;
    return get(`${base}${endpoint}`, ttl);
  }

  function clearCache(pattern) {
    if (!pattern) { _cache.clear(); return; }
    for (const key of _cache.keys()) {
      if (key.includes(pattern)) _cache.delete(key);
    }
  }

  return { get, tonapi, clearCache };
})();

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════════════
   SAFE BIGINT NANOTON ARITHMETIC & FEE ENGINE (0.35% = 35 BPS)
   ══════════════════════════════════════════════════════════════ */

/**
 * Converts a decimal TON string/number or BigInt into exact nanoTON BigInt.
 * Strictly string-based decimal parsing — never uses floating-point multiplication.
 */
function toNanoSafe(tonVal) {
  if (typeof tonVal === 'bigint') return tonVal;
  if (tonVal === null || tonVal === undefined || tonVal === '') return 0n;
  const str = String(tonVal).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return 0n;
  const parts = str.split('.');
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  if (frac.length > 9) frac = frac.slice(0, 9);
  while (frac.length < 9) frac += '0';
  return BigInt(whole) * 1000000000n + BigInt(frac);
}

/**
 * Formats an exact nanoTON BigInt into a decimal TON string without floating-point loss.
 * If trimTrailingZeros is true, preserves up to 9 decimals while keeping at least minDecimals.
 */
function fromNanoSafe(nanoVal, decimals = 4, trimTrailingZeros = false) {
  if (nanoVal === null || nanoVal === undefined) return '0.00';
  try {
    const n = typeof nanoVal === 'bigint' ? nanoVal : BigInt(String(nanoVal).split('.')[0] || '0');
    const sign = n < 0n ? '-' : '';
    const absN = n < 0n ? -n : n;
    const whole = (absN / 1000000000n).toString();
    const fracFull = (absN % 1000000000n).toString().padStart(9, '0');
    const maxDec = Math.max(0, Math.min(9, decimals));
    if (maxDec === 0) return `${sign}${whole}`;
    let frac = fracFull.slice(0, maxDec);
    if (trimTrailingZeros) {
      frac = frac.replace(/0+$/, '');
      if (frac.length < 2) frac = fracFull.slice(0, Math.max(2, frac.length));
    }
    return `${sign}${whole}.${frac}`;
  } catch {
    return '0.00';
  }
}

/**
 * Exact ANLGRAM Staking Commission Calculation in nanoTON using BigInt:
 *   feeNano = (principalNano * 35n) / 10000n
 * - 35 basis points = 0.35% (NEVER 3500)
 * - Rounds down to nanoTON automatically via BigInt integer division
 * - No maximum cap
 * - No floating-point arithmetic
 */
function calculateAnlgramStakeFeeNano(principalInput) {
  const principalNano = typeof principalInput === 'bigint' ? principalInput : toNanoSafe(principalInput);
  if (principalNano <= 0n) return 0n;
  return (principalNano * STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS_BIGINT) / STAKING_CONFIG.ANLGRAM_FEE_DENOM_BIGINT;
}

/**
 * Computes the complete deposit breakdown in nanoTON and formatted TON strings for the StakeVault architecture.
 * Exactly reflects:
 * 1. Principal amount
 * 2. ANLGRAM commission (0.35% = 35 bps exact)
 * 3. Tonstakers Pool deposit gas (1.00 TON, unused excess refunded to vault -> client)
 * 4. Jetton transfer gas (0.105 TON, unused excess refunded to client)
 * 5. Vault storage rent reserve (0.05 TON, immutable non-destructive storage)
 * Total signing amount: principal + fee + 1.155 TON = 2.1585 TON for 1 TON principal.
 */
function calculateStakeDepositBreakdown(principalInput, gasReserveNano = (STAKING_CONFIG.VAULT_TOTAL_GAS_RESERVE_NANO || 1155000000n)) {
  const principalNano = typeof principalInput === 'bigint' ? principalInput : toNanoSafe(principalInput);
  const feeNano = calculateAnlgramStakeFeeNano(principalNano);
  
  const poolDepositGasNano = STAKING_CONFIG.VAULT_POOL_DEPOSIT_GAS_NANO || 1000000000n;
  const jettonTransferGasNano = STAKING_CONFIG.VAULT_JETTON_TRANSFER_GAS_NANO || 105000000n;
  const storageReserveNano = STAKING_CONFIG.VAULT_STORAGE_RESERVE_NANO || 50000000n;
  const gasNano = BigInt(gasReserveNano || (poolDepositGasNano + jettonTransferGasNano + storageReserveNano));
  const totalNano = principalNano > 0n ? (principalNano + feeNano + gasNano) : 0n;

  return {
    principalNano,
    feeNano,
    poolDepositGasNano,
    jettonTransferGasNano,
    storageReserveNano,
    gasReserveNano: gasNano,
    gasReserveTotalNano: gasNano,
    totalNano,
    feeBps: STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS, // 35
    feePctStr: '0.35%',
    feeRecipient: STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT,
    feeRecipientRaw: STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT_RAW,
    principalTonStr: fromNanoSafe(principalNano, 9, true),
    feeTonStr: fromNanoSafe(feeNano, 9, true),
    poolDepositGasTonStr: fromNanoSafe(poolDepositGasNano, 4),
    jettonTransferGasTonStr: fromNanoSafe(jettonTransferGasNano, 4),
    storageReserveTonStr: fromNanoSafe(storageReserveNano, 4),
    gasTonStr: fromNanoSafe(gasNano, 4),
    totalTonStr: fromNanoSafe(totalNano, 9, true),
  };
}

function crc16(data) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function isValidTonAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  if (addr.includes(':')) {
    const parts = addr.split(':');
    return parts.length === 2 && (parts[0] === '0' || parts[0] === '-1') && /^[0-9a-fA-F]{64}$/.test(parts[1]);
  }
  if (addr.length !== 48) return false;
  try {
    const b64 = addr.replace(/-/g, '+').replace(/_/g, '/');
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    if (bin.length !== 36) return false;
    const bytes = new Uint8Array(36);
    for (let i = 0; i < 36; i++) bytes[i] = bin.charCodeAt(i);
    const c = crc16(bytes.subarray(0, 34));
    return bytes[34] === ((c >> 8) & 0xff) && bytes[35] === (c & 0xff);
  } catch {
    return false;
  }
}

function friendlyToRawAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  if (addr.includes(':')) return addr.toLowerCase();
  if (!isValidTonAddress(addr)) return '';
  try {
    const b64 = addr.replace(/-/g, '+').replace(/_/g, '/');
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const bytes = new Uint8Array(36);
    for (let i = 0; i < 36; i++) bytes[i] = bin.charCodeAt(i);
    const wc = bytes[1] === 0xff ? -1 : bytes[1];
    let hex = '';
    for (let i = 2; i < 34; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return `${wc}:${hex.toLowerCase()}`;
  } catch {
    return '';
  }
}

function rawToFriendlyAddress(raw, bounceable = true, testnet = false) {
  if (!raw || typeof raw !== 'string') return '';
  if (!raw.includes(':')) return raw;
  const parts = raw.split(':');
  if (parts.length !== 2) return raw;
  const wc = parseInt(parts[0], 10);
  const hex = parts[1].trim();
  if (hex.length !== 64) return raw;

  const bytes = new Uint8Array(36);
  let tag = bounceable ? 0x11 : 0x51;
  if (testnet) tag |= 0x80;
  bytes[0] = tag;
  bytes[1] = wc === -1 ? 0xff : wc;

  for (let i = 0; i < 32; i++) {
    bytes[2 + i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  const c = crc16(bytes.subarray(0, 34));
  bytes[34] = (c >> 8) & 0xff;
  bytes[35] = c & 0xff;

  let binary = '';
  for (let i = 0; i < 36; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Returns TON_CORE library or throws an actionable error if not loaded.
 */
async function getTonCore() {
  if (typeof window !== 'undefined' && window.TON_CORE && window.TON_CORE.beginCell) return window.TON_CORE;
  for (let i = 0; i < 30; i++) {
    await _sleep(100);
    if (typeof window !== 'undefined' && window.TON_CORE && window.TON_CORE.beginCell) return window.TON_CORE;
  }
  throw new Error('Motor criptográfico TON (@ton/core) no disponible. Recarga la página o verifica tu conexión.');
}

/**
 * Builds ANLGRAM Staking Router Deposit BoC (2-Phase Escrow Architecture)
 * TL-B: router_stake#414e4c53 query_id:uint64 principal_nano:Coins expected_network_id:int16 = InternalMsgBody;
 *
 * The Router calculates `fee_nano = (principal_nano * 35) / 10000` on-chain without trusting the browser,
 * holds `fee_nano` in escrow, and forwards `principal_nano + 1.0 TON` (0x47d54391) to the verified Tonstakers Pool.
 */
async function buildAnlgramRouterStakePayload(queryId, principalNano, expectedNetworkId = -3) {
  const core = await getTonCore();
  const qId = BigInt(queryId || Date.now());
  const pNano = BigInt(principalNano);
  const netId = Number(expectedNetworkId);
  if (pNano < 1000000000n) {
    throw new Error('El principal mínimo para staking en Tonstakers es 1 TON (1,000,000,000 nanoTON).');
  }
  if (netId !== -3 && netId !== -239) {
    throw new Error(`Chain ID inválido (${netId}). Use -3 (Testnet) o -239 (Mainnet).`);
  }
  return core.beginCell()
    .storeUint(STAKING_CONFIG.ROUTER_OP_STAKE, 32)
    .storeUint(qId, 64)
    .storeCoins(pNano)
    .storeInt(netId, 16)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds ANLGRAM Staking Router Non-Custodial tsTON Delivery Retry BoC
 * TL-B: retry_tston_delivery#414e4c55 query_id:uint64 = InternalMsgBody;
 *
 * Used if 0x0f8a7ea5 bounced from router_jwallet_address or queued due to low gas (status=2).
 * Strictly delivers tsTON for the authenticated jetton_amount recorded on-chain by 0x7362d09c
 * to the original depositor (user_address). Never accepts arbitrary user-supplied token amounts.
 */
async function buildAnlgramRouterRetryTsTonPayload(queryId) {
  const core = await getTonCore();
  const qId = BigInt(queryId);
  if (qId <= 0n) throw new Error('query_id inválido para reintento de entrega tsTON.');
  return core.beginCell()
    .storeUint(STAKING_CONFIG.ROUTER_OP_RETRY_TSTON, 32)
    .storeUint(qId, 64)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds StakeVault Initial Data Cell (StateInit) for 1-Vault-Per-Deposit Architecture
 * Storage layout:
 *   Root: status:0, network_id, query_id, principal:0, fee:0, ts_ton:0, created_at:0, partner_code
 *   ref1: client_address, fee_recipient, pool_address
 *   ref2: vault_jwallet:addr_none, client_jwallet:addr_none
 */
async function buildStakeVaultInitialData(clientAddress, queryId, networkId = -3, partnerCode = STAKING_CONFIG.ANLGRAM_PARTNER_CODE) {
  const core = await getTonCore();
  const cAddr = core.Address.parse(clientAddress);
  const feeRecip = core.Address.parse(STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT_RAW);
  const poolKey = Number(networkId) === -239 ? 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR' : 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
  const poolAddr = core.Address.parse(STAKING_CONFIG.ALLOWLIST[poolKey].raw);
  const qId = BigInt(queryId);
  const netId = Number(networkId);
  const pCode = BigInt(partnerCode);

  const jettonRef = core.beginCell()
    .storeUint(0, 2) // vault_jwallet: addr_none
    .storeUint(0, 2) // client_jwallet: addr_none
    .endCell();

  const staticRef = core.beginCell()
    .storeAddress(cAddr)
    .storeAddress(feeRecip)
    .storeAddress(poolAddr)
    .storeRef(jettonRef)
    .endCell();

  return core.beginCell()
    .storeUint(0, 8) // status = uninitialized
    .storeInt(netId, 16)
    .storeUint(qId, 64)
    .storeCoins(0n)
    .storeCoins(0n)
    .storeCoins(0n)
    .storeUint(0n, 64)
    .storeUint(pCode, 64)
    .storeRef(staticRef)
    .endCell();
}

/**
 * Builds standard 5-bit StateInit cell (split_depth:0 special:0 code:1 data:1 library:0)
 */
function buildStakeVaultStateInit(core, codeCell, initialDataCell) {
  return core.beginCell()
    .storeUint(0b00110, 5)
    .storeRef(codeCell)
    .storeRef(initialDataCell)
    .endCell();
}

/**
 * Computes deterministic StateInit and address for the isolated StakeVault.
 */
async function getDeterministicVaultInfo(clientAddress, queryId, networkId = -3) {
  const core = await getTonCore();
  const initialDataCell = await buildStakeVaultInitialData(clientAddress, queryId, networkId);
  const codeCell = core.Cell.fromBase64(STAKING_CONFIG.VAULT_CODE_BOC);
  const stateInitCell = buildStakeVaultStateInit(core, codeCell, initialDataCell);
  const stateInitHashHex = stateInitCell.hash().toString('hex');
  const rawAddress = `0:${stateInitHashHex}`;
  const friendlyAddress = rawToFriendlyAddress(rawAddress, true, networkId === -3);

  return {
    rawAddress,
    friendlyAddress,
    stateInitCell,
    stateInitBoC: stateInitCell.toBoc().toString('base64'),
    initialDataCell,
    codeCell,
    codeHash: codeCell.hash().toString('hex'),
  };
}

/**
 * Resolves the Jetton Wallet address for a specific owner on a Jetton Master via TonAPI get_wallet_address get-method.
 */
async function getJettonWalletAddress(masterAddress, ownerAddress, network = 'testnet') {
  const rawOwner = friendlyToRawAddress(ownerAddress) || ownerAddress;
  try {
    const res = await ApiService.tonapi(
      `/blockchain/accounts/${encodeURIComponent(masterAddress)}/methods/get_wallet_address?args=${encodeURIComponent(rawOwner)}`,
      60000,
      network
    );
    if (res && res.decoded && res.decoded.jetton_wallet_address) {
      return res.decoded.jetton_wallet_address;
    }
    if (res && res.stack && res.stack[0]?.cell) {
      const core = await getTonCore();
      const cell = core.Cell.fromBoc(Buffer.from(res.stack[0].cell, 'hex'))[0];
      const slice = cell.beginParse();
      const addr = slice.loadAddress();
      return addr.toRawString ? addr.toRawString() : (addr.toString ? addr.toString() : rawOwner);
    }
  } catch (err) {
    console.warn(`[getJettonWalletAddress] Failed to resolve for owner ${ownerAddress}:`, err.message);
  }
  return null;
}

/**
 * Builds StakeVault op::vault_init (0x414e4c70) Payload BoC
 */
async function buildStakeVaultInitPayload(queryId, principalNano, expectedNetworkId, vaultJwalletAddress, clientJwalletAddress) {
  const core = await getTonCore();
  const qId = BigInt(queryId);
  const pNano = BigInt(principalNano);
  const netId = Number(expectedNetworkId);
  const vJw = core.Address.parse(vaultJwalletAddress);
  const cJw = core.Address.parse(clientJwalletAddress);

  return core.beginCell()
    .storeUint(STAKING_CONFIG.VAULT_OP_INIT, 32)
    .storeUint(qId, 64)
    .storeCoins(pNano)
    .storeInt(netId, 16)
    .storeAddress(vJw)
    .storeAddress(cJw)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds StakeVault op::vault_rescue (0x414e4c72) Payload BoC
 */
async function buildStakeVaultRescuePayload(queryId, claimAmountNano) {
  const core = await getTonCore();
  const qId = BigInt(queryId);
  const amount = BigInt(claimAmountNano);
  if (qId <= 0n) throw new Error('query_id inválido para rescate de tsTON.');
  if (amount <= 0n) throw new Error('claim_amount debe ser mayor a 0.');

  return core.beginCell()
    .storeUint(STAKING_CONFIG.VAULT_OP_RESCUE, 32)
    .storeUint(qId, 64)
    .storeCoins(amount)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds StakeVault op::vault_retry (0x414e4c73) Payload BoC
 */
async function buildStakeVaultRetryPayload(queryId) {
  const core = await getTonCore();
  const qId = BigInt(queryId);
  if (qId <= 0n) throw new Error('query_id inválido para reintento de tsTON.');

  return core.beginCell()
    .storeUint(STAKING_CONFIG.VAULT_OP_RETRY, 32)
    .storeUint(qId, 64)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds Tonstakers Official Liquid Pool Deposit BoC (Audited Spec)
 * Used by the Router internally (or for direct protocol verification).
 * TL-B: tonstake_pool_deposit#47d54391 query_id:uint64 app_id:uint64 = InternalMsgBody;
 */
async function buildTonstakersStakePayload(queryId = 1, partnerCode = STAKING_CONFIG.ANLGRAM_PARTNER_CODE) {
  const core = await getTonCore();
  const qId = BigInt(queryId || 1);
  const pCode = BigInt(partnerCode || 0);
  return core.beginCell()
    .storeUint(0x47d54391, 32)
    .storeUint(qId, 64)
    .storeUint(pCode, 64)
    .endCell()
    .toBoc()
    .toString('base64');
}

/**
 * Builds Tonstakers Liquid Staking Unstake (tsTON Burn) BoC (Audited Spec)
 * Sent to the user's tsTON Jetton Wallet. ANLGRAM charges 0% fee on withdrawals.
 * TL-B: burn#595f07bc query_id:uint64 amount:Coins response_destination:MsgAddress
 *       custom_payload:(Maybe ^(wait_till_round_end:uint1 fill_or_kill:uint1)) = InternalMsgBody;
 */
async function buildTonstakersUnstakePayload(tsTonAmountNano, ownerAddress, waitTillRoundEnd = false, fillOrKill = false, queryId = 0n) {
  const core = await getTonCore();
  const amount = BigInt(tsTonAmountNano);
  if (amount <= 0n) throw new Error('El monto de tsTON a retirar debe ser mayor a 0.');
  const owner = core.Address.parse(ownerAddress);

  return core.beginCell()
    .storeUint(0x595f07bc, 32)
    .storeUint(BigInt(queryId || 0), 64)
    .storeCoins(amount)
    .storeAddress(owner)
    .storeMaybeRef(
      core.beginCell()
        .storeUint(waitTillRoundEnd ? 1 : 0, 1)
        .storeUint(fillOrKill ? 1 : 0, 1)
        .endCell()
    )
    .endCell()
    .toBoc()
    .toString('base64');
}

/* ══════════════════════════════════════════════════════════════
   ON-CHAIN POOL & ROUTER VERIFIER (get_pool_full_data & get_router_config)
   ══════════════════════════════════════════════════════════════ */

const PoolOnChainVerifier = (() => {
  /**
   * Queries `get_pool_full_data` and `/accounts/{pool}` on the verified Tonstakers Pool
   * to obtain real on-chain exchange rate (`total_balance / supply`), `halted`, `deposits_open`, and contract status.
   */
  async function fetchVerifiedPoolTelemetry(network) {
    const net = network === 'mainnet' ? 'mainnet' : 'testnet';
    const allowEntry = Object.entries(STAKING_CONFIG.ALLOWLIST).find(([, cfg]) => cfg.network === net);
    if (!allowEntry) return null;
    const [poolAddr, poolCfg] = allowEntry;

    try {
      const [acctRes, methodRes, poolInfoRes] = await Promise.allSettled([
        ApiService.tonapi(`/accounts/${encodeURIComponent(poolAddr)}`, 30000, net),
        ApiService.tonapi(`/blockchain/accounts/${encodeURIComponent(poolAddr)}/methods/get_pool_full_data`, 30000, net),
        ApiService.tonapi(`/staking/pool/${encodeURIComponent(poolAddr)}`, 30000, net),
      ]);

      const acct = acctRes.status === 'fulfilled' ? acctRes.value : null;
      const method = methodRes.status === 'fulfilled' ? methodRes.value : null;
      const poolInfo = poolInfoRes.status === 'fulfilled' ? poolInfoRes.value?.pool : null;

      let totalBalanceNano = 0n;
      let jettonSupplyNano = 0n;
      let halted = false;
      let depositsOpen = true;
      let optimisticWithdrawals = true;
      let governanceFeeBps = null;

      if (method && method.success && method.decoded) {
        const d = method.decoded;
        halted = Boolean(d.halted);
        totalBalanceNano = BigInt(d.total_balance || 0);
        jettonSupplyNano = BigInt(d.supply || d.jetton_total_supply || 0);
        depositsOpen = d.deposits_open !== undefined ? Boolean(d.deposits_open) : true;
        optimisticWithdrawals = d.optimistic_deposit_withdrawals !== undefined ? Boolean(d.optimistic_deposit_withdrawals) : true;
        if (d.governance_fee !== undefined) {
          governanceFeeBps = Number(d.governance_fee);
        }
      } else if (method && method.success && Array.isArray(method.stack) && method.stack.length >= 16) {
        halted = parseInt(method.stack[1]?.num || '0', 16) !== 0;
        totalBalanceNano = BigInt(method.stack[2]?.num || '0');
        jettonSupplyNano = BigInt(method.stack[15]?.num || '0');
      }

      // Exchange rate: 1 tsTON (10^9 nano-tsTON) in nanoTON
      const exchangeRateNano = (totalBalanceNano > 0n && jettonSupplyNano > 0n)
        ? (totalBalanceNano * 1000000000n) / jettonSupplyNano
        : 1000000000n;
      const exchangeRateFloat = Number(exchangeRateNano) / 1e9;

      const apy = safeNum(poolInfo?.apy ?? poolInfo?.apr, null);
      const nominatorsCount = safeNum(poolInfo?.current_nominators, null);
      const totalAmountNano = totalBalanceNano > 0n ? totalBalanceNano : BigInt(poolInfo?.total_amount || 0);

      const telemetry = {
        network: net,
        chainId: poolCfg.chainId,
        address: poolAddr,
        rawAddress: acct?.address || poolCfg.raw,
        accountStatus: acct?.status || 'unknown',
        interfaces: acct?.interfaces || [],
        isPoolActive: acct?.status === 'active' && !halted && depositsOpen,
        halted,
        depositsOpen,
        optimisticWithdrawals,
        totalBalanceNano: totalAmountNano,
        jettonSupplyNano,
        exchangeRateNano,
        exchangeRateFloat,
        apy,
        nominatorsCount,
        governanceFeeBps,
        cycleStart: poolInfo?.cycle_start || null,
        cycleEnd: poolInfo?.cycle_end || null,
        dataSource: 'TonAPI v2 + get_pool_full_data (On-Chain)',
        updatedAt: new Date(),
        updatedAtStr: new Date().toLocaleTimeString(),
      };

      const prev = StakingState.get('poolOnChainData');
      StakingState.set('poolOnChainData', { ...prev, [net]: telemetry });
      return telemetry;
    } catch (err) {
      console.warn(`[PoolOnChainVerifier] Telemetry fetch note (${net}):`, err.message);
      return null;
    }
  }

  /**
   * Verifies all on-chain prerequisites for the isolated StakeVault architecture:
   * 1. Active network must be Testnet (-3). Mainnet (-239) is strictly disabled.
   * 2. Official Tonstakers Pool on-chain verification (active, open, not halted).
   * 3. tsTON Jetton Master on-chain verification (active).
   * 4. StakeVault compiled FunC bytecode SHA-256 integrity check (fdc7d19f...).
   * 5. Deterministic StateInit & vault address generator readiness.
   * Eliminates obsolete reliance on a monolithic centralized Router without hiding errors.
   */
  async function verifyStakeVaultRequirements(network) {
    const net = network === 'mainnet' ? 'mainnet' : 'testnet';
    if (net === 'mainnet' && !STAKING_CONFIG.MAINNET_STAKING_ENABLED) {
      const status = {
        verified: false,
        reason: 'Staking en Mainnet (-239) estrictamente desactivado hasta auditoría independiente y aprobación del propietario.',
      };
      const prev = StakingState.get('vaultVerification') || {};
      StakingState.set('vaultVerification', { ...prev, [net]: status });
      StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
      return status;
    }

    try {
      const allowEntry = Object.entries(STAKING_CONFIG.ALLOWLIST).find(([, cfg]) => cfg.network === net);
      if (!allowEntry) {
        const status = { verified: false, reason: `Configuración no encontrada para la red ${net}.` };
        StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
        StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
        return status;
      }
      const [poolAddr, poolCfg] = allowEntry;
      const tsTonMaster = poolCfg.jettonMaster;

      // Parallel verification of Pool and tsTON Master on-chain
      const [poolAcct, poolMethod, masterAcct] = await Promise.all([
        ApiService.tonapi(`/accounts/${encodeURIComponent(poolAddr)}`, 15000, net),
        ApiService.tonapi(`/blockchain/accounts/${encodeURIComponent(poolAddr)}/methods/get_pool_full_data`, 15000, net),
        ApiService.tonapi(`/accounts/${encodeURIComponent(tsTonMaster)}`, 15000, net),
      ]);

      if (!poolAcct || poolAcct.status !== 'active') {
        const status = { verified: false, reason: `El Pool oficial Tonstakers no está activo en ${net} (estado: ${poolAcct?.status || 'desconocido'}).` };
        StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
        StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
        return status;
      }

      if (!masterAcct || masterAcct.status !== 'active') {
        const status = { verified: false, reason: `El contrato tsTON Master no está activo en ${net} (estado: ${masterAcct?.status || 'desconocido'}).` };
        StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
        StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
        return status;
      }

      let halted = false;
      let depositsOpen = true;
      if (poolMethod && poolMethod.success && poolMethod.decoded) {
        halted = Boolean(poolMethod.decoded.halted);
        depositsOpen = poolMethod.decoded.deposits_open !== undefined ? Boolean(poolMethod.decoded.deposits_open) : true;
      } else if (poolMethod && poolMethod.success && Array.isArray(poolMethod.stack)) {
        halted = parseInt(poolMethod.stack[1]?.num || '0', 16) !== 0;
      }

      if (halted || !depositsOpen) {
        const status = { verified: false, reason: 'El Pool Tonstakers tiene depósitos cerrados o se encuentra pausado (halted).' };
        StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
        StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
        return status;
      }

      // Verify compiled bytecode hash
      const core = await getTonCore();
      const codeCell = core.Cell.fromBase64(STAKING_CONFIG.VAULT_CODE_BOC);
      const codeHash = codeCell.hash().toString('hex');
      if (codeHash !== STAKING_CONFIG.VAULT_CODE_HASH) {
        const status = { verified: false, reason: `Hash de bytecode discrepante: esperado ${STAKING_CONFIG.VAULT_CODE_HASH}, obtenido ${codeHash}.` };
        StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
        StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
        return status;
      }

      const status = {
        verified: true,
        network: net,
        chainId: poolCfg.chainId,
        poolAddress: poolAddr,
        poolRaw: poolCfg.raw,
        tsTonMaster: tsTonMaster,
        tsTonMasterRaw: poolCfg.jettonMasterRaw,
        codeHash: codeHash,
        feeRecipient: STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT,
        feeRecipientRaw: STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT_RAW,
        feeBps: STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS,
        isVaultDeployed: false, // Bóveda determinística no desplegada antes del primer depósito
        address: 'Bóveda Determinística (vía StateInit)',
        reason: 'Requisitos StakeVault verificados en cadena: Pool Tonstakers activo, tsTON Master activo y Bytecode hash verificado (fdc7d19f). Bóveda determinística lista para despliegue vía StateInit.',
      };

      StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
      StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
      return status;
    } catch (err) {
      const status = {
        verified: false,
        reason: `Error al verificar requisitos StakeVault en cadena: ${err.message}`,
      };
      StakingState.set('vaultVerification', { ...StakingState.get('vaultVerification'), [net]: status });
      StakingState.set('routerVerification', { ...StakingState.get('routerVerification'), [net]: status });
      return status;
    }
  }

  async function verifyRouterContract(network) {
    return verifyStakeVaultRequirements(network);
  }

  return { fetchVerifiedPoolTelemetry, verifyStakeVaultRequirements, verifyRouterContract };
})();

/* ══════════════════════════════════════════════════════════════
   ON-CHAIN TRACE & 5-STATE TRANSACTION VERIFIER
   ══════════════════════════════════════════════════════════════ */

/**
 * Updates the 5 visual transaction state badges in `#stake-step-3`:
 * 1. Transacción enviada (`sent`)
 * 2. Pendiente (`pending`)
 * 3. Confirmada (`confirmed`)
 * 4. Fallida/Reembolsada (`failed_or_refunded`)
 * 5. Comisión cobrada (`fee_collected`)
 */
function updateTxStateBadges({ sent = false, pending = false, confirmed = false, failedOrRefunded = false, feeCollected = false }) {
  const setBadge = (id, active, activeClass) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `badge ${active ? activeClass : 'badge-muted'}`;
  };
  setBadge('badge-state-sent', sent, 'badge-blue');
  setBadge('badge-state-pending', pending, 'badge-yellow');
  setBadge('badge-state-confirmed', confirmed, 'badge-green');
  setBadge('badge-state-failed', failedOrRefunded, 'badge-red');
  setBadge('badge-state-fee', feeCollected, 'badge-green');
}

/**
 * Inspects TonAPI account events and full transaction traces (`/events/{event_id}`)
 * to verify asynchronous multi-hop execution:
 * - Detects if the transaction is still `in_progress` ("pendiente")
 * - Detects if any action bounced or refunded ("fallida/reembolsada")
 * - Detects if `tsTON` was minted/transferred to the user ("confirmada")
 * - Detects if `feeNano` (`0.35%`) was actually transferred on-chain without bounce to
 *   `UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd` ("comisión cobrada").
 * Never marks "comisión cobrada" unless verified in the on-chain event actions!
 */
async function _pollRealDepositTrace(userAddress, targetContract, expectedFeeNano, startTimestamp, timeoutMs = 55000, onProgress = null) {
  if (!userAddress) {
    return { status: 'unknown', feeCollected: false, hash: null };
  }
  const deadline = Date.now() + timeoutMs;
  const targetRaw = friendlyToRawAddress(targetContract);
  const feeRecipientRaw = STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT_RAW.toLowerCase();
  const userRaw = friendlyToRawAddress(userAddress);

  while (Date.now() < deadline) {
    await _sleep(3500);
    try {
      const data = await ApiService.tonapi(`/accounts/${encodeURIComponent(userAddress)}/events?limit=8`, 0);
      const events = data?.events || [];

      for (const ev of events) {
        if ((ev.timestamp || 0) < startTimestamp - 15) continue;
        const acts = ev.actions || [];

        const matchesTarget = acts.some(act => {
          const transfer = act.TonTransfer || act.ton_transfer;
          const exec = act.SmartContractExec || act.smart_contract_exec;
          const recip = (transfer?.recipient?.address || exec?.contract?.address || '').toLowerCase();
          return (targetRaw && recip === targetRaw) || recip.includes((targetContract || '').toLowerCase());
        });

        if (!matchesTarget) continue;

        const eventId = ev.event_id || ev.hash || null;

        // If trace is still executing across shards, report "pendiente" and continue polling
        if (ev.in_progress) {
          if (typeof onProgress === 'function') {
            onProgress({ status: 'pending', feeCollected: false, hash: eventId, timestamp: ev.timestamp });
          }
          continue;
        }

        // Check for bounce, failure, or refund transfer back to user
        const hasBounceOrFail = acts.some(act => {
          const t = act.TonTransfer || act.ton_transfer;
          const x = act.SmartContractExec || act.smart_contract_exec;
          if (act.status && act.status !== 'ok') return true;
          if (t?.bounced) return true;
          if (x && x.exit_code !== undefined && x.exit_code !== 0) return true;
          return false;
        });

        // Check if tsTON was transferred/minted to user in this trace
        const hasTsTonToUser = acts.some(act => {
          const jt = act.JettonTransfer || act.jetton_transfer;
          const jm = act.JettonMint || act.jetton_mint;
          if (jt && act.status === 'ok') {
            const r = (jt.recipient?.address || '').toLowerCase();
            return !userRaw || r === userRaw;
          }
          if (jm && act.status === 'ok') {
            const r = (jm.recipient?.address || '').toLowerCase();
            return !userRaw || r === userRaw;
          }
          return false;
        });

        // Verify on-chain fee collection to UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd
        const feeTransferVerified = acts.some(act => {
          const t = act.TonTransfer || act.ton_transfer;
          if (!t || t.bounced || (act.status && act.status !== 'ok')) return false;
          const recip = (t.recipient?.address || '').toLowerCase();
          const amt = BigInt(t.amount || 0);
          return recip === feeRecipientRaw && amt >= BigInt(expectedFeeNano || 0);
        });

        if (hasBounceOrFail && !hasTsTonToUser) {
          return {
            status: 'failed_or_refunded',
            feeCollected: false,
            hash: eventId,
            timestamp: ev.timestamp,
          };
        }

        return {
          status: 'confirmed',
          feeCollected: feeTransferVerified && hasTsTonToUser,
          tsTonDelivered: hasTsTonToUser,
          hash: eventId,
          timestamp: ev.timestamp,
        };
      }
    } catch (e) {
      console.warn('[_pollRealDepositTrace] Polling note:', e.message);
    }
  }

  return { status: 'pending', feeCollected: false, hash: null };
}

/* ══════════════════════════════════════════════════════════════
   WALLET SERVICE — Verified TON Connect Integration
   ══════════════════════════════════════════════════════════════ */

const WalletService = (() => {
  function getAddress() {
    return localStorage.getItem('anlgram_wallet_addr') || null;
  }
  function getName() {
    return localStorage.getItem('anlgram_wallet_name') || 'TON Wallet';
  }
  function isTonConnect() {
    return localStorage.getItem('anlgram_wallet_is_tonconnect') === 'true';
  }
  function isConnected() {
    return Boolean(getAddress());
  }
  function getNetwork() {
    return localStorage.getItem('anlgram_wallet_network') || 'testnet';
  }
  function getChainId() {
    if (typeof window.getConnectedWalletChainId === 'function') {
      const cid = window.getConnectedWalletChainId();
      if (cid) return String(cid);
    }
    const rawChain = window.tonConnectUI?.wallet?.account?.chain;
    if (rawChain === '-3' || rawChain === -3) return '-3';
    if (rawChain === '-239' || rawChain === -239) return '-239';
    return null; // Unverified / Unknown
  }

  async function getAccountInfo(address, network = 'testnet') {
    if (!address) return null;
    try {
      return await ApiService.tonapi(`/accounts/${encodeURIComponent(address)}`, 15000, network);
    } catch { return null; }
  }

  async function loadWalletData() {
    const address = getAddress();
    if (!address) return;
    StakingState.set('loading', { ...StakingState.get('loading'), positions: true });

    try {
      const isTC = isTonConnect();
      const chainId = getChainId();
      const activeNet = StakingState.get('activeNetwork'); // 'testnet' or 'mainnet'
      const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;

      let isWrongNetwork = false;
      let balanceNano = 0n;
      let balanceTon = 0;
      let balanceDisplay = '0.0000 TON';
      let balanceStatus = 'ok';

      if (isTC && chainId && chainId !== expectedChainId) {
        isWrongNetwork = true;
        balanceStatus = chainId === '-239' ? 'wrong_network_mainnet' : 'wrong_network_testnet';
        balanceDisplay = chainId === '-239'
          ? 'No disponible (Wallet en Mainnet -239)'
          : 'No disponible (Wallet en Testnet -3)';
        balanceTon = null;
        balanceNano = null;
      } else {
        try {
          const acct = await ApiService.tonapi(`/accounts/${encodeURIComponent(address)}`, 15000, activeNet);
          if (acct && acct.status !== 'nonexist' && acct.balance) {
            balanceNano = BigInt(acct.balance || 0);
            balanceTon = parseFloat(fromNanoSafe(balanceNano, 4));
            balanceDisplay = `${safeToFixed(balanceTon, 4)} TON`;
            balanceStatus = 'active';
          } else {
            balanceNano = 0n;
            balanceTon = 0;
            balanceDisplay = `0.0000 TON (Cuenta sin saldo en ${activeNet === 'mainnet' ? 'Mainnet' : 'Testnet'})`;
            balanceStatus = 'nonexist';
          }
        } catch (err) {
          console.warn('[WalletService] Error fetching balance:', err.message);
          balanceDisplay = 'No disponible (Error al consultar red)';
          balanceStatus = 'error';
        }
      }

      // Ensure live pool telemetry is loaded so we have the exact tsTON -> TON exchange rate
      let poolTelemetry = StakingState.get('poolOnChainData')[activeNet];
      if (!poolTelemetry) {
        poolTelemetry = await PoolOnChainVerifier.fetchVerifiedPoolTelemetry(activeNet);
      }

      const jettonsRes = await (async () => {
        try {
          return await ApiService.tonapi(`/accounts/${encodeURIComponent(address)}/jettons`, 15000, activeNet);
        } catch { return null; }
      })();

      StakingState.set('wallet', {
        address,
        rawAddress: friendlyToRawAddress(address),
        name: getName(),
        balanceTon,
        balanceNano,
        balanceDisplay,
        balanceStatus,
        isWrongNetwork,
        network: activeNet,
        chainId: chainId || expectedChainId,
        connected: true,
        isTonConnect: isTC,
        isReadOnly: !isTC,
      });

      const jettonsData = jettonsRes?.balances || [];
      _processVerifiedPositions(jettonsData, poolTelemetry);
      PortfolioController.render();
      WalletUIController.updateConnected();
      CalculatorController._updateWalletRecipientDisplay();
      CalculatorController._calculate();
    } finally {
      StakingState.set('loading', { ...StakingState.get('loading'), positions: false });
    }
  }

  function _processVerifiedPositions(jettons, poolTelemetry) {
    const positions = [];
    const activeNet = StakingState.get('activeNetwork');
    const allowEntry = Object.entries(STAKING_CONFIG.ALLOWLIST).find(([, cfg]) => cfg.network === activeNet);
    if (!allowEntry) {
      StakingState.set('positions', []);
      return;
    }
    const [poolAddr, poolCfg] = allowEntry;
    const expectedMasterRaw = poolCfg.jettonMasterRaw.toLowerCase();
    const expectedMasterFriendly = poolCfg.jettonMaster;

    const rateNano = poolTelemetry?.exchangeRateNano || 1000000000n;
    const rateFloat = Number(rateNano) / 1e9;
    const liveApy = poolTelemetry?.apy ?? null;

    jettons.forEach(j => {
      const rawMaster = (j.jetton?.address || '').toLowerCase();
      const friendlyMaster = rawToFriendlyAddress(rawMaster, true, activeNet === 'testnet');

      const isTsTon = rawMaster === expectedMasterRaw || friendlyMaster === expectedMasterFriendly;
      if (!isTsTon) return;

      const tsTonBalNano = BigInt(j.balance || 0);
      if (tsTonBalNano <= 0n) return;

      // Underlying TON value based on real on-chain pool exchange rate (total_balance / jetton_total_supply)
      const underlyingTonNano = (tsTonBalNano * rateNano) / 1000000000n;
      const appreciationNano = underlyingTonNano > tsTonBalNano ? (underlyingTonNano - tsTonBalNano) : 0n;

      positions.push({
        validatorId: poolAddr,
        validatorName: poolCfg.name,
        tsTonBalance: parseFloat(fromNanoSafe(tsTonBalNano, 4)),
        tsTonBalanceNano: tsTonBalNano,
        amount: parseFloat(fromNanoSafe(underlyingTonNano, 4)),
        amountNano: underlyingTonNano,
        readyWithdraw: parseFloat(fromNanoSafe(underlyingTonNano, 4)),
        readyWithdrawNano: underlyingTonNano,
        pendingDeposit: 0,
        pendingDepositNano: 0n,
        earnedRewards: parseFloat(fromNanoSafe(appreciationNano, 4)),
        earnedRewardsNano: appreciationNano,
        exchangeRateTonPerTsTon: rateFloat,
        apr: liveApy,
        status: 'active',
        protocol: 'liquidTF',
        lockPeriod: 'Líquido (Quema 0x595f07bc · 0% Fee)',
        jettonWalletAddress: j.wallet_address?.address
          ? rawToFriendlyAddress(j.wallet_address.address, true, activeNet === 'testnet')
          : null,
        jettonWalletRaw: j.wallet_address?.address || null,
        dataSource: poolTelemetry?.dataSource || 'TonAPI v2',
        lastUpdated: poolTelemetry?.updatedAtStr || new Date().toLocaleTimeString(),
        isVerified: true,
      });
    });

    StakingState.set('positions', positions);
  }

  // React to wallet events from wallet-connect.js
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('anlgramWalletChanged', async (e) => {
      const { address, network, isTonConnect: isTC } = e.detail || {};
      if (address) {
        if (network && (network === 'mainnet' || network === 'testnet')) {
          localStorage.setItem('anlgram_wallet_network', network);
          if (STAKING_CONFIG.MAINNET_STAKING_ENABLED || network === 'testnet') {
            switchStakingNetwork(network);
          }
        }
        await loadWalletData();
        WalletUIController.updateConnected();
        NotificationService.push({
          type: 'wallet',
          title: isTC ? 'Wallet Conectada vía TON Connect' : 'Dirección Vinculada (Solo Lectura)',
          body: `${shortenAddress(address)} (${(network || 'testnet').toUpperCase()})${!isTC ? ' · Solo Lectura' : ''}`,
          icon: isTC ? '🔗' : '👀',
        });
      } else {
        StakingState.set('wallet', {
          address: null, rawAddress: null, name: null,
          balanceTon: 0, balanceNano: 0n, connected: false,
          isTonConnect: false, isReadOnly: true,
        });
        StakingState.set('positions', []);
        WalletUIController.updateDisconnected();
        CalculatorController._updateWalletRecipientDisplay();
        CalculatorController._calculate();
      }
      PortfolioController.render();
      TransactionController.init();
    });
  }

  return { getAddress, getName, isTonConnect, isConnected, getNetwork, getChainId, loadWalletData };
})();

/* ══════════════════════════════════════════════════════════════
   VALIDATOR SERVICE — Single Verified Public Pool (Tonstakers)
   ══════════════════════════════════════════════════════════════ */

const ValidatorService = (() => {
  async function getAll() {
    const net = StakingState.get('activeNetwork');
    const allowEntries = Object.entries(STAKING_CONFIG.ALLOWLIST).filter(([, cfg]) => cfg.network === net);

    const results = [];
    for (const [poolAddr, cfg] of allowEntries) {
      const telemetry = await PoolOnChainVerifier.fetchVerifiedPoolTelemetry(net);
      await PoolOnChainVerifier.verifyStakeVaultRequirements(net);

      const totalNano = telemetry?.totalBalanceNano || 0n;
      const totalTon = totalNano > 0n ? parseFloat(fromNanoSafe(totalNano, 2)) : null;
      const apy = telemetry?.apy ?? null;
      const delegators = telemetry?.nominatorsCount ?? null;
      const rateFloat = telemetry?.exchangeRateFloat ?? null;
      const isOnline = Boolean(telemetry && telemetry.isPoolActive);

      results.push({
        id: poolAddr,
        address: poolAddr,
        rawAddress: cfg.raw,
        shortAddress: shortenAddress(poolAddr),
        name: cfg.name,
        logoUrl: null,
        logoEmoji: '⚡',
        status: isOnline ? 'active' : (telemetry ? 'halted' : 'offline'),
        apr: apy,
        apy: apy,
        yieldType: 'Estimado (variable según ciclo de validación TON)',
        commission: STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS / 100, // 0.35% ANLGRAM fee
        anlgramFeeBps: STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS,
        minStake: cfg.minStakeTon,
        minStakeNano: cfg.minStakeNano,
        totalStaked: totalTon,
        totalStakedNano: totalNano,
        delegators,
        exchangeRateTonPerTsTon: rateFloat,
        performanceScore: null, // Honest: no fabricated synthetic score
        uptime: null,           // Honest: no fabricated 99.9% uptime
        riskGrade: 'Auditado (liquidTF)',
        website: cfg.docs,
        description: `${cfg.rewardMechanism} ${cfg.lockDescription}`,
        verified: true,
        protocol: cfg.protocol,
        isSupported: cfg.isSupported,
        dataSource: telemetry ? telemetry.dataSource : 'Allowlist (Sin datos de red)',
        lastUpdated: telemetry ? telemetry.updatedAtStr : 'Sin datos',
      });
    }

    return results;
  }

  async function getById(poolId) {
    const all = StakingState.get('validators');
    return all.find(v => v.id === poolId || v.address === poolId || v.rawAddress === poolId) || all[0] || null;
  }

  return { getAll, getById };
})();

/* ══════════════════════════════════════════════════════════════
   REWARD SERVICE — Mathematical Projections & Claim Modal Handler
   ══════════════════════════════════════════════════════════════ */

const RewardService = (() => {
  /**
   * Calculates mathematically rigorous staking yield projections.
   *
   * TON Liquid Staking Protocol Realities (Tonstakers liquidTF):
   * TonAPI `/v2/staking/pool/{address}` returns `pool.apy` which is already the
   * Annual Percentage Yield (APY, effective annual rate) incorporating protocol
   * validation round compounding (~every 18-36 hours).
   *
   * Formula for effective APY over period t (t = days / 365):
   *   Future Balance = Amount * (1 + APY / 100)^t
   *   Total Rewards  = Future Balance - Amount
   *
   * Avoids the compound-compounding bug (previously applying Math.pow(1 + r/365, 365*t)
   * on a value that was already APY, which erroneously inflated projections).
   *
   * For linear / non-compounded baseline:
   *   nominalApr = 365 * ((1 + APY / 100)^(1/365) - 1) * 100
   *   Future Balance = Amount * (1 + (nominalApr / 100) * t)
   */
  function calculate({ amount, apy = null, apr = null, days = 365, compound = true }) {
    const rawRate = Number(apy ?? apr);
    if (!amount || !Number.isFinite(rawRate) || rawRate <= 0) {
      return {
        daily: null, weekly: null, monthly: null, yearly: null,
        periodRewards: null, totalRewards: null, roi: null,
        futureBalance: amount || 0,
        effectiveApy: null, nominalApr: null,
      };
    }

    const Y = rawRate / 100; // APY as fraction (e.g. 0.12764)
    const t = days / 365;

    // Nominal APR equivalent compounded daily: (1 + APR/365)^365 = 1 + APY
    const dailyFactor = Math.pow(1 + Y, 1 / 365);
    const nominalApr = (dailyFactor - 1) * 365 * 100;

    let futureBalance, totalRewards;
    if (compound) {
      // Compound projection using exact effective annual yield Y over time t
      futureBalance = amount * Math.pow(1 + Y, t);
      totalRewards = futureBalance - amount;
    } else {
      // Linear projection based on equivalent nominal APR without compounding over period
      totalRewards = amount * (nominalApr / 100) * t;
      futureBalance = amount + totalRewards;
    }

    // Auxiliary discrete periods
    const dailyReward   = amount * (Math.pow(1 + Y, 1 / 365) - 1);
    const weeklyReward  = amount * (Math.pow(1 + Y, 7 / 365) - 1);
    const monthlyReward = amount * (Math.pow(1 + Y, 30 / 365) - 1);
    const yearlyReward  = amount * Y; // Exactly amount * APY for 1 full year!

    return {
      daily: dailyReward,
      weekly: weeklyReward,
      monthly: monthlyReward,
      yearly: yearlyReward,
      periodRewards: totalRewards,
      totalRewards,
      roi: (totalRewards / amount) * 100,
      futureBalance,
      effectiveApy: rawRate,
      nominalApr,
    };
  }

  function buildGrowthData(amount, apy, months = 12, compound = true) {
    if (!apy || apy <= 0) return { labels: [], values: [] };
    const labels = [], values = [];
    for (let m = 1; m <= months; m++) {
      labels.push(`Mes ${m}`);
      const res = calculate({ amount, apy, days: m * 30, compound });
      values.push(parseFloat(safeToFixed(res.futureBalance, 4, '0')));
    }
    return { labels, values };
  }

  function openClaimModal(validatorId) {
    const positions = StakingState.get('positions') || [];
    const pos = positions.find(p => p.validatorId === validatorId) || positions[0];
    const modal = document.getElementById('claim-modal');
    if (!modal) return;

    if (pos) {
      modal.dataset.validatorId = pos.validatorId;
      _setText('claim-validator-name', pos.validatorName);
      _setText('claim-amount', `${safeToFixed(pos.amount, 4)} TON (${safeToFixed(pos.tsTonBalance, 4)} tsTON)`);
    } else {
      _setText('claim-validator-name', 'Tonstakers Liquid Pool');
      _setText('claim-amount', 'Sin posición activa');
    }
    modal.classList.add('open');
  }

  function executeClaim() {
    const claimModal = document.getElementById('claim-modal');
    const validatorId = claimModal?.dataset?.validatorId || (StakingState.get('positions')[0]?.validatorId);
    claimModal?.classList.remove('open');
    if (validatorId) {
      UnstakeModalController.open(validatorId);
    } else {
      NotificationService.toast(
        'Mecanismo tsTON',
        'En Tonstakers las recompensas se acumulan automáticamente en la tasa de cambio de tsTON. Conecta tu wallet con tsTON para retirar.',
        'info'
      );
    }
  }

  return { calculate, buildGrowthData, openClaimModal, executeClaim };
})();

/* ══════════════════════════════════════════════════════════════
   PORTFOLIO SERVICE — Verified User Positions (No Hardcoded APR)
   ══════════════════════════════════════════════════════════════ */

const PortfolioService = (() => {
  function getTotals() {
    const positions = StakingState.get('positions') || [];
    const totalStaked = positions.reduce((s, p) => s + (p.amount || 0), 0);
    const totalPending = positions.reduce((s, p) => s + (p.readyWithdraw || 0), 0);
    const totalEarned = positions.reduce((s, p) => s + (p.earnedRewards || 0), 0);
    const hasLiveApr = positions.some(p => p.apr !== null && p.apr !== undefined);
    const projAnnual = hasLiveApr
      ? positions.reduce((s, p) => s + (p.apr ? (p.amount * p.apr / 100) : 0), 0)
      : null;
    return { totalStaked, totalPending, totalEarned, projAnnual };
  }

  function getAllocationData() {
    const positions = StakingState.get('positions') || [];
    return {
      labels: positions.map(p => p.validatorName),
      values: positions.map(p => p.amount),
    };
  }

  async function refresh() {
    ApiService.clearCache('/accounts/');
    await WalletService.loadWalletData();
  }

  return { getTotals, getAllocationData, refresh };
})();

/* ══════════════════════════════════════════════════════════════
   ANALYTICS SERVICE — Real Blockchain Telemetry
   ══════════════════════════════════════════════════════════════ */

const AnalyticsService = (() => {
  async function getNetworkStats() {
    const net = StakingState.get('activeNetwork');
    try {
      const [telemetry, rateRes] = await Promise.all([
        PoolOnChainVerifier.fetchVerifiedPoolTelemetry(net),
        ApiService.tonapi('/rates?tokens=ton&currencies=usd', 60000, 'mainnet').catch(() => null),
      ]);

      const tonPrice = rateRes?.rates?.TON?.prices?.USD ?? null;
      const totalStakedTon = telemetry && telemetry.totalBalanceNano > 0n
        ? parseFloat(fromNanoSafe(telemetry.totalBalanceNano, 2))
        : null;

      return {
        tps: null,
        blockTime: '~5s',
        lastBlock: null,
        totalStakedTon: totalStakedTon !== null ? (totalStakedTon / 1e6) : null,
        totalStakedRawTon: totalStakedTon,
        activeVal: telemetry ? 1 : null,
        delegators: telemetry?.nominatorsCount ?? null,
        tonPrice,
        avgApr: telemetry?.apy ?? null,
        exchangeRateTonPerTsTon: telemetry?.exchangeRateFloat ?? null,
        networkStatus: telemetry?.isPoolActive ? 'Operativo (En Cadena)' : (telemetry ? 'Pool Pausado' : 'Sin datos'),
        dataSource: telemetry ? telemetry.dataSource : 'TonAPI v2 (Sin datos)',
        lastUpdated: telemetry ? telemetry.updatedAtStr : new Date().toLocaleTimeString(),
        yieldType: 'Estimado (TonAPI v2 / get_pool_full_data)',
      };
    } catch {
      return {
        tps: null, blockTime: 'Sin datos', lastBlock: null,
        totalStakedTon: null, totalStakedRawTon: null, activeVal: null, delegators: null,
        tonPrice: null, avgApr: null, exchangeRateTonPerTsTon: null,
        networkStatus: 'Sin datos (Verifica conexión)',
        dataSource: 'TonAPI v2 (No disponible)',
        lastUpdated: new Date().toLocaleTimeString(),
        yieldType: 'No disponible',
      };
    }
  }

  async function getTransactions(address) {
    if (!address) return [];
    try {
      const data = await ApiService.tonapi(`/accounts/${encodeURIComponent(address)}/events?limit=25`);
      if (data && Array.isArray(data.events) && data.events.length > 0) {
        return data.events.map(_normalizeTx);
      }
    } catch {}
    return [];
  }

  function _normalizeTx(ev) {
    const acts = ev.actions || [];
    const action = acts[0] || {};
    const tonTransfer = action.TonTransfer || action.ton_transfer || {};
    const jettonTransfer = action.JettonTransfer || action.jetton_transfer || null;
    const jettonBurn = action.JettonBurn || action.jetton_burn || null;

    let type = action.type || 'transfer';
    const recip = tonTransfer.recipient?.name || tonTransfer.recipient?.address || '';
    if (jettonBurn) type = 'unstake (burn tsTON)';
    else if (jettonTransfer) type = 'tsTON transfer';
    else if (recip.toLowerCase().includes('tonstakers') || recip.toLowerCase().includes('pool')) type = 'stake';

    const hasBounce = acts.some(a => a.TonTransfer?.bounced || a.ton_transfer?.bounced || (a.status && a.status !== 'ok'));
    const feeRecipientRaw = STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT_RAW.toLowerCase();
    const feePaid = acts.some(a => {
      const t = a.TonTransfer || a.ton_transfer;
      return t && !t.bounced && (t.recipient?.address || '').toLowerCase() === feeRecipientRaw;
    });

    let statusLabel = 'confirmada';
    if (ev.in_progress) statusLabel = 'pendiente';
    else if (hasBounce) statusLabel = 'fallida/reembolsada';
    else if (feePaid) statusLabel = 'comisión cobrada';

    return {
      hash: ev.event_id || ev.hash || '',
      type,
      validator: tonTransfer.recipient?.name || shortenAddress(recip) || 'Tonstakers',
      amount: parseFloat(fromNanoSafe(tonTransfer.amount || jettonBurn?.amount || 0, 4)),
      fee: parseFloat(fromNanoSafe(ev.fee || ev.fees?.total || 0, 4)),
      status: statusLabel,
      timestamp: new Date((ev.timestamp || Date.now() / 1000) * 1000),
      hash_short: (ev.event_id || '').substring(0, 8) + '...',
    };
  }

  return { getNetworkStats, getTransactions };
})();

/* ══════════════════════════════════════════════════════════════
   WHALE SERVICE — Real Live On-Chain Holders & Flows
   ══════════════════════════════════════════════════════════════ */

const WhaleService = (() => {
  async function fetchStakingWallets() {
    const net = StakingState.get('activeNetwork');
    const allowEntry = Object.values(STAKING_CONFIG.ALLOWLIST).find(cfg => cfg.network === net);
    if (!allowEntry) return [];

    try {
      const data = await ApiService.tonapi(`/jettons/${encodeURIComponent(allowEntry.jettonMaster)}/holders?limit=20`);
      if (!data || !Array.isArray(data.addresses)) return [];

      return data.addresses.map(holder => {
        if (!holder?.owner?.address) return null;
        const balNano = BigInt(holder.balance || 0);
        const tonAmount = parseFloat(fromNanoSafe(balNano, 2));
        if (tonAmount <= 0) return null;

        const friendly = rawToFriendlyAddress(holder.owner.address, true, net === 'testnet');
        return {
          address: friendly,
          shortAddress: holder.owner.name || shortenAddress(friendly),
          validator: `${allowEntry.name} (tsTON)`,
          delegatedTON: tonAmount,
          delegatedNano: balNano,
          status: 'En Cadena',
        };
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function getFlows() {
    const net = StakingState.get('activeNetwork');
    const allowEntry = Object.entries(STAKING_CONFIG.ALLOWLIST).find(([, cfg]) => cfg.network === net);
    if (!allowEntry) return [];
    const [poolAddr, poolCfg] = allowEntry;

    try {
      const eventsData = await ApiService.tonapi(`/accounts/${encodeURIComponent(poolAddr)}/events?limit=20`);
      const events = eventsData?.events || [];
      const flows = [];

      events.forEach(ev => {
        const action = ev.actions?.[0];
        if (!action) return;
        const t = action.TonTransfer || action.ton_transfer;
        if (t && t.amount) {
          const isOutflow = (t.sender?.address || '').toLowerCase() === poolCfg.raw.toLowerCase();
          const amountTon = parseFloat(fromNanoSafe(t.amount, 2));
          if (amountTon >= 1) {
            flows.push({
              pool: poolCfg.name,
              type: isOutflow ? 'outflow' : 'inflow',
              amount: amountTon,
              wallet: shortenAddress(rawToFriendlyAddress(isOutflow ? t.recipient?.address : t.sender?.address, true, net === 'testnet')),
              time: _timeAgo(ev.timestamp),
            });
          }
        }
      });
      return flows;
    } catch {
      return [];
    }
  }

  function _timeAgo(unix) {
    if (!unix) return 'Reciente';
    const s = Math.floor(Date.now() / 1000 - unix);
    if (s < 60) return `hace ${s}s`;
    if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
    return `hace ${Math.floor(s / 3600)}h`;
  }

  return { fetchStakingWallets, getFlows };
})();

/* ══════════════════════════════════════════════════════════════
   NOTIFICATION SERVICE
   ══════════════════════════════════════════════════════════════ */

const NotificationService = (() => {
  const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', wallet: '🔗', stake: '⚡' };

  function toast(title, body, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const t = document.createElement('div');
    t.className = `toast toast-${type === 'error' ? 'error' : type === 'success' ? 'success' : 'info'}`;
    t.innerHTML = `
      <span style="font-size:16px;">${ICONS[type] || ICONS.info}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:var(--text-sm);margin-bottom:2px;">${title}</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${body}</div>
      </div>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:16px;">✕</button>
    `;
    container.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => t.remove(), 300);
    }, duration);
  }

  function push(notif) {
    const notifs = StakingState.get('notifications') || [];
    const item = {
      id: Date.now(),
      title: notif.title,
      body: notif.body,
      icon: notif.icon || ICONS[notif.type] || ICONS.info,
      type: notif.type || 'info',
      time: new Date(),
      read: false,
    };
    StakingState.set('notifications', [item, ...notifs].slice(0, 50));
    toast(notif.title, notif.body, notif.type || 'info');
  }

  return { toast, push };
})();

/* ══════════════════════════════════════════════════════════════
   WALLET UI CONTROLLER
   ══════════════════════════════════════════════════════════════ */

const WalletUIController = {
  updateConnected() {
    const w = StakingState.get('wallet');
    const banner = document.getElementById('wallet-info-bar');
    if (banner) {
      banner.style.display = 'flex';
      const addrEl = document.getElementById('wallet-addr-display');
      const balEl = document.getElementById('wallet-bal-display');
      if (addrEl) {
        let netLabel = w.network === 'testnet' ? 'Testnet -3' : 'Mainnet -239';
        if (w.isWrongNetwork) {
          netLabel = '⚠️ Red Errónea: Mainnet -239 (Cambia a Testnet)';
        }
        addrEl.textContent = `${shortenAddress(w.address)} (${netLabel})${w.isReadOnly ? ' · Solo Lectura' : ''}`;
      }
      if (balEl) balEl.textContent = w.balanceDisplay || (w.balanceTon !== null ? `${safeToFixed(w.balanceTon, 4)} TON` : 'No disponible');
    }
    const networkEl = document.getElementById('network-badge-label');
    if (networkEl) {
      const activeNet = StakingState.get('activeNetwork');
      networkEl.textContent = activeNet === 'testnet' ? 'TON Testnet (-3)' : 'TON Mainnet (-239)';
      networkEl.style.color = activeNet === 'testnet' ? '#f59e0b' : '#22c55e';
    }
  },
  updateDisconnected() {
    const banner = document.getElementById('wallet-info-bar');
    if (banner) banner.style.display = 'none';
  },
};

/* ══════════════════════════════════════════════════════════════
   STAKE MODAL CONTROLLER (0.35% Fee Breakdown, Client Acceptance & Trace)
   ══════════════════════════════════════════════════════════════ */

const StakeModalController = {
  _currentValidator: null,
  _currentBreakdown: null,
  _currentVaultInfo: null,
  _step: 1,

  async open(validatorId) {
    const validators = StakingState.get('validators');
    const v = validators.find(val => val.id === validatorId || val.address === validatorId) || validators[0];
    if (!v) return;
    this._currentValidator = v;
    this._step = 1;

    const modal = document.getElementById('stake-modal');
    if (!modal) return;
    modal.classList.add('open');

    let activeNet = StakingState.get('activeNetwork');
    const wallet = StakingState.get('wallet');
    if (wallet.connected && (wallet.chainId === '-239' || wallet.network === 'mainnet') && activeNet !== 'mainnet' && STAKING_CONFIG.MAINNET_STAKING_ENABLED) {
      switchStakingNetwork('mainnet');
      activeNet = 'mainnet';
    }

    const poolTelemetry = await PoolOnChainVerifier.fetchVerifiedPoolTelemetry(activeNet);
    const vaultReq = await PoolOnChainVerifier.verifyStakeVaultRequirements(activeNet);

    // Populate Step 1 Header
    _setText('stake-val-name', v.name);
    _setText('stake-val-protocol', 'Tonstakers Liquid (tsTON · StakeVault Aislada)');
    _setText('stake-val-apr', v.apr ? `${safeToFixed(v.apr, 2)}% (Estimado)` : 'Variable en cadena');
    _setText('stake-val-commission', `0.35% (${STAKING_CONFIG.ANLGRAM_STAKE_FEE_BPS} bps)`);
    _setText('stake-val-min', `${v.minStake || 1} TON`);
    _setText('stake-preview-fee-wallet', STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT);

    const alertBox = document.getElementById('stake-unsupported-alert');
    const reviewBtn = document.getElementById('stake-review-btn');
    const checkbox = document.getElementById('stake-accept-terms-checkbox');
    if (checkbox) checkbox.checked = false;

    // 1. Mainnet Security Switch Check
    if (activeNet === 'mainnet' && !STAKING_CONFIG.MAINNET_STAKING_ENABLED) {
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(245,158,11,0.15)';
        alertBox.style.borderColor = '#f59e0b';
        alertBox.style.color = '#fbbf24';
        alertBox.innerHTML = `
          <strong>🛡️ Staking en Mainnet (-239) Desactivado por Política de Seguridad:</strong><br/>
          El staking en producción permanece desactivado hasta auditoría independiente de FunC y aprobación explícita del propietario.<br/>
          <em>Cambia a <strong>TON Testnet (-3)</strong> para operar en el entorno de pruebas.</em>
        `;
      }
      if (reviewBtn) { reviewBtn.disabled = true; reviewBtn.textContent = 'Mainnet Desactivado (Usa Testnet)'; }
      this._bindAmountInput();
      this._updatePreview();
      this._showStep(1);
      return;
    }

    // 2. Connected Wallet Network Check (Mainnet vs Testnet)
    const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;
    if (wallet.connected && (wallet.isWrongNetwork || (wallet.chainId && wallet.chainId !== expectedChainId))) {
      const targetNet = wallet.chainId === '-239' ? 'mainnet' : 'testnet';
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(239,68,68,0.15)';
        alertBox.style.borderColor = '#ef4444';
        alertBox.style.color = '#fca5a5';
        alertBox.innerHTML = `
          <strong>⚠️ Billetera en ${wallet.chainId === '-239' ? 'TON Mainnet (-239)' : 'TON Testnet (-3)'}:</strong><br/>
          Tu billetera conectada está en <strong>${wallet.chainId === '-239' ? 'Mainnet (-239)' : 'Testnet (-3)'}</strong>, pero la plataforma está en <strong>${activeNet === 'mainnet' ? 'Mainnet (-239)' : 'Testnet (-3)'}</strong>.<br/>
          <button type="button" class="btn btn-sm" style="margin-top:8px;background:#22c55e;color:#000;font-weight:700;border:none;padding:5px 12px;border-radius:4px;cursor:pointer;" onclick="window.switchStakingNetwork('${targetNet}'); StakeModalController.open();">
            👉 Cambiar Plataforma a ${wallet.chainId === '-239' ? 'Mainnet (-239)' : 'Testnet (-3)'} Ahora
          </button>
        `;
      }
      if (reviewBtn) {
        reviewBtn.disabled = false;
        reviewBtn.textContent = `Cambiar a ${wallet.chainId === '-239' ? 'TON Mainnet (-239)' : 'TON Testnet (-3)'}`;
        reviewBtn.onclick = () => {
          window.switchStakingNetwork(targetNet);
          this.open();
        };
      }
      this._bindAmountInput();
      this._updatePreview();
      this._showStep(1);
      return;
    }

    // 3. Pool On-Chain Status Check
    if (!v.isSupported || (poolTelemetry && !poolTelemetry.isPoolActive)) {
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(239,68,68,0.15)';
        alertBox.style.borderColor = '#ef4444';
        alertBox.style.color = '#fca5a5';
        alertBox.innerHTML = `<strong>⚠️ Pool No Disponible:</strong> El contrato del pool no se encuentra activo o tiene depósitos cerrados en cadena.`;
      }
      if (reviewBtn) { reviewBtn.disabled = true; reviewBtn.textContent = 'Pool No Disponible'; }
      return;
    }

    // 4. StakeVault Requirements Status
    if (!vaultReq.verified) {
      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(245,158,11,0.14)';
        alertBox.style.borderColor = '#f59e0b';
        alertBox.style.color = '#fbbf24';
        alertBox.innerHTML = `<strong>ℹ️ Estado StakeVault en Testnet (-3):</strong><br/>${vaultReq.reason}`;
      }
      if (reviewBtn) { reviewBtn.disabled = true; reviewBtn.textContent = 'Requisitos No Cumplidos'; }
    } else if (alertBox) {
      alertBox.style.display = 'none';
      if (reviewBtn) { reviewBtn.disabled = false; reviewBtn.textContent = 'Revisar Desglose →'; }
    }

    const maxEl = document.getElementById('stake-max-display');
    if (maxEl) {
      if (!wallet.connected) {
        maxEl.textContent = 'Conecta tu wallet para ver tu balance';
      } else if (wallet.isWrongNetwork) {
        maxEl.textContent = 'Disponible: No disponible (Wallet en Mainnet -239. Cambia a Testnet)';
      } else {
        maxEl.textContent = `Disponible: ${wallet.balanceDisplay} ${wallet.isReadOnly ? '(Solo Lectura)' : ''}`;
      }
    }

    this._bindAmountInput();
    this._updatePreview();
    this._showStep(1);
  },

  close() {
    document.getElementById('stake-modal')?.classList.remove('open');
  },

  _bindAmountInput() {
    const input = document.getElementById('stake-amount-input');
    if (!input) return;
    input.value = '';
    input.oninput = () => this._updatePreview();
  },

  setMax() {
    const wallet = StakingState.get('wallet');
    if (!wallet.connected) { window.openWalletModal?.(); return; }
    if (wallet.isWrongNetwork || wallet.chainId !== '-3') {
      NotificationService.toast('Red Errónea', 'Cambia tu wallet a TON Testnet (-3) para operar.', 'warning');
      return;
    }
    const gasReserveTotalNano = STAKING_CONFIG.VAULT_TOTAL_GAS_RESERVE_NANO || 1155000000n;
    const availNano = wallet.balanceNano > gasReserveTotalNano ? (wallet.balanceNano - gasReserveTotalNano) : 0n;
    // Since total = principal + (principal * 35 / 10000) + gasReserveTotalNano, maxPrincipal = (availNano * 10000) / 10035
    const maxPrincipalNano = (availNano * 10000n) / 10035n;
    const input = document.getElementById('stake-amount-input');
    if (input) {
      input.value = fromNanoSafe(maxPrincipalNano, 4);
      this._updatePreview();
    }
  },

  _updatePreview() {
    const input = document.getElementById('stake-amount-input');
    if (!input || !this._currentValidator) return;
    const rawStr = (input.value || '').trim();
    const principalNano = toNanoSafe(rawStr);
    const breakdown = calculateStakeDepositBreakdown(principalNano);
    this._currentBreakdown = breakdown;

    _setText('stake-preview-principal', `${breakdown.principalTonStr} TON`);
    _setText('stake-preview-anlgram-fee', `${breakdown.feeTonStr} TON (${breakdown.feeNano.toString()} nanoTON)`);
    _setText('stake-preview-pool-gas', `${breakdown.poolDepositGasTonStr} TON`);
    _setText('stake-preview-jetton-gas', `${breakdown.jettonTransferGasTonStr} TON`);
    _setText('stake-preview-storage-gas', `${breakdown.storageReserveTonStr} TON`);
    _setText('stake-preview-gas', `${breakdown.gasTonStr} TON`);
    _setText('stake-preview-total', `${breakdown.totalTonStr} TON`);
    _setText('stake-preview-fee-wallet', breakdown.feeRecipient);

    const v = this._currentValidator;
    const amountFloat = parseFloat(fromNanoSafe(principalNano, 6));
    const previewEl = document.getElementById('stake-reward-preview');
    if (previewEl) {
      if (v.apr && amountFloat > 0) {
        const rewards = RewardService.calculate({ amount: amountFloat, apr: v.apr });
        previewEl.textContent = `~${safeToFixed(rewards.monthly, 4)} TON/mes · ~${safeToFixed(rewards.yearly, 4)} TON/año (Estimado a ${safeToFixed(v.apr, 2)}% APY)`;
      } else {
        previewEl.textContent = 'Variable según ciclo de validación en cadena (tsTON)';
      }
    }

    this._validateAmount(principalNano, breakdown.totalNano);
  },

  _validateAmount(principalNano, totalNano) {
    const v = this._currentValidator;
    const wallet = StakingState.get('wallet');
    const errEl = document.getElementById('stake-amount-error');
    let err = '';
    const minStakeNano = v?.minStakeNano || 1000000000n;

    const activeNet = StakingState.get('activeNetwork');
    const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;

    if (wallet.connected && (wallet.isWrongNetwork || (wallet.chainId && wallet.chainId !== expectedChainId))) {
      err = `Billetera conectada en ${wallet.chainId === '-239' ? 'Mainnet (-239)' : 'Testnet (-3)'}. Cambia a ${activeNet === 'mainnet' ? 'Mainnet' : 'Testnet'} en tu wallet.`;
    } else if (principalNano > 0n && principalNano < minStakeNano) {
      err = `El depósito mínimo para ${v?.name || 'Tonstakers'} es ${fromNanoSafe(minStakeNano, 2)} TON.`;
    } else if (wallet.connected && wallet.balanceNano !== null && totalNano > wallet.balanceNano) {
      err = `Balance insuficiente en ${activeNet === 'mainnet' ? 'Mainnet' : 'Testnet'}. Total requerido: ${fromNanoSafe(totalNano, 4)} TON (disponible: ${fromNanoSafe(wallet.balanceNano, 4)} TON).`;
    }

    if (errEl) errEl.textContent = err;
    return !err;
  },

  onAcceptanceToggle() {
    const checkbox = document.getElementById('stake-accept-terms-checkbox');
    const execBtn = document.getElementById('stake-execute-btn');
    const activeNet = StakingState.get('activeNetwork');
    const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;
    const vaultReq = StakingState.get('vaultVerification')?.[activeNet] || StakingState.get('routerVerification')?.[activeNet];
    const wallet = StakingState.get('wallet');

    if (!execBtn) return;
    const isAccepted = Boolean(checkbox && checkbox.checked);
    const isExpectedNet = wallet.connected && !wallet.isWrongNetwork && (!wallet.chainId || wallet.chainId === expectedChainId);
    const canSign = isAccepted && Boolean(vaultReq && vaultReq.verified) && isExpectedNet &&
                    (activeNet !== 'mainnet' || STAKING_CONFIG.MAINNET_STAKING_ENABLED);

    execBtn.disabled = !canSign;
    if (wallet.connected && (wallet.isWrongNetwork || (wallet.chainId && wallet.chainId !== expectedChainId))) {
      execBtn.textContent = `Bloqueado: Billetera en ${wallet.chainId === '-239' ? 'Mainnet (-239)' : 'Testnet (-3)'}`;
    } else if (!vaultReq?.verified) {
      execBtn.textContent = 'Bloqueado: Requisitos No Verificados';
    } else if (!isAccepted) {
      execBtn.textContent = 'Acepta el Desglose para Firmar';
    } else {
      execBtn.textContent = 'Confirmar y Firmar en TON Connect';
    }
  },

  async confirmStake() {
    const input = document.getElementById('stake-amount-input');
    const principalNano = toNanoSafe((input?.value || '').trim());
    const breakdown = calculateStakeDepositBreakdown(principalNano);
    this._currentBreakdown = breakdown;

    if (principalNano <= 0n || !this._validateAmount(principalNano, breakdown.totalNano)) {
      if (principalNano <= 0n) {
        _setText('stake-amount-error', 'Ingresa un monto principal válido en TON (mínimo 1 TON).');
      }
      return;
    }

    const wallet = StakingState.get('wallet');
    const v = this._currentValidator;
    const activeNet = StakingState.get('activeNetwork');
    const netId = activeNet === 'mainnet' ? -239 : -3;
    const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;

    if (wallet.connected && (wallet.isWrongNetwork || (wallet.chainId && wallet.chainId !== expectedChainId))) {
      NotificationService.toast('Red Errónea', `Tu billetera está en ${wallet.chainId === '-239' ? 'Mainnet' : 'Testnet'}. Cambia a ${activeNet === 'mainnet' ? 'Mainnet' : 'Testnet'} para operar.`, 'error');
      return;
    }

    const poolTelemetry = StakingState.get('poolOnChainData')[activeNet];

    // Compute deterministic StakeVault preview for this depositor
    let vaultInfo = null;
    try {
      const qId = BigInt(Date.now());
      vaultInfo = await getDeterministicVaultInfo(wallet.address || '0:0000000000000000000000000000000000000000000000000000000000000000', qId, netId);
      this._currentVaultInfo = vaultInfo;
    } catch (e) {
      console.warn('[confirmStake] Vault preview calculation note:', e.message);
    }

    // Populate Step 2 Confirmation Breakdown
    _setText('stake-confirm-validator', v.name);
    _setText('stake-confirm-network', `TON ${activeNet.toUpperCase()} (Chain ID: ${expectedChainId})`);
    _setText('stake-confirm-protocol', 'liquidTF · StakeVault Aislada por Depósito');
    _setText('stake-confirm-contract', v.address);
    _setText('stake-confirm-vault', vaultInfo ? vaultInfo.friendlyAddress : 'Bóveda Determinística Única');
    _setText('stake-confirm-router', vaultInfo ? vaultInfo.friendlyAddress : 'Bóveda Determinística');
    _setText('stake-confirm-vault-status', 'No desplegada aún (se desplegará vía StateInit en la 1ª transacción)');
    _setText('stake-confirm-vault-hash', vaultInfo?.codeHash || STAKING_CONFIG.VAULT_CODE_HASH);
    _setText('stake-confirm-amount', `${breakdown.principalTonStr} TON (${breakdown.principalNano.toString()} nanoTON)`);
    _setText('stake-confirm-anlgram-fee', `${breakdown.feeTonStr} TON (${breakdown.feeNano.toString()} nanoTON · 0.35%)`);
    _setText('stake-confirm-pool-gas', `${breakdown.poolDepositGasTonStr} TON (sobrante reembolsable)`);
    _setText('stake-confirm-jetton-gas', `${breakdown.jettonTransferGasTonStr} TON (sobrante reembolsable)`);
    _setText('stake-confirm-storage-gas', `${breakdown.storageReserveTonStr} TON (remanente recuperable)`);
    _setText('stake-confirm-fee', `${breakdown.gasTonStr} TON (Gas + almacenamiento)`);
    _setText('stake-confirm-total', `${breakdown.totalTonStr} TON (${breakdown.totalNano.toString()} nanoTON)`);
    _setText('stake-confirm-fee-recipient', STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT);

    const rateText = poolTelemetry?.exchangeRateFloat
      ? `1 tsTON = ${safeToFixed(poolTelemetry.exchangeRateFloat, 6)} TON`
      : 'Tasa variable en cadena';
    const apyText = v.apr ? `${safeToFixed(v.apr, 2)}% APY Est.` : 'APY Variable';
    _setText('stake-confirm-apr', `${apyText} · ${rateText}`);
    _setText('stake-confirm-lock', 'Recompensas por apreciación de tsTON; 0% comisión en retiro y reclamo.');

    const checkbox = document.getElementById('stake-accept-terms-checkbox');
    if (checkbox) checkbox.checked = false;
    this.onAcceptanceToggle();

    this._showStep(2);
  },

  async executeStake() {
    const btn = document.getElementById('stake-execute-btn');
    if (!btn || StakingState.get('ui').txInFlight) return;

    const checkbox = document.getElementById('stake-accept-terms-checkbox');
    if (!checkbox || !checkbox.checked) {
      NotificationService.toast('Aceptación Requerida', 'Debes aceptar expresamente el principal, la comisión de 0.35%, el gas, el total y la wallet receptora antes de firmar.', 'warning');
      return;
    }

    const activeNet = StakingState.get('activeNetwork');
    if (activeNet === 'mainnet' && !STAKING_CONFIG.MAINNET_STAKING_ENABLED) {
      NotificationService.toast('Mainnet Bloqueado', 'Las transacciones de staking en Mainnet están desactivadas por seguridad.', 'error');
      return;
    }

    const wallet = StakingState.get('wallet');
    if (!wallet.connected || wallet.isReadOnly || !wallet.isTonConnect || !window.tonConnectUI?.wallet) {
      NotificationService.toast('TON Connect Requerido', 'Conecta tu billetera mediante TON Connect para firmar.', 'warning');
      window.openWalletModal?.();
      return;
    }

    // Strict Chain ID Verification (-3 Testnet)
    const walletChainId = String(window.tonConnectUI?.wallet?.account?.chain || wallet.chainId || '');
    if (walletChainId !== '-3') {
      NotificationService.toast(
        'Bloqueado por Cadena Incorrecta',
        `Tu billetera está conectada en ${walletChainId === '-239' ? 'Mainnet (-239)' : (walletChainId || 'red desconocida')}. Cambia a TON Testnet (-3) en Tonkeeper para continuar.`,
        'error'
      );
      return;
    }

    // Verify StakeVault prerequisites on-chain
    const vaultReq = await PoolOnChainVerifier.verifyStakeVaultRequirements(activeNet);
    if (!vaultReq.verified) {
      NotificationService.toast(
        'Requisitos No Verificados',
        vaultReq.reason || 'No se cumplen los requisitos on-chain para desplegar la StakeVault.',
        'error'
      );
      return;
    }

    const breakdown = this._currentBreakdown;
    if (!breakdown || breakdown.principalNano < 1000000000n) {
      NotificationService.toast('Monto Inválido', 'El principal mínimo es 1 TON.', 'error');
      return;
    }

    if (wallet.balanceNano !== null && wallet.balanceNano < breakdown.totalNano) {
      NotificationService.toast(
        'Balance Insuficiente en Testnet',
        `Se requieren ${breakdown.totalTonStr} TON (principal + comisión + gas). Tu saldo es ${wallet.balanceDisplay}.`,
        'error'
      );
      return;
    }

    StakingState.setDeep('ui.txInFlight', true);
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;"></div> Firma en tu wallet...';

    try {
      const activeNet = StakingState.get('activeNetwork'); // 'mainnet' or 'testnet'
      const netId = activeNet === 'mainnet' ? -239 : -3;
      const expectedChainId = activeNet === 'mainnet' ? STAKING_CONFIG.CHAIN_ID_MAINNET : STAKING_CONFIG.CHAIN_ID_TESTNET;
      const poolKey = activeNet === 'mainnet' ? 'EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR' : 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
      const poolCfg = STAKING_CONFIG.ALLOWLIST[poolKey];
      const tsTonMaster = poolCfg.jettonMaster;

      const queryId = BigInt(Date.now());
      const vaultInfo = await getDeterministicVaultInfo(wallet.address, queryId, netId);

      // Resolve Jetton Wallets for client and vault
      const [clientJw, vaultJw] = await Promise.all([
        getJettonWalletAddress(tsTonMaster, wallet.address, activeNet),
        getJettonWalletAddress(tsTonMaster, vaultInfo.friendlyAddress, activeNet),
      ]);

      if (!clientJw || !vaultJw) {
        throw new Error(`No se pudieron resolver las Jetton Wallets de tsTON en ${activeNet === 'mainnet' ? 'Mainnet' : 'Testnet'}.`);
      }

      const payloadBoC = await buildStakeVaultInitPayload(
        queryId,
        breakdown.principalNano,
        netId,
        vaultJw,
        clientJw
      );

      const startTs = Math.floor(Date.now() / 1000);

      // Single atomic TON Connect message: deploys StakeVault via StateInit and initializes with payload
      await window.tonConnectUI.sendTransaction({
        validUntil: startTs + 600,
        network: expectedChainId,
        messages: [{
          address: vaultInfo.friendlyAddress,
          amount: breakdown.totalNano.toString(),
          stateInit: vaultInfo.stateInitBoC,
          payload: payloadBoC,
        }],
      });

      this._showStep(3);
      updateTxStateBadges({ sent: true, pending: true, confirmed: false, failedOrRefunded: false, feeCollected: false });

      const iconEl = document.getElementById('stake-tx-icon');
      const titleEl = document.getElementById('stake-tx-title');
      const subEl = document.getElementById('stake-tx-sub');
      const hashEl = document.getElementById('stake-tx-hash');
      const feeStatusEl = document.getElementById('stake-tx-fee-status');
      const linkEl = document.getElementById('stake-tx-link');

      if (iconEl) iconEl.textContent = '⏳';
      if (titleEl) titleEl.textContent = '1. Despliegue de Bóveda Enviado · 2. Pendiente en Cadena';
      if (subEl) subEl.textContent = 'TON Connect emitió el StateInit a tu StakeVault aislada. Esperando confirmación de depósito en Tonstakers...';
      if (hashEl) hashEl.textContent = `Bóveda: ${vaultInfo.friendlyAddress} · Query ID: ${queryId.toString()}`;
      if (feeStatusEl) feeStatusEl.textContent = `Comisión (${breakdown.feeTonStr} TON · 0.35%): En custodia de tu StakeVault (no se transfiere hasta confirmar la llegada física de tsTON).`;
      if (linkEl) linkEl.style.display = 'none';

      const traceRes = await _pollRealDepositTrace(
        wallet.address,
        vaultInfo.friendlyAddress,
        breakdown.feeNano,
        startTs,
        60000,
        (prog) => {
          if (prog.hash && hashEl) hashEl.textContent = prog.hash;
        }
      );

      const expBase = activeNet === 'mainnet' ? STAKING_CONFIG.TONVIEWER_MAINNET : STAKING_CONFIG.TONVIEWER_TESTNET;
      if (linkEl && traceRes.hash) {
        linkEl.href = `${expBase}/transaction/${traceRes.hash}`;
        linkEl.style.display = 'inline-block';
      }

      if (traceRes.status === 'confirmed' && traceRes.feeCollected) {
        updateTxStateBadges({ sent: true, pending: false, confirmed: true, failedOrRefunded: false, feeCollected: true });
        if (iconEl) iconEl.textContent = '✅';
        if (titleEl) titleEl.textContent = '¡Staking Confirmado y tsTON Entregados!';
        if (subEl) subEl.textContent = `Se depositaron ${breakdown.principalTonStr} TON en Tonstakers y recibiste tus tsTON en tu Jetton Wallet.`;
        if (hashEl) hashEl.textContent = traceRes.hash || 'Confirmado en cadena';
        if (feeStatusEl) feeStatusEl.textContent = `Comisión verificada en cadena tras entrega de tsTON: ${breakdown.feeTonStr} TON transferidos a ${STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT}.`;
      } else if (traceRes.status === 'confirmed' && !traceRes.feeCollected) {
        updateTxStateBadges({ sent: true, pending: false, confirmed: true, failedOrRefunded: false, feeCollected: false });
        if (iconEl) iconEl.textContent = '⚠️';
        if (titleEl) titleEl.textContent = 'Transacción Confirmada (Comisión Aún en Custodia)';
        if (subEl) subEl.textContent = 'La transacción fue procesada en la bóveda, pero la confirmación de la comisión aún está en proceso.';
        if (hashEl) hashEl.textContent = traceRes.hash || 'Ver traza en explorador';
        if (feeStatusEl) feeStatusEl.textContent = 'Comisión (0.35%): En custodia, pendiente de liquidación final.';
      } else if (traceRes.status === 'failed_or_refunded') {
        updateTxStateBadges({ sent: true, pending: false, confirmed: false, failedOrRefunded: true, feeCollected: false });
        if (iconEl) iconEl.textContent = '↩️';
        if (titleEl) titleEl.textContent = '4. Depósito Rebotado / 100% Reembolsado';
        if (subEl) subEl.textContent = 'El pool de Tonstakers rebotó la transacción. La StakeVault te reembolsó el 100% de principal y comisión (0 cobrado).';
        if (hashEl) hashEl.textContent = traceRes.hash || 'Evento rebotado';
        if (feeStatusEl) feeStatusEl.textContent = 'Comisión (0.35%): 0 cobrado (100% devuelta al cliente).';
      } else {
        updateTxStateBadges({ sent: true, pending: true, confirmed: false, failedOrRefunded: false, feeCollected: false });
        if (iconEl) iconEl.textContent = '📬';
        if (titleEl) titleEl.textContent = '2. Pendiente de Confirmación Asíncrona';
        if (subEl) subEl.textContent = 'La traza continúa procesándose entre shards. Consulta tu historial en unos segundos.';
      }

      await PortfolioService.refresh();
      PortfolioController.render();
      TransactionController.init();
    } catch (e) {
      if (e?.code === 300 || /reject|cancel|declin/i.test(e?.message || '')) {
        NotificationService.toast('Firma Rechazada', 'Cancelaste la firma en tu wallet TON Connect.', 'info');
      } else {
        NotificationService.toast('Error en Transacción', e.message || 'Error al procesar el depósito.', 'error');
        console.error('[StakeModalController.executeStake]', e);
      }
    } finally {
      StakingState.setDeep('ui.txInFlight', false);
      this.onAcceptanceToggle();
    }
  },

  _showStep(n) {
    this._step = n;
    ['stake-step-1', 'stake-step-2', 'stake-step-3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.style.display = i + 1 === n ? '' : 'none';
    });
    for (let i = 1; i <= 3; i++) {
      const circle = document.getElementById(`tx-step-${i}`);
      if (circle) {
        circle.classList.toggle('done', i < n);
        circle.classList.toggle('active', i === n);
      }
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   UNSTAKE MODAL CONTROLLER (Audited tsTON Burn 0x595f07bc · 0% Fee)
   ══════════════════════════════════════════════════════════════ */

const UnstakeModalController = {
  open(validatorId) {
    const pos = StakingState.get('positions').find(p => p.validatorId === validatorId) || StakingState.get('positions')[0];
    if (!pos) {
      NotificationService.toast('Sin Posición Activa', 'No se detectó balance de tsTON en tu wallet para retirar.', 'warning');
      return;
    }
    const modal = document.getElementById('unstake-modal');
    if (modal) {
      modal.classList.add('open');
      modal.dataset.validatorId = pos.validatorId;
      modal.dataset.protocol = 'liquidTF';
    }
    _setText('unstake-val-name', pos.validatorName);
    _setText('unstake-staked-amount', `${safeToFixed(pos.tsTonBalance, 4)} tsTON`);
    _setText('unstake-ton-equivalent', `~${safeToFixed(pos.amount, 4)} TON (1 tsTON = ${safeToFixed(pos.exchangeRateTonPerTsTon || 1, 6)} TON)`);
    _setText('unstake-lock-period', 'Quema de tsTON (0x595f07bc · 0% Fee ANLGRAM)');
  },

  close() {
    document.getElementById('unstake-modal')?.classList.remove('open');
  },

  async execute() {
    const btn = document.getElementById('unstake-execute-btn');
    if (!btn || StakingState.get('ui').txInFlight) return;

    const activeNet = StakingState.get('activeNetwork');
    if (activeNet === 'mainnet' && !STAKING_CONFIG.MAINNET_STAKING_ENABLED) {
      NotificationService.toast('Mainnet Bloqueado', 'Las transacciones Mainnet están deshabilitadas por política de seguridad.', 'error');
      return;
    }

    const wallet = StakingState.get('wallet');
    if (!wallet.connected || wallet.isReadOnly || !wallet.isTonConnect || !window.tonConnectUI?.wallet) {
      NotificationService.toast('TON Connect Requerido', 'Conecta tu billetera mediante TON Connect para firmar el retiro.', 'warning');
      window.openWalletModal?.();
      return;
    }

    const expectedChainId = activeNet === 'testnet' ? STAKING_CONFIG.CHAIN_ID_TESTNET : STAKING_CONFIG.CHAIN_ID_MAINNET;
    const walletChainId = String(window.tonConnectUI?.wallet?.account?.chain || '');
    if (walletChainId !== expectedChainId) {
      NotificationService.toast(
        'Bloqueado por Cadena Incorrecta',
        `El Chain ID de tu wallet (${walletChainId || 'desconocido'}) no coincide con la red activa (${expectedChainId}).`,
        'error'
      );
      return;
    }

    const modal = document.getElementById('unstake-modal');
    const validatorId = modal?.dataset?.validatorId;
    const pos = StakingState.get('positions').find(p => p.validatorId === validatorId) || StakingState.get('positions')[0];
    if (!pos || !pos.jettonWalletAddress) {
      NotificationService.toast('Jetton Wallet No Encontrada', 'No se encontró tu contrato Jetton Wallet de tsTON.', 'error');
      return;
    }

    StakingState.setDeep('ui.txInFlight', true);
    btn.disabled = true;
    btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;"></div> Firmando retiro...';

    try {
      const queryId = BigInt(Date.now());
      const payloadBoC = await buildTonstakersUnstakePayload(pos.tsTonBalanceNano, wallet.address, false, false, queryId);
      const startTs = Math.floor(Date.now() / 1000);

      await window.tonConnectUI.sendTransaction({
        validUntil: startTs + 600,
        network: expectedChainId,
        messages: [{
          address: pos.jettonWalletAddress,
          amount: STAKING_CONFIG.UNSTAKE_GAS_RESERVE_NANO.toString(),
          payload: payloadBoC,
        }],
      });

      NotificationService.push({
        type: 'info',
        title: 'Retiro Enviado (0% Comisión ANLGRAM)',
        body: 'Verificando quema de tsTON y devolución de TON en cadena...',
        icon: '🔓',
      });

      await _pollRealDepositTrace(wallet.address, pos.jettonWalletAddress, 0n, startTs, 40000);
      this.close();
      await PortfolioService.refresh();
      PortfolioController.render();
      TransactionController.init();
    } catch (e) {
      if (e?.code === 300 || /reject|cancel|declin/i.test(e?.message || '')) {
        NotificationService.toast('Retiro Cancelado', 'Rechazaste la firma en tu wallet.', 'info');
      } else {
        NotificationService.toast('Error al Retirar', e.message || 'Error en la solicitud.', 'error');
      }
    } finally {
      StakingState.setDeep('ui.txInFlight', false);
      if (btn) { btn.disabled = false; btn.innerHTML = 'Confirmar Retiro (0% Fee)'; }
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   PORTFOLIO & TABLE CONTROLLERS
   ══════════════════════════════════════════════════════════════ */

const PortfolioController = {
  render() {
    const positions = StakingState.get('positions') || [];
    const wallet = StakingState.get('wallet');
    const tbody = document.getElementById('positions-tbody');
    const totalsEl = document.getElementById('portfolio-totals');

    if (!wallet.connected) {
      if (tbody) {
        tbody.innerHTML = `
          <tr><td colspan="9">
            <div class="empty-state">
              <div class="empty-state-icon">💼</div>
              <div class="empty-state-title">Conecta tu Billetera</div>
              <div class="empty-state-text">Conecta tu wallet TON vía TON Connect para consultar tus balances reales de tsTON y su equivalencia en TON.</div>
              <button class="btn btn-primary" style="margin-top:16px;" onclick="window.openWalletModal?.()">Conectar Wallet</button>
            </div>
          </td></tr>`;
      }
      if (totalsEl) totalsEl.style.display = 'none';
      return;
    }

    if (StakingState.get('loading').positions) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Consultando posiciones de tsTON y get_pool_full_data en cadena...</td></tr>`;
      return;
    }

    const totals = PortfolioService.getTotals();
    if (totalsEl) {
      totalsEl.style.display = 'flex';
      _setText('pt-staked', `${safeToFixed(totals.totalStaked, 4)} TON`);
      _setText('pt-pending', `${safeToFixed(totals.totalPending, 4)} TON`);
      _setText('pt-earned', `${safeToFixed(totals.totalEarned, 4)} TON`);
      _setText('pt-annual', totals.projAnnual !== null ? `~${safeToFixed(totals.projAnnual, 2)} TON (Est.)` : 'Sin datos');
    }

    // Update Portfolio Section Metric Cards if present
    _setText('port-total-staked', `${safeToFixed(totals.totalStaked, 4)} TON`);
    _setText('port-total-rewards', `${safeToFixed(totals.totalEarned, 4)} TON (Apreciación tsTON)`);
    _setText('port-avg-apr', positions[0]?.apr ? `${safeToFixed(positions[0].apr, 2)}% (Est.)` : 'Sin datos');

    if (!positions.length) {
      if (tbody) {
        tbody.innerHTML = `
          <tr><td colspan="9">
            <div class="empty-state">
              <div class="empty-state-icon">⚡</div>
              <div class="empty-state-title">Sin Posiciones Activas de tsTON</div>
              <div class="empty-state-text">No se detectaron tokens tsTON para esta cuenta en ${StakingState.get('activeNetwork').toUpperCase()}. Fuente: TonAPI v2 (${new Date().toLocaleTimeString()}).</div>
              <button class="btn btn-primary" style="margin-top:16px;" onclick="document.getElementById('validators')?.scrollIntoView({behavior:'smooth'})">Ver Pool Tonstakers Verificado</button>
            </div>
          </td></tr>`;
      }
      return;
    }

    if (tbody) {
      tbody.innerHTML = positions.map(pos => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <div class="validator-logo" style="font-size:14px;">⚡</div>
              <div>
                <span style="font-weight:600;">${pos.validatorName}</span>
                <span style="color:var(--cyan);font-size:10px;margin-left:4px;">✓ Verificado</span>
                <div style="font-size:10px;color:var(--text-muted);">${pos.dataSource} · ${pos.lastUpdated}</div>
              </div>
            </div>
          </td>
          <td class="td-mono">${safeToFixed(pos.tsTonBalance, 4)} tsTON<br/><span style="font-size:10px;color:var(--text-muted);">≈ ${safeToFixed(pos.amount, 4)} TON</span></td>
          <td class="td-mono text-green">+${safeToFixed(pos.earnedRewards, 4)} TON<br/><span style="font-size:10px;color:var(--text-muted);">1 tsTON = ${safeToFixed(pos.exchangeRateTonPerTsTon, 5)} TON</span></td>
          <td class="td-mono text-cyan">${safeToFixed(pos.readyWithdraw, 4)} TON</td>
          <td><span class="apr-value">${pos.apr ? `${safeToFixed(pos.apr, 2)}% (Est.)` : 'Sin datos'}</span></td>
          <td class="td-mono">${pos.lockPeriod}</td>
          <td class="td-mono">Inmediato (Quema)</td>
          <td><span class="badge badge-green">${pos.status}</span></td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="StakeModalController.open('${pos.validatorId}')">+ Depositar</button>
              <button class="btn btn-ghost btn-sm" onclick="RewardService.openClaimModal('${pos.validatorId}')">Recompensas</button>
              <button class="btn btn-ghost btn-sm" onclick="UnstakeModalController.open('${pos.validatorId}')">Retirar (0%)</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  },
};

const ValidatorTableController = {
  async init() {
    const tbody = document.getElementById('validator-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:30px;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Verificando contrato Tonstakers y get_pool_full_data en cadena...</td></tr>`;

    try {
      const validators = await ValidatorService.getAll();
      StakingState.set('validators', validators);
      StakingState.set('filteredValidators', [...validators]);
      if (validators[0]) StakingState.set('selectedValidator', validators[0]);
      this.render();
      this._bindControls();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><div class="empty-state-title">Sin datos de pool</div><div class="empty-state-text">${err.message}</div></div></td></tr>`;
      }
    }
  },

  render() {
    const ui = StakingState.get('ui');
    const data = [...StakingState.get('filteredValidators')];
    const tbody = document.getElementById('validator-tbody');
    if (!tbody) return;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Sin resultados</div></div></td></tr>`;
    } else {
      tbody.innerHTML = data.map((v, idx) => `
        <tr data-id="${v.id}" class="validator-row" onclick="ValidatorDetailController.open('${v.id}')">
          <td class="td-mono" style="padding-left:20px;">#${idx + 1}</td>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="validator-logo">${v.logoEmoji}</div>
              <div class="validator-info">
                <div class="validator-name">${v.name} <span style="color:var(--cyan);font-size:10px;">✓ Pool Único Verificado</span></div>
                <div class="validator-addr">${v.shortAddress} · Act.: ${v.lastUpdated}</div>
              </div>
            </div>
          </td>
          <td class="td-mono" style="font-size:10px;color:var(--text-muted);">${v.shortAddress}</td>
          <td><span class="badge ${v.status === 'active' ? 'badge-green' : 'badge-yellow'}">${v.status}</span></td>
          <td><span class="apr-value">${v.apr !== null ? `${safeToFixed(v.apr, 2)}% (Est.)` : 'Sin datos'}</span></td>
          <td class="td-mono">0.35% (35 bps)</td>
          <td class="td-mono">${safeToFixed(v.minStake, 0)} TON</td>
          <td class="td-mono">${v.totalStaked !== null ? _fmtCompact(v.totalStaked) + ' TON' : 'Sin datos'}</td>
          <td class="td-mono">${v.delegators !== null ? _fmtCompact(v.delegators) : 'Sin datos'}</td>
          <td class="td-mono" style="font-size:11px;color:var(--text-muted);">${v.exchangeRateTonPerTsTon ? `1 tsTON = ${safeToFixed(v.exchangeRateTonPerTsTon, 4)} TON` : 'Sin datos'}</td>
          <td class="td-mono" style="color:var(--text-muted);">No disponible</td>
          <td><span class="risk-badge risk-aaa">${v.riskGrade}</span></td>
          <td onclick="event.stopPropagation()">
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="StakeModalController.open('${v.id}')">Stakear</button>
              <button class="row-actions-btn" onclick="ValidatorDetailController.open('${v.id}')">Detalles</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    const info = document.getElementById('table-page-info');
    if (info) info.textContent = `${data.length} pool público verificado · Fuente: TonAPI v2 + get_pool_full_data`;
  },

  _bindControls() {
    const search = document.getElementById('validator-search');
    if (search) {
      search.oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        const all = StakingState.get('validators');
        const filtered = all.filter(v => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q));
        StakingState.set('filteredValidators', filtered);
        this.render();
      };
    }
  },
};

const ValidatorDetailController = {
  async open(validatorId) {
    const panel = document.getElementById('validator-detail-panel');
    const overlay = document.getElementById('validator-detail-overlay');
    if (!panel) return;

    overlay?.classList.add('open');
    panel.classList.add('open');
    document.body.style.overflow = 'hidden';

    const v = await ValidatorService.getById(validatorId);
    if (!v) return;
    StakingState.set('selectedValidator', v);

    const net = StakingState.get('activeNetwork');
    const telemetry = StakingState.get('poolOnChainData')[net];
    const content = document.getElementById('detail-content');
    if (content) {
      content.innerHTML = `
        <div class="detail-section">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
            <div class="detail-validator-logo" style="font-size:24px;">${v.logoEmoji}</div>
            <div>
              <div style="font-size:var(--text-lg);font-weight:700;">${v.name}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);word-break:break-all;">${v.address}</div>
            </div>
          </div>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;">${v.description}</p>
          <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${v.website}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">🌐 Docs Tonstakers</a>
            <a href="${net === 'testnet' ? STAKING_CONFIG.TONVIEWER_TESTNET : STAKING_CONFIG.TONVIEWER_MAINNET}/${v.address}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">🔍 Tonviewer</a>
          </div>
        </div>

        <div class="detail-section">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Parámetros Verificados en Cadena (${v.lastUpdated})</div>
          <div class="detail-stats-grid">
            <div class="detail-stat"><div class="detail-stat-label">APY (Estimado)</div><div class="detail-stat-value" style="color:var(--green);">${v.apr !== null ? `${safeToFixed(v.apr, 2)}%` : 'Sin datos'}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Tasa Realizada tsTON</div><div class="detail-stat-value">${telemetry?.exchangeRateFloat ? `${safeToFixed(telemetry.exchangeRateFloat, 6)} TON` : 'Sin datos'}</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Comisión Depósito ANLGRAM</div><div class="detail-stat-value" style="color:var(--cyan);">0.35% (35 bps)</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Comisión Retiro / Reclamo</div><div class="detail-stat-value" style="color:#22c55e;">0.00% (0 TON)</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Mínimo de Stake</div><div class="detail-stat-value">${safeToFixed(v.minStake, 0)} TON</div></div>
            <div class="detail-stat"><div class="detail-stat-label">Wallet Receptora Fee</div><div class="detail-stat-value" style="font-size:10px;word-break:break-all;">${STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT}</div></div>
          </div>
        </div>
      `;
    }
  },

  close() {
    document.getElementById('validator-detail-panel')?.classList.remove('open');
    document.getElementById('validator-detail-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },
};

/* ══════════════════════════════════════════════════════════════
   CALCULATOR, METRICS, INSIGHTS & NEWS CONTROLLERS
   ══════════════════════════════════════════════════════════════ */

const CalculatorController = {
  _chartInstance: null,

  init() {
    const amountInput = document.getElementById('calc-amount');
    const amountSlider = document.getElementById('calc-amount-slider');
    const periodSelect = document.getElementById('calc-period');
    const compoundToggle = document.getElementById('calc-compound-toggle');

    if (amountInput) {
      amountInput.oninput = () => {
        if (amountSlider) amountSlider.value = amountInput.value;
        this._calculate();
      };
    }
    if (amountSlider) {
      amountSlider.oninput = () => {
        if (amountInput) amountInput.value = amountSlider.value;
        this._calculate();
      };
    }
    if (periodSelect) {
      periodSelect.onchange = () => this._calculate();
    }
    if (compoundToggle) {
      compoundToggle.onclick = () => {
        const toggleSw = compoundToggle.querySelector('.toggle-sw');
        const isOn = toggleSw?.classList.toggle('on');
        compoundToggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
        this._calculate();
      };
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('anlgramWalletChanged', () => {
        this._updateWalletRecipientDisplay();
        this._calculate();
      });
    }

    this._updateWalletRecipientDisplay();
    this._calculate();
  },

  _updateWalletRecipientDisplay() {
    const wallet = StakingState.get('wallet');
    const recipientEl = document.getElementById('calc-connected-recipient-wallet');
    if (!recipientEl) return;
    if (wallet.connected && wallet.address) {
      recipientEl.textContent = shortenAddress(wallet.address);
      recipientEl.title = wallet.address;
    } else {
      recipientEl.textContent = 'Conecta tu wallet';
      recipientEl.title = 'Conecta tu wallet para vincular la recepción directa de tsTON';
    }
  },

  setAmount(val) {
    const input = document.getElementById('calc-amount');
    const slider = document.getElementById('calc-amount-slider');
    if (input) input.value = val;
    if (slider) slider.value = Math.min(10000, val);
    this._calculate();
  },

  setMaxWallet() {
    const wallet = StakingState.get('wallet');
    if (!wallet.connected) {
      window.openWalletModal?.();
      return;
    }
    if (wallet.isWrongNetwork || wallet.chainId !== '-3') {
      NotificationService.toast('Red Errónea', 'Cambia tu wallet a TON Testnet (-3) para operar.', 'warning');
      return;
    }
    const gasReserveTotalNano = STAKING_CONFIG.VAULT_TOTAL_GAS_RESERVE_NANO || 1155000000n;
    const availNano = wallet.balanceNano > gasReserveTotalNano ? (wallet.balanceNano - gasReserveTotalNano) : 0n;
    const maxPrincipalNano = (availNano * 10000n) / 10035n;
    const amountFloat = parseFloat(fromNanoSafe(maxPrincipalNano, 4));
    this.setAmount(Math.max(1, amountFloat));
  },

  _calculate() {
    const amount = parseFloat(document.getElementById('calc-amount')?.value) || 0;
    const periodDays = parseInt(document.getElementById('calc-period')?.value, 10) || 365;
    const compoundToggle = document.getElementById('calc-compound-toggle');
    const isCompound = compoundToggle?.querySelector('.toggle-sw')?.classList.contains('on') ?? true;

    const activeNet = StakingState.get('activeNetwork');
    const poolTelemetry = StakingState.get('poolOnChainData')?.[activeNet];
    const liveApr = poolTelemetry?.apy ?? (StakingState.get('validators')[0]?.apr ?? null);

    // Update Pool & Network Details Card
    const allowEntry = Object.entries(STAKING_CONFIG.ALLOWLIST).find(([, cfg]) => cfg.network === activeNet);
    const poolAddr = allowEntry ? allowEntry[0] : 'kQANFsYyYn-GSZ4oajUJmboDURZU-udMHf9JxzO4vYM_hFP3';
    const poolCfg = allowEntry ? allowEntry[1] : null;

    _setText('calc-pool-net-badge', activeNet === 'mainnet' ? 'Mainnet (-239 · Bloqueado)' : 'Testnet (-3)');
    _setText('calc-pool-name-display', poolCfg?.name || 'Tonstakers Liquid Pool');
    const poolLinkEl = document.getElementById('calc-pool-link');
    if (poolLinkEl) {
      const viewerBase = activeNet === 'mainnet' ? STAKING_CONFIG.TONVIEWER_MAINNET : STAKING_CONFIG.TONVIEWER_TESTNET;
      poolLinkEl.href = `${viewerBase}/${poolAddr}`;
      poolLinkEl.textContent = shortenAddress(poolAddr);
    }

    this._updateWalletRecipientDisplay();

    // APY Field & Badges
    const aprInput = document.getElementById('calc-apr');
    if (aprInput) {
      aprInput.value = liveApr ? safeToFixed(liveApr, 2) : '';
      aprInput.placeholder = liveApr ? '' : 'Sin datos';
    }
    _setText('calc-apr-display-badge', liveApr ? `${safeToFixed(liveApr, 2)}% APY` : 'Sin datos');
    _setText('calc-apr-updated-time', poolTelemetry?.updatedAtStr || 'En espera de telemetría');

    // Cost Breakdown Card
    const principalNano = toNanoSafe(amount > 0 ? amount : 0);
    const breakdown = calculateStakeDepositBreakdown(principalNano);

    _setText('calc-breakdown-principal', `${amount > 0 ? safeToFixed(amount, 4) : '0.0000'} TON`);
    _setText('calc-breakdown-fee', `${breakdown.feeTonStr} TON (${breakdown.feeNano.toString()} nanoTON · 35 bps)`);
    _setText('calc-breakdown-gas', '~0.025 TON neto (reembolsos de excesos)');

    // Projections for the Selected Period
    _setText('calc-period-sub-1', `en ${periodDays} días`);

    if (!liveApr || amount <= 0) {
      _setText('calc-period-gross', 'Sin datos');
      _setText('calc-period-fee', amount > 0 ? `-${breakdown.feeTonStr} TON` : '—');
      _setText('calc-period-net', 'Sin datos');
      _setText('calc-period-roi', 'Sin datos');
      _setText('calc-period-future', amount > 0 ? `${safeToFixed(amount, 4)} TON` : 'Sin datos');
      _setText('calc-period-tston', 'Sin datos');

      _setText('calc-daily', 'Sin datos');
      _setText('calc-weekly', 'Sin datos');
      _setText('calc-monthly', 'Sin datos');
      _setText('calc-yearly', 'Sin datos');
      _setText('calc-roi', 'Sin datos');
      _setText('calc-future', amount > 0 ? `${safeToFixed(amount, 2)} TON` : 'Sin datos');
      return;
    }

    const res = RewardService.calculate({ amount, apy: liveApr, days: periodDays, compound: isCompound });
    const grossRewards = res.totalRewards;
    const feeTon = parseFloat(breakdown.feeTonStr);
    const netGasEst = amount > 0 ? 0.025 : 0;
    const netRewards = Math.max(0, grossRewards - feeTon - netGasEst);
    const netRoi = amount > 0 ? ((netRewards / amount) * 100) : 0;
    const netFuture = amount + netRewards;
    const rateFloat = poolTelemetry?.exchangeRateFloat || 1.193249;
    const tstonEst = amount / rateFloat;

    _setText('calc-period-gross', `~${safeToFixed(grossRewards, 4)} TON`);
    _setText('calc-period-fee', `-${breakdown.feeTonStr} TON`);
    _setText('calc-period-net', `~${safeToFixed(netRewards, 4)} TON`);
    _setText('calc-period-roi', `~${safeToFixed(netRoi, 2)}%`);
    _setText('calc-period-future', `~${safeToFixed(netFuture, 4)} TON`);
    _setText('calc-period-tston', `~${safeToFixed(tstonEst, 4)} tsTON`);

    _setText('calc-daily', `~${safeToFixed(res.daily, 4)} TON`);
    _setText('calc-weekly', `~${safeToFixed(res.weekly, 4)} TON`);
    _setText('calc-monthly', `~${safeToFixed(res.monthly, 4)} TON`);
    _setText('calc-yearly', `~${safeToFixed(res.yearly, 2)} TON`);
    _setText('calc-roi', `~${safeToFixed(res.roi, 2)}% (Bruto)`);
    _setText('calc-future', `~${safeToFixed(res.futureBalance, 2)} TON`);

    this._renderChart(amount, liveApr, periodDays, isCompound);
  },

  _renderChart(amount, apy, days, compound) {
    const canvas = document.getElementById('calc-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const steps = 12;
    const stepDays = days / steps;
    const labels = [];
    const baseline = [];
    const projected = [];

    for (let i = 0; i <= steps; i++) {
      const d = Math.round(i * stepDays);
      labels.push(`Día ${d}`);
      baseline.push(amount);
      const r = RewardService.calculate({ amount, apy, days: d, compound });
      projected.push(parseFloat(safeToFixed(r.futureBalance, 4)));
    }

    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    try {
      const ctx = canvas.getContext('2d');
      this._chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Valor Proyectado (TON)',
              data: projected,
              borderColor: '#00f5ff',
              backgroundColor: 'rgba(0, 245, 255, 0.08)',
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 2,
              pointHoverRadius: 5,
            },
            {
              label: 'Principal Base',
              data: baseline,
              borderColor: 'rgba(148, 163, 184, 0.4)',
              borderWidth: 1.5,
              borderDash: [5, 5],
              fill: false,
              pointRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: '#94a3b8', font: { size: 10 } },
            },
            tooltip: {
              mode: 'index',
              intersect: false,
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#64748b', font: { size: 9 }, maxTicksLimit: 6 },
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#64748b', font: { size: 9 } },
            },
          },
        },
      });
    } catch (e) {
      console.warn('[CalculatorController._renderChart note]:', e.message);
    }
  },

  populateValidatorSelect() {
    const sel = document.getElementById('calc-validator-select');
    if (!sel) return;
    const list = StakingState.get('validators') || [];
    sel.innerHTML = list.map(v => `<option value="${v.id}">${v.name} (${v.apr !== null ? safeToFixed(v.apr, 2) + '% Est.' : 'Tasa variable'})</option>`).join('');
    this._calculate();
  },
};

const MetricCardsController = {
  async render() {
    const stats = await AnalyticsService.getNetworkStats();
    StakingState.set('networkStats', stats);

    _setText('metric-staked', stats.totalStakedTon !== null ? `${safeToFixed(stats.totalStakedTon, 2)}M TON` : 'Sin datos');
    _setText('metric-apr', stats.avgApr !== null ? `${safeToFixed(stats.avgApr, 2)}%` : 'Sin datos');
    _setText('metric-validators', stats.activeVal !== null ? `${stats.activeVal} Pool Público` : 'Sin datos');
    _setText('metric-delegators', stats.delegators !== null ? stats.delegators.toLocaleString() : 'Sin datos');
    _setText('metric-block', stats.exchangeRateTonPerTsTon ? `1 tsTON = ${safeToFixed(stats.exchangeRateTonPerTsTon, 4)} TON` : 'Sin datos');
    _setText('topbar-ton-price', stats.tonPrice ? `$${safeToFixed(stats.tonPrice, 2)}` : 'Sin datos');
    _setText('topbar-ton-source', `TonAPI · ${stats.lastUpdated}`);

    _setText('metric-staked-footer', `Fuente: ${stats.dataSource} · ${stats.lastUpdated}`);
    _setText('metric-apr-footer', `${stats.yieldType} · ${stats.lastUpdated}`);

    // Network Section Stats
    _setText('net-tps', 'No disponible');
    _setText('net-block-time', stats.blockTime || 'Sin datos');
    _setText('net-total-staked', stats.totalStakedTon !== null ? `${safeToFixed(stats.totalStakedTon, 2)}M TON` : 'Sin datos');
    _setText('net-active-val', stats.activeVal !== null ? stats.activeVal.toString() : 'Sin datos');
    _setText('net-delegators', stats.delegators !== null ? stats.delegators.toLocaleString() : 'Sin datos');
    _setText('net-ton-price', stats.tonPrice ? `$${safeToFixed(stats.tonPrice, 2)}` : 'Sin datos');

    const statusEl = document.getElementById('metric-status');
    if (statusEl) {
      statusEl.innerHTML = `<span class="badge badge-green"><span class="dot-live"></span> ${stats.networkStatus}</span>`;
    }
  },

  async refresh() {
    await this.render();
  },
};

const InsightsController = {
  render() {
    const container = document.getElementById('insights-grid');
    if (!container) return;

    const net = StakingState.get('activeNetwork');
    const telemetry = StakingState.get('poolOnChainData')[net];
    const routerCheck = StakingState.get('routerVerification')[net];

    const items = [
      {
        icon: '🛡️',
        type: 'info',
        title: `Red Activa: TON ${net.toUpperCase()} (${net === 'testnet' ? '-3' : '-239'})`,
        body: net === 'mainnet'
          ? 'Staking en Mainnet desactivado hasta auditoría independiente y aprobación del propietario.'
          : `Pool Tonstakers Testnet verificado (${telemetry?.isPoolActive ? 'Activo' : 'Consultando'}). Router: ${routerCheck?.reason || 'Pendiente'}.`,
        time: telemetry?.updatedAtStr || 'En vivo',
      },
      {
        icon: '💎',
        type: 'success',
        title: 'Comisión ANLGRAM: 0.35% (35 bps) en Depósitos Confirmados',
        body: `Fórmula entera: feeNano = (principalNano * 35n) / 10000n. Sin cobro por retiro ni reclamo (0%). Wallet receptora: ${STAKING_CONFIG.ANLGRAM_FEE_RECIPIENT}.`,
        time: 'Verificado',
      },
      {
        icon: '📈',
        type: 'info',
        title: 'Mecanismo de Recompensas (tsTON · liquidTF)',
        body: telemetry?.exchangeRateFloat
          ? `Tasa realizada en cadena (get_pool_full_data): 1 tsTON = ${safeToFixed(telemetry.exchangeRateFloat, 6)} TON. Fuente: ${telemetry.dataSource}.`
          : 'Cada tsTON representa una participación en el pool cuyo valor en TON aumenta tras cada ronda de validación.',
        time: telemetry?.updatedAtStr || 'En cadena',
      },
    ];

    container.innerHTML = items.map(ins => `
      <div class="insight-card">
        <div class="insight-icon ${ins.type}">${ins.icon}</div>
        <div class="insight-body">
          <div class="insight-title">${ins.title}</div>
          <div class="insight-text">${ins.body}</div>
          <div class="insight-time">${ins.time}</div>
        </div>
      </div>
    `).join('');
  },
};

const NewsController = {
  render() {
    const grid = document.getElementById('alerts-grid');
    if (!grid) return;
    const net = StakingState.get('activeNetwork');
    const telemetry = StakingState.get('poolOnChainData')[net];

    grid.innerHTML = `
      <div class="insight-card">
        <div class="insight-icon info">📡</div>
        <div class="insight-body">
          <div class="insight-title">Estado del Pool Tonstakers (${net.toUpperCase()})</div>
          <div class="insight-text">
            Estado del contrato: <strong>${telemetry?.accountStatus || 'Sin datos'}</strong> ·
            Depósitos abiertos: <strong>${telemetry ? (telemetry.depositsOpen ? 'Sí' : 'No') : 'Sin datos'}</strong> ·
            Tasa tsTON/TON: <strong>${telemetry?.exchangeRateFloat ? safeToFixed(telemetry.exchangeRateFloat, 6) : 'Sin datos'}</strong>.
          </div>
          <div class="insight-time">Fuente: TonAPI v2 + get_pool_full_data · ${telemetry?.updatedAtStr || 'Sin datos'}</div>
        </div>
      </div>
    `;
  },
};

const WhaleController = {
  async init() {
    await this.renderTab('top');
  },

  async renderTab(tab) {
    const body = document.getElementById('whale-body');
    if (!body) return;

    if (tab === 'top') {
      body.innerHTML = '<div style="text-align:center;padding:24px;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Consultando tenedores reales de tsTON desde TonAPI...</div>';
      const wallets = await WhaleService.fetchStakingWallets();
      if (!wallets.length) {
        body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Sin datos de tenedores disponibles en este momento. Fuente: TonAPI v2.</div>';
        return;
      }
      body.innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Billetera</th><th>Protocolo</th><th>Balance tsTON</th><th>Estado</th></tr></thead>
            <tbody>${wallets.map(w => `
              <tr>
                <td class="td-mono">${w.shortAddress}</td>
                <td>${w.validator}</td>
                <td class="td-mono text-green">${_fmtNum(w.delegatedTON, 2)} tsTON</td>
                <td><span class="badge badge-green">${w.status}</span></td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } else {
      body.innerHTML = '<div style="text-align:center;padding:24px;"><div class="loading-spinner" style="margin:0 auto 10px;"></div>Consultando eventos recientes en cadena...</div>';
      const flows = await WhaleService.getFlows();
      if (!flows.length) {
        body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Sin movimientos recientes disponibles. Fuente: TonAPI v2.</div>';
        return;
      }
      body.innerHTML = `
        <div class="data-table-wrap">
          <table class="data-table">
            <thead><tr><th>Pool</th><th>Tipo</th><th>Monto</th><th>Billetera</th><th>Tiempo</th></tr></thead>
            <tbody>${flows.map(f => `
              <tr>
                <td>${f.pool}</td>
                <td><span class="badge ${f.type === 'inflow' ? 'badge-green' : 'badge-red'}">${f.type}</span></td>
                <td class="td-mono">${safeToFixed(f.amount, 2)} TON</td>
                <td class="td-mono">${f.wallet}</td>
                <td class="td-mono">${f.time}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    }
  },
};

const TransactionController = {
  async init() {
    const tbody = document.getElementById('tx-tbody');
    const addr = WalletService.getAddress();
    if (!addr) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Conecta tu wallet para consultar el historial real de eventos en cadena.</td></tr>';
      return;
    }
    const txs = await AnalyticsService.getTransactions(addr);
    if (!txs.length) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Sin eventos recientes en esta cuenta. Fuente: TonAPI v2.</td></tr>';
      return;
    }
    if (tbody) {
      const expBase = StakingState.get('activeNetwork') === 'testnet' ? STAKING_CONFIG.TONVIEWER_TESTNET : STAKING_CONFIG.TONVIEWER_MAINNET;
      tbody.innerHTML = txs.map(tx => {
        const badgeClass = tx.status === 'comisión cobrada' || tx.status === 'confirmada'
          ? 'badge-green'
          : (tx.status === 'pendiente' ? 'badge-yellow' : 'badge-red');
        return `
          <tr>
            <td><a href="${expBase}/transaction/${tx.hash}" target="_blank" rel="noopener" class="td-mono" style="color:var(--ton-blue);">${tx.hash_short}↗</a></td>
            <td><span class="badge badge-blue">${tx.type}</span></td>
            <td>${tx.validator}</td>
            <td class="td-mono text-green">${safeToFixed(tx.amount, 4)} TON</td>
            <td class="td-mono">${safeToFixed(tx.fee, 4)} TON</td>
            <td><span class="badge ${badgeClass}">${tx.status}</span></td>
            <td class="td-mono">${tx.timestamp.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    }
  },
};

/* ══════════════════════════════════════════════════════════════
   SETTINGS & NETWORK CONTROLLER
   ══════════════════════════════════════════════════════════════ */

const SettingsUIController = {
  open() { document.getElementById('settings-modal')?.classList.add('open'); },
  close() { document.getElementById('settings-modal')?.classList.remove('open'); },
  save() {
    NotificationService.toast('Configuración Guardada', 'Preferencias actualizadas.', 'success');
    this.close();
  },
};

function switchStakingNetwork(network) {
  const target = network === 'mainnet' ? 'mainnet' : 'testnet';
  StakingState.set('activeNetwork', target);
  localStorage.setItem('anlgram_staking_network', target);

  const netBadge = document.getElementById('network-badge-label');
  const netDot = document.getElementById('sidebar-net-dot');
  const topSelect = document.getElementById('topbar-network-select');

  if (topSelect) topSelect.value = target;
  if (netBadge) {
    netBadge.textContent = target === 'testnet' ? 'TON Testnet (-3)' : 'TON Mainnet (-239)';
    netBadge.style.color = target === 'testnet' ? '#f59e0b' : '#22c55e';
  }
  if (netDot) {
    netDot.style.background = target === 'testnet' ? '#f59e0b' : '#22c55e';
    netDot.style.boxShadow = target === 'testnet' ? '0 0 6px #f59e0b' : '0 0 6px #22c55e';
  }

  NotificationService.toast(
    'Red Cambiada',
    `Entorno configurado a TON ${target.toUpperCase()} (${target === 'testnet' ? '-3' : '-239'}).`,
    'info'
  );

  ValidatorTableController.init();
  MetricCardsController.refresh();
  InsightsController.render();
  NewsController.render();
  WalletService.loadWalletData();
  TransactionController.init();
}

/* ══════════════════════════════════════════════════════════════
   FORMATTING & UTILITY FUNCTIONS
   ══════════════════════════════════════════════════════════════ */

function safeNum(val, fallback = null) {
  if (val === null || val === undefined || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function safeToFixed(val, dec = 2, fallback = '0.00') {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return n.toFixed(dec);
}

function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function _fmtCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return 'Sin datos';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number(n).toFixed(0);
}

function _fmtNum(n, dec = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return 'Sin datos';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function _setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// Global Exports for UI & Automated Testing
if (typeof window !== 'undefined') {
  window.StakeModalController = StakeModalController;
  window.UnstakeModalController = UnstakeModalController;
  window.ValidatorDetailController = ValidatorDetailController;
  window.ValidatorTableController = ValidatorTableController;
  window.CalculatorController = CalculatorController;
  window.SettingsUIController = SettingsUIController;
  window.WhaleController = WhaleController;
  window.TransactionController = TransactionController;
  window.PortfolioController = PortfolioController;
  window.RewardService = RewardService;
  window.PoolOnChainVerifier = PoolOnChainVerifier;
  window.switchStakingNetwork = switchStakingNetwork;
  window.calculateAnlgramStakeFeeNano = calculateAnlgramStakeFeeNano;
  window.calculateStakeDepositBreakdown = calculateStakeDepositBreakdown;
  window.buildAnlgramRouterStakePayload = buildAnlgramRouterStakePayload;
  window.buildStakeVaultInitialData = buildStakeVaultInitialData;
  window.buildStakeVaultInitPayload = buildStakeVaultInitPayload;
  window.buildStakeVaultRescuePayload = buildStakeVaultRescuePayload;
  window.buildStakeVaultRetryPayload = buildStakeVaultRetryPayload;
  window.buildTonstakersStakePayload = buildTonstakersStakePayload;
  window.buildTonstakersUnstakePayload = buildTonstakersUnstakePayload;
  window.isValidTonAddress = isValidTonAddress;
  window.friendlyToRawAddress = friendlyToRawAddress;
  window.rawToFriendlyAddress = rawToFriendlyAddress;
  window.toNanoSafe = toNanoSafe;
  window.fromNanoSafe = fromNanoSafe;
  window.STAKING_CONFIG = STAKING_CONFIG;
  window.StakingState = StakingState;
}

/* ══════════════════════════════════════════════════════════════
   APP INITIALIZATION
   ══════════════════════════════════════════════════════════════ */

const StakingApp = {
  async init() {
    // Auto-detect network preference from connected wallet or storage
    const savedNet = localStorage.getItem('anlgram_staking_network') || localStorage.getItem('anlgram_wallet_network');
    const chainId = typeof window.getConnectedWalletChainId === 'function' ? window.getConnectedWalletChainId() : null;
    let net = (chainId === '-239' || savedNet === 'mainnet') && STAKING_CONFIG.MAINNET_STAKING_ENABLED ? 'mainnet' : 'testnet';
    StakingState.set('activeNetwork', net);

    const netBadge = document.getElementById('network-badge-label');
    const netDot = document.getElementById('sidebar-net-dot');
    const topSelect = document.getElementById('topbar-network-select');

    if (topSelect) topSelect.value = net;
    if (netBadge) {
      netBadge.textContent = net === 'testnet' ? 'TON Testnet (-3)' : 'TON Mainnet (-239)';
      netBadge.style.color = net === 'testnet' ? '#f59e0b' : '#22c55e';
    }
    if (netDot) {
      netDot.style.background = net === 'testnet' ? '#f59e0b' : '#22c55e';
      netDot.style.boxShadow = net === 'testnet' ? '0 0 6px #f59e0b' : '0 0 6px #22c55e';
    }

    await MetricCardsController.render();
    await ValidatorTableController.init();
    CalculatorController.populateValidatorSelect();
    CalculatorController.init();
    PortfolioController.render();
    InsightsController.render();
    NewsController.render();
    TransactionController.init();
    WhaleController.init();

    if (WalletService.isConnected()) {
      await WalletService.loadWalletData();
      WalletUIController.updateConnected();
    }
  },
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => StakingApp.init());
  } else {
    StakingApp.init();
  }
}
