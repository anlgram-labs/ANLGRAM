'use strict';
// Pure receipt checks, NOT a provider, signer, authorizer or lock reset. Caller
// must acquire authentic finalized Testnet data; arbitrary JSON is not provenance.
const assert=require('node:assert/strict');
const core=require('../minter-contract/node_modules/@ton/core');
const {WalletContractV5R1}=require('../minter-contract/node_modules/@ton/ton');
const {loadOutListExtendedV5R1}=require('../minter-contract/node_modules/@ton/ton/dist/wallets/v5r1/WalletV5R1Actions');
const raw=x=>core.Address.parse(x).toRawString();
const hex=s=>{assert.equal(typeof s,'string');const b=Buffer.from(s,'base64');assert.equal(b.length,32);return b.toString('hex');};
const hash=c=>c.hash().toString('hex');
function walletData(policy,seqno){return core.beginCell().storeBit(true).storeUint(seqno,32).storeInt(policy.walletId,32).storeBuffer(Buffer.from(policy.publicKey,'hex')).storeBit(false).endCell();}
function verifySignedBody(body,policy,validUntil){
 assert.equal(policy.network,'-3');assert.equal(policy.walletId,2147483645);assert(Number.isSafeInteger(policy.seqno)&&policy.seqno>=1);assert(Number.isSafeInteger(validUntil));
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(policy.publicKey,'hex'),walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});assert.equal(wallet.address.toRawString(),policy.operator);assert.equal(hash(wallet.init.code),policy.walletCodeHash);
 const signed=core.Cell.fromBase64(body);assert(signed.bits.length>=512);const bits=signed.beginParse(),unsignedBits=bits.loadBits(signed.bits.length-512),signature=bits.loadBuffer(64),b=core.beginCell().storeBits(unsignedBits);while(bits.remainingRefs)b.storeRef(bits.loadRef());bits.endParse();
 const unsigned=b.endCell(),s=unsigned.beginParse();assert.equal(s.loadUint(32),0x7369676e);assert.equal(s.loadInt(32),policy.walletId);assert.equal(s.loadUint(32),validUntil);assert.equal(s.loadUint(32),policy.seqno);
 assert(core.domainSignVerify({data:unsigned.hash(),signature,publicKey:Buffer.from(policy.publicKey,'hex')}),'Invalid V5 signature');
 const actions=loadOutListExtendedV5R1(s);s.endParse();assert.equal(actions.length,1);assert.equal(actions[0].type,'sendMsg');assert.equal(actions[0].mode,3);
 const m=actions[0].outMsg,expected=policy.message;assert.equal(m.info.type,'internal');assert.equal(m.info.dest.toRawString(),raw(expected.address));assert.equal(m.info.value.coins,BigInt(expected.amount));assert.equal(m.info.bounce,core.Address.parseFriendly(expected.address).isBounceable);assert.equal(m.info.bounced,false);assert.equal(hash(m.body),hash(core.Cell.fromBase64(expected.payload)));assert(m.init);assert.equal(hash(core.beginCell().store(core.storeStateInit(m.init)).endCell()),hash(core.Cell.fromBase64(expected.stateInit)));
 return{bodyHash:hash(signed),seqno:policy.seqno,walletId:policy.walletId,signatureValid:true};
}
function verifyDeployment(trace,policy,validUntil){
 assert.equal(trace.is_incomplete,false);assert.equal(trace.trace_info?.trace_state,'complete');assert.equal(trace.trace_info?.pending_messages,0);
 const all=Object.values(trace.transactions);assert.equal(all.length,2);const source=all.find(t=>raw(t.account)===policy.operator),target=all.find(t=>raw(t.account)===raw(policy.message.address));assert(source&&target);
 for(const t of all){assert.equal(t.emulated,false);assert.equal(t.finality,'finalized');assert.equal(t.description.aborted,false);assert.equal(t.description.compute_ph.success,true);assert.equal(t.description.compute_ph.exit_code,0);assert.equal(t.description.action.success,true);assert.equal(t.description.action.result_code,0);assert.equal(t.end_status,'active');hex(t.hash);}
 assert.equal(source.orig_status,'active');assert(['nonexist','uninit'].includes(target.orig_status));assert.equal(source.out_msgs.length,1);assert.equal(target.out_msgs.length,0);assert.equal(source.description.action.msgs_created,1);
 assert(source.in_msg.init_state==null,'An already-active V5 must not redeploy its source wallet');assert.equal(raw(source.in_msg.destination),policy.operator);assert(source.in_msg.source==null);assert(Number.isSafeInteger(source.now)&&source.now<validUntil);
 const signed=verifySignedBody(source.in_msg.message_content.body,policy,validUntil);assert.equal(hex(source.in_msg.message_content.hash),signed.bodyHash);
 const out=source.out_msgs[0];assert.equal(out.bounced,false);assert.equal(target.in_msg.bounced,false);assert.equal(raw(out.source),policy.operator);assert.equal(out.hash,target.in_msg.hash);assert.equal(hex(trace.external_hash),hex(source.in_msg.hash));assert.equal(raw(out.destination),raw(policy.message.address));assert.equal(raw(target.in_msg.source),policy.operator);assert.equal(out.value,policy.message.amount);assert.equal(target.in_msg.value,policy.message.amount);assert.equal(hex(out.message_content.hash),hash(core.Cell.fromBase64(policy.message.payload)));assert.equal(hex(target.in_msg.message_content.hash),hex(out.message_content.hash));assert.equal(hex(out.init_state.hash),hash(core.Cell.fromBase64(policy.message.stateInit)));assert.equal(hex(target.in_msg.init_state.hash),hex(out.init_state.hash));
 assert.equal(hex(source.account_state_before.code_hash),policy.walletCodeHash);assert.equal(hex(source.account_state_after.code_hash),policy.walletCodeHash);assert.equal(hex(source.account_state_before.data_hash),hash(walletData(policy,policy.seqno)));assert.equal(hex(source.account_state_after.data_hash),hash(walletData(policy,policy.seqno+1)));
 assert.equal(hex(target.account_state_after.code_hash),policy.targetCodeHash);assert.equal(hex(target.account_state_after.data_hash),policy.targetDataHash);assert.equal(BigInt(target.account_state_before.balance),0n);
 const attachment=BigInt(policy.message.amount),debit=BigInt(source.account_state_before.balance)-BigInt(source.account_state_after.balance),fees=BigInt(source.total_fees)+BigInt(out.fwd_fee),targetFees=BigInt(target.total_fees);assert(debit>attachment&&fees>0n&&targetFees>=0n);assert.equal(debit,attachment+fees);assert.equal(BigInt(target.account_state_after.balance),attachment-targetFees);assert.equal(debit-BigInt(target.account_state_after.balance),fees+targetFees);
 return{status:'FINALIZED_DEPLOYMENT_FIELDS_AND_SIGNATURE_MATCH',scope:'PURE_VERIFIER_REQUIRES_AUTHENTIC_PROVIDER_PROVENANCE',network:'-3',sourceTransactionHash:hex(source.hash),destinationTransactionHash:hex(target.hash),externalMessageHash:hex(trace.external_hash),internalMessageHash:hex(out.hash),signatureValid:true,seqnoBefore:policy.seqno,seqnoAfter:policy.seqno+1,attachmentNano:attachment.toString(),actualSenderDebitNano:debit.toString(),actualSenderFeesNano:fees.toString(),destinationBalanceNano:target.account_state_after.balance,withinPolicy:debit<=120000000n,hardMaximumDebitEnforced:false,newOperationAllowed:false};
}
module.exports={verifySignedBody,verifyDeployment,walletData};
