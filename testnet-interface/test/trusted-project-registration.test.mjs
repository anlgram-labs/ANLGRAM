import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import * as core from '@ton/core';
import execution from '../execution-version.json' with {type: 'json'};
import live from './fixtures/v5-account-proof-live-2026-11-02.json' with {type: 'json'};
import history from './fixtures/v5-source-history-live-2026-11-02.json' with {type: 'json'};
import {pinned} from '../recovery/policy.mjs';
import {createDraft} from '../wizard/model.mjs';
import {configurationFingerprint} from '../wizard/preparation-model.mjs';
import {deploymentEdge, deploymentIntent, hash, stateInit} from '../projects/project-registration.mjs';
import {projectProviders, provenance} from '../projects/project-providers.mjs';
import {makeLocalReceipt} from './recovery-local-fixture.mjs';

function input(creator = pinned.operator) {
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  draft.mode = 'launchpad';
  Object.assign(draft.metadata, {name: 'Trusted test project', symbol: 'TRUST', creator});
  draft.lp.beneficiary = creator;
  return {draft, executionVersion: execution.sha256, migrationAuthorityPublicKey: '13'.repeat(32)};
}

test('canonical registration intent derives identities and rejects client evidence, network, workchain and old versions', async () => {
  const valid = input(), original = await deploymentIntent(valid);
  assert.equal(original.record.configurationFingerprint, await configurationFingerprint(valid.draft));
  assert.equal(original.record.stateInitHash, hash(stateInit(original.candidate.states.migration)));
  assert.equal(original.record.project, original.candidate.addresses.minter.toRawString());
  for (const edit of [
    v => v.receipt = {verified: true}, v => v.project = pinned.operator, v => v.operationId = '1',
    v => v.executionVersion = '00'.repeat(32), v => v.draft.network = '-239',
    v => v.draft.metadata.creator = '-1:' + '22'.repeat(32), v => v.migrationAuthorityPublicKey = '00'.repeat(32)
  ]) {
    const copy = structuredClone(valid);
    edit(copy);
    await assert.rejects(deploymentIntent(copy));
  }
  const modified = structuredClone(valid);
  modified.draft.distribution.skip = true;
  const changed = await deploymentIntent(modified);
  assert.notEqual(changed.record.configurationFingerprint, original.record.configurationFingerprint);
  assert.notEqual(changed.record.project, original.record.project);
});

test('provider client authenticates captured account proof and anchored raw history, rejects substitutions and outages', async () => {
  const env = {TONCENTER_TESTNET_API_KEY: 'fixture-center', TONAPI_TESTNET_API_KEY: 'fixture-api'};
  let corrupt = false;
  const fetcher = async (url, request) => {
    assert.equal(request.redirect, 'error');
    if (url.startsWith('https://testnet.tonapi.io/')) {
      assert.equal(request.headers.Authorization, 'Bearer fixture-api');
      if (url.includes('/transactions?')) {
        assert.match(url, /before_lt=106958981000004/);
        return Response.json({transactions: history.secondary});
      }
      assert.ok(url.includes(pinned.operator));
      return Response.json(live.raw);
    }
    assert.equal(url, 'https://testnet.toncenter.com/api/v2/jsonRPC');
    assert.equal(request.headers['X-API-Key'], 'fixture-center');
    const {method, params} = JSON.parse(request.body);
    if (method === 'getTransactions') {
      assert.equal(params.lt, '106958981000003');
      return Response.json({ok: true, result: history.primary});
    }
    assert.equal(method, 'lookupBlock');
    return Response.json({ok: true, result: corrupt ? {...live.toncenterReference, root_hash: Buffer.alloc(32).toString('base64')} : live.toncenterReference});
  };
  const providers = projectProviders(env, fetcher);
  const cp = await providers.account(pinned.operator);
  assert.equal(cp.proof.proofInclusionVerified, true);
  assert.equal(cp.proof.validatorFinalityVerified, false);
  assert.equal((await providers.history(pinned.operator, cp)).rows.length, 5);
  assert.deepEqual((await providers.account(pinned.operator, cp.reference)).proof, cp.proof);
  corrupt = true;
  await assert.rejects(providers.account(pinned.operator), {code:'ACCOUNT_PROOF_REJECTED',provider:'TONAPI_TESTNET'});
  await assert.rejects(providers.account('0:' + '44'.repeat(32)));
  assert.throws(() => projectProviders({}), /Authenticated Testnet providers/);
  await assert.rejects(projectProviders(env, async () => new Response('', {status: 429, headers: {'Retry-After': '4'}}))
    .account(pinned.operator), {retryMs: 4000});
});

test('real Sandbox V5 deployment edges bind exact owner signature, StateInit and recipient', async () => {
  const f = await makeLocalReceipt();
  const {candidate} = await deploymentIntent(input(f.w.address.toRawString()));
  let seqno = 2;
  const ownerState = {code: f.beforeCode, data: f.beforeData};
  for (const role of ['minter', 'curve', 'migration']) {
    const dest = candidate.addresses[role], init = candidate.states[role];
    const executed = await f.send(seqno++, [core.internal({to: dest, value: 100000000n, init, body: core.Cell.EMPTY})]);
    const rows = executed.transactions.map(tx => {
      const cell = core.Cell.fromBase64(f.core.beginCell().store(f.core.storeTransaction(tx)).endCell().toBoc().toString('base64'));
      return {tx: core.loadTransaction(cell.beginParse()), hash: hash(cell)};
    });
    const source = rows.filter(({tx}) => tx.inMessage?.info.dest?.equals(f.w.address));
    const target = rows.filter(({tx}) => tx.inMessage?.info.dest?.equals(dest));
    const receipt = deploymentEdge(dest, init, f.w.address, ownerState, source, target);
    assert.equal(receipt.address, dest.toRawString());
    assert.equal(receipt.stateInitHash, hash(stateInit(init)));
    assert.throws(() => deploymentEdge(dest, {...init, data: core.Cell.EMPTY}, f.w.address, ownerState, source, target), /Exact deployment/);
    assert.throws(() => deploymentEdge(dest, init, f.w.address, ownerState, [], target), /Authenticated V5/);
  }
});

test('SQLite Worker restart retains immutable registration; public writes, conflicts and corrupt versions fail closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'anlgram-project-registry-'));
  const repo = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/');
  const entry = join(dir, 'fixture.mjs');
  writeFileSync(entry, `import {ProjectRegistry as Registry} from '${repo}project-registry-worker.mjs';
export {default} from '${repo}project-registry-worker.mjs';
export class Fixture extends Registry {
  async fetch(request) {
    if (new URL(request.url).pathname === '/test-seed') {
      await this.storage.put('registration', await request.json());
      return new Response('Fixture seed');
    }
    return super.fetch(request);
  }
}`);
  const config = join(dir, 'wrangler.json'), build = join(dir, 'build');
  writeFileSync(config, JSON.stringify({name: 'local-registry-fixture', main: entry,
    compatibility_date: '2026-10-30', compatibility_flags: ['nodejs_compat']}));
  execFileSync(process.execPath, [join(repo, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', config, '--dry-run', '--outdir', build], {cwd: repo, stdio: 'pipe'});
  const make = () => {
    const options = convertV4MiniflareOptions({rootPath: build, scriptPath: join(build, 'fixture.js'),
      modules: true, compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'],
      durableObjects: {REGISTRY: {className: 'Fixture', useSQLite: true}},
      outboundService: async () => { throw Error('Network forbidden in this fixture'); }});
    options.resourcePersistencePath = join(dir, 'persist');
    return new Miniflare(options);
  };
  const valid = input(), {record, candidate, input: canonicalInput} = await deploymentIntent(valid);
  const fingerprint = record.configurationFingerprint;
  const reference = live.toncenterReference;
  const seeded = {
    record, input: canonicalInput, provenance: {
      ...provenance, scope: 'VERIFIED_DEPLOYMENT_INCLUSION_RELATIVE_TO_PROVIDER_REFERENCE', reference,
      receipts: Object.fromEntries(['minter', 'curve', 'migration'].map(role => [role, {
        address: candidate.addresses[role].toRawString(), stateInitHash: hash(stateInit(candidate.states[role])),
        codeHash: hash(candidate.states[role].code), transactionHash: 'ab'.repeat(32), sourceTransactionHash: 'ac'.repeat(32),
        signedBodyHash: 'ad'.repeat(32), messageHash: 'ae'.repeat(32), sourceTransactionLt: '10', transactionLt: '20'
      }]))
    }
  };
  const url = 'https://project-registry.internal/' + fingerprint;
  const post = (endpoint, data) => new Request(endpoint, {method: 'POST', body: JSON.stringify(data)});
  const stub = async mf => {
    const ns = await mf.getDurableObjectNamespace('REGISTRY');
    return ns.get(ns.idFromName(fingerprint));
  };
  let mf = make();
  try {
    const s = await stub(mf);
    assert.equal((await mf.dispatchFetch(url + '/register', {method: 'POST', body: JSON.stringify(valid)})).status, 404);
    assert.equal((await s.fetch(url + '/status')).status, 404);
    assert.equal((await s.fetch(post(url + '/register', seeded))).status, 400);
    const rejected = await s.fetch(post(url + '/register', valid));
    assert.equal(rejected.status, 503, await rejected.text());
    assert.equal((await s.fetch(url + '/status')).status, 404);
    assert.equal((await s.fetch(post('https://fixture/test-seed', seeded))).status, 200);
  } finally { await mf.dispose(); }
  mf = make();
  try {
    const s = await stub(mf);
    const response = await s.fetch(url + '/status'), status = await response.json();
    assert.equal(response.status, 200, JSON.stringify(status));
    assert.equal(status.configurationFingerprint, fingerprint);
    assert.equal(status.acquisition.status, 'PROVIDER_OR_PROOF_UNAVAILABLE_HISTORICAL_ONLY');
    assert.deepEqual(status.acquisition.registration, seeded.provenance);
    assert.equal(status.settlement, 'UNKNOWN');
    assert.equal(status.currentWalletUnits, null);
    assert.equal(status.financialSigningEnabled, false);
    assert.equal(status.withdrawalsEnabled, false);
    assert.equal(status.recoveryEnabled, false);
    assert.deepEqual(await (await s.fetch(post(url + '/register', valid))).json(), {registration: 'ALREADY_REGISTERED'});
    const conflicting = {...valid, migrationAuthorityPublicKey: '42'.repeat(32)};
    assert.equal((await s.fetch(post(url + '/register', conflicting))).status, 409);
    await s.fetch(post('https://fixture/test-seed', {...seeded, record: {...record, executionVersion: 'wrong'}}));
    assert.equal((await s.fetch(url + '/status')).status, 503);
  } finally { await mf.dispose(); }
});
