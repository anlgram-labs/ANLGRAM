import {KEY,TITLES,BLOCKER,createDraft,loadStore,saveDraft,deleteDraft,validate,effective,format,units,recipients,parseRecipientsDetailed,safeLogo,previewBuy,CURVE} from './model.mjs';
import {attachPreparation,renderMigrationAndLpGrids} from './project-controller.mjs';
import {FINANCIAL_STATE_CATALOG,describeFinancialState,migrationSummary,lpLockerSummary,deriveLifecycleStage} from './project-status.mjs';
const $=id=>document.getElementById(id),text=(id,value)=>$(id).textContent=value;
let store,draft,unavailable=false,ui,busy=false,liveBusy=false,activeDiagnosticCode='WALLET_DISCONNECTED';
try{store=loadStore(localStorage);draft=store.projects.find(p=>p.id===store.selectedId)||createDraft();}catch(e){unavailable=true;store={revision:0,projects:[]};draft=createDraft();text('wizard-status','Saved data unavailable; no saved data was overwritten. '+e.message);}
const preparation=attachPreparation(()=>draft);
const fields={
 'distribution-batch-size':['distribution','batchSize'],
 'labs-card1-name':['metadata','name'],'labs-card1-symbol':['metadata','symbol'],'labs-card1-supply':['metadata','supply'],'wizard-decimals':['metadata','decimals'],'lp-desc':['metadata','description'],'lp-logo':['metadata','logo'],'wizard-creator':['metadata','creator'],
 'allocation-creator':['allocations','creator'],'allocation-community':['allocations','community'],'allocation-team':['allocations','team'],'labs-dist-amount':['distribution','amount'],'labs-dist-manual-text':['distribution','text'],
 'labs-vesting-beneficiary':['vesting','beneficiary'],'labs-vesting-amount':['vesting','amount'],'labs-vesting-cliff':['vesting','cliffMonths'],'labs-vesting-period':['vesting','durationMonths'],'labs-vesting-date':['vesting','startDate'],
 'lp-percent':['lp','percent'],'lp-duration':['lp','duration'],'lp-beneficiary':['lp','beneficiary'],'lp-controller':['lp','controller'],'preview-buy':['trade','buyAttachment'],'preview-sell':['trade','sellTokens']
};
// Existing vesting select values are human-readable; the model stores months.
for(const id of ['labs-vesting-cliff','labs-vesting-period'])for(const option of $(id).options)option.value=option.value.split(' ')[0];
for(const [id,label] of Object.entries({'wizard-decimals':'Token decimals','labs-dist-manual-text':'Airdrop addresses and amounts','labs-dist-amount':'Equal amount per wallet','lp-logo':'Token logo HTTPS URL','lp-logo-file':'Upload token logo','labs-dist-file-input':'Import recipient CSV','labs-vesting-date':'Planned vesting start date','labs-vesting-beneficiary':'Vesting beneficiary','labs-vesting-amount':'Team tokens to vest','labs-vesting-cliff':'Vesting cliff in months','labs-vesting-period':'Vesting duration in months'}))$(id).setAttribute('aria-label',label);
function renderDiagnostics(code=activeDiagnosticCode,extra={}){
 activeDiagnosticCode=code;
 const currentDiag=describeFinancialState(code,extra);
 const banner=$('wizard-diagnostic-banner');
 if(banner)banner.textContent=`Active status: ${currentDiag.title} [${currentDiag.statusLabel}] — ${currentDiag.detail} Retry permitted: NO.`;
 const grid=$('wizard-diagnostics-grid');
 if(!grid)return;
 grid.replaceChildren(...Object.values(FINANCIAL_STATE_CATALOG).map(item=>{
  const card=document.createElement('div');
  card.className='labs-diag-card'+(item.code===code?' active':'');
  const head=document.createElement('div');head.className='labs-lifecycle-head';
  const title=document.createElement('strong');title.textContent=item.title;
  const badge=document.createElement('span');
  badge.className=item.severity==='error'?'badge-error':item.severity==='warning'?'badge-warning':'badge-info';
  badge.textContent=item.statusLabel+' · NO RETRY';
  head.append(title,badge);
  const p=document.createElement('p');p.className='labs-mode-desc';p.textContent=item.detail;
  card.append(head,p);return card;
 }));
}
function fill(){
 $('curve-sim-card').hidden=true;
 text('curve-preview','No current preview. Choose Calculate; this is not a live quote.');
 $('wizard-mode').value=draft.mode;
 for(const [id,[section,key]]of Object.entries(fields))$(id).value=section==='metadata'&&key==='supply'?effective(draft).supply:section==='metadata'&&key==='decimals'?String(effective(draft).decimals):section==='metadata'&&key==='logo'&&draft.metadata.logo.startsWith('data:')?'':draft[section][key];
 $('wizard-skip-distribution').checked=draft.distribution.skip;$('wizard-vesting-enabled').checked=draft.vesting.enabled;
 $('wizard-standard-settlement').checked=draft.walletProfile==='STANDARD_V2_SETTLEMENT';
 for(const radio of document.querySelectorAll('[name="dist-type"]'))radio.checked=radio.value===draft.distribution.mode;
 render();showStage(false);
}
function render(){
 const launch=draft.mode==='launchpad',e=effective(draft),result=validate(draft),prep=preparation.getPrepared(draft.id),prepStatus=preparation.getStatus(draft.id);
 $('wizard-standard-settlement-option').hidden=launch;
 const migInfo=migrationSummary(draft,prep,prepStatus),lpInfo=lpLockerSummary(draft,prep,prepStatus);
 $('labs-card1-supply').readOnly=launch;$('wizard-decimals').readOnly=launch;
 for(const card of document.querySelectorAll('#wizard-mode-cards [data-mode]'))card.classList.toggle('active',card.dataset.mode===draft.mode);
 text('mode-help',launch?'Launchpad: fixed 1B supply, 9 decimals, 80% Curve and 20% DEX. No initial creator allocation. Activation requires verified custody and administrator renouncement. Trading, migration and LP withdrawals remain blocked.':'Standard TEP-74: choose supply and decimals. A minter can retain mint authority until explicitly renounced. No bonding curve, graduation or LP locking is included. Saving a draft does not mint tokens or renounce ownership.');
 const step1Errs=result.errors.filter(x=>/^(Name|Symbol|Description|Creator wallet|Logo|Supply):/.test(x));
 text('wizard-step1-feedback',step1Errs.length?'Required in Step 1: '+step1Errs.join(' · '):'Step 1 token identity and creator wallet fields are valid.');
 text('dex-preview-decimals',String(e.decimals));text('dex-preview-name',draft.metadata.name||'Your token');text('dex-preview-symbol',draft.metadata.symbol?'$'+draft.metadata.symbol:'—');text('dex-preview-supply',e.supply||'Not configured');
 const image=$('logo-preview-img');try{const src=safeLogo(draft.metadata.logo);if(src){image.src=src;image.hidden=false;image.style.display='block';$('labs-avatar-emoji').hidden=true;}else{image.removeAttribute('src');image.hidden=true;$('labs-avatar-emoji').hidden=false;}}catch{image.removeAttribute('src');image.hidden=true;$('labs-avatar-emoji').hidden=false;}
 image.onerror=()=>{image.hidden=true;image.style.display='none';text('logo-upload-status','Image could not be loaded. The draft URL was retained; use a supported raster image.');};
 text('distribution-help',launch?'All initial supply is reserved for the Curve/DEX. Free creator, team and community allocations must remain zero. Optional future distributions need separately acquired and verified balances; nonzero proposals are saved as incomplete, never funded.':'Amounts below are token amounts, not percentages. Airdrops spend the community budget; vesting spends the team budget. Unallocated supply stays with the initial creator, subject to actual mint confirmation.');
 text('chip-total-supply',`${e.supply} (${e.decimals} dec)`);text('chip-allocated',format(result.allocatedUnits,e.decimals));text('chip-unallocated',launch?'UNAVAILABLE (80% Curve / 20% DEX)':result.unallocatedUnits===null?'INVALID':format(result.unallocatedUnits,e.decimals));text('chip-airdrop',`${format(result.airdropUnits,e.decimals)} (${result.recipients.length} wallets)`);
 const parsed=parseRecipientsDetailed(draft),tbody=$('labs-recipients-tbody');tbody.replaceChildren();
 if(!draft.distribution.skip&&parsed.length){
  $('labs-recipients-table-wrap').hidden=false;
  for(const row of parsed.slice(0,50)){
   const tr=document.createElement('tr'),c1=document.createElement('td'),c2=document.createElement('td'),c3=document.createElement('td'),c4=document.createElement('td'),badge=document.createElement('span');
   c1.textContent=String(row.line);c2.className='recipient-addr';c2.textContent=row.formattedAddress||row.rawAddress||'—';c3.textContent=row.amountStr||'0';
   badge.className=row.valid?'badge-valid':'badge-error';badge.textContent=row.valid?'Valid':row.error;c4.append(badge);tr.append(c1,c2,c3,c4);tbody.append(tr);
  }
 }else $('labs-recipients-table-wrap').hidden=true;
 const allocationErrors=result.errors.filter(x=>/allocation|Airdrop|Recipients|fair launch/i.test(x));
 text('allocation-result',`Configured allocation: ${format(result.allocatedUnits,e.decimals)} tokens. ${launch?'Available initial free allocation: UNAVAILABLE (reserved 80% Curve / 20% DEX).':`Unallocated: ${result.unallocatedUnits===null?'INVALID':format(result.unallocatedUnits,e.decimals)} tokens.`} Airdrop: ${result.recipients.length} recipients / ${format(result.airdropUnits,e.decimals)} tokens (configured, unfunded; delivered balance: UNKNOWN). ${draft.distribution.skip?'Optional airdrop skipped; saved recipient text retained.':''}\n${allocationErrors.join('\n')}`);
 text('vesting-preview',draft.vesting.enabled?`Planned only: ${draft.vesting.amount} tokens to ${draft.vesting.beneficiary||'beneficiary not set'}, ${draft.vesting.cliffMonths}-month cliff / ${draft.vesting.durationMonths} months, starting ${draft.vesting.startDate||'date not set'}. Escrowed balance: UNKNOWN. No vesting contract, escrow or claim is verified.`:'Vesting skipped. Any entered schedule is retained and no funds are locked.');
 text('curve-mode-help',launch?'Existing constant-product model with virtual reserves. Model parameters below are immutable configuration, not live reserves or a trading authorization.':'Not applicable to Standard Jettons. You can inspect the Launchpad model, but this mode has no Curve.');
 text('curve-model',`Launchpad model: ${CURVE.supply} supply / ${CURVE.curve} Curve / ${CURVE.dex} DEX.\nProtocol fee: ${CURVE.feeBps} bps (1%). Graduation: ${CURVE.thresholdTon} real TON.\nCurrent project contract/activation/price/reserve: UNAVAILABLE; this is an undeployed draft.`);
 text('curve-grad-badge',launch?migInfo.graduationProgressDisplay:'Not applicable in Standard mode');
 text('curve-grad-ton',launch?`${migInfo.observedRealTonReserveDisplay} (Target: ${migInfo.thresholdTon} TON)`:'Not applicable');
 text('curve-grad-inventory',launch?migInfo.observedCurveInventoryDisplay:'Not applicable');
 text('curve-grad-dex',launch?'200,000,000 configured · custody NOT VERIFIED':'Not applicable');
 text('curve-migration-eligibility',migInfo.migrationEligibility);
 for(const id of ['preview-buy','preview-sell','preview-calculate','lp-percent','lp-duration','lp-beneficiary','lp-controller'])$(id).disabled=!launch;
 for(const b of document.querySelectorAll('[data-ton]')){b.disabled=!launch;b.classList.toggle('active',draft.trade.buyAttachment===b.dataset.ton);}
 for(const b of document.querySelectorAll('[data-lp]')){b.disabled=!launch;b.classList.toggle('active',draft.lp.percent===b.dataset.lp);}
 text('lp-mode-help',launch?'Plan LP Locker V2 settings. Defaults: 100% permanent. These values are not yet immutable on-chain. They become binding only in a verified compatible deployment.':'Not applicable to Standard Jettons; the settings are retained if you switch back to Launchpad.');
 text('lp-permanent-warning',lpInfo.permanentWarning);
 text('lp-custody-badge',lpInfo.custodyBadgeText);
 try{const percent=units(draft.lp.percent,0);if(percent<50n||percent>100n)throw Error();text('lp-breakdown',`Planned locked: ${format(percent,0)}%; unlocked: ${format(100n-percent,0)}%. Duration: ${draft.lp.duration==='permanent'?'permanent':draft.lp.duration+' days'}.\nBeneficiary: ${draft.lp.beneficiary||'not set'}. Unlocked LP controller: ${percent===100n?'none (0% unlocked)':draft.lp.controller||'not set'}.\nLocked LP amount: ${lpInfo.lockedLpDisplay}. Unlocked LP amount: ${lpInfo.unlockedLpDisplay}.\nActual locked LP: NOT VERIFIED (balance UNKNOWN). Unlock timestamp: ${draft.lp.duration==='permanent'?'none planned (permanent)':`UNKNOWN until confirmed on-chain lock start`}.\nWithdrawal eligibility: ${lpInfo.withdrawalEligibility}.`);}catch{text('lp-breakdown','Enter a locking percentage from 50 to 100, using whole percentages only, as required by Locker V2.');}
 const sequence=launch?['prepare this creator’s minter, Curve and dependencies; never reuse ANLTEST','verify exact creator ownership, StateInit and fresh fees for each operation','reconcile creation base and mandatory donation','initialize this project’s Curve and verify its Jetton custody','renounce this project’s mint authority and verify activation','trading needs independently verified delivery/refund receipts; migration stays blocked']:['prepare compatible Standard minter','deploy minter and verify exact code/data','mint configured supply and verify actual recipient custody','optional separate administrator renouncement','optional separate distribution and vesting'];
 $('wizard-sequence').replaceChildren(...sequence.map(s=>{const li=document.createElement('li');li.textContent=s+' — NOT AUTHORIZED; separate verification and wallet confirmation required.';return li;}));
 const cards=[['Token',`${draft.metadata.name||'Not set'} (${draft.metadata.symbol||'symbol not set'})`],['Creation mode',launch?'MemeLabs Launchpad · fixed fair-launch economics':'Standard TEP-74 Jetton · no Curve'],['Supply and precision',`${e.supply} tokens / ${e.decimals} decimals (configured; on-chain supply: UNKNOWN)`],['Creator wallet',draft.metadata.creator||'Not set'],['Distribution',`${format(result.allocatedUnits,e.decimals)} tokens allocated; ${result.recipients.length} planned recipients. ${draft.distribution.skip?'Airdrop skipped.':'Unfunded draft only; delivered balance: UNKNOWN.'}`],['Vesting',draft.vesting.enabled?`${draft.vesting.amount} team tokens; ${draft.vesting.cliffMonths}-month cliff / ${draft.vesting.durationMonths} months. Escrowed balance: UNKNOWN; custody NOT VERIFIED.`:'Optional vesting skipped; saved settings retained.'],['Bonding Curve',launch?`80% Curve / 20% DEX; ${CURVE.feeBps} bps trading fee; graduation at ${CURVE.thresholdTon} real TON. Reserves: UNAVAILABLE.`:'Not included in Standard mode.'],['LP locking',launch?`${draft.lp.percent}% for ${draft.lp.duration==='permanent'?'permanent lock':draft.lp.duration+' days'}. Beneficiary ${draft.lp.beneficiary||'not set'}; controller of unlocked LP ${draft.lp.percent==='100'?'none':draft.lp.controller||'not set'}. Custody NOT VERIFIED.`:'Not included in Standard mode.'],['Known creation fees','0.20 TON base + 0.02 TON mandatory donation = 0.22 TON, plus unknown network/deployment costs. Saving is free.']];
 $('wizard-review-cards').replaceChildren(...cards.map(([label,value])=>{const box=document.createElement('div');box.className='wizard-review-box';const name=document.createElement('dt');name.className='wizard-review-label';name.textContent=label;const detail=document.createElement('dd');detail.className='wizard-review-val';detail.textContent=value;box.append(name,detail);return box;}));
 text('wizard-summary',JSON.stringify({status:'CONFIGURATION_ONLY_DEPLOYMENT_UNKNOWN',network:'TON Testnet -3',mode:draft.mode,metadata:{...draft.metadata,supply:e.supply,decimals:e.decimals,logo:draft.metadata.logo?'Image configured (local/URL); not published':'none'},onChainState:{projectDeploymentStatus:'UNKNOWN',jettonSupply:'UNKNOWN',tokenBalance:'UNKNOWN',curveReserves:'UNAVAILABLE',holderCount:'UNKNOWN',lpCustody:'NOT_VERIFIED',migrationProgress:'UNAVAILABLE',transactionReceipts:'UNKNOWN'},distribution:{allocations:draft.allocations,skip:draft.distribution.skip,recipientCount:result.recipients.length,airdropTokens:format(result.airdropUnits,e.decimals),funded:false,availableBalanceUnits:null},vesting:draft.vesting.enabled?{...draft.vesting,escrowedBalanceUnits:null,custody:'NOT_VERIFIED'}:'skipped; values retained',curve:launch?CURVE:'not included',lp:launch?{...draft.lp,actualCustody:'NOT_VERIFIED',lpBalanceUnits:null,unlockTimestamp:null}:'not included',knownCreationBaseTon:'0.20',mandatoryDonationTon:'0.02',knownCreationTotalExcludingNetworkTon:'0.22',networkFees:'UNKNOWN — fresh estimate required',mintAuthority:launch?'renouncement required before activation':'retained until separately renounced',irreversibleActions:'Real deployments, minting, renouncement and transfers require separate verification and confirmations. No financial action is performed here.'},null,2));
 text('wizard-validation',result.valid?'Configuration fields are valid. This is not an execution approval. '+BLOCKER:'Incomplete configuration (you may still save and navigate):\n'+result.errors.join('\n'));
 text('wizard-project-status',`Selected draft: ${draft.metadata.name||'Untitled'}\nProject deployment status: DRAFT · deployment UNKNOWN\nJetton supply: configured ${e.supply} (${e.decimals} decimals); actual on-chain supply: UNKNOWN\nToken balance: UNKNOWN\nBonding Curve reserves: UNAVAILABLE\nHolder counts: UNKNOWN\nLP custody: NOT VERIFIED (LP balance: UNKNOWN; unlock timestamp: UNKNOWN)\nMigration progress: UNAVAILABLE (migration blocked)\nTransaction receipts: UNKNOWN (none authenticated here)\n${BLOCKER}`);
 renderMigrationAndLpGrids(draft,prep,prepStatus);
 renderDiagnostics();
 renderProjects();void preparation.render();
}
function renderProjects(){
 const list=$('wizard-projects');list.replaceChildren();if(!store.projects.length){const p=document.createElement('p');p.textContent='No saved projects on this browser yet. Choose Save Draft.';list.append(p);return;}
 for(const project of store.projects){
  const card=document.createElement('div');card.className='labs-project-card';
  const head=document.createElement('div');head.className='labs-project-header';
  const avatar=document.createElement('div');avatar.className='labs-project-avatar';
  try{const src=safeLogo(project.metadata.logo);if(src){const img=document.createElement('img');img.src=src;img.alt='';avatar.append(img);}else avatar.textContent='🪙';}catch{avatar.textContent='🪙';}
  const info=document.createElement('div');info.className='labs-project-info';
  const title=document.createElement('div');title.className='labs-project-title';title.textContent=`${project.metadata.name||'Untitled draft'} (${project.metadata.symbol?'$'+project.metadata.symbol:'no symbol'})`;
  const meta=document.createElement('div');meta.className='labs-project-meta';
  const pPrep=preparation.getPrepared(project.id),pStat=preparation.getStatus(project.id);
  const life=deriveLifecycleStage(project,pPrep,pStat);
  const lpTag=project.mode==='launchpad'?`LP ${project.lp.percent}% · ${project.lp.duration==='permanent'?'Perm':project.lp.duration+'d'}`:'No LP Lock';
  for(const tagText of [project.mode==='launchpad'?'Launchpad':'Standard',life.short,lpTag,project.savedAt?project.savedAt.slice(0,10):'unsaved']){const tag=document.createElement('span');tag.className='labs-project-tag';tag.textContent=tagText;meta.append(tag);}
  info.append(title,meta);head.append(avatar,info);
  const actions=document.createElement('div');actions.className='labs-project-actions';
  const openBtn=document.createElement('button');openBtn.className='labs-btn-secondary';openBtn.type='button';openBtn.textContent='Open Draft';
  openBtn.onclick=()=>{try{store=loadStore(localStorage);draft=store.projects.find(p=>p.id===project.id);if(!draft)throw Error('Draft no longer available.');save(false);fill();}catch(e){text('wizard-status',e.message);}};
  const delBtn=document.createElement('button');delBtn.className='labs-btn-secondary';delBtn.type='button';delBtn.textContent='Delete';
  delBtn.onclick=()=>{try{store=deleteDraft(localStorage,project.id,store.revision);if(draft.id===project.id){draft=store.projects[0]||createDraft();fill();}else renderProjects();text('wizard-status','Draft removed from local browser storage.');}catch(e){text('wizard-status',e.message);}};
  actions.append(openBtn,delBtn);card.append(head,actions);list.append(card);
 }
}
function save(message=true){
 if(unavailable){text('wizard-status','Storage unavailable or incompatible; no existing data was overwritten.');return false;}
 try{store=saveDraft(localStorage,draft,store.revision);draft=store.projects.find(p=>p.id===draft.id);if(message)text('wizard-status','Draft saved locally on this device. No transaction, mint, payment or contract was created.');renderProjects();return true;}catch(e){text('wizard-status','Draft NOT saved. '+e.message);return false;}
}
function showStage(focus=true){
 for(let i=1;i<=6;i++){const active=i===draft.stage;$('wizard-panel-'+i).hidden=!active;$('wizard-panel-'+i).classList.toggle('active',active);}
 for(const button of document.querySelectorAll('[data-step]')){const active=Number(button.dataset.step)===draft.stage;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
 $('wizard-mobile-step').value=String(draft.stage);$('wizard-back').disabled=draft.stage===1;$('wizard-next').disabled=draft.stage===6;text('wizard-progress',`Step ${draft.stage} of 6: ${TITLES[draft.stage-1]} · configuration progress, not on-chain completion`);if(focus)$('wizard-stage-title-'+draft.stage).focus();
}
function go(n){if(n<1||n>6)return;draft.stage=n;render();if(save(false))text('wizard-status','Configuration progress saved locally. No transaction was requested.');showStage();}
for(const [id,[section,key]]of Object.entries(fields))$(id).addEventListener('input',()=>{if(section==='metadata'&&['supply','decimals'].includes(key)&&draft.mode==='launchpad')return;draft[section][key]=$(id).value;if(section==='trade'){$('curve-sim-card').hidden=true;text('curve-preview','Amount changed; recalculate the configuration preview. No live trading quote exists.');}if(key==='symbol'){draft[section][key]=draft[section][key].toUpperCase();$(id).value=draft[section][key];}text('wizard-status','Unsaved configuration changes.');render();});
$('wizard-mode').onchange=()=>{draft.mode=$('wizard-mode').value;if(draft.mode==='launchpad')delete draft.walletProfile;$('curve-sim-card').hidden=true;fill();text('wizard-status','Mode changed. Review the selected wallet profile before saving.');};
$('wizard-standard-settlement').onchange=()=>{
 if($('wizard-standard-settlement').checked&&draft.mode==='standard')draft.walletProfile='STANDARD_V2_SETTLEMENT';
 else delete draft.walletProfile;
 text('wizard-status','Unsaved wallet profile change. A new preparation will derive different contract addresses.');render();
};
for(const card of document.querySelectorAll('#wizard-mode-cards [data-mode]')){const pick=()=>{if(draft.mode===card.dataset.mode)return;$('wizard-mode').value=card.dataset.mode;$('wizard-mode').onchange();};card.onclick=pick;card.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();pick();}};}
$('wizard-skip-distribution').onchange=()=>{draft.distribution.skip=$('wizard-skip-distribution').checked;render();};$('wizard-vesting-enabled').onchange=()=>{draft.vesting.enabled=$('wizard-vesting-enabled').checked;render();};
for(const radio of document.querySelectorAll('[name="dist-type"]'))radio.onchange=()=>{draft.distribution.mode=radio.value;render();};
for(const button of document.querySelectorAll('[data-step]'))button.onclick=()=>go(Number(button.dataset.step));
$('wizard-mobile-step').onchange=()=>go(Number($('wizard-mobile-step').value));$('wizard-back').onclick=()=>go(draft.stage-1);$('wizard-next').onclick=()=>go(draft.stage+1);$('wizard-save').onclick=()=>save();
$('wizard-new').onclick=()=>{if(!save(false))return;draft=createDraft();save(false);fill();};
$('preview-calculate').onclick=()=>{try{const sim=previewBuy(draft.trade.buyAttachment);text('sim-tokens-out',sim.tokens+' tokens');text('sim-fee-ton',sim.protocolFeeTon+' TON');$('curve-sim-card').hidden=false;text('curve-preview',JSON.stringify(sim,null,2)+'\nINITIAL configuration preview only. Sell quote unavailable without active reserves and delivered tokens.');}catch(e){$('curve-sim-card').hidden=true;text('curve-preview',e.message);}};
for(const b of document.querySelectorAll('[data-ton]'))b.onclick=()=>{if(draft.mode!=='launchpad')return;draft.trade.buyAttachment=b.dataset.ton;$('preview-buy').value=b.dataset.ton;render();$('preview-calculate').onclick();};
for(const b of document.querySelectorAll('[data-lp]'))b.onclick=()=>{if(draft.mode!=='launchpad')return;draft.lp.percent=b.dataset.lp;$('lp-percent').value=b.dataset.lp;text('wizard-status','LP lock percentage updated in draft.');render();};
$('labs-csv-example-btn').onclick=()=>{const sample='address,amount\n0:1111111111111111111111111111111111111111111111111111111111111111,250\n0:2222222222222222222222222222222222222222222222222222222222222222,500\n0:3333333333333333333333333333333333333333333333333333333333333333,250';if(draft.distribution.mode==='equal'&&draft.distribution.amount==='0'){draft.distribution.amount='250';$('labs-dist-amount').value='250';}draft.distribution.text=sample;$('labs-dist-manual-text').value=sample;render();text('labs-dist-status-text','3 sample Testnet recipients loaded. Review allocations and save; no tokens sent.');};
const file=$('lp-logo-file');$('lp-upload-btn').onclick=()=>file.click();file.onchange=async()=>{const f=file.files[0];if(!f)return;if(f.size>262144||!['image/png','image/jpeg','image/webp'].includes(f.type)){text('logo-upload-status','Use PNG/JPEG/WebP up to 256 KiB. Nothing uploaded.');return;}const reader=new FileReader();reader.onerror=()=>text('logo-upload-status','Image could not be read; the previous draft image was retained.');reader.onload=()=>{draft.metadata.logo=String(reader.result);$('lp-logo').value='';render();text('logo-upload-status','Image retained in this local draft only. Save Draft to persist; it has not been uploaded or published.');};reader.readAsDataURL(f);};
$('labs-dist-tab-csv').onclick=()=>{$('labs-dist-dropzone').hidden=false;$('labs-dist-manual-area').hidden=false;};$('labs-dist-tab-manual').onclick=()=>{$('labs-dist-dropzone').hidden=true;$('labs-dist-manual-area').hidden=false;};
const csv=$('labs-dist-file-input');$('labs-dist-dropzone').setAttribute('role','button');$('labs-dist-dropzone').tabIndex=0;$('labs-dist-dropzone').setAttribute('aria-label','Choose a CSV file of airdrop recipients');$('labs-dist-dropzone').onclick=()=>csv.click();$('labs-dist-dropzone').onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();csv.click();}};
async function importCsv(f){if(!f)return;try{if(f.size>100000||!/\.csv$/i.test(f.name))throw Error('Choose a CSV file up to 100 KiB');const contents=await f.text();if(contents.length>100000)throw Error('CSV too large');const next=structuredClone(draft);next.distribution.text=contents;const list=recipients(next);if(!list.length)throw Error('CSV contains no recipients');draft.distribution.text=contents;$('labs-dist-manual-text').value=contents;render();text('labs-dist-status-text',`${list.length} recipients imported. Review allocations and save; no tokens sent.`);}catch(e){text('labs-dist-status-text','CSV not imported; previous recipients retained. '+e.message);}}
csv.onchange=()=>{const f=csv.files[0];csv.value='';void importCsv(f);};$('labs-dist-dropzone').ondragover=e=>e.preventDefault();$('labs-dist-dropzone').ondrop=e=>{e.preventDefault();void importCsv(e.dataTransfer.files[0]);};
$('wizard-live-refresh').onclick=async()=>{if(liveBusy)return;liveBusy=true;$('wizard-live-refresh').disabled=true;text('wizard-live-status','Reading real Testnet accounts; not your draft token.');try{const r=await fetch('/api/mvp/status',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(30000)}),j=await r.json();if(!r.ok){if(j.reason==='PROVIDER_RATE_LIMITED')renderDiagnostics('PROVIDER_RATE_LIMITED',{retryAfterSeconds:j.retryAfterSeconds||1});throw Error(j.reason==='PROVIDER_RATE_LIMITED'?`Provider rate limited (429). Wait ${j.retryAfterSeconds||1}s. No stale values substituted.`:'Provider unavailable; balances unknown.');}if(j.network!=='-3'||j.financialSigningEnabled!==false||j.scope!=='ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS')throw Error('Incompatible data rejected.');if(j.curveDeploymentOperation?.state==='LOCKED_PENDING_RECONCILIATION')renderDiagnostics('TRANSACTION_OUTCOME_UNCERTAIN');text('wizard-live-status',`EXISTING ANLTEST CHECKPOINT — NOT YOUR DRAFT\nObserved ${j.observedUtc}; ${j.dataStatus}.\nMinter: ${j.minter.address}\nSupply: ${format(j.minter.supplyUnits,j.minter.decimals)} ${j.minter.symbol}\nCurve: ${j.curve.accountState}; ${j.stage}.\nOriginal operation: ${j.curveDeploymentOperation?.state||'unknown'} (Historical ANLTEST Curve #2 only — separate from your project).\nAccount/getter observations do not prove a new project, trade, refund or LP lock. No trading enabled.`);}catch(e){text('wizard-live-status',e.message);}finally{liveBusy=false;$('wizard-live-refresh').disabled=false;}};
$('wizard-connect').onclick=async()=>{if(busy)return;busy=true;try{if(!ui){const r=await fetch('/api/config',{cache:'no-store'}),c=await r.json();if(!r.ok||c.network!=='-3'||c.financialSigningEnabled!==false||c.curveExecutionVersion!==window.TON_CONNECT_UI?.curveExecutionVersion||new URL(c.manifestUrl).origin!==location.origin)throw Error('Wallet configuration unavailable; financial actions stay disabled.');ui=new window.TON_CONNECT_UI.TonConnectUI({manifestUrl:c.manifestUrl,restoreConnection:false});ui.onStatusChange(async w=>{if(!w){$('wizard-disconnect').disabled=true;renderDiagnostics('WALLET_DISCONNECTED');text('wizard-wallet-status','Wallet disconnected. Your local drafts were retained.');return;}if(w.account.chain!=='-3'){try{await ui.disconnect();}catch{}renderDiagnostics('WRONG_NETWORK');text('wizard-wallet-status','Mainnet wallet rejected. Select Testnet (-3); no financial request was made.');return;}$('wizard-disconnect').disabled=false;if(!draft.metadata.creator){draft.metadata.creator=w.account.address;$('wizard-creator').value=w.account.address;render();}text('wizard-wallet-status','Connected Testnet account: '+w.account.address+'. Connection is not an ownership-proof authorization or a financial approval. Draft wallet: '+draft.metadata.creator+'.');});}if(!ui.connected)await ui.openModal();}catch(e){text('wizard-wallet-status',e.message);}finally{busy=false;}};
$('wizard-disconnect').onclick=async()=>{try{await ui?.disconnect();}catch{text('wizard-wallet-status','Disconnect not confirmed; no transaction was requested.');}};
window.addEventListener('storage',e=>{if(e.key===KEY)text('wizard-status','Drafts changed in another tab. Reload before saving to avoid overwriting them.');});
fill();
