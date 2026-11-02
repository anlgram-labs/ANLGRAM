import execution from '../execution-version.json' with {type:'json'};
// LOCAL-ONLY browser fixture. Never published; no real wallet, key or chain send.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {setup,authorize,proof,route} from './curve-fixture.mjs';
let clock=Date.now(),h,mode='rejected',requests=0;Date.now=()=>clock;
const grant=()=>{const g=authorize(h);h.values.set('runtimeAuthorization',g);delete h.env.CURVE_TX2_SIGNING_AUTH;};
const reset=()=>{h=setup();requests=0;grant();};reset();
const source=readFileSync(new URL('../transaction-two.js',import.meta.url),'utf8');
const server=createServer(async(req,res)=>{try{
 let raw='';for await(const b of req)raw+=b;
 const path=req.url;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><title>LOCAL Curve runtime fixture — NO WALLET</title><style>body{font:16px Arial;max-width:950px;margin:24px}button{padding:12px;margin:5px}pre{white-space:pre-wrap;background:#eee;padding:12px}</style><h1>LOCAL ONLY — simulated wallet, NO blockchain transaction</h1><p>Exact production controller; synthetic proof/provider/wallet. All requests stay at 127.0.0.1.</p><button id="reset">Reset fixture</button><button id="expire">Advance clock 61 seconds</button><button id="renew">New finite server grant</button><button id="reject">Wallet rejects</button><button id="uncertain">Wallet response lost</button><button id="prepare-two">Prepare exact quote</button><label><input id="accept-two" type="checkbox" disabled>Review fixture quote</label><button id="request-two" disabled>Simulated request ONLY</button><pre id="review-two"></pre><pre id="stats"></pre><script>
let now=Date.now();const RealDate=Date;class TestDate extends RealDate{static now(){return now}}
const api=async(path,input={})=>{const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const j=await r.json();now=j.now||now;return {r,j}};
const ui={wallet:{account:${JSON.stringify(h.walletAccount)}},sendTransaction:async transaction=>{const {r,j}=await api('/simulate',{transaction});await status();if(!r.ok||j.error)throw Error('SIMULATED '+j.error);return j}};
const sandboxWindow={};new Function('window','document','location','Date',${JSON.stringify(source)})(sandboxWindow,document,{origin:'https://testnet.anlgram.com'},TestDate);
const controller=sandboxWindow.ANLGRAM_TRANSACTION_TWO({curveExecutionVersion:${JSON.stringify(execution.sha256)},operator:${JSON.stringify(h.walletAccount.address)},curveTransactionTwoPreparationEnabled:true,curveTransactionTwoSigningEnabled:false},ui);
async function status(){const r=await fetch('/stats');const j=await r.json();now=j.now;document.getElementById('stats').textContent=JSON.stringify(j,null,2)}
for(const action of ['reset','expire','renew','reject','uncertain'])document.getElementById(action).onclick=async()=>{await api('/'+action);if(action==='reset')location.reload();await status()};
(async()=>{const {j}=await api('/proof');controller.authenticate(ui.wallet,j);await status()})();
</script>`);return;}
 if(path==='/reset')reset();if(path==='/expire')clock+=61000;if(path==='/renew')grant();if(path==='/reject')mode='rejected';if(path==='/uncertain')mode='uncertain';
 if(path==='/api/curve-two/prepare'){const r=await route('prepare',{},h);res.statusCode=r.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...await r.json(),now:clock}));return;}
 if(path==='/simulate'){const {transaction}=JSON.parse(raw);const {fingerprint}=await import('../curve-policy.mjs');const r=await route('claim',{transaction,fingerprint:await fingerprint(transaction),walletAccount:h.walletAccount},h);if(!r.ok){res.statusCode=r.status;res.end(JSON.stringify({error:'claim blocked',now:clock}));return;}requests++;res.end(JSON.stringify({error:mode,now:clock}));return;}
 if(path==='/proof'){res.end(JSON.stringify({...proof(),now:clock}));return;}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({localFixture:true,now:clock,simulatedRequests:requests,lifetimeLock:h.values.get('operation')?.status??'NOT_CLAIMED',revision:h.values.get('quote')?.revision??0,fingerprint:h.values.get('prepared')?.approval.fingerprint,mode}));
}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message,now:clock}));}});
server.listen(8774,'127.0.0.1',()=>console.log('Local-only browser fixture http://127.0.0.1:8774 — no real wallet or signing transport'));
