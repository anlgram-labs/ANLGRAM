import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildReleasePlan,buildReviewedOwnerInventory} from './testnet-release-plan.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const compilerChecks=[
 ['standard','compile-standard-jetton-v2.js'],
 ['standardSettlementWallet','compile-standard-jetton-settlement-wallet.js'],
 ['settlementWallet','compile-settlement-wallet.js'],
 ['launchpadMinter','compile-launchpad-minter.js'],
 ['vesting','compile-vesting-v2.js'],
 ['standardVesting','compile-vesting-v2.js','--standard'],
 ['locker','compile-lp-locker-v2.js'],
 ['guardAndVNext','compile-vnext-package.js'],
 ['dispatch','compile-one-shot-dispatch.js'],
];
const suites={
 settlement:[
  'tests/settlement-runtime/mvp-v5-lifecycle.test.js',
  'tests/settlement-runtime/one-shot-dispatch.test.js',
  'tests/settlement-runtime/lpaccount-settlement-evidence.test.js',
  'tests/settlement-runtime/stonfi-locker-v2-real.test.js',
 ],
 integration:[
  'testnet-interface/test/testnet-release-plan.test.mjs',
  'testnet-interface/test/vesting-v2-lifecycle.test.mjs',
  'testnet-interface/test/standard-supervisor.test.mjs',
  'testnet-interface/test/trusted-project-registration.test.mjs',
  'testnet-interface/test/generation2-status.test.mjs',
  'testnet-interface/test/execution-version.test.mjs',
  'testnet-interface/test/compiled-transport.test.mjs',
  'testnet-interface/test/recovery-runtime.test.mjs',
 ],
};
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>
 /^(path|systemroot|windir|comspec|temp|tmp|tmpdir|home|userprofile|appdata|localappdata)$/i.test(key)));
const node=(args)=>execFileSync(process.execPath,args,{cwd:root,env:environment,encoding:'utf8',timeout:300000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
function runSuite(files) {
 let output,success=true;
 try {output=node(['--test','--test-concurrency=2','--test-reporter=tap',...files]);}
 catch(error){output=error.stdout??'';success=false;}
 const counts=Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,
  Number(output.match(new RegExp('^# '+k+' (\\d+)\\s*$','m'))?.[1]??-1)]));
 return {...counts,success:success&&counts.tests>0&&counts.tests===counts.pass&&counts.fail===0&&counts.skipped===0};
}

try {
 const [command,input,...extra]=process.argv.slice(2);
 if(command==='manifest'&&input&&extra.length===0){
  console.log(JSON.stringify(await buildReleasePlan(JSON.parse(await readFile(input,'utf8'))),null,2));
 }else if(command==='owner-manifest'&&extra.length===0){
  console.log(JSON.stringify(await buildReviewedOwnerInventory(input?JSON.parse(await readFile(input,'utf8')):undefined),null,2));
 }else if(command==='rehearse'&&!input){
  const git=args=>execFileSync('git',args,{cwd:root,env:environment,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const commit=git(['rev-parse','HEAD']),dirtyBefore=!!git(['status','--porcelain']);
  const compilers={};
  for(const [name,file,...flags] of compilerChecks){
   try {node(['minter-contract/'+file,'--check',...flags]);compilers[name]='PASS';}
   catch {compilers[name]='FAIL';}
  }
  const results=Object.fromEntries(Object.entries(suites).map(([name,files])=>[name,runSuite(files)]));
  const dirty=dirtyBefore||!!git(['status','--porcelain']);
  const sourceStable=!dirty&&commit===git(['rev-parse','HEAD']);
  const success=sourceStable&&Object.values(compilers).every(value=>value==='PASS')&&Object.values(results).every(value=>value.success);
  console.log(JSON.stringify({schema:1,scope:'LOCAL_SANDBOX_AND_FIXTURES_ONLY',network:'-3',
   commit,dirty,sourceStable,compilers,results,success,
   liveChainVerified:false,financialSigningEnabled:false,broadcastingEnabled:false},null,2));
  if(!success)process.exitCode=1;
 }else throw Error('Unsupported release command');
}catch{
 console.error(JSON.stringify({code:'RELEASE_INPUT_OR_REHEARSAL_UNVERIFIED',financialSigningEnabled:false,broadcastingEnabled:false}));
 process.exitCode=1;
}
