'use strict';
const fs=require('node:fs'),path=require('node:path');
if(!process.argv.includes('--local-only'))throw Error('--local-only required; no chain broadcast exists');
require('../tests/settlement-runtime/curve-two-support').simulate().then(({summary})=>{if(process.argv.includes('--write'))fs.writeFileSync(path.resolve(__dirname,'../docs/launchpad/testnet-curve-two-sandbox.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));}).catch(e=>{console.error('SANDBOX FAILED: '+e.message);process.exitCode=1;});
