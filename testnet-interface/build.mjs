import { cpSync, mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {patchSdk,PIN} from './sdk-patch.mjs';
import assert from 'node:assert/strict';
import intent from './minter-intent.json' with {type:'json'};
const candidate=JSON.parse(readFileSync(new URL('../docs/launchpad/testnet-v5-candidate.json',import.meta.url)));
const active=JSON.parse(readFileSync(new URL('../docs/launchpad/active-testnet-candidate.json',import.meta.url)));
assert.equal(createHash('sha256').update(JSON.stringify(candidate)).digest('hex'),active.candidateSha256);
assert.equal(intent.candidateSha256,active.candidateSha256);assert.equal(intent.operator,candidate.wallet.raw);assert.equal(intent.walletId,2147483645);assert.equal(intent.network,'-3');assert.equal(intent.publicKey,candidate.wallet.publicKey);assert.equal(intent.walletStateInit,candidate.wallet.stateInit);assert.deepEqual(intent.message,candidate.smokePlan.steps[0].message);assert.equal(intent.message.amount,'100000000');
const curveIntent=JSON.parse(readFileSync(new URL('curve-two-intent.json',import.meta.url)));assert.equal(curveIntent.candidateSha256,active.candidateSha256);assert.equal(curveIntent.operator,candidate.wallet.raw);assert.equal(curveIntent.expectedSeqno,1);assert.equal(curveIntent.walletId,2147483645);assert.equal(curveIntent.network,'-3');assert.deepEqual(curveIntent.message,candidate.smokePlan.steps[1].message);
mkdirSync(new URL('./public/',import.meta.url),{recursive:true});
for(const file of ['index.html','app.js','transaction-one.js','transaction-two.js','mvp-status.js','recovery-status.js','style.css'])cpSync(new URL(file,import.meta.url),new URL('public/'+file,import.meta.url));
// Bind both compiled SDK guard and server to the exact financial execution
// implementation. No timestamps: identical reviewed sources reproduce the ID.
const versionSources=['build.mjs','app.js','client-entry.mjs','single-attempt.mjs','sdk-patch.mjs','transaction-two.js','curve-operation.mjs','curve-authorization.mjs','curve-policy.mjs','transaction-policy.mjs','curve-two-intent.json','operation-lock.mjs','proof.mjs','prepare-minter-one.mjs','testnet-rpc.mjs','curve-emulation.mjs','worker.mjs','config.mjs','package-lock.json','recovery/runtime.mjs','recovery/ledger.mjs','recovery/policy.mjs','recovery/emulation.mjs'];
const execution={schema:1,candidateSha256:active.candidateSha256,sources:Object.fromEntries(versionSources.map(file=>[file,createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex')]))};
execution.sha256=createHash('sha256').update(JSON.stringify(execution)).digest('hex');
writeFileSync(new URL('execution-version.json',import.meta.url),JSON.stringify(execution,null,2)+'\n');
let patched=0;
await build({entryPoints:[fileURLToPath(new URL('client-entry.mjs',import.meta.url))],bundle:true,platform:'browser',format:'iife',globalName:'TON_CONNECT_UI',minify:true,target:'es2022',outfile:fileURLToPath(new URL('public/tonconnect-ui.min.js',import.meta.url)),plugins:[{name:'pinned-single-attempt-sdk',setup(b){b.onLoad({filter:/[\\/]@tonconnect[\\/]sdk[\\/]lib[\\/]esm[\\/]index\.mjs$/},args=>{patched++;return{contents:patchSdk(readFileSync(args.path,'utf8'),fileURLToPath(new URL('single-attempt.mjs',import.meta.url))),loader:'js',resolveDir:fileURLToPath(new URL('node_modules/@tonconnect/sdk/lib/esm/',import.meta.url))};});}}]});
if(patched!==1)throw Error('Application did not use exactly one patched SDK module');
const sha=file=>createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex');
writeFileSync(new URL('client-build.json',import.meta.url),JSON.stringify({executionVersion:execution.sha256,sdk:'3.3.1',ui:'2.3.1',originalSdkSha256:PIN,bundleSha256:sha('public/tonconnect-ui.min.js'),sdkPatchSha256:sha('sdk-patch.mjs'),guardSha256:sha('single-attempt.mjs'),curveControllerSha256:sha('transaction-two.js'),policySha256:sha('minter-policy.mjs'),sharedPolicySha256:sha('transaction-policy.mjs'),curvePolicySha256:sha('curve-policy.mjs'),curveIntentSha256:sha('curve-two-intent.json'),intentSha256:sha('minter-intent.json'),candidateSha256:active.candidateSha256,patchedModules:patched},null,2)+'\n');
cpSync(new URL('../assets/images/icon-512.png',import.meta.url),new URL('public/icon.png',import.meta.url));

const curveReport=JSON.parse(readFileSync(new URL('../docs/launchpad/testnet-curve-two-preflight.json',import.meta.url))),sandboxReport=JSON.parse(readFileSync(new URL('../docs/launchpad/testnet-curve-two-sandbox.json',import.meta.url)));assert.equal(curveReport.destination,curveIntent.message.address);assert.equal(curveReport.network,'-3');assert.equal(curveReport.readyForSigning,false);assert.equal(curveReport.broadcast,false);assert.equal(sandboxReport.evidence,'LOCAL_SOURCE_COMPILED_SANDBOX_ONLY');assert.equal(sandboxReport.curveDataHash,curveReport.dataHash);const publishedReport={...curveReport,initialCurve:{...curveReport.initialCurve,treasury:undefined},sandbox:sandboxReport};writeFileSync(new URL('public/curve-two-preflight.json',import.meta.url),JSON.stringify(publishedReport,null,2)+'\n');
