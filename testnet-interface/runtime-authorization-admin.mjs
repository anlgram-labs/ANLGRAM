// Administrator-only CLI. NEVER imported by the browser or included in Pages assets.
// The key arrives over stdin from the current user's DPAPI credential, not argv/logs.
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {curveAuthorization,RUNTIME_MODE} from './curve-authorization.mjs';
const target='https://testnet.anlgram.com/api/curve-two/authorize';
try{
 const secret=readFileSync(0,'utf8').trim();
 if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid administrative credential');
 const raw=readFileSync(process.argv[2],'utf8').trim(),grant=curveAuthorization({CURVE_TX2_SIGNING_AUTH:raw});
 if(grant?.mode!==RUNTIME_MODE)throw Error('Reviewed finite runtime grant required');
 const signature=createHmac('sha256',secret).update('ANLGRAM_CURVE_AUTH_V1\n'+target+'\n'+raw).digest('hex');
 // Exactly one administrative POST, no redirects, no retry. This does NOT invoke TON Connect.
 const r=await fetch(target,{method:'POST',headers:{Origin:'https://testnet.anlgram.com','Content-Type':'application/json','X-Curve-Authorization':signature},body:raw,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Administrative grant rejected: HTTP '+r.status);
 const j=await r.json();if(j.stored!==true||j.notAfter!==grant.notAfter)throw Error('Unexpected administrative response; reconcile without retry');
 console.log(JSON.stringify({stored:true,notAfter:j.notAfter,financialRequestMade:false}));
}catch(e){console.error(e.message);process.exitCode=1;}
