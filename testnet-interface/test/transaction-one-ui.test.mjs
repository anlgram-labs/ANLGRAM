import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../transaction-one.js',import.meta.url),'utf8');
function setup(){const els=Object.fromEntries(['prepare-one','request-one','review-one','accept-one'].map(id=>[id,{disabled:true,checked:false,textContent:''}]));let sent=0,reads=0;
 const transaction={network:'-3',from:'operator',validUntil:Math.floor(Date.now()/1000)+90,messages:[{address:'minter',amount:'100000000',payload:'fixture',stateInit:'fixture'}]};
 const ui={wallet:{account:{chain:'-3',address:'operator'}},sendTransaction:async(tx,options)=>{sent++;assert.deepEqual(JSON.parse(JSON.stringify(tx)),transaction);assert.equal(options.modals.length,0);throw Error('controlled rejection');}};
 const context={window:{},document:{getElementById:id=>els[id]},location:{origin:'https://testnet.anlgram.com'},Date,BigInt,AbortSignal,fetch:async()=>{reads++;return Response.json({transaction,quoteExpiresAt:Math.floor(Date.now()/1000)+60,prepared:true,notSigned:true,policyCeilingIsNotEnforcedMaximum:true,simulation:{modeledSenderDebitNano:'106876950'},fingerprint:'fixture',stateInitHash:'fixture',operatorAddress:'fixture'});}};vm.runInNewContext(script,context);const gate=context.window.ANLGRAM_TRANSACTION_ONE({operator:'operator',minter:'minter',minterTransactionOnePreparationEnabled:true},ui);return{els,ui,gate,sent:()=>sent,reads:()=>reads};}
test('no automatic financial request: owner proof, preparation, explicit acknowledgement and click are all required; rejection never resends',async()=>{
 const h=setup();await h.els['prepare-one'].onclick();assert.equal(h.reads(),0);assert.equal(h.sent(),0);h.gate.authenticate(h.ui.wallet,{expiresAt:Math.floor(Date.now()/1000)+300});await h.els['prepare-one'].onclick();assert.equal(h.reads(),1);assert.equal(h.sent(),0);assert.equal(h.els['request-one'].disabled,true);h.els['accept-one'].checked=true;h.els['accept-one'].onchange();await Promise.all([h.els['request-one'].onclick(),h.els['request-one'].onclick()]);assert.equal(h.sent(),1);await h.els['request-one'].onclick();await h.els['prepare-one'].onclick();assert.equal(h.sent(),1);assert.equal(h.reads(),1);assert.match(h.els['review-one'].textContent,/incierto/);
});
test('disconnect or wrong network clears prepared transaction and blocks submission',async()=>{
 const h=setup();h.gate.authenticate(h.ui.wallet,{expiresAt:Math.floor(Date.now()/1000)+300});await h.els['prepare-one'].onclick();h.els['accept-one'].checked=true;h.els['accept-one'].onchange();h.gate.invalidate();await h.els['request-one'].onclick();assert.equal(h.sent(),0);h.ui.wallet.account.chain='-239';h.gate.authenticate(h.ui.wallet,{expiresAt:Math.floor(Date.now()/1000)+300});assert.equal(h.els['prepare-one'].disabled,true);
});
