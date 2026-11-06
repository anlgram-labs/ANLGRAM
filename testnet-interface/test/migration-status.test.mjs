import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDraft} from '../wizard/model.mjs';import {prepareProject} from '../projects/prepare.mjs';
import worker from '../worker.mjs';
import {migrationEvidenceStatus} from '../projects/migration-status.mjs';
import {lpEvidencePolicy} from '../projects/lp-evidence.mjs';
import {Cell} from '@ton/core';
test('existing readonly preparation supplies migration/LP settings but cannot manufacture progress, eligibility, receipts or custody',async()=>{
 const d=createDraft();d.mode='launchpad';Object.assign(d.metadata,{name:'V2 review',symbol:'V2R',creator:'0:'+'11'.repeat(32)});Object.assign(d.lp,{percent:'75',duration:'180',beneficiary:d.metadata.creator,controller:'0:'+'22'.repeat(32)});
 const p=await prepareProject(d),s=p.migration.statusView;assert.equal(s.graduation.targetNano,'300000000000');assert.equal(s.graduation.progressBps,null);assert.equal(s.graduation.eligible,null);assert.equal(s.lp.custodyUnits,null);assert.equal(s.lp.unlockTimestamp,null);assert.equal(s.lp.withdrawalEligible,null);assert.equal(s.lp.configuredPercent,75);assert.equal(s.lp.configuredDurationSeconds,15552000);assert.equal(s.transactionReceipts,null);assert.equal(s.versionedPackage.selectedForThisLegacyPlan,false);assert.equal(s.migrationAuthorized,false);assert.equal(s.financialSigningEnabled,false);
});
test('public status route returns exact configuration but never accepts caller receipt, reserve, custody or authorization flags',async()=>{
 const d=createDraft();d.mode='launchpad';Object.assign(d.metadata,{name:'Real status',symbol:'REAL',creator:'0:'+'11'.repeat(32)});d.lp.beneficiary=d.metadata.creator;d.receipts=[{finalized:true}];d.status={reserveNano:'999999999999',custodyVerified:true};
 const url='https://testnet.anlgram.com',env={APP_ORIGIN:url},request=(body,origin=url)=>worker.fetch(new Request(url+'/api/projects/status',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 const r=await request(d),v=await r.json();assert.equal(r.status,200);assert.equal(v.schema,2);assert.equal(v.status.graduation.realReserveNano,null);assert.equal(v.status.lp.custodyStatus,'UNKNOWN');assert.equal(v.status.deposits.ton.principalNano,null);assert.equal(v.status.lifecycle.authenticated,false);assert.equal(v.financialSigningEnabled,false);assert.equal(v.status.transactionReceipts,null);assert.equal((await request(d,'https://anlgram.com')).status,403);
 d.network='-239';assert.equal((await request(d)).status,400);
});
test('status projection rejects JSON proof flags, mixed operation labels and unverified account snapshots',()=>{
 const terms={operationId:'77',percent:75,duration:15552000,beneficiary:'0:'+'11'.repeat(32),unlockedController:'0:'+'22'.repeat(32)};
 for(const value of [{providerInclusionVerified:true,operationId:'77'},{referenceInclusionVerified:true,operationId:'78'}])assert.throws(()=>migrationEvidenceStatus(terms,[value]),/Included/);
 assert.throws(()=>migrationEvidenceStatus(terms,[],[{operationId:'77',role:'curve',reserveNano:'500000000000'}]),/included/);assert.throws(()=>migrationEvidenceStatus(terms,new Array(65)),/Bounded/);
 const unknown=migrationEvidenceStatus(terms);assert.equal(unknown.lp.withdrawalEligible,null);assert.equal(unknown.migrationAuthorized,false);assert.equal(unknown.graduation.eligible,null);
});
test('LP policy cannot be constructed from a wallet label, arbitrary StateInit or indexer assertion',()=>{
 assert.throws(()=>lpEvidencePolicy('verified'));assert.throws(()=>lpEvidencePolicy(Cell.EMPTY.toBoc().toString('base64')));
});
