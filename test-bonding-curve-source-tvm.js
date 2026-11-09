/**
 * Execute the existing TVM simulation suite against the current FunC sources.
 *
 * The original suite exercises saved artifacts, which may be stale. This wrapper
 * compiles each launchpad contract in memory and substitutes the compiled cells
 * only while the suite reads its inputs. It never modifies the saved artifacts.
 * The simulations are local and do not verify any deployed contract.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = __dirname;
const contracts = path.join(root, 'minter-contract', 'contracts');
const build = path.join(root, 'minter-contract', 'build');
const minterRequire = createRequire(path.join(root, 'minter-contract', 'package.json'));
const { compileFunc } = minterRequire('@ton-community/func-js');
const { Cell } = minterRequire('@ton/core');
const names = [
  'anlgram-launchpad-jetton-minter',
  'anlgram-lp-locker',
  'anlgram-migration-router',
  'anlgram-bonding-curve',
];

async function main() {
  const replacements = new Map();
  for (const name of names) {
    const result = await compileFunc({
      targets: [`${name}.fc`],
      sources: file => fs.readFileSync(path.join(contracts, file), 'utf8'),
    });
    if (result.status !== 'ok') throw new Error(`${name}: ${result.message}`);

    const artifactPath = path.join(build, `${name}.compiled.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const sourceHash = Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0].hash().toString('hex');
    const artifactHash = Cell.fromBoc(Buffer.from(artifact.codeBocBase64, 'base64'))[0].hash().toString('hex');
    console.log(`${name}: source ${sourceHash}; saved artifact ${artifactHash}; ${sourceHash === artifactHash ? 'MATCH' : 'MISMATCH'}`);
    replacements.set(artifactPath, JSON.stringify({ ...artifact, codeBocBase64: result.codeBoc }));
  }

  console.log('\nRunning local TVM simulations using the source-compiled code cells; saved artifacts remain unchanged.\n');
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'string' && replacements.has(file)) return replacements.get(file);
    return readFileSync.call(this, file, ...args);
  };
  try {
    require('./test-bonding-curve-tvm.js');
  } finally {
    fs.readFileSync = readFileSync;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
