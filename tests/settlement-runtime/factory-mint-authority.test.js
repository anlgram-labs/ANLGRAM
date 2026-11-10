'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {beginCell, Cell, contractAddress} = require('@ton/core');
const {Blockchain, internal} = require('@ton/sandbox');
const artifact = require('../../minter-contract/build/anlgram-factory.compiled.json');
const {factoryArtifacts} = require('../../minter-contract/compile-factory');

const CREATE = 0x4e585a91;
const BOOTSTRAP = 0x414e4642;
const SUPPLY = 1000000000000000000n;
const FEE = 73500000n;
const op = message => message?.body.bits.length >= 32 ? message.body.beginParse().preloadUint(32) : null;
const txAt = (result, address, opcode) => result.transactions.find(tx =>
  tx.inMessage?.info.dest?.equals(address) && op(tx.inMessage) === opcode);
const successful = tx => tx?.description.computePhase?.exitCode === 0 &&
  tx.description.actionPhase?.success && !tx.description.aborted;
const bootstrap = query => beginCell().storeUint(BOOTSTRAP, 32).storeUint(query, 64).endCell();

function create(creator, query) {
  const body = beginCell().storeUint(CREATE, 32).storeUint(query, 64);
  for (const text of ['Factory test', 'FT', 'Sandbox', 'image']) {
    body.storeRef(beginCell().storeStringTail(text).endCell());
  }
  return body.storeUint(9, 8).storeCoins(SUPPLY).storeAddress(creator).endCell();
}

let fixture;
async function setup() {
  fixture ??= (async () => {
    assert.deepEqual((await factoryArtifacts()).artifact, artifact);
    const chain = await Blockchain.create();
    const creator = await chain.treasury('factory-creator');
    const admin = await chain.treasury('factory-admin');
    const treasury = await chain.treasury('factory-treasury');
    const stranger = await chain.treasury('factory-stranger');
    const child = Cell.fromBase64(artifact.childMinter.codeBocBase64);
    const wallet = Cell.fromBase64(artifact.jettonWallet.codeBocBase64);
    const deploy = async (minter = child, walletCode = wallet) => {
      const init = {code: Cell.fromBase64(artifact.hex), data: beginCell().storeAddress(admin.address)
        .storeAddress(treasury.address).storeUint(70, 16).storeBit(false)
        .storeRef(minter).storeRef(walletCode).endCell()};
      const address = contractAddress(0, init);
      await admin.send({to: address, init, value: 100000000n});
      return address;
    };
    const factory = await deploy();
    return {chain, creator, stranger, treasury, factory, deploy, child, wallet, snapshot: chain.snapshot()};
  })();
  const f = await fixture;
  await f.chain.loadFrom(f.snapshot);
  return f;
}

async function supply(chain, minter, creator) {
  const data = (await chain.runGetMethod(minter, 'get_jetton_data')).stackReader;
  const issued = data.readBigNumber();
  data.readBigNumber();
  assert(data.readAddress().equals(creator));
  return issued;
}

test('Factory deploys and mints once into the creator wallet with the fixed fee', async () => {
  const {chain, creator, treasury, factory, child, wallet} = await setup();
  const start = (await chain.getContract(factory)).balance;
  for (const [query, value] of [[1, 220000000n], [2, 600000000n]]) {
    const created = await creator.send({to: factory, value, body: create(creator.address, query)});
    const root = txAt(created, factory, CREATE);
    assert(successful(root));
    const deploy = [...root.outMessages.values()].filter(message => op(message) === BOOTSTRAP);
    assert.equal(deploy.length, 1);
    const [message] = deploy;
    const minter = message.info.dest;
    assert(message.init.code.equals(child));
    assert(successful(txAt(created, minter, BOOTSTRAP)));
    assert.equal(await supply(chain, minter, creator.address), SUPPLY);
    const recipientWallet = contractAddress(0, {code: wallet, data: beginCell().storeCoins(0)
      .storeAddress(creator.address).storeAddress(minter).storeRef(wallet).endCell()});
    const delivery = txAt(created, recipientWallet, 0x178d4519);
    assert(successful(delivery) && delivery.inMessage.info.src.equals(minter));
    assert.equal((await chain.runGetMethod(recipientWallet, 'get_wallet_data')).stackReader.readBigNumber(), SUPPLY);
    const fee = [...txAt(created, minter, BOOTSTRAP).outMessages.values()].find(out => out.info.dest.equals(treasury.address));
    assert.equal(fee.info.value.coins, FEE);
    const factoryBalance = (await chain.getContract(factory)).balance;
    assert(start - factoryBalance <= 5n && factoryBalance <= start, 'Factory must not retain user funds');
  }
});

test('Factory bootstrap binds the Factory, query, creator and pinned child code', async () => {
  const {chain, creator, stranger, factory, deploy, snapshot} = await setup();
  const query = 91;
  const body = create(creator.address, query);
  const rejection = await stranger.send({to: factory, value: 220000000n, body});
  assert.equal(txAt(rejection, factory, CREATE).description.computePhase.exitCode, 201);
  const unfunded = await creator.send({to: factory, value: 190000000n, body});
  assert.equal(txAt(unfunded, factory, CREATE).description.computePhase.exitCode, 202);
  const badFactory = await deploy(Cell.EMPTY);
  const wrongCode = await creator.send({to: badFactory, value: 220000000n, body});
  assert.equal(txAt(wrongCode, badFactory, CREATE).description.computePhase.exitCode, 203);

  const plan = await creator.send({to: factory, value: 220000000n, body});
  const message = [...txAt(plan, factory, CREATE).outMessages.values()].find(out => op(out) === BOOTSTRAP);
  const minter = message.info.dest;
  await chain.loadFrom(snapshot);
  const unauthorized = await stranger.send({to: minter, init: message.init, value: 105000000n, body: bootstrap(query)});
  assert.equal(txAt(unauthorized, minter, BOOTSTRAP).description.computePhase.exitCode, 73);
  const badQuery = await chain.sendMessage(internal({from: factory, to: minter, init: message.init,
    value: 105000000n, body: bootstrap(query + 1), bounce: true}));
  assert.equal(txAt(badQuery, minter, BOOTSTRAP).description.computePhase.exitCode, 73);
  const created = await creator.send({to: factory, value: 220000000n, body});
  assert(successful(txAt(created, minter, BOOTSTRAP)));
  const repeated = await creator.send({to: factory, value: 220000000n, body});
  assert(successful(txAt(repeated, minter, BOOTSTRAP)));
  assert.equal(await supply(chain, minter, creator.address), SUPPLY);
  const changeAdmin = beginCell().storeUint(3, 32).storeUint(7, 64).storeAddress(stranger.address).endCell();
  const forgedAdmin = await chain.sendMessage(internal({from: factory, to: minter,
    value: 100000000n, body: changeAdmin, bounce: true}));
  assert.equal(txAt(forgedAdmin, minter, 3).description.computePhase.exitCode, 73);
  assert.equal(await supply(chain, minter, creator.address), SUPPLY);
});
