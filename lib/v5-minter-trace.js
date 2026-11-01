'use strict';
// Shared, unchanged complete-trace financial checks used by CLI and Testnet preparation.
function analyze(trace,p,bodyHash,core){
 const crypto=require('node:crypto'),assert=require('node:assert/strict');const raw=x=>core.Address.parse(x).toRawString(),hex=x=>Buffer.from(x,'base64').toString('hex'),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
 assert.equal(trace.is_incomplete,false,'Incomplete emulation');assert.equal(Object.keys(trace.transactions).length,2,'Unexpected extra transactions');
 const tx=Object.values(trace.transactions),sender=tx.find(t=>raw(t.account)===p.wallet.raw),minter=tx.find(t=>raw(t.account)===p.dependentAccounts.minter.raw);assert(sender&&minter);
 for(const t of tx){assert.equal(t.emulated,true);assert.equal(t.description.aborted,false);assert.equal(t.description.compute_ph.success,true);assert.equal(t.description.compute_ph.exit_code,0);assert.equal(t.description.action.success,true);assert.equal(t.description.action.result_code,0);assert.equal(t.end_status,'active');}
 assert.equal(sender.orig_status,'uninit');assert(['nonexist','uninit'].includes(minter.orig_status));
 assert.equal(sender.out_msgs.length,1);assert.equal(minter.out_msgs.length,0);assert.equal(sender.description.action.msgs_created,1);
 const out=sender.out_msgs[0];assert.equal(raw(out.destination),p.dependentAccounts.minter.raw);assert.equal(out.value,'100000000');assert.equal(minter.in_msg.hash,out.hash);
 if(bodyHash)assert.equal(hex(sender.in_msg.message_content.hash),bodyHash);
 const first=p.smokePlan.steps[0].message;
 assert.equal(hex(out.message_content.hash),core.Cell.fromBase64(first.payload).hash().toString('hex'));
 assert.equal(hex(out.init_state.hash),core.Cell.fromBase64(first.stateInit).hash().toString('hex'));
 assert.equal(hex(minter.account_state_after.code_hash),p.dependentAccounts.minter.codeHash);
 assert.equal(hex(minter.account_state_after.data_hash),p.dependentAccounts.minter.dataHash);
 assert.equal(hex(sender.account_state_after.code_hash),p.wallet.codeHash);
 const walletData=core.Cell.fromBase64(trace.data_cells[sender.account_state_after.data_hash]).beginParse();assert.equal(walletData.loadBit(),true);assert.equal(walletData.loadUint(32),1);assert.equal(walletData.loadInt(32),2147483645);assert.equal(walletData.loadBuffer(32).toString('hex'),p.wallet.publicKey);assert.equal(walletData.loadBit(),false);assert.equal(walletData.remainingBits,0);assert.equal(walletData.remainingRefs,0);
 const initial=BigInt(sender.account_state_before.balance),final=BigInt(sender.account_state_after.balance),debit=initial-final;
 const sourceFees=BigInt(sender.total_fees),forwardRemainder=BigInt(out.fwd_fee),minterFees=BigInt(minter.total_fees),attachment=100000000n;
 assert.equal(debit,attachment+sourceFees+forwardRemainder,'Sender debit mismatch');
 assert.equal(BigInt(minter.account_state_after.balance),attachment-minterFees,'Minter credit mismatch');
 assert.equal(initial-final-BigInt(minter.account_state_after.balance),sourceFees+forwardRemainder+minterFees,'Conservation failure');
 return{masterchainBlock:trace.mc_block_seqno,traceSha256:sha(trace),complete:true,signatureCheckSkippedOnlyInEmulator:true,
  transactions:2,outgoingDeploymentMessages:1,minterDescendants:0,operatorWalletAlsoActivates:true,seqnoBefore:0,seqnoAfter:1,
  operatorBalanceBeforeNano:initial.toString(),operatorBalanceAfterNano:final.toString(),attachmentNano:attachment.toString(),
  walletTransactionFeesNano:sourceFees.toString(),remainingForwardFeesNano:forwardRemainder.toString(),modeledSenderFeesNano:(sourceFees+forwardRemainder).toString(),
  modeledSenderDebitNano:debit.toString(),minterFeesFromAttachmentNano:minterFees.toString(),minterBalanceAfterNano:minter.account_state_after.balance,
  totalNetworkFeesNano:(sourceFees+forwardRemainder+minterFees).toString(),ceilingNano:'120000000',fitsReviewCeiling:debit<=120000000n,ceilingMarginNano:(120000000n-debit).toString(),hardCapEnforced:false};
}
module.exports={analyze};
