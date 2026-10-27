/**
 * ANLGRAM Intelligence - Cloudflare Worker Secure TonAPI Proxy
 * Version: 2.1.0
 * 
 * Strict, hardened Edge proxy for TON Mainnet API requests.
 * Features:
 * - Route Whitelist enforcement (blocks open proxy / SSRF)
 * - Method restriction (GET / OPTIONS only)
 * - Safe TON address and query parameter validation
 * - CORS restricted to authorized ANLGRAM origins
 * - Secret injection (TONAPI_KEY held securely in Worker environment)
 * - Upstream rate limit backoff (exponential retry on 429/5xx)
 * - Edge response caching via Cache API
 * - Zero secret leakage (strips internal headers, clean JSON errors)
 */

const ALLOWED_ORIGINS = [
  'https://anlgram.com',
  'https://www.anlgram.com',
  'https://anlgram-labs.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

// Strict Whitelist of allowed TonAPI route patterns
export const ALLOWED_ROUTES = [
  // Account endpoints
  /^\/accounts\/[a-zA-Z0-9_\-\:]+$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/jettons$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/jettons\/[a-zA-Z0-9_\-\:]+$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/nfts$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/events$/,
  /^\/accounts\/search$/,
  // Market & Rates
  /^\/rates$/,
  // Jettons
  /^\/jettons\/[a-zA-Z0-9_\-\:]+$/,
  /^\/jettons\/[a-zA-Z0-9_\-\:]+\/holders$/,
  // Low level blockchain inspection & TVM getters (SEC-02 & ALTO-01 hardened)
  /^\/blockchain\/transactions\/[a-fA-F0-9]+$/,
  /^\/blockchain\/accounts\/[a-zA-Z0-9_\-\:]+$/,
  /^\/blockchain\/accounts\/[a-zA-Z0-9_\-\:]+\/methods\/[a-zA-Z0-9_]{1,64}$/,
  /^\/blockchain\/accounts\/[a-zA-Z0-9_\-\:]+\/transactions$/,
  /^\/blockchain\/masterchain-head$/
];

// Explicit allowlist of permitted TVM getter methods (ALTO-01)
export const ALLOWED_TVM_METHODS = new Set([
  'get_jetton_data',
  'get_wallet_address',
  'get_vesting_data',
  'get_claimable_at',
  'get_staking_data',
  'get_staker_data'
]);

// Allowed query parameter keys (ALTO-03: includes supported_extensions)
export const ALLOWED_QUERY_PARAMS = new Set([
  'limit',
  'before_lt',
  'start_lt',
  'end_lt',
  'tokens',
  'currencies',
  'name',
  'account_id',
  'args',
  'supported_extensions'
]);

/**
 * CRC16-CCITT (XMODEM polynomial 0x1021) for TEP-2 friendly TON addresses
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
 * Strict TON address validation (raw 0:/-1: 64-hex or 48-char TEP-2 base64/base64url with CRC16 checksum)
 */
export function isValidTonAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const clean = addr.trim();
  if (clean.length > 128) return false;

  // 1. Raw format: (-1|0):<64 hex chars>
  if (/^(-1|0):[0-9a-fA-F]{64}$/.test(clean)) {
    return true;
  }

  // 2. Friendly 48-char base64 / base64url with TEP-2 tag, workchain, and CRC16-CCITT verification
  if (/^[A-Za-z0-9_+\/-]{48}$/.test(clean)) {
    try {
      const b64 = clean.replace(/-/g, '+').replace(/_/g, '/');
      let bytes;
      if (typeof atob === 'function') {
        const bin = atob(b64);
        if (bin.length !== 36) return false;
        bytes = new Uint8Array(36);
        for (let i = 0; i < 36; i++) bytes[i] = bin.charCodeAt(i);
      } else if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length !== 36) return false;
        bytes = new Uint8Array(buf);
      } else {
        return false;
      }

      const tag = bytes[0];
      if ((tag & 0x3f) !== 0x11) return false;
      const wc = bytes[1];
      if (wc !== 0x00 && wc !== 0xff) return false;

      const expectedCrc = crc16Ton(bytes.subarray(0, 34));
      const actualCrc = (bytes[34] << 8) | bytes[35];
      return expectedCrc === actualCrc;
    } catch (_) {
      return false;
    }
  }

  return false;
}

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const allowOrigin = isAllowed ? origin : 'https://anlgram.com';
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}

function sanitizePath(rawPath) {
  let clean = rawPath.replace(/\/+/g, '/');
  // Strip /api/ton prefix if forwarded
  if (clean.startsWith('/api/ton/')) {
    clean = clean.slice('/api/ton'.length);
  } else if (clean === '/api/ton') {
    clean = '/';
  }
  if (clean.startsWith('/v2/')) {
    clean = clean.slice(3);
  }
  return clean;
}

const workerHandler = {
  ALLOWED_ROUTES,
  ALLOWED_TVM_METHODS,
  ALLOWED_QUERY_PARAMS,
  isValidTonAddress,
  async fetch(request, env = {}, ctx = { waitUntil: () => {} }) {
    const origin = (request.headers && typeof request.headers.get === 'function')
      ? (request.headers.get('Origin') || '')
      : '';
    const corsHeaders = getCorsHeaders(origin);

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 2. Restrict HTTP Methods to GET only
    if (request.method !== 'GET') {
      return jsonResponse({
        error: 'Method Not Allowed',
        message: 'Only GET requests are permitted on this proxy'
      }, 405, corsHeaders);
    }

    const rawRequestUrl = String(request.url || '');
    if (!rawRequestUrl || rawRequestUrl.length > 2048) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Request URL exceeds maximum permitted length'
      }, 400, corsHeaders);
    }

    // Check raw URL path portion before WHATWG URL normalization collapses /%2e%2e/
    const rawPathPart = rawRequestUrl.replace(/^https?:\/\/[^\/]+/i, '').split('?')[0];
    if (/%2e|%2f|%5c|%25|%00|%0a|%0d/i.test(rawPathPart) || rawPathPart.includes('\\') || rawPathPart.includes('..')) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Disallowed path traversal, double encoding, or control sequence in path'
      }, 400, corsHeaders);
    }

    let url;
    try {
      url = new URL(rawRequestUrl);
    } catch (_) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Malformed request URL'
      }, 400, corsHeaders);
    }

    const rawPathname = url.pathname || '';
    if (rawPathname.length > 512) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Request path exceeds maximum permitted length'
      }, 400, corsHeaders);
    }

    // ALTO-01: Reject encoded traversal (%2e, %2f, %5c), double-encoding (%25), null bytes (%00), or backslashes
    if (/%2e|%2f|%5c|%25|%00|%0a|%0d/i.test(rawPathname) || rawPathname.includes('\\') || rawPathname.includes('..')) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Disallowed path traversal, double encoding, or control sequence in path'
      }, 400, corsHeaders);
    }

    // ALTO-01: Decode URI component exactly once, catching malformed percent-encoding
    let decodedPathname;
    try {
      decodedPathname = decodeURIComponent(rawPathname);
    } catch (_) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Malformed URI percent-encoding in path'
      }, 400, corsHeaders);
    }

    // Reject any residual %, control characters, newlines, '..', or '\' after single decode
    if (
      decodedPathname.includes('%') ||
      decodedPathname.includes('..') ||
      decodedPathname.includes('\\') ||
      /[\x00-\x1f\x7f\r\n]/.test(decodedPathname)
    ) {
      return jsonResponse({
        error: 'Bad Request',
        message: 'Disallowed characters or multi-layered encoding in path'
      }, 400, corsHeaders);
    }

    const subPath = sanitizePath(decodedPathname);

    // Root Healthcheck
    if (subPath === '/' || subPath === '/health') {
      return jsonResponse({
        service: 'ANLGRAM TonAPI Edge Proxy',
        status: 'healthy',
        network: 'TON Mainnet',
        authenticated: !!(env && env.TONAPI_KEY),
        timestamp: new Date().toISOString()
      }, 200, corsHeaders);
    }

    // 3. Validate Whitelisted Routes
    const isWhitelisted = ALLOWED_ROUTES.some(pattern => pattern.test(subPath));
    if (!isWhitelisted) {
      return jsonResponse({
        error: 'Forbidden',
        message: 'The requested path is not permitted by this proxy'
      }, 403, corsHeaders);
    }

    // ALTO-01: Validate TVM getter method name against explicit allowlist
    const methodMatch = subPath.match(/^\/blockchain\/accounts\/([a-zA-Z0-9_\-\:]+)\/methods\/([a-zA-Z0-9_]+)$/);
    if (methodMatch) {
      const methodName = methodMatch[2];
      if (!ALLOWED_TVM_METHODS.has(methodName)) {
        return jsonResponse({
          error: 'Forbidden',
          message: `TVM method '${methodName}' is not permitted by this proxy`
        }, 403, corsHeaders);
      }
    }

    // Strict TON Address Validation on path parameters (SEC-04, ALTO-01, ALTO-03, BAJO-01)
    const accountMatch = subPath.match(/^\/(?:blockchain\/)?(?:accounts|jettons)\/([a-zA-Z0-9_\-\:]+)/);
    if (accountMatch && accountMatch[1] && accountMatch[1] !== 'search') {
      const targetAddr = accountMatch[1];
      if (!isValidTonAddress(targetAddr)) {
        return jsonResponse({
          error: 'Bad Request',
          message: 'Invalid TON address parameter format. Must be raw (0:hex) or valid friendly 48-char TEP-2 address.'
        }, 400, corsHeaders);
      }
    }

    // ALTO-03: Validate secondary TON address on /accounts/:wallet/jettons/:minter
    const accountJettonMatch = subPath.match(/^\/accounts\/([a-zA-Z0-9_\-\:]+)\/jettons\/([a-zA-Z0-9_\-\:]+)$/);
    if (accountJettonMatch) {
      const walletAddr = accountJettonMatch[1];
      const minterAddr = accountJettonMatch[2];
      if (!isValidTonAddress(walletAddr) || !isValidTonAddress(minterAddr)) {
        return jsonResponse({
          error: 'Bad Request',
          message: 'Invalid wallet or jetton TON address parameter format.'
        }, 400, corsHeaders);
      }
    }

    // 4. Validate Query Parameters
    const filteredParams = new URLSearchParams();
    for (const [key, val] of url.searchParams.entries()) {
      if (!ALLOWED_QUERY_PARAMS.has(key)) {
        return jsonResponse({
          error: 'Bad Request',
          message: `Query parameter '${key}' is not permitted`
        }, 400, corsHeaders);
      }
      // Safety limit on parameter value length and control characters
      if (val.length > 512 || /[\x00-\x1f\x7f\r\n]/.test(val)) {
        return jsonResponse({
          error: 'Bad Request',
          message: `Query parameter '${key}' exceeds maximum length or contains invalid characters`
        }, 400, corsHeaders);
      }
      // Block full URLs or path traversal in query values
      if (/^https?:\/\//i.test(val) || val.includes('..') || val.includes('\\')) {
        return jsonResponse({
          error: 'Bad Request',
          message: `Query parameter '${key}' contains disallowed URL or traversal sequence`
        }, 400, corsHeaders);
      }
      // ALTO-03: Strict format validation for supported_extensions
      if (key === 'supported_extensions' && (val.length > 64 || !/^[a-zA-Z0-9_,\-]+$/.test(val))) {
        return jsonResponse({
          error: 'Bad Request',
          message: 'Invalid supported_extensions parameter value'
        }, 400, corsHeaders);
      }
      filteredParams.set(key, val);
    }

    const queryString = filteredParams.toString() ? `?${filteredParams.toString()}` : '';
    const targetUrl = `https://tonapi.io/v2${subPath}${queryString}`;

    // 5. Determine Edge Caching TTL
    let ttl = 15; // default 15s for balances & jettons
    if (subPath.includes('/rates')) ttl = 60;
    else if (subPath.includes('/events') || subPath.includes('/transactions')) ttl = 10;

    const cacheKey = new Request(targetUrl, { method: 'GET' });
    const cache = (typeof caches !== 'undefined' && caches && caches.default) ? caches.default : null;

    // Check Cloudflare Cache if available
    if (cache) {
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithCors = new Response(cachedResponse.body, cachedResponse);
        for (const [k, v] of Object.entries(corsHeaders)) {
          responseWithCors.headers.set(k, v);
        }
        responseWithCors.headers.set('X-Proxy-Cache', 'HIT');
        return responseWithCors;
      }
    }

    // 6. Build Upstream Headers securely
    const upstreamHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'ANLGRAM-Edge-Proxy/2.1'
    };

    if (env && env.TONAPI_KEY && env.TONAPI_KEY.trim()) {
      upstreamHeaders['Authorization'] = `Bearer ${env.TONAPI_KEY.trim()}`;
    }

    // 7. Controlled Upstream Fetch with Exponential Backoff
    let attempts = 0;
    const maxAttempts = 3;
    let delayMs = 600;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);

      try {
        const upstreamRes = await fetch(targetUrl, {
          method: 'GET',
          headers: upstreamHeaders,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // Handle Upstream 429
        if (upstreamRes.status === 429) {
          if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, delayMs));
            delayMs *= 2;
            continue;
          }
          return jsonResponse({
            error: 'Upstream Rate Limit Exceeded',
            status: 429,
            retryAfter: 3
          }, 429, {
            ...corsHeaders,
            'Retry-After': '3'
          });
        }

        // Handle Upstream 5xx
        if (upstreamRes.status >= 500 && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, delayMs));
          delayMs *= 2;
          continue;
        }

        // Read response body (safe limit: max 5MB)
        const responseText = await upstreamRes.text();
        if (responseText.length > 5 * 1024 * 1024) {
          return jsonResponse({
            error: 'Payload Too Large',
            message: 'Upstream response exceeded 5MB size limit'
          }, 502, corsHeaders);
        }

        const outResponse = new Response(responseText, {
          status: upstreamRes.status,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${ttl}`,
            'X-Proxy-Cache': 'MISS',
            'X-Content-Type-Options': 'nosniff',
            ...corsHeaders
          }
        });

        // Cache 200 OK responses in Cloudflare Cache
        if (cache && upstreamRes.status === 200 && ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(cache.put(cacheKey, outResponse.clone()));
        }

        return outResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        if (attempts >= maxAttempts) break;
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2;
      }
    }

    return jsonResponse({
      error: 'Upstream Service Unavailable',
      message: 'Failed to communicate with TON Mainnet upstream provider'
    }, 504, corsHeaders);
  }
};

export default workerHandler;
