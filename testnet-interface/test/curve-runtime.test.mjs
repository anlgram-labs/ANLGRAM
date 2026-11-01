import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,proof,route,authorize} from './curve-fixture.mjs';
import {curveAuthorization,RUNTIME_MODE} from '../curve-authorization.mjs';
const input=(h,j)=>({transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount});
test('one server grant supports fresh distinct runtime quotes without changing environment or extending any deadline',async t=>{
 const original=Math.floor(Date.now()/1000);let now=original;t.mock.method(Date,'now',()=>now*1000);
 const h=setup(),g=authorize(h),env=h.env.CURVE_TX2_SIGNING_AUTH,pr={...proof(),expiresAt:now+300};
 const first=await(await route('prepare',{},h,pr)).json();assert(first.requestAllowed);assert.equal(first.quoteExpiresAt,now+60);assert.equal(first.transaction.validUntil,g.notAfter);
 now+=61;assert.equal((await route('claim',input(h,first),h,pr)).status,403);assert(!h.values.has('operation'));
 const second=await(await route('prepare',{},h,pr)).json();assert(second.requestAllowed);assert.notEqual(second.fingerprint,first.fingerprint);assert(second.transaction.validUntil<first.transaction.validUntil);assert(second.quoteExpiresAt<=g.notAfter);assert(second.quoteExpiresAt<=now+60);assert.equal(h.env.CURVE_TX2_SIGNING_AUTH,env);
 assert.equal((await route('claim',input(h,first),h,pr)).status,403);assert.equal((await route('claim',input(h,second),h,pr)).status,200);assert.equal((await route('prepare',{},h,pr)).status,409);
});
test('grant validation rejects extended windows, ambiguous versions and changed immutable financial fields',()=>{
 const h=setup(),g=authorize(h);assert(curveAuthorization(h.env));
 for(const patch of [{notAfter:g.issuedAt+91},{issuedAt:g.issuedAt+1},{fingerprint:'aa'.repeat(32)},{validUntil:g.notAfter},{authorizationId:'bad'},{mode:'unknown'},{network:'-239'},{expectedSeqno:0},{amountNano:'100000001'},{policyCeilingNano:'121000000'},{stateInitHash:'00'.repeat(32)}]){h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify({...g,...patch});assert.equal(curveAuthorization(h.env),null,JSON.stringify(patch));}
});
test('expired proof/grant, revocation and rotation cannot authorize a previously prepared fingerprint',async t=>{
 const initial=Math.floor(Date.now()/1000);let now=initial;t.mock.method(Date,'now',()=>now*1000);
 const h=setup();authorize(h);const pr={...proof(),expiresAt:now+300},j=await(await route('prepare',{},h,pr)).json();
 delete h.env.CURVE_TX2_SIGNING_AUTH;assert.equal((await route('claim',input(h,j),h,pr)).status,403);
 authorize(h,now,'bc'.repeat(32));assert.equal((await route('claim',input(h,j),h,pr)).status,403);
 const next=await(await route('prepare',{},h,pr)).json();assert.notEqual(next.fingerprint,j.fingerprint);
 assert.equal((await route('claim',input(h,next),h,{...pr,expiresAt:now})).status,403);
 now+=90;assert.equal((await route('claim',input(h,next),h,pr)).status,403);assert(!h.values.has('operation'));
});
test('quote and signed-message expiry are shortened to the proof expiry, never lengthened',async()=>{
 const h=setup();authorize(h);const pr={...proof(),expiresAt:Math.floor(Date.now()/1000)+20},j=await(await route('prepare',{},h,pr)).json();assert.equal(j.transaction.validUntil,pr.expiresAt);assert.equal(j.quoteExpiresAt,pr.expiresAt);assert(j.requestAllowed);
});
test('concurrent quote preparation cannot overwrite a newer reservation or produce two claims',async()=>{
 const h=setup();authorize(h);const rs=await Promise.all([route('prepare',{},h),route('prepare',{},h)]),good=[];
 for(const r of rs)if(r.ok)good.push(await r.json());assert(good.length>=1);
 const last=h.values.get('prepared');assert(last?.approval.quoteRevision===h.values.get('quote').revision);
 const j=good.find(x=>x.fingerprint===last.approval.fingerprint);assert(j);
 const claims=await Promise.all([route('claim',input(h,j),h),route('claim',input(h,j),h)]);assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
});
test('new reservation supersedes old quote immediately; failed upstream cannot revive it',async()=>{
 const h=setup();authorize(h);const j=await(await route('prepare',{},h)).json(),original=h.env.TESTNET_READS.get;
 h.env.TESTNET_READS.get=()=>({fetch:async r=>{const b=await r.clone().json();if(b.account==='curveFees')return Response.json({error:'outage'},{status:503});return original().fetch(r);}});
 await assert.rejects(route('prepare',{},h),/Fresh/);assert.equal((await route('claim',input(h,j),h)).status,403);assert(!h.values.has('operation'));
});
test('private atomic claim rechecks quote revision and authorization binding after asynchronous validation',async()=>{
 const h=setup();authorize(h);const j=await(await route('prepare',{},h)).json(),a=h.values.get('prepared').approval;
 const call=b=>h.object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify(b)}));
 const claim={action:'claim',transaction:j.transaction,fingerprint:j.fingerprint,requirePrepared:true,approvalReference:a,authorizationBinding:{id:'ff'.repeat(32),notAfter:a.authorizationNotAfter}};
 assert.equal((await call(claim)).status,409);assert(!h.values.has('operation'));
 await call({action:'reserveQuote',scopeKey:a.quoteScopeKey,maximumValidUntil:j.transaction.validUntil});claim.authorizationBinding.id=a.authorizationId;assert.equal((await call(claim)).status,409);assert(!h.values.has('operation'));
});
