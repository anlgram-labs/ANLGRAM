import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDraft,effective,units,format,validate,recipients,safeLogo,saveDraft,deleteDraft,parseRecipientsDetailed,loadStore,normalizeDraft,KEY,previewBuy,CURVE} from '../wizard/model.mjs';
const owner='0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR';
const other='0:1111111111111111111111111111111111111111111111111111111111111111';
test('masterchain creator, recipient and vesting beneficiary cannot become unsupported Jetton transfer templates',()=>{
 const masterchain='-1:'+'22'.repeat(32),d=valid();d.metadata.creator=masterchain;assert.equal(validate(d).valid,false);d.metadata.creator=owner;d.allocations.community='1';d.distribution.mode='custom';d.distribution.text=masterchain+',1';assert.throws(()=>recipients(d),/workchain 0/);d.distribution.skip=true;d.allocations.team='1';Object.assign(d.vesting,{enabled:true,beneficiary:masterchain,amount:'1',startDate:'2027-01-01'});assert.equal(validate(d).valid,false);
});
function valid(){const d=createDraft();Object.assign(d.metadata,{name:'Real draft',symbol:'RDT',creator:owner});return d;}
function memory(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};}
test('both modes preserve configuration; launchpad effective economics are immutable and default LP lock is100% permanent',()=>{
 const d=valid();d.metadata.supply='123.45';d.metadata.decimals='2';assert.equal(effective(d).supply,'123.45');assert.equal(validate(d).valid,true);
 d.mode='launchpad';d.lp.beneficiary=owner;assert.deepEqual(effective(d),{supply:'1000000000',decimals:9});assert.equal(validate(d).valid,true);assert.equal(d.lp.percent,'100');assert.equal(d.lp.duration,'permanent');d.metadata.decimals='invalid';assert.equal(validate(d).valid,true);d.metadata.decimals='2';d.mode='standard';assert.equal(effective(d).supply,'123.45');assert.equal(d.metadata.decimals,'2');assert.equal(CURVE.thresholdTon,'500');assert.equal(CURVE.feeBps,'100');
});
test('exact units support zero decimals and large balances without float coercion; reject precision/exponent/overflow',()=>{
 assert.equal(units('9007199254740993.123456789',9),9007199254740993123456789n);assert.equal(units('12',0),12n);assert.equal(format(12n,0),'12');assert.equal(format(0n,9),'0');
 for(const [v,d]of [['1e9',9],['1,000',9],['-1',9],['1.1',0],['0.123',2],['9'.repeat(80),18],[1000,9],['1',NaN]])assert.throws(()=>units(v,d));assert.match(format(0n,NaN),/invalid/);
});
test('CSV equal/custom recipients use canonical wallet deduplication and exact allocation budgets',()=>{
 const d=valid();d.metadata.supply='100';d.metadata.decimals='2';d.allocations={creator:'20',community:'30',team:'40'};d.distribution={skip:false,mode:'custom',amount:'0',text:`address,amount\n${owner},10.01\n${other},19.99`};
 assert.equal(validate(d).valid,true);assert.equal(validate(d).airdropUnits,'3000');assert.equal(validate(d).unallocatedUnits,'1000');
 d.distribution.text+=`\n${owner},1`;assert.throws(()=>recipients(d),/duplicate/);d.distribution.text=`${owner},30.01`;assert(validate(d).errors.some(x=>x.includes('exceeds')));
 d.distribution.mode='equal';d.distribution.amount='15';d.distribution.text=owner+'\n'+other;assert.equal(validate(d).airdropUnits,'3000');d.allocations.team='51';assert(validate(d).errors.some(x=>x.includes('total supply')));
});
test('skipping optional distribution preserves recipients and invalid text cannot become a funded allocation',()=>{
 const d=valid();d.distribution.text='bad,100';assert.equal(validate(d).valid,false);d.distribution.skip=true;assert.equal(validate(d).valid,true);const s=memory();saveDraft(s,d,0);const restored=loadStore(s).projects[0];assert.equal(restored.distribution.text,'bad,100');assert.equal(restored.distribution.skip,true);restored.distribution.skip=false;assert.equal(validate(restored).valid,false);
});
test('vesting cannot exceed team allocation, invent dates or accept a cliff longer than the schedule',()=>{
 const d=valid();d.allocations.team='100';Object.assign(d.vesting,{enabled:true,beneficiary:owner,amount:'100',startDate:'2027-01-01'});assert.equal(validate(d).valid,true);d.vesting.amount='100.000000001';assert(validate(d).errors.some(x=>x.includes('Vesting exceeds')));d.vesting.amount='100';d.vesting.startDate='2027-02-30';assert.equal(validate(d).valid,false);d.vesting.startDate='2027-02-28';d.vesting.cliffMonths='25';assert.equal(validate(d).valid,false);
});
test('partial LP locks require beneficiary/controller and supported immutable-range settings, without claiming custody',()=>{
 const d=valid();d.mode='launchpad';d.lp.beneficiary=owner;d.lp.percent='75';d.lp.duration='180';assert.equal(validate(d).valid,false);d.lp.controller=other;assert.equal(validate(d).valid,true);
 for(const value of ['49','101','50.25','50.001','NaN']){d.lp.percent=value;assert.equal(validate(d).valid,false);}d.lp.percent='100';d.lp.controller='';d.lp.duration='permanent';assert.equal(validate(d).valid,true);d.allocations.team='1';assert(validate(d).errors.some(x=>x.includes('fair launch')));
});
test('safe draft image rendering rejects executable schemes, credentials, unsupported files and oversized data',()=>{
 assert.equal(safeLogo('https://testnet.anlgram.com/icon.png'),'https://testnet.anlgram.com/icon.png');assert.equal(safeLogo('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==');for(const s of ['javascript:alert(1)','http://example.com/a.png','https://u:p@example.com/a.png','https://example.com/a.svg','data:image/svg+xml;base64,YQ==','data:image/png;base64,'+'A'.repeat(360000)])assert.throws(()=>safeLogo(s));
});
test('draft persistence resumes all six stages and multiple projects without accepting authority, receipts or network changes',()=>{
 const s=memory(),d=valid();let r=0;for(let stage=1;stage<=6;stage++){d.stage=stage;const result=saveDraft(s,d,r);r=result.revision;assert.equal(loadStore(s).projects[0].stage,stage);}
 const b=valid();b.metadata.name='Second project';const saved=saveDraft(s,b,r);assert.equal(saved.projects.length,2);assert.equal(loadStore(s).selectedId,b.id);
 const forged=normalizeDraft({...d,financialSigningEnabled:true,contractAddress:owner,status:'CONFIRMED'});assert.equal(forged.financialSigningEnabled,undefined);assert.equal(forged.contractAddress,undefined);assert.equal(forged.status,undefined);assert.throws(()=>normalizeDraft({...d,network:'-239'}));
});
test('storage corruption, competing tabs and quota errors never overwrite saved drafts',()=>{
 const s=memory(),d=valid();saveDraft(s,d,0);const before=s.getItem(KEY);assert.throws(()=>saveDraft(s,d,0),/another tab/);assert.equal(s.getItem(KEY),before);
 s.setItem=()=>{throw Error('Quota exceeded');};assert.throws(()=>saveDraft(s,d,1),/Quota/);assert.equal(s.getItem(KEY),before);s.m.set(KEY,'broken JSON');assert.throws(()=>saveDraft(s,d,1));assert.equal(s.getItem(KEY),'broken JSON');
});
test('preview reuses the existing integer Curve engine and settlement funding, never produces a live signing quote',()=>{
 const p=previewBuy('1');assert.equal(p.scope,'CONFIGURATION_PREVIEW_NOT_LIVE_QUOTE');assert.equal(p.financialSigningEnabled,false);assert.equal(p.settlementFundingNano,'40000000');assert(BigInt(p.attachmentNano)>40000000n);assert.throws(()=>previewBuy('0.04'));assert.throws(()=>previewBuy('1e2'));
});
test('deleteDraft removes target draft and updates selection revision; throws on mismatch',()=>{
 const s=memory(),d1=valid(),d2=valid();d2.metadata.name='Second';
 saveDraft(s,d1,0);saveDraft(s,d2,1);
 assert.equal(loadStore(s).projects.length,2);
 const updated=deleteDraft(s,d1.id,2);
 assert.equal(updated.projects.length,1);
 assert.equal(updated.projects[0].id,d2.id);
 assert.equal(updated.selectedId,d2.id);
 assert.throws(()=>deleteDraft(s,d2.id,2),/another tab/);
});
test('parseRecipientsDetailed yields structured entry status and enforces basechain workchain 0',()=>{
 const masterchain='-1:'+'22'.repeat(32);
 const d=valid();d.distribution.mode='custom';d.distribution.text=`address,amount\n${owner},100\n${other},50\n${masterchain},25\ninvalid_address,50\n${owner},20`;
 const entries=parseRecipientsDetailed(d);
 assert.equal(entries.length,5);
 assert.equal(entries[0].valid,true);
 assert.equal(entries[0].formattedAddress.includes('...'),true);
 assert.equal(entries[1].valid,true);
 assert.equal(entries[2].valid,false);
 assert.match(entries[2].error,/workchain 0/);
 assert.equal(entries[3].valid,false);
 assert.match(entries[3].error,/address/i);
 assert.equal(entries[4].valid,false);
 assert.match(entries[4].error,/Duplicate/);
});
