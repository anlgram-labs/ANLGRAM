'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = __dirname;
const ref = '781e1dbf523d5e82ebc7295adf8367e42084cd34';
const baseline = file => execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' }).replace(/\r\n/g,'\n');
const current = file => fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const withoutScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const html = current('memecoin-platform.html');
const main = baseline('memecoin-platform.html');
test('production page CSS blocks and every non-script inline style are preserved exactly', () => {
  const styles = value => withoutScripts(value).match(/<style\b[^>]*>[\s\S]*?<\/style>|\bstyle="[^"]*"/gi);
  assert.deepEqual(styles(html),styles(main));
});
test('production navigation markup and homepage are preserved', () => {
  const nav = value => withoutScripts(value).match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi);
  assert.deepEqual(nav(html),nav(main));
  assert.equal(current('index.html'),baseline('index.html'));
  assert.equal(current('assets/js/wallet-connect.js'),baseline('assets/js/wallet-connect.js'));
});
test('mandatory donation is disclosed without exposing its recipient in normal creator UI', () => {
  const ui = withoutScripts(html);
  assert(ui.includes('Mandatory Donation (10%)'));
  assert(ui.includes('0.02 TON')); assert(ui.includes('~0.20 TON')); assert(ui.includes('~0.22 TON'));
  assert(!ui.includes('UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd'));
  assert(ui.includes('Shown in your wallet confirmation'));
});
test('receipt dependencies are loaded before the wizard and financial production gate remains closed', () => {
  const files = ['donation-config.js','launchpad.js','transaction-receipt.js','anl-labs.js'];
  const positions = files.map(f => html.lastIndexOf('assets/js/'+f));
  assert(positions.every(p => p >= 0)); assert.deepEqual(positions,[...positions].sort((a,b) => a-b));
  assert(html.includes('const CREATION_MAINNET_APPROVED = false;'));
  assert(current('assets/js/launchpad.js').includes('Factory creation requires verified donation routing and explicit production approval.'));
  assert(html.includes('Local verification — deployment pending'));
});
