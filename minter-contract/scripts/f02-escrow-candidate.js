'use strict';
// Offline StateInit construction only. UNVERIFIED; never deploy or fund.
const stonfiWire = require('./stonfi-lp-v2-wire');
function build(core, {code, controller, master, walletCode, operationId}) {
  if (!core.Address.isAddress(controller) || !core.Address.isAddress(master) ||
      controller.workChain !== 0 || master.workChain !== 0) throw Error('basechain addresses required');
  if (!(code instanceof core.Cell) || !(walletCode instanceof core.Cell)) throw Error('code cells required');
  if (typeof operationId !== 'bigint' || operationId <= 0n || operationId > 0xffffffffffffffffn) throw Error('operation id required');
  const zero = core.beginCell().storeCoins(0).storeCoins(0).storeCoins(0).storeUint(0, 64).storeUint(0, 64).storeCoins(0).endCell();
  const cfg = core.beginCell().storeUint(operationId, 64)
    .storeRef(core.beginCell().storeAddress(controller).endCell())
    .storeRef(core.beginCell().storeAddress(master).storeRef(walletCode).endCell()).endCell();
  const history = core.beginCell().storeBit(false).storeBit(false).storeBit(false).endCell();
  const data = core.beginCell().storeUint(3, 8)
    .storeRef(cfg).storeRef(zero).storeRef(zero).storeRef(history).endCell();
  const init = {code, data};
  return {init, address: core.contractAddress(0, init), operationId, financialDeploymentAuthorized: false};
}
// Produces existing v2 wire messages for inspection only. The candidate escrow
// has no entrypoint that dispatches them. LP recipient semantics must be reviewed.
function prepareStonfiMessages(core, options) {
  return stonfiWire.build(core, {...options, owner: options.escrow});
}
function prepareStonfiRefund(core, options) {
  return stonfiWire.refund(core, options);
}
module.exports = {build, prepareStonfiMessages, prepareStonfiRefund};
