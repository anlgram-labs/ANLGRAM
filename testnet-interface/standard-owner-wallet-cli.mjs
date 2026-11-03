import {spawn} from 'node:child_process';
import {open,realpath,lstat} from 'node:fs/promises';
import {basename,dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {mnemonicNew} from '@ton/crypto';
import {recoverStandardPublicWallet,standardWalletPublicConfiguration} from './projects/standard-owner-wallet.mjs';

const repository = fileURLToPath(new URL('../',import.meta.url));
const limit = 65536;
const gpg = 'gpg';
const args = ['--no-options','--no-symkey-cache','--pinentry-mode','ask','--output','-'];

function crypt(mode, input) {
  const operation = mode === 'encrypt' ? ['--symmetric','--cipher-algo','AES256'] : ['--decrypt'];
  return new Promise((resolveOutput,reject) => {
    const child = spawn(gpg,[...args,...operation],{stdio:['pipe','pipe','ignore'],shell:false});
    const chunks = [];
    let size = 0, failed = false;
    child.once('error',()=>{ failed=true; reject(Error('GnuPG unavailable')); });
    child.stdin.on('error',()=>{ failed=true; child.kill(); });
    child.stdout.on('data',chunk=>{
      size += chunk.length;
      if (size > limit) { failed=true; chunk.fill(0); child.kill(); return; }
      chunks.push(chunk);
    });
    child.once('close',code=>{
      const output = !failed && code === 0 && size > 0 ? Buffer.concat(chunks) : null;
      for (const chunk of chunks) chunk.fill(0);
      if (output) resolveOutput(output);
      else reject(Error('GnuPG failed or was cancelled'));
    });
    child.stdin.end(input);
  });
}

async function backupPath(value) {
  if (!value.endsWith('.gpg')) throw Error('An explicit .gpg backup path is required');
  const absolute = resolve(value);
  const target = resolve(await realpath(dirname(absolute)),basename(absolute));
  const pathFromRepo = relative(await realpath(repository),target);
  if (!pathFromRepo || (!isAbsolute(pathFromRepo) && pathFromRepo !== '..' && !pathFromRepo.startsWith('..'+sep))) {
    throw Error('Choose an encrypted backup outside this checkout');
  }
  return target;
}

async function recover(target) {
  const stat = await lstat(target);
  if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw Error('Invalid encrypted backup file');
  const file = await open(target,'r');
  let encrypted;
  try {
    const bounded = Buffer.alloc(limit+1);
    const {bytesRead} = await file.read(bounded,0,bounded.length,0);
    if (!bytesRead || bytesRead > limit) throw Error('Invalid encrypted backup size');
    encrypted = bounded.subarray(0,bytesRead);
  } finally { await file.close(); }
  const clear = await crypt('decrypt',encrypted);
  let words;
  try {
    words = clear.toString('utf8').trim().split(' ');
    return await recoverStandardPublicWallet(words);
  } finally {
    clear.fill(0);
    words?.fill('');
  }
}

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
    encrypted = await crypt('encrypt',clear);
  } finally {
    clear.fill(0);
    words.fill('');
  }
  const file = await open(target,'wx',0o600);
  try { await file.writeFile(encrypted); await file.sync(); }
  finally { await file.close(); }
  const restored = await recover(target);
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
  const wallet = command === 'generate' ? await generate(target) : await recover(target);
  console.log(JSON.stringify({...await standardWalletPublicConfiguration(wallet),backupRecoveryVerified:true},null,2));
} catch {
  // Never log exceptions from cryptographic, subprocess or recovery code.
  console.error('Wallet setup stopped. Check the command, interactive terminal, backup path and GnuPG Pinentry. Preserve any encrypted backup already written.');
  process.exitCode = 1;
}
