'use strict';
// Explicit synthetic local cryptographic fixtures. Never a real operator key,
// wallet request, provider observation, broadcast or on-chain receipt.
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('./minter-contract/node_modules/@ton/core');
const {WalletContractV5R1}=require('./minter-contract/node_modules/@ton/ton');
const {keyPairFromSeed}=require('./minter-contract/node_modules/@ton/crypto');
const {verifyDeployment,verifySignedBody,walletData}=require('./lib/v5-deployment-receipt');
const {verify:verifyPinnedCurve}=require('./lib/curve-two-receipt');
const original=require('./tests/settlement-runtime/fixtures/curve-two-emulation-summary.json'),p=require('./docs/launchpad/testnet-v5-candidate.json'),intent=require('./testnet-interface/curve-two-intent.json');
const b64=s=>Buffer.from(s,'hex').toString('base64');
let cached;
async function fixture(){
 if(!cached)cached=(async()=>{
  const pair=keyPairFromSeed(Buffer.alloc(32,71)),w=WalletContractV5R1.create({publicKey:pair.publicKey,walletId:{networkGlobalId:-3}}),message=structuredClone(intent.message),init=core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse());
  const body=await w.createTransfer({seqno:1,timeout:original.validUntil,authType:'external',sendMode:3,messages:[core.internal({to:core.Address.parse(message.address),value:100000000n,bounce:true,init,body:core.Cell.fromBase64(message.payload)})],secretKey:pair.secretKey});
  const policy={network:'-3',operator:w.address.toRawString(),publicKey:pair.publicKey.toString('hex'),walletId:2147483645,seqno:1,walletCodeHash:p.wallet.codeHash,message,targetCodeHash:p.dependentAccounts.curve.codeHash,targetDataHash:p.dependentAccounts.curve.dataHash};
  const trace=structuredClone(original.trace),tx=Object.values(trace.transactions),source=tx.find(t=>t.account.toLowerCase()===p.wallet.raw),target=tx.find(t=>t!==source);
  for(const t of tx){t.emulated=false;t.finality='finalized';}trace.trace_info={trace_state:'complete',pending_messages:0};source.account=policy.operator;source.now=original.validUntil-10;source.in_msg.destination=policy.operator;source.in_msg.source=null;source.in_msg.init_state=null;source.in_msg.message_content={body:body.toBoc().toString('base64'),hash:b64(body.hash().toString('hex'))};source.in_msg.hash=Buffer.alloc(32,81).toString('base64');trace.external_hash=source.in_msg.hash;
  source.account_state_before.data_hash=b64(walletData(policy,1).hash().toString('hex'));source.account_state_after.data_hash=b64(walletData(policy,2).hash().toString('hex'));source.out_msgs[0].source=policy.operator;source.out_msgs[0].bounced=false;target.in_msg.bounced=false;target.in_msg.source=policy.operator;target.in_msg.value='100000000';target.in_msg.init_state=structuredClone(source.out_msgs[0].init_state);target.in_msg.message_content=structuredClone(source.out_msgs[0].message_content);
  return{policy,trace,body:body.toBoc().toString('base64'),validUntil:original.validUntil};
 })();return structuredClone(await cached);
}
const sourceOf=f=>Object.values(f.trace.transactions).find(t=>t.account===f.policy.operator);
test('synthetic local V5 signature and exact one-action finalized receipt fields reconcile without claiming network provenance',async()=>{
 const f=await fixture(),r=verifyDeployment(f.trace,f.policy,f.validUntil);assert.equal(r.signatureValid,true);assert.equal(r.seqnoBefore,1);assert.equal(r.seqnoAfter,2);assert.equal(r.actualSenderDebitNano,'117022181');assert.equal(r.withinPolicy,true);assert.equal(r.newOperationAllowed,false);assert.equal(r.scope,'PURE_VERIFIER_REQUIRES_AUTHENTIC_PROVIDER_PROVENANCE');
});
test('wallet acceptance, emulation, missing finality and incomplete or duplicate messages cannot count as finalized deployment',async()=>{
 for(const change of [f=>f.trace.is_incomplete=true,f=>f.trace.trace_info.pending_messages=1,f=>sourceOf(f).emulated=true,f=>sourceOf(f).finality='pending',f=>sourceOf(f).now=f.validUntil,f=>sourceOf(f).description.aborted=true,f=>sourceOf(f).out_msgs.push(structuredClone(sourceOf(f).out_msgs[0])),f=>delete f.trace.trace_info]){const f=await fixture();change(f);assert.throws(()=>verifyDeployment(f.trace,f.policy,f.validUntil));}
});
test('wrong nonce/network/key, invalid signature, changed action amount/body/StateInit and source wallet redeployment fail',async()=>{
 for(const change of [f=>f.policy.seqno=2,f=>f.policy.network='-239',f=>f.policy.publicKey='00'.repeat(32),f=>f.policy.message.amount='100000001',f=>f.policy.message.payload=core.beginCell().storeUint(1,1).endCell().toBoc().toString('base64'),f=>f.policy.message.stateInit=core.beginCell().endCell().toBoc().toString('base64'),f=>sourceOf(f).in_msg.init_state={hash:Buffer.alloc(32).toString('base64')}]){const f=await fixture();change(f);assert.throws(()=>verifyDeployment(f.trace,f.policy,f.validUntil));}
 const f=await fixture(),zero=core.Cell.fromBase64(f.body),s=zero.beginParse(),b=core.beginCell().storeBits(s.loadBits(zero.bits.length-512)).storeBuffer(Buffer.alloc(64));while(s.remainingRefs)b.storeRef(s.loadRef());assert.throws(()=>verifySignedBody(b.endCell().toBoc().toString('base64'),f.policy,f.validUntil),/signature/);
});
test('changed fee/accounting or message links cannot produce a successful correlated receipt',async()=>{
 for(const change of [f=>sourceOf(f).total_fees='1',f=>sourceOf(f).out_msgs[0].hash=Buffer.alloc(32).toString('base64'),f=>sourceOf(f).account_state_after.data_hash=Buffer.alloc(32).toString('base64'),f=>sourceOf(f).out_msgs[0].value='99999999']){const f=await fixture();change(f);assert.throws(()=>verifyDeployment(f.trace,f.policy,f.validUntil));}
});
test('an actually finalized debit above policy is reported as a policy breach, never hidden as a failed/refundable transaction',async()=>{
 const f=await fixture(),s=sourceOf(f),extra=4000000n;s.total_fees=(BigInt(s.total_fees)+extra).toString();s.account_state_after.balance=(BigInt(s.account_state_after.balance)-extra).toString();const r=verifyDeployment(f.trace,f.policy,f.validUntil);assert.equal(r.status,'FINALIZED_DEPLOYMENT_FIELDS_AND_SIGNATURE_MATCH');assert.equal(r.withinPolicy,false);assert.equal(r.hardMaximumDebitEnforced,false);assert.equal(r.actualSenderDebitNano,'121022181');assert.equal(r.newOperationAllowed,false);
});
test('synthetic signer and obsolete transaction-one fingerprint cannot certify the real pinned Curve operation',async()=>{
 const f=await fixture(),approval={candidateSha256:intent.candidateSha256,expectedSeqno:1,walletId:intent.walletId,validUntil:f.validUntil,fingerprint:'00'.repeat(32)};
 assert.throws(()=>verifyPinnedCurve(f.trace,approval,{},{}));
 const crypto=require('node:crypto'),canonical={operation:intent.operation,candidate:intent.candidateSha256,expectedSeqno:1,walletId:intent.walletId,network:'-3',from:intent.operator,validUntil:f.validUntil,messages:[intent.message]};approval.fingerprint=crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');assert.throws(()=>verifyPinnedCurve(f.trace,approval,{},{}));
});
