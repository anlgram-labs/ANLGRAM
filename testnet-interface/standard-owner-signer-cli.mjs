import {readFile,open,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mnemonicToWalletKey,sign} from '@ton/crypto';
import {backupPath,withBackupWords} from './projects/standard-owner-backup.mjs';
import {recoverStandardPublicWallet} from './projects/standard-owner-wallet.mjs';
import {buildWalletInitialization,initializationWallet,prepareWalletInitialization,InitPreflightError} from './projects/standard-wallet-initialization.mjs';
import {assertWalletInitRelease,assertWalletInitReleaseQuote} from './projects/standard-wallet-init-release.mjs';
import {projectProviders,ProjectProviderError} from './projects/project-providers.mjs';
import {walletBroadcastEnabled} from './projects/standard-wallet-broadcast.mjs';
import {checkInitMarkers,confirmInitialization} from './projects/standard-init-confirmation.mjs';

const signingEnabled = true; // Owner-operated initialization-only release.
const now = () => Math.floor(Date.now()/1000);

async function readPublic(path) {
  const text = await readFile(path,'utf8');
  if (text.length > 131072) throw Error('Public request too large');
  return JSON.parse(text.replace(/^\uFEFF/,''));
}

const [command,path,backup,...extra] = process.argv.slice(2);
const dialog=command==='sign-init'&&extra.length===1&&extra[0]==='--windows-dialog'&&process.platform==='win32';
let signingStage='QUOTE_AND_MARKER_CHECK';
try {
  if (command==='sign-approval') throw Error('Minter approval outside this release');
  if (!path || (extra.length&&!dialog) || !['prepare-init','sign-init'].includes(command)) throw Error('Invalid command');
  if (command !== 'prepare-init' && (!signingEnabled || !backup)) {
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
    // Keep missing-provider diagnostics available before scope validation.
    const providers = projectProviders(process.env);
    try { assertWalletInitRelease(request.wallet,request.ownerPolicyCeilingNano); }
    catch { throw new InitPreflightError('INIT_RELEASE_SCOPE_REJECTED'); }
    const quote = await prepareWalletInitialization({...request,
      financialSigningEnabled: signingEnabled,
      broadcastingEnabled: walletBroadcastEnabled
    },providers);
    console.log(JSON.stringify({wallet:request.wallet,quote},null,2));
  } else {
    const request = await readPublic(path);
    assertWalletInitReleaseQuote(request);
    const dir = join(homedir(),'.anlgram-standard-v2');
    await checkInitMarkers(dir,request.wallet.operator);
    if (now() >= request.quote.validUntil) {
      throw Error('Initialization quote expired before signing reservation');
    }
    if (!dialog&&!process.stdin.isTTY) throw Error('Interactive owner terminal or Windows dialog required');
    const address=initializationWallet(request.wallet).address.toString({testOnly:true,bounceable:false});
    signingStage='OWNER_CONFIRMATION';
    await confirmInitialization({...request,wallet:{...request.wallet,address}},{dialog,now});
    await checkInitMarkers(dir,request.wallet.operator);
    if(now()>=request.quote.validUntil)throw Error('Initialization quote expired before signing reservation');
    signingStage='PINENTRY_OR_BACKUP_VALIDATION';
    const target = await backupPath(backup);
    const output = await withBackupWords(target,async words=>{
      const wallet = await recoverStandardPublicWallet(words);
      if (wallet.operator !== request.wallet?.operator || wallet.publicKey !== request.wallet?.publicKey) throw Error('Backup identity mismatch');
      if (now() >= request.quote.validUntil) {
        throw Error('Initialization quote expired before signing reservation');
      }
      signingStage='AUTHENTICATED_QUOTE_RECHECK';
      const current = await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:request.quote.ownerPolicyCeilingNano,
        validUntil:request.quote.validUntil,
        financialSigningEnabled: signingEnabled,
        broadcastingEnabled: walletBroadcastEnabled},projectProviders(process.env));
      if (current.fingerprint !== request.quote.fingerprint) throw Error('Initialization quote changed');
      if (now() >= current.validUntil) {
        throw Error('Initialization quote expired before signing reservation');
      }
      signingStage='PERMANENT_MARKER_RESERVATION';
      await mkdir(dir,{mode:0o700,recursive:true});
      // Local crash marker survives restart and is keyed by the wallet, not
      // the backup path. It is never removed or rearmed by this program.
      await checkInitMarkers(dir,wallet.operator);
      const marker = await open(join(dir,wallet.operator.slice(2)+'.init-pending'),'wx',0o600);
      try { await marker.writeFile(current.fingerprint); await marker.sync(); } finally { await marker.close(); }
      signingStage='LOCAL_SIGNED_ENVELOPE_BUILD';
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
      financialSigningEnabled: signingEnabled, broadcastingEnabled: walletBroadcastEnabled};
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
  } else if (command==='sign-approval') {
    console.error('Standard Jetton minter approval is outside this wallet-only release. Signing is hard-disabled.');
  } else {
    console.error('Signing stage: '+signingStage);
    if (error?.message?.includes('expired before signing reservation') ||
        (error instanceof InitPreflightError && error.code === 'INPUT_EXPIRY_INVALID')) {
      console.error('Owner signer stopped: Quote expired before signing reservation. No marker was created. Prepare a fresh quote and try again.');
    } else if (['Owner cancelled','Owner confirmation dialog unavailable','Exact owner authorization required',
      'Interactive owner terminal or Windows dialog required',
      'GnuPG failed or was cancelled','Existing wallet initialization attempt marker'].includes(error?.message)) {
      console.error('Owner signer stopped: '+error.message+'. No signing was performed by this attempt.');
    } else {
      console.error(signingEnabled ? 'Owner signer stopped. Preserve any pending marker and reconcile before further action.'
        : 'Owner signer stopped. Signing is hard-disabled in this build.');
    }
  }
  process.exitCode = 1;
}
