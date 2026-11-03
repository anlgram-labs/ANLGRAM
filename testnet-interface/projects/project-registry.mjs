// Server-side project registration and resolution.
// Never trusts client-submitted project addresses, fingerprints or operation IDs.
import * as core from '@ton/core';
import execution from '../execution-version.json' with {type:'json'};
import dispatch from '../../minter-contract/scripts/migration-package-dispatch-v2.js';
import {verifyMigrationAccountCheckpoint,isMigrationCheckpoint} from './migration-account.mjs';
import {generation2Status} from './migration-status.mjs';
import {isIncludedLpEvidence} from './lp-evidence.mjs';
import {configurationFingerprint} from '../wizard/preparation-model.mjs';

/**
 * Minimum Server-Side Project Registration Specification:
 * 
 * 1. PERSISTENT STORAGE BINDING:
 *    A Cloudflare Worker KV namespace, Durable Object, or D1 SQL table bound as `PROJECT_REGISTRY`.
 *    Key: canonical `configurationFingerprint` (64-character lowercase hex string).
 *    Value: JSON record containing verified immutable deployment coordinates:
 *      - network: '-3' (TON Testnet workchain 0, test network only)
 *      - generation: 2 (VNext one-shot dispatch migration architecture)
 *      - executionVersion: exact sha256 matching execution-version.json
 *      - configurationFingerprint: hex string computed from normalized project draft
 *      - project: raw format address of Jetton Minter (0:...)
 *      - migrator: raw format address of Migration Router Dispatch V2 (0:...)
 *      - operationId: root queryId string (positive integer < 2^62)
 *      - configuration: canonical dispatch configuration parameters
 *      - stateInitHash: hex string of verified migration contract StateInit
 *      - codeHash: hex string of pinned contract code
 *      - registeredAt: ISO timestamp of verified deployment
 * 
 * 2. REGISTRATION PROOF LIFECYCLE:
 *    A project is registered ONLY when an authentic V5 deployment transaction receipt
 *    has been verified on-chain against the deterministic StateInit and pinned code hash.
 *    Client requests cannot create, update, or assert registrations.
 *    When no registration exists for a configuration fingerprint, the server fails closed
 *    and returns scope: 'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE' with
 *    unavailableReason: 'NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS'.
 * 
 * 3. CHECKPOINT ACQUISITION:
 *    When registered, account evidence is acquired from authenticated Testnet RPC providers
 *    and validated using verifyMigrationAccountCheckpoint(configuration, 'migration', raw, reference, 2).
 *    Client-supplied account BOCs or Merkle proofs are strictly forbidden.
 */
export const MINIMUM_SERVER_REGISTRATION_SPEC = Object.freeze({
  storageBinding: 'PROJECT_REGISTRY',
  keyFormat: 'configurationFingerprint:64hex',
  requiredFields: ['network', 'generation', 'executionVersion', 'configurationFingerprint', 'project', 'migrator', 'operationId', 'configuration'],
  requiredNetwork: '-3',
  requiredGeneration: 2,
  requiredExecutionVersion: execution.sha256,
  registrationTrigger: 'AUTHENTIC_V5_DEPLOYMENT_RECEIPT_ON_CHAIN'
});

// In-memory registry for worker runtime cache and automated test fixtures.
const memoryRegistry = new Map();

export function registerProjectInMemory(record) {
  validateRegisteredProjectRecord(record);
  memoryRegistry.set(record.configurationFingerprint, Object.freeze(structuredClone(record)));
}

export function clearMemoryRegistry() {
  memoryRegistry.clear();
}

export function validateRegisteredProjectRecord(record) {
  if (!record || typeof record !== 'object') throw Error('Malformed project registration record');
  if (record.network !== '-3') throw Error('Wrong network in registration record: must be Testnet -3');
  if (record.generation !== 2) throw Error('Unsupported generation in registration record: must be 2');
  if (record.executionVersion !== execution.sha256) throw Error('Execution version mismatch in registration record');
  if (!record.configurationFingerprint || typeof record.configurationFingerprint !== 'string') throw Error('Missing configurationFingerprint in registration');
  if (!record.project || typeof record.project !== 'string' || !record.project.startsWith('0:')) throw Error('Invalid raw project address in registration');
  if (!record.migrator || typeof record.migrator !== 'string' || !record.migrator.startsWith('0:')) throw Error('Invalid raw migrator address in registration');
  if (!record.operationId || typeof record.operationId !== 'string' || !/^\d+$/.test(record.operationId)) throw Error('Invalid operationId in registration');
  if (!record.configuration || typeof record.configuration !== 'object') throw Error('Missing configuration in registration');

  // Verify that the registered coordinates match dispatch build for the configuration
  const c = dispatch.build(core, record.configuration);
  if (c.addresses.minter.toRawString() !== record.project) throw Error('Registered project minter address does not match dispatch StateInit');
  if (c.addresses.migration.toRawString() !== record.migrator) throw Error('Registered migrator address does not match dispatch StateInit');
  if (c.operationId.toString() !== record.operationId) throw Error('Registered operationId does not match dispatch configuration');
}

export async function getRegisteredProject(fingerprint, env = {}) {
  if (!fingerprint || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint)) return null;

  // 1. Check in-memory registry (used in test suites or local cache)
  if (memoryRegistry.has(fingerprint)) {
    const mem = memoryRegistry.get(fingerprint);
    try {
      validateRegisteredProjectRecord(mem);
      return mem;
    } catch {
      return null;
    }
  }

  // 2. Check env.REGISTERED_PROJECTS if provided as an object/map in test context
  if (env.REGISTERED_PROJECTS) {
    const rec = env.REGISTERED_PROJECTS instanceof Map
      ? env.REGISTERED_PROJECTS.get(fingerprint)
      : env.REGISTERED_PROJECTS[fingerprint];
    if (rec) {
      try {
        validateRegisteredProjectRecord(rec);
        return rec;
      } catch {
        return null;
      }
    }
  }

  // 3. Check persistent storage binding (KV / Durable Object) if configured
  if (env.PROJECT_REGISTRY) {
    try {
      const stored = typeof env.PROJECT_REGISTRY.get === 'function'
        ? await env.PROJECT_REGISTRY.get(fingerprint, 'json')
        : null;
      if (stored) {
        validateRegisteredProjectRecord(stored);
        return stored;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function projectRegisteredStatus(registered, env = {}, options = {}) {
  validateRegisteredProjectRecord(registered);

  const identity = Object.freeze({
    project: registered.project,
    migrator: registered.migrator,
    operationId: String(registered.operationId)
  });

  // Resolve checkpoint: options.checkpoint > options.rawProof > registered.checkpoint
  let checkpoint = options.checkpoint || registered.checkpoint || null;
  if (!checkpoint && options.rawProof && options.reference) {
    checkpoint = verifyMigrationAccountCheckpoint(registered.configuration, 'migration', options.rawProof, options.reference, 2);
  }

  if (checkpoint && !isMigrationCheckpoint(checkpoint)) {
    throw Error('Invalid migration checkpoint brand');
  }

  // Resolve previous checkpoint
  const previous = options.previous || registered.previousCheckpoint || null;

  // Resolve evidence
  const evidence = options.evidence || registered.evidence || [];
  for (const e of evidence) {
    if (!isIncludedLpEvidence(e)) throw Error('Invalid LP evidence brand');
  }

  // Project generation 2 status
  const projection = generation2Status(identity, { checkpoint, previous, evidence });

  return {
    schema: 2,
    generation: 2,
    network: '-3',
    configurationFingerprint: registered.configurationFingerprint,
    project: identity.project,
    migrator: identity.migrator,
    operationId: identity.operationId,
    scope: projection.scope,
    dispatch: projection.dispatch,
    mint: projection.mint,
    custody: projection.custody,
    lock: projection.lock,
    settlement: projection.settlement,
    historicalLp: projection.historicalLp,
    currentWalletUnits: null,
    unresolvedReturns: 'UNKNOWN',
    evidence: projection.evidence,
    checkpoint: projection.checkpoint,
    financialSigningEnabled: false,
    broadcastingEnabled: false,
    tradingEnabled: false,
    migrationAuthorized: false,
    withdrawalsEnabled: false,
    recoveryEnabled: false,
    status: projection
  };
}
