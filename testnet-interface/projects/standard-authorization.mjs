import {randomBytes,verify,createPublicKey} from 'node:crypto';

export const authorizationNonce = () => randomBytes(32).toString('hex');

export function standardApprovalBytes(manifest, identity, nonce) {
  return Buffer.from(JSON.stringify(['ANLGRAM_PRIVATE_STANDARD_V2_APPROVAL_V1','testnet.anlgram.com','-3',
    manifest.operator.address,manifest.operator.publicKey,manifest.operator.walletId,manifest.operator.codeHash,
    manifest.minter.raw,manifest.minter.codeHash,manifest.walletCodeHash,
    manifest.deployment.receiptExpectation.stateInitHash,identity.fingerprint,'50000000',
    identity.seqno,identity.validUntil,nonce]),'utf8');
}

// This separate off-chain approval proves control of the V5 key. Its
// domain-separated bytes cannot be interpreted as a wallet transfer.
export function verifyStandardApproval(approval, manifest, identity, nonce, now) {
  if (!approval || approval.nonce !== nonce || identity.validUntil <= now ||
    !/^[0-9a-f]{128}$/.test(approval.signature ?? '')) return false;
  const key = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),
    Buffer.from(manifest.operator.publicKey,'hex')]),format:'der',type:'spki'});
  return verify(null,standardApprovalBytes(manifest,identity,nonce),key,Buffer.from(approval.signature,'hex'));
}
