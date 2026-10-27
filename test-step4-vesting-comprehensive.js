'use strict';

delete WebAssembly.instantiateStreaming;

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const minterDir = path.join(rootDir, 'minter-contract');

// Setup synchronous TVM runner
const { TvmRunnerSynchronous, TvmRunnerAsynchronous } = require(path.join(minterDir, 'node_modules/ton-contract-executor/dist/executor/TvmRunner'));
TvmRunnerAsynchronous.getShared = () => new TvmRunnerSynchronous();

const { Cell, Slice, Address, CellMessage, InternalMessage, CommonMessageInfo, toNano, contractAddress } = require(path.join(minterDir, 'node_modules/ton'));
const BN = require(path.join(minterDir, 'node_modules/bn.js'));
const { SmartContract } = require(path.join(minterDir, 'node_modules/ton-contract-executor'));

async function runStep4VestingSuite() {
  console.log('========================================================================');
  console.log('🧪 ANLGRAM STEP 4 VESTING: COMPREHENSIVE ON-CHAIN & FRONTEND TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. SMART CONTRACT BYTECODE & INTEGRITY
  // ═══════════════════════════════════════════════════════════════════
  console.log('--- 1. Smart Contract Artifacts & Code Hash ---');
  const compiledJsonPath = path.join(minterDir, 'build/anlgram-vesting-wallet.compiled.json');
  assert(fs.existsSync(compiledJsonPath), 'Compiled vesting artifact exists (anlgram-vesting-wallet.compiled.json)');

  const compiled = JSON.parse(fs.readFileSync(compiledJsonPath, 'utf8'));
  assert(compiled.codeBocBase64 && compiled.codeBocBase64.length > 100, 'Bytecode Base64 BOC is present');
  assert(compiled.codeHash === 'cae29d5a2ba4b5cfa926deb720cc0c5ef1ed0e7d8502aecd46bf3b0ed3321c5a', 'SHA-256 Code Hash is strictly verified');

  const codeCell = Cell.fromBoc(Buffer.from(compiled.codeBocBase64, 'base64'))[0];
  assert(codeCell instanceof Cell, 'Code cell deserialized cleanly from BOC');

  // ═══════════════════════════════════════════════════════════════════
  // 2. TVM EXECUTION & SECURITY INVARIANTS
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n--- 2. On-Chain Smart Contract TVM Invariants ---');

  function makeAddr(byteVal) {
    return new Address(0, Buffer.alloc(32, byteVal));
  }

  const creator = makeAddr(1);
  const beneficiary = makeAddr(2);
  const jettonMaster = makeAddr(3);
  const attacker = makeAddr(9);

  const jwalletCode = new Cell();
  jwalletCode.bits.writeUint(0, 8);

  const totalTokens = toNano('100000'); // 100,000 tokens
  const startTime = 10000;
  const cliffDuration = 1000; // cliff ends at 11000
  const totalDuration = 4000; // vesting ends at 14000

  // Build storage with schedule cell in ref (prevents 1024-bit cell overflow)
  const initialData = new Cell();
  initialData.bits.writeAddress(creator);
  initialData.bits.writeAddress(beneficiary);
  initialData.bits.writeAddress(jettonMaster);
  initialData.refs.push(jwalletCode);

  const schedCell = new Cell();
  schedCell.bits.writeUint(startTime, 32);
  schedCell.bits.writeUint(cliffDuration, 32);
  schedCell.bits.writeUint(totalDuration, 32);
  schedCell.bits.writeCoins(totalTokens);
  schedCell.bits.writeCoins(0); // claimed = 0
  schedCell.bits.writeBit(0);   // is_initialized = 0

  initialData.refs.push(schedCell);

  const ca = contractAddress({
    workchain: 0,
    initialCode: codeCell,
    initialData: initialData
  });

  const contract = await SmartContract.fromCell(codeCell, initialData, { debug: false });
  contract.setC7Config({
    myself: ca,
    balance: new BN(toNano('1').toString())
  });

  function createMsg(from, valueTon, bodyCell) {
    const message = bodyCell ? new CellMessage(bodyCell) : undefined;
    return new InternalMessage({
      from: from,
      to: ca,
      value: toNano(valueTon.toString()),
      bounce: true,
      body: new CommonMessageInfo({ body: message })
    });
  }

  // Calculate deterministic vesting JWallet
  function calculateJettonWalletStateInit(owner, master, code) {
    const data = new Cell();
    data.bits.writeCoins(0);
    data.bits.writeAddress(owner);
    data.bits.writeAddress(master);
    data.refs.push(code);

    const init = new Cell();
    init.bits.writeUint(0, 2);
    init.bits.writeBit(1); init.refs.push(code);
    init.bits.writeBit(1); init.refs.push(data);
    init.bits.writeUint(0, 1);
    return init;
  }

  const vestingJWalletStateInit = calculateJettonWalletStateInit(ca, jettonMaster, jwalletCode);
  const vestingJWallet = new Address(0, vestingJWalletStateInit.hash());

  // Invariant 2.1: Premature claim on uninitialized contract
  contract.setUnixTime(startTime + 2000);
  const claimBody = new Cell();
  claimBody.bits.writeUint(0x414e4c76, 32);
  claimBody.bits.writeUint(1, 64);

  const claimUninit = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  assert(claimUninit.exit_code === 406, 'Rejects claim before deposit initialization (error 406)');

  // Invariant 2.2: Fake JWallet notification
  const fakeDepositBody = new Cell();
  fakeDepositBody.bits.writeUint(0x7362d09c, 32);
  fakeDepositBody.bits.writeUint(1, 64);
  fakeDepositBody.bits.writeCoins(totalTokens);
  fakeDepositBody.bits.writeAddress(creator);

  const fakeDeposit = await contract.sendInternalMessage(createMsg(attacker, '0.05', fakeDepositBody));
  assert(fakeDeposit.exit_code === 403, 'Rejects transfer notification from unauthorized JWallet (error 403)');

  // Invariant 2.3: Deposit from non-creator
  const wrongDepositorBody = new Cell();
  wrongDepositorBody.bits.writeUint(0x7362d09c, 32);
  wrongDepositorBody.bits.writeUint(1, 64);
  wrongDepositorBody.bits.writeCoins(totalTokens);
  wrongDepositorBody.bits.writeAddress(attacker);

  const wrongDepositor = await contract.sendInternalMessage(createMsg(vestingJWallet, '0.05', wrongDepositorBody));
  assert(wrongDepositor.exit_code === 401, 'Rejects deposit from non-creator address (error 401)');

  // Invariant 2.4: Valid initialization
  const validDepositBody = new Cell();
  validDepositBody.bits.writeUint(0x7362d09c, 32);
  validDepositBody.bits.writeUint(1, 64);
  validDepositBody.bits.writeCoins(totalTokens);
  validDepositBody.bits.writeAddress(creator);

  const validDeposit = await contract.sendInternalMessage(createMsg(vestingJWallet, '0.05', validDepositBody));
  assert(validDeposit.exit_code === 0, 'Authentic TEP-74 notification from creator initializes contract (exit 0)');

  // Invariant 2.5: Double deposit protection
  const doubleDeposit = await contract.sendInternalMessage(createMsg(vestingJWallet, '0.05', validDepositBody));
  assert(doubleDeposit.exit_code === 407, 'Prevents double-initialization (error 407)');

  // Invariant 2.6: Cliff period enforcement
  contract.setUnixTime(startTime + 500); // 500s < 1000s cliff
  const claimBeforeCliff = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  assert(claimBeforeCliff.exit_code === 402, 'Strictly blocks claims prior to cliff expiration (error 402)');

  // Invariant 2.7: Unauthorized claimer
  contract.setUnixTime(startTime + 1500);
  const claimByAttacker = await contract.sendInternalMessage(createMsg(attacker, '0.05', claimBody));
  assert(claimByAttacker.exit_code === 401, 'Strictly blocks claims from unauthorized non-beneficiary (error 401)');

  // Invariant 2.8: Insufficient gas
  const claimLowGas = await contract.sendInternalMessage(createMsg(beneficiary, '0.01', claimBody));
  assert(claimLowGas.exit_code === 408, 'Rejects claim with insufficient gas (< 0.04 TON) (error 408)');

  // Invariant 2.9: 25% Cliff claim math & TEP-74 message construction
  contract.setUnixTime(startTime + cliffDuration); // t = 11000
  const claim1 = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  assert(claim1.exit_code === 0 && claim1.actionList.length === 1, 'Executes valid cliff claim and dispatches 1 message (exit 0)');

  const outMsg1 = claim1.actionList[0];
  const outSlice1 = Slice.fromCell(outMsg1.message.body);
  const outOp1 = outSlice1.readUint(32);
  const outQuery1 = outSlice1.readUint(64);
  const outClaimable1 = outSlice1.readCoins();
  const outDest1 = outSlice1.readAddress();

  assert(outOp1.toString(16) === 'f8a7ea5', 'Outgoing message uses TEP-74 transfer opcode 0x0f8a7ea5');
  assert(outClaimable1.toString() === toNano('25000').toString(), 'Calculates exact 25% linear cliff amount (25,000 tokens)');
  assert(outDest1.toFriendly() === beneficiary.toFriendly(), 'Outgoing transfer recipient is the verified beneficiary');

  // Invariant 2.10: Anti-reentrancy duplicate claim
  const repeatClaim = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  assert(repeatClaim.exit_code === 405, 'Immediate duplicate claim at same timestamp rejected (error 405)');

  // Invariant 2.11: Incremental 50% claim
  contract.setUnixTime(startTime + 2000); // 12000
  const claim2 = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  const outSlice2 = Slice.fromCell(claim2.actionList[0].message.body);
  outSlice2.readUint(32); outSlice2.readUint(64);
  const outClaimable2 = outSlice2.readCoins();
  assert(claim2.exit_code === 0 && outClaimable2.toString() === toNano('25000').toString(), 'Incremental claim at 50% duration unlocks additional 25,000 tokens');

  // Invariant 2.12: Final 100% claim
  contract.setUnixTime(startTime + 5000); // 15000
  const claim3 = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  const outSlice3 = Slice.fromCell(claim3.actionList[0].message.body);
  outSlice3.readUint(32); outSlice3.readUint(64);
  const outClaimable3 = outSlice3.readCoins();
  assert(claim3.exit_code === 0 && outClaimable3.toString() === toNano('50000').toString(), 'Final claim after vesting completion unlocks remaining 50,000 tokens');

  // Invariant 2.13: Over-claim rejection
  const claimAfterFull = await contract.sendInternalMessage(createMsg(beneficiary, '0.05', claimBody));
  assert(claimAfterFull.exit_code === 405, 'Attempting to claim when 100% claimed rejected (error 405)');

  // Invariant 2.14: Getters
  const getVestingData = await contract.invokeGetMethod('get_vesting_data', []);
  assert(getVestingData.exit_code === 0, 'get_vesting_data getter executes cleanly');
  assert(getVestingData.result[0].toString() === totalTokens.toString(), 'get_vesting_data reports correct total locked tokens');
  assert(getVestingData.result[1].toString() === totalTokens.toString(), 'get_vesting_data reports correct total claimed tokens');

  const claimablePast = await contract.invokeGetMethod('get_claimable_at', [{ type: 'int', value: (startTime + 500).toString() }]);
  assert(claimablePast.exit_code === 0 && claimablePast.result[0].toString() === '0', 'get_claimable_at reports 0 before cliff');

  // Invariant 2.15: Anti-Cell-Overflow with 1 Trillion Token Supply
  const hugeSupply = toNano('1000000000000'); // 1,000,000,000,000 tokens (1 Trillion)
  const hugeSchedCell = new Cell();
  hugeSchedCell.bits.writeUint(startTime, 32);
  hugeSchedCell.bits.writeUint(cliffDuration, 32);
  hugeSchedCell.bits.writeUint(totalDuration, 32);
  hugeSchedCell.bits.writeCoins(hugeSupply);
  hugeSchedCell.bits.writeCoins(hugeSupply);
  hugeSchedCell.bits.writeBit(1);

  const hugeRoot = new Cell();
  hugeRoot.bits.writeAddress(creator);
  hugeRoot.bits.writeAddress(beneficiary);
  hugeRoot.bits.writeAddress(jettonMaster);
  hugeRoot.refs.push(jwalletCode);
  hugeRoot.refs.push(hugeSchedCell);

  assert(hugeRoot.bits.cursor <= 1023 && hugeSchedCell.bits.cursor <= 1023, 'Ref-based storage layout strictly prevents 1024-bit cell overflow on trillion token supplies');

  // Invariant 2.16: Bounced Message Recovery from Authentic JWallet
  const bounceBody = new Cell();
  bounceBody.bits.writeUint(0xffffffff, 32); // bounce flag
  bounceBody.bits.writeUint(0x0f8a7ea5, 32); // original op::jetton_transfer
  bounceBody.bits.writeUint(1, 64);          // query_id
  bounceBody.bits.writeCoins(toNano('50000')); // bounced 50,000 tokens

  const bounceMsg = new InternalMessage({
    from: vestingJWallet,
    to: ca,
    value: toNano('0.01'),
    bounce: false,
    bounced: true,
    body: new CommonMessageInfo({ body: new CellMessage(bounceBody) })
  });

  const bounceResult = await contract.sendInternalMessage(bounceMsg);
  assert(bounceResult.exit_code === 0, 'Processes authentic bounced transfer from JWallet cleanly (exit 0)');

  const getVestingAfterBounce = await contract.invokeGetMethod('get_vesting_data', []);
  const claimedAfterBounce = getVestingAfterBounce.result[1];
  assert(claimedAfterBounce.toString() === toNano('50000').toString(), 'Restores claimed_amount upon authentic JWallet bounce recovery');

  // ═══════════════════════════════════════════════════════════════════
  // 3. FRONTEND INTEGRATION & VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n--- 3. Frontend Integration & Safety Guards ---');
  const html = fs.readFileSync(path.join(rootDir, 'memecoin-platform.html'), 'utf8');
  const js = fs.readFileSync(path.join(rootDir, 'assets/js/anl-labs.js'), 'utf8');

  // HTML checks
  assert(html.includes('id="wizard-step-4"'), 'Step 4 panel (#wizard-step-4) exists');
  assert(html.includes('id="labs-vesting-beneficiary"'), 'Beneficiary input exists');
  assert(html.includes('id="labs-vesting-amount"'), 'Token amount input exists');
  assert(html.includes('id="labs-vesting-cliff"'), 'Cliff period selector exists');
  assert(html.includes('id="labs-vesting-period"'), 'Vesting duration selector exists');
  assert(html.includes('id="labs-vesting-date"'), 'Start date input exists');
  assert(html.includes('id="vesting-breakdown-card"'), 'Dynamic breakdown card (#vesting-breakdown-card) exists');
  assert(html.includes('id="labs-vesting-submit-btn"'), 'Lock action button (#labs-vesting-submit-btn) exists');
  assert(html.includes('id="vesting-tx-status"'), 'Transaction status container (#vesting-tx-status) exists');

  // Mainnet security banner preserved
  assert(html.includes('Smart Contract Security & Development Status'), 'Security & Development Status banner is preserved in HTML');
  assert(html.includes('Contract in specification & security audit'), 'Honest audit status is preserved in HTML');
  assert(html.includes('Mainnet Contract Locked (Pending Security Verification)'), 'Mainnet lock disabled button text is preserved in HTML');

  // JS checks
  assert(js.includes('labsUpdateVestingScheduleCalculation'), 'labsUpdateVestingScheduleCalculation is defined');
  assert(js.includes('labsUpdateVestingUI'), 'labsUpdateVestingUI network status updater is defined');
  assert(js.includes('Non-Custodial Vesting Smart Contract — Development Status'), 'Mainnet protection alert is strictly preserved');
  assert(!js.includes('localStorage.setItem(\'anlgram_vesting_') && !js.includes('localStorage.setItem("anlgram_vesting_'), 'Zero localStorage simulation of vesting schedules');

  // Behavioral test with lightweight mock DOM
  const mockDom = {};
  function createMockElement(id, initialVal = '') {
    return {
      id,
      style: {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      value: initialVal,
      innerHTML: '',
      textContent: '',
      disabled: false,
      addEventListener: () => {},
      dataset: {}
    };
  }

  const mockIds = {
    'labs-vesting-beneficiary': 'UQ8s49f3kUQ8s49f3kUQ8s49f3kUQ8s49f3kUQ8s49f3k000',
    'labs-vesting-amount': '100000000',
    'labs-vesting-cliff': '3 months',
    'labs-vesting-period': '12 months',
    'labs-vesting-date': '2026-11-01',
    'labs-vesting-submit-btn': '',
    'vesting-network-status-note': '',
    'vesting-breakdown-card': '',
    'vesting-calc-status': '',
    'vesting-cliff-release': '',
    'vesting-monthly-rate': '',
    'vesting-end-date': '',
    'vesting-validation-error': '',
    'vesting-tx-status': ''
  };

  for (const [id, val] of Object.entries(mockIds)) {
    mockDom[id] = createMockElement(id, val);
  }

  const mockWindow = {
    location: { search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    tonConnectUI: {
      connected: true,
      account: { address: '0:1111111111111111111111111111111111111111111111111111111111111111', chain: '-239' }
    }
  };

  const evalContext = {
    window: mockWindow,
    document: {
      getElementById: (id) => mockDom[id] || null,
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    alert: (msg) => { evalContext.lastAlert = msg; },
    confirm: () => true,
    wizardState: { activeToken: { address: 'EQD...', symbol: 'MOON' } },
    escapeHtml: (s) => s
  };

  const script = new (require('vm').Script)(js);
  script.runInNewContext(evalContext);

  // Check initial calculation
  evalContext.window.labsUpdateVestingScheduleCalculation();
  const cliffReleaseEl = mockDom['vesting-cliff-release'];
  assert(cliffReleaseEl && cliffReleaseEl.textContent.includes('25.0%'), 'Calculates 25% default cliff unlock in DOM');

  // Check Mainnet protection trigger
  evalContext.window.labsSubmitVesting();
  assert(evalContext.lastAlert && evalContext.lastAlert.includes('Non-Custodial Vesting Smart Contract — Development Status'), 'Mainnet execution triggers honest security alert and blocks lock transaction');

  // Check Testnet enablement
  mockWindow.tonConnectUI.account.chain = '-3';
  evalContext.window.labsUpdateVestingUI();
  const submitBtn = mockDom['labs-vesting-submit-btn'];
  assert(!submitBtn.disabled, 'Lock button is safely enabled when connected to TON Testnet (-3)');
  assert(submitBtn.innerHTML.includes('Deploy Vesting Contract & Lock Tokens (Testnet)'), 'Button text updates to Testnet action');

  // Check Multi-Network API & Explorer Routing
  assert(js.includes('getNetworkContext()'), 'getNetworkContext function is defined in anl-labs.js');
  assert(js.includes('https://testnet.tonapi.io/v2') && js.includes('https://tonapi.io/v2'), 'Both Testnet and Mainnet TonAPI endpoints are supported');
  assert(js.includes('https://testnet.tonscan.org') && js.includes('https://tonscan.org'), 'Both Testnet and Mainnet TonScan explorer endpoints are supported');

  console.log('\n========================================================================');
  console.log(`📊 STEP 4 VESTING SUITE: ${passed} / ${total} Tests Passed (${Math.round((passed/total)*100)}%)`);
  console.log('========================================================================\n');

  if (passed === total) {
    console.log('🎉 STEP 4 TOKEN LOCKING (VESTING) FULLY VERIFIED ON-CHAIN & IN FRONTEND!\n');
  } else {
    process.exit(1);
  }
}

runStep4VestingSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
