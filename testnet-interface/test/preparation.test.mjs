import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import worker, { ProofAttempt, consumeChallenge } from '../worker.mjs';
import { approvedOrigin, OPERATOR, PUBLIC_KEY } from '../config.mjs';
import { walletIdentity, proofDigest, verifySignature, verifyProof } from '../proof.mjs';
const require=createRequire(import.meta.url);
const { WalletContractV4, WalletContractV5R1 }=require('@ton/ton');
const {beginCell,storeStateInit}=require('@ton/core');
const wallet=WalletContractV5R1.create({publicKey:Buffer.from(PUBLIC_KEY,'hex'),walletId:{networkGlobalId:-3}});
const account={chain:'-3',address:OPERATOR,publicKey:PUBLIC_KEY,walletStateInit:beginCell().store(storeStateInit(wallet.init)).endCell().toBoc().toString('base64')};
const origin='https://testnet.anlgram.com';
const env={APP_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('asset')}};
const request=(path,options={})=>new Request(origin+path,options);
const challenge={payload:'a'.repeat(64),createdAt:1000,expiresAt:1300};
const proof={payload:challenge.payload,timestamp:1000,domain:{value:'testnet.anlgram.com',lengthBytes:19},signature:Buffer.alloc(64).toString('base64')};

test('only the reserved isolated HTTPS origin is accepted',()=>{
  assert.equal(approvedOrigin(origin).origin,origin);
  for(const url of ['https://anlgram.com','http://testnet.anlgram.com','https://testnet.anlgram.com.evil.test','https://testnet.anlgram.com/'])assert.throws(()=>approvedOrigin(url));
});
test('known V5 Testnet StateInit independently derives exact operator/public key',()=>assert.equal(walletIdentity(account).toString('hex'),PUBLIC_KEY));
test('reject Mainnet, substituted wallet/key, malformed StateInit and unsupported wallet',()=>{
  for(const changes of [{chain:'-239'},{address:'0:'+ '1'.repeat(64)},{publicKey:'0'.repeat(64)},{walletStateInit:'AA=='}])assert.throws(()=>walletIdentity({...account,...changes}));
  for(const other of [WalletContractV4.create({workchain:0,publicKey:Buffer.from(PUBLIC_KEY,'hex')}),WalletContractV5R1.create({publicKey:Buffer.from(PUBLIC_KEY,'hex'),walletId:{networkGlobalId:-239}})])assert.throws(()=>walletIdentity({...account,walletStateInit:beginCell().store(storeStateInit(other.init)).endCell().toBoc().toString('base64')}));
});
test('V5 network-specific wallet ids and deterministic addresses are different',()=>{
  const make=id=>WalletContractV5R1.create({publicKey:Buffer.from(PUBLIC_KEY,'hex'),walletId:{networkGlobalId:id}});
  const t=make(-3),m=make(-239);assert.notEqual(t.address.toRawString(),m.address.toRawString());
  const id=w=>{const d=w.init.data.beginParse();d.loadBit();d.loadUint(32);return d.loadInt(32);};
  assert.equal(id(t),2147483645);assert.equal(id(m),2147483409);
  assert.equal(t.address.toRawString(),'0:8119eb76ff64af554ad7fcc64bd30d0eb8faa56c9b651d3de76e959a107d9061');
});
test('real Ed25519 verification binds digest to domain, address, timestamp and challenge (synthetic key)',async()=>{
  // Synthetic in-memory test key; never the operator key, no chain transaction.
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const pk=publicKey.export({format:'der',type:'spki'}).subarray(-32);
  const digest=await proofDigest(OPERATOR,proof),sig=sign(null,Buffer.from(digest),privateKey);
  assert.equal(await verifySignature(pk,sig,digest),true);
  for(const changed of [{...proof,payload:'b'.repeat(64)},{...proof,timestamp:1001},{...proof,domain:{value:'anlgram.com'}}])assert.equal(await verifySignature(pk,sig,await proofDigest(OPERATOR,changed)),false);
  assert.equal(await verifySignature(pk,sig,await proofDigest('0:'+ '1'.repeat(64),proof)),false);
});
test('operator proof fails closed on forged, expired, future, replayed, wrong-domain and wrong-network evidence',async()=>{
  const body={account,proof};
  for(const [b,c,now] of [[body,challenge,1001],[body,{...challenge,used:true},1001],[body,challenge,1300],[{...body,proof:{...proof,timestamp:1500}},challenge,1001],[{...body,proof:{...proof,domain:{value:'anlgram.com',lengthBytes:11}}},challenge,1001],[{...body,account:{...account,chain:'-239'}},challenge,1001],[body,null,1001]])assert.equal(await verifyProof(b,c,'testnet.anlgram.com',now),false);
});
test('atomic challenge consumption credits only once, rejects expiration and other attempts',async()=>{
  let current={...challenge},queue=Promise.resolve();
  const tx={get:async()=>current,put:async(k,v)=>{current=v;}};
  const storage={transaction:fn=>{const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next;}};
  assert.deepEqual(await Promise.all([consumeChallenge(storage,challenge,1001),consumeChallenge(storage,challenge,1001)]),[true,false]);
  current={...challenge};assert.equal(await consumeChallenge(storage,{...challenge,payload:'b'.repeat(64)},1001),false);
  assert.equal(await consumeChallenge(storage,challenge,1300),false);
});
test('manifest/config use exact isolated origin and remain financially disabled',async()=>{
  const manifest=await (await worker.fetch(request('/tonconnect-manifest.json'),env)).json();
  assert.equal(manifest.url,origin+'/');assert.equal(manifest.iconUrl,origin+'/icon.png');
  const r=await worker.fetch(request('/api/config'),env),config=await r.json();
  assert.equal(config.network,'-3');assert.equal(config.financialSigningEnabled,false);
  assert.equal(config.replayIsolationVerified,false);assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
});
test('production origin, query overrides and all transaction routes are rejected',async()=>{
  assert.equal((await worker.fetch(new Request('https://anlgram.com/api/config'),env)).status,403);
  assert.equal((await worker.fetch(request('/api/config?network=-239'),env)).status,400);
  for(const path of ['/api/sendBoc','/api/deploy','/api/sendTransaction','/api/rpc'])assert.equal((await worker.fetch(request(path,{method:'POST'}),env)).status,404);
  assert.equal((await worker.fetch(request('/api/config'),{...env,APP_ORIGIN:'https://anlgram.com'})).status,503);
});
test('challenge requires same-origin JSON; login cookie is secure, HttpOnly and host scoped',async()=>{
  const r=await worker.fetch(request('/api/proof/challenge',{method:'POST',body:'{}'}),env);assert.equal(r.status,403);
  const bound={...env,PROOFS:{idFromName:id=>id,get:()=>({fetch:async()=>new Response('{}')})}};
  const response=await worker.fetch(request('/api/proof/challenge',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),bound);
  assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/^__Host-.*Secure; HttpOnly; SameSite=Strict/);
  assert.equal((await worker.fetch(request('/api/proof/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),bound)).status,401);
});
test('oversized and malformed proof inputs fail closed before storage',async()=>{
  const opts=body=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
  assert.equal((await worker.fetch(request('/api/proof/challenge',opts('x'.repeat(24001))),env)).status,413);
  assert.equal((await worker.fetch(request('/api/proof/challenge',opts('invalid')),env)).status,400);
});
test('challenge object creates bounded expiry and rejects forged proof without consuming',async()=>{
  const values=new Map();let alarm;
  const object=new ProofAttempt({storage:{put:async(k,v)=>values.set(k,v),get:async k=>values.get(k),setAlarm:async v=>{alarm=v;},deleteAll:async()=>values.clear()}});
  const reply=await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'create'})}));
  const value=await reply.json();assert.match(value.payload,/^[a-f0-9]{64}$/);assert.equal(alarm,value.expiresAt*1000);
  const result=await object.fetch(new Request('https://internal/',{method:'POST',body:JSON.stringify({action:'verify',domain:'testnet.anlgram.com',proofBody:{account,proof}})}));
  assert.equal(result.status,401);assert.equal(values.get('challenge').used,false);
  await object.alarm();assert.equal(values.size,0);
});
test('published browser package contains no transaction/sign-data API or remote script',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/sendTransaction|sendBoc|signData|signMessage/);
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/TESTNET ONLY/);assert.doesNotMatch(html,/<script[^>]+src=["']https?:/);
});
