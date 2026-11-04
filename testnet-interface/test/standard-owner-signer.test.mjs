import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
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
import {exerciseInitializationBroadcast,reconcileInitialization,validateSignedInitialization,walletBroadcastEnabled}
  from '../projects/standard-wallet-broadcast.mjs';
import {projectProviders} from '../projects/project-providers.mjs';
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
  const validInput={wallet,ownerPolicyCeilingNano:String(fees)};
  for (const [change,code] of [
    [()=>null,'EMULATION_RESPONSE_INVALID'],
    [trace=>({...trace,is_incomplete:true}),'EMULATION_INCOMPLETE'],
    [trace=>({...trace,mc_block_seqno:8}),'EMULATION_REFERENCE_MISMATCH'],
    [trace=>({...trace,transactions:{wallet:{...trace.transactions.wallet,in_msg:{message_content:{hash:{}}}}}}),'EMULATION_TRACE_MISMATCH']
  ]) {
    await assert.rejects(prepareWalletInitialization(validInput,{...providers,
      emulateUnsigned:async request=>change(await providers.emulateUnsigned(request))},()=>chain.now),{code});
  }
  const quote=await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:String(fees)},providers,()=>chain.now);
  assert.equal(quote.outgoingMessages,0);
  assert.equal(quote.modeledFeeNano,String(fees));
  await assert.rejects(prepareWalletInitialization({wallet,ownerPolicyCeilingNano:'1'},providers,()=>chain.now),{code:'FEE_POLICY_EXCEEDED'});
  await assert.rejects(prepareWalletInitialization({wallet:{...wallet,network:'-239'},ownerPolicyCeilingNano:String(fees)},providers,()=>chain.now),{code:'INPUT_WALLET_INVALID'});
  await assert.rejects(prepareWalletInitialization({wallet,ownerPolicyCeilingNano:String(fees)},{
    ...providers,observeAddress:async()=>({state:'active',balance:String(balance)})
  },()=>chain.now),{code:'ACCOUNT_OBSERVATION_MISMATCH'});

  const prepared={wallet,quote};
  const signed={status:'SIGNED_NOT_BROADCAST',fingerprint:quote.fingerprint,messageHash:result.messageHash,boc:result.boc};
  assert.equal((await validateSignedInitialization(prepared,signed)).bodyHash,result.bodyHash);
  await assert.rejects(validateSignedInitialization(prepared,{...signed,messageHash:'00'.repeat(32)}),/message hash/);
  await assert.rejects(validateSignedInitialization({wallet,quote:{...quote,seqno:1}},signed),/quote/);
  const unsigned=await buildWalletInitialization(wallet,quote.validUntil,async()=>Buffer.alloc(64),chain.now);
  await assert.rejects(validateSignedInitialization(prepared,{...signed,boc:unsigned.boc,messageHash:unsigned.messageHash}),/signature/);
  const directory=mkdtempSync(join(tmpdir(),'anlgram-broadcast-fixture-')), prefix=join(directory,wallet.operator.slice(2));
  try {
    writeFileSync(prefix+'.init-pending',quote.fingerprint);
    const clock=()=>chain.now;
    const input={prepared,signed,directory,providers,apiKey:'fixture-only',confirm:async()=>true};
    let posts=0;
    const loseResponse=async (url,request)=>{
      posts++;
      assert.equal(url,'https://toncenter.invalid/api/v2/jsonRPC');
      assert.equal(request.redirect,'manual');
      assert.equal(JSON.parse(request.body).method,'sendBoc');
      assert.equal(JSON.parse(request.body).params.boc,signed.boc);
      assert.equal(JSON.parse(require('node:fs').readFileSync(prefix+'.init-broadcast','utf8')).status,'UNKNOWN');
      throw new DOMException('fixture timeout','TimeoutError');
    };
    assert.equal(walletBroadcastEnabled,false);
    await assert.rejects(exerciseInitializationBroadcast({...input,providers:{
      ...providers,account:async()=>{throw Error('fixture outage');}
    }},loseResponse,clock),/outage/);
    assert.equal(existsSync(prefix+'.init-broadcast'),false);
    await assert.rejects(exerciseInitializationBroadcast(input,loseResponse,()=>quote.validUntil),/approval required/);
    assert.equal(posts,0);
    const concurrent=await Promise.allSettled([exerciseInitializationBroadcast(input,loseResponse,clock),
      exerciseInitializationBroadcast(input,loseResponse,clock)]);
    assert.equal(posts,1);
    assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(concurrent.find(item=>item.status==='fulfilled').value.status,'UNKNOWN');
    await assert.rejects(exerciseInitializationBroadcast(input,loseResponse,clock),{code:'EEXIST'});
    assert.equal(posts,1);
    assert.equal((await reconcileInitialization({...input,providers:{
      account:async()=>{throw Error('fixture read outage');}
    }},clock)).status,'UNKNOWN');
    const postAccount=chainCore.beginCell().storeBit(true).store(chainCore.storeAccount(after.account.account)).endCell();
    const rowCell=core.Cell.fromBase64(chainCore.beginCell().store(chainCore.storeTransaction(tx)).endCell().toBoc().toString('base64'));
    const row={hash:rowCell.hash().toString('hex'),tx:core.loadTransaction(rowCell.beginParse())};
    const receiptProviders={account:async()=>({raw:{state:postAccount.toBoc().toString('hex')},reference:{seqno:7},
      proof:{chainTime:chain.now,accountHash:postAccount.hash().toString('hex'),lastTransactionHash:row.hash,lastTransactionLt:String(row.tx.lt)}}),
      history:async()=>({rows:[row]})};
    assert.equal((await reconcileInitialization({...input,providers:{...receiptProviders,
      history:async()=>({rows:[{...row,hash:'00'.repeat(32)}]})}},clock)).status,'UNKNOWN');
    const receipt=await reconcileInitialization({...input,providers:receiptProviders},clock);
    assert.equal(receipt.status,'INCLUDED_FINALITY_UNVERIFIED');
    assert.equal(receipt.transactionHash,row.hash);
    assert.equal(receipt.actualFeesNano,String(fees));
    // A process crash after exclusive file creation can leave an empty marker.
    const crashed=mkdtempSync(join(directory,'crashed-')), crashPrefix=join(crashed,wallet.operator.slice(2));
    writeFileSync(crashPrefix+'.init-pending',quote.fingerprint);
    writeFileSync(crashPrefix+'.init-broadcast','',{flag:'wx'});
    await assert.rejects(exerciseInitializationBroadcast({...input,directory:crashed},loseResponse,clock),{code:'EEXIST'});
    assert.equal((await reconcileInitialization({...input,directory:crashed,providers:receiptProviders},clock)).status,'UNKNOWN');
    assert.equal(posts,1);
    const redirectDir=mkdtempSync(join(directory,'redirect-'));
    writeFileSync(join(redirectDir,wallet.operator.slice(2)+'.init-pending'),quote.fingerprint);
    let redirects=0;
    const redirect=await exerciseInitializationBroadcast({...input,directory:redirectDir},async (_,options)=>{
      redirects++;
      assert.equal(options.redirect,'manual');
      return new Response(null,{status:307,headers:{Location:'https://redirect.invalid/'}});
    },clock);
    assert.equal(redirects,1);
    assert.equal(redirect.status,'UNKNOWN');
  } finally { rmSync(directory,{recursive:true}); }

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


test('wallet broadcast CLI gate stops before reading files',()=>{
  const cli=fileURLToPath(new URL('../standard-wallet-broadcast-cli.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'broadcast','not-present.json','not-present.json'],{encoding:'utf8'});
  assert.equal(result.status,1);
  assert.equal(result.stdout,'');
  assert.match(result.stderr,/hard-disabled/);
});


test('prepare-init CLI distinguishes missing input, invalid JSON and missing provider configuration',()=>{
  const cli=fileURLToPath(new URL('../standard-owner-signer-cli.mjs',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'anlgram-preflight-diag-'));
  try {
    const path=join(dir,'input.json');
    const run=()=>{
      const result=spawnSync(process.execPath,[cli,'prepare-init',path],{encoding:'utf8',
        env:{...process.env,TONCENTER_TESTNET_API_KEY:'',TONAPI_TESTNET_API_KEY:''}});
      assert.equal(result.status,1);
      assert.equal(result.stdout,'');
      return JSON.parse(result.stderr);
    };
    assert.equal(run().code,'INPUT_FILE_UNREADABLE');
    writeFileSync(path,'{fixture-private-content');
    assert.equal(run().code,'INPUT_JSON_INVALID');
    writeFileSync(path,'\uFEFF{}');
    assert.deepEqual(run(),{code:'PROVIDER_KEY_MISSING',financialSigningEnabled:false,broadcastingEnabled:false,
      provider:'TONCENTER_TESTNET'});
  } finally { rmSync(dir,{recursive:true}); }
});

test('preflight provider diagnostics discard raw response contents',async()=>{
  const env={TONCENTER_TESTNET_API_KEY:'fixture-center',TONAPI_TESTNET_API_KEY:'fixture-tonapi'};
  for (const [status,code] of [[401,'PROVIDER_AUTH_REJECTED'],[403,'PROVIDER_AUTH_REJECTED'],
    [429,'PROVIDER_RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE'],[200,'PROVIDER_RESPONSE_INVALID']]) {
    const p=projectProviders(env,async()=>new Response('fixture-private-content',{status,headers:{'Retry-After':'4'}}));
    await assert.rejects(p.emulateUnsigned({}),error=>{
      assert.equal(error.code,code);
      assert.equal(error.operation,'emulateTrace');
      assert.equal(error.provider,'TONCENTER_TESTNET');
      assert.equal(error.status,status);
      if(status===429) assert.equal(error.retryMs,4000);
      assert.doesNotMatch(JSON.stringify(error)+error.message,/fixture/);
      return true;
    });
  }
  const p=projectProviders(env,async()=>Response.json({ok:false,code:403,error:'fixture-private-content'}));
  await assert.rejects(p.observeAddress('0:'+'11'.repeat(32)),{code:'PROVIDER_AUTH_REJECTED',operation:'getAddressInformation',rpcCode:403,status:undefined});
});
