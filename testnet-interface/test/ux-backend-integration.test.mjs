import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createDraft,CURVE,KEY,address,parseRecipientsDetailed} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';import {migrationEvidenceStatus} from '../projects/migration-status.mjs';import {rememberMigrationCheckpoint} from '../projects/evidence-brand.mjs';
import {projectStatus,projectStatusText,LIFECYCLE_STAGES,MIGRATION_LIFECYCLE_STEPS,FINANCIAL_STATE_CATALOG,deriveLifecycleStage,deriveMigrationLifecycle,normalizeMigrationStatusView,validateProjectStatusResponse,migrationSummary,lpLockerSummary,describeFinancialState,isAuthenticTxHash,tonviewerTxUrl} from '../wizard/project-status.mjs';
import worker from '../worker.mjs';
const creator='0:'+'11'.repeat(32);
test('merged frontend uses verified economics and keeps basechain validation in both canonical and detailed CSV parsers',()=>{
 assert.deepEqual(CURVE,{supply:'1000000000',curve:'800000000',dex:'200000000',thresholdTon:'300',feeBps:'100'});assert.equal(KEY,'anlgram:testnet:memelabs-drafts:v1');assert.throws(()=>address('-1:'+'11'.repeat(32)),/workchain 0/);
 const d=createDraft();d.distribution.mode='custom';d.distribution.text='-1:'+'11'.repeat(32)+',1';const parsed=parseRecipientsDetailed(d);assert.equal(parsed[0].valid,false);assert.match(parsed[0].error,/workchain 0/);
 const html=readFileSync(new URL('../public/memelabs.html',import.meta.url),'utf8');assert.match(html,/300 Real TON Target/);assert(!/500 Real TON Target|\b500 TON\b|1,000 Real TON|reaches 1,000 TON/.test(html));assert.match(html,/migration.*disabled/i);
 assert(html.includes('id="wizard-status-refresh"'));assert(html.includes('id="wizard-status-endpoint-output"'));
});
test('existing project preparation maps unknown chain data to null/UNKNOWN, never to ANLTEST or zero',async()=>{
 const d=createDraft();Object.assign(d.metadata,{name:'Integrated draft',symbol:'INT',creator});const p=await prepareProject(d),s=projectStatus(p);for(const k of ['actualSupplyUnits','balanceUnits','reserveNano','custodyUnits','verifiedReceipts','distributedUnits','vestedUnits','unlockTimestamp'])assert.equal(s[k],null,k);assert.equal(s.deploymentStatus,'UNKNOWN');assert.match(projectStatusText(p),/ANLTEST observations are a separate/);assert.equal(s.financialSigningEnabled,false);
 assert.equal(projectStatus({...p,actualSupplyUnits:'0',verifiedReceipts:[{status:'claimed'}]}).actualSupplyUnits,null,'unproven JSON does not become an observed zero');assert.throws(()=>projectStatus({...p,scope:'ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS'}));assert.throws(()=>projectStatus({...p,network:'-239'}));assert.throws(()=>projectStatus({...p,financialSigningEnabled:true}));
});
test('merged presentation keeps existing receipt checks, connects POST /api/projects/status and preserves financial guards',()=>{
 const receipt=readFileSync(new URL('../projects/deployment-receipt.mjs',import.meta.url),'utf8');assert.match(receipt,/verifier.verifyDeployment/);assert.match(receipt,/operationCompleted:false/);assert.match(receipt,/newOperationAllowed:false/);
 const controller=readFileSync(new URL('../wizard/controller.mjs',import.meta.url),'utf8');assert(!controller.includes('.sendTransaction('));assert.match(controller,/curve-sim-card'\).hidden=true/);
 const projController=readFileSync(new URL('../wizard/project-controller.mjs',import.meta.url),'utf8');assert(projController.includes("'/api/projects/status'"));assert(projController.includes('validateProjectStatusResponse'));assert(projController.includes('wizard-status-refresh'));
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
 assert.equal(mig.thresholdTon,'300');assert.equal(mig.observedRealTonReserveNano,null);assert.equal(mig.migrationAuthorized,false);
 assert.equal(lp.percent,100);assert.equal(lp.isPermanent,true);assert.equal(lp.custodyStatus,'NOT_VERIFIED');assert.equal(lp.withdrawalsEnabled,false);
});
test('POST /api/projects/status positive and negative response verification with frontend adapter',async()=>{
 const env={APP_ORIGIN:'https://testnet.anlgram.com'};
 const headers={'content-type':'application/json',origin:'https://testnet.anlgram.com'};
 // 1. Positive Launchpad response
 const launchDraft=createDraft();launchDraft.mode='launchpad';Object.assign(launchDraft.metadata,{name:'Launchpad Status',symbol:'LPST',creator});launchDraft.lp.beneficiary=creator;
 const launchPlan=await prepareProject(launchDraft);
 const launchRes=await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status',{method:'POST',headers,body:JSON.stringify(launchDraft)}),env);
 assert.equal(launchRes.status,200);
 const launchBody=await launchRes.json();
 const validatedLaunch=validateProjectStatusResponse(launchBody,launchPlan.configurationFingerprint,'launchpad');
 assert.equal(validatedLaunch.configurationFingerprint,launchPlan.configurationFingerprint);
 assert.equal(validatedLaunch.financialSigningEnabled,false);
 assert.equal(validatedLaunch.status.scope,'MIGRATION_CONFIGURATION_NOT_CHAIN_OBSERVATION');
 assert.equal(validatedLaunch.status.graduation.eligible,null);
 const mergedLaunch={...launchPlan,statusResponse:validatedLaunch};
 const migSummary=migrationSummary(launchDraft,mergedLaunch,validatedLaunch);
 const lpSummary=lpLockerSummary(launchDraft,mergedLaunch,validatedLaunch);
 assert.match(migSummary.migrationEligibility,/financial eligibility: UNKNOWN/);
 assert.equal(migSummary.migrationAuthorized,false);
 assert.equal(lpSummary.withdrawalsEnabled,false);
 // 2. Positive Standard mode response
 const stdDraft=createDraft();stdDraft.mode='standard';Object.assign(stdDraft.metadata,{name:'Standard Status',symbol:'STDST',creator});
 const stdPlan=await prepareProject(stdDraft);
 const stdRes=await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status',{method:'POST',headers,body:JSON.stringify(stdDraft)}),env);
 assert.equal(stdRes.status,200);
 const stdBody=await stdRes.json();
 const validatedStd=validateProjectStatusResponse(stdBody,stdPlan.configurationFingerprint,'standard');
 assert.equal(validatedStd.status,null);
 assert.equal(validatedStd.unavailableReason,'STANDARD_JETTON_HAS_NO_LAUNCHPAD_MIGRATION');
 // 3. Positive Reference-anchored evidence projection into frontend adapter
 const evStatus=migrationEvidenceStatus(launchPlan.migration.terms,[],[
  rememberMigrationCheckpoint({operationId:launchPlan.migration.terms.operationId,role:'curve',proof:{masterchainRootHash:'aa'.repeat(32)},reserveNano:'500000000000',progressBps:10000,localReserveEligible:true,stage:'GRADUATED_READY',scope:'REFERENCE_ANCHORED_ACCOUNT_RECORD'}),
  rememberMigrationCheckpoint({operationId:launchPlan.migration.terms.operationId,role:'migrator',proof:{masterchainRootHash:'aa'.repeat(32)},lifecycle:{originalTonNano:'495000000000',fundedTonNano:'495000000000',curveBookedTonNano:'0',returnTransitTonNano:'0',originalJettonUnits:'200000000000000000',fundedJettonUnits:'200000000000000000',curveBookedJettonUnits:'0',returnTransitJettonUnits:'0'}})
 ]);
 const evMig=migrationSummary(launchDraft,launchPlan,evStatus);
 const evLp=lpLockerSummary(launchDraft,launchPlan,evStatus);
 const evLife=deriveLifecycleStage(launchDraft,launchPlan,evStatus);
 assert.equal(evStatus.scope,'REFERENCE_ANCHORED_ACCOUNT_RECORDS_NOT_VALIDATOR_FINALITY');
 assert.equal(evLife.confirmedOnChain,false,'reference-anchored checkpoint is never validator finality');
 assert.match(evLife.displayBadge,/RECORD: GRADUATED_READY/);
 assert.match(evMig.migrationEligibility,/local reserve check: true \[not authorization\]/);
 assert.match(evMig.liquidityDepositStatus,/principal 495000000000/);
 assert.match(evMig.liquidityDepositStatus,/principal 200000000000000000/);
 assert.equal(evMig.migrationAuthorized,false);
 assert.equal(evLp.withdrawalsEnabled,false);
 // 4. Negative & adversarial checks
 const wrongOriginRes=await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:JSON.stringify(launchDraft)}),env);
 assert.equal(wrongOriginRes.status,403);
 const mainnetRes=await worker.fetch(new Request('https://testnet.anlgram.com/api/projects/status',{method:'POST',headers,body:JSON.stringify({...launchDraft,network:'-239'})}),env);
 assert.equal(mainnetRes.status,400);
 assert.throws(()=>validateProjectStatusResponse(launchBody,'00'.repeat(32),'launchpad'),/configurationFingerprint mismatch/);
 assert.throws(()=>validateProjectStatusResponse({...launchBody,financialSigningEnabled:true},launchPlan.configurationFingerprint,'launchpad'),/Unsafe financial flags/);
 assert.throws(()=>validateProjectStatusResponse({...launchBody,status:{...launchBody.status,migrationAuthorized:true}},launchPlan.configurationFingerprint,'launchpad'),/Invalid Launchpad statusView/);
});
