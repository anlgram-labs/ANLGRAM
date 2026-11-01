import {RUNTIME_MODE} from '../curve-authorization.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as core from '@ton/core';
import {curveOperationRoute,CurveFinancialOperation} from '../curve-operation.mjs';
import {intent} from '../curve-policy.mjs';
import {curveEmulation} from '../curve-emulation.mjs';
import p from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
const fixture=JSON.parse(readFileSync(new URL('../../tests/settlement-runtime/fixtures/curve-two-emulation-summary.json',import.meta.url))).trace;
export const proof=()=>({verified:true,network:'-3',address:intent.operator,domain:'testnet.anlgram.com',expiresAt:Math.floor(Date.now()/1000)+300});
export function setup(){
 let queue=Promise.resolve();
 const values=new Map(),tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))},object=new CurveFinancialOperation({storage:{...tx,transaction:fn=>{const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next;}}});let reads=0;
 const wi=core.loadStateInit(core.Cell.fromBase64(p.wallet.stateInit).beginParse()),mi=core.loadStateInit(core.Cell.fromBase64(p.smokePlan.steps[0].message.stateInit).beginParse());
 const data=core.beginCell().storeBit(true).storeUint(1,32).storeInt(intent.walletId,32).storeBuffer(Buffer.from(intent.publicKey,'hex')).storeBit(false).endCell();
 const sender=Object.values(fixture.transactions).find(t=>core.Address.parse(t.account).toRawString()===intent.operator),source={state:'active',code:wi.code.toBoc().toString('base64'),data:data.toBoc().toString('base64'),balance:sender.account_state_before.balance,last_transaction_id:{hash:'controlled-source-last'}};
 const md=mi.data.beginParse();md.loadCoins();const admin=md.loadAddress(),content=md.loadRef(),wc=md.loadRef();
 const stack=[['num','0x0'],['num','-0x1'],['slice',{bytes:core.beginCell().storeAddress(admin).endCell().toBoc().toString('base64')}],... [content,wc].map(c=>['cell',{bytes:c.toBoc().toString('base64')}])];
 const scope={operation:intent.operation,candidateSha256:intent.candidateSha256,origin:'https://testnet.anlgram.com',network:'-3',operator:intent.operator,destination:intent.message.address,stateInitHash:core.Cell.fromBase64(intent.message.stateInit).hash().toString('hex'),bodyHash:core.Cell.fromBase64(intent.message.payload).hash().toString('hex'),amountNano:'100000000',expectedSeqno:1,walletId:intent.walletId,policyCeilingNano:'120000000',acceptNativeSeqnoLimitation:true,hardMaximumDebitEnforced:false,notAfter:Math.floor(Date.now()/1000)+300};
 const env={CURVE_OPERATIONS:{idFromName:n=>{assert(n.startsWith('ANLTEST_CURVE_TX2:'));return n;},get:()=>({fetch:r=>object.fetch(r)})},TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{
  reads++;const input=await r.json();assert.equal(input.fresh,true);const base={network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now()};
  if(input.account==='operator')return Response.json({...base,account:source});
  if(input.account==='minter')return Response.json({...base,account:{state:'active',code:mi.code.toBoc().toString('base64'),data:mi.data.toBoc().toString('base64'),balance:'99966866'}});
  if(input.account==='curve')return Response.json({...base,account:{state:'uninitialized',code:'',balance:'0'}});
  if(input.account==='jettonData')return Response.json({...base,getterResult:{exit_code:0,stack}});
  const ref=await curveEmulation(input.validUntil),trace=structuredClone(fixture);Object.values(trace.transactions).find(t=>core.Address.parse(t.account).toRawString()===intent.operator).in_msg.message_content.hash=Buffer.from(ref.bodyHash,'hex').toString('base64');return Response.json({...base,trace,bodyHash:ref.bodyHash,validUntil:ref.validUntil});
 }})}};
 return{env,values,object,source,scope,reads:()=>reads,walletAccount:{chain:'-3',address:intent.operator,publicKey:intent.publicKey,walletStateInit:p.wallet.stateInit}};
}
export const route=(path,input,h,pr=proof())=>curveOperationRoute('/api/curve-two/'+path,input,h.env,pr);

export function authorize(h,now=Math.floor(Date.now()/1000),id='ab'.repeat(32)){
 const grant={...h.scope,mode:RUNTIME_MODE,authorizationId:id,issuedAt:now,notAfter:now+90};delete grant.fingerprint;delete grant.validUntil;
 h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(grant);return grant;
}
