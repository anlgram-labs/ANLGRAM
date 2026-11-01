'use strict';
window.ANLGRAM_TRANSACTION_TWO=function(config,ui){
 const prepare=document.getElementById('prepare-two'),send=document.getElementById('request-two'),review=document.getElementById('review-two'),accept=document.getElementById('accept-two');
 let proofUntil=0,prepared=null,attempted=false,busy=false,generation=0,expiryTimer;
 const valid=()=>location.origin==='https://testnet.anlgram.com'&&config.curveTransactionTwoPreparationEnabled===true&&ui.wallet?.account?.chain==='-3'&&ui.wallet.account.address===config.operator&&proofUntil>Math.floor(Date.now()/1000);
 const disable=()=>{clearTimeout(expiryTimer);prepared=null;accept.checked=false;accept.disabled=true;send.disabled=true;};
 const update=()=>{prepare.disabled=attempted||busy||!valid();send.disabled=attempted||busy||!valid()||!accept.checked||prepared?.requestAllowed!==true||Math.min(prepared?.transaction.validUntil||0,prepared?.quoteExpiresAt||0)<=Math.floor(Date.now()/1000);};
 prepare.onclick=async()=>{
  if(attempted||busy||!valid())return;busy=true;disable();update();const current=generation;review.textContent='Consultando estado y emulación frescos; no se solicita firma.';
  try{
   const r=await fetch('/api/curve-two/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runtimeVersion:config.curveExecutionVersion}),redirect:'manual',signal:AbortSignal.timeout(40000)}),j=await r.json();
   if(current!==generation||!valid())return;
   if(!r.ok||j.prepared!==true||j.notSigned!==true||j.expectedSeqno!==1||j.transaction?.network!=='-3'||j.transaction.from!==config.operator||j.transaction.messages?.length!==1||j.transaction.messages[0].address!=='kQAfBL9a-9BPmFH6GVUYoUz0byuToTRHAwFAgqZXAyRo7kOW'||j.transaction.messages[0].amount!=='100000000'||j.stateInitHash!=='1f04bf5afbd04f9851fa195518a14cf46f2b93a1344703014082a657032468ee'||j.policyCeilingIsNotEnforcedMaximum!==true||j.nativeSeqnoIsNotEnforced!==true||!Number.isSafeInteger(j.quoteExpiresAt)||j.quoteExpiresAt<=Math.floor(Date.now()/1000))throw Error(j.error||'Preparación incompatible o caducada.');
   const nano=BigInt(j.simulation.modeledSenderDebitNano);if(nano<=100000000n||nano>120000000n)throw Error('Fuera de política.');
   prepared=j;accept.disabled=j.requestAllowed!==true;
   expiryTimer=setTimeout(()=>{if(attempted||!prepared)return;disable();review.textContent='Cotizacion caducada. No se solicito firma; prepara datos nuevos manualmente.';update();},Math.max(0,(Math.min(j.transaction.validUntil,j.quoteExpiresAt,proofUntil)*1000)-Date.now()));
   review.textContent=`TESTNET -3 — Curve #2, NO repetir minter #1.\nDestino: ${j.transaction.messages[0].address}\nStateInit hash: ${j.stateInitHash}\nAdjunto: 0.100000000 Testnet TON.\nDébito modelado nanoTON: ${nano}; fees: ${j.simulation.modeledSenderFeesNano}.\n0.120000000 TON es política, NO máximo garantizado.\nSeqno esperado 1: TON Connect no lo impone en la wallet. No hagas operaciones concurrentes.\nFingerprint: ${j.fingerprint}\nCaduca: ${new Date(Math.min(j.transaction.validUntil,j.quoteExpiresAt)*1000).toISOString()}\n${j.requestAllowed?'Aprobación limitada configurada.':'FIRMA CERRADA: falta aprobación separada del propietario.'}`;
  }catch(e){disable();review.textContent=e.message||'No disponible; no firmes.';}finally{busy=false;update();}
 };
 accept.onchange=update;
 send.onclick=async()=>{
  update();if(send.disabled||attempted||busy||!prepared)return;
  attempted=true;busy=true;clearTimeout(expiryTimer);const transaction=prepared.transaction;update();
  try{await ui.sendTransaction(transaction,{modals:[],notifications:[]});review.textContent='Respuesta no verificada. Operación bloqueada hasta comprobar el trace finalizado real; no se inicia ningún paso posterior.';}
  catch{review.textContent='Resultado incierto o rechazado. No repetir. Reconciliación Testnet obligatoria.';}
  finally{busy=false;disable();update();}
 };
 return{invalidate(){generation++;proofUntil=0;disable();update();},authenticate(wallet,proof){if(wallet.account.chain==='-3'&&wallet.account.address===config.operator){proofUntil=proof.expiresAt;update();}}};
};
