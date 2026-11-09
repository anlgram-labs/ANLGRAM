'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('./assets/js/memelabs-readonly');
const provider=require('./assets/js/blockchain-provider');
const address='0:'+ 'a'.repeat(64),other='0:'+'b'.repeat(64);
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('actual wallet network overrides URL and stored hints; unknown wallet networks fail closed',()=>{
  assert.equal(api.network('-239','?testnet','testnet'),'mainnet');
  assert.equal(api.network('-3','?network=mainnet','mainnet'),'testnet');
  assert.equal(api.network(null,'?network=testnet'),'testnet');
  assert.equal(api.network(null,'?notestnet=true','mainnet'),'mainnet');
  assert.throws(()=>api.network('unknown','?testnet'),/Unsupported/);
});
test('token amounts preserve integer precision and zero decimals; missing or lossy data is unavailable',()=>{
  assert.equal(api.formatUnits('123456789012345678901234567890',9),'123456789012345678901.23');
  assert.equal(api.formatUnits('9007199254740993',0),'9007199254740993');
  assert.equal(api.formatUnits('1',9,8),'0.00000000');
  for(const args of [[undefined,9],[9007199254740992,0],['2',undefined],['2',31],['-1',0]])assert.equal(api.formatUnits(...args),'Unavailable');
});
test('mainnet proxy rate limits fall back to same-network GETs only',async()=>{
  const calls=[],client=api.client({network:'mainnet',proxy:'/api/ton',fetch:async(u,o)=>{calls.push([u,o]);return response({balance:'42'},calls.length===1?429:200);}});
  assert.deepEqual(await client.account(address),{balance:'42'});
  assert(calls[0][0].startsWith('/api/ton/accounts/0%3A'));
  assert(calls[1][0].startsWith('https://tonapi.io/v2/accounts/0%3A'));
  assert(calls.every(([,o])=>o.method==='GET'&&!o.body&&!o.headers.Authorization));
});
test('testnet never touches mainnet proxy; upstream failures are not fabricated empty balances',async()=>{
  const calls=[],client=api.client({network:'testnet',proxy:'https://mainnet.invalid',fetch:async u=>{calls.push(u);return response({},503);}});
  await assert.rejects(client.jettons(address),/503/);
  assert.equal(calls.length,1);assert(calls[0].startsWith('https://testnet.tonapi.io/'));
});
test('read transport rejects malformed paths and addresses before calling provider',async()=>{
  const client=api.client({network:'mainnet',fetch:()=>assert.fail('provider must not run')});
  for(const path of ['/sendBoc','/accounts/../sendBoc','/accounts/%252e','//evil.invalid','/accounts/a#b','/jettons/abc\\def'])await assert.rejects(client.request(path));
  assert.throws(()=>client.account('not-an-address'),/Invalid TON/);
});
test('browser context follows current wallet chain and rejects an unclassified connected wallet',()=>{
  const w={location:{search:'?testnet'},localStorage:{getItem:()=>null},tonConnectUI:{wallet:{account:{chain:'-239',address}}}};
  const browser=api.browser(w);assert.equal(browser.getContext().network,'mainnet');
  w.tonConnectUI.wallet.account.chain='-3';assert(browser.getContext().tonscanBase.includes('testnet'));
  delete w.tonConnectUI.wallet.account.chain;assert.throws(()=>browser.getContext(),/unavailable/);
});
test('read-only review boundary blocks SDK sends including late SDK assignment and preserves connection',async()=>{
  let sends=0,connections=0;
  const sdk=()=>({sendTransaction:async()=>{sends++;},openModal:()=>{connections++;}});
  const w={tonConnectUI:sdk()};api.installReadOnlyGuard(w);
  await assert.rejects(w.tonConnectUI.sendTransaction({messages:[]}),/read-only review/);
  w.tonConnectUI=sdk();w.TonConnectUIInstance=w.tonConnectUI;
  await assert.rejects(w.TonConnectUIInstance.sendTransaction({messages:[]}),/read-only review/);
  w.tonConnectUI.openModal();assert.equal(connections,1);assert.equal(sends,0);
});

function walletView(fetch){
  const html=fs.readFileSync(require.resolve('./memecoin-platform.html'),'utf8');
  const source=html.slice(html.indexOf('let tokenViewRequest = 0;')).split('</script>')[0];
  let handler;
  const elements=Object.fromEntries(['managed-wallets-tbody','trending-tokens-tbody','liquidity-pools-list'].map(id=>[id,{innerHTML:'',style:{}}]));
  const context={window:{ANLGRAM_READONLY:{getContext:()=>({chainId:'-239',tonscanBase:'https://tonscan.org'}),formatUnits:api.formatUnits},anlgramFetchTonApi:fetch,BlockchainProvider:provider,addEventListener:(name,fn)=>{handler=fn;}},
    document:{getElementById:id=>elements[id]||null},localStorage:{getItem:()=>null},console:{warn:()=>{}},encodeURIComponent,
    escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
  vm.runInNewContext(source,context);
  return{elements,change:a=>handler({detail:{address:a}}),context};
}
test('actual page wallet handler discards delayed balance after disconnect',async()=>{
  let finish;const view=walletView(()=>new Promise(r=>{finish=r;}));
  const pending=view.change(address);await view.change(null);
  finish(response({balance:'9000000000',status:'active'}));await pending;
  assert(view.elements['managed-wallets-tbody'].innerHTML.includes('Connect wallet'));
  assert(!view.elements['managed-wallets-tbody'].innerHTML.includes('9.00 TON'));
});
test('actual page handler renders latest wallet and honest provider failures',async()=>{
  const view=walletView(async endpoint=>endpoint.endsWith('/jettons')?response({balances:[]}):response({balance:'1230000000',status:'frozen'}));
  await view.change(other);
  assert(view.elements['managed-wallets-tbody'].innerHTML.includes('1.23 TON'));
  assert(view.elements['managed-wallets-tbody'].innerHTML.includes('frozen'));
  const failed=walletView(async()=>response({},503));await failed.change(address);
  assert(failed.elements['managed-wallets-tbody'].innerHTML.includes('unavailable'));
  assert(!failed.elements['managed-wallets-tbody'].innerHTML.includes('0.00 TON'));
});
test('actual page clears stale balances when connected wallet network is unknown',async()=>{
  const view=walletView(()=>assert.fail('unsupported network must not fetch'));
  view.elements['managed-wallets-tbody'].innerHTML='Previous wallet funds';
  view.context.window.ANLGRAM_READONLY.getContext=()=>{throw Error('unknown chain');};
  await view.change(address);assert(view.elements['managed-wallets-tbody'].innerHTML.includes('network unavailable'));
});
test('actual page renders token balances with zero decimals and rejects wrong-workchain admin identity',async()=>{
  const tokens=[{balance:'9007199254740993',jetton:{address:other,name:'Real <Token>',symbol:'REAL',decimals:0}},{balance:'1',jetton:{address:'0:'+'c'.repeat(64),name:'Second',symbol:'SECOND',decimals:0}}];
  const view=walletView(async endpoint=>endpoint.includes('/methods/')?response({decoded:{admin_address:'-1:'+'a'.repeat(64)}}):endpoint.includes('/jettons')?response({balances:tokens}):response({balance:'0',status:'active'}));
  await view.change(address);
  const rendered=view.elements['trending-tokens-tbody'].innerHTML;
  assert(rendered.includes('9007199254740993'));assert(rendered.includes('Real &lt;Token&gt;'));assert(rendered.includes('Second'));assert(!rendered.includes('👑 Admin'));
});
test('legacy sample wallet and token tables are cleared before they are revealed',()=>{
  const elements=Object.fromEntries(['managed-wallets-tbody','trending-tokens-tbody'].map(id=>[id,{innerHTML:'sample balances',hidden:true}]));
  api.prepareView({getElementById:id=>elements[id],querySelectorAll:()=>[],querySelector:()=>null});
  for(const value of Object.values(elements)){assert.equal(value.hidden,false);assert(!value.innerHTML.includes('sample balances'));assert(value.innerHTML.includes('Connect wallet'));}
});

function analyticsView(fetch){
  const source=fs.readFileSync(require.resolve('./assets/js/anl-labs.js'),'utf8').split('let tokenAnalyticsRequest = 0;')[1].split('// Sparkline Chart')[0];
  const elements=Object.fromEntries(['labs-ana-total-supply','labs-ana-circ-supply','labs-ana-holders','labs-ana-holders-list','labs-ana-pool-status'].map(id=>[id,{textContent:'',innerHTML:''}]));
  const context={window:{ANLGRAM_READONLY_UTILS:api},wizardState:{},document:{getElementById:id=>elements[id]||null},
    getNetworkContext:()=>({chainId:'-239'}),labsFetchTonApi:fetch,rawToFriendly:v=>v,shortAddr:v=>v,escapeHtml:v=>String(v),formatNumber:v=>String(v),labsRenderSparkline:()=>{},encodeURIComponent,console:{warn:()=>{}}};
  vm.runInNewContext('let tokenAnalyticsRequest = 0;'+source,context);
  return{elements,load:a=>context.window.labsLoadTokenAnalytics(a)};
}
test('actual analytics uses total supply as holder denominator and preserves zero holders and zero decimals',async()=>{
  const view=analyticsView(async endpoint=>endpoint.includes('/holders')?response({addresses:[{address,balance:'10'}]}):response({total_supply:'1000',metadata:{decimals:0},holders_count:0}));
  await view.load(other);
  assert.equal(view.elements['labs-ana-total-supply'].textContent,'1000');
  assert.equal(view.elements['labs-ana-circ-supply'].textContent,'Unavailable');
  assert.equal(view.elements['labs-ana-holders'].textContent,'0');
  assert(view.elements['labs-ana-holders-list'].innerHTML.includes('1.0%'));
  assert(!view.elements['labs-ana-holders-list'].innerHTML.includes('100.0%'));
});
test('actual analytics cannot overwrite a newly selected token with delayed old metadata',async()=>{
  let finish;const view=analyticsView(async endpoint=>endpoint.includes('/holders')?response({addresses:[]}):endpoint.includes(encodeURIComponent(address))?new Promise(r=>{finish=r;}):response({total_supply:'42',metadata:{decimals:0},holders_count:2}));
  const pending=view.load(address);await view.load(other);finish(response({total_supply:'999',metadata:{decimals:0},holders_count:9}));await pending;
  assert.equal(view.elements['labs-ana-total-supply'].textContent,'42');
});
