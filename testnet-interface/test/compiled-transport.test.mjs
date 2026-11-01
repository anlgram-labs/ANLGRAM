import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {createServer} from 'node:http';
import {build as esbuild} from 'esbuild';
import {createRequire} from 'node:module';
import {SessionCrypto} from '@tonconnect/protocol';
import {FinancialOperation} from '../operation-lock.mjs';
import {intent} from '../minter-policy.mjs';
import {intent as curveIntent} from '../curve-policy.mjs';
import {CurveFinancialOperation} from '../curve-operation.mjs';
const bundle=readFileSync(new URL('../public/tonconnect-ui.min.js',import.meta.url),'utf8');
const build=JSON.parse(readFileSync(new URL('../client-build.json',import.meta.url)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const require=createRequire(import.meta.url),core=require('@ton/core'),{WalletContractV5R1}=require('@ton/ton');
async function unsignedWalletResponse(validUntil,intent,curve=false){
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(intent.publicKey,'hex'),walletId:{networkGlobalId:-3}}),m=intent.message,to=core.Address.parseFriendly(m.address);
 const body=await wallet.createTransfer({seqno:curve?1:0,timeout:validUntil,authType:'external',sendMode:3,messages:[core.internal({to:to.address,value:BigInt(m.amount),bounce:to.isBounceable,init:core.loadStateInit(core.Cell.fromBase64(m.stateInit).beginParse()),body:core.Cell.fromBase64(m.payload)})],signer:async()=>Buffer.alloc(64)});
 return core.beginCell().store(core.storeMessage(core.external({to:wallet.address,init:curve?null:wallet.init,body}))).endCell().toBoc().toString('base64');
}
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await pause(2);}throw Error('Controlled handshake timeout');}
function persistentStore(){
 const values=new Map();let queue=Promise.resolve();
 const tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v))};
 return{...tx,transaction(fn){const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next;},values};
}
async function harness({curve=false,mode='success',store=persistentStore(),claimDenied=false,claimLost=false,claimHanging=false,claimBodyHanging=false,recordLost=false,recordHanging=false,chain='-3',account=intent.operator,bundleOverride=null,control=false}={}){
 const selected=curve?curveIntent:intent;
 const walletCrypto=new SessionCrypto(),streams=[],posts=[],decoded=[],events=[];let dappId,walletResultBoc;
 const operation=new (curve?CurveFinancialOperation:FinancialOperation)({storage:store});
 class EventSource {
  static OPEN=1;static CONNECTING=0;static CLOSED=2;
  constructor(url){this.url=url;this.readyState=0;streams.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.({});},1);}
  close(){this.readyState=2;}
 }
 const incoming=payload=>{
  const bytes=walletCrypto.encrypt(JSON.stringify(payload),Uint8Array.from(Buffer.from(dappId,'hex')));
  streams.at(-1).onmessage?.({data:JSON.stringify({from:walletCrypto.sessionId,message:Buffer.from(bytes).toString('base64')}),lastEventId:String(Date.now())});
 };
 let localOrigin;
 const server=createServer(async(req,res)=>{
  try{
   assert.equal(req.method,'POST');const parsed=new URL(req.url,localOrigin),chunks=[];for await(const chunk of req)chunks.push(chunk);const encrypted=Buffer.concat(chunks).toString();
   posts.push({url:parsed.href,body:encrypted});
   const request=JSON.parse(walletCrypto.decrypt(Uint8Array.from(Buffer.from(encrypted,'base64')),Uint8Array.from(Buffer.from(dappId,'hex'))));decoded.push(request);
   assert.equal(request.method,'sendTransaction');assert.equal(parsed.searchParams.get('to'),walletCrypto.sessionId);if(!control)assert(Number(parsed.searchParams.get('ttl'))<=120);
   const tx=JSON.parse(request.params[0]);assert.equal(tx.network,'-3');assert.equal(tx.from,selected.operator);assert.equal(tx.messages.length,1);assert.equal(tx.messages[0].amount,'100000000');
   assert.equal(tx.messages[0].stateInit,selected.message.stateInit);assert.equal(tx.messages[0].payload,selected.message.payload);
   if(mode==='failed'){res.writeHead(500).end('fixture failure');return;}
   if(mode==='redirect'){parsed.searchParams.set('redirected','1');res.writeHead(307,{Location:parsed.href}).end();return;}
   walletResultBoc=await unsignedWalletResponse(tx.valid_until,selected,curve); // realistic external shape, INVALID zero signature; no wallet signed
   if(mode==='lost'){setTimeout(()=>incoming({id:request.id,result:walletResultBoc}),5);res.destroy();return;}
   if(mode==='hanging')return;
   res.writeHead(200).end('');if(mode==='timeout')return;
   setTimeout(()=>{const response=mode==='rejected'?{id:request.id,error:{code:300,message:'Fixture user rejection'}}:{id:request.id,result:walletResultBoc};incoming(response);if(mode==='duplicate')incoming(response);},5);
  }catch(e){events.push(e);res.writeHead(500).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));localOrigin='http://127.0.0.1:'+server.address().port;
 const fetch=async(url,options={})=>{
  const u=String(url);
  if(u===(curve?'/api/curve-two/claim':'/api/operation/claim')){
   if(claimDenied)return Response.json({error:'No owner financial approval'},{status:403});
   const response=await operation.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({...JSON.parse(options.body),action:'claim'})}));
   if(claimLost)throw Error('Claim response lost after persistent commit');if(claimHanging)return new Promise(()=>{});if(claimBodyHanging)return new Response(new ReadableStream({start(){}}),{status:200,headers:{'Content-Type':'application/json'}});return response;
  }
  if(u===(curve?'/api/curve-two/record':'/api/operation/record')){
   if(recordLost)throw Error('lost record response');
   if(recordHanging)return new Promise(()=>{});
   return operation.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({...JSON.parse(options.body),action:'record'})}));
  }
  if(u.startsWith('https://bridge.fixture.test/bridge/message')){
   const parsed=new URL(u);if(parsed.searchParams.get('topic')!=='sendTransaction')throw Error('Unexpected RPC topic');
   if(!control)assert.equal(options.redirect,'manual');
   // The bridge is a real loopback HTTP server. Counters increment on received
   // POSTs, not on UI calls or fetch invocations. Only the test DNS is remapped.
   return globalThis.fetch(localOrigin+parsed.pathname+parsed.search,options);
  }
  throw Error('Unapproved controlled network request '+u);
 };
 const quiet={log(){},debug(){},warn(){},error(){},info(){}};
 const context=vm.createContext({console:quiet,crypto:webcrypto,Uint8Array,ArrayBuffer,CustomEvent,Event,TextEncoder,TextDecoder,URL,AbortController,AbortSignal,Response,Request,Headers,fetch,EventSource,queueMicrotask,
  // Accelerates timeout and the old SDK's 5s retry delay; a retrying bundle would
  // produce extra counted POSTs before the accelerated expiry aborts it.
  setTimeout:(fn,ms,...args)=>setTimeout(fn,ms===5000&&!fn.toString().includes('abort')?2:Math.min(ms,500),...args),clearTimeout,setInterval,clearInterval,atob,btoa,
  location:{origin:'https://testnet.anlgram.com'},navigator:{userAgent:'controlled-transport-fixture'}});
 context.self=context;
 vm.runInContext(bundleOverride||bundle,context,{filename:control?'UNPATCHED-NEGATIVE-CONTROL.js':'ACTUAL-published-client-bundle.js'});
 const data=new Map(),storage={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{data.set(k,v);},removeItem:async k=>{data.delete(k);}};
 const sdk=new context.TON_CONNECT_UI.TonConnect({manifestUrl:'https://testnet.anlgram.com/tonconnect-manifest.json',storage});
 let connected;sdk.onStatusChange(w=>{if(w)connected=w;});
 const link=sdk.connect({bridgeUrl:'https://bridge.fixture.test/bridge',universalLink:'https://wallet.fixture.test/connect'});
 dappId=new URL(link).searchParams.get('id');assert.match(dappId,/^[a-f0-9]{64}$/);
 await until(()=>streams.length&&streams.at(-1).readyState===1);
 incoming({event:'connect',id:1,payload:{items:[{name:'ton_addr',address:account,network:chain,publicKey:selected.publicKey,walletStateInit:(selected.walletStateInit||intent.walletStateInit)}],device:{platform:'iphone',appName:'Tonkeeper',appVersion:'26.10.4',maxProtocolVersion:2,features:[{name:'SendTransaction',maxMessages:1}]}}});
 await until(()=>connected);assert.equal(connected.provider,'http');
 const transaction=()=>({network:'-3',from:selected.operator,validUntil:Math.floor(Date.now()/1000)+60,messages:[structuredClone(selected.message)]});
 return{sdk,posts,decoded,store,events,streams,transaction,incoming,get walletResultBoc(){return walletResultBoc;},close:async()=>{sdk.pauseConnection();server.closeAllConnections();await new Promise(r=>server.close(r));assert.deepEqual(events,[]);}};
}
test('tested client is the exact application bundle with one pinned patched SDK',()=>{
 assert.equal(createHash('sha256').update(bundle).digest('hex'),build.bundleSha256);assert.equal(build.patchedModules,1);assert.equal(build.sdk,'3.3.1');assert.equal(build.ui,'2.3.1');
});
test('actual encrypted SDK path: success, exactly ONE outbound financial HTTP POST',async()=>{
 const h=await harness();try{let callbacks=0;const tx=h.transaction(),r=await h.sdk.sendTransaction(tx,{onRequestSent:()=>callbacks++});assert.equal(r.boc,h.walletResultBoc);assert.equal(core.loadMessage(core.Cell.fromBase64(r.boc).beginParse()).info.dest.toRawString(),intent.operator);await pause(150);assert.equal(h.posts.length,1);assert.equal(h.decoded.length,1);assert.equal(callbacks,1);assert.equal(JSON.parse(h.decoded[0].params[0]).valid_until,tx.validUntil);assert(h.store.values.has('operation'));}finally{await h.close();}
});
for(const mode of ['failed','redirect','lost','timeout','hanging','rejected'])test('actual compiled SDK '+mode+': ONE POST, locked, no automatic resend',async()=>{
 const h=await harness({mode});try{await assert.rejects(h.sdk.sendTransaction(h.transaction()));await pause(150);assert.equal(h.posts.length,1);assert.equal(h.store.values.get('operation').status,'LOCKED_PENDING_RECONCILIATION');await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('concurrent clicks: one claim and ONE POST',async()=>{
 const h=await harness();try{const results=await Promise.allSettled([h.sdk.sendTransaction(h.transaction()),h.sdk.sendTransaction(h.transaction())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('two concurrent client instances/tabs share one persistent lifetime claim',async()=>{
 const store=persistentStore(),a=await harness({store}),b=await harness({store});try{const results=await Promise.allSettled([a.sdk.sendTransaction(a.transaction()),b.sdk.sendTransaction(b.transaction())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.posts.length+b.posts.length,1);}finally{await a.close();await b.close();}
});
test('reload/new client instance cannot clear persistent operation lock',async()=>{
 const store=persistentStore(),first=await harness({store,mode:'lost'});await assert.rejects(first.sdk.sendTransaction(first.transaction()));await first.close();const next=await harness({store});try{await assert.rejects(next.sdk.sendTransaction(next.transaction()));assert.equal(first.posts.length,1);assert.equal(next.posts.length,0);}finally{await next.close();}
});
test('duplicate wallet responses/callbacks do not create another financial POST',async()=>{
 const h=await harness({mode:'duplicate'});try{let sent=0;await h.sdk.sendTransaction(h.transaction(),{onRequestSent:()=>sent++});await pause(150);assert.equal(h.posts.length,1);assert.equal(sent,1);}finally{await h.close();}
});
test('lost operation record response preserves the claimed lock',async()=>{
 const store=persistentStore(),h=await harness({store,recordLost:true});try{await h.sdk.sendTransaction(h.transaction());assert.equal(h.posts.length,1);assert(store.values.has('operation'));}finally{await h.close();}
});
test('lost claim acknowledgement: ZERO POSTs and persistent lock survives reload',async()=>{
 const store=persistentStore(),first=await harness({store,claimLost:true});try{await assert.rejects(first.sdk.sendTransaction(first.transaction()));assert.equal(first.posts.length,0);assert(store.values.has('operation'));}finally{await first.close();}
 const next=await harness({store});try{await assert.rejects(next.sdk.sendTransaction(next.transaction()));assert.equal(next.posts.length,0);}finally{await next.close();}
});
test('hanging claim times out with ZERO financial POSTs and leaves persistent claim locked',async()=>{
 const store=persistentStore(),h=await harness({store,claimHanging:true});try{await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,0);assert(store.values.has('operation'));}finally{await h.close();}
});
test('HTTP claim headers without completed body time out with ZERO financial POSTs',async()=>{
 const store=persistentStore(),h=await harness({store,claimBodyHanging:true});try{await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,0);assert(store.values.has('operation'));}finally{await h.close();}
});
test('hanging result-record API is bounded, never repeats the financial POST',async()=>{
 const h=await harness({recordHanging:true});try{await h.sdk.sendTransaction(h.transaction());assert.equal(h.posts.length,1);assert(h.store.values.has('operation'));}finally{await h.close();}
});
test('request becomes immutable before asynchronous approval claim',async()=>{
 const h=await harness();try{const tx=h.transaction(),pending=h.sdk.sendTransaction(tx);assert.throws(()=>{tx.messages[0].amount='100000001';});assert.throws(()=>{tx.validUntil++;});await pending;assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('wallet disconnect after request does not resend finance',async()=>{
 const h=await harness({mode:'timeout'});try{const pending=h.sdk.sendTransaction(h.transaction());await until(()=>h.posts.length===1);h.incoming({event:'disconnect',id:2,payload:{}});await assert.rejects(pending);assert.equal(h.posts.length,1);await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('normal SSE reconnection preserves session without replaying the financial POST',async()=>{
 const h=await harness({mode:'timeout'});try{const pending=h.sdk.sendTransaction(h.transaction());await until(()=>h.posts.length===1);const count=h.streams.length;h.sdk.pauseConnection();h.sdk.unPauseConnection();await until(()=>h.streams.length>count&&h.streams.at(-1).readyState===1);await assert.rejects(pending);assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('missing financial authorization and wrong Mainnet account produce ZERO bridge POSTs',async()=>{
 for(const options of [{claimDenied:true},{chain:'-239'},{account:'0:'+ '1'.repeat(64)}]){const h=await harness(options);try{await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,0);}finally{await h.close();}}
});
test('changed messages, StateInit, amount, expiry or network produce ZERO bridge POSTs',async()=>{
 const h=await harness();try{for(const mutate of [t=>t.network='-239',t=>t.from='0:'+ '1'.repeat(64),t=>t.messages.push(t.messages[0]),t=>t.messages[0].amount='100000001',t=>t.messages[0].stateInit='AA==',t=>t.messages[0].payload='AA==',t=>t.validUntil=0,t=>t.validUntil+=1000]){const tx=h.transaction();mutate(tx);await assert.rejects(h.sdk.sendTransaction(tx));}assert.equal(h.posts.length,0);}finally{await h.close();}
});
test('independent UNPATCHED SDK control really repeats HTTP delivery with the SAME RPC ID',async t=>{
 const result=await esbuild({stdin:{contents:"export {TonConnect} from '@tonconnect/sdk';",resolveDir:new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')},bundle:true,platform:'browser',format:'iife',globalName:'TON_CONNECT_UI',write:false,minify:true});
 const h=await harness({mode:'failed',control:true,bundleOverride:result.outputFiles[0].text}),controller=new AbortController();
 try{const pending=h.sdk.sendTransaction(h.transaction(),{signal:controller.signal});setTimeout(()=>controller.abort(),100);await assert.rejects(pending);assert(h.posts.length>1,'Unpatched negative control must expose multiple actual POSTs');assert.equal(new Set(h.decoded.map(r=>r.id)).size,1);t.diagnostic('Unpatched received POSTs='+h.posts.length+'; repeated transport RPC ID, NOT measured on-chain executions.');}finally{await h.close();}
});

for(const mode of ['success','failed','lost','timeout','duplicate'])test('Curve #2 actual bundle '+mode+': one encrypted POST, permanent independent lock',async()=>{
 const h=await harness({curve:true,mode});try{let callbacks=0;const pending=h.sdk.sendTransaction(h.transaction(),{onRequestSent:()=>callbacks++});if(['success','duplicate'].includes(mode))await pending;else await assert.rejects(pending);await pause(150);assert.equal(h.posts.length,1);assert.equal(callbacks,['failed','lost'].includes(mode)?0:1);assert.equal(h.store.values.get('operation').status,'LOCKED_PENDING_RECONCILIATION');await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,1);}finally{await h.close();}
});
test('Curve #2 concurrent tabs and reload retain exactly one claim',async()=>{
 const store=persistentStore(),a=await harness({curve:true,store}),b=await harness({curve:true,store});try{const rs=await Promise.allSettled([a.sdk.sendTransaction(a.transaction()),b.sdk.sendTransaction(b.transaction())]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.posts.length+b.posts.length,1);}finally{await a.close();await b.close();}
 const next=await harness({curve:true,store});try{await assert.rejects(next.sdk.sendTransaction(next.transaction()));assert.equal(next.posts.length,0);}finally{await next.close();}
});
test('Curve #2 wrong network/StateInit/body/account and absent approval produce zero POSTs',async()=>{
 for(const options of [{chain:'-239'},{account:'0:'+'1'.repeat(64)},{claimDenied:true}]){const h=await harness({curve:true,...options});try{await assert.rejects(h.sdk.sendTransaction(h.transaction()));assert.equal(h.posts.length,0);}finally{await h.close();}}
 const h=await harness({curve:true});try{for(const change of [t=>t.network='-239',t=>t.messages[0].stateInit=intent.message.stateInit,t=>t.messages[0].payload='AA==',t=>t.messages[0].amount='100000001']){const tx=h.transaction();change(tx);await assert.rejects(h.sdk.sendTransaction(tx));}assert.equal(h.posts.length,0);}finally{await h.close();}
});
test('Curve #2 lost persistent claim acknowledgement produces zero POSTs across reload',async()=>{
 const store=persistentStore(),a=await harness({curve:true,store,claimLost:true});try{await assert.rejects(a.sdk.sendTransaction(a.transaction()));assert.equal(a.posts.length,0);}finally{await a.close();}
 const b=await harness({curve:true,store});try{await assert.rejects(b.sdk.sendTransaction(b.transaction()));assert.equal(b.posts.length,0);}finally{await b.close();}
});
