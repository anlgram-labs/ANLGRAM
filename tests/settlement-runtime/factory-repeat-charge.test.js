'use strict';
// F-01 audit: a repeated CREATE_JETTON request (same creator, query, supply, metadata)
// resolves to the already-bootstrapped minter. The child rejects with exit 73 and the
// deploy message bounces. This test records who ends up holding the 0.105 TON budget
// and whether the treasury fee is still charged.
const test = require('node:test');
const assert = require('node:assert/strict');
const {beginCell, Cell, contractAddress} = require('@ton/core');
const {Blockchain} = require('@ton/sandbox');
const artifact = require('../../minter-contract/build/anlgram-factory.compiled.json');

const CREATE = 0x4e585a91;
const SUPPLY = 1000000000000000000n;
const ATTACH = 220000000n;

function create(creator, query) {
  const body = beginCell().storeUint(CREATE, 32).storeUint(query, 64);
  for (const text of ['Factory test', 'FT', 'Sandbox', 'image']) {
    body.storeRef(beginCell().storeStringTail(text).endCell());
  }
  return body.storeUint(9, 8).storeCoins(SUPPLY).storeAddress(creator).endCell();
}

test('F-01 repeated request: creator funds must not be retained by the Factory or taxed', async () => {
  const chain = await Blockchain.create();
  const creator = await chain.treasury('c');
  const admin = await chain.treasury('a');
  const treasury = await chain.treasury('t');
  const init = {code: Cell.fromBase64(artifact.hex), data: beginCell().storeAddress(admin.address)
    .storeAddress(treasury.address).storeUint(70, 16).storeBit(false)
    .storeRef(Cell.fromBase64(artifact.childMinter.codeBocBase64))
    .storeRef(Cell.fromBase64(artifact.jettonWallet.codeBocBase64)).endCell()};
  const factory = contractAddress(0, init);
  await admin.send({to: factory, init, value: 100000000n});
  const body = create(creator.address, 5);

  const treasuryStart = await treasury.getBalance();
  await creator.send({to: factory, value: ATTACH, body});
  const paid = await treasury.getBalance() - treasuryStart;
  assert(paid <= 73500000n && paid > 73400000n, 'first creation pays the fixed fee: ' + paid);
  const factoryBefore = (await chain.getContract(factory)).balance;
  const treasuryBefore = await treasury.getBalance();
  const creatorBefore = await creator.getBalance();

  const repeated = await creator.send({to: factory, value: ATTACH, body});
  const factoryAfter = (await chain.getContract(factory)).balance;
  const treasuryAfter = await treasury.getBalance();
  const creatorAfter = await creator.getBalance();
  const bounced = repeated.transactions.filter(tx => tx.inMessage?.info.type === 'internal'
    && tx.inMessage.info.bounced && tx.inMessage.info.dest?.equals(factory));
  console.log(JSON.stringify({
    bouncedToFactory: bounced.length,
    factoryRetained: String(factoryAfter - factoryBefore),
    treasuryFee: String(treasuryAfter - treasuryBefore),
    creatorNetCost: String(creatorBefore - creatorAfter)}));

  assert.equal(factoryAfter - factoryBefore < 1000000n, true, 'Factory retained bounced creator funds');
  assert.equal(treasuryAfter - treasuryBefore, 0n, 'treasury fee charged for a rejected repeat');
});
