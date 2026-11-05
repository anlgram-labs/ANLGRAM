import vestingV2 from '../../minter-contract/build/anlgram-vesting-wallet-v2.compiled.json' with {type:'json'};
import standardVesting from '../../minter-contract/build/anlgram-vesting-wallet-standard-v2.compiled.json' with {type:'json'};
import standardSettlementWallet from '../../minter-contract/build/standard-jetton-settlement-wallet.compiled.json' with {type:'json'};
import standardV2 from '../../minter-contract/build/standard-jetton-v2.compiled.json' with {type:'json'};
import {Cell} from '@ton/core';
import wallet from '../../minter-contract/build/anlgram-settlement-wallet.compiled.json' with {type:'json'};
import minter from '../../minter-contract/build/anlgram-launchpad-jetton-minter.compiled.json' with {type:'json'};
import curve from '../../minter-contract/build/anlgram-bonding-curve.compiled.json' with {type:'json'};
import guard from '../../minter-contract/build/anlgram-lp-auth-guard.compiled.json' with {type:'json'};
import migrator from '../../minter-contract/build/anlgram-migration-router.compiled.json' with {type:'json'};
import locker from '../../minter-contract/build/anlgram-lp-locker-v2.compiled.json' with {type:'json'};
import binding from '../../minter-contract/build/anlgram-migration-v2-plan.compiled.json' with {type:'json'};
import vesting from '../../minter-contract/build/anlgram-vesting-wallet.compiled.json' with {type:'json'};
export const artifacts={'anlgram-settlement-wallet':wallet,'anlgram-launchpad-jetton-minter':minter,'anlgram-bonding-curve':curve,'anlgram-lp-auth-guard':guard,'anlgram-migration-router':migrator,'anlgram-lp-locker-v2':locker,'anlgram-migration-v2-plan':binding,'anlgram-vesting-wallet':vesting,'anlgram-vesting-wallet-v2':vestingV2};
export function code(name){const a=artifacts[name];if(!a)throw Error('Unsupported contract artifact');const c=Cell.fromBase64(a.codeBocBase64);if(![c.hash().toString('hex'),c.hash().toString('base64')].includes(a.codeCellHash||a.codeHash))throw Error('Contract artifact hash mismatch: '+name);return c;}

export const standardV2Artifacts=standardV2;
artifacts['anlgram-vesting-wallet-standard-v2']=standardVesting;
artifacts['standard-jetton-settlement-wallet']=standardSettlementWallet;
export const standardSettlementArtifacts={minter:standardV2.minter,wallet:{...standardSettlementWallet,codeHash:standardSettlementWallet.codeCellHash}};
export function standardV2Code(role){
 const artifact=standardV2[role],cell=Cell.fromBase64(artifact.codeBocBase64);
 if(cell.hash().toString('hex')!==artifact.codeHash)throw Error('Standard V2 artifact hash mismatch');
 return cell;
}
