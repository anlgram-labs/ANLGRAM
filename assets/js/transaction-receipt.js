(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AnlgramTransactionReceipt = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const validChain = chain => chain === '-3' || chain === '-239';
  function create(boc, wallet, chain, core) {
    if (!validChain(chain)) throw new Error('Unknown wallet network');
    const message = core.loadMessage(core.Cell.fromBase64(boc).beginParse());
    if (message.info.type !== 'external-in' || !message.info.dest.equals(core.Address.parse(wallet))) {
      throw new Error('Signed message does not target the connected wallet');
    }
    // TonAPI normalized external-message hash; never persist the signed BOC.
    const hash = core.beginCell().storeUint(2, 2).storeUint(0, 2)
      .storeAddress(message.info.dest).storeUint(0, 4).storeBit(false)
      .storeBit(true).storeRef(message.body).endCell().hash().toString('hex');
    return { hash, bodyHash: message.body.hash().toString('hex'), wallet: message.info.dest.toRawString(), chain };
  }
  async function lookup(submission, chain, fetcher, core) {
    const pending = { status: 'PENDING', scope: 'wallet_transaction_only' };
    if (!submission || !validChain(chain) || submission.chain !== chain ||
        !/^[a-f0-9]{64}$/.test(submission.hash) || !/^[a-f0-9]{64}$/.test(submission.bodyHash)) return pending;
    try {
      const response = await fetcher(`/blockchain/messages/${submission.hash}/transaction`);
      if (!response.ok) return pending;
      const tx = await response.json();
      const msg = tx.in_msg;
      if (tx.emulated === true || !/^[a-fA-F0-9]{64}$/.test(tx.hash || '') || !msg ||
          msg.msg_type !== 'ext_in_msg' || msg.source != null || !/^(?:[a-fA-F0-9]{2})+$/.test(msg.raw_body || '') ||
          !core.Address.parse(tx.account.address).equals(core.Address.parse(submission.wallet)) ||
          !core.Address.parse(msg.destination.address).equals(core.Address.parse(submission.wallet))) return pending;
      const body = core.Cell.fromBoc(Uint8Array.from(msg.raw_body.match(/../g), b => parseInt(b, 16)))[0];
      if (body.hash().toString('hex') !== submission.bodyHash) return pending;
      const normalized = core.beginCell().storeUint(2, 2).storeUint(0, 2)
        .storeAddress(core.Address.parse(msg.destination.address)).storeUint(0, 4)
        .storeBit(false).storeBit(true).storeRef(body).endCell().hash().toString('hex');
      if (normalized !== submission.hash) return pending;
      if (tx.aborted === true || tx.success === false || tx.compute_phase?.success === false || tx.action_phase?.success === false) {
        return { status: 'FAILED', scope: pending.scope, transactionHash: tx.hash };
      }
      if (tx.success !== true || tx.aborted !== false || tx.compute_phase?.skipped !== false ||
          tx.compute_phase?.success !== true || ![0, 1].includes(tx.compute_phase?.exit_code) ||
          tx.action_phase?.success !== true || tx.action_phase?.result_code !== 0 || tx.action_phase?.skipped_actions !== 0) return pending;
      // This proves wallet inclusion/execution only, not downstream delivery.
      return { status: 'INCLUDED', scope: pending.scope, transactionHash: tx.hash };
    } catch (_) { return pending; }
  }
  async function lookupDonation(submission, chain, fetcher, core, donation) {
    const pending = { status: 'PENDING', scope: 'creation_donation_only' };
    try {
      if (chain !== '-239' || !donation || donation.RECIPIENT_ADDRESS !== 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd' ||
          donation.DONATION_AMOUNT_NANO !== 20000000n) return pending;
      let root;
      const receipt = await lookup(submission, chain, async url => {
        const response = await fetcher(url);
        if (!response.ok) return response;
        root = await response.json();
        return { ok: true, json: async () => root };
      }, core);
      if (receipt.status !== 'INCLUDED') return pending;
      const recipient = core.Address.parse(donation.RECIPIENT_ADDRESS);
      const expected = core.Cell.fromBase64(donation.createMessage(core, chain).payload).hash().toString('hex');
      const matches = msg => msg?.msg_type === 'int_msg' && msg.bounced === false &&
        String(msg.value) === '20000000' && core.Address.parse(msg.source.address).equals(core.Address.parse(submission.wallet)) &&
        core.Address.parse(msg.destination.address).equals(recipient) &&
        core.Cell.fromBoc(BufferlessHex(msg.raw_body))[0].hash().toString('hex') === expected;
      const outgoing = (root.out_msgs || []).filter(matches);
      // More than one matching debit is an accounting error, never a confirmation.
      if (outgoing.length !== 1 || !/^[a-f0-9]{64}$/i.test(outgoing[0].hash || '')) return pending;
      const response = await fetcher(`/blockchain/messages/${outgoing[0].hash}/transaction`);
      if (!response.ok) return pending;
      const tx = await response.json();
      if (tx.emulated === true || tx.success !== true || tx.aborted !== false ||
          !/^[a-f0-9]{64}$/i.test(tx.hash || '') || !core.Address.parse(tx.account.address).equals(recipient) ||
          tx.in_msg?.hash?.toLowerCase() !== outgoing[0].hash.toLowerCase() || !matches(tx.in_msg) ||
          tx.compute_phase?.success !== true || tx.compute_phase?.skipped !== false ||
          ![0, 1].includes(tx.compute_phase?.exit_code) || tx.action_phase?.success === false ||
          (tx.action_phase && (tx.action_phase.result_code !== 0 || tx.action_phase.skipped_actions !== 0)) ||
          (tx.out_msgs || []).some(m => m.bounced === true)) return pending;
      return { status: 'INCLUDED', scope: pending.scope, transactionHash: tx.hash, amountNano: '20000000' };
    } catch (_) { return pending; }
  }
  function BufferlessHex(hex) {
    if (typeof hex !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(hex)) throw new Error('Invalid message body');
    return Uint8Array.from(hex.match(/../g), b => parseInt(b, 16));
  }
  return { create, lookup, lookupDonation };
});
