'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./minter-contract/node_modules/@ton/core');
const lp=require('./minter-contract/scripts/lp-locker-v2'),migration=require('./minter-contract/scripts/migration-v2-plan');
const {sellTemplate}=require('./scripts/prepare-supervised-smoke');
const p=require('./docs/launchpad/testnet-v5-candidate.json');
const options={creator:p.wallet.raw,router:p.pairDiscovery.router,pairWallet0:p.pairDiscovery.pairWallets[0],pairWallet1:p.pairDiscovery.pairWallets[1],contributor:p.wallet.raw,operationId:'77'};
test('LP/binding immutable operation ID rejects rounded Number, boolean, null and non-decimal forms before address derivation',()=>{
 assert.equal(BigInt(9007199254740993),9007199254740992n,'demonstrated pre-conversion precision loss');
 for(const id of [9007199254740993,Number.MAX_VALUE,1.5,null,true,'',' ','0x4d','1e18','-1','18446744073709551616'])for(const api of[lp,migration])assert.throws(()=>api.build(core,{...options,operationId:id}),/exact uint64/);
});
test('exact uint64 strings and BigInt produce identical immutable addresses; adjacent large IDs stay distinct',()=>{
 for(const id of ['77','9007199254740993','18446744073709551615']){
  const a=lp.build(core,{...options,operationId:id}),b=lp.build(core,{...options,operationId:BigInt(id)});assert.equal(a.address.toRawString(),b.address.toRawString());assert.equal(a.terms.operationId,id);
 }
 assert.notEqual(lp.build(core,{...options,operationId:'9007199254740993'}).address.toRawString(),lp.build(core,{...options,operationId:'9007199254740992'}).address.toRawString());
 const original=migration.build(core,{...options,tokenMaster0:p.dependentAccounts.minter.raw,tokenMaster1:p.componentPlan.pairSource.pton});assert.equal(original.address.toRawString(),p.dependentAccounts.binding.raw);assert.equal(original.vault.address.toRawString(),p.dependentAccounts.locker.raw);
});
test('sell review rejects rounded financial units/query IDs instead of silently serializing different tokens',()=>{
 const o={wallet:p.buyerJettonWallet,curve:p.dependentAccounts.curve.raw,owner:p.wallet.raw,amount:'9007199254740993',minimumTon:'1',queryId:'18446744073709551615'};
 const s=core.Cell.fromBase64(sellTemplate(o).message.payload).beginParse();s.loadUint(32);assert.equal(s.loadUintBig(64),0xffffffffffffffffn);assert.equal(s.loadCoins(),9007199254740993n);
 for(const bad of[{amount:9007199254740993},{minimumTon:9007199254740993},{queryId:9007199254740993},{amount:true},{minimumTon:'0x10'}])assert.throws(()=>sellTemplate({...o,...bad}),/Invalid fresh sell terms/);
});
test('LP disclosure never turns missing evidence into zero custody or confirmed absence of withdrawals',()=>{
 const terms=lp.build(core,options).terms,missing=lp.disclosure(terms);assert.equal(missing.recordedLocked,null);assert.equal(missing.recordedUnlocked,null);assert.equal(missing.pendingWithdrawal,null);assert.equal(missing.withdrawalStatus,'UNVERIFIED');assert.equal(missing.custodyStatus,'PENDING_UNVERIFIED');
 const partial=lp.disclosure(terms,{locked:'123'});assert.equal(partial.recordedLocked,'123');assert.equal(partial.pendingWithdrawal,null);assert.equal(partial.withdrawalStatus,'UNVERIFIED');
 const pending=lp.disclosure(terms,{locked:'9007199254740993',unlocked:0n,pending:1n,unlockTimestamp:'18446744073709551615'});assert.equal(pending.recordedLocked,'9007199254740993');assert.equal(pending.withdrawalStatus,'PENDING_WALLET_OUTCOME');assert.equal(pending.unlockTimestamp,'18446744073709551615');assert.equal(pending.migrationEnabled,false);assert.equal(pending.externalCustodyVerifierSupported,false);
 assert.throws(()=>lp.disclosure(terms,{pending:9007199254740993}),/Invalid exact/);assert.throws(()=>lp.disclosure(terms,{locked:'-1'}),/Invalid exact/);
});
