'use strict';

const roles = ['minter', 'curve', 'guard', 'migration', 'binding', 'locker'];

function stateInitMismatches(candidate, core) {
  const accounts = candidate.dependentAccounts ?? {};
  return [...new Set([...roles, ...Object.keys(accounts)])].flatMap(role => {
    const account = accounts[role];
    if (!roles.includes(role) || !Object.hasOwn(accounts, role)) return [role];
    try {
      const slice = core.Cell.fromBase64(account.stateInit).beginParse();
      const init = core.loadStateInit(slice);
      slice.endParse();
      const address = core.Address.parseFriendly(account.testnet);
      if (init.code?.hash().toString('hex') === account.codeHash &&
          init.data?.hash().toString('hex') === account.dataHash &&
          address.isTestOnly && address.address.workChain === 0 &&
          address.address.toRawString() === account.raw &&
          core.contractAddress(0, init).equals(address.address)) return [];
    } catch {
      // Invalid serialization or address is also an identity mismatch.
    }
    return [role];
  });
}

function assertCandidateStateInit(candidate, core) {
  const mismatches = stateInitMismatches(candidate, core);
  if (mismatches.length) {
    throw Error('Candidate StateInit identity mismatch: ' + mismatches.join(', '));
  }
}

module.exports = {stateInitMismatches, assertCandidateStateInit};
