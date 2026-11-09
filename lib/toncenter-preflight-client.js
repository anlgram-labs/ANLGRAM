'use strict';
// Local read/emulation helper only. No signing, sendBoc, arbitrary hosts or
// redirects. A Testnet key is never sent to Mainnet or placed in a URL/log.
function createClient({key=process.env.TONCENTER_TESTNET_API_KEY,fetchImpl=fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let tail=Promise.resolve(),nextAt=0,failures=0;
 async function perform(url,body){
  const u=new URL(url);
  if(!['https://testnet.toncenter.com','https://toncenter.com'].includes(u.origin)||u.username||u.password||!['/api/v2/getAddressInformation','/api/emulate/v1/emulateTrace'].includes(u.pathname)||u.searchParams.has('api_key'))throw Error('Non-readonly provider request rejected');
  if(u.pathname.includes('emulateTrace')&&(!body||body.ignore_chksig!==true||typeof body.boc!=='string'))throw Error('Only unsigned emulation allowed');
  for(let attempt=0;attempt<2;attempt++){
   const delay=Math.max(0,nextAt-now());if(delay>5000)throw Error('Provider cooldown; wait before a new preflight');if(delay)await sleep(delay);
   nextAt=now()+1500;
   const headers={...(body?{'Content-Type':'application/json'}:{}),...(key?.trim()&&u.origin==='https://testnet.toncenter.com'?{'X-API-Key':key.trim()}:{})};
   const r=await fetchImpl(url,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
   const value=await r.json();const code=r.ok&&value.ok===false?Number(value.code):r.status;
   if(![429,503].includes(code)){if(r.ok)failures=0;return{status:r.status,value};}
   failures++;const h=r.headers.get('Retry-After');let retry=h&&/^\d+(\.\d+)?$/.test(h)?Math.ceil(Number(h)*1000):Math.max(0,Date.parse(h)-now())||0;
   nextAt=now()+Math.max(1500*2**Math.min(failures-1,6),retry);
   if(attempt===1||nextAt-now()>5000)return{status:code,value:{ok:false,error:code===429?'Provider rate limited':'Provider unavailable',code}};
  }
 }
 return (url,body)=>{const pending=tail.then(()=>perform(url,body));tail=pending.catch(()=>{});return pending;};
}
module.exports={createClient};
