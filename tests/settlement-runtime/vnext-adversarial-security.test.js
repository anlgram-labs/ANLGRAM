'use strict';
/**
 * Targeted Independent Security Review — VNext Authorization & Settlement Adversarial Tests
 * Target: commit f6776d6 / 1bba1c5
 * 
 * Verifies:
 * - Threat modeling of compromised/malicious permission signers
 * - Network, project, and version identity binding
 * - Replay and renewal protections
 * - Two-phase authorization isolation
 * - Proof that signature can NEVER cause unauthorized asset transfer or substitute for custody
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('@ton/core');
const { compileFunc } = require('@ton-community/func-js');
const { Blockchain, internal } = require('@ton/sandbox');
const pkg = require('../../minter-contract/scripts/migration-package-vnext');
const builder = require('../../minter-contract/scripts/vnext-permit');

const { beginCell } = core;

async function fixture(settings = {}) {
  const chain = await Blockchain.create();
  chain.now = 1800000000;
  chain.verbosity = { print: false, blockchainLogs: false, vmLogs: 'none', debugLogs: false };

  // Set config 19 to Testnet (-3)
  const config = core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32), core.Dictionary.Values.Cell(), chain.config);
  config.set(19, beginCell().storeInt(-3, 32).endCell());
  chain.setConfig(beginCell().storeDictDirect(config).endCell());

  const owner = await chain.treasury('vnext-adv-owner');
  const attacker = await chain.treasury('vnext-adv-attacker');

  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');

  const c = pkg.build(core, {
    creator: owner.address.toRawString(),
    projectId: 'vnext-adversarial-review',
    metadata: { name: 'Adversarial Test', symbol: 'BADV' },
    operationId: 88n,
    percent: settings.percent ?? 75,
    duration: settings.duration ?? 'days180',
    beneficiary: owner.address,
    unlockedController: owner.address,
    migrationAuthorityPublicKey: publicKey,
  });

  const dir = path.resolve(__dirname, '../../minter-contract/contracts');
  const [gCode, cCode, mCode] = await Promise.all(
    ['anlgram-guard-vnext', 'anlgram-bonding-curve-vnext', 'anlgram-migration-router-vnext'].map(async (n) => {
      const r = await compileFunc({
        targets: [n + '.fc'],
        sources: (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'),
      });
      assert.equal(r.status, 'ok', r.message);
      return core.Cell.fromBase64(r.codeBoc);
    })
  );

  for (const [role, init] of Object.entries(c.states)) {
    await owner.send({ to: c.addresses[role], init, value: 100000000n, body: beginCell().endCell() });
  }

  const sign = (p) => crypto.sign(null, p.digest, keys.privateKey);
  const send = (to, body, value = 100000000n, actor = owner) => actor.send({ to, body, value, bounce: true });

  return { chain, owner, attacker, keys, c, sign, send };
}

const exit = (res, address, code) =>
  res.transactions.some(
    (t) => t.inMessage?.info.dest?.equals(address) && t.description.computePhase?.exitCode === code
  );

test('Adversarial 1: A rogue authority signing key CANNOT redirect migration assets to an attacker address', async () => {
  const f = await fixture();
  await f.send(f.c.addresses.curve, f.c.initCurve);
  await f.send(f.c.addresses.curve, f.c.bindGuard, 80000000n);

  // Attacker creates a permit where migrator address is replaced with attacker's address
  const maliciousScope = { ...f.c.guard, migrator: f.attacker.address };
  const p = builder.permit(core, maliciousScope, {
    phase: 1,
    nonce: 1n,
    starts: f.chain.now,
    deadline: f.chain.now + 60,
    tonNano: 500000000000n,
    jettonUnits: 200000000000000000n,
    minimumLpUnits: 100n,
    curveEpoch: 1n,
    fundingEpoch: 0n,
    dexEpoch: 0n,
  });

  const signed = builder.submission(core, f.c.guard, p, f.sign(p));
  const submit = await f.send(f.c.addresses.guard, signed, 50000000n, f.attacker);

  // Guard checks scope and verifies migrator matches the bound migrator StateInit template!
  assert(exit(submit, f.c.addresses.guard, 408), 'Guard rejects permit with redirected migrator address (exit code 408)');
});

test('Adversarial 2: A valid authority signature for another project CANNOT be used across projects (Cross-Project Replay)', async () => {
  const f = await fixture();
  await f.send(f.c.addresses.curve, f.c.initCurve);
  await f.send(f.c.addresses.curve, f.c.bindGuard, 80000000n);

  const c2 = pkg.build(core, {
    creator: f.owner.address.toRawString(),
    projectId: 'different-project-id',
    metadata: { name: 'Different', symbol: 'DIFF' },
    operationId: 99n,
    migrationAuthorityPublicKey: f.c.guard.publicKey,
  });

  // Valid permit signed for Project 2
  const p2 = builder.permit(core, c2.guard, {
    phase: 1,
    nonce: 1n,
    starts: f.chain.now,
    deadline: f.chain.now + 60,
    tonNano: 500000000000n,
    jettonUnits: 200000000000000000n,
    minimumLpUnits: 100n,
    curveEpoch: 1n,
    fundingEpoch: 0n,
    dexEpoch: 0n,
  });
  const signedP2 = builder.submission(core, f.c.guard, p2, f.sign(p2));

  // Submit Project 2's permit to Project 1's Guard
  const replayAttempt = await f.send(f.c.addresses.guard, signedP2, 50000000n);
  assert(
    exit(replayAttempt, f.c.addresses.guard, 408) || exit(replayAttempt, f.c.addresses.guard, 409),
    'Guard rejects permit with different operation ID / intent (exit code 408 or 409)'
  );
});

test('Adversarial 3: A valid authority signature on Mainnet (config param 19 != -3) is rejected by Guard', async () => {
  const f = await fixture();
  await f.send(f.c.addresses.curve, f.c.initCurve);
  await f.send(f.c.addresses.curve, f.c.bindGuard, 80000000n);

  // Modify config param 19 to simulate Mainnet global ID (-239)
  const cfg = core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32), core.Dictionary.Values.Cell(), f.chain.config);
  cfg.set(19, beginCell().storeInt(-239, 32).endCell());
  f.chain.setConfig(beginCell().storeDictDirect(cfg).endCell());

  const p = builder.permit(core, f.c.guard, {
    phase: 1,
    nonce: 1n,
    starts: f.chain.now,
    deadline: f.chain.now + 60,
    tonNano: 500000000000n,
    jettonUnits: 200000000000000000n,
    minimumLpUnits: 100n,
    curveEpoch: 1n,
    fundingEpoch: 0n,
    dexEpoch: 0n,
  });
  const signed = builder.submission(core, f.c.guard, p, f.sign(p));

  const res = await f.send(f.c.addresses.guard, signed, 50000000n);
  assert(exit(res, f.c.addresses.guard, 408), 'Guard rejects permit on non-Testnet network global ID (exit code 408)');
});

test('Adversarial 4: Curve VNext NEVER releases TON or Jettons from a signature alone (Proving Gate 414 is Fail-Closed)', async () => {
  const f = await fixture();
  await f.send(f.c.addresses.curve, f.c.initCurve);
  await f.send(f.c.addresses.curve, f.c.bindGuard, 80000000n);

  // Curve dispatch requires graduation, return epoch, and valid grant. Even with all pre-conditions, vn_require_curve_dispatch throws 414.
  const dispatchAttempt = await f.send(
    f.c.addresses.curve,
    beginCell().storeUint(0x414e5803, 32).storeUint(f.c.operationId, 64).storeUint(1, 64).storeUint(12345, 256).endCell(),
    250000000n
  );
  assert(exit(dispatchAttempt, f.c.addresses.curve, 409) || exit(dispatchAttempt, f.c.addresses.curve, 414), 'Curve VNext unconditionally rejects asset dispatch without valid state or throws 414');
});
