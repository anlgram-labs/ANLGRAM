import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.mjs';

test('Pages canonical extensionless wizard route is served after the legacy .html asset redirect',async()=>{
 const origin='https://testnet.anlgram.com',html='<h1>TESTNET configuration only</h1>',env={APP_ORIGIN:origin,ASSETS:{fetch:async request=>new URL(request.url).pathname.endsWith('.html')?Response.redirect(origin+'/memelabs',308):new Response(html,{headers:{'Content-Type':'text/html'}})}};
 const redirected=await worker.fetch(new Request(origin+'/memelabs.html'),env);assert.equal(redirected.status,308);assert.equal(redirected.headers.get('location'),origin+'/memelabs');
 const r=await worker.fetch(new Request(origin+'/memelabs'),env);assert.equal(r.status,200);assert.equal(await r.text(),html);assert.equal((await worker.fetch(new Request('https://anlgram.com/memelabs'),env)).status,403);
});
import {PAGES_ORIGIN} from '../pages-origin.mjs';
const env={APP_ORIGIN:PAGES_ORIGIN};
test('Pages manifest binds exactly to each approved hostname, never arbitrary previews',async()=>{
 for(const origin of [PAGES_ORIGIN,'https://testnet.anlgram.com']){
  const r=await worker.fetch(new Request(origin+'/tonconnect-manifest.json'),env),m=await r.json();
  assert.equal(r.status,200);assert.equal(m.url,origin+'/');assert.equal(m.iconUrl,origin+'/icon.png');
 }
 for(const origin of ['https://anlgram.com','https://other.pages.dev','https://preview.anlgram-testnet-preparation.pages.dev','http://anlgram-testnet-preparation.pages.dev'])assert.equal((await worker.fetch(new Request(origin+'/api/config'),env)).status,403);
});
test('cross-origin proof requests between custom domain and Pages are rejected',async()=>{
 for(const [url,origin]of [[PAGES_ORIGIN,'https://testnet.anlgram.com'],['https://testnet.anlgram.com',PAGES_ORIGIN]]){
  assert.equal((await worker.fetch(new Request(url+'/api/proof/challenge',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),env)).status,403);
 }
});
test('Pages never serves source, configuration, financial or arbitrary RPC routes',async()=>{
 for(const path of ['/worker.mjs','/_worker.js','/wrangler.toml','/proof.mjs','/package.json','/api/sendBoc','/api/signData','/api/deploy'])assert.equal((await worker.fetch(new Request(PAGES_ORIGIN+path),env)).status,404);
});
