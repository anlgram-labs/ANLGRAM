import {readFile,open,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {mnemonicToWalletKey,sign} from '@ton/crypto';
import {backupPath,withBackupWords} from './projects/standard-owner-backup.mjs';
import {recoverStandardPublicWallet} from './projects/standard-owner-wallet.mjs';
import {localApprovalBytes,localApprovalScheme} from './projects/standard-authorization.mjs';
import {standardRegistrationIntent} from './projects/standard-registration.mjs';
import {buildWalletInitialization,prepareWalletInitialization,InitPreflightError} from './projects/standard-wallet-initialization.mjs';
import {projectProviders,ProjectProviderError} from './projects/project-providers.mjs';

const signingEnabled = false; // Requires separate review and authorization to change.
const now = () => Math.floor(Date.now()/1000);

async function confirm(prompt, expected) {
  const input = createInterface({input:process.stdin,output:process.stderr});
  try { if (await input.question(prompt) !== expected) throw Error('Owner cancelled'); }
  finally { input.close(); }
}

async function readPublic(path) {
  const text = await readFile(path,'utf8');
  if (text.length > 131072) throw Error('Public request too large');
  return JSON.parse(text);
}

const [command,path,backup,...extra] = process.argv.slice(2);
try {
  if (!path || extra.length || !['prepare-init','sign-approval','sign-init'].includes(command)) throw Error('Invalid command');
  if (command !== 'prepare-init' && (!signingEnabled || !process.stdin.isTTY || !backup)) {
    throw Error('Owner signing is hard-disabled');
  }
  if (command === 'prepare-init' && backup) throw Error('Read-only initialization quote accepts public input only');
  if (command === 'prepare-init') {
    let text;
    try { text = await readFile(path,'utf8'); }
    catch { throw new InitPreflightError('INPUT_FILE_UNREADABLE'); }
    if (text.length>131072) throw new InitPreflightError('INPUT_FILE_TOO_LARGE');
    let request;
    try { request = JSON.parse(text.replace(/^\uFEFF/,'')); }
    catch { throw new InitPreflightError('INPUT_JSON_INVALID'); }
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new InitPreflightError('INPUT_JSON_INVALID');
    const quote = await prepareWalletInitialization(request,projectProviders(process.env));
    console.log(JSON.stringify({wallet:request.wallet,quote},null,2));
  } else {
    const request = await readPublic(path);
    const target = await backupPath(backup);
    const output = await withBackupWords(target,async words=>{
      const wallet = await recoverStandardPublicWallet(words);
      if (command === 'sign-approval') {
        const {manifest,identity} = await standardRegistrationIntent(request.input);
        if (wallet.operator !== manifest.operator.address || wallet.publicKey !== manifest.operator.publicKey ||
          request.fingerprint !== identity.fingerprint || !/^[a-f0-9]{64}$/.test(request.nonce ?? '') ||
          !Number.isSafeInteger(request.preparedAt) || now()<request.preparedAt ||
          identity.validUntil-request.preparedAt>60 || now()>=identity.validUntil) throw Error('Approval mismatch');
        const bytes = localApprovalBytes(manifest,identity,request.nonce,request.preparedAt);
        console.error(bytes.toString('utf8'));
        await confirm('Type APPROVE STANDARD V2 to sign only this off-chain approval: ','APPROVE STANDARD V2');
        if (now()>=identity.validUntil) throw Error('Approval expired');
        const key = await mnemonicToWalletKey(words);
        try { return {scheme:localApprovalScheme,nonce:request.nonce,signature:sign(bytes,key.secretKey).toString('hex')}; }
        finally { key.secretKey.fill(0); }
      }

      if (wallet.operator !== request.wallet?.operator || wallet.publicKey !== request.wallet?.publicKey) throw Error('Backup identity mismatch');
      console.error(JSON.stringify(request.quote));
      await confirm('Type AUTHORIZE TESTNET INIT to sign only this wallet initialization: ','AUTHORIZE TESTNET INIT');
      const current = await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:request.quote.ownerPolicyCeilingNano,
        validUntil:request.quote.validUntil},projectProviders(process.env));
      if (current.fingerprint !== request.quote.fingerprint) throw Error('Initialization quote changed');
      const dir = join(homedir(),'.anlgram-standard-v2');
      await mkdir(dir,{mode:0o700,recursive:true});
      // Local crash marker survives restart and is keyed by the wallet, not
      // the backup path. It is never removed or rearmed by this program.
      const marker = await open(join(dir,wallet.operator.slice(2)+'.init-pending'),'wx',0o600);
      try { await marker.writeFile(current.fingerprint); await marker.sync(); } finally { await marker.close(); }
      const key = await mnemonicToWalletKey(words);
      try {
        const signed = await buildWalletInitialization(wallet,current.validUntil,async cell=>sign(cell.hash(),key.secretKey),now());
        return {status:'SIGNED_NOT_BROADCAST',fingerprint:current.fingerprint,messageHash:signed.messageHash,boc:signed.boc};
      } finally { key.secretKey.fill(0); }
    });
    console.log(JSON.stringify(output,null,2));
  }
} catch (error) {
  if (command==='prepare-init') {
    const diagnostic = {code:error instanceof InitPreflightError || error instanceof ProjectProviderError ?
      error.code : (!path || backup || extra.length ? 'INPUT_USAGE_INVALID' : 'PREFLIGHT_UNVERIFIED'),
      financialSigningEnabled:false,broadcastingEnabled:false};
    if (error instanceof ProjectProviderError) {
      diagnostic.provider = error.provider;
      if (error.operation) diagnostic.operation = error.operation;
      if (Number.isInteger(error.status)) diagnostic.httpStatus = error.status;
      if (Number.isInteger(error.rpcCode)) diagnostic.rpcCode = error.rpcCode;
      if (Number.isSafeInteger(error.retryMs) && error.retryMs>0) diagnostic.retryAfterMs = error.retryMs;
    }
    if (error instanceof InitPreflightError) {
      for (const field of ['accountMasterchainSeqno','emulationMasterchainSeqno']) {
        if (Number.isInteger(error[field])) diagnostic[field] = error[field];
      }
    }
    console.error(JSON.stringify(diagnostic));
  } else {
    console.error(signingEnabled ? 'Owner signer stopped. Preserve any pending marker and reconcile before further action.'
      : 'Owner signer stopped. Signing is hard-disabled in this build.');
  }
  process.exitCode = 1;
}
