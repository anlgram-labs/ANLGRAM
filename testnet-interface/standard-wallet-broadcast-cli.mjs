import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {projectProviders} from './projects/project-providers.mjs';
import {broadcastInitialization,reconcileInitialization,walletBroadcastEnabled} from './projects/standard-wallet-broadcast.mjs';

async function readJson(path) {
  const text = await readFile(path,'utf8');
  if (text.length > 131072) throw Error('Input too large');
  return JSON.parse(text);
}

try {
  const [command,quoteFile,signedFile,...extra] = process.argv.slice(2);
  if (!['reconcile','broadcast'].includes(command) || !quoteFile || !signedFile || extra.length) throw Error('Invalid command');
  if (command==='broadcast' && (!walletBroadcastEnabled || !process.stdin.isTTY)) throw Error('Broadcast disabled');
  const input = {prepared:await readJson(quoteFile),signed:await readJson(signedFile),
    directory:join(homedir(),'.anlgram-standard-v2'),providers:projectProviders(process.env)};
  const result = command==='reconcile' ? await reconcileInitialization(input) : await broadcastInitialization({
    ...input,apiKey:process.env.TONCENTER_TESTNET_API_KEY,confirm:async ({wallet,quote,messageHash})=>{
      console.error(JSON.stringify({operation:'TESTNET WALLET INITIALIZATION ONLY',network:'-3',wallet:wallet.operator,
        stateInitHash:quote.stateInitHash,outgoingTransfers:0,modeledFeeNano:quote.modeledFeeNano,
        policyCeilingNano:quote.ownerPolicyCeilingNano,hardFeeCapEnforced:false,validUntil:quote.validUntil,
        fingerprint:quote.fingerprint,messageHash},null,2));
      const prompt = createInterface({input:process.stdin,output:process.stderr});
      try { return await prompt.question('Type BROADCAST TESTNET WALLET INIT: ')==='BROADCAST TESTNET WALLET INIT'; }
      finally { prompt.close(); }
    }
  });
  console.log(JSON.stringify(result,null,2));
} catch {
  console.error('Initialization tool stopped. Real broadcast is hard-disabled in this build. Preserve all pending markers.');
  process.exitCode = 1;
}
