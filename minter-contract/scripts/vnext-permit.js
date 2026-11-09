'use strict';
// Offline Testnet migration authority only. No private keys or signing routine.
function buildGuard(core,{code,curve,migrator,master,operationId,publicKey,versionsHash,lpIntentHash,migratorTemplate}){
 const a=x=>core.Address.parse(typeof x==='string'?x:x.toRawString());
 if(migrator||!migratorTemplate)throw Error('Canonical Guard requires an acyclic Migrator genesis template');const addresses=[a(curve),null,a(master)];if(addresses.some(x=>x&&x.workChain!==0))throw Error('Basechain participants required');
 const exact=x=>{if(typeof x!=='bigint'&&!(typeof x==='string'&&/^\d+$/.test(x)))throw Error('Exact operation ID required');return BigInt(x);},q=exact(operationId);if(q<=0n||q>=(1n<<62n))throw Error('Operation ID bounds');
 for(const h of [publicKey,versionsHash,lpIntentHash])if(!/^[a-f0-9]{64}$/.test(h||''))throw Error('Exact public commitment required');if(/^0+$/.test(publicKey))throw Error('Explicit nonzero public authority key required');
 const scope=core.beginCell().storeAddress(addresses[0]).storeAddress(addresses[1]).storeAddress(addresses[2]);if(migratorTemplate)scope.storeRef(migratorTemplate);
 const config=core.beginCell().storeUint(q,64).storeBuffer(Buffer.from(publicKey,'hex')).storeBuffer(Buffer.from(versionsHash,'hex')).storeBuffer(Buffer.from(lpIntentHash,'hex')).storeRef(scope.endCell()).endCell();
 const init={code,data:core.beginCell().storeUint(1,8).storeRef(config).storeDict(null).endCell()};return{init,address:core.contractAddress(0,init),config,curve:addresses[0],migrator:addresses[1],master:addresses[2],operationId:q,versionsHash,lpIntentHash,publicKey,financialSigningEnabled:false,custodyAuthority:false};
}
function permit(core,g,o){
 const exact=(x,max)=>{if(typeof x!=='bigint'&&!(typeof x==='string'&&/^\d+$/.test(x)))throw Error('Exact permit integer required');const n=BigInt(x);if(n<0n||n>max)throw Error('Permit integer bounds');return n;};
 if(![1,2].includes(o.phase)||!Number.isInteger(o.starts)||!Number.isInteger(o.deadline)||o.starts<1||o.deadline>0xffffffff||o.deadline<=o.starts||o.deadline-o.starts>60)throw Error('Migration phase and at-most60s window required');
 const nonce=exact(o.nonce,0xffffffffffffffffn),ce=exact(o.curveEpoch,0xffffffffffffffffn),fe=exact(o.fundingEpoch,0xffffffffffffffffn),de=exact(o.dexEpoch,0xffffffffffffffffn),ton=exact(o.tonNano,(1n<<120n)-1n),tokens=exact(o.jettonUnits,(1n<<120n)-1n),min=exact(o.minimumLpUnits,(1n<<120n)-1n);
 if(!nonce||!ce||!min||ton<300000000000n||tokens!==200000000000000000n||(o.phase===1?(fe!==0n||de!==0n):(!fe||!de)))throw Error('Invalid migration obligations/epochs');
 const body=core.beginCell().storeUint(0x414e5650,32).storeUint(1,8).storeInt(-3,32).storeUint(o.phase,8).storeUint(g.operationId,64).storeUint(nonce,64).storeUint(o.starts,32).storeUint(o.deadline,32).storeCoins(ton).storeCoins(tokens).storeCoins(min)
 .storeRef(core.beginCell().storeAddress(g.address).storeAddress(g.curve).storeAddress(g.migrator).endCell()).storeRef(core.beginCell().storeAddress(g.master).storeBuffer(Buffer.from(g.lpIntentHash,'hex')).endCell()).storeRef(core.beginCell().storeUint(ce,64).storeUint(fe,64).storeUint(de,64).storeBuffer(Buffer.from(g.versionsHash,'hex')).endCell()).endCell();
 const snapshot=core.beginCell().storeCoins(ton).storeCoins(tokens).storeUint(ce,64).storeUint(fe,64).storeUint(de,64).endCell();
 return{body,digest:body.hash(),nonce,phase:o.phase,snapshot,query:core.beginCell().storeUint(o.phase===1?0x414e5701:0x414e5b01,32).storeUint(g.operationId,64).storeUint(nonce,64).storeBuffer(body.hash()).storeRef(snapshot).endCell(),financialSigningEnabled:false,custodyAuthority:false};
}
function submission(core,g,p,signature){if(!Buffer.isBuffer(signature)||signature.length!==64)throw Error('Exact Ed25519 signature required');return core.beginCell().storeUint(0x414e5b10,32).storeUint(g.operationId,64).storeRef(p.body).storeRef(core.beginCell().storeBuffer(signature).endCell()).endCell();}
module.exports={buildGuard,permit,submission};
