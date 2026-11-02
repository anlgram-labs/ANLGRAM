'use strict';
// Never recover a financial integer from an already-rounded JavaScript Number.
// Decimal strings and BigInt preserve full TON Coins/uint64 precision.
function unsigned(value,{max=(1n<<120n)-1n,min=0n,error='Invalid exact integer'}={}){
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error(error);
 if(!['number','bigint','string'].includes(typeof value)||!/^\d+$/.test(String(value)))throw Error(error);
 const n=BigInt(value);if(n<min||n>max)throw Error(error);return n;
}
module.exports={unsigned};
