import {Address} from '@ton/core';
import {WalletContractV5R1} from '@ton/ton';

// Public identity cross-checked against the separately reviewed PR #34 genesis.
export const reviewedStandardOperator = '0:9eb502b657204b2f6701f469b0edfc87b9d00cc025fbe7e329b343569a4e5f08';
export const reviewedStandardPublicKey = '194f6f9fb1779cf2120e9cab41c4ff71d75fe08d4a139f86c73eae89cc3d7217';

export function assertReviewedStandardOperator(address, publicKey = reviewedStandardPublicKey) {
  if(typeof address!=='string'||publicKey!==reviewedStandardPublicKey)throw Error('UNREVIEWED_STANDARD_TESTNET_OPERATOR');
  let parsed;
  try {
    parsed = /^0:[a-f0-9]{64}$/.test(address)
      ? {address: Address.parseRaw(address),isTestOnly:true} : Address.parseFriendly(address);
  } catch { throw Error('UNREVIEWED_STANDARD_TESTNET_OPERATOR'); }
  if (!parsed.isTestOnly || parsed.address.toRawString() !== reviewedStandardOperator) throw Error('UNREVIEWED_STANDARD_TESTNET_OPERATOR');
  const wallet=WalletContractV5R1.create({publicKey:Buffer.from(publicKey,'hex'),
    walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
  if (!wallet.address.equals(parsed.address) || wallet.init.data.beginParse().skip(33).loadInt(32)!==2147483645) {
    throw Error('UNREVIEWED_STANDARD_TESTNET_OPERATOR');
  }
  return wallet;
}

export function assertReviewedStandardPreflightInput(input) {
  if(!input||Object.keys(input).some(key=>!['draft','publicKey','ownerPolicyCeilingNano','validUntil'].includes(key))||
     input.draft?.network!=='-3'||input.draft.mode!=='standard'||typeof input.publicKey!=='string') {
    throw Error('UNREVIEWED_STANDARD_TESTNET_OPERATOR');
  }
  return assertReviewedStandardOperator(input.draft.metadata?.creator,input.publicKey);
}
