'use strict';
// Historical production contracts are tested separately, never substituted for
// the integrated financial implementation. No deployment or RPC requests.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const ref = '781e1dbf523d5e82ebc7295adf8367e42084cd34';
const read = fs.readFileSync;
const cache = new Map();
function blob(file) {
  if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', `${ref}:${file}`], { cwd: root }));
  return cache.get(file);
}
fs.readFileSync = function (file, options) {
  if (typeof file === 'string') {
    const rel = path.relative(root, path.resolve(file)).replace(/\\/g, '/');
    if (/^minter-contract\/(?:contracts|build)\//.test(rel)) {
      const data = blob(rel);
      return typeof options === 'string' || options?.encoding ? data.toString(typeof options === 'string' ? options : options.encoding) : data;
    }
  }
  return read.apply(this, arguments);
};
console.log(`HISTORICAL MAIN BASELINE ${ref}: not the integrated contracts or Mainnet readiness evidence.`);
const mod = new Module(__filename, module);
mod.filename = __filename; mod.paths = module.paths;
const source = blob('test-bonding-curve-tvm.js').toString('utf8');
if (!source.includes('runTests().catch')) throw new Error('Unrecognized baseline test entry point');
mod._compile(source.replace('runTests().catch', 'module.exports = runTests().catch'), __filename);
Promise.resolve(mod.exports).finally(() => { fs.readFileSync = read; });
