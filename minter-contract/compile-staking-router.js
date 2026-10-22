/**
 * ANLGRAM Staking Router — In-Node FunC Compiler Script
 * Compiles minter-contract/contracts/anlgram-staking-router.fc using @ton-community/func-js
 */
'use strict';

const path = require('path');
const fs   = require('fs');

async function compileRouter() {
  const { compileFunc } = require('@ton-community/func-js');
  const { Cell } = require('@ton/core');

  const contractsDir = path.join(__dirname, 'contracts');
  const sources = (filePath) => {
    let absPath;
    if (filePath.startsWith('/') || filePath.includes(':')) {
      absPath = filePath;
    } else {
      absPath = path.join(contractsDir, filePath);
    }
    if (!fs.existsSync(absPath)) {
      throw new Error(`Source file not found: ${absPath}`);
    }
    return fs.readFileSync(absPath, 'utf-8');
  };

  console.log('Compiling anlgram-staking-router.fc ...');
  const result = await compileFunc({
    targets: ['anlgram-staking-router.fc'],
    sources,
  });

  if (result.status === 'error') {
    console.error('COMPILATION FAILED:');
    console.error(result.message);
    process.exit(1);
  }

  const codeCell = Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  const codeHex  = codeCell.toBoc().toString('hex');
  const codeHash = codeCell.hash().toString('hex');

  const outputPath = path.join(__dirname, 'build', 'anlgram-staking-router.compiled.json');
  fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    contract: 'anlgram-staking-router.fc',
    feeBps: 35,
    feeRecipient: 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd',
    codeBocBase64: result.codeBoc,
    codeBocHex: codeHex,
    codeCellHashHex: codeHash,
    compiledAt: new Date().toISOString(),
  }, null, 2));

  console.log('SUCCESS! Compiled to:', outputPath);
  console.log('Code cell hash (SHA-256):', codeHash);
  console.log('Code BOC (base64) length:', result.codeBoc.length);
  return result.codeBoc;
}

if (require.main === module) {
  compileRouter().catch(err => {
    console.error('Error:', err.message || err);
    process.exit(1);
  });
}

module.exports = { compileRouter };
