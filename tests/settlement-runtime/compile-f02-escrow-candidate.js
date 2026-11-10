'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('@ton/core');
const { compileFunc } = require('@ton-community/func-js');

async function compileEscrow() {
  const root = path.resolve(__dirname, '../..');
  const target = 'minter-contract/contracts/anlgram-f02-escrow-candidate.fc';
  const targetPath = path.resolve(root, target);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Escrow candidate contract not found at: ${targetPath}`);
  }

  const result = await compileFunc({
    targets: [target],
    sources: name => fs.readFileSync(path.resolve(root, name), 'utf8').replace(/\r\n/g, '\n')
  });

  if (result.status !== 'ok') {
    throw new Error(`FunC compilation error: ${result.message}`);
  }

  const cell = core.Cell.fromBase64(result.codeBoc);
  const codeCellHash = cell.hash().toString('hex');

  console.log(`[COMPILATION SUCCESS] ${target}`);
  console.log(`Code cell hash (SHA-256): ${codeCellHash}`);

  return {
    status: 'ok',
    codeCellHash,
    codeBoc: result.codeBoc
  };
}

if (require.main === module) {
  compileEscrow().catch(err => {
    console.error(`[COMPILATION FAILED] ${err.message}`);
    process.exit(1);
  });
}

module.exports = { compileEscrow };
