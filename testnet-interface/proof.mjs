import { Buffer } from 'node:buffer';
import { Address, Cell, contractAddress, loadStateInit } from '@ton/core';
import { OPERATOR, PUBLIC_KEY, V5_CODE, CHAIN, TTL } from './config.mjs';

// Narrow fixed-key V5R1 allowlist. No untrusted public-key getter or API fallback.
export function walletIdentity(account) {
  if (account?.chain !== CHAIN || account.address !== OPERATOR) throw new Error('Wrong network/operator');
  if (typeof account.walletStateInit !== 'string' || account.walletStateInit.length > 16000) throw new Error('Invalid StateInit');
  const roots = Cell.fromBoc(Buffer.from(account.walletStateInit, 'base64'));
  if (roots.length !== 1) throw new Error('Invalid StateInit roots');
  const slice = roots[0].beginParse(), init = loadStateInit(slice);
  if (slice.remainingBits || slice.remainingRefs || init.special || init.splitDepth != null || init.libraries?.size) throw new Error('Unexpected StateInit fields');
  if (!init.code || !init.data || init.code.hash().toString('hex') !== V5_CODE) throw new Error('Unsupported wallet');
  if (!contractAddress(0, init).equals(Address.parseRaw(OPERATOR))) throw new Error('Address mismatch');
  const data = init.data.beginParse();
  if (!data.loadBit() || data.loadUint(32) !== 0 || data.loadInt(32) !== 2147483645) throw new Error('Unexpected V5 signature flag/nonce/network id');
  const key = data.loadBuffer(32);
  if (data.loadBit() || data.remainingBits || data.remainingRefs) throw new Error('Unexpected wallet plugins/data');
  if (key.toString('hex') !== PUBLIC_KEY || (account.publicKey !== undefined && account.publicKey.toLowerCase() !== PUBLIC_KEY)) throw new Error('Public key mismatch');
  return key;
}

export async function proofDigest(address, proof) {
  const a = Address.parseRaw(address), domain = Buffer.from(proof.domain.value, 'utf8');
  const wc = Buffer.alloc(4), dl = Buffer.alloc(4), ts = Buffer.alloc(8);
  wc.writeInt32BE(a.workChain); dl.writeUInt32LE(domain.length); ts.writeBigUInt64LE(BigInt(proof.timestamp));
  const message = Buffer.concat([Buffer.from('ton-proof-item-v2/'), wc, a.hash, dl, domain, ts, Buffer.from(proof.payload)]);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', message));
  return crypto.subtle.digest('SHA-256', Buffer.concat([Buffer.from([255,255]), Buffer.from('ton-connect'), hash]));
}

export async function verifySignature(key, signature, digest) {
  const pk = await crypto.subtle.importKey('raw', key, {name:'Ed25519'}, false, ['verify']);
  return crypto.subtle.verify('Ed25519', pk, signature, digest);
}

export async function verifyProof(body, challenge, domain, now = Math.floor(Date.now()/1000)) {
  try {
    if (!challenge || challenge.expiresAt <= now || challenge.used) return false;
    const p = body?.proof, key = walletIdentity(body?.account);
    if (!p || p.payload !== challenge.payload || !/^[a-f0-9]{64}$/.test(p.payload)) return false;
    const timestamp = typeof p.timestamp === 'string' && /^\d+$/.test(p.timestamp) ? Number(p.timestamp) : p.timestamp;
    if (!Number.isSafeInteger(timestamp) || timestamp < challenge.createdAt - 30 || timestamp > now + 30 || now - timestamp > TTL) return false;
    if (p.domain?.value !== domain || p.domain.lengthBytes !== Buffer.byteLength(domain)) return false;
    if (typeof p.signature !== 'string') return false;
    const signature = Buffer.from(p.signature, 'base64');
    if (signature.length !== 64 || signature.toString('base64') !== p.signature) return false;
    return verifySignature(key, signature, await proofDigest(OPERATOR, {...p,timestamp}));
  } catch { return false; }
}
