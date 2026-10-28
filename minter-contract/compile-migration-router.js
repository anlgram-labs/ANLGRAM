/**
 * ANLGRAM Migration Router — In-Node FunC Compiler Script
 * Compiles minter-contract/contracts/anlgram-migration-router.fc using @ton-community/func-js
 */
'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

async function compileMigrationRouter() {
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

  console.log('Compiling anlgram-migration-router.fc ...');
  const result = await compileFunc({
    targets: ['anlgram-migration-router.fc'],
    sources,
  });

  if (result.status === 'error') {
    console.error('COMPILATION FAILED:');
    console.error(result.message);
    process.exit(1);
  }

  const codeCell       = Cell.fromBoc(Buffer.from(result.codeBoc, 'base64'))[0];
  const bocBuffer      = codeCell.toBoc();
  const codeHex        = bocBuffer.toString('hex');
  const codeCellHash   = codeCell.hash().toString('hex');
  const bocFileSha256  = crypto.createHash('sha256').update(bocBuffer).digest('hex');
  const bocSizeBytes   = bocBuffer.length;

  const outputPath = path.join(__dirname, 'build', 'anlgram-migration-router.compiled.json');
  fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    contract: 'anlgram-migration-router.fc',
    codeBocBase64: result.codeBoc,
    codeHex: codeHex,
    codeCellHash: codeCellHash,
    codeHash: codeCellHash,
    bocFileSha256: bocFileSha256,
    bocSizeBytes: bocSizeBytes,
    compiledAt: new Date().toISOString(),
  }, null, 2), 'utf-8');

  console.log('SUCCESS! Compiled to:', outputPath);
  console.log('TON code cell representation hash:', codeCellHash);
  console.log('Serialized BOC file SHA-256 digest:', bocFileSha256);
  console.log('Serialized BOC size (bytes):', bocSizeBytes);
}

compileMigrationRouter().catch(err => {
  console.error('Fatal compile error:', err);
  process.exit(1);
});
