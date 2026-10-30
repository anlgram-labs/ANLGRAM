'use strict';

/** Read-only STON.fi v2 custody verification. No RPC, signing or config defaults.
 * The adapter must return all accounts/getters anchored to the SAME immutable
 * snapshot and network. Pins must come from independently reviewed deployment
 * evidence, never from the accounts currently being verified.
 * Missing evidence fails closed. This is not a contract-level authentication fix.
 */
async function verifyLpCustody(pins, reader, core = require('@ton/core')) {
  const pending = reason => ({ status: 'UNVERIFIED', reason });
  try {
    if (!pins || !['-3', '-239'].includes(pins.chain) || reader.chain !== pins.chain ||
        typeof reader.snapshotId !== 'string' || !reader.snapshotId) return pending('Missing anchored network/snapshot');
    const snapshot = reader.snapshotId;
    const roles = ['router', 'pool', 'lpWallet', 'locker', 'tokenMaster', 'ptonMaster', 'curve', 'migrationRouter'];
    const address = {};
    for (const role of roles) {
      if (!/^[a-f0-9]{64}$/.test(pins[role]?.codeHash || '')) return pending('Missing independently trusted ' + role + ' code hash');
      address[role] = core.Address.parse(pins[role].address);
    }
    if (new Set(roles.map(r => address[r].toRawString())).size !== roles.length) return pending('Colliding contract roles');
    const min = typeof pins.minimumLp === 'string' && /^\d+$/.test(pins.minimumLp) ? BigInt(pins.minimumLp) : 0n;
    if (min <= 0n) return pending('Missing independently reconciled minimum LP amount');
    const anchored = data => {
      if (reader.snapshotId !== snapshot || reader.chain !== pins.chain || data?.snapshotId !== snapshot) throw new Error('Mixed snapshot/network evidence');
      return data;
    };
    const account = async role => {
      const a = anchored(await reader.getAccount(address[role]));
      if (a.active !== true || !a.code || a.code.hash().toString('hex') !== pins[role].codeHash) throw new Error('Code/status mismatch: ' + role);
    };
    for (const role of roles) await account(role);
    const get = async (who, method, args = []) => {
      const data = anchored(await reader.runGetMethod(who, method, args));
      if (data.exitCode !== 0 || !Array.isArray(data.stack)) throw new Error('Getter failed: ' + method);
      return data.stack;
    };
    const addrItem = item => { if (!['cell', 'slice'].includes(item?.type)) throw new Error('Expected address slice'); return item.cell.beginParse().loadAddress(); };
    const integer = item => { if (item?.type !== 'int' || typeof item.value !== 'bigint') throw new Error('Expected exact integer'); return item.value; };
    const arg = a => ({ type: 'slice', cell: core.beginCell().storeAddress(a).endCell() });
    const tokenWallet = addrItem((await get(address.tokenMaster, 'get_wallet_address', [arg(address.router)]))[0]);
    const ptonWallet = addrItem((await get(address.ptonMaster, 'get_wallet_address', [arg(address.router)]))[0]);
    if (tokenWallet.equals(ptonWallet)) throw new Error('Token pair is not distinct');
    const derivedPool = addrItem((await get(address.router, 'get_pool_address', [arg(tokenWallet), arg(ptonWallet)]))[0]);
    if (!derivedPool.equals(address.pool)) throw new Error('Pool is not derived by trusted router');
    const pool = await get(address.pool, 'get_pool_data');
    if (!addrItem(pool[1]).equals(address.router)) throw new Error('Pool router mismatch');
    const pair = [addrItem(pool[5]).toRawString(), addrItem(pool[6]).toRawString()].sort();
    if (pair.join('|') !== [tokenWallet.toRawString(), ptonWallet.toRawString()].sort().join('|')) throw new Error('Pool token pair mismatch');
    const derivedLp = addrItem((await get(address.pool, 'get_wallet_address', [arg(address.locker)]))[0]);
    if (!derivedLp.equals(address.lpWallet)) throw new Error('LP wallet is not derived for locker');
    const jetton = await get(address.pool, 'get_jetton_data');
    if (integer(jetton[0]) !== integer(pool[2]) || !addrItem(jetton[2]).equals(address.router)) throw new Error('LP supply/admin mismatch');
    if (jetton[4]?.type !== 'cell' || jetton[4].cell.hash().toString('hex') !== pins.lpWallet.codeHash) throw new Error('LP wallet code differs from pool code');
    const wallet = await get(address.lpWallet, 'get_wallet_data');
    const balance = integer(wallet[0]);
    if (integer(pool[2]) < balance || integer(pool[3]) <= 0n || integer(pool[4]) <= 0n) throw new Error('Pool supply/reserves inconsistent with custody');
    if (!addrItem(wallet[1]).equals(address.locker) || !addrItem(wallet[2]).equals(address.pool)) throw new Error('LP ownership/master mismatch');
    if (wallet[3]?.type !== 'cell' || wallet[3].cell.hash().toString('hex') !== pins.lpWallet.codeHash) throw new Error('Embedded LP wallet code mismatch');
    const lock = await get(address.locker, 'get_lock_data');
    const recorded = integer(lock[2]);
    if (integer(lock[0]) !== 1n || integer(lock[1]) !== 0xffffffffffffffffn || integer(lock[3]) !== 1n ||
        !addrItem(lock[4]).equals(address.pool) || !addrItem(lock[5]).equals(address.curve) ||
        !addrItem(lock[6]).equals(address.lpWallet) || !addrItem(lock[7]).equals(address.migrationRouter)) throw new Error('Permanent locker binding mismatch');
    if (recorded < min || balance < recorded) throw new Error('LP custody does not cover recorded lock/minimum');
    // Recheck anchored code/state identity after the getter sequence.
    for (const role of roles) await account(role);
    return { status: 'VERIFIED_SNAPSHOT', scope: 'read_only_lp_custody', snapshotId: snapshot,
      chain: pins.chain, balance: balance.toString(), recorded: recorded.toString(), minimum: min.toString() };
  } catch (error) { return pending(error.message || 'Incomplete evidence'); }
}
module.exports = { verifyLpCustody };
