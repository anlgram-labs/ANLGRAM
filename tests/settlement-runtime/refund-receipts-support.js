'use strict';
// Protocol unit actors using real source-compiled contracts and actual wallet
// routing. The controlled counterparty is NOT a STON.fi implementation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require('@ton/core'),{Blockchain,createShardAccount}=require('@ton/sandbox'),{compileFunc}=require('@ton-community/func-js');
const {Address,beginCell,contractAddress,storeStateInit}=core,addr=n=>new Address(0,Buffer.alloc(32,n));
const dir=path.resolve(__dirname,'../../minter-contract/contracts');let compiled;
const body=(op,q=101n)=>beginCell().storeUint(op,32).storeUint(q,64);
async function setup({prime=true,execute=true,nativeActor=false}={}){
 const [migration,wallet,minter]=await(compiled||=Promise.all(['anlgram-migration-router','anlgram-settlement-wallet','anlgram-launchpad-jetton-minter'].map(async n=>{
  const r=await compileFunc({targets:[n+'.fc'],sources:f=>fs.readFileSync(path.join(dir,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);
 })));
 const chain=await Blockchain.create();chain.now=1800000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
 const admin=await chain.treasury('refund-admin'),router=await chain.treasury('controlled-refund-counterparty'),curve=await chain.treasury('refund-curve');
 const nativeSender=nativeActor?await chain.treasury('controlled-native-refund-counterparty'):null;
 const master=addr(80),migrator=addr(81),locker=addr(82),pton=addr(83),lp=addr(84),ptonWallet=nativeSender?nativeSender.address:addr(85);
 const walletData=(owner,amount=0n)=>beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).storeRef(wallet).endCell();
 const address=owner=>contractAddress(0,{code:wallet,data:walletData(owner)}),ownWallet=address(migrator),sourceWallet=address(router.address);
 await chain.setShardAccount(master,createShardAccount({address:master,code:minter,balance:10000000n,data:beginCell().storeCoins(1000000000000000000n).storeAddress(null).storeRef(beginCell().endCell()).storeRef(wallet).endCell()}));
 for(const[owner,amount]of[[migrator,200000000000000000n],[curve.address,800000000000000000n]])await chain.setShardAccount(address(owner),createShardAccount({address:address(owner),code:wallet,data:walletData(owner,amount),balance:10000000n}));
 await chain.setShardAccount(migrator,createShardAccount({address:migrator,code:migration,balance:500010000000n,data:beginCell().storeBit(false).storeAddress(curve.address).storeAddress(locker).storeAddress(router.address)
  .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(500000000000n).storeCoins(200000000000000000n).storeAddress(admin.address).endCell())
  .storeRef(beginCell().storeAddress(lp).storeAddress(ptonWallet).storeCoins(0).storeCoins(0).storeRef(wallet).endCell()).endCell()}));
 const s={chain,admin,router,curve,master,migrator,ownWallet,sourceWallet,address};
 s.prime=(q=101n)=>admin.send({to:migrator,value:40000000n,bounce:true,body:body(0x414e4c3d,q).endCell()});
 s.execute=()=>admin.send({to:migrator,value:400000000n,bounce:true,body:body(0x414e4c37).storeAddress(sourceWallet).storeAddress(lp).storeAddress(ptonWallet).endCell()});
 s.sync=(q=101n)=>admin.send({to:migrator,value:40000000n,bounce:true,body:body(0x414e4c3e,q).endCell()});
 s.refund=(amount,forward=0n,value=100000000n,q=101n)=>router.send({to:sourceWallet,value,bounce:true,body:body(0x0f8a7ea5,q).storeCoins(amount).storeAddress(migrator).storeAddress(router.address).storeBit(false).storeCoins(forward).storeBit(false).endCell()});
 s.nativeRefund=amount=>nativeSender.send({to:migrator,value:amount+10000000n,bounce:true,body:body(0x01f3835d).storeCoins(amount).storeAddress(router.address).storeBit(false).endCell()});
 if(prime){await s.prime();assert.equal((await settlement(s)).stage,2n);}
 if(execute){const r=await s.execute();assert(r.transactions.some(t=>t.inMessage?.info.dest?.equals(migrator)&&t.description.computePhase?.exitCode===0));assert.equal(await tokens(s,sourceWallet),200000000000000000n);}
 return s;
}
async function settlement(s,id){const r=(await s.chain.runGetMethod(s.migrator,id===undefined?'get_migration_settlement':'get_migration_operation',id===undefined?[]:[{type:'int',value:id}])).stackReader;return Object.fromEntries(['stage','opened','epoch','originalTon','originalTokens','returnedTon','returnedTokens','cumulative'].map(k=>[k,r.readBigNumber()]));}
async function tokens(s,address){return(await s.chain.runGetMethod(address,'get_wallet_data')).stackReader.readBigNumber();}
async function freeze(s,address){const c=await s.chain.getContract(address),old=c.account;const st=c.accountState.state;
 c.account={...old,account:{...old.account,storage:{...old.account.storage,state:{type:'frozen',stateHash:BigInt('0x'+beginCell().store(storeStateInit(st)).endCell().hash().toString('hex'))}}}};return old.account.storage.state;
}
async function restore(s,address,state){const c=await s.chain.getContract(address),a=c.account;c.account={...a,account:{...a.account,storage:{...a.account.storage,state}}};}
async function controlled(s,op,after){const result=[];
 const message=core.external({to:s.admin.address,body:s.admin.createTransfer({messages:[core.internal({to:s.migrator,value:40000000n,bounce:true,body:body(op).endCell()})],sendMode:1})});
 for await(const tx of await s.chain.sendMessageIter(message)){result.push(tx);await after(tx);}return{transactions:result};
}
const opcode=m=>m.body.bits.length>=32?m.body.beginParse().loadUint(32):0;
module.exports={setup,settlement,tokens,freeze,restore,controlled,opcode,body};
