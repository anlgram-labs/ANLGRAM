import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as core from '@ton/core';
import {curveOperationRoute,curveAuthorized,CurveFinancialOperation} from '../curve-operation.mjs';
import {intent,fingerprint} from '../curve-policy.mjs';
import {intent as minterIntent,fingerprint as firstFingerprint} from '../minter-policy.mjs';
import {curveEmulation} from '../curve-emulation.mjs';
import p from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
const fixture=JSON.parse(readFileSync(new URL('../../tests/settlement-runtime/fixtures/curve-two-emulation-summary.json',import.meta.url))).trace;
const proof=()=>({verified:true,network:'-3',address:intent.operator,domain:'testnet.anlgram.com',expiresAt:Math.floor(Date.now()/1000)+300});
function setup(){
 const values=new Map(),tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))},object=new CurveFinancialOperation({storage:{...tx,transaction:async fn=>fn(tx)}});let reads=0;
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
  const ref=await curveEmulation(),trace=structuredClone(fixture);Object.values(trace.transactions).find(t=>core.Address.parse(t.account).toRawString()===intent.operator).in_msg.message_content.hash=Buffer.from(ref.bodyHash,'hex').toString('base64');return Response.json({...base,trace,bodyHash:ref.bodyHash,validUntil:ref.validUntil});
 }})}};
 return{env,values,source,scope,reads:()=>reads,walletAccount:{chain:'-3',address:intent.operator,publicKey:intent.publicKey,walletStateInit:p.wallet.stateInit}};
}
const route=(path,input,h,pr=proof())=>curveOperationRoute('/api/curve-two/'+path,input,h.env,pr);
test('Curve preparation is non-signing; exact approved claim checks fresh active V5/minter/Curve and locks forever',async()=>{
 const h=setup(),r=await route('prepare',{},h);assert.equal(r.status,200);const j=await r.json();assert.equal(j.requestAllowed,false);assert.equal(j.expectedSeqno,1);assert.equal(h.values.has('operation'),false);
 const input={transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount};assert.equal((await route('claim',input,h)).status,403);assert.equal(h.reads(),5);
 h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);assert.equal((await route('claim',input,h)).status,200);assert.equal((await route('claim',input,h)).status,409);assert.equal((await route('prepare',{},h)).status,409);
 assert.equal(h.values.get('operation').approvalReference.expectedSeqno,1);assert.equal(h.values.get('operation').status,'LOCKED_PENDING_RECONCILIATION');
});
test('Curve rejects reused first transaction/fingerprint and changed nonce/state without consuming claim',async()=>{
 const h=setup(),j=await(await route('prepare',{},h)).json();h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);
 const input={transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount};
 const first={...j.transaction,messages:[minterIntent.message]};await assert.rejects(route('claim',{...input,transaction:first,fingerprint:await firstFingerprint(first)},h));
 assert.notEqual(await fingerprint(j.transaction),await firstFingerprint(first));
 h.source.data=core.beginCell().storeBit(true).storeUint(2,32).storeInt(intent.walletId,32).storeBuffer(Buffer.from(intent.publicKey,'hex')).storeBit(false).endCell().toBoc().toString('base64');assert.equal((await route('claim',input,h)).status,409);assert.equal(h.values.has('operation'),false);
});
test('Curve proof expiry/domain/network, stale quote, changed wallet and incompatible authorization fail closed',async()=>{
 const h=setup();for(const pr of [{...proof(),expiresAt:1},{...proof(),domain:'anlgram.com'},{...proof(),network:'-239'}])assert.equal((await route('prepare',{},h,pr)).status,403);assert.equal(h.reads(),0);
 const j=await(await route('prepare',{},h)).json();h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify({...h.scope,expectedSeqno:0});assert.equal(curveAuthorized(h.env),false);h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);
 await assert.rejects(route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:{...h.walletAccount,chain:'-239'}},h));
 h.values.get('prepared').approval.observedAt-=61;assert.equal((await route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h)).status,403);assert.equal(h.values.has('operation'),false);
});
