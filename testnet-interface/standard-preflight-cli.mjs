import {readFile} from 'node:fs/promises';
import {inspectStandardWallet,readStandardPreflight} from './projects/standard-supervisor.mjs';
import {projectProviders} from './projects/project-providers.mjs';
import {assertReviewedStandardOperator,assertReviewedStandardPreflightInput} from './projects/reviewed-standard-operator.mjs';

try {
  if (process.argv.length === 4 && process.argv[2] === '--inspect-wallet') {
    assertReviewedStandardOperator(process.argv[3]);
    const wallet = await inspectStandardWallet(process.argv[3],projectProviders(process.env));
    console.log(JSON.stringify({...wallet,financialSigningEnabled:false},null,2));
  } else {
    if (process.argv.length !== 3) throw Error('Supply one JSON preflight input file');
    const input=JSON.parse(await readFile(process.argv[2],'utf8'));
    assertReviewedStandardPreflightInput(input);
    const {manifest, quote, identity, simulation, destinationVerification} =
      await readStandardPreflight(input,projectProviders(process.env));
    console.log(JSON.stringify({network:manifest.network,operator:manifest.operator.address,minter:manifest.minter,
      walletCodeHash:manifest.walletCodeHash,quote,identity,simulation,destinationVerification,financialSigningEnabled:false},null,2));
  }
} catch (error) {
  // Do not print provider bodies, request options, credentials, or stack traces.
  const result = error.status ? {status:error.status,retryAfterMs:error.retryMs} : {status:'UNVERIFIED',
    ...(error.message==='UNREVIEWED_STANDARD_TESTNET_OPERATOR'?{code:error.message}:{})};
  console.error(JSON.stringify({...result,financialSigningEnabled:false}));
  process.exitCode = 1;
}
