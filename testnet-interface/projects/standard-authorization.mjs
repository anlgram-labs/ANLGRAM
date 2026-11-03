import {randomBytes,verify,createPublicKey,createHash} from 'node:crypto';
import {Address} from '@ton/core';

export const authorizationNonce = () => randomBytes(32).toString('hex');
export const standardApprovalDomain = 'testnet.anlgram.com';

export function standardSignDataPayload(manifest, identity, nonce) {
  const text = [
    'ANLGRAM Standard V2 deployment approval (off-chain)',
    'Domain: '+standardApprovalDomain,
    'Network: TON Testnet (-3)',
    'Wallet: '+manifest.operator.address,
    'Wallet public key: '+manifest.operator.publicKey,
    'V5R1 wallet ID: '+manifest.operator.walletId,
    'V5R1 code hash: '+manifest.operator.codeHash,
    'Minter: '+manifest.minter.raw,
    'Minter code hash: '+manifest.minter.codeHash,
    'Jetton wallet code hash: '+manifest.walletCodeHash,
    'StateInit hash: '+manifest.deployment.receiptExpectation.stateInitHash,
    'Attachment: 0.050 Testnet TON',
    'Modeled total debit (nanoTON): '+identity.modeledDebitNano,
    'Policy ceiling, not a guaranteed network cap (nanoTON): '+identity.ownerPolicyCeilingNano,
    'Fingerprint: '+identity.fingerprint,
    'Seqno: '+identity.seqno,
    'Expires (Unix seconds): '+identity.validUntil,
    'Single-use nonce: '+nonce
  ].join('\n');
  return {type:'text',text,network:'-3',from:manifest.operator.address};
}

export function supportsStandardSignData(session, operator) {
  return session?.account?.chain === '-3' && session.account.address === operator.address &&
    session.account.publicKey === operator.publicKey &&
    Array.isArray(session.device?.features) && session.device.features.some(feature =>
      feature?.name === 'SignData' && Array.isArray(feature.types) && feature.types.includes('text'));
}

const u32 = value => { const b=Buffer.alloc(4); b.writeUInt32BE(value); return b; };

export function verifyStandardApproval(approval, manifest, identity, nonce, now, preparedAt, session) {
  if (!supportsStandardSignData(session,manifest.operator) || !approval ||
    approval.domain !== standardApprovalDomain || approval.address !== manifest.operator.address ||
    !Number.isSafeInteger(preparedAt) || !Number.isSafeInteger(approval.timestamp) ||
    approval.timestamp < preparedAt || approval.timestamp > now || now >= identity.validUntil ||
    !/^[A-Za-z0-9+/]{86}==$/.test(approval.signature ?? '')) return false;
  const expected = standardSignDataPayload(manifest,identity,nonce);
  const payload = approval.payload;
  if (payload?.type !== 'text' || payload.text !== expected.text ||
    (payload.network !== undefined && payload.network !== expected.network) ||
    (payload.from !== undefined && payload.from !== expected.from)) return false;

  // The RPC envelope's network/from are not covered by the signature.
  // Network and wallet identity are repeated in the signed text.
  const address = Address.parseRaw(manifest.operator.address);
  const wc=Buffer.alloc(4), timestamp=Buffer.alloc(8);
  wc.writeInt32BE(address.workChain);
  timestamp.writeBigUInt64BE(BigInt(approval.timestamp));
  const domain=Buffer.from(standardApprovalDomain), bytes=Buffer.from(expected.text);
  const digest=createHash('sha256').update(Buffer.concat([
    Buffer.from([255,255]),Buffer.from('ton-connect/sign-data/'),wc,address.hash,
    u32(domain.length),domain,timestamp,Buffer.from('txt'),u32(bytes.length),bytes
  ])).digest();
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),
    Buffer.from(manifest.operator.publicKey,'hex')]),format:'der',type:'spki'});
  return verify(null,digest,key,Buffer.from(approval.signature,'base64'));
}
