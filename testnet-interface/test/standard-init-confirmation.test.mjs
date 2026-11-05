import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkInitMarkers,confirmInitialization} from '../projects/standard-init-confirmation.mjs';

const fingerprint='12'.repeat(32);
const phrase='AUTHORIZE TESTNET INIT '+fingerprint;
const fixture=()=>({wallet:{address:'DISPOSABLE TEST FIXTURE'},
 quote:{network:'-3',fingerprint,validUntil:Math.floor(Date.now()/1000)+30}});

test('blank terminal line and broken paste stay in the same owner prompt until exact input',async()=>{
 const input=new PassThrough(),output=new PassThrough(),answers=['',phrase.slice(0,-1),phrase];
 let messages='';
 output.on('data',chunk=>{
  messages+=chunk.toString();
  if(chunk.toString().startsWith('Owner confirmation'))setImmediate(()=>input.write(answers.shift()+'\n'));
 });
 await confirmInitialization(fixture(),{input,output});
 assert.match(messages,/No authorization entered/);
 assert.match(messages,/does not match/);
 assert.equal(answers.length,0);
 input.end();
});

test('terminal end of input cancels explicitly without authorization',async()=>{
 const input=new PassThrough(),output=new PassThrough();
 setImmediate(()=>input.end());
 await assert.rejects(confirmInitialization(fixture(),{input,output}),/Owner cancelled/);
});

test('dialog response is exact, expires after confirmation, and handles unavailable or cancelled host',async()=>{
 const request=fixture();
 await confirmInitialization(request,{dialog:true,execute:async (_,args,options)=>{
  assert(args.includes('-STA'));
  assert.equal(JSON.parse(options.env.ANLGRAM_INIT_DIALOG_DETAILS).fingerprint,fingerprint);
  assert(!Object.keys(options.env).some(key=>key.endsWith('API_KEY')));
  return {stdout:phrase+'\r\n'};
 }});
 for(const stdout of ['',phrase+' ',phrase.slice(0,-1)])await assert.rejects(
  confirmInitialization(request,{dialog:true,execute:async()=>({stdout})}),/Exact owner/);
 await assert.rejects(confirmInitialization(request,{dialog:true,execute:async()=>{throw {code:2};}}),/cancelled/);
 await assert.rejects(confirmInitialization(request,{dialog:true,execute:async()=>{throw {code:'ENOENT'};}}),/dialog unavailable/);
 let time=request.quote.validUntil-1;
 await assert.rejects(confirmInitialization(request,{dialog:true,now:()=>time,
  execute:async()=>{time++;return {stdout:phrase};}}),/expired/);
});

test('empty interrupted-signing and broadcast markers are rejected by existence alone',async()=>{
 const operator='0:'+'14'.repeat(32);
 for(const suffix of ['init-pending','init-broadcast']){
  const directory=await mkdtemp(join(tmpdir(),'anlgram-init-confirm-marker-'));
  try{
   await checkInitMarkers(directory,operator);
   await writeFile(join(directory,operator.slice(2)+'.'+suffix),'',{flag:'wx'});
   await assert.rejects(checkInitMarkers(directory,operator),/Existing.*marker/);
  }finally{await rm(directory,{recursive:true,force:true});}
 }
});

test('Windows PowerShell 5.1 rejects an expired dialog without reading terminal input', {skip:process.platform!=='win32'},()=>{
 const path=fileURLToPath(new URL('../standard-init-confirmation.ps1',import.meta.url));
 const quote={...fixture().quote,address:'DISPOSABLE TEST FIXTURE',validUntil:1};
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',path],
  {encoding:'utf8',timeout:10000,env:{...process.env,ANLGRAM_INIT_DIALOG_DETAILS:JSON.stringify(quote)}});
 assert.equal(result.status,3,result.stderr);
 assert.equal(result.stdout,'');
});
