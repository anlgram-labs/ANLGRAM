import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDraft} from '../wizard/model.mjs';import {prepareProject} from '../projects/prepare.mjs';
test('existing readonly preparation supplies migration/LP settings but cannot manufacture progress, eligibility, receipts or custody',async()=>{
 const d=createDraft();d.mode='launchpad';Object.assign(d.metadata,{name:'V2 review',symbol:'V2R',creator:'0:'+'11'.repeat(32)});Object.assign(d.lp,{percent:'75',duration:'180',beneficiary:d.metadata.creator,controller:'0:'+'22'.repeat(32)});
 const p=await prepareProject(d),s=p.migration.statusView;assert.equal(s.graduation.targetNano,'500000000000');assert.equal(s.graduation.progressBps,null);assert.equal(s.graduation.eligible,null);assert.equal(s.lp.custodyUnits,null);assert.equal(s.lp.unlockTimestamp,null);assert.equal(s.lp.withdrawalEligible,null);assert.equal(s.lp.configuredPercent,75);assert.equal(s.lp.configuredDurationSeconds,15552000);assert.equal(s.transactionReceipts,null);assert.equal(s.versionedPackage.selectedForThisLegacyPlan,false);assert.equal(s.migrationAuthorized,false);assert.equal(s.financialSigningEnabled,false);
});
