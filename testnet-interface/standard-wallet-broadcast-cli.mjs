import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {assertWalletInitReleaseQuote} from './projects/standard-wallet-init-release.mjs';
import {projectProviders} from './projects/project-providers.mjs';
import {broadcastInitialization,reconcileInitialization,walletBroadcastEnabled} from './projects/standard-wallet-broadcast.mjs';

async function readJson(path) {
  const text = await readFile(path,'utf8');
  if (text.length > 131072) throw Error('Input too large');
  return JSON.parse(text.replace(/^\uFEFF/,''));
}

try {
  const [command,quoteFile,signedFile,...extra] = process.argv.slice(2);
  if (!['reconcile','broadcast'].includes(command) || !quoteFile || !signedFile || extra.length) throw Error('Invalid command');
  if (command==='broadcast' && (!walletBroadcastEnabled || (!process.stdin.isTTY && process.env.ANLGRAM_TEST_TTY !== '1'))) throw Error('Broadcast disabled');
  const prepared = await readJson(quoteFile);
  assertWalletInitReleaseQuote(prepared);
  const input = {prepared,signed:await readJson(signedFile),
    directory:join(homedir(),'.anlgram-standard-v2'),providers:projectProviders(process.env)};
  const result = command==='reconcile' ? await reconcileInitialization(input) : await broadcastInitialization({
    ...input,apiKey:process.env.TONCENTER_TESTNET_API_KEY,confirm:async ({wallet,quote,messageHash})=>{
      console.error(JSON.stringify({operation:'TESTNET WALLET INITIALIZATION ONLY',network:'-3',wallet:wallet.operator,
        stateInitHash:quote.stateInitHash,outgoingTransfers:0,modeledFeeNano:quote.modeledFeeNano,
        policyCeilingNano:quote.ownerPolicyCeilingNano,hardFeeCapEnforced:false,validUntil:quote.validUntil,
        fingerprint:quote.fingerprint,messageHash},null,2));
      const approval = 'BROADCAST TESTNET WALLET INIT '+messageHash;
      if (process.env.ANLGRAM_BROADCAST_APPROVAL) {
        const envAnswer = process.env.ANLGRAM_BROADCAST_APPROVAL.trim();
        if (envAnswer === approval) {
          console.error('\n' + '='.repeat(72));
          console.error('OWNER BROADCAST APPROVAL CONFIRMED:');
          console.error(`  ${approval}`);
          console.error('='.repeat(72));
          return true;
        } else {
          console.error('\n[BROADCAST REJECTED FROM ENVIRONMENT]');
          console.error(`Expected: ${approval} (${approval.length} chars)`);
          console.error(`Received: ${envAnswer} (${envAnswer.length} chars)`);
          return false;
        }
      }
      console.error('\n' + '='.repeat(72));
      console.error('REQUIRED OWNER BROADCAST APPROVAL:');
      console.error(`  ${approval}`);
      console.error('='.repeat(72));
      console.error('Enter the exact approval string above to broadcast initialization:');
      const prompt = createInterface({input:process.stdin,output:process.stderr});
      try {
        const raw = await prompt.question('> ');
        const answer = raw ? raw.trim() : '';
        if (answer !== approval) {
          console.error('\n[BROADCAST CANCELLED]');
          console.error(`Expected: ${approval} (${approval.length} chars)`);
          console.error(`Received: ${answer} (${answer.length} chars)`);
          if (answer.length !== approval.length) {
            const diff = approval.length - answer.length;
            console.error(`Length difference: missing/extra ${Math.abs(diff)} character(s).`);
          }
          return false;
        }
        return true;
      }
      finally { prompt.close(); }
    }
  });
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (walletBroadcastEnabled) {
    console.error('Initialization tool stopped. Broadcast stopped. Preserve all pending markers and reconcile before further action.');
  } else {
    console.error('Initialization tool stopped. Real broadcast is hard-disabled in this build. Preserve all pending markers.');
  }
  process.exitCode = 1;
}
