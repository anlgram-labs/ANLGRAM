import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import trace from '../../lib/v5-minter-trace.js';
import artifact from '../../minter-contract/build/standard-jetton-v2.compiled.json' with {type:'json'};
import {prepareStandardTestnetRelease, standardDeploymentIdentity} from './standard-testnet-release.mjs';
import {acquireStandardRegistration, includedActiveState, standardRegistrationIntent} from './standard-registration.mjs';
import {projectProviders} from './project-providers.mjs';
import {StandardDeploymentLock} from './standard-deployment-lock.mjs';
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
    destinationVerification:'AUTHENTICATED_PROVIDER_STATE_AND_EMULATION',financialSigningEnabled:false};
}

export class StandardSupervisor {
  constructor(storage, env, {verifyOwnerApproval, readOwnershipProof, providers = projectProviders(env)} = {}) {
    this.storage = storage;
    this.env = env;
    this.providers = providers;
    this.verifyOwnerApproval = verifyOwnerApproval;
    this.readOwnershipProof = readOwnershipProof;
    this.lock = new StandardDeploymentLock(storage, {
      verifyOwnerApproval:(...args)=>this.verifyOwnerApproval?.(...args),
      verifyCurrentStateAndEmulation:async (manifest,quote,fingerprint)=>{
        const prepared = await storage.get('standardPrepared');
        requireExact(prepared?.identity.fingerprint === fingerprint, 'No matching prepared quote');
        const proof = await this.readOwnershipProof?.(manifest.operator.address);
        requireExact(proof?.verified === true && proof.network === '-3' && proof.address === manifest.operator.address &&
          proof.domain === 'testnet.anlgram.com' && proof.noConcurrentOperation === true, 'Fresh operator proof and exclusivity required');
        const current = await readStandardPreflight({...prepared.input,ownerPolicyCeilingNano:quote.ownerPolicyCeilingNano,validUntil:quote.validUntil},providers);
        requireExact(current.identity.fingerprint === fingerprint, 'Preflight changed; new review required');
        return {network:'-3',operator:manifest.operator.address,walletId:manifest.operator.walletId,walletCodeHash:manifest.operator.codeHash,
          destination:manifest.minter.raw,destinationState:'uninitialized',emulationSucceeded:true,noConcurrentOperation:true,
          proofExpiresAt:proof.expiresAt,balanceNano:current.balanceNano,observedAt:current.observedAt,
          fingerprint,requirePrepared:true,...current.quote};
      },
      acquireAuthenticatedDeploymentReceipt:async operation=>{
        const prepared = await storage.get('standardPrepared');
        if (!prepared || prepared.identity.fingerprint !== operation.identity.fingerprint) return null;
        return acquireStandardRegistration(await standardRegistrationIntent(prepared.input),providers);
      }
    });
  }

  async prepare(input) {
    const result = await readStandardPreflight(input,this.providers);
    const {draft,publicKey} = input;
    const intent = await standardRegistrationIntent({projectType:'STANDARD_V2',draft,publicKey,quote:result.quote});
    await this.storage.transaction(async txn=>{
      requireExact(!await txn.get('standardDeployment'), 'Permanent reservation exists');
      await txn.put('standardPrepared',{state:'PREPARED',input:intent.input,identity:result.identity});
    });
    return result;
  }

  async reserve(approval) {
    const prepared = await this.storage.get('standardPrepared');
    requireExact(prepared, 'No prepared operation');
    const {draft,publicKey,quote} = prepared.input;
    return this.lock.reserve(draft,publicKey,quote,approval);
  }

  async reconcile() {
    let operation;
    try { operation = await this.lock.reconcile(); }
    catch { return {operation:await this.lock.status(),evidence:'UNKNOWN'}; }
    if (operation?.state !== 'DEPLOYMENT_INCLUDED_FINALITY_UNVERIFIED') return {operation,evidence:'UNKNOWN'};
    if (operation.registryConfirmed) return {operation,evidence:'INCLUDED_FINALITY_UNVERIFIED',registered:true};
    const prepared = await this.storage.get('standardPrepared');
    const intent = await standardRegistrationIntent(prepared.input);
    const key = intent.manifest.configurationFingerprint, stub = registryStub(key,this.env);
    // Registry independently reacquires the proof. A failure cannot invalidate
    // the persisted inclusion receipt or permit another wallet request.
    let registered = false;
    try {
      registered = !!stub && (await stub.fetch('https://project-registry.internal/'+key+'/register',{
        method:'POST',body:JSON.stringify(intent.input)
      })).ok;
    } catch { /* Registry can be reconciled later. */ }
    if (registered) operation = await this.storage.transaction(async txn=>{
      const current = await txn.get('standardDeployment');
      const updated = {...current,registryConfirmed:true};
      await txn.put('standardDeployment',updated);
      return updated;
    });
    return {operation,evidence:'INCLUDED_FINALITY_UNVERIFIED',registered};
  }
}
