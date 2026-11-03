import {prepareStandardTestnetRelease} from './standard-testnet-release.mjs';

// No real signer or network transport is provided. The public application
// must not import this module. A future real adapter needs its own review.
export const standardTransportEnabled = false;

export async function exerciseStandardTransport(storage, mockWallet) {
  const attempt = await storage.transaction(async txn => {
    const operation = await txn.get('standardDeployment');
    const prepared = await txn.get('standardPrepared');
    if (operation?.state !== 'LOCKED_PENDING_RECONCILIATION' || operation.transport ||
      operation.identity.validUntil <= Math.floor(Date.now()/1000) ||
      prepared?.identity.fingerprint !== operation.identity.fingerprint) throw Error('No unused Standard reservation');
    const {draft,publicKey} = prepared.input;
    const manifest = await prepareStandardTestnetRelease(draft,publicKey);
    if (manifest.operator.address !== operation.operator || manifest.minter.raw !== operation.destination ||
      manifest.deployment.message.amount !== '50000000') throw Error('Reservation envelope mismatch');
    const transaction = {network:'-3',from:operation.operator,validUntil:operation.identity.validUntil,
      messages:[manifest.deployment.message]};
    await txn.put('standardDeployment',{...operation,transport:'UNKNOWN'});
    return transaction;
  });
  let state = 'UNKNOWN';
  try {
    const result = await mockWallet(attempt);
    if (result === 'MOCK_SUBMITTED') state = 'SUBMITTED';
    if (result === 'MOCK_REJECTED') state = 'FAILED';
  } catch { /* Ambiguous outcomes consume the reservation. */ }
  await storage.transaction(async txn => {
    const operation = await txn.get('standardDeployment');
    await txn.put('standardDeployment',{...operation,transport:state});
  });
  return {transport:state,financialSigningEnabled:false};
}
