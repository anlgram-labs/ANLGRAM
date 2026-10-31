'use strict';
// Current provider fee estimation, NEVER signing or broadcasting. Each invalid
// zero-signature envelope is simulated independently against current source state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../tests/settlement-runtime/node_modules/@ton/core');
const {WalletContractV4}=require('../minter-contract/node_modules/@ton/ton');
const evidence=require('../lib/toncenter-evidence');
const {OPERATOR_INPUT}=require('../minter-contract/prepare-settlement-testnet');
const ENDPOINT='https://testnet.toncenter.com/api/v2/estimateFee';
function unsignedEnvelope(wallet,message,seqno){
 const to=core.Address.parseFriendly(message.address);if(!to.isTestOnly||to.address.workChain!==0)throw Error('Testnet destination required');
 if(!Number.isSafeInteger(seqno)||seqno<0||seqno>0xffffffff)throw Error('Invalid seqno');
 const init=message.stateInit?core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse()):undefined;
 if(init&&!core.contractAddress(0,init).equals(to.address))throw Error('StateInit destination mismatch');
 const internal=core.internal({to:to.address,value:BigInt(message.amount),body:core.Cell.fromBase64(message.payload),init,bounce:to.isBounceable});
 // Standard V4 sendMsg layout; 64 zero bytes are NOT a cryptographic signature.
 return core.beginCell().storeBuffer(Buffer.alloc(64)).storeUint(wallet.walletId,32).storeUint(0xffffffff,32).storeUint(seqno,32)
  .storeUint(0,8).storeUint(3,8).storeRef(core.beginCell().store(core.storeMessageRelaxed(internal)).endCell()).endCell();
}
function feesNano(f){return ['in_fwd_fee','storage_fee','gas_fee','fwd_fee'].reduce((n,k)=>{
 const v=f?.[k];if(!(typeof v==='number'&&Number.isSafeInteger(v)&&v>=0)&&!(typeof v==='string'&&/^\d+$/.test(v)))throw Error('Malformed fee response');return n+BigInt(v);
},0n);}
async function quote(plan,{fetchImpl=globalThis.fetch,env=process.env,delay=()=>new Promise(r=>setTimeout(r,1100))}={}){
 if(plan.network!=='-3'||plan.broadcastEnabled!==false||plan.operator.raw!==core.Address.parse(OPERATOR_INPUT).toRawString())throw Error('Unapproved plan network/operator');
 const publicUrl='https://tonapi.io/v2/blockchain/accounts/'+plan.operator.raw+'/methods/get_public_key';
 const pkResponse=await fetchImpl(publicUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!pkResponse.ok)throw Error('Public wallet identity unavailable');const key=await pkResponse.json();
 if(key.success!==true||key.exit_code!==0||key.stack?.[0]?.type!=='num'||!/^0x[a-f0-9]{1,64}$/i.test(key.stack[0].num))throw Error('Public key unavailable');
 const wallet=WalletContractV4.create({workchain:0,publicKey:Buffer.from(BigInt(key.stack[0].num).toString(16).padStart(64,'0'),'hex')});
 if(wallet.address.toRawString()!==plan.operator.raw)throw Error('Public key/standard Wallet V4 address mismatch');
 // V4 signed bodies do not contain a chain ID. The same raw wallet is used on
 // Mainnet, so every proposed Testnet nonce must already be obsolete there.
 const seqResponse=await fetchImpl('https://tonapi.io/v2/blockchain/accounts/'+plan.operator.raw+'/methods/seqno',{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!seqResponse.ok)throw Error('Mainnet nonce observation unavailable');const seq=await seqResponse.json();
 if(seq.success!==true||seq.exit_code!==0||seq.stack?.[0]?.type!=='num'||!/^0x[a-f0-9]{1,8}$/i.test(seq.stack[0].num))throw Error('Mainnet nonce observation invalid');
 const mainnetSeqno=Number(BigInt(seq.stack[0].num)),maximumTestnetSeqno=plan.steps.length+2;
 if(mainnetSeqno<=maximumTestnetSeqno)throw Error('Shared V4 nonce range overlaps Mainnet; require a separately reviewed test-only operator');
 const account=await evidence.account(plan.operator.raw,{env,fetchImpl});
 if(account.status!=='uninitialized')throw Error('This unsigned quote supports only the observed uninitialized operator; recheck active-wallet seqno/code explicitly');
 const quotes=[];
 for(const step of plan.steps){
  await delay();const body=unsignedEnvelope(wallet,step.message,0),args={address:wallet.address.toString({testOnly:true}),body:body.toBoc().toString('base64'),
   init_code:wallet.init.code.toBoc().toString('base64'),init_data:wallet.init.data.toBoc().toString('base64'),ignore_chksig:true};
  const headers={'Content-Type':'application/json'};if(env.TONCENTER_API_KEY)headers['X-API-Key']=env.TONCENTER_API_KEY;
  const r=await fetchImpl(ENDPOINT,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Fee estimate HTTP '+r.status);const result=await r.json();if(result.ok!==true)throw Error('Provider fee estimate unavailable');
  const sum=feesNano(result.result?.source_fees);
  quotes.push({step:step.name,destination:step.message.address,attachmentNano:step.message.amount,payloadHash:core.Cell.fromBase64(step.message.payload).hash().toString('hex'),
   sourceFeesNano:sum.toString(),sourceFees:result.result.source_fees,destinationExecutionFeesVerified:false,destinationFees:result.result.destination_fees??null,
   estimationContext:'Independent current-state seqno-0 source-wallet estimate; later-step destination state is not deployed.'});
 }
 const first=BigInt(quotes[0].attachmentNano)+BigInt(quotes[0].sourceFeesNano),balance=BigInt(account.balanceNano);
 return{observedUtc:new Date().toISOString(),provider:'TON Center Testnet estimateFee',planSha256:crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex'),
  walletSdkVersion:require('../minter-contract/node_modules/@ton/ton/package.json').version,walletVersion:'V4',operator:plan.operator.raw,
  walletPublicKey:wallet.publicKey.toString('hex'),walletCodeHash:wallet.init.code.hash().toString('hex'),walletInitialDataHash:wallet.init.data.hash().toString('hex'),
  addressBindingVerified:true,ownershipCryptographicallyVerified:false,account,quotes,
  mainnetReplayObservation:{mainnetSeqno,proposedTestnetSeqnoMinimum:0,proposedTestnetSeqnoMaximum:maximumTestnetSeqno,rangeSeparatedAtObservation:true,
   requirement:'Before EACH real Testnet signature recheck both chains; stop on any source-state/nonce change or range overlap. No chain-binding signature is assumed for V4.'},
  sourceFeeSumNano:quotes.reduce((n,q)=>n+BigInt(q.sourceFeesNano),0n).toString(),firstTransactionEstimatedRequiredNano:first.toString(),
  firstTransactionEstimatedShortfallNano:(first>balance?first-balance:0n).toString(),
  proposedEnvelopeNano:plan.proposedSmokeBudget.maximumTestnetNano,proposedEnvelopeShortfallNano:(BigInt(plan.proposedSmokeBudget.maximumTestnetNano)>balance?BigInt(plan.proposedSmokeBudget.maximumTestnetNano)-balance:0n).toString(),
  liveEndToEndFeeQuoteComplete:false,readyForSigning:false,signed:false,broadcast:false,
  limitation:'Empty destination_fees is not zero future execution cost. Later-state, sell, wallet activation/rent and recovery costs require fresh confirmation before signing.'};
}
if(require.main===module){
 if(!process.argv.includes('--read-only'))throw Error('Explicit --read-only required; no requests sent');
 const file=path.join(__dirname,'../docs/launchpad/supervised-smoke-candidate-2026-10-31.json');
 quote(JSON.parse(fs.readFileSync(file,'utf8'))).then(r=>{if(process.argv.includes('--write')){const out=path.join(__dirname,'../docs/launchpad/testnet-fee-observations-2026-10-31.json');fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(out);}else console.log(JSON.stringify(r,null,2));}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={unsignedEnvelope,feesNano,quote};
