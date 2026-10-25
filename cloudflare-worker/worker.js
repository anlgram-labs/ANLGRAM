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
const ALLOWED_ROUTES = [
  // Account endpoints
  /^\/accounts\/[a-zA-Z0-9_\-\:]+$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/jettons$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/nfts$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/events$/,
  /^\/accounts\/search$/,
  // Market & Rates
  /^\/rates$/,
  // Jettons
  /^\/jettons\/[a-zA-Z0-9_\-\:]+$/,
  /^\/jettons\/[a-zA-Z0-9_\-\:]+\/holders$/,
  // Low level blockchain inspection
  /^\/blockchain\/transactions\/[a-fA-F0-9]+$/,
  /^\/blockchain\/accounts\/[a-zA-Z0-9_\-\:]+\/transactions$/,
  /^\/blockchain\/masterchain-head$/
];

// Allowed query parameter keys
const ALLOWED_QUERY_PARAMS = new Set([
  'limit',
  'before_lt',
  'start_lt',
  'end_lt',
  'tokens',
  'currencies',
  'name',
  'account_id'
]);

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

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
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

    const url = new URL(request.url);
    const subPath = sanitizePath(url.pathname);

    // Root Healthcheck
    if (subPath === '/' || subPath === '/health') {
      return jsonResponse({
        service: 'ANLGRAM TonAPI Edge Proxy',
        status: 'healthy',
        network: 'TON Mainnet',
        authenticated: !!env.TONAPI_KEY,
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

    // 4. Validate Query Parameters
    const filteredParams = new URLSearchParams();
    for (const [key, val] of url.searchParams.entries()) {
      if (!ALLOWED_QUERY_PARAMS.has(key)) {
        return jsonResponse({
          error: 'Bad Request',
          message: `Query parameter '${key}' is not permitted`
        }, 400, corsHeaders);
      }
      // Safety limit on parameter value length
      if (val.length > 512) {
        return jsonResponse({
          error: 'Bad Request',
          message: `Query parameter '${key}' exceeds maximum length`
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
    const cache = caches.default;

    // Check Cloudflare Cache
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const responseWithCors = new Response(cachedResponse.body, cachedResponse);
      for (const [k, v] of Object.entries(corsHeaders)) {
        responseWithCors.headers.set(k, v);
      }
      responseWithCors.headers.set('X-Proxy-Cache', 'HIT');
      return responseWithCors;
    }

    // 6. Build Upstream Headers securely
    const upstreamHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'ANLGRAM-Edge-Proxy/2.1'
    };

    if (env.TONAPI_KEY && env.TONAPI_KEY.trim()) {
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
        if (upstreamRes.status === 200) {
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
