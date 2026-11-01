import execution from '../execution-version.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';
import {setup,authorize,proof,route} from './curve-fixture.mjs';
const origin='https://testnet.anlgram.com';
const key='31'.repeat(32); // Synthetic ADMIN credential, never a wallet key.
async function submit(h,grant,{secret=key,signature,host=origin}={}){
 const raw=JSON.stringify(grant),k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('ANLGRAM_CURVE_AUTH_V1\n'+origin+'/api/curve-two/authorize\n'+raw))).toString('hex');
 return worker.fetch(new Request(host+'/api/curve-two/authorize',{method:'POST',headers:{Origin:host,'Content-Type':'application/json','X-Curve-Authorization':signature??mac},body:raw}),h.env);
}
function admin(){const h=setup(),g=authorize(h);delete h.env.CURVE_TX2_SIGNING_AUTH;h.env.APP_ORIGIN=origin;h.env.CURVE_TX2_RUNTIME_AUTH_KEY=key;return{h,g};}
test('authenticated finite grant reaches persistent object without deployment; exact server quote required and grant replay rejected',async()=>{
 const {h,g}=admin();assert.equal((await submit(h,g)).status,200);assert.equal((await submit(h,g)).status,409);
 assert.equal(h.env.CURVE_TX2_SIGNING_AUTH,undefined);assert.equal(h.values.get('runtimeAuthorization').authorizationId,g.authorizationId);
 const j=await(await route('prepare',{},h)).json();assert(j.requestAllowed);
 assert.equal((await route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h)).status,200);
 assert.equal((await submit(h,{...g,authorizationId:'33'.repeat(32)})).status,409);
});
test('browser cannot supply authorization, change scope, forge MAC or use foreign origin; absent admin secret fails closed',async()=>{
 const {h,g}=admin();for(const options of [{signature:'00'.repeat(32)},{secret:'32'.repeat(32)},{host:'https://anlgram-testnet-preparation.pages.dev'}])assert.equal((await submit(h,g,options)).status,403);
 assert.equal((await submit(h,{...g,amountNano:'100000001'})).status,403);assert.equal((await submit(h,{...g,notAfter:g.issuedAt+91})).status,403);
 delete h.env.CURVE_TX2_RUNTIME_AUTH_KEY;assert.equal((await submit(h,g)).status,403);assert(!h.values.has('runtimeAuthorization'));assert(!h.values.has('operation'));
});
test('new finite authorization after quote expiry needs no redeploy and old prepared quotes cannot cross grant epochs',async t=>{
 let now=Math.floor(Date.now()/1000);t.mock.method(Date,'now',()=>now*1000);const {h,g}=admin();const pr=proof();assert.equal((await submit(h,g)).status,200);
 const j=await(await route('prepare',{},h,pr)).json();now+=91;assert.equal((await route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h,pr)).status,403);
 const next={...g,authorizationId:'34'.repeat(32),issuedAt:now,notAfter:now+90};assert.equal((await submit(h,next)).status,200);
 const fresh=await(await route('prepare',{},h,pr)).json();assert(fresh.requestAllowed);assert.notEqual(fresh.fingerprint,j.fingerprint);assert.equal(h.env.CURVE_TX2_SIGNING_AUTH,undefined);
 await assert.rejects(route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h,pr),/expiry/);
 // Rotation during upstream validation is also checked atomically at claim.
 h.values.set('runtimeAuthorization',{...next,authorizationId:'35'.repeat(32)});
 const a=h.values.get('prepared').approval;
 const r=await h.object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({runtimeVersion:execution.sha256,action:'claim',transaction:fresh.transaction,fingerprint:fresh.fingerprint,requirePrepared:true,authorizationBinding:{id:a.authorizationId,notAfter:a.authorizationNotAfter,requireStored:true}})}));assert.equal(r.status,409);assert(!h.values.has('operation'));
});
