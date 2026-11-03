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
 assert.match(html,/<button[^>]*disabled>Create on-chain/);assert.match(html,/<button[^>]*disabled>Buy/);assert.match(html,/<button[^>]*disabled>Sell/);assert(html.includes('0.02 TON'));assert(html.includes('NOT your draft token'));assert(!controller.includes('testnet-mvp-offline-plan.json'),'new user guidance must not use ANLTEST operations');
 assert(html.includes('500 Real TON Target'));assert(!html.includes('1,000 Real TON Target'));assert(!html.includes('1,000 TON'));
 for(const id of ['wizard-mode-cards','wizard-step1-feedback','labs-allocation-summary','labs-csv-example-btn','labs-recipients-table-wrap','curve-graduation-tracker','curve-sim-card','lp-permanent-warning','lp-custody-badge','stonfi-migration-panel','migration-lifecycle-tracker','wizard-lifecycle-tracker','dashboard-migration-lp-card','wizard-financial-diagnostics'])assert(html.includes(`id="${id}"`),`missing UX element ${id}`);
 assert(!/<button[^>]*>[^<]*retry/i.test(html),'uncertain operations must never render a Retry button');
 assert.deepEqual(readFileSync(new URL('../public-pages/wizard-accessibility.css',import.meta.url)),readFileSync(new URL('../wizard/wizard-accessibility.css',import.meta.url)));
 assert.deepEqual(readFileSync(new URL('../public-pages/wizard-labs.css',import.meta.url)),readFileSync(new URL('../../assets/css/anl-labs.css',import.meta.url)));assert.deepEqual(readFileSync(new URL('../public-pages/wizard-design.css',import.meta.url)),readFileSync(new URL('../../assets/css/design-system.css',import.meta.url)));
});
test('compiled memelabs bundle executes full six-step user journey, presets, CSV table and draft lifecycle without financial calls',async()=>{
 const bundle=readFileSync(new URL('../public-pages/memelabs.js',import.meta.url),'utf8');
 const storeData=new Map(),localStorage={getItem:k=>storeData.get(k)??null,setItem:(k,v)=>storeData.set(k,String(v))};
 const makeEl=(tag='div')=>({tagName:tag,value:'',textContent:'',checked:false,disabled:false,readOnly:false,hidden:false,style:{},dataset:{},children:[],options:[{value:'3 Months'},{value:'12 Months'}],classList:{set:new Set(),toggle(c,v){if(v===undefined)v=!this.set.has(c);if(v)this.set.add(c);else this.set.delete(c);},contains(c){return this.set.has(c);}},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},addEventListener(ev,fn){this['on'+ev]=fn;},append(...n){this.children.push(...n);},replaceChildren(...n){this.children=n;},focus(){},click(){this.onclick?.();}});
 const els=new Proxy({},{get(t,k){if(!t[k])t[k]=makeEl();return t[k];}});
 const modeStandard=makeEl(),modeLaunchpad=makeEl();modeStandard.dataset.mode='standard';modeLaunchpad.dataset.mode='launchpad';
 const stepBtns=[1,2,3,4,5,6].map(n=>{const b=makeEl('button');b.dataset.step=String(n);return b;});
 const tonPreset=makeEl('button');tonPreset.dataset.ton='5';
 const lpPreset=makeEl('button');lpPreset.dataset.lp='80';
 const radios=['equal','custom'].map(v=>{const r=makeEl('input');r.value=v;return r;});
 const document={getElementById:id=>els[id], createElement:tag=>makeEl(tag), querySelectorAll:sel=>sel==='#wizard-mode-cards [data-mode]'?[modeStandard,modeLaunchpad]:sel==='[data-step]'?stepBtns:sel==='[data-ton]'?[tonPreset]:sel==='[data-lp]'?[lpPreset]:sel==='[name="dist-type"]'?radios:[]};
 const window={addEventListener(){}};
 vm.runInNewContext(bundle,{window,document,localStorage,crypto:globalThis.crypto,TextEncoder,Uint8Array,URL,Blob,AbortSignal,structuredClone,setTimeout,clearTimeout,fetch:async()=>{throw Error('unexpected network fetch');}});
 // Step 1: Enter token details & switch mode via mode card
 els['labs-card1-name'].value='MemeTest';els['labs-card1-name'].oninput();
 els['labs-card1-symbol'].value='mtest';els['labs-card1-symbol'].oninput();
 assert.equal(els['labs-card1-symbol'].value,'MTEST');
 els['wizard-creator'].value='0:'+'11'.repeat(32);els['wizard-creator'].oninput();
 assert.match(els['wizard-step1-feedback'].textContent,/fields are valid/);
 // Step 2: Load example CSV and verify recipient table rendering
 els['wizard-next'].onclick();assert.equal(els['wizard-mobile-step'].value,'2');
 els['labs-csv-example-btn'].onclick();
 assert.equal(els['labs-recipients-table-wrap'].hidden,false);
 assert.equal(els['labs-recipients-tbody'].children.length,3);
 // Switch to Launchpad via mode card and test Step 3 & Step 4 presets
 modeLaunchpad.onclick();assert.equal(els['wizard-mode'].value,'launchpad');
 assert.match(els['chip-unallocated'].textContent,/UNAVAILABLE/);
 assert.match(els['wizard-project-status'].textContent,/actual on-chain supply: UNKNOWN/);
 assert.match(els['wizard-project-status'].textContent,/Token balance: UNKNOWN/);
 assert.match(els['wizard-project-status'].textContent,/Bonding Curve reserves: UNAVAILABLE/);
 assert.match(els['wizard-project-status'].textContent,/Holder counts: UNKNOWN/);
 assert.match(els['wizard-project-status'].textContent,/LP custody: NOT VERIFIED/);
 assert.match(els['wizard-project-status'].textContent,/Migration progress: UNAVAILABLE/);
 assert.match(els['wizard-project-status'].textContent,/Transaction receipts: UNKNOWN/);
 const summary=JSON.parse(els['wizard-summary'].textContent);
 assert.equal(summary.onChainState.jettonSupply,'UNKNOWN');
 assert.equal(summary.onChainState.tokenBalance,'UNKNOWN');
 assert.equal(summary.onChainState.curveReserves,'UNAVAILABLE');
 assert.equal(summary.onChainState.lpCustody,'NOT_VERIFIED');
 assert.equal(summary.onChainState.transactionReceipts,'UNKNOWN');
 tonPreset.onclick();
 assert.equal(els['preview-buy'].value,'5');
 assert.equal(els['curve-sim-card'].hidden,false);
 assert.match(els['sim-tokens-out'].textContent,/tokens/);
 lpPreset.onclick();
 assert.equal(els['lp-percent'].value,'80');
 assert.equal(els['wizard-lifecycle-list'].children.length,10);
 assert.equal(els['migration-lifecycle-list'].children.length,9);
 assert.equal(els['wizard-diagnostics-grid'].children.length,11);
 assert.equal(els['stonfi-migration-grid'].children.length,14);
 assert.equal(els['dashboard-lp-migration-grid'].children.length,14);
 assert.match(els['lp-permanent-warning'].textContent,/PERMANENT LOCK ACTIVE/);
 assert.match(els['wizard-diagnostic-banner'].textContent,/Retry permitted: NO/);
 // Save draft, create second draft, then delete via My Projects card
 els['wizard-save'].onclick();
 assert.equal(els['wizard-projects'].children.length,1);
 els['wizard-new'].onclick();
 assert.equal(els['wizard-projects'].children.length,2);
 const firstCardActions=els['wizard-projects'].children[0].children[1];
 firstCardActions.children[1].onclick(); // Delete button
 assert.equal(els['wizard-projects'].children.length,1);
});
