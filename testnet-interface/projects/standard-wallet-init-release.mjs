import {beginCell,storeStateInit} from '@ton/core';
import {initializationWallet} from './standard-wallet-initialization.mjs';

export const releaseStateInitHash = '9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08';
export const releaseOperator = '0:'+releaseStateInitHash;
export const releaseFeeCeilingNano = '70000000';

export function assertWalletInitRelease(wallet,ceiling) {
  const contract = initializationWallet(wallet);
  if (contract.address.toRawString() !== releaseOperator ||
    beginCell().store(storeStateInit(contract.init)).endCell().hash().toString('hex') !== releaseStateInitHash ||
    ceiling !== releaseFeeCeilingNano) throw Error('Wallet initialization release scope rejected');
}

export function assertWalletInitReleaseQuote({wallet,quote}) {
  assertWalletInitRelease(wallet,quote?.ownerPolicyCeilingNano);
  if (quote.network !== '-3' || quote.operator !== releaseOperator ||
    quote.publicKey !== wallet.publicKey || quote.walletId !== 2147483645 ||
    quote.stateInitHash !== releaseStateInitHash || quote.seqno !== 0 ||
    quote.expectedSeqno !== 1 || quote.outgoingMessages !== 0 ||
    typeof quote.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(quote.fingerprint)) throw Error('Wallet initialization release quote rejected');
}
