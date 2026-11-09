import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareMinterOne,preparationEnabled} from '../prepare-minter-one.mjs';
import {FinancialOperation,operationRoute} from '../operation-lock.mjs';
import {minterEmulation} from '../minter-emulation.mjs';
import {intent,fingerprint} from '../minter-policy.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../tests/settlement-runtime/fixtures/v5-minter-emulation-summary.json',import.meta.url)));
const proof=()=>({verified:true,network:'-3',address:intent.operator,expiresAt:Math.floor(Date.now()/1000)+300});
function setup(){
 const values=new Map(),tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))};const object=new FinancialOperation({storage:{...tx,transaction:async fn=>fn(tx)}});let reads=0;
 const scope={origin:'https://testnet.anlgram.com',candidateSha256:intent.candidateSha256,operator:intent.operator,destination:intent.message.address,amountNano:'100000000',policyCeilingNano:'120000000',notAfter:Math.floor(Date.now()/1000)+600};
 const env={MINTER_TX1_PREPARATION:JSON.stringify(scope),OPERATIONS:{idFromName:n=>n,get:()=>({fetch:r=>object.fetch(r)})},TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async request=>{
  reads++;const input=await request.json();assert.equal(input.fresh,true);assert.equal(input.network,'-3');const base={network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now()};
  if(input.account!=='fees')return Response.json({...base,account:{state:'uninitialized',code:'',balance:input.account==='operator'?'1999999999':'0',last_transaction_id:{hash:'fixture-last'}}});
  const ref=await minterEmulation(),trace=structuredClone(fixture);Object.values(trace.transactions).find(t=>t.account.toLowerCase()===intent.operator).in_msg.message_content.hash=Buffer.from(ref.bodyHash,'hex').toString('base64');return Response.json({...base,trace,validUntil:ref.validUntil,bodyHash:ref.bodyHash});
 }})}};
 return{env,values,object,reads:()=>reads,scope};
}
test('fresh legitimate preparation -> exact persistent approval -> claim; repeat/reload/prepare denied without another provider call',async()=>{
 const h=setup(),r=await prepareMinterOne({},h.env,proof());assert.equal(r.status,200);const prepared=await r.json();assert.equal(prepared.notSigned,true);assert.equal(h.values.get('operation'),undefined);assert.deepEqual(prepared.transaction.messages,[intent.message]);assert.equal(prepared.fingerprint,await fingerprint(prepared.transaction));assert.equal(prepared.simulation.modeledSenderDebitNano,'106876937');
 const claim=await operationRoute('/api/operation/claim',{transaction:prepared.transaction,fingerprint:prepared.fingerprint},h.env,proof());assert.equal(claim.status,200);assert.equal(h.values.get('operation').status,'LOCKED_PENDING_RECONCILIATION');const count=h.reads();assert.equal((await prepareMinterOne({},h.env,proof())).status,409);assert.equal(h.reads(),count);assert.equal((await operationRoute('/api/operation/claim',{transaction:prepared.transaction,fingerprint:prepared.fingerprint},h.env,proof())).status,409);
});
test('missing/expired/mutated owner scope, Mainnet origin and wrong/expired proof never read providers or prepare approval',async()=>{
 for(const mutate of [h=>delete h.env.MINTER_TX1_PREPARATION,h=>h.env.MINTER_TX1_PREPARATION=JSON.stringify({...h.scope,amountNano:'100000001'}),h=>h.env.MINTER_TX1_PREPARATION=JSON.stringify({...h.scope,notAfter:1})]){const h=setup();mutate(h);assert.equal((await prepareMinterOne({},h.env,proof())).status,403);assert.equal(h.reads(),0);}
 const h=setup();for(const p of [{...proof(),network:'-239'},{...proof(),address:'wrong'},{...proof(),expiresAt:1}])assert.equal((await prepareMinterOne({},h.env,p)).status,403);assert.equal(h.reads(),0);assert.equal(preparationEnabled(h.env,'https://anlgram.com'),false);assert.equal(preparationEnabled(h.env,'https://anlgram-testnet-preparation.pages.dev'),false);
});
test('caller parameters, stale approval and changed destination cannot dispatch or create a claim',async()=>{
 const h=setup();assert.equal((await prepareMinterOne({amount:'1'},h.env,proof())).status,400);const prepared=await(await prepareMinterOne({},h.env,proof())).json();const p=h.values.get('prepared');p.approval.observedAt-=61;h.values.set('prepared',p);assert.equal((await operationRoute('/api/operation/claim',{transaction:prepared.transaction,fingerprint:prepared.fingerprint},h.env,proof())).status,403);assert.equal(h.values.get('operation'),undefined);
 const tx=structuredClone(prepared.transaction);tx.messages[0].address='wrong';await assert.rejects(operationRoute('/api/operation/claim',{transaction:tx,fingerprint:prepared.fingerprint},h.env,proof()),/Unapproved/);assert.equal(h.values.get('operation'),undefined);
});
test('unavailable, anonymous or cached observations cannot issue approval',async()=>{
 for(const data of [{network:'-3',authentication:'ANONYMOUS',dataStatus:'FRESH_PROVIDER_OBSERVATION'},{network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'SHORT_LIVED_CACHE'}]){const h=setup();h.env.TESTNET_READS.get=()=>({fetch:async()=>Response.json({...data,observedAt:Date.now()})});await assert.rejects(prepareMinterOne({},h.env,proof()),/Fresh authenticated/);assert.equal(h.values.get('prepared'),undefined);}
});
