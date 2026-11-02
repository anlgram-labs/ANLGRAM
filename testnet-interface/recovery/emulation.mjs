import {WalletContractV5R1} from '@ton/ton/dist/wallets/v5r1/WalletContractV5R1.js';
import {Address,Cell,beginCell,internal,external,storeMessage,loadStateInit} from '@ton/core';
import {pinned,operationPolicy,hash} from './policy.mjs';
// Explicitly read-only construction: invalid zero signature, never a valid BOC.
export async function buildRecoveryEmulation(kind,seqno,validUntil,context=pinned){
 const p=operationPolicy(context,kind,seqno);p.validateIntent({network:'-3',from:context.operator,validUntil,messages:[p.intent.message]});
 const w=WalletContractV5R1.create({publicKey:Buffer.from(context.publicKey,'hex'),walletId:{networkGlobalId:-3}});
 if(w.address.toRawString()!==context.operator||w.init.code.hash().toString('hex')!==context.walletCodeHash)throw Error('Wrong V5 operator');
 const m=p.intent.message,to=Address.parseFriendly(m.address);if(!to.isTestOnly)throw Error('Testnet destination required');
 const body=await w.createTransfer({seqno,timeout:validUntil,authType:'external',sendMode:3,messages:[internal({to:to.address,value:BigInt(m.amount),bounce:to.isBounceable,body:Cell.fromBase64(m.payload),...(m.stateInit?{init:loadStateInit(Cell.fromBase64(m.stateInit).beginParse())}:{})})],signer:async()=>Buffer.alloc(64)});
 return{scope:'INVALID_SIGNATURE_EMULATION_ONLY',network:'-3',bodyHash:body.hash().toString('hex'),boc:beginCell().store(storeMessage(external({to:w.address,init:null,body}))).endCell().toBoc().toString('base64'),financialSigningEnabled:false,signatureAllZero:true};
}
