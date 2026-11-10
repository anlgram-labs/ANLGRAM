'use strict';
// UNVERIFIED test design. Run only in the required OS-isolated offline sandbox.
// This tests arithmetic on a test-only compiled FunC harness, not real custody.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {compileFunc} = require('@ton-community/func-js');
const {Blockchain} = require('@ton/sandbox');
const {beginCell, Cell, contractAddress} = require('@ton/core');

test('principal partition rejects over-credit and reserves pending delivery', async () => {
  const root = path.resolve(__dirname, '../..');
  const target = 'tests/settlement-runtime/fixtures/f02-principal-ledger-harness.fc';
  const result = await compileFunc({targets:[target], sources:name =>
    fs.readFileSync(path.resolve(root, name), 'utf8').replace(/\r\n/g, '\n')});
  assert.equal(result.status, 'ok', result.message);
  const init = {code:Cell.fromBase64(result.codeBoc), data:beginCell().endCell()};
  const address = contractAddress(0, init);
  const chain = await Blockchain.create();
  // Install a dummy local account; no deployment, key, network or real asset.
  const {createShardAccount} = require('@ton/sandbox');
  await chain.setShardAccount(address, createShardAccount({address, ...init, balance:100000000n}));
  const partition = async (...values) => {
    const result = await chain.runGetMethod(address, 'get_partition', values.map(value => ({type:'int', value:BigInt(value)})));
    return [result.stackReader.readBigNumber(), result.stackReader.readBigNumber()];
  };
  assert.deepEqual(await partition(300,0,0,0,0), [300n,0n]);
  assert.deepEqual(await partition(300,300,0,0,0), [0n,300n]);
  assert.deepEqual(await partition(300,300,100,20,30), [50n,200n]);
  assert.deepEqual(await partition(300,300,300,300,0), [0n,0n]);
  for (const values of [[-1,0,0,0,0],[1,2,0,0,0],[1,1,2,0,0],[1,1,0,1,0],[1,0,0,0,2]]) {
    await assert.rejects(() => partition(...values));
  }
});
