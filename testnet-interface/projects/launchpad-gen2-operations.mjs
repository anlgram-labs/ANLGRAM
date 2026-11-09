const supply=1000000000000000000n;
const boc=cell=>cell.toBoc().toString('base64');
const hash=cell=>cell.hash().toString('hex');

// One message per future approval. These attachments reproduce the Sandbox
// lifecycle and must be re-emulated and reviewed before any wallet request.
export function launchpadGenesisOperations(candidate, {beginCell,Cell,storeStateInit}) {
 const c=candidate,query=c.operationId;
 const internalMint=beginCell().storeUint(0x178d4519,32).storeUint(query,64)
  .storeCoins(supply).storeAddress(null).storeAddress(c.operator)
  .storeCoins(60000000n).storeBit(false).endCell();
 const mint=beginCell().storeUint(21,32).storeUint(query,64).storeAddress(c.addresses.curve)
  .storeCoins(100000000n).storeRef(internalMint).endCell();
 const renounce=beginCell().storeUint(3,32).storeUint(0x414e4c4752454e4fn,64)
  .storeAddress(null).storeAddress(c.addresses.curve).endCell();
 const operations=[];
 const add=(name,to,attachment,body,init)=>{
  const stateInit=init?beginCell().store(storeStateInit(init)).endCell():null;
  operations.push({name,operationId:String(query)+':'+name,network:'-3',source:c.operator.toRawString(),
   message:{address:to.toString({testOnly:true,bounceable:true}),amount:String(attachment),
    payload:boc(body),...(stateInit?{stateInit:boc(stateInit)}:{})},
   payloadHash:hash(body),stateInitHash:stateInit?hash(stateInit):null,
   status:'PREPARED',requiresSeparateApproval:true,executionEligible:false});
 };
 for(const role of ['minter','curve','guard','migration']){
  add('deploy-'+role,c.addresses[role],100000000n,Cell.EMPTY,c.states[role]);
 }
 add('deploy-locker',c.vault.address,100000000n,Cell.EMPTY,c.vault.init);
 add('initialize-curve',c.addresses.curve,100000000n,c.initCurve);
 add('mint-to-curve',c.addresses.minter,200000000n,mint);
 add('renounce-and-activate',c.addresses.minter,50000000n,renounce);
 return operations;
}
