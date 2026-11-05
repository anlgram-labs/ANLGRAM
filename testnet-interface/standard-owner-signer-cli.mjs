import {readFile,open,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createInterface} from 'node:readline/promises';
import {mnemonicToWalletKey,sign} from '@ton/crypto';
import {backupPath,withBackupWords} from './projects/standard-owner-backup.mjs';
import {recoverStandardPublicWallet} from './projects/standard-owner-wallet.mjs';
import {buildWalletInitialization,prepareWalletInitialization,InitPreflightError} from './projects/standard-wallet-initialization.mjs';
import {assertWalletInitRelease,assertWalletInitReleaseQuote} from './projects/standard-wallet-init-release.mjs';
import {projectProviders,ProjectProviderError} from './projects/project-providers.mjs';
import {walletBroadcastEnabled} from './projects/standard-wallet-broadcast.mjs';

const signingEnabled = true; // Owner-operated initialization-only release.
const now = () => Math.floor(Date.now()/1000);

async function confirm(expected, operation = 'wallet initialization') {
  console.error('\n' + '='.repeat(72));
  console.error('REQUIRED OWNER APPROVAL:');
  console.error(`  ${expected}`);
  console.error('='.repeat(72));
  console.error(`Enter the exact approval string above to sign ${operation}:`);
  const input = createInterface({input:process.stdin,output:process.stderr});
  try {
    const raw = await input.question('> ');
    const answer = raw ? raw.trim() : '';
    if (answer !== expected) {
      console.error('\n[AUTHORIZATION REJECTED]');
      console.error(`Expected: ${expected} (${expected.length} chars)`);
      console.error(`Received: ${answer} (${answer.length} chars)`);
      if (answer.length !== expected.length) {
        const diff = expected.length - answer.length;
        console.error(`Length difference: missing/extra ${Math.abs(diff)} character(s).`);
      }
      throw Error('Owner cancelled');
    }
  } finally {
    input.close();
  }
}

async function readPublic(path) {
  const text = await readFile(path,'utf8');
  if (text.length > 131072) throw Error('Public request too large');
  return JSON.parse(text.replace(/^\uFEFF/,''));
}

const [command,path,backup,...extra] = process.argv.slice(2);
try {
  if (command==='sign-approval') throw Error('Minter approval outside this release');
  if (!path || extra.length || !['prepare-init','sign-init'].includes(command)) throw Error('Invalid command');
  if (command !== 'prepare-init' && (!signingEnabled || (!process.stdin.isTTY && process.env.ANLGRAM_TEST_TTY !== '1') || !backup)) {
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
    if (now() >= request.quote.validUntil) {
      throw Error('Initialization quote expired before signing reservation');
    }
    const target = await backupPath(backup);
    const output = await withBackupWords(target,async words=>{
      const wallet = await recoverStandardPublicWallet(words);
      if (wallet.operator !== request.wallet?.operator || wallet.publicKey !== request.wallet?.publicKey) throw Error('Backup identity mismatch');
      if (now() >= request.quote.validUntil) {
        throw Error('Initialization quote expired before signing reservation');
      }
      console.error('\n--- Verified Testnet V5R1 Quote ---');
      console.error(`Destination : ${request.quote.operator}`);
      console.error(`Fee Ceiling : ${request.quote.ownerPolicyCeilingNano} nanotons`);
      console.error(`Fingerprint : ${request.quote.fingerprint}`);
      console.error(`Valid Until : ${request.quote.validUntil} (${request.quote.validUntil - now()}s remaining)`);
      const approval = 'AUTHORIZE TESTNET INIT '+request.quote.fingerprint;
      await confirm(approval, 'this Testnet V5R1 wallet initialization');
      if (now() >= request.quote.validUntil) {
        throw Error('Initialization quote expired before signing reservation');
      }
      const current = await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:request.quote.ownerPolicyCeilingNano,
        validUntil:request.quote.validUntil,
        financialSigningEnabled: signingEnabled,
        broadcastingEnabled: walletBroadcastEnabled},projectProviders(process.env));
      if (current.fingerprint !== request.quote.fingerprint) throw Error('Initialization quote changed');
      if (now() >= current.validUntil) {
        throw Error('Initialization quote expired before signing reservation');
      }
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
    if (error?.message?.includes('expired before signing reservation') ||
        (error instanceof InitPreflightError && error.code === 'INPUT_EXPIRY_INVALID')) {
      console.error('Owner signer stopped: Quote expired before signing reservation. No marker was created. Prepare a fresh quote and try again.');
    } else {
      console.error(signingEnabled ? 'Owner signer stopped. Preserve any pending marker and reconcile before further action.'
        : 'Owner signer stopped. Signing is hard-disabled in this build.');
    }
  }
  process.exitCode = 1;
}
