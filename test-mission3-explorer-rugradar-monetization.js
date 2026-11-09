'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const monetization = require('./assets/js/monetization.js');

const TOKEN_ADDR = '0:' + '1'.repeat(64);
const OWNER_WALLET = '0:' + '2'.repeat(64);
const ATTACKER_WALLET = '0:' + '3'.repeat(64);
const TREASURY_ADDR = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';

function loadRugRadarInSandbox() {
  const code = fs.readFileSync(path.join(__dirname, 'assets/js/rug-radar.js'), 'utf8');
  const sandbox = {
    window: {},
    document: {
      readyState: 'complete',
      querySelector: () => null,
      getElementById: () => null,
      addEventListener: () => {}
    },
    console
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.ANLGRAM_RUG_RADAR;
}

function loadClusterVisualizerInSandbox() {
  const code = fs.readFileSync(path.join(__dirname, 'assets/js/wallet-cluster-explorer.js'), 'utf8');
  const sandbox = {
    window: { addEventListener: () => {} },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    console
  };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.ANLGRAM_WCE;
}

test('Mission 3.1 [Rug Radar]: explicitly separates Observed On-Chain Facts from Heuristic Risk Assessments and recognizes verified LP Lockers', () => {
  const radar = loadRugRadarInSandbox();
  assert(radar && typeof radar.evaluateStructuralChecks === 'function');

  const lockerAddr = '0:0fd58e52e4221cd81d58dc8da8fb6316e750b4c0be2e7113b72687e59a16f71b';
  const result = radar.evaluateStructuralChecks({
    cleanAddr: TOKEN_ADDR,
    ticker: 'ANLTEST',
    jettonData: {
      mintable: false,
      total_supply: '1000000000000000000',
      holders_count: 250,
      admin: { address: '0:0000000000000000000000000000000000000000000000000000000000000000' }
    },
    accountData: {
      interfaces: ['jetton_master'],
      code: 'b5ee9c72'
    },
    holdersData: {
      total: 250,
      addresses: [
        { address: '0:' + 'a'.repeat(64), owner: { address: '0:' + 'a'.repeat(64) }, balance: '150000000000000000' },
        { address: '0:' + 'b'.repeat(64), owner: { address: '0:' + 'b'.repeat(64) }, balance: '50000000000000000' }
      ]
    },
    stonfiPool: {
      lp_total_supply_usd: '125000',
      reserve1: '25000000000000'
    },
    poolAddr: '0:' + '9'.repeat(64),
    lpHolders: [
      { owner: { address: lockerAddr }, balance: '999999999' }
    ],
    adminEvents: []
  });

  // 1. Verify Observed Facts vs Heuristic Assessments separation
  assert.equal(result.observedFacts.length, 4);
  assert.equal(result.heuristicAssessments.length, 2);
  assert(result.observedFacts.every(r => r.category === 'observed_fact' && r.evidenceType === 'DETERMINISTIC_ONCHAIN_STATE'));
  assert(result.heuristicAssessments.every(r => r.category === 'heuristic_assessment' && r.evidenceType === 'HEURISTIC_RISK_INDICATOR'));
  assert(result.methodologyDisclaimer.includes('NEVER constitute an accusation or proof of a rug-pull'));

  // 2. Verify LP Locker recognition
  const liqRow = result.observedFacts.find(r => r.name === 'Liquidity');
  assert.equal(liqRow.value, 'Locked (Verified Locker)');
  assert.equal(liqRow.status, 'green');
  assert.equal(liqRow.points, 25);

  // 3. Verify Distribution snapshot disclosure when totalHoldersCount > 2 * sampleSize
  const distRow = result.heuristicAssessments.find(r => r.name === 'Distribution');
  assert(distRow.value.includes('Top10: 20.0% · Top1: 15.0%'));
  assert.equal(result.concentrationMetrics.top1Pct, 15);
  assert.equal(result.concentrationMetrics.top10Pct, 20);
});

test('Mission 3.2 [Rug Radar]: detects suspicious deployer fan-out and circular transfer loops as Heuristic Risk Indicators without false accusations', () => {
  const radar = loadRugRadarInSandbox();
  const adminAddr = OWNER_WALLET;
  const w1 = '0:' + '4'.repeat(64);
  const w2 = '0:' + '5'.repeat(64);
  const w3 = '0:' + '6'.repeat(64);
  const w4 = '0:' + '7'.repeat(64);

  const result = radar.evaluateStructuralChecks({
    cleanAddr: TOKEN_ADDR,
    ticker: 'CLUSTER',
    jettonData: {
      mintable: false,
      total_supply: '1000000000000000000',
      holders_count: 10,
      admin: { address: adminAddr }
    },
    accountData: { interfaces: ['jetton_master'], code: 'b5ee9c72' },
    holdersData: { total: 10, addresses: [] },
    stonfiPool: null,
    poolAddr: '',
    lpHolders: [],
    adminEvents: [
      {
        actions: [
          { type: 'JettonTransfer', JettonTransfer: { sender: { address: adminAddr }, recipient: { address: w1 }, amount: '1000' } },
          { type: 'JettonTransfer', JettonTransfer: { sender: { address: adminAddr }, recipient: { address: w2 }, amount: '1000' } },
          { type: 'JettonTransfer', JettonTransfer: { sender: { address: adminAddr }, recipient: { address: w3 }, amount: '1000' } },
          { type: 'JettonTransfer', JettonTransfer: { sender: { address: adminAddr }, recipient: { address: w4 }, amount: '1000' } },
          { type: 'JettonTransfer', JettonTransfer: { sender: { address: w1 }, recipient: { address: adminAddr }, amount: '500' } }
        ]
      }
    ]
  });

  const behaviorRow = result.heuristicAssessments.find(r => r.name === 'Behavior');
  assert.equal(behaviorRow.status, 'amber');
  assert(behaviorRow.value.includes('Cluster fan-out (4 wallets)'));
  assert(result.clusterRiskIndicators.some(i => i.id === 'DEPLOYER_FANOUT_CLUSTER' && i.factOrHeuristic === 'HEURISTIC_RISK_INDICATOR'));
  assert(result.clusterRiskIndicators.some(i => i.id === 'CIRCULAR_TRANSFER_LOOP' && i.factOrHeuristic === 'HEURISTIC_RISK_INDICATOR'));
});

test('Mission 3.3 [Wallet Cluster Visualizer]: processGraphTopology builds real on-chain clusters, detects fan-out hubs and bidirectional loops, and labels them heuristic', () => {
  const wce = loadClusterVisualizerInSandbox();
  assert(wce && typeof wce.processGraphTopology === 'function');

  const w1 = '0:' + 'a'.repeat(64);
  const w2 = '0:' + 'b'.repeat(64);
  const w3 = '0:' + 'c'.repeat(64);
  const w4 = '0:' + 'd'.repeat(64);

  const rawHolders = [
    { owner: { address: w1 }, balance: '300000000000' },
    { owner: { address: w2 }, balance: '100000000000' },
    { owner: { address: w3 }, balance: '100000000000' },
    { owner: { address: w4 }, balance: '500000000000' }
  ];

  const events = [
    {
      timestamp: 1700000000,
      actions: [
        { type: 'JettonTransfer', JettonTransfer: { sender: { address: w1 }, recipient: { address: w2 }, amount: '10000000000' } },
        { type: 'JettonTransfer', JettonTransfer: { sender: { address: w2 }, recipient: { address: w1 }, amount: '5000000000' } },
        { type: 'JettonTransfer', JettonTransfer: { sender: { address: w1 }, recipient: { address: w3 }, amount: '10000000000' } }
      ]
    }
  ];

  const graph = wce.processGraphTopology({ decimals: 9 }, rawHolders, events);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.clusters.length, 1);
  const cluster = graph.clusters[0];
  assert.equal(cluster.walletCount, 3);
  assert.equal(cluster.circularPairsCount, 1);
  assert.equal(cluster.evidenceType, 'HEURISTIC_CLUSTER_ASSESSMENT');
  assert(cluster.disclaimer.includes('does NOT prove common ownership'));
  assert.equal(graph.suspiciousClusters.length, 1);
});

test('Mission 3.4 [Monetization Gate]: default singleton keeps MONETIZATION_PAYMENTS_ENABLED === false and blocks wallet payment requests', async () => {
  assert.equal(monetization.MONETIZATION_PAYMENTS_ENABLED, false);

  const ordRes = await monetization.createOrder({
    packageId: 'BOOST_24H',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    tokenSymbol: 'ANL',
    network: 'testnet'
  });
  assert.equal(ordRes.ok, true);
  assert.equal(ordRes.paymentsEnabled, false);
  assert.equal(ordRes.paymentGateStatus, 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL');

  // Attempting to request a live wallet payment or activate an order on the production singleton must fail closed
  const payRes = await monetization.requestWalletPayment(ordRes.order.orderId);
  assert.equal(payRes.ok, false);
  assert.equal(payRes.code, 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL');

  const actRes = monetization.verifyAndActivateOrder(ordRes.order.orderId, {
    txHash: 'a'.repeat(64),
    recipientAddress: TREASURY_ADDR,
    amountNano: '5000000000',
    aborted: false,
    success: true
  });
  assert.equal(actRes.ok, false);
  assert.equal(actRes.code, 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL');
});

test('Mission 3.5 [Monetization Lifecycle]: Token Boost, Truthful Receipts, Expiration, Duplicate Protection, Charge Failures, and Safety-Score Isolation', async () => {
  let currentClock = 1_700_000_000_000;
  const engine = monetization.createMonetizationEngine({
    paymentsEnabled: false,
    sandboxTestMode: true,
    treasuryAddress: TREASURY_ADDR,
    now: () => currentClock
  });

  // 1. Create a 24h Token Boost order
  const created = await engine.createOrder({
    packageId: 'BOOST_24H',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    tokenSymbol: 'ANL',
    network: 'testnet'
  });
  assert.equal(created.ok, true);
  assert.equal(created.order.state, 'AWAITING_PAYMENT');
  assert.equal(created.order.sponsorshipLabel, 'SPONSORED · BOOSTED');

  // 2. Duplicate order creation with same idempotency parameters is blocked
  const duplicateOrder = await engine.createOrder({
    packageId: 'BOOST_24H',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    tokenSymbol: 'ANL',
    network: 'testnet'
  });
  assert.equal(duplicateOrder.ok, false);
  assert.equal(duplicateOrder.code, 'DUPLICATE_ORDER_OR_ACTIVE_PROMOTION');

  // 3. Verify and activate with genuine on-chain payment evidence
  const txHash1 = 'b'.repeat(64);
  const activated = engine.verifyAndActivateOrder(created.order.orderId, {
    txHash: txHash1,
    callbackNonce: 'nonce-001',
    recipientAddress: TREASURY_ADDR,
    amountNano: '5000000000',
    lt: '48192001',
    aborted: false,
    success: true
  });
  assert.equal(activated.ok, true);
  assert.equal(activated.order.state, 'ACTIVE');
  assert.equal(activated.receipt.amountPaidNano, '5000000000');
  assert.equal(activated.receipt.txHash, txHash1);
  assert.equal(activated.receipt.sponsorshipLabel, 'SPONSORED · BOOSTED');
  assert.equal(activated.receipt.safetyScoreImpact, 'NONE');
  assert.equal(activated.receipt.expiresAt, currentClock + 24 * 60 * 60 * 1000);

  // 4. Replaying the same txHash or callbackNonce is rejected
  const replay = engine.verifyAndActivateOrder(created.order.orderId, {
    txHash: txHash1,
    callbackNonce: 'nonce-001',
    recipientAddress: TREASURY_ADDR,
    amountNano: '5000000000'
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.code, 'DUPLICATE_PAYMENT_CALLBACK_REJECTED');

  // 5. Ordering another Boost for the same token while one is ACTIVE is rejected
  const overlappingBoost = await engine.createOrder({
    packageId: 'BOOST_72H',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    tokenSymbol: 'ANL',
    network: 'testnet'
  });
  assert.equal(overlappingBoost.ok, false);
  assert.equal(overlappingBoost.code, 'DUPLICATE_ACTIVE_BOOST');

  // 6. Verify Safety-Score Isolation: a Red (score 20) Rug Radar token remains Red (score 20) while Boosted
  const radar = loadRugRadarInSandbox();
  const riskyEval = radar.evaluateStructuralChecks({
    cleanAddr: TOKEN_ADDR,
    ticker: 'ANL',
    jettonData: { mintable: true, total_supply: '1000', holders_count: 5, admin: { address: OWNER_WALLET } },
    accountData: { interfaces: ['jetton_master'], code: 'b5ee9c72' },
    holdersData: { total: 5, addresses: [] },
    stonfiPool: null,
    poolAddr: '',
    lpHolders: [],
    adminEvents: []
  });
  assert.equal(riskyEval.band, 'red');
  const isolationCheck = engine.verifySafetyScoreIsolation(riskyEval);
  assert.equal(isolationCheck.score, riskyEval.score);
  assert.equal(isolationCheck.band, 'red');
  assert.equal(isolationCheck.promotionInfluenceOnScore, 0);
  assert.equal(isolationCheck.safetyScoreIsolated, true);

  // 7. Advance clock past 24h expiration -> promotion automatically transitions to EXPIRED
  assert.equal(engine.getActivePromotions(currentClock).boosts.length, 1);
  currentClock += 24 * 60 * 60 * 1000 + 1;
  assert.equal(engine.getActivePromotions(currentClock).boosts.length, 0);
  assert.equal(engine.getOrder(created.order.orderId, currentClock).state, 'EXPIRED');
});

test('Mission 3.6 [Monetization Security]: Paid Token-Profile Updates enforce authenticated token-owner verification and In-App Ads reject deceptive safety copy & failed charges', async () => {
  let currentClock = 1_700_000_000_000;
  const engine = monetization.createMonetizationEngine({
    paymentsEnabled: false,
    sandboxTestMode: true,
    treasuryAddress: TREASURY_ADDR,
    now: () => currentClock,
    fetchJettonMaster: async () => ({
      admin: { address: OWNER_WALLET },
      mintable: false
    })
  });

  // 1. Unauthorized wallet (not token admin) attempting to update token profile is rejected
  const unauthorizedProfile = await engine.createOrder({
    packageId: 'PROFILE_STANDARD',
    payerWallet: ATTACKER_WALLET,
    tokenAddress: TOKEN_ADDR,
    proofSession: {
      authenticated: true,
      address: ATTACKER_WALLET,
      expiresAt: currentClock + 600_000
    },
    profileData: {
      description: 'Hijacked description',
      website: 'https://attacker.example.com'
    }
  });
  assert.equal(unauthorizedProfile.ok, false);
  assert.equal(unauthorizedProfile.code, 'UNAUTHORIZED_NOT_TOKEN_OWNER');

  // 2. Missing ton_proof session is rejected even if wallet address matches admin
  const unauthenticatedOwner = await engine.createOrder({
    packageId: 'PROFILE_STANDARD',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    proofSession: { authenticated: false, address: OWNER_WALLET },
    profileData: { description: 'Valid owner without ton_proof' }
  });
  assert.equal(unauthenticatedOwner.ok, false);
  assert.equal(unauthenticatedOwner.code, 'TON_PROOF_SESSION_REQUIRED');

  // 3. Authenticated token owner with valid ton_proof session succeeds and activates after verified payment
  const validProfileOrder = await engine.createOrder({
    packageId: 'PROFILE_STANDARD',
    payerWallet: OWNER_WALLET,
    tokenAddress: TOKEN_ADDR,
    proofSession: {
      authenticated: true,
      address: OWNER_WALLET,
      expiresAt: currentClock + 600_000
    },
    profileData: {
      description: 'Official ANLGRAM Ecosystem Utility Token',
      website: 'https://anlgram.com',
      telegram: 'https://t.me/anlgram'
    }
  });
  assert.equal(validProfileOrder.ok, true);
  const profileActivation = engine.verifyAndActivateOrder(validProfileOrder.order.orderId, {
    txHash: 'c'.repeat(64),
    recipientAddress: TREASURY_ADDR,
    amountNano: '3000000000',
    aborted: false,
    success: true
  });
  assert.equal(profileActivation.ok, true);
  const storedProfile = engine.getTokenProfile(TOKEN_ADDR, currentClock);
  assert.equal(storedProfile.updatedByOwner, OWNER_WALLET);
  assert.equal(storedProfile.profile.website, 'https://anlgram.com/');
  assert.equal(storedProfile.safetyScoreImpact, 'NONE');

  // 4. In-App Ad with deceptive safety claim ("Rug Radar Verified 100% Safe") is rejected
  const deceptiveAd = await engine.createOrder({
    packageId: 'AD_BANNER_24H',
    payerWallet: OWNER_WALLET,
    adData: {
      headline: 'Rug Radar Verified 100% Safe Token — Buy Now!',
      ctaText: 'Buy',
      targetUrl: 'https://anlgram.com'
    }
  });
  assert.equal(deceptiveAd.ok, false);
  assert.equal(deceptiveAd.code, 'DECEPTIVE_AD_COPY_FORBIDDEN');

  // 5. Valid In-App Ad where on-chain payment aborts or underpays transitions to CHARGE_FAILED
  const validAd = await engine.createOrder({
    packageId: 'AD_BANNER_24H',
    payerWallet: OWNER_WALLET,
    adData: {
      headline: 'Explore ANLGRAM On-Chain Analytics Terminal',
      ctaText: 'Open Terminal',
      targetUrl: 'https://anlgram.com/explorer.html'
    }
  });
  assert.equal(validAd.ok, true);
  const underpaidRes = engine.verifyAndActivateOrder(validAd.order.orderId, {
    txHash: 'd'.repeat(64),
    recipientAddress: TREASURY_ADDR,
    amountNano: '1000000000', // 1 TON instead of required 8 TON
    aborted: false,
    success: true
  });
  assert.equal(underpaidRes.ok, false);
  assert.equal(underpaidRes.code, 'CHARGE_FAILED');
  assert.equal(underpaidRes.failureReason, 'INSUFFICIENT_PAYMENT_AMOUNT');
  assert.equal(engine.getActivePromotions(currentClock).ads.length, 0);
});
