import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {sourceSha256} from '../build-source-integrity.mjs';import execution from '../execution-version.json' with {type:'json'};
test('actual execution source index is identical for LF and CRLF checkouts; SDK source changes still invalidate the binding',()=>{
 const lf={},crlf={};for(const file of Object.keys(execution.sources)){const content=readFileSync(new URL('../'+file,import.meta.url),'utf8').replaceAll('\r\n','\n');lf[file]=sourceSha256(Buffer.from(content));crlf[file]=sourceSha256(Buffer.from(content.replaceAll('\n','\r\n')));}
 assert.deepEqual(lf,execution.sources);assert.deepEqual(crlf,execution.sources);const sdk=readFileSync(new URL('../sdk-patch.mjs',import.meta.url));assert.notEqual(sourceSha256(Buffer.concat([sdk,Buffer.from('\n// altered implementation')])),execution.sources['sdk-patch.mjs']);
});
test('published application bundle uses canonical execution binding while final bundle and SDK pin remain exact byte hashes',()=>{
 const bundle=readFileSync(new URL('../public/tonconnect-ui.min.js',import.meta.url)),client=JSON.parse(readFileSync(new URL('../client-build.json',import.meta.url)));assert(bundle.includes(Buffer.from(execution.sha256)));assert.equal(createHash('sha256').update(bundle).digest('hex'),client.bundleSha256);assert.equal(client.executionVersion,execution.sha256);
 const sdk=readFileSync(new URL('../node_modules/@tonconnect/sdk/lib/esm/index.mjs',import.meta.url));assert.equal(createHash('sha256').update(sdk).digest('hex'),client.originalSdkSha256);
});
