'use strict';
// Genuine captured external bytecode in local Sandbox, NOT on-chain execution.
// Provider is a local treasury actor; Curve authorization is NOT bypassed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {setup,snap}=require('./stonfi-snapshot-support'),lp=require('../../minter-contract/scripts/lp-locker-v2'),wire=require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const {beginCell,contractAddress,Address}=core;let compiled;
const {fixture}=require('./stonfi-locker-v2-support');
async function publicRows(...rows){
 const publicCore=await import('../../testnet-interface/node_modules/@ton/core/dist/index.js');
 return rows.map(({raw})=>{const cell=publicCore.Cell.fromBase64(raw);return{cell,tx:publicCore.loadTransaction(cell.beginParse())};});
}
test('actual captured STON.fi Pool mints LP with V2 tag into source-compiled partial timed Locker V2',async()=>{
 const f=await fixture();let all=[];for(const m of f.deposit.messages){const r=await f.owner.send({...m,bounce:true});all.push(...r.transactions);}
 const held=(await f.chain.runGetMethod(f.vault.lpWallet,'get_wallet_data')).stackReader;const amount=held.readBigNumber();assert(amount>0n);assert(held.readAddress().equals(f.vault.address));assert(held.readAddress().equals(f.vault.pool));
 const notifications=all.filter(t=>t.inMessage?.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x7362d09c);assert.equal(notifications.length,1);assert.equal(notifications[0].description.computePhase.exitCode,0);
 const r=await f.read();assert.equal(r.readBigNumber(),75n);assert.equal(r.readBigNumber(),15552000n);assert(r.readBigNumber()>BigInt(f.chain.now));assert.equal(r.readBigNumber(),amount);assert.equal(r.readBigNumber(),(amount*75n+99n)/100n);assert.equal(r.readBigNumber(),amount-(amount*75n+99n)/100n);assert.equal(r.readBigNumber(),0n);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),800000000000000000n);assert.equal(f.deposit.migrationAuthorized,false);
 // Replay the exact actual LP-wallet emitted notification, not forged JSON.
 await f.chain.sendMessage(notifications[0].inMessage);const again=await f.read();again.readBigNumber();again.readBigNumber();again.readBigNumber();assert.equal(again.readBigNumber(),amount);
});
module.exports={fixture};

test('VNext refund opcode differential: captured v2.2 rejects2fcb26a2 and refunds with132b9a2c plus both Maybe payload fields',async()=>{
 const f=await fixture();await f.owner.send({...f.deposit.messages[0],bounce:true});const account=(await f.chain.runGetMethod(f.vault.pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress();
 const balance=async()=>(await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),prior=await balance();assert.equal(prior,800000000000000000n);
 const wrong=await f.owner.send({to:account,value:900000000n,body:beginCell().storeUint(0x2fcb26a2,32).storeUint(77,64).storeUint(0,2).endCell()});assert(wrong.transactions.some(t=>t.inMessage?.info.dest?.equals(account)&&t.description.computePhase?.exitCode!==0));assert.equal(await balance(),prior);
 await f.owner.send({...wire.refund(core,{operationId:77n,lpAccount:account.toRawString()}),bounce:true});assert.equal(await balance(),1000000000000000000n);
});
test('VNext receipt accepts a proven canonical empty frozen wallet unfreezing, but never assumes other frozen balances are zero',async()=>{
 const api=await import('../../testnet-interface/projects/lp-evidence.mjs'),f=await fixture();for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});let s=await f.read();s.readBigNumber();s.readBigNumber();f.chain.now=Number(s.readBigNumber());s.readBigNumber();const amount=s.readBigNumber(),destination=(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress(),init={code:f.vault.lpInit.code,data:beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(f.vault.pool).storeRef(f.vault.lpInit.code).endCell()};
 await f.owner.send({to:destination,init,value:100000000n,body:beginCell().endCell()});await require('./refund-receipts-support').freeze(f,destination);
 const rows=await recorded(f,{to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(amount).endCell()},[destination]),locker=rows.find(r=>r.tx.inMessage.info.dest.equals(f.vault.address)),wallet=rows.find(r=>r.tx.inMessage.info.dest.equals(f.vault.lpWallet)),recipient=rows.find(r=>r.tx.inMessage.info.dest.equals(destination)),policy=api.lpEvidencePolicy(beginCell().store(core.storeStateInit(f.vault.init)).endCell().toBoc().toString('base64'));
 const raw={lockerTransaction:locker.raw,walletTransaction:wallet.raw,recipientTransaction:recipient.raw,locker:{before:locker.before,after:locker.after},wallet:{before:wallet.before,after:wallet.after},recipient:{before:recipient.before,after:recipient.after}},result=api.verifyLpWithdrawalFields(policy,raw);assert.equal(result.amountUnits,amount.toString());assert.equal(result.validatorFinalityVerified,false);assert.equal(result.contractPendingMustRemain,true);
 const before=core.Cell.fromBase64(recipient.before).beginParse();assert(before.loadBit());const account=core.loadAccount(before);assert.equal(account.storage.state.type,'frozen');account.storage.state.stateHash^=1n;const mutated=beginCell().storeBit(true).store(core.storeAccount(account)).endCell().toBoc().toString('base64');assert.throws(()=>api.verifyLpWithdrawalFields(policy,{...raw,recipient:{before:mutated,after:recipient.after}}));
});

// Capture exact before/after Account cells at each actual Sandbox routing step.
// These are local execution evidence, never a substituted live block proof.
async function recorded(f,message,extra=[]){
 const addresses=[f.vault.pool,f.vault.address,f.vault.lpWallet,...extra],snapshot=async a=>{const x=(await f.chain.getContract(a)).account.account;return beginCell().storeBit(!!x).store(x?core.storeAccount(x):()=>{}).endCell().toBoc().toString('base64');};
 const m=core.internal({to:message.to,value:message.value,body:message.body,bounce:true}),iter=await f.chain.sendMessageIter({...m,info:{...m.info,src:f.owner.address}}),rows=[];
 while(true){const before=new Map(await Promise.all(addresses.map(async a=>[a.toRawString(),await snapshot(a)]))),next=await iter.next();if(next.done)break;const t=next.value,a=t.inMessage?.info.dest;
  if(a&&addresses.some(x=>x.equals(a)))rows.push({tx:t,raw:beginCell().store(core.storeTransaction(t)).endCell().toBoc().toString('base64'),before:before.get(a.toRawString()),after:await snapshot(a)});
 }return rows;
}
test('missing first LP notification retains exact Pool-to-wallet issuance fields but cannot fabricate provenance, attribution or locker credit',async()=>{
 const api=await import('../../testnet-interface/projects/lp-evidence.mjs'),f=await fixture(100,'permanent'),{freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,f.vault.address),policy=api.lpEvidencePolicy(beginCell().store(core.storeStateInit(f.vault.init)).endCell().toBoc().toString('base64'));let rows=[];
 assert.throws(()=>api.lpEvidencePolicy(beginCell().store(core.storeStateInit({...f.vault.init,special:{tick:true,tock:false}})).endCell().toBoc().toString('base64')),/Canonical/);
 for(const m of f.deposit.messages)rows.push(...await recorded(f,m));await restore(f,f.vault.address,old);
 const wallet=rows.find(r=>r.tx.inMessage?.info.dest?.equals(f.vault.lpWallet)&&r.tx.inMessage.body.beginParse().loadUint(32)===0x178d4519),pool=rows.find(r=>r.tx.inMessage?.info.dest?.equals(f.vault.pool)&&Array.from(r.tx.outMessages.values()).some(m=>m.info.dest?.equals(f.vault.lpWallet)));
 const raw={poolTransaction:pool.raw,walletTransaction:wallet.raw,pool:{before:pool.before,after:pool.after},wallet:{before:wallet.before,after:wallet.after}},r=api.verifyLpIssuanceFields(policy,raw);assert(BigInt(r.amountUnits)>0n);assert.equal(r.providerInclusionVerified,false);assert.equal(r.migrationAttributionVerified,false);assert.equal(r.contractReceiptAccepted,false);assert.equal(api.isIncludedLpEvidence(r),false);
 assert.throws(()=>api.verifyProvenLpEvidence(policy,'issuance',raw,{}),/checkpoint/);
 for(const change of [v=>v.wallet.before=v.wallet.after,v=>v.poolTransaction=v.walletTransaction,v=>v.walletTransaction=v.poolTransaction]){const v=structuredClone(raw);change(v);assert.throws(()=>api.verifyLpIssuanceFields(policy,v));}
 const status=await import('../../testnet-interface/projects/migration-status.mjs');assert.throws(()=>status.migrationEvidenceStatus(f.vault.terms,[{...r,providerInclusionVerified:true}]),/Included/);const view=await f.read();for(let i=0;i<3;i++)view.readBigNumber();assert.equal(view.readBigNumber(),0n);
});

test('actual external LP withdrawal fields verify exact authorized final recipient delta; lost receipt stays pending and frozen recipient fails closed',async()=>{
 const api=await import('../../testnet-interface/projects/lp-evidence.mjs'),f=await fixture(75,'days180');for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});const state=await f.read();state.readBigNumber();state.readBigNumber();const unlock=state.readBigNumber();state.readBigNumber();const amount=state.readBigNumber();f.chain.now=Number(unlock);
 const destination=(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress(),policy=api.lpEvidencePolicy(beginCell().store(core.storeStateInit(f.vault.init)).endCell().toBoc().toString('base64'));
 const rows=await recorded(f,{to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(amount).endCell()},[destination]),locker=rows.find(r=>r.tx.inMessage.info.dest.equals(f.vault.address)),wallet=rows.find(r=>r.tx.inMessage.info.dest.equals(f.vault.lpWallet)),recipient=rows.find(r=>r.tx.inMessage.info.dest.equals(destination));
 const raw={lockerTransaction:locker.raw,walletTransaction:wallet.raw,recipientTransaction:recipient.raw,locker:{before:locker.before,after:locker.after},wallet:{before:wallet.before,after:wallet.after},recipient:{before:recipient.before,after:recipient.after}},r=api.verifyLpWithdrawalFields(policy,raw);assert.equal(r.amountUnits,amount.toString());assert.equal(r.recipient,f.owner.address.toRawString());assert.equal(r.contractPendingMustRemain,true);assert.equal(r.operationCompleted,false);
 const {selectLpWithdrawalDelivery}=await import('../../testnet-interface/projects/project-lp-acquisition.mjs');
 const [claimRow,walletRow,recipientRow]=await publicRows(locker,wallet,recipient);
 assert.equal(selectLpWithdrawalDelivery(policy,[claimRow,claimRow],[walletRow]).recipient.toRawString(),destination.toRawString());
 assert.equal(selectLpWithdrawalDelivery(policy,[claimRow],[recipientRow]),null);
 assert.equal(selectLpWithdrawalDelivery({...policy,beneficiary:policy.locker},[claimRow],[walletRow]),null);
 assert.throws(()=>api.verifyLpWithdrawalFields(policy,{...raw,recipientTransaction:wallet.raw}));assert.throws(()=>api.verifyProvenLpEvidence(policy,'withdrawal',raw,{}),/checkpoint/);
 const pending=await f.read();for(let i=0;i<6;i++)pending.readBigNumber();assert.equal(pending.readBigNumber(),amount);
 // A new fixture freezes the authentic receiving wallet before claim routing.
 const g=await fixture(75,'days180');for(const m of g.deposit.messages)await g.owner.send({...m,bounce:true});const gs=await g.read();gs.readBigNumber();gs.readBigNumber();g.chain.now=Number(gs.readBigNumber());gs.readBigNumber();const ga=gs.readBigNumber(),{freeze}=require('./refund-receipts-support');const recipientInit={code:g.vault.lpInit.code,data:beginCell().storeCoins(0).storeAddress(g.owner.address).storeAddress(g.vault.pool).storeRef(g.vault.lpInit.code).endCell()};await g.owner.send({to:destination,init:recipientInit,value:100000000n,body:beginCell().endCell()});await g.owner.send({to:g.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(1).endCell()});await freeze(g,destination);
 const failed=await recorded(g,{to:g.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(2,64).storeBit(true).storeCoins(ga-1n).endCell()},[destination]);const bad=failed.find(x=>x.tx.inMessage.info.dest.equals(destination));assert(bad);assert.throws(()=>api.verifyLpWithdrawalFields(policy,{...raw,recipientTransaction:bad.raw,recipient:{before:bad.before,after:bad.after}}));
});
test('single token deposit stays in authentic LPAccount, then official refund_me restores exact Jettons without claiming LP or migration completion',async()=>{
 const f=await fixture();await f.owner.send({...f.deposit.messages[0],bounce:true});const account=(await f.chain.runGetMethod(f.vault.pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress();
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),800000000000000000n);
 const refund=await f.owner.send({...wire.refund(core,{operationId:77n,lpAccount:account.toRawString()}),bounce:true});assert(refund.transactions.length>2);
 assert.equal((await f.chain.runGetMethod(f.wallet(f.owner.address),'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);const r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n);
});
test('authentic immediate LP-wallet bounce restores only its exact persistent claim; receipt adapter rejects downstream substitution and replay',async()=>{
 const api=await import('../../testnet-interface/projects/lp-evidence.mjs'),f=await fixture(75,'days180');for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});let s=await f.read();s.readBigNumber();s.readBigNumber();f.chain.now=Number(s.readBigNumber());s.readBigNumber();const amount=s.readBigNumber(),{freeze}=require('./refund-receipts-support');await freeze(f,f.vault.lpWallet);
 const rows=await recorded(f,{to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(amount).endCell()}),failed=rows.find(r=>r.tx.inMessage?.info.dest?.equals(f.vault.lpWallet)),restored=rows.find(r=>r.tx.inMessage?.info.dest?.equals(f.vault.address)&&r.tx.inMessage.info.bounced),policy=api.lpEvidencePolicy(beginCell().store(core.storeStateInit(f.vault.init)).endCell().toBoc().toString('base64'));
 assert(failed&&restored);const raw={walletTransaction:failed.raw,lockerTransaction:restored.raw,locker:{before:restored.before,after:restored.after}},r=api.verifyLpWithdrawalBounceFields(policy,raw);assert.equal(r.amountUnits,amount.toString());assert.equal(r.contractPrincipalRestoredFields,true);assert.equal(r.newAttemptAuthorized,false);assert.equal(r.deliveryVerified,false);assert.equal(r.operationCompleted,false);
 const {selectLpWithdrawalBounce}=await import('../../testnet-interface/projects/project-lp-acquisition.mjs');
 const [walletRow,lockerRow]=await publicRows(failed,restored);
 assert.equal(selectLpWithdrawalBounce(policy,[lockerRow,lockerRow],[walletRow]).recovery,lockerRow);
 assert.equal(selectLpWithdrawalBounce({...policy,locker:policy.beneficiary},[lockerRow],[walletRow]),null);
 assert.equal(selectLpWithdrawalBounce(policy,[],[walletRow]),null);
 assert.throws(()=>api.verifyProvenLpEvidence(policy,'withdrawalBounce',raw,{}),/checkpoint/);assert.throws(()=>api.verifyLpWithdrawalBounceFields(policy,{...raw,locker:{before:restored.after,after:restored.after}}));
 await f.chain.sendMessage(restored.tx.inMessage);s=await f.read();for(let i=0;i<4;i++)s.readBigNumber();assert.equal(s.readBigNumber(),amount,'duplicate bounce cannot restore principal twice');s.readBigNumber();assert.equal(s.readBigNumber(),0n);
});
test('feasibility: authentic recipient excess with the same query can come from unrelated tiny LP delivery, not the pending withdrawal',async()=>{
 const f=await fixture(75,'days180');for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});let s=await f.read();s.readBigNumber();s.readBigNumber();const unlock=s.readBigNumber();s.readBigNumber();const locked=s.readBigNumber(),free=s.readBigNumber();assert(locked>1n&&free>1n);
 // Genuine unlocked delivery gives the independent controller real local LP.
 await f.other.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(false).storeCoins(free).endCell()});
 const walletFor=async owner=>(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(owner).endCell()}])).stackReader.readAddress(),recipient=await walletFor(f.owner.address),attacker=await walletFor(f.other.address),init={code:f.vault.lpInit.code,data:beginCell().storeCoins(0).storeAddress(f.owner.address).storeAddress(f.vault.pool).storeRef(f.vault.lpInit.code).endCell()};
 await f.owner.send({to:recipient,init,value:100000000n,body:beginCell().endCell()});f.chain.now=Number(unlock);const {freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,recipient);
 await f.owner.send({to:f.vault.address,value:150000000n,body:beginCell().storeUint(0x414c5633,32).storeUint(2,64).storeBit(true).storeCoins(locked).endCell()});await restore(f,recipient,old);
 assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),0n);
 const unrelated=await f.other.send({to:attacker,value:150000000n,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(2,64).storeCoins(1).storeAddress(f.owner.address).storeAddress(f.vault.address).storeBit(false).storeCoins(0).storeBit(false).endCell()});
 const excess=unrelated.transactions.find(t=>t.inMessage?.info.src?.equals(recipient)&&t.inMessage.info.dest?.equals(f.vault.address)&&t.inMessage.body.bits.length>=96&&t.inMessage.body.beginParse().loadUint(32)===0xd53276db);assert(excess,'real recipient wallet emits a same-query excess');const b=excess.inMessage.body.beginParse();b.loadUint(32);assert.equal(b.loadUintBig(64),2n);b.endParse();assert.equal(excess.description.computePhase.exitCode,401,'current locker does not accept this as receipt');
 assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),1n,'actual delivery is one unit, not the pending principal');const pending=(await f.chain.runGetMethod(f.vault.address,'get_claim_v2',[{type:'int',value:2n}])).stackReader;assert.equal(pending.readBigNumber(),locked);assert.equal(pending.readBigNumber(),1n);
});
for(const [percent,duration]of [[100,'permanent'],[50,'days180'],[75,'days365']])test(`actual DEX LP preserves ${percent}% / ${duration} and authentic unlock/beneficiary restrictions`,async()=>{
 const f=await fixture(percent,duration);for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});const r=await f.read();assert.equal(r.readBigNumber(),BigInt(percent));r.readBigNumber();const unlock=r.readBigNumber(),received=r.readBigNumber(),locked=r.readBigNumber(),free=r.readBigNumber();assert.equal(locked,(received*BigInt(percent)+99n)/100n);assert.equal(locked+free,received);
 const claim=actor=>actor.send({to:f.vault.address,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5633,32).storeUint(1,64).storeBit(true).storeCoins(locked).endCell()});
 assert((await claim(f.other)).transactions.some(t=>t.description.computePhase?.exitCode===401));
 assert((await claim(f.owner)).transactions.some(t=>t.description.computePhase?.exitCode===403));
 if(duration==='permanent'){assert.equal(unlock,0xffffffffffffffffn);return;}
 f.chain.now=Number(unlock);await claim(f.owner);const recipient=(await f.chain.runGetMethod(f.vault.pool,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(f.owner.address).endCell()}])).stackReader.readAddress();assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),locked);
 const duplicate=await claim(f.owner);assert(duplicate.transactions.some(t=>t.description.computePhase?.exitCode===409));assert.equal((await f.chain.runGetMethod(recipient,'get_wallet_data')).stackReader.readBigNumber(),locked,'no second delivery');
 const pending=await f.read();for(let i=0;i<6;i++)pending.readBigNumber();assert.equal(pending.readBigNumber(),locked,'actual delivery is not a foreign authenticated final receipt');
});
test('first LP notification lost during actual DEX mint: bounded recovery proves only custody floor, never issuance or a withdrawal credit',async()=>{
 const f=await fixture(100,'permanent'),{freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,f.vault.address);for(const m of f.deposit.messages)await f.owner.send({...m,bounce:true});await restore(f,f.vault.address,old);
 const actual=(await f.chain.runGetMethod(f.vault.lpWallet,'get_wallet_data')).stackReader.readBigNumber();assert(actual>0n);let r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n);
 const query=beginCell().storeUint(0x414c5636,32).storeUint(77,64).storeCoins(actual).endCell();await f.owner.send({to:f.vault.address,value:150000000n,bounce:true,body:query});const floor=(await f.chain.runGetMethod(f.vault.address,'get_lp_recovery_v4')).stackReader;assert.equal(floor.readBigNumber(),2n);floor.readBigNumber();assert.equal(floor.readBigNumber(),actual);floor.readBigNumber();floor.readBigNumber();assert.equal(floor.readBigNumber(),0n,'not exact balance proof');r=await f.read();for(let i=0;i<3;i++)r.readBigNumber();assert.equal(r.readBigNumber(),0n,'a floor is not a reconstructed initial mint receipt');
});
