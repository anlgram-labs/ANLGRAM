/**
 * Local TVM simulation of the LP locker's privileged wallet-binding boundary.
 * The simulated sender addresses are fixtures; no transaction is broadcast.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, 'minter-contract', 'package.json'));
const ton = req('ton');
const core = req('@ton/core');
const BN = req('bn.js');
const { compileFunc } = req('@ton-community/func-js');
const { SmartContract, TvmRunnerSynchronous, TvmRunnerAsynchronous } = req('ton-contract-executor');
const { buildLaunchpadInitialStates } = require('./minter-contract/deploy-launchpad-testnet');

delete globalThis.fetch;
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();

test('privileged wallet binding alone can produce LP confirmation without proving LP custody', async () => {
  const contractsDir = path.join(__dirname, 'minter-contract', 'contracts');
  async function compile(name) {
    const result = await compileFunc({ targets: [name],
      sources: file => fs.readFileSync(path.join(contractsDir, file), 'utf8') });
    assert.equal(result.status, 'ok', result.message);
    return ton.Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  }
  const lockerCode = await compile('anlgram-lp-locker.fc');
  const walletCode = await compile('jetton-wallet.fc');
  const addr = byte => new ton.Address(0, Buffer.alloc(32, byte));
  const coreAddr = byte => new core.Address(0, Buffer.alloc(32, byte));
  const [admin, curve, locker, router, pool, selectedWallet, outsider] = [1, 2, 3, 4, 5, 6, 7].map(addr);
  const states = buildLaunchpadInitialStates({
    adminAddress: coreAddr(1), curveAddress: coreAddr(2), lpLockerAddress: coreAddr(3),
    migrationRouterAddress: coreAddr(4), dexRouterAddress: coreAddr(5), poolAddress: coreAddr(5),
    minterAddress: coreAddr(8), ptonMinterAddress: coreAddr(9),
    jettonWalletCode: core.Cell.fromBoc(walletCode.toBoc())[0],
  }, core);
  const contract = await SmartContract.fromCell(lockerCode, ton.Cell.fromBoc(states.lpLockerData.toBoc())[0]);
  contract.setC7Config({ myself: locker });

  const send = (from, body) => contract.sendInternalMessage(new ton.InternalMessage({
    to: locker, from, value: new BN('20000000'), bounce: false,
    body: new ton.CommonMessageInfo({ body: new ton.CellMessage(body) }),
  }));
  const msg = (op, address) => ton.beginCell().storeUint(op, 32).storeUint(1, 64)
    .storeAddress(address).endCell();
  assert.equal((await send(admin, msg(0x414e4c39, router))).type, 'success');
  const unauthorized = await send(outsider, msg(0x414e4c31, selectedWallet));
  assert.equal(unauthorized.type, 'failed');
  assert.equal(unauthorized.exit_code, 401);
  assert.equal((await send(admin, msg(0x414e4c31, selectedWallet))).type, 'success');

  // This fixture is just an address selected by the admin; no LP wallet or LP
  // assets were created. It claims the configured pool as the message origin.
  const notification = ton.beginCell().storeUint(0x7362d09c, 32).storeUint(2, 64)
    .storeCoins(100).storeAddress(pool).storeUint(0, 1).endCell();
  const result = await send(selectedWallet, notification);
  assert.equal(result.type, 'success');
  assert.equal(result.actionList.length, 1);
  assert.ok(result.actionList[0].message.info.dest.equals(curve));
  const locked = await contract.invokeGetMethod('get_locked_lp_amount', []);
  assert.equal(locked.type, 'success');
  assert.equal(locked.result[0].toString(), '100');
});
