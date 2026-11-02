import {WalletContractV5R1} from '@ton/ton/dist/wallets/v5r1/WalletContractV5R1.js';
import {Address,Cell,beginCell,contractAddress,loadStateInit} from '@ton/core';
import {createPolicy} from '../transaction-policy.mjs';
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import legacy from '../../docs/launchpad/curve-two-attempt-2026-11-01.json' with {type:'json'};
export const RECOVERY='ANLTEST_V5_NONCE_INVALIDATION_V1';
export const SUCCESSOR='ANLTEST_CURVE_SUCCESSOR_V1';
export const COMMENT='ANLGRAM TESTNET nonce invalidation; Curve #2 remains locked';
export const hash=c=>Cell.fromBase64(c).hash().toString('hex');
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
export function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x)}return x}
export const pinned=freeze({network:'-3',operator:candidate.wallet.raw,publicKey:candidate.wallet.publicKey,walletId:2147483645,walletCodeHash:candidate.wallet.codeHash,candidateSha256:legacy.candidateSha256,oldSeqno:1,oldOperation:legacy.operation,oldFingerprint:legacy.reviewedFingerprint,oldValidUntil:legacy.curveDeploymentOperation.validUntil,oldClaimedAt:legacy.curveDeploymentOperation.claimedAt,curve:candidate.dependentAccounts.curve.raw,curveMessage:structuredClone(candidate.smokePlan.steps[1].message),minterCodeHash:candidate.dependentAccounts.minter.codeHash,minterDataHash:candidate.dependentAccounts.minter.dataHash,minterAdmin:candidate.wallet.raw});
const exact=(x,fields)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==fields.length||fields.some(k=>!Object.hasOwn(x,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(x,k)||{},'value')))throw Error('Unexpected recovery transaction fields');};
export function operationPolicy(context,kind,observedSeqno){
 if(context.network!=='-3'||context.walletId!==2147483645||!Number.isSafeInteger(observedSeqno)||observedSeqno<1||observedSeqno>0xffffffff)throw Error('Invalid Testnet V5 context');
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(context.publicKey,'hex'),walletId:{networkGlobalId:-3}});if(wallet.address.toRawString()!==context.operator||wallet.init.code.hash().toString('hex')!==context.walletCodeHash)throw Error('Wallet address/code is not derived from approved key/context');
 if(kind===SUCCESSOR&&(observedSeqno<=context.oldSeqno||context.curveMessage.amount!=='100000000'||context.curveMessage.stateInit!==pinned.curveMessage.stateInit||context.curveMessage.payload!==pinned.curveMessage.payload||contractAddress(0,loadStateInit(Cell.fromBase64(context.curveMessage.stateInit).beginParse())).toRawString()!==context.curve||Address.parse(context.curveMessage.address).toRawString()!==context.curve))throw Error('Successor nonce or original Curve identity changed');
 if(![RECOVERY,SUCCESSOR].includes(kind))throw Error('Unknown recovery operation');
 if(kind===RECOVERY&&observedSeqno!==context.oldSeqno)throw Error('Recovery source nonce changed');
 const self={address:Address.parse(context.operator).toString({testOnly:true,bounceable:false}),amount:'10000000',payload:beginCell().storeUint(0,32).storeStringTail(COMMENT).endCell().toBoc().toString('base64')};
 const message=kind===RECOVERY?self:structuredClone(context.curveMessage);
 const intent=freeze({operation:kind,candidateSha256:context.candidateSha256,network:'-3',operator:context.operator,publicKey:context.publicKey,walletId:context.walletId,expectedSeqno:observedSeqno,maxValiditySeconds:90,message});
 // Reuse existing exact-message/expiry/fingerprint validation. The normalized
 // internal sentinel is never serialized to TON Connect (self-transfer has NO init).
 const base=createPolicy({...intent,message:{...message,stateInit:message.stateInit}},{pinSeqno:true});
 function normalized(tx){exact(tx,['network','from','validUntil','messages']);if(!Array.isArray(tx.messages)||tx.messages.length!==1||Object.keys(tx.messages).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(tx.messages,'0')||{},'value'))throw Error('Exactly one message');exact(tx.messages[0],Object.keys(message));return{network:tx.network,from:tx.from,validUntil:tx.validUntil,messages:[{...tx.messages[0],stateInit:tx.messages[0].stateInit}]};}
 return{intent,validateIntent:(tx,now)=>base.validateIntent(normalized(tx),now),fingerprint:async tx=>digest({protocol:'ANLGRAM_RECOVERY_PREPARATION_V1',ancestor:context.oldFingerprint,operation:kind,base:await base.fingerprint(normalized(tx))})};
}
export function parseWallet(context,source){
 if(source?.state!=='active'||hash(source.code)!==context.walletCodeHash||!/^\d+$/.test(source.balanceNano)||!/^[a-f0-9]{64}$/.test(source.lastTransactionHash||''))throw Error('Wrong source state/code/balance');
 const s=Cell.fromBase64(source.data).beginParse(),enabled=s.loadBit(),seqno=s.loadUint(32),walletId=s.loadUint(32),key=s.loadBuffer(32).toString('hex'),extensions=s.loadBit();s.endParse();
 if(!enabled||walletId!==context.walletId||key!==context.publicKey||extensions)throw Error('Unapproved V5 source identity/extensions');return seqno;
}
export function validateSnapshot(context,s,expectedSeqno,now=Date.now()){
 if(s?.network!=='-3'||!Number.isSafeInteger(s.observedAt)||s.observedAt>now||now-s.observedAt>15000)throw Error('Fresh Testnet observation required');
 if(now<=context.oldValidUntil*1000)throw Error('Original request is still inside its approved expiry');
 const l=s.originalLock;
 if(l?.operation!==context.oldOperation||l.state!=='LOCKED_PENDING_RECONCILIATION'||l.fingerprint!==context.oldFingerprint||l.validUntil!==context.oldValidUntil||l.claimedAt!==context.oldClaimedAt)throw Error('Original uncertain lock lineage changed');
 const seqno=parseWallet(context,s.source);if(expectedSeqno!==undefined&&seqno!==expectedSeqno)throw Error('Stale source seqno');
 if(s.curve?.state!=='uninitialized'||s.curve.code||s.curve.balanceNano!=='0')throw Error('Curve destination is no longer empty');
 if(s.minter?.state!=='active'||hash(s.minter.code)!==context.minterCodeHash||hash(s.minter.data)!==context.minterDataHash)throw Error('Minter lifecycle changed');
 const m=Cell.fromBase64(s.minter.data).beginParse();if(m.loadCoins()!==0n||m.loadAddressAny()?.toRawString()!==context.minterAdmin)throw Error('Minter supply/admin changed');
 return{seqno,codeHash:hash(s.source.code),dataHash:hash(s.source.data),balanceNano:s.source.balanceNano,lastTransactionHash:s.source.lastTransactionHash};
}
export function requireExecutionActivation(){throw Error('RECOVERY_DISABLED: independent review and separate authorization required');}
