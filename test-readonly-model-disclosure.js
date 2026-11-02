'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const html=fs.readFileSync('memecoin-platform.html','utf8').replace(/\r\n/g,'\n'),base='37ee53b483d69b0e301dc7ba8ba62696e2d37e17';
function setup(){
 const source=html.match(/<script>\s*(function updateCurveQuotes\(\)[\s\S]*?)<\/script>/)[1];
 const ids=['calc-buy-ton-input','calc-sell-token-input','calc-buy-tokens-output','calc-buy-net-ton','calc-buy-fee-ton','calc-grad-pct','calc-grad-bar','calc-grad-label','calc-sell-ton-output'],els=Object.fromEntries(ids.map(id=>[id,{value:id==='calc-buy-ton-input'?'1':'10000000',textContent:'',style:{}}]));
 const context={window:{},document:{readyState:'complete',getElementById:id=>els[id]},Math,Number,parseFloat};vm.runInNewContext(source,context);return{els,update:context.window.updateCurveQuotes};
}
test('graduation projection numerator and percentage track the hypothetical input and are explicitly not live reserves',()=>{
 const h=setup();assert.equal(h.els['calc-grad-pct'].textContent,'0.20%');assert.equal(h.els['calc-buy-fee-ton'].textContent,'0.01');assert.match(h.els['calc-grad-label'].textContent,/0\.99 \/ 500\.00 TON; not live progress/);h.els['calc-buy-ton-input'].value='2';h.update();assert.equal(h.els['calc-grad-pct'].textContent,'0.40%');assert.equal(h.els['calc-buy-fee-ton'].textContent,'0.02');assert.match(h.els['calc-grad-label'].textContent,/1\.98/);
});
test('clearing or invalidating inputs cannot leave a stale model quote or progress bar visible',()=>{
 const h=setup();for(const value of['','0','-1','Infinity','501','not-a-number']){h.els['calc-buy-ton-input'].value=value;h.els['calc-sell-token-input'].value=value==='501'?'0':value;h.update();assert.equal(h.els['calc-buy-tokens-output'].textContent,'Unavailable');assert.equal(h.els['calc-buy-net-ton'].textContent,'Unavailable');assert.equal(h.els['calc-grad-pct'].textContent,'Unavailable');assert.equal(h.els['calc-buy-fee-ton'].textContent,'Unavailable');assert.equal(h.els['calc-grad-bar'].style.width,'0%');assert.equal(h.els['calc-sell-ton-output'].textContent,'Unavailable');}
});
test('all CSS, inline styles, navigation, financial gates, wallet connector and production contract artifacts remain exact',()=>{
 const before=execFileSync('git',['show',base+':memecoin-platform.html'],{encoding:'utf8'}).replace(/\r\n/g,'\n');
 const noScripts=x=>x.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const styles=x=>noScripts(x).match(/<style\b[^>]*>[\s\S]*?<\/style>|\bstyle="[^"]*"/gi);assert.deepEqual(styles(html),styles(before));
 assert.deepEqual(noScripts(html).match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi),noScripts(before).match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi));
 assert.deepEqual(html.match(/const\s+\w*(?:APPROVED|ENABLED)\w*\s*=\s*(?:true|false)/g),before.match(/const\s+\w*(?:APPROVED|ENABLED)\w*\s*=\s*(?:true|false)/g));
 const changed=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split(/\r?\n/);assert(changed.every(f=>['memecoin-platform.html','test-readonly-model-disclosure.js'].includes(f)),'Only reviewed public HTML and its verification test may differ from production');
 assert(!html.includes('Architecture Verified'));assert(html.includes('unverified design targets'));assert(html.includes('not live liquidity'));assert(html.includes('~0.22 TON'));
});
