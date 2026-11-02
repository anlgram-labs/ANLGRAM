import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {Cell,loadStateInit} from '@ton/core';
import historical from '../../docs/launchpad/curve-two-reconciliation-2026-11-01.json' with {type:'json'};
import candidate from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {pinned} from '../recovery/policy.mjs';
test('actual compiled recovery observer routes through workerd with local controlled provider responses and preserves SQLite legacy record',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'anlgram-recovery-runtime-')),repo=fileURLToPath(new URL('../',import.meta.url)).replaceAll('\\','/'),entry=join(dir,'fixture.mjs');
 writeFileSync(entry,`import {RecoveryRuntime} from '${repo}recovery/runtime.mjs';export class Fixture {constructor(state,env){this.state=state;this.env=env}async fetch(req){try{const b=await req.json();if(b.seed){await this.state.storage.put('original',b.seed.lock);await this.state.storage.put('accounts',b.seed.accounts);}const accounts=await this.state.storage.get('accounts');const env={TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const q=await r.json();return Response.json({network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now(),account:accounts[q.account]})}})}};return await new RecoveryRuntime(this.state.storage,env,()=>this.state.storage.get('original')).fetch({action:'observe'});}catch(e){return Response.json({error:e.message,stack:e.stack},{status:503})}}}export default{fetch(){return new Response('No financial routes',{status:404})}};`);
 writeFileSync(join(dir,'wrangler.json'),JSON.stringify({name:'local-recovery-observer-test',main:entry,compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat']}));
 execFileSync(process.execPath,[join(repo,'node_modules/wrangler/bin/wrangler.js'),'deploy','--config',join(dir,'wrangler.json'),'--dry-run','--outdir',join(dir,'build')],{cwd:repo,stdio:'pipe'});
 const source=historical.providers.toncenter.account,m=loadStateInit(Cell.fromBase64(candidate.smokePlan.steps[0].message.stateInit).beginParse()),lock={operation:pinned.oldOperation,state:'LOCKED_PENDING_RECONCILIATION',fingerprint:pinned.oldFingerprint,validUntil:pinned.oldValidUntil,claimedAt:pinned.oldClaimedAt};
 const other={address:pinned.operator,status:'active',balance:source.balance,code:Cell.fromBase64(source.code).toBoc().toString('hex'),data:Cell.fromBase64(source.data).toBoc().toString('hex'),last_transaction_hash:Buffer.from(source.last_transaction_id.hash,'base64').toString('hex')};
 const options=convertV4MiniflareOptions({rootPath:join(dir,'build'),scriptPath:join(dir,'build/fixture.js'),modules:true,compatibilityDate:'2026-10-30',compatibilityFlags:['nodejs_compat'],durableObjects:{RECOVERY_FIXTURE:{className:'Fixture',useSQLite:true}},outboundService:async r=>{assert.equal(r.url,'https://testnet.tonapi.io/v2/blockchain/accounts/'+pinned.operator);return Response.json(other);}});
 const mf=new Miniflare(options);try{const ns=await mf.getDurableObjectNamespace('RECOVERY_FIXTURE'),stub=ns.get(ns.idFromName('one-wallet-and-destination'));
  const seed={lock,accounts:{operator:source,minter:{state:'active',code:m.code.toBoc().toString('base64'),data:m.data.toBoc().toString('base64')},curve:{state:'uninitialized',code:'',balance:'0'}}};
  for(const body of [{seed},{}]){const r=await stub.fetch(new Request('https://local/',{method:'POST',body:JSON.stringify(body)})),j=await r.json();assert.equal(r.status,200,JSON.stringify(j));assert.equal(j.currentChain.seqno,1);assert.equal(j.currentChain.lastTransactionHash,other.last_transaction_hash);assert.equal(j.independentFinalityVerified,false);assert.equal(j.financialSigningEnabled,false);assert.deepEqual(j.originalLock,lock);}
 }finally{await mf.dispose();}
});
