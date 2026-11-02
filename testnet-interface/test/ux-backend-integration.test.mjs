import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createDraft,CURVE,KEY,address,parseRecipientsDetailed} from '../wizard/model.mjs';
import {prepareProject} from '../projects/prepare.mjs';import {projectStatus,projectStatusText} from '../wizard/project-status.mjs';
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
