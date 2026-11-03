import * as core from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';
import {createHash} from 'node:crypto';
import {pinned} from '../recovery/policy.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
  exact(Number.isSafeInteger(validUntil) && validUntil > now && validUntil <= now+60 && validUntil <= 0xffffffff,
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

export async function prepareWalletInitialization({wallet,ownerPolicyCeilingNano,validUntil}, providers,
  clock=()=>Math.floor(Date.now()/1000)) {
  const started = clock(), expiry = validUntil ?? started+45;
  const contract = initializationWallet(wallet);
  exact(typeof ownerPolicyCeilingNano === 'string' && /^[1-9][0-9]{0,19}$/.test(ownerPolicyCeilingNano),'Explicit fee ceiling required');
  const [included, observed] = await Promise.all([providers.account(wallet.operator),providers.observeAddress(wallet.operator)]);
  const cell = core.Cell.fromBoc(Buffer.from(included.raw.state,'hex'))[0], slice = cell.beginParse();
  exact(slice.loadBit(),'Funded account required');
  const account = core.loadAccount(slice);
  slice.endParse();
  const balance = account.storage.balance.coins;
  exact(account.addr.equals(contract.address) && account.storage.state.type === 'uninit' &&
    observed.state === 'uninitialized' && !observed.code && !observed.data && observed.balance === String(balance) &&
    balance > 0n && hash(cell) === included.proof.accountHash,'Wallet must be funded and uninitialized');
  const unsigned = await buildWalletInitialization(wallet,expiry,async()=>Buffer.alloc(64),clock());
  const simulation = await providers.emulateUnsigned({boc:unsigned.boc,ignore_chksig:true,include_code_data:true,with_actions:false});
  const txs = Object.values(simulation.transactions ?? {}), tx = txs[0];
  exact(simulation.is_incomplete === false && simulation.mc_block_seqno === included.proof.masterchainSeqno &&
    clock()-started <= 15 && Math.abs(clock()-included.proof.chainTime)<=15 && clock()<expiry &&
    txs.length===1 && core.Address.parse(tx.account).equals(contract.address) && tx.emulated === true &&
    tx.orig_status==='uninit' && tx.end_status==='active' && tx.description?.aborted===false &&
    tx.description.compute_ph?.success===true && tx.description.compute_ph.exit_code===0 &&
    (!tx.description.action || (tx.description.action.success===true && tx.description.action.result_code===0)) &&
    Array.isArray(tx.out_msgs) && tx.out_msgs.length===0 &&
    Buffer.from(tx.in_msg?.message_content?.hash ?? '','base64').toString('hex')===unsigned.bodyHash &&
    Buffer.from(tx.in_msg?.init_state?.hash ?? '','base64').toString('hex')===unsigned.stateInitHash &&
    Buffer.from(tx.account_state_after?.code_hash ?? '','base64').toString('hex')===wallet.walletCodeHash &&
    tx.account_state_before?.balance === String(balance) &&
    /^\d+$/.test(tx.account_state_after?.balance ?? '') && /^[1-9][0-9]*$/.test(tx.total_fees ?? ''),
    'Initialization emulation did not match fresh Testnet state');
  const expected = core.beginCell().storeBit(true).storeUint(1,32).storeInt(wallet.walletId,32)
    .storeBuffer(Buffer.from(wallet.publicKey,'hex')).storeBit(false).endCell();
  exact(Buffer.from(tx.account_state_after.data_hash ?? '','base64').toString('hex')===hash(expected),
    'Unexpected initialized V5R1 state');
  const fee = BigInt(tx.total_fees);
  exact(balance-BigInt(tx.account_state_after.balance)===fee && fee<balance && fee<=BigInt(ownerPolicyCeilingNano),
    'Initialization fee mismatch or above policy ceiling');
  const quote = {network:'-3',operator:wallet.operator,publicKey:wallet.publicKey,walletId:wallet.walletId,
    stateInitHash:unsigned.stateInitHash,expectedDataHash:hash(expected),seqno:0,expectedSeqno:1,validUntil:expiry,
    outgoingMessages:0,balanceNano:String(balance),modeledFeeNano:String(fee),ownerPolicyCeilingNano,
    accountHash:included.proof.accountHash,unsignedBodyHash:unsigned.bodyHash};
  return {...quote,fingerprint:digest(quote),financialSigningEnabled:false,broadcastingEnabled:false,hardFeeCapEnforced:false};
}
