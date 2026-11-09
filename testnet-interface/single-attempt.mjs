import execution from './execution-version.json' with {type:'json'};
import * as minterPolicy from './minter-policy.mjs';
import * as curvePolicy from './curve-policy.mjs';
const executing=new Set();
async function api(path,body,signal){
 if(signal?.aborted)throw Error('Operation expired or aborted');
 const controller=new AbortController(),forward=()=>controller.abort();signal?.addEventListener('abort',forward,{once:true});
 const timer=setTimeout(()=>controller.abort(),5000);
 const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Operation request aborted')),{once:true}));
 try{const r=await Promise.race([fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',redirect:'manual',signal:controller.signal}),aborted]);
  if(!r.ok)throw Error('Operation refused: '+r.status);return await Promise.race([r.json(),aborted]);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
export async function guardedMinterSend(tx,wallet,options,invoke){
 let policy;try{minterPolicy.validateIntent(tx);policy=minterPolicy;}catch{curvePolicy.validateIntent(tx);policy=curvePolicy;}
 const {intent,validateIntent,fingerprint}=policy,isCurve=policy===curvePolicy,prefix=isCurve?'/api/curve-two':'/api/operation';
 validateIntent(tx);
 Object.freeze(tx.messages[0]);Object.freeze(tx.messages);Object.freeze(tx);
 if(!['https://testnet.anlgram.com','https://anlgram-testnet-preparation.pages.dev'].includes(location.origin))throw Error('Wrong signing origin');
 if(wallet?.account?.chain!==intent.network||wallet.account.address!==intent.operator||wallet.provider!=='http')throw Error('Unapproved wallet/transport');
 if(wallet.account.publicKey!==undefined&&wallet.account.publicKey.toLowerCase()!==intent.publicKey)throw Error('Wrong key');
 if(isCurve&&(location.origin!=='https://testnet.anlgram.com'||wallet.account.publicKey?.toLowerCase()!==intent.publicKey||typeof wallet.account.walletStateInit!=='string'))throw Error('Exact Curve signing account required');
 const walletAccount=isCurve?{chain:wallet.account.chain,address:wallet.account.address,publicKey:wallet.account.publicKey,walletStateInit:wallet.account.walletStateInit}:undefined;
 if(executing.has(intent.operation))throw Error('Operation already invoked in this page');
 const supplied=typeof options==='function'?{onRequestSent:options}:options||{};
 if(Object.keys(supplied).some(k=>!['onRequestSent','signal'].includes(k)))throw Error('Unsupported signing options');
 if(supplied.signal?.aborted)throw Error('Aborted before claim');
 // Same-page guard precedes asynchronous hashing/claim. Server lock covers other
 // tabs/devices/reloads and is never released automatically on ANY result.
 executing.add(intent.operation);
 const controller=new AbortController();let timer,abortListener,claim;
 try{
  abortListener=()=>controller.abort();supplied.signal?.addEventListener('abort',abortListener,{once:true});
  timer=setTimeout(()=>controller.abort(),Math.max(0,tx.validUntil*1000-Date.now()));
  const hash=await fingerprint(tx);
  claim=await api(prefix+'/claim',{transaction:tx,fingerprint:hash,...(isCurve?{walletAccount,runtimeVersion:execution.sha256}:{})},controller.signal);
  if(isCurve&&claim.runtimeVersion!==execution.sha256)throw Error('Incompatible Curve runtime; claim outcome requires reconciliation');
  if(claim.claimed!==true||claim.fingerprint!==hash||typeof claim.ticket!=='string'||!/^[a-f0-9]{64}$/.test(claim.ticket))throw Error('Invalid persistent claim');
  validateIntent(tx);if(controller.signal.aborted||supplied.signal?.aborted)throw Error('Aborted after claim');
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Operation outcome unknown after abort/expiry')),{once:true}));
  let notified=false;
  const result=await Promise.race([Promise.resolve().then(()=>invoke({signal:controller.signal,onRequestSent:()=>{if(!notified){notified=true;supplied.onRequestSent?.();}}})),aborted]);
  // A BOC is not delivery/finality. Never clear the lock or claim deployment.
  await api(prefix+'/record',{ticket:claim.ticket,event:'WALLET_RESPONSE_UNVERIFIED'},controller.signal).catch(()=>{});
  return result;
 }catch(e){
  controller.abort();
  if(claim?.ticket)await api(prefix+'/record',{ticket:claim.ticket,event:'UNKNOWN_OR_REJECTED'}).catch(()=>{});
  throw e;
 }finally{
  clearTimeout(timer);if(abortListener)supplied.signal?.removeEventListener('abort',abortListener);
  // Deliberately no executing.delete, lock reset, resubmit or financial retry.
 }
}
