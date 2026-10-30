'use strict';
// Actual public Testnet account bytecode/data replayed OFFLINE. Not live DEX
// execution, not a block proof, and never authority to deploy or spend funds.
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('@ton/core');
const {setup,snap}=require('./stonfi-snapshot-support');
test('public STON.fi Router and pTON library/code snapshots load and execute real getters offline',async()=>{
 assert.equal(snap.network,'-3');const chain=await setup();const router=core.Address.parse(snap.accounts.router.address);
 const version=(await chain.runGetMethod(router,'get_router_version')).stackReader;
 assert.equal(version.readBigNumber(),2n);assert.equal(version.readBigNumber(),2n);
 const data=(await chain.runGetMethod(router,'get_router_data')).stackReader;
 data.readBigNumber();const type=data.readString();assert.equal(type,'constant_product');assert.equal(data.readBoolean(),false);
 const pton=(await chain.runGetMethod(core.Address.parse(snap.accounts.pton.address),'get_jetton_data')).stackReader;
 assert(pton.readBigNumber()>=0n);
});

