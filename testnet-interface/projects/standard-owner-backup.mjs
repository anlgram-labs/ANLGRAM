import {spawn} from 'node:child_process';
import {open,realpath,lstat} from 'node:fs/promises';
import {basename,dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../../',import.meta.url));
const limit = 65536;
const gpg = 'gpg';
const args = ['--no-options','--no-symkey-cache','--pinentry-mode','ask','--output','-'];

export function cryptBackup(mode, input, spawnProcess = spawn) {
  const operation = mode === 'encrypt' ? ['--symmetric','--cipher-algo','AES256'] : ['--decrypt'];
  return new Promise((resolveOutput,reject) => {
    const child = spawnProcess(gpg,[...args,...operation],{stdio:['pipe','pipe','ignore'],shell:false});
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

export async function backupPath(value) {
  if (!value.endsWith('.gpg')) throw Error('An explicit .gpg backup path is required');
  const absolute = resolve(value);
  const target = resolve(await realpath(dirname(absolute)),basename(absolute));
  const pathFromRepo = relative(await realpath(repository),target);
  if (!pathFromRepo || (!isAbsolute(pathFromRepo) && pathFromRepo !== '..' && !pathFromRepo.startsWith('..'+sep))) {
    throw Error('Choose an encrypted backup outside this checkout');
  }
  return target;
}

export async function withBackupWords(target, consume) {
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
  const clear = await cryptBackup('decrypt',encrypted);
  let words;
  try {
    words = clear.toString('utf8').trim().split(' ');
    return await consume(words);
  } finally {
    clear.fill(0);
    words?.fill('');
  }
}
