import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Address} from '@ton/core';
import {mnemonicFromRandomSeed} from '@ton/crypto/dist/mnemonic/mnemonic.js';
import {recoverStandardPublicWallet} from '../projects/standard-owner-wallet.mjs';
import {assertWalletInitRelease,releaseOperator,releaseStateInitHash,releaseFeeCeilingNano}
  from '../projects/standard-wallet-init-release.mjs';

test('wallet-only release pins the owner Testnet destination and rejects a valid alternate V5R1 wallet',async()=>{
  const owner=Address.parseFriendly('0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn');
  assert.equal(owner.isTestOnly,true);
  assert.equal(owner.address.toRawString(),releaseOperator);
  assert.equal(owner.address.hash.toString('hex'),releaseStateInitHash);
  const wallet=await recoverStandardPublicWallet(await mnemonicFromRandomSeed(Buffer.alloc(32,0x43),24));
  assert.throws(()=>assertWalletInitRelease(wallet,releaseFeeCeilingNano),/scope rejected/);
  const dir=mkdtempSync(join(tmpdir(),'anlgram-init-release-'));
  try {
    const input=join(dir,'public.json');
    writeFileSync(input,JSON.stringify({wallet,ownerPolicyCeilingNano:releaseFeeCeilingNano}));
    const cli=fileURLToPath(new URL('../standard-owner-signer-cli.mjs',import.meta.url));
    const output=spawnSync(process.execPath,[cli,'prepare-init',input],{encoding:'utf8',
      env:{...process.env,TONCENTER_TESTNET_API_KEY:'fixture-only',TONAPI_TESTNET_API_KEY:'fixture-only'}});
    assert.equal(output.status,1);
    assert.equal(output.stdout,'');
    assert.deepEqual(JSON.parse(output.stderr),{code:'INIT_RELEASE_SCOPE_REJECTED',
      financialSigningEnabled:true,broadcastingEnabled:true});
    const excluded=spawnSync(process.execPath,[cli,'sign-approval',input,'not-present.gpg'],{encoding:'utf8'});
    assert.equal(excluded.status,1);
    assert.match(excluded.stderr,/outside this wallet-only release/);
  } finally { rmSync(dir,{recursive:true}); }
});
