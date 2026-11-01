function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==allowed.length||Object.keys(value).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(value,k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value')))throw Error('Unexpected transaction fields');}
export function createPolicy(intent,{pinSeqno=false}={}){
function validateIntent(tx,now=Math.floor(Date.now()/1000)){
 keys(tx,['network','from','validUntil','messages']);
 if(tx.network!==intent.network||tx.from!==intent.operator)throw Error('Wrong Testnet/operator');
 if(!Number.isSafeInteger(tx.validUntil)||tx.validUntil<=now||tx.validUntil>now+intent.maxValiditySeconds)throw Error('Invalid expiry');
 if(!Array.isArray(tx.messages)||tx.messages.length!==1||Object.keys(tx.messages).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(tx.messages,'0')||{},'value'))throw Error('Exactly one immutable data message required');
 keys(tx.messages[0],['address','amount','payload','stateInit']);
 for(const k of ['address','amount','payload','stateInit'])if(tx.messages[0][k]!==intent.message[k])throw Error('Unapproved '+k);
 return true;
}
async function fingerprint(tx){
 validateIntent(tx);const canonical=JSON.stringify({operation:intent.operation,candidate:intent.candidateSha256,...(pinSeqno?{expectedSeqno:intent.expectedSeqno,walletId:intent.walletId}:{}),network:tx.network,from:tx.from,validUntil:tx.validUntil,messages:[{address:tx.messages[0].address,amount:tx.messages[0].amount,payload:tx.messages[0].payload,stateInit:tx.messages[0].stateInit}]});
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),b=>b.toString(16).padStart(2,'0')).join('');
}

return {intent,validateIntent,fingerprint};
}
