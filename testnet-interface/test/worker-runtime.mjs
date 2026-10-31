import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('real local workerd routing and Durable Object challenge storage fail closed',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({scriptPath:new URL('../.worker-build/worker.js',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),modules:true,
  compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],
  bindings:{APP_ORIGIN:'https://testnet.anlgram.com'},durableObjects:{PROOFS:{className:'ProofAttempt',useSQLite:true}},
  serviceBindings:{ASSETS:async()=>new Response('asset')}}));
 try {
  const origin='https://testnet.anlgram.com';
  const manifest=await (await mf.dispatchFetch(origin+'/tonconnect-manifest.json')).json();assert.equal(manifest.url,origin+'/');
  const config=await(await mf.dispatchFetch(origin+'/api/config')).json();assert.equal(config.network,'-3');assert.equal(config.financialSigningEnabled,false);
  assert.equal((await mf.dispatchFetch('https://anlgram.com/api/config')).status,403);
  const r=await mf.dispatchFetch(origin+'/api/proof/challenge',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,200);const challenge=await r.json();assert.match(challenge.payload,/^[a-f0-9]{64}$/);
  const cookie=r.headers.get('Set-Cookie').split(';')[0];assert.match(cookie,/^__Host-/);
  const forged=await mf.dispatchFetch(origin+'/api/proof/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'});
  assert.equal(forged.status,401);
  assert.equal((await mf.dispatchFetch(origin+'/api/sendTransaction',{method:'POST'})).status,404);
 } finally {await mf.dispose();}
});
