'use strict';
// Read-only preparation controller: deliberately has no wallet/SDK reference.
(()=>{
 const refresh=document.getElementById('recovery-refresh'),prepare=document.getElementById('recovery-prepare'),out=document.getElementById('recovery-status');
 let busy=false;
 const ton=s=>{if(!/^\d+$/.test(s))throw Error('Importe no verificable');const n=BigInt(s);return `${n/1000000000n}.${(n%1000000000n).toString().padStart(9,'0')}`;};
 async function read(action){
  if(busy)return;busy=true;refresh.disabled=prepare.disabled=true;out.textContent='Consultando Testnet; no se solicita ninguna firma.';
  try{
   const r=await fetch('/api/recovery/'+action,{...(action==='prepare'?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:{}),cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(45000)}),j=await r.json();
   if(!r.ok)throw Error(j.error||'Datos no disponibles; no reintentar una operación financiera.');
   if(j.scope!=='SERVER_RECOVERY_PREPARATION_NOT_EXECUTION'||j.financialSigningEnabled!==false)throw Error('Respuesta incompatible; firma cerrada.');
   if(action==='status'||action==='observe'){
    if(j.executionEnabled!==false||j.successor?.eligibleForAuthorization!==false)throw Error('Configuración rechazada.');
    out.textContent=`Operación: ${j.operation}\nIntento original: ${j.originalLock.state}\nFingerprint original: ${j.originalLock.fingerprint||'no disponible'}\nRecibo independiente finalizado: ${j.independentFinalityVerified?'incompatible':'NO verificado'}\nSucesor: ${j.successorOperation}; nonce aún sin autorizar.\n${j.currentChain?'Cuentas observadas: '+new Date(j.currentChain.observedAt).toISOString()+'; nonce '+j.currentChain.seqno+'; saldo '+ton(j.currentChain.balanceNano)+' TON; Curve '+j.currentChain.curveState+'. No demuestra ejecución de un intento.':'Cuentas actuales: no consultadas.'}\nBloqueos: ${j.blockedBy.join(', ')}.\nNo se desbloquea ni repite #2. No hay solicitud de transacción.`;
   }else{
    if(j.requestAllowed!==false||j.transaction?.network!=='-3'||j.transaction.messages?.length!==1||j.transaction.messages[0].amount!=='10000000'||j.transaction.messages[0].stateInit!==undefined)throw Error('Candidato rechazado.');
    out.textContent=`Preparación sin autorización: ${j.approval.kind}\nAutoenvío Testnet: ${ton(j.transaction.messages[0].amount)} TON a ${j.transaction.messages[0].address}\nNonce observado: ${j.approval.expectedSeqno}\nFingerprint: ${j.approval.fingerprint}\nFees de red modeladas: ${ton(j.model.totalNetworkFeesNano)} TON\nAdjunto + todas las fees modeladas: ${ton(j.approval.modeledGrossDebitNano)} TON\nCaduca: ${new Date(j.approval.quoteExpiresAt*1000).toISOString()}\nPolítica propuesta: 0,02 TON; NO máximo garantizado ni autorización de gasto.\nCuentas corroboradas por dos proveedores; NO recibo finalizado. Firma y sucesor deshabilitados hasta revisión independiente y aprobación exacta.`;
   }
  }catch(e){out.textContent='No se preparó ninguna solicitud financiera. '+(e.message||'Proveedor no disponible.');}finally{busy=false;refresh.disabled=prepare.disabled=false;}
 }
 refresh.onclick=()=>read('observe');prepare.onclick=()=>read('prepare');
})();
