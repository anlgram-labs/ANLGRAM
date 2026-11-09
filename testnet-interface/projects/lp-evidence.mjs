// Internal/offline adapter, not an HTTP receipt submission or signing service.
// Reuses the existing account inclusion and raw history verification. Field
// matching alone is NOT provider provenance, validator finality or a locker ack.
import * as core from '@ton/core';
import {verifyAccountInclusion} from '../recovery/account-proof.mjs';
import {matchHistory} from '../recovery/receipts.mjs';
import {code} from './artifacts.mjs';
import ston from '../../minter-contract/scripts/stonfi-v22-addresses.js';

const need=(v,m)=>{if(!v)throw Error(m);};
const hash=c=>c.hash().toString('hex');
const equal=(a,b)=>a?.equals(b)===true;
const included=new WeakSet();
export const isIncludedLpEvidence=value=>!!value&&included.has(value);
export const rememberLpEvidence=value=>{included.add(value);return value;};
function cell(boc){need(typeof boc==='string'&&boc.length>0&&boc.length<524288,'Bounded raw BOC required');const roots=core.Cell.fromBoc(Buffer.from(boc,'base64'));need(roots.length===1&&!roots[0].isExotic,'One ordinary root required');return roots[0];}
function transaction(boc,address){const c=cell(boc),s=c.beginParse(),t=core.loadTransaction(s);s.endParse();need(address.workChain===0&&t.address===BigInt('0x'+address.hash.toString('hex')),'Wrong transaction account');return{cell:c,tx:t};}
function success(t){const d=t.description;need(d.type==='generic'&&!d.aborted&&d.computePhase.type==='vm'&&d.computePhase.success&&d.computePhase.exitCode===0&&(!d.actionPhase||(d.actionPhase.success&&d.actionPhase.resultCode===0&&d.actionPhase.skippedActions===0)),'Successful execution required');}
function account(boc,address){const c=cell(boc),s=c.beginParse();if(!s.loadBit()){s.endParse();return{cell:c,absent:true};}const a=core.loadAccount(s);s.endParse();need(equal(a.addr,address),'Wrong Account address');return{cell:c,account:a,absent:false};}
function active(a,expectedCode){need(!a.absent&&a.account.storage.state.type==='active','Active Account required');const state=a.account.storage.state.state;need(state.code&&state.data&&hash(state.code)===hash(expectedCode),'Pinned execution code mismatch');return state.data;}
function states(raw,address,tx,expectedCode){const before=account(raw.before,address),after=account(raw.after,address);need(hash(before.cell)===tx.stateUpdate.oldHash.toString('hex')&&hash(after.cell)===tx.stateUpdate.newHash.toString('hex'),'Account states not bound to transaction');if(!before.absent&&before.account.storage.state.type==='active')active(before,expectedCode);active(after,expectedCode);return{before,after};}
function wallet(a,owner,master,expectedCode){if(a.absent||a.account.storage.state.type==='uninit')return 0n;if(a.account.storage.state.type==='frozen'){const initial={code:expectedCode,data:core.beginCell().storeCoins(0).storeAddress(owner).storeAddress(master).storeRef(expectedCode).endCell()},expected=core.beginCell().store(core.storeStateInit(initial)).endCell().hash().toString('hex');need(a.account.storage.state.stateHash.toString(16).padStart(64,'0')===expected,'Frozen wallet is not canonical zero-balance StateInit');return 0n;}const s=active(a,expectedCode).beginParse(),n=s.loadCoins();need(equal(s.loadAddress(),owner)&&equal(s.loadAddress(),master)&&equal(s.loadRef(),expectedCode),'Wrong Jetton master/owner/code');s.endParse();return n;}
function internal(m,source,destination){need(m?.info.type==='internal'&&!m.info.bounced&&equal(m.info.src,source)&&equal(m.info.dest,destination),'Wrong internal sender/destination or bounce');return m.body.beginParse();}
function edge(parent,child){need(child.inMessage?.info.type==='internal','Internal child required');const h=hash(core.beginCell().store(core.storeMessage(child.inMessage)).endCell());need(Array.from(parent.outMessages.values()).filter(m=>hash(core.beginCell().store(core.storeMessage(m)).endCell())===h).length===1,'Missing exact parent-to-child message');need(child.lt>parent.lt,'Invalid message logical-time order');}
function transfer(s,op,q){need(s.loadUint(32)===op&&s.loadUintBig(64)===q,'Wrong operation/query ID');return s.loadCoins();}
function result(fields){return{...fields,scope:'RAW_TRANSACTION_FIELDS_ONLY_REQUIRES_PROVENANCE',providerInclusionVerified:false,validatorFinalityVerified:false,migrationAttributionVerified:false,contractReceiptAccepted:false,operationCompleted:false,migrationAuthorized:false,financialSigningEnabled:false};}

// The expected policy is derived from the exact pinned Locker V2 genesis, not
// caller-selected wallet/pool labels or API getter responses.
export function lpEvidencePolicy(stateInit){
 const si=cell(stateInit).beginParse(),init=core.loadStateInit(si);si.endParse();need(init.splitDepth==null&&init.special==null&&(!init.libraries||init.libraries.size===0),'Canonical Locker StateInit required');need(init.code&&init.data&&hash(init.code)===hash(code('anlgram-lp-locker-v2')),'Exact Locker V2 code required');
 const root=init.data.beginParse();need(root.loadUint(8)===2,'Locker version mismatch');const cfg=root.loadRef(),initial=root.loadRef();need(!root.loadMaybeRef()&&!root.loadMaybeRef(),'Genesis ledger must be empty');root.endParse();
 const zero=core.beginCell().storeCoins(0).storeCoins(0).storeCoins(0).storeCoins(0).storeBit(false).storeUint(0,64).storeUint(1,64).storeUint(0,64).endCell();need(initial.equals(zero),'Locker genesis accounting required');
 const c=cfg.beginParse(),percent=c.loadUint(7),duration=c.loadUint(32),q=c.loadUintBig(64),e=c.loadRef().beginParse(),p=c.loadRef().beginParse(),profile=c.loadRef();c.endParse();
 need(percent>=50&&percent<=100&&[0,15552000,31536000].includes(duration)&&q>0n&&q<(1n<<62n)&&profile.equals(ston.profileCell(core)),'Unsupported immutable terms/profile');
 const router=e.loadAddress(),w0=e.loadAddress(),w1=e.loadAddress();e.endParse();const beneficiary=p.loadAddress(),controller=p.loadAddress(),contributor=p.loadAddress();p.endParse();
 need([beneficiary,controller,contributor].every(a=>a.workChain===0),'Workchain zero required');const locker=core.contractAddress(0,init),derived=ston.derive(core,router,w0,w1,locker);
 return{locker,config:cfg,percent,duration,q,beneficiary,controller,contributor,...derived};
}

export function readLpIssuanceMessage(policy,message){
 const s=internal(message,policy.pool,policy.lpWallet),amount=transfer(s,0x178d4519,policy.q);
 need(amount>0n&&equal(s.loadAddress(),policy.contributor),'Wrong LP liquidity provider');
 s.loadMaybeAddress();need(s.loadCoins()>0n,'Operation payload forwarding required');const referenced=s.loadBit(),payload=referenced?s.loadRef().beginParse():s;if(referenced)s.endParse();need(payload.loadUint(32)===0x414c5632&&payload.loadUintBig(64)===policy.q,'Wrong immutable LP operation payload');payload.endParse();
 return amount;
}
export function verifyLpIssuanceFields(policy,raw){
 const pool=transaction(raw.poolTransaction,policy.pool),delivery=transaction(raw.walletTransaction,policy.lpWallet);success(pool.tx);success(delivery.tx);edge(pool.tx,delivery.tx);
 states(raw.pool,policy.pool,pool.tx,policy.poolInit.code);
 const w=states(raw.wallet,policy.lpWallet,delivery.tx,policy.lpInit.code),amount=readLpIssuanceMessage(policy,delivery.tx.inMessage);
 const before=wallet(w.before,policy.locker,policy.pool,policy.lpInit.code),after=wallet(w.after,policy.locker,policy.pool,policy.lpInit.code);need(after-before===amount,'LP issuance delta mismatch');
 return result({kind:'LP_ISSUANCE',operationId:policy.q.toString(),pool:policy.pool.toRawString(),locker:policy.locker.toRawString(),lpWallet:policy.lpWallet.toRawString(),amountUnits:amount.toString(),balanceBeforeUnits:before.toString(),balanceAfterUnits:after.toString(),poolTransactionHash:hash(pool.cell),poolTransactionLt:String(pool.tx.lt),walletTransactionLt:String(delivery.tx.lt),walletTransactionHash:hash(delivery.cell),firstNotificationRecovery:'EXACT_DELIVERY_FIELDS_ONLY_NO_CONTRACT_CREDIT',lockedAllocationUnits:null});
}

function vaultAccount(a,policy){const d=active(a,code('anlgram-lp-locker-v2')).beginParse();need(d.loadUint(8)===2&&d.loadRef().equals(policy.config),'Locker immutable configuration changed');const s=d.loadRef().beginParse(),fields={received:s.loadCoins(),locked:s.loadCoins(),free:s.loadCoins(),pending:s.loadCoins(),kind:s.loadBit(),pq:s.loadUintBig(64),next:s.loadUintBig(64),unlock:s.loadUintBig(64)};s.endParse();d.loadMaybeRef();fields.requests=d.loadDict(core.Dictionary.Keys.BigUint(64),{parse:s=>s.asCell(),serialize(){throw Error('Read only');}});d.endParse();return fields;}
export function verifyLpWithdrawalFields(policy,raw){
 const claim=transaction(raw.lockerTransaction,policy.locker),sender=transaction(raw.walletTransaction,policy.lpWallet);success(claim.tx);success(sender.tx);edge(claim.tx,sender.tx);
 const v=states(raw.locker,policy.locker,claim.tx,code('anlgram-lp-locker-v2')),before=vaultAccount(v.before,policy),after=vaultAccount(v.after,policy);
 const msg=claim.tx.inMessage;need(msg?.info.type==='internal'&&!msg.info.bounced&&equal(msg.info.dest,policy.locker),'Authenticated claim required');const s=msg.body.beginParse();need(s.loadUint(32)===0x414c5633,'Not an LP claim');const q=s.loadUintBig(64),locked=s.loadBit(),amount=s.loadCoins();s.endParse();
 const recipient=locked?policy.beneficiary:policy.controller;need(equal(msg.info.src,recipient)&&q===before.next&&amount>0n,'Wrong claimant, query or amount');
 need(!before.requests.has(q),'Withdrawal query already requested');const request=after.requests.get(q)?.beginParse();need(request&&request.loadCoins()===amount&&request.loadBit()===locked,'Exact persistent withdrawal request required');request.endParse();
 need(!locked||(policy.duration!==0&&before.unlock>0n&&BigInt(claim.tx.now)>=before.unlock),'Permanent/premature withdrawal');
 need(before.received===after.received&&after.locked===before.locked-(locked?amount:0n)&&after.free===before.free-(locked?0n:amount)&&after.pending===before.pending+amount&&after.next===q+1n&&after.pq===q&&after.kind===locked&&after.unlock===before.unlock,'Locker withdrawal accounting mismatch');
 const ws=internal(sender.tx.inMessage,policy.locker,policy.lpWallet);need(transfer(ws,0x0f8a7ea5,q)===amount&&equal(ws.loadAddress(),recipient),'Wrong wallet transfer');
 const recipientInit={code:policy.lpInit.code,data:core.beginCell().storeCoins(0).storeAddress(recipient).storeAddress(policy.pool).storeRef(policy.lpInit.code).endCell()},destination=core.contractAddress(0,recipientInit),received=transaction(raw.recipientTransaction,destination);success(received.tx);edge(sender.tx,received.tx);
 const rs=internal(received.tx.inMessage,policy.lpWallet,destination);need(transfer(rs,0x178d4519,q)===amount&&equal(rs.loadAddress(),policy.locker),'Wrong final delivery');
 const own=states(raw.wallet,policy.lpWallet,sender.tx,policy.lpInit.code),dest=states(raw.recipient,destination,received.tx,policy.lpInit.code);
 need(wallet(own.before,policy.locker,policy.pool,policy.lpInit.code)-wallet(own.after,policy.locker,policy.pool,policy.lpInit.code)===amount,'Sender LP debit mismatch');
 need(wallet(dest.after,recipient,policy.pool,policy.lpInit.code)-wallet(dest.before,recipient,policy.pool,policy.lpInit.code)===amount,'Recipient LP credit mismatch');
 return result({kind:'LP_WITHDRAWAL_DELIVERY',operationId:policy.q.toString(),withdrawalQueryId:q.toString(),amountUnits:amount.toString(),recipient:recipient.toRawString(),recipientWallet:destination.toRawString(),lockedPrincipal:locked,locker:policy.locker.toRawString(),pool:policy.pool.toRawString(),lpWallet:policy.lpWallet.toRawString(),lockerTransactionHash:hash(claim.cell),lockerTransactionLt:String(claim.tx.lt),walletTransactionHash:hash(sender.cell),walletTransactionLt:String(sender.tx.lt),recipientTransactionHash:hash(received.cell),recipientTransactionLt:String(received.tx.lt),persistentRequestMatched:true,contractPendingMustRemain:true,newAttemptAuthorized:false});
}

// Only an immediate authenticated bounce of the original LP-wallet request can
// restore the contract's available principal. A downstream recipient bounce or
// absent notification is NOT this evidence and never permits a refund/retry.
export function verifyLpWithdrawalBounceFields(policy,raw){
 const failed=transaction(raw.walletTransaction,policy.lpWallet),recovery=transaction(raw.lockerTransaction,policy.locker);success(recovery.tx);edge(failed.tx,recovery.tx);
 need(failed.tx.description.type==='generic'&&failed.tx.description.aborted&&failed.tx.description.bouncePhase?.type==='ok','Immediate wallet failure/bounce required');
 const m=recovery.tx.inMessage;need(m?.info.type==='internal'&&m.info.bounced&&equal(m.info.src,policy.lpWallet)&&equal(m.info.dest,policy.locker),'Wrong recovery bounce sender');
 const s=m.body.beginParse();need(s.loadUint(32)===0xffffffff&&s.loadUint(32)===0x0f8a7ea5,'Not an original withdrawal bounce');const q=s.loadUintBig(64),amount=s.loadCoins();need(amount>0n,'Positive bounced amount required');
 const v=states(raw.locker,policy.locker,recovery.tx,code('anlgram-lp-locker-v2')),before=vaultAccount(v.before,policy),after=vaultAccount(v.after,policy),request=before.requests.get(q)?.beginParse();need(request&&request.loadCoins()===amount,'Missing exact pending request');const locked=request.loadBit();request.endParse();need(!after.requests.has(q),'Request not removed after recovery');
 const original=internal(failed.tx.inMessage,policy.locker,policy.lpWallet);need(transfer(original,0x0f8a7ea5,q)===amount&&equal(original.loadAddress(),locked?policy.beneficiary:policy.controller),'Unrelated original wallet request');
 need(after.received===before.received&&after.next===before.next&&after.pending===before.pending-amount&&after.locked===before.locked+(locked?amount:0n)&&after.free===before.free+(locked?0n:amount)&&after.unlock===before.unlock,'Bounce restoration accounting mismatch');
 return result({kind:'LP_WITHDRAWAL_IMMEDIATE_BOUNCE',operationId:policy.q.toString(),withdrawalQueryId:q.toString(),amountUnits:amount.toString(),lockedPrincipal:locked,locker:policy.locker.toRawString(),pool:policy.pool.toRawString(),lpWallet:policy.lpWallet.toRawString(),lockerTransactionHash:hash(recovery.cell),lockerTransactionLt:String(recovery.tx.lt),walletTransactionHash:hash(failed.cell),walletTransactionLt:String(failed.tx.lt),persistentRequestMatched:true,contractPrincipalRestoredFields:true,contractPendingMustRemain:after.pending>0n,deliveryVerified:false,newAttemptAuthorized:false});
}

// Internal server-acquired bundles only. Reuses inclusion + independent raw
// history matching; no flags supplied by an indexer are accepted as proof.
// Even this proof is relative to provider reference hashes, NOT validator quorum.
export function verifyProvenLpEvidence(policy,kind,raw,checkpoints){
 need(['issuance','withdrawal','withdrawalBounce'].includes(kind),'Unsupported evidence kind');
 const roles=kind==='issuance'?['pool','wallet']:kind==='withdrawal'?['locker','wallet','recipient']:['locker','wallet'];
 const fields=kind==='issuance'?verifyLpIssuanceFields(policy,raw):kind==='withdrawal'?verifyLpWithdrawalFields(policy,raw):verifyLpWithdrawalBounceFields(policy,raw);
 const addresses={pool:policy.pool,locker:policy.locker,wallet:policy.lpWallet,recipient:fields.recipientWallet?core.Address.parse(fields.recipientWallet):null};let reference;
 for(const role of roles){const cp=checkpoints?.[role];need(cp,'Missing authenticated checkpoint');const proof=verifyAccountInclusion(cp.raw,cp.reference,addresses[role].toRawString());
  const ref=JSON.stringify([proof.masterchainSeqno,proof.masterchainRootHash,proof.masterchainFileHash]);need(!reference||reference===ref,'Mixed masterchain references');reference=ref;
  const rows=matchHistory(cp.primary,cp.secondary,proof,addresses[role].toRawString()),txHash=fields[role==='locker'?'lockerTransactionHash':role==='recipient'?'recipientTransactionHash':role==='wallet'?'walletTransactionHash':'poolTransactionHash'];
  need(rows.some(r=>r.hash===txHash),'Receipt absent from included account history');
 }
 const verified=Object.freeze({...fields,scope:'ACCOUNT_INCLUSION_RELATIVE_TO_REFERENCE_NOT_PROVIDER_PROVENANCE_OR_VALIDATOR_FINALITY',referenceInclusionVerified:true,providerProvenanceVerified:false,reference});included.add(verified);return verified;
}
