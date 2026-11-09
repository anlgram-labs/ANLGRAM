'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function harness() {
  const html = fs.readFileSync('memecoin-platform.html','utf8');
  const match = html.match(/(\(function \(\) \{\n  \/\/ Every input mutation[\s\S]*?\n\}\)\(\);)\n<\/script>/);
  assert(match, 'Expected guarded live quote handler');
  const controls = Object.fromEntries([
    ['curve-vnext-address','0:'+ 'a'.repeat(64)],
    ['curve-vnext-network','testnet'],
    ['curve-vnext-gross','1'],
    ['curve-vnext-live-result','']
  ].map(([id,value])=>[id,{value,textContent:'',listeners:{},
    addEventListener(type,fn){this.listeners[type]=fn;},
    change(type,value){this.value=value;this.listeners[type]();}}]));
  const pending=[];
  const api={
    quote(args){const d=deferred();pending.push({args,...d});return d.promise;},
    formatUnits(value){return String(value);}
  };
  const window={ANLGRAM_CURVE_LIVE_QUOTE:api, TON_CORE:{}};
  vm.runInNewContext(match[1],{window,document:{getElementById:id=>controls[id]}});
  const quote=(contractAddress,gross='1')=>({
    network:'testnet',contractAddress,tokensAtomic:100n,feeNano:100n,
    consumedNano:10000n,refundNano:0n,willGraduate:false,
    codeHash:'test',observedAt:'2026-11-07T00:00:00Z'
  });
  return {controls,pending,window,quote,out:()=>controls['curve-vnext-live-result'].textContent};
}
test('changing gross invalidates already displayed quote',async()=>{
  const h=harness();
  const first=h.window.fetchVNextOnchainQuote();
  h.pending[0].resolve(h.quote(h.pending[0].args.address));
  await first;
  assert.match(h.out(),/ON-CHAIN GETTER/);
  assert.match(h.out(),/Requested gross: 1 TON/);
  h.controls['curve-vnext-gross'].change('input','2');
  assert.doesNotMatch(h.out(),/Jettons quoted/);
});
test('older successful request cannot overwrite newer quote',async()=>{
  const h=harness();
  const a=h.window.fetchVNextOnchainQuote();
  h.controls['curve-vnext-gross'].change('input','2');
  const b=h.window.fetchVNextOnchainQuote();
  h.pending[1].resolve(h.quote(h.pending[1].args.address));
  await b;
  const current=h.out();
  assert.match(current,/Requested gross: 2 TON/);
  h.pending[0].resolve(h.quote(h.pending[0].args.address));
  await a;
  assert.equal(h.out(),current);
});
test('older rejected request cannot overwrite newer quote',async()=>{
  const h=harness();
  const a=h.window.fetchVNextOnchainQuote();
  const b=h.window.fetchVNextOnchainQuote();
  h.pending[1].resolve(h.quote(h.pending[1].args.address));
  await b;
  const current=h.out();
  h.pending[0].reject(new Error('older failure'));
  await a;
  assert.equal(h.out(),current);
});
test('address and network changes invalidate inspected quote',async()=>{
  const h=harness();
  const a=h.window.fetchVNextOnchainQuote();
  h.controls['curve-vnext-address'].change('change','0:'+'b'.repeat(64));
  h.pending[0].resolve(h.quote(h.pending[0].args.address));
  await a;
  assert.doesNotMatch(h.out(),/ON-CHAIN GETTER/);
  const b=h.window.fetchVNextOnchainQuote();
  h.controls['curve-vnext-network'].change('change','mainnet');
  h.pending[1].reject(new Error('request failed after network changed'));
  await b;
  assert.doesNotMatch(h.out(),/On-chain quote unavailable/);
});
