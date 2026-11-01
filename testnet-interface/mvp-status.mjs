import {Address,Cell,loadStateInit} from '@ton/core';
import candidate from '../docs/launchpad/testnet-v5-candidate.json' with {type:'json'};
import {accountRead} from './testnet-rpc.mjs';
const raw=x=>Address.parse(x).toRawString(),hash=c=>c.hash().toString('hex');
const parse=s=>Cell.fromBase64(s);
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const integer=e=>{requireValue(e?.[0]==='num'&&/^-?(?:0x[0-9a-f]+|\d+)$/i.test(e[1]),'Invalid getter integer');return e[1].startsWith('-0x')?-BigInt(e[1].slice(1)):BigInt(e[1]);};
function getterCell(e){requireValue(['cell','slice'].includes(e?.[0])&&typeof e[1]?.bytes==='string','Invalid getter cell');return parse(e[1].bytes);}
function wallet(account,owner){
 if(account.state==='uninitialized'){requireValue(!account.code,'Unexpected uninitialized code');return{state:'NOT_DEPLOYED',balanceUnits:null,owner,master:candidate.dependentAccounts.minter.raw,custodyVerified:false};}
 requireValue(account.state==='active'&&hash(parse(account.code))===candidate.sourceVerification.contracts['anlgram-settlement-wallet'].codeHash,'Unexpected settlement wallet code/state');
 const s=parse(account.data).beginParse(),balance=s.loadCoins(),actualOwner=s.loadAddress().toRawString(),master=s.loadAddress().toRawString(),code=s.loadRef();
 // Optional settlement dictionaries follow the canonical TEP-74 fields.
 requireValue(actualOwner===owner&&master===candidate.dependentAccounts.minter.raw&&hash(code)===candidate.sourceVerification.contracts['anlgram-settlement-wallet'].codeHash,'Wrong wallet owner/master/code');
 return{state:'ACTIVE',balanceUnits:balance.toString(),owner,master,custodyVerified:true};
}
export function analyzeStatus(observations,now=Date.now()){
 const names=['minter','jettonData','curve','curveWallet','buyerWallet'];
 for(const name of names){const o=observations[name];requireValue(o?.network==='-3'&&o.authentication==='TESTNET_KEY_ACCEPTED'&&['FRESH_PROVIDER_OBSERVATION','SHORT_LIVED_CACHE'].includes(o.dataStatus)&&Number.isSafeInteger(o.observedAt)&&Math.abs(now-o.observedAt)<15000,'Fresh authenticated display observation unavailable');}
 const m=observations.minter.account;requireValue(m.state==='active'&&hash(parse(m.code))===candidate.dependentAccounts.minter.codeHash,'Minter identity/state mismatch');
 const ms=parse(m.data).beginParse(),supply=ms.loadCoins(),admin=ms.loadAddressAny(),content=ms.loadRef(),code=ms.loadRef();ms.endParse();
 const original=loadStateInit(parse(candidate.smokePlan.steps[0].message.stateInit).beginParse());
 requireValue(hash(code)===candidate.sourceVerification.contracts['anlgram-settlement-wallet'].codeHash,'Wrong minter wallet family');
 // The immutable content cell is referenced by the pinned initial minter data.
 requireValue(hash(original.data.refs[0])===hash(content),'Unexpected immutable metadata');
 requireValue(supply<=1000000000000000000n,'Unexpected token supply');
 const expectedAdmin=admin===null?null:admin.toRawString();requireValue(expectedAdmin===null||expectedAdmin===candidate.wallet.raw,'Unexpected minter administrator');
 const g=observations.jettonData.getterResult;requireValue(g?.exit_code===0&&g.stack?.length===5,'Minter getter unavailable');
 const getterAdmin=getterCell(g.stack[2]).beginParse().loadAddressAny();
 requireValue(integer(g.stack[0])===supply&&integer(g.stack[1])===-1n&&(getterAdmin===null?null:getterAdmin.toRawString())===expectedAdmin&&hash(getterCell(g.stack[3]))===hash(content)&&hash(getterCell(g.stack[4]))===hash(code),'Storage/getter mismatch');
 const curve=observations.curve.account;let curveState=null,reserves=null;
 if(curve.state==='uninitialized')requireValue(!curve.code,'Unexpected uninitialized Curve code');
 else{
  requireValue(curve.state==='active'&&hash(parse(curve.code))===candidate.dependentAccounts.curve.codeHash,'Unexpected Curve code/state');
  const cs=parse(curve.data).beginParse();curveState=cs.loadUint(8);requireValue(curveState<=8&&cs.loadUint(16)===100,'Unexpected Curve state/fee');
  const addresses=cs.loadRef().beginParse();requireValue(addresses.loadAddress().toRawString()===candidate.wallet.raw&&addresses.loadAddress().toRawString()===candidate.wallet.raw,'Unexpected Curve admin/creator');addresses.loadAddress();const links=addresses.loadRef().beginParse();requireValue(links.loadAddress().toRawString()===candidate.dependentAccounts.minter.raw,'Curve references wrong minter');const cw=links.loadAddressAny();requireValue(cw===null||cw.toRawString()===raw(candidate.curveJettonWallet),'Wrong Curve wallet');
  const rs=cs.loadRef().beginParse(),keys=['realTonReserveNano','curveInventoryUnits','accruedProtocolFeesNano','pendingRefundUnits','virtualTonNano','virtualTokenUnits','graduationThresholdNano','dexAllocationUnits'];reserves=Object.fromEntries(keys.map(k=>[k,rs.loadCoins().toString()]));rs.endParse();
 }
 const curveWallet=wallet(observations.curveWallet.account,candidate.dependentAccounts.curve.raw),buyerWallet=wallet(observations.buyerWallet.account,candidate.wallet.raw);
 const stage=curveState===null?'CURVE_NOT_DEPLOYED':curveState===0?'CURVE_NOT_INITIALIZED':curveState===1?'MINT_AND_CUSTODY_REQUIRED':curveState===2?'RENOUNCEMENT_CONFIRMATION_REQUIRED':curveState===3?'ACTIVE_CONTRACT_OBSERVED_FINANCIAL_ACTIONS_DISABLED':'GRADUATION_OR_RECOVERY_REQUIRES_REVIEW';
 return{network:'-3',observedUtc:new Date(now).toISOString(),scope:'ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS',dataStatus:names.some(n=>observations[n].dataStatus==='SHORT_LIVED_CACHE')?'INCLUDES_SHORT_LIVED_CACHE':'FRESH_PROVIDER_OBSERVATIONS',observations:names.map(name=>({name,observedAt:observations[name].observedAt,dataStatus:observations[name].dataStatus})),stage,minter:{address:candidate.dependentAccounts.minter.testnet,supplyUnits:supply.toString(),decimals:9,symbol:'ANLTEST',name:'ANLGRAM Testnet Settlement',admin:expectedAdmin,renouncedObserved:admin===null},curve:{address:candidate.dependentAccounts.curve.testnet,accountState:curve.state,protocolState:curveState,reserves},curveWallet,buyerWallet,financialSigningEnabled:false,migrationEnabled:false,lpWithdrawalsEnabled:false,transactionOutcome:'NOT_VERIFIED_BY_ACCOUNT_SNAPSHOT'};
}
export async function readMvpStatus(env){
 const observations={};for(const name of ['minter','jettonData','curve','curveWallet','buyerWallet']){const r=await accountRead(env,name,false),j=await r.json();if(!r.ok)return Response.json({...j,financialSigningEnabled:false},{status:r.status,headers:{'Cache-Control':'no-store','Retry-After':r.headers.get('Retry-After')||'1'}});observations[name]=j;}
 return Response.json(analyzeStatus(observations),{headers:{'Cache-Control':'no-store'}});
}
