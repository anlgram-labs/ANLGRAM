import * as core from '@ton/core';
import {configuration} from '../wizard/preparation-model.mjs';
import {includedAccountCell, provenance} from './project-providers.mjs';
import {prepareStandardTestnetRelease, standardDeploymentIdentity, verifyStandardDeploymentFields} from './standard-testnet-release.mjs';

export async function standardRegistrationIntent(input) {
  if (Object.keys(input).sort().join() !== 'draft,projectType,publicKey,quote' || input.projectType !== 'STANDARD_V2') {
    throw Error('Invalid Standard registration intent');
  }
  const manifest = await prepareStandardTestnetRelease(input.draft, input.publicKey);
  const {seqno, validUntil, referenceRootHash, modeledSenderFeeNano, ownerPolicyCeilingNano} = input.quote;
  const quote = {seqno, validUntil, referenceRootHash, modeledSenderFeeNano, ownerPolicyCeilingNano};
  const identity = await standardDeploymentIdentity(manifest, quote, validUntil - 1);
  return {manifest, identity, input: {projectType:'STANDARD_V2', draft:configuration(input.draft), publicKey:input.publicKey, quote}};
}

export function includedActiveState(bundle, codeHash) {
  const s = includedAccountCell(bundle).beginParse();
  if (!s.loadBit()) throw Error('Active account required');
  const account = core.loadAccount(s);
  s.endParse();
  const state = account.storage.state;
  if (state.type !== 'active' || state.state.code?.hash().toString('hex') !== codeHash || !state.state.data) {
    throw Error('Unexpected active account code');
  }
  return {state:state.state, balance:account.storage.balance.coins};
}

export async function acquireStandardRegistration(intent, providers) {
  const {manifest, identity} = intent;
  const target = await providers.account(manifest.minter.raw);
  const source = await providers.account(manifest.operator.address, target.reference);
  includedActiveState(target, manifest.minter.codeHash);
  const owner = includedActiveState(source, manifest.operator.codeHash);
  const [wallet, minter] = await Promise.all([
    providers.history(manifest.operator.address, source), providers.history(manifest.minter.raw, target)
  ]);
  return {...provenance, reference:target.reference, fingerprint:identity.fingerprint,
    deployment:verifyStandardDeploymentFields(manifest, identity, owner.state, wallet.rows, minter.rows)};
}

export function standardStatus(intent, evidence) {
  const {manifest, identity} = intent;
  return {schema:2, network:'-3', projectType:'STANDARD_V2', scope:'STANDARD_DEPLOYMENT_REFERENCE_RELATIVE_READ_ONLY',
    configurationFingerprint:manifest.configurationFingerprint, status:null,
    unavailableReason:'STANDARD_JETTON_HAS_NO_LAUNCHPAD_MIGRATION',
    deployment:{address:manifest.minter.raw, fingerprint:identity.fingerprint, evidence},
    financialSigningEnabled:false, broadcastingEnabled:false, migrationAuthorized:false, withdrawalsEnabled:false};
}
