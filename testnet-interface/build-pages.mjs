import {cpSync,mkdirSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import './build.mjs';
execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config','pages-build-worker.toml','--dry-run','--outdir','.pages-worker-build'],{cwd:new URL('.',import.meta.url),stdio:'inherit'});
mkdirSync(new URL('public-pages/',import.meta.url),{recursive:true});
for(const file of ['index.html','app.js','transaction-one.js','style.css','tonconnect-ui.min.js','icon.png','curve-two-preflight.json'])cpSync(new URL('public/'+file,import.meta.url),new URL('public-pages/'+file,import.meta.url));
cpSync(new URL('.pages-worker-build/pages-entry.js',import.meta.url),new URL('public-pages/_worker.js',import.meta.url));
const published=readdirSync(new URL('public-pages/',import.meta.url));
if(published.length!==8)throw Error('Unexpected Pages publication files');
