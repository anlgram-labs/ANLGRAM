'use strict';
// New deterministic destinations only. No provider, signer or deployment.
const fs=require('node:fs'),path=require('node:path');
const {buildCandidate}=require('../prepare-settlement-testnet'),lp=require('./lp-locker-v2'),ston=require('./stonfi-v22-addresses');
function build(core,o){
 const get=n=>{const j=JSON.parse(fs.readFileSync(path.join(__dirname,'../build',n+'.compiled.json'),'utf8')),c=core.Cell.fromBase64(j.codeBocBase64);if(c.hash().toString('hex')!==(j.codeCellHash||j.codeHash))throw Error('Artifact mismatch');return j;};
 if(!o.metadata?.name||!o.metadata?.symbol||!o.projectId)throw Error('Explicit new project metadata and identity required');
 const artifacts=Object.fromEntries(['anlgram-settlement-wallet','anlgram-launchpad-jetton-minter','anlgram-bonding-curve','anlgram-lp-auth-guard','anlgram-migration-router'].map(n=>[n,get(n)]));
 artifacts['anlgram-bonding-curve']=get('anlgram-bonding-curve-v2');artifacts['anlgram-migration-router']=get('anlgram-migration-router-v2');
 const c=buildCandidate(o.creator,core,{artifacts,metadata:{...o.metadata,decimals:'9',anlgram_project_id:o.projectId,anlgram_protocol:'migration-v2-development'}}),b=core.beginCell;
 const wallet=who=>core.contractAddress(0,{code:c.wallet,data:b().storeCoins(0).storeAddress(who).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});
 const pton=core.Address.parse(require('../../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json').accounts.ptonWallet.address);
 const options={creator:c.operator,contributor:c.operator,router:c.dex,pairWallet0:wallet(c.dex),pairWallet1:pton,operationId:o.operationId,percent:o.percent,duration:o.duration,beneficiary:o.beneficiary??c.operator,unlockedController:o.unlockedController??c.operator};
 const normalized=lp.build(core,options).terms,q=BigInt(normalized.operationId);if(q<=0n||q>=(1n<<62n))throw Error('Migration operation must be in 1..2^62-1');
 const endpoints=b().storeAddress(c.dex).storeAddress(wallet(c.dex)).storeAddress(pton).endCell(),parties=b().storeAddress(core.Address.parse(normalized.beneficiary)).storeAddress(core.Address.parse(normalized.unlockedController)).endCell();
 const intent=b().storeUint(0x4c503249,32).storeUint(normalized.percent,7).storeUint(normalized.duration,32).storeUint(q,64).storeRef(endpoints).storeRef(parties).storeRef(ston.profileCell(core)).endCell();
 const record=b().storeUint(0x4d563242,32).storeRef(intent).storeMaybeRef(null).storeMaybeRef(null).endCell(),ids=core.Dictionary.empty(core.Dictionary.Keys.BigUint(64),core.Dictionary.Values.Cell());ids.set(0n,record);
 const flight=b().storeUint(0,64).storeUint(0,64).storeUint(0,3).storeAddress(null).storeAddress(null).storeDict(ids).endCell();
 const data=c.states.migration.data.beginParse(),root=b().storeBit(data.loadBit()).storeAddress(data.loadAddress()).storeAddress(data.loadAddress()).storeAddress(data.loadAddress()).storeRef(data.loadRef()).storeRef(data.loadRef()).storeRef(flight).endCell();
 c.states.migration={code:c.states.migration.code,data:root};c.addresses.migration=core.contractAddress(0,c.states.migration);
 const vault=lp.build(core,{...options,contributor:c.addresses.migration});
 const initCurve=b().storeUint(0x414e4c01,32).storeUint(1,64).storeAddress(c.addresses.minter).storeAddress(c.curveWallet).storeRef(b().storeAddress(c.dex).storeAddress(c.addresses.guard).storeAddress(c.addresses.migration).endCell()).storeRef(c.wallet).storeRef(b().store(core.storeStateInit(c.states.migration)).endCell()).endCell();
 const bind=b().storeUint(0x414e5a01,32).storeUint(q,64).storeRef(b().store(core.storeStateInit(vault.init)).endCell()).endCell();
 return{...c,vault,intent,terms:vault.terms,initCurve,bind,operationId:q,ptonWallet:pton,routerTokenWallet:wallet(c.dex),migrationSupported:false,financialSigningEnabled:false,
  compatibility:'New Curve V2 init adds exact Migrator StateInit reference. Migrator V2 genesis reserves used_ids[0] for immutable terms. Existing V1 cells/addresses are not compatible or modified.'};
}
function prepareExecution(core,c,minimumLpUnits){
 if(typeof minimumLpUnits!=='bigint'&&!(typeof minimumLpUnits==='string'&&/^\d+$/.test(minimumLpUnits)))throw Error('Explicit exact LP minimum required');const min=BigInt(minimumLpUnits);if(min<=0n||min>=(1n<<120n))throw Error('LP minimum out of range');
 return{to:c.addresses.migration,value:400000000n,body:core.beginCell().storeUint(0x414e4c37,32).storeUint(c.operationId,64).storeAddress(c.routerTokenWallet).storeAddress(c.vault.lpWallet).storeAddress(c.ptonWallet).storeCoins(min).endCell(),financialSigningEnabled:false,migrationAuthorized:false,requiresFreshQuoteAndOwnerApproval:true};
}
function prepareRegistration(core,c,{starts,deadline,minimumLpUnits,curveEpoch,fundingEpoch,dexEpoch,tonNano,jettonUnits}){
 if(!Number.isInteger(starts)||!Number.isInteger(deadline)||starts<1||deadline<=starts||deadline>0xffffffff||deadline-starts>60)throw Error('Explicit at-most60s registration window required');
 const exact=x=>{if(typeof x!=='bigint'&&!(typeof x==='string'&&/^\d+$/.test(x)))throw Error('Exact registration integers required');const n=BigInt(x);if(n<=0n)throw Error('Positive registration values required');return n;};
 const min=exact(minimumLpUnits),ce=exact(curveEpoch),fe=exact(fundingEpoch),de=exact(dexEpoch),ton=exact(tonNano),tokens=exact(jettonUnits);
 if(min>=(1n<<120n)||ton>=(1n<<120n)||tokens!==200000000000000000n||ton<500000000000n||[ce,fe,de].some(x=>x>0xffffffffffffffffn))throw Error('Registration reserve/epoch bounds');
 const epochs=core.beginCell().storeUint(ce,64).storeUint(fe,64).storeUint(de,64).storeCoins(ton).storeCoins(tokens).endCell();
 const context=core.beginCell().storeAddress(c.addresses.curve).storeAddress(c.addresses.migration).storeRef(core.beginCell().storeAddress(c.vault.address).storeBuffer(c.intent.hash()).endCell()).endCell();
 return{to:c.addresses.migration,authenticatedSource:c.addresses.guard,value:40000000n,body:core.beginCell().storeUint(0x414e5a03,32).storeUint(c.operationId,64).storeUint(starts,32).storeUint(deadline,32).storeCoins(min).storeRef(epochs).storeRef(context).endCell(),financialSigningEnabled:false,migrationAuthorized:false,guardCurrentlySupportsPositiveRegistration:false,requiresQualifiedIndependentReview:true};
}
function prepareCustodyRecovery(core,c,{retry=false,candidateUnits}={}){
 if(typeof retry!=='boolean'||c.terms.percent!==100||c.terms.duration!==0)throw Error('Only initial permanent100% custody-floor recovery is supported');
 const b=core.beginCell().storeUint(0x414e5a04,32).storeUint(c.operationId,64).storeBit(retry);
 if(!retry){if(typeof candidateUnits!=='bigint'&&!(typeof candidateUnits==='string'&&/^\d+$/.test(candidateUnits)))throw Error('Exact custody candidate required');const n=BigInt(candidateUnits);if(n<=0n||n>=(1n<<120n))throw Error('Candidate out of range');b.storeCoins(n);}
 else if(candidateUnits!==undefined)throw Error('A funded retry must preserve the existing candidate/nonce');
 return{to:c.addresses.migration,value:150000000n,body:b.endCell(),proofScope:'CUSTODY_FLOOR_ONLY_NOT_EXACT_ISSUANCE',financialSigningEnabled:false,migrationAuthorized:false,requiresSeparateApproval:true};
}
module.exports={build,prepareExecution,prepareRegistration,prepareCustodyRecovery};
