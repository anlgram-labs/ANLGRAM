import * as core from '@ton/core';
import {lpEvidencePolicy, readLpIssuanceMessage, verifyProvenLpEvidence} from './lp-evidence.mjs';
import {includedAccountCell} from './project-providers.mjs';
import {hash, stateInit} from './project-registration.mjs';

const b64 = cell => cell.toBoc().toString('base64');
const messageHash = message => hash(core.beginCell().store(core.storeMessage(message)).endCell());
const history = async (providers,address,reference) => providers.history(address,await providers.account(address,reference));

export function selectLpDelivery(policy, rows) {
  const candidates = new Map();
  for (const row of rows) {
    try { readLpIssuanceMessage(policy, row.tx.inMessage); }
    catch { continue; }
    candidates.set(hash(row.cell), row);
  }
  return candidates.size === 1 ? candidates.values().next().value : null;
}

export function selectLpWithdrawalBounce(policy, lockerRows, walletRows) {
  const candidates = new Map();
  for (const failed of walletRows) {
    const {tx} = failed;
    const request = tx.inMessage;
    if (tx.description.type !== 'generic' || !tx.description.aborted ||
        tx.description.bouncePhase?.type !== 'ok' || request?.info.type !== 'internal' ||
        request.info.bounced || !request.info.src.equals(policy.locker) ||
        !request.info.dest.equals(policy.lpWallet) || request.body.bits.length < 96 ||
        request.body.beginParse().loadUint(32) !== 0x0f8a7ea5) continue;
    const bounces = [...tx.outMessages.values()].filter(message => message.info.type === 'internal' &&
      message.info.bounced && message.info.src.equals(policy.lpWallet) && message.info.dest.equals(policy.locker));
    if (bounces.length !== 1) continue;
    const bouncedHash = messageHash(bounces[0]);
    for (const recovery of lockerRows) {
      if (recovery.tx.inMessage && messageHash(recovery.tx.inMessage) === bouncedHash) {
        candidates.set(hash(recovery.cell), {failed,recovery});
      }
    }
  }
  return candidates.size === 1 ? candidates.values().next().value : null;
}

function matchingChild(rows,message) {
  const expected=messageHash(message),matches=new Map();
  for(const row of rows) if(row.tx.inMessage&&messageHash(row.tx.inMessage)===expected)matches.set(hash(row.cell),row);
  return matches.size===1?matches.values().next().value:null;
}

export function selectLpWithdrawalDelivery(policy, lockerRows, walletRows) {
  const candidates=new Map();
  for(const claim of lockerRows){
    const request=claim.tx.inMessage;
    if(request?.info.type!=='internal'||request.info.bounced||request.body.bits.length<97)continue;
    const body=request.body.beginParse();
    if(body.loadUint(32)!==0x414c5633)continue;
    const query=body.loadUintBig(64), owner=body.loadBit()?policy.beneficiary:policy.controller;
    if(!request.info.src.equals(owner))continue;
    const recipient=core.contractAddress(0,{code:policy.lpInit.code,data:core.beginCell().storeCoins(0)
      .storeAddress(owner).storeAddress(policy.pool).storeRef(policy.lpInit.code).endCell()});
    for(const transfer of claim.tx.outMessages.values()){
      if(transfer.info.type!=='internal'||transfer.info.bounced||!transfer.info.dest.equals(policy.lpWallet))continue;
      const sender=matchingChild(walletRows,transfer);
      if(!sender||sender.tx.description.type!=='generic'||sender.tx.description.aborted)continue;
      for(const delivery of sender.tx.outMessages.values()){
        if(delivery.info.type!=='internal'||delivery.info.bounced||!delivery.info.dest.equals(recipient)||delivery.body.bits.length<96)continue;
        const payload=delivery.body.beginParse();
        if(payload.loadUint(32)===0x178d4519&&payload.loadUintBig(64)===query){
          candidates.set(hash(claim.cell)+':'+messageHash(delivery),{claim,sender,recipient,delivery});
        }
      }
    }
  }
  return candidates.size===1?candidates.values().next().value:null;
}

async function accountSnapshots(roles, providers, reference, previousReference, allowAbsent = []) {
  const cells = roles.map(() => new Map());
  const collect = (i, cell) => cells[i].set(hash(cell), b64(cell));
  for (const [i, [, bundle]] of roles.entries()) collect(i, includedAccountCell(bundle));
  // The absent Account has a fixed serialization and must still match the
  // transaction state hash in the existing verifier.
  for (const i of allowAbsent) collect(i, core.beginCell().storeBit(false).endCell());
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
  return complete() ? snapshots() : null;
}

async function acquireLpIssuance(candidate, providers, reference, previousReference, walletHistory) {
  const policy = lpEvidencePolicy(b64(stateInit(candidate.vault.init)));
  const pool = policy.pool.toRawString(), wallet = policy.lpWallet.toRawString();
  const [p,w] = await Promise.all([history(providers,pool,reference),walletHistory]);
  const transfer = selectLpDelivery(policy, w.rows);
  if (!transfer) return null;
  const incomingHash = messageHash(transfer.tx.inMessage);
  const issuance = p.rows.find(({tx}) => [...tx.outMessages.values()].some(m => messageHash(m) === incomingHash));
  if (!issuance) return null;

  const states = await accountSnapshots([[pool,p,issuance],[wallet,w,transfer]], providers, reference, previousReference, [1]);
  if (!states) return null;
  const [poolState, walletState] = states;
  return verifyProvenLpEvidence(policy, 'issuance', {
    pool: poolState, wallet: walletState, poolTransaction: b64(issuance.cell), walletTransaction: b64(transfer.cell)
  }, {pool: p, wallet: w});
}

async function acquireLpWithdrawalBounce(candidate, providers, reference, previousReference, walletHistory, lockerHistory) {
  const policy = lpEvidencePolicy(b64(stateInit(candidate.vault.init)));
  const locker = policy.locker.toRawString(), wallet = policy.lpWallet.toRawString();
  const [l,w] = await Promise.all([lockerHistory,walletHistory]);
  const edge = selectLpWithdrawalBounce(policy,l.rows,w.rows);
  if (!edge) return null;
  const states = await accountSnapshots([[locker,l,edge.recovery]],providers,reference,previousReference);
  if (!states) return null;
  return verifyProvenLpEvidence(policy,'withdrawalBounce',{
    locker:states[0], lockerTransaction:b64(edge.recovery.cell),walletTransaction:b64(edge.failed.cell)
  },{locker:l,wallet:w});
}

async function acquireLpWithdrawalDelivery(candidate, providers, reference, previousReference, walletHistory, lockerHistory) {
  const policy=lpEvidencePolicy(b64(stateInit(candidate.vault.init)));
  const [l,w]=await Promise.all([lockerHistory,walletHistory]);
  const selected=selectLpWithdrawalDelivery(policy,l.rows,w.rows);
  if(!selected)return null;
  const {claim,sender,recipient,delivery}=selected;
  const r=await history(providers,recipient.toRawString(),reference);
  const child=matchingChild(r.rows,delivery);
  if(!child)return null;
  const snapshots=await accountSnapshots([[policy.locker.toRawString(),l,claim],
    [policy.lpWallet.toRawString(),w,sender],[recipient.toRawString(),r,child]],providers,reference,previousReference,[2]);
  if(!snapshots)return null;
  return verifyProvenLpEvidence(policy,'withdrawal',{
    locker:snapshots[0],wallet:snapshots[1],recipient:snapshots[2],lockerTransaction:b64(claim.cell),
    walletTransaction:b64(sender.cell),recipientTransaction:b64(child.cell)
  },{locker:l,wallet:w,recipient:r});
}

export function acquireLpObservations(candidate, providers, reference, previousReference, includeWithdrawal) {
  const walletHistory=history(providers,candidate.vault.lpWallet.toRawString(),reference);
  const reads=[acquireLpIssuance(candidate,providers,reference,previousReference,walletHistory)];
  if(includeWithdrawal){
    const lockerHistory=history(providers,candidate.vault.address.toRawString(),reference);
    reads.push(acquireLpWithdrawalBounce(candidate,providers,reference,previousReference,walletHistory,lockerHistory),
      acquireLpWithdrawalDelivery(candidate,providers,reference,previousReference,walletHistory,lockerHistory));
  }
  return Promise.allSettled(reads);
}
