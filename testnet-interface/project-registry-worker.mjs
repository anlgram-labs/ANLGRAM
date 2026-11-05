import {standardRegistrationIntent, acquireStandardRegistration, standardStatus} from './projects/standard-registration.mjs';
import {verifyMigrationAccountCheckpoint} from './projects/migration-account.mjs';
import {deploymentIntent, acquireRegistration, hexHash, hash, stateInit} from './projects/project-registration.mjs';
import {projectProviders, provenance} from './projects/project-providers.mjs';
import {acquireLpIssuance} from './projects/project-lp-acquisition.mjs';
import {projectStatusResponse} from './projects/project-registry.mjs';
import {readBoundedJson} from './testnet-rpc.mjs';
import {acquireDistributionReceipts} from './projects/distribution-receipts.mjs';
import {prepareDistribution} from './projects/distribution.mjs';
import {code} from './projects/artifacts.mjs';

const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
const unavailable = () => json({error: 'Project evidence unavailable'}, 503);
const checkpoint = (record, stored) => stored && verifyMigrationAccountCheckpoint(
  record.configuration, 'migration', stored.raw, stored.reference, 2);

export class ProjectRegistry {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
    this.refreshing = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const route = /^\/([a-f0-9]{64})\/(status|register)$/.exec(url.pathname);
    if (!route || url.origin !== 'https://project-registry.internal' || url.search ||
      (this.state.id.name && this.state.id.name !== route[1])) return json({error: 'Unknown route'}, 404);
    const [, fingerprint, action] = route;
    if (action === 'register' && request.method === 'POST') {
      // Internal namespace invocation only. The public Worker returns 404
      // for all HTTP requests, and Pages forwards only GET /status.
      let intent;
      try {
        const input = await readBoundedJson(request);
        if (input?.projectType === 'STANDARD_V2') return await this.registerStandard(fingerprint, input);
        intent = await deploymentIntent(input);
      }
      catch { return json({error: 'Invalid project deployment intent'}, 400); }
      if (intent.record.configurationFingerprint !== fingerprint) return json({error: 'Wrong project key'}, 400);
      return this.register(intent);
    }
    if (action !== 'status' || request.method !== 'GET') return json({error: 'Unknown route'}, 404);
    try {
      const stored = await this.storage.get('registration');
      if (!stored) return json({error: 'Unregistered project'}, 404);
      if (stored.input?.projectType === 'STANDARD_V2') {
        const intent = await standardRegistrationIntent(stored.input);
        const receipt = stored.provenance?.deployment;
        if (intent.manifest.configurationFingerprint !== fingerprint ||
          stored.provenance?.fingerprint !== intent.identity.fingerprint ||
          receipt?.address !== intent.manifest.minter.raw ||
          receipt.stateInitHash !== intent.manifest.deployment.receiptExpectation.stateInitHash ||
          receipt.codeHash !== intent.manifest.minter.codeHash ||
          ![receipt.transactionHash, receipt.sourceTransactionHash, receipt.messageHash, receipt.signedBodyHash].every(hexHash) ||
          stored.provenance.validatorFinalityVerified !== false) return unavailable();
        const result = standardStatus(intent, stored.provenance);
        if (intent.input.draft.walletProfile==='STANDARD_V2_SETTLEMENT'&&!intent.input.draft.distribution.skip) {
          if (!this.distributionRead || this.distributionRead.until <= Date.now()) {
            const read = {until:Date.now()+30_000};
            read.result = Promise.resolve().then(() => {
              const manifest=intent.manifest;
              const distribution=prepareDistribution(intent.input.draft,{master:manifest.minter.raw,
                walletCode:code('standard-jetton-settlement-wallet'),seed:manifest.configurationFingerprint});
              return distribution.batches.length ? acquireDistributionReceipts(
                {...manifest,distribution},projectProviders(this.env),stored.provenance.reference) : null;
            }).catch(error => {
              if(error?.retryMs>30_000)read.until=Date.now()+Math.min(error.retryMs,300_000);
              return null;
            });
            this.distributionRead=read;
          }
          result.distributionReceipts = await this.distributionRead.result;
        }
        return json(result);
      }
      const intent = await deploymentIntent(stored.input);
      if (!this.validStoredRegistration(intent, stored, fingerprint)) return unavailable();
      if (!this.refreshing) this.refreshing = this.status(intent, stored).finally(() => { this.refreshing = null; });
      return json(await this.refreshing);
    } catch { return unavailable(); }
  }

  validStoredRegistration(intent, stored, fingerprint) {
    const proof = stored.provenance;
    return intent.record.configurationFingerprint === fingerprint &&
      JSON.stringify(intent.record) === JSON.stringify(stored.record) &&
      proof?.network === '-3' && proof.validatorFinalityVerified === false &&
      proof.accountProofProvider === provenance.accountProofProvider &&
      proof.masterchainReferenceProvider === provenance.masterchainReferenceProvider &&
      proof.scope === 'VERIFIED_DEPLOYMENT_INCLUSION_RELATIVE_TO_PROVIDER_REFERENCE' &&
      proof.reference?.workchain === -1 && proof.reference.shard === '-9223372036854775808' &&
      Number.isInteger(proof.reference.seqno) && proof.reference.seqno > 0 &&
      [proof.reference.root_hash, proof.reference.file_hash].every(value =>
        typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value)) &&
      ['minter', 'curve', 'migration'].every(role => {
        const r = proof.receipts?.[role];
        const init = intent.candidate.states[role];
        return r?.address === intent.candidate.addresses[role].toRawString() &&
          r.stateInitHash === hash(stateInit(init)) && r.codeHash === hash(init.code) &&
          [r.transactionHash, r.sourceTransactionHash, r.signedBodyHash, r.messageHash].every(hexHash) &&
          /^[1-9][0-9]{0,19}$/.test(r.sourceTransactionLt) && /^[1-9][0-9]{0,19}$/.test(r.transactionLt) &&
          BigInt(r.sourceTransactionLt) < BigInt(r.transactionLt);
      });
  }

  async registerStandard(fingerprint, input) {
    const intent = await standardRegistrationIntent(input);
    if (intent.manifest.configurationFingerprint !== fingerprint) return json({error:'Wrong project key'},400);
    const existing = record => JSON.stringify(record.input) === JSON.stringify(intent.input) &&
      record.provenance?.fingerprint === intent.identity.fingerprint
      ? json({registration:'ALREADY_REGISTERED'}) : json({error:'Conflicting immutable registration'},409);
    const old = await this.storage.get('registration');
    if (old) return existing(old);
    let proof;
    try { proof = await acquireStandardRegistration(intent, projectProviders(this.env)); }
    catch { return unavailable(); }
    return this.storage.transaction(async txn => {
      const concurrent = await txn.get('registration');
      if (concurrent) return existing(concurrent);
      await txn.put('registration', {input:intent.input, provenance:proof});
      return json({registration:'REGISTERED'},201);
    });
  }

  async register(intent) {
    const existing = old => JSON.stringify(old.input) === JSON.stringify(intent.input) &&
      this.validStoredRegistration(intent, old, intent.record.configurationFingerprint)
      ? json({registration: 'ALREADY_REGISTERED'}) : json({error: 'Conflicting immutable registration'}, 409);
    const old = await this.storage.get('registration');
    if (old) return existing(old);
    let proof;
    try { proof = await acquireRegistration(intent, projectProviders(this.env)); }
    catch { return unavailable(); }
    const value = {input: intent.input, record: intent.record, provenance: proof};
    if (!this.validStoredRegistration(intent, value, intent.record.configurationFingerprint)) return unavailable();
    return this.storage.transaction(async txn => {
      const concurrent = await txn.get('registration');
      if (concurrent) return existing(concurrent);
      await txn.put('registration', value);
      return json({registration: 'REGISTERED'}, 201);
    });
  }

  async status(intent, stored) {
    const {record, candidate} = intent;
    const status = (options, state) => projectStatusResponse(record, options, {
      status: state, ...provenance, registration: stored.provenance
    });
    const refresh = await this.storage.transaction(async txn => {
      const now = Date.now();
      if ((await txn.get('nextReadAt')) > now) return false;
      await txn.put('nextReadAt', now + 30_000);
      return true;
    });
    const historical = async state => status({
      checkpoint: checkpoint(record, await this.storage.get('checkpoint'))
    }, state);
    if (!refresh) return historical('REFRESH_THROTTLED_HISTORICAL_ONLY');
    let providers, acquired, current;
    try {
      providers = projectProviders(this.env);
      acquired = await providers.account(record.migrator);
      current = checkpoint(record, acquired);
      if (Math.abs(Date.now() / 1000 - current.proof.chainTime) > 120) throw Error('Stale masterchain checkpoint');
      const registeredAt = stored.provenance.reference;
      if (acquired.reference.seqno < registeredAt.seqno ||
        (acquired.reference.seqno === registeredAt.seqno &&
          (acquired.reference.root_hash !== registeredAt.root_hash || acquired.reference.file_hash !== registeredAt.file_hash))) {
        throw Error('Checkpoint predates or conflicts with registration');
      }
      const {result, previous, previousReference} = await this.storage.transaction(async txn => {
        const latest = await txn.get('checkpoint');
        const previous = checkpoint(record, latest);
        const result = status({checkpoint: current, previous}, 'REFERENCE_VERIFIED');
        if (!previous || current.proof.masterchainSeqno > previous.proof.masterchainSeqno) {
          await txn.put('checkpoint', {raw: acquired.raw, reference: acquired.reference});
        }
        return {result, previous, previousReference: latest?.reference};
      });
      if (result.dispatch !== 'DEX_DISPATCHED') return result;
      try {
        const issuance = await acquireLpIssuance(candidate, providers, acquired.reference, previousReference);
        return issuance ? status({checkpoint: current, previous, evidence: [issuance]}, 'REFERENCE_VERIFIED') : result;
      } catch (error) {
        await this.backoff(error);
        return result;
      }
    } catch (error) {
      await this.backoff(error);
      return historical('PROVIDER_OR_PROOF_UNAVAILABLE_HISTORICAL_ONLY');
    }
  }

  async backoff(error) {
    if (error.retryMs > 30_000) await this.storage.transaction(async txn => {
      const deadline = Date.now() + Math.min(error.retryMs, 300_000);
      if (!((await txn.get('nextReadAt')) >= deadline)) await txn.put('nextReadAt', deadline);
    });
  }
}

export default {fetch: () => json({error: 'Not found'}, 404)};
