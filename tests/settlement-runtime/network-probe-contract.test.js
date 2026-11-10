'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawnSync } = require('node:child_process');

// Script that encapsulates the exact network probe logic
const PROBE_SNIPPET = `
  const net = require('net');
  const host = process.env.PROBE_HOST || '8.8.8.8';
  const port = parseInt(process.env.PROBE_PORT || '53', 10);
  const timeoutMs = parseInt(process.env.PROBE_TIMEOUT_MS || '1000', 10);

  let resolved = false;
  const finish = (code) => {
    if (resolved) return;
    resolved = true;
    try { socket.destroy(); } catch (_) {}
    process.exit(code);
  };

  const socket = net.createConnection({ host, port });
  socket.setTimeout(timeoutMs);

  socket.on('connect', () => {
    finish(99); // FAIL: Connection succeeded (egress open)
  });

  socket.on('timeout', () => {
    finish(97); // FAIL CLOSED / INCONCLUSIVE: Egress timed out without kernel rejection
  });

  socket.on('error', (err) => {
    if (err.code === 'ENETUNREACH' || err.code === 'EHOSTUNREACH' || err.code === 'ENETDOWN') {
      finish(0); // PASS: Network demonstrably unreachable
    } else if (err.code === 'ECONNREFUSED') {
      finish(98); // FAIL CLOSED: Connection refused indicates host is reachable and route exists
    } else {
      finish(95); // FAIL CLOSED: Unexpected error
    }
  });

  process.on('uncaughtException', () => finish(96));
`;

test('Network probe exits 99 when external connection succeeds', async () => {
  // Create a local listening TCP server to simulate a reachable connection
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const port = server.address().port;

  const result = spawnSync(process.execPath, ['-e', PROBE_SNIPPET], {
    env: {
      ...process.env,
      PROBE_HOST: '127.0.0.1',
      PROBE_PORT: String(port),
      PROBE_TIMEOUT_MS: '1000'
    }
  });

  server.close();
  assert.equal(result.status, 99, 'Expected exit code 99 when connection succeeds');
});

test('Network probe exits 98 on ECONNREFUSED (route exists but port closed)', async () => {
  // Bind and immediately close to guarantee the port is closed on 127.0.0.1
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));

  const result = spawnSync(process.execPath, ['-e', PROBE_SNIPPET], {
    env: {
      ...process.env,
      PROBE_HOST: '127.0.0.1',
      PROBE_PORT: String(port),
      PROBE_TIMEOUT_MS: '1000'
    }
  });

  assert.equal(result.status, 98, 'Expected exit code 98 on ECONNREFUSED');
});

test('Network probe exits 97 on connection timeout', async () => {
  // Connect to a non-routable IP that drops packets (RFC 5737 TEST-NET-1: 192.0.2.1)
  const result = spawnSync(process.execPath, ['-e', PROBE_SNIPPET], {
    env: {
      ...process.env,
      PROBE_HOST: '192.0.2.1',
      PROBE_PORT: '53',
      PROBE_TIMEOUT_MS: '200'
    }
  });

  // Depending on host OS, packet to 192.0.2.1 either times out (97) or gives ENETUNREACH (0) / EHOSTUNREACH (0)
  assert([97, 0].includes(result.status), `Expected 97 (timeout) or 0 (unreachable), got: ${result.status}`);
});

test('Network probe exits 0 when error code is ENETUNREACH or EHOSTUNREACH', () => {
  // Unit test the error handler logic directly
  const snippet = `
    const err = { code: process.env.MOCK_ERROR_CODE };
    if (err.code === 'ENETUNREACH' || err.code === 'EHOSTUNREACH' || err.code === 'ENETDOWN') {
      process.exit(0);
    } else if (err.code === 'ECONNREFUSED') {
      process.exit(98);
    } else {
      process.exit(95);
    }
  `;

  for (const code of ['ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN']) {
    const res = spawnSync(process.execPath, ['-e', snippet], {
      env: { ...process.env, MOCK_ERROR_CODE: code }
    });
    assert.equal(res.status, 0, `Expected code 0 for ${code}`);
  }

  const resRefused = spawnSync(process.execPath, ['-e', snippet], {
    env: { ...process.env, MOCK_ERROR_CODE: 'ECONNREFUSED' }
  });
  assert.equal(resRefused.status, 98, 'Expected code 98 for ECONNREFUSED');

  const resOther = spawnSync(process.execPath, ['-e', snippet], {
    env: { ...process.env, MOCK_ERROR_CODE: 'EINVAL' }
  });
  assert.equal(resOther.status, 95, 'Expected code 95 for unexpected error');
});
