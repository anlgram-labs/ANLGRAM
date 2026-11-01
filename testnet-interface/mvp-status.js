'use strict';
// Independent manual read-only panel; never instantiates/connects a wallet.
(()=>{
 const button=document.getElementById('mvp-refresh'),output=document.getElementById('mvp-status');
 const decimal=(value,places)=>{if(!/^\d+$/.test(value))throw Error('Unidades invalidas');const n=BigInt(value),d=10n**BigInt(places);return `${n/d}.${(n%d).toString().padStart(places,'0')}`;};
 button.onclick=async()=>{
  if(button.disabled)return;button.disabled=true;output.textContent='Consultando cuentas/getters Testnet; no se solicita wallet ni firma.';
  try{
   const r=await fetch('/api/mvp/status',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(30000)}),j=await r.json();
   if(!r.ok)throw Error(j.reason==='PROVIDER_RATE_LIMITED'?'TON Center limitado (429); espera '+j.retryAfterSeconds+' segundos.':'Proveedor no disponible; saldo y estado desconocidos.');
   if(j.network!=='-3'||j.financialSigningEnabled!==false||j.migrationEnabled!==false||j.lpWithdrawalsEnabled!==false||j.scope!=='ACCOUNT_AND_GETTER_OBSERVATIONS_NOT_TRANSACTION_RECEIPTS'||j.minter?.decimals!==9||j.minter.symbol!=='ANLTEST')throw Error('Respuesta incompatible; no se muestra un saldo supuesto.');
   const dispatch=j.curveDeploymentOperation;
   const dispatchText=dispatch?.scope==='PERSISTENT_DISPATCH_RECORD_NOT_TRANSACTION_RECEIPT'&&dispatch.retryPermitted===false?'Registro de envio #2: '+dispatch.state+(dispatch.fingerprint?' / '+dispatch.fingerprint:'')+'. No es un recibo de cadena. No reintentar.':'Registro de envio #2 no disponible; no reintentar.';
   const balance=w=>w.custodyVerified===true?decimal(w.balanceUnits,9)+' ANLTEST (cuenta verificada)':w.state==='NOT_DEPLOYED'?'Wallet Jetton no desplegada; saldo no disponible':'Custodia no verificada';
   output.textContent=`SOLO TESTNET -3\nObservado: ${j.observedUtc}\nDatos: ${j.dataStatus}\nEtapa: ${j.stage}\nMinter: ${j.minter.address}\nToken: ${j.minter.name} (${j.minter.symbol}), ${j.minter.decimals} decimales\nSuministro real: ${decimal(j.minter.supplyUnits,9)} ANLTEST\nAdministrador: ${j.minter.renouncedObserved?'renuncia observada en storage':'operador; NO renunciado'}\nCurve: ${j.curve.address}\nCuenta Curve: ${j.curve.accountState}; estado contractual: ${j.curve.protocolState??'no disponible'}\nCustodia Curve: ${balance(j.curveWallet)}\nBalance Jetton del operador: ${balance(j.buyerWallet)}\n${j.curve.reserves?'Reserva TON real: '+decimal(j.curve.reserves.realTonReserveNano,9)+' TON; fees acumuladas: '+decimal(j.curve.reserves.accruedProtocolFeesNano,9)+' TON; reembolsos pendientes: '+decimal(j.curve.reserves.pendingRefundUnits,9)+' ANLTEST.':'Reservas no disponibles: Curve no desplegada.'}\n${dispatchText}\nLas cuentas/getters NO confirman una transaccion concreta ni un reembolso. No hay trading, migracion ni retiros LP habilitados.`;
  }catch(e){output.textContent='Estado no disponible. '+(e.message||'Error de lectura.');}finally{button.disabled=false;}
 };
})();
