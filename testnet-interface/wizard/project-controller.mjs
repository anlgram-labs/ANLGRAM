import {configurationFingerprint} from './preparation-model.mjs';
import {CURVE,format} from './model.mjs';
import {projectStatusText,LIFECYCLE_STAGES,deriveLifecycleStage,deriveMigrationLifecycle,migrationSummary,lpLockerSummary,validateProjectStatusResponse,isAuthenticTxHash,tonviewerTxUrl,tonviewerAccountUrl} from './project-status.mjs';

// Cached configuration only: never a quote, authority, operation ledger or receipt.
export function renderMigrationAndLpGrids(d,p=null,s=null){
 const $=id=>document.getElementById(id),mig=migrationSummary(d,p,s),lp=lpLockerSummary(d,p,s),migLife=deriveMigrationLifecycle(d,p,s);
 const bar=$('curve-grad-bar'),fill=$('curve-grad-fill'),percent=mig.graduationProgressPercent;
 if(bar&&fill&&mig.applicable){
  bar.setAttribute('aria-label',`Graduation progress toward ${mig.thresholdTon} TON`);
  bar.setAttribute('aria-valuemax',mig.thresholdTon);
  if(percent===null)bar.removeAttribute('aria-valuenow');
  else bar.setAttribute('aria-valuenow',String(Math.min(100,percent)*Number(mig.thresholdTon)/100));
  fill.style.width=`${Math.min(100,percent??0)}%`;
 }
 const rows=[
  ['Bonding Curve Trading Progress',mig.applicable?`Accumulated TON: ${mig.observedRealTonReserveDisplay} · Curve inventory: ${mig.observedCurveInventoryDisplay}`:'Not applicable (Standard Jetton mode)'],
  [`Graduation Progress (${mig.applicable?mig.thresholdTon:CURVE.thresholdTon} TON Target)`,mig.applicable?mig.graduationProgressDisplay:'Not applicable (no Bonding Curve)'],
  ['Migration Eligibility',mig.migrationEligibility],
  ['STON.fi v2.2 Pool & Router Verification',mig.applicable?`Expected Pool: ${mig.stonfiPoolAddress} (Pool: ${mig.poolVerification} · Router: ${mig.routerVerification}) · Router Ref: ${mig.routerCodeReferenceHash.slice(0,16)}…`:'Not applicable'],
  ['Migration Binding & LP Locker V2',mig.applicable?`Binding V2: ${mig.migrationBindingAddress} · Vault V2: ${mig.lpLockerAddress} · Locker LP Wallet: ${mig.expectedLpWalletAddress} · ${mig.versionedPackageStatus}`:'Not applicable'],
  ['Liquidity Deposit Status',mig.liquidityDepositStatus],
  ['Migration Transaction Receipts',mig.migrationReceiptStatus],
  ['Missing / Delayed LP Receipt State',mig.missingOrDelayedLpReceiptState],
  ['LP Custody & Actual Verified LP Received',lp.applicable?`Custody: ${lp.custodyStatus} · Actual Verified LP Received: ${lp.actualVerifiedLpReceivedDisplay}`:'Not applicable'],
  ['Locked & Unlocked LP Balances (Configured vs. On-Chain)',lp.applicable?`Locked: ${lp.lockedLpDisplay} · Unlocked: ${lp.unlockedLpDisplay}`:'Not applicable'],
  ['Configured Lock Share & Duration',lp.applicable?`${lp.percentDisplay} · ${lp.durationLabel}`:'Not applicable'],
  ['Beneficiary & Unlocked Controller',lp.applicable?`Beneficiary: ${lp.beneficiary} · Unlocked Controller: ${lp.unlockedController}`:'Not applicable'],
  ['Unlock Timestamp & Extension Policy',lp.applicable?`${lp.unlockDateDisplay} (${lp.extensionPolicy})`:'Not applicable'],
  ['Withdrawal Eligibility & Withdrawal Receipts',lp.applicable?`${lp.withdrawalEligibility} · Withdrawal Receipts: ${lp.authenticatedWithdrawalReceipts}`:'Not applicable']
 ];
 for(const gridId of ['stonfi-migration-grid','dashboard-lp-migration-grid']){
  const el=$(gridId);if(!el)continue;
  el.replaceChildren(...rows.map(([label,value])=>{const box=document.createElement('div');box.className='wizard-review-box';const dt=document.createElement('dt');dt.className='wizard-review-label';dt.textContent=label;const dd=document.createElement('dd');dd.className='wizard-review-val';dd.textContent=value;box.append(dt,dd);return box;}));
 }
 const migBadge=$('migration-lifecycle-badge'),migBanner=$('migration-anomaly-banner'),migList=$('migration-lifecycle-list');
 if(migBadge)migBadge.textContent=migLife.summaryBadge;
 if(migBanner)migBanner.textContent=migLife.anomaly?`${migLife.anomaly.label} [${migLife.anomaly.badge}]: ${migLife.anomaly.detail}`:'Migration status: NOT STARTED · No stage is marked completed without authenticated finalized receipts. Partial, failed, expired or uncertain operations never permit retry.';
 if(migList){
  migList.replaceChildren(...migLife.steps.map(step=>{
   const li=document.createElement('li');li.className='labs-lifecycle-item'+(step.status==='VERIFIED_ON_CHAIN'?' active':'');
   const head=document.createElement('div');head.className='labs-lifecycle-head';
   const title=document.createElement('strong');title.textContent=`${step.step}. ${step.label}`;
   const st=document.createElement('span');st.className=step.status==='VERIFIED_ON_CHAIN'?'badge-valid':'labs-project-tag';st.textContent=step.badgeText;
   head.append(title,st);
   const desc=document.createElement('p');desc.className='labs-mode-desc';desc.textContent=step.description;
   li.append(head,desc);return li;
  }));
 }
 const life=deriveLifecycleStage(d,p,s),badge=$('wizard-lifecycle-current-badge'),list=$('wizard-lifecycle-list');
 if(badge)badge.textContent=life.displayBadge||life.label;
 if(list){
  list.replaceChildren(...LIFECYCLE_STAGES.map((stage,idx)=>{
   const li=document.createElement('li'),current=stage.id===life.id;
   li.className='labs-lifecycle-item'+(current?' active':'');
   const head=document.createElement('div');head.className='labs-lifecycle-head';
   const title=document.createElement('strong');title.textContent=`${idx+1}. ${stage.label}`;
   const st=document.createElement('span');
   st.className=current?'badge-valid':stage.id==='DRAFT'||stage.id==='DEPLOYMENT_PENDING'?'labs-project-tag':'badge-muted';
   st.textContent=current?'CURRENT':stage.id==='DRAFT'||stage.id==='DEPLOYMENT_PENDING'?'PREPARATION':'NOT VERIFIED';
   head.append(title,st);
   const desc=document.createElement('p');desc.className='labs-mode-desc';desc.textContent=stage.description;
   li.append(head,desc);return li;
  }));
 }
}

export function attachPreparation(current){
 const $=id=>document.getElementById(id),text=(id,s)=>{const el=$(id);if(el)el.textContent=s;},prepared=new Map(),statuses=new Map();
 let busy=false,statusBusy=false,revision=0;
 async function render(){
  const n=++revision,d=current(),p=prepared.get(d.id),s=statuses.get(d.id),hash=await configurationFingerprint(d);if(n!==revision)return;
  const valid=p?.configurationFingerprint===hash;
  if($('wizard-export'))$('wizard-export').disabled=!valid;
  if($('wizard-project-plan'))$('wizard-project-plan').replaceChildren();
  renderMigrationAndLpGrids(d,valid?p:null,s);
  if(!valid){
   text('wizard-preparation',p?'Configuration changed. Prepare a new plan; previous templates are stale.':'No project-specific plan prepared.');
   text('distribution-batches','Batch templates require a valid prepared project. No balances or fees assumed.');
   text('wizard-project-status','No project plan prepared yet.');
   return;
  }
  if($('wizard-sequence'))$('wizard-sequence').replaceChildren(...p.operations.map(o=>{const li=document.createElement('li');li.textContent=o.name.replaceAll('-',' ')+' · NOT SUBMITTED / NOT AUTHORIZED';return li;}));
  text('wizard-project-status',projectStatusText(p,s));
  const receipts=s?.distributionReceipts;
  if($('wizard-project-status')&&receipts?.scope==='WALLET_RECORDS_RELATIVE_TO_TESTNET_REFERENCE'&&
     receipts.validatorFinalityVerified===false&&receipts.source===p.distribution.creatorWalletRaw&&Array.isArray(receipts.recipients)){
   const expected=p.distribution.batches.flatMap(batch=>batch.messages.map(message=>message.receiptExpectation));
   if(expected.length===receipts.recipients.length&&expected.every((entry,i)=>entry&&
      ['operationId','queryId','amountUnits','recipientWallet'].every(key=>entry[key]===receipts.recipients[i]?.[key]))){
    const count=outcome=>receipts.recipients.filter(row=>row.outcome===outcome).length;
    $('wizard-project-status').textContent+=`\nDistribution wallet records: ${count('DELIVERY_RECORDED')} delivered · ${count('RETURN_RECORDED')} returned · ${count('PENDING')} pending · ${count('UNKNOWN')} unknown. Relative to the verified account reference. Validator finality remains unverified.`;
   }
  }
  text('wizard-preparation',`OFFLINE PLAN · NOT AUTHORIZED · DEPLOYMENT UNKNOWN\nProject ${p.draftId} / ${p.metadata.symbol}\nMinter ${p.accounts.minter.address}\nConfiguration ${hash}\nConfigured supply: ${p.configuredSupplyUnits} base units; actual on-chain supply: UNKNOWN.\n${p.operations.length} proposed operations; every operation NOT_SUBMITTED. Network fees UNKNOWN.\nDistribution: ${p.distribution.batches.length} unfunded batches / ${p.distribution.totalUnits} base units (available balance: UNKNOWN).\nVesting: ${p.vesting.status}; configured ${p.vesting.amountUnits??'UNAVAILABLE'} base units; escrowed balance: UNKNOWN; custody NOT VERIFIED.\nLP ${p.migration?JSON.stringify(p.migration.terms):'not applicable'}; LP balance: UNKNOWN; custody NOT VERIFIED; migration BLOCKED.\nExport includes exact public StateInit and message templates, never an authorization or receipt.`);
  if(p.vesting.schedule&&$('wizard-preparation'))$('wizard-preparation').textContent+=`\nVesting beneficiary: ${p.vesting.beneficiary}; cliff ${new Date(p.vesting.schedule.cliffTimestamp*1000).toISOString()}; full vesting ${new Date(p.vesting.schedule.endTimestamp*1000).toISOString()}. Months are 30 days, matching the existing builder.`;
  if($('wizard-preparation'))$('wizard-preparation').textContent+=`\nProposed creation-operation attachments: ${format(p.creationCharge.proposedOperationAttachmentsNano)} Testnet TON; separate mandatory donation 0.02 TON; base-charge reconciliation and fresh fees required. This is not a quote or maximum debit.`;
  text('distribution-batches',p.distribution.batches.map((b,i)=>`Batch ${i+1}: ${b.recipientCount} recipients / ${b.totalUnits} base units / ${b.status}\n`+b.recipients.map(r=>r.address+' · '+format(r.amountUnits,Number(p.metadata.decimals))+' '+p.metadata.symbol).join('\n')).join('\n')||'No distribution requested.');
  for(const [role,a]of Object.entries(p.accounts)){const line=document.createElement('p'),link=document.createElement('a');link.href=tonviewerAccountUrl(a.address);link.target='_blank';link.rel='noopener noreferrer';link.textContent=role+' · derived address only · deployment NOT VERIFIED';line.append(link);if($('wizard-project-plan'))$('wizard-project-plan').append(line);}
  if(p.migration){
   for(const [role,addr]of [['migrationBindingV2',p.migration.binding.address],['lpLockerV2',p.migration.locker.address],['expectedStonfiPool',p.migration.expectedPool],['expectedLockerLpWallet',p.migration.expectedLpWallet]]){
    const line=document.createElement('p'),link=document.createElement('a');link.href=tonviewerAccountUrl(addr);link.target='_blank';link.rel='noopener noreferrer';link.textContent=role+' · derived V2 address only · custody/deployment NOT VERIFIED';line.append(link);if($('wizard-project-plan'))$('wizard-project-plan').append(line);
   }
  }
  for(const o of p.operations){const line=document.createElement('p');line.textContent=`Operation ${o.name} (${o.id.slice(0,14)}…) · status: ${o.status} · receipt: ${o.receipt?.status||'NO_AUTHENTIC_TRANSACTION'} · ${o.receiptExpectation?.stateInitHash?'V5 deployment-receipt adapter target (requires authentic provider provenance & finality)':'descendant mint/transfer verifier required'}`;if($('wizard-project-plan'))$('wizard-project-plan').append(line);}
  const note=document.createElement('p');note.textContent='Authenticated project receipt availability and balances remain UNKNOWN. Matched V5 deployment fields alone never prove finality or custody. ANLTEST observations are separate.';if($('wizard-project-plan'))$('wizard-project-plan').append(note);
 }
 async function queryStatus(){
  if(statusBusy)return;statusBusy=true;if($('wizard-status-refresh'))$('wizard-status-refresh').disabled=true;
  try{
   const input=structuredClone(current()),hash=await configurationFingerprint(input);
   if($('wizard-status-endpoint-output'))text('wizard-status-endpoint-output','Querying /api/projects/status · read-only, no wallet request...');
   const response=await fetch('/api/projects/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)}),s=await response.json();
   if(!response.ok)throw Error(s.error||'Project status unavailable');
   validateProjectStatusResponse(s,hash,input.mode);
   if(await configurationFingerprint(current())!==hash)throw Error('Configuration changed during status check; stale result discarded');
   statuses.set(input.id,s);await render();
   if($('wizard-status-endpoint-output'))text('wizard-status-endpoint-output',`Project status received (schema ${s.schema}${s.generation?`, gen ${s.generation}`:''}). Scope: ${s.scope}`);
  }catch(e){
   if($('wizard-status-endpoint-output'))text('wizard-status-endpoint-output','Project status unavailable: '+e.message);
  }finally{
   statusBusy=false;if($('wizard-status-refresh'))$('wizard-status-refresh').disabled=false;
  }
 }
 if($('wizard-status-refresh'))$('wizard-status-refresh').onclick=()=>void queryStatus();
 $('wizard-prepare').onclick=async()=>{if(busy)return;busy=true;$('wizard-prepare').disabled=true;try{const input=structuredClone(current()),hash=await configurationFingerprint(input);text('wizard-preparation','Preparing configuration only; no wallet request.');const response=await fetch('/api/projects/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)}),p=await response.json();if(!response.ok)throw Error(p.error||'Preparation unavailable');if(p.scope!=='OFFLINE_PROJECT_PREPARATION_NOT_AUTHORIZATION'||p.network!=='-3'||p.financialSigningEnabled!==false||p.broadcastEnabled!==false||p.configurationFingerprint!==hash||p.draftId!==input.id)throw Error('Incompatible preparation rejected');if(await configurationFingerprint(current())!==hash)throw Error('Configuration changed during preparation; result discarded');prepared.set(input.id,p);if(p.migration?.statusView)statuses.set(input.id,{schema:2,network:'-3',configurationFingerprint:hash,scope:'PROJECT_CONFIGURATION_NO_REGISTERED_CHAIN_EVIDENCE',status:p.migration.statusView,unavailableReason:'NO_REGISTERED_VERSIONED_DEPLOYMENT_AND_FINALIZED_RECEIPTS',financialSigningEnabled:false,migrationAuthorized:false,withdrawalsEnabled:false});await render();}catch(e){text('wizard-preparation','Preparation unavailable. '+e.message);}finally{busy=false;$('wizard-prepare').disabled=false;}};
 $('wizard-export').onclick=async()=>{const p=prepared.get(current().id);if(!p||p.configurationFingerprint!==await configurationFingerprint(current())){await render();return;}const url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='memelabs-'+p.draftId+'-UNAUTHORIZED.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return{render,queryStatus,getPrepared:id=>prepared.get(id)||null,getStatus:id=>statuses.get(id)||null};
}
