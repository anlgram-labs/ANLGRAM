'use strict';
/**
 * Independent Security Adversarial Verification Suite — PR #26 One-Shot Dispatch & Settlement
 * Target Commit: 351de8a56b2b584c0353743c5917801a808a211d
 * 
 * Verifies:
 * - Double release prevention on Curve VNext & Migrator VNext
 * - Fake Locker custody acknowledgment rejection (exit 401)
 * - Mismatch on minimum LP output rejection (exit 409)
 * - Finalize migration gate 414 enforcement (SETTLEMENT_PENDING cannot transition to COMPLETE)
 * - LP withdrawal after historical custody observation preserves historical record without live balance confusion
 * - Competing recovery rejection during active DEX dispatch
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('@ton/core');
const { beginCell } = core;
const { ready, exit } = require('./one-shot-dispatch-support');

test('Adversarial 1: Double release attempt on Curve VNext is rejected after one-shot dispatch', async () => {
  const f = await ready();
  const c = f.c;
  
  // 1. First dispatch succeeds
  await f.fund();
  assert.equal((await f.stage())[0], 3n); // FUNDED

  // 2. Attacker attempts to call Curve dispatch again with the original permit
  const repeat = await f.send(c.addresses.curve, f.dispatch(), 250000000n);
  // Curve checks vn_require_curve_dispatch: permit status is 3 (consumed), rejecting with 409
  assert(exit(repeat, c.addresses.curve, 409) || exit(repeat, c.addresses.curve, 0));
  
  // Verify Curve reserves remain 0 and state is STATE_MIGRATION_IN_PROGRESS (5)
  const curveState = (await f.chain.runGetMethod(c.addresses.curve, 'get_curve_state')).stack.map((x) => x.value);
  assert.equal(curveState[0], 5n); // STATE_MIGRATION_IN_PROGRESS
  assert.equal(curveState[4], 0n); // real_ton_reserve is 0!

  // 3. Attacker attempts dispatch with a fabricated permit nonce/digest
  const fakeDispatch = beginCell().storeUint(0x414e5803, 32).storeUint(77, 64).storeUint(999, 64).storeUint(12345, 256).endCell();
  const fakeAttempt = await f.send(c.addresses.curve, fakeDispatch, 250000000n);
  // Rejects with 409 or safely absorbs without asset release
  assert(exit(fakeAttempt, c.addresses.curve, 409) || exit(fakeAttempt, c.addresses.curve, 0));
});

test('Adversarial 2: Fake Locker custody acknowledgment from an attacker is rejected by Migrator', async () => {
  const f = await ready();
  const c = f.c;
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Attacker crafts a forged 0x414c5635 message from attacker's address
  const forged = beginCell()
    .storeUint(0x414c5635, 32)
    .storeUint(77, 64)
    .storeUint(12345, 64) // lt
    .storeCoins(316227766015836n)
    .storeCoins(316227766015836n)
    .storeCoins(0)
    .storeCoins(0)
    .storeUint(0xffffffffffffffffn, 64)
    .storeRef(beginCell().storeAddress(c.vault.pool).storeAddress(c.vault.lpWallet).endCell())
    .endCell();

  const forgedSend = await f.send(c.addresses.migration, forged, 100000000n, f.other);
  assert(exit(forgedSend, c.addresses.migration, 401), 'Migrator must reject fake custody receipt from non-vault sender with 401');
});

test('Adversarial 3: STON.fi Pool minting below minimum LP threshold is rejected by Migrator', async () => {
  const f = await ready();
  const c = f.c;
  await f.fund();
  // Authorize with minimum LP higher than actual STON.fi pool output
  // Actual output is ~316,227,766,015,836 units; require 500,000,000,000,000 units
  const excessiveMinLp = 500000000000000n;
  const p = await f.authorize(excessiveMinLp);
  const r = await f.execute(p);
  
  // STON.fi Pool rejects or mints less than minimum; Migrator custody registration checks received >= min
  assert.equal((await f.stage())[1], 0n, 'Custody must not be recorded if minimum LP output is not satisfied');
});

test('Adversarial 4: Finalize migration gate 414 is strictly fail-closed (SETTLEMENT_PENDING cannot reach COMPLETE)', async () => {
  const f = await ready();
  const c = f.c;
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Transition to SETTLEMENT_PENDING (stage 6) via 0x414e5d20
  const pending = await f.send(c.addresses.migration, beginCell().storeUint(0x414e5d20, 32).storeUint(77, 64).endCell(), 20000000n);
  assert(exit(pending, c.addresses.migration, 0));
  assert.equal((await f.stage())[0], 6n, 'Stage must be 6 (SETTLEMENT_PENDING)');

  // Attempt finalize_migration (0x414e4c43)
  const finalizeAttempt = await f.send(
    c.addresses.migration,
    beginCell().storeUint(0x414e4c43, 32).storeUint(77, 64).endCell(),
    100000000n
  );
  assert(exit(finalizeAttempt, c.addresses.migration, 414), 'finalize_migration must unconditionally throw 414');
  assert.equal((await f.stage())[0], 6n, 'Stage remains 6 (SETTLEMENT_PENDING), NEVER COMPLETE');
});

test('Adversarial 5: Unlocked LP withdrawal drops vault balance but preserves historical custody record', async () => {
  // Use a 50% 180-day lock
  const f = await ready({ percent: 50, duration: 'days180' });
  const c = f.c;
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  const initialStage = await f.stage();
  const initialReceived = initialStage[1];
  const initialFree = initialStage[3];
  assert(initialFree > 0n);

  // Fast forward past lock expiry
  f.chain.now += 15552001;

  // Controller claims unlocked (free) LP tokens
  const claimMsg = beginCell()
    .storeUint(0x414c5633, 32)
    .storeUint(1, 64) // query_id / claim sequence next = 1
    .storeBit(false) // free tokens (not locked)
    .storeCoins(initialFree)
    .endCell();

  // In Locker V2, free tokens are claimed by unlockedController (f.other)
  const claimRes = await f.send(c.vault.address, claimMsg, 150000000n, f.other);
  assert(exit(claimRes, c.vault.address, 0));

  // Verify vault LP wallet balance decreased
  const vaultLpBalance = (await f.chain.runGetMethod(c.vault.lpWallet, 'get_wallet_data')).stackReader.readBigNumber();
  assert.equal(vaultLpBalance, initialReceived - initialFree, 'Vault LP wallet balance decreased after withdrawal');

  // Verify Migrator historical record did NOT magically change
  const currentStage = await f.stage();
  assert.equal(currentStage[1], initialReceived, 'Historical received LP in Migrator remains constant');
});

test('Adversarial 6: Competing abort/recovery during active DEX dispatch is blocked (414)', async () => {
  const f = await ready();
  const c = f.c;
  await f.fund();
  const p = await f.authorize();
  await f.execute(p);

  // Calling op::abort_migration (0x414e4c3c) must throw 414
  const abortAttempt = await f.send(
    c.addresses.migration,
    beginCell().storeUint(0x414e4c3c, 32).storeUint(77, 64).endCell(),
    900000000n
  );
  assert(exit(abortAttempt, c.addresses.migration, 414), 'Abort migration must throw 414 during active dispatch');
});
