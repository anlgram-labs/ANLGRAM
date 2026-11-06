import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Address} from '@ton/core';
import {verifyTelegramInitData} from '../telegram-init-data.mjs';
import {buildCurveTradePayload} from '../projects/curve-trade-payload.mjs';
import {migrationSummary} from '../wizard/project-status.mjs';

test('Telegram HMAC rejects modified users, duplicate keys, expiry and wrong secrets',async()=>{
 const token='disposable-fixture',now=2000000000;
 const fields=new URLSearchParams({auth_date:String(now),user:JSON.stringify({id:321,first_name:'Fixture'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 fields.set('hash',createHmac('sha256',secret).update([...fields].map(([k,v])=>k+'='+v).sort().join('\n')).digest('hex'));
 assert.equal((await verifyTelegramInitData(fields.toString(),token,now)).id,'321');
 for(const [raw,key,time] of [[fields.toString(),token,now+301],[fields.toString(),'wrong',now],
  [fields.toString()+'&user=%7B%7D',token,now],[fields.toString().replace('321','322'),token,now]]){
  assert.equal(await verifyTelegramInitData(raw,key,time),null);
 }
});

test('Telegram rejects a parameter set that aliases a valid signed string',async()=>{
 const token='disposable-fixture',now=2000000000;
 const fields=new URLSearchParams({auth_date:String(now),query_id:'abc',start_param:'draft',user:'{"id":321}'});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 fields.set('hash',createHmac('sha256',secret).update([...fields].map(([key,value])=>key+'='+value).sort().join('\n')).digest('hex'));
 assert.equal((await verifyTelegramInitData(fields.toString(),token,now)).id,'321');
 fields.set('query_id','abc\nstart_param=draft');
 fields.delete('start_param');
 assert.equal(await verifyTelegramInitData(fields.toString(),token,now),null);
});

test('Telegram preserves URL decoding and escaped JSON, with replay limited by auth_date',async()=>{
 const token='disposable-fixture',now=2000000000;
 const user={id:321,first_name:'A+B & café\nSecond line'};
 const fields=new URLSearchParams({auth_date:String(now),user:JSON.stringify(user)});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 fields.set('hash',createHmac('sha256',secret).update([...fields].map(([key,value])=>key+'='+value).sort().join('\n')).digest('hex'));
 const raw=fields.toString();
 assert.equal((await verifyTelegramInitData(raw,token,now)).first_name,user.first_name);
 // Telegram initData is a bearer credential within the read-only freshness window.
 assert.equal((await verifyTelegramInitData(raw,token,now+300)).id,'321');
 assert.equal(await verifyTelegramInitData(raw,token,now+301),null);
});

test('graduation progress uses fresh reference-relative reserve units and falls back to unknown',()=>{
 const draft={mode:'launchpad'},now=Math.floor(Date.now()/1000);
 const curve={thresholdNano:'300000000000',reserveNano:'299990000000',inventoryUnits:'1',
  graduated:false,proof:{chainTime:now}};
 const status={generation:2,scope:'REFERENCE_RELATIVE_READ_ONLY',financialSigningEnabled:false,
  migrationAuthorized:false,withdrawalsEnabled:false,curve};
 assert.equal(migrationSummary(draft,null,status).graduationProgressPercent,99.99);
 assert.equal(migrationSummary(draft,null,{...status,curve:{...curve,reserveNano:'300000000000'}}).curveGraduated,true);
 assert.equal(migrationSummary(draft,null,{...status,curve:{...curve,proof:{chainTime:now-121}}}).graduationProgressPercent,null);
 assert.equal(migrationSummary(draft,null,{scope:'AUTHENTICATED_PROJECT_OBSERVATION',realTonReserveNano:'300000000000'}).graduationProgressPercent,null);
});

test('Testnet buy and TEP-74 sell encode an exact minimum with at most one percent slippage',()=>{
 const input={network:'-3',queryId:7n,expectedOut:101n};
 const buy=buildCurveTradePayload({...input,side:'buy'}).body.beginParse();
 assert.equal(buy.loadUint(32),0x5fcc3d14);
 assert.equal(buy.loadUintBig(64),7n);
 assert.equal(buy.loadCoins(),100n);
 const address=Address.parseRaw('0:'+'12'.repeat(32));
 const testOnly=address.toString({testOnly:true});
 const sell=buildCurveTradePayload({...input,side:'sell',curve:testOnly,seller:testOnly,tokenUnits:9n}).body.beginParse();
 assert.equal(sell.loadUint(32),0x0f8a7ea5);
 assert.equal(sell.loadUintBig(64),7n);
 assert.equal(sell.loadCoins(),9n);
 assert(sell.loadAddress().equals(address));
 assert(sell.loadAddress().equals(address));
 assert.equal(sell.loadBit(),false);
 assert.equal(sell.loadCoins(),60000000n);
 assert.equal(sell.loadBit(),true);
 assert.equal(sell.loadRef().beginParse().loadCoins(),100n);
 assert.throws(()=>buildCurveTradePayload({...input,network:'-239',side:'buy'}),/Testnet/);
 assert.throws(()=>buildCurveTradePayload({...input,side:'sell',curve:address.toString(),seller:testOnly,tokenUnits:9n}),/Testnet/);
});
