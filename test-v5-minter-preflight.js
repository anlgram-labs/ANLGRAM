'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {analyze,external}=require('./scripts/preflight-v5-minter'),{wallets}=require('./scripts/prepare-testnet-v5');
const fixture=require('./tests/settlement-runtime/fixtures/v5-minter-emulation-summary.json'),p=require('./docs/launchpad/testnet-v5-candidate.json');
const fresh=()=>structuredClone(fixture);
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
