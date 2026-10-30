'use strict';
// Offline development artifact; no deployment authorization is produced.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { compileFunc } = require('@ton-community/func-js');
const { Cell } = require('@ton/core');
(async () => {
 const hashes = {}, name = 'anlgram-lp-locker-v2';
 const result = await compileFunc({targets:[name+'.fc'],sources:file=>{
  const source=fs.readFileSync(path.join(__dirname,'contracts',file),'utf8').replace(/\r\n/g,'\n');
  hashes[file]=crypto.createHash('sha256').update(source).digest('hex');return source;
 }});
 if(result.status!=='ok') throw new Error(result.message);
 const cell=Cell.fromBase64(result.codeBoc),bytes=cell.toBoc();
 const content=JSON.stringify({contract:name+'.fc',developmentOnly:true,migrationAuthorized:false,
  codeBocBase64:result.codeBoc,codeHex:bytes.toString('hex'),codeCellHash:cell.hash().toString('hex'),
  bocFileSha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  compilerPackageVersion:require('@ton-community/func-js/package.json').version,
  sourceFilesSha256:Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b)))},null,2);
 const file=path.join(__dirname,'build',name+'.compiled.json');
 if(process.argv.includes('--check')) {
  if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==content) throw new Error('Source/artifact mismatch');
 } else fs.writeFileSync(file,content);
 console.log('LP locker V2 cell:',cell.hash().toString('hex'));
})().catch(e=>{console.error(e);process.exitCode=1;});
