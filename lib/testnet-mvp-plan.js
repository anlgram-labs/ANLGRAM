'use strict';
// Offline review material only. Never constructs a signing deadline, calls a
// wallet/provider or authorizes a transfer. Reuses the pinned deployed family.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const core=require('../minter-contract/node_modules/@ton/core');
const pinned=require('../docs/launchpad/testnet-v5-candidate.json');
const registry=require('../docs/launchpad/active-testnet-candidate.json');
const {sellTemplate}=require('../scripts/prepare-supervised-smoke');
const sha=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const cellHash=s=>core.Cell.fromBase64(s).hash().toString('hex');
function units(x,label='amount',max=(1n<<120n)-1n){
 if(typeof x==='number'&&!Number.isSafeInteger(x))throw Error('Unsafe '+label);
 if(!['string','bigint','number'].includes(typeof x)||!/^\d+$/.test(String(x)))throw Error('Invalid '+label);
 const n=BigInt(x);if(n<0n||n>max)throw Error('Out of range '+label);return n;
}
function build(candidate=pinned){
 assert.equal(sha(candidate),registry.candidateSha256,'Pinned candidate changed; no old approval survives');
 assert.equal(candidate.wallet.network,'-3');assert.equal(candidate.wallet.walletId,2147483645);
 const acceptance={
  'deploy-curve':['Exact finalized V5 seqno and signed external hash, one internal deployment, matching Curve code/data StateInit, no extra descendants.'],
  'deploy-guard':['Exact finalized deployment; matching code/data, is_migration_authorized remains zero.'],
  'deploy-migration':['Exact finalized deployment; matching code/data; no DEX deposit or graduation authorized.'],
  'initialize-curve':['Admin-authenticated initialize message, authentic minter/wallet/guard/migrator identities and wallet code. Curve state1.'],
  'mandatory-creation-donation':['Actual executed 0.02 TON message to the immutable recipient and comment; matching child transaction and debit. Self-payment is not an independent-payer test.'],
  'mint-test-supply':['Exact operator-authorized one-billion-unit mint, minter supply1e18, Curve-wallet owner/master/code and actual balance1e18. Curve state2. Expected automatic admin request exit73 is not success or renunciation.'],
  'operator-renounce':['Actual minter change_admin(null), fixed renounce query, authentic minter callback to Curve with supply1e18 and null admin; Curve state3. Renunciation is irreversible and callback performs activation.'],
  'small-test-buy':['Fresh active Curve quote for attachment minus existing0.04TON overhead. Actual sender-wallet operation ID from Curve logical time, recipient delivery and authenticated outcome2, exact reserve/fee/custody reconciliation.'],
  'expected-slippage-rejection':['Actual Curve exit404 and routed native bounce to operator, unchanged reserve/token/fee accounts. Gas loss is expected; missing bounce is pending, not refunded.']
 };
 const steps=candidate.smokePlan.steps.filter(s=>s.name!=='deploy-minter').map((s,i)=>{
  assert(acceptance[s.name],s.name);const message=structuredClone(s.message),a=core.Address.parseFriendly(message.address);assert(a.isTestOnly);assert.equal(a.address.workChain,0);
  const operationId=s.name==='deploy-curve'?'ANLTEST_CURVE_TX2':'ANLTEST_V5_'+s.name.replaceAll('-','_').toUpperCase()+'_'+registry.candidateSha256.slice(0,16);
  return{name:s.name,operationId,templateFingerprint:sha({operationId,candidate:registry.candidateSha256,network:'-3',operator:candidate.wallet.raw,message}),nominalSeqno:i+1,seqnoMustBeReadFresh:true,status:'OFFLINE_TEMPLATE_NOT_AUTHORIZED',requiresSeparateOwnerApproval:true,message,bodyHash:cellHash(message.payload),stateInitHash:message.stateInit?cellHash(message.stateInit):null,requiresPreviousStep:i?acceptance[candidate.smokePlan.steps.filter(s=>s.name!=='deploy-minter')[i-1].name]:['Finalized real minter transaction #1; never repeat it.'],acceptance:acceptance[s.name]};
 });
 return{schema:1,network:'-3',candidateSha256:registry.candidateSha256,operator:candidate.wallet.raw,minter:candidate.dependentAccounts.minter.raw,curve:candidate.dependentAccounts.curve.raw,curveWallet:candidate.curveJettonWallet,buyerWallet:candidate.buyerJettonWallet,metadata:candidate.smokePlan.phaseA.metadata,donation:{...candidate.donation,amountNano:'20000000',paymentAuthorized:false},firstDeployment:{operation:'ANLTEST_MINTER_TX1',consumed:true,transactionHash:'0c79b9323f105d4b3f0e0d9c3e7fb3ee178e4738062182ccd507867c12c8b9b1'},steps,activation:{separateTransaction:false,trigger:'Authenticated minter renounce callback; verify Curve state3, never infer from wallet acceptance.'},sell:{message:null,requiresActualDeliveredBalance:true,requiresFreshNetTonQuote:true,requiresSeparateOwnerApproval:true},recovery:{message:null,requiresExactOnchainOperationId:true,resendPrincipal:false,missingReceiptIsRefundProof:false},signingEnabled:false,broadcastEnabled:false,migrationEnabled:false,lpWithdrawalsEnabled:false,notes:['Template fingerprints are not TON Connect request fingerprints or approvals. No expiry is generated offline.','Nominal seqnos assume no other transfers. Recovery queries consume wallet seqnos; read again before each approval.','All receipts require exact finalized trace and state review; API snapshots alone never establish delivery.']};
}
function context(plan,e){
 assert.equal(plan.signingEnabled,false);assert.equal(e.network,'-3');assert.equal(e.operator,plan.operator);assert.equal(e.master,plan.minter);assert.equal(e.curve,plan.curve);
 assert.equal(e.curveState,3);assert.equal(e.admin,null);assert.equal(e.decimals,9);
 assert(Number.isSafeInteger(e.observedAt)&&Math.abs(Date.now()-e.observedAt)<15000,'Fresh explicit observation required');
}
function buy(plan,e,{attachmentNano,quoteTokens,slippageBps='50',queryId='10'}){
 context(plan,e);const value=units(attachmentNano),tokens=units(quoteTokens),slip=units(slippageBps,'slippage',10000n),q=units(queryId,'query',0xffffffffffffffffn);
 assert(value>40000000n&&tokens>0n&&slip<=1000n);assert.equal(e.quoteGrossNano,(value-40000000n).toString(),'Quote must exclude existing gas overhead');
 assert.equal(e.quoteTokens,tokens.toString());const minimum=tokens*(10000n-slip)/10000n;assert(minimum>0n);
 return{status:'OFFLINE_REVIEW_ONLY_NOT_AUTHORIZED',minimumTokens:minimum.toString(),message:{address:core.Address.parse(plan.curve).toString({testOnly:true}),amount:value.toString(),payload:core.beginCell().storeUint(0x5fcc3d14,32).storeUint(q,64).storeCoins(minimum).endCell().toBoc().toString('base64')}};
}
function sell(plan,e,{amount,minimumTon,queryId='11'}){
 context(plan,e);const n=units(amount),minimum=units(minimumTon);assert(n>0n&&minimum>0n);assert.equal(e.walletOwner,plan.operator);assert.equal(e.walletMaster,plan.minter);assert.equal(core.Address.parse(e.wallet).toRawString(),core.Address.parse(plan.buyerWallet).toRawString());
 assert(n<=units(e.deliveredBalance));assert.equal(e.quotedAmount,n.toString());assert(minimum<=units(e.netTonQuote));assert.equal(e.settlementStatus,2,'Dispatch alone is not delivered balance');
 return sellTemplate({wallet:e.wallet,curve:plan.curve,owner:plan.operator,amount:n,minimumTon:minimum,queryId:units(queryId,'query',0xffffffffffffffffn)});
}
function receiptQuery(plan,operationId){
 const q=units(operationId,'settlement ID',0xffffffffffffffffn);assert(q>0n,'Use actual Curve logical time, never frontend request query10');
 return{operationId:'ANLTEST_V5_RECEIPT_QUERY_'+q,status:'GAS_ONLY_OFFLINE_NOT_AUTHORIZED',requiresSeparateOwnerApproval:true,resendPrincipal:false,message:{address:core.Address.parse(plan.curve).toString({testOnly:true}),amount:'20000000',payload:core.beginCell().storeUint(0x414e5305,32).storeUint(q,64).endCell().toBoc().toString('base64')}};
}
module.exports={build,buy,sell,receiptQuery,units};
