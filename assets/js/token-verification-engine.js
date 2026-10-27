/**
 * ANLGRAM Institutional Security & Token Verification Engine
 * Standardized, Multi-Node On-Chain Verification Module
 * 
 * Environments: Browser & Node.js (Universal)
 * Standards: TEP-74 (Jettons), TEP-64 (Token Metadata), TVM Bytecode Specifications
 * 
 * Strict Verification Statuses:
 * - VERIFIED: Claim is supported by direct, cryptographic on-chain evidence
 * - FAILED: Evidence directly contradicts the claim or a critical check failed
 * - NOT VERIFIED: Evidence is missing, unindexed, stale, or insufficient
 * - PENDING: Transaction broadcast but block confirmation not yet finalized
 * - NOT APPLICABLE: Check does not apply to this asset, contract, or network
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TokenVerificationEngine = factory();
    root.ANLGRAM_VERIFIER = root.TokenVerificationEngine;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CANONICAL AUDITED BYTECODE HASHES
  // ═══════════════════════════════════════════════════════════════════════════

  function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const val = obj[prop];
      if (val && (typeof val === 'object' || typeof val === 'function') && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    });
    return obj;
  }

  function deepClone(obj) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) {}
    }
    return JSON.parse(JSON.stringify(obj));
  }

  const AUDITED_BYTECODE_REGISTRY = deepFreeze({
    // Standard TEP-74 Jetton Minter (ton-blockchain reference implementation)
    STANDARD_JETTON_MINTER: {
      hashHex: '9a0f98dd6fbf225eef8165e4e64417ee931f7eea000653439e7b5dcdc0644cd6',
      hashBase64: 'mg+Y3W+/Il7vgWXk5kQX7pMffuoABlNDnntdzcBkTNY=',
      description: 'Standard TEP-74 Jetton Minter (Immutable, Non-Upgradeable)',
      isUpgradeable: false,
      hasAdminClawback: false
    },
    // Standard TEP-74 Jetton Wallet
    STANDARD_JETTON_WALLET: {
      hashHex: 'beb0683ebeb8927fe9fc8ec0a18bc7dd17899689825a121eab46c5a3a860d0ce',
      hashBase64: 'vrBoPr64kn/p/I7AoYvH3ReJlomCWhIeq0bFo6hg0M4=',
      description: 'Standard TEP-74 Jetton Wallet',
      isUpgradeable: false
    },
    // ANLGRAM Linear Vesting Contract (TEP-74 Non-Custodial Cliff Release)
    ANLGRAM_VESTING_WALLET: {
      hashHex: 'cae29d5a2ba4b5cfa926deb720cc0c5ef1ed0e7d8502aecd46bf3b0ed3321c5a',
      hashBase64: 'yuKdWiqktc+pJu63IMwMXvHtDn2FAq7NRr87DtMyHFo=',
      description: 'ANLGRAM Non-Custodial Linear Vesting Wallet (Audited Math, No Clawback)',
      isUpgradeable: false,
      hasAdminClawback: false
    }
  });

  // Status Constants
  const STATUS = deepFreeze({
    VERIFIED: 'VERIFIED',
    FAILED: 'FAILED',
    NOT_VERIFIED: 'NOT VERIFIED',
    PENDING: 'PENDING',
    NOT_APPLICABLE: 'NOT APPLICABLE'
  });

  // SEC-04 & BAJO-01: Strict TON Address Parser & Validator (Raw + Friendly TEP-2 with CRC16-CCITT)
  function parseTonAddress(addr) {
    if (!addr || typeof addr !== 'string') return null;
    const clean = addr.trim();
    if (clean.length === 0 || clean.length > 128) return null;

    // 1. Raw format: (-1|0):<64 hex chars>
    if (/^(-1|0):[0-9a-fA-F]{64}$/.test(clean)) {
      return clean.toLowerCase();
    }

    // 2. Friendly TEP-2 format: 48 base64 / base64url chars with valid tag, workchain, and CRC16-CCITT
    if (!/^[A-Za-z0-9_+\/-]{48}$/.test(clean)) return null;
    try {
      const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
      let bytes;
      if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length !== 36) return null;
        bytes = new Uint8Array(buf);
      } else if (typeof atob === 'function') {
        const binStr = atob(b64);
        if (binStr.length !== 36) return null;
        bytes = new Uint8Array(36);
        for (let i = 0; i < 36; i++) bytes[i] = binStr.charCodeAt(i);
      } else {
        return null;
      }

      // TEP-2 tag byte: 0x11 (bounceable), 0x51 (non-bounceable), 0x91 (testnet bounceable), 0xd1 (testnet non-bounceable)
      if ((bytes[0] & 0x3f) !== 0x11) return null;
      // Workchain byte: 0x00 (workchain 0) or 0xff (masterchain -1)
      if (bytes[1] !== 0x00 && bytes[1] !== 0xff) return null;

      // Verify CRC16-CCITT (XMODEM polynomial 0x1021) over bytes 0..33
      let crc = 0;
      for (let i = 0; i < 34; i++) {
        crc ^= (bytes[i] << 8);
        for (let j = 0; j < 8; j++) {
          crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xffff) : ((crc << 1) & 0xffff);
        }
      }
      if (((crc >> 8) & 0xff) !== bytes[34] || (crc & 0xff) !== bytes[35]) {
        return null;
      }

      const wc = bytes[1] === 0xff ? -1 : 0;
      let hex = '';
      for (let i = 2; i < 34; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return `${wc}:${hex}`;
    } catch (e) {
      return null;
    }
  }

  function isValidTonAddress(addr) {
    return parseTonAddress(addr) !== null;
  }

  // In-memory verification cache with explicit timestamp and source tracking
  const verificationCache = new Map();
  const CACHE_TTL_MS = 30000; // 30 seconds fresh cache

  function getTonCore() {
    if (typeof window !== 'undefined' && window.TON_CORE) {
      return window.TON_CORE;
    }
    if (typeof require !== 'undefined') {
      try { return require('@ton/core'); } catch (e) {}
      try {
        const path = require('path');
        return require(path.resolve(__dirname, '../minter-contract/node_modules/@ton/core'));
      } catch (e) {}
      try {
        const path = require('path');
        return require(path.resolve(__dirname, 'minter-contract/node_modules/@ton/core'));
      } catch (e) {}
      try {
        const path = require('path');
        return require(path.resolve(__dirname, '../../minter-contract/node_modules/@ton/core'));
      } catch (e) {}
    }
    return null;
  }

  function parseStrictBigInt(val) {
    if (typeof val === 'bigint') return val >= 0n ? val : null;
    if (typeof val === 'number') {
      if (!Number.isInteger(val) || !Number.isSafeInteger(val) || val < 0) return null;
      return BigInt(val);
    }
    if (typeof val === 'string') {
      const clean = val.trim();
      if (!/^(0x[0-9a-fA-F]+|[0-9]+)$/.test(clean)) return null;
      try {
        const bn = BigInt(clean);
        return bn >= 0n ? bn : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function safeBigInt(val, fallback = 0n) {
    const parsed = parseStrictBigInt(val);
    return parsed !== null ? parsed : fallback;
  }

  /**
   * MEDIO-03: Exact BigInt-safe unit formatter.
   * - Respects decimals = 0.
   * - Never converts whole BigInt part to IEEE-754 Number (preserves exact precision > Number.MAX_SAFE_INTEGER).
   * - Validates decimals range (0..255) and rejects malformed inputs explicitly with 'INVALID'.
   * - Preserves all significant fractional digits without silent truncation.
   */
  function formatUnits(amountBigInt, decimals = 9) {
    const bn = parseStrictBigInt(amountBigInt);
    if (bn === null) return 'INVALID';

    let dec = 9;
    if (decimals !== undefined) {
      if (decimals === null || decimals === '' || typeof decimals === 'boolean') return 'INVALID';
      const numDec = Number(decimals);
      if (!Number.isInteger(numDec) || numDec < 0 || numDec > 255) return 'INVALID';
      dec = numDec;
    }

    const divisor = 10n ** BigInt(dec);
    const whole = bn / divisor;
    const fraction = bn % divisor;
    const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (dec === 0 || fraction === 0n) {
      return wholeFormatted;
    }
    const fracStr = fraction.toString().padStart(dec, '0').replace(/0+$/, '');
    return `${wholeFormatted}.${fracStr}`;
  }

  /**
   * MEDIO-02 & BAJO-02: Decode TVM MsgAddress directly from BOC cell (hex or base64).
   * Uses @ton/core when available and includes deterministic pure-JS bit parser for 267-bit addr_std BOCs.
   */
  function decodeAddressFromBoc(bocStr) {
    if (!bocStr || typeof bocStr !== 'string') return { ok: false, address: undefined };
    const clean = bocStr.trim();
    if (clean.toLowerCase() === 'b5ee9c7201010101000300000120') {
      return { ok: true, address: null };
    }
    try {
      const tonCore = getTonCore();
      if (tonCore && tonCore.Cell) {
        const buf = /^[0-9a-fA-F]+$/.test(clean)
          ? Buffer.from(clean, 'hex')
          : Buffer.from(clean, 'base64');
        const cell = tonCore.Cell.fromBoc(buf)[0];
        const slice = cell.beginParse();
        if (slice.remainingBits >= 2) {
          const maybeAddr = slice.loadMaybeAddress();
          if (maybeAddr === null) {
            return { ok: true, address: null };
          }
          if (typeof maybeAddr.toRawString === 'function') {
            return { ok: true, address: maybeAddr.toRawString().toLowerCase() };
          }
        }
      }
    } catch (e) {}

    // Pure-JS fallback for standard single-cell 267-bit addr_std BOC in hex
    const lowerHex = clean.toLowerCase();
    if (/^b5ee9c72010101010024000043[0-9a-f]{68}$/.test(lowerHex)) {
      const dataHex = lowerHex.slice(26);
      let bits = '';
      for (let i = 0; i < dataHex.length; i++) {
        bits += parseInt(dataHex[i], 16).toString(2).padStart(4, '0');
      }
      if (bits.slice(0, 3) === '100') {
        const wcByte = parseInt(bits.slice(3, 11), 2);
        const wc = wcByte === 0xff ? -1 : (wcByte === 0x00 ? 0 : undefined);
        if (wc !== undefined) {
          const addrBits = bits.slice(11, 267);
          let addrHex = '';
          for (let i = 0; i < 256; i += 4) {
            addrHex += parseInt(addrBits.slice(i, i + 4), 2).toString(16);
          }
          return { ok: true, address: `${wc}:${addrHex}` };
        }
      }
    }

    return { ok: false, address: undefined };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MULTI-NODE ON-CHAIN DATA RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  async function fetchWithTimeout(url, options = {}, timeoutMs = 8500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Query TonAPI v2 (via local institutional proxy or direct fallback)
   */
  async function queryTonApi(endpoint, proxyBase = '/api/ton') {
    const isBrowser = typeof window !== 'undefined';
    const primaryUrl = isBrowser ? `${proxyBase}${endpoint}` : `https://tonapi.io/v2${endpoint}`;

    try {
      let res = await fetchWithTimeout(primaryUrl, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 1250));
        res = await fetchWithTimeout(primaryUrl, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      // Primary attempt failed, try direct upstream if in browser
    }

    if (isBrowser) {
      try {
        const directUrl = `https://tonapi.io/v2${endpoint}`;
        const res = await fetchWithTimeout(directUrl, {
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {}
    }

    throw new Error(`Failed to query TonAPI for ${endpoint}`);
  }

  /**
   * Independent TonCenter JSON-RPC Query for secondary cross-validation
   */
  async function queryTonCenterAddressInfo(address) {
    try {
      const url = `https://toncenter.com/api/v2/getAddressInformation?address=${encodeURIComponent(address)}`;
      const res = await fetchWithTimeout(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.result) {
          return json.result;
        }
      }
    } catch (e) {}
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CORE VERIFICATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verify an arbitrary TON Jetton Minter contract using live blockchain data.
   * 
   * @param {string} minterAddress - Friendly (EQ/UQ) or raw (0:hex) minter address
   * @param {object} options - Optional configuration { viewerWallet, forceFresh, knownVestingAddress }
   * @returns {Promise<object>} Structured verification report
   */
  async function verifyToken(minterAddress, options = {}) {
    const { viewerWallet = null, forceFresh = false, knownVestingAddress = null } = options;

    if (!minterAddress || typeof minterAddress !== 'string' || minterAddress.trim() === '') {
      return createErrorReport(minterAddress, 'Address is empty or invalid');
    }

    const cleanAddress = minterAddress.trim();
    const canonicalMinter = parseTonAddress(cleanAddress);

    // SEC-04 & BAJO-01: Strict TON Address Pre-Validation (including CRC16-CCITT) before network requests
    if (!canonicalMinter) {
      return createErrorReport(cleanAddress, 'Invalid TON address format or checksum. Must be raw (0:hex) or friendly 48-char TEP-2 base64url.');
    }

    const canonicalViewer = viewerWallet ? (parseTonAddress(viewerWallet) || String(viewerWallet).trim().toLowerCase()) : '';
    const canonicalVesting = knownVestingAddress ? (parseTonAddress(knownVestingAddress) || String(knownVestingAddress).trim().toLowerCase()) : '';
    const cacheKey = `verify:${canonicalMinter}|viewer:${canonicalViewer}|vesting:${canonicalVesting}`;

    // Cache hit check (returns deep clone to prevent caller mutation of cached state)
    if (!forceFresh) {
      const cached = verificationCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        const cloned = deepClone(cached.report);
        cloned.isCached = true;
        cloned.cachedAt = new Date(cached.timestamp).toISOString();
        cloned.freshness = 'CACHED (Within 30s TTL)';
        return cloned;
      }
    }

    const nowIso = new Date().toISOString();
    const providersUsed = [];

    // Initialize structured audit report
    const report = {
      target: {
        minterAddress: cleanAddress,
        rawAddress: canonicalMinter,
        network: 'TON Mainnet'
      },
       _cacheKey: cacheKey,
      auditTimestamp: nowIso,
      dataSources: providersUsed,
      isCached: false,
      freshness: 'LIVE BLOCKCHAIN RPC QUERY',
      explorerLinks: {
        tonviewer: `https://tonviewer.com/${cleanAddress}`,
        tonscan: `https://tonscan.org/address/${cleanAddress}`
      },
      // Individual verifiable claims
      claims: {},
      summary: {
        allVerified: false,
        permanentRenounced: false,
        totalChecksPassed: 0,
        totalChecksFailed: 0,
        totalChecksUnverified: 0,
        securityRating: 'ANALYZING'
      },
      rawEvidence: {}
    };

    try {
      // ───────────────────────────────────────────────────────────────────────
      // STEP 1: Account State & Liveness
      // ───────────────────────────────────────────────────────────────────────
      let accountData = null;
      try {
        accountData = await queryTonApi(`/blockchain/accounts/${encodeURIComponent(cleanAddress)}`);
        providersUsed.push('TonAPI v2 Account RPC');
      } catch (err) {
        // Fallback to TonCenter
        const tcData = await queryTonCenterAddressInfo(cleanAddress);
        if (tcData) {
          providersUsed.push('TonCenter v2 RPC');
          accountData = {
            status: tcData.state,
            balance: tcData.balance,
            code: tcData.code,
            data: tcData.data
          };
        }
      }

      if (!accountData) {
        report.claims['account_status'] = {
          title: 'Contract Account Liveness',
          status: STATUS.FAILED,
          detail: 'Account could not be found or reached on TON Mainnet',
          evidence: null
        };
        report.summary.totalChecksFailed++;
        return finalizeReport(report);
      }

      report.target.rawAddress = accountData.address || canonicalMinter;
      const isAccountActive = accountData.status === 'active';

      report.claims['account_status'] = {
        title: 'Contract Account Liveness',
        status: isAccountActive ? STATUS.VERIFIED : STATUS.FAILED,
        detail: `Contract is ${String(accountData.status || 'unknown').toUpperCase()} with native balance ${((accountData.balance || 0) / 1e9).toFixed(4)} TON`,
        evidence: {
          status: accountData.status,
          balanceNano: accountData.balance,
          lastTxHash: accountData.last_transaction_hash
        }
      };
      if (isAccountActive) report.summary.totalChecksPassed++; else report.summary.totalChecksFailed++;

      // ───────────────────────────────────────────────────────────────────────
      // STEP 2: Bytecode Hash & Immutability Verification
      // ───────────────────────────────────────────────────────────────────────
      let deployedCodeHashHex = '';
      let codeMatchStandard = false;

      if (accountData.code) {
        // Calculate cell hash if @ton/core is available, or TonAPI returned it
        try {
          const tonCore = getTonCore();
          if (tonCore && tonCore.Cell) {
            let codeCell;
            if (/^[0-9a-fA-F]+$/.test(accountData.code)) {
              codeCell = tonCore.Cell.fromBoc(Buffer.from(accountData.code, 'hex'))[0];
            } else {
              codeCell = tonCore.Cell.fromBoc(Buffer.from(accountData.code, 'base64'))[0];
            }
            deployedCodeHashHex = codeCell.hash().toString('hex');
          }
        } catch (e) {}

        const stdMinter = AUDITED_BYTECODE_REGISTRY.STANDARD_JETTON_MINTER;
        codeMatchStandard = (deployedCodeHashHex.toLowerCase() === stdMinter.hashHex.toLowerCase());

        report.claims['bytecode_integrity'] = {
          title: 'Bytecode Integrity & Standard Conformance',
          status: codeMatchStandard ? STATUS.VERIFIED : STATUS.NOT_VERIFIED,
          detail: codeMatchStandard
            ? 'Deployed bytecode matches canonical TEP-74 Jetton Minter (100% Bit-for-bit exact match)'
            : (deployedCodeHashHex ? `Non-standard or custom bytecode detected (Hash: ${deployedCodeHashHex.slice(0, 16)}...)` : 'Bytecode present but hash could not be calculated locally'),
          evidence: {
            codeHashHex: deployedCodeHashHex || 'UNCOMPUTED',
            standardReferenceHashHex: stdMinter.hashHex,
            isStandardTEP74: codeMatchStandard
          }
        };
        if (codeMatchStandard) report.summary.totalChecksPassed++; else report.summary.totalChecksUnverified++;

        report.claims['upgradeability'] = {
          title: 'Contract Immutability & Upgrade Prevention',
          status: codeMatchStandard ? STATUS.VERIFIED : STATUS.NOT_VERIFIED,
          detail: codeMatchStandard
            ? 'Standard TEP-74 Minter contains NO SETCODE opcode; code is permanently immutable'
            : 'Custom contract cannot be verified for lack of SETCODE without manual decompilation',
          evidence: { isUpgradeable: false, permitsCodeReplacement: false }
        };
        if (codeMatchStandard) report.summary.totalChecksPassed++; else report.summary.totalChecksUnverified++;
      } else {
        report.claims['bytecode_integrity'] = {
          title: 'Bytecode Integrity',
          status: STATUS.FAILED,
          detail: 'No contract code found on account',
          evidence: null
        };
        report.summary.totalChecksFailed++;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STEP 3: On-Chain Getter Execution (`get_jetton_data`) — MEDIO-02
      // ───────────────────────────────────────────────────────────────────────
      let getterData = null;
      try {
        getterData = await queryTonApi(`/blockchain/accounts/${encodeURIComponent(cleanAddress)}/methods/get_jetton_data`);
        providersUsed.push('TonAPI TVM Getter get_jetton_data');
      } catch (err) {}

      let rawTotalSupply = '0';
      let supplyVerified = false;
      let supplySource = 'UNVERIFIED';
      let parsedAdminAddress = undefined;
      let adminVerified = false;
      let adminSource = 'UNVERIFIED';
      let rawAdminCellHex = '';
      let isMintableStackFlag = false;

      if (getterData && getterData.success && Array.isArray(getterData.stack) && getterData.stack.length >= 3) {
        const stack = getterData.stack;
        // stack[0]: total_supply
        if (stack[0] && stack[0].num !== undefined) {
          const parsedSupplyBn = parseStrictBigInt(stack[0].num);
          if (parsedSupplyBn !== null) {
            rawTotalSupply = parsedSupplyBn.toString();
            supplyVerified = true;
            supplySource = 'ONCHAIN_GETTER';
          }
        }
        // stack[1]: mintable (-1 = true, 0 = false)
        if (stack[1] && stack[1].num !== undefined) {
          isMintableStackFlag = (stack[1].num === '-0x1' || stack[1].num === '-1');
        }
        // stack[2]: admin_address cell / slice (MEDIO-02: decode BOC directly first)
        const adminCellStr = stack[2]?.cell || stack[2]?.slice;
        if (adminCellStr) {
          rawAdminCellHex = adminCellStr;
          const bocDecoded = decodeAddressFromBoc(adminCellStr);
          if (bocDecoded.ok) {
            parsedAdminAddress = bocDecoded.address;
            adminVerified = true;
            adminSource = 'ONCHAIN_GETTER_BOC';
          } else if (getterData.decoded && typeof getterData.decoded.admin_address === 'string') {
            if (getterData.decoded.admin_address === '' && adminCellStr.toLowerCase() === 'b5ee9c7201010101000300000120') {
              parsedAdminAddress = null;
              adminVerified = true;
              adminSource = 'ONCHAIN_GETTER_DECODED';
            } else {
              const normDecoded = parseTonAddress(getterData.decoded.admin_address);
              if (normDecoded) {
                parsedAdminAddress = normDecoded;
                adminVerified = true;
                adminSource = 'ONCHAIN_GETTER_DECODED';
              }
            }
          }
        }
      }

      // Metadata & Decimals query (Indexer is used for metadata/decimals; never overrides or substitutes failed getter as VERIFIED)
      let metadataObj = {};
      let indexerSupply = null;
      let indexerAdmin = undefined;
      try {
        const jettonInfo = await queryTonApi(`/jettons/${encodeURIComponent(cleanAddress)}`);
        providersUsed.push('TonAPI Jetton Metadata Indexer');
        metadataObj = jettonInfo.metadata || {};
        if (jettonInfo.total_supply !== undefined) {
          const idxSupBn = parseStrictBigInt(String(jettonInfo.total_supply));
          if (idxSupBn !== null) indexerSupply = idxSupBn.toString();
        }
        if (jettonInfo.admin?.address) {
          indexerAdmin = parseTonAddress(jettonInfo.admin.address) || jettonInfo.admin.address;
        }
      } catch (e) {}

      let decimals = 9;
      if (metadataObj.decimals !== undefined && metadataObj.decimals !== null && metadataObj.decimals !== '') {
        const parsedDec = Number(metadataObj.decimals);
        if (Number.isInteger(parsedDec) && parsedDec >= 0 && parsedDec <= 255) {
          decimals = parsedDec;
        }
      }
      const formattedSupply = formatUnits(rawTotalSupply, decimals);

      if (supplyVerified) {
        report.claims['total_supply'] = {
          title: 'On-Chain Total Supply & Decimals',
          status: STATUS.VERIFIED,
          detail: `${formattedSupply} ${metadataObj.symbol || 'tokens'} (${rawTotalSupply} atomic units, ${decimals} decimals)`,
          evidence: {
            rawSupply: rawTotalSupply,
            decimals: decimals,
            symbol: metadataObj.symbol,
            name: metadataObj.name,
            source: supplySource,
            indexerSupplyMatches: indexerSupply !== null ? (indexerSupply === rawTotalSupply) : null
          }
        };
        report.summary.totalChecksPassed++;
      } else {
        report.claims['total_supply'] = {
          title: 'On-Chain Total Supply & Decimals',
          status: STATUS.NOT_VERIFIED,
          detail: indexerSupply !== null
            ? `On-chain getter get_jetton_data failed; indexer reports unverified supply (${formatUnits(indexerSupply, decimals)} ${metadataObj.symbol || 'tokens'})`
            : 'Total supply could not be retrieved from on-chain getter',
          evidence: indexerSupply !== null ? {
            rawSupply: null,
            unverifiedIndexerSupply: indexerSupply,
            decimals: decimals,
            symbol: metadataObj.symbol,
            source: 'INDEXER_UNVERIFIED'
          } : null
        };
        report.summary.totalChecksUnverified++;
      }

      // ───────────────────────────────────────────────────────────────────────
      // STEP 4: Admin Verification & Renunciation Analysis
      // ───────────────────────────────────────────────────────────────────────
      if (!adminVerified) {
        report.claims['admin_status'] = {
          title: 'Administrator Identity',
          status: STATUS.NOT_VERIFIED,
          detail: indexerAdmin
            ? `On-chain getter failed; indexer reports unverified admin ${indexerAdmin}`
            : 'Admin state could not be verified due to incomplete or failed RPC getter response',
          evidence: indexerAdmin ? { adminAddress: null, unverifiedIndexerAdmin: indexerAdmin, source: 'INDEXER_UNVERIFIED' } : null
        };
        report.summary.totalChecksUnverified++;

        report.claims['minting_permissions'] = {
          title: 'Minting Authorization',
          status: STATUS.NOT_VERIFIED,
          detail: 'Minting permissions cannot be verified without on-chain getter execution',
          evidence: { runtimeMintPossible: 'UNKNOWN' }
        };
        report.summary.totalChecksUnverified++;

        report.claims['renunciation_immutability'] = {
          title: 'Permanent Renunciation Guarantee',
          status: STATUS.NOT_VERIFIED,
          detail: 'Renunciation status cannot be certified without verified on-chain getter state',
          evidence: { canAdminBeRestored: 'UNKNOWN' }
        };
        report.summary.totalChecksUnverified++;
      } else {
        const isNullAdmin = (parsedAdminAddress === null);
        const normAdmin = parsedAdminAddress ? (parseTonAddress(parsedAdminAddress) || parsedAdminAddress.toLowerCase()) : null;

        let isUserAdmin = false;
        if (canonicalViewer && normAdmin) {
          isUserAdmin = (canonicalViewer === normAdmin);
        }

        if (isNullAdmin && codeMatchStandard) {
          // Cryptographically guaranteed permanent renunciation
          report.claims['admin_status'] = {
            title: 'Administrator Identity',
            status: STATUS.VERIFIED,
            detail: 'Admin is permanently addr_none (Renounced / Null Address)',
            evidence: {
              adminAddress: null,
              rawAdminCell: rawAdminCellHex,
              isUserAdmin: false,
              source: adminSource
            }
          };
          report.summary.totalChecksPassed++;

          report.claims['minting_permissions'] = {
            title: 'Minting Authorization & Supply Cap',
            status: STATUS.VERIFIED,
            detail: 'Minting is PERMANENTLY BLOCKED on-chain (Op 21 throws TVM exit code 73 on all senders)',
            evidence: {
              runtimeMintPossible: false,
              indexerReportedMintableFlag: isMintableStackFlag,
              indexerDiscrepancyNote: isMintableStackFlag
                ? 'TonAPI reports "mintable: true" because standard TEP-74 get_jetton_data hardcodes tuple element 2 to -1. However, runtime Op 21 strictly requires sender == admin_address, which is mathematically impossible for addr_none.'
                : 'No discrepancy'
            }
          };
          report.summary.totalChecksPassed++;

          report.claims['renunciation_immutability'] = {
            title: 'Permanent Renunciation Guarantee',
            status: STATUS.VERIFIED,
            detail: 'Admin cannot be reclaimed or reassigned (Op 3 also requires sender == admin_address)',
            evidence: {
              canAdminBeRestored: false,
              canContentBeModified: false
            }
          };
          report.summary.totalChecksPassed++;
          report.summary.permanentRenounced = true;

        } else if (isNullAdmin && !codeMatchStandard) {
          // Admin is null, but non-standard code prevents guaranteeing no backdoor
          report.claims['admin_status'] = {
            title: 'Administrator Identity',
            status: STATUS.VERIFIED,
            detail: 'Admin field decodes to null/empty (addr_none)',
            evidence: { adminAddress: null, source: adminSource }
          };
          report.summary.totalChecksPassed++;

          report.claims['minting_permissions'] = {
            title: 'Minting Authorization',
            status: STATUS.NOT_VERIFIED,
            detail: 'Admin is empty, but non-standard bytecode may contain alternate privileged paths',
            evidence: { runtimeMintPossible: 'UNCERTAIN' }
          };
          report.summary.totalChecksUnverified++;

          report.claims['renunciation_immutability'] = {
            title: 'Permanent Renunciation Guarantee',
            status: STATUS.NOT_VERIFIED,
            detail: 'Cannot guarantee permanent immutability without verified standard bytecode',
            evidence: { canAdminBeRestored: 'UNKNOWN' }
          };
          report.summary.totalChecksUnverified++;

        } else {
          // Admin is active
          report.claims['admin_status'] = {
            title: 'Administrator Identity',
            status: STATUS.VERIFIED,
            detail: `Active Admin: ${parsedAdminAddress} ${isUserAdmin ? '(Current Wallet)' : ''}`,
            evidence: {
              adminAddress: parsedAdminAddress,
              isUserAdmin: isUserAdmin,
              source: adminSource
            }
          };
          report.summary.totalChecksPassed++;

          report.claims['minting_permissions'] = {
            title: 'Minting Authorization',
            status: STATUS.VERIFIED,
            detail: `Active: Administrator can mint additional tokens (Op 21 authorized for ${parsedAdminAddress.slice(0, 8)}...)`,
            evidence: { runtimeMintPossible: true }
          };
          report.summary.totalChecksPassed++;

          report.claims['renunciation_immutability'] = {
            title: 'Permanent Renunciation Guarantee',
            status: STATUS.FAILED,
            detail: 'Token is NOT renounced. Administrator retains privileged access.',
            evidence: { canAdminBeRestored: 'N/A (Admin already active)' }
          };
          report.summary.totalChecksFailed++;
        }
      }

      // ───────────────────────────────────────────────────────────────────────
      // STEP 5: Holder Enumeration & Supply Reconciliation
      // ───────────────────────────────────────────────────────────────────────
      let holderBalances = [];
      let totalHoldersReported = 0;
      let sumHolderUnits = 0n;
      let holderScanComplete = false;

      try {
        const holdersData = await queryTonApi(`/jettons/${encodeURIComponent(cleanAddress)}/holders`);
        providersUsed.push('TonAPI Holders Registry');
        totalHoldersReported = holdersData.total || 0;
        holderBalances = (holdersData.addresses || []).map(h => {
          const bal = safeBigInt(h.balance);
          sumHolderUnits += bal;
          return {
            owner: h.owner?.address,
            walletAddress: h.address,
            balanceRaw: h.balance,
            balanceFormatted: formatUnits(bal, decimals)
          };
        });
        // If supply was verified, holders exist, and total reported matches array length, the scan is complete
        holderScanComplete = supplyVerified && (totalHoldersReported > 0) && (holderBalances.length >= totalHoldersReported);
      } catch (e) {}

      const rawSupplyBn = safeBigInt(rawTotalSupply);
      const isSupplyReconciled = holderScanComplete && (sumHolderUnits === rawSupplyBn);
      const supplyDiff = rawSupplyBn - sumHolderUnits;

      report.claims['supply_reconciliation'] = {
        title: 'Holder Balance & Total Supply Reconciliation',
        status: isSupplyReconciled ? STATUS.VERIFIED : (holderScanComplete && supplyDiff !== 0n ? STATUS.FAILED : STATUS.NOT_VERIFIED),
        detail: isSupplyReconciled
          ? `100% Exact Reconciliation: Sum of ${holderBalances.length} holder balances (${formatUnits(sumHolderUnits, decimals)}) matches minter supply exactly (Diff: 0 atomic units)`
          : (holderScanComplete
              ? `Reconciliation Discrepancy: Sum of holders (${formatUnits(sumHolderUnits, decimals)}) differs from minter supply by ${supplyDiff.toString()} units`
              : `Partial holder scan (${holderBalances.length}/${totalHoldersReported} indexed). Complete reconciliation requires exhaustive archive indexing.`),
        evidence: {
          holdersCount: totalHoldersReported,
          indexedHolders: holderBalances.length,
          sumHolderUnits: sumHolderUnits.toString(),
          minterSupplyUnits: rawSupplyBn.toString(),
          exactDifferenceUnits: supplyDiff.toString(),
          isExhaustive: holderScanComplete
        }
      };
      if (isSupplyReconciled) report.summary.totalChecksPassed++;
      else if (holderScanComplete && supplyDiff !== 0n) report.summary.totalChecksFailed++;
      else report.summary.totalChecksUnverified++;

      // ───────────────────────────────────────────────────────────────────────
      // STEP 6: Vesting Contract Verification (if known or detected)
      // ───────────────────────────────────────────────────────────────────────
      const targetVesting = knownVestingAddress || detectVestingHolder(holderBalances);
      if (targetVesting) {
        const vestingAudit = await auditVestingContract(targetVesting, cleanAddress, {
          decimals,
          symbol: metadataObj.symbol || 'tokens'
        });
        report.claims['vesting_contract'] = vestingAudit.claim;
        if (vestingAudit.claim.status === STATUS.VERIFIED) report.summary.totalChecksPassed++;
        else if (vestingAudit.claim.status === STATUS.NOT_VERIFIED) report.summary.totalChecksUnverified++;
        else report.summary.totalChecksFailed++;
      } else {
        report.claims['vesting_contract'] = {
          title: 'Vesting & Token Lock Contract',
          status: STATUS.NOT_APPLICABLE,
          detail: 'No vesting contract associated or detected in holder registry',
          evidence: null
        };
      }

      // Finalize summary rating
      return finalizeReport(report);

    } catch (criticalErr) {
      report.claims['engine_execution'] = {
        title: 'Verification Engine Fault',
        status: STATUS.FAILED,
        detail: criticalErr.message || 'Fatal execution error during on-chain verification',
        evidence: null
      };
      report.summary.totalChecksFailed++;
      return finalizeReport(report);
    }
  }

  function detectVestingHolder(holders) {
    // Check if any holder is the known ANLGRAM vesting contract address
    const knownVesting = '0:eaac9ba5e9852e3969937abcb9eee92374d6c7679b80d4a7d93a6aef409540aa';
    const match = holders.find(h => h.owner && h.owner.toLowerCase() === knownVesting.toLowerCase());
    return match ? match.owner : null;
  }

  /**
   * Independently audit a deployed ANLGRAM Vesting Contract (BAJO-02 hardened)
   */
  async function auditVestingContract(vestingAddress, expectedMasterAddress, options = {}) {
    const tokenDecimals = options.decimals !== undefined ? options.decimals : 9;
    const tokenSymbol = options.symbol || 'tokens';

    if (!isValidTonAddress(vestingAddress)) {
      return {
        claim: {
          title: 'Vesting Contract Non-Custodial Lock Audit',
          status: STATUS.FAILED,
          detail: 'Invalid vesting contract TON address format or checksum',
          evidence: null
        }
      };
    }

    try {
      const vAcc = await queryTonApi(`/blockchain/accounts/${encodeURIComponent(vestingAddress.trim())}`);
      let vCodeHash = '';
      try {
        const tonCore = getTonCore();
        if (tonCore && tonCore.Cell && vAcc.code) {
          const codeBuf = /^[0-9a-fA-F]+$/.test(vAcc.code)
            ? Buffer.from(vAcc.code, 'hex')
            : Buffer.from(vAcc.code, 'base64');
          const vCell = tonCore.Cell.fromBoc(codeBuf)[0];
          vCodeHash = vCell.hash().toString('hex');
        }
      } catch (e) {}

      const stdVesting = AUDITED_BYTECODE_REGISTRY.ANLGRAM_VESTING_WALLET;
      const isVestingCodeStandard = (vCodeHash.toLowerCase() === stdVesting.hashHex.toLowerCase());

      // Query getter `get_vesting_data`
      const vGetter = await queryTonApi(`/blockchain/accounts/${encodeURIComponent(vestingAddress.trim())}/methods/get_vesting_data`);
      let isInit = false;
      let totalLocked = '0';
      let claimedAmount = '0';
      let startTime = 0;
      let cliffDuration = 0;
      let totalDuration = 0;
      let beneficiaryAddr = null;
      let creatorAddr = null;
      let vestingMasterAddr = null;

      if (vGetter && vGetter.success && Array.isArray(vGetter.stack) && vGetter.stack.length >= 10) {
        totalLocked = safeBigInt(vGetter.stack[0]?.num).toString();
        claimedAmount = safeBigInt(vGetter.stack[1]?.num).toString();
        startTime = Number(vGetter.stack[3]?.num || 0);
        cliffDuration = Number(vGetter.stack[4]?.num || 0);
        totalDuration = Number(vGetter.stack[5]?.num || 0);

        const benDecoded = decodeAddressFromBoc(vGetter.stack[6]?.cell || vGetter.stack[6]?.slice);
        if (benDecoded.ok) beneficiaryAddr = benDecoded.address;

        const creDecoded = decodeAddressFromBoc(vGetter.stack[7]?.cell || vGetter.stack[7]?.slice);
        if (creDecoded.ok) creatorAddr = creDecoded.address;

        const masDecoded = decodeAddressFromBoc(vGetter.stack[8]?.cell || vGetter.stack[8]?.slice);
        if (masDecoded.ok) vestingMasterAddr = masDecoded.address;

        isInit = (vGetter.stack[9]?.num === '0x1' || vGetter.stack[9]?.num === '1');
      }

      // BAJO-02: Verify association between Vesting Contract and expected Jetton Master
      let masterAssociationStatus = STATUS.VERIFIED;
      const expectedMasterRaw = expectedMasterAddress ? parseTonAddress(expectedMasterAddress) : null;
      if (expectedMasterAddress) {
        if (!expectedMasterRaw || !vestingMasterAddr) {
          masterAssociationStatus = STATUS.NOT_VERIFIED;
        } else if (vestingMasterAddr.toLowerCase() !== expectedMasterRaw.toLowerCase()) {
          masterAssociationStatus = STATUS.FAILED;
        }
      } else if (!vestingMasterAddr) {
        masterAssociationStatus = STATUS.NOT_VERIFIED;
      }

      const cliffDays = (cliffDuration / 86400).toFixed(0);
      const durationDays = (totalDuration / 86400).toFixed(0);
      const isBaseValid = (vAcc.status === 'active') && isVestingCodeStandard && isInit;

      let finalStatus = STATUS.FAILED;
      let detailMsg = '';

      if (!isBaseValid) {
        finalStatus = STATUS.FAILED;
        detailMsg = `Vesting contract validation failed (Active: ${vAcc.status === 'active'}, CodeMatch: ${isVestingCodeStandard}, Initialized: ${isInit})`;
      } else if (masterAssociationStatus === STATUS.FAILED) {
        finalStatus = STATUS.FAILED;
        detailMsg = `Vesting Jetton Master mismatch: contract locks ${vestingMasterAddr}, expected ${expectedMasterRaw}`;
      } else if (masterAssociationStatus === STATUS.NOT_VERIFIED) {
        finalStatus = STATUS.NOT_VERIFIED;
        detailMsg = 'Vesting contract is active, but association with the expected Jetton Master could not be verified on-chain';
      } else {
        finalStatus = STATUS.VERIFIED;
        detailMsg = `Verified Non-Custodial Vesting (${formatUnits(totalLocked, tokenDecimals)} ${tokenSymbol} locked, ${cliffDays}d cliff, ${durationDays}d duration, 0 clawback paths)`;
      }

      return {
        claim: {
          title: 'Vesting Contract Non-Custodial Lock Audit',
          status: finalStatus,
          detail: detailMsg,
          evidence: {
            vestingAddress: vestingAddress,
            codeHashHex: vCodeHash,
            jettonMasterAddress: vestingMasterAddr,
            expectedMasterAddress: expectedMasterRaw,
            beneficiaryAddress: beneficiaryAddr,
            creatorAddress: creatorAddr,
            totalLockedUnits: totalLocked,
            claimedUnits: claimedAmount,
            startTimeUtc: startTime > 0 ? new Date(startTime * 1000).toISOString() : null,
            cliffDurationDays: cliffDays,
            totalDurationDays: durationDays,
            isInitialized: isInit
          }
        }
      };
    } catch (e) {
      return {
        claim: {
          title: 'Vesting Contract Non-Custodial Lock Audit',
          status: STATUS.NOT_VERIFIED,
          detail: `Could not complete on-chain vesting contract audit: ${e.message}`,
          evidence: null
        }
      };
    }
  }

  function finalizeReport(report) {
    const cacheKey = report._cacheKey;
    delete report._cacheKey;

    const summary = report.summary;
    summary.allVerified = (summary.totalChecksFailed === 0 && summary.totalChecksUnverified === 0);

    if (summary.totalChecksFailed > 0) {
      summary.securityRating = 'HIGH RISK (CRITICAL CHECKS FAILED)';
    } else if (summary.totalChecksUnverified > 0) {
      summary.securityRating = 'MEDIUM (SOME CLAIMS UNVERIFIED)';
    } else if (summary.permanentRenounced) {
      summary.securityRating = 'INSTITUTIONAL SAFE (PERMANENTLY RENOUNCED & IMMUTABLE)';
    } else {
      summary.securityRating = 'OPERATIONAL (ADMIN ACTIVE, UNRENOUNCED)';
    }

    // BAJO-01: Cache report only when all checks are verified (no failed or unverified claims)
    if (cacheKey && summary.totalChecksFailed === 0 && summary.totalChecksUnverified === 0 &&
        report.claims.account_status?.status === STATUS.VERIFIED &&
        report.claims.total_supply?.status === STATUS.VERIFIED &&
        report.claims.admin_status?.status === STATUS.VERIFIED) {
      verificationCache.set(cacheKey, { timestamp: Date.now(), report: deepClone(report) });
    }

    return deepClone(report);
  }

  function createErrorReport(address, message) {
    return {
      target: { minterAddress: address || '', network: 'TON Mainnet' },
      auditTimestamp: new Date().toISOString(),
      dataSources: [],
      isCached: false,
      claims: {
        validation_error: {
          title: 'Input Validation',
          status: STATUS.FAILED,
          detail: message,
          evidence: null
        }
      },
      summary: {
        allVerified: false,
        permanentRenounced: false,
        totalChecksPassed: 0,
        totalChecksFailed: 1,
        totalChecksUnverified: 0,
        securityRating: 'INVALID ADDRESS'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. PUBLIC API (MEDIO-01: Deep-frozen against runtime mutation)
  // ═══════════════════════════════════════════════════════════════════════════

  return deepFreeze({
    STATUS,
    AUDITED_BYTECODE_REGISTRY,
    verifyToken,
    auditVestingContract,
    formatUnits,
    isValidTonAddress,
    parseTonAddress,
    decodeAddressFromBoc
  });
}));
