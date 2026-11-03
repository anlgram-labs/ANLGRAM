import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createDraft,CURVE,KEY,address,parseRecipientsDetailed} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';import {projectStatus,projectStatusText,LIFECYCLE_STAGES,MIGRATION_LIFECYCLE_STEPS,FINANCIAL_STATE_CATALOG,deriveLifecycleStage,deriveMigrationLifecycle,normalizeMigrationStatusView,migrationSummary,lpLockerSummary,describeFinancialState,isAuthenticTxHash,tonviewerTxUrl} from '../wizard/project-status.mjs';
const creator='0:'+'11'.repeat(32);
test('merged frontend uses verified economics and keeps basechain validation in both canonical and detailed CSV parsers',()=>{
 assert.deepEqual(CURVE,{supply:'1000000000',curve:'800000000',dex:'200000000',thresholdTon:'500',feeBps:'100'});assert.equal(KEY,'anlgram:testnet:memelabs-drafts:v1');assert.throws(()=>address('-1:'+'11'.repeat(32)),/workchain 0/);
 const d=createDraft();d.distribution.mode='custom';d.distribution.text='-1:'+'11'.repeat(32)+',1';const parsed=parseRecipientsDetailed(d);assert.equal(parsed[0].valid,false);assert.match(parsed[0].error,/workchain 0/);
 const html=readFileSync(new URL('../public-pages/memelabs.html',import.meta.url),'utf8');assert.match(html,/500 Real TON Target/);assert(!/1,000 Real TON|reaches 1,000 TON/.test(html));assert.match(html,/migration.*disabled/i);
});
test('existing project preparation maps unknown chain data to null/UNKNOWN, never to ANLTEST or zero',async()=>{
 const d=createDraft();Object.assign(d.metadata,{name:'Integrated draft',symbol:'INT',creator});const p=await prepareProject(d),s=projectStatus(p);for(const k of ['actualSupplyUnits','balanceUnits','reserveNano','custodyUnits','verifiedReceipts','distributedUnits','vestedUnits','unlockTimestamp'])assert.equal(s[k],null,k);assert.equal(s.deploymentStatus,'UNKNOWN');assert.match(projectStatusText(p),/ANLTEST observations are a separate/);assert.equal(s.financialSigningEnabled,false);
 assert.equal(projectStatus({...p,actualSupplyUnits:'0',verifiedReceipts:[{status:'claimed'}]}).actualSupplyUnits,null,'unproven JSON does not become an observed zero');assert.throws(()=>projectStatus({...p,scope:'ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS'}));assert.throws(()=>projectStatus({...p,network:'-239'}));assert.throws(()=>projectStatus({...p,financialSigningEnabled:true}));
});
test('merged presentation keeps existing receipt checks and financial guards',()=>{
 const receipt=readFileSync(new URL('../projects/deployment-receipt.mjs',import.meta.url),'utf8');assert.match(receipt,/verifier.verifyDeployment/);assert.match(receipt,/operationCompleted:false/);assert.match(receipt,/newOperationAllowed:false/);
 const controller=readFileSync(new URL('../wizard/controller.mjs',import.meta.url),'utf8');assert(!controller.includes('/api/projects/status'));assert(!controller.includes('.sendTransaction('));assert.match(controller,/curve-sim-card'\).hidden=true/);
});
test('lifecycle tracker, Curve V2 graduation, STON.fi migration, LP Locker V2 and financial diagnostics enforce strict unverified defaults and no-retry policy',async()=>{
 assert.equal(LIFECYCLE_STAGES.length,10);
 assert.equal(MIGRATION_LIFECYCLE_STEPS.length,9);
 assert.equal(Object.keys(FINANCIAL_STATE_CATALOG).length,11);
 for(const state of Object.values(FINANCIAL_STATE_CATALOG))assert.equal(describeFinancialState(state.code).retryAllowed,false,state.code);
 assert.equal(isAuthenticTxHash('0c79b9323f105d4b3f0e0d9c3e7fb3ee178e4738062182ccd507867c12c8b9b1'),true);
 assert.equal(isAuthenticTxHash('not-a-hash'),false);
 assert.equal(tonviewerTxUrl('not-a-hash'),null);
 const d=createDraft();d.mode='launchpad';Object.assign(d.metadata,{name:'Curve V2 Token',symbol:'CV2',creator});d.lp.beneficiary=creator;
 const p=await prepareProject(d),life=deriveLifecycleStage(d,p),migLife=deriveMigrationLifecycle(d,p),mig=migrationSummary(d,p),lp=lpLockerSummary(d,p);
 assert.equal(life.id,'DRAFT');assert.equal(life.confirmedOnChain,false);
 assert.equal(migLife.confirmedStep,0);assert.equal(migLife.retryAllowed,false);assert.equal(migLife.steps.length,9);
 assert.equal(mig.thresholdTon,'500');assert.equal(mig.observedRealTonReserveNano,null);assert.equal(mig.migrationAuthorized,false);assert.equal(mig.stonfiPoolAddress,p.migration.expectedPool);
 assert.equal(mig.routerVerification,'NOT_VERIFIED');assert.equal(mig.poolVerification,'NOT_VERIFIED');
 assert.equal(lp.percent,100);assert.equal(lp.isPermanent,true);assert.equal(lp.custodyStatus,'NOT_VERIFIED');assert.equal(lp.withdrawalsEnabled,false);
 assert.match(lp.actualVerifiedLpReceivedDisplay,/UNKNOWN/);
 assert.match(lp.authenticatedWithdrawalReceipts,/NONE VERIFIED/);
 assert.match(lp.permanentWarning,/PERMANENT LOCK ACTIVE/);
 // Verify compatibility with PR #21 statusView shape when present
 const withStatusView=normalizeMigrationStatusView({statusView:{scope:'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION',dataStatus:'UNKNOWN',graduation:{targetNano:'500000000000',realReserveNano:null,progressBps:null,eligible:null},routerVerification:'NOT_VERIFIED',poolVerification:'NOT_VERIFIED',transactionReceipts:null,lp:{configuredPercent:100,configuredDurationSeconds:0,beneficiary:creator,unlockedController:creator,custodyUnits:null,recordedLockedUnits:null,unlockTimestamp:null,withdrawalEligible:null},versionedPackage:{availableForLocalReview:true,selectedForThisLegacyPlan:false,financialAuthorization:false},migrationAuthorized:false,financialSigningEnabled:false,withdrawalsEnabled:false}});
 assert.equal(withStatusView.dataStatus,'UNKNOWN');assert.equal(withStatusView.realReserveNano,null);assert.equal(withStatusView.versionedPackage.availableForLocalReview,true);assert.equal(withStatusView.versionedPackage.financialAuthorization,false);
});
