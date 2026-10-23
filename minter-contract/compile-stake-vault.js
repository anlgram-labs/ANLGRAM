/**
 * ANLGRAM Stake Vault — In-Node FunC Compiler Script
 * Compiles minter-contract/contracts/anlgram-stake-vault.fc using @ton-community/func-js
 */
'use strict';

const path = require('path');
const fs   = require('fs');

async function compileVault() {
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

  console.log('Compiling anlgram-stake-vault.fc ...');
  const result = await compileFunc({
    targets: ['anlgram-stake-vault.fc'],
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

  const outputPath = path.join(__dirname, 'build', 'anlgram-stake-vault.compiled.json');
  fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    contract: 'anlgram-stake-vault.fc',
    feeBps: 35,
    feeRecipient: 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd',
    codeBocBase64: result.codeBoc,
    codeHex: codeHex,
    codeHash: codeHash,
    compiledAt: new Date().toISOString(),
  }, null, 2), 'utf-8');

  console.log('SUCCESS! Compiled to:', outputPath);
  console.log('Code cell hash (SHA-256):', codeHash);
  console.log('Code BOC (base64) length:', result.codeBoc.length);
}

compileVault().catch(err => {
  console.error('Fatal compile error:', err);
  process.exit(1);
});
