import {readFile} from 'node:fs/promises';
import {readStandardPreflight} from './projects/standard-supervisor.mjs';
import {projectProviders} from './projects/project-providers.mjs';

try {
  if (process.argv.length !== 3) throw Error('Supply one JSON preflight input file');
  const {manifest, quote, identity, simulation, destinationVerification} =
    await readStandardPreflight(JSON.parse(await readFile(process.argv[2],'utf8')),projectProviders(process.env));
  console.log(JSON.stringify({network:manifest.network,operator:manifest.operator.address,minter:manifest.minter,
    quote,identity,simulation,destinationVerification,financialSigningEnabled:false},null,2));
} catch (error) {
  // Do not print provider bodies, request options, credentials, or stack traces.
  const result = error.status ? {status:error.status,retryAfterMs:error.retryMs} : {status:'UNVERIFIED'};
  console.error(JSON.stringify({...result,financialSigningEnabled:false}));
  process.exitCode = 1;
}
