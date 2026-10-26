/**
 * ANLGRAM Intelligence - Core Security & Defense Engine
 * Version: 1.0.0
 * 
 * Provides centralized defensive routines:
 * 1. HTML Escaping & DOM XSS Prevention
 * 2. Strict URL Scheme Validation (blocking javascript:, data:, etc.)
 * 3. Strict TON Blockchain Address Validation (Raw 0:... and User-Friendly EQ/UQ/kQ/0Q)
 * 4. Safe JSON Parsing with Prototype Pollution Defense
 * 5. Cryptographic Proof Challenge Generation for Wallet Verification
 * 6. Rate Limiting Helper for Client-Side Operations
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ANLGRAM_SEC = factory();
    // Expose helpers globally for backward compatibility
    root.escapeHtml = root.ANLGRAM_SEC.escapeHtml;
    root.sanitizeUrl = root.ANLGRAM_SEC.sanitizeUrl;
    root.isValidTonAddress = root.ANLGRAM_SEC.isValidTonAddress;
    root.safeJsonParse = root.ANLGRAM_SEC.safeJsonParse;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Escape special HTML characters to prevent DOM-based XSS.
   * Safe for insertion into element text and HTML attribute contexts.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Strict URL Sanitizer:
   * Only permits safe web protocols: https:, http:, ton:, tg:, or relative paths (/ or ./).
   * Explicitly blocks dangerous schemes like javascript:, data:, vbscript:, blob: (if tainted).
   */
  function sanitizeUrl(rawUrl, fallback = '#') {
    if (!rawUrl || typeof rawUrl !== 'string') return fallback;
    const trimmed = rawUrl.trim();
    if (!trimmed) return fallback;

    // Check for obvious script injection strings
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      (lower.startsWith('data:') && !lower.startsWith('data:image/')) ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('file:')
    ) {
      console.warn('[ANLGRAM-SEC] Blocked unsafe URL scheme:', trimmed);
      return fallback;
    }

    // Relative URLs
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed, window?.location?.href || 'https://anlgram.io');
      const allowedProtocols = ['https:', 'http:', 'ton:', 'tg:'];
      if (allowedProtocols.includes(parsed.protocol)) {
        return trimmed;
      }
      console.warn('[ANLGRAM-SEC] Disallowed URL protocol:', parsed.protocol);
      return fallback;
    } catch (e) {
      // If URL parsing fails, permit safe relative anchors or fallback
      if (/^[a-zA-Z0-9_\-\.\/\?\#\=\&]+$/.test(trimmed)) {
        return trimmed;
      }
      return fallback;
    }
  }

  /**
   * Validate TON blockchain address format.
   * Supports:
   * 1. User-Friendly base64/base64url (48 chars, starts with EQ, UQ, kQ, 0Q, Ef, etc.)
   * 2. Raw Hex format: workchain:64-hex (0:[a-fA-F0-9]{64} or -1:[a-fA-F0-9]{64})
   */
  function isValidTonAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const clean = address.trim();

    // Raw Hex: 0:... or -1:... (64 hex characters)
    const rawRegex = /^(-?[0-1]):([a-fA-F0-9]{64})$/;
    if (rawRegex.test(clean)) return true;

    // Friendly: Base64 / Base64URL, standard length 48 characters
    // Starts with EQ, UQ, kQ, 0Q, Ef, etc.
    const friendlyRegex = /^[A-Za-z0-9_\-]{48}$/;
    if (friendlyRegex.test(clean)) {
      // Check prefix
      const prefix = clean.substring(0, 2);
      const validPrefixes = ['EQ', 'UQ', 'kQ', '0Q', 'Ef', 'kf', '0f'];
      return validPrefixes.includes(prefix);
    }

    return false;
  }

  /**
   * Safe JSON parse with prototype pollution prevention.
   * Strips or ignores __proto__, constructor, and prototype keys.
   */
  function safeJsonParse(text, fallback = null) {
    if (typeof text !== 'string') return fallback;
    try {
      return JSON.parse(text, function (key, value) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return undefined; // Drop malicious prototype keys
        }
        return value;
      });
    } catch (e) {
      return fallback;
    }
  }

  /**
   * Safe LocalStorage Wrapper with Schema & Prototype Poisoning Defense
   */
  const safeStorage = {
    getItem(key, fallback = null) {
      try {
        const val = localStorage.getItem(key);
        if (val === null) return fallback;
        return val;
      } catch (e) {
        return fallback;
      }
    },
    getJSON(key, fallback = null) {
      try {
        const val = localStorage.getItem(key);
        if (!val) return fallback;
        return safeJsonParse(val, fallback);
      } catch (e) {
        return fallback;
      }
    },
    setItem(key, value) {
      try {
        if (typeof value === 'object') {
          localStorage.setItem(key, JSON.stringify(value));
        } else {
          localStorage.setItem(key, String(value));
        }
        return true;
      } catch (e) {
        console.warn('[ANLGRAM-SEC] localStorage setItem failed:', e);
        return false;
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  /**
   * Generate a cryptographically strong single-use proof challenge / nonce
   * for TON Connect wallet ownership verification.
   * Conforms to TonProof specifications (domain binding, timestamp, random bytes).
   */
  function createProofChallenge(domain) {
    const cryptoObj = typeof window !== 'undefined' ? (window.crypto || window.msCrypto) : require('crypto');
    let randomBytes;

    if (cryptoObj.getRandomValues) {
      const arr = new Uint8Array(32);
      cryptoObj.getRandomValues(arr);
      randomBytes = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      randomBytes = cryptoObj.randomBytes(32).toString('hex');
    }

    const payload = {
      domain: domain || (typeof window !== 'undefined' ? window.location.host : 'anlgram.io'),
      timestamp: Date.now(),
      nonce: randomBytes,
      expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes TTL
    };

    return payload;
  }

  /**
   * Verify whether a challenge is still valid (not expired, domain matches).
   */
  function verifyProofChallenge(challenge, expectedDomain, maxAgeMs = 900000) {
    if (!challenge || typeof challenge !== 'object') return false;
    const now = Date.now();
    if (!challenge.timestamp || !challenge.nonce) return false;
    if (now - challenge.timestamp > maxAgeMs) return false; // Expired
    if (challenge.expiresAt && now > challenge.expiresAt) return false;
    if (expectedDomain && challenge.domain !== expectedDomain) return false;
    return true;
  }

  /**
   * Simple client-side Rate Limiter to prevent UI spam & resource exhaustion.
   */
  const rateLimiters = new Map();
  function checkRateLimit(actionName, maxAttempts = 10, windowMs = 60000) {
    const now = Date.now();
    let record = rateLimiters.get(actionName);
    if (!record || now - record.startTime > windowMs) {
      record = { startTime: now, count: 1 };
      rateLimiters.set(actionName, record);
      return true;
    }
    if (record.count >= maxAttempts) {
      return false; // Rate limit exceeded
    }
    record.count++;
    return true;
  }

  return {
    escapeHtml,
    sanitizeUrl,
    isValidTonAddress,
    safeJsonParse,
    safeStorage,
    createProofChallenge,
    verifyProofChallenge,
    checkRateLimit
  };
}));
