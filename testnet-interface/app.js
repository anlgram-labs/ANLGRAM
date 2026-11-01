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
    const transactionOne=window.ANLGRAM_TRANSACTION_ONE(config,ui);
    const transactionTwo=window.ANLGRAM_TRANSACTION_TWO?.(config,ui);
    ui.onStatusChange(async wallet=>{
      transactionOne.invalidate();transactionTwo?.invalidate();
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
          transactionOne.authenticate(wallet,result);transactionTwo?.authenticate(wallet,result);
          const feature=wallet.device?.features?.find(f=>f==='SendTransaction'||f?.name==='SendTransaction');
          const app=String(wallet.device?.appName||'no declarada').slice(0,80),appVersion=String(wallet.device?.appVersion||'no declarada').slice(0,40);
          const limit=typeof feature==='object'&&Number.isSafeInteger(feature.maxMessages)?String(feature.maxMessages):'no declarado';
          text('Propiedad verificada hasta '+new Date(result.expiresAt*1000).toISOString()+(config.minterTransactionOnePreparationEnabled?'. Solo transacción #1 supervisada; operaciones generales bloqueadas. Wallet declarada: ':'. Firma financiera bloqueada. Wallet declarada: ')+app+' '+appVersion+'. Capacidad SendTransaction declarada: '+Boolean(feature)+', máximo de mensajes: '+limit+'. La conexión no solicita transacciones; consulta el comprobante histórico por separado.');
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
    document.getElementById('curve-report-button').onclick=async()=>{
      const button=document.getElementById('curve-report-button'),output=document.getElementById('curve-report');button.disabled=true;output.textContent='Consultando informe de solo lectura…';
      try{const response=await fetch('/curve-two-preflight.json',{cache:'no-store'}),j=await response.json();
        if(!response.ok||j.network!=='-3'||j.operation!=='ANLTEST_CURVE_TX2'||j.readyForSigning!==false||j.signed!==false||j.broadcast!==false||j.stepSpecificSigningExecutorEnabled!==false)throw Error();
        const ton=value=>{const n=BigInt(value);return String(n/1000000000n)+'.'+String(n%1000000000n).padStart(9,'0');};
        const time=new Date(j.observedUtc).toLocaleString('es',{timeZone:'America/New_York',timeZoneName:'short'});
        output.textContent='Informe observado: '+time+' (Nueva York). No es una cotización vigente ni autorización.\nMinter '+j.minter.metadata.symbol+': activo, suministro '+j.minter.supply+', decimales '+j.minter.metadata.decimals+'. Admin V5; getters y código compatibles.\nCurve aún sin inicializar. Destino: '+j.destination+'\nStateInit SHA256: '+j.stateInitHash+'\nAdjunto propuesto: '+ton(j.attachmentNano)+' Testnet TON.\nFees modelados: '+ton(j.simulation.modeledSenderFeesNano)+' TON; débito total modelado: '+ton(j.simulation.modeledSenderDebitNano)+' TON.\n0.12 TON es una propuesta de política, NO un máximo garantizado ni una aprobación.\nSandbox: '+(j.sandbox?.evidence==='LOCAL_SOURCE_COMPILED_SANDBOX_ONLY'?'despacho local verificado; no cambia la blockchain':'ver detalle técnico')+'. Emulación Testnet: completa, no es despliegue.\nFirma BLOQUEADA: faltan prueba de propiedad fresca, autorización individual y ejecutor específico #2. Migración y retiros LP siguen bloqueados.';
      }catch{output.textContent='Informe no disponible o rechazado. No se sustituyen datos por muestras ni se solicita firma.';}finally{button.disabled=false;}
    };
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
