/**
 * ANLGRAM Explorer V2 - High-Precision TON Wallet Intelligence & PnL Accounting Engine
 * Institutional-Grade On-Chain Accounting adhering to ANLGRAM Real-Data Policy.
 * 
 * Supports:
 * - Deterministic DEX Trade Classification (STON.fi v1/v2, DeDust, Jetton Swaps)
 * - Strict Separation of Blockchain Transactions vs Economic Operations
 * - FIFO Cost-Basis Tracking with Granular Lot Audit Trail
 * - Realized PnL, Unrealized PnL, and Capital Flow Adjusted Net Worth
 * - Deduplication across multiple indexing feeds
 * - Protection against Fake/Homonym Tokens via Strict Master Contract Keying
 * - Honest Handling of Unknown Acquisition Costs and Low Liquidity Pools
 * - Quantitative Trader Performance Scorecard (Win Rate, Profit Factor, HHI Concentration)
 */

(function (global) {
  'use strict';

  // Canonical contracts & addresses
  const CANONICAL_GRAM_CONTRACT = 'EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O';
  const CANONICAL_GRAM_RAW = '0:b8ef4f77a17e5785bd31ba4da50abd91852f2b8febee97ad6ee16d941f939198';

  const KNOWN_DEX_ROUTERS = {
    'EQCSIMGBps_qzRG3uPYhON8bucyCtu0mYdL1-u4gSz77IBa3': { name: 'STON.fi DEX Router v1', protocol: 'STON.fi' },
    'EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt': { name: 'STON.fi DEX Router v2', protocol: 'STON.fi' },
    'EQDZ4yPwODeNi22_Qjqx9HKkM5SvBX4qHBT0l19VPqBuzm0u': { name: 'DeDust Core Vault', protocol: 'DeDust' },
    'EQB-akvxANB2z0ebkcgR8qp7Dn6Rpo9egt4IS8TUomTq6e8z': { name: 'DeDust Native Vault', protocol: 'DeDust' },
    'EQA-X_yo3fzzbPtuhDU0BOX7ElJOYgf-G6GLo2uOiSu0b_24': { name: 'Megaton Finance Router', protocol: 'Megaton' }
  };

  const KNOWN_BRIDGES = {
    'EQC210080zfqzqq4yR90fW650w7y9_712-A00n4486G-mC': { name: 'TON: Official Ethereum Bridge', network: 'Ethereum' },
    'EQAZ600100zfqzqq4yR90fW650w7y9_712-A00n4486G-mB': { name: 'TON: Official BSC Bridge', network: 'Binance Smart Chain' },
    'EQAV800100zfqzqq4yR90fW650w7y9_712-A00n4486G-mC': { name: 'TON: Official Polygon Bridge', network: 'Polygon' }
  };

  const KNOWN_CEX_WALLETS = {
    'EQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCXmC': 'Binance: Hot Wallet',
    'EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb': 'Binance: Deposit Router',
    'EQDn6G2gh0LtkzQ0_-uPCKY8fhAO6ELiX1manL8IkVdKbGzr': 'OKX: Hot Wallet 3',
    'EQDxXbLGLNhq_whg05xJH8c6MTlfr-tZReZESYViJgx4Lg4_': 'OKX: Hot Wallet 2',
    'EQA0i8-CdGn-igVzyh0vhKaIamA0cq-s_aR5Z_C2e-9dM5W9': 'Bybit: Hot Wallet'
  };

  // Helper: Address standardizer
  function normalizeAddress(addr) {
    if (!addr) return '';
    const clean = String(addr).trim();
    if (typeof global.toUserFriendly === 'function') {
      try {
        return global.toUserFriendly(clean, false);
      } catch (e) {
        return clean;
      }
    }
    return clean;
  }

  function roundMoney(num, decimals = 4) {
    if (num === null || num === undefined || isNaN(num)) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(Number(num) * factor) / factor;
  }

  // =========================================================================
  // 0. PAGINATION & LOGICAL TIME (LT) CURSOR HELPER
  // =========================================================================
  const PaginationHelper = {
    /**
     * Strictly validates whether a value is a valid Ton Logical Time (lt).
     * Rule: Must NOT use timestamp as fallback. Must be a positive integer or numeric string > 0.
     * Rejects unix timestamps (< 2 * 10^9).
     */
    isValidLt(val) {
      if (val === null || val === undefined || val === '') return false;
      if (typeof val === 'number') {
        return Number.isFinite(val) && val > 0 && Math.floor(val) === val && val > 2000000000;
      }
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!/^\d+$/.test(trimmed)) return false;
        try {
          const b = BigInt(trimmed);
          return b > 2000000000n;
        } catch (e) {
          return false;
        }
      }
      if (typeof val === 'bigint') {
        return val > 2000000000n;
      }
      return false;
    },

    /**
     * Extracts the oldest valid lt from a list of events.
     * Iterates backwards. Returns string representation of lt, or null if none found.
     * Strictly rejects timestamp fallbacks.
     */
    extractOldestValidLt(events) {
      if (!Array.isArray(events) || events.length === 0) return null;
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev && this.isValidLt(ev.lt)) {
          return String(ev.lt);
        }
      }
      return null;
    },

    /**
     * Validates chronological continuity, filters out duplicates, and checks page status.
     * @param {Array} currentEvents 
     * @param {Array} newEvents 
     * @returns {Object} { status: 'OK'|'EMPTY_PAGE'|'REPEATED_PAGE', deduplicatedEvents, addedCount, message }
     */
    mergePages(currentEvents = [], newEvents = []) {
      if (!Array.isArray(newEvents) || newEvents.length === 0) {
        return {
          status: 'EMPTY_PAGE',
          addedCount: 0,
          duplicateCount: 0,
          deduplicatedEvents: [...currentEvents],
          message: 'El proveedor devolvió una página vacía. Límite de historial alcanzado.'
        };
      }

      const seenIds = new Set();
      currentEvents.forEach(e => {
        const id = e.event_id || e.hash || e.txHash;
        if (id) seenIds.add(String(id));
      });

      const uniqueNewEvents = [];
      let duplicateCount = 0;

      for (const ev of newEvents) {
        const id = ev.event_id || ev.hash || ev.txHash;
        if (id && seenIds.has(String(id))) {
          duplicateCount++;
          continue;
        }
        if (id) seenIds.add(String(id));
        uniqueNewEvents.push(ev);
      }

      if (uniqueNewEvents.length === 0) {
        return {
          status: 'REPEATED_PAGE',
          addedCount: 0,
          duplicateCount,
          deduplicatedEvents: [...currentEvents],
          message: 'Página repetida devuelta por el proveedor. Todos los eventos ya habían sido indexados.'
        };
      }

      const merged = [...currentEvents, ...uniqueNewEvents];
      // Sort descending by timestamp or lt to preserve strict reverse-chronological order
      merged.sort((a, b) => {
        const timeA = a.timestamp || a.utime || 0;
        const timeB = b.timestamp || b.utime || 0;
        if (timeA !== timeB) return timeB - timeA;
        if (a.lt && b.lt) {
          try {
            const ltA = BigInt(a.lt);
            const ltB = BigInt(b.lt);
            return ltA > ltB ? -1 : (ltA < ltB ? 1 : 0);
          } catch (e) {
            return 0;
          }
        }
        return 0;
      });

      return {
        status: 'OK',
        addedCount: uniqueNewEvents.length,
        duplicateCount,
        deduplicatedEvents: merged,
        message: `+${uniqueNewEvents.length} eventos históricos incorporados sin duplicados.`
      };
    },

    /**
     * Computes the human-readable historical interval covered by the events.
     */
    formatCoverage(events = []) {
      if (!Array.isArray(events) || events.length === 0) {
        return { hasData: false, text: 'Sin eventos indexados' };
      }
      let minTs = Infinity;
      let maxTs = -Infinity;
      events.forEach(e => {
        const ts = e.timestamp || e.utime;
        if (ts && ts > 0) {
          if (ts < minTs) minTs = ts;
          if (ts > maxTs) maxTs = ts;
        }
      });

      if (minTs === Infinity || maxTs === -Infinity) {
        return { hasData: true, count: events.length, text: `${events.length} eventos (fechas no normalizadas)` };
      }

      const fromDate = new Date(minTs * 1000).toISOString().slice(0, 10);
      const toDate = new Date(maxTs * 1000).toISOString().slice(0, 10);
      return {
        hasData: true,
        count: events.length,
        oldestTimestamp: minTs,
        newestTimestamp: maxTs,
        fromDate,
        toDate,
        text: `Intervalo analizado: ${fromDate} a ${toDate} (${events.length} transacciones)`
      };
    }
  };

  // =========================================================================
  // 1. TRANSACTION CLASSIFIER ENGINE
  // =========================================================================
  class TransactionClassifier {
    constructor(options = {}) {
      this.knownOwnWallets = new Set((options.ownWallets || []).map(normalizeAddress));
    }

    addOwnWallet(addr) {
      if (addr) this.knownOwnWallets.add(normalizeAddress(addr));
    }

    removeOwnWallet(addr) {
      if (addr) this.knownOwnWallets.delete(normalizeAddress(addr));
    }

    /**
     * Classify an event or transaction trace.
     * @param {Object} event - TonAPI event or normalized action object
     * @param {string} targetWallet - The address of the wallet being analyzed
     * @returns {Object} Classified economic operation
     */
    classifyEvent(event, targetWallet) {
      const walletNorm = normalizeAddress(targetWallet);
      const timestamp = event.timestamp || event.utime || Math.floor(Date.now() / 1000);
      const txHash = event.event_id || event.hash || event.transaction_id || `tx_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
      const actions = Array.isArray(event.actions) ? event.actions : (event.action ? [event.action] : []);

      // Check for DEX JettonSwap action
      const swapAction = actions.find(a => a.type === 'JettonSwap' || a.JettonSwap);
      if (swapAction) {
        return this._classifyJettonSwap(swapAction, txHash, timestamp, walletNorm, event);
      }

      // Check for Jetton transfer or Ton transfer that interacts directly with known DEX router
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];

        if (action.type === 'JettonTransfer' || action.JettonTransfer) {
          const jt = action.JettonTransfer || action;
          const sender = normalizeAddress(jt.sender?.address || jt.sender);
          const recipient = normalizeAddress(jt.recipient?.address || jt.recipient);

          // Check if sender or recipient is a known DEX router
          const isSenderDex = KNOWN_DEX_ROUTERS[sender] || KNOWN_DEX_ROUTERS[jt.sender?.address];
          const isRecipientDex = KNOWN_DEX_ROUTERS[recipient] || KNOWN_DEX_ROUTERS[jt.recipient?.address];

          if (isRecipientDex) {
            // Outgoing Jetton to DEX router -> Sell Initiation or LP
            const dexInfo = isRecipientDex;
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'SELL',
              status: action.status || 'ok',
              token: {
                address: jt.jetton?.address || jt.jetton_master?.address || 'unknown_jetton',
                name: jt.jetton?.name || jt.jetton_master?.name || 'Jetton',
                symbol: jt.jetton?.symbol || jt.jetton_master?.symbol || 'TOKEN',
                decimals: jt.jetton?.decimals || jt.jetton_master?.decimals || 9
              },
              tokenAmount: jt.amount ? (Number(jt.amount) / Math.pow(10, jt.jetton?.decimals || 9)) : 0,
              counterAsset: { symbol: 'TON', decimals: 9 },
              counterAmount: null, // Pending settlement
              unitPriceUsd: null,
              valueUsd: null,
              feeTon: (event.total_fees || 0) / 1e9,
              feeUsd: null,
              dex: dexInfo.protocol || 'DEX Router',
              dexRouter: recipient,
              sender,
              recipient,
              isClassified: true,
              evidence: `Transferencia enviada a router DEX ${dexInfo.name}`
            };
          }

          if (isSenderDex && recipient === walletNorm) {
            // Inflow from DEX router -> Buy Receipt
            const dexInfo = isSenderDex;
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'BUY',
              status: action.status || 'ok',
              token: {
                address: jt.jetton?.address || jt.jetton_master?.address || 'unknown_jetton',
                name: jt.jetton?.name || jt.jetton_master?.name || 'Jetton',
                symbol: jt.jetton?.symbol || jt.jetton_master?.symbol || 'TOKEN',
                decimals: jt.jetton?.decimals || jt.jetton_master?.decimals || 9
              },
              tokenAmount: jt.amount ? (Number(jt.amount) / Math.pow(10, jt.jetton?.decimals || 9)) : 0,
              counterAsset: { symbol: 'TON', decimals: 9 },
              counterAmount: null,
              unitPriceUsd: null,
              valueUsd: null,
              feeTon: (event.total_fees || 0) / 1e9,
              feeUsd: null,
              dex: dexInfo.protocol || 'DEX Router',
              dexRouter: sender,
              sender,
              recipient,
              isClassified: true,
              evidence: `Jetton recibido desde router DEX ${dexInfo.name}`
            };
          }

          // Check if internal transfer between own wallets
          if (this.knownOwnWallets.has(sender) && this.knownOwnWallets.has(recipient)) {
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'INTERNAL_TRANSFER',
              status: action.status || 'ok',
              token: {
                address: jt.jetton?.address || jt.jetton_master?.address || 'unknown_jetton',
                name: jt.jetton?.name || jt.jetton_master?.name || 'Jetton',
                symbol: jt.jetton?.symbol || jt.jetton_master?.symbol || 'TOKEN',
                decimals: jt.jetton?.decimals || jt.jetton_master?.decimals || 9
              },
              tokenAmount: jt.amount ? (Number(jt.amount) / Math.pow(10, jt.jetton?.decimals || 9)) : 0,
              sender,
              recipient,
              feeTon: (event.total_fees || 0) / 1e9,
              isClassified: true,
              evidence: 'Transferencia verificada entre wallets propias declaradas'
            };
          }

          // Check for Mint / Reward / Airdrop
          if (jt.senders_wallet === '0:0000000000000000000000000000000000000000000000000000000000000000' || 
              sender === '0:0000000000000000000000000000000000000000000000000000000000000000' ||
              (jt.comment && /reward|airdrop|claim|mining|giver/i.test(jt.comment))) {
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'REWARD',
              status: action.status || 'ok',
              token: {
                address: jt.jetton?.address || jt.jetton_master?.address || 'unknown_jetton',
                name: jt.jetton?.name || jt.jetton_master?.name || 'Jetton',
                symbol: jt.jetton?.symbol || jt.jetton_master?.symbol || 'TOKEN',
                decimals: jt.jetton?.decimals || jt.jetton_master?.decimals || 9
              },
              tokenAmount: jt.amount ? (Number(jt.amount) / Math.pow(10, jt.jetton?.decimals || 9)) : 0,
              sender,
              recipient,
              feeTon: (event.total_fees || 0) / 1e9,
              isClassified: true,
              evidence: 'Recompensa o airdrop de contrato/giver documentado'
            };
          }

          // Standard Inflow vs Outflow
          const isInflow = recipient === walletNorm;
          const feeTon = isInflow ? 0 : ((event.total_fees || 0) / 1e9);
          return {
            operationId: `${txHash}_${i}`,
            txHash,
            timestamp,
            type: isInflow ? 'TRANSFER_IN' : 'TRANSFER_OUT',
            status: action.status || 'ok',
            token: {
              address: jt.jetton?.address || jt.jetton_master?.address || 'unknown_jetton',
              name: jt.jetton?.name || jt.jetton_master?.name || 'Jetton',
              symbol: jt.jetton?.symbol || jt.jetton_master?.symbol || 'TOKEN',
              decimals: jt.jetton?.decimals || jt.jetton_master?.decimals || 9
            },
            tokenAmount: jt.amount ? (Number(jt.amount) / Math.pow(10, jt.jetton?.decimals || 9)) : 0,
            sender,
            recipient,
            comment: jt.comment || '',
            feeTon,
            isClassified: true,
            evidence: isInflow ? 'Transferencia P2P entrante sin contraprestación DEX (comisión pagada por emisor)' : 'Transferencia P2P saliente'
          };
        }

        // TON Transfers
        if (action.type === 'TonTransfer' || action.TonTransfer) {
          const tt = action.TonTransfer || action;
          const sender = normalizeAddress(tt.sender?.address || tt.sender);
          const recipient = normalizeAddress(tt.recipient?.address || tt.recipient);

          // Bridge Check
          if (KNOWN_BRIDGES[recipient] || KNOWN_BRIDGES[tt.recipient?.address]) {
            const bridgeInfo = KNOWN_BRIDGES[recipient] || KNOWN_BRIDGES[tt.recipient?.address];
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'BRIDGE_OUT',
              status: action.status || 'ok',
              token: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: 'native' },
              tokenAmount: (tt.amount || 0) / 1e9,
              sender,
              recipient,
              network: bridgeInfo.network,
              feeTon: (event.total_fees || 0) / 1e9,
              isClassified: true,
              evidence: `Interacción con puente oficial de TON hacia red ${bridgeInfo.network}`
            };
          }

          // CEX Deposit
          if (KNOWN_CEX_WALLETS[recipient]) {
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'CEX_DEPOSIT',
              status: action.status || 'ok',
              token: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: 'native' },
              tokenAmount: (tt.amount || 0) / 1e9,
              sender,
              recipient,
              exchange: KNOWN_CEX_WALLETS[recipient],
              feeTon: (event.total_fees || 0) / 1e9,
              isClassified: true,
              evidence: `Depósito en exchange centralizado (${KNOWN_CEX_WALLETS[recipient]})`
            };
          }

          // CEX Withdrawal
          if (KNOWN_CEX_WALLETS[sender] && recipient === walletNorm) {
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'CEX_WITHDRAWAL',
              status: action.status || 'ok',
              token: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: 'native' },
              tokenAmount: (tt.amount || 0) / 1e9,
              sender,
              recipient,
              exchange: KNOWN_CEX_WALLETS[sender],
              feeTon: 0,
              isClassified: true,
              evidence: `Retiro desde exchange centralizado (${KNOWN_CEX_WALLETS[sender]})`
            };
          }

          // Internal transfer
          if (this.knownOwnWallets.has(sender) && this.knownOwnWallets.has(recipient)) {
            return {
              operationId: `${txHash}_${i}`,
              txHash,
              timestamp,
              type: 'INTERNAL_TRANSFER',
              status: action.status || 'ok',
              token: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: 'native' },
              tokenAmount: (tt.amount || 0) / 1e9,
              sender,
              recipient,
              feeTon: (event.total_fees || 0) / 1e9,
              isClassified: true,
              evidence: 'Transferencia TON verificada entre wallets propias declaradas'
            };
          }

          const isInflow = recipient === walletNorm;
          const feeTon = isInflow ? 0 : ((event.total_fees || 0) / 1e9);
          return {
            operationId: `${txHash}_${i}`,
            txHash,
            timestamp,
            type: isInflow ? 'TRANSFER_IN' : 'TRANSFER_OUT',
            status: action.status || 'ok',
            token: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: 'native' },
            tokenAmount: (tt.amount || 0) / 1e9,
            sender,
            recipient,
            comment: tt.comment || '',
            feeTon,
            isClassified: true,
            evidence: isInflow ? 'Transferencia TON entrante P2P (comisión pagada por emisor)' : 'Transferencia TON saliente P2P'
          };
        }

        // Smart Contract interaction
        if (action.type === 'SmartContractExec' || action.SmartContractExec) {
          return {
            operationId: `${txHash}_${i}`,
            txHash,
            timestamp,
            type: 'CONTRACT_CALL',
            status: action.status || 'ok',
            token: { symbol: 'TON', name: 'Gas Fee', decimals: 9, address: 'native' },
            tokenAmount: 0,
            feeTon: (event.total_fees || 0) / 1e9,
            isClassified: true,
            evidence: 'Ejecución directa de método en contrato inteligente'
          };
        }
      }

      // Default fallback: Unclassified with honest reason
      return {
        operationId: `${txHash}_0`,
        txHash,
        timestamp,
        type: 'UNCLASSIFIED',
        status: 'unknown',
        token: { symbol: 'DESCONOCIDO', address: 'none' },
        tokenAmount: 0,
        feeTon: (event.total_fees || 0) / 1e9,
        isClassified: false,
        evidence: 'No clasificada',
        limitation: 'El mensaje on-chain no contiene interfaz DEX, payload decodificable ni contrato estándar conocido.'
      };
    }

    _classifyJettonSwap(action, txHash, timestamp, walletNorm, event = null) {
      const s = action.JettonSwap || action;
      const dex = s.dex || (s.router?.name?.toLowerCase().includes('dedust') ? 'dedust' : 'stonfi');
      const dexName = s.router?.name || (dex === 'dedust' ? 'DeDust Protocol' : 'STON.fi DEX');
      const routerAddr = normalizeAddress(s.router?.address || s.router);

      // Analyze in/out assets
      const hasTonIn = s.ton_in !== undefined && s.ton_in !== null && Number(s.ton_in) > 0;
      const hasTonOut = s.ton_out !== undefined && s.ton_out !== null && Number(s.ton_out) > 0;
      const jmIn = s.jetton_master_in;
      const jmOut = s.jetton_master_out;

      let tradeType = 'SWAP';
      let targetToken = null;
      let counterAsset = null;
      let targetAmount = 0;
      let counterAmount = 0;
      let unitPriceUsd = null;
      let unitPriceTon = null;

      if (hasTonIn && jmOut) {
        // TON -> Jetton = BUY
        tradeType = 'BUY';
        const decimals = jmOut.decimals || 9;
        targetToken = {
          address: normalizeAddress(jmOut.address),
          name: jmOut.name || 'Jetton',
          symbol: jmOut.symbol || 'TOKEN',
          decimals
        };
        targetAmount = Number(s.amount_out || 0) / Math.pow(10, decimals);
        counterAsset = { symbol: 'TON', decimals: 9, address: 'native' };
        counterAmount = Number(s.ton_in) / 1e9;
        if (targetAmount > 0) {
          unitPriceTon = counterAmount / targetAmount;
        }
      } else if (jmIn && hasTonOut) {
        // Jetton -> TON = SELL
        tradeType = 'SELL';
        const decimals = jmIn.decimals || 9;
        targetToken = {
          address: normalizeAddress(jmIn.address),
          name: jmIn.name || 'Jetton',
          symbol: jmIn.symbol || 'TOKEN',
          decimals
        };
        targetAmount = Number(s.amount_in || 0) / Math.pow(10, decimals);
        counterAsset = { symbol: 'TON', decimals: 9, address: 'native' };
        counterAmount = Number(s.ton_out) / 1e9;
        if (targetAmount > 0) {
          unitPriceTon = counterAmount / targetAmount;
        }
      } else if (jmIn && jmOut) {
        // Jetton A -> Jetton B
        // If one is USDT, classify as BUY or SELL of the other
        const isUsdtIn = (jmIn.symbol === 'USD₮' || jmIn.symbol === 'USDT');
        const isUsdtOut = (jmOut.symbol === 'USD₮' || jmOut.symbol === 'USDT');

        if (isUsdtIn) {
          tradeType = 'BUY';
          const decOut = jmOut.decimals || 9;
          const decIn = jmIn.decimals || 6;
          targetToken = {
            address: normalizeAddress(jmOut.address),
            name: jmOut.name || 'Jetton',
            symbol: jmOut.symbol || 'TOKEN',
            decimals: decOut
          };
          targetAmount = Number(s.amount_out || 0) / Math.pow(10, decOut);
          counterAsset = { symbol: 'USDT', decimals: decIn, address: normalizeAddress(jmIn.address) };
          counterAmount = Number(s.amount_in || 0) / Math.pow(10, decIn);
          if (targetAmount > 0) {
            unitPriceUsd = counterAmount / targetAmount;
          }
        } else if (isUsdtOut) {
          tradeType = 'SELL';
          const decIn = jmIn.decimals || 9;
          const decOut = jmOut.decimals || 6;
          targetToken = {
            address: normalizeAddress(jmIn.address),
            name: jmIn.name || 'Jetton',
            symbol: jmIn.symbol || 'TOKEN',
            decimals: decIn
          };
          targetAmount = Number(s.amount_in || 0) / Math.pow(10, decIn);
          counterAsset = { symbol: 'USDT', decimals: decOut, address: normalizeAddress(jmOut.address) };
          counterAmount = Number(s.amount_out || 0) / Math.pow(10, decOut);
          if (targetAmount > 0) {
            unitPriceUsd = counterAmount / targetAmount;
          }
        } else {
          tradeType = 'JETTON_SWAP';
          const decIn = jmIn.decimals || 9;
          const decOut = jmOut.decimals || 9;
          targetToken = {
            address: normalizeAddress(jmOut.address),
            name: jmOut.name || 'Jetton Out',
            symbol: jmOut.symbol || 'OUT',
            decimals: decOut
          };
          targetAmount = Number(s.amount_out || 0) / Math.pow(10, decOut);
          counterAsset = {
            address: normalizeAddress(jmIn.address),
            name: jmIn.name || 'Jetton In',
            symbol: jmIn.symbol || 'IN',
            decimals: decIn
          };
          counterAmount = Number(s.amount_in || 0) / Math.pow(10, decIn);
        }
      } else {
        tradeType = 'SWAP';
        targetToken = { symbol: 'TOKEN', address: 'unknown' };
      }

      return {
        operationId: `${txHash}_swap`,
        txHash,
        timestamp,
        type: tradeType,
        status: action.status || 'ok',
        token: targetToken,
        tokenAmount: targetAmount,
        counterAsset,
        counterAmount,
        unitPriceTon,
        unitPriceUsd,
        valueUsd: unitPriceUsd && targetAmount ? (unitPriceUsd * targetAmount) : null,
        feeTon: (event && event.total_fees !== undefined) ? ((Number(event.total_fees) || 0) / 1e9) : 0.03, // Verifiable transaction fee without duplication
        feeUsd: null,
        dex: dexName,
        dexRouter: routerAddr,
        isClassified: true,
        evidence: `Operación DEX confirmada en ${dexName}`
      };
    }
  }

  // =========================================================================
  // 2. DEDUPLICATION ENGINE
  // =========================================================================
  class TradeDeduplicator {
    constructor() {
      this.seenSignatures = new Set();
    }

    /**
     * Deduplicate a list of trades/operations.
     */
    deduplicate(operations) {
      const result = [];
      for (const op of operations) {
        if (!op) continue;
        const sig = `${op.txHash}_${op.type}_${op.token?.address || ''}_${Math.round((op.tokenAmount || 0) * 1000)}`;
        if (this.seenSignatures.has(sig)) {
          continue;
        }
        this.seenSignatures.add(sig);
        result.push(op);
      }
      return result;
    }

    reset() {
      this.seenSignatures.clear();
    }
  }

  // =========================================================================
  // 3. FIFO COST BASIS & PnL ACCOUNTING ENGINE
  // =========================================================================
  class AccountingEngine {
    constructor(options = {}) {
      this.costBasisMethod = options.method || 'FIFO'; // Designed for extensible methods: FIFO, LIFO, WAC
      this.tonUsdRate = options.tonPriceUsd || null;
      this.tokenLots = new Map(); // contractAddress -> Array<Lot>
      this.closedTrades = [];
      this.cumulativeRealizedPnlUsd = 0;
      this.cumulativeFeesUsd = 0;
      this.unallocatedFeesUsd = 0;
      this.historyCoverageNotice = '';
      this.knownCostOperationsCount = 0;
      this.unknownCostOperationsCount = 0;
      this.unknownCostSalesCount = 0;
      this.unknownCostGrossProceedsUsd = 0;
      this.unknownCostFeesUsd = 0;
    }

    setTonPrice(price) {
      if (price && Number(price) > 0) {
        this.tonUsdRate = Number(price);
      }
    }

    _getLotQueue(contractAddress) {
      const key = normalizeAddress(contractAddress);
      if (!this.tokenLots.has(key)) {
        this.tokenLots.set(key, []);
      }
      return this.tokenLots.get(key);
    }

    /**
     * Process an identified BUY operation.
     */
    processBuy(op) {
      if (!op || !op.token || !op.token.address) return;
      const key = normalizeAddress(op.token.address);
      const queue = this._getLotQueue(key);

      const amount = Number(op.tokenAmount) || 0;
      if (amount <= 0) return;

      // Calculate unit cost in USD
      let unitCostUsd = null;
      let totalCostUsd = null;
      const feeTon = Number(op.feeTon) || 0;
      const feeUsd = op.feeUsd || (this.tonUsdRate ? feeTon * this.tonUsdRate : 0);
      this.cumulativeFeesUsd += feeUsd;

      if (op.unitPriceUsd && Number(op.unitPriceUsd) > 0) {
        unitCostUsd = Number(op.unitPriceUsd) + (amount > 0 ? (feeUsd / amount) : 0);
        totalCostUsd = unitCostUsd * amount;
      } else if (op.unitPriceTon && this.tonUsdRate) {
        const costTon = (Number(op.counterAmount) || (Number(op.unitPriceTon) * amount)) + feeTon;
        totalCostUsd = costTon * this.tonUsdRate;
        unitCostUsd = totalCostUsd / amount;
      } else if (op.valueUsd && Number(op.valueUsd) > 0) {
        totalCostUsd = Number(op.valueUsd) + feeUsd;
        unitCostUsd = totalCostUsd / amount;
      }

      const hasKnownCost = unitCostUsd !== null && !isNaN(unitCostUsd);
      if (hasKnownCost) {
        this.knownCostOperationsCount++;
      } else {
        this.unknownCostOperationsCount++;
      }

      const lot = {
        lotId: `lot_${op.txHash}_${queue.length}`,
        txHash: op.txHash,
        timestamp: op.timestamp,
        originalAmount: amount,
        amountRemaining: amount,
        unitCostUsd: hasKnownCost ? unitCostUsd : null,
        totalCostUsd: hasKnownCost ? totalCostUsd : null,
        feeUsd,
        source: 'BUY',
        hasKnownCost,
        token: op.token
      };

      queue.push(lot);
    }

    /**
     * Process an identified incoming transfer without documented purchase cost.
     */
    processTransferIn(op) {
      if (!op || !op.token || !op.token.address) return;
      const key = normalizeAddress(op.token.address);
      const queue = this._getLotQueue(key);
      const amount = Number(op.tokenAmount) || 0;
      if (amount <= 0) return;

      this.unknownCostOperationsCount++;

      // In accordance with Rule 5: Receiving an unpriced transfer is NOT assumed to have $0 cost basis!
      // Marked strictly as hasKnownCost = false, unitCostUsd = null.
      const lot = {
        lotId: `lot_transfer_${op.txHash}_${queue.length}`,
        txHash: op.txHash,
        timestamp: op.timestamp,
        originalAmount: amount,
        amountRemaining: amount,
        unitCostUsd: null,
        totalCostUsd: null,
        feeUsd: 0,
        source: 'TRANSFER_IN',
        hasKnownCost: false,
        token: op.token,
        note: 'Transferencia entrante sin coste de adquisición conocido'
      };

      queue.push(lot);
    }

    /**
     * Process an internal transfer between user's own wallets.
     */
    processInternalTransfer(op, senderLot = null) {
      if (!op || !op.token || !op.token.address) return;
      const key = normalizeAddress(op.token.address);
      const queue = this._getLotQueue(key);
      const amount = Number(op.tokenAmount) || 0;
      if (amount <= 0) return;

      // Carry over cost basis if senderLot is available; else mark as internal
      const hasKnownCost = senderLot && senderLot.hasKnownCost;
      const unitCostUsd = hasKnownCost ? senderLot.unitCostUsd : null;

      const lot = {
        lotId: `lot_internal_${op.txHash}_${queue.length}`,
        txHash: op.txHash,
        timestamp: op.timestamp,
        originalAmount: amount,
        amountRemaining: amount,
        unitCostUsd,
        totalCostUsd: unitCostUsd ? unitCostUsd * amount : null,
        feeUsd: 0,
        source: 'INTERNAL_TRANSFER',
        hasKnownCost,
        token: op.token,
        note: 'Transferencia consolidada entre wallets propias'
      };

      queue.push(lot);
    }

    /**
     * Process reward / airdrop tokens.
     */
    processReward(op) {
      if (!op || !op.token || !op.token.address) return;
      const key = normalizeAddress(op.token.address);
      const queue = this._getLotQueue(key);
      const amount = Number(op.tokenAmount) || 0;
      if (amount <= 0) return;

      // Rewards have documented acquisition cost = 0 (or marked as reward distribution)
      const lot = {
        lotId: `lot_reward_${op.txHash}_${queue.length}`,
        txHash: op.txHash,
        timestamp: op.timestamp,
        originalAmount: amount,
        amountRemaining: amount,
        unitCostUsd: 0,
        totalCostUsd: 0,
        feeUsd: 0,
        source: 'REWARD',
        hasKnownCost: true,
        token: op.token,
        note: 'Recompensa on-chain / Airdrop'
      };

      this.knownCostOperationsCount++;
      queue.push(lot);
    }

    /**
     * Process an identified SELL operation using FIFO consumption.
     */
    processSell(op) {
      if (!op || !op.token || !op.token.address) return null;
      const key = normalizeAddress(op.token.address);
      const queue = this._getLotQueue(key);

      const amountToSell = Number(op.tokenAmount) || 0;
      if (amountToSell <= 0) return null;

      // Net Proceeds
      let grossProceedsUsd = null;
      const feeTon = Number(op.feeTon) || 0;
      const feeUsd = op.feeUsd || (this.tonUsdRate ? feeTon * this.tonUsdRate : 0);
      this.cumulativeFeesUsd += feeUsd;

      if (op.unitPriceUsd && Number(op.unitPriceUsd) > 0) {
        grossProceedsUsd = Number(op.unitPriceUsd) * amountToSell;
      } else if (op.unitPriceTon && this.tonUsdRate) {
        const proceedsTon = (Number(op.counterAmount) || (Number(op.unitPriceTon) * amountToSell));
        grossProceedsUsd = proceedsTon * this.tonUsdRate;
      } else if (op.valueUsd && Number(op.valueUsd) > 0) {
        grossProceedsUsd = Number(op.valueUsd);
      }

      const netProceedsUsd = grossProceedsUsd !== null ? (grossProceedsUsd - feeUsd) : null;

      // Consume lots via FIFO
      let remainingToConsume = amountToSell;
      const consumedLots = [];
      let totalCostBasisUsd = 0;
      let hasAnyUnknownCost = false;

      for (let i = 0; i < queue.length && remainingToConsume > 1e-12; i++) {
        const lot = queue[i];
        if (lot.amountRemaining <= 1e-12) continue;

        const takeAmount = Math.min(lot.amountRemaining, remainingToConsume);
        lot.amountRemaining -= takeAmount;
        remainingToConsume -= takeAmount;

        if (lot.hasKnownCost && lot.unitCostUsd !== null) {
          totalCostBasisUsd += (takeAmount * lot.unitCostUsd);
        } else {
          hasAnyUnknownCost = true;
        }

        consumedLots.push({
          lotId: lot.lotId,
          sourceTx: lot.txHash,
          sourceType: lot.source,
          amountConsumed: takeAmount,
          unitCostUsd: lot.unitCostUsd,
          hasKnownCost: lot.hasKnownCost
        });
      }

      // If sell exceeds tracked lots, remainder has unknown cost
      if (remainingToConsume > 1e-6) {
        hasAnyUnknownCost = true;
      }

      let realizedPnlUsd = null;
      let roiPct = null;
      let pnlStatus = 'VALID';

      if (hasAnyUnknownCost || netProceedsUsd === null) {
        pnlStatus = 'UNKNOWN_COST';
        realizedPnlUsd = null;
        roiPct = null;
        this.unknownCostSalesCount++;
        this.unknownCostGrossProceedsUsd = roundMoney(this.unknownCostGrossProceedsUsd + (grossProceedsUsd || 0), 4);
        this.unknownCostFeesUsd = roundMoney(this.unknownCostFeesUsd + feeUsd, 4);
      } else {
        totalCostBasisUsd = roundMoney(totalCostBasisUsd, 4);
        realizedPnlUsd = roundMoney(netProceedsUsd - totalCostBasisUsd, 4);
        roiPct = totalCostBasisUsd > 0 ? (realizedPnlUsd / totalCostBasisUsd) * 100 : null;
        this.cumulativeRealizedPnlUsd = roundMoney(this.cumulativeRealizedPnlUsd + realizedPnlUsd, 4);
      }

      this.cumulativeFeesUsd = roundMoney(this.cumulativeFeesUsd, 4);

      const closedTrade = {
        tradeId: `trade_${op.txHash}_${this.closedTrades.length}`,
        txHash: op.txHash,
        timestamp: op.timestamp,
        token: op.token,
        amountSold: amountToSell,
        counterAsset: op.counterAsset,
        counterAmount: op.counterAmount,
        grossProceedsUsd: roundMoney(grossProceedsUsd, 4),
        feeUsd: roundMoney(feeUsd, 4),
        netProceedsUsd: roundMoney(netProceedsUsd, 4),
        costBasisUsd: hasAnyUnknownCost ? null : roundMoney(totalCostBasisUsd, 4),
        realizedPnlUsd,
        roiPct: roiPct !== null ? roundMoney(roiPct, 4) : null,
        pnlStatus,
        consumedLots,
        dex: op.dex || 'DEX Router',
        isProfitable: realizedPnlUsd !== null ? (realizedPnlUsd > 0) : null
      };

      this.closedTrades.push(closedTrade);
      return closedTrade;
    }

    /**
     * Compute current holdings, unrealized PnL, and portfolio metrics.
     * @param {Array} currentBalances - Balances list from TonAPI (/v2/accounts/{address}/jettons)
     * @param {Object} tokenPrices - Map of masterContract -> { priceUsd, liquidityUsd, isVerified }
     */
    evaluatePortfolio(currentBalances = [], tokenPrices = {}) {
      const positions = [];
      let totalPortfolioValueUsd = 0;
      let totalKnownCostValueUsd = 0;
      let totalUnrealizedPnlUsd = 0;
      let knownCostHoldingsCount = 0;
      let unknownCostHoldingsCount = 0;

      // Group active open lots by token
      for (const [contractAddr, queue] of this.tokenLots.entries()) {
        const remainingLots = queue.filter(l => l.amountRemaining > 1e-9);
        const totalRemaining = remainingLots.reduce((acc, l) => acc + l.amountRemaining, 0);
        if (totalRemaining <= 1e-9) continue;

        const knownLots = remainingLots.filter(l => l.hasKnownCost && l.unitCostUsd !== null);
        const knownAmount = knownLots.reduce((acc, l) => acc + l.amountRemaining, 0);
        const knownCostUsd = knownLots.reduce((acc, l) => acc + (l.amountRemaining * l.unitCostUsd), 0);
        const avgUnitCostUsd = knownAmount > 0 ? (knownCostUsd / knownAmount) : null;

        const tokenMeta = remainingLots[0]?.token || { address: contractAddr, symbol: 'TOKEN', name: 'Jetton' };
        const priceInfo = tokenPrices[contractAddr] || tokenPrices[normalizeAddress(contractAddr)] || null;

        let currentPriceUsd = null;
        let positionValueUsd = null;
        let unrealizedPnlUsd = null;
        let unrealizedRoiPct = null;
        let valuationStatus = 'PRICE_UNAVAILABLE';
        let valuationCategory = 'PRECIO_NO_DISPONIBLE';
        let liquidityUsd = priceInfo?.liquidityUsd || 0;

        if (priceInfo && priceInfo.priceUsd && Number(priceInfo.priceUsd) > 0) {
          currentPriceUsd = Number(priceInfo.priceUsd);
          positionValueUsd = totalRemaining * currentPriceUsd;

          // Check liquidity threshold (min $1000 reserve for confident valuation)
          if (liquidityUsd < 1000 && !priceInfo.isVerifiedMajor) {
            valuationStatus = 'LOW_LIQUIDITY_WARNING';
            valuationCategory = 'RIESGO_DESLIZAMIENTO';
          } else {
            valuationStatus = 'CONFIDENT';
            valuationCategory = 'VALOR_MERCADO_VERIFICADO';
          }

          if (knownAmount > 0 && valuationStatus === 'CONFIDENT') {
            const currentValOfKnown = knownAmount * currentPriceUsd;
            unrealizedPnlUsd = currentValOfKnown - knownCostUsd;
            unrealizedRoiPct = knownCostUsd > 0 ? (unrealizedPnlUsd / knownCostUsd) * 100 : null;
            totalUnrealizedPnlUsd += unrealizedPnlUsd;
          }
        }

        if (positionValueUsd !== null) {
          totalPortfolioValueUsd += positionValueUsd;
        }
        if (knownCostUsd > 0) {
          totalKnownCostValueUsd += knownCostUsd;
          knownCostHoldingsCount++;
        } else {
          unknownCostHoldingsCount++;
        }

        positions.push({
          contractAddress: contractAddr,
          token: tokenMeta,
          balance: totalRemaining,
          knownCostBalance: knownAmount,
          unknownCostBalance: totalRemaining - knownAmount,
          totalAcquisitionCostUsd: knownCostUsd > 0 ? knownCostUsd : null,
          avgUnitCostUsd,
          currentPriceUsd,
          currentValueUsd: positionValueUsd,
          unrealizedPnlUsd,
          unrealizedRoiPct,
          valuationStatus,
          valuationCategory,
          liquidityUsd,
          priceSource: priceInfo?.source || 'STON.fi / TonAPI',
          isLossMaking: unrealizedPnlUsd !== null && unrealizedPnlUsd < 0,
          openLotsCount: remainingLots.length
        });
      }

      // Calculate portfolio weight %
      positions.forEach(p => {
        p.portfolioSharePct = (totalPortfolioValueUsd > 0 && p.currentValueUsd !== null) 
          ? (p.currentValueUsd / totalPortfolioValueUsd) * 100 
          : 0;
      });

      // Filter Loss-making positions
      const lossMakingPositions = positions.filter(p => p.isLossMaking);
      const lossMakingTrades = this.closedTrades.filter(t => t.realizedPnlUsd !== null && t.realizedPnlUsd < 0);

      // Known cost coverage ratio
      const totalEvaluatedHoldings = knownCostHoldingsCount + unknownCostHoldingsCount;
      const costCoveragePct = totalEvaluatedHoldings > 0 
        ? (knownCostHoldingsCount / totalEvaluatedHoldings) * 100 
        : 0;

      const evaluableTradesCount = this.closedTrades.filter(t => t.realizedPnlUsd !== null).length;

      return {
        positions,
        lossMakingPositions,
        lossMakingTrades,
        totalPortfolioValueUsd: totalPortfolioValueUsd > 0 ? totalPortfolioValueUsd : null,
        totalKnownCostValueUsd: totalKnownCostValueUsd > 0 ? totalKnownCostValueUsd : null,
        totalRealizedPnlUsd: this.cumulativeRealizedPnlUsd,
        totalUnrealizedPnlUsd: knownCostHoldingsCount > 0 ? totalUnrealizedPnlUsd : null,
        netEstimatedPnlUsd: (knownCostHoldingsCount > 0 || evaluableTradesCount > 0) 
          ? (this.cumulativeRealizedPnlUsd + totalUnrealizedPnlUsd - this.cumulativeFeesUsd) 
          : null,
        totalFeesUsd: this.cumulativeFeesUsd,
        costCoveragePct,
        closedTradesCount: this.closedTrades.length,
        evaluableTradesCount,
        unknownCostSalesCount: this.unknownCostSalesCount,
        unknownCostGrossProceedsUsd: this.unknownCostGrossProceedsUsd,
        unknownCostFeesUsd: this.unknownCostFeesUsd
      };
    }
  }

  // =========================================================================
  // 4. QUANTITATIVE TRADER PERFORMANCE EVALUATOR
  // =========================================================================
  class TraderPerformanceEvaluator {
    /**
     * Evaluates trader metrics strictly on closed evaluable trades.
     */
    static evaluate(closedTrades = [], positions = []) {
      const evaluableTrades = closedTrades.filter(t => t.realizedPnlUsd !== null);
      const totalEvaluable = evaluableTrades.length;
      const totalClosed = closedTrades.length;
      const uncalculableTrades = totalClosed - totalEvaluable;

      if (totalEvaluable === 0) {
        return {
          hasSufficientData: false,
          disclaimer: totalClosed > 0
            ? `Datos insuficientes: ${totalClosed} ventas detectadas pero todas carecen de coste de adquisición documentado en la ventana indexada (excluidas para no inventar retornos).`
            : 'Datos insuficientes: No hay operaciones cerradas registradas.',
          totalClosedTrades: totalClosed,
          evaluableClosedTrades: 0,
          uncalculableTradesCount: totalClosed,
          accountedRatioPct: 0,
          winRatePct: null,
          lossRatePct: null,
          avgWinUsd: null,
          avgLossUsd: null,
          profitFactor: null,
          netRealizedPnlUsd: 0,
          concentrationHhi: this.calculateHhi(positions),
          lowLiquidityExposurePct: this.calculateLowLiquidityExposure(positions)
        };
      }

      const wins = evaluableTrades.filter(t => t.realizedPnlUsd > 0);
      const losses = evaluableTrades.filter(t => t.realizedPnlUsd < 0);
      const breakEvens = evaluableTrades.filter(t => t.realizedPnlUsd === 0);

      const totalWinAmount = wins.reduce((acc, t) => acc + t.realizedPnlUsd, 0);
      const totalLossAmount = Math.abs(losses.reduce((acc, t) => acc + t.realizedPnlUsd, 0));

      const avgWinUsd = wins.length > 0 ? totalWinAmount / wins.length : 0;
      const avgLossUsd = losses.length > 0 ? totalLossAmount / losses.length : 0;
      const profitFactor = totalLossAmount > 0 ? (totalWinAmount / totalLossAmount) : (totalWinAmount > 0 ? 999 : 0);

      const winRatePct = (wins.length / totalEvaluable) * 100;
      const lossRatePct = (losses.length / totalEvaluable) * 100;
      const accountedRatioPct = totalClosed > 0 ? (totalEvaluable / totalClosed) * 100 : 0;

      // Holding duration calculation
      let totalHoldingSeconds = 0;
      let durationCount = 0;
      evaluableTrades.forEach(t => {
        if (t.consumedLots && t.consumedLots.length > 0) {
          const firstLot = t.consumedLots[0];
          if (firstLot.timestamp && t.timestamp && t.timestamp >= firstLot.timestamp) {
            totalHoldingSeconds += (t.timestamp - firstLot.timestamp);
            durationCount++;
          }
        }
      });
      const avgHoldingHours = durationCount > 0 ? (totalHoldingSeconds / durationCount / 3600) : null;

      let disclaimer = '';
      if (uncalculableTrades > 0) {
        disclaimer = `${totalEvaluable} de ${totalClosed} operaciones contabilizadas (${uncalculableTrades} ventas excluidas honestamente del Win Rate por coste no documentado).`;
      } else if (totalEvaluable < 5) {
        disclaimer = 'Muestra reducida (<5 operaciones evaluables). El rendimiento pasado no garantiza resultados futuros.';
      }

      return {
        hasSufficientData: true,
        totalClosedTrades: totalClosed,
        evaluableClosedTrades: totalEvaluable,
        uncalculableTradesCount: uncalculableTrades,
        accountedRatioPct,
        winningTradesCount: wins.length,
        losingTradesCount: losses.length,
        breakEvenTradesCount: breakEvens.length,
        winRatePct,
        lossRatePct,
        avgWinUsd,
        avgLossUsd,
        profitFactor,
        netRealizedPnlUsd: totalWinAmount - totalLossAmount,
        avgHoldingHours,
        concentrationHhi: this.calculateHhi(positions),
        lowLiquidityExposurePct: this.calculateLowLiquidityExposure(positions),
        disclaimer
      };
    }

    /**
     * Herfindahl-Hirschman Index (HHI) for portfolio concentration.
     * Scale 0 to 10,000.
     */
    static calculateHhi(positions = []) {
      const valid = positions.filter(p => p.portfolioSharePct > 0);
      if (valid.length === 0) return 0;
      return Math.round(valid.reduce((sum, p) => sum + Math.pow(p.portfolioSharePct, 2), 0));
    }

    static calculateLowLiquidityExposure(positions = []) {
      const totalVal = positions.reduce((sum, p) => sum + (p.currentValueUsd || 0), 0);
      if (totalVal <= 0) return 0;
      const lowLiqVal = positions
        .filter(p => p.valuationStatus === 'LOW_LIQUIDITY_WARNING' || p.liquidityUsd < 1000)
        .reduce((sum, p) => sum + (p.currentValueUsd || 0), 0);
      return (lowLiqVal / totalVal) * 100;
    }
  }

  // =========================================================================
  // 5. HISTORICAL CHART & EQUITY TRAJECTORY ENGINE
  // =========================================================================
  class HistoricalChartEngine {
    /**
     * Builds verifiable time-series points without fabricating missing data.
     */
    static buildTrajectory(operations = [], range = 'all', tonPrice = 5.0) {
      const now = Math.floor(Date.now() / 1000);
      let cutoff = 0;
      if (range === '24h') cutoff = now - 86400;
      else if (range === '7d') cutoff = now - 7 * 86400;
      else if (range === '30d') cutoff = now - 30 * 86400;
      else if (range === '90d') cutoff = now - 90 * 86400;
      else if (range === '1y') cutoff = now - 365 * 86400;

      const filtered = operations
        .filter(op => (op.timestamp || 0) >= cutoff)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const labels = [];
      const equitySeries = [];
      const costBasisSeries = [];
      const realizedPnlSeries = [];
      const feesSeries = [];

      let runningRealizedPnl = 0;
      let runningCostBasis = 0;
      let runningFees = 0;

      for (const op of filtered) {
        const timeLabel = new Date((op.timestamp || now) * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        labels.push(timeLabel);

        if (op.type === 'BUY') {
          const addedCost = op.valueUsd || (op.tokenAmount && op.unitPriceUsd ? op.tokenAmount * op.unitPriceUsd : 0);
          runningCostBasis += addedCost;
        } else if (op.type === 'SELL' && op.costBasisUsd) {
          runningCostBasis = Math.max(0, runningCostBasis - op.costBasisUsd);
          if (op.realizedPnlUsd !== null) {
            runningRealizedPnl += op.realizedPnlUsd;
          }
        }

        const fee = op.feeUsd || ((op.feeTon || 0) * tonPrice);
        runningFees += fee;

        costBasisSeries.push(Math.round(runningCostBasis * 100) / 100);
        realizedPnlSeries.push(Math.round(runningRealizedPnl * 100) / 100);
        feesSeries.push(Math.round(runningFees * 100) / 100);
        equitySeries.push(Math.round((runningCostBasis + runningRealizedPnl) * 100) / 100);
      }

      return {
        labels,
        costBasisSeries,
        realizedPnlSeries,
        feesSeries,
        equitySeries,
        dataPointsCount: filtered.length,
        hasCoverage: filtered.length > 0,
        coverageNotice: filtered.length > 0 
          ? `Visualizando ${filtered.length} puntos de datos on-chain verificados en el intervalo seleccionado.`
          : 'Sin transacciones indexadas en el intervalo seleccionado.'
      };
    }
  }

  // =========================================================================
  // 6. TRANSPARENT ON-CHAIN RISK EVALUATION ENGINE (Section 28)
  // =========================================================================
  class RiskEngine {
    /**
     * Calculates transparent Risk Score (0 - 100) based strictly on observable on-chain signals.
     */
    static evaluate(account, jettons = [], events = [], portfolioEval = null, counterparties = []) {
      const reasons = [];
      let score = 0;

      if (!account) {
        return {
          score: null,
          level: 'No disponible',
          displayBadge: 'Datos insuficientes',
          reasons: ['No se detectó información suficiente de la cuenta para calcular riesgo.']
        };
      }

      const balTon = Number(account.balance || 0) / 1e9;
      const positions = portfolioEval?.positions || [];
      const totalPortfolioVal = portfolioEval?.totalPortfolioValueUsd || (balTon * 5.0);

      // Signal 1: Portfolio Concentration (HHI & Top asset %)
      if (positions.length > 0 && totalPortfolioVal > 0) {
        const sortedPos = [...positions].sort((a, b) => (b.currentValueUsd || 0) - (a.currentValueUsd || 0));
        const topPos = sortedPos[0];
        const topShare = topPos.portfolioSharePct || ((topPos.currentValueUsd || 0) / totalPortfolioVal * 100);

        if (topShare >= 80) {
          score += 25;
          reasons.push(`Alta concentración: ${topShare.toFixed(0)}% del portafolio en un solo activo (${topPos.token?.symbol || 'Token'})`);
        } else if (topShare >= 50) {
          score += 15;
          reasons.push(`Concentración moderada: ${topShare.toFixed(0)}% del portafolio en ${topPos.token?.symbol || 'Token'}`);
        } else {
          reasons.push(`Portafolio diversificado: mayor posición representa el ${topShare.toFixed(0)}% del valor`);
        }
      } else {
        reasons.push('Activo único observado en cuenta (100% TON nativo)');
      }

      // Signal 2: Low-Liquidity Asset Exposure (< $1,000 pool reserve)
      if (positions.length > 0) {
        const lowLiqPositions = positions.filter(p => p.valuationStatus === 'LOW_LIQUIDITY_WARNING' || p.valuationCategory === 'RIESGO_DESLIZAMIENTO' || (p.liquidityUsd > 0 && p.liquidityUsd < 1000));
        if (lowLiqPositions.length > 0) {
          const count = lowLiqPositions.length;
          score += Math.min(25, count * 10);
          reasons.push(`Exposición a ${count} token(s) con liquidez reducida (< $1,000 USD de reserva en DEX)`);
        } else {
          reasons.push('Sin exposición detectada a activos con baja liquidez');
        }
      }

      // Signal 3: Counterparty Concentration
      if (counterparties && counterparties.length > 0) {
        const totalCpVol = counterparties.reduce((sum, cp) => sum + (cp.volTon || 0), 0);
        if (totalCpVol > 0) {
          const topCp = counterparties[0];
          const topCpPct = (topCp.volTon / totalCpVol) * 100;
          if (topCpPct >= 75 && counterparties.length > 1) {
            score += 15;
            reasons.push(`Concentración con una sola contraparte: ${topCpPct.toFixed(0)}% del volumen con ${topCp.name || topCp.address}`);
          }
        }
      }

      // Signal 4: Account Status & History
      const isUninit = account.status === 'uninit' || account.status === 'nonexist';
      if (isUninit) {
        score += 30;
        reasons.push('Cuenta no inicializada en la red TON');
      }

      const txCount = events.length;
      if (txCount === 0 && !isUninit) {
        score += 10;
        reasons.push('Sin historial de transacciones en la ventana observada');
      } else if (txCount >= 50) {
        reasons.push(`Historial activo verificado con ${txCount}+ transacciones observadas`);
      }

      let level = 'Bajo';
      let color = 'var(--flow-positive)';
      let displayBadge = `${score}/100 (Bajo Riesgo)`;

      if (score >= 70) {
        level = 'Alto';
        color = 'var(--flow-negative)';
        displayBadge = `${score}/100 (Alto Riesgo)`;
      } else if (score >= 40) {
        level = 'Medio';
        color = 'var(--accent-warning)';
        displayBadge = `${score}/100 (Moderado)`;
      } else {
        displayBadge = `${score}/100 (Bajo Riesgo)`;
      }

      return {
        score,
        level,
        color,
        displayBadge,
        reasons
      };
    }
  }

  // =========================================================================
  // 7. TOKEN BREAKDOWN ANALYTICS (Section 15)
  // =========================================================================
  class TokenBreakdownEngine {
    static generate(closedTrades = [], positions = [], rawOperations = []) {
      const breakdownMap = new Map();

      positions.forEach(pos => {
        const key = pos.contractAddress;
        breakdownMap.set(key, {
          token: pos.token,
          contractAddress: key,
          currentBalance: pos.balance,
          currentPriceUsd: pos.currentPriceUsd,
          currentValueUsd: pos.currentValueUsd,
          totalBought: 0,
          totalSold: 0,
          totalCostUsd: 0,
          totalProceedsUsd: 0,
          realizedPnlUsd: 0,
          unrealizedPnlUsd: pos.unrealizedPnlUsd,
          totalFeesUsd: 0,
          tradeCount: 0,
          avgBuyPriceUsd: null,
          avgSellPriceUsd: null,
          hasKnownCost: pos.knownCostBalance > 0
        });
      });

      rawOperations.forEach(op => {
        if (!op || !op.token?.address) return;
        const key = op.token.address;
        if (!breakdownMap.has(key)) {
          breakdownMap.set(key, {
            token: op.token,
            contractAddress: key,
            currentBalance: 0,
            currentPriceUsd: null,
            currentValueUsd: null,
            totalBought: 0,
            totalSold: 0,
            totalCostUsd: 0,
            totalProceedsUsd: 0,
            realizedPnlUsd: 0,
            unrealizedPnlUsd: null,
            totalFeesUsd: 0,
            tradeCount: 0,
            avgBuyPriceUsd: null,
            avgSellPriceUsd: null,
            hasKnownCost: false
          });
        }
        const item = breakdownMap.get(key);
        item.tradeCount++;
        item.totalFeesUsd += (op.feeUsd || 0);

        if (op.type === 'BUY') {
          item.totalBought += (op.tokenAmount || 0);
          item.totalCostUsd += (op.valueUsd || 0);
        } else if (op.type === 'SELL') {
          item.totalSold += (op.tokenAmount || 0);
          item.totalProceedsUsd += (op.grossProceedsUsd || op.valueUsd || 0);
        }
      });

      closedTrades.forEach(tr => {
        const key = tr.token?.address;
        if (breakdownMap.has(key) && tr.realizedPnlUsd !== null) {
          const item = breakdownMap.get(key);
          item.realizedPnlUsd += tr.realizedPnlUsd;
        }
      });

      return Array.from(breakdownMap.values()).map(item => {
        item.avgBuyPriceUsd = item.totalBought > 0 ? (item.totalCostUsd / item.totalBought) : null;
        item.avgSellPriceUsd = item.totalSold > 0 ? (item.totalProceedsUsd / item.totalSold) : null;
        item.totalPnlUsd = (item.realizedPnlUsd || 0) + (item.unrealizedPnlUsd || 0) - (item.totalFeesUsd || 0);
        item.roiPct = item.totalCostUsd > 0 ? (item.totalPnlUsd / item.totalCostUsd) * 100 : null;
        return item;
      });
    }
  }

  // Export to global scope & Node.js environment
  const TonWalletIntelligence = {
    CANONICAL_GRAM_CONTRACT,
    CANONICAL_GRAM_RAW,
    KNOWN_DEX_ROUTERS,
    KNOWN_BRIDGES,
    KNOWN_CEX_WALLETS,
    normalizeAddress,
    PaginationHelper,
    TransactionClassifier,
    TradeDeduplicator,
    AccountingEngine,
    TraderPerformanceEvaluator,
    HistoricalChartEngine,
    RiskEngine,
    TokenBreakdownEngine
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TonWalletIntelligence;
  }
  if (typeof window !== 'undefined') {
    window.TonWalletIntelligence = TonWalletIntelligence;
  }
})(typeof window !== 'undefined' ? window : global);
