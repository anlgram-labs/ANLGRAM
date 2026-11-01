'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,simulate,codes,intent,p,core}=require('./curve-two-support');
test('fresh Func sources for Curve, deployed minter and settlement wallet match all pinned artifacts',async()=>{assert.equal(Object.keys(await codes()).length,3);});
test('exact source-compiled V5 seqno1 dispatch deploys Curve from StateInit with no minter changes and exact reserve conservation',async()=>{const {summary}=await simulate();assert.equal(summary.internalDeploymentMessages,1);assert.equal(summary.curveState,0);assert.equal(summary.realLiquidityReserveNano,'0');});
test('duplicate original external dispatch is rejected; no second delivery or seqno increment',async()=>{
 const c=await simulate(),before=(await c.chain.getContract(c.curve)).balance;await assert.rejects(c.chain.sendMessage(core.Cell.fromBase64(c.request.boc),{ignoreChksig:true}));assert.equal((await c.chain.getContract(c.curve)).balance,before);assert.equal((await c.chain.runGetMethod(c.source,'seqno')).stackReader.readBigNumber(),2n);
});
test('zero-signature emulation fixture cannot execute with genuine signature verification enabled',async()=>{
 const c=await setup();await assert.rejects(c.chain.sendMessage(core.Cell.fromBase64(c.request.boc)));assert.notEqual((await c.chain.getContract(c.curve)).accountState?.type,'active');assert.equal((await c.chain.runGetMethod(c.source,'seqno')).stackReader.readBigNumber(),1n);
});
test('wrong network wallet ID with matching nonce fails inside the actual V5 TVM',async()=>{
 const c=await setup(),message=core.loadMessage(core.Cell.fromBase64(c.request.boc).beginParse()),s=message.body.beginParse(),opcode=s.loadUint(32);s.loadInt(32);message.body=core.beginCell().storeUint(opcode,32).storeInt(2147483409,32).storeSlice(s).endCell();await assert.rejects(c.chain.sendMessage(message,{ignoreChksig:true}));assert.equal((await c.chain.runGetMethod(c.source,'seqno')).stackReader.readBigNumber(),1n);assert.notEqual((await c.chain.getContract(c.curve)).accountState?.type,'active');
});
test('uninitialized Curve rejects buying; no minted token custody or protected liquidity is fabricated',async()=>{
 const c=await simulate(),buyer=await c.chain.treasury('preactivation-buyer');const r=await buyer.send({to:c.curve,value:1000000000n,bounce:true,body:core.beginCell().storeUint(0x5fcc3d14,32).storeUint(2,64).storeCoins(1).endCell()});assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(c.curve)&&t.description.aborted));assert.equal((await c.chain.runGetMethod(c.curve,'get_curve_state')).stackReader.readBigNumber(),0n);assert.equal((await c.chain.runGetMethod(c.minter,'get_jetton_data')).stackReader.readBigNumber(),0n);
});
test('underfunded operator cannot deploy Curve or draw gas from the existing minter',async()=>{
 const c=await setup({balance:1n}),before=(await c.chain.getContract(c.minter)).balance;await assert.rejects(c.chain.sendMessage(core.Cell.fromBase64(c.request.boc),{ignoreChksig:true}));assert.notEqual((await c.chain.getContract(c.curve)).accountState?.type,'active');assert.equal((await c.chain.getContract(c.minter)).balance,before);
});
