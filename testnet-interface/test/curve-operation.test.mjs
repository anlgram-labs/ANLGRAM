import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as core from '@ton/core';
import {curveOperationRoute,curveAuthorized,CurveFinancialOperation} from '../curve-operation.mjs';
import {intent,fingerprint} from '../curve-policy.mjs';
import {intent as minterIntent,fingerprint as firstFingerprint} from '../minter-policy.mjs';
import {curveEmulation} from '../curve-emulation.mjs';
import p from '../../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {setup,proof,route} from './curve-fixture.mjs';
test('Curve preparation is non-signing; exact approved claim checks fresh active V5/minter/Curve and locks forever',async()=>{
 const h=setup(),r=await route('prepare',{},h);assert.equal(r.status,200);const j=await r.json();assert.equal(j.requestAllowed,false);assert.equal(j.expectedSeqno,1);assert.equal(h.values.has('operation'),false);
 const input={transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount};assert.equal((await route('claim',input,h)).status,403);assert.equal(h.reads(),5);
 h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);assert.equal((await route('claim',input,h)).status,200);assert.equal((await route('claim',input,h)).status,409);assert.equal((await route('prepare',{},h)).status,409);
 assert.equal(h.values.get('operation').approvalReference.expectedSeqno,1);assert.equal(h.values.get('operation').status,'LOCKED_PENDING_RECONCILIATION');
});
test('Curve rejects reused first transaction/fingerprint and changed nonce/state without consuming claim',async()=>{
 const h=setup(),j=await(await route('prepare',{},h)).json();h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);
 const input={transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount};
 const first={...j.transaction,messages:[minterIntent.message]};await assert.rejects(route('claim',{...input,transaction:first,fingerprint:await firstFingerprint(first)},h));
 assert.notEqual(await fingerprint(j.transaction),await firstFingerprint(first));
 h.source.data=core.beginCell().storeBit(true).storeUint(2,32).storeInt(intent.walletId,32).storeBuffer(Buffer.from(intent.publicKey,'hex')).storeBit(false).endCell().toBoc().toString('base64');assert.equal((await route('claim',input,h)).status,409);assert.equal(h.values.has('operation'),false);
});
test('Curve proof expiry/domain/network, stale quote, changed wallet and incompatible authorization fail closed',async()=>{
 const h=setup();for(const pr of [{...proof(),expiresAt:1},{...proof(),domain:'anlgram.com'},{...proof(),network:'-239'}])assert.equal((await route('prepare',{},h,pr)).status,403);assert.equal(h.reads(),0);
 const j=await(await route('prepare',{},h)).json();h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify({...h.scope,expectedSeqno:0});assert.equal(curveAuthorized(h.env),false);h.scope.fingerprint=j.fingerprint;h.scope.validUntil=j.transaction.validUntil;h.env.CURVE_TX2_SIGNING_AUTH=JSON.stringify(h.scope);
 await assert.rejects(route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:{...h.walletAccount,chain:'-239'}},h));
 h.values.get('prepared').approval.observedAt-=61;assert.equal((await route('claim',{transaction:j.transaction,fingerprint:j.fingerprint,walletAccount:h.walletAccount},h)).status,403);assert.equal(h.values.has('operation'),false);
});
