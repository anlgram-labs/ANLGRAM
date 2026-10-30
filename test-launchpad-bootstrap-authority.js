/** Local TVM checks of the launchpad minter's bootstrap authority.
 * These simulate messages and do not send transactions or establish that a
 * deployed contract matches the sources.
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

test('curve cannot renounce a minter controlled by a different operator', async () => {
  const contractsDir = path.join(__dirname, 'minter-contract', 'contracts');
  async function compile(name) {
    const result = await compileFunc({
      targets: [name],
      sources: file => fs.readFileSync(path.join(contractsDir, file), 'utf8'),
    });
    assert.equal(result.status, 'ok', result.message);
    return ton.Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  }

  const minterCode = await compile('anlgram-launchpad-jetton-minter.fc');
  const walletCode = await compile('jetton-wallet.fc');
  const operator = new ton.Address(0, Buffer.alloc(32, 1));
  const curve = new ton.Address(0, Buffer.alloc(32, 2));
  const master = new ton.Address(0, Buffer.alloc(32, 3));
  const address = byte => new core.Address(0, Buffer.alloc(32, byte));
  const states = buildLaunchpadInitialStates({
    adminAddress: address(1), creatorAddress: address(1), treasuryAddress: address(1),
    curveAddress: address(2), minterAddress: address(3), lpLockerAddress: address(4),
    migrationRouterAddress: address(5), dexRouterAddress: address(6), ptonMinterAddress: address(7),
    jettonWalletCode: core.Cell.fromBoc(walletCode.toBoc())[0],
  }, core);
  const minterData = ton.Cell.fromBoc(states.launchpadMinterData.toBoc())[0];
  const minter = await SmartContract.fromCell(minterCode, minterData);
  minter.setC7Config({ myself: master });

  function message(from, body) {
    return new ton.InternalMessage({
      to: master, from, value: new BN('100000000'), bounce: false,
      body: new ton.CommonMessageInfo({ body: new ton.CellMessage(body) }),
    });
  }

  const changeAdmin = ton.beginCell().storeUint(3, 32).storeUint(1, 64)
    .storeUint(0, 2).endCell();
  const unauthorized = await minter.sendInternalMessage(message(curve, changeAdmin));
  assert.equal(unauthorized.type, 'failed');
  assert.equal(unauthorized.exit_code, 73);

  const authorized = await minter.sendInternalMessage(message(operator, changeAdmin));
  assert.equal(authorized.type, 'success');

  // After an operator renounce, a status query from the curve is supported;
  // it emits a response to the curve. It is not an automatic renounce.
  const query = ton.beginCell().storeUint(0x51c9d381, 32).storeUint(2, 64).endCell();
  const status = await minter.sendInternalMessage(message(curve, query));
  assert.equal(status.type, 'success');
  assert.equal(status.actionList.length, 1);
});
