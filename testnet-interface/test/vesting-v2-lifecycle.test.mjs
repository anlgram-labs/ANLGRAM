import {Cell as PublicCell} from '@ton/core';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareVesting} from '../projects/distribution.mjs';
import {createDraft} from '../wizard/model.mjs';

const require=createRequire(new URL('../../tests/settlement-runtime/package.json',import.meta.url));
const {ready,exit}=require('./one-shot-dispatch-support');
const {createShardAccount}=require('@ton/sandbox');
const core=require('@ton/core');
const body=(op,q)=>core.beginCell().storeUint(op,32).storeUint(q,64);
const opcode=message=>message?.body.bits.length>=32?message.body.beginParse().loadUint(32):null;

test('source-compiled creation, trading, graduation and DEX custody keep terminal settlement pending while Vesting V2 reconciles',async()=>{
  execFileSync(process.execPath,[fileURLToPath(new URL('../../minter-contract/compile-vesting-v2.js',import.meta.url)),'--check']);
  const f=await ready({percent:50,duration:'days180'}), c=f.c;
  await f.fund();
  const migration=await f.execute(await f.authorize());
  assert(exit(migration,c.addresses.migration,0));
  const custody=await f.stage();
  assert.equal(custody[0],5n);
  assert(custody[2]>0n && custody[3]>0n);
  const withdrawal=body(0x414c5633,1n).storeBit(false).storeCoins(custody[3]).endCell();
  assert(exit(await f.send(c.vault.address,withdrawal,150000000n,f.other),c.vault.address,0));
  assert.equal((await f.chain.runGetMethod(c.vault.lpWallet,'get_wallet_data')).stackReader.readBigNumber(),custody[2]);
  assert.deepEqual(await f.stage(),custody);
  assert(exit(await f.send(c.addresses.migration,body(0x414e5d20,77n).endCell(),20000000n),c.addresses.migration,0));
  assert.equal((await f.stage())[0],6n);
  assert(exit(await f.send(c.addresses.migration,body(0x414e4c43,77n).endCell()),c.addresses.migration,414));

  const d=createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  d.metadata.creator=f.owner.address.toRawString();
  Object.assign(d.vesting,{enabled:true,beneficiary:f.other.address.toRawString(),amount:'0.000004',
    startDate:new Date(f.chain.now*1000).toISOString().slice(0,10),cliffMonths:'3',durationMonths:'12'});
  const plan=prepareVesting(d,{master:c.addresses.minter.toRawString(),walletCode:PublicCell.fromBase64(c.wallet.toBoc().toString('base64')),seed:'11'.repeat(32)});
  assert.equal(plan.settlementVersion,2);
  assert.equal(plan.financialSigningEnabled,false);
  const vest=core.Address.parse(plan.raw), init=core.loadStateInit(core.Cell.fromBase64(plan.stateInit).beginParse());
  await f.owner.send({to:vest,init,value:100000000n});
  assert(exit(await f.send(f.buyer,core.Cell.fromBase64(plan.deposit.payload),BigInt(plan.deposit.amount)),vest,0));
  const derived=owner=>({code:c.wallet,data:core.beginCell().storeCoins(0).storeAddress(owner)
    .storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});
  const vWallet=core.contractAddress(0,derived(vest)), rInit=derived(f.other.address), rWallet=core.contractAddress(0,rInit);
  await f.owner.send({to:rWallet,init:rInit,value:20000000n});
  const balance=async a=>(await f.chain.runGetMethod(a,'get_wallet_data')).stackReader.readBigNumber();
  const claimed=async()=>(await f.chain.runGetMethod(vest,'get_vesting_data')).stack[1].value;
  const pending=async()=>(await f.chain.runGetMethod(vest,'get_pending_claim')).stack.map(x=>x.value);
  const claim=q=>f.send(vest,body(0x414e4c76,q).endCell(),100000000n,f.other);
  assert.equal(await balance(vWallet),4000n);
  assert(exit(await claim(1n),vest,402));
  f.chain.now=plan.schedule.cliffTimestamp;
  assert(exit(await claim(1n),vest,0));
  assert.equal(await claimed(),1000n);
  assert.equal(await balance(rWallet),1000n);
  assert.equal(await balance(vWallet),3000n);
  f.chain.now=plan.schedule.endTimestamp;
  const recipient=await f.chain.getContract(rWallet);
  const saved=recipient.account;
  const frozen=createShardAccount({address:rWallet,code:core.Cell.EMPTY,data:core.Cell.EMPTY,balance:recipient.balance});
  frozen.account.storage.state={type:'frozen',stateHash:1n};
  await f.chain.setShardAccount(rWallet,frozen);
  const rejected=await claim(2n);
  assert(rejected.transactions.some(t=>t.inMessage?.info.dest?.equals(rWallet)&&t.description.aborted));
  assert.equal(await claimed(),1000n);
  assert.deepEqual(await pending(),[2n,0n]);
  assert.equal(await balance(vWallet),3000n);
  assert(exit(await claim(2n),vest,409));
  await f.chain.setShardAccount(rWallet,saved);

  const claimMessage=q=>{
    const request=core.internal({to:vest,value:100000000n,bounce:true,body:body(0x414e4c76,q).endCell()});
    return core.external({to:f.other.address,body:f.other.createTransfer({messages:[request]})});
  };
  const intercept=async (q,destination,op)=>{
    for await (const tx of await f.chain.sendMessageIter(claimMessage(q),{allowParallel:true})) {
      const message=[...tx.outMessages.values()].find(m=>m.info.dest.equals(destination)&&opcode(m)===op);
      if(message) return message;
    }
  };
  const firstHop=f.chain.snapshot();
  const unsent=await intercept(3n,vWallet,0x414e5301);
  assert(unsent);
  assert.deepEqual(await pending(),[3n,3000n]);
  assert.equal(await balance(vWallet),3000n);
  assert(exit(await f.send(vest,body(0x414e5305,3n).endCell(),100000000n,f.other),vest,0));
  assert.equal(await claimed(),4000n);
  await f.chain.sendMessage(unsent);
  assert.equal(await balance(rWallet),4000n);
  await f.chain.loadFrom(firstHop);

  // Discard only the final owner receipt from an isolated message queue.
  const delayed=await intercept(3n,vest,0x414e5304);
  assert(delayed);
  assert.deepEqual(await pending(),[3n,3000n]);
  assert.equal(await claimed(),1000n);
  assert.equal(await balance(vWallet),0n);
  assert.equal(await balance(rWallet),4000n);
  assert(exit(await claim(4n),vest,409));
  assert(exit(await f.send(vest,delayed.body,50000000n,f.other),vest,403));
  assert(exit(await f.send(vest,body(0x414e5305,3n).endCell(),100000000n,f.other),vest,0));
  assert.deepEqual(await pending(),[3n,0n]);
  assert.equal(await claimed(),4000n);
  await f.chain.sendMessage(delayed);
  assert.equal(await claimed(),4000n);
  assert.equal(await balance(rWallet),4000n);
});
