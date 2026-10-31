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
      if(wallet.account.chain!=='-3'||wallet.account.address!==config.operator){await ui.disconnect();text('Red o cuenta incorrecta. Se requiere el operador aprobado en Testnet.');return;}
      const item=wallet.connectItems?.tonProof;
      if(!item||!('proof' in item)){text('Prueba no disponible. Reconecta con una wallet compatible con ton_proof.');return;}
      text('Verificando prueba de propiedad…');
      try{
        const response=await fetch('/api/proof/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:wallet.account,proof:item.proof})});
        const result=await response.json();
        if(!response.ok||result.verified!==true||result.address!==config.operator||result.network!=='-3')throw Error();
        if(current===version)text('Propiedad verificada hasta '+new Date(result.expiresAt*1000).toISOString()+'. Firma financiera bloqueada.');
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
        if(!r.ok||data.network!=='-3'||data.address!==config.operator||!/^\d+$/.test(data.balanceNano))throw Error();
        const nano=BigInt(data.balanceNano);el.textContent=`${nano/1000000000n}.${(nano%1000000000n).toString().padStart(9,'0')} Testnet TON · ${data.state} · ${data.observedUtc}`;
      }catch{el.textContent='Saldo desconocido: API no disponible.';}
    };
  }catch{text('Entorno bloqueado: configuración o SDK no disponible.');start.disabled=true;}
})();
