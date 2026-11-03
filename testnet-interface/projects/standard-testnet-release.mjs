import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import execution from '../execution-version.json' with {type: 'json'};
import {pinned} from '../recovery/policy.mjs';
import {prepareProject} from './prepare.mjs';
import {standardCode} from './artifacts.mjs';
import {deploymentEdge, hash, hexHash, stateInit} from './project-registration.mjs';

export async function prepareStandardTestnetRelease(draft, publicKey) {
  if (draft?.mode !== 'standard' || draft.network !== '-3' || !hexHash(publicKey) || /^0+$/.test(publicKey)) {
    throw Error('Standard Jetton Testnet draft and V5 public key required');
  }
  const wallet = WalletContractV5R1.create({publicKey: Buffer.from(publicKey, 'hex'),
    walletId: {networkGlobalId: -3, context: {workchain: 0, walletVersion: 'v5r1', subwalletNumber: 0}}});
  const plan = await prepareProject(draft);
  if (plan.creator !== wallet.address.toRawString() || plan.creator === pinned.operator) {
    throw Error('A separate, matching Testnet V5 creator is required');
  }
  const [deployment, mint] = plan.operations;
  return {
    schema: 1, executionVersion: execution.sha256, network: '-3', configurationFingerprint: plan.configurationFingerprint,
    scope: 'OFFLINE_STANDARD_JETTON_TESTNET_RELEASE_CANDIDATE', financialSigningEnabled: false, broadcastingEnabled: false,
    operator: {address: plan.creator, walletId: 2147483645, codeHash: hash(wallet.init.code), publicKey},
    minter: plan.accounts.minter, walletCodeHash: hash(standardCode('standardWallet')),
    expectedMintUnits: plan.configuredSupplyUnits, creationCharge: plan.creationCharge,
    deployment: {...deployment, maxMessages: 1, maxAttempts: 1, maximumTotalDebitNano: null,
      gate: 'BLOCKED_PENDING_LIVE_PREFLIGHT_AND_EXACT_OWNER_APPROVAL'},
    mint: {...mint, maximumTotalDebitNano: null, gate: 'BLOCKED_PENDING_DEPLOYMENT_AND_MINT_DELIVERY_REVIEW'}
  };
}

// A quote identity binds the unsigned candidate to one prospective V5 request.
// It is neither an authorization nor a persistent dispatch lock.
export async function standardDeploymentIdentity(manifest, quote, now) {
  if (!Number.isSafeInteger(now) || !Number.isInteger(quote?.seqno) || quote.seqno < 1 || quote.seqno > 0xffffffff ||
    !Number.isInteger(quote.validUntil) || quote.validUntil > 0xffffffff ||
    quote.validUntil <= now || quote.validUntil > now + 60 ||
    !hexHash(quote.referenceRootHash) || ![quote.modeledSenderFeeNano, quote.ownerPolicyCeilingNano].every(
      value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value))) {
    throw Error('Fresh bounded deployment quote required');
  }
  const {address, amount, payload, stateInit: init} = manifest.deployment.message;
  const debit = BigInt(amount) + BigInt(quote.modeledSenderFeeNano);
  if (debit > BigInt(quote.ownerPolicyCeilingNano)) throw Error('Modeled debit exceeds owner policy ceiling');
  const digestInput = ['ANLGRAM_STANDARD_DEPLOY_TESTNET_V1', manifest.executionVersion, manifest.configurationFingerprint,
    manifest.network, manifest.operator.address, manifest.operator.walletId, address, amount, hash(core.Cell.fromBase64(payload)),
    hash(core.Cell.fromBase64(init)), quote.seqno, quote.validUntil, quote.referenceRootHash, quote.modeledSenderFeeNano, quote.ownerPolicyCeilingNano];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(digestInput)));
  return {fingerprint: Buffer.from(digest).toString('hex'), seqno: quote.seqno, validUntil: quote.validUntil,
    modeledDebitNano: String(debit), ownerPolicyCeilingNano: quote.ownerPolicyCeilingNano, maximumTotalDebitNano: null,
    financialSigningEnabled: false};
}

// The caller must first establish inclusion for both raw histories using the
// existing account proof and history adapters. This function authenticates
// operation fields and never labels provider inclusion as validator finality.
export function verifyStandardDeploymentFields(manifest, identity, ownerState, ownerRows, minterRows) {
  const {message} = manifest.deployment;
  const target = core.Address.parse(message.address), owner = core.Address.parse(manifest.operator.address);
  const init = core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse());
  if (manifest.network !== '-3' || owner.equals(core.Address.parse(pinned.operator)) || owner.workChain !== 0 ||
    !init.code?.equals(standardCode('standardMinter')) || !core.contractAddress(0, init).equals(target) ||
    hash(stateInit(init)) !== manifest.deployment.receiptExpectation.stateInitHash) throw Error('Wrong deployment identity');
  return {...deploymentEdge(target, init, owner, ownerState, ownerRows, minterRows, {
    amount: message.amount, seqno: identity.seqno, expiry: identity.validUntil,
    bounce: core.Address.parseFriendly(message.address).isBounceable
  }), scope: 'AUTHENTICATED_TRANSACTION_FIELDS_REQUIRE_PROVENANCE', validatorFinalityVerified: false,
  registrationAuthorized: false};
}
