const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://d3js.org https://esm.sh https://cdn.emailjs.com https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https://api.imgur.com https://*.imgur.com https://i.imgur.com https://freeimage.host https://litterbox.catbox.moe https://catbox.moe https://*.workers.dev https://raw.githubusercontent.com https://tonapi.io https://api.ston.fi https://*.ston.fi https://testnet.tonapi.io https://*.tonapi.io https://toncenter.com https://testnet.toncenter.com https://*.toncenter.com https://api.coingecko.com https://api.telegram.org https://api.emailjs.com https://unpkg.com https://esm.sh wss://*.tonconnect.io https://*.tonconnect.io https://bridge.tonapi.io wss://bridge.tonapi.io https://walletbot.me https://*.telegram.org https://*.mytonwallet.org https://*.tonhubapi.com https://*.bgwapi.io https://*.binance.com https://*.okx.com https://*.hot-labs.org https://*.bybit.com https://*.safepal.com https://*.gateio.services https://*.tomo.inc https://*.mirai.app https://*.architecton.su https://*.mytokenpocket.vip https://*.uxuy.me https://*.echooo.link https://*.kolo.in https://*.token.im https://*.defiway.com https://*.ton.org https://*.stower.money https://*.wallet.coffee.agency; frame-src 'self' https://app.ston.fi https://dedust.io https://telegram.org; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org; object-src 'none'; base-uri 'self';"
};

// In-memory cache for TonAPI proxy responses
// Key: `${subPath}${queryString}` -> { data: string, status: number, timestamp: number, ttl: number }
const proxyCache = new Map();

// In-memory rate limiting map per client IP (max 120 requests / 60 seconds)
const clientRateMap = new Map();

const ALLOWED_PROXY_ROUTES = [
  /^\/accounts\/[a-zA-Z0-9_\-\:]+$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/jettons$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/nfts$/,
  /^\/accounts\/[a-zA-Z0-9_\-\:]+\/events$/,
  /^\/accounts\/search$/,
  /^\/rates$/,
  /^\/jettons\/[a-zA-Z0-9_\-\:]+$/,
  /^\/jettons\/[a-zA-Z0-9_\-\:]+\/holders$/,
  /^\/blockchain\/transactions\/[a-fA-F0-9]+$/,
  /^\/blockchain\/accounts\/[a-zA-Z0-9_\-\:]+\/transactions$/,
  /^\/blockchain\/masterchain-head$/
];

function checkClientRateLimit(clientIp) {
  const now = Date.now();
  let record = clientRateMap.get(clientIp);
  if (!record || (now - record.resetTime > 60000)) {
    record = { count: 1, resetTime: now };
    clientRateMap.set(clientIp, record);
    return true;
  }
  record.count++;
  return record.count <= 120;
}

const server = http.createServer((req, res) => {
  // Remove query params and decode URI safely
  let cleanUrl = req.url.split('?')[0];
  try {
    cleanUrl = decodeURIComponent(cleanUrl);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Bad Request');
    return;
  }

  // Handle /api/upload-logo endpoint
  if (cleanUrl === '/api/upload-logo') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Access-Control-Max-Age': '86400',
        ...SECURITY_HEADERS
      });
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 10 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
        }
      });
      req.on('end', async () => {
        try {
          let base64 = '';
          if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            const parsed = JSON.parse(body);
            base64 = (parsed.image || parsed.data || '').replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '');
          } else {
            base64 = body.replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '');
          }

          if (!base64) {
            res.writeHead(400, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
            res.end(JSON.stringify({ error: 'No image data provided' }));
            return;
          }

          let publicCdnUrl = null;
          const imgurClientIds = ['546c25a59c58ad7', 'c06eb6f6b5b5ba3'];
          for (const cId of imgurClientIds) {
            try {
              const fd = new FormData();
              fd.append('image', base64);
              fd.append('type', 'base64');
              const imgurRes = await fetch('https://api.imgur.com/3/image', {
                method: 'POST',
                headers: { 'Authorization': `Client-ID ${cId}` },
                body: fd
              });
              if (imgurRes.ok) {
                const imgurJson = await imgurRes.json();
                if (imgurJson.data && imgurJson.data.link) {
                  publicCdnUrl = imgurJson.data.link.replace('http://', 'https://');
                  break;
                }
              }
            } catch (err) {
              // fallback to next
            }
          }

          const buffer = Buffer.from(base64, 'base64');
          const uploadsDir = path.join(__dirname, 'assets', 'uploads');
          if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
          }
          const filename = `token-logo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.png`;
          const filePath = path.join(uploadsDir, filename);
          fs.writeFileSync(filePath, buffer);

          // Use public global CDN URL if available, otherwise absolute production URL
          const finalUrl = publicCdnUrl || `https://anlgram.com/assets/uploads/${filename}`;

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...SECURITY_HEADERS
          });
          res.end(JSON.stringify({ 
            success: true, 
            url: finalUrl, 
            isGlobalCdn: !!publicCdnUrl,
            filename 
          }));
        } catch (uploadErr) {
          res.writeHead(500, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
          res.end(JSON.stringify({ error: uploadErr.message }));
        }
      });
      return;
    }
  }

  // Handle secure TonAPI proxy endpoint to keep API keys server-side
  if (cleanUrl.startsWith('/api/ton/')) {
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      res.writeHead(405, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Only GET requests are permitted on this proxy' }));
      return;
    }

    const clientIp = req.socket.remoteAddress || 'local';
    if (!checkClientRateLimit(clientIp)) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '10',
        ...SECURITY_HEADERS
      });
      res.end(JSON.stringify({ error: 'Client rate limit reached. Retrying in 10s...' }));
      return;
    }

    let subPath = path.posix.normalize('/' + cleanUrl.slice('/api/ton'.length));
    if (subPath.startsWith('/v2/')) { subPath = subPath.slice(3); }

    // Healthcheck endpoint
    if (subPath === '/' || subPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ status: 'ok', service: 'ANLGRAM TonAPI Proxy', authenticated: !!process.env.TONAPI_KEY }));
      return;
    }

    // Whitelist check
    const isWhitelisted = ALLOWED_PROXY_ROUTES.some(p => p.test(subPath));
    if (!isWhitelisted) {
      res.writeHead(403, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
      res.end(JSON.stringify({ error: 'Forbidden', message: 'The requested path is not permitted by this proxy' }));
      return;
    }
    const queryString = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
    const cacheKey = `${subPath}${queryString}`;
    const now = Date.now();

    // Cache hit check (TTL: 60s for rates, 15s for balances/jettons, 10s for events)
    let ttl = 15000;
    if (subPath.includes('rates')) ttl = 60000;
    else if (subPath.includes('events') || subPath.includes('transactions')) ttl = 10000;

    const cached = proxyCache.get(cacheKey);
    if (cached && (now - cached.timestamp < cached.ttl)) {
      res.writeHead(cached.status, {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
        'X-Proxy-Cached': 'HIT',
        ...SECURITY_HEADERS
      });
      res.end(cached.data);
      return;
    }

    const targetUrl = `https://tonapi.io/v2${subPath}${queryString}`;
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'ANLGRAM-Institutional-Proxy/2.0'
    };
    if (process.env.TONAPI_KEY) {
      headers['Authorization'] = `Bearer ${process.env.TONAPI_KEY.trim()}`;
    }

    // Exponential Backoff with up to 3 attempts
    (async function proxyFetchWithRetry() {
      let attempts = 0;
      const maxAttempts = 3;
      let delayMs = 500;

      while (attempts < maxAttempts) {
        attempts++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8500);

        try {
          const apiRes = await fetch(targetUrl, {
            method: req.method,
            headers: headers,
            signal: controller.signal
          });
          clearTimeout(timeout);

          // Handle 429 Too Many Requests from upstream TonAPI
          if (apiRes.status === 429) {
            if (attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, delayMs));
              delayMs *= 2;
              continue;
            }
            res.writeHead(429, {
              'Content-Type': 'application/json',
              'Retry-After': '3',
              ...SECURITY_HEADERS
            });
            res.end(JSON.stringify({
              error: 'Rate limit reached on TonAPI upstream. Retrying...',
              status: 429,
              retryAfter: 3
            }));
            return;
          }

          // Handle 5xx Server Errors from upstream
          if (apiRes.status >= 500 && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, delayMs));
            delayMs *= 2;
            continue;
          }

          const data = await apiRes.text();
          
          // Cache successful 200 responses
          if (apiRes.status === 200) {
            proxyCache.set(cacheKey, { data, status: 200, timestamp: now, ttl });
          }

          res.writeHead(apiRes.status, {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${Math.floor(ttl / 1000)}`,
            'X-Proxy-Cached': 'MISS',
            ...SECURITY_HEADERS
          });
          res.end(data);
          return;
        } catch (fetchErr) {
          clearTimeout(timeout);
          if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, delayMs));
            delayMs *= 2;
            continue;
          }

          const isTimeout = fetchErr.name === 'AbortError';
          res.writeHead(isTimeout ? 504 : 502, {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          });
          res.end(JSON.stringify({
            error: isTimeout ? 'Request timed out on TonAPI upstream.' : 'Data provider temporarily unavailable.',
            message: fetchErr.message
          }));
          return;
        }
      }
    })();
    return;
  }

  const safePath = path.normalize(cleanUrl).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.resolve(__dirname, safePath === '/' || safePath === '\\' ? 'index.html' : '.' + safePath);
  
  // Safe directory check
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      res.end('File not found');
    } else {
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'text/plain',
        ...SECURITY_HEADERS
      });
      res.end(content);
    }
  });
});

server.listen(8080, () => {
  console.log('Server running at http://localhost:8080/');
});
