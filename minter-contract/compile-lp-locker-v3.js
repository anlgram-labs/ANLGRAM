'use strict';
// Compile script for LP Locker V3 and LP Withdrawal Escrow candidate.
// Offline development artifact; no deployment authorization is produced.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { compileFunc } = require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const { Cell } = require('../tests/settlement-runtime/node_modules/@ton/core');

const contracts = path.join(__dirname, 'contracts');
const read = file => fs.readFileSync(path.join(contracts, file), 'utf8').replace(/\r\n/g, '\n');

async function compile(target, overrides = {}) {
  const hashes = {};
  const result = await compileFunc({
    targets: [target],
    sources: file => {
      const source = overrides[file] ?? read(file);
      hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
      return source;
    }
  });
  if (result.status !== 'ok') throw new Error(result.message);
  const cell = Cell.fromBase64(result.codeBoc);
  const bytes = cell.toBoc();
  return {
    contract: target,
    codeBocBase64: result.codeBoc,
    codeHex: bytes.toString('hex'),
    codeCellHash: cell.hash().toString('hex'),
    bocFileSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sourceFilesSha256: Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)))
  };
}

async function main() {
  const escrow = await compile('anlgram-lp-withdrawal-escrow.fc');
  const lockerV3 = await compile('anlgram-lp-locker-v3.fc');

  const artifact = {
    lockerV3: {
      ...lockerV3,
      developmentOnly: true,
      migrationAuthorized: false
    },
    escrow: {
      ...escrow,
      developmentOnly: true,
      migrationAuthorized: false
    },
    financialDeploymentAuthorized: false
  };

  const outFile = path.join(__dirname, 'build/anlgram-lp-locker-v3.compiled.json');
  const content = JSON.stringify(artifact, null, 2) + '\n';

  if (process.argv.includes('--check')) {
    if (fs.readFileSync(outFile, 'utf8').replace(/\r\n/g, '\n') !== content) {
      throw new Error('LP Locker V3 generation mismatch: ' + outFile);
    }
  } else {
    fs.writeFileSync(outFile, content);
  }

  console.log(JSON.stringify({
    lockerV3: artifact.lockerV3.codeCellHash,
    escrow: artifact.escrow.codeCellHash,
    financialDeploymentAuthorized: false
  }));
}

if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { compile };
