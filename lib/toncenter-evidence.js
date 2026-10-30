'use strict';
// Server-only supplement. Reuses Antigravity's protected TON Center account
// client; does not replace TonAPI, sign, broadcast or infer financial success.
const {createRequire}=require('node:module');
const minterRequire=createRequire(require('node:path').resolve(__dirname,'../minter-contract/package.json'));
const {Address,Cell}=minterRequire('@ton/core');
const {queryAccountStatusReadOnly}=require('../minter-contract/deploy-launchpad-testnet-exec');
const V2='https://testnet.toncenter.com/api/v2',V3='https://testnet.toncenter.com/api/v3';
const evidence=()=>({provider:'toncenter',network:'testnet',verification:'PROVIDER_OBSERVATION',financialOutcome:'NOT_VERIFIED'});
function friendly(input){
 const a=Address.parse(input);
 if(a.workChain!==0)throw new Error('Unsupported workchain');
 if(!input.includes(':')&&!Address.parseFriendly(input).isTestOnly)throw new Error('Testnet address required');
 return a.toString({testOnly:true});
}
async function account(input,{env=process.env,fetchImpl=globalThis.fetch}={}){
 const address=friendly(input);
 const result=await queryAccountStatusReadOnly(address,{TONCENTER_TESTNET_URL:V2,TONCENTER_API_KEY:env.TONCENTER_API_KEY||''},
  (url,options)=>fetchImpl(url,{...options,redirect:'error'}));
 if(!result.ok)return{...evidence(),status:'UNAVAILABLE'};
 const raw=result.rawResponse||{},hash=boc=>boc?Cell.fromBase64(boc).hash().toString('hex'):null;
 try{return{...evidence(),address:Address.parse(address).toRawString(),status:result.status,balanceNano:String(result.balance),
  codeHash:hash(raw.code),dataHash:hash(raw.data),lastTransaction:raw.last_transaction_id?{lt:String(raw.last_transaction_id.lt),hash:raw.last_transaction_id.hash}:null};}
 catch{return{...evidence(),status:'UNAVAILABLE'};}
}
async function boundedJson(res){
 let text='';const max=2*1024*1024;
 if(res.body?.getReader){
  const reader=res.body.getReader(),decoder=new TextDecoder();let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new Error('Response too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  finally{await reader.cancel();}
 }else{text=await res.text();if(Buffer.byteLength(text)>max)throw new Error('Response too large');}
 return JSON.parse(text);
}
async function traces(hash,{env=process.env,fetchImpl=globalThis.fetch,selector='message'}={}){
 if(typeof hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(hash))throw new Error('Exact message hash required');
 if(!['message','transaction'].includes(selector))throw new Error('Invalid trace selector');
 try{
  const headers={Accept:'application/json'};if(env.TONCENTER_API_KEY)headers['X-API-Key']=env.TONCENTER_API_KEY;
  const field=selector==='transaction'?'tx_hash':'msg_hash';
  const res=await fetchImpl(`${V3}/traces?${field}=${hash.toLowerCase()}&limit=1`,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!res.ok)return{...evidence(),status:'UNAVAILABLE'};
  const json=await boundedJson(res);
  if(!Array.isArray(json.traces)||json.traces.length>1)throw new Error('Invalid trace response');
  return{...evidence(),lookup:{kind:selector,hash:hash.toLowerCase()},status:json.traces.length?'OBSERVED':'NOT_INDEXED',traces:json.traces};
 }catch{return{...evidence(),status:'UNAVAILABLE'};}
}
module.exports={account,traces};
