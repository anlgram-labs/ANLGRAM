import * as core from '@ton/core';
import {lpEvidencePolicy, verifyProvenLpEvidence} from './lp-evidence.mjs';
import {includedAccountCell} from './project-providers.mjs';
import {hash, stateInit} from './project-registration.mjs';

const b64 = cell => cell.toBoc().toString('base64');
const messageHash = message => hash(core.beginCell().store(core.storeMessage(message)).endCell());

export async function acquireLpIssuance(candidate, providers, reference, previousReference) {
  const policy = lpEvidencePolicy(b64(stateInit(candidate.vault.init)));
  const pool = policy.pool.toRawString(), wallet = policy.lpWallet.toRawString();
  const [p, w] = await Promise.all([pool, wallet].map(async address =>
    providers.history(address, await providers.account(address, reference))));
  const transfer = w.rows.find(({tx}) => {
    const m = tx.inMessage;
    if (m?.info.type !== 'internal' || m.info.bounced || !m.info.src.equals(policy.pool) || m.body.bits.length < 96) return false;
    const s = m.body.beginParse();
    return s.loadUint(32) === 0x178d4519 && s.loadUintBig(64) === policy.q;
  });
  if (!transfer) return null;
  const incomingHash = messageHash(transfer.tx.inMessage);
  const issuance = p.rows.find(({tx}) => [...tx.outMessages.values()].some(m => messageHash(m) === incomingHash));
  if (!issuance) return null;

  const roles = [[pool, p, issuance], [wallet, w, transfer]];
  const cells = [new Map(), new Map()];
  const collect = (i, cell) => cells[i].set(hash(cell), b64(cell));
  for (const [i, [, bundle]] of roles.entries()) collect(i, includedAccountCell(bundle));
  // An absent Account has a fixed serialization. Its hash must still match
  // the included transaction's old state hash and pass the LP verifier.
  collect(1, core.beginCell().storeBit(false).endCell());
  const snapshots = () => roles.map(([, , {tx}], i) => ({
    before: cells[i].get(tx.stateUpdate.oldHash.toString('hex')),
    after: cells[i].get(tx.stateUpdate.newHash.toString('hex'))
  }));
  const complete = () => snapshots().every(s => s.before && s.after);
  const prior = [...new Set([reference.seqno - 1, reference.seqno - 2, previousReference?.seqno])]
    .filter(n => n > 0 && n < reference.seqno);
  for (const seqno of prior) {
    if (complete()) break;
    const at = await providers.reference(seqno);
    await Promise.all(snapshots().map(async (state, i) => {
      if (state.before && state.after) return;
      try { collect(i, includedAccountCell(await providers.account(roles[i][0], at))); }
      catch (error) { if (error.retryMs !== undefined) throw error; }
    }));
  }
  if (!complete()) return null;
  const [poolState, walletState] = snapshots();
  return verifyProvenLpEvidence(policy, 'issuance', {
    pool: poolState, wallet: walletState, poolTransaction: b64(issuance.cell), walletTransaction: b64(transfer.cell)
  }, {pool: p, wallet: w});
}
