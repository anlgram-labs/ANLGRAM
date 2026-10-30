'use strict';
// Real captured STON.fi v2.2/pTON bytecode executed in local Sandbox only.
// Local token custody is explicitly preloaded. No live liquidity is created.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('@ton/core');const {createShardAccount}=require('@ton/sandbox');
const {compileFunc}=require('@ton-community/func-js');const {setup,snap}=require('./stonfi-snapshot-support');
const {Address,beginCell,contractAddress}=core;const addr=n=>new Address(0,Buffer.alloc(32,n));
const contracts=path.resolve(__dirname,'../../minter-contract/contracts');
async function compile(name,override){const r=await compileFunc({targets:[name+'.fc'],sources:f=>f===name+'.fc'&&override?override:fs.readFileSync(path.join(contracts,f),'utf8').replace(/\r\n/g,'\n')});assert.equal(r.status,'ok',r.message);return core.Cell.fromBase64(r.codeBoc);}
for(const baseline of[true,false])test(baseline?'baseline 0.10 TON forward is refunded by actual captured Router without issuing LP':'captured DEX executes local 500 TON / 200M token deposits and LP issuance; unproved migration stays blocked',async()=>{
 const chain=await setup(),admin=await chain.treasury('dex-admin');
 const previous=baseline?require('node:child_process').execFileSync('git',['show','e286eed:minter-contract/contracts/anlgram-migration-router.fc'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}):null;
 const [code,wallet,minter,guard]=await Promise.all([compile('anlgram-migration-router',previous),...['anlgram-settlement-wallet','anlgram-launchpad-jetton-minter','anlgram-lp-auth-guard'].map(n=>compile(n))]);
 const curve=addr(2),master=addr(3),locker=addr(4),migrator=addr(5),unverifiedLp=addr(8);
 const dex=Address.parse(snap.accounts.router.address),pton=Address.parse(snap.accounts.pton.address);
 const walletData=(owner,balance=0n)=>beginCell().storeCoins(balance).storeAddress(owner).storeAddress(master).storeRef(wallet).endCell();
 const walletAddress=owner=>contractAddress(0,{code:wallet,data:walletData(owner)});
 const dexTokenWallet=walletAddress(dex),ownWallet=walletAddress(migrator);
 const ownerArg=owner=>[{type:'slice',cell:beginCell().storeAddress(owner).endCell()}];
 const ptonWallet=(await chain.runGetMethod(pton,'get_wallet_address',ownerArg(dex))).stackReader.readAddress();
 const pool=(await chain.runGetMethod(dex,'get_pool_address',[
  {type:'slice',cell:beginCell().storeAddress(dexTokenWallet).endCell()},
  {type:'slice',cell:beginCell().storeAddress(ptonWallet).endCell()}])).stackReader.readAddress();
 const config=beginCell().storeAddress(dex).storeAddress(master).storeAddress(pton).storeRef(beginCell().storeAddress(admin.address).endCell()).endCell();
 const empty=beginCell().storeAddress(null).storeAddress(null).endCell();
 await chain.setShardAccount(locker,createShardAccount({address:locker,code:guard,balance:10000000n,
  data:beginCell().storeUint(0,8).storeUint(0,64).storeRef(config).storeRef(empty).storeRef(empty).endCell()}));
 await chain.setShardAccount(master,createShardAccount({address:master,code:minter,balance:10000000n,
  data:beginCell().storeCoins(1000000000000000000n).storeAddress(null).storeRef(beginCell().endCell()).storeRef(wallet).endCell()}));
 for(const [owner,amount]of[[migrator,200000000000000000n],[curve,800000000000000000n]]){
  const address=walletAddress(owner);await chain.setShardAccount(address,createShardAccount({address,code:wallet,data:walletData(owner,amount),balance:10000000n}));
 }
 // This legacy router permits prebound LP metadata. The guard refuses it. The
 // fixture deliberately exposes that blocker instead of claiming trusted migration.
 const data=beginCell().storeBit(0).storeAddress(curve).storeAddress(locker).storeAddress(dex)
  .storeRef(beginCell().storeAddress(master).storeAddress(pton).storeCoins(500000000000n).storeCoins(200000000000000000n).storeAddress(admin.address).endCell())
  .storeRef(beginCell().storeAddress(unverifiedLp).storeAddress(ptonWallet).storeCoins(0).storeCoins(0).storeRef(wallet).endCell()).endCell();
 await chain.setShardAccount(migrator,createShardAccount({address:migrator,code,data,balance:500010000000n}));
 const body=beginCell().storeUint(0x414e4c37,32).storeUint(1,64).storeAddress(dexTokenWallet).storeAddress(unverifiedLp).storeAddress(ptonWallet).endCell();
 const result=await admin.send({to:migrator,value:400000000n,bounce:true,body});
 console.log('DEX_SNAPSHOT_TRACE',JSON.stringify({baseline,transactions:result.transactions.length,routerInputs:result.transactions.filter(t=>t.inMessage?.info.dest?.equals(dex)).map(t=>t.inMessage.info.value.coins.toString()),expectedMetadataRejections:result.transactions.filter(t=>t.description.computePhase?.exitCode===407).length}));
 const poolData=(await chain.runGetMethod(pool,'get_pool_data')).stackReader;
 poolData.readBigNumber();assert(poolData.readAddress().equals(dex));const minted=poolData.readBigNumber();
 if(baseline){
  assert.equal(minted,0n);assert.equal((await chain.runGetMethod(ownWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);
  assert.equal((await chain.runGetMethod(locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
  console.log('BASELINE_DEX_FAILURE: token leg refunded, no LP issued; success exit codes are not completed liquidity.');return;
 }
 assert(minted>0n);const r0=poolData.readBigNumber(),r1=poolData.readBigNumber(),t0=poolData.readAddress(),t1=poolData.readAddress();
 assert((t0.equals(ptonWallet)&&t1.equals(dexTokenWallet))||(t1.equals(ptonWallet)&&t0.equals(dexTokenWallet)));
 assert.equal(r0,t0.equals(ptonWallet)?500000000000n:200000000000000000n);
 assert.equal(r1,t1.equals(ptonWallet)?500000000000n:200000000000000000n);
 const actualLp=(await chain.runGetMethod(pool,'get_wallet_address',ownerArg(locker))).stackReader.readAddress();
 const lpData=(await chain.runGetMethod(actualLp,'get_wallet_data')).stackReader;
 const held=lpData.readBigNumber();assert(held>0n);assert(lpData.readAddress().equals(locker));assert(lpData.readAddress().equals(pool));
 assert.equal((await chain.runGetMethod(ownWallet,'get_wallet_data')).stackReader.readBigNumber(),0n);
 const remainingCurve=(await chain.runGetMethod(walletAddress(curve),'get_wallet_data')).stackReader.readBigNumber();
 const dexCustody=(await chain.runGetMethod(dexTokenWallet,'get_wallet_data')).stackReader.readBigNumber();
 assert.equal(remainingCurve,800000000000000000n);assert.equal(dexCustody,200000000000000000n);
 assert.equal(remainingCurve+dexCustody,1000000000000000000n,'actual Jetton wallet custody conserves total supply');
 assert((await chain.getContract(migrator)).balance>=10000000n,'existing 0.40 TON caller funding preserves the 0.01 TON storage buffer');
 assert.equal((await chain.runGetMethod(locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 const duplicate=await admin.send({to:migrator,value:400000000n,bounce:true,body});
 assert(duplicate.transactions.some(t=>t.description.computePhase?.exitCode===407));
 const checkPool=(await chain.runGetMethod(pool,'get_pool_data')).stackReader;checkPool.readBigNumber();checkPool.readAddress();assert.equal(checkPool.readBigNumber(),minted);
 const unauthorized=await admin.send({to:actualLp,value:100000000n,bounce:true,body:beginCell().storeUint(0x0f8a7ea5,32).storeUint(4,64).storeCoins(held).storeAddress(admin.address).storeAddress(admin.address).storeBit(false).storeCoins(0).storeBit(false).endCell()});
 assert(unauthorized.transactions.some(t=>t.description.aborted));
 assert.equal((await chain.runGetMethod(actualLp,'get_wallet_data')).stackReader.readBigNumber(),held);
 const auth=await admin.send({to:locker,value:150000000n,bounce:true,body:beginCell().storeUint(0x414c5001,32).storeUint(2,64).endCell()});
 const bound=(await chain.runGetMethod(locker,'get_auth_state')).stackReader;
 assert.equal(bound.readBigNumber(),5n);bound.readBigNumber();bound.readAddress();bound.readAddress();assert(bound.readAddress().equals(pool));assert(bound.readAddress().equals(actualLp));
 assert.equal((await chain.runGetMethod(locker,'is_migration_authorized')).stackReader.readBigNumber(),0n);
 assert(auth.transactions.length>1);
 const withdraw=await admin.send({to:locker,value:30000000n,bounce:true,body:beginCell().storeUint(0x414e4c32,32).storeUint(3,64).storeCoins(held).endCell()});
 assert(withdraw.transactions.some(t=>t.description.aborted));
 assert.equal((await chain.runGetMethod(actualLp,'get_wallet_data')).stackReader.readBigNumber(),held);
 console.log('LOCAL_LP_ONLY',JSON.stringify({pool:pool.toRawString(),wallet:actualLp.toRawString(),held:held.toString(),totalSupply:minted.toString(),migrationAuthorized:false}));
});
