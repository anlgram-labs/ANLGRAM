import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import execution from './execution-version.json' with {type:'json'};
import curveTwo from './curve-two-intent.json' with {type:'json'};
import foreign from '../tests/settlement-runtime/fixtures/stonfi-testnet-public-snapshot.json' with {type:'json'};
import profile from '../minter-contract/stonfi-v22-development-profile.json' with {type:'json'};
import curveArtifact from '../minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json' with {type:'json'};
import dispatchWalletArtifact from '../minter-contract/build/anlgram-dispatch-sell-wallet.compiled.json' with {type:'json'};
import guardArtifact from '../minter-contract/build/anlgram-guard-vnext.compiled.json' with {type:'json'};
import migrationArtifact from '../minter-contract/build/anlgram-migration-router-dispatch-v2.compiled.json' with {type:'json'};
import {prepareProject} from './projects/prepare.mjs';
import {prepareStandardTestnetRelease} from './projects/standard-testnet-release.mjs';
import {deploymentIntent,hash,stateInit,hexHash} from './projects/project-registration.mjs';
import {pinned} from './recovery/policy.mjs';
import {code,standardV2Code} from './projects/artifacts.mjs';
import {assertReviewedStandardOperator,reviewedStandardOperator,reviewedStandardPublicKey} from './projects/reviewed-standard-operator.mjs';
import {launchpadGenesisOperations} from './projects/launchpad-gen2-operations.mjs';
import charges from '../assets/js/donation-config.js';
const dispatchArtifacts={'anlgram-bonding-curve-dispatch-v2':curveArtifact,
 'anlgram-dispatch-sell-wallet':dispatchWalletArtifact,
 'anlgram-guard-vnext':guardArtifact,'anlgram-migration-router-dispatch-v2':migrationArtifact};

function testnetAddress(value) {
 const raw=/^0:[a-f0-9]{64}$/.test(value);
 const address=raw?core.Address.parseRaw(value):core.Address.parseFriendly(value).address;
 if(address.workChain!==0||(!raw&&!core.Address.parseFriendly(value).isTestOnly))throw Error('Testnet basechain address required');
 return address;
}

function checkDraftAddresses(draft) {
 testnetAddress(draft.metadata.creator);
 if(draft.vesting?.enabled)testnetAddress(draft.vesting.beneficiary);
 if(draft.mode==='launchpad'){
  testnetAddress(draft.lp.beneficiary);
  if(Number(draft.lp.percent)<100)testnetAddress(draft.lp.controller);
 }
 if(!draft.distribution?.skip){
  const lines=draft.distribution.text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(line=>line.trim());
  for(const [i,line] of lines.entries()){
   const address=line.split(',')[0].trim();
   if(i!==0||!/^address$/i.test(address))testnetAddress(address);
  }
 }
}

function identity(init,expected) {
 const address=core.contractAddress(0,init),cell=stateInit(init);
 if(!address.equals(testnetAddress(expected))||hash(cell)!==address.hash.toString('hex'))throw Error('StateInit identity mismatch');
 if(address.equals(testnetAddress(curveTwo.message.address)))throw Error('Historical Curve excluded');
 return {address:address.toString({testOnly:true}),codeHash:hash(init.code),dataHash:hash(init.data),
  stateInitHash:hash(cell),stateInit:cell.toBoc().toString('base64')};
}
function fromPrepared(prepared) {
 return identity(core.loadStateInit(core.Cell.fromBase64(prepared.stateInit).beginParse()),prepared.address);
}
function wallet(publicKey) {
 return WalletContractV5R1.create({publicKey:Buffer.from(publicKey,'hex'),
  walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
}
const obviousPlaceholder = key => /^([0-9a-f]{2})\1{31}$/i.test(key);

export async function buildReviewedOwnerInventory(draft) {
 const operator=assertReviewedStandardOperator(reviewedStandardOperator);
 const {stateInit:unused,...genesis}=identity(operator.init,reviewedStandardOperator);
 const artifactHashes={
  operatorV5R1:genesis.codeHash,standardMinter:hash(standardV2Code('minter')),legacyStandardWallet:hash(standardV2Code('wallet')),
  standardSettlementWallet:hash(code('standard-jetton-settlement-wallet')),standardVesting:hash(code('anlgram-vesting-wallet-standard-v2')),
  launchpadMinter:hash(code('anlgram-launchpad-jetton-minter')),launchpadSettlementWallet:hash(code('anlgram-settlement-wallet')),
  ...Object.fromEntries(Object.entries(dispatchArtifacts).map(([name,artifact])=>{
    const cell=core.Cell.fromBase64(artifact.codeBocBase64);
    if(hash(cell)!==artifact.codeCellHash)throw Error('Release artifact hash mismatch');
    return [name,hash(cell)];
  })),locker:hash(code('anlgram-lp-locker-v2'))
 };
 let standard=null;
 if(draft!==undefined){
  if(Object.keys(draft??{}).some(key=>!['schema','network','id','stage','mode','metadata','allocations',
   'distribution','vesting','lp','trade','savedAt','walletProfile'].includes(key)))throw Error('Non-canonical owner draft');
  checkDraftAddresses(draft);
  assertReviewedStandardOperator(draft.metadata.creator);
  if(draft.vesting?.enabled&&draft.walletProfile!=='STANDARD_V2_SETTLEMENT')throw Error('Vesting requires settlement wallet');
  const release=await prepareStandardTestnetRelease(draft,reviewedStandardPublicKey);
  const {stateInit:discarded,...minter}=fromPrepared(release.minter);
  const minterInit=core.loadStateInit(core.Cell.fromBase64(release.minter.stateInit).beginParse());
  const minterData=minterInit.data.beginParse();
  minterData.loadRef();
  const walletCode=minterData.loadRef();
  if(hash(walletCode)!==release.walletCodeHash)throw Error('Standard wallet artifact mismatch');
  const creatorWalletInit={code:walletCode,data:core.beginCell().storeCoins(0).storeAddress(operator.address)
   .storeAddress(testnetAddress(minter.address)).storeRef(walletCode).endCell()};
  const creatorWalletAddress=core.contractAddress(0,creatorWalletInit);
  const {stateInit:walletBoc,...creatorJettonWallet}=identity(creatorWalletInit,creatorWalletAddress.toRawString());
  const prepared=await prepareProject(draft);
  if(testnetAddress(prepared.distribution.creatorWallet).toRawString()!==creatorWalletAddress.toRawString()||
     release.deployment.receiptExpectation.stateInitHash!==minter.stateInitHash)throw Error('Standard project derivation mismatch');
  standard={configurationFingerprint:release.configurationFingerprint,minter,walletCodeHash:release.walletCodeHash,
   creatorJettonWallet,expectedMintUnits:release.expectedMintUnits,
   attachmentNano:release.deployment.message.amount,deploymentMessage:release.deployment.receiptExpectation,
   mintAttachmentNano:release.mint.message.amount,mintMessage:release.mint.receiptExpectation,
   distributionRecipientCount:prepared.distribution.batches.reduce((total,batch)=>total+batch.recipientCount,0),
   vesting:prepared.vesting.stateInit?{address:prepared.vesting.address,codeHash:prepared.vesting.codeHash,
    stateInitHash:hash(core.Cell.fromBase64(prepared.vesting.stateInit))}:null,
   chainState:'UNVERIFIED',dependencyOrder:['VERIFIED_WALLET_INITIALIZATION','FRESH_DEPLOYMENT_PREFLIGHT',
    'EXACT_OWNER_AUTHORIZATION','AUTHENTIC_DEPLOYMENT_RECONCILIATION','SEPARATE_MINT_APPROVAL_AND_DELIVERY']};
 }
 return {schema:1,network:'-3',executionVersion:execution.sha256,scope:'REVIEWED_IDENTITY_READ_ONLY',
  operator:{...genesis,address:operator.address.toString({testOnly:true,bounceable:false}),
   raw:reviewedStandardOperator,publicKey:reviewedStandardPublicKey,walletId:2147483645,
   walletVersion:'v5r1',subwalletNumber:0,workchain:0},artifactHashes,standard,launchpad:null,
  blockedBy:[...(standard?[]:['OWNER_STANDARD_DRAFT_REQUIRED']),'WALLET_INITIALIZATION_AND_LIVE_PREFLIGHT_REQUIRED',
   'SEPARATE_LAUNCHPAD_OPERATOR_AND_AUTHORITY_REQUIRED','GATE_414_CLOSED'],
  financialSigningEnabled:false,broadcastingEnabled:false,executionEligible:false,liveChainVerified:false,feeQuote:null};
}

export async function buildReleasePlan(input) {
 if(!input||Object.keys(input).sort().join()!=='launchpad,network,standard'||input.network!=='-3'||
    Object.keys(input.standard??{}).sort().join()!=='draft,publicKey'||
    Object.keys(input.launchpad??{}).sort().join()!=='draft,migrationAuthorityPublicKey,publicKey'||
    input.standard.draft?.mode!=='standard'||input.launchpad.draft?.mode!=='launchpad')throw Error('Public Testnet release input required');
 checkDraftAddresses(input.standard.draft);
 checkDraftAddresses(input.launchpad.draft);
 if(input.standard.draft.vesting?.enabled&&input.standard.draft.walletProfile!=='STANDARD_V2_SETTLEMENT'){
  throw Error('Vesting requires the settlement wallet profile');
 }
 const standard=await prepareStandardTestnetRelease(input.standard.draft,input.standard.publicKey);
 const launchDraft=input.launchpad.draft;
 const publicKey=input.launchpad.publicKey;
 if(!hexHash(publicKey)||/^0+$/.test(publicKey))throw Error('Public V5 key required');
 const launchWallet=wallet(publicKey);
 const launchAddress=launchWallet.address.toRawString(),walletId=launchWallet.init.data.beginParse().skip(33).loadInt(32);
 if(walletId!==2147483645||!launchWallet.address.equals(testnetAddress(launchDraft.metadata.creator))||
    launchAddress===standard.operator.address||launchAddress===pinned.operator)throw Error('Separate Testnet operators required');
 const {candidate:c,record}=await deploymentIntent({draft:launchDraft,executionVersion:execution.sha256,
  migrationAuthorityPublicKey:input.launchpad.migrationAuthorityPublicKey});
 const prepared=await prepareProject(input.standard.draft);
 const accounts=Object.fromEntries(['minter','curve','guard','migration'].map(role=>[role,identity(c.states[role],c.addresses[role].toRawString())]));
 accounts.locker=identity(c.vault.init,c.vault.address.toRawString());
 const contracts={};
 for(const name of ['router','pton','ptonWallet']){
  const observed=foreign.accounts[name];
  const address=testnetAddress(observed.address);
  if(foreign.network!=='-3'||hash(core.Cell.fromHex(observed.code))!==observed.codeCellHash)throw Error('Captured STON.fi identity mismatch');
  contracts[name]={address:address.toString({testOnly:true}),capturedCodeHash:observed.codeCellHash};
 }
 if(!c.dex.equals(testnetAddress(contracts.router.address))||!c.pton.equals(testnetAddress(contracts.pton.address))||
    !c.ptonWallet.equals(testnetAddress(contracts.ptonWallet.address)))throw Error('STON.fi candidate dependency mismatch');
 const pool=identity(c.vault.poolInit,c.vault.pool.toRawString()),lpWallet=identity(c.vault.lpInit,c.vault.lpWallet.toRawString());
 if(pool.codeHash!==profile.codes.pool.hash||lpWallet.codeHash!==profile.codes.lpWallet.hash||
    hash(core.Cell.fromBase64(profile.codes.lpAccount.boc))!==profile.codes.lpAccount.hash)throw Error('Foreign profile mismatch');
 return {schema:1,network:'-3',executionVersion:execution.sha256,scope:'OFFLINE_RELEASE_INVENTORY',
  identityStatus:[input.standard.publicKey,input.launchpad.publicKey,input.launchpad.migrationAuthorityPublicKey].some(obviousPlaceholder)?
   'EXAMPLE_KEYS_DETECTED':'UNREVIEWED_PUBLIC_IDENTITIES',
  financialSigningEnabled:false,broadcastingEnabled:false,executionEligible:false,liveChainVerified:false,feeQuote:null,
  standard:{operator:standard.operator,operatorGenesis:identity(wallet(standard.operator.publicKey).init,standard.operator.address),
   fingerprint:standard.configurationFingerprint,minter:fromPrepared(standard.minter),
   walletCodeHash:standard.walletCodeHash,vesting:prepared.vesting.stateInit?fromPrepared(prepared.vesting):null,
   deployment:{id:standard.deployment.id,attachmentNano:standard.deployment.message.amount,
    ...standard.deployment.receiptExpectation},mint:{id:standard.mint.id,attachmentNano:standard.mint.message.amount,
    ...standard.mint.receiptExpectation}},
  launchpad:{operator:{address:launchAddress,walletId,publicKey,codeHash:hash(launchWallet.init.code)},
   operatorGenesis:identity(launchWallet.init,launchAddress),
   fingerprint:record.configurationFingerprint,operationId:record.operationId,
   accounts,genesisOperations:launchpadGenesisOperations(c,core),
   configuredSupplyUnits:'1000000000000000000',curveAllocationUnits:'800000000000000000',
   dexAllocationUnits:'200000000000000000',graduationPrincipalNano:'300000000000',
   creationCharge:{baseNano:String(charges.BASE_EXECUTION_NANO),donationNano:String(charges.DONATION_AMOUNT_NANO),
    paymentVerified:false,reconciliationRequired:true},
   walletCodeHash:hash(c.wallet),initializeCurveBodyHash:hash(c.initCurve),lockerBindBodyHash:hash(c.bind),
   migrationWalletBindBodyHash:hash(c.walletBinding),lockTerms:c.terms,
   stonfi:{scope:'CAPTURED_TESTNET_IDENTITIES_NO_LIVE_PROOF',...contracts,pool,lpWallet,lpAccountCodeHash:profile.codes.lpAccount.hash,
    routerJettonWallet:c.routerTokenWallet.toString({testOnly:true})}},
  dependencyOrder:{
   standard:['external-v5-initialization','minter-deployment','initial-mint-and-wallet-delivery','distribution-or-vesting'],
   launchpad:['external-v5-initialization','minter','curve','guard','migration','locker','curve-initialization',
    'initial-mint-and-curve-custody','renunciation-and-activation','buy-and-sell-reconciliation','graduation',
    'locker-and-pair-binding','return-epochs','pre-funding-permit','authenticated-funding','post-funding-permit',
    'both-dex-deposit-legs','lp-custody','separate-terminal-settlement','separate-withdrawal-evidence']},
  gates:{standardDeployment:'REVIEW_AND_LIVE_PREFLIGHT_REQUIRED',standardMint:'VERIFIED_DEPLOYMENT_REQUIRED',
   distributionAndVesting:'VERIFIED_MINT_AND_OPERATION_REVIEW_REQUIRED',trading:'VERIFIED_ACTIVATION_REQUIRED',
   migration:'GATE_414_CLOSED',withdrawal:'FINAL_DELIVERY_EVIDENCE_UNAVAILABLE',mainnet:'DISABLED'}};
}
