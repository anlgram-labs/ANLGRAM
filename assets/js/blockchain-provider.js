/**
 * ANLGRAM — Multi-Node Read-Only Blockchain Provider Abstraction Layer
 * File: assets/js/blockchain-provider.js
 * Version: 1.0.0
 * 
 * Strict Read-Only Protocol:
 * - Supports Provider A (TonAPI v2) and Provider B (TonCenter v2 RPC).
 * - Explicit network configuration ('mainnet' | 'testnet'). Never inferred.
 * - Conservative failover (timeout, 429, 5xx) with cross-network isolation.
 * - Strictly forbids mutation, transaction signing, or message broadcasting.
 * - Uniform response normalization with provenance tracking.
 * - Universal module packaging (compatible with Node.js and Browser environments).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BlockchainProvider = factory();
    root.ANLGRAM_PROVIDER = root.BlockchainProvider;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Supported Networks & Providers
  const SUPPORTED_NETWORKS = new Set(['mainnet', 'testnet']);
  const SUPPORTED_PROVIDERS = new Set(['tonapi', 'toncenter']);

  // Canonical Base Endpoints
  const ENDPOINTS = {
    tonapi: {
      mainnet: 'https://tonapi.io/v2',
      testnet: 'https://testnet.tonapi.io/v2',
    },
    toncenter: {
      mainnet: 'https://toncenter.com/api/v2',
      testnet: 'https://testnet.toncenter.com/api/v2',
    }
  };

  /**
   * CRC16-CCITT calculation for friendly TON address verification
   */
  function crc16Ton(bytes) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= (bytes[i] << 8);
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) ^ 0x1021) & 0xffff;
        } else {
          crc = (crc << 1) & 0xffff;
        }
      }
    }
    return crc;
  }

  /**
   * Strict TON Address Validator & Normalizer
   * Accepts:
   * 1. Raw hex: (0|-1):[64 hex chars]
   * 2. Friendly TEP-2: 48-char Base64/Base64url with CRC16-CCITT verification
   */
  function validateTonAddress(addr) {
    if (!addr || typeof addr !== 'string') return { valid: false, reason: 'EMPTY_OR_NON_STRING' };
    const clean = addr.trim();
    if (clean.length > 128) return { valid: false, reason: 'EXCEEDS_MAX_LENGTH' };

    // Raw hex: (-1|0):64 hex
    if (/^(-1|0):[0-9a-fA-F]{64}$/.test(clean)) {
      return { valid: true, raw: clean.toLowerCase(), friendly: null, isRaw: true };
    }

    // Friendly 48-char TEP-2 Base64/Base64url
    if (/^[A-Za-z0-9_+\/-]{48}$/.test(clean)) {
      try {
        const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
        let bytes;
        if (typeof Buffer !== 'undefined') {
          const buf = Buffer.from(b64, 'base64');
          if (buf.length !== 36) return { valid: false, reason: 'INVALID_BYTE_LENGTH' };
          bytes = new Uint8Array(buf);
        } else if (typeof atob === 'function') {
          const bin = atob(b64);
          if (bin.length !== 36) return { valid: false, reason: 'INVALID_BYTE_LENGTH' };
          bytes = new Uint8Array(36);
          for (let i = 0; i < 36; i++) bytes[i] = bin.charCodeAt(i);
        } else {
          return { valid: false, reason: 'NO_BASE64_DECODER' };
        }

        const tag = bytes[0];
        if ((tag & 0x3f) !== 0x11) return { valid: false, reason: 'INVALID_TEP2_TAG' };
        const wc = bytes[1];
        if (wc !== 0x00 && wc !== 0xff) return { valid: false, reason: 'INVALID_WORKCHAIN' };

        const expectedCrc = crc16Ton(bytes.subarray(0, 34));
        const actualCrc = (bytes[34] << 8) | bytes[35];
        if (expectedCrc !== actualCrc) {
          return { valid: false, reason: 'CRC16_CHECKSUM_MISMATCH' };
        }

        const workchain = wc === 0xff ? -1 : 0;
        let hex = '';
        for (let i = 2; i < 34; i++) {
          hex += bytes[i].toString(16).padStart(2, '0');
        }

        return {
          valid: true,
          raw: `${workchain}:${hex}`.toLowerCase(),
          friendly: clean,
          isTestnetTag: (tag & 0x80) !== 0,
          isBounceable: (tag & 0x40) === 0,
          isRaw: false
        };
      } catch (_) {
        return { valid: false, reason: 'BASE64_DECODE_EXCEPTION' };
      }
    }

    return { valid: false, reason: 'MALFORMED_FORMAT' };
  }

  /**
   * Fetch with timeout helper
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 8000, customFetch = null) {
    const fetchFn = customFetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) {
      throw new Error('No fetch implementation available in current environment');
    }

    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const signal = controller ? controller.signal : undefined;
    let timer = null;

    if (controller && timeoutMs > 0) {
      timer = setTimeout(() => {
        try { controller.abort(); } catch (_) {}
      }, timeoutMs);
    }

    try {
      const res = await fetchFn(url, { ...options, signal });
      if (timer) clearTimeout(timer);
      return res;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Main BlockchainProvider Client Class
   */
  class BlockchainProvider {
    /**
     * @param {object} config
     * @param {string} config.network - 'mainnet' or 'testnet' (Mandatory)
     * @param {string} [config.primaryProvider='tonapi'] - 'tonapi' or 'toncenter'
     * @param {string} [config.fallbackProvider='toncenter'] - 'toncenter' or 'tonapi' or null
     * @param {string} [config.tonApiProxyUrl=null] - Optional Cloudflare Worker proxy base
     * @param {number} [config.timeoutMs=8000] - Request timeout in ms
     * @param {number} [config.maxRetries=1] - Failover retry attempts
     * @param {function} [config.customFetch=null] - Optional dependency injection for testing
     */
    constructor(config = {}) {
      if (!config.network || !SUPPORTED_NETWORKS.has(config.network)) {
        throw new Error(`VALIDATION ERROR: config.network must be explicitly set to 'mainnet' or 'testnet'. Got: '${config.network}'`);
      }

      this.network = config.network;
      this.primaryProvider = config.primaryProvider || 'tonapi';
      this.fallbackProvider = config.fallbackProvider !== undefined ? config.fallbackProvider : 'toncenter';
      this.tonApiProxyUrl = config.tonApiProxyUrl || null;
      this.timeoutMs = typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : 8000;
      this.maxRetries = typeof config.maxRetries === 'number' ? config.maxRetries : 1;
      this.customFetch = config.customFetch || null;

      if (!SUPPORTED_PROVIDERS.has(this.primaryProvider)) {
        throw new Error(`VALIDATION ERROR: Unsupported primaryProvider: ${this.primaryProvider}`);
      }
      if (this.fallbackProvider && !SUPPORTED_PROVIDERS.has(this.fallbackProvider)) {
        throw new Error(`VALIDATION ERROR: Unsupported fallbackProvider: ${this.fallbackProvider}`);
      }
    }

    /**
     * Resolve Base URL for a provider under the active network
     */
    getEndpointBase(providerName) {
      if (providerName === 'tonapi') {
        if (this.network === 'mainnet' && this.tonApiProxyUrl) {
          return this.tonApiProxyUrl.replace(/\/+$/, '');
        }
        return ENDPOINTS.tonapi[this.network];
      }
      if (providerName === 'toncenter') {
        return ENDPOINTS.toncenter[this.network];
      }
      throw new Error(`Unknown provider: ${providerName}`);
    }

    /**
     * Check if an error qualifies for failover (timeout, network error, 429, 5xx)
     */
    isFailoverError(err, status) {
      if (!err && status === undefined) return false;
      if (status === 429 || (status >= 500 && status <= 599)) return true;
      if (err) {
        const msg = String(err.message || '').toLowerCase();
        const name = String(err.name || '').toLowerCase();
        if (name === 'aborterror' || msg.includes('timeout') || msg.includes('aborted')) return true;
        if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('fetch failed')) return true;
      }
      return false;
    }

    /**
     * Execute an operation with conservative failover
     */
    async executeWithFailover(operationName, tonapiFn, toncenterFn) {
      const providersToTry = [this.primaryProvider];
      if (this.fallbackProvider && this.fallbackProvider !== this.primaryProvider) {
        providersToTry.push(this.fallbackProvider);
      }

      let lastError = null;

      for (let i = 0; i < providersToTry.length; i++) {
        const provider = providersToTry[i];
        const isFallback = (i > 0);

        try {
          if (provider === 'tonapi') {
            if (!tonapiFn) {
              if (!isFallback) continue;
              return this.createErrorResponse(provider, 'UNSUPPORTED_OPERATION', `Operation '${operationName}' is unsupported on TonAPI`);
            }
            return await tonapiFn(this.getEndpointBase('tonapi'), provider);
          }

          if (provider === 'toncenter') {
            if (!toncenterFn) {
              if (!isFallback) continue;
              return this.createErrorResponse(provider, 'UNSUPPORTED_OPERATION', `Operation '${operationName}' is unsupported on TonCenter`);
            }
            return await toncenterFn(this.getEndpointBase('toncenter'), provider);
          }
        } catch (err) {
          const status = err.status || (err.response && err.response.status);
          lastError = err;

          // Only failover if error is a recoverable transport / rate-limit / server error
          if (!this.isFailoverError(err, status)) {
            return this.createErrorResponse(provider, 'PROVIDER_CLIENT_ERROR', err.message || 'Client error during request', status);
          }
        }
      }

      return this.createErrorResponse(
        providersToTry[0],
        'ALL_PROVIDERS_FAILED',
        lastError ? lastError.message : 'All configured providers failed to execute operation'
      );
    }

    /**
     * Normalization response helper
     */
    createSuccessResponse(provider, endpoint, data, blockRef = null) {
      return {
        success: true,
        network: this.network,
        provider,
        endpoint,
        data,
        fetchedAt: Date.now(),
        blockReference: blockRef,
        stale: false,
      };
    }

    createErrorResponse(provider, code, message, status = null, details = null) {
      return {
        success: false,
        network: this.network,
        provider,
        endpoint: null,
        data: null,
        fetchedAt: Date.now(),
        blockReference: null,
        stale: false,
        error: {
          code,
          message,
          status,
          details,
        }
      };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // READ-ONLY API SURFACE
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * 1. Check Provider Health
     */
    async getProviderHealth() {
      return this.executeWithFailover(
        'getProviderHealth',
        // TonAPI Adapter
        async (base, provider) => {
          const url = `${base}/rates?tokens=ton&currencies=usd`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return this.createSuccessResponse(provider, url, { status: 'healthy', httpStatus: res.status });
        },
        // TonCenter Adapter
        async (base, provider) => {
          const url = `${base}/getMasterchainInfo`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          const isOk = Boolean(json && json.ok && json.result);
          if (!isOk) throw new Error('Invalid TonCenter masterchain payload');
          return this.createSuccessResponse(provider, url, { status: 'healthy', httpStatus: res.status, lastBlockSeqno: json.result.last?.seqno });
        }
      );
    }

    /**
     * 2. Get Normalized Account State
     * Normalizes balance, status ('active', 'uninitialized', 'frozen', 'nonexist'), code_hash
     */
    async getAccountState(targetAddress) {
      const v = validateTonAddress(targetAddress);
      if (!v.valid) {
        return this.createErrorResponse('none', 'INVALID_ADDRESS', `Provided address is invalid: ${v.reason}`);
      }

      const lookupAddr = v.friendly || v.raw;

      return this.executeWithFailover(
        'getAccountState',
        // TonAPI Adapter
        async (base, provider) => {
          const url = `${base}/accounts/${encodeURIComponent(lookupAddr)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const data = await res.json();
          const normalized = {
            addressRaw: data.address ? data.address.toLowerCase() : v.raw,
            status: data.status || 'uninitialized', // 'active', 'uninitialized', 'frozen', 'nonexist'
            balanceNano: String(data.balance !== undefined && data.balance !== null ? data.balance : '0'),
            isContract: Boolean(data.is_wallet === false),
            codeHashHex: null, // Populated via blockchain/accounts if active
            lastTransactionLt: data.last_activity ? String(data.last_activity) : null,
          };
          return this.createSuccessResponse(provider, url, normalized);
        },
        // TonCenter Adapter
        async (base, provider) => {
          const url = `${base}/getAddressInformation?address=${encodeURIComponent(lookupAddr)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          if (!json || !json.ok || !json.result) {
            throw new Error('TonCenter returned non-ok result object');
          }
          const r = json.result;
          let normStatus = 'uninitialized';
          if (r.state === 'active') normStatus = 'active';
          else if (r.state === 'frozen') normStatus = 'frozen';
          else if (r.state === 'uninitialized') normStatus = 'uninitialized';

          const normalized = {
            addressRaw: v.raw,
            status: normStatus,
            balanceNano: String(r.balance !== undefined && r.balance !== null ? r.balance : '0'),
            isContract: Boolean(r.code && r.code !== ''),
            codeHashHex: r.code_hash || null,
            lastTransactionLt: r.last_transaction_id?.lt ? String(r.last_transaction_id.lt) : null,
          };
          return this.createSuccessResponse(provider, url, normalized);
        }
      );
    }

    /**
     * 3. Get Account Transactions
     */
    async getTransactions(targetAddress, options = {}) {
      const { limit = 10, beforeLt = null } = options;
      const v = validateTonAddress(targetAddress);
      if (!v.valid) {
        return this.createErrorResponse('none', 'INVALID_ADDRESS', `Provided address is invalid: ${v.reason}`);
      }

      const lookupAddr = v.friendly || v.raw;

      return this.executeWithFailover(
        'getTransactions',
        // TonAPI Adapter
        async (base, provider) => {
          let url = `${base}/blockchain/accounts/${encodeURIComponent(lookupAddr)}/transactions?limit=${encodeURIComponent(limit)}`;
          if (beforeLt) url += `&before_lt=${encodeURIComponent(beforeLt)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          const txList = Array.isArray(json.transactions) ? json.transactions : [];
          const normalized = txList.map(tx => ({
            hash: tx.hash || '',
            lt: String(tx.lt || '0'),
            utime: tx.utime || 0,
            success: Boolean(tx.success),
            feeNano: String(tx.total_fees || '0'),
            inMsg: tx.in_msg ? {
              source: tx.in_msg.source?.address || null,
              valueNano: String(tx.in_msg.value || '0'),
              opCode: tx.in_msg.op_code || null,
            } : null,
            outMsgsCount: Array.isArray(tx.out_msgs) ? tx.out_msgs.length : 0,
          }));
          return this.createSuccessResponse(provider, url, normalized);
        },
        // TonCenter Adapter
        async (base, provider) => {
          let url = `${base}/getTransactions?address=${encodeURIComponent(lookupAddr)}&limit=${encodeURIComponent(limit)}`;
          if (beforeLt) url += `&lt=${encodeURIComponent(beforeLt)}`;
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          if (!json || !json.ok || !Array.isArray(json.result)) {
            throw new Error('TonCenter returned invalid transactions payload');
          }
          const normalized = json.result.map(tx => ({
            hash: tx.transaction_id?.hash || '',
            lt: String(tx.transaction_id?.lt || '0'),
            utime: tx.utime || 0,
            success: true,
            feeNano: String(tx.fee || '0'),
            inMsg: tx.in_msg ? {
              source: tx.in_msg.source || null,
              valueNano: String(tx.in_msg.value || '0'),
              opCode: null,
            } : null,
            outMsgsCount: Array.isArray(tx.out_msgs) ? tx.out_msgs.length : 0,
          }));
          return this.createSuccessResponse(provider, url, normalized);
        }
      );
    }

    /**
     * 4. Run TVM Get Method (Read-Only)
     */
    async runGetMethod(targetAddress, methodName, stackArgs = []) {
      const v = validateTonAddress(targetAddress);
      if (!v.valid) {
        return this.createErrorResponse('none', 'INVALID_ADDRESS', `Provided address is invalid: ${v.reason}`);
      }
      if (!methodName || typeof methodName !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(methodName)) {
        return this.createErrorResponse('none', 'INVALID_METHOD_NAME', 'Method name must be alphanumeric identifier');
      }

      const lookupAddr = v.friendly || v.raw;

      return this.executeWithFailover(
        'runGetMethod',
        // TonAPI Adapter
        async (base, provider) => {
          let url = `${base}/blockchain/accounts/${encodeURIComponent(lookupAddr)}/methods/${encodeURIComponent(methodName)}`;
          if (Array.isArray(stackArgs) && stackArgs.length > 0) {
            const joinedArgs = stackArgs.map(encodeURIComponent).join('&args=');
            url += `?args=${joinedArgs}`;
          }
          const res = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          const normalized = {
            exitCode: json.exit_code !== undefined ? json.exit_code : 0,
            gasUsed: json.gas_used || 0,
            stack: Array.isArray(json.stack) ? json.stack : [],
            decoded: json.decoded || null,
          };
          return this.createSuccessResponse(provider, url, normalized);
        },
        // TonCenter Adapter
        async (base, provider) => {
          const url = `${base}/runGetMethod`;
          const bodyPayload = JSON.stringify({
            address: lookupAddr,
            method: methodName,
            stack: stackArgs.map(arg => ['num', arg.toString()])
          });
          const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: bodyPayload,
          }, this.timeoutMs, this.customFetch);
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const json = await res.json();
          if (!json || !json.ok || !json.result) {
            throw new Error('TonCenter runGetMethod returned non-ok result');
          }
          const r = json.result;
          const normalized = {
            exitCode: r.exit_code !== undefined ? r.exit_code : 0,
            gasUsed: r.gas_used || 0,
            stack: Array.isArray(r.stack) ? r.stack : [],
            decoded: null,
          };
          return this.createSuccessResponse(provider, url, normalized);
        }
      );
    }
  }

  return {
    SUPPORTED_NETWORKS,
    SUPPORTED_PROVIDERS,
    ENDPOINTS,
    validateTonAddress,
    BlockchainProvider,
  };
}));
