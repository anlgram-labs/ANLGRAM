'use strict';
(async()=>{
  const status=document.getElementById('status'), start=document.getElementById('start'), disconnect=document.getElementById('disconnect');
  let ui,version=0;
  const text=value=>{status.textContent=value;};
  try {
    const r=await fetch('/api/config',{cache:'no-store'}); if(!r.ok)throw Error('Configuración no disponible');
    const config=await r.json();
    if(config.network!=='-3'||config.financialSigningEnabled!==false||new URL(config.manifestUrl).origin!==location.origin)throw Error('Configuración insegura');
    document.getElementById('operator').textContent=config.operator;
    document.getElementById('minter').textContent=config.minter;
    ui=new TON_CONNECT_UI.TonConnectUI({manifestUrl:config.manifestUrl,restoreConnection:false});
    ui.onStatusChange(async wallet=>{
      const current=++version; disconnect.disabled=!wallet;
      if(!wallet){text('Sin conexión autenticada.');return;}
      if(wallet.account.chain!=='-3'||wallet.account.address!==config.operator){
        const received=`Red recibida: ${wallet.account.chain}. Cuenta recibida: ${wallet.account.address}.`;
        await ui.disconnect();text('Conexión rechazada. '+received+' Se requiere el operador V5 aprobado en Testnet (-3).');return;
      }
      const item=wallet.connectItems?.tonProof;
      if(!item||!('proof' in item)){text('Prueba no disponible. Reconecta con una wallet compatible con ton_proof.');return;}
      text('Verificando prueba de propiedad…');
      try{
        const response=await fetch('/api/proof/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:wallet.account,proof:item.proof})});
        const result=await response.json();
        if(!response.ok||result.verified!==true||result.address!==config.operator||result.network!=='-3')throw Error();
        if(current===version){
          const feature=wallet.device?.features?.find(f=>f==='SendTransaction'||f?.name==='SendTransaction');
          const app=String(wallet.device?.appName||'no declarada').slice(0,80),appVersion=String(wallet.device?.appVersion||'no declarada').slice(0,40);
          const limit=typeof feature==='object'&&Number.isSafeInteger(feature.maxMessages)?String(feature.maxMessages):'no declarado';
          text('Propiedad verificada hasta '+new Date(result.expiresAt*1000).toISOString()+'. Firma financiera bloqueada. Wallet declarada: '+app+' '+appVersion+'. Capacidad SendTransaction declarada: '+Boolean(feature)+', máximo de mensajes: '+limit+'. No se ha probado ninguna firma transaccional.');
        }
      }catch{if(current===version)text('Prueba rechazada o expirada. Desconecta y vuelve a conectar.');}
    });
    start.onclick=async()=>{
      start.disabled=true;
      try{
        if(ui.connected)await ui.disconnect();
        ui.setConnectRequestParameters({state:'loading'});
        const r=await fetch('/api/proof/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(!r.ok)throw Error();
        const challenge=await r.json();
        ui.setConnectRequestParameters({state:'ready',value:{tonProof:challenge.payload}});
        await ui.openModal();
      }catch{text('No se pudo preparar la prueba. No firmes transacciones.');}finally{start.disabled=false;}
    };
    disconnect.onclick=async()=>{try{await ui.disconnect();}catch{text('Desconexión no confirmada.');}};
    document.getElementById('refresh').onclick=async()=>{
      const el=document.getElementById('balance');el.textContent='Consultando Testnet…';
      try{
        const r=await fetch('/api/operator',{cache:'no-store'}),data=await r.json();
        if(!r.ok){el.textContent=data.reason==='PROVIDER_RATE_LIMITED'?'Saldo desconocido: límite de TON Center (429). Espera '+data.retryAfterSeconds+' s.':data.reason==='TESTNET_KEY_INVALID'||data.reason==='TESTNET_KEY_NETWORK_FORBIDDEN'?'Saldo desconocido: clave Testnet rechazada.':'Saldo desconocido: proveedor no disponible ('+r.status+').';return;}
        if(data.network!=='-3'||data.address!==config.operator||!/^\d+$/.test(data.balanceNano))throw Error();
        const nano=BigInt(data.balanceNano);el.textContent=`${nano/1000000000n}.${(nano%1000000000n).toString().padStart(9,'0')} Testnet TON · ${data.state} · ${data.observedUtc} · ${data.dataStatus==='SHORT_LIVED_CACHE'?'caché breve; no es preflight':'lectura del proveedor'}`;
      }catch{el.textContent='Saldo desconocido: API no disponible.';}
    };
  }catch{text('Entorno bloqueado: configuración o SDK no disponible.');start.disabled=true;}
})();
