import * as core from '@ton/core';
import {analyze} from '../lib/v5-minter-trace.js';
import {accountRead} from './testnet-rpc.mjs';
import {intent,validateIntent,fingerprint} from './minter-policy.mjs';
import {minterEmulation} from './minter-emulation.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export function preparationEnabled(env,origin='https://testnet.anlgram.com',now=Math.floor(Date.now()/1000)){
 try{const s=JSON.parse(env.MINTER_TX1_PREPARATION||'null');return !!s&&origin==='https://testnet.anlgram.com'&&s.origin===origin&&s.candidateSha256===intent.candidateSha256&&s.operator===intent.operator&&s.destination===intent.message.address&&s.amountNano==='100000000'&&s.policyCeilingNano==='120000000'&&Number.isSafeInteger(s.notAfter)&&s.notAfter>now;}catch{return false;}
}
export function validProof(proof,now=Math.floor(Date.now()/1000)){return proof?.verified===true&&proof.network===intent.network&&proof.address===intent.operator&&Number.isSafeInteger(proof.expiresAt)&&proof.expiresAt>now;}
async function fresh(env,which){const r=await accountRead(env,which,true),j=await r.json();if(!r.ok||j.network!=='-3'||j.authentication!=='TESTNET_KEY_ACCEPTED'||j.dataStatus!=='FRESH_PROVIDER_OBSERVATION'||Math.abs(Date.now()-j.observedAt)>10000)throw Error('Fresh authenticated Testnet observation unavailable');return j;}
export async function prepareMinterOne(input,env,proof){
 if(!preparationEnabled(env)||!validProof(proof))return json({error:'Fresh operator proof and limited owner preparation authorization required'},403);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)return json({error:'No caller-controlled transaction parameters permitted'},400);
 const stub=env.OPERATIONS.get(env.OPERATIONS.idFromName(intent.operation+':'+intent.operator));
 const lock=await(await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:'{"action":"status"}'}))).json();
 if(lock.status!=='NOT_CLAIMED')return json({error:'Operation already attempted; reconciliation required'},409);
 const source=(await fresh(env,'operator')).account,destination=(await fresh(env,'minter')).account;
 if(source.state!=='uninitialized'||source.code||!/^\d+$/.test(source.balance)||!source.last_transaction_id?.hash||destination.state!=='uninitialized'||destination.code||destination.balance!=='0')return json({error:'Operator/minter state changed; review required'},409);
 const quote=await fresh(env,'fees');
 // Independently rebuild the body with the provider's deadline; no external BOC
 // or deadline is accepted from the browser. This helper uses a zero signature.
 const reference=await minterEmulation(quote.validUntil);
 if(reference.bodyHash!==quote.bodyHash)throw Error('Emulated another request');
 const walletInit=core.loadStateInit(core.Cell.fromBase64(intent.walletStateInit).beginParse()),minterInit=core.loadStateInit(core.Cell.fromBase64(intent.message.stateInit).beginParse());
 const p={wallet:{raw:intent.operator,codeHash:walletInit.code.hash().toString('hex'),publicKey:intent.publicKey},dependentAccounts:{minter:{raw:core.contractAddress(0,minterInit).toRawString(),codeHash:minterInit.code.hash().toString('hex'),dataHash:minterInit.data.hash().toString('hex')}},smokePlan:{steps:[{message:intent.message}]}};
 const simulation=analyze(quote.trace,p,quote.bodyHash,core);
 if(simulation.operatorBalanceBeforeNano!==source.balance||!simulation.fitsReviewCeiling||BigInt(source.balance)<BigInt(simulation.modeledSenderDebitNano))return json({error:'State/fee policy requires new review'},409);
 const transaction={network:'-3',from:intent.operator,validUntil:quote.validUntil,messages:[structuredClone(intent.message)]};validateIntent(transaction);
 if(!validProof(proof)||!preparationEnabled(env))return json({error:'Authorization/proof expired during preparation'},403);
 const hash=await fingerprint(transaction),approval={fingerprint:hash,validUntil:transaction.validUntil,candidateSha256:intent.candidateSha256,completeEmulation:true,traceSha256:simulation.traceSha256,observedAt:Math.floor(Date.now()/1000),modeledDebitNano:simulation.modeledSenderDebitNano,sourceBalanceNano:source.balance,sourceLastTransactionHash:source.last_transaction_id.hash};
 const stored=await stub.fetch(new Request('https://operation.internal/',{method:'POST',body:JSON.stringify({action:'prepare',transaction,approval})}));if(!stored.ok)return stored;
 return json({transaction,fingerprint:hash,quoteExpiresAt:approval.observedAt+60,simulation,stateInitHash:p.dependentAccounts.minter.raw.slice(2),operatorAddress:'0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR',prepared:true,notSigned:true,policyCeilingIsNotEnforcedMaximum:true});
}
