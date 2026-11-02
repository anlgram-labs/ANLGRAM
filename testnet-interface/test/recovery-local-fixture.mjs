import {createRequire} from 'node:module';
import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {pinned,RECOVERY,operationPolicy} from '../recovery/policy.mjs';
const require=createRequire(import.meta.url),{Blockchain}=require('../../tests/settlement-runtime/node_modules/@ton/sandbox'),sandboxCore=require('../../tests/settlement-runtime/node_modules/@ton/core'),{keyPairFromSeed}=require('../../minter-contract/node_modules/@ton/crypto');
export async function makeLocalReceipt(){
 const key=keyPairFromSeed(Buffer.alloc(32,0x61)),w=WalletContractV5R1.create({publicKey:key.publicKey,walletId:{networkGlobalId:-3}}),chain=await Blockchain.create();chain.now=Math.floor(Date.now()/1000);
 const address=sandboxCore.Address.parse(w.address.toRawString()),funded=await chain.treasury('local-recovery-funding');await funded.send({to:w.address.toString(),value:2000000000n,bounce:false});
 async function send(seqno,messages,timeout=chain.now+90){const body=await w.createTransfer({seqno,secretKey:key.secretKey,timeout,sendMode:3,messages});const external=core.beginCell().store(core.storeMessage(core.external({to:w.address,init:seqno===0?w.init:null,body}))).endCell();return chain.sendMessage(sandboxCore.Cell.fromBase64(external.toBoc().toString('base64')));}
 await send(0,[core.internal({to:funded.address.toString(),value:10000000n,bounce:false})]);
 const before=await chain.getContract(address),beforeAccountCell=sandboxCore.beginCell().storeBit(true).store(sandboxCore.storeAccount(before.account.account)).endCell(),beforeCode=before.accountState.state.code,beforeData=before.accountState.state.data,balanceBefore=before.balance,beforeLastTransactionHash=before.account.lastTransactionHash.toString(16).padStart(64,'0');
 const context={...pinned,operator:w.address.toRawString(),publicKey:key.publicKey.toString('hex')};
 const policy=operationPolicy(context,RECOVERY,1),m=policy.intent.message,validUntil=chain.now+90;
 const sent=await send(1,[core.internal({to:w.address,value:BigInt(m.amount),bounce:false,body:core.Cell.fromBase64(m.payload)})],validUntil);
 const after=await chain.getContract(address),afterAccount=after.account,txs=sent.transactions.filter(t=>t.inMessage?.info.dest?.equals(w.address));
 const accountCell=a=>sandboxCore.beginCell().storeBit(true).store(sandboxCore.storeAccount(a.account)).endCell();
 return{chain,w,key,context,policy,validUntil,txs,beforeCode,beforeData,balanceBefore,beforeLastTransactionHash,afterCode:after.accountState.state.code,afterData:after.accountState.state.data,balanceAfter:after.balance,afterAccountCell:accountCell(afterAccount),beforeAccountCell,send,core:sandboxCore};
}
export function normalizeLocalBundle(x){
 const {core:c}=x,txs=x.txs;
 const rows=Object.fromEntries(txs.map((t,i)=>{
  const raw=c.beginCell().store(c.storeTransaction(t)).endCell();
  const body=t.inMessage.body,source=t.inMessage.info.type==='internal'?t.inMessage.info.src.toRawString():null;
  return[raw.hash().toString('base64'),{raw:raw.toBoc().toString('base64'),hash:raw.hash().toString('base64'),account:x.context.operator,lt:t.lt.toString(),now:t.now,emulated:false,finality:'finalized',description:{aborted:t.description.aborted,compute_ph:{success:t.description.computePhase.success,exit_code:t.description.computePhase.exitCode},action:{success:t.description.actionPhase.success,result_code:t.description.actionPhase.resultCode}},orig_status:t.oldStatus,end_status:t.endStatus,total_fees:t.totalFees.coins.toString(),in_msg:{source,destination:x.context.operator,init_state:null,message_content:{body:body.toBoc().toString('base64'),hash:body.hash().toString('base64')}},out_msgs:Array.from(t.outMessages.values()).map(m=>({})),account_state_before:{balance:i===0?x.balanceBefore.toString():'0',data_hash:(i===0?x.beforeData:x.afterData).hash().toString('base64')},account_state_after:{balance:i===1?x.balanceAfter.toString():'0',data_hash:x.afterData.hash().toString('base64')}}];
 }));
 const last=Object.values(rows).at(-1),after={provider:'LOCAL_SANDBOX_PRIMARY',network:'-3',state:'active',address:x.context.operator,code:x.afterCode.toBoc().toString('base64'),data:x.afterData.toBoc().toString('base64'),balanceNano:x.balanceAfter.toString(),lastTransactionHash:Buffer.from(last.hash,'base64').toString('hex'),lastTransactionLt:last.lt,block:{seqno:1,rootHash:'a1'.repeat(32),fileHash:'b2'.repeat(32),chainTime:x.chain.now},finality:'finalized',emulated:false};
 return{evidenceOrigin:'LOCAL_TVM_NOT_ONCHAIN',validUntil:x.validUntil,beforeAccountBoc:x.beforeAccountCell.toBoc().toString('base64'),afterAccountBoc:x.afterAccountCell.toBoc().toString('base64'),trace:{is_incomplete:false,trace_info:{trace_state:'complete',pending_messages:0},transactions:rows},after,independent:{...structuredClone(after),provider:'LOCAL_SANDBOX_SECONDARY'}};
}
