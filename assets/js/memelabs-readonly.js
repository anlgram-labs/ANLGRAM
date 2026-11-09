/* Read-only review release: blockchain GETs remain available; transaction signing is closed. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./blockchain-provider'):root.BlockchainProvider);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{
    api.installReadOnlyGuard(root);root.ANLGRAM_READONLY=api.browser(root);root.ANLGRAM_READONLY_UTILS=api;
    root.document.addEventListener('DOMContentLoaded',()=>api.prepareView(root.document));
    root.document.addEventListener('click',event=>{
      const wallet=event.target.closest?.('#labsTopbarWalletBtn, #topbarWalletBtn, #heroWalletBtn, .connect-wallet-btn, [data-wallet-btn]');
      if(wallet&&typeof root.openWalletModal==='function'){
        // Existing inline and delegated handlers otherwise open the SDK twice
        // after a wallet refresh. Preserve the connector and call it once.
        event.preventDefault();event.stopImmediatePropagation();
        Promise.resolve(root.openWalletModal()).catch(error=>root.console.warn('Wallet selector unavailable:',error.message));
        return;
      }
      const button=event.target.closest?.('[onclick]');
      if(button&&api.isFinancialAction(button.getAttribute('onclick'))){
        event.preventDefault();event.stopImmediatePropagation();
        root.alert('Unavailable in this read-only release. No transaction was requested.');
      }
    },true);
    root.addEventListener('anlgramWalletChanged',()=>api.updateNetworkLabels(root));
  }
})(typeof window==='undefined'?globalThis:window,function(provider){
  'use strict';
  function network(chain,search,stored){
    if(chain!==undefined&&chain!==null&&chain!==''){
      if(String(chain)==='-3')return 'testnet';
      if(String(chain)==='-239')return 'mainnet';
      throw Error('Unsupported connected wallet network');
    }
    const q=new URLSearchParams(search||'');
    if(q.get('network')==='testnet'||q.has('testnet'))return 'testnet';
    if(q.get('network')==='mainnet')return 'mainnet';
    return stored==='testnet'?'testnet':'mainnet';
  }
  function formatUnits(raw,decimals,places=2){
    if(typeof raw==='number'&&Number.isSafeInteger(raw)&&raw>=0)raw=String(raw);
    if(decimals===null||decimals===undefined||decimals==='')return 'Unavailable';
    const d=Number(decimals);
    if(typeof raw!=='string'||!/^\d{1,130}$/.test(raw)||!Number.isInteger(d)||d<0||d>30)return 'Unavailable';
    const n=BigInt(raw);
    if(!d)return n.toString();
    const count=Math.min(d,Math.max(0,Math.min(8,places)));
    // Match the connector's displayed rounding while keeping arithmetic exact.
    const divisor=10n**BigInt(d-count),rounded=(n+divisor/2n)/divisor,scale=10n**BigInt(count);
    const whole=(rounded/scale).toString();
    return count?whole+'.'+(rounded%scale).toString().padStart(count,'0'):whole;
  }
  function client({network:net,proxy='',fetch:fetcher=globalThis.fetch,timeout=8000}){
    if(net!=='mainnet'&&net!=='testnet')throw Error('Explicit network required');
    const direct=net==='testnet'?'https://testnet.tonapi.io/v2':'https://tonapi.io/v2';
    if(proxy){
      const u=new URL(proxy,'https://local.invalid');
      if(u.username||u.password||u.search||u.hash||(!proxy.startsWith('/')&&u.protocol!=='https:'))throw Error('Invalid proxy');
    }
    const primary=net==='testnet'?direct:(proxy||direct).replace(/\/+$/,'');
    async function once(base,endpoint){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
      try{return await fetcher(base+endpoint,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal});}
      finally{clearTimeout(timer);}
    }
    async function request(endpoint){
      if(typeof endpoint!=='string'||!/^\/(accounts|jettons|blockchain|rates)(\/|\?|$)/.test(endpoint)||/[\\#\r\n]/.test(endpoint)||/%2f|%5c|%2e|%25|%00|%0a|%0d|\.\./i.test(endpoint))throw Error('Invalid read-only endpoint');
      let response;
      try{response=await once(primary,endpoint);}catch(error){if(primary===direct)throw error;}
      if(primary!==direct&&(!response||response.status===429||response.status>=500||(proxy.startsWith('/')&&response.status===404)))return once(direct,endpoint);
      return response;
    }
    function address(a){const v=provider.validateTonAddress(a);if(!v.valid)throw Error('Invalid TON address');return encodeURIComponent(v.raw);}
    async function json(endpoint){const r=await request(endpoint);if(!r.ok)throw Error('Blockchain data unavailable (HTTP '+r.status+')');return r.json();}
    return{network:net,request,
      account:a=>json('/accounts/'+address(a)),
      jettons:a=>json('/accounts/'+address(a)+'/jettons'),
      jetton:a=>json('/jettons/'+address(a)),
      holders:a=>json('/jettons/'+address(a)+'/holders?limit=5'),
      events:a=>json('/accounts/'+address(a)+'/events?limit=20'),
      transactions:a=>json('/blockchain/accounts/'+address(a)+'/transactions?limit=20')};
  }
  function browser(w){
    function context(){
      const tc=w.tonConnectUI||w.TonConnectUIInstance;
      let chain=tc?.wallet?.account?.chain??tc?.account?.chain;
      if((tc?.wallet?.account?.address||tc?.account?.address)&&chain==null)throw Error('Connected wallet network unavailable');
      let stored;try{stored=w.localStorage.getItem('anlgram_wallet_network')||w.localStorage.getItem('anlgram_staking_network');}catch(_){}
      const net=network(chain,w.location.search,stored),test=net==='testnet';
      const proxy=w.ANLGRAM_TON_PROXY_URL||w.ANLGRAM_CONFIG?.TON_PROXY_URL||'/api/ton';
      return{network:net,isTestnet:test,chainId:test?'-3':'-239',tonApiBase:test?'https://testnet.tonapi.io/v2':String(proxy).replace(/\/+$/,''),
        tonApiDirectBase:test?'https://testnet.tonapi.io/v2':'https://tonapi.io/v2',tonscanBase:test?'https://testnet.tonscan.org':'https://tonscan.org',tonviewerBase:test?'https://testnet.tonviewer.com':'https://tonviewer.com'};
    }
    function current(){const c=context();return client({network:c.network,proxy:c.tonApiBase,fetch:w.fetch.bind(w)});}
    return{getContext:context,fetchTonApi:endpoint=>current().request(endpoint),formatUnits,
      jettons:a=>current().jettons(a),jetton:a=>current().jetton(a),holders:a=>current().holders(a),account:a=>current().account(a),events:a=>current().events(a),transactions:a=>current().transactions(a)};
  }
  function installReadOnlyGuard(w){
    const message='Transactions are unavailable in this read-only review release. Financial verification and separate release approval are required.';
    const guarded=new WeakSet();
    // Intercept SDK publication, including asynchronously restored sessions. Wallet
    // connection/authentication methods remain untouched. No original send method
    // is retained or exposed by this release boundary.
    for(const key of ['tonConnectUI','TonConnectUIInstance']){
      let instance=w[key];
      const protect=value=>{
        if(value&&!guarded.has(value)){
          Object.defineProperty(value,'sendTransaction',{value:async()=>{throw Error(message);},configurable:false,writable:false});
          guarded.add(value);
          if(value.connector)protect(value.connector);
        }
        return value;
      };
      instance=protect(instance);
      Object.defineProperty(w,key,{configurable:false,enumerable:true,get:()=>instance,set:value=>{instance=protect(value);}});
    }
  }
  function isFinancialAction(handler){
    return /\b(deployJettonWeb3|deployViaFactory|provideLiquidityWeb3|mintMoreTokensWeb3|renounceAdminWeb3|anlgramDeployToken|labsOpenDeployConfirmModal|labsExecuteDeployFromWizard|labsReviewAndSendDistribution|labsExecuteDistributionBatch|labsSubmitVesting|labsOpenBurnConfirmModal|labsExecuteBurnFromModal|labsOpenRenounceConfirmModal|labsConfirmRenounceExecution)\s*\(/.test(handler||'');
  }
  function updateNetworkLabels(w){
    let name='Network unavailable';
    try{name=w.ANLGRAM_READONLY.getContext().isTestnet?'TON Testnet':'TON Mainnet';}catch(_){}
    for(const selector of ['#sidebarNetworkText','#labs-review-network','#labs-ana-network','.wizard-dex-net-tag']){
      const el=w.document.querySelector(selector);if(el)el.textContent=name+(selector==='#sidebarNetworkText'?' · Read-only':'');
    }
  }
  function prepareView(document){
    for(const [id,columns] of [['managed-wallets-tbody',4],['trending-tokens-tbody',5]]){
      const table=document.getElementById(id);
      if(table){table.innerHTML='<tr><td colspan="'+columns+'">Connect wallet to load verified blockchain data.</td></tr>';table.hidden=false;}
    }
    document.querySelectorAll('#tab-explorer .stat-value').forEach(el=>{el.textContent='Unavailable';});
    document.querySelectorAll('#tab-explorer .stat-change').forEach(el=>{el.textContent='Live aggregate data not verified';});
    const portfolio=document.querySelector('#tab-wallet .glass-card:last-child > div:last-child');
    if(portfolio)portfolio.textContent='Portfolio allocation data unavailable.';
    const disableActions=()=>document.querySelectorAll('[onclick]').forEach(el=>{
      if(isFinancialAction(el.getAttribute('onclick'))){
        el.setAttribute('aria-disabled','true');el.setAttribute('title','Unavailable in this read-only release');
        if('disabled' in el&&!el.disabled)el.disabled=true;
      }
    });
    disableActions();
    if(document.defaultView?.MutationObserver){
      new document.defaultView.MutationObserver(disableActions).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','onclick']});
    }
    if(document.defaultView?.ANLGRAM_READONLY)updateNetworkLabels(document.defaultView);
  }
  return{network,formatUnits,client,browser,installReadOnlyGuard,prepareView,isFinancialAction,updateNetworkLabels};
});
