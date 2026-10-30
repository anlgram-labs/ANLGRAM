'use strict';
// OFFLINE candidate preparation. No provider, signer, wallet key or broadcast.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('@ton/core');const {beginCell,Cell,Address,Dictionary,contractAddress}=core;
const {DEFAULT_CONFIG,BondingCurveEngine}=require('./scripts/bonding-curve-math');
const {profileCell}=require('./scripts/stonfi-v22-addresses');
const OPERATOR_INPUT='UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';
const DEX='0:05a5e18525003d2aa882c5767c27897ffef4980311528ab48ebcf1e7e92497e3';
const PTON='0:024b7d03368510ecd7c0a4fbf387b78199267d2f8ca027e964356b5b6bc4d04f';
function code(name,tonCore=core){
 const a=JSON.parse(fs.readFileSync(path.join(__dirname,'build',name+'.compiled.json'),'utf8'));
 const c=tonCore.Cell.fromBase64(a.codeBocBase64);
 if(c.hash().toString('hex')!==(a.codeCellHash||a.codeHash))throw new Error('Artifact code hash mismatch: '+name);
 return c;
}
function buildCandidate(operatorInput=OPERATOR_INPUT,tonCore=core){
 const {beginCell,Cell,Address,Dictionary,contractAddress}=tonCore;
 const operator=typeof operatorInput==='string'?Address.parse(operatorInput):operatorInput;
 if(operator.workChain!==0)throw new Error('Only workchain 0 supported');
 const wallet=code('anlgram-settlement-wallet',tonCore);
 const pin=fs.readFileSync(path.join(__dirname,'contracts/imports/settlement-wallet-code.fc'),'utf8');
 if(!pin.includes(wallet.hash().toString('hex')))throw new Error('Settlement code pin mismatch');
 const dex=Address.parse(DEX),pton=Address.parse(PTON),treasury=Address.parse(OPERATOR_INPUT),cfg=DEFAULT_CONFIG;
 const metadata=Dictionary.empty(Dictionary.Keys.BigUint(256),Dictionary.Values.Cell());
 for(const[key,value]of[['name','ANLGRAM Testnet Settlement'],['symbol','ANLTEST'],['decimals','9']]){
  const hash=BigInt('0x'+crypto.createHash('sha256').update(key).digest('hex'));
  metadata.set(hash,beginCell().storeUint(0,8).storeStringTail(value).endCell());
 }
 const content=beginCell().storeUint(0,8).storeDict(metadata).endCell();
 const minter={code:code('anlgram-launchpad-jetton-minter',tonCore),data:beginCell().storeCoins(0).storeAddress(operator).storeRef(content).storeRef(wallet).endCell()};
 const minterAddress=contractAddress(0,minter);
 const math=new BondingCurveEngine();
 const curve={code:code('anlgram-bonding-curve',tonCore),data:beginCell().storeUint(0,8).storeUint(cfg.protocolFeeBps,16)
  .storeRef(beginCell().storeAddress(operator).storeAddress(operator).storeAddress(treasury)
   .storeRef(beginCell().storeAddress(minterAddress).storeAddress(null).storeAddress(dex)
    .storeRef(beginCell().storeAddress(null).storeAddress(null).endCell()).endCell()).endCell())
  .storeRef(beginCell().storeCoins(0).storeCoins(cfg.curveTokens).storeCoins(0).storeCoins(0).storeCoins(math.virtualTon)
   .storeCoins(math.virtualToken).storeCoins(cfg.graduationThresholdTon).storeCoins(cfg.gradTokens).endCell())
  .storeRef(beginCell().storeDict(null).storeRef(wallet).endCell()).endCell()};
 const curveAddress=contractAddress(0,curve);
 const empty=beginCell().storeAddress(null).storeAddress(null).endCell();
 const guard={code:code('anlgram-lp-auth-guard',tonCore),data:beginCell().storeUint(0,8).storeUint(0,64)
  .storeRef(beginCell().storeAddress(dex).storeAddress(minterAddress).storeAddress(pton).storeRef(beginCell().storeAddress(operator).endCell()).storeRef(profileCell(tonCore)).endCell())
  .storeRef(empty).storeRef(empty).endCell()};
 const guardAddress=contractAddress(0,guard);
 const migration={code:code('anlgram-migration-router',tonCore),data:beginCell().storeBit(0).storeAddress(curveAddress).storeAddress(guardAddress).storeAddress(dex)
  .storeRef(beginCell().storeAddress(minterAddress).storeAddress(pton).storeCoins(0).storeCoins(0).storeAddress(operator).endCell())
  .storeRef(beginCell().storeAddress(null).storeAddress(null).storeCoins(0).storeCoins(0).storeRef(wallet).endCell()).endCell()};
 const states={minter,curve,guard,migration};
 const addresses=Object.fromEntries(Object.entries(states).map(([role,init])=>[role,contractAddress(0,init)]));
 const curveWallet=contractAddress(0,{code:wallet,data:beginCell().storeCoins(0).storeAddress(curveAddress).storeAddress(minterAddress).storeRef(wallet).endCell()});
 return{operator,states,addresses,wallet,curveWallet,dex,pton};
}
function manifest(candidate=buildCandidate()){
 return{network:'-3',status:'BLOCKED_NOT_AUTHORIZED',operatorInput:OPERATOR_INPUT,operatorRaw:candidate.operator.toRawString(),
  operatorTestnetRepresentation:candidate.operator.toString({testOnly:true,bounceable:false}),
  warning:'A Testnet tag is not proof of control. Match the connected wallet account and chain before any signature.',
  proposedMetadata:{name:'ANLGRAM Testnet Settlement',symbol:'ANLTEST',decimals:9},metadataApproved:false,
  lpDevelopmentProfile:{codeIdentityPinned:true,trustModelAcceptedForDevelopment:true,sourceAuditVerified:false,migrationAuthorized:false},
  accounts:Object.fromEntries(Object.entries(candidate.states).map(([role,init])=>[role,{address:candidate.addresses[role].toString({testOnly:true}),
   raw:candidate.addresses[role].toRawString(),codeHash:init.code.hash().toString('hex'),dataHash:init.data.hash().toString('hex')}])),
  curveWallet:candidate.curveWallet.toString({testOnly:true}),settlementWalletCodeHash:candidate.wallet.hash().toString('hex'),
  dexRouter:candidate.dex.toString({testOnly:true}),ptonMinter:candidate.pton.toString({testOnly:true}),
  blockers:['Operator Testnet account control/funding/activation must be verified.','Test metadata requires review.',
   'LP address binding is not foreign code/custody proof; opt-in migration and graduation finalization reject 414.',
   'Migration pending balances and interrupted DEX recovery are not fully reconciled.','Testnet donation recipient is not approved; production donation remains mainnet-only.',
   'No deployment or transaction is authorized.']};
}
if(require.main===module)console.log(JSON.stringify(manifest(),null,2));
module.exports={buildCandidate,manifest,OPERATOR_INPUT};
