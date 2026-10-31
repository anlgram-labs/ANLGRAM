'use strict';
// Packages static frontend files only. Never deploys, signs, or copies backend secrets.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const extra=new Set(['CNAME','favicon.ico','favicon.svg','logo.svg','manifest.json','tonconnect-manifest.json','robots.txt','sitemap.xml']);
const bootstrap='<script src="assets/js/blockchain-provider.js"></script>\n<script src="assets/js/memelabs-readonly.js?v=2026.56"></script>\n';
const safety='<script>if(!window.ANLGRAM_READONLY){window.stop();document.documentElement.textContent="Read-only safety module unavailable. Reload before continuing.";}</script>';
function eligible(file){
  if(file.split('/').some(part=>part.startsWith('.')))return false;
  return (file.startsWith('assets/')&&/\.(?:js|mjs|css|json|svg|ico|png|jpe?g|gif|webp|woff2?|ttf|otf|mp4|webm|mp3|ogg|wav)$/i.test(file))||(!file.includes('/')&&file.endsWith('.html'))||extra.has(file);
}
function scanSecrets(text,file){
  const rules=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
    ['telegram-token',/\b\d{8,12}:[A-Za-z0-9_-]{35}\b/],
    ['jwt',/\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/],
    ['assigned-secret',/(?:client_secret|private_key|mnemonic|api_key)\s*[:=]\s*["'][A-Za-z0-9_ /+-]{24,}["']/i]
  ];
  for(const [name,regex] of rules)if(regex.test(text))throw Error('Secret-pattern check failed: '+file+' ('+name+'). Value suppressed.');
}
function guardPage(html,file){
  if(file==='factory-deploy.html')return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Deployment unavailable</title><link rel="stylesheet" href="assets/css/design-system.css"></head><body><main><h1>Factory deployment unavailable</h1><p>This is a read-only release. No deployment or wallet transaction can be requested here.</p><a href="memecoin-platform.html">Return to MemeLabs</a></main></body></html>';
  if(html.includes('assets/js/memelabs-readonly.js'))return html.replace(/(<script\b[^>]*src="assets\/js\/memelabs-readonly\.js[^"\s]*"[^>]*><\/script>)/i,'$1'+safety);
  const pos=html.search(/<script\b|<\/head>/i);
  if(pos<0)throw Error('No safe bootstrap position: '+file);
  return html.slice(0,pos)+bootstrap+safety+html.slice(pos);
}
function build(output){
  if(!output)throw Error('Provide --output with a new, empty directory outside the checkout.');
  const dest=path.resolve(output),relative=path.relative(root,dest);
  if(!relative||(!(relative==='..'||relative.startsWith('..'+path.sep))&&!path.isAbsolute(relative)))throw Error('Output must be outside the checkout.');
  if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw Error('Output directory must be empty; existing files are never removed.');
  const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).filter(eligible);
  const contents=files.map(file=>{
    const source=path.join(root,file);
    if(!fs.lstatSync(source).isFile())throw Error('Non-regular public asset: '+file);
    let data=fs.readFileSync(source);
    if(/\.(?:html|js|css|json|svg|txt)$/i.test(file))scanSecrets(data.toString('utf8'),file);
    if(file.endsWith('.html'))data=Buffer.from(guardPage(data.toString('utf8'),file));
    return [file,data];
  });
  fs.mkdirSync(dest,{recursive:true});
  for(const [file,data] of contents){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);}
  fs.writeFileSync(path.join(dest,'.nojekyll'),'');
  return{output:dest,files:files.length,secretPatternsPassed:true,transactionSigning:false};
}
if(require.main===module){try{const i=process.argv.indexOf('--output');console.log(JSON.stringify(build(i<0?undefined:process.argv[i+1])));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={eligible,scanSecrets,guardPage,build};
