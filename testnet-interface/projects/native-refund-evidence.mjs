import {Address,Cell,loadAccount,loadTransaction} from '@ton/core';
import {verifyAccountInclusion} from '../recovery/account-proof.mjs';
import {matchHistory} from '../recovery/receipts.mjs';
import artifact from '../../minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json' with {type:'json'};

const need=(ok,message)=>{if(!ok)throw Error(message);};
const hash=cell=>cell.hash().toString('hex');
const curveCode=Cell.fromBase64(artifact.codeBocBase64);

function root(boc) {
 need(typeof boc==='string'&&boc.length>0&&boc.length<524288,'Bounded BOC required');
 const cells=Cell.fromBoc(Buffer.from(boc,'base64'));
 need(cells.length===1&&!cells[0].isExotic,'One ordinary BOC root required');
 return cells[0];
}

function curveData(boc,expectedHash,curve) {
 const cell=root(boc);
 need(cell.hash().equals(expectedHash),'Curve Account does not match transaction state hash');
 const slice=cell.beginParse();
 need(slice.loadBit(),'Curve Account absent');
 const account=loadAccount(slice);
 slice.endParse();
 const state=account.storage.state;
 need(account.addr.equals(curve)&&state.type==='active'&&state.state.data&&
  state.state.code?.equals(curveCode),'Pinned active Dispatch Curve required');
 return state.state.data;
}

// Decodes a failure only. This entry point accepts local/emulated cells and
// confers no provider provenance, payout entitlement or retry authority.
export function verifyNativeNoFundsBounceFields(intent,raw) {
 const curve=Address.parseRaw(intent.curve),owner=Address.parseRaw(intent.owner);
 need(intent.network==='-3'&&curve.workChain===0&&owner.workChain===0,'Testnet basechain intent required');
 const cell=root(raw.transaction),slice=cell.beginParse(),tx=loadTransaction(slice);
 slice.endParse();
 need(tx.address===BigInt('0x'+curve.hash.toString('hex')),'Wrong Curve transaction account');
 const message=tx.inMessage,info=message?.info;
 need(info?.type==='internal'&&info.bounce&&!info.bounced&&!message.init&&info.src.equals(owner)&&
  info.dest.equals(curve)&&info.value.coins>0n&&info.value.coins.toString()===intent.attachmentNano&&
  !info.value.other?.size&&message.body.equals(root(intent.payload)),'Exact owner buy message required');
 const body=message.body.beginParse();
 need(body.loadUint(32)===0x5fcc3d14,'Wrong buy opcode');
 const queryId=body.loadUintBig(64);
 body.loadCoins();
 body.endParse();
 const phase=tx.description;
 need(phase.type==='generic'&&phase.aborted&&!phase.destroyed&&phase.bouncePhase?.type==='no-funds'&&
  tx.outMessagesCount===0&&tx.outMessages.size===0,'No-funds bounce without outbound messages required');
 const before=curveData(raw.beforeAccount,tx.stateUpdate.oldHash,curve);
 const after=curveData(raw.afterAccount,tx.stateUpdate.newHash,curve);
 need(before.equals(after),'Curve data changed in failed buy');
 return Object.freeze({kind:'NATIVE_BUY_NO_FUNDS_BOUNCE',scope:'RAW_TRANSACTION_FIELDS_ONLY',
  curve:intent.curve,owner:intent.owner,transactionHash:hash(cell),transactionLt:String(tx.lt),
  queryId:String(queryId),attachmentNano:intent.attachmentNano,curveDataUnchanged:true,
  bounceEmitted:false,refundEntitlementVerified:false,retryAuthorized:false,financialSigningEnabled:false,
  referenceInclusionVerified:false,providerProvenanceVerified:false,validatorFinalityVerified:false});
}

// Internal/offline review only. Use independently acquired checkpoint inputs
// and a trusted intent. Inclusion is relative to the supplied reference.
export function verifyProvenNativeNoFundsBounce(intent,raw,checkpoint) {
 const fields=verifyNativeNoFundsBounceFields(intent,raw);
 const proof=verifyAccountInclusion(checkpoint.raw,checkpoint.reference,fields.curve);
 const history=matchHistory(checkpoint.primary,checkpoint.secondary,proof,fields.curve);
 need(history.some(row=>row.hash===fields.transactionHash),'Failure absent from proven Curve history');
 return Object.freeze({...fields,scope:'ACCOUNT_INCLUSION_RELATIVE_TO_REFERENCE',
  referenceInclusionVerified:true,providerProvenanceVerified:false,validatorFinalityVerified:false,
  masterchainSeqno:proof.masterchainSeqno,masterchainRootHash:proof.masterchainRootHash,
  masterchainFileHash:proof.masterchainFileHash});
}
