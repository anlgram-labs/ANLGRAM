'use strict';
// Reproducible local build only. No deployment or signing support.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {compileFunc} = require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const {Cell} = require('../tests/settlement-runtime/node_modules/@ton/core');
const dir = path.join(__dirname, 'contracts'), sources = {};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function main() {
  const r = await compileFunc({targets:['anlgram-f02-receipt-prototype.fc'], sources: name => {
    const s = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n'); sources[name] = sha(s); return s;
  }});
  if (r.status !== 'ok') throw Error(r.message);
  const code = Cell.fromBase64(r.codeBoc);
  const artifact = JSON.stringify({contract:'anlgram-f02-receipt-prototype.fc', compiler:'@ton-community/func-js@0.11.0',
    codeCellHash:code.hash().toString('hex'), codeBocBase64:r.codeBoc, sourceFilesSha256:sources,
    financialDeploymentAuthorized:false, settlementImplemented:false}, null, 2) + '\n';
  const target = path.join(__dirname, 'build/anlgram-f02-receipt-prototype.compiled.json');
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== artifact) throw Error('Artifact mismatch');
  } else fs.writeFileSync(target, artifact);
  process.stdout.write(`code cell ${code.hash().toString('hex')} verified\n`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
