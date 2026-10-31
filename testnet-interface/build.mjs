import { cpSync, mkdirSync } from 'node:fs';
mkdirSync(new URL('./public/',import.meta.url),{recursive:true});
for(const file of ['index.html','app.js','style.css'])cpSync(new URL(file,import.meta.url),new URL('public/'+file,import.meta.url));
cpSync(new URL('node_modules/@tonconnect/ui/dist/tonconnect-ui.min.js',import.meta.url),new URL('public/tonconnect-ui.min.js',import.meta.url));
cpSync(new URL('../assets/images/icon-512.png',import.meta.url),new URL('public/icon.png',import.meta.url));
