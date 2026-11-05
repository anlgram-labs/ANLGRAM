import {createDraft,format,recipients,validate} from '../wizard/model.mjs';
import {reviewedStandardOperator} from './reviewed-standard-operator.mjs';

function fields(value,required,optional=[]){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    required.some(key=>typeof value[key]!=='string'||!value[key].trim())||
    Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw Error('INVALID_OWNER_DRAFT_SETTINGS');
}

export function createStandardOwnerDraft(input) {
 fields(input,['name','symbol','supply','decimals'],['distribution','vesting']);
 const draft=createDraft();
 for(const key of ['name','symbol','supply','decimals'])draft.metadata[key]=input[key].trim();
 if(Object.values(draft.metadata).some(value=>value.length>2000))throw Error('INVALID_OWNER_DRAFT_SETTINGS');
 draft.metadata.creator=reviewedStandardOperator;
 draft.distribution.skip=true;
 if(input.distribution!==undefined){
  fields(input.distribution,['csv','batchSize']);
  if(input.distribution.csv.length>100000)throw Error('INVALID_DISTRIBUTION_CSV');
  if(!/^[1-4]$/.test(input.distribution.batchSize))throw Error('INVALID_DISTRIBUTION_BATCH_SIZE');
  draft.distribution={skip:false,mode:'custom',amount:'0',text:input.distribution.csv,batchSize:input.distribution.batchSize};
  const rows=recipients(draft);
  if(!rows.length)throw Error('EMPTY_DISTRIBUTION');
  draft.allocations.community=format(rows.reduce((sum,row)=>sum+BigInt(row.amountUnits),0n),Number(draft.metadata.decimals));
 }
 if(input.vesting!==undefined){
  fields(input.vesting,['beneficiary','amount','startDate','cliffMonths','durationMonths']);
  if(Object.values(input.vesting).some(value=>value.length>2000))throw Error('INVALID_OWNER_DRAFT_SETTINGS');
  draft.walletProfile='STANDARD_V2_SETTLEMENT';
  draft.vesting={enabled:true,...input.vesting};
  draft.allocations.team=draft.vesting.amount;
 }
 if(!validate(draft).valid)throw Error('INVALID_OWNER_DRAFT_SETTINGS');
 return draft;
}
