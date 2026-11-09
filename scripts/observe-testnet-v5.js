'use strict';
// Read-only provider observations and INVALID all-zero-signature fee simulation.
// No secret, real signature, wallet approval or broadcaster exists in this file.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../minter-contract/node_modules/@ton/core');
const {wallets}=require('./prepare-testnet-v5');
const {feesNano}=require('./quote-testnet-smoke-fees');
const {account}=require('../lib/toncenter-evidence');
const OFFICIAL='https://raw.githubusercontent.com/ton-blockchain/wallet-contract-v5/4fab977f4fae3a37c1aac216ed2b7e611a9bc2af/build/wallet_v5.compiled.json';
const pause=()=>new Promise(r=>setTimeout(r,1200));
async function json(url,options={}){
 const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('Provider HTTP '+r.status);return r.json();
}
async function observe(){
 const p=require('../docs/launchpad/testnet-v5-candidate.json'),w=wallets(),first=p.smokePlan.steps[0].message;
 const official=await json(OFFICIAL),officialCell=core.Cell.fromBoc(Buffer.from(official.hex,'hex'))[0];
 if(!officialCell.equals(w.testnet.init.code)||official.hash!==p.wallet.codeHash)throw Error('Official V5 bytecode mismatch');
 const observation={observedUtc:new Date().toISOString(),network:'-3',candidateSha256:crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),
  officialWallet:{url:OFFICIAL,codeHash:official.hash,bytecodeMatches:true},accounts:{},ownershipVerified:false,walletAppCompatibilityVerified:false,readyForSigning:false,signed:false,broadcast:false,fee:null};
 for(const [role,a]of Object.entries({operator:p.wallet.raw,...Object.fromEntries(Object.entries(p.dependentAccounts).map(([k,v])=>[k,v.raw])),curveJettonWallet:p.curveJettonWallet,buyerJettonWallet:p.buyerJettonWallet})){
  await pause();observation.accounts[role]=await account(a);
 }
 // Check both the canonical Mainnet wallet and a possible clone of Testnet
 // StateInit on Mainnet; absence is an observation, not intrinsic chain binding.
 observation.mainnet={};
 for(const [role,address]of Object.entries({canonical:p.canonicalMainnetWalletForSamePublicKey.raw,testnetAddressOnMainnet:p.wallet.raw})){
  await pause();
  const response=await json('https://toncenter.com/api/v2/getAddressInformation?address='+encodeURIComponent(address));
  if(response.ok!==true)throw Error('Mainnet observation unavailable');const data=response.result;
  const code=data.code?core.Cell.fromBase64(data.code):null;
  const d=data.data?core.Cell.fromBase64(data.data).beginParse():null;
  let signatureAllowed=null,seqno=null,walletId=null;
  if(code?.hash().toString('hex')===p.wallet.codeHash&&d){signatureAllowed=d.loadBit();seqno=d.loadUint(32);walletId=d.loadInt(32);}
  observation.mainnet[role]={address,state:data.state,balanceNano:String(data.balance),codeHash:code?code.hash().toString('hex'):null,signatureAllowed,seqno,walletId};
 }
 const to=core.Address.parseFriendly(first.address),init=core.loadStateInit(core.Cell.fromBase64(first.stateInit).beginParse());
 if(!to.isTestOnly||!core.contractAddress(0,init).equals(to.address)||first.amount!=='100000000')throw Error('Invalid exact transaction one');
 const expiry=Math.floor(Date.now()/1000)+120;
 const envelope=await w.testnet.createTransfer({seqno:0,timeout:expiry,authType:'external',sendMode:3,
  messages:[core.internal({to:to.address,value:BigInt(first.amount),bounce:to.isBounceable,init,body:core.Cell.fromBase64(first.payload)})],
  signer:async()=>Buffer.alloc(64)});
 const s=envelope.beginParse();if(s.loadUint(32)!==0x7369676e||s.loadInt(32)!==2147483645||s.loadUint(32)!==expiry||s.loadUint(32)!==0)throw Error('Wrong V5 envelope');
 await pause();
 try{
  const result=await json('https://testnet.toncenter.com/api/v2/estimateFee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   address:p.wallet.address,body:envelope.toBoc().toString('base64'),init_code:w.testnet.init.code.toBoc().toString('base64'),init_data:w.testnet.init.data.toBoc().toString('base64'),ignore_chksig:true})});
  if(result.ok!==true)throw Error('Provider estimate not available');
  const fee=feesNano(result.result.source_fees);
  observation.fee={observedUtc:new Date().toISOString(),sourceFees:result.result.source_fees,sourceFeeNano:fee.toString(),attachmentNano:first.amount,estimatedSourceDebitNano:(fee+BigInt(first.amount)).toString(),
   destinationFees:result.result.destination_fees,completeEndToEnd:false,guaranteedMaximumDebitNano:null,estimateExpiry:expiry,invalidZeroSignature:true,
   limitation:'No source funding or actual recipient execution is inferred. Requote after owner verification/funding and simulate the exact external transaction before separate approval.'};
 }catch(e){observation.fee={status:'UNAVAILABLE',reason:e.message,guaranteedMaximumDebitNano:null};}
 return observation;
}
if(require.main===module){
 if(!process.argv.includes('--read-only'))throw Error('Explicit --read-only required');
 observe().then(o=>{if(process.argv.includes('--write'))fs.writeFileSync(path.join(__dirname,'../docs/launchpad/testnet-v5-observations.json'),JSON.stringify(o,null,2)+'\n');
 console.log(JSON.stringify({observedUtc:o.observedUtc,officialWallet:o.officialWallet,accounts:Object.fromEntries(Object.entries(o.accounts).map(([k,v])=>[k,{status:v.status,balanceNano:v.balanceNano}])),mainnet:o.mainnet,fee:o.fee,readyForSigning:false},null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={observe};
