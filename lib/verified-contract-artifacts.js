'use strict';
// Offline source compilation only. This never authorizes a deployed account.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const contractRoot=path.resolve(__dirname,'../minter-contract');
const localRequire=createRequire(path.join(contractRoot,'package.json'));
const {compileFunc}=localRequire('@ton-community/func-js'),{Cell}=localRequire('@ton/core');
const NAMES=Object.freeze(['anlgram-settlement-wallet','anlgram-launchpad-jetton-minter','anlgram-bonding-curve','anlgram-migration-router','anlgram-lp-auth-guard','anlgram-lp-locker-v2','anlgram-migration-v2-plan']);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function checkArtifact(name,artifact,compiled){
 const actual=Cell.fromBase64(artifact.codeBocBase64),expected=Cell.fromBase64(compiled);
 const hash=actual.hash().toString('hex');
 if(!actual.equals(expected)||hash!==(artifact.codeCellHash||artifact.codeHash))throw Error('Source/artifact mismatch: '+name);
 if(artifact.bocFileSha256&&sha(actual.toBoc())!==artifact.bocFileSha256)throw Error('BOC digest mismatch: '+name);
 return hash;
}
async function verifyArtifacts(){
 const result={};
 for(const name of NAMES){
  const sources={};
  const compiled=await compileFunc({targets:[name+'.fc'],sources:file=>{
   const absolute=path.resolve(contractRoot,'contracts',file),relative=path.relative(path.join(contractRoot,'contracts'),absolute);
   if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Source outside contract directory');
   const text=fs.readFileSync(absolute,'utf8').replace(/\r\n/g,'\n');sources[relative.split(path.sep).join('/')]=sha(text);return text;
  }});
  if(compiled.status!=='ok')throw Error('Compilation failed: '+name);
  const artifact=JSON.parse(fs.readFileSync(path.join(contractRoot,'build',name+'.compiled.json'),'utf8'));
  result[name]={codeHash:checkArtifact(name,artifact,compiled.codeBoc),sourceFilesSha256:Object.fromEntries(Object.entries(sources).sort(([a],[b])=>a.localeCompare(b)))};
 }
 return{compilerPackageVersion:localRequire('@ton-community/func-js/package.json').version,contracts:result};
}
module.exports={verifyArtifacts,checkArtifact,NAMES};
