import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {createHash} from 'node:crypto';
import {pinned} from '../recovery/policy.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const matchesHash = (value,expected) => typeof value === 'string' &&
  /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value,'base64').toString('hex')===expected;
const hash = cell => cell.hash().toString('hex');
const exact = (value,message) => { if (!value) throw Error(message); };

export function initializationWallet(wallet) {
  exact(wallet?.network === '-3' && wallet.walletId === 2147483645 &&
    wallet.subwalletNumber === 0 && wallet.workchain === 0 && wallet.walletVersion === 'v5r1' &&
    typeof wallet.publicKey === 'string' && /^[a-f0-9]{64}$/.test(wallet.publicKey) && !/^0+$/.test(wallet.publicKey),
    'Wrong V5R1 initialization identity');
  const contract = WalletContractV5R1.create({publicKey:Buffer.from(wallet.publicKey,'hex'),
    walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
  exact(contract.address.toRawString() === wallet.operator && wallet.operator !== pinned.operator &&
    hash(contract.init.code) === wallet.walletCodeHash,'Wrong initialization address or code');
  return contract;
}

export async function buildWalletInitialization(wallet, validUntil, signer, now) {
  const contract = initializationWallet(wallet);
  exact(Number.isSafeInteger(validUntil) && validUntil > now && validUntil <= now+600 && validUntil <= 0xffffffff,
    'Invalid initialization expiry');
  // The initial request activates the wallet and advances seqno, with no internal transfers.
  const body = await contract.createTransfer({seqno:0,timeout:validUntil,sendMode:3,authType:'external',messages:[],signer});
  const s = body.beginParse();
  exact(s.loadUint(32) === 0x7369676e && s.loadInt(32) === wallet.walletId &&
    s.loadUint(32) === validUntil && s.loadUint(32) === 0 && !s.loadBit() && !s.loadBit(),
    'Unexpected initialization message');
  s.loadBuffer(64);
  s.endParse();
  const init = core.beginCell().store(core.storeStateInit(contract.init)).endCell();
  const cell = core.beginCell().store(core.storeMessage(core.external({to:contract.address,init:contract.init,body}))).endCell();
  return {boc:cell.toBoc().toString('base64'),bodyHash:hash(body),stateInitHash:hash(init),messageHash:hash(cell)};
}

export class InitPreflightError extends Error {
  constructor(code,message) { super(message); this.code=code; }
}

const check = (value,code,message) => { if (!value) throw new InitPreflightError(code,message); };
const blockSeqno = value => Number.isInteger(value) && value>0 && value<=0xffffffff;
const hexHash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);

async function matchEmulationReference(wallet, proof, emulationSeqno, providers, clock) {
  const accountMasterchainSeqno = proof.masterchainSeqno;
  function requireReference(ok,code,message) {
    if (ok) return;
    const error = new InitPreflightError(code,message);
    error.accountMasterchainSeqno = accountMasterchainSeqno;
    error.emulationMasterchainSeqno = emulationSeqno;
    throw error;
  }
  requireReference(emulationSeqno>=accountMasterchainSeqno,'EMULATION_REFERENCE_MISMATCH','Emulation reference is older');
  if (emulationSeqno===accountMasterchainSeqno) return proof;

  // The emulator reports a height, not a block root or account proof.
  // Resolve that exact height independently and require a proof at its full reference.
  let newer, reference;
  try {
    reference = await providers.reference(emulationSeqno);
    newer = await providers.account(wallet.operator,reference);
  } catch {
    requireReference(false,'EMULATION_REFERENCE_UNVERIFIED','Unable to authenticate newer emulation reference');
  }
  const next = newer?.proof;
  requireReference(reference?.seqno===emulationSeqno && next?.masterchainSeqno===emulationSeqno && next.proofInclusionVerified===true &&
    hexHash(next.masterchainRootHash) && hexHash(next.masterchainFileHash) &&
    matchesHash(reference.root_hash,next.masterchainRootHash) && matchesHash(reference.file_hash,next.masterchainFileHash),
    'EMULATION_REFERENCE_UNVERIFIED','Account proof did not match exact emulation reference');
  requireReference(next.chainTime>=proof.chainTime && Math.abs(clock()-next.chainTime)<=15,
    'EMULATION_REFERENCE_STALE','Newer emulation reference is stale or rolled back');
  requireReference(hexHash(proof.lastTransactionHash) && typeof proof.lastTransactionLt==='string' &&
    /^\d+$/.test(proof.lastTransactionLt) &&
    next.accountHash===proof.accountHash && next.lastTransactionHash===proof.lastTransactionHash &&
    next.lastTransactionLt===proof.lastTransactionLt,
    'EMULATION_ACCOUNT_CHANGED','Wallet checkpoint changed at emulation reference');
  return next;
}

export async function prepareWalletInitialization({wallet,ownerPolicyCeilingNano,validUntil,financialSigningEnabled=false,broadcastingEnabled=false}, providers,
  clock=()=>Math.floor(Date.now()/1000)) {
  const started = clock(), expiry = validUntil ?? started+300;
  let contract;
  try { contract = initializationWallet(wallet); }
  catch { throw new InitPreflightError('INPUT_WALLET_INVALID','Invalid initialization wallet'); }
  check(Number.isSafeInteger(expiry) && expiry>started && expiry<=started+600 && expiry<=0xffffffff,
    'INPUT_EXPIRY_INVALID','Invalid initialization expiry');
  check(typeof ownerPolicyCeilingNano === 'string' && /^[1-9][0-9]{0,19}$/.test(ownerPolicyCeilingNano),'INPUT_FEE_CEILING_INVALID','Explicit fee ceiling required');
  const [included, observed] = await Promise.all([providers.account(wallet.operator),providers.observeAddress(wallet.operator)]);
  let cell,account;
  try {
    cell = core.Cell.fromBoc(Buffer.from(included.raw.state,'hex'))[0];
    const slice = cell.beginParse();
    check(slice.loadBit(),'ACCOUNT_NOT_FUNDED_UNINITIALIZED','Funded account required');
    account = core.loadAccount(slice);
    slice.endParse();
  } catch (error) {
    if (error instanceof InitPreflightError) throw error;
    throw new InitPreflightError('ACCOUNT_RESPONSE_INVALID','Invalid included account response');
  }
  check(['uninitialized','active','frozen'].includes(observed?.state) &&
    typeof observed.balance === 'string' && /^\d+$/.test(observed.balance),
    'ACCOUNT_RESPONSE_INVALID','Invalid provider account response');
  const balance = account.storage.balance.coins;
  check(account.addr.equals(contract.address) && hash(cell)===included.proof.accountHash,
    'ACCOUNT_PROOF_MISMATCH','Account identity or hash differs from proof');
  check(account.storage.state.type==='uninit' && balance>0n,
    'ACCOUNT_NOT_FUNDED_UNINITIALIZED','Wallet must be funded and uninitialized');
  check(observed.state==='uninitialized' && !observed.code && !observed.data && observed.balance===String(balance),
    'ACCOUNT_OBSERVATION_MISMATCH','Wallet must be funded and uninitialized in both observations');
  check(Math.abs(clock()-included.proof.chainTime)<=15 && clock()-started<=15 && clock()<expiry,
    'ACCOUNT_CHECKPOINT_STALE','Wallet checkpoint is stale');
  const unsigned = await buildWalletInitialization(wallet,expiry,async()=>Buffer.alloc(64),clock());
  check(blockSeqno(included.proof.masterchainSeqno),'ACCOUNT_RESPONSE_INVALID','Invalid account reference height');
  const simulation = await providers.emulateUnsigned({boc:unsigned.boc,ignore_chksig:true,include_code_data:true,
    with_actions:false,mc_block_seqno:included.proof.masterchainSeqno});
  check(simulation && typeof simulation.is_incomplete === 'boolean' && blockSeqno(simulation.mc_block_seqno) &&
    simulation.transactions && typeof simulation.transactions === 'object',
    'EMULATION_RESPONSE_INVALID','Invalid emulator response');
  check(!simulation.is_incomplete,'EMULATION_INCOMPLETE','Incomplete emulation');
  const emulatedProof = await matchEmulationReference(wallet,included.proof,simulation.mc_block_seqno,providers,clock);
  check(clock()-started<=15 && Math.abs(clock()-emulatedProof.chainTime)<=15 && clock()<expiry,
    'EMULATION_STALE','Emulation exceeded freshness window');
  const txs = Object.values(simulation.transactions), tx = txs[0];
  let txAddress;
  try { txAddress = core.Address.parse(tx?.account); } catch { /* Reject malformed trace below. */ }
  check(txs.length===1 && txAddress?.equals(contract.address) && tx.emulated === true &&
    tx.orig_status==='uninit' && tx.end_status==='active' && tx.description?.aborted===false &&
    tx.description?.compute_ph?.success===true && tx.description.compute_ph.exit_code===0 &&
    (!tx.description.action || (tx.description.action.success===true && tx.description.action.result_code===0)) &&
    Array.isArray(tx.out_msgs) && tx.out_msgs.length===0 &&
    matchesHash(tx.in_msg?.message_content?.hash,unsigned.bodyHash) &&
    matchesHash(tx.in_msg?.init_state?.hash,unsigned.stateInitHash) &&
    matchesHash(tx.account_state_after?.code_hash,wallet.walletCodeHash) &&
    tx.account_state_before?.balance === String(balance) &&
    typeof tx.account_state_after?.balance==='string' && /^\d+$/.test(tx.account_state_after.balance) &&
    typeof tx.total_fees==='string' && /^[1-9][0-9]*$/.test(tx.total_fees),
    'EMULATION_TRACE_MISMATCH','Initialization emulation did not match fresh Testnet state');
  const expected = core.beginCell().storeBit(true).storeUint(1,32).storeInt(wallet.walletId,32)
    .storeBuffer(Buffer.from(wallet.publicKey,'hex')).storeBit(false).endCell();
  check(matchesHash(tx.account_state_after.data_hash,hash(expected)),
    'EMULATION_STATE_MISMATCH','Unexpected initialized V5R1 state');
  const fee = BigInt(tx.total_fees);
  check(balance-BigInt(tx.account_state_after.balance)===fee && fee<balance,
    'EMULATION_FEE_MISMATCH','Initialization fee accounting mismatch');
  check(fee<=BigInt(ownerPolicyCeilingNano),'FEE_POLICY_EXCEEDED','Initialization fee above policy ceiling');
  const quote = {network:'-3',operator:wallet.operator,publicKey:wallet.publicKey,walletId:wallet.walletId,
    stateInitHash:unsigned.stateInitHash,expectedDataHash:hash(expected),seqno:0,expectedSeqno:1,validUntil:expiry,
    outgoingMessages:0,balanceNano:String(balance),modeledFeeNano:String(fee),ownerPolicyCeilingNano,
    accountHash:included.proof.accountHash,unsignedBodyHash:unsigned.bodyHash};
  return {...quote,fingerprint:digest(quote),
    evidenceReference:{accountMasterchainSeqno:included.proof.masterchainSeqno,
      emulationMasterchainSeqno:emulatedProof.masterchainSeqno,emulationMasterchainRootHash:emulatedProof.masterchainRootHash,
      validatorFinalityVerified:false},
    financialSigningEnabled,broadcastingEnabled,hardFeeCapEnforced:false};
}
