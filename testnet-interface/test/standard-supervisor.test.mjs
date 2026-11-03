import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@ton/core';
import artifact from '../../minter-contract/build/standard-jetton-v2.compiled.json' with {type:'json'};
import {makeLocalReceipt} from './recovery-local-fixture.mjs';
import {createDraft} from '../wizard/model.mjs';
import {assertReviewedArtifacts, readStandardPreflight, StandardSupervisor, standardOperatorStorage} from '../projects/standard-supervisor.mjs';
import {exerciseStandardTransport, standardTransportEnabled, submitStandardDeployment} from '../projects/standard-transport-fixture.mjs';
import {prepareStandardTestnetRelease} from '../projects/standard-testnet-release.mjs';
import {projectProviders} from '../projects/project-providers.mjs';

import {standardApprovalBytes,verifyStandardApproval} from '../projects/standard-authorization.mjs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {sign} = require('../../minter-contract/node_modules/@ton/crypto');
const approve = (f,prepared) => ({nonce:prepared.authorizationNonce,signature:sign(
  standardApprovalBytes(prepared.manifest,prepared.identity,prepared.authorizationNonce),f.key.secretKey).toString('hex')});

const hex64 = '12'.repeat(32);
const b64Hash = cell => cell.hash().toString('base64');
const walletData = (key, seqno) => core.beginCell().storeBit(true).storeUint(seqno,32)
  .storeInt(2147483645,32).storeBuffer(Buffer.from(key,'hex')).storeBit(false).endCell();

async function fixture(name = 'Private supervisor') {
  const f = await makeLocalReceipt();
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata,{name,symbol:'SV2',creator:f.w.address.toRawString()});
  const publicKey = f.key.publicKey.toString('hex'), input = {draft,publicKey,ownerPolicyCeilingNano:'70000000'};
  const m = await prepareStandardTestnetRelease(draft,publicKey);
  const code = core.Cell.fromBase64(f.beforeCode.toBoc().toString('base64'));
  const balance = 500000000n;
  let seqno = 2, state = 'uninitialized', fail = false, traceBlock = 7, actualBlock = 7;
  const proofTime = Math.floor(Date.now()/1000);
  const proof = {chainTime:proofTime,lastTransactionLt:'10'};
  const providers = {
    async account(address) {
      assert.equal(address,m.operator.address);
      const account = core.beginCell().storeBit(true).store(core.storeAccount({
        addr:core.Address.parse(address),storageStats:{used:{cells:0n,bits:0n},storageExtra:null,lastPaid:0},
        storage:{lastTransLt:0n,balance:{coins:balance},state:{type:'active',state:{code,data:walletData(publicKey,seqno)}}}
      })).endCell();
      return {proof:{...proof,masterchainSeqno:actualBlock,masterchainRootHash:actualBlock.toString(16).padStart(64,'0'),
        accountHash:account.hash().toString('hex')},raw:{state:account.toBoc().toString('hex')}};
    },
    async observeAddress(address) { assert.equal(address,m.minter.raw); return {state,balance:'0'}; },
    async emulateUnsigned(request) {
      const msg = core.loadMessage(core.Cell.fromBase64(request.boc).beginParse());
      assert.equal(request.ignore_chksig,true);
      assert.equal(msg.init,null);
      const common = {emulated:true,end_status:'active',description:{aborted:false,compute_ph:{success:!fail,exit_code:0},
        action:{success:true,result_code:0,msgs_created:1}}};
      const next = walletData(publicKey,seqno+1), nextHash = b64Hash(next);
      const first = m.deployment.message;
      return {mc_block_seqno:traceBlock,is_incomplete:false,data_cells:{[nextHash]:next.toBoc().toString('base64')},
        transactions:{
          source:{...common,account:m.operator.address,orig_status:'active',total_fees:'1000000',
            in_msg:{message_content:{hash:b64Hash(msg.body)}},
            out_msgs:[{destination:m.minter.raw,value:'50000000',fwd_fee:'1000000',hash:'edge',
              message_content:{hash:b64Hash(core.Cell.fromBase64(first.payload))},
              init_state:{hash:b64Hash(core.Cell.fromBase64(first.stateInit))}}],
            account_state_before:{balance:String(balance),code_hash:b64Hash(code),data_hash:b64Hash(walletData(publicKey,seqno))},
            account_state_after:{balance:'448000000',code_hash:b64Hash(code),data_hash:nextHash}},
          child:{...common,account:m.minter.raw,orig_status:'nonexist',total_fees:'500000',
            out_msgs:[],in_msg:{hash:'edge'},account_state_after:{balance:'49500000',
              code_hash:Buffer.from(m.minter.codeHash,'hex').toString('base64'),
              data_hash:Buffer.from(m.minter.dataHash,'hex').toString('base64')}}
        }};
    }
  };
  return {f,input,m,providers,update(change){if(change.seqno)seqno=change.seqno;if(change.state)state=change.state;
    if(change.fail!==undefined)fail=change.fail;if(change.block)traceBlock=change.block;if(change.actualBlock)actualBlock=change.actualBlock;}};
}

function storageFixture() {
  const data = new Map();
  let tail = Promise.resolve();
  return {delete:async k=>data.delete(k),get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),
    transaction(fn){const work=tail.then(()=>fn(this));tail=work.catch(()=>{});return work;}};
}

test('reviewed artifacts and exact preflight reject wrong wallet, network, expiry, destination and emulation',async()=>{
  assertReviewedArtifacts();
  assert.throws(()=>assertReviewedArtifacts({...artifact,minter:{...artifact.minter,codeHash:hex64}}),/Unreviewed/);
  const f=await fixture();
  const quote=await readStandardPreflight(f.input,f.providers);
  assert.equal(quote.identity.modeledDebitNano,'52000000');
  assert.equal(quote.identity.maximumTotalDebitNano,null);
  assert.equal(quote.financialSigningEnabled,false);
  await assert.rejects(readStandardPreflight({...f.input,publicKey:hex64},f.providers),/matching Testnet/);
  await assert.rejects(readStandardPreflight({...f.input,draft:{...f.input.draft,network:'-239'}},f.providers),/Testnet/);
  await assert.rejects(readStandardPreflight({...f.input,validUntil:1},f.providers),/Expired/);
  await assert.rejects(readStandardPreflight({...f.input,ownerPolicyCeilingNano:'51999999'},f.providers),/ceiling/);
  f.update({state:'active'});
  await assert.rejects(readStandardPreflight(f.input,f.providers),/initialized/);
  f.update({state:'uninitialized',fail:true});
  await assert.rejects(readStandardPreflight(f.input,f.providers));
  f.update({fail:false,block:8});
  await assert.rejects(readStandardPreflight(f.input,f.providers),/fresh included state/);
});

test('changed seqno and unauthorized reservation fail; concurrent mock and restart never retry an unknown outcome',async()=>{
  const f=await fixture(), storage=storageFixture();
  const deps={providers:f.providers,confirmExclusiveUse:async()=>true};
  const supervisor=new StandardSupervisor(storage,{},deps);
  const prepared=await supervisor.prepare(f.input);
  const operator=f.m.operator.address, approval=approve(f.f,prepared);
  const reserve = (value=approval)=>supervisor.reserve(operator,prepared.identity.fingerprint,value);
  await assert.rejects(reserve({nonce:approval.nonce,signature:'ff'.repeat(64)}),/owner authorization/);
  assert.equal(verifyStandardApproval(approval,prepared.manifest,prepared.identity,approval.nonce,prepared.identity.validUntil),false);
  assert.equal(verifyStandardApproval(approval,{...prepared.manifest,operator:{...prepared.manifest.operator,address:'0:'+hex64}},
    prepared.identity,approval.nonce,0),false);
  const other=await fixture('Other candidate');
  const alternate=await new StandardSupervisor(storage,{}, {...deps,providers:other.providers}).prepare(other.input);
  assert.notEqual(alternate.identity.fingerprint,prepared.identity.fingerprint);
  await assert.rejects(supervisor.reserve(operator,alternate.identity.fingerprint,approval),/owner authorization/);
  f.update({seqno:3});
  await assert.rejects(reserve(),/changed/);
  f.update({seqno:2,block:8,actualBlock:8});
  const both=await Promise.allSettled([reserve(),reserve()]);
  assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(standardTransportEnabled,false);
  let calls=0;
  const mock=async request=>{
    calls++;
    assert.equal(request.network,'-3');
    assert.equal(request.messages.length,1);
    assert.equal(request.messages[0].amount,'50000000');
    assert.equal((await new StandardSupervisor(storage,{},deps).lock(operator).status()).transport,'UNKNOWN');
    throw Error('Mock lost response');
  };
  const scoped=standardOperatorStorage(storage,operator);
  await assert.rejects(submitStandardDeployment(storage,operator,{requestOwnerConfirmation:mock}),/hard-disabled/);
  const dispatched=await Promise.allSettled([exerciseStandardTransport(scoped,mock),exerciseStandardTransport(scoped,mock)]);
  assert.equal(dispatched.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(calls,1);
  const restart=new StandardSupervisor(storage,{},deps);
  assert.equal((await restart.reconcile(operator)).evidence,'UNKNOWN');
  assert.equal((await restart.lock(operator).status()).transport,'UNKNOWN');
  await assert.rejects(restart.reserve(operator,prepared.identity.fingerprint,approval),/permanently reserved/);
  await assert.rejects(exerciseStandardTransport(scoped,mock),/No unused/);
});

test('authenticated provider outages and rate limits fail without a second request',async()=>{
  for(const status of [429,503]){
    let calls=0;
    const provider=projectProviders({TONCENTER_TESTNET_API_KEY:'fixture',TONAPI_TESTNET_API_KEY:'fixture'},async()=>{
      calls++;
      return new Response('',{status,headers:{'Retry-After':'4'}});
    });
    await assert.rejects(provider.observeAddress('0:'+hex64),{status,retryMs:4000});
    assert.equal(calls,1);
  }
});


test('Sandbox deployment receipt reconciles the reserved message once and rejects altered initial state',async()=>{
  const {f,input,m,providers}=await fixture(), storage=storageFixture();
  const deps={providers,confirmExclusiveUse:async()=>true};
  let registrations=0;
  const env={PROJECT_REGISTRY:{idFromName:key=>key,get:()=>({fetch:async(url,req)=>{
    registrations++;
    assert.match(url,/\/register$/);
    assert.equal(JSON.parse(req.body).projectType,'STANDARD_V2');
    return Response.json({registration:'REGISTERED'},{status:201});
  }})}};
  const supervisor=new StandardSupervisor(storage,env,deps);
  const prepared=await supervisor.prepare(input), {quote}=prepared, operator=m.operator.address;
  await supervisor.reserve(operator,prepared.identity.fingerprint,approve(f,prepared));
  await storage.delete('standard:v2:-3:v5r1:'+operator+':standardPrepared:'+prepared.identity.fingerprint);
  const {message}=m.deployment, dest=core.Address.parseFriendly(message.address);
  const result=await f.send(quote.seqno,[core.internal({to:dest.address,bounce:dest.isBounceable,
    value:BigInt(message.amount),body:core.Cell.fromBase64(message.payload),
    init:core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse())})],quote.validUntil);
  const rows=result.transactions.map(t=>{
    const cell=core.Cell.fromBase64(f.core.beginCell().store(f.core.storeTransaction(t)).endCell().toBoc().toString('base64'));
    return {cell,tx:core.loadTransaction(cell.beginParse()),hash:cell.hash().toString('hex')};
  });
  let alter=true;
  providers.account=async address=>{
    const contract=await f.chain.getContract(f.core.Address.parse(address)), account=contract.account.account;
    const copy=alter&&address===m.minter.raw ? {...account,storage:{...account.storage,state:{type:'active',
      state:{...account.storage.state.state,data:f.core.Cell.EMPTY}}}} : account;
    return {reference:{seqno:8},raw:{state:f.core.beginCell().storeBit(true).store(f.core.storeAccount(copy)).endCell().toBoc().toString('hex')}};
  };
  providers.history=async address=>({rows:rows.filter(row=>row.tx.inMessage.info.dest.toRawString()===address)});
  assert.equal((await supervisor.reconcile(operator)).evidence,'UNKNOWN');
  assert.equal(registrations,0);
  alter=false;
  const included=await supervisor.reconcile(operator);
  assert.equal(included.evidence,'INCLUDED_FINALITY_UNVERIFIED');
  assert.equal(included.operation.receipt.validatorFinalityVerified,false);
  assert.equal(included.operation.receipt.deployment.address,m.minter.raw);
  assert.equal(included.registered,true);
  assert.equal((await new StandardSupervisor(storage,env,deps).reconcile(operator)).registered,true);
  assert.equal(registrations,1);
});


test('shared storage separates operators and missing reserved snapshots fail closed',async()=>{
  const storage=storageFixture(), a='0:'+'11'.repeat(32), b='0:'+'22'.repeat(32);
  const one=standardOperatorStorage(storage,a), two=standardOperatorStorage(storage,b);
  await one.put('standardDeployment',{operator:a,identity:{fingerprint:hex64},state:'DEPLOYMENT_INCLUDED_FINALITY_UNVERIFIED'});
  assert.equal(await two.get('standardDeployment'),undefined);
  await two.put('standardDeployment',{operator:b,identity:{fingerprint:hex64},state:'LOCKED_PENDING_RECONCILIATION'});
  const supervisor=new StandardSupervisor(storage,{}, {providers:{account(){throw Error('No evidence requested');}}});
  for(const operator of [a,b]){
    const status=await supervisor.reconcile(operator);
    assert.equal(status.evidence,'UNKNOWN');
    assert.equal(status.operation.operator,operator);
  }
});
