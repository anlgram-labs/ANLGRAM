import {Address} from '@ton/core/dist/address/Address.js';
import math from '../../minter-contract/scripts/bonding-curve-math.js';
const {DEFAULT_CONFIG,BondingCurveEngine}=math;
export const KEY='anlgram:testnet:memelabs-drafts:v1';
export const TITLES=['Create memecoin','Distribution & vesting','Bonding curve','Liquidity & LP locking','Review configuration','My Projects'];
export const BLOCKER='Financial execution is disabled. The original Curve #2 attempt is permanently locked; recovery requires independent review, authentic finalized receipts and separate owner authorization. No mint, buy, sell or refund has been verified for this MVP.';
const max=(1n<<120n)-1n;
export function units(value,decimals){
 if(typeof value!=='string'||value.length>80||!Number.isInteger(decimals)||decimals<0||decimals>18||!/^\d+(?:\.\d+)?$/.test(value))throw Error('Use a positive decimal number without commas or scientific notation.');
 const [a,b='']=value.split('.');if(b.length>decimals)throw Error(`At most ${decimals} decimal places are allowed.`);
 const n=BigInt(a)*10n**BigInt(decimals)+BigInt(b.padEnd(decimals,'0')||'0');if(n>max)throw Error('Amount exceeds supported token units.');return n;
}
export const format=(n,dec=9)=>{if(!Number.isInteger(dec)||dec<0||dec>18)return 'unavailable (invalid precision)';n=BigInt(n);const p=10n**BigInt(dec),f=(n%p).toString().padStart(dec,'0').replace(/0+$/,'');return(n/p).toString()+(f?'.'+f:'');};
export function address(s){if(typeof s!=='string'||s.length>80||!s.trim())throw Error('Enter a valid TON wallet address.');const a=Address.parse(s.trim());if(a.workChain!==0)throw Error('Use a basechain (workchain 0) wallet; the existing Jetton wallets reject other workchains.');return a.toRawString();}
export function safeLogo(s){
 if(!s)return '';
 if(typeof s!=='string'||s.length>360000)throw Error('Logo is too large.');
 if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s))return s;
 const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.port||/\.svg(?:$|[?#])/i.test(u.pathname))throw Error('Use an HTTPS raster image URL, or upload PNG/JPEG/WebP.');return u.href;
}
export function createDraft(id=crypto.randomUUID()){
 return{schema:1,network:'-3',id,stage:1,mode:'standard',metadata:{name:'',symbol:'',supply:'1000000000',decimals:'9',description:'',logo:'',creator:''},allocations:{creator:'0',community:'0',team:'0'},distribution:{skip:false,mode:'equal',amount:'0',text:'',batchSize:'4'},vesting:{enabled:false,beneficiary:'',amount:'0',cliffMonths:'3',durationMonths:'12',startDate:''},lp:{percent:'100',duration:'permanent',beneficiary:'',controller:''},trade:{buyAttachment:'1',sellTokens:'0'},savedAt:null};
}
export function normalizeDraft(input){
 if(input?.schema!==1||input.network!=='-3'||!/^[-a-f0-9]{36}$/.test(input.id||''))throw Error('Unsupported draft; existing data was preserved.');
 const d=createDraft(input.id);d.stage=Number.isInteger(input.stage)&&input.stage>=1&&input.stage<=6?input.stage:1;d.mode=input.mode==='launchpad'?'launchpad':'standard';
 if(input.walletProfile!==undefined){
  if(d.mode!=='standard'||input.walletProfile!=='STANDARD_V2_SETTLEMENT')throw Error('Unsupported Standard wallet profile.');
  d.walletProfile=input.walletProfile;
 }
 for(const section of ['metadata','allocations','distribution','vesting','lp','trade'])for(const key of Object.keys(d[section])){
  const v=input[section]?.[key];if(typeof d[section][key]==='boolean'){if(typeof v==='boolean')d[section][key]=v;}else if(typeof v==='string'&&v.length<=(key==='logo'?360000:key==='text'?100000:2000))d[section][key]=v;
 }
 d.savedAt=typeof input.savedAt==='string'?input.savedAt:null;return d;
}
export function effective(d){return d.mode==='launchpad'?{supply:format(DEFAULT_CONFIG.totalSupply),decimals:9}:{supply:d.metadata.supply,decimals:Number(d.metadata.decimals)};}
export function recipients(d){
 const dec=effective(d).decimals,out=[],seen=new Set(),lines=d.distribution.text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
 if(lines.length>501)throw Error('Use no more than 500 recipients.');
 for(let i=0;i<lines.length;i++){
  const parts=lines[i].split(',').map(s=>s.trim());if(i===0&&/^address$/i.test(parts[0])&&parts.length<=2)continue;
  if(parts.length>2)throw Error(`Line ${i+1}: use address,amount without quoted fields.`);
  const raw=address(parts[0]);if(seen.has(raw))throw Error(`Line ${i+1}: duplicate wallet.`);seen.add(raw);
  const amount=d.distribution.mode==='equal'?d.distribution.amount:parts[1];const n=units(amount,dec);if(n<=0n)throw Error(`Line ${i+1}: amount must be greater than zero.`);out.push({address:raw,amountUnits:n.toString()});if(out.length>500)throw Error('Use no more than 500 recipients.');
 }
 return out;
}
export function validate(d){
 const errors=[],check=(fn,label)=>{try{return fn();}catch(e){errors.push(label+': '+e.message);return null;}};
 const e=effective(d);if(!d.metadata.name.trim()||d.metadata.name.trim().length>64)errors.push('Name: use 1–64 characters.');if(!/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(d.metadata.symbol))errors.push('Symbol: use 2–10 letters/numbers, beginning with a letter.');
 if(d.metadata.description.length>1000)errors.push('Description: use at most 1000 characters.');
 check(()=>address(d.metadata.creator),'Creator wallet');check(()=>safeLogo(d.metadata.logo),'Logo');
 const supply=check(()=>{if(d.mode!=='launchpad'&&!/^\d{1,2}$/.test(d.metadata.decimals))throw Error('Decimals must be an integer.');const n=units(e.supply,e.decimals);if(n<=0n)throw Error('Supply must be greater than zero.');return n;},'Supply');
 const allocations=Object.fromEntries(Object.entries(d.allocations).map(([k,v])=>[k,check(()=>units(v,e.decimals),k+' allocation')]));
 const allocated=Object.values(allocations).filter(n=>n!==null).reduce((a,b)=>a+b,0n);
 if(supply!==null&&allocated>supply)errors.push('Allocations exceed total supply.');
 if(d.mode==='launchpad'&&allocated>0n)errors.push('Launchpad is a fair launch: 80% Curve / 20% DEX, no free creator/team/community allocation. Optional future distributions require separately acquired, verified balances.');
 let list=[];if(!d.distribution.skip){if(!/^[1-4]$/.test(d.distribution.batchSize??'4'))errors.push('Choose 1–4 recipients per review batch. Actual wallet capability must be checked before signing.');list=check(()=>recipients(d),'Recipients')||[];const total=list.reduce((a,r)=>a+BigInt(r.amountUnits),0n);if(allocations.community!==null&&total>allocations.community)errors.push('Airdrop total exceeds the community allocation.');}
 if(d.vesting.enabled){check(()=>address(d.vesting.beneficiary),'Vesting beneficiary');const n=check(()=>units(d.vesting.amount,e.decimals),'Vesting amount');if(n===0n)errors.push('Vesting amount must be greater than zero.');if(n!==null&&allocations.team!==null&&n>allocations.team)errors.push('Vesting exceeds the team allocation.');if(!['1','3','6'].includes(d.vesting.cliffMonths)||!['6','12','24'].includes(d.vesting.durationMonths)||Number(d.vesting.cliffMonths)>Number(d.vesting.durationMonths))errors.push('Choose a supported cliff and duration.');if(!/^\d{4}-\d{2}-\d{2}$/.test(d.vesting.startDate)||!Number.isFinite(Date.parse(d.vesting.startDate+'T00:00:00Z'))||new Date(d.vesting.startDate+'T00:00:00Z').toISOString().slice(0,10)!==d.vesting.startDate)errors.push('Choose a valid vesting start date.');}
 if(d.mode==='launchpad'){
  const percent=check(()=>units(d.lp.percent,0),'LP percentage');if(percent!==null&&(percent<50n||percent>100n))errors.push('LP locking must be between 50% and 100%.');
  if(!['180','365','permanent'].includes(d.lp.duration))errors.push('Choose 180 days, 365 days or permanent.');check(()=>address(d.lp.beneficiary),'LP beneficiary');if(percent!==null&&percent<100n)check(()=>address(d.lp.controller),'Unlocked LP controller');
 }
 return{valid:errors.length===0,errors,supplyUnits:supply?.toString()??null,allocatedUnits:allocated.toString(),unallocatedUnits:supply!==null&&allocated<=supply?(supply-allocated).toString():null,recipients:list,airdropUnits:list.reduce((a,r)=>a+BigInt(r.amountUnits),0n).toString(),financialSigningEnabled:false};
}
export function loadStore(storage){
 const raw=storage.getItem(KEY);if(raw===null)return{schema:1,network:'-3',revision:0,selectedId:null,projects:[]};
 const data=JSON.parse(raw);if(data.schema!==1||data.network!=='-3'||!Number.isSafeInteger(data.revision)||data.revision<0||!Array.isArray(data.projects)||data.projects.length>20)throw Error('Saved drafts are incompatible; no data was overwritten.');
 return{schema:1,network:'-3',revision:data.revision,selectedId:data.selectedId,projects:data.projects.map(normalizeDraft)};
}
export function saveDraft(storage,input,expectedRevision){
 const d=normalizeDraft(input),store=loadStore(storage);if(store.revision!==expectedRevision)throw Error('Drafts changed in another tab. Reload before saving; no changes were overwritten.');
 const index=store.projects.findIndex(p=>p.id===d.id);d.savedAt=new Date().toISOString();if(index<0){if(store.projects.length>=20)throw Error('Maximum 20 drafts on this device.');store.projects.push(d);}else store.projects[index]=d;
 store.selectedId=d.id;store.revision++;storage.setItem(KEY,JSON.stringify(store));return store;
}
export function deleteDraft(storage,id,expectedRevision){
 const store=loadStore(storage);if(store.revision!==expectedRevision)throw Error('Drafts changed in another tab. Reload before deleting; no changes were overwritten.');
 store.projects=store.projects.filter(p=>p.id!==id);
 if(store.selectedId===id)store.selectedId=store.projects[0]?.id||null;
 store.revision++;storage.setItem(KEY,JSON.stringify(store));return store;
}
export function parseRecipientsDetailed(d){
 const dec=effective(d).decimals,out=[],seen=new Set(),lines=d.distribution.text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim());
 for(let i=0;i<lines.length;i++){
  const parts=lines[i].split(',').map(s=>s.trim());if(i===0&&/^address$/i.test(parts[0])&&parts.length<=2)continue;
  const entry={line:i+1,rawAddress:parts[0]||'',amountStr:d.distribution.mode==='equal'?d.distribution.amount:(parts[1]||'0'),valid:false,error:null,formattedAddress:''};
  if(parts.length>2){entry.error='Use address,amount without quotes.';}
  else{
   try{
    const raw=address(parts[0]);
    if(seen.has(raw)){entry.error='Duplicate wallet address.';}
    else{
     seen.add(raw);
     entry.formattedAddress=raw.slice(0,6)+'...'+raw.slice(-6);
     const n=units(entry.amountStr,dec);
     if(n<=0n){entry.error='Amount must be greater than zero.';}
     else{entry.valid=true;entry.amountUnits=n.toString();}
    }
   }catch(e){entry.error=e.message;}
  }
  out.push(entry);
 }
 return out;
}
export function previewBuy(attachment){
 const n=units(attachment,9),overhead=40000000n;if(n<=overhead)throw Error('The existing buy flow needs more than 0.04 TON settlement funding.');
 const q=new BondingCurveEngine().quoteBuy(n-overhead,50n);if(!q.success)throw Error(q.message||q.error);
 return{scope:'CONFIGURATION_PREVIEW_NOT_LIVE_QUOTE',attachmentNano:n.toString(),settlementFundingNano:overhead.toString(),tokens:format(q.tokensOut??q.cappedTokensOut),protocolFeeTon:format(q.feeTon),financialSigningEnabled:false};
}
export const CURVE={supply:format(DEFAULT_CONFIG.totalSupply),curve:format(DEFAULT_CONFIG.curveTokens),dex:format(DEFAULT_CONFIG.gradTokens),thresholdTon:format(DEFAULT_CONFIG.graduationThresholdTon),feeBps:DEFAULT_CONFIG.protocolFeeBps.toString()};
