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
  assert(seen[1].endsWith('/methods/get_buy_quote_v2?args=0x76be5e6c00'));
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
test('Reject 100 percent fee even if gross accounting balances',()=>{
  assert.throws(()=>live.parseQuote({
    success:true,exit_code:0,
    stack:[['num','100'],['num','1000000000'],['num','1000000000'],['num','0'],['num','0']]
  },1000000000n),/inconsistent/);
});
test('Reject wrong 1 percent rounding, including capped buys',()=>{
  assert.throws(()=>live.parseQuote({
    success:true,exit_code:0,
    stack:[['num','100'],['num','3030303031'],['num','303030303031'],['num','206969696969'],['num','-1']]
  },510000000000n),/inconsistent/);
});
test('Accept floor rounded fee on consumed gross, not original input',()=>{
  const result=live.parseQuote({
    success:true,exit_code:0,
    stack:[['num','100'],['num','3030303030'],['num','303030303031'],['num','206969696969'],['num','-1']]
  },510000000000n);
  assert.equal(result.consumedNano-result.feeNano,300000000001n);
});
test('Reject zero principal and zero gross',()=>{
  assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack:[
    ['num','1'],['num','0'],['num','1'],['num','0'],['num','0']
  ]},0n),/Invalid gross/);
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

test('Reject lossy JSON numbers rather than inventing large on-chain balances',()=>{
  const balance=9007199254740993n;
  const stack=[['num',Number(balance)],['num','100'],['num','10000'],['num','0'],['num','0']];
  assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack},10000n),/exact string/);
});

test('Reject nonnumeric TVM stack types even when their payload resembles a number',()=>{
  const stack=[['cell','123'],['num','100'],['num','10000'],['num','0'],['num','0']];
  assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack},10000n),/stack type/);
});

test('Reject malformed tuples and floats while accepting exact provider numeric objects',()=>{
  const valid=[{type:'num',value:'100'},{type:'num',value:'100'},{type:'num',value:'10000'},{type:'num',value:'0'},{type:'num',value:'0'}];
  const quote=live.parseQuote({success:true,exit_code:0,stack:valid},10000n);
  assert.equal(quote.tokensAtomic,100n);
  assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack:[['num','100','unexpected'],...valid.slice(1)]},10000n),/Malformed TVM stack/);
  assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack:[['num','1.5'],...valid.slice(1)]},10000n),/Invalid TVM numeric/);
});

test('Reject ambiguous stack objects and unsuccessful or mistyped TonAPI results',()=>{
  const stack=[['num','100'],['num','100'],['num','10000'],['num','0'],['num','0']];
  for(const entry of [{num:'100'},{type:'num',num:'100',value:'101'}]){
    assert.throws(()=>live.parseQuote({success:true,exit_code:0,stack:[entry,...stack.slice(1)]},10000n),/stack/i);
  }
  for(const flags of [{success:false,exit_code:0},{exit_code:0},{success:true,exit_code:'0'},
    {success:true,exit_code:false},{success:true,exit_code:null},{success:true,exit_code:405}]){
    assert.throws(()=>live.parseQuote({...flags,stack},10000n),/did not complete/);
  }
});

test('Public quote hash pins the exact source-verified Dispatch Curve artifact',()=>{
  const artifact=require('./minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json');
  assert.equal(live.CURVE_CODE_HASH,artifact.codeCellHash);
  assert.equal(artifact.financialDeploymentAuthorized,false);
});

test('Mainnet inspection bypasses cached proxy metadata and requests an uncached getter',async()=>{
  const fixture=onchainRequest();
  const fetch=global.fetch,proxy=global.anlgramFetchTonApi;
  const calls=[];
  global.fetch=async(url,options)=>{
    calls.push(['direct',options.cache]);
    assert.match(url,/^https:\/\/tonapi\.io\/v2\/blockchain\/accounts\//);
    assert.doesNotMatch(url,/\/methods\//);
    return fixture.request(url);
  };
  global.anlgramFetchTonApi=async(path,options)=>{
    calls.push(['proxy',options.cache]);
    assert.match(path,/\/methods\/get_buy_quote_v2\?/);
    return fixture.request(path);
  };
  try {
    const result=await live.quote({address:raw,network:'mainnet',grossTon:'510',tonCore:fixture.core});
    assert.equal(result.consumedNano,consumed);
    assert.deepEqual(calls,[['direct','no-store'],['proxy','no-store']]);
  } finally {
    global.fetch=fetch;
    if(proxy===undefined)delete global.anlgramFetchTonApi;
    else global.anlgramFetchTonApi=proxy;
  }
});
