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

export function projectProviders(env, fetcher = fetch) {
  const centerKey = env.TONCENTER_TESTNET_API_KEY;
  const apiKey = env.TONAPI_TESTNET_API_KEY;
  if (!centerKey || !apiKey) throw Error('Authenticated Testnet providers required');

  async function request(url, options) {
    const response = await fetcher(url, {...options, redirect: 'error', signal: AbortSignal.timeout(8000)});
    if (!response.ok) {
      const error = Error('Testnet evidence provider unavailable');
      error.status = response.status;
      error.retryMs = retryAfter(response.headers.get('Retry-After'));
      throw error;
    }
    return readBoundedJson(response, 2_097_152);
  }

  async function center(method, params) {
    const reply = await request(TESTNET_RPC + '/jsonRPC', {
      method: 'POST', headers: {'X-API-Key': centerKey, 'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 'project-evidence', method, params})
    });
    if (!reply.ok || !reply.result) throw Error('Testnet RPC read failed');
    return reply.result;
  }

  function tonapi(path) {
    return request('https://testnet.tonapi.io/v2/' + path, {headers: {Authorization: 'Bearer ' + apiKey}});
  }

  async function reference(seqno) {
    if (!Number.isInteger(seqno) || seqno < 1 || seqno > 0xffffffff) throw Error('Invalid masterchain seqno');
    const result = await center('lookupBlock', {workchain: -1, shard: '-9223372036854775808', seqno});
    if (result.seqno !== seqno) throw Error('Wrong masterchain reference');
    return result;
  }

  async function account(address, at) {
    if (!/^0:[0-9a-f]{64}$/.test(address)) throw Error('Canonical basechain address required');
    const block = at && [-1, '8000000000000000', at.seqno, ...[at.root_hash, at.file_hash]
      .map(value => Buffer.from(value, 'base64').toString('hex'))].join(',');
    const raw = await tonapi('liteserver/get_account_state/' + address + (block ? '?target_block=' + encodeURIComponent('(' + block + ')') : ''));
    const independent = at || await reference(raw.id?.seqno);
    return {raw, reference: independent, proof: verifyAccountInclusion(raw, independent, address)};
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
    });
  }
  return {account, history, reference, observeAddress, emulateUnsigned};
}

export function includedAccountCell(bundle) {
  return Cell.fromBoc(Buffer.from(bundle.raw.state, 'hex'))[0];
}
