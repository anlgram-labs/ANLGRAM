'use strict';
// Local unit tests; no network or wallet request is made.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, 'assets/js/launchpad.js'), 'utf8');
const start = code.indexOf('  async function directDeploy(');
const end = code.indexOf('  // ═', start + 10);
assert(start >= 0 && end > start);
function setup(creator) {
  const window = { deployJettonWeb3: creator };
  const context = vm.createContext({ window });
  vm.runInContext(code.slice(start, end), context);
  const button = { innerHTML: 'Create', style: {}, removeAttribute() {} };
  return { run: () => context.directDeploy(button, 'Create'), button };
}
test('missing canonical creator fails before any fallback submission', async () => {
  await assert.rejects(setup().run(), /unavailable/);
});
test('canonical validation failure propagates', async () => {
  await assert.rejects(setup(async () => ({ submitted: false, reason: 'invalid network' })).run(), /invalid network/);
});
test('uncertain result remains pending without another signing request', async () => {
  let calls = 0;
  const t = setup(async () => { calls++; return { submitted: false, uncertain: true }; });
  assert.equal((await t.run()).uncertain, true);
  assert.equal(calls, 1);
  assert.match(t.button.textContent, /pending/);
});
test('accepted request uses canonical creator and does not claim deployment', async () => {
  let received;
  const t = setup(async e => { received = e; return { submitted: true, destAddressMint: 'expected' }; });
  assert.equal((await t.run()).destAddressMint, 'expected');
  assert.equal(received.currentTarget, t.button);
  assert.equal(received.wizardInitiated, undefined);
  assert.match(t.button.textContent, /not yet verified/);
});
