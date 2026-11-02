import * as core from '@ton/core';
import binding from '../../minter-contract/scripts/migration-v2-plan.js';
import profile from '../../minter-contract/stonfi-v22-development-profile.json' with {type:'json'};
import {code} from './artifacts.mjs';
const encode=x=>({address:x.address.toString({testOnly:true}),raw:x.address.toRawString(),codeHash:x.init.code.hash().toString('hex'),dataHash:x.init.data.hash().toString('hex'),stateInit:core.beginCell().store(core.storeStateInit(x.init)).endCell().toBoc().toString('base64')});
export function prepareMigration({creator,router,pairWallet0,pairWallet1,tokenMaster0,tokenMaster1,operationId,settings}){
 if(!/^(?:[5-9][0-9]|100)$/.test(settings.percent))throw Error('LP percent must be an exact integer from50 to100');
 const duration={permanent:'permanent','180':'days180','365':'days365'}[settings.duration];if(!duration)throw Error('Unsupported LP duration');
 const p=binding.build(core,{creator,router,pairWallet0,pairWallet1,tokenMaster0,tokenMaster1,operationId,percent:Number(settings.percent),duration,beneficiary:settings.beneficiary,unlockedController:settings.percent==='100'?creator:settings.controller,code:code('anlgram-migration-v2-plan'),vaultCode:code('anlgram-lp-locker-v2')});
 return{scope:'VERSIONED_COMPONENT_CONFIGURATION_NOT_MIGRATION_AUTHORIZATION',operationId:String(operationId),binding:encode(p),locker:encode(p.vault),expectedPool:p.vault.pool.toString({testOnly:true}),expectedLpWallet:p.vault.lpWallet.toString({testOnly:true}),terms:p.vault.terms,
  routerCodeReferenceHash:profile.routerCodeReferenceHash,pair:{tokenMaster0:core.Address.parse(tokenMaster0).toRawString(),tokenMaster1:core.Address.parse(tokenMaster1).toRawString(),pairWallet0:core.Address.parse(pairWallet0).toRawString(),pairWallet1:core.Address.parse(pairWallet1).toRawString()},
  custody:{status:'NOT_VERIFIED',received:null,locked:null,unlocked:null,unlockTimestamp:null},
  compatibility:'Separate V2 binding/locker destinations; legacy Curve/migrator handoff is not silently replaced.',
  blockedBy:['QUALIFIED_EXTERNAL_REVIEW','AUTHENTIC_ROUTER_AND_PAIR_DISCOVERY','VERSIONED_CURVE_MIGRATOR_HANDOFF','ACTUAL_DEPOSIT_AND_LP_CUSTODY_RECEIPTS','FOREIGN_LP_WITHDRAWAL_DELIVERY_EVIDENCE'],
  trust:'Router administration can upgrade code and affect pool reserves; deterministic destinations do not prove custody.',migrationAuthorized:false,withdrawalsEnabled:false,financialSigningEnabled:false};
}
