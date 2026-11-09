import {mnemonicToWalletKey, mnemonicValidate} from '@ton/crypto';
import {WalletContractV5R1} from '@ton/ton';
import {createDraft} from '../wizard/model.mjs';
import {prepareStandardTestnetRelease} from './standard-testnet-release.mjs';

export async function recoverStandardPublicWallet(words) {
  if (!Array.isArray(words) || words.length !== 24 || !await mnemonicValidate(words)) {
    throw Error('Invalid TON recovery backup');
  }
  const key = await mnemonicToWalletKey(words);
  try {
    const wallet = WalletContractV5R1.create({publicKey:key.publicKey,
      walletId:{networkGlobalId:-3,context:{workchain:0,walletVersion:'v5r1',subwalletNumber:0}}});
    const data = wallet.init.data.beginParse();
    if (!data.loadBit() || data.loadUint(32) !== 0) throw Error('Unexpected V5R1 genesis');
    const walletId = data.loadInt(32), publicKey = key.publicKey.toString('hex');
    if (walletId !== 2147483645 || !data.loadBuffer(32).equals(key.publicKey) || data.loadBit()) {
      throw Error('Unexpected V5R1 wallet identity');
    }
    data.endParse();
    return {network:'-3',walletVersion:'v5r1',workchain:0,subwalletNumber:0,walletId,publicKey,
      address:wallet.address.toString({testOnly:true,bounceable:false}),operator:wallet.address.toRawString(),
      walletCodeHash:wallet.init.code.hash().toString('hex')};
  } finally {
    key.secretKey.fill(0);
  }
}

export async function standardWalletPublicConfiguration(wallet, draftId) {
  const draft = createDraft(draftId);
  draft.metadata.creator = wallet.operator;
  const preview = structuredClone(draft);
  Object.assign(preview.metadata,{name:'Standard V2 compatibility check',symbol:'STDV2'});
  const manifest = await prepareStandardTestnetRelease(preview,wallet.publicKey);
  if (manifest.operator.address !== wallet.operator || manifest.operator.codeHash !== wallet.walletCodeHash ||
    manifest.operator.walletId !== wallet.walletId) throw Error('Standard V2 manifest mismatch');
  return {schema:1,wallet,preflight:{draft,publicKey:wallet.publicKey,ownerPolicyCeilingNano:null},
    manifestCompatibility:'OFFLINE_IDENTITY_VERIFIED',chainState:'NOT_CHECKED',
    walletAppSignDataCompatibility:'NOT_CHECKED',financialSigningEnabled:false};
}
