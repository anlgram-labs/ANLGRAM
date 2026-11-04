import {Cell} from '@ton/core';
import {verifyAccountInclusion} from '../recovery/account-proof.mjs';
import {matchHistory} from '../recovery/receipts.mjs';
import {readBoundedJson, retryAfter} from '../testnet-rpc.mjs';
import {TESTNET_RPC} from '../config.mjs';

export const provenance = Object.freeze({
  network: '-3',
  accountProofProvider: 'TONAPI_TESTNET',
  masterchainReferenceProvider: 'TONCENTER_TESTNET',
  validatorFinalityVerified: false
});

export class ProjectProviderError extends Error {
  constructor(code, provider, status, retryMs, operation) {
    super('Testnet evidence provider unavailable');
    Object.assign(this,{code,provider,status,retryMs,operation});
  }
}

function providerStatus(status) {
  if (status===401 || status===403) return 'PROVIDER_AUTH_REJECTED';
  if (status===429) return 'PROVIDER_RATE_LIMITED';
  if (status>=500 && status<=599) return 'PROVIDER_UNAVAILABLE';
  return 'PROVIDER_REQUEST_REJECTED';
}

export function projectProviders(env, fetcher = fetch) {
  const centerKey = env.TONCENTER_TESTNET_API_KEY;
  const apiKey = env.TONAPI_TESTNET_API_KEY;
  if (!centerKey?.trim() || !apiKey?.trim()) {
    const error = new ProjectProviderError('PROVIDER_KEY_MISSING',!centerKey?.trim()?'TONCENTER_TESTNET':'TONAPI_TESTNET');
    error.message = 'Authenticated Testnet providers required';
    throw error;
  }

  async function request(url, options, operation) {
    const provider = url.startsWith('https://testnet.tonapi.io/') ? 'TONAPI_TESTNET' : 'TONCENTER_TESTNET';
    const signal = AbortSignal.timeout(8000);
    let response;
    try { response = await fetcher(url, {...options, redirect: 'error', signal}); }
    catch (error) {
      throw new ProjectProviderError(signal.aborted || error?.name==='TimeoutError' ?
        'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR',provider,undefined,undefined,operation);
    }
    if (!response.ok) throw new ProjectProviderError(providerStatus(response.status),provider,response.status,
      retryAfter(response.headers.get('Retry-After')),operation);
    try { return await readBoundedJson(response,2_097_152); }
    catch {
      throw new ProjectProviderError(signal.aborted?'PROVIDER_TIMEOUT':'PROVIDER_RESPONSE_INVALID',provider,response.status,undefined,operation);
    }
  }

  async function center(method, params) {
    const reply = await request(TESTNET_RPC + '/jsonRPC', {
      method: 'POST', headers: {'X-API-Key': centerKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 'project-evidence', method, params})
    },method);
    if (reply?.ok !== true || !reply.result) {
      const rpcCode = [401,403,429,500,502,503,504].includes(reply?.code) ? reply.code : undefined;
      const error = new ProjectProviderError(rpcCode ? providerStatus(rpcCode) : 'PROVIDER_RPC_REJECTED',
        'TONCENTER_TESTNET',undefined,undefined,method);
      error.rpcCode = rpcCode;
      throw error;
    }
    return reply.result;
  }

  function tonapi(path) {
    return request('https://testnet.tonapi.io/v2/' + path, {headers: {Authorization: 'Bearer ' + apiKey}},
      path.startsWith('liteserver/')?'getAccountProof':'getTransactionHistory');
  }

  async function reference(seqno) {
    if (!Number.isInteger(seqno) || seqno < 1 || seqno > 0xffffffff) throw new ProjectProviderError('PROVIDER_REFERENCE_INVALID','TONAPI_TESTNET');
    const result = await center('lookupBlock', {workchain: -1, shard: '-9223372036854775808', seqno});
    if (result.seqno !== seqno) throw new ProjectProviderError('PROVIDER_REFERENCE_INVALID','TONCENTER_TESTNET');
    return result;
  }

  async function account(address, at) {
    if (!/^0:[0-9a-f]{64}$/.test(address)) throw Error('Canonical basechain address required');
    const block = at && [-1, '8000000000000000', at.seqno, ...[at.root_hash, at.file_hash]
      .map(value => Buffer.from(value, 'base64').toString('hex'))].join(',');
    const raw = await tonapi('liteserver/get_account_state/' + address + (block ? '?target_block=' + encodeURIComponent('(' + block + ')') : ''));
    const independent = at || await reference(raw?.id?.seqno);
    try { return {raw, reference: independent, proof: verifyAccountInclusion(raw, independent, address)}; }
    catch { throw new ProjectProviderError('ACCOUNT_PROOF_REJECTED','TONAPI_TESTNET'); }
  }

  async function history(address, bundle) {
    const {proof} = bundle;
    const [primary, secondary] = await Promise.all([
      center('getTransactions', {address, limit: 16, archival: true, lt: proof.lastTransactionLt,
        hash: Buffer.from(proof.lastTransactionHash, 'hex').toString('base64')}),
      tonapi('blockchain/accounts/' + address + '/transactions?limit=16&sort_order=desc&before_lt=' + (BigInt(proof.lastTransactionLt) + 1n))
    ]);
    return {...bundle, primary, secondary: secondary.transactions,
      rows: matchHistory(primary, secondary.transactions, proof, address)};
  }

  async function observeAddress(address) {
    if (!/^0:[0-9a-f]{64}$/.test(address)) throw Error('Canonical basechain address required');
    return center('getAddressInformation', {address});
  }

  async function emulateUnsigned(requestBody) {
    return request('https://testnet.toncenter.com/api/emulate/v1/emulateTrace', {
      method:'POST', headers:{'X-API-Key':centerKey,'Content-Type':'application/json'}, body:JSON.stringify(requestBody)
    },'emulateTrace');
  }
  return {account, history, reference, observeAddress, emulateUnsigned};
}

export function includedAccountCell(bundle) {
  return Cell.fromBoc(Buffer.from(bundle.raw.state, 'hex'))[0];
}
