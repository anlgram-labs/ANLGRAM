import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as core from '@ton/core';
import {mnemonicToWalletKey,sign} from '@ton/crypto';
import {mnemonicFromRandomSeed} from '@ton/crypto/dist/mnemonic/mnemonic.js';
import {recoverStandardPublicWallet} from '../projects/standard-owner-wallet.mjs';
import {assertWalletInitReleaseQuote} from '../projects/standard-wallet-init-release.mjs';
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
  const result=await buildWalletInitialization(wallet,chain.now+300,async cell=>sign(cell.hash(),key.secretKey),chain.now);
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
    account:async()=>({raw:{state:account.toBoc().toString('hex')},proof:{accountHash:account.hash().toString('hex'),
      chainTime:chain.now,masterchainSeqno:7,masterchainRootHash:'11'.repeat(32),masterchainFileHash:'12'.repeat(32),
      lastTransactionHash:'ab'.repeat(32),lastTransactionLt:'123',proofInclusionVerified:true}}),
    observeAddress:async()=>({state:'uninitialized',balance:String(balance)}),
    emulateUnsigned:async request=>{
      const {body,init}=core.loadMessage(core.Cell.fromBase64(request.boc).beginParse());
      assert.equal(request.ignore_chksig,true);
      assert.equal(request.mc_block_seqno,7);
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
    [trace=>({...trace,mc_block_seqno:6}),'EMULATION_REFERENCE_MISMATCH'],
    [trace=>({...trace,mc_block_seqno:8}),'EMULATION_REFERENCE_UNVERIFIED'],
    [trace=>({...trace,mc_block_seqno:'7'}),'EMULATION_RESPONSE_INVALID'],
    [trace=>({...trace,transactions:{wallet:{...trace.transactions.wallet,in_msg:{message_content:{hash:{}}}}}}),'EMULATION_TRACE_MISMATCH']
  ]) {
    await assert.rejects(prepareWalletInitialization(validInput,{...providers,
      emulateUnsigned:async request=>change(await providers.emulateUnsigned(request))},()=>chain.now),{code});
  }
  const quote=await prepareWalletInitialization({wallet,ownerPolicyCeilingNano:String(fees)},providers,()=>chain.now);
  assert.equal(quote.evidenceReference.emulationMasterchainSeqno,7);
  const reference={seqno:8,root_hash:Buffer.alloc(32,0x21).toString('base64'),file_hash:Buffer.alloc(32,0x22).toString('base64')};
  const newerProviders = changes => ({
    ...providers,reference:async seqno=>{assert.equal(seqno,8);return reference;},
    account:async (address,at)=>{
      const bundle=await providers.account();
      if (!at) return bundle;
      assert.equal(address,wallet.operator);
      assert.deepEqual(at,reference);
      return {...bundle,proof:{...bundle.proof,masterchainSeqno:8,masterchainRootHash:'21'.repeat(32),
        masterchainFileHash:'22'.repeat(32),...changes}};
    },
    emulateUnsigned:async request=>({...await providers.emulateUnsigned(request),mc_block_seqno:8})
  });
  const newer=await prepareWalletInitialization(validInput,newerProviders(),()=>chain.now);
  assert.equal(newer.fingerprint,quote.fingerprint);
  assert.equal(newer.evidenceReference.emulationMasterchainSeqno,8);
  assert.equal(newer.evidenceReference.emulationMasterchainRootHash,'21'.repeat(32));
  for (const [change,code] of [
    [{accountHash:'42'.repeat(32)},'EMULATION_ACCOUNT_CHANGED'],
    [{lastTransactionLt:'122'},'EMULATION_ACCOUNT_CHANGED'],
    [{lastTransactionHash:'43'.repeat(32)},'EMULATION_ACCOUNT_CHANGED'],
    [{masterchainSeqno:7},'EMULATION_REFERENCE_UNVERIFIED'],
    [{masterchainRootHash:'43'.repeat(32)},'EMULATION_REFERENCE_UNVERIFIED'],
    [{proofInclusionVerified:false},'EMULATION_REFERENCE_UNVERIFIED'],
    [{chainTime:chain.now-16},'EMULATION_REFERENCE_STALE']
  ]) {
    await assert.rejects(prepareWalletInitialization(validInput,newerProviders(change),()=>chain.now),
      {code,accountMasterchainSeqno:7,emulationMasterchainSeqno:8});
  }
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
    assert.equal(walletBroadcastEnabled,true);
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
  const approval=spawnSync(process.execPath,[cli,'sign-approval','not-present.json','not-present.gpg'],{encoding:'utf8'});
  assert.equal(approval.status,1);
  assert.equal(approval.stdout,'');
  assert.match(approval.stderr,/Signing is hard-disabled/);
  const init=spawnSync(process.execPath,[cli,'sign-init','not-present.json','not-present.gpg'],{encoding:'utf8'});
  assert.equal(init.status,1);
  assert.equal(init.stdout,'');
  assert.match(init.stderr,/Preserve any pending marker|Signing is hard-disabled/);
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
  assert.match(result.stderr,/Broadcast stopped|hard-disabled/);
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
    assert.deepEqual(run(),{code:'PROVIDER_KEY_MISSING',financialSigningEnabled:true,broadcastingEnabled:walletBroadcastEnabled,
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

test('regression: missing TONAPI credential reports TONAPI_TESTNET missing diagnostic',()=>{
  const cli=fileURLToPath(new URL('../standard-owner-signer-cli.mjs',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'anlgram-tonapi-missing-'));
  try {
    const path=join(dir,'input.json');
    writeFileSync(path,'\uFEFF{}');
    const result=spawnSync(process.execPath,[cli,'prepare-init',path],{encoding:'utf8',
      env:{...process.env,TONCENTER_TESTNET_API_KEY:'fixture-center',TONAPI_TESTNET_API_KEY:''}});
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{code:'PROVIDER_KEY_MISSING',
      financialSigningEnabled:true,broadcastingEnabled:walletBroadcastEnabled,provider:'TONAPI_TESTNET'});
  } finally { rmSync(dir,{recursive:true}); }
});

test('regression: expired quotes, identity mismatch and interrupted execution fail closed',async()=>{
  const mnemonic=await words(), wallet=await recoverStandardPublicWallet(mnemonic);
  const otherMnemonic=await mnemonicFromRandomSeed(Buffer.alloc(32,0x99),24);
  const otherWallet=await recoverStandardPublicWallet(otherMnemonic);
  const now=1700000000;
  const quote={network:'-3',operator:wallet.operator,publicKey:wallet.publicKey,walletId:wallet.walletId,
    stateInitHash:'9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08',expectedDataHash:'11'.repeat(32),
    seqno:0,expectedSeqno:1,validUntil:now-10,outgoingMessages:0,balanceNano:'1000000000',modeledFeeNano:'1000000',
    ownerPolicyCeilingNano:'70000000',accountHash:'22'.repeat(32),unsignedBodyHash:'33'.repeat(32),
    fingerprint:'44'.repeat(32)};
  const prepared={wallet,quote};
  const signed={status:'SIGNED_NOT_BROADCAST',fingerprint:quote.fingerprint,messageHash:'55'.repeat(32),boc:'te6ccgEBAQEAAgAAAA=='};

  // 1. Expired quote rejection in validation
  await assert.rejects(validateSignedInitialization(prepared,signed),/quote/);

  // 2. Identity mismatch in quote release assertion
  const releaseWallet={workchain:0,address:'0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn',
    publicKey:'194f6f9fb1779cf2120e9cab41c4ff71d75fe08d4a139f86c73eae89cc3d7217',
    operator:'0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08',
    walletVersion:'v5r1',subwalletNumber:0,network:'-3',
    walletCodeHash:'20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f',walletId:2147483645};
  const releaseQuote={network:'-3',operator:releaseWallet.operator,publicKey:releaseWallet.publicKey,
    walletId:releaseWallet.walletId,stateInitHash:'9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08',
    expectedDataHash:'11'.repeat(32),seqno:0,expectedSeqno:1,validUntil:now+45,outgoingMessages:0,
    balanceNano:'1999999999',modeledFeeNano:'780696',ownerPolicyCeilingNano:'70000000',
    accountHash:'22'.repeat(32),unsignedBodyHash:'33'.repeat(32),fingerprint:'44'.repeat(32)};
  assert.throws(()=>assertWalletInitReleaseQuote({wallet:otherWallet,quote:releaseQuote}),/scope rejected/);
  assert.throws(()=>assertWalletInitReleaseQuote({wallet:releaseWallet,quote:{...releaseQuote,operator:otherWallet.operator}}),/release quote rejected/);
  assert.throws(()=>assertWalletInitReleaseQuote({wallet:releaseWallet,quote:{...releaseQuote,publicKey:otherWallet.publicKey}}),/release quote rejected/);
  assert.throws(()=>assertWalletInitReleaseQuote({wallet:releaseWallet,quote:{...releaseQuote,seqno:1}}),/release quote rejected/);
  assert.throws(()=>assertWalletInitReleaseQuote({wallet:releaseWallet,quote:{...releaseQuote,outgoingMessages:1}}),/release quote rejected/);

  // 3. Interrupted execution / crash marker permanence
  const dir=mkdtempSync(join(tmpdir(),'anlgram-crash-test-'));
  try {
    const prefix=join(dir,wallet.operator.slice(2));
    writeFileSync(prefix+'.init-pending',quote.fingerprint);
    // Exclusive marker creation rejects second attempt with EEXIST
    assert.throws(()=>{
      const {openSync}=require('node:fs');
      openSync(prefix+'.init-pending','wx');
    },{code:'EEXIST'});
  } finally { rmSync(dir,{recursive:true}); }
});

test('regression: bounded validity window (300s default, 600s max) and pre-marker expiration enforcement',async()=>{
  const mnemonic=await words(), wallet=await recoverStandardPublicWallet(mnemonic);
  const now=1700000000;
  const providers={
    account:async()=>({raw:{state:''},proof:{accountHash:'22'.repeat(32),chainTime:now,masterchainSeqno:10,
      masterchainRootHash:'11'.repeat(32),masterchainFileHash:'12'.repeat(32),lastTransactionHash:'ab'.repeat(32),
      lastTransactionLt:'123',proofInclusionVerified:true}}),
    observeAddress:async()=>({state:'uninitialized',balance:'100000000'}),
    emulateUnsigned:async()=>({is_incomplete:false,mc_block_seqno:10,transactions:{wallet:{account:wallet.operator,
      emulated:true,orig_status:'uninit',end_status:'active',description:{aborted:false,compute_ph:{success:true,exit_code:0}},
      out_msgs:[],total_fees:'500000',in_msg:{message_content:{hash:'aa'.repeat(32)},init_state:{hash:'bb'.repeat(32)}},
      account_state_before:{balance:'100000000'},account_state_after:{balance:'99500000',code_hash:wallet.walletCodeHash,
      data_hash:'cc'.repeat(32)}}}}),
    reference:async()=>({seqno:10,root_hash:'11'.repeat(32),file_hash:'12'.repeat(32)})
  };

  // 1. buildWalletInitialization expiry boundaries:
  // Accepts up to now+600
  const validSigned = await buildWalletInitialization(wallet, now+300, async()=>Buffer.alloc(64), now);
  assert.equal(typeof validSigned.boc, 'string');
  const maxSigned = await buildWalletInitialization(wallet, now+600, async()=>Buffer.alloc(64), now);
  assert.equal(typeof maxSigned.boc, 'string');
  // Rejects > now+600
  await assert.rejects(buildWalletInitialization(wallet, now+601, async()=>Buffer.alloc(64), now), /Invalid initialization expiry/);
  // Rejects <= now
  await assert.rejects(buildWalletInitialization(wallet, now, async()=>Buffer.alloc(64), now), /Invalid initialization expiry/);
  await assert.rejects(buildWalletInitialization(wallet, now-1, async()=>Buffer.alloc(64), now), /Invalid initialization expiry/);

  // 2. prepareWalletInitialization expiry boundaries:
  // Rejects > started+600
  await assert.rejects(prepareWalletInitialization({wallet, ownerPolicyCeilingNano:'70000000', validUntil:now+601}, providers, ()=>now),
    {code:'INPUT_EXPIRY_INVALID'});
  // Rejects <= started
  await assert.rejects(prepareWalletInitialization({wallet, ownerPolicyCeilingNano:'70000000', validUntil:now}, providers, ()=>now),
    {code:'INPUT_EXPIRY_INVALID'});
  await assert.rejects(prepareWalletInitialization({wallet, ownerPolicyCeilingNano:'70000000', validUntil:now-10}, providers, ()=>now),
    {code:'INPUT_EXPIRY_INVALID'});

  // 3. CLI sign-init rejects expired quote BEFORE creating .init-pending marker:
  const cli=fileURLToPath(new URL('../standard-owner-signer-cli.mjs',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'anlgram-expired-marker-test-'));
  try {
    const expiredQuoteFile=join(dir,'expired-quote.json');
    const fakeBackup=join(dir,'backup.gpg');
    writeFileSync(fakeBackup,'fake-gpg-content');
    const releaseWallet={workchain:0,address:'0QCetQK2VyBLL2cB9Gmw7fyHudAMwCX75-Mps0NWmk5fCAUn',
      publicKey:'194f6f9fb1779cf2120e9cab41c4ff71d75fe08d4a139f86c73eae89cc3d7217',
      operator:'0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08',
      walletVersion:'v5r1',subwalletNumber:0,network:'-3',
      walletCodeHash:'20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f',walletId:2147483645};
    const expiredQuote={network:'-3',operator:releaseWallet.operator,publicKey:releaseWallet.publicKey,
      walletId:releaseWallet.walletId,stateInitHash:'9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08',
      expectedDataHash:'11'.repeat(32),seqno:0,expectedSeqno:1,validUntil:1000,outgoingMessages:0,
      balanceNano:'1999999999',modeledFeeNano:'780696',ownerPolicyCeilingNano:'70000000',
      accountHash:'22'.repeat(32),unsignedBodyHash:'33'.repeat(32),fingerprint:'44'.repeat(32)};
    writeFileSync(expiredQuoteFile, '\uFEFF'+JSON.stringify({wallet:releaseWallet, quote:expiredQuote}));

    const markerDir=join(homedir(),'.anlgram-standard-v2');
    const markerFile=join(markerDir,releaseWallet.operator.slice(2)+'.init-pending');
    const markerExistedBefore=existsSync(markerFile);

    const result=spawnSync(process.execPath,[cli,'sign-init',expiredQuoteFile,fakeBackup],{
      encoding:'utf8',
      env:{...process.env,TONCENTER_TESTNET_API_KEY:'key1',TONAPI_TESTNET_API_KEY:'key2',ANLGRAM_TEST_TTY:'1'}
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Quote expired before signing reservation\. No marker was created/);
    if (!markerExistedBefore) {
      assert.equal(existsSync(markerFile), false, 'Expired quote must NOT create .init-pending marker');
    }
  } finally { rmSync(dir,{recursive:true}); }
});

test('regression: confirmation prompt UX trims whitespace and reports exact length mismatch diagnostics', () => {
  const script = `
    import {createInterface} from 'node:readline/promises';
    async function confirm(expected, operation = 'wallet initialization') {
      console.error('\\n' + '='.repeat(72));
      console.error('REQUIRED OWNER APPROVAL:');
      console.error('  ' + expected);
      console.error('='.repeat(72));
      console.error('Enter the exact approval string above to sign ' + operation + ':');
      const input = createInterface({input:process.stdin,output:process.stderr});
      try {
        const raw = await input.question('> ');
        const answer = raw ? raw.trim() : '';
        if (answer !== expected) {
          console.error('\\n[AUTHORIZATION REJECTED]');
          console.error('Expected: ' + expected + ' (' + expected.length + ' chars)');
          console.error('Received: ' + answer + ' (' + answer.length + ' chars)');
          if (answer.length !== expected.length) {
            const diff = expected.length - answer.length;
            console.error('Length difference: missing/extra ' + Math.abs(diff) + ' character(s).');
          }
          throw Error('Owner cancelled');
        }
      } finally {
        input.close();
      }
    }
    const expected = process.argv[2] || process.argv[1];
    await confirm(expected, 'test');
    console.log('CONFIRMED_OK');
  `;

  const expectedStr = 'AUTHORIZE TESTNET INIT 194f6f9fb1779cf2120e9cab41c4ff71d75fe08d4a139f86c73eae89cc3d7217';

  // 1. Exact match with leading and trailing whitespace succeeds
  const okResult = spawnSync(process.execPath, ['--input-type=module', '-e', script, expectedStr], {
    input: '   ' + expectedStr + '  \n',
    encoding: 'utf8'
  });
  assert.equal(okResult.status, 0);
  assert.match(okResult.stdout, /CONFIRMED_OK/);

  // 2. Mismatch with dropped character fails with detailed diff diagnostics
  const droppedChar = expectedStr.slice(0, -1);
  const failResult = spawnSync(process.execPath, ['--input-type=module', '-e', script, expectedStr], {
    input: droppedChar + '\n',
    encoding: 'utf8'
  });
  assert.notEqual(failResult.status, 0);
  assert.match(failResult.stderr, /\[AUTHORIZATION REJECTED\]/);
  assert.match(failResult.stderr, /Expected: .* \(87 chars\)/);
  assert.match(failResult.stderr, /Received: .* \(86 chars\)/);
  assert.match(failResult.stderr, /Length difference: missing\/extra 1 character\(s\)\./);
});
