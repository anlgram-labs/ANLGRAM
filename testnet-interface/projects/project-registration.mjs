import * as core from '@ton/core';
import dispatch from '../../minter-contract/scripts/migration-package-dispatch-v2.js';
import receipt from '../../lib/v5-deployment-receipt.js';
import execution from '../execution-version.json' with {type: 'json'};
import {configuration, configurationFingerprint} from '../wizard/preparation-model.mjs';
import {address, validate} from '../wizard/model.mjs';
import {includedAccountCell, provenance} from './project-providers.mjs';

export const hexHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export const rawAddress = value => typeof value === 'string' && /^0:[0-9a-f]{64}$/.test(value);
export const hash = cell => cell.hash().toString('hex');
export const stateInit = init => core.beginCell().store(core.storeStateInit(init)).endCell();
const messageHash = message => hash(core.beginCell().store(core.storeMessage(message)).endCell());
const need = (ok, error) => { if (!ok) throw Error(error); };

export async function deploymentIntent(input) {
  need(input && typeof input === 'object' && Object.keys(input).sort().join() ===
    'draft,executionVersion,migrationAuthorityPublicKey', 'Only canonical deployment intent is accepted');
  need(input.executionVersion === execution.sha256 && hexHash(input.migrationAuthorityPublicKey)
    && !/^0+$/.test(input.migrationAuthorityPublicKey), 'Wrong execution version or migration authority key');
  const draft = configuration(input.draft);
  need(draft.mode === 'launchpad' && validate(draft).valid && !draft.metadata.logo.startsWith('data:'), 'Invalid Generation 2 draft');
  const fingerprint = await configurationFingerprint(draft);
  const creator = address(draft.metadata.creator);
  const configurationParams = {
    creator, projectId: draft.id,
    metadata: {
      name: draft.metadata.name.trim(), symbol: draft.metadata.symbol,
      description: draft.metadata.description,
      ...(draft.metadata.logo ? {image: draft.metadata.logo} : {}),
      anlgram_configuration_fingerprint: fingerprint,
      anlgram_execution_version: execution.sha256
    },
    operationId: String(BigInt('0x' + fingerprint.slice(0, 15)) || 1n),
    percent: Number(draft.lp.percent),
    duration: {'180': 'days180', '365': 'days365', permanent: 'permanent'}[draft.lp.duration],
    beneficiary: address(draft.lp.beneficiary),
    unlockedController: Number(draft.lp.percent) < 100 ? address(draft.lp.controller) : creator,
    migrationAuthorityPublicKey: input.migrationAuthorityPublicKey
  };
  const candidate = dispatch.build(core, configurationParams);
  return {
    candidate,
    record: {
      network: '-3', generation: 2, executionVersion: execution.sha256, configurationFingerprint: fingerprint,
      project: candidate.addresses.minter.toRawString(), migrator: candidate.addresses.migration.toRawString(),
      operationId: configurationParams.operationId, configuration: configurationParams,
      stateInitHash: hash(stateInit(candidate.states.migration)), codeHash: hash(candidate.states.migration.code)
    },
    input: {draft, executionVersion: execution.sha256, migrationAuthorityPublicKey: input.migrationAuthorityPublicKey}
  };
}

function active(bundle, expected) {
  const s = includedAccountCell(bundle).beginParse();
  need(s.loadBit(), 'Account not active');
  const account = core.loadAccount(s);
  s.endParse();
  const state = account.storage.state;
  need(state.type === 'active' && state.state.code && state.state.data &&
    (!expected || state.state.code.equals(expected)), 'Unexpected active code');
  return state.state;
}

function success(tx) {
  const d = tx.description;
  return d.type === 'generic' && !d.aborted && d.computePhase.type === 'vm' &&
    d.computePhase.success && d.computePhase.exitCode === 0 &&
    (!d.actionPhase || (d.actionPhase.success && d.actionPhase.resultCode === 0 && d.actionPhase.skippedActions === 0));
}

export function deploymentEdge(destination, init, owner, ownerState, ownerRows, targetRows) {
  const target = targetRows.find(({tx}) => ['uninitialized', 'non-existing'].includes(tx.oldStatus)
    && tx.endStatus === 'active' && success(tx));
  const incoming = target?.tx.inMessage;
  need(incoming?.info.type === 'internal' && !incoming.info.bounced && incoming.info.src.equals(owner)
    && incoming.info.dest.equals(destination) && incoming.info.value.coins > 0n && incoming.body.equals(core.Cell.EMPTY)
    && incoming.init && stateInit(incoming.init).equals(stateInit(init)), 'Exact deployment transaction unavailable');
  const edge = messageHash(incoming);
  const source = ownerRows.find(({tx}) => success(tx) && tx.outMessages.size === 1 &&
    [...tx.outMessages.values()].some(message => messageHash(message) === edge));
  const external = source?.tx.inMessage;
  need(external?.info.type === 'external-in' && external.info.dest.equals(owner) && !external.init &&
    target.tx.lt > source.tx.lt && target.tx.now >= source.tx.now, 'Authenticated V5 deployment source unavailable');
  const data = ownerState.data.beginParse();
  data.skip(33);
  const walletId = data.loadInt(32), publicKey = data.loadBuffer(32).toString('hex');
  const signed = external.body.beginParse();
  signed.skip(64);
  const expiry = signed.loadUint(32), seqno = signed.loadUint(32);
  need(source.tx.now < expiry, 'Deployment message expired');
  const checked = receipt.verifySignedBody(external.body.toBoc().toString('base64'), {
    network: '-3', walletId, seqno, operator: owner.toRawString(), publicKey, walletCodeHash: hash(ownerState.code),
    message: {
      address: destination.toString({bounceable: incoming.info.bounce, testOnly: true}),
      amount: String(incoming.info.value.coins), payload: incoming.body.toBoc().toString('base64'),
      stateInit: stateInit(init).toBoc().toString('base64')
    }
  }, expiry);
  return {
    address: destination.toRawString(), stateInitHash: hash(stateInit(init)), codeHash: hash(init.code),
    sourceTransactionHash: source.hash, sourceTransactionLt: String(source.tx.lt),
    transactionHash: target.hash, transactionLt: String(target.tx.lt), signedBodyHash: checked.bodyHash,
    messageHash: edge
  };
}

export async function acquireRegistration(intent, providers) {
  const {candidate: c, record} = intent;
  const migration = await providers.account(record.migrator);
  const roles = ['minter', 'curve', 'migration'];
  const [owner, ...targets] = await Promise.all([
    providers.account(c.operator.toRawString(), migration.reference),
    ...roles.map(role => role === 'migration' ? migration : providers.account(c.addresses[role].toRawString(), migration.reference))
  ]);
  const ownerState = active(owner);
  const ownerHistory = await providers.history(c.operator.toRawString(), owner);
  const receipts = await Promise.all(roles.map(async (role, index) => {
    active(targets[index], c.states[role].code);
    const target = await providers.history(c.addresses[role].toRawString(), targets[index]);
    return [role, deploymentEdge(c.addresses[role], c.states[role], c.operator, ownerState, ownerHistory.rows, target.rows)];
  }));
  return {
    ...provenance, scope: 'VERIFIED_DEPLOYMENT_INCLUSION_RELATIVE_TO_PROVIDER_REFERENCE',
    reference: migration.reference, receipts: Object.fromEntries(receipts)
  };
}
