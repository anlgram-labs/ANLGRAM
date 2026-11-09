// Pure parsing of pinned versioned accounts, plus existing proof inclusion.
// No RPC, new ledger, deployment, signing or caller-supplied trust flags.
import * as core from '@ton/core';
import pkg from '../../minter-contract/scripts/migration-package-v2.js';
import dispatch from '../../minter-contract/scripts/migration-package-dispatch-v2.js';
import {verifyAccountInclusion} from '../recovery/account-proof.mjs';
import {rememberMigrationCheckpoint} from './evidence-brand.mjs';
export {isMigrationCheckpoint} from './evidence-brand.mjs';
const need=(x,m)=>{if(!x)throw Error(m);};
const inlineCell={parse:s=>s.asCell(),serialize(){throw Error('Read only');}};
export function migrationAccountFields(configuration,role,boc,generation=1){
 need(['curve','migration'].includes(role),'Unsupported versioned account');
 need(typeof boc==='string'&&boc.length>0&&boc.length<524288,'Bounded Account BOC required');
 need(generation===1||generation===2,'Unsupported generation');
 const c=(generation===2?dispatch:pkg).build(core,configuration),root=core.Cell.fromBase64(boc);need(!root.isExotic,'Ordinary Account required');const s=root.beginParse();need(s.loadBit(),'Account unavailable');const a=core.loadAccount(s);s.endParse();
 need(a.addr.equals(c.addresses[role])&&a.storage.state.type==='active','Exact active versioned account required');const state=a.storage.state.state;
 need(state.code?.equals(c.states[role].code),'Versioned code mismatch');const d=state.data.beginParse(),out={scope:'PINNED_ACCOUNT_FIELDS_ONLY',role,generation,project:c.addresses.minter.toRawString(),operationId:c.operationId.toString(),address:a.addr.toRawString(),accountHash:root.hash().toString('hex'),codeHash:state.code.hash().toString('hex'),walletBalanceNano:a.storage.balance.coins.toString(),independentFinalityVerified:false,migrationAuthorized:false,financialSigningEnabled:false};
 if(role==='curve'){
  out.stage=d.loadUint(8);need(d.loadUint(16)===100,'Protocol fee mismatch');const addr=d.loadRef().beginParse();const genesis=c.states.curve.data.beginParse();genesis.loadUint(8);genesis.loadUint(16);const ga=genesis.loadRef().beginParse();
  for(let i=0;i<3;i++)need(addr.loadAddress().equals(ga.loadAddress()),'Curve authority changed');
  const endpoints=addr.loadRef().beginParse();addr.endParse();need(endpoints.loadAddress().equals(c.addresses.minter)&&endpoints.loadAddress().equals(c.curveWallet)&&endpoints.loadAddress().equals(c.dex),'Curve token pair mismatch');const tail=endpoints.loadRef().beginParse();endpoints.endParse();need(tail.loadAddress().equals(c.addresses.guard)&&tail.loadAddress().equals(c.addresses.migration),'Curve participant substitution');tail.endParse();
  const r=d.loadRef().beginParse();for(const name of ['reserveNano','curveTokenUnits','protocolFeesNano','pendingRefundUnits','virtualTonNano','virtualJettonUnits','thresholdNano','dexTokenUnits'])out[name]=r.loadCoins().toString();r.endParse();
  const genesisReserves=genesis.loadRef().beginParse();
  for(let i=0;i<6;i++)genesisReserves.loadCoins();
  const threshold=genesisReserves.loadCoins();
  need(threshold>0n&&out.thresholdNano===threshold.toString(),'Graduation threshold mismatch');
  const dict=d.loadRef().beginParse();dict.loadDict(core.Dictionary.Keys.BigUint(256),inlineCell);need(dict.loadRef().equals(c.wallet),'Settlement wallet code mismatch');dict.endParse();d.endParse();
  out.progressBps=(BigInt(out.reserveNano)*10000n/threshold).toString();out.localReserveEligible=out.stage===4&&BigInt(out.reserveNano)>=threshold&&out.curveTokenUnits==='0'&&out.dexTokenUnits==='200000000000000000'&&out.pendingRefundUnits==='0';
 }else{
  out.initialized=d.loadBit();need(d.loadAddress().equals(c.addresses.curve)&&d.loadAddress().equals(c.addresses.guard)&&d.loadAddress().equals(c.dex),'Migrator participant substitution');const assets=d.loadRef().beginParse();need(assets.loadAddress().equals(c.addresses.minter)&&assets.loadAddress().equals(c.pton),'Migrator pair mismatch');out.heldTonNano=assets.loadCoins().toString();out.heldJettonUnits=assets.loadCoins().toString();need(assets.loadAddress().equals(c.operator),'Migrator authority changed');assets.endParse();
  const wallets=d.loadRef().beginParse();wallets.loadMaybeAddress();wallets.loadMaybeAddress();out.dexPendingTonNano=wallets.loadCoins().toString();out.dexPendingJettonUnits=wallets.loadCoins().toString();need(wallets.loadRef().equals(c.wallet),'Settlement wallet code mismatch');wallets.endParse();
  const f=d.loadRef().beginParse();out.activeOperationId=f.loadUintBig(64).toString();f.loadUintBig(64);out.phase=f.loadUint(3);f.loadMaybeAddress();f.loadMaybeAddress();const ids=f.loadDict(core.Dictionary.Keys.BigUint(64),inlineCell);out.reconciliation=null;if(f.remainingRefs){const r=f.loadRef().beginParse();out.reconciliation={stage:r.loadUint(8),epochOpened:r.loadBit(),epoch:r.loadUintBig(64).toString(),originalTonNano:r.loadCoins().toString(),originalJettonUnits:r.loadCoins().toString(),returnedTonNano:r.loadCoins().toString(),returnedJettonUnits:r.loadCoins().toString(),cumulativeLpUnits:r.loadCoins().toString()};if(r.remainingBits)r.loadMaybeRef();if(r.remainingBits)r.loadMaybeRef();r.endParse();}f.endParse();d.endParse();
  const record=ids.get(0n)?.beginParse().loadRef().beginParse();need(record?.loadUint(32)===0x4d563242&&record.loadRef().equals(c.intent),'Immutable LP intent changed');const binding=record.loadMaybeRef(),observation=record.loadMaybeRef(),registration=record.remainingBits?record.loadMaybeRef():null;
  out.registrationPresent=!!registration;
  record.endParse();
  if(generation===2){
   out.locker=c.vault.address.toRawString();
   out.pool=c.vault.pool.toRawString();
   out.lpWallet=c.vault.lpWallet.toRawString();
   out.lpObservation=null;
   out.settlementPending=false;
   if(binding){
    const b=binding.beginParse();
    need(b.loadAddress().equals(c.vault.address)&&b.loadAddress().equals(c.vault.pool)&&b.loadAddress().equals(c.vault.lpWallet),'Locker binding mismatch');
    need(b.loadRef().equals(core.beginCell().store(core.storeStateInit(c.vault.init)).endCell()),'Locker genesis mismatch');
    b.endParse();
   }
   if(observation){
    need(binding,'Observation without Locker binding');
    const o=observation.beginParse();
    const [lt,received,locked,free,pending,unlock]=[o.loadUintBig(64),o.loadCoins(),o.loadCoins(),o.loadCoins(),o.loadCoins(),o.loadUintBig(64)];
    if(received>0n){
     need(registration,'Missing consumed registration');
     const r=registration.beginParse();
     need(r.loadUint(32)===0x4e585250,'Registration format mismatch');
     r.skip(352);
     need(r.loadUint(2)===1,'Registration not consumed');
     const permit=r.loadRef().beginParse();
     permit.skip(272);permit.loadCoins();permit.loadCoins();
     need(received>=permit.loadCoins(),'Minimum LP not met');
     need(lt>0n&&pending===0n&&locked===(received*BigInt(c.terms.percent)+99n)/100n&&locked+free===received,'Invalid Locker allocation');
     need(c.terms.duration===0?unlock===0xffffffffffffffffn:unlock>0n,'Invalid unlock timestamp');
     out.lpObservation=Object.freeze({lt:String(lt),receivedUnits:String(received),lockedUnits:String(locked),freeUnits:String(free),unlockTimestamp:String(unlock)});
    }
   }
  }
  const stored=ids.get(c.operationId+(1n<<63n));out.lifecycle=null;
  if(stored){const life=stored.beginParse();need(life.loadUint(32)===0x4d494733,'Lifecycle tag mismatch');const fields=life.loadDict(core.Dictionary.Keys.Uint(8),core.Dictionary.Values.BigUint(256));life.loadMaybeRef();life.endParse();
   const names=['originalTonNano','originalJettonUnits','fundedTonNano','fundedJettonUnits','curveEpoch','fundingEpoch','dexEpoch','returnTransitTonNano','returnTransitJettonUnits','curveBookedTonNano','curveBookedJettonUnits','dexDispatched','fundingBouncedTonNano','fundingBouncedJettonUnits'];out.lifecycle=Object.fromEntries(names.map((n,i)=>[n,(fields.get(i)??0n).toString()]));
   if(generation===2)out.settlementPending=fields.get(17)===1n;
   const l=out.lifecycle;need(BigInt(l.fundedTonNano)+BigInt(l.fundingBouncedTonNano)<=BigInt(l.originalTonNano)&&BigInt(l.fundedJettonUnits)+BigInt(l.fundingBouncedJettonUnits)<=BigInt(l.originalJettonUnits),'Funding exceeds obligation');need(BigInt(l.curveBookedTonNano)<=BigInt(l.originalTonNano)&&BigInt(l.curveBookedJettonUnits)<=BigInt(l.originalJettonUnits),'Returns exceed obligation');
  }
 }
 return out;
}
export function verifyMigrationAccountCheckpoint(configuration,role,raw,reference,generation=1){
 need(['curve','migration'].includes(role),'Unsupported versioned account');
 need(generation===1||generation===2,'Unsupported generation');
 const c=(generation===2?dispatch:pkg).build(core,configuration),proof=verifyAccountInclusion(raw,reference,c.addresses[role]?.toRawString()),roots=core.Cell.fromBoc(Buffer.from(raw.state,'hex'));need(roots.length===1,'One Account required');
 const fields=migrationAccountFields(configuration,role,roots[0].toBoc().toString('base64'),generation);need(fields.accountHash===proof.accountHash,'Account inclusion mismatch');if(fields.lifecycle)Object.freeze(fields.lifecycle);if(fields.reconciliation)Object.freeze(fields.reconciliation);const verified=Object.freeze({...fields,proof:Object.freeze(proof),scope:'ACCOUNT_INCLUSION_RELATIVE_TO_REFERENCE_NOT_VALIDATOR_FINALITY'});return rememberMigrationCheckpoint(verified);
}
