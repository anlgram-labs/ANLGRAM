'use strict';
// Local TVM replay from observed public V5/minter state. Curve is NOT seeded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Blockchain,createShardAccount}=require('@ton/sandbox'),core=require('@ton/core'),{compileFunc}=require('@ton-community/func-js');
const {wallets}=require('../../scripts/prepare-testnet-v5'),{external}=require('../../scripts/preflight-v5-minter');
const p=require('../../docs/launchpad/testnet-v5-candidate.json'),intent=require('../../testnet-interface/curve-two-intent.json');
const contracts=path.resolve(__dirname,'../../minter-contract/contracts');let compiled;
function codes(){return compiled??=(async()=>{const entries=await Promise.all(['anlgram-bonding-curve','anlgram-launchpad-jetton-minter','anlgram-settlement-wallet'].map(async name=>{const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(contracts,f),'utf8')});assert.equal(r.status,'ok',r.message);const c=core.Cell.fromBase64(r.codeBoc);assert.equal(c.hash().toString('hex'),p.sourceVerification.contracts[name].codeHash);return[name,c];}));return Object.fromEntries(entries);})();}
async function setup({balance}={}){
 const sourceCodes=await codes(),report=require('../../docs/launchpad/testnet-curve-two-preflight.json'),w=wallets().testnet;
 const chain=await Blockchain.create();chain.now=Math.floor(Date.now()/1000);chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
 const sourceData=core.beginCell().storeBit(true).storeUint(1,32).storeInt(2147483645,32).storeBuffer(Buffer.from(p.wallet.publicKey,'hex')).storeBit(false).endCell();assert.equal(sourceData.hash().toString('hex'),report.operatorDataHash);
 const minterInit=core.loadStateInit(core.Cell.fromBase64(p.smokePlan.steps[0].message.stateInit).beginParse()),curveInit=core.loadStateInit(core.Cell.fromBase64(intent.message.stateInit).beginParse());assert(sourceCodes['anlgram-bonding-curve'].equals(curveInit.code));assert(sourceCodes['anlgram-launchpad-jetton-minter'].equals(minterInit.code));
 const source=core.Address.parse(p.wallet.raw),minter=core.Address.parse(p.dependentAccounts.minter.raw),curve=core.Address.parse(intent.message.address);
 const sourceAccount=createShardAccount({address:source,code:core.loadStateInit(core.Cell.fromBase64(p.wallet.stateInit).beginParse()).code,data:sourceData,balance:balance??BigInt(report.operatorBalanceNano)}),minterAccount=createShardAccount({address:minter,code:sourceCodes['anlgram-launchpad-jetton-minter'],data:minterInit.data,balance:BigInt(report.minter.balanceNano)});
 // Local storage accounting uses this simulation's time, not invented decades
 // of unpaid storage. Fees are local-model results, not a live fee quotation.
 sourceAccount.account.storageStats.lastPaid=chain.now;minterAccount.account.storageStats.lastPaid=chain.now;
 await chain.setShardAccount(source,sourceAccount);await chain.setShardAccount(minter,minterAccount);
 const validUntil=chain.now+90,request=await external(w,intent.message,1,validUntil,w.address,null);
 return{chain,source,minter,curve,w,sourceCodes,curveInit,minterInit,report,request,validUntil};
}
async function simulate(){
 const c=await setup(),before=(await c.chain.getContract(c.source)).balance,minterBefore=(await c.chain.getContract(c.minter)).balance;
 const result=await c.chain.sendMessage(core.Cell.fromBase64(c.request.boc),{ignoreChksig:true});assert.equal(result.transactions.length,2);
 const sender=result.transactions.find(t=>t.inMessage?.info.dest?.equals(c.source)),receiver=result.transactions.find(t=>t.inMessage?.info.dest?.equals(c.curve));assert(sender&&receiver);
 for(const t of [sender,receiver]){assert.equal(t.description.aborted,false);assert.equal(t.description.computePhase.exitCode,0);assert.equal(t.description.actionPhase.resultCode,0);assert.equal(t.endStatus,'active');}assert.equal(sender.outMessages.size,1);assert.equal(receiver.outMessages.size,0);
 const out=sender.outMessages.values()[0];assert.equal(out.info.value.coins,100000000n);assert.equal(out.info.dest.toRawString(),c.curve.toRawString());assert.equal(core.beginCell().store(core.storeStateInit(out.init)).endCell().hash().toString('hex'),c.curve.hash.toString('hex'));assert.equal(out.body.hash().toString('hex'),core.Cell.fromBase64(intent.message.payload).hash().toString('hex'));
 const after=(await c.chain.getContract(c.source)).balance,curveContract=await c.chain.getContract(c.curve);assert.equal(curveContract.accountState.type,'active');assert(curveContract.accountState.state.code.equals(c.sourceCodes['anlgram-bonding-curve']));assert(curveContract.accountState.state.data.equals(c.curveInit.data));
 const debit=before-after,fees=sender.totalFees.coins+out.info.forwardFee;assert.equal(debit,100000000n+fees);assert.equal(curveContract.balance,100000000n-receiver.totalFees.coins);assert.equal(before-after-curveContract.balance,fees+receiver.totalFees.coins);assert.equal((await c.chain.getContract(c.minter)).balance,minterBefore);
 const state=(await c.chain.runGetMethod(c.curve,'get_curve_state')).stackReader;assert.equal(state.readBigNumber(),0n);assert.equal(state.readAddress().toRawString(),c.minter.toRawString());state.readAddress();state.readAddress();assert.equal(state.readBigNumber(),0n);assert.equal(state.readBigNumber(),800000000000000000n);assert.equal(state.readBigNumber(),0n);assert.equal(state.readBigNumber(),0n);
 const md=(await c.chain.runGetMethod(c.minter,'get_jetton_data')).stackReader;assert.equal(md.readBigNumber(),0n);assert.equal(md.readBigNumber(),-1n);assert.equal(md.readAddress().toRawString(),c.source.toRawString());md.readCell();assert(md.readCell().equals(c.sourceCodes['anlgram-settlement-wallet']));
 assert.equal((await c.chain.runGetMethod(c.source,'seqno')).stackReader.readBigNumber(),2n);
 return{...c,result,summary:{observedUtc:new Date().toISOString(),evidence:'LOCAL_SOURCE_COMPILED_SANDBOX_ONLY',networkStateChanged:false,signatureVerificationSkippedOnlyInEmulator:true,compiledContracts:Object.fromEntries(Object.entries(c.sourceCodes).map(([n,cell])=>[n,cell.hash().toString('hex')])),sourceSeqnoBefore:1,sourceSeqnoAfter:2,transactions:2,internalDeploymentMessages:1,curveState:0,curveDestination:c.curve.toString({testOnly:true}),curveDataHash:c.curveInit.data.hash().toString('hex'),localSenderDebitNano:debit.toString(),localSenderFeesNano:fees.toString(),localCurveGasNano:receiver.totalFees.coins.toString(),localCurveBalanceNano:curveContract.balance.toString(),realLiquidityReserveNano:'0',logicalTokenAllocationIsNotMintedCustody:true,minterSupplyUnchanged:'0',mainnetEnabled:false}};
}
module.exports={setup,simulate,codes,intent,p,core};
