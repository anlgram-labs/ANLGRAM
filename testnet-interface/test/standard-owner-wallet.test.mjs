import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Address} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {mnemonicFromRandomSeed} from '@ton/crypto/dist/mnemonic/mnemonic.js';
import {recoverStandardPublicWallet,standardWalletPublicConfiguration} from '../projects/standard-owner-wallet.mjs';
import {prepareStandardTestnetRelease} from '../projects/standard-testnet-release.mjs';

test('deterministic TON recovery reproduces the isolated V5R1 identity and Standard V2 manifest',async()=>{
  // Public, deterministic test vector. Never use this wallet on a network.
  const words = await mnemonicFromRandomSeed(Buffer.alloc(32,0x43),24);
  const wallet = await recoverStandardPublicWallet(words);
  assert.deepEqual(await recoverStandardPublicWallet([...words]),wallet);
  assert.equal(wallet.network,'-3');
  assert.equal(wallet.walletId,2147483645);
  assert.equal(wallet.subwalletNumber,0);
  assert.match(wallet.publicKey,/^[a-f0-9]{64}$/);
  assert.equal(Address.parseFriendly(wallet.address).isTestOnly,true);
  assert.equal(Address.parse(wallet.address).toRawString(),wallet.operator);
  const mainnet = WalletContractV5R1.create({publicKey:Buffer.from(wallet.publicKey,'hex')});
  assert.notEqual(mainnet.address.toRawString(),wallet.operator);
  const config = await standardWalletPublicConfiguration(wallet,'a577a9e3-d751-490a-bce4-91034060574d');
  assert.equal(config.manifestCompatibility,'OFFLINE_IDENTITY_VERIFIED');
  assert.equal(config.walletAppSignDataCompatibility,'NOT_CHECKED');
  assert.equal(config.financialSigningEnabled,false);
  assert.equal(config.preflight.ownerPolicyCeilingNano,null);
  const {draft,publicKey} = config.preflight;
  Object.assign(draft.metadata,{name:'Fixture token',symbol:'FIX'});
  assert.equal((await prepareStandardTestnetRelease(draft,publicKey)).operator.address,wallet.operator);
  await assert.rejects(recoverStandardPublicWallet(words.slice(1)),/Invalid TON recovery/);
  await assert.rejects(standardWalletPublicConfiguration({...wallet,walletId:0}),/manifest mismatch/);
});

test('owner CLI refuses noninteractive generation before writing a backup',()=>{
  const dir=mkdtempSync(join(tmpdir(),'standard-owner-wallet-'));
  try {
    const file=join(dir,'wallet.gpg');
    const cli=fileURLToPath(new URL('../standard-owner-wallet-cli.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[cli,'generate',file],{input:'GENERATE TESTNET\n',encoding:'utf8'});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/Wallet setup stopped/);
    assert.equal(existsSync(file),false);
  } finally { rmSync(dir,{recursive:true}); }
});
