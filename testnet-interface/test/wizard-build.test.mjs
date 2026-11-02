import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import vm from 'node:vm';import {build} from 'esbuild';
test('browser model bundle initializes without Node Buffer global and validates genuine TON address checksums',async()=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../wizard/model.mjs',import.meta.url))],inject:[fileURLToPath(new URL('../wizard/browser-buffer.mjs',import.meta.url))],bundle:true,platform:'browser',format:'iife',globalName:'Model',write:false});
 const context=vm.createContext({crypto:globalThis.crypto,URL});vm.runInContext(outputFiles[0].text,context);assert.equal(context.Buffer,undefined);
 const d=context.Model.createDraft();d.metadata.name='Browser';d.metadata.symbol='BRS';d.metadata.creator='0QCBGet2_2SvVUrX_MZL0w0OuPqlbJtlHT3nbpWaEH2QYbBR';assert.equal(context.Model.validate(d).valid,true);d.metadata.creator=d.metadata.creator.slice(0,-1)+'X';assert.equal(context.Model.validate(d).valid,false);
});
test('published wizard reuses original styles and six forms, with no legacy inline financial handlers or enabled transaction controls',()=>{
 const html=readFileSync(new URL('../public-pages/memelabs.html',import.meta.url),'utf8'),controller=readFileSync(new URL('../wizard/controller.mjs',import.meta.url),'utf8');
 for(let n=1;n<=6;n++)assert(html.includes(`id="wizard-panel-${n}"`));assert(!/\son[a-z]+\s*=/.test(html));assert(!html.includes('anl-labs.js'));assert(!html.includes('launchpad.js'));assert(!controller.includes('.sendTransaction('));assert(!controller.includes('/api/operation/claim'));assert(!controller.includes('/api/curve-two/claim'));
 assert.match(html,/<button[^>]*disabled>Create on-chain/);assert.match(html,/<button[^>]*disabled>Buy/);assert.match(html,/<button[^>]*disabled>Sell/);assert(html.includes('0.02 TON'));assert(html.includes('NOT your draft token'));
 assert.deepEqual(readFileSync(new URL('../public-pages/wizard-labs.css',import.meta.url)),readFileSync(new URL('../../assets/css/anl-labs.css',import.meta.url)));assert.deepEqual(readFileSync(new URL('../public-pages/wizard-design.css',import.meta.url)),readFileSync(new URL('../../assets/css/design-system.css',import.meta.url)));
});
