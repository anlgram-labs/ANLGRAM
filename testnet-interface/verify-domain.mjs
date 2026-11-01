// Public DNS/TLS and non-financial API verification. No signatures or BOCs.
import {Resolver} from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {OPERATOR,MINTER} from './config.mjs';
const hostname='testnet.anlgram.com',origin='https://'+hostname;
const resolver=new Resolver();resolver.setServers(['1.1.1.1']);
const cname=await resolver.resolveCname(hostname),ips=await resolver.resolve4(hostname);
assert(cname.includes('anlgram-testnet-preparation.pages.dev'));
const evidence={observedUtc:new Date().toISOString(),origin,dns:{resolver:'1.1.1.1',cname,ipv4:ips},checks:[],financialSigningEnabled:false,broadcasts:0};
const check=(name,ok)=>{assert(ok,name);evidence.checks.push({name,passed:true});};
// Uses the publicly resolved IP only to avoid a local negative DNS cache. TLS
// hostname/SNI validation stays enabled; no hosts/DNS settings are changed.
function request(path,{method='GET',headers={},body,plain=false}={}){
 return new Promise((resolve,reject)=>{
  const client=plain?http:https;
  const r=client.request({hostname,path,method,headers,agent:false,lookup:(h,o,cb)=>cb(null,o.all?[{address:ips[0],family:4}]:ips[0],4)},res=>{
   const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>3000000){r.destroy(Error('Oversized response'));return;}chunks.push(c);});
   res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,bytes,text:bytes.toString('utf8')});});
  });
  if(!plain)r.on('socket',s=>s.on('secureConnect',()=>{if(!s.authorized){r.destroy(Error('TLS validation failed'));return;}const cert=s.getPeerCertificate();evidence.tls={authorized:true,subjectAltName:cert.subjectaltname,expires:cert.valid_to};}));
  r.setTimeout(12000,()=>r.destroy(Error('timeout')));r.on('error',reject);if(body)r.write(body);r.end();
 });
}
check('expected DNS CNAME',cname.includes('anlgram-testnet-preparation.pages.dev'));
const redirect=await request('/',{plain:true});check('HTTP redirects to HTTPS',[301,302,307,308].includes(redirect.status)&&redirect.headers.location===origin+'/');
for(const file of ['index.html','app.js','transaction-one.js','style.css','tonconnect-ui.min.js','icon.png']){
 const r=await request(file==='index.html'?'/':'/'+file);check('HTTPS asset '+file,r.status===200);
 check('exact deployed bytes '+file,createHash('sha256').update(r.bytes).digest('hex')===createHash('sha256').update(readFileSync(new URL('public-pages/'+file,import.meta.url))).digest('hex'));
}
const m=JSON.parse((await request('/tonconnect-manifest.json')).text);check('exact domain-bound manifest',m.url===origin+'/'&&m.iconUrl===origin+'/icon.png');
const c=JSON.parse((await request('/api/config')).text);check('approved V5 Testnet configuration',c.network==='-3'&&c.operator===OPERATOR&&c.minter===MINTER&&c.financialSigningEnabled===false);
const headers={Origin:origin,'Content-Type':'application/json'};
const challenge=await request('/api/proof/challenge',{method:'POST',headers,body:'{}'}),payload=JSON.parse(challenge.text),cookie=challenge.headers['set-cookie']?.[0];
check('persistent domain challenge',challenge.status===200&&/^[a-f0-9]{64}$/.test(payload.payload));
check('secure origin-specific cookie',cookie?.includes('Secure; HttpOnly; SameSite=Strict'));
for(const chain of ['-239','-3']){const r=await request('/api/proof/verify',{method:'POST',headers:{...headers,Cookie:cookie.split(';')[0]},body:JSON.stringify({account:{chain,address:OPERATOR},proof:{payload:payload.payload,signature:Buffer.alloc(64).toString('base64')}})});check('forged proof rejected on '+chain,r.status===401);}
check('pages.dev Origin cannot use custom-domain challenge',(await request('/api/proof/challenge',{method:'POST',headers:{...headers,Origin:'https://anlgram-testnet-preparation.pages.dev'},body:'{}'})).status===403);
check('Mainnet query override blocked',(await request('/api/config?network=-239')).status===400);
for(const path of ['/api/sendTransaction','/api/sendBoc','/api/deploy','/_worker.js','/proof.mjs','/wrangler.toml'])check('closed route '+path,(await request(path)).status===404);
check('financial operation authorization absent',(await request('/api/operation/claim',{method:'POST',headers,body:'{}'})).status===403);
const balance=await request('/api/operator');evidence.balance={http:balance.status,...JSON.parse(balance.text)};
evidence.ownershipEvidence='testnet-domain-owner-proof.json';
evidence.liveBalancePassed=balance.status===200;
evidence.remainingFailure=balance.status===200?null:'Read-only provider unavailable; no financial authorization allowed';
writeFileSync(new URL('../docs/launchpad/testnet-domain-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
check('live operator balance',balance.status===200&&evidence.balance.network==='-3'&&evidence.balance.address===OPERATOR&&/^\d+$/.test(evidence.balance.balanceNano));
evidence.ownershipEvidence='testnet-domain-owner-proof.json';
writeFileSync(new URL('../docs/launchpad/testnet-domain-verification.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({origin,passed:evidence.checks.length,failed:0,tls:evidence.tls,balance:evidence.balance},null,2));
