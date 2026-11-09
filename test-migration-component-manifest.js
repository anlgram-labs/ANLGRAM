'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('./tests/settlement-runtime/node_modules/@ton/core');
const {Blockchain}=require('./tests/settlement-runtime/node_modules/@ton/sandbox');
const {candidate}=require('./scripts/prepare-migration-v2-plan');
const {build}=require('./minter-contract/scripts/migration-v2-plan');
const {checkArtifact}=require('./lib/verified-contract-artifacts');
const {beginCell,Cell,Address,loadStateInit,contractAddress}=core;
let fixture;
const setup=()=>fixture??=(async()=>{
 const chain=await Blockchain.create(),owner=await chain.treasury('manifest-owner');
 return{chain,owner,manifest:await candidate({operator:owner.address,operationId:'9007199254740993'})};
})();
const init=a=>loadStateInit(Cell.fromBase64(a.stateInit).beginParse());

test('historical development Pages workflow cannot deploy a financial branch through workflow_dispatch',()=>{
 const workflow=fs.readFileSync('.github/workflows/static.yml','utf8');
 assert.match(workflow,/deploy:\s*\n\s*#[^\n]*\n\s*if: github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/branches: \["main"\]/);
});

test('component candidate independently recompiles every address dependency and carries reproducible complete StateInit',async()=>{
 const {manifest:p}=await setup();assert.equal(Object.keys(p.sourceVerification.contracts).length,7);
 for(const a of Object.values({...p.dependencies,...p.accounts})){
  const s=init(a);assert(contractAddress(0,s).equals(Address.parse(a.raw)));
  assert(Address.parseFriendly(a.testnet).isTestOnly);assert.equal(s.code.hash().toString('hex'),a.codeHash);assert.equal(s.data.hash().toString('hex'),a.dataHash);
 }
 assert.equal(p.sourceVerification.compilerPackageVersion,'0.11.0');assert.equal(p.terms.operationId,'9007199254740993');
 assert.equal(p.accounts.locker.codeHash,p.sourceVerification.contracts['anlgram-lp-locker-v2'].codeHash);
});

test('stale bytecode and a corrupted artifact digest fail before any template may be trusted',()=>{
 const a=JSON.parse(fs.readFileSync('minter-contract/build/anlgram-lp-locker-v2.compiled.json','utf8'));
 assert.throws(()=>checkArtifact('locker',a,beginCell().storeUint(1,1).endCell().toBoc().toString('base64')),/Source\/artifact mismatch/);
 assert.throws(()=>checkArtifact('locker',{...a,bocFileSha256:'0'.repeat(64)},a.codeBocBase64),/BOC digest mismatch/);
});

test('manifest reports locally completed V3 separately from blocked exact LP outcomes and cannot authorize broadcasts',async()=>{
 const {manifest:p}=await setup();assert.equal(p.lifecycle.version,3);assert.equal(p.lifecycle.locallyVerified,true);assert.equal(p.lifecycle.liveVerified,false);
 for(const field of ['broadcastEnabled','migrationAuthorized','liquidityExecutorImplemented','lpCustodyVerified','pairDiscoveryVerifiedLive','currentRouterCodeProvenOnChain'])assert.equal(p[field],false,field);
 assert.equal(p.status,'BLOCKED_COMPONENT_CANDIDATE_NOT_DEPLOYMENT_PLAN');assert.equal(p.signaturesRequested,0);
 assert(p.blockers.some(x=>x.includes('operation-correlated LP issuance')));assert(p.blockers.some(x=>x.includes('withdrawal receipts')));
 assert.equal(p.terms.percent,100);assert.equal(p.terms.duration,0);
});

test('unsigned funded query templates preserve full operation ID, authenticated sender and intended exact destination',async()=>{
 const {manifest:p}=await setup();
 for(const q of p.componentQueries){const s=Cell.fromBase64(q.body).beginParse();assert.equal(s.loadUint(32),parseInt(q.opcode,16));assert.equal(s.loadUintBig(64).toString(),p.terms.operationId);s.endParse();assert.equal(q.destination,p.accounts.binding.raw);assert.equal(q.sender,p.operator);assert(q.requiresSeparateApproval);assert(BigInt(q.minimumAttachedNano)>0n);}
});

test('fresh source-verified serialized binding derives the same vault and rejects unauthorized real Sandbox query routing',async()=>{
 const {chain,owner,manifest:p}=await setup(),a=p.accounts.binding;
 await owner.send({to:Address.parse(a.raw),init:init(a),value:100000000n,body:beginCell().endCell()});
 const d=(await chain.runGetMethod(Address.parse(a.raw),'get_v2_destinations')).stackReader;
 assert(d.readAddress().equals(Address.parse(p.accounts.locker.raw)));assert(d.readAddress().equals(Address.parse(p.expectedPool)));assert(d.readAddress().equals(Address.parse(p.expectedLpWallet)));
 assert.equal(d.readBigNumber(),100n);assert.equal(d.readBigNumber(),0n);assert.equal(d.readBigNumber().toString(),p.terms.operationId);
 const other=await chain.treasury('manifest-outsider'),q=p.componentQueries[0];
 const r=await other.send({to:Address.parse(q.destination),value:BigInt(q.minimumAttachedNano),body:Cell.fromBase64(q.body)});
 assert(r.transactions.some(t=>t.description.computePhase?.exitCode===401));
 assert.equal((await chain.runGetMethod(Address.parse(a.raw),'is_migration_authorized')).stackReader.readBigNumber(),0n);
});

test('all approved immutable LP terms retain separate deterministic identities and cannot change beneficiaries after genesis',async()=>{
 const {manifest:p}=await setup(),other=new Address(0,Buffer.alloc(32,42));
 const options={creator:Address.parse(p.operator),router:Address.parse(p.pairSource.router),pairWallet0:Address.parse(p.pairSource.pairWallets[0]),pairWallet1:Address.parse(p.pairSource.pairWallets[1]),tokenMaster0:Address.parse(p.pairSource.tokenMaster),tokenMaster1:Address.parse(p.pairSource.pton),operationId:p.terms.operationId};
 const identities=new Set();
 for(const percent of[50,75,100])for(const duration of['permanent','days180','days365']){
  const v=build(core,{...options,percent,duration,beneficiary:other,unlockedController:other});identities.add(v.address.toRawString());
  assert.equal(v.vault.terms.beneficiary,other.toRawString());assert.equal(v.vault.terms.unlockedController,other.toRawString());assert.equal(v.migrationAuthorized,false);
 }
 assert.equal(identities.size,9);assert(!identities.has(p.accounts.binding.raw));
 for(const percent of[49,101])assert.throws(()=>build(core,{...options,percent}),/Invalid LP lock terms/);
 assert.throws(()=>build(core,{...options,duration:'days1'}),/Invalid LP lock terms/);
});
