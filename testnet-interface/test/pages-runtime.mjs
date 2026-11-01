import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('Pages Function reaches external persistent Durable Object across requests',async()=>{
 const origin='https://anlgram-testnet-preparation.pages.dev';
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'pages',scriptPath:fileURLToPath(new URL('../.pages-worker-build/pages-entry.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],bindings:{APP_ORIGIN:origin},durableObjects:{PROOFS:{className:'ProofAttempt',scriptName:'storage',useSQLite:true}},serviceBindings:{ASSETS:async()=>new Response('asset')}},
  {name:'storage',scriptPath:fileURLToPath(new URL('../.worker-build/worker.js',import.meta.url)),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],durableObjects:{PROOFS:{className:'ProofAttempt',useSQLite:true}}}
 ]}));
 try{
  const config=await(await mf.dispatchFetch(origin+'/api/config')).json();assert.equal(config.network,'-3');assert.equal(config.financialSigningEnabled,false);
  const headers={Origin:origin,'Content-Type':'application/json'};
  const r=await mf.dispatchFetch(origin+'/api/proof/challenge',{method:'POST',headers,body:'{}'}),c=await r.json();assert.equal(r.status,200);assert.match(c.payload,/^[a-f0-9]{64}$/);
  const Cookie=r.headers.get('Set-Cookie').split(';')[0];
  const forged=await mf.dispatchFetch(origin+'/api/proof/verify',{method:'POST',headers:{...headers,Cookie},body:'{}'});assert.equal(forged.status,401);
  assert.equal((await mf.dispatchFetch(origin+'/api/sendTransaction',{method:'POST'})).status,404);
 }finally{await mf.dispose();}
});
