'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {eligible,scanSecrets,guardPage,build}=require('./scripts/build-readonly-release');
const api=require('./assets/js/memelabs-readonly');
const base='781e1db';
const source=f=>fs.readFileSync(path.join(__dirname,f),'utf8').replace(/\r\n/g,'\n');
const original=f=>execFileSync('git',['show',base+':'+f],{cwd:__dirname,encoding:'utf8'}).replace(/\r\n/g,'\n');
test('production contracts, artifacts, wallet connector, donation, CSS, credentials routing and homepage source remain unchanged',()=>{
 const unchanged=['minter-contract','assets/css','assets/js/wallet-connect.js','assets/js/donation-config.js','cloudflare-worker','server.js','tonconnect-manifest.json','CNAME','index.html'];
 assert.equal(execFileSync('git',['diff','--name-only',base,'--',...unchanged],{cwd:__dirname,encoding:'utf8'}).trim(),'');
});
test('MemeLabs preserves navigation, CSS and non-script styles outside removed hidden sample rows',()=>{
 // Hidden fixture rows were already cleared at bootstrap in the released page.
 // Removing those obsolete source examples must not weaken protection of the UI.
 const strip=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/(<tbody id="(?:trending-tokens|managed-wallets)-tbody"[^>]*>)[\s\S]*?(<\/tbody>)/gi,'$1$2');
 for(const regex of [/<nav\b[^>]*>[\s\S]*?<\/nav>/gi,/<style\b[^>]*>[\s\S]*?<\/style>|\bstyle="[^"]*"/gi])assert.deepEqual(strip(source('memecoin-platform.html')).match(regex),strip(original('memecoin-platform.html')).match(regex));
});
test('factory fee display uses actual unchanged donation configuration without undefined aliases',()=>{
 const w={ANLGRAM_DONATION_CONFIG:require('./assets/js/donation-config'),addEventListener:()=>{}};
 const doc={addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
 vm.runInNewContext(source('assets/js/launchpad.js'),{window:w,document:doc,console:{log:()=>{}},setTimeout:()=>{}});
 const fees=w.ANLGRAM_LAUNCHPAD.calculateFees();
 assert.equal(fees.blockchainCostNano,200000000n);assert.equal(fees.platformFeeNano,20000000n);assert.equal(fees.sendAmountNano,220000000n);
 assert.equal(fees.blockchainCostTON,'0.2');assert.equal(fees.platformFeeTON,'0.02');assert.equal(fees.sendAmountTON,'0.22');
});
test('balance display rounds with integer carry instead of disagreeing with the existing wallet header',()=>{
 assert.equal(api.formatUnits('30999998000',9),'31.00');assert.equal(api.formatUnits('999500000',9),'1.00');
 assert.equal(api.formatUnits('9007199254740993999500000',9),'9007199254740994.00');
});
test('SDK and underlying connector reject sends, including restored and replacement instances',async()=>{
 let sends=0;const sdk=()=>({connector:{sendTransaction:async()=>{sends++;}},sendTransaction:async()=>{sends++;},openModal:()=>true});
 const w={};api.installReadOnlyGuard(w);w.tonConnectUI=sdk();
 await assert.rejects(w.tonConnectUI.sendTransaction({}),/read-only/);await assert.rejects(w.tonConnectUI.connector.sendTransaction({}),/read-only/);
 w.tonConnectUI=sdk();w.TonConnectUIInstance=w.tonConnectUI;await assert.rejects(w.TonConnectUIInstance.connector.sendTransaction({}),/read-only/);
 assert.equal(sends,0);assert(w.tonConnectUI.openModal());
});
test('financial controls and legacy entry actions are recognized before handlers can run',()=>{
 for(const call of ['deployJettonWeb3(event)','deployViaFactory(event)','anlgramDeployToken(event)','provideLiquidityWeb3(event)','mintMoreTokensWeb3(event)','renounceAdminWeb3(event)','labsSubmitVesting()','labsExecuteDistributionBatch()','labsExecuteDeployFromWizard()','labsExecuteBurnFromModal()'])assert(api.isFinancialAction(call),call);
 for(const call of ['labsGoToStep(2)','labsCloseModal("x")','labsSwitchSection("analytics")'])assert(!api.isFinancialAction(call));
});
test('duplicate legacy Mainnet scanners cannot start or overwrite shared tables in read-only release',()=>{
 vm.runInNewContext(source('assets/js/web3-integration.js'),{window:{ANLGRAM_READONLY:{}},document:{addEventListener:()=>assert.fail('legacy scanner must not register')},console:{log:()=>assert.fail('legacy scanner must not run')}});
});
test('browser bootstrap routes a wallet click exactly once before duplicate inline/delegated handlers',()=>{
 let click,opened=0,stopped=0,prevented=0;
 const w={document:{addEventListener:(name,handler)=>{if(name==='click')click=handler;}},addEventListener:()=>{},openWalletModal:()=>{opened++;},console:{warn:()=>{}}};
 vm.runInNewContext(source('assets/js/memelabs-readonly.js'),{window:w,WeakSet,Promise});
 click({target:{closest:selector=>selector.includes('data-wallet-btn')?{}:null},preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
 assert.equal(opened,1);assert.equal(stopped,1);assert.equal(prevented,1);
});
test('static artifact excludes backend, credentials, snapshots, tests and bytecode',()=>{
 for(const f of ['.env','assets/.env','assets/private.key','server.js','cloudflare-worker/worker.js','minter-contract/build/wallet.boc','user_txs.json','test-unified-readonly.js','docs/secrets.md'])assert(!eligible(f),f);
 for(const f of ['memecoin-platform.html','index.html','tonconnect-manifest.json','assets/js/memelabs-readonly.js'])assert(eligible(f));
});
test('all public pages receive early signing protection and fail closed if safety asset cannot load',()=>{
 const html='<html><head><script src="wallet.js"></script></head><body>Existing UI</body></html>',out=guardPage(html,'staking.html');
 assert(out.indexOf('memelabs-readonly.js')<out.indexOf('wallet.js'));assert(out.includes('window.stop()'));assert(out.includes('Existing UI'));
 const existing=guardPage(source('memecoin-platform.html'),'memecoin-platform.html');assert(existing.includes('window.stop()'));
 const factory=guardPage('<script>sendTransaction()</script>','factory-deploy.html');assert(!factory.includes('sendTransaction'));assert(factory.includes('deployment unavailable'));
});
test('secret-pattern scan rejects synthetic credentials without exposing values',()=>{
 const value='ghp_'+'x'.repeat(36);assert.throws(()=>scanSecrets(value,'fixture'),e=>e.message.includes('Value suppressed')&&!e.message.includes(value));
 assert.doesNotThrow(()=>scanSecrets('const address="UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd"','public-address'));
});
test('real artifact builds without installs, excludes sensitive paths and preserves manifest/relative assets',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'anlgram-release-test-')),result=build(out);
 assert(result.secretPatternsPassed);assert(result.files>40);assert(!fs.existsSync(path.join(out,'server.js')));assert(!fs.existsSync(path.join(out,'minter-contract')));
 assert.equal(fs.readFileSync(path.join(out,'tonconnect-manifest.json'),'utf8'),fs.readFileSync(path.join(__dirname,'tonconnect-manifest.json'),'utf8'));
 assert(fs.readFileSync(path.join(out,'staking.html'),'utf8').includes('memelabs-readonly.js'));assert(fs.existsSync(path.join(out,'assets/js/memelabs-readonly.js')));
 assert.throws(()=>build(out),/empty/);assert.throws(()=>build(path.join(__dirname,'..bad-output')),/outside/);
});
