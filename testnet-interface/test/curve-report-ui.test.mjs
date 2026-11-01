import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),report=JSON.parse(readFileSync(new URL('../../docs/launchpad/testnet-curve-two-preflight.json',import.meta.url)));
async function setup(mutation){
 const els=Object.fromEntries(['status','start','disconnect','operator','minter','curve-report-button','curve-report','refresh','balance'].map(id=>[id,{textContent:'',disabled:false}]));let financial=0,reads=0;
 const ui={onStatusChange(){},sendTransaction(){financial++;throw Error('No financial calls permitted');}},j=structuredClone(report);j.sandbox={evidence:'LOCAL_SOURCE_COMPILED_SANDBOX_ONLY'};mutation?.(j);
 const context={window:{ANLGRAM_TRANSACTION_ONE:()=>({invalidate(){},authenticate(){}})},document:{getElementById:id=>els[id]},location:{origin:'https://testnet.anlgram.com'},TON_CONNECT_UI:{TonConnectUI:function(){return ui;}},URL,Date,BigInt,fetch:async url=>{reads++;if(url==='/api/config')return Response.json({network:'-3',operator:report.operator,minter:report.minter.address,manifestUrl:'https://testnet.anlgram.com/tonconnect-manifest.json',financialSigningEnabled:false});assert.equal(url,'/curve-two-preflight.json');return Response.json(j);}};
 await vm.runInNewContext(source,context);return{els,financial:()=>financial,reads:()=>reads};
}
test('Curve report is manual read-only evidence, labeled historical/local and never calls the wallet',async()=>{
 const h=await setup();assert.equal(h.reads(),1);await h.els['curve-report-button'].onclick();assert.equal(h.reads(),2);assert.equal(h.financial(),0);assert.match(h.els['curve-report'].textContent,/No es una cotización vigente ni autorización/);assert.match(h.els['curve-report'].textContent,/Firma BLOQUEADA/);assert.match(h.els['curve-report'].textContent,/no es despliegue/);assert.equal(h.els['curve-report-button'].disabled,false);
});
test('Curve report claiming signing enabled is rejected instead of enabling a financial flow',async()=>{
 const h=await setup(j=>{j.readyForSigning=true;});await h.els['curve-report-button'].onclick();assert.match(h.els['curve-report'].textContent,/rechazado/);assert.equal(h.financial(),0);
});
test('Mainnet or claimed live Curve deployment cannot be substituted as this read-only Testnet preflight',async()=>{
 for(const mutation of [j=>{j.network='-239';},j=>{j.broadcast=true;}]){const h=await setup(mutation);await h.els['curve-report-button'].onclick();assert.match(h.els['curve-report'].textContent,/rechazado/);assert.equal(h.financial(),0);}
});
