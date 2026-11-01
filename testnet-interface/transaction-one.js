'use strict';
// Only transaction #1. No automatic preparation, signing, re-send or step #2.
window.ANLGRAM_TRANSACTION_ONE=function(config,ui){
 const prepare=document.getElementById('prepare-one'),send=document.getElementById('request-one'),review=document.getElementById('review-one'),accept=document.getElementById('accept-one');
 let proofUntil=0,prepared=null,attempted=false,busy=false,generation=0;
 const text=value=>{review.textContent=value;};
 const disable=()=>{prepared=null;accept.checked=false;send.disabled=true;};
 const valid=()=>location.origin==='https://testnet.anlgram.com'&&config.minterTransactionOnePreparationEnabled===true&&ui.wallet?.account?.chain==='-3'&&ui.wallet.account.address===config.operator&&proofUntil>Math.floor(Date.now()/1000);
 const update=()=>{prepare.disabled=attempted||busy||!valid();send.disabled=attempted||busy||!valid()||!accept.checked||!prepared||Math.min(prepared.transaction.validUntil,prepared.quoteExpiresAt)<=Math.floor(Date.now()/1000);};
 prepare.onclick=async()=>{
  if(attempted||busy||!valid())return;busy=true;disable();update();const current=generation;text('Preparando lecturas y simulación frescas. No se solicita firma.');
  try{
   const r=await fetch('/api/operation/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(20000)}),j=await r.json();
   if(current!==generation||!valid())return;
   if(!r.ok||j.prepared!==true||!Number.isSafeInteger(j.quoteExpiresAt)||j.quoteExpiresAt<=Math.floor(Date.now()/1000)||j.notSigned!==true||j.transaction?.network!=='-3'||j.transaction.from!==config.operator||j.transaction.messages?.length!==1||j.transaction.messages[0].address!==config.minter||j.transaction.messages[0].amount!=='100000000'||j.policyCeilingIsNotEnforcedMaximum!==true)throw Error('Preparación rechazada; revisa estado/prueba o límite de un intento.');
   prepared=j;const nano=BigInt(j.simulation.modeledSenderDebitNano);if(nano>120000000n||nano<=100000000n)throw Error('Modelo fuera de política.');
   text(`SOLO TESTNET (-3), transacción #1.\nOperador: ${j.operatorAddress}\nDestino: ${config.minter}\nUn mensaje, adjunto: 0.100000000 Testnet TON.\nDébito modelado: ${nano/1000000000n}.${(nano%1000000000n).toString().padStart(9,'0')} Testnet TON.\n0.120000000 TON es política, NO máximo garantizado.\nStateInit SHA256: ${j.stateInitHash}\nFingerprint: ${j.fingerprint}\nCaduca mensaje: ${new Date(j.transaction.validUntil*1000).toISOString()}. Cotización: ${new Date(j.quoteExpiresAt*1000).toISOString()}.\nLa wallet puede firmar y transmitir antes de responder. Revisa red, importe y destino en Tonkeeper. Un resultado incierto bloquea nuevos intentos. No se inicia #2.`);
  }catch(e){disable();text(e.message||'Preparación no disponible. No firmes.');}finally{busy=false;update();}
 };
 accept.onchange=update;
 send.onclick=async()=>{
  if(send.disabled||attempted||busy||!valid()||!prepared)return;
  if(Math.min(prepared.transaction.validUntil,prepared.quoteExpiresAt)<=Math.floor(Date.now()/1000)){disable();text('Cotización caducada antes de solicitar firma. Prepara datos frescos.');update();return;}
  // Set before the first asynchronous SDK call. Server + patched transport add
  // the lifetime cross-tab/reload guard before any financial bridge POST.
  attempted=true;busy=true;const transaction=prepared.transaction;update();
  text('Solicitud única a Tonkeeper. Revisa y aprueba tú solo la transacción #1; puedes rechazarla. No se reintentará.');
  try{await ui.sendTransaction(transaction,{modals:[],notifications:[]});text('Respuesta de la wallet recibida. NO confirma despliegue. Operación bloqueada; se requiere verificación independiente en Testnet antes de continuar.');}
  catch{text('Resultado rechazado o incierto. No reintentes, no recargues para reenviar y no repitas manualmente. Operación bloqueada hasta reconciliación con Testnet.');}
  finally{busy=false;disable();update();}
 };
 return {invalidate(){generation++;proofUntil=0;disable();update();},authenticate(wallet,proof){if(wallet.account.chain==='-3'&&wallet.account.address===config.operator){proofUntil=proof.expiresAt;update();}}};
};
