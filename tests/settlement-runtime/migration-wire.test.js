'use strict';
// Executes the real migration router, comparing outbound cells to a reference
// generated with official SDK 2.7.0 DEX.v2_1 and pTON.v2_1 builders. It does
// NOT deploy/emulate external DEX contracts or claim successful LP issuance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('@ton/core');
const { Blockchain, createShardAccount } = require('@ton/sandbox');
const { compileFunc } = require('@ton-community/func-js');
const a = n => new core.Address(0,Buffer.alloc(32,n));
test('actual migration output matches pinned official v2.1 SDK cells',async()=>{
  const dir=path.resolve(__dirname,'../../minter-contract/contracts');
  const compile=async name=>{const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);};
  const [code,wallet]=await Promise.all(['anlgram-migration-router','jetton-wallet'].map(compile));
  const chain=await Blockchain.create();chain.now=1700000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
  const [admin,curve,master,locker,migrator,dex,pton,lp,ptonWallet]=[1,2,3,4,5,6,7,8,9].map(a);
  const tokenWallet=core.contractAddress(0,{code:wallet,data:core.beginCell().storeCoins(0).storeAddress(dex).storeAddress(master).storeRef(wallet).endCell()});
  const data=core.beginCell().storeBit(0).storeAddress(curve).storeAddress(locker).storeAddress(dex)
    .storeRef(core.beginCell().storeAddress(master).storeAddress(pton).storeCoins(500000000000n).storeCoins(200000000000000000n).storeAddress(admin).endCell())
    .storeRef(core.beginCell().storeAddress(lp).storeAddress(ptonWallet).storeCoins(0).storeCoins(0).storeRef(wallet).endCell()).endCell();
  await chain.setShardAccount(migrator,createShardAccount({address:migrator,code,data,balance:501000000000n}));
  const body=core.beginCell().storeUint(0x414e4c37,32).storeUint(1,64).storeAddress(tokenWallet).storeAddress(lp).storeAddress(ptonWallet).endCell();
  const message=core.internal({to:migrator,value:400000000n,body});message.info.src=admin;
  const result=await chain.sendMessage(message);
  const tx=result.transactions[0];assert.equal(tx.description.aborted,false);
  const out=Array.from(tx.outMessages.values());assert.equal(out.length,3);
  const ownWallet=core.contractAddress(0,{code:wallet,data:core.beginCell().storeCoins(0).storeAddress(migrator).storeAddress(master).storeRef(wallet).endCell()});
  const token=out.find(m=>m.info.dest.equals(ownWallet)).body.beginParse();
  assert.equal(token.loadUint(32),0x0f8a7ea5);assert.equal(token.loadUintBig(64),1n);assert.equal(token.loadCoins(),200000000000000000n);
  assert(token.loadAddress().equals(dex));assert(token.loadAddress().equals(migrator));assert.equal(token.loadBit(),false);assert.equal(token.loadCoins(),150000000n);assert.equal(token.loadBit(),true);
  const tokenPayload=token.loadRef();
  const tonPayload=out.find(m=>m.info.dest.equals(ptonWallet)).body;
  if(process.env.ANLGRAM_GENERATE_SDK_FIXTURE==='1'){
    // Explicit generation mode only; requires temporary official SDK install.
    const {DEX,pTON}=require('@ston-fi/sdk');
    const router=new DEX.v2_1.Router(dex);const proxy=new pTON.v2_1(pton);
    const params={refundAddress:migrator,excessesAddress:migrator,deadline:1700001800,minLpOut:1n,receiverAddress:locker,bothPositive:true,dexCustomPayloadForwardGasAmount:20000000n};
    const refToken=await router.createProvideLiquidityBody({...params,routerWalletAddress:ptonWallet});
    const refOther=await router.createProvideLiquidityBody({...params,routerWalletAddress:tokenWallet});
    const refTon=await proxy.createTonTransferBody({queryId:1n,tonAmount:500000000000n,refundAddress:migrator,forwardPayload:refOther});
    fs.writeFileSync(path.join(__dirname,'stonfi-v21-wire-fixture.json'),JSON.stringify({sdk:'@ston-fi/sdk@2.7.0',source:'https://github.com/ston-fi/sdk',scope:'serialization only; synthetic addresses',walletCodeHash:wallet.hash().toString('hex'),tokenPayload:refToken.toBoc().toString('base64'),tonPayload:refTon.toBoc().toString('base64')},null,2));
  }
  const ref=JSON.parse(fs.readFileSync(path.join(__dirname,'stonfi-v21-wire-fixture.json'),'utf8'));
  assert.equal(wallet.hash().toString('hex'),ref.walletCodeHash);
  assert(tokenPayload.equals(core.Cell.fromBase64(ref.tokenPayload)));
  assert(tonPayload.equals(core.Cell.fromBase64(ref.tonPayload)));
});
