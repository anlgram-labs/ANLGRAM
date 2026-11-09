import {Buffer} from 'node:buffer';
import {Address,Cell,beginCell,external,internal,loadStateInit,storeMessage,storeStateInit} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton/dist/wallets/v5r1/WalletContractV5R1.js';
import intent from './minter-intent.json' with {type:'json'};

// No caller-controlled BOC, signing callback, key, seqno, amount or destination.
// This intentionally INVALID all-zero signature is usable ONLY by an emulator
// with signature checks skipped. This module has no broadcast capability.
export async function minterEmulation(deadline){
 const wallet=WalletContractV5R1.create({publicKey:Buffer.from(intent.publicKey,'hex'),walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
 if(wallet.address.toRawString()!==intent.operator||beginCell().store(storeStateInit(wallet.init)).endCell().hash().toString('hex')!==Cell.fromBase64(intent.walletStateInit).hash().toString('hex'))throw Error('V5 identity mismatch');
 const m=intent.message,to=Address.parseFriendly(m.address),validUntil=deadline??Math.floor(Date.now()/1000)+90;
 if(!Number.isSafeInteger(validUntil)||validUntil<=Math.floor(Date.now()/1000)||validUntil>Math.floor(Date.now()/1000)+120)throw Error('Invalid emulation expiry');
 if(!to.isTestOnly||m.amount!=='100000000')throw Error('Minter intent mismatch');
 const body=await wallet.createTransfer({seqno:0,timeout:validUntil,authType:'external',sendMode:3,messages:[internal({to:to.address,value:BigInt(m.amount),bounce:to.isBounceable,init:loadStateInit(Cell.fromBase64(m.stateInit).beginParse()),body:Cell.fromBase64(m.payload)})],signer:async()=>Buffer.alloc(64)});
 const s=body.beginParse();if(s.loadUint(32)!==0x7369676e||s.loadInt(32)!==intent.walletId||s.loadUint(32)!==validUntil||s.loadUint(32)!==0)throw Error('V5 emulation context mismatch');
 return {request:{boc:beginCell().store(storeMessage(external({to:wallet.address,init:wallet.init,body}))).endCell().toBoc().toString('base64'),ignore_chksig:true,include_code_data:true,with_actions:false},bodyHash:body.hash().toString('hex'),validUntil};
}
