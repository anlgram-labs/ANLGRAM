'use strict';
// Public GET-only capture for offline Sandbox, NOT a deployment/account proof.
const fs=require('node:fs'),path=require('node:path');
const {Cell}=require('../tests/settlement-runtime/node_modules/@ton/core');
if(!process.argv.includes('--capture')) throw new Error('Explicit --capture required; no requests sent.');
const base='https://testnet.tonapi.io/v2';
const roles={router:'0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3',
 pton:'0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f'};
async function get(url){
 for(let n=0;n<3;n++){
  const r=await fetch(url);if(r.status===429&&n<2){await new Promise(resolve=>setTimeout(resolve,2000));continue;}
  if(!r.ok)throw new Error(`GET ${url}: HTTP ${r.status}`);return r.json();
 }
}
(async()=>{
 const snapshot={network:'-3',source:'Public TonAPI GET account/library responses; no cryptographic inclusion proof or consistent-block guarantee',
  observedUtc:new Date().toISOString(),accounts:{},libraries:{}};
 const scanned=new Set();
 async function scan(cell){
  const id=cell.hash().toString('hex');if(scanned.has(id))return;scanned.add(id);
  if(cell.isExotic&&cell.type===2){
   const b=cell.beginParse(true);b.loadUint(8);const hash=b.loadBuffer(32).toString('hex');
   if(!snapshot.libraries[hash]){
    const url=`${base}/blockchain/libraries/${hash}`,r=await get(url);
    const library=Cell.fromBoc(Buffer.from(r.boc,'hex'))[0];
    if(library.hash().toString('hex')!==hash)throw new Error('Library content hash mismatch');
    snapshot.libraries[hash]={url,code:r.boc};await scan(library);
   }
  }
  for(const child of cell.refs)await scan(child);
 }
 async function captureAccount(role,address){
  const url=`${base}/blockchain/accounts/${address}`,a=await get(url);
  if(a.status!=='active'||a.address!==address||!a.code||!a.data)throw new Error('Inactive/mismatched account '+role);
  const code=Cell.fromBoc(Buffer.from(a.code,'hex'))[0],data=Cell.fromBoc(Buffer.from(a.data,'hex'))[0];
  snapshot.accounts[role]={address,url,status:a.status,balance:String(a.balance),code:a.code,data:a.data,
   codeCellHash:code.hash().toString('hex'),dataCellHash:data.hash().toString('hex'),lastTransactionLt:String(a.last_transaction_lt)};
  await scan(code);await scan(data);
 }
 for(const[role,address]of Object.entries(roles))await captureAccount(role,address);
 // Derive the existing Router pTON wallet by executing the captured master code,
 // rather than guessing an address or pretending a missing account is deployed.
 const {setup}=require('../tests/settlement-runtime/stonfi-snapshot-support');
 const core=require('../tests/settlement-runtime/node_modules/@ton/core');
 const chain=await setup(snapshot);
 const result=await chain.runGetMethod(core.Address.parse(roles.pton),'get_wallet_address',[
  {type:'slice',cell:core.beginCell().storeAddress(core.Address.parse(roles.router)).endCell()}]);
 await captureAccount('ptonWallet',result.stackReader.readAddress().toRawString());
 const file=path.join(__dirname,'../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json');
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({file,observedUtc:snapshot.observedUtc,accounts:Object.fromEntries(Object.entries(snapshot.accounts).map(([r,a])=>[r,{address:a.address,codeHash:a.codeCellHash}])),libraries:Object.keys(snapshot.libraries).length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
