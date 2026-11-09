// Read-only deployment verification plus disposable non-financial challenges.
// No operator signature, cookie, proof or challenge is persisted in evidence.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PAGES_ORIGIN} from './pages-origin.mjs';
import {OPERATOR,MINTER} from './config.mjs';
const evidence={observedUtc:new Date().toISOString(),origin:PAGES_ORIGIN,checks:[],ownershipVerified:false,financialSigningEnabled:false,signaturesRequested:0,broadcasts:0};
const check=(name,ok)=>{assert(ok,name);evidence.checks.push({name,passed:true});};
async function get(path,options={}){return fetch(PAGES_ORIGIN+path,{...options,redirect:'manual',signal:AbortSignal.timeout(12000)});}
const http=await fetch(PAGES_ORIGIN.replace('https:','http:'),{redirect:'manual'});
check('HTTP redirects to exact HTTPS origin',[301,302,307,308].includes(http.status)&&http.headers.get('location')===PAGES_ORIGIN+'/');
for(const file of ['index.html','app.js','style.css','tonconnect-ui.min.js','icon.png']){
 const r=await get(file==='index.html'?'/':'/'+file);check('HTTPS asset '+file,r.status===200);
 const actual=Buffer.from(await r.arrayBuffer()),expected=readFileSync(new URL('public-pages/'+file,import.meta.url));
 check('exact published bytes '+file,createHash('sha256').update(actual).digest('hex')===createHash('sha256').update(expected).digest('hex'));
}
const manifest=await(await get('/tonconnect-manifest.json')).json();check('isolated manifest',manifest.url===PAGES_ORIGIN+'/'&&manifest.iconUrl===PAGES_ORIGIN+'/icon.png');
const config=await(await get('/api/config')).json();check('V5 chain/operator/minter and closed financial gate',config.network==='-3'&&config.operator===OPERATOR&&config.minter===MINTER&&config.financialSigningEnabled===false);
const headers={Origin:PAGES_ORIGIN,'Content-Type':'application/json'};
const challenge=await get('/api/proof/challenge',{method:'POST',headers,body:'{}'}),c=await challenge.json(),cookie=challenge.headers.get('Set-Cookie');
check('persistent challenge created',challenge.status===200&&/^[a-f0-9]{64}$/.test(c.payload)&&Number.isInteger(c.expiresAt));
check('secure isolated login attempt cookie',cookie?.startsWith('__Host-')&&cookie.includes('Secure; HttpOnly; SameSite=Strict'));
// A separate request must reach the same DO. No private key or real proof used.
for(const network of ['-239','-3']){
 const r=await get('/api/proof/verify',{method:'POST',headers:{...headers,Cookie:cookie.split(';')[0]},body:JSON.stringify({account:{chain:network,address:OPERATOR},proof:{payload:c.payload,signature:Buffer.alloc(64).toString('base64')}})});
 check('forged proof rejected on '+network,r.status===401);
}
check('foreign Origin rejected',(await get('/api/proof/challenge',{method:'POST',headers:{...headers,Origin:'https://anlgram.com'},body:'{}'})).status===403);
check('network override rejected',(await get('/api/config?network=-239')).status===400);
for(const path of ['/api/sendTransaction','/api/sendBoc','/api/deploy','/_worker.js','/proof.mjs','/wrangler.toml'])check('closed route '+path,(await get(path)).status===404);
const balance=await get('/api/operator');evidence.balanceObservation={http:balance.status,...await balance.json()};
check('balance is explicit data or explicit unavailable',balance.status===200||balance.status===503);
evidence.limits=['Real V5 owner ton_proof pending; rejection tests are not ownership proof.','No financial request/broadcast/deployment permission.','Custom domain still requires Spaceship DNS and Cloudflare certificate activation.'];
writeFileSync(new URL('../docs/launchpad/testnet-pages-release.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({origin:PAGES_ORIGIN,passed:evidence.checks.length,failed:0,balance:evidence.balanceObservation,ownershipVerified:false},null,2));
