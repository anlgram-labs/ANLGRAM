const encoder=new TextEncoder();
async function hmacKey(bytes,usage){
 return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,[usage]);
}
export async function verifyTelegramInitData(raw,botToken,now=Math.floor(Date.now()/1000)){
 if(typeof raw!=='string'||!raw||raw.length>8192||typeof botToken!=='string'||!botToken)return null;
 const params=new Map();
 for(const [key,value] of new URLSearchParams(raw)){
  if(!/^[a-z_]+$/.test(key)||params.has(key))return null;
  params.set(key,value);
 }
 const hash=params.get('hash'),date=params.get('auth_date');
 if(!/^[0-9a-f]{64}$/.test(hash||'')||!/^\d{1,12}$/.test(date||'')||
    Number(date)>now||now-Number(date)>300)return null;
 params.delete('hash');
 const data=[...params.keys()].sort().map(key=>key+'='+params.get(key)).join('\n');
 const seed=await hmacKey(encoder.encode('WebAppData'),'sign');
 const secret=await crypto.subtle.sign('HMAC',seed,encoder.encode(botToken));
 const key=await hmacKey(secret,'verify');
 const signature=Uint8Array.from(hash.match(/../g),byte=>parseInt(byte,16));
 if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(data)))return null;
 let user;
 try {user=JSON.parse(params.get('user'));}catch{return null;}
 if(!Number.isSafeInteger(user?.id)||user.id<=0)return null;
 return {id:String(user.id),username:typeof user.username==='string'?user.username.slice(0,64):null,
  first_name:typeof user.first_name==='string'?user.first_name.slice(0,128):null};
}
