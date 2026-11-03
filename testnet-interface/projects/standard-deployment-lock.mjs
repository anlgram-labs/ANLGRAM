import {prepareStandardTestnetRelease, standardDeploymentIdentity} from './standard-testnet-release.mjs';

// Server-only integration point for a future isolated supervisor. The
// constructor takes trusted server services, never browser-supplied callbacks.
// Keep the namespace keyed by operator, including across deploy candidates.
export class StandardDeploymentLock {
  constructor(storage, supervisor) {
    this.storage = storage;
    this.supervisor = supervisor;
  }

  async reserve(draft, publicKey, quote, approval) {
    const manifest = await prepareStandardTestnetRelease(draft, publicKey);
    if (await this.storage.get('standardDeployment')) throw Error('Standard deployment permanently reserved');
    const identity = await standardDeploymentIdentity(manifest, quote, Math.floor(Date.now() / 1000));
    const review = await this.supervisor.verifyOwnerApproval(approval, identity.fingerprint, manifest.operator.address);
    if (review !== true) throw Error('Exact owner authorization required');
    const live = await this.supervisor.verifyCurrentStateAndEmulation(manifest, quote, identity.fingerprint);
    const now = Math.floor(Date.now() / 1000);
    if (live?.network !== '-3' || live.operator !== manifest.operator.address ||
      live.walletId !== manifest.operator.walletId || live.walletCodeHash !== manifest.operator.codeHash ||
      live.seqno !== quote.seqno || live.destination !== manifest.minter.raw ||
      live.destinationState !== 'uninitialized' || live.referenceRootHash !== quote.referenceRootHash ||
      live.fingerprint !== identity.fingerprint || live.modeledSenderFeeNano !== quote.modeledSenderFeeNano ||
      live.emulationSucceeded !== true || live.noConcurrentOperation !== true ||
      !Number.isSafeInteger(live.proofExpiresAt) || live.proofExpiresAt <= now ||
      !Number.isSafeInteger(live.observedAt) || live.observedAt > now || now - live.observedAt > 15 ||
      typeof live.balanceNano !== 'string' || !/^\d{1,20}$/.test(live.balanceNano) ||
      BigInt(live.balanceNano) < BigInt(identity.modeledDebitNano) || now >= identity.validUntil) {
      throw Error('Fresh exact Testnet preflight required');
    }
    const operation = {identity, operator:manifest.operator.address, destination:manifest.minter.raw,
      state:'LOCKED_PENDING_RECONCILIATION', reservedAt:now};
    return this.storage.transaction(async txn => {
      if (await txn.get('standardDeployment')) throw Error('Standard deployment permanently reserved');
      if (Math.floor(Date.now() / 1000) >= Math.min(identity.validUntil, live.proofExpiresAt, live.observedAt + 16)) {
        throw Error('Preflight expired before reservation');
      }
      await txn.put('standardDeployment', operation);
      return operation;
    });
  }

  status() {
    return this.storage.get('standardDeployment');
  }

  async reconcile() {
    const operation = await this.status();
    if (!operation || operation.state !== 'LOCKED_PENDING_RECONCILIATION') return operation;
    const receipt = await this.supervisor.acquireAuthenticatedDeploymentReceipt(operation);
    if (!receipt || receipt.fingerprint !== operation.identity.fingerprint || receipt.deployment?.address !== operation.destination) return operation;
    return this.storage.transaction(async txn => {
      const current = await txn.get('standardDeployment');
      if (current.state !== 'LOCKED_PENDING_RECONCILIATION') return current;
      const updated = {...current, state:'DEPLOYMENT_INCLUDED_FINALITY_UNVERIFIED', receipt};
      await txn.put('standardDeployment', updated);
      return updated;
    });
  }
}
