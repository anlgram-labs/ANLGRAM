'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {compileFunc} = require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const {Cell} = require('../tests/settlement-runtime/node_modules/@ton/core');
const {wallet} = require('./compile-standard-jetton-v2');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const sha = input => createHash('sha256').update(input).digest('hex');
const replace = (source, anchor, replacement) => {
  if (source.split(anchor).length !== 2) throw Error('Settlement wallet generation anchor: ' + anchor);
  return source.replace(anchor, replacement);
};
function between(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw Error('Missing Standard mint source anchors');
  return source.slice(first, last);
}
async function main() {
  const base = 'contracts/anlgram-settlement-wallet.fc';
  const mintBase = 'contracts/jetton-wallet.fc';
  const mintGenerator = 'compile-standard-jetton-v2.js';
  const mint = wallet(read(mintBase));
  // Preserve both records on either kind of write. Genesis keeps the usual
  // TEP-74 data prefix and an empty tail until the first state update.
  let mintHelpers = between(mint, 'const int std_credit', '(int, slice, slice, cell) load_data()');
  mintHelpers = replace(mintHelpers, '  return s.slice_empty?() ? null() : s~load_dict();',
    '  if (s.slice_bits()) { s~load_dict(); }\n  return s.slice_bits() ? s~load_dict() : null();');
  mintHelpers = replace(mintHelpers, '.store_ref(code).store_dict(receipt)',
    '.store_ref(code).store_dict(settlement_records()).store_dict(receipt)');
  let source = read(base);
  const store = '() save_with_records(';
  source = replace(source, store, mintHelpers + store);
  source = replace(source, '  ifnot (cell_null?(records)) { b = b.store_dict(records); }',
    '  b = b.store_dict(records).store_dict(wallet_mint_record());');
  const transfer = '  if (op == sop::transfer) {';
  const mintDispatch = replace(between(mint, '  if ((op == std_credit)', '  if (op == op::transfer())'),
    '(op == op::transfer()) | (op == op::burn())', '(op == sop::transfer) | (op == op::transfer()) | (op == op::burn())');
  source = replace(source, transfer, mintDispatch + transfer);
  const bounce = '  throw_unless(709, (op == op::internal_transfer())';
  source = replace(source, bounce, '  if (op == std_receipt) { return (); }\n' + bounce);

  const target = 'standard-jetton-settlement-wallet.fc';
  const sourceHashes = Object.fromEntries([base, mintBase, mintGenerator].map(file => [file, sha(read(file))]));
  const compiled = await compileFunc({targets: [target], sources: file => {
    const input = file === target ? source : read('contracts/' + file);
    sourceHashes[file] = sha(input);
    return input;
  }});
  if (compiled.status !== 'ok') throw Error(compiled.message);
  const codeBocBase64 = compiled.codeBoc;
  const codeCellHash = Cell.fromBase64(codeBocBase64).hash().toString('hex');
  const output = JSON.stringify({schema: 2, target, codeCellHash, codeBocBase64, sourceHashes,
    generatorSha256: sha(read(path.basename(__filename)))}, null, 2) + '\n';
  const file = 'build/' + target.replace('.fc', '.compiled.json');
  if (process.argv.includes('--check')) {
    if (read(file) !== output) throw Error('Standard settlement wallet artifact mismatch');
  } else fs.writeFileSync(path.join(__dirname, file), output);
  console.log(codeCellHash);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
