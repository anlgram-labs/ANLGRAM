'use strict';
// Local fault injection around captured real DEX contracts, never broadcast.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('@ton/core');const {createShardAccount,internal}=require('@ton/sandbox');
const {compileFunc}=require('@ton-community/func-js');const {setup,snap}=require('./stonfi-snapshot-support');
const {beginCell,Address,contractAddress}=core,addr=n=>new Address(0,Buffer.alloc(32,n));
let compiled;
async function fixture({pinned=false,canonical=false,lockerFactory}={}){
 const chain=await setup(),admin=await chain.treasury('recovery-admin');
 const dir=path.resolve(__dirname,'../../minter-contract/contracts');
 const codes=await (compiled ||= Promise.all(['anlgram-migration-router','anlgram-settlement-wallet','anlgram-launchpad-jetton-minter','anlgram-lp-auth-guard'].map(async name=>{
  const r=await compileFunc({targets:[name+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);
 })));
 const [code,wallet,minter,guard]=codes,curve=addr(2),master=addr(3);let locker=addr(4),migrator=addr(5),lp=addr(8);
 const dex=Address.parse(snap.accounts.router.address),pton=Address.parse(snap.accounts.pton.address);
 const walletData=(owner,amount=0n)=>beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).storeRef(wallet).endCell();
 const walletAddress=owner=>contractAddress(0,{code:wallet,data:walletData(owner)}),dexTokenWallet=walletAddress(dex);
 const arg=address=>({type:'slice',cell:beginCell().storeAddress(address).endCell()});
 const ptonWallet=(await chain.runGetMethod(pton,'get_wallet_address',[arg(dex)])).stackReader.readAddress();
 const pool=(await chain.runGetMethod(dex,'get_pool_address',[arg(dexTokenWallet),arg(ptonWallet)])).stackReader.readAddress();
 if(lockerFactory)locker=await lockerFactory({chain,admin,master,migrator,dex,pton,ptonWallet,dexTokenWallet,pool});
 if(canonical||lockerFactory)lp=require('../../minter-contract/scripts/stonfi-v22-addresses').derive(core,dex,dexTokenWallet,ptonWallet,locker).lpWallet;
 const migratorInit={code,data:beginCell().storeBit(false).storeAddress(curve).storeAddress(locker).storeAddress(dex)
  .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(500000000000n).storeCoins(200000000000000000n).storeAddress(admin.address).endCell())
  .storeRef(beginCell().storeAddress(lp).storeAddress(ptonWallet).storeCoins(0).storeCoins(0).storeRef(wallet).endCell()).endCell()};
 if(canonical)migrator=contractAddress(0,migratorInit);
 const ownWallet=walletAddress(migrator);
 const empty=beginCell().storeAddress(null).storeAddress(null).endCell();
 let cfg=beginCell().storeAddress(dex).storeAddress(master).storeAddress(pton).storeRef(beginCell().storeAddress(admin.address).storeAddress(curve).endCell());
 if(pinned)cfg=cfg.storeRef(require('../../minter-contract/scripts/stonfi-v22-addresses').profileCell(core));
 if(!lockerFactory)await chain.setShardAccount(locker,createShardAccount({address:locker,code:guard,balance:10000000n,data:beginCell().storeUint(0,8).storeUint(0,64)
  .storeRef(cfg.endCell()).storeRef(empty).storeRef(empty).endCell()}));
 await chain.setShardAccount(master,createShardAccount({address:master,code:minter,balance:10000000n,data:beginCell().storeCoins(1000000000000000000n).storeAddress(null).storeRef(beginCell().endCell()).storeRef(wallet).endCell()}));
 await chain.setShardAccount(ownWallet,createShardAccount({address:ownWallet,code:wallet,data:walletData(migrator,200000000000000000n),balance:10000000n}));
 await chain.setShardAccount(walletAddress(curve),createShardAccount({address:walletAddress(curve),code:wallet,data:walletData(curve,800000000000000000n),balance:10000000n}));
 await chain.setShardAccount(migrator,createShardAccount({address:migrator,code,balance:500010000000n,data:migratorInit.data}));
 const body=beginCell().storeUint(0x414e4c37,32).storeUint(101,64).storeAddress(dexTokenWallet).storeAddress(lp).storeAddress(ptonWallet).endCell();
 const primed=await admin.send({to:migrator,value:40000000n,bounce:true,body:beginCell().storeUint(0x414e4c3d,32).storeUint(101,64).endCell()});
 assert(primed.transactions.some(t=>t.inMessage?.info.dest?.equals(migrator)&&t.inMessage.body.bits.length>=32&&t.inMessage.body.beginParse().loadUint(32)===0x414e530a&&t.description.computePhase?.exitCode===0),'authenticated refund epoch is ready before dispatch');
 // Execute just the actual first transaction, then explicitly schedule its
 // children to model delayed delivery. No successful receipt is injected.
 const initial=await (await chain.getContract(migrator)).receiveMessage(internal({from:admin.address,to:migrator,value:400000000n,bounce:true,body}));
 assert.equal(initial.description.aborted,false);
 const out=[...initial.outMessages.values()];
 return{chain,admin,curve,master,locker,migrator,migratorInit,dex,pton,ownWallet,dexTokenWallet,ptonWallet,pool,body,arg,out,
  token:out.find(m=>m.info.dest.equals(ownWallet)),ton:out.find(m=>m.info.dest.equals(ptonWallet))};
}
async function lpAccount(f){const address=(await f.chain.runGetMethod(f.pool,'get_lp_account_address',[f.arg(f.migrator)])).stackReader.readAddress();return address;}
module.exports={fixture,lpAccount};
