'use strict';
// Runs repository root regression suites in separate processes; never invokes
// deployment, upload, or live-transaction scripts under minter-contract.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'anlgram-regressions-'));
const suites = fs.readdirSync(root).filter(f => /^test-.*\.js$/.test(f)).sort();
const env = { ...process.env, NODE_PATH: [path.join(root,'tests/settlement-runtime/node_modules'),path.join(root,'minter-contract/node_modules'),process.env.NODE_PATH || ''].join(path.delimiter) };
const results = [];
let next = 0;
async function worker() {
  while (next < suites.length) {
    const file = suites[next++];
    const result = await new Promise(resolve => {
      const child = spawn(process.execPath, [file], { cwd: root, env, windowsHide: true });
      let text = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 90000);
      child.stdout.on('data', d => { text += d; }); child.stderr.on('data', d => { text += d; });
      child.on('error', e => { text += e.message; });
      child.on('close', code => { clearTimeout(timer); fs.writeFileSync(path.join(output,file+'.log'),text);
        resolve({ file, code, timedOut, summary: text.split(/\r?\n/).filter(l => /(?:SUMMARY|RESULTS|Results:|passed|passing|failed|fail |pass |tests )/i.test(l)).slice(-6) }); });
    });
    results.push(result); console.log(JSON.stringify(result));
  }
}
Promise.all([worker(),worker(),worker(),worker()]).then(() => {
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({ output, suites: results.length, passedSuites: results.filter(r => r.code === 0).length, failedSuites: results.filter(r => r.code !== 0).length }));
  process.exitCode = results.some(r => r.code !== 0) ? 1 : 0;
});
