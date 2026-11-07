'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const live = require('./assets/js/curve-vnext-onchain-quote.js');

const raw = '0:'+'a'.repeat(64);
const gross = 510000000000n;
const consumed = 303030303031n;
const refund = gross-consumed;
const fakeCell = hashHex => ({
  Address: {parse(value) {if (value !== raw) throw Error('wrong address');}},
  Cell: {fromBoc() {return [{hash() {return Uint8Array.from(hashHex.match(/../g),h=>parseInt(h,16));}}];}}
});
function reply(status, body) {return {ok:status===200,status,async json(){return body;}};}
function onchainRequest({hash=live.CURVE_CODE_HASH,stack,seen=[]}={}) {
  const cells=fakeCell(hash);
  const getStack=stack || [
    ['num','800000000000000000'],
    ['num','3030303030'],
    ['num',consumed.toString()],
    ['num',refund.toString()],
    ['num','-1']
  ];
  return {core:cells,async request(path) {
    seen.push(path);
    return path.includes('/methods/')
      ? reply(200,{success:true,exit_code:0,stack:getStack})
      : reply(200,{status:'active',code:'b5ee9c72'});
  }};
}
test('Exact 510 TON live quote: verifies bytecode, getter, fee and refund',async()=>{
  const seen=[],fixture=onchainRequest({seen});
  const got=await live.quote({address:raw,network:'mainnet',grossTon:'510',tonCore:fixture.core,request:fixture.request});
  assert.equal(got.tokensAtomic,800000000000000000n);
  assert.equal(got.feeNano,3030303030n);
  assert.equal(got.consumedNano,consumed);
  assert.equal(got.refundNano,206969696969n);
  assert.equal(got.willGraduate,true);
  assert.equal(seen.length,2);
  assert(seen[1].endsWith('/methods/get_buy_quote_v2?args=0x76bd3b8e00'));
});
test('Unreviewed bytecode is rejected before reading any getter',async()=>{
  const seen=[],fixture=onchainRequest({hash:'00'.repeat(32),seen});
  await assert.rejects(live.quote({address:raw,network:'mainnet',grossTon:'510',tonCore:fixture.core,request:fixture.request}),/code hash/);
  assert.equal(seen.length,1);
});
test('Forged getter fee or refund is rejected',async()=>{
  const fixture=onchainRequest({stack:[['num','100'],['num','10'],['num','100'],['num','0'],['num','0']]});
  await assert.rejects(live.quote({address:raw,network:'mainnet',grossTon:'510',tonCore:fixture.core,request:fixture.request}),/inconsistent/);
});
test('Exact nanos, network gate and malformed amounts',()=>{
  assert.equal(live.tonToNano('303.030303031'),303030303031n);
  assert.equal(live.formatUnits(303030303031n),'303.030303031');
  assert.throws(()=>live.tonToNano('1.1234567899'),/Invalid/);
  assert.throws(()=>live.tonToNano('0'),/out of range/);
  assert.throws(()=>live.tonToNano('Infinity'),/Invalid/);
});
test('TVM true encoded as negative hexadecimal is parsed safely',()=>{
  const got=live.parseQuote({success:true,exit_code:0,stack:[['num','0x1'],['num','0x0'],['num','0x1'],['num','0x0'],['num','-0x1']]},1n);
  assert.equal(got.willGraduate,true);
});
