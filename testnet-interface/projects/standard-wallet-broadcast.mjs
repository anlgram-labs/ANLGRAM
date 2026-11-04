import * as core from '@ton/core';
import {createHash} from 'node:crypto';
import {open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildWalletInitialization,initializationWallet,prepareWalletInitialization} from './standard-wallet-initialization.mjs';
import {includedActiveState} from './standard-registration.mjs';
import {TESTNET_RPC} from '../config.mjs';

const unsignedBits = 4*32+2; // Opcode, wallet ID, deadline, seqno and two empty action flags.
const now = () => Math.floor(Date.now()/1000);
const hex = cell => cell.hash().toString('hex');
const initHash = init => hex(core.beginCell().store(core.storeStateInit(init)).endCell());
const requireExact = (condition,message) => { if (!condition) throw Error(message); };
const fields = ['network','operator','publicKey','walletId','stateInitHash','expectedDataHash','seqno','expectedSeqno',
  'validUntil','outgoingMessages','balanceNano','modeledFeeNano','ownerPolicyCeilingNano','accountHash','unsignedBodyHash'];
const hashField = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const walletBroadcastEnabled = false;

export async function validateSignedInitialization({wallet,quote}, signed) {
  const contract = initializationWallet(wallet);
  const canonical = Object.fromEntries(fields.map(key=>[key,quote[key]]));
  const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const expectedData = core.beginCell().storeBit(true).storeUint(1,32).storeInt(wallet.walletId,32)
    .storeBuffer(Buffer.from(wallet.publicKey,'hex')).storeBit(false).endCell();
  requireExact(quote.fingerprint === fingerprint && signed?.fingerprint === fingerprint && signed.status === 'SIGNED_NOT_BROADCAST' &&
    quote.network === '-3' && quote.operator === wallet.operator && quote.publicKey === wallet.publicKey &&
    quote.walletId === wallet.walletId && quote.seqno === 0 && quote.expectedSeqno === 1 && quote.outgoingMessages === 0 &&
    Number.isSafeInteger(quote.validUntil) && quote.validUntil > 0 && quote.validUntil <= 0xffffffff &&
    quote.stateInitHash === initHash(contract.init) && quote.expectedDataHash === hex(expectedData) &&
    hashField(quote.accountHash) && hashField(quote.unsignedBodyHash) &&
    [quote.balanceNano,quote.modeledFeeNano,quote.ownerPolicyCeilingNano].every(value=>typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)) &&
    BigInt(quote.modeledFeeNano) < BigInt(quote.balanceNano) &&
    BigInt(quote.modeledFeeNano) <= BigInt(quote.ownerPolicyCeilingNano),'Invalid initialization quote');

  requireExact(typeof signed.boc === 'string' && signed.boc.length <= 32768 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(signed.boc),'Invalid signed BOC');
  const cells = core.Cell.fromBoc(Buffer.from(signed.boc,'base64'));
  requireExact(cells.length===1 && !cells[0].isExotic && hex(cells[0])===signed.messageHash,'Wrong signed message hash');
  const s = cells[0].beginParse(), message = core.loadMessage(s);
  requireExact(message.info.type==='external-in' && !message.info.src && message.info.importFee===0n &&
    message.info.dest.equals(contract.address) && message.init && initHash(message.init)===quote.stateInitHash &&
    message.body.bits.length===unsignedBits+512 && message.body.refs.length===0,'Wrong external initialization envelope');
  const body = message.body.beginParse(), bits = body.loadBits(unsignedBits), signature = body.loadBuffer(64);
  body.endParse();
  const unsigned = core.beginCell().storeBits(bits).endCell();
  requireExact(core.domainSignVerify({data:unsigned.hash(),signature,publicKey:contract.publicKey}),'Invalid V5R1 signature');
  const [expected, emulator] = await Promise.all([
    buildWalletInitialization(wallet,quote.validUntil,async()=>signature,quote.validUntil-1),
    buildWalletInitialization(wallet,quote.validUntil,async()=>Buffer.alloc(64),quote.validUntil-1)
  ]);
  requireExact(expected.messageHash===signed.messageHash && emulator.bodyHash===quote.unsignedBodyHash,
    'Signed message does not match approved initialization');
  return {wallet,quote,boc:signed.boc,messageHash:signed.messageHash,bodyHash:hex(message.body)};
}

const markerPaths = (directory,operator) => ({
  signing:join(directory,operator.slice(2)+'.init-pending'),
  broadcast:join(directory,operator.slice(2)+'.init-broadcast')
});

async function reserve(directory, operation, clock) {
  const paths = markerPaths(directory,operation.wallet.operator);
  requireExact(await readFile(paths.signing,'utf8') === operation.quote.fingerprint,'Missing matching signer marker');
  requireExact(clock()<operation.quote.validUntil,'Initialization expired');
  const marker = await open(paths.broadcast,'wx',0o600);
  try {
    await marker.writeFile(JSON.stringify({status:'UNKNOWN',fingerprint:operation.quote.fingerprint,
      messageHash:operation.messageHash,reservedAt:clock()}));
    await marker.sync();
  } finally { await marker.close(); }
}

async function attemptInitialization({prepared,signed,directory,providers,confirm,apiKey},fetcher,clock,endpoint) {
  const operation = await validateSignedInitialization(prepared,signed);
  requireExact(typeof apiKey === 'string' && apiKey.length>0,'Testnet broadcast credential required');
  requireExact(clock()<operation.quote.validUntil && await confirm(operation)===true,'Initialization approval required');
  const quote = await prepareWalletInitialization({wallet:operation.wallet,validUntil:operation.quote.validUntil,
    ownerPolicyCeilingNano:operation.quote.ownerPolicyCeilingNano},providers,clock);
  requireExact(quote.fingerprint===operation.quote.fingerprint,'Initialization preflight changed');
  await reserve(directory,operation,clock);
  if (clock()<operation.quote.validUntil) {
    try {
      await fetcher(endpoint,{method:'POST',redirect:'manual',
        headers:{'X-API-Key':apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id:'standard-wallet-init',method:'sendBoc',params:{boc:operation.boc}}),
        signal:AbortSignal.timeout(Math.max(1,Math.min(5000,(operation.quote.validUntil-clock())*1000)))});
    } catch { /* Timeout or transport failure consumes the attempt. */ }
  }
  return {status:'UNKNOWN',messageHash:operation.messageHash};
}

export function exerciseInitializationBroadcast(input,fixtureFetch,clock=now) {
  return attemptInitialization(input,fixtureFetch,clock,'https://toncenter.invalid/api/v2/jsonRPC');
}

export function broadcastInitialization(input) {
  requireExact(walletBroadcastEnabled,'Real wallet initialization broadcast is hard-disabled');
  return attemptInitialization(input,fetch,now,TESTNET_RPC+'/jsonRPC');
}

export async function reconcileInitialization({prepared,signed,directory,providers},clock=now) {
  const operation = await validateSignedInitialization(prepared,signed);
  const paths = markerPaths(directory,operation.wallet.operator);
  const unknown = {status:'UNKNOWN',messageHash:operation.messageHash,validatorFinalityVerified:false};
  try {
    const marker = JSON.parse(await readFile(paths.broadcast,'utf8'));
    requireExact(marker.status==='UNKNOWN' && marker.fingerprint===operation.quote.fingerprint &&
      marker.messageHash===operation.messageHash && Number.isSafeInteger(marker.reservedAt) &&
      marker.reservedAt<operation.quote.validUntil,'Missing exact broadcast reservation');
    const bundle = await providers.account(operation.wallet.operator);
    const {state} = includedActiveState(bundle,operation.wallet.walletCodeHash);
    requireExact(hex(state.data)===operation.quote.expectedDataHash && Math.abs(clock()-bundle.proof.chainTime)<=15,
      'Current included wallet state differs');
    const {rows} = await providers.history(operation.wallet.operator,bundle);
    const row = rows[0], tx = row.tx, d = tx.description, message = tx.inMessage;
    requireExact(row.hash===bundle.proof.lastTransactionHash && String(tx.lt)===bundle.proof.lastTransactionLt &&
      tx.oldStatus==='uninitialized' && tx.endStatus==='active' &&
      tx.now>=marker.reservedAt && tx.now<operation.quote.validUntil &&
      tx.stateUpdate.oldHash.toString('hex')===operation.quote.accountHash &&
      tx.stateUpdate.newHash.toString('hex')===bundle.proof.accountHash &&
      d.type==='generic' && !d.aborted && d.computePhase.type==='vm' && d.computePhase.success && d.computePhase.exitCode===0 &&
      (!d.actionPhase || (d.actionPhase.success && d.actionPhase.resultCode===0)) && tx.outMessages.size===0 &&
      message?.info.type==='external-in' && !message.info.src && message.info.dest.toRawString()===operation.wallet.operator &&
      message.init && initHash(message.init)===operation.quote.stateInitHash && hex(message.body)===operation.bodyHash &&
      hex(core.beginCell().store(core.storeMessage(message)).endCell())===operation.messageHash,
      'Exact initialization receipt unavailable');
    return {...unknown,status:'INCLUDED_FINALITY_UNVERIFIED',transactionHash:row.hash,logicalTime:String(tx.lt),
      actualFeesNano:String(tx.totalFees.coins),abovePolicyCeiling:tx.totalFees.coins>BigInt(operation.quote.ownerPolicyCeilingNano),
      reference:bundle.reference};
  } catch { return unknown; }
}
