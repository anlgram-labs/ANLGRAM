/* Public Jetton inspection through the existing network-isolated GET client. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./blockchain-provider'):root.BlockchainProvider,
  typeof module==='object'&&module.exports?require('./memelabs-readonly'):root.ANLGRAM_READONLY_UTILS);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.document.addEventListener('DOMContentLoaded',()=>api.mount(root));
})(typeof window==='undefined'?globalThis:window,function(provider,readonly){
 'use strict';
 const raw=a=>{const v=provider.validateTonAddress(a);if(!v.valid)throw Error('Enter a complete TON Jetton contract address.');return v.raw;};
 const same=(a,b)=>{try{return raw(a)===raw(b);}catch{return false;}};
 async function inspect(client,address){
  address=raw(address);
  const data=await client.jetton(address),meta=data?.metadata;
  if(!meta||!same(meta.address,address))throw Error('The provider did not return metadata for this exact Jetton.');
  const [holders,history]=await Promise.allSettled([client.holders(address),client.transactions(address)]);
  const h=holders.status==='fulfilled'&&Array.isArray(holders.value?.addresses)?holders.value.addresses:null;
  const t=history.status==='fulfilled'&&Array.isArray(history.value?.transactions)?history.value.transactions:null;
  return{address,name:typeof meta.name==='string'?meta.name.slice(0,256):'Unnamed Jetton',symbol:typeof meta.symbol==='string'?meta.symbol.slice(0,32):'Unavailable',
   verification:typeof data.verification==='string'?data.verification.slice(0,40):typeof meta.verification==='string'?meta.verification.slice(0,40):'unavailable',
   supply:readonly.formatUnits(data.total_supply,meta.decimals),decimals:meta.decimals,
   holdersCount:Number.isSafeInteger(data.holders_count)&&data.holders_count>=0?String(data.holders_count):'Unavailable',
   holders:h?.every(x=>{try{raw(x.address);return true;}catch{return false;}})?h.slice(0,5).map(x=>({address:raw(x.address),balance:readonly.formatUnits(x.balance,meta.decimals)})):null,
   transactions:t?.every(x=>same(x?.account?.address,address)&&/^[a-f0-9]{64}$/i.test(x?.hash||''))?t.slice(0,20).map(x=>({hash:x.hash.toLowerCase(),
    status:x.success===true&&x.aborted===false?'Recorded successful execution':x.success===false||x.aborted===true?'Recorded failed execution':'Execution status unavailable',
    timestamp:Number.isSafeInteger(x.utime)&&x.utime>=0&&x.utime<8640000000000?new Date(x.utime*1000).toISOString():null})):null};
 }
 function controller({context,load,render}){
  let generation=0;
  return{clear(){generation++;let network;try{network=context().network;}catch(_){}render({status:'empty',network});},async submit(address){
   const current=++generation;let net;
   try{net=context();raw(address);render({status:'loading',network:net.network});
    const data=await load(address),now=context();
    if(current===generation)render(now.chainId===net.chainId?{status:'loaded',network:net.network,explorer:net.tonviewerBase,data}:{status:'empty',network:now.network});
   }catch(error){if(current===generation)render({status:'error',network:net?.network,message:error.message||'Blockchain data unavailable.'});}
  }};
 }
 function mount(w){
  const doc=w.document,form=doc.getElementById('memelabs-inspector-form');if(!form||!w.ANLGRAM_READONLY)return;
  const input=doc.getElementById('memelabs-inspector-address'),button=doc.getElementById('memelabs-inspector-submit'),status=doc.getElementById('memelabs-inspector-status'),result=doc.getElementById('memelabs-inspector-results');
  function element(tag,text,className){const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function link(label,url){const a=element('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function render(state){
   button.disabled=state.status==='loading';result.replaceChildren();
   const network=state.network==='testnet'?'TON Testnet':state.network==='mainnet'?'TON Mainnet':'Network unavailable';
   status.textContent=network+' · '+(state.status==='loading'?'Loading real blockchain data…':state.status==='error'?state.message:state.status==='loaded'?
    'Indexed blockchain data. Financial operations unavailable.':'Inspect a Jetton address; no wallet connection or signature is required.');
   if(state.status!=='loaded')return;
   const d=state.data,summary=element('div',undefined,'glass-card'),grid=element('div',undefined,'labs-stats-grid-2x2');
   summary.append(element('h3',`${d.name} (${d.symbol})`),link(d.address.slice(0,12)+'…'+d.address.slice(-8),`${state.explorer}/address/${encodeURIComponent(d.address)}`),element('p',`Provider token status: ${d.verification}. Token names and indexed data are not a safety endorsement.`));
   for(const[label,value]of[['Total on-chain supply',d.supply],['Decimals',readonly.formatUnits('1',d.decimals)==='Unavailable'?'Unavailable':String(d.decimals)],['Indexed holders',d.holdersCount],['LP custody','Unverified']]){
    const cell=element('div',undefined,'labs-stat-cell');cell.append(element('span',label,'labs-stat-label'),element('span',value,'labs-stat-val'));grid.append(cell);
   }summary.append(grid);result.append(summary);
   const holderCard=element('div',undefined,'glass-card');holderCard.append(element('h3','Top indexed holders'));
   if(d.holders===null)holderCard.append(element('p','Holder data unavailable. Inspect again to retry.'));
   else if(!d.holders.length)holderCard.append(element('p','No indexed holder records.'));
   else{const list=element('ul');for(const h of d.holders){const item=element('li');item.append(link(h.address.slice(0,10)+'…'+h.address.slice(-6),`${state.explorer}/address/${encodeURIComponent(h.address)}`),doc.createTextNode(` — ${h.balance} ${d.symbol}`));list.append(item);}holderCard.append(list);}result.append(holderCard);
   const historyCard=element('div',undefined,'glass-card');historyCard.append(element('h3','Recent Jetton master transactions'),element('p','Contract account history, not all holder transfers or proof of a submitted wallet payment.'));
   if(d.transactions===null)historyCard.append(element('p','Transaction history unavailable. Inspect again to retry.'));
   else if(!d.transactions.length)historyCard.append(element('p','No indexed contract transactions.'));
   else{const list=element('ul');for(const t of d.transactions){const item=element('li');item.append(link(t.hash.slice(0,12)+'…',`${state.explorer}/transaction/${t.hash}`),doc.createTextNode(` — ${t.status}${t.timestamp?' · '+t.timestamp:''}`));list.append(item);}historyCard.append(list);}result.append(historyCard);
  }
  const view=controller({context:()=>w.ANLGRAM_READONLY.getContext(),load:a=>{
   const c=w.ANLGRAM_READONLY.getContext();return inspect(readonly.client({network:c.network,proxy:c.tonApiBase,fetch:w.fetch.bind(w)}),a);
  },render});
  form.addEventListener('submit',e=>{e.preventDefault();view.submit(input.value.trim());});
  input.addEventListener('input',()=>view.clear());w.addEventListener('anlgramWalletChanged',()=>view.clear());view.clear();
 }
 return{inspect,controller,mount};
});
