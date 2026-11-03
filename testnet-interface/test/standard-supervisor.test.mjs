import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@ton/core';
import artifact from '../../minter-contract/build/standard-jetton-v2.compiled.json' with {type:'json'};
import {makeLocalReceipt} from './recovery-local-fixture.mjs';
import {createDraft} from '../wizard/model.mjs';
import {assertReviewedArtifacts, readStandardPreflight, StandardSupervisor} from '../projects/standard-supervisor.mjs';
import {exerciseStandardTransport, standardTransportEnabled} from '../projects/standard-transport-fixture.mjs';
import {prepareStandardTestnetRelease} from '../projects/standard-testnet-release.mjs';
import {projectProviders} from '../projects/project-providers.mjs';

const hex64 = '12'.repeat(32);
const b64Hash = cell => cell.hash().toString('base64');
const walletData = (key, seqno) => core.beginCell().storeBit(true).storeUint(seqno,32)
  .storeInt(2147483645,32).storeBuffer(Buffer.from(key,'hex')).storeBit(false).endCell();

async function fixture() {
  const f = await makeLocalReceipt();
  const draft = createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata,{name:'Private supervisor',symbol:'SV2',creator:f.w.address.toRawString()});
  const publicKey = f.key.publicKey.toString('hex'), input = {draft,publicKey,ownerPolicyCeilingNano:'70000000'};
  const m = await prepareStandardTestnetRelease(draft,publicKey);
  const code = core.Cell.fromBase64(f.beforeCode.toBoc().toString('base64'));
  const balance = 500000000n;
  let seqno = 2, state = 'uninitialized', fail = false, traceBlock = 7;
  const proofTime = Math.floor(Date.now()/1000);
  const proof = {masterchainSeqno:7,chainTime:proofTime,masterchainRootHash:hex64};
  const providers = {
    async account(address) {
      assert.equal(address,m.operator.address);
      const account = core.beginCell().storeBit(true).store(core.storeAccount({
        addr:core.Address.parse(address),storageStats:{used:{cells:0n,bits:0n},storageExtra:null,lastPaid:0},
        storage:{lastTransLt:0n,balance:{coins:balance},state:{type:'active',state:{code,data:walletData(publicKey,seqno)}}}
      })).endCell();
      return {proof,raw:{state:account.toBoc().toString('hex')}};
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
    if(change.fail!==undefined)fail=change.fail;if(change.block)traceBlock=change.block;}};
}

function storageFixture() {
  const data = new Map();
  let tail = Promise.resolve();
  return {get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),
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
  const deps={providers:f.providers,verifyOwnerApproval:async(token,fingerprint)=>token===fingerprint,
    readOwnershipProof:async address=>({verified:true,network:'-3',address,domain:'testnet.anlgram.com',
      expiresAt:Math.floor(Date.now()/1000)+60,noConcurrentOperation:true})};
  const supervisor=new StandardSupervisor(storage,{},deps);
  const prepared=await supervisor.prepare(f.input);
  await assert.rejects(supervisor.reserve('other'),/owner authorization/);
  f.update({seqno:3});
  await assert.rejects(supervisor.reserve(prepared.identity.fingerprint),/changed/);
  f.update({seqno:2});
  const both=await Promise.allSettled([supervisor.reserve(prepared.identity.fingerprint),supervisor.reserve(prepared.identity.fingerprint)]);
  assert.equal(both.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(standardTransportEnabled,false);
  let calls=0;
  const mock=async request=>{
    calls++;
    assert.equal(request.network,'-3');
    assert.equal(request.messages.length,1);
    assert.equal(request.messages[0].amount,'50000000');
    throw Error('Mock lost response');
  };
  const dispatched=await Promise.allSettled([exerciseStandardTransport(storage,mock),exerciseStandardTransport(storage,mock)]);
  assert.equal(dispatched.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(calls,1);
  const restart=new StandardSupervisor(storage,{},deps);
  assert.equal((await restart.reconcile()).evidence,'UNKNOWN');
  assert.equal((await restart.lock.status()).transport,'UNKNOWN');
  await assert.rejects(restart.reserve(prepared.identity.fingerprint),/permanently reserved/);
  await assert.rejects(exerciseStandardTransport(storage,mock),/No unused/);
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
  const deps={providers,verifyOwnerApproval:async()=>true,
    readOwnershipProof:async address=>({verified:true,network:'-3',address,domain:'testnet.anlgram.com',
      expiresAt:Math.floor(Date.now()/1000)+60,noConcurrentOperation:true})};
  let registrations=0;
  const env={PROJECT_REGISTRY:{idFromName:key=>key,get:()=>({fetch:async(url,req)=>{
    registrations++;
    assert.match(url,/\/register$/);
    assert.equal(JSON.parse(req.body).projectType,'STANDARD_V2');
    return Response.json({registration:'REGISTERED'},{status:201});
  }})}};
  const supervisor=new StandardSupervisor(storage,env,deps);
  const {quote}=await supervisor.prepare(input);
  await supervisor.reserve('fixture approval');
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
  assert.equal((await supervisor.reconcile()).evidence,'UNKNOWN');
  assert.equal(registrations,0);
  alter=false;
  const included=await supervisor.reconcile();
  assert.equal(included.evidence,'INCLUDED_FINALITY_UNVERIFIED');
  assert.equal(included.operation.receipt.validatorFinalityVerified,false);
  assert.equal(included.operation.receipt.deployment.address,m.minter.raw);
  assert.equal(included.registered,true);
  assert.equal((await new StandardSupervisor(storage,env,deps).reconcile()).registered,true);
  assert.equal(registrations,1);
});
