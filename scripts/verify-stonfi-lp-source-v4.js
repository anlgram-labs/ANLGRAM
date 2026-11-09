'use strict';
// Read-only official-source rebuild. No installation, signer or provider.
const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
const {compileFunc}=require('../tests/settlement-runtime/node_modules/@ton-community/func-js');
const core=require('../tests/settlement-runtime/node_modules/@ton/core');
const COMMIT='af0a955cc835af9697cd383e201fefcbe1a6a87e';
const FUNCBOX_INTEGRITY="sha512-xeiV04rXFhVeUSLZ+vr2ypkdY0BxK0sYGsxLYj7cxn++KMdh1m3d6XQGp5hfSBJcLfIgRf/P5ZfgZ+MwqP4hvA==";
async function verify(){
 const root='https://raw.githubusercontent.com/ston-fi/dex-core-v2/'+COMMIT+'/',sources={},rawHashes={},pending=new Map();
 const pkg=await(await fetch(root+'package.json')).json();if(pkg.devDependencies['@ston-fi/funcbox']!=='0.1.4')throw Error('Unexpected funcbox version');
 const meta=await(await fetch('https://registry.npmjs.org/@ston-fi/funcbox/0.1.4')).json();
 if(meta.dist.integrity!==FUNCBOX_INTEGRITY)throw Error('Pinned funcbox integrity changed');
 if(new URL(meta.dist.tarball).hostname!=='registry.npmjs.org')throw Error('Unexpected dependency host');
 const archive=Buffer.from(await(await fetch(meta.dist.tarball)).arrayBuffer()),[algorithm,expectedIntegrity]=meta.dist.integrity.split('-');
 if(crypto.createHash(algorithm).update(archive).digest('base64')!==expectedIntegrity)throw Error('Dependency archive integrity mismatch');
 const tar=require('node:zlib').gunzipSync(archive),dependency={};
 for(let pos=0;pos+512<=tar.length;){
  const header=tar.subarray(pos,pos+512),name=header.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim()||'0',8);
  if(!name)break;if(!Number.isFinite(size)||size<0)throw Error('Invalid dependency tar entry');
  if(name.startsWith('package/')&&name.endsWith('.fc'))dependency['node_modules/@ston-fi/funcbox/'+name.slice(8)]=tar.subarray(pos+512,pos+512+size).toString().replace(/\r\n/g,'\n');
  pos+=512+Math.ceil(size/512)*512;
 }

 async function download(file){
  if(pending.has(file))return pending.get(file);
  const promise=(async()=>{let text=dependency[file];if(text===undefined){const r=await fetch(root+file);if(!r.ok)throw Error('Official source HTTP '+r.status+': '+file);text=(await r.text()).replace(/\r\n/g,'\n');}rawHashes[file]=crypto.createHash('sha256').update(text).digest('hex');
   text=text.replace(/<%=\s*dexType\s*%>/g,'constant_product').replace(/<%=\s*version\[([013])\]\s*%>/g,(_,i)=>i==='3'?'':String(pkg.version.split('.')[Number(i)]));
   text=text.replace(/<%=\s*(defaultIsLocked|defaultLPFee|defaultProtocolFee)\s*%>/g,(_,k)=>({defaultIsLocked:'0',defaultLPFee:'20',defaultProtocolFee:'10'})[k]);
   if(text.includes('<%'))throw Error('Unsupported official preprocessor template: '+file);
   sources[file]=text;
   await Promise.all([...text.matchAll(/#include\s+"([^"]+)"/g)].map(m=>download(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])))));
  })();pending.set(file,promise);return promise;
 }
 await download('contracts/lp_wallet.fc');
 const result=await compileFunc({targets:['contracts/lp_wallet.fc'],sources:file=>{if(!(file in sources))throw Error('Unpinned include '+file);return sources[file];}});
 if(result.status!=='ok')throw Error(result.message);
 const cell=core.Cell.fromBase64(result.codeBoc),profile=require('../minter-contract/stonfi-v22-development-profile.json'),wallet=core.Cell.fromBase64(profile.codes.lpWallet.boc);
 const slice=wallet.beginParse(true),type=slice.loadUint(8),expected=wallet.type===2&&type===2?slice.loadBuffer(32).toString('hex'):wallet.hash().toString('hex');
 const {setup,snap,decode}=require('../tests/settlement-runtime/stonfi-snapshot-support'),chain=await setup(),router=core.Address.parse(snap.accounts.router.address);
 const version=(await chain.runGetMethod(router,'get_router_version')).stackReader;
 const routerVersion={major:version.readBigNumber().toString(),minor:version.readBigNumber().toString(),development:version.readString()};
 const data=(await chain.runGetMethod(router,'get_router_data')).stackReader;data.readBigNumber();const poolType=data.readString();data.readBoolean();
 const admin=data.readAddress(),upgrade=data.readCell(),codeHash=decode(snap.accounts.router.code).hash().toString('hex');
 const routerCapture={scope:'LOCAL_CAPTURE_NOT_LIVE_CODE_PROOF',address:router.toRawString(),observedUtc:snap.observedUtc,
  version:routerVersion,poolType,codeHash,matchesExpectedReference:codeHash===profile.routerCodeReferenceHash,
  admin:admin.toRawString(),upgradeStateHash:upgrade.hash().toString('hex'),currentCodeProvenOnChain:false};

 return{routerCapture,sourceRepository:'https://github.com/ston-fi/dex-core-v2',commit:COMMIT,target:'contracts/lp_wallet.fc',license:'GPL-3.0',preprocess:{dexType:'constant_product',version:pkg.version,developmentSuffix:'',defaultIsLocked:0,defaultLPFee:20,defaultProtocolFee:10},
  funcbox:{version:'0.1.4',integrity:meta.dist.integrity,archiveSha256:crypto.createHash('sha256').update(archive).digest('hex')},
  compilerPackageVersion:require('../tests/settlement-runtime/node_modules/@ton-community/func-js/package.json').version,
  rawSourceFilesSha256:Object.fromEntries(Object.entries(rawHashes).sort(([a],[b])=>a.localeCompare(b))),
  sourceFilesSha256:Object.fromEntries(Object.entries(sources).sort(([a],[b])=>a.localeCompare(b)).map(([n,s])=>[n,crypto.createHash('sha256').update(s).digest('hex')])),
  rebuiltCodeHash:cell.hash().toString('hex'),capturedLibraryTargetHash:expected,capturedWalletWrapperHash:wallet.hash().toString('hex'),
  matchesCapturedImplementation:cell.hash().toString('hex')===expected,independentAudit:false,
  supportedInternalOperations:['TEP-74 transfer','TEP-74 internal_transfer','burn','internal_transfer/burn bounce restoration'],
  authenticatedBalanceQuery:false,authenticatedFinalDeliveryReceipt:false,notificationReplayEndpoint:false};
}
if(require.main===module)verify().then(r=>{if(process.argv.includes('--write')){const file=path.join(__dirname,'../docs/launchpad/stonfi-lp-source-v4-2026-10-30.json');fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({file,rebuiltCodeHash:r.rebuiltCodeHash,matchesCapturedImplementation:r.matchesCapturedImplementation}));}else console.log(JSON.stringify(r,null,2));if(!r.matchesCapturedImplementation)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verify};
