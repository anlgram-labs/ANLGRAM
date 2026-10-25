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
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://d3js.org https://esm.sh https://cdn.emailjs.com https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https://raw.githubusercontent.com https://tonapi.io https://api.ston.fi https://*.ston.fi https://testnet.tonapi.io https://*.tonapi.io https://toncenter.com https://testnet.toncenter.com https://api.coingecko.com https://api.telegram.org https://api.emailjs.com https://unpkg.com https://esm.sh wss://*.tonconnect.io https://*.tonconnect.io https://bridge.tonapi.io wss://bridge.tonapi.io; frame-src 'self' https://app.ston.fi https://dedust.io https://telegram.org; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://telegram.org; object-src 'none'; base-uri 'self';"
};

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

  // Handle secure TonAPI proxy endpoint to keep API keys server-side
  if (cleanUrl.startsWith('/api/ton/')) {
    let subPath = path.posix.normalize('/' + cleanUrl.slice('/api/ton'.length));
    if (subPath.startsWith('/v2/')) { subPath = subPath.slice(3); }
    const queryString = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
    const targetUrl = `https://tonapi.io/v2${subPath}${queryString}`;

    const headers = {
      'Accept': 'application/json'
    };
    if (process.env.TONAPI_KEY) {
      headers['Authorization'] = `Bearer ${process.env.TONAPI_KEY.trim()}`;
    }

    fetch(targetUrl, {
      method: req.method,
      headers: headers
    }).then(async (apiRes) => {
      const data = await apiRes.text();
      res.writeHead(apiRes.status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=15',
        ...SECURITY_HEADERS
      });
      res.end(data);
    }).catch((err) => {
      res.writeHead(502, {
        'Content-Type': 'application/json',
        ...SECURITY_HEADERS
      });
      res.end(JSON.stringify({ error: 'TonAPI proxy failure', message: err.message }));
    });
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
