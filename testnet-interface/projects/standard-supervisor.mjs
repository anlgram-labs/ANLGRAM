import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {pinned} from '../recovery/policy.mjs';
import trace from '../../lib/v5-minter-trace.js';
import artifact from '../../minter-contract/build/standard-jetton-v2.compiled.json' with {type:'json'};
import {prepareStandardTestnetRelease, standardDeploymentIdentity} from './standard-testnet-release.mjs';
import {acquireStandardRegistration, includedActiveState, standardRegistrationIntent} from './standard-registration.mjs';
import {projectProviders} from './project-providers.mjs';
import {StandardDeploymentLock} from './standard-deployment-lock.mjs';
import {authorizationNonce, standardSignDataPayload, verifyStandardApproval} from './standard-authorization.mjs';
import {registryStub} from './project-registry.mjs';

const amount = '50000000';
const hashes = {
  minter:'397faa44a7892b3f2eb0da4cf6f2ef04876d121f87f516c91fe3402808831d8c',
  wallet:'072d50c878949253fa6daee0149d12ed9adb91079cd5134b4d63a10ae6acb470'
};
const now = () => Math.floor(Date.now()/1000);
const requireExact = (condition, message) => { if (!condition) throw Error(message); };
export function assertReviewedArtifacts(source = artifact) {
  for (const [role, expected] of Object.entries(hashes)) {
    requireExact(source[role]?.codeHash === expected &&
      core.Cell.fromBase64(source[role].codeBocBase64).hash().toString('hex') === expected, 'Unreviewed Standard V2 artifact');
  }
}

export function walletSeqno(manifest, data) {
  const s = data.beginParse();
  const enabled = s.loadBit(), seqno = s.loadUint(32);
  requireExact(enabled && seqno > 0 && seqno < 0xffffffff &&
    s.loadInt(32) === manifest.operator.walletId && s.loadBuffer(32).toString('hex') === manifest.operator.publicKey &&
    !s.loadBit(), 'Wrong active V5R1 signing account');
  s.endParse();
  return seqno;
}

export async function inspectStandardWallet(value, providers) {
  const address = core.Address.parse(value), operator = address.toRawString();
  requireExact(address.workChain === 0 && operator !== pinned.operator,'Separate basechain operator required');
  const observation = await providers.observeAddress(operator);
  if (observation.state !== 'active') return {network:'-3',operator,state:observation.state,
    balanceNano:observation.balance,publicKey:null,eligible:false,evidence:'PROVIDER_OBSERVATION_ONLY'};
  const included = await providers.account(operator);
  requireExact(Math.abs(now()-included.proof.chainTime)<=15,'Fresh wallet inclusion required');
  const slice = core.Cell.fromBoc(Buffer.from(included.raw.state,'hex'))[0].beginParse();
  requireExact(slice.loadBit(),'Wallet account unavailable');
  const account = core.loadAccount(slice);
  slice.endParse();
  requireExact(account.addr.equals(address) && account.storage.state.type === 'active','Unexpected wallet account');
  const {code,data} = account.storage.state.state;
  const cursor = data.beginParse();
  cursor.skip(65);
  const publicKey = cursor.loadBuffer(32).toString('hex');
  const wallet = WalletContractV5R1.create({publicKey:Buffer.from(publicKey,'hex'),
    walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
  requireExact(wallet.address.equals(address) && wallet.init.code.equals(code),'Not Testnet V5R1 subwallet zero');
  const seqno = walletSeqno({operator:{walletId:2147483645,publicKey}},data);
  const balanceNano = String(account.storage.balance.coins);
  return {network:'-3',operator,state:'active',walletId:2147483645,subwalletNumber:0,publicKey,seqno,
    balanceNano,attachmentFundingPresent:BigInt(balanceNano)>=50000000n,validatorFinalityVerified:false,
    evidence:'ACCOUNT_INCLUSION_RELATIVE_TO_PROVIDER_REFERENCE'};
}

async function unsignedEmulation(manifest, seqno, validUntil) {
  const wallet = WalletContractV5R1.create({publicKey:Buffer.from(manifest.operator.publicKey,'hex'),
    walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
  const message = manifest.deployment.message, dest = core.Address.parseFriendly(message.address);
  requireExact(dest.isTestOnly && message.amount === amount && manifest.network === '-3', 'Wrong deployment envelope');
  const body = await wallet.createTransfer({seqno, timeout:validUntil, authType:'external', sendMode:3,
    signer:async()=>Buffer.alloc(64), messages:[core.internal({to:dest.address,bounce:dest.isBounceable,
      value:BigInt(amount),init:core.loadStateInit(core.Cell.fromBase64(message.stateInit).beginParse()),
      body:core.Cell.fromBase64(message.payload)})]});
  return {hash:body.hash().toString('hex'), request:{boc:core.beginCell()
    .store(core.storeMessage(core.external({to:wallet.address,body}))).endCell().toBoc().toString('base64'),
    ignore_chksig:true,include_code_data:true,with_actions:false}};
}

export async function readStandardPreflight({draft,publicKey,ownerPolicyCeilingNano,validUntil}, providers) {
  assertReviewedArtifacts();
  const manifest = await prepareStandardTestnetRelease(draft,publicKey);
  const started = now(), expiry = validUntil ?? started + 45;
  requireExact(Number.isInteger(expiry) && expiry > started && expiry <= started+60, 'Expired or invalid quote');
  const [owner,destination] = await Promise.all([providers.account(manifest.operator.address),
    providers.observeAddress(manifest.minter.raw)]);
  requireExact(destination.state === 'uninitialized' && !destination.code && !destination.data &&
    destination.balance === '0', 'Destination already initialized, funded or unverified');
  const {state,balance} = includedActiveState(owner, manifest.operator.codeHash);
  requireExact(/^[0-9a-f]{64}$/.test(owner.proof.accountHash ?? '') &&
    /^\d+$/.test(owner.proof.lastTransactionLt ?? ''), 'Incomplete included wallet checkpoint');
  const seqno = walletSeqno(manifest,state.data);
  const body = await unsignedEmulation(manifest,seqno,expiry);
  const result = await providers.emulateUnsigned(body.request);
  const sourceTrace = Object.values(result.transactions ?? {}).find(tx =>
    core.Address.parse(tx.account).toRawString() === manifest.operator.address);
  requireExact(sourceTrace?.account_state_before?.data_hash === state.data.hash().toString('base64') &&
    sourceTrace.account_state_before.code_hash === state.code.hash().toString('base64'), 'Emulation wallet state mismatch');
  const simulation = trace.analyze(result,{wallet:{...manifest.operator,raw:manifest.operator.address},
    dependentAccounts:{minter:manifest.minter},smokePlan:{steps:[manifest.deployment]}},body.hash,core,
  {senderStatus:'active',amount,seqno});
  requireExact(simulation.operatorBalanceBeforeNano === String(balance) &&
    simulation.masterchainBlock === owner.proof.masterchainSeqno &&
    now()-started <= 15 && Math.abs(now()-owner.proof.chainTime) <= 15, 'Emulation differs from fresh included state');
  const quote = {seqno,validUntil:expiry,referenceRootHash:owner.proof.masterchainRootHash,
    modeledSenderFeeNano:simulation.modeledSenderFeesNano,ownerPolicyCeilingNano};
  const identity = await standardDeploymentIdentity(manifest,quote,now());
  requireExact(balance >= BigInt(identity.modeledDebitNano), 'Insufficient Testnet balance');
  return {manifest,quote,identity,simulation,observedAt:started,balanceNano:String(balance),
    walletCheckpoint:{accountHash:owner.proof.accountHash,lt:owner.proof.lastTransactionLt,
      block:owner.proof.masterchainSeqno},
    destinationVerification:'AUTHENTICATED_PROVIDER_STATE_AND_EMULATION',financialSigningEnabled:false};
}

export function standardOperatorStorage(storage, operator) {
  requireExact(typeof operator === 'string' && /^0:[0-9a-f]{64}$/.test(operator),'Invalid Standard operator');
  const prefix = 'standard:v2:-3:v5r1:' + operator + ':';
  const scoped = store => ({
    async get(key) {
      const value = await store.get(prefix+key);
      if (value || key !== 'standardDeployment') return value;
      const legacy = await store.get(key);
      return legacy?.operator === operator ? legacy : undefined;
    },
    put:(key,value)=>store.put(prefix+key,value)
  });
  return {...scoped(storage),transaction:fn=>storage.transaction(txn=>fn(scoped(txn)))};
}

function reservedIntent(operation) {
  return operation?.snapshot?.identity && operation.snapshot.identity.fingerprint === operation.identity?.fingerprint
    ? standardRegistrationIntent(operation.snapshot.input) : null;
}

export class StandardSupervisor {
  constructor(storage, env, {confirmExclusiveUse, readWalletSession, providers = projectProviders(env)} = {}) {
    this.storage = storage;
    this.env = env;
    this.providers = providers;
    this.confirmExclusiveUse = confirmExclusiveUse;
    this.readWalletSession = readWalletSession;
  }

  lock(operator) {
    const storage = standardOperatorStorage(this.storage,operator), providers = this.providers;
    return new StandardDeploymentLock(storage, {
      verifyOwnerApproval:async (approval,fingerprint,_,manifest,identity)=>{
        const prepared = await storage.get('standardPrepared:'+fingerprint);
        return !!prepared && verifyStandardApproval(approval,manifest,identity,prepared.nonce,now(),prepared.preparedAt,
          await this.readWalletSession?.(operator));
      },
      verifyCurrentStateAndEmulation:async (manifest,quote,fingerprint)=>{
        const key = 'standardPrepared:'+fingerprint;
        const prepared = await storage.get(key);
        requireExact(prepared?.identity.fingerprint === fingerprint, 'No matching prepared quote');
        requireExact(await this.confirmExclusiveUse?.(operator,fingerprint) === true,'Exclusive operator use required');
        const current = await readStandardPreflight({...prepared.input,ownerPolicyCeilingNano:quote.ownerPolicyCeilingNano,
          validUntil:quote.validUntil},providers);
        const old = prepared.walletCheckpoint, latest = current.walletCheckpoint;
        requireExact(current.quote.seqno === quote.seqno &&
          current.quote.modeledSenderFeeNano === quote.modeledSenderFeeNano &&
          latest.block >= old.block && (latest.block !== old.block || current.quote.referenceRootHash === quote.referenceRootHash) &&
          latest.accountHash === old.accountHash && latest.lt === old.lt &&
          current.manifest.deployment.id === manifest.deployment.id &&
          current.manifest.deployment.receiptExpectation.stateInitHash === manifest.deployment.receiptExpectation.stateInitHash,
          'Preflight changed; new review required');
        return {network:'-3',operator,walletId:manifest.operator.walletId,walletCodeHash:manifest.operator.codeHash,
          destination:manifest.minter.raw,destinationState:'uninitialized',emulationSucceeded:true,noConcurrentOperation:true,
          proofExpiresAt:quote.validUntil,balanceNano:current.balanceNano,observedAt:current.observedAt,
          fingerprint,...quote,preparedKey:key,snapshot:prepared};
      },
      acquireAuthenticatedDeploymentReceipt:async operation=>{
        const intent = await reservedIntent(operation);
        if (!intent || intent.identity.fingerprint !== operation.identity.fingerprint) return null;
        return acquireStandardRegistration(intent,providers);
      }
    });
  }

  async prepare(input) {
    const result = await readStandardPreflight(input,this.providers);
    const {draft,publicKey} = input;
    const intent = await standardRegistrationIntent({projectType:'STANDARD_V2',draft,publicKey,quote:result.quote});
    const storage = standardOperatorStorage(this.storage,result.manifest.operator.address);
    const nonce = await storage.transaction(async txn=>{
      requireExact(!await txn.get('standardDeployment'), 'Permanent reservation exists');
      const key = 'standardPrepared:'+result.identity.fingerprint;
      const old = await txn.get(key);
      if (old) return old.nonce;
      const nonce = authorizationNonce();
      await txn.put(key,{state:'PREPARED',input:intent.input,identity:result.identity,walletCheckpoint:result.walletCheckpoint,nonce,preparedAt:now()});
      return nonce;
    });
    return {...result,authorizationNonce:nonce,signData:standardSignDataPayload(result.manifest,result.identity,nonce)};
  }

  async reserve(operator,fingerprint,approval) {
    requireExact(/^[0-9a-f]{64}$/.test(fingerprint ?? ''),'Invalid Standard fingerprint');
    const prepared = await standardOperatorStorage(this.storage,operator).get('standardPrepared:'+fingerprint);
    requireExact(prepared, 'No prepared operation');
    const {draft,publicKey,quote} = prepared.input;
    requireExact((await prepareStandardTestnetRelease(draft,publicKey)).operator.address === operator,'Prepared operator mismatch');
    return this.lock(operator).reserve(draft,publicKey,quote,approval);
  }

  async reconcile(operator) {
    const storage = standardOperatorStorage(this.storage,operator), lock = this.lock(operator);
    let operation, intent;
    try {
      operation = await lock.reconcile();
      intent = await reservedIntent(operation);
    } catch { return {operation:await lock.status(),evidence:'UNKNOWN'}; }
    if (!intent || operation?.state !== 'DEPLOYMENT_INCLUDED_FINALITY_UNVERIFIED' ||
      operation.identity.fingerprint !== intent.identity.fingerprint ||
      operation.receipt?.fingerprint !== intent.identity.fingerprint ||
      operation.receipt?.deployment?.address !== intent.manifest.minter.raw) return {operation,evidence:'UNKNOWN'};
    if (operation.registryConfirmed) return {operation,evidence:'INCLUDED_FINALITY_UNVERIFIED',registered:true};
    const key = intent.manifest.configurationFingerprint, stub = registryStub(key,this.env);
    // Registry independently reacquires the proof. A failure cannot invalidate
    // the persisted inclusion receipt or permit another wallet request.
    let registered = false;
    try {
      registered = !!stub && (await stub.fetch('https://project-registry.internal/'+key+'/register',{
        method:'POST',body:JSON.stringify(intent.input)
      })).ok;
    } catch { /* Registry can be reconciled later. */ }
    if (registered) operation = await storage.transaction(async txn=>{
      const current = await txn.get('standardDeployment');
      const updated = {...current,registryConfirmed:true};
      await txn.put('standardDeployment',updated);
      return updated;
    });
    return {operation,evidence:'INCLUDED_FINALITY_UNVERIFIED',registered};
  }
}
