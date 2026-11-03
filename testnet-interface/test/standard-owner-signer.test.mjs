import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as core from '@ton/core';
import {mnemonicToWalletKey,sign} from '@ton/crypto';
import {mnemonicFromRandomSeed} from '@ton/crypto/dist/mnemonic/mnemonic.js';
import {recoverStandardPublicWallet} from '../projects/standard-owner-wallet.mjs';
import {localApprovalBytes,localApprovalScheme,verifyLocalStandardApproval,verifyStandardApproval} from '../projects/standard-authorization.mjs';
import {prepareStandardTestnetRelease,standardDeploymentIdentity} from '../projects/standard-testnet-release.mjs';
import {buildWalletInitialization,prepareWalletInitialization} from '../projects/standard-wallet-initialization.mjs';
import {cryptBackup} from '../projects/standard-owner-backup.mjs';
import {createDraft} from '../wizard/model.mjs';

const require=createRequire(import.meta.url);
const sandbox=require('../../tests/settlement-runtime/node_modules/@ton/sandbox');
const chainCore=require('../../tests/settlement-runtime/node_modules/@ton/core');
const words=()=>mnemonicFromRandomSeed(Buffer.alloc(32,0x43),24);

test('offline approval is scheme-separated and binds the exact quote, nonce and wallet',async()=>{
  const mnemonic=await words(), wallet=await recoverStandardPublicWallet(mnemonic);
  const key=await mnemonicToWalletKey(mnemonic);
  const draft=createDraft('a577a9e3-d751-490a-bce4-91034060574d');
  Object.assign(draft.metadata,{name:'Local fixture',symbol:'LOC',creator:wallet.operator});
  const manifest=await prepareStandardTestnetRelease(draft,wallet.publicKey);
  const now=1700000000, nonce='11'.repeat(32);
  const identity=await standardDeploymentIdentity(manifest,{seqno:2,validUntil:now+30,
    referenceRootHash:'22'.repeat(32),modeledSenderFeeNano:'10000000',ownerPolicyCeilingNano:'70000000'},now);
  const bytes=localApprovalBytes(manifest,identity,nonce,now);
  const approval={scheme:localApprovalScheme,nonce,signature:sign(bytes,key.secretKey).toString('hex')};
  key.secretKey.fill(0);
  assert.equal(verifyLocalStandardApproval(approval,manifest,identity,nonce,now,now),true);
  assert.equal(verifyStandardApproval(approval,manifest,identity,nonce,now,now,{}),false);
  assert.equal(verifyLocalStandardApproval(approval,manifest,identity,'33'.repeat(32),now,now),false);
  assert.equal(verifyLocalStandardApproval(approval,manifest,identity,nonce,identity.validUntil,now),false);
  assert.equal(verifyLocalStandardApproval(approval,manifest,{...identity,seqno:3},nonce,now,now),false);
  assert.equal(verifyLocalStandardApproval(approval,{...manifest,operator:{...manifest.operator,address:'0:'+'44'.repeat(32)}},identity,nonce,now,now),false);
  assert.equal(verifyLocalStandardApproval(approval,manifest,identity,nonce,now,now-1),false);
});

test('funded Testnet V5R1 initializes in Sandbox with zero outgoing messages and cannot replay',async()=>{
  const mnemonic=await words(), wallet=await recoverStandardPublicWallet(mnemonic), key=await mnemonicToWalletKey(mnemonic);
  const chain=await sandbox.Blockchain.create();
  chain.now=1700000000;
  const address=chainCore.Address.parseRaw(wallet.operator);
  const treasury=await chain.treasury('standard-init-fixture');
  await treasury.send({to:address,value:100000000n,bounce:false});
  const before=await chain.getContract(address);
  assert.equal(before.accountState.type,'uninit');
  const balance=before.balance, account=chainCore.beginCell().storeBit(true).store(chainCore.storeAccount(before.account.account)).endCell();
  const result=await buildWalletInitialization(wallet,chain.now+45,async cell=>sign(cell.hash(),key.secretKey),chain.now);
  key.secretKey.fill(0);
  const outcome=await chain.sendMessage(chainCore.Cell.fromBase64(result.boc));
  assert.equal(outcome.transactions.length,1);
  const tx=outcome.transactions[0], after=await chain.getContract(address);
  assert.equal(tx.description.aborted,false);
  assert.equal(tx.outMessages.size,0);
  assert.equal(after.accountState.type,'active');
  assert.equal((await chain.runGetMethod(address,'seqno')).stackReader.readNumber(),1);
  assert.equal(after.accountState.state.code.hash().toString('hex'),wallet.walletCodeHash);
  const data=after.accountState.state.data.beginParse();
  assert.equal(data.loadBit(),true);
  assert.equal(data.loadUint(32),1);
  assert.equal(data.loadInt(32),2147483645);
  assert.equal(data.loadBuffer(32).toString('hex'),wallet.publicKey);
  const replay=await chain.sendMessage(chainCore.Cell.fromBase64(result.boc)).catch(error=>error);
  assert.ok(replay instanceof Error || replay.transactions.every(t=>t.description.aborted));
  const fees=balance-after.balance;
  const providers={
    account:async()=>({raw:{state:account.toBoc().toString('hex')},proof:{accountHash:account.hash().toString('hex'),chainTime:chain.now,masterchainSeqno:7}}),
    observeAddress:async()=>({state:'uninitialized',balance:String(balance)}),
    emulateUnsigned:async request=>{
      const {body,init}=core.loadMessage(core.Cell.fromBase64(request.boc).beginParse());
      assert.equal(request.ignore_chksig,true);
      assert.equal(body.beginParse().skip(body.bits.length-512).loadBuffer(64).equals(Buffer.alloc(64)),true);
      return {is_incomplete:false,mc_block_seqno:7,transactions:{wallet:{account:wallet.operator,emulated:true,
        orig_status:'uninit',end_status:'active',description:{aborted:false,compute_ph:{success:true,exit_code:0}},
        out_msgs:[],total_fees:String(fees),in_msg:{message_content:{hash:body.hash().toString('base64')},
          init_state:{hash:core.beginCell().store(core.storeStateInit(init)).endCell().hash().toString('base64')}},
        account_state_before:{balance:String(balance)},account_state_after:{balance:String(after.balance),
          code_hash:after.accountState.state.code.hash().toString('base64'),data_hash:after.accountState.state.data.hash().toString('base64')}}}};
    }
  };
  const quote=await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:String(fees)},providers,()=>chain.now);
  assert.equal(quote.outgoingMessages,0);
  assert.equal(quote.modeledFeeNano,String(fees));
  await assert.rejects(prepareWalletInitialization({wallet,ownerPolicyCeilingNano:'1'},providers,()=>chain.now),/above policy ceiling/);
  await assert.rejects(prepareWalletInitialization({wallet:{...wallet,network:'-239'},ownerPolicyCeilingNano:String(fees)},providers,()=>chain.now),/Wrong V5R1/);
  await assert.rejects(prepareWalletInitialization({wallet,ownerPolicyCeilingNano:String(fees)},{
    ...providers,observeAddress:async()=>({state:'active',balance:String(balance)})
  },()=>chain.now),/funded and uninitialized/);
});

test('owner signer refuses both signing commands in this build before opening inputs',()=>{
  const cli=fileURLToPath(new URL('../standard-owner-signer-cli.mjs',import.meta.url));
  for(const action of ['sign-approval','sign-init']){
    const result=spawnSync(process.execPath,[cli,action,'not-present.json','not-present.gpg'],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/Signing is hard-disabled/);
  }
});

test('GnuPG fixture rejects wrong passphrase, corrupt ciphertext and interrupted decryption',{
  skip:!process.env.ANLGRAM_TEST_GPG
},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'anlgram-gpg-fixture-'));
  // Loopback is test-only with a public fixture passphrase. The CLI uses Pinentry.
  const launch=(password,interrupt=false)=>(_,args,opts)=>{
    const child=spawn(process.env.ANLGRAM_TEST_GPG,['--homedir','.','--batch',
      ...args.map(arg=>arg==='ask'?'loopback':arg),
      '--passphrase',password],{...opts,cwd:dir});
    if(interrupt) child.kill();
    return child;
  };
  const clear=Buffer.from((await words()).join(' '));
  try {
    const encrypted=await cryptBackup('encrypt',clear,launch('public fixture passphrase'));
    const recovered=await cryptBackup('decrypt',encrypted,launch('public fixture passphrase'));
    assert.ok(recovered.equals(clear));
    recovered.fill(0);
    await assert.rejects(cryptBackup('decrypt',encrypted,launch('incorrect fixture passphrase')));
    await assert.rejects(cryptBackup('decrypt',encrypted.subarray(0,20),launch('public fixture passphrase')));
    await assert.rejects(cryptBackup('decrypt',encrypted,launch('public fixture passphrase',true)));
  } finally { clear.fill(0); rmSync(dir,{recursive:true,force:true}); }
});
