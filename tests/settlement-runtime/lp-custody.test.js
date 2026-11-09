'use strict';
// Explicit unit fixtures for the verification algorithm, not STON.fi contracts
// or live chain evidence. No fake DEX is used to claim successful migration.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const { verifyLpCustody } = require('../../minter-contract/verify-lp-custody');
const roles = ['router','pool','lpWallet','locker','tokenMaster','ptonMaster','curve','migrationRouter'];
const addr = n => new core.Address(0, Buffer.alloc(32,n));
const a = address => ({ type: 'slice', cell: core.beginCell().storeAddress(address).endCell() });
const i = value => ({ type: 'int', value: BigInt(value) });
function fixture() {
  const addresses = Object.fromEntries(roles.map((r,n) => [r,addr(n+1)]));
  const code = Object.fromEntries(roles.map((r,n) => [r,core.beginCell().storeUint(n,8).endCell()]));
  const pins = { chain:'-3', minimumLp:'100' };
  for (const r of roles) pins[r] = { address:addresses[r].toRawString(), codeHash:code[r].hash().toString('hex') };
  const tuples = {
    tokenMaster: { get_wallet_address:[a(addr(20))] }, ptonMaster:{ get_wallet_address:[a(addr(21))] },
    router: { get_pool_address:[a(addresses.pool)] },
    pool: { get_pool_data:[i(0),a(addresses.router),i(1000),i(500),i(200),a(addr(20)),a(addr(21))],
      get_wallet_address:[a(addresses.lpWallet)], get_jetton_data:[i(1000),i(-1),a(addresses.router),{type:'cell',cell:core.Cell.EMPTY},{type:'cell',cell:code.lpWallet}] },
    lpWallet: { get_wallet_data:[i(100),a(addresses.locker),a(addresses.pool),{type:'cell',cell:code.lpWallet}] },
    locker: { get_lock_data:[i(1),i(0xffffffffffffffffn),i(100),i(1),a(addresses.pool),a(addresses.curve),a(addresses.lpWallet),a(addresses.migrationRouter)] },
  };
  const reader = { chain:'-3',snapshotId:'local-unit-snapshot',
    getAccount:async address => { const role = roles.find(r=>addresses[r].equals(address)); return { active:true,code:code[role],snapshotId:reader.snapshotId }; },
    runGetMethod:async (address,method,args) => {
      const role = roles.find(r=>addresses[r].equals(address));
      if (method==='get_pool_address') { assert(args[0].cell.beginParse().loadAddress().equals(addr(20))); assert(args[1].cell.beginParse().loadAddress().equals(addr(21))); }
      return { exitCode:0, stack:tuples[role][method], snapshotId:reader.snapshotId };
    } };
  return {pins,reader,tuples,addresses,code};
}
test('complete pinned anchored evidence proves only read-only custody snapshot',async()=>{
  const f=fixture(); const r=await verifyLpCustody(f.pins,f.reader,core); assert.equal(r.status,'VERIFIED_SNAPSHOT'); assert.equal(r.scope,'read_only_lp_custody'); assert.equal(r.balance,'100');
});
const mutations = {
  'missing trusted pins':f=>{delete f.pins.router.codeHash;},
  'wrong network':f=>{f.reader.chain='-239';},
  'substituted pool':f=>{f.tuples.router.get_pool_address=[a(addr(99))];},
  'wrong token pair':f=>{f.tuples.pool.get_pool_data[5]=a(addr(99));},
  'wrong LP derivation':f=>{f.tuples.pool.get_wallet_address=[a(addr(99))];},
  'wrong LP supply':f=>{f.tuples.pool.get_jetton_data[0]=i(999);},
  'wrong LP admin':f=>{f.tuples.pool.get_jetton_data[2]=a(addr(99));},
  'wrong owner':f=>{f.tuples.lpWallet.get_wallet_data[1]=a(addr(99));},
  'wrong master':f=>{f.tuples.lpWallet.get_wallet_data[2]=a(addr(99));},
  'forged wallet code':f=>{f.code.lpWallet=core.beginCell().storeUint(99,8).endCell();},
  'unbacked lock amount':f=>{f.tuples.lpWallet.get_wallet_data[0]=i(99);},
  'withdrawable lock':f=>{f.tuples.locker.get_lock_data[1]=i(0);},
  'wrong curve':f=>{f.tuples.locker.get_lock_data[5]=a(addr(99));},
  'wrong migration router':f=>{f.tuples.locker.get_lock_data[7]=a(addr(99));},
  'missing minimum LP reconciliation':f=>{delete f.pins.minimumLp;},
  'numeric balance instead of bigint':f=>{f.tuples.lpWallet.get_wallet_data[0]={type:'int',value:100};},
  'mixed snapshots':f=>{f.reader.getAccount=async()=>({active:true,code:f.code.router,snapshotId:'other'});},
  'getter failure':f=>{f.reader.runGetMethod=async()=>({exitCode:9,stack:[],snapshotId:f.reader.snapshotId});},
};
for(const [name,change] of Object.entries(mutations))test(name+' fails closed',async()=>{const f=fixture();change(f);assert.equal((await verifyLpCustody(f.pins,f.reader,core)).status,'UNVERIFIED');});
