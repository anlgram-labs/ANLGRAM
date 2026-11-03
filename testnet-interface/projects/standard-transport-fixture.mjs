import {standardOperatorStorage} from './standard-supervisor.mjs';
import {prepareStandardTestnetRelease} from './standard-testnet-release.mjs';

// No real signer or network transport is provided. The public application
// must not import this module. A future real adapter needs its own review.
export const standardTransportEnabled = false;

export async function exerciseStandardTransport(storage, mockWallet) {
  const attempt = await storage.transaction(async txn => {
    const operation = await txn.get('standardDeployment');
    const prepared = operation?.snapshot;
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
    return {transaction, fingerprint:operation.identity.fingerprint, expectedSeqno:operation.identity.seqno,publicKey};
  });
  let state = 'UNKNOWN';
  try {
    const result = await mockWallet(attempt.transaction, {fingerprint:attempt.fingerprint, expectedSeqno:attempt.expectedSeqno,publicKey:attempt.publicKey});
    if (result === 'MOCK_SUBMITTED') state = 'SUBMITTED';
    if (result === 'MOCK_REJECTED') state = 'FAILED';
  } catch { /* Ambiguous outcomes consume the reservation. */ }
  await storage.transaction(async txn => {
    const operation = await txn.get('standardDeployment');
    await txn.put('standardDeployment',{...operation,transport:state});
  });
  return {transport:state,financialSigningEnabled:false};
}

// Session encryption uses the pinned TON Connect SessionCrypto interface.
// The session and request-ID allocator belong to the isolated private bridge.
async function postBridge(transaction, session, fetcher) {
  const ttl = transaction.validUntil - Math.floor(Date.now()/1000);
  const [message] = transaction.messages;
  if (transaction.network !== '-3' || transaction.messages.length !== 1 || message.amount !== '50000000' ||
    ttl <= 0 || ttl > 60 || !/^[0-9a-f]{64}$/.test(session.crypto.sessionId) ||
    !/^[0-9a-f]{64}$/.test(session.walletBridgeKey)) throw Error('Invalid Standard bridge envelope');
  const url = new URL(session.bridgeUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Invalid private bridge URL');
  url.pathname = url.pathname.replace(/\/$/,'') + '/message';
  url.search = new URLSearchParams({client_id:session.crypto.sessionId,to:session.walletBridgeKey,ttl:String(ttl),topic:'sendTransaction'});
  const id = await session.allocateRpcId();
  if (typeof id !== 'string' || !/^\d{1,20}$/.test(id) ||
    transaction.validUntil <= Math.floor(Date.now()/1000)) throw Error('Invalid request ID or expired request');
  const rpc = {method:'sendTransaction',id,params:[JSON.stringify({network:'-3',from:transaction.from,
    valid_until:transaction.validUntil,messages:[message]})]};
  const body = Buffer.from(session.crypto.encrypt(JSON.stringify(rpc),Buffer.from(session.walletBridgeKey,'hex'))).toString('base64');
  await fetcher(url,{method:'POST',body,redirect:'manual',signal:AbortSignal.timeout(Math.min(5000,ttl*1000))});
  // HTTP status does not prove wallet delivery, signing or broadcast.
  return 'UNKNOWN';
}

export function exerciseStandardBridgePost(transaction,session,fetcher) {
  if (new URL(session.bridgeUrl).hostname !== 'bridge.invalid') throw Error('Fixture bridge URL required');
  return postBridge(transaction,session,fetcher);
}

export async function submitStandardDeployment(storage, operator, privateWalletBridge) {
  if (!standardTransportEnabled) throw Error('Real Standard transport is hard-disabled');
  return exerciseStandardTransport(standardOperatorStorage(storage,operator), async (transaction, context) => {
    const account = await privateWalletBridge.readAuthenticatedAccount();
    if (account?.network !== '-3' || account.address !== operator || account.publicKey !== context.publicKey ||
      account.walletId !== 2147483645 || account.seqno !== context.expectedSeqno ||
      transaction.validUntil <= Math.floor(Date.now()/1000)) throw Error('Private signing account changed');
    const session = await privateWalletBridge.readBoundSession();
    if (session.account?.chain !== '-3' || session.account.address !== operator ||
      session.account.publicKey !== context.publicKey) throw Error('Private bridge session changed');
    return postBridge(transaction,session,fetch);
  });
}
