import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {OPERATOR,MINTER,PUBLIC_KEY} from '../config.mjs';
const require=createRequire(import.meta.url),core=require('@ton/core');
const p=require('../../docs/launchpad/testnet-v5-candidate.json');
test('active V5 registry invalidates legacy plans and carries over no approval',()=>{
 const active=require('../../docs/launchpad/active-testnet-candidate.json');
 assert.equal(active.version,'V5R1');assert.equal(active.priorTransactionApprovalsInvalid,true);assert.equal(active.readyForSigning,false);
 assert(active.obsoleteForExecution.includes('supervised-smoke-candidate-2026-10-31.json'));
 assert.equal(p.supersedes.previousApprovalsCarryOver,false);
});
test('interface and plan bind exact V5 operator/minter and immutable donation',()=>{
 assert.equal(p.wallet.raw,OPERATOR);assert.equal(p.wallet.publicKey,PUBLIC_KEY);assert.equal(p.dependentAccounts.minter.testnet,MINTER);
 assert.equal(p.smokePlan.operator.raw,OPERATOR);assert.equal(p.componentPlan.operator,OPERATOR);
 assert.equal(p.donation.recipient,'0:d6fcfb2399e38107f7efcce166c2a5bbade74472e7ca420226cab511bceedd6d');
 assert.equal(p.donation.amountNano,'20000000');assert.equal(p.donation.baseNano,'200000000');
 assert.equal(p.immutableLockSettings.percent,100);assert.equal(p.immutableLockSettings.duration,0);
});
test('all six core/V2 StateInit derive their exact reviewed addresses, bytecode and data hashes',()=>{
 assert.equal(Object.keys(p.dependentAccounts).length,6);assert.equal(Object.keys(p.sourceVerification.contracts).length,7);
 for(const account of Object.values(p.dependentAccounts)){
  const init=core.loadStateInit(core.Cell.fromBase64(account.stateInit).beginParse());
  assert.equal(core.contractAddress(0,init).toRawString(),account.raw);
  assert.equal(init.code.hash().toString('hex'),account.codeHash);assert.equal(init.data.hash().toString('hex'),account.dataHash);
  assert(core.Address.parseFriendly(account.testnet).isTestOnly);
 }
});
test('minter admin, supply and metadata remain exact',()=>{
 const init=core.loadStateInit(core.Cell.fromBase64(p.dependentAccounts.minter.stateInit).beginParse()),data=init.data.beginParse();
 assert.equal(data.loadCoins(),0n);assert.equal(data.loadAddress().toRawString(),OPERATOR);
 const content=data.loadRef().beginParse();assert.equal(content.loadUint(8),0);
 const dict=content.loadDict(core.Dictionary.Keys.BigUint(256),core.Dictionary.Values.Cell());assert.equal(dict.size,3);
 const {createHash}=require('node:crypto');
 for(const[k,v]of Object.entries({name:'ANLGRAM Testnet Settlement',symbol:'ANLTEST',decimals:'9'})){
  const s=dict.get(BigInt('0x'+createHash('sha256').update(k).digest('hex'))).beginParse();assert.equal(s.loadUint(8),0);assert.equal(s.loadStringTail(),v);
 }
 assert.equal(data.loadRef().hash().toString('hex'),p.sourceVerification.contracts['anlgram-settlement-wallet'].codeHash);
});
test('every prepared message is Testnet-tagged, uses new destinations and remains unsigned',()=>{
 const legacy=require('../../docs/launchpad/supervised-smoke-candidate-2026-10-31.json');
 const old=new Set(Object.values(legacy.candidateAccounts).map(a=>a.raw));
 for(const step of p.smokePlan.steps){
  const to=core.Address.parseFriendly(step.message.address);assert.equal(to.isTestOnly,true);assert.equal(old.has(to.address.toRawString()),false);assert.equal(step.requiresSeparateApproval,true);
 }
 assert.equal(p.broadcastEnabled,false);assert.equal(p.readyForSigning,false);assert.deepEqual(p.smokePlan.migration.templates,[]);
 assert.equal(p.walletApplicationCompatibility.doNotInferFromPublicKeyOrPreviousV4Connection,true);
 assert.equal(p.expenditure.hardMaximumDebitNano,null);assert.equal(p.expenditure.ceilingApproved,false);
});
