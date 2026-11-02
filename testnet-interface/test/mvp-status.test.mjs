import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {beginCell,Cell,loadStateInit,Address} from '@ton/core';
import {analyzeStatus,readMvpStatus} from '../mvp-status.mjs';
import {TestnetReads} from '../testnet-rpc.mjs';
import worker from '../worker.mjs';
import p from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
function fixture({renounced=false,supply=0n}={}){
 const init=loadStateInit(Cell.fromBase64(p.smokePlan.steps[0].message.stateInit).beginParse()),data=beginCell().storeCoins(supply).storeAddress(renounced?null:Address.parse(p.wallet.raw)).storeRef(init.data.refs[0]).storeRef(init.data.refs[1]).endCell();
 const env=value=>({network:'-3',authentication:'TESTNET_KEY_ACCEPTED',dataStatus:'FRESH_PROVIDER_OBSERVATION',observedAt:Date.now(),...value}),c=x=>['cell',{bytes:x.toBoc().toString('base64')}];
 return{minter:env({account:{state:'active',code:init.code.toBoc().toString('base64'),data:data.toBoc().toString('base64')}}),jettonData:env({getterResult:{exit_code:0,stack:[['num','0x'+supply.toString(16)],['num','-0x1'],c(beginCell().storeAddress(renounced?null:Address.parse(p.wallet.raw)).endCell()),c(init.data.refs[0]),c(init.data.refs[1])]}}),curve:env({account:{state:'uninitialized',code:'',balance:'0'}}),curveWallet:env({account:{state:'uninitialized',code:'',balance:'0'}}),buyerWallet:env({account:{state:'uninitialized',code:'',balance:'0'}})};
}
test('read-only lifecycle shows actual zero supply and unknown undeployed wallet balances, never fabricated custody or transaction success',()=>{
 const j=analyzeStatus(fixture());assert.equal(j.network,'-3');assert.equal(j.stage,'CURVE_NOT_DEPLOYED');assert.equal(j.minter.supplyUnits,'0');assert.equal(j.minter.decimals,9);assert.equal(j.minter.admin,p.wallet.raw);assert.equal(j.curveWallet.balanceUnits,null);assert.equal(j.buyerWallet.custodyVerified,false);assert.equal(j.transactionOutcome,'NOT_VERIFIED_BY_ACCOUNT_SNAPSHOT');assert.equal(j.financialSigningEnabled,false);assert.equal(j.migrationEnabled,false);assert.equal(j.lpWithdrawalsEnabled,false);
});
test('renounced storage is authoritative even though the deployed legacy getter reports constant mintable -1',()=>{
 const j=analyzeStatus(fixture({renounced:true,supply:1000000000000000000n}));assert.equal(j.minter.admin,null);assert.equal(j.minter.renouncedObserved,true);assert.equal(j.minter.supplyUnits,'1000000000000000000');
});
test('foreign code/master/owner, unsupported metadata/supply and stale or anonymous data fail closed',()=>{
 for(const mutate of [s=>s.minter.authentication='ANONYMOUS',s=>s.curve.network='-239',s=>s.minter.observedAt=1,s=>s.jettonData.getterResult.stack[0]=['num','0x1'],s=>s.minter.account.code=beginCell().endCell().toBoc().toString('base64'),s=>s.buyerWallet.account={state:'active',code:'bad',data:'bad'},s=>s.curve.account.state='frozen']){const s=fixture();mutate(s);assert.throws(()=>analyzeStatus(s));}
 assert.throws(()=>analyzeStatus(fixture({supply:1000000000000000001n})));
});
test('active settlement custody requires actual balance and exact owner/master/code, without counting all supply as Curve liquidity',()=>{
 const s=fixture(),init=loadStateInit(Cell.fromBase64(p.smokePlan.steps[0].message.stateInit).beginParse()),walletCode=init.data.refs[1];
 s.buyerWallet.account={state:'active',code:walletCode.toBoc().toString('base64'),data:beginCell().storeCoins(123456789012345678n).storeAddress(Address.parse(p.wallet.raw)).storeAddress(Address.parse(p.dependentAccounts.minter.raw)).storeRef(walletCode).endCell().toBoc().toString('base64')};
 const j=analyzeStatus(s);assert.equal(j.buyerWallet.balanceUnits,'123456789012345678');assert(j.buyerWallet.custodyVerified);assert.equal(j.curve.reserves,null);
 s.buyerWallet.account.data=beginCell().storeCoins(1).storeAddress(Address.parse(p.dependentAccounts.curve.raw)).storeAddress(Address.parse(p.dependentAccounts.minter.raw)).storeRef(walletCode).endCell().toBoc().toString('base64');assert.throws(()=>analyzeStatus(s),/owner/);
});
test('status reuses fixed protected scheduler, never signs, estimates fees or accepts caller-selected accounts',async()=>{
 const s=fixture(),seen=[],env={APP_ORIGIN:'https://testnet.anlgram.com',TESTNET_READS:{idFromName:n=>n,get:()=>({fetch:async r=>{const input=await r.json();seen.push(input.account);assert.equal(input.fresh,false);assert.equal(input.network,'-3');return Response.json(s[input.account]);}})}};
 const r=await worker.fetch(new Request('https://testnet.anlgram.com/api/mvp/status'),env);assert.equal(r.status,200);assert.equal((await r.json()).financialSigningEnabled,false);assert.deepEqual(seen,['minter','jettonData','curve','curveWallet','buyerWallet']);assert.equal((await worker.fetch(new Request('https://testnet.anlgram.com/api/mvp/status?network=-239'),env)).status,400);
 env.TESTNET_READS.get=()=>({fetch:async()=>Response.json({reason:'PROVIDER_RATE_LIMITED',network:'-3',dataStatus:'STALE_NOT_SERVED'},{status:429,headers:{'Retry-After':'12'}})});const failure=await readMvpStatus(env);assert.equal(failure.status,429);assert.equal(failure.headers.get('Retry-After'),'12');assert.equal((await failure.json()).account,undefined);
});
test('new wallet reads send the Pages secret only to fixed Testnet destinations',async()=>{
 const original=globalThis.fetch;try{for(const selector of ['curveWallet','buyerWallet']){
  const values=new Map(),object=new TestnetReads({storage:{get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)}},{});
  globalThis.fetch=async(url,o)=>{assert.equal(url,'https://testnet.toncenter.com/api/v2/jsonRPC');assert.equal(o.headers['X-API-Key'],'LOCAL_TESTNET_KEY_FIXTURE');const j=JSON.parse(o.body);assert.equal(j.method,'getAddressInformation');assert.equal(j.params.address,selector==='curveWallet'?p.curveJettonWallet:p.buyerJettonWallet);return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});};
  const r=await object.fetch(new Request('https://internal/',{method:'POST',headers:{'X-Internal-Testnet-Key':'LOCAL_TESTNET_KEY_FIXTURE'},body:JSON.stringify({account:selector,network:'-3',fresh:true})}));assert.equal(r.status,200);
 }}finally{globalThis.fetch=original;}
});
test('manual status UI has exact decimals, no fake balance, no wallet invocation and honest outage state',async()=>{
 const button={disabled:false},output={textContent:''};let calls=0,fail=false;const source=readFileSync(new URL('../mvp-status.js',import.meta.url),'utf8'),j=analyzeStatus(fixture());
 vm.runInNewContext(source,{document:{getElementById:id=>id==='mvp-refresh'?button:output},BigInt,AbortSignal,fetch:async url=>{calls++;assert.equal(url,'/api/mvp/status');return fail?Response.json({reason:'PROVIDER_RATE_LIMITED',retryAfterSeconds:12},{status:429}):Response.json(j);}});
 assert.equal(calls,0);await button.onclick();assert.equal(calls,1);assert.match(output.textContent,/0\.000000000 ANLTEST/);assert.match(output.textContent,/saldo no disponible/);assert.match(output.textContent,/NO confirman/);fail=true;await button.onclick();assert.match(output.textContent,/429/);assert(!output.textContent.includes('0.000000000 ANLTEST'));assert.equal(button.disabled,false);
});

test('fixed dispatch status never exposes tickets, authorization data or claims wallet response as finality',async()=>{
 const {readCurveDispatch}=await import('../mvp-status.mjs');let reads=0;const env={CURVE_OPERATIONS:{idFromName:name=>{assert.equal(name,'ANLTEST_CURVE_TX2:'+p.wallet.raw);return name},get:()=>({fetch:async r=>{reads++;assert.deepEqual(await r.json(),{action:'status'});return Response.json({status:'LOCKED_PENDING_RECONCILIATION',fingerprint:'12'.repeat(32),claimedAt:Date.now(),validUntil:123,events:['UNKNOWN_OR_REJECTED','WALLET_RESPONSE_UNVERIFIED','FAKE_FINALIZED','UNKNOWN_OR_REJECTED'],ticket:'NEVER_PUBLIC',approvalReference:{authorizationId:'NEVER_PUBLIC'}})}})}};
 const j=await readCurveDispatch(env);assert.equal(reads,1);assert.equal(j.state,'LOCKED_PENDING_RECONCILIATION');assert.equal(j.retryPermitted,false);assert.equal(j.chainOutcomeVerified,false);assert.deepEqual(j.events,['UNKNOWN_OR_REJECTED','WALLET_RESPONSE_UNVERIFIED']);assert(!JSON.stringify(j).includes('NEVER_PUBLIC'));assert(!JSON.stringify(j).includes('FAKE_FINALIZED'));
});
test('absent lock, unavailable storage and malformed status remain distinct, never permitting an automatic retry',async()=>{
 const {readCurveDispatch}=await import('../mvp-status.mjs');assert.equal((await readCurveDispatch({})).state,'UNAVAILABLE');
 for(const status of [{status:'NOT_CLAIMED'},{status:'LOCKED_PENDING_RECONCILIATION',fingerprint:'bad'},{status:'SUCCESS'}]){const env={CURVE_OPERATIONS:{idFromName:n=>n,get:()=>({fetch:async()=>Response.json(status)})}};const j=await readCurveDispatch(env);assert.equal(j.state,status.status==='NOT_CLAIMED'?'NOT_CLAIMED':'UNAVAILABLE');assert.equal(j.retryPermitted,false);assert.equal(j.chainOutcomeVerified,false);}
});
