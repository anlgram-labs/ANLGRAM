'use strict';
// Complete real local message routing, no preloaded project financial state.
const test=require('node:test'),assert=require('node:assert/strict'),core=require('@ton/core');
const {fixture,ready,exit}=require('./one-shot-dispatch-support'),{beginCell}=core;
const TON = 300000000001n;
const op=m=>m?.body.bits.length>=32?m.body.beginParse().loadUint(32):0;
const summary=txs=>txs.filter(t=>t.description.computePhase.type==='vm'&&![0,1].includes(t.description.computePhase.exitCode)).map(t=>({to:t.inMessage?.info.dest?.toRawString(),op:op(t.inMessage).toString(16),exit:t.description.computePhase.exitCode}));
test('VNext caps an oversized purchase and returns the entire unspent principal',async()=>{
 const f=await fixture();
 await require('./vnext-package-support').bootstrap(f);
 const curve=f.c.addresses.curve;
 const curveBalance=async()=>(await f.chain.getContract(curve)).balance;
 const state=async()=>(await f.chain.runGetMethod(curve,'get_curve_state')).stack.map(item=>item.value);
 const before=await state(),balanceBefore=await curveBalance(),inventory=before[5];
 const buy=(value,min)=>f.send(curve,beginCell().storeUint(0x5fcc3d14,32)
   .storeUint(100,64).storeCoins(min).endCell(),value);
 const allowance=40000000n;
 const quoteV2=gross=>f.chain.runGetMethod(curve,'get_buy_quote_v2',[{type:'int',value:gross}]);
 const buyerWallet=core.contractAddress(0,{code:f.c.wallet,data:beginCell().storeCoins(0)
  .storeAddress(f.owner.address).storeAddress(f.c.addresses.minter).storeRef(f.c.wallet).endCell()});
 const buyerTokens=async()=>((await f.chain.getContract(buyerWallet)).accountState?.type==='active'
  ?(await f.chain.runGetMethod(buyerWallet,'get_wallet_data')).stackReader.readBigNumber():0n);
 await assert.rejects(quoteV2(10000000n),/405/);
 const buyAndCheckQuote=async(gross,min)=>{
  const initial=await state();
  const stack=[{type:'int',value:gross}];
  const read=async getter=>(await f.chain.runGetMethod(curve,getter,stack)).stack.map(item=>item.value);
  const [tokens,fee,consumed,refund,graduated]=await read('get_buy_quote_v2');
  assert.deepEqual(await read('get_buy_quote'),[tokens,fee]);
  const held=await buyerTokens();
  const result=await buy(gross+allowance,min);
  assert(exit(result,curve,0));
  const after=await state();
  assert.equal(tokens,initial[5]-after[5]);
  assert.equal((await buyerTokens())-held,tokens);
  assert.equal(fee,after[6]-initial[6]);
  assert.equal(consumed,after[4]-initial[4]+fee);
  assert.equal(consumed+refund,gross);
  assert.equal(graduated,after[0]===4n?-1n:0n);
  if(refund>0n){
   assert.equal(result.transactions.filter(({inMessage:m})=>m?.info.type==='internal'
    &&m.info.src.equals(curve)&&m.info.dest.equals(f.owner.address)
    &&m.info.value.coins===refund&&op(m)===0xd53276db).length,1);
  }
  return result;
 };
 assert(exit(await buy(510000000000n,inventory+1n),curve,404));
 assert.deepEqual(await state(),before);
 assert.equal(await curveBalance(),balanceBefore);

 const snapshot=f.chain.snapshot();
 await buyAndCheckQuote(300000000000n,1n);
 const boundary=[
  [303030303029n,299999999999n,666668n,3n],
  [303030303030n,300000000000n,1n,3n],
 ];
 for(const [gross,principal,remainder,stage] of boundary){
  await f.chain.loadFrom(snapshot);
  await buyAndCheckQuote(gross,inventory-remainder);
  const after=await state();
  assert.equal(after[0],stage);
  assert.equal(after[4],principal);
  assert.equal(after[5],remainder);
  assert.equal(after[6],gross/100n);
 }
 await buyAndCheckQuote(11000000n,1n);
 assert.equal((await state())[0],4n);
 assert.equal((await state())[4],TON);
 assert.equal((await state())[5],0n);
 // The first gross sufficient under the normal floor-fee rule must clear.
 await f.chain.loadFrom(snapshot);
 await buyAndCheckQuote(303030303031n,inventory);
 assert.equal((await state())[4],TON);
 assert.equal((await state())[5],0n);

 const refunds=[];
 for(const attachment of [510000000000n,610000000000n,510040000000n,610040000000n]){
  await f.chain.loadFrom(snapshot);
  const result=await buyAndCheckQuote(attachment-allowance,inventory);
  const after=await state(),principal=after[4]-before[4],fees=after[6]-before[6];
  assert.equal(after[0],4n);
  assert.equal(after[5],0n);
  assert.equal(principal,TON);
  assert.equal(fees,3030303030n);
  assert.equal(await curveBalance(),balanceBefore+principal+fees);
  const refund=attachment-40000000n-principal-fees;
  assert(result.transactions.some(({inMessage:m})=>m?.info.type==='internal'
    &&m.info.src.equals(curve)&&m.info.dest.equals(f.owner.address)
    &&m.info.value.coins===refund&&op(m)===0xd53276db));
  assert.equal(await buyerTokens(),inventory);
  refunds.push(refund);
 }
 assert.equal(refunds[1]-refunds[0],100000000000n);
 assert.equal(refunds[3]-refunds[2],100000000000n);
 const settled=await state(),settledBalance=await curveBalance();
 await assert.rejects(quoteV2(610000000000n),/402/);
 assert(exit(await buy(610000000000n,1n),curve,402));
 const forgedClaim=await f.send(curve,beginCell().storeUint(0x414e4c34,32).storeUint(100,64).endCell(),50000000n,f.other);
 const forgedRoot=forgedClaim.transactions.find(tx=>tx.inMessage?.info.dest?.equals(curve));
 assert.equal(forgedRoot.description.aborted,true);
 assert([...forgedRoot.outMessages.values()].every(m=>m.info.type==='internal'&&m.info.bounced&&m.info.dest.equals(f.other.address)));
 assert.deepEqual(await state(),settled);
 assert.equal(await curveBalance(),settledBalance);

 // Same fee schedule that stranded the attachment on the previous code.
 await f.chain.loadFrom(snapshot);
 const config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),f.chain.config);
 const prices=config.get(25).beginParse();
 assert.equal(prices.loadUint(8),0xea);
 prices.loadUintBig(64);
 config.set(25,beginCell().storeUint(0xea,8).storeUint(100000000n,64).storeSlice(prices).endCell());
 f.chain.setConfig(beginCell().storeDictDirect(config).endCell());
 const expensive=f.chain.snapshot();
 // Only the counterexample swaps code in Sandbox. The funded fixture and
 // transaction are identical, and the historical BOC is pinned by its hash.
 const old=JSON.parse(require('node:child_process').execFileSync('git',[
  'show','d4c168f:minter-contract/build/anlgram-bonding-curve-dispatch-v2.compiled.json'
 ],{cwd:__dirname,encoding:'utf8'}));
 const historicalCode=core.Cell.fromBase64(old.codeBocBase64);
 assert.equal(historicalCode.hash().toString('hex'),'61b2246e82633c684fb9a9a8e7b5063cbbd752ca90217733bef684314d7df06d');
 const contract=await f.chain.getContract(curve),account=contract.account;
 contract.account={...account,account:{...account.account,storage:{...account.account.storage,
  state:{type:'active',state:{...contract.accountState.state,code:historicalCode}}}}};
 const oldResult=await buy(510000000000n,inventory);
 const oldBuy=oldResult.transactions.find(t=>t.inMessage?.info.dest?.equals(curve)&&op(t.inMessage)===0x5fcc3d14);
 assert.equal(oldBuy.description.actionPhase.resultCode,37);
 assert.equal(oldBuy.outMessages.size,0);
 assert.equal(await curveBalance(),balanceBefore+510000000000n-oldBuy.totalFees.coins);
 await f.chain.loadFrom(expensive);
 const failed=await buy(510000000000n,inventory);
 const failedBuy=failed.transactions.find(t=>t.inMessage?.info.dest?.equals(curve)&&op(t.inMessage)===0x5fcc3d14);
 assert.equal(failedBuy.description.computePhase.exitCode,405);
 assert.equal(failedBuy.description.actionPhase,undefined);
 assert.equal(failedBuy.description.aborted,true);
 assert.equal(await curveBalance(),balanceBefore);
 assert.deepEqual(await state(),before);
 const returned=[...failedBuy.outMessages.values()];
 assert.equal(returned.length,1);
 assert.equal(returned[0].info.bounced,true);
 assert(returned[0].info.dest.equals(f.owner.address));
 assert.equal(returned[0].info.value.coins+returned[0].info.forwardFee+failedBuy.totalFees.coins,510000000000n);
 // Inject a tiny, bounceable inbound directly so the sender's forwarding
 // action does not mask the recipient's no-funds bounce under this fee schedule.
 const {internal}=require('@ton/sandbox');
 const tiny=await f.chain.sendMessage(internal({from:f.owner.address,to:curve,value:1000000n,bounce:true,
  body:beginCell().storeUint(0x5fcc3d14,32).storeUint(101,64).storeCoins(1).endCell()}));
 const tinyBuy=tiny.transactions.find(tx=>tx.inMessage?.info.dest?.equals(curve));
 assert.equal(tinyBuy.description.aborted,true);
 assert.equal(tinyBuy.description.bouncePhase.type,'no-funds');
 assert.equal(tinyBuy.outMessages.size,0);
 assert.deepEqual(await state(),before);
});

test('non-bounceable native excess credits a frozen buyer account without recipient code execution',async()=>{
 const f=await fixture();
 await require('./vnext-package-support').bootstrap(f);
 const {freeze}=require('./refund-receipts-support');
 const {internal}=require('@ton/sandbox');
 const curve=f.c.addresses.curve,buyer=f.owner.address;
 const body=beginCell().storeUint(0x5fcc3d14,32).storeUint(302,64).storeCoins(1).endCell();
 const attachment=510000000000n,refund=attachment-40000000n-TON-3030303030n;
 let received=false,frozen=false,buyerBefore;
 for await(const tx of await f.chain.sendMessageIter(internal({from:buyer,to:curve,value:attachment,body,bounce:true}))){
  const m=tx.inMessage;
  if(m?.info.dest?.equals(curve)&&op(m)===0x5fcc3d14){
   await freeze(f,buyer);
   buyerBefore=(await f.chain.getContract(buyer)).balance;
   frozen=true;
  }
  if(m?.info.type==='internal'&&m.info.src.equals(curve)&&m.info.dest.equals(buyer)&&m.info.value.coins===refund){
   assert.equal(m.info.bounce,false);
   assert.equal(op(m),0xd53276db);
   assert.equal(tx.description.computePhase.type,'skipped');
   assert.equal((await f.chain.getContract(buyer)).balance,buyerBefore+refund-tx.totalFees.coins);
   assert.equal(tx.outMessages.size,0);
   received=true;
  }
 }
 assert(frozen&&received);
});
test('experimental generation2 routes actual Curve funding through STON.fi into authenticated permanent Locker custody; full settlement stays pending',async()=>{
 const f=await ready(),c=f.c;assert.equal((await f.chain.runGetMethod(c.addresses.curve,'get_dispatch_state_curve',[{type:'int',value:77n}])).stackReader.readBigNumber(),1n);const funding=await f.fund();assert.equal((await f.chain.runGetMethod(c.addresses.curve,'get_dispatch_state_curve',[{type:'int',value:77n}])).stackReader.readBigNumber(),2n);assert.equal((await f.stage())[0],3n);
 const p=await f.authorize(),before=f.transactions.length,r=await f.execute(p);console.log('ONE_SHOT_UNEXPECTED_FAILURES',JSON.stringify(summary(r.transactions)));assert(exit(r,c.addresses.migration,0));
 const s=await f.stage();console.log('ONE_SHOT_STATE',s.map(x=>x.toString()));assert.equal(s[0],5n);assert(s[1]>0n);assert.equal(s[2],s[1]);assert.equal(s[3],0n);assert.equal(s[4],0n);assert.equal(s[6],0n);
 const held=(await f.chain.runGetMethod(c.vault.lpWallet,'get_wallet_data')).stackReader;assert.equal(held.readBigNumber(),s[1]);assert(held.readAddress().equals(c.vault.address));assert(held.readAddress().equals(c.vault.pool));
 // Balance conservation at each real dispatch includes the remaining
 // forwarding fee on outgoing messages, not only transaction.totalFees.
 const balanceRelease=(result,address)=>{const t=result.transactions.find(t=>t.inMessage?.info.dest?.equals(address));const outs=[...t.outMessages.values()].reduce((n,m)=>n+(m.info.type==='internal'?m.info.value.coins+m.info.forwardFee:0n),0n);return outs+t.totalFees.coins-t.inMessage.info.value.coins;};
 assert.equal(balanceRelease(funding,c.addresses.curve),TON);assert.equal(balanceRelease(r,c.addresses.migration),TON);
 const poolResult=await f.chain.runGetMethod(c.vault.pool,'get_pool_data'),pool=poolResult.stackReader;assert.equal(pool.readBigNumber(),0n);assert(pool.readAddress().equals(c.dex));const lpSupply=pool.readBigNumber();assert(lpSupply>=s[1]);const reserves=[pool.readBigNumber(),pool.readBigNumber()];assert(reserves.includes(TON)&&reserves.includes(200000000000000000n));
 const liabilities=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_extended_data')).stackReader;liabilities.readBigNumber();for(let i=0;i<3;i++)liabilities.readAddress();assert.equal(liabilities.readBigNumber(),TON);assert.equal(liabilities.readBigNumber(),200000000000000000n,'LP custody does not erase unresolved deposit obligations');
 assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stack[3].value,1n);
 assert(exit(await f.send(c.addresses.curve,f.dispatch(),250000000n),c.addresses.curve,409));assert(exit(await f.execute(p),c.addresses.migration,409));assert.equal((await f.stage())[1],s[1]);
 const receipt=r.transactions.find(t=>t.inMessage?.info.src?.equals(c.vault.address)&&op(t.inMessage)===0x414c5635).inMessage;
 const replay=await f.chain.sendMessage(receipt);assert(exit(replay,c.addresses.migration,409));assert.equal((await f.stage())[1],s[1]);
 const pending=await f.send(c.addresses.migration,beginCell().storeUint(0x414e5d20,32).storeUint(77,64).endCell(),20000000n);assert(exit(pending,c.addresses.migration,0));assert.equal((await f.stage())[0],6n);
 assert(exit(await f.send(c.addresses.migration,beginCell().storeUint(0x414e4c43,32).storeUint(77,64).endCell()),c.addresses.migration,414));
 console.log('ONE_SHOT_FEES',JSON.stringify({scope:'LOCAL_SANDBOX_NOT_NETWORK_QUOTE',executeTransactionFeesNano:r.transactions.reduce((n,t)=>n+t.totalFees.coins,0n).toString(),lpUnits:s[1].toString(),actualCurveFunding:true,complete:false,transactions:r.transactions.length}));
 if(process.env.ANLGRAM_ONE_SHOT_EVIDENCE){
  const fs=require('node:fs'),msg=m=>({from:m.info.type==='internal'?m.info.src.toRawString():null,to:m.info.dest.toRawString(),op:op(m).toString(16),hash:beginCell().store(core.storeMessage(m)).endCell().hash().toString('hex'),valueNano:m.info.type==='internal'?m.info.value.coins.toString():null,remainingForwardFeeNano:m.info.type==='internal'?m.info.forwardFee.toString():null});
  fs.writeFileSync(process.env.ANLGRAM_ONE_SHOT_EVIDENCE,JSON.stringify({scope:'LOCAL_SOURCE_COMPILED_SANDBOX_ONLY',generation:2,seededFinancialState:false,treasuryProviderSubstitution:false,financialDeploymentAuthorized:false,actualCurveFunding:true,lpCustodyObserved:true,complete:false,lpUnits:s[1].toString(),transactions:f.transactions.map(t=>({hash:t.hash().toString('hex'),in:msg(t.inMessage),out:[...t.outMessages.values()].map(msg),totalFeesNano:t.totalFees.coins.toString(),gasUsed:t.description.computePhase.gasUsed?.toString(),computeExitCode:t.description.computePhase.exitCode,actionResult:t.description.actionPhase?.resultCode,aborted:t.description.aborted}))},null,2)+'\n');
 }
});

for(const [percent,duration,seconds]of [[50,'days180',15552000],[75,'days365',31536000]])test(`actual one-shot Curve/DEX custody preserves ${percent}%/${duration} immutable LP allocation`,async()=>{
 const f=await ready({percent,duration}),c=f.c;await f.fund();const p=await f.authorize(),r=await f.execute(p);assert(exit(r,c.addresses.migration,0));const s=await f.stage();assert.equal(s[0],5n);assert.equal(s[2],(s[1]*BigInt(percent)+99n)/100n);assert.equal(s[2]+s[3],s[1]);assert.equal(s[4],0n);assert.equal(s[6],0n);
 const vault=(await f.chain.runGetMethod(c.vault.address,'get_lock_v2')).stackReader;assert.equal(vault.readBigNumber(),BigInt(percent));assert.equal(vault.readBigNumber(),BigInt(seconds));assert.equal(vault.readBigNumber(),BigInt(f.chain.now+seconds));
 for(let i=0;i<5;i++)vault.readBigNumber();assert(vault.readAddress().equals(f.owner.address));assert(vault.readAddress().equals(f.other.address));
});

test('malformed permission/digest, insufficient caller gas and duplicate execution cannot consume or release principal twice',async()=>{
 const f=await ready(),c=f.c;
 const bad=beginCell().storeUint(0x414e5803,32).storeUint(77,64).storeUint(1,64).storeBuffer(Buffer.alloc(32)).endCell();assert(exit(await f.send(c.addresses.curve,bad,250000000n),c.addresses.curve,409));
 assert(exit(await f.send(c.addresses.curve,f.dispatch(),249999999n),c.addresses.curve,407));assert.equal((await f.life())[2],0n);assert.equal((await f.life())[3],0n);
 await f.fund();const p=await f.authorize(),pkg=require('../../minter-contract/scripts/migration-package-dispatch-v2'),m=pkg.execute(core,c,p);
 assert(exit(await f.send(m.to,m.body,399999999n),m.to,405));assert.equal((await f.life())[11],0n);assert.equal((await f.chain.runGetMethod(m.to,'get_registration_vnext')).stack[3].value,0n);
 const malformed=pkg.execute(core,c,{...p,digest:Buffer.alloc(32)});assert(exit(await f.send(malformed.to,malformed.body,malformed.value),m.to,409));
 assert(exit(await f.execute(p),m.to,0));const received=(await f.stage())[1];assert(exit(await f.execute(p),m.to,409));assert.equal((await f.stage())[1],received);
 const forged=await f.send(m.to,beginCell().storeUint(0x414c5635,32).storeUint(77,64).storeUint(999,64).storeCoins(received).storeCoins(received).storeCoins(0).storeCoins(0).storeUint(0xffffffffffffffffn,64).storeRef(beginCell().storeAddress(c.vault.pool).storeAddress(c.vault.lpWallet).endCell()).endCell(),100000000n,f.other);assert(exit(forged,m.to,401));assert.equal((await f.stage())[1],received);
});

test('expired permission and actual non-Testnet execution context fail closed before Curve release',async()=>{
 const f=await ready(),c=f.c;f.chain.now+=60;assert(exit(await f.send(c.addresses.curve,f.dispatch(),250000000n),c.addresses.curve,409));assert.equal((await f.life())[2],0n);
 const g=await ready(),config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),g.chain.config);config.set(19,beginCell().storeInt(-239,32).endCell());g.chain.setConfig(beginCell().storeDictDirect(config).endCell());assert(exit(await g.send(g.c.addresses.curve,g.dispatch(),250000000n),g.c.addresses.curve,408));assert.equal((await g.life())[2],0n);assert.equal((await g.life())[3],0n);
});

test('genuine funding recipient failure preserves Curve-wallet tokens and Migrator TON, cannot rearm or dispatch another principal copy',async()=>{
 const f=await ready(),c=f.c,{freeze,restore}=require('./refund-receipts-support');const own=core.contractAddress(0,{code:c.wallet,data:beginCell().storeCoins(0).storeAddress(c.addresses.migration).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()}),old=await freeze(f,own);
 const r=await f.send(c.addresses.curve,f.dispatch(),250000000n);assert(exit(r,c.addresses.curve,0));await f.sync();const l=await f.life();assert.equal(l[2],TON);assert.equal(l[3],0n);assert.equal((await f.stage())[0],2n);
 assert.equal((await f.chain.runGetMethod(c.curveWallet,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);assert((await f.chain.getContract(c.addresses.migration)).balance>=TON);
 await restore(f,own,old);assert(exit(await f.send(c.addresses.curve,f.dispatch(),250000000n),c.addresses.curve,409));assert.equal((await f.life())[3],0n);
 assert(exit(await f.send(c.addresses.migration,beginCell().storeUint(0x414e5904,32).storeUint(77,64).endCell(),120000000n),c.addresses.migration,414));
});

test('delayed actual Curve-generated token leg leaves FUNDING_PENDING, then authentic cumulative receipt reaches FUNDED without seeded assets',async()=>{
 const f=await ready(),c=f.c,{internal}=require('@ton/sandbox');
 // Only the initiating owner message is a local actor input. Every asset leg
 // below is taken verbatim from the actual Curve transaction's outMessages.
 const root=await(await f.chain.getContract(c.addresses.curve)).receiveMessage(internal({from:f.owner.address,to:c.addresses.curve,value:250000000n,body:f.dispatch()}));assert(!root.description.aborted);assert(root.description.actionPhase.success);
 const native=[...root.outMessages.values()].find(m=>m.info.dest.equals(c.addresses.migration)),tokens=[...root.outMessages.values()].find(m=>m.info.dest.equals(c.curveWallet));assert(native&&tokens);
 await f.chain.sendMessage(native);await f.sync();assert.equal((await f.stage())[0],2n);assert.equal((await f.life())[2],TON);assert.equal((await f.life())[3],0n);
 await f.chain.sendMessage(tokens);await f.sync();assert.equal((await f.stage())[0],3n);assert.equal((await f.life())[3],200000000000000000n);
 const p=await f.authorize();assert(exit(await f.execute(p),c.addresses.migration,0));assert.equal((await f.stage())[0],5n);
});

test('lost first actual LP notification retains physical LP but cannot become observed custody from a balance, timeout or empty snapshot',async()=>{
 const f=await ready(),c=f.c;await f.fund();const p=await f.authorize(),{freeze,restore}=require('./refund-receipts-support'),old=await freeze(f,c.vault.address);assert(exit(await f.execute(p),c.addresses.migration,0));
 const held=(await f.chain.runGetMethod(c.vault.lpWallet,'get_wallet_data')).stackReader.readBigNumber();assert(held>0n);assert.equal((await f.stage())[0],4n);assert.equal((await f.stage())[1],0n);
 await restore(f,c.vault.address,old);await f.send(c.addresses.migration,beginCell().storeUint(0x414e5a02,32).storeUint(77,64).endCell(),50000000n);assert.equal((await f.stage())[1],0n);
 await f.send(c.addresses.migration,beginCell().storeUint(0x414e5d20,32).storeUint(77,64).endCell(),20000000n);const s=await f.stage();assert.equal(s[0],6n);assert.equal(s[5],0n);assert.equal(s[6],0n);
 assert(exit(await f.execute(p),c.addresses.migration,409));
});

test('actual DEX pTON leg failure keeps token deposit/refund obligations separate and settlement pending, with no concurrent recovery',async()=>{
 const f=await ready(),c=f.c;await f.fund();const p=await f.authorize(),{freeze}=require('./refund-receipts-support');await freeze(f,c.ptonWallet);const r=await f.execute(p);assert(exit(r,c.addresses.migration,0));
 assert.equal((await f.stage())[1],0n);const d=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_data')).stackReader;d.readBigNumber();for(let i=0;i<5;i++)d.readAddress();assert.equal(d.readBigNumber(),TON);assert.equal(d.readBigNumber(),0n);
 assert(exit(await f.send(c.addresses.migration,beginCell().storeUint(0x414e4c3c,32).storeUint(77,64).endCell(),900000000n),c.addresses.migration,414));assert(exit(await f.execute(p),c.addresses.migration,409));
 await f.send(c.addresses.migration,beginCell().storeUint(0x414e5d20,32).storeUint(77,64).endCell(),20000000n);assert.equal((await f.stage())[0],6n);assert.equal((await f.stage())[6],0n);assert((await f.chain.getContract(c.addresses.migration)).balance>=TON);
});

test('a genuine delayed Locker notification remains consumable after permit expiry because dispatch was already consumed while fresh',async()=>{
 const f=await ready(),c=f.c;await f.fund();const p=await f.authorize(),pkg=require('../../minter-contract/scripts/migration-package-dispatch-v2'),m=pkg.execute(core,c,p),{internal}=require('@ton/sandbox');let delayed=false;
 for await(const tx of await f.chain.sendMessageIter(internal({from:f.owner.address,to:m.to,value:m.value,body:m.body}))){
  if(tx.inMessage?.info.dest?.equals(c.vault.lpWallet)&&op(tx.inMessage)===0x178d4519){f.chain.now+=61;delayed=true;}
 }
 assert(delayed);assert.equal((await f.stage())[0],5n);assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stack[3].value,1n);assert(exit(await f.execute(p),c.addresses.migration,409));
});


test('real Pool minimum-LP rejection preserves both assets in the exact LPAccount; observations cannot rearm or fabricate refunds',async()=>{
 const f=await ready(),c=f.c;await f.fund();const p=await f.authorize(1000000000000000000n),r=await f.execute(p);assert(exit(r,c.addresses.migration,0));assert.equal((await f.stage())[1],0n);
 const account=(await f.chain.runGetMethod(c.vault.pool,'get_lp_account_address',[{type:'slice',cell:beginCell().storeAddress(c.addresses.migration).endCell()}])).stackReader.readAddress();
 const held=(await f.chain.runGetMethod(account,'get_lp_account_data')).stackReader;assert(held.readAddress().equals(c.addresses.migration));assert(held.readAddress().equals(c.vault.pool));const amounts=[held.readBigNumber(),held.readBigNumber()];assert(amounts.includes(TON)&&amounts.includes(200000000000000000n));
 const data=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_data')).stackReader;data.readBigNumber();for(let i=0;i<5;i++)data.readAddress();assert.equal(data.readBigNumber(),0n);assert.equal(data.readBigNumber(),0n,'held foreign assets are not already-refunded Migrator custody');
 const reconciliation=(await f.chain.runGetMethod(c.addresses.migration,'get_migration_settlement')).stackReader;assert.equal(reconciliation.readBigNumber(),3n);reconciliation.readBigNumber();reconciliation.readBigNumber();assert.equal(reconciliation.readBigNumber(),TON);assert.equal(reconciliation.readBigNumber(),200000000000000000n);assert.equal(reconciliation.readBigNumber(),0n);assert.equal(reconciliation.readBigNumber(),0n);
 await f.send(c.addresses.migration,beginCell().storeUint(0x414e5c10,32).storeUint(77,64).endCell(),150000000n);const observation=(await f.chain.runGetMethod(c.addresses.migration,'get_recovery_observation_vnext')).stack.map(x=>x.value);assert.equal(observation[2],4n);assert.equal(observation[3],200000000000000000n);assert.equal(observation[4],TON);assert.equal(observation[7],0n);
 assert.equal((await f.life())[11],1n);assert(exit(await f.execute(p),c.addresses.migration,409));assert(exit(await f.send(c.addresses.curve,f.dispatch(),250000000n),c.addresses.curve,409));assert(exit(await f.send(c.addresses.migration,beginCell().storeUint(0x414e4c3c,32).storeUint(77,64).endCell(),900000000n),c.addresses.migration,414));
});

test('forward-fee exhaustion in the action phase emits neither critical leg and rolls back epoch consumption even with compute exit0',async()=>{
 const f=await ready(),c=f.c;await f.fund();const p=await f.authorize();
 const config=core.Dictionary.loadDirect(core.Dictionary.Keys.Int(32),core.Dictionary.Values.Cell(),f.chain.config),prices=config.get(25).beginParse();assert.equal(prices.loadUint(8),0xea);prices.loadUintBig(64);
 // Adversarial local network-cost configuration, not a fee quote or code
 // patch. Keep every price field except the base forwarding charge intact.
 config.set(25,beginCell().storeUint(0xea,8).storeUint(100000000n,64).storeSlice(prices).endCell());f.chain.setConfig(beginCell().storeDictDirect(config).endCell());
 const r=await f.execute(p),root=r.transactions.find(t=>t.inMessage?.info.dest?.equals(c.addresses.migration));assert.equal(root.description.computePhase.exitCode,0);assert.equal(root.description.actionPhase.resultCode,37);assert.equal(root.description.aborted,true);assert.equal(root.outMessages.size,0);
 assert.equal((await f.chain.runGetMethod(c.addresses.migration,'get_registration_vnext')).stack[3].value,0n);assert.equal((await f.life())[11],0n);assert.equal((await f.stage())[0],3n);
 const own=core.contractAddress(0,{code:c.wallet,data:beginCell().storeCoins(0).storeAddress(c.addresses.migration).storeAddress(c.addresses.minter).storeRef(c.wallet).endCell()});assert.equal((await f.chain.runGetMethod(own,'get_wallet_data')).stackReader.readBigNumber(),200000000000000000n);assert((await f.chain.getContract(c.addresses.migration)).balance>=TON);
});
