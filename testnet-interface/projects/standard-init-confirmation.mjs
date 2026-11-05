import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {lstat} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';

const nowSeconds=()=>Math.floor(Date.now()/1000);
const expired=()=>Error('Initialization quote expired before signing reservation');
export async function checkInitMarkers(directory,operator) {
  for(const suffix of ['init-pending','init-broadcast']){
    try { await lstat(join(directory,operator.slice(2)+'.'+suffix)); }
    catch(error){if(error.code==='ENOENT')continue;throw error;}
    throw Error('Existing wallet initialization attempt marker');
  }
}

export async function confirmInitialization(request, {dialog=false, now=nowSeconds,
  execute=promisify(execFile), input=process.stdin, output=process.stderr}={}) {
  const {quote,wallet}=request;
  const expected='AUTHORIZE TESTNET INIT '+quote.fingerprint;
  if(now()>=quote.validUntil)throw expired();
  if(dialog){
    let response;
    try {
      const shell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      const file=fileURLToPath(new URL('../standard-init-confirmation.ps1',import.meta.url));
      const details={address:wallet.address||quote.operator,network:quote.network,
        fingerprint:quote.fingerprint,validUntil:quote.validUntil,
        modeledFeeNano:quote.modeledFeeNano,policyCeilingNano:quote.ownerPolicyCeilingNano};
      const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
        /^(systemroot|windir|temp|tmp|userprofile|localappdata|appdata)$/i.test(key)));
      response=await execute(shell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',file],
        {windowsHide:true,maxBuffer:2048,timeout:(quote.validUntil-now())*1000+1000,
          env:{...env,ANLGRAM_INIT_DIALOG_DETAILS:JSON.stringify(details)}});
    } catch(error){
      if(now()>=quote.validUntil||error.code===3)throw expired();
      if(error.code===2)throw Error('Owner cancelled');
      throw Error('Owner confirmation dialog unavailable');
    }
    if(now()>=quote.validUntil)throw expired();
    if(response.stdout.replace(/\r?\n$/,'')!==expected)throw Error('Exact owner authorization required');
    return;
  }
  output.write(`\nWallet initialization only | TON Testnet (-3) | ${wallet.address||quote.operator}\nFingerprint: ${quote.fingerprint}\n${expected}\n`);
  const line=createInterface({input,output});
  const closed=new AbortController();
  line.once('close',()=>closed.abort());
  try {
    while(now()<quote.validUntil){
      const answer=await line.question('Owner confirmation (Ctrl+C to cancel): ',
        {signal:AbortSignal.any([closed.signal,AbortSignal.timeout(Math.max(1,(quote.validUntil-now())*1000))])});
      if(now()>=quote.validUntil)throw expired();
      if(answer===expected)return;
      output.write(answer?'Authorization does not match the current fingerprint.\n':'No authorization entered. Try again.\n');
    }
    throw expired();
  } catch(error) {
    if(now()>=quote.validUntil)throw expired();
    if(closed.signal.aborted)throw Error('Owner cancelled');
    throw error;
  } finally { line.close(); }
}
