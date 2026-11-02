import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import version from '../execution-version.json' with {type:'json'};
import {curveOperationRoute} from '../curve-operation.mjs';
import {setup,authorize,proof,route} from './curve-fixture.mjs';
test('execution ID independently reproduces from exact reviewed security sources and candidate',()=>{
 const {sha256,...payload}=version;const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(JSON.stringify(payload)),sha256);
 for(const [file,h] of Object.entries(version.sources))assert.equal(hash(readFileSync(new URL('../'+file,import.meta.url))),h,file);
 const audit=JSON.parse(readFileSync(new URL('../client-build.json',import.meta.url)));assert.equal(audit.executionVersion,sha256);
});
test('missing or incompatible client versions fail before provider reads, approvals or persistent claims',async()=>{
 const h=setup();authorize(h);
 for(const path of ['prepare','claim'])for(const runtimeVersion of [undefined,'00'.repeat(32)]){
  const r=await curveOperationRoute('/api/curve-two/'+path,{runtimeVersion},h.env,proof());assert.equal(r.status,409);assert.equal(h.reads(),0);assert(!h.values.has('operation'));assert(!h.values.has('prepared'));
 }
 const j=await(await route('prepare',{},h)).json();assert.equal(j.runtimeVersion,version.sha256);
 const p=h.values.get('prepared');p.approval.runtimeVersion='00'.repeat(32);h.values.set('prepared',p);
 assert.equal((await route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h)).status,403);assert(!h.values.has('operation'));
});
test('stale application SDK/config pairing cannot initialize a wallet or obtain a challenge',async()=>{
 const els={status:{},start:{}},calls=[];let constructors=0;
 const code=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 await vm.runInNewContext(code,{document:{getElementById:k=>els[k]??={}},location:{origin:'https://testnet.anlgram.com'},URL,TON_CONNECT_UI:{curveExecutionVersion:'old-sdk',TonConnectUI:class{constructor(){constructors++}}},fetch:async path=>{calls.push(path);return Response.json({network:'-3',financialSigningEnabled:false,manifestUrl:'https://testnet.anlgram.com/tonconnect-manifest.json',curveExecutionVersion:version.sha256});}});
 assert.equal(constructors,0);assert.deepEqual(calls,['/api/config']);assert(els.start.disabled);assert.match(els.status.textContent,/bloqueado/);
});

test('different persistent Worker version blocks Pages preparation and claims before any chain read',async()=>{
 const h=setup();authorize(h);const get=h.env.CURVE_OPERATIONS.get;
 h.env.CURVE_OPERATIONS.get=()=>({fetch:async request=>{const b=await request.clone().json();return b.action==='runtime'?Response.json({runtimeVersion:'old-worker'}):get().fetch(request);}});
 for(const path of ['prepare','claim'])assert.equal((await route(path,{},h)).status,409);
 assert.equal(h.reads(),0);assert(!h.values.has('operation'));
});
