import {backupPath,cryptBackup,withBackupWords} from './projects/standard-owner-backup.mjs';
import {open,lstat} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {mnemonicNew} from '@ton/crypto';
import {recoverStandardPublicWallet,standardWalletPublicConfiguration} from './projects/standard-owner-wallet.mjs';

async function generate(target) {
  // The only nondeterministic wallet generation path. It is reachable only
  // from the explicit owner confirmation in the interactive CLI below.
  const words = await mnemonicNew(24);
  const clear = Buffer.from(words.join(' '),'utf8');
  let encrypted, original;
  try {
    original = await recoverStandardPublicWallet(words);
    // Check manifest compatibility before writing any backup.
    await standardWalletPublicConfiguration(original);
    encrypted = await cryptBackup('encrypt',clear);
  } finally {
    clear.fill(0);
    words.fill('');
  }
  const file = await open(target,'wx',0o600);
  try { await file.writeFile(encrypted); await file.sync(); }
  finally { await file.close(); }
  const restored = await withBackupWords(target,recoverStandardPublicWallet);
  if (restored.operator !== original.operator || restored.publicKey !== original.publicKey) {
    throw Error('Backup recovery did not match generated wallet');
  }
  return restored;
}

try {
  const [command,argument,...extra] = process.argv.slice(2);
  if (!['generate','verify-backup'].includes(command) || !argument || extra.length || !process.stdin.isTTY) {
    throw Error('Interactive owner terminal required');
  }
  const target = await backupPath(argument);
  if (command === 'generate') {
    const alreadyExists = await lstat(target).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    if (alreadyExists) throw Error('Backup path already exists');
    const input = createInterface({input:process.stdin,output:process.stderr});
    let answer;
    try { answer = await input.question('Create an isolated Testnet wallet and encrypted local backup? Type GENERATE TESTNET: '); }
    finally { input.close(); }
    if (answer !== 'GENERATE TESTNET') throw Error('Owner cancelled');
    console.error('Use GnuPG Pinentry to set the backup passphrase and then verify recovery.');
  }
  const wallet = command === 'generate' ? await generate(target) : await withBackupWords(target,recoverStandardPublicWallet);
  console.log(JSON.stringify({...await standardWalletPublicConfiguration(wallet),backupRecoveryVerified:true},null,2));
} catch {
  // Never log exceptions from cryptographic, subprocess or recovery code.
  console.error('Wallet setup stopped. Check the command, interactive terminal, backup path and GnuPG Pinentry. Preserve any encrypted backup already written.');
  process.exitCode = 1;
}
