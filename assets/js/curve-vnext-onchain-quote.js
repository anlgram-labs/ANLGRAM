/* ANLGRAM VNext real, read-only on-chain buy quote adapter.
 * No local reserve estimates, signing, broadcasts or execution authority.
 * Only bytecode matching the reviewed candidate is eligible for display.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ANLGRAM_CURVE_LIVE_QUOTE = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURVE_CODE_HASH = '5746848a31ec5b3ed8e52e250ff9d7ef9b2c3e3f73f643363b4c8e32dea26d41';
  const NANO = 1000000000n;
  const ENDPOINTS = Object.freeze({mainnet:'https://tonapi.io/v2',testnet:'https://testnet.tonapi.io/v2'});

  function tonToNano(value) {
    const v = String(value).trim();
    if (!/^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,9})?$/.test(v)) throw Error('Invalid TON amount (max 9 decimals)');
    const [whole,fraction=''] = v.split('.');
    const result = BigInt(whole)*NANO+BigInt(fraction.padEnd(9,'0')||'0');
    if (result<=0n || result>1000000n*NANO) throw Error('TON amount out of range');
    return result;
  }
  function formatUnits(n,decimals=9) {
    if (typeof n!=='bigint'||n<0n) throw Error('Invalid monetary units');
    const divisor=10n**BigInt(decimals);
    const fraction=(n%divisor).toString().padStart(decimals,'0').replace(/0+$/,'');
    return (n/divisor).toString()+(fraction?'.'+fraction:'');
  }
  function parseNumber(entry) {
    // TON integer values are arbitrary precision. Never accept JSON numbers:
    // large nanoTON/token amounts can already be rounded by JSON.parse.
    const isTuple = Array.isArray(entry);
    const kind = isTuple ? entry[0] : entry?.type;
    // Require an explicit numeric TVM type for both tuple and object encodings.
    // An untyped object with a value field is not authenticated stack data.
    if (kind !== 'num' && kind !== 'int')
      throw Error('Unexpected TVM stack type');
    if (isTuple && entry.length !== 2) throw Error('Malformed TVM stack');
    if (!isTuple && (entry === null || typeof entry !== 'object' ||
        (entry.num !== undefined && entry.value !== undefined && entry.num !== entry.value)))
      throw Error('Malformed TVM stack');
    const raw = isTuple ? entry[1] : (entry.num ?? entry.value);
    if (typeof raw !== 'string') throw Error('TVM integer must be an exact string');
    if (!/^-?(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(raw))
      throw Error('Invalid TVM numeric value');
    return raw.startsWith('-0x') ? -BigInt(raw.slice(1)) : BigInt(raw);
  }
  function parseQuote(result,gross) {
    if (typeof gross!=='bigint'||gross<=0n) throw Error('Invalid gross quote amount');
    if (!result||result.success!==true||result.exit_code!==0) throw Error('Getter did not complete successfully');
    const stack=result.stack??result.result?.stack;
    if (!Array.isArray(stack)||stack.length!==5) throw Error('Unexpected VNext getter result');
    const [tokens,fee,consumed,refund,graduation]=stack.map(parseNumber);
    // VNext charges a floor-rounded 1% protocol fee on the GROSS TON
    // actually consumed, not on the submitted maximum when capped.
    // A positive principal must remain after that fee.
    if(tokens<=0n||fee<0n||consumed<=0n||fee!==consumed/100n||
       consumed-fee<=0n||refund<0n||consumed+refund!==gross||
       (graduation!==0n&&graduation!==-1n)) {
      throw Error('Getter returned inconsistent financial accounting');
    }
    return {tokensAtomic:tokens,feeNano:fee,consumedNano:consumed,refundNano:refund,willGraduate:graduation===-1n};
  }
  function cellBytes(raw) {
    if (typeof raw!=='string'||!raw.length) throw Error('Missing on-chain code BOC');
    if (/^(?:[0-9a-fA-F]{2})+$/.test(raw)) return Uint8Array.from(raw.match(/../g),h=>parseInt(h,16));
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) throw Error('Malformed on-chain code BOC');
    const binary=atob(raw.replace(/-/g,'+').replace(/_/g,'/'));
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  function hashHex(bytes) {return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  function ensureAddress(address,network,tonCore) {
    if(!['testnet','mainnet'].includes(network)) throw Error('Invalid TON network');
    if(typeof address!=='string'||address.length>80||!address.trim()) throw Error('Enter a Curve contract address');
    const value=address.trim();
    if(!tonCore?.Address?.parse||!tonCore?.Cell?.fromBoc) throw Error('TON Core not available');
    tonCore.Address.parse(value);
    if(!value.includes(':')) {
      const testOnly=/^(?:kQ|0Q)/.test(value);
      const mainOnly=/^(?:EQ|UQ)/.test(value);
      if((network==='testnet'&&!testOnly)||(network==='mainnet'&&!mainOnly)) throw Error('Wallet address network tag mismatch');
    }
    return value;
  }
  async function quote({address,network,grossTon,tonCore,request}={}) {
    const amount=tonToNano(grossTon), account=ensureAddress(address,network,tonCore);
    const getterPath='/blockchain/accounts/'+encodeURIComponent(account)+'/methods/get_buy_quote_v2?args=0x'+amount.toString(16);
    const statePath='/blockchain/accounts/'+encodeURIComponent(account);
    const load=request|| (async path=>{
      // The shared proxy may cache account metadata. Read the code directly
      // for this inspection, and use the uncached proxy route only for the getter.
      if(path===getterPath&&network==='mainnet'&&typeof globalThis.anlgramFetchTonApi==='function')
        return globalThis.anlgramFetchTonApi(path,{cache:'no-store'});
      return fetch(ENDPOINTS[network]+path,{cache:'no-store'});
    });
    const accountResponse=await load(statePath);
    if(!accountResponse?.ok) throw Error('On-chain contract state unavailable');
    const state=await accountResponse.json();
    if(!state?.code||!['active','ACTIVE'].includes(String(state.status??state.state??''))) throw Error('Curve contract not active');
    const cells=tonCore.Cell.fromBoc(cellBytes(state.code));
    if(cells.length!==1||hashHex(cells[0].hash()).toLowerCase()!==CURVE_CODE_HASH) throw Error('Curve code hash does not match VNext candidate');
    const response=await load(getterPath);
    if(!response?.ok) throw Error('Live on-chain quote unavailable');
    const data=await response.json(), values=parseQuote(data,amount);
    return Object.freeze({...values,contractAddress:account,network,codeHash:CURVE_CODE_HASH,source:'TonAPI blockchain getter',observedAt:new Date().toISOString()});
  }
  return Object.freeze({CURVE_CODE_HASH,tonToNano,formatUnits,parseQuote,quote});
});
