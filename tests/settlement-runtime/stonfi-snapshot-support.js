'use strict';
const assert=require('node:assert/strict');
const core=require('@ton/core');const {Blockchain,createShardAccount}=require('@ton/sandbox');
const snap=require('./fixtures/stonfi-testnet-public-snapshot.json');
const decode=hex=>core.Cell.fromBoc(Buffer.from(hex,'hex'))[0];
async function setup(snapshot=snap){
 const chain=await Blockchain.create();chain.now=Math.floor(Date.parse(snapshot.observedUtc)/1000);
 chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
 const libraries=core.Dictionary.empty(core.Dictionary.Keys.Buffer(32),core.Dictionary.Values.Cell());
 for(const[hash,value]of Object.entries(snapshot.libraries)){
  const code=decode(value.code);assert.equal(code.hash().toString('hex'),hash);libraries.set(Buffer.from(hash,'hex'),code);
 }
 chain.libs=core.beginCell().storeDictDirect(libraries).endCell();
 for(const a of Object.values(snapshot.accounts)){
  const code=decode(a.code),data=decode(a.data);
  assert.equal(code.hash().toString('hex'),a.codeCellHash);assert.equal(data.hash().toString('hex'),a.dataCellHash);
  await chain.setShardAccount(core.Address.parse(a.address),createShardAccount({address:core.Address.parse(a.address),code,data,balance:BigInt(a.balance)}));
 }
 return chain;
}

module.exports={setup,decode,snap};
