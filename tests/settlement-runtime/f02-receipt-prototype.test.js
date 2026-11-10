'use strict';
// Captured STON.fi v2.2 TVM code, local Sandbox only. Provider is a treasury,
// not the production Curve; the receipt prototype has no financial actions.
const test = require('node:test'), assert = require('node:assert/strict');
const core = require('@ton/core'), {internal} = require('@ton/sandbox');
const {fixture} = require('./lp-locker-v3-support');
const ston = require('../../minter-contract/scripts/stonfi-v22-addresses');
const wire = require('../../minter-contract/scripts/stonfi-lp-v2-wire');
const artifact = require('../../minter-contract/build/anlgram-f02-receipt-prototype.compiled.json');
const b = core.beginCell, code = core.Cell.fromBase64(artifact.codeBocBase64);
const exits = r => r.transactions.map(t => t.description.computePhase?.exitCode);
const state = async (f, addr) => {
  const s = (await f.chain.runGetMethod(addr, 'get_f02_receipt')).stackReader;
  return {seen:s.readBigNumber(), amount:s.readBigNumber(), pool:s.readAddress(), wallet:s.readAddress()};
};
test('isolated LP receipt authenticates captured wallet, records actual custody once, never finalizes or pays out', async () => {
  const f = await fixture();
  const cfg = b().storeUint(77,64)
    .storeRef(b().storeAddress(f.router).storeAddress(f.wallet(f.router)).storeAddress(f.ptonWallet).endCell())
    .storeRef(b().storeAddress(f.owner.address).endCell()).storeRef(ston.profileCell(core)).endCell();
  const init = {code, data:b().storeRef(cfg).storeCoins(0).endCell()};
  const address = core.contractAddress(0,init);
  const otherInit = {code, data:b().storeRef(b().storeUint(78,64)
    .storeRef(b().storeAddress(f.router).storeAddress(f.wallet(f.router)).storeAddress(f.ptonWallet).endCell())
    .storeRef(b().storeAddress(f.owner.address).endCell()).storeRef(ston.profileCell(core)).endCell()).storeCoins(0).endCell()};
  assert(!core.contractAddress(0,otherInit).equals(address));
  await f.owner.send({to:address,value:100000000n,init,body:b().endCell()});
  const before = await state(f,address);
  assert.equal(before.amount,0n); assert(before.pool.equals(f.vault.pool));
  const tag = b().storeUint(0x414c5632,32).storeUint(77,64).endCell();
  const forged = b().storeUint(0x7362d09c,32).storeUint(77,64).storeCoins(1)
    .storeAddress(f.owner.address).storeBit(true).storeRef(tag).endCell();
  assert(exits(await f.other.send({to:address,value:100000000n,body:forged})).includes(401));
  // Sender spoofing is possible only in this test harness; these messages test
  // parsing after wallet authentication, not whether the wallet emits them.
  const inject = body => f.chain.sendMessage(internal({from:before.wallet,to:address,value:50000000n,body,bounce:true}));
  const wrongProvider = b().storeUint(0x7362d09c,32).storeUint(77,64).storeCoins(1)
    .storeAddress(f.other.address).storeBit(true).storeRef(tag).endCell();
  const wrongQuery = b().storeUint(0x7362d09c,32).storeUint(78,64).storeCoins(1)
    .storeAddress(f.owner.address).storeBit(true).storeRef(tag).endCell();
  assert(exits(await inject(wrongProvider)).includes(401));
  assert(exits(await inject(wrongQuery)).includes(409));
  assert.equal((await state(f,address)).amount,0n);
  const deposit = wire.build(core,{owner:f.owner.address,router:f.router,vault:address,
    tokenWallet:f.wallet(f.owner.address),routerTokenWallet:f.wallet(f.router),ptonWallet:f.ptonWallet,
    operationId:77n,tokenUnits:200000000000000000n,tonNano:500000000000n,
    deadline:f.chain.now+1800,minimumLpUnits:1n});
  await f.owner.send({...deposit.messages[0],bounce:true});
  assert.equal((await state(f,address)).amount,0n);
  const result = await f.owner.send({...deposit.messages[1],bounce:true});
  const after = await state(f,address);
  assert(after.amount > 0n); assert.equal(after.seen,-1n);
  const expected = (await f.chain.runGetMethod(after.pool,'get_wallet_address',
    [{type:'slice',cell:b().storeAddress(address).endCell()}])).stackReader.readAddress();
  assert(after.wallet.equals(expected));
  const balance = (await f.chain.runGetMethod(after.wallet,'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(balance,after.amount);
  const notification = result.transactions.find(t => t.inMessage?.info.dest.equals(address)
    && t.inMessage?.info.src?.equals(after.wallet) && t.inMessage.body.beginParse().preloadUint(32) === 0x7362d09c);
  assert(notification, 'recipient LP wallet sends the notification');
  // Sandbox injection repeats the genuine message to test replay handling; it is not a real wallet action.
  const replay = await f.chain.sendMessage(internal({from:after.wallet,to:address,value:50000000n,body:notification.inMessage.body,bounce:true}));
  assert(exits(replay).includes(409)); assert.equal((await state(f,address)).amount,after.amount);
  const finalize = b().storeUint(0x414e4c43,32).storeUint(77,64).endCell();
  assert(exits(await f.owner.send({to:address,value:50000000n,body:finalize})).includes(401));
  assert.equal((await state(f,address)).amount,after.amount);
});
