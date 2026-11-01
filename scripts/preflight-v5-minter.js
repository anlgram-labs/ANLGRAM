'use strict';
// Exactly transaction #1: invalid-zero-signature EMULATION ONLY, never broadcast.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const core=require('../minter-contract/node_modules/@ton/core');
const {wallets}=require('./prepare-testnet-v5'),{verifyArtifacts}=require('../lib/verified-contract-artifacts');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const raw=x=>core.Address.parse(x).toRawString(),hex=x=>Buffer.from(x,'base64').toString('hex');
const TESTNET='https://testnet.toncenter.com',MAINNET='https://toncenter.com';
const sleep=()=>new Promise(r=>setTimeout(r,1200));
const json=require('../lib/toncenter-preflight-client').createClient();
async function account(base,address){await sleep();const r=await json(base+'/api/v2/getAddressInformation?address='+encodeURIComponent(address));assert.equal(r.status,200);assert.equal(r.value.ok,true);return r.value.result;}
async function external(wallet,m,seqno,expiry,source=wallet.address,init=wallet.init){
 const to=core.Address.parseFriendly(m.address),state=core.loadStateInit(core.Cell.fromBase64(m.stateInit).beginParse());
 const body=await wallet.createTransfer({seqno,timeout:expiry,authType:'external',sendMode:3,
  messages:[core.internal({to:to.address,value:BigInt(m.amount),bounce:to.isBounceable,init:state,body:core.Cell.fromBase64(m.payload)})],signer:async()=>Buffer.alloc(64)});
 const s=body.beginParse();assert.equal(s.loadUint(32),0x7369676e);assert.equal(s.loadInt(32),2147483645);assert.equal(s.loadUint(32),expiry);assert.equal(s.loadUint(32),seqno);
 return{body,boc:core.beginCell().store(core.storeMessage(core.external({to:source,init,body}))).endCell().toBoc().toString('base64')};
}
function analyze(trace,p,bodyHash){return require('../lib/v5-minter-trace').analyze(trace,p,bodyHash,core);}
function verifyUnchangedSources(p){
 for(const [name,entry]of Object.entries(p.sourceVerification.contracts)){
  for(const [file,expected]of Object.entries(entry.sourceFilesSha256)){
   const value=fs.readFileSync(path.join(root,'minter-contract/contracts',file),'utf8').replace(/\r\n/g,'\n');
   assert.equal(crypto.createHash('sha256').update(value).digest('hex'),expected,'Changed compiled source: '+file);
  }
  const artifact=JSON.parse(fs.readFileSync(path.join(root,'minter-contract/build',name+'.compiled.json'),'utf8'));
  const code=core.Cell.fromBase64(artifact.codeBocBase64);assert.equal(code.hash().toString('hex'),entry.codeHash);assert.equal(artifact.codeCellHash||artifact.codeHash,entry.codeHash);
 }
 assert.equal(Object.keys(p.sourceVerification.contracts).length,7);return p.sourceVerification;
}
async function run({hashOnly=false}={}){
 const p=require('../docs/launchpad/testnet-v5-candidate.json'),active=require('../docs/launchpad/active-testnet-candidate.json'),w=wallets();assert.equal(sha(p),active.candidateSha256);assert.equal(p.network,'-3');assert.equal(p.readyForSigning,false);
 const source=hashOnly?verifyUnchangedSources(p):await verifyArtifacts();assert.deepEqual(source,p.sourceVerification);
 const m=p.smokePlan.steps[0].message,init=core.loadStateInit(core.Cell.fromBase64(m.stateInit).beginParse()),to=core.Address.parseFriendly(m.address);
 assert.equal(to.isTestOnly,true);assert.equal(core.contractAddress(0,init).toRawString(),p.dependentAccounts.minter.raw);assert.equal(m.amount,'100000000');
 const data=init.data.beginParse();assert.equal(data.loadCoins(),0n);assert.equal(data.loadAddress().toRawString(),p.wallet.raw);
 const metadata=data.loadRef().beginParse();assert.equal(metadata.loadUint(8),0);const dict=metadata.loadDict(core.Dictionary.Keys.BigUint(256),core.Dictionary.Values.Cell());assert.equal(dict.size,3);
 for(const[k,v]of Object.entries({name:'ANLGRAM Testnet Settlement',symbol:'ANLTEST',decimals:'9'})){const c=dict.get(BigInt('0x'+crypto.createHash('sha256').update(k).digest('hex'))).beginParse();assert.equal(c.loadUint(8),0);assert.equal(c.loadStringTail(),v);}
 assert.equal(data.loadRef().hash().toString('hex'),source.contracts['anlgram-settlement-wallet'].codeHash);
 let operator,destination;
 if(process.argv.includes('--protected-reads')){
  const r=await fetch('https://testnet.anlgram.com/api/preflight/accounts',{method:'POST',headers:{Origin:'https://testnet.anlgram.com','Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'Protected fresh Testnet reads unavailable');const j=await r.json();assert.equal(j.network,'-3');
  for(const name of ['operator','minter']){assert.equal(j.observations[name].dataStatus,'FRESH_PROVIDER_OBSERVATION');assert(Math.abs(Date.now()-j.observations[name].observedAt)<10000);}
  operator=j.observations.operator.account;destination=j.observations.minter.account;
 }else{operator=await account(TESTNET,p.wallet.raw);destination=await account(TESTNET,p.dependentAccounts.minter.raw);}
 assert.equal(operator.state,'uninitialized');assert.equal(destination.state,'uninitialized');assert(!operator.code&&!destination.code);assert.equal(destination.balance,'0');
 const main=await account(MAINNET,w.mainnet.address.toRawString()),clone=await account(MAINNET,p.wallet.raw);
 assert.equal(core.Cell.fromBase64(main.code).hash().toString('hex'),p.wallet.codeHash);const mainData=core.Cell.fromBase64(main.data).beginParse();assert(mainData.loadBit());const mainSeqno=mainData.loadUint(32);assert.equal(mainData.loadInt(32),2147483409);assert.equal(mainData.loadBuffer(32).toString('hex'),p.wallet.publicKey);
 assert.equal(clone.state,'uninitialized');assert.equal(clone.balance,'0');
 let expiry=Math.floor(Date.now()/1000)+120,request,response;
 if(process.argv.includes('--protected-reads')){
  const r=await fetch('https://testnet.anlgram.com/api/preflight/fees',{method:'POST',headers:{Origin:'https://testnet.anlgram.com','Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'Protected Testnet emulation unavailable');const j=await r.json();assert.equal(j.network,'-3');assert.equal(j.dataStatus,'FRESH_PROVIDER_OBSERVATION');assert(Math.abs(Date.now()-j.observedAt)<10000);assert(j.validUntil>Math.floor(Date.now()/1000)&&j.validUntil<=Math.floor(Date.now()/1000)+120);expiry=j.validUntil;request=await external(w.testnet,m,0,expiry);assert.equal(request.body.hash().toString('hex'),j.bodyHash,'Server emulated another request');response={status:200,value:j.trace};
 }else{request=await external(w.testnet,m,0,expiry);await sleep();response=await json(TESTNET+'/api/emulate/v1/emulateTrace',{boc:request.boc,ignore_chksig:true,include_code_data:true,with_actions:false});}
 assert.equal(response.status,200);
 const simulation=analyze(response.value,p,request.body.hash().toString('hex'));assert.equal(simulation.operatorBalanceBeforeNano,operator.balance);
 // Equal nonce isolates the wallet-ID check, rather than relying on nonce drift.
 const negative=await external(w.testnet,m,mainSeqno,expiry,w.mainnet.address,null);
 await sleep();const rejected=await json(MAINNET+'/api/emulate/v1/emulateTrace',{boc:negative.boc,ignore_chksig:true});
 const mainnetWrongIdRejected=rejected.status!==200&&/EmulationExternalNotAccepted: 134\b/.test(rejected.value.error||'');
 const owner=JSON.parse(fs.readFileSync(path.join(root,'docs/launchpad/testnet-domain-owner-proof.json'),'utf8'));
 const proofFresh=owner.origin==='https://testnet.anlgram.com'&&owner.operator===p.wallet.raw&&owner.network==='-3'&&owner.cryptographicTonProofVerified===true&&Date.parse(owner.verificationDisplayedExpiresAt)>Date.now();
 return{observedUtc:new Date().toISOString(),commitBaseline:'7ebe087',network:'-3',candidateSha256:sha(p),sourceVerification:source,
  operator:{address:p.wallet.address,raw:p.wallet.raw,version:'V5R1',walletId:2147483645,balanceNano:operator.balance,state:operator.state,initialSeqno:0,lastTransaction:operator.last_transaction_id},
  destination:{address:m.address,raw:p.dependentAccounts.minter.raw,state:destination.state,codeHash:init.code.hash().toString('hex'),dataHash:init.data.hash().toString('hex'),stateInitHash:core.Cell.fromBase64(m.stateInit).hash().toString('hex'),metadata:{name:'ANLGRAM Testnet Settlement',symbol:'ANLTEST',decimals:9},admin:p.wallet.raw,supply:'0'},
  simulation,requestIntent:{messages:1,attachmentNano:m.amount,sendMode:3,maxFutureValiditySeconds:120,requiresNoAutomaticRetries:true,oneAttemptExecutorVerified:false,simulatedValidUntilUnix:expiry,onlyTransactionOne:true,bodyHash:core.Cell.fromBase64(m.payload).hash().toString('hex'),notASigningRequest:true},
  replay:{canonicalMainnetSeqno:mainSeqno,canonicalMainnetWalletId:2147483409,sameNonceWrongWalletIdEmulationRejected:mainnetWrongIdRejected,rejectionStatus:rejected.status,rejection:rejected.value.error||null,testnetCloneOnMainnetUninitializedAndUnfunded:true,
   limitation:'V5 wallet_id separates canonical configurations, not an intrinsic global-ID VM check. A deliberately funded identical-StateInit clone remains replay-capable; no absolute cross-network non-replay guarantee is claimed.'},
  ownership:{freshAtObservation:proofFresh,domain:owner.origin,expiresAt:owner.verificationDisplayedExpiresAt,actualTransactionSigningTested:false},sourceCheckMode:hashOnly?'SOURCE_AND_ARTIFACT_HASHES_AGAINST_PREVIOUSLY_COMPILED_CANDIDATE':'FRESH_COMPILATION',
  providerAuthentication:{testnetAccountReads:process.argv.includes('--protected-reads')?'PROTECTED_SERVER_READS':process.env.TONCENTER_TESTNET_API_KEY?'LOCAL_TESTNET_KEY':'ANONYMOUS',testnetEmulation:process.argv.includes('--protected-reads')?'PROTECTED_SERVER_EMULATION':process.env.TONCENTER_TESTNET_API_KEY?'LOCAL_TESTNET_KEY':'ANONYMOUS'},readyForBroadcast:false,signed:false,broadcast:false,spentNano:'0',financialControlsEnabled:false,
  limitations:['Provider emulation skips signature verification; genuine owner ton_proof is separate evidence, not an executed transaction.','Actual wallet transaction signing is deliberately untested; do not claim it was verified by ton_proof.','0.12 TON is a proposed policy ceiling, not a cap enforced by V5/TON Connect. Revalidate state, fees and proof before any future signing.','The first external request also activates the currently uninitialized operator wallet. Only one internal deployment message targets the minter.','No absolute Mainnet replay guarantee against a funded identical-StateInit clone.']};
}
if(require.main===module){if(!process.argv.includes('--read-only'))throw Error('Explicit --read-only required');run({hashOnly:process.argv.includes('--hash-only')}).then(r=>{if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'docs/launchpad/v5-minter-final-preflight.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({...r,sourceVerification:{contracts:Object.keys(r.sourceVerification.contracts).length}},null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={analyze,external,run,verifyUnchangedSources};
