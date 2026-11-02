'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyze,external}=require('./scripts/preflight-v5-minter'),{wallets}=require('./scripts/prepare-testnet-v5');
const fixture=require('./tests/settlement-runtime/fixtures/v5-minter-emulation-summary.json'),p=require('./docs/launchpad/testnet-v5-candidate.json');
const fresh=()=>structuredClone(fixture);
test('hash-only refresh refuses changed source or artifact identity without recompilation',()=>{
 const {verifyUnchangedSources}=require('./scripts/preflight-v5-minter');assert.equal(Object.keys(verifyUnchangedSources(p).contracts).length,7);
 const changed=structuredClone(p),entry=Object.values(changed.sourceVerification.contracts)[0];entry.sourceFilesSha256[Object.keys(entry.sourceFilesSha256)[0]]='0'.repeat(64);assert.throws(()=>verifyUnchangedSources(changed));
 const wrong=structuredClone(p);Object.values(wrong.sourceVerification.contracts)[0].codeHash='0'.repeat(64);assert.throws(()=>verifyUnchangedSources(wrong));
});
test('actual provider emulation reconciles complete sender/recipient fees without double counting destination gas',()=>{
 const r=analyze(fresh(),p);assert.equal(r.modeledSenderDebitNano,'106876937');assert.equal(r.modeledSenderFeesNano,'6876937');assert.equal(r.minterFeesFromAttachmentNano,'33134');assert.equal(r.minterBalanceAfterNano,'99966866');assert.equal(r.fitsReviewCeiling,true);assert.equal(r.hardCapEnforced,false);assert.equal(r.operatorWalletAlsoActivates,true);
});
test('incomplete or aborted emulation cannot pass',()=>{
 const a=fresh();a.is_incomplete=true;assert.throws(()=>analyze(a,p));const b=fresh();Object.values(b.transactions)[0].description.aborted=true;assert.throws(()=>analyze(b,p));
});
test('extra deployment or substituted destination cannot pass',()=>{
 const a=fresh();a.transactions.extra=structuredClone(Object.values(a.transactions)[0]);assert.throws(()=>analyze(a,p));const b=fresh();Object.values(b.transactions)[0].out_msgs[0].destination='0:'+ '1'.repeat(64);assert.throws(()=>analyze(b,p));
});
test('fee drift without matching sender/recipient balances fails conservation',()=>{
 for(const kind of ['total_fees','value']){const a=fresh(),t=Object.values(a.transactions)[0];if(kind==='total_fees')t.total_fees=String(BigInt(t.total_fees)+1n);else t.out_msgs[0].value='100000001';assert.throws(()=>analyze(a,p));}
});
test('wrong deployed source/data hashes and duplicate messages fail',()=>{
 const a=fresh();Object.values(a.transactions)[1].account_state_after.data_hash=Buffer.alloc(32).toString('base64');assert.throws(()=>analyze(a,p));const b=fresh(),s=Object.values(b.transactions)[0];s.out_msgs.push(structuredClone(s.out_msgs[0]));assert.throws(()=>analyze(b,p));
});
test('negative Mainnet wallet-ID probe has no mismatched StateInit or real signature',async()=>{
 const core=require('./minter-contract/node_modules/@ton/core'),w=wallets();
 const e=await external(w.testnet,p.smokePlan.steps[0].message,26,1900000000,w.mainnet.address,null);
 const message=core.loadMessage(core.Cell.fromBase64(e.boc).beginParse());assert.equal(message.init,null);assert(message.info.dest.equals(w.mainnet.address));
 const s=message.body.beginParse();assert.equal(s.loadUint(32),0x7369676e);assert.equal(s.loadInt(32),2147483645);
 assert(message.body.bits.substring(message.body.bits.length-512,512).toString().match(/^0+$/));
});


test('V5 emulation envelopes for existing-contract calls omit both StateInit fields and preserve exact nonce/message',async()=>{
 const core=require('./minter-contract/node_modules/@ton/core'),{loadOutListExtendedV5R1}=require('./minter-contract/node_modules/@ton/ton/dist/wallets/v5r1/WalletV5R1Actions');
 const w=wallets().testnet,message={address:p.dependentAccounts.curve.testnet,amount:'20000000',payload:core.beginCell().storeUint(0x414e5305,32).storeUint(123,64).endCell().toBoc().toString('base64')};
 const e=await external(w,message,9,1900000000,w.address,null),outer=core.loadMessage(core.Cell.fromBase64(e.boc).beginParse());assert.equal(outer.init,null);const s=outer.body.beginParse();assert.equal(s.loadUint(32),0x7369676e);assert.equal(s.loadInt(32),2147483645);assert.equal(s.loadUint(32),1900000000);assert.equal(s.loadUint(32),9);const a=loadOutListExtendedV5R1(s);assert.equal(a.length,1);assert.equal(a[0].outMsg.init,null);assert.equal(a[0].outMsg.info.value.coins,20000000n);assert.equal(a[0].outMsg.body.hash().toString('hex'),core.Cell.fromBase64(message.payload).hash().toString('hex'));
});
