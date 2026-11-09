'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Mission 2 Audit [F-01 HIGH]: anlgram-factory.fc sets owner_addr as Minter admin in StateInit then sends op::mint (21) from Factory, causing jetton-minter.fc exit code 73, and launchpad.js blocks execution', () => {
  const factoryFc = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-factory.fc'), 'utf8');
  const minterFc = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/jetton-minter.fc'), 'utf8');
  const launchpadJs = fs.readFileSync(path.join(__dirname, 'assets/js/launchpad.js'), 'utf8');

  // 1. Factory sets owner_address (owner_addr) as admin_address in build_jetton_state_init
  assert(factoryFc.includes('.store_slice(owner_address)'), 'Factory stores owner_address as Minter admin_address');
  assert(factoryFc.includes('cell state_init = build_jetton_state_init(owner_addr, metadata, minter_code, wallet_code);'), 'Factory builds state_init with owner_addr');
  // 2. Factory then sends op::mint (21) to the deployed Minter where sender_address = Factory (my_address())
  assert(factoryFc.includes('.store_uint(21, 32)           ;; op::mint (standard)'), 'Factory sends op::mint (21) to Minter');
  // 3. Standard Minter enforces equal_slices(sender_address, admin_address) with throw_unless(73)
  assert(minterFc.includes('throw_unless(73, equal_slices(sender_address, admin_address));'), 'Minter rejects op::mint from non-admin with exit 73');
  // 4. Factory taxes rate% of available = msg_value - const::factory_execution_gas() instead of fixed base execution fee
  assert(factoryFc.includes('int available = msg_value - const::factory_execution_gas();'), 'Factory computes fee over full msg_value minus factory_execution_gas');
  assert(factoryFc.includes('int platform_fee = muldiv(available, rate, 100);'), 'Factory takes rate% of excess gas attached');
  // 5. Verify launchpad.js fails closed and blocks Factory deployment
  assert(launchpadJs.includes('Factory creation requires verified donation routing and explicit production approval. No wallet request was sent.'), 'launchpad.js must block Factory deployment');
});

test('Mission 2 Audit [F-02 HIGH / Fail-Closed Gate]: STON.fi v2.2 Router & LPAccount completion/recovery gates fail closed with exit code 414', () => {
  const routerFc = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-migration-router-dispatch-v2.fc'), 'utf8');
  const recoveryFc = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/imports/migration-vnext-recovery.fc'), 'utf8');
  const dispatchCtrlFc = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/imports/migration-dispatch-control-v2.fc'), 'utf8');

  assert(routerFc.includes('if(op == op::finalize_migration)'), 'Router defines op::finalize_migration handler');
  assert(routerFc.includes('throw(414);'), 'Router throws exit 414 on finalize_migration');
  assert(recoveryFc.includes('throw(414);'), 'Recovery module throws exit 414');
  assert(dispatchCtrlFc.includes('throw(414);'), 'Dispatch control module throws exit 414');
});

test('Mission 2 Audit [Curve VNext Arithmetic & 300 TON Graduation]: dispatch-v2 requires full 800M inventory exhaustion (303,030,303,031 gross / 300,000,000,001 net nanoTON) and fixes 1-nanoTON fee inversion', () => {
  const dispatchV2 = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc'), 'utf8');

  // Verify exact arithmetic in FunC calculate_buy:
  // out = ((inventory + virtual_tokens) * net) / (x + net)
  const VIRTUAL_TON = 100000000000n; // 100 TON
  const VIRTUAL_TOKEN = 266666666666666666n; // 266,666,666.666666666 virtual tokens
  const INVENTORY = 800000000000000000n; // 800M tokens
  const MAX_NET = 300000000000n; // 300 TON

  // At 300,000,000,000 net nanoTON from 0 real_ton:
  const outAt300 = ((INVENTORY + VIRTUAL_TOKEN) * MAX_NET) / (VIRTUAL_TON + MAX_NET);
  assert.equal(INVENTORY - outAt300, 1n, 'At exactly 300 TON net, 1 atomic Jetton unit remains in inventory');

  // Exact required_x to exhaust all 800M units:
  const k = VIRTUAL_TON * (INVENTORY + VIRTUAL_TOKEN);
  const required_x = (k + VIRTUAL_TOKEN - 1n) / VIRTUAL_TOKEN;
  const netGrad = required_x - VIRTUAL_TON;
  assert.equal(netGrad, 300000000001n, 'Exhausting all 800M units requires 300,000,000,001 net nanoTON');

  const consumedGrad = ((netGrad - 1n) * 10000n) / 9900n + 1n;
  assert.equal(consumedGrad, 303030303031n, 'First exact gross that yields 300,000,000,001 net is 303,030,303,031 nanoTON');

  // Confirm dispatch-v2 graduates only when out == inventory and uses ((net - 1) * BPS_DENOMINATOR) / (BPS_DENOMINATOR - 100) + 1
  assert(dispatchV2.includes('int graduated = (out == inventory);'), 'dispatch-v2 must graduate only when out == inventory');
  assert(dispatchV2.includes('int consumed = ((net - 1) * BPS_DENOMINATOR) / (BPS_DENOMINATOR - 100) + 1;'), 'dispatch-v2 must invert gross - floor(gross * 100 / 10000) accurately');
});

test('Mission 2 Audit [F-03 MEDIUM]: anlgram-bonding-curve-dispatch-v2.fc valid sell payout asymmetry vs buy path Action Phase 37 protection', () => {
  const dispatchV2 = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-bonding-curve-dispatch-v2.fc'), 'utf8');

  // Buy path has raw_reserve(..., 16), mode 17 (1 + 16), mode 144 (128 + 16), and buy_forward_fee/buy_compute_fee precheck:
  assert(dispatchV2.includes('raw_reserve(my_balance - msg_value + actual_net_ton + actual_fee_ton, 16);'));
  assert(dispatchV2.includes('send_jettons_with_id(curve_jetton_wallet, sender_address, tokens_out, my_address(), 1, 35000000,cur_lt(),17);'));
  assert(dispatchV2.includes('35000000 + 3 * forward_bound + buy_compute_fee(buy_gas_consumed(),0) < GAS_OVERHEAD_TRADE'));

  // Valid sell path (lines ~810-819) sends net_ton_out with mode 1 without mode +16 or raw_reserve:
  assert(dispatchV2.includes(';; Send Net TON Payout to Seller'));
  assert(dispatchV2.includes('send_raw_message(p_msg.end_cell(), 1);'), 'Documented Finding F-03: sell payout uses mode 1 without mode +16 or raw_reserve');
});

test('Mission 2 Audit [F-04 MEDIUM]: anlgram-lp-locker-v2.fc withdrawal sets pending + amount before external LP wallet transfer without downstream bounce recovery', () => {
  const lockerV2 = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-lp-locker-v2.fc'), 'utf8');
  assert(lockerV2.includes('save_vault(cfg,account(received,locked,free,pending + amount,want_locked,q,next + 1,unlock),seen,requests);'), 'LP Locker V2 increments pending by amount before sending 0x0f8a7ea5');
  assert(lockerV2.includes(';; Standard excess is only operational TON, never delivery evidence.'));
  assert(lockerV2.includes('if(op == 0xd53276db) { throw_unless(401,equal_slices(sender,wallet));'));
});

test('Mission 2 Audit [F-05 MEDIUM]: unpatched sibling anlgram-bonding-curve-vnext.fc retains pre-PR#38 graduation & fee inversion logic (must not be used for new deployments)', () => {
  const vnextOld = fs.readFileSync(path.join(__dirname, 'minter-contract/contracts/anlgram-bonding-curve-vnext.fc'), 'utf8');
  assert(vnextOld.includes('if (real_ton_reserve + actual_net_ton >= graduation_threshold_ton) {'), 'Documented Finding F-05: legacy vnext file still has premature graduation threshold check');
  assert(vnextOld.includes('int actualGross = (actual_net_ton * BPS_DENOMINATOR + netMultiplier - 1) / netMultiplier;'), 'Documented Finding F-05: legacy vnext file still has pre-PR#38 gross inversion formula');
});

test('Mission 2 Audit [Manifest & Identity Verification]: docs/launchpad/testnet-v5-candidate.json and testnet-v5-release-candidate.json keep broadcastEnabled: false and readyForSigning: false', () => {
  const v5Candidate = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/launchpad/testnet-v5-candidate.json'), 'utf8'));
  assert.equal(v5Candidate.broadcastEnabled, false, 'testnet-v5-candidate.json must keep broadcastEnabled: false');
  assert.equal(v5Candidate.readyForSigning, false, 'testnet-v5-candidate.json must keep readyForSigning: false');
  assert.equal(v5Candidate.signingEnvironment.financialActionsEnabled, false, 'financialActionsEnabled must be false');
  for (const [role, c] of Object.entries(v5Candidate.dependentAccounts)) {
    assert(c.codeHash && c.codeHash.length === 64, `${role} must have 64-hex codeHash`);
    assert(c.dataHash && c.dataHash.length === 64, `${role} must have 64-hex dataHash`);
  }

  const v5ReleaseCandidate = JSON.parse(fs.readFileSync(path.join(__dirname, 'docs/launchpad/testnet-v5-release-candidate.json'), 'utf8'));
  assert.equal(v5ReleaseCandidate.broadcastEnabled, false, 'testnet-v5-release-candidate.json must remain non-broadcastable');
  assert.equal(v5ReleaseCandidate.readyForSigning, false, 'testnet-v5-release-candidate.json must keep readyForSigning: false');
});
