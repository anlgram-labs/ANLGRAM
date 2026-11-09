'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {inspect,controller}=require('./assets/js/memelabs-inspector');
const {client}=require('./assets/js/memelabs-readonly');
const address='0:'+'a'.repeat(64),holder='0:'+'b'.repeat(64),hash='c'.repeat(64);
const metadata={metadata:{address,name:'<Token>',symbol:'REAL',decimals:0},total_supply:'9007199254740993',holders_count:0,verification:'blacklist'};
const fixture=()=>({jetton:async()=>metadata,holders:async()=>({addresses:[{address:holder,balance:'9007199254740993'}]}),transactions:async()=>({transactions:[{account:{address},hash,success:true,aborted:false,utime:0}]})});

test('public inspection preserves exact identity, zero decimals, zero holders and provider blacklist classification',async()=>{
 const r=await inspect(fixture(),address);assert.equal(r.name,'<Token>');assert.equal(r.supply,'9007199254740993');assert.equal(r.holders[0].balance,'9007199254740993');assert.equal(r.holdersCount,'0');assert.equal(r.verification,'blacklist');assert.equal(r.transactions[0].timestamp,'1970-01-01T00:00:00.000Z');
});
test('wrong master and invalid input fail before presenting token metadata',async()=>{
 await assert.rejects(inspect({...fixture(),jetton:async()=>({...metadata,metadata:{...metadata.metadata,address:holder}})},address),/exact Jetton/);
 await assert.rejects(inspect({jetton:()=>assert.fail('must not fetch')},'not-an-address'),/complete TON/);
});
test('partial outages and malformed holders/history stay unavailable rather than inventing empty data',async()=>{
 const r=await inspect({...fixture(),holders:async()=>{throw Error('offline');},transactions:async()=>({transactions:[{hash,account:{address:holder}}]})},address);
 assert.equal(r.supply,metadata.total_supply);assert.equal(r.holders,null);assert.equal(r.transactions,null);
 const empty=await inspect({...fixture(),holders:async()=>({addresses:[]}),transactions:async()=>({transactions:[]})},address);assert.deepEqual(empty.holders,[]);assert.deepEqual(empty.transactions,[]);
});
test('contract history never represents an unknown execution as successful or a wallet payment as confirmed',async()=>{
 const r=await inspect({...fixture(),transactions:async()=>({transactions:[{account:{address},hash,success:true},{account:{address},hash,success:false,aborted:true}]})},address);
 assert.equal(r.transactions[0].status,'Execution status unavailable');assert.equal(r.transactions[1].status,'Recorded failed execution');
});
test('disconnect, edits and newer inspections invalidate old results',async()=>{
 let finish;const rendered=[],view=controller({context:()=>({network:'mainnet',chainId:'-239'}),load:()=>new Promise(r=>finish=r),render:s=>rendered.push(s)});
 const pending=view.submit(address);view.clear();finish({name:'old'});await pending;assert.equal(rendered.at(-1).status,'empty');
});
test('network changes during loading cannot render stale Mainnet results as Testnet',async()=>{
 let finish,chainId='-239';const rendered=[],view=controller({context:()=>({network:chainId==='-3'?'testnet':'mainnet',chainId}),load:()=>new Promise(r=>finish=r),render:s=>rendered.push(s)});
 const pending=view.submit(address);chainId='-3';finish({});await pending;assert(!rendered.some(x=>x.status==='loaded'));assert.equal(rendered.at(-1).status,'empty');assert.equal(rendered.at(-1).network,'testnet');
});
test('holder and contract-history requests use the same explicit Testnet GET transport without Mainnet proxy',async()=>{
 const calls=[],api=client({network:'testnet',proxy:'https://mainnet.invalid',fetch:async(url,o)=>{calls.push([url,o]);return{ok:true,json:async()=>url.includes('/holders')?{addresses:[]}:url.includes('/transactions')?{transactions:[]}:metadata};}});
 await inspect(api,address);assert.equal(calls.length,3);assert(calls.every(([url,o])=>url.startsWith('https://testnet.tonapi.io/')&&o.method==='GET'&&!o.body));
});
test('candidate removes false market activity, sample balances and simulated LP while preserving inline script syntax',()=>{
 const html=fs.readFileSync('memecoin-platform.html','utf8');
 for(const sample of ['PEPE_TON minted','[120, 190','45,210 GRAM','TON-SampleToken','No Active Liquidity Pools Detected','anlgram_demo_pools_preview','Upgrade Plan'])assert(!html.includes(sample),sample);
 assert(html.includes('Liquidity custody unverified'));assert(html.includes('memelabs-inspector-form'));
 for(const[,attrs,code]of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/type="module"/.test(attrs))assert.doesNotThrow(()=>new vm.Script(code));
 const module=fs.readFileSync('assets/js/memelabs-inspector.js','utf8');assert(!module.includes('.innerHTML'));assert(!module.includes('sendTransaction'));
});

test('management avatar treats remote metadata as an image property, rejects active URLs and has a published fallback',()=>{
 const source=fs.readFileSync('assets/js/anl-labs.js','utf8').split('  function labsSetManagementAvatar')[1].split('  function labsUpdateManagementScreen')[0];
 const context={URL,window:{location:{href:'https://anlgram.com/memecoin-platform.html',origin:'https://anlgram.com'}},document:{createElement:()=>({style:{}})}};
 vm.runInNewContext('function labsSetManagementAvatar'+source,context);
 let image;const container={replaceChildren:value=>{image=value;},set innerHTML(_){assert.fail('untrusted metadata must not be parsed as HTML');}};
 context.labsSetManagementAvatar(container,'https://example.com/image.png" onerror="alert(1)');assert.equal(image.alt,'Logo');assert.equal(typeof image.onerror,'function');
 context.labsSetManagementAvatar(container,'javascript:alert(1)');assert.equal(image.src,'assets/img/anlgram-icon.svg');assert(fs.existsSync(image.src));
 image.onerror();assert.equal(image.onerror,null);
});
