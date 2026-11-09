'use strict';
// Fresh local deployment/mint/activation/trading from real StateInit cells.
// Sandbox treasuries are test actors, not the user's real operator wallet.
const test=require('node:test'),assert=require('node:assert/strict');
const {Blockchain}=require('@ton/sandbox');const core=require('@ton/core');
const {beginCell}=core;const {buildCandidate,manifest}=require('../../minter-contract/prepare-settlement-testnet');
test('acyclic candidate actually deploys, mints, renounces, activates, buys and sells in local TVM',async()=>{
 const chain=await Blockchain.create();chain.now=1800000000;
 const admin=await chain.treasury('fresh-operator'),buyer=await chain.treasury('fresh-buyer');
 const c=buildCandidate(admin.address.toRawString(),core);
 for(const[role,init]of Object.entries(c.states)){
  const r=await admin.send({to:c.addresses[role],init,value:100000000n,bounce:false,body:beginCell().endCell()});
  assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(c.addresses[role])&&t.endStatus==='active'),role);
 }
 const curveState=async()=>(await chain.runGetMethod(c.addresses.curve,'get_curve_state')).stack;
 assert.equal((await curveState())[0].value,0n);
 const downgrade=await admin.send({to:c.addresses.curve,value:100000000n,bounce:true,
  body:beginCell().storeUint(0x414e4c01,32).storeUint(0,64).storeAddress(c.addresses.minter).storeAddress(c.curveWallet)
   .storeRef(beginCell().storeAddress(c.dex).storeAddress(c.addresses.guard).storeAddress(c.addresses.migration).endCell())
   .storeRef(beginCell().endCell()).endCell()});
 assert(downgrade.transactions.some(t=>t.description.computePhase?.exitCode===408));
 assert.equal((await curveState())[0].value,0n,'admin cannot downgrade the genesis wallet/receipt protocol');
 const initialized=await admin.send({to:c.addresses.curve,value:100000000n,bounce:true,
  body:beginCell().storeUint(0x414e4c01,32).storeUint(1,64).storeAddress(c.addresses.minter).storeAddress(c.curveWallet)
   .storeRef(beginCell().storeAddress(c.dex).storeAddress(c.addresses.guard).storeAddress(c.addresses.migration).endCell()).storeRef(c.wallet).endCell()});
 assert.equal((await curveState())[0].value,1n);assert(initialized.transactions.length>1);
 const internalMint=beginCell().storeUint(0x178d4519,32).storeUint(2,64).storeCoins(1000000000000000000n)
  .storeAddress(null).storeAddress(admin.address).storeCoins(60000000n).storeBit(false).endCell();
 const minted=await admin.send({to:c.addresses.minter,value:200000000n,bounce:true,
  body:beginCell().storeUint(21,32).storeUint(2,64).storeAddress(c.addresses.curve).storeCoins(100000000n).storeRef(internalMint).endCell()});
 assert(minted.transactions.some(t=>t.description.computePhase?.exitCode===73),'existing automatic Curve-admin request is rejected, never fabricated as success');
 assert.equal((await curveState())[0].value,2n);
 assert.equal((await chain.runGetMethod(c.curveWallet,'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
 await admin.send({to:c.addresses.minter,value:50000000n,bounce:true,
  body:beginCell().storeUint(3,32).storeUint(0x414e4c4752454e4fn,64).storeAddress(null).storeAddress(c.addresses.curve).endCell()});
 assert.equal((await curveState())[0].value,3n);
 const mintData=(await chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader;
 assert.equal(mintData.readBigNumber(),1000000000000000000n);mintData.readBigNumber();assert.equal(mintData.readAddressOpt(),null);
 const secondMint=await admin.send({to:c.addresses.minter,value:200000000n,bounce:true,
  body:beginCell().storeUint(21,32).storeUint(3,64).storeAddress(c.addresses.curve).storeCoins(100000000n).storeRef(internalMint).endCell()});
 assert(secondMint.transactions.some(t=>t.description.computePhase?.exitCode===73));
 assert.equal((await chain.runGetMethod(c.addresses.minter,'get_jetton_data')).stackReader.readBigNumber(),1000000000000000000n);
 await buyer.send({to:c.addresses.curve,value:1000000000n,bounce:true,body:beginCell().storeUint(0x5fcc3d14,32).storeUint(10,64).storeCoins(1).endCell()});
 const buyerWallet=(await chain.runGetMethod(c.addresses.minter,'get_wallet_address',[{type:'slice',cell:beginCell().storeAddress(buyer.address).endCell()}])).stackReader.readAddress();
 const amount=(await chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber();assert(amount>0n);
 assert.equal((await curveState())[7].value,0n);
 await buyer.send({to:buyerWallet,value:100000000n,bounce:true,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(11,64).storeCoins(amount)
  .storeAddress(c.addresses.curve).storeAddress(buyer.address).storeBit(false).storeCoins(50000000n).storeBit(true).storeRef(beginCell().storeCoins(0).endCell()).endCell()});
 assert.equal((await chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber(),0n);
 assert.equal((await chain.runGetMethod(c.curveWallet,'get_wallet_data')).stackReader.readBigNumber(),1000000000000000000n);
 const final=await curveState();assert.equal(final[5].value,800000000000000000n);assert.equal(final[7].value,0n);assert(final[6].value>0n);
 assert.equal((await chain.runGetMethod(c.addresses.guard,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 assert.equal(manifest(c).status,'BLOCKED_NOT_AUTHORIZED');
});
