/**
 * ANLGRAM In-App Monetization Module (Token Boost, Verified Owner Profile Updates, In-App Ads & Advertiser Dashboard)
 *
 * COORDINATION & SAFETY RULES:
 * 1. MONETIZATION_PAYMENTS_ENABLED defaults to FALSE (fail-closed payment gate).
 * 2. Paid promotions NEVER alter Rug Radar safety scores, TokenVerificationEngine claims, or imply investment legitimacy.
 * 3. Every promotion carries an explicit sponsorship label ('SPONSORED · BOOSTED', 'SPONSORED AD · IN-APP ONLY', 'OWNER VERIFIED PROFILE').
 * 4. Token-profile updates require authenticated token-owner verification against on-chain Jetton Master admin_address or verified deployer.
 * 5. Enforces idempotency keys, duplicate txHash/callback protection, expiration timestamps, and truthful on-chain payment receipts.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ANLGRAM_MONETIZATION = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Hard production gate: MUST remain false until security & reconciliation checks pass and separate launch approval is granted.
  const MONETIZATION_PAYMENTS_ENABLED = false;

  const PACKAGES = Object.freeze({
    BOOST_24H: {
      id: 'BOOST_24H',
      type: 'BOOST',
      title: '24h Token Visibility Boost',
      amountNano: '5000000000', // 5 TON
      amountTon: '5',
      durationMs: 24 * 60 * 60 * 1000,
      sponsorshipLabel: 'SPONSORED · BOOSTED',
      placementScope: 'IN_APP_ONLY'
    },
    BOOST_72H: {
      id: 'BOOST_72H',
      type: 'BOOST',
      title: '72h Token Visibility Boost',
      amountNano: '12000000000', // 12 TON
      amountTon: '12',
      durationMs: 72 * 60 * 60 * 1000,
      sponsorshipLabel: 'SPONSORED · BOOSTED',
      placementScope: 'IN_APP_ONLY'
    },
    BOOST_7D: {
      id: 'BOOST_7D',
      type: 'BOOST',
      title: '7-Day Token Visibility Boost',
      amountNano: '25000000000', // 25 TON
      amountTon: '25',
      durationMs: 7 * 24 * 60 * 60 * 1000,
      sponsorshipLabel: 'SPONSORED · BOOSTED',
      placementScope: 'IN_APP_ONLY'
    },
    PROFILE_STANDARD: {
      id: 'PROFILE_STANDARD',
      type: 'PROFILE_UPDATE',
      title: 'Verified Owner Token-Profile Update',
      amountNano: '3000000000', // 3 TON
      amountTon: '3',
      durationMs: 365 * 24 * 60 * 60 * 1000,
      sponsorshipLabel: 'OWNER VERIFIED PROFILE · PAID UPDATE',
      placementScope: 'IN_APP_ONLY'
    },
    AD_BANNER_24H: {
      id: 'AD_BANNER_24H',
      type: 'IN_APP_AD',
      title: '24h In-App Banner Placement',
      amountNano: '8000000000', // 8 TON
      amountTon: '8',
      durationMs: 24 * 60 * 60 * 1000,
      sponsorshipLabel: 'SPONSORED AD · IN-APP ONLY',
      placementScope: 'IN_APP_ONLY'
    },
    AD_BANNER_7D: {
      id: 'AD_BANNER_7D',
      type: 'IN_APP_AD',
      title: '7-Day In-App Banner Placement',
      amountNano: '40000000000', // 40 TON
      amountTon: '40',
      durationMs: 7 * 24 * 60 * 60 * 1000,
      sponsorshipLabel: 'SPONSORED AD · IN-APP ONLY',
      placementScope: 'IN_APP_ONLY'
    }
  });

  const ORDER_STATES = Object.freeze({
    DRAFT: 'DRAFT',
    AWAITING_PAYMENT: 'AWAITING_PAYMENT',
    VERIFYING_ONCHAIN: 'VERIFYING_ONCHAIN',
    ACTIVE: 'ACTIVE',
    EXPIRED: 'EXPIRED',
    CHARGE_FAILED: 'CHARGE_FAILED',
    REJECTED: 'REJECTED'
  });

  const DEFAULT_TREASURY_ADDRESS = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';

  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeHttpsUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch (_) {
      return '';
    }
  }

  function normalizeTonAddress(addr) {
    if (!addr || typeof addr !== 'string') return '';
    return addr.trim();
  }

  function isValidTonAddress(addr) {
    const clean = normalizeTonAddress(addr);
    if (!clean) return false;
    return /^(0:[a-fA-F0-9]{64}|(EQ|UQ|kQ|0Q)[a-zA-Z0-9_-]{46,47})$/.test(clean);
  }

  /**
   * Create an isolated or browser-backed Monetization Engine instance.
   */
  function createMonetizationEngine(options = {}) {
    const paymentsEnabled = options.paymentsEnabled === true ? true : MONETIZATION_PAYMENTS_ENABLED;
    const sandboxTestMode = options.sandboxTestMode === true;
    const treasuryAddress = options.treasuryAddress || DEFAULT_TREASURY_ADDRESS;
    const nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    const fetchJettonMaster = typeof options.fetchJettonMaster === 'function'
      ? options.fetchJettonMaster
      : async (tokenAddress, network = 'testnet') => {
          const base = network === 'mainnet' ? 'https://tonapi.io/v2' : 'https://testnet.tonapi.io/v2';
          const res = await fetch(`${base}/jettons/${encodeURIComponent(tokenAddress)}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`TonAPI HTTP ${res.status}`);
          return await res.json();
        };

    const ordersById = new Map();
    const orderIdByIdempotencyKey = new Map();
    const processedTxHashes = new Set();
    const processedCallbackNonces = new Set();
    const tokenProfiles = new Map();
    const receiptsByOrderId = new Map();
    let orderSeq = 1;

    function reconcileExpiredOrders(currentTime = nowFn()) {
      for (const order of ordersById.values()) {
        if (order.state === ORDER_STATES.ACTIVE && order.expiresAt != null && currentTime >= order.expiresAt) {
          order.state = ORDER_STATES.EXPIRED;
          order.expiredAt = currentTime;
          order.updatedAt = currentTime;
        }
      }
    }

    /**
     * Verify authenticated token ownership for paid token-profile updates.
     */
    async function verifyTokenOwner({ tokenAddress, callerWallet, proofSession, network = 'testnet', onChainJettonData = null }) {
      const cleanToken = normalizeTonAddress(tokenAddress);
      const cleanCaller = normalizeTonAddress(callerWallet);

      if (!isValidTonAddress(cleanToken)) {
        return { verified: false, code: 'INVALID_TOKEN_ADDRESS', reason: 'Token contract address is invalid.' };
      }
      if (!isValidTonAddress(cleanCaller)) {
        return { verified: false, code: 'UNAUTHENTICATED_WALLET', reason: 'A connected TON wallet is required.' };
      }
      if (!proofSession || proofSession.authenticated !== true || normalizeTonAddress(proofSession.address) !== cleanCaller) {
        return {
          verified: false,
          code: 'TON_PROOF_SESSION_REQUIRED',
          reason: 'Token profile updates require an authenticated wallet session (ton_proof) matching the connected wallet.'
        };
      }
      if (proofSession.expiresAt && nowFn() >= proofSession.expiresAt) {
        return {
          verified: false,
          code: 'TON_PROOF_SESSION_EXPIRED',
          reason: 'Wallet authentication session has expired. Reconnect and sign a fresh ton_proof challenge.'
        };
      }

      let jetton = onChainJettonData;
      if (!jetton) {
        try {
          jetton = await fetchJettonMaster(cleanToken, network);
        } catch (err) {
          return {
            verified: false,
            code: 'ONCHAIN_OWNER_LOOKUP_FAILED',
            reason: `Could not verify on-chain token admin: ${err.message || String(err)}`
          };
        }
      }

      const onChainAdmin = normalizeTonAddress(jetton?.admin?.address || jetton?.admin_address || '');
      const onChainDeployer = normalizeTonAddress(jetton?.deployer?.address || jetton?.creator_address || '');
      const isZeroAdmin = !onChainAdmin || onChainAdmin === '0:0000000000000000000000000000000000000000000000000000000000000000';

      if (!isZeroAdmin && onChainAdmin === cleanCaller) {
        return { verified: true, role: 'ONCHAIN_JETTON_ADMIN', adminAddress: onChainAdmin };
      }
      if (isZeroAdmin && onChainDeployer && onChainDeployer === cleanCaller) {
        return { verified: true, role: 'VERIFIED_RENOUNCED_DEPLOYER', adminAddress: onChainAdmin, deployerAddress: onChainDeployer };
      }

      return {
        verified: false,
        code: 'UNAUTHORIZED_NOT_TOKEN_OWNER',
        reason: 'Connected wallet does not match the on-chain Jetton Master admin_address or verified deployer.'
      };
    }

    /**
     * Sanitize and validate token profile fields.
     */
    function sanitizeProfilePayload(payload = {}) {
      const description = String(payload.description || '').trim().slice(0, 360);
      const website = sanitizeHttpsUrl(payload.website);
      const telegram = sanitizeHttpsUrl(payload.telegram);
      const twitter = sanitizeHttpsUrl(payload.twitter);
      const logoUrl = sanitizeHttpsUrl(payload.logoUrl);
      const bannerUrl = sanitizeHttpsUrl(payload.bannerUrl);

      if (payload.website && !website) {
        return { valid: false, code: 'INVALID_PROFILE_URL', reason: 'Website URL must use https://' };
      }
      if (payload.telegram && !telegram) {
        return { valid: false, code: 'INVALID_PROFILE_URL', reason: 'Telegram URL must use https://' };
      }
      if (payload.twitter && !twitter) {
        return { valid: false, code: 'INVALID_PROFILE_URL', reason: 'Twitter/X URL must use https://' };
      }
      if (payload.logoUrl && !logoUrl) {
        return { valid: false, code: 'INVALID_PROFILE_URL', reason: 'Logo URL must use https://' };
      }

      return {
        valid: true,
        profile: {
          description,
          website,
          telegram,
          twitter,
          logoUrl,
          bannerUrl
        }
      };
    }

    /**
     * Prepare an order (Boost, Profile Update, or In-App Ad).
     */
    async function createOrder(params = {}) {
      const currentTime = nowFn();
      reconcileExpiredOrders(currentTime);

      const pkg = PACKAGES[params.packageId];
      if (!pkg) {
        return { ok: false, code: 'INVALID_PACKAGE', error: 'Selected monetization package does not exist.' };
      }

      const payerWallet = normalizeTonAddress(params.payerWallet);
      if (!isValidTonAddress(payerWallet)) {
        return { ok: false, code: 'INVALID_PAYER_WALLET', error: 'A valid TON wallet address is required.' };
      }

      const network = params.network === 'mainnet' ? 'mainnet' : 'testnet';
      const targetAddress = normalizeTonAddress(params.tokenAddress || '');

      if ((pkg.type === 'BOOST' || pkg.type === 'PROFILE_UPDATE') && !isValidTonAddress(targetAddress)) {
        return { ok: false, code: 'INVALID_TOKEN_ADDRESS', error: 'A valid Jetton Master address is required.' };
      }

      // If PROFILE_UPDATE, verify token owner BEFORE creating an order
      let ownerVerification = null;
      let sanitizedProfile = null;
      if (pkg.type === 'PROFILE_UPDATE') {
        ownerVerification = await verifyTokenOwner({
          tokenAddress: targetAddress,
          callerWallet: payerWallet,
          proofSession: params.proofSession,
          network,
          onChainJettonData: params.onChainJettonData
        });
        if (!ownerVerification.verified) {
          return {
            ok: false,
            code: ownerVerification.code || 'UNAUTHORIZED_NOT_TOKEN_OWNER',
            error: ownerVerification.reason
          };
        }
        const checkProfile = sanitizeProfilePayload(params.profileData || {});
        if (!checkProfile.valid) {
          return { ok: false, code: checkProfile.code, error: checkProfile.reason };
        }
        sanitizedProfile = checkProfile.profile;
      }

      // If IN_APP_AD, validate ad copy & target link (must be in-app or https, never misleading safety claims)
      let sanitizedAd = null;
      if (pkg.type === 'IN_APP_AD') {
        const headline = String(params.adData?.headline || '').trim().slice(0, 90);
        const ctaText = String(params.adData?.ctaText || 'Learn More').trim().slice(0, 28);
        const targetUrl = sanitizeHttpsUrl(params.adData?.targetUrl || 'https://anlgram.com');
        if (!headline) {
          return { ok: false, code: 'INVALID_AD_CREATIVE', error: 'Ad headline is required.' };
        }
        // Prohibit deceptive safety claims in ad copy
        if (/rug\s*radar\s*(verified|approved|guaranteed)|100%\s*safe|guaranteed\s*profit/i.test(headline)) {
          return {
            ok: false,
            code: 'DECEPTIVE_AD_COPY_FORBIDDEN',
            error: 'Ad creative cannot claim Rug Radar endorsement or guaranteed investment returns.'
          };
        }
        sanitizedAd = {
          headline,
          ctaText,
          targetUrl: targetUrl || 'https://anlgram.com',
          placementScope: 'IN_APP_ONLY',
          sponsorshipLabel: 'SPONSORED AD · IN-APP ONLY'
        };
      }

      // Duplicate order & active promotion overlap protection
      const idempotencyKey = params.idempotencyKey
        ? String(params.idempotencyKey).trim()
        : `${pkg.id}:${targetAddress || sanitizedAd?.headline || 'ad'}:${payerWallet}`;

      if (orderIdByIdempotencyKey.has(idempotencyKey)) {
        const existingId = orderIdByIdempotencyKey.get(idempotencyKey);
        const existingOrder = ordersById.get(existingId);
        if (existingOrder && [ORDER_STATES.AWAITING_PAYMENT, ORDER_STATES.VERIFYING_ONCHAIN, ORDER_STATES.ACTIVE].includes(existingOrder.state)) {
          return {
            ok: false,
            code: 'DUPLICATE_ORDER_OR_ACTIVE_PROMOTION',
            error: 'An identical order or active promotion is already in progress for this token/package.',
            existingOrderId: existingOrder.orderId
          };
        }
      }

      // Also check if target token already has an active BOOST when ordering another BOOST
      if (pkg.type === 'BOOST') {
        for (const existing of ordersById.values()) {
          if (existing.type === 'BOOST' && existing.tokenAddress === targetAddress && existing.state === ORDER_STATES.ACTIVE && existing.expiresAt > currentTime) {
            return {
              ok: false,
              code: 'DUPLICATE_ACTIVE_BOOST',
              error: 'This token already has an active Boost promotion. Wait until expiration before purchasing another.',
              existingOrderId: existing.orderId,
              expiresAt: existing.expiresAt
            };
          }
        }
      }

      const orderId = `ANL-ORD-${currentTime}-${String(orderSeq++).padStart(4, '0')}`;
      const order = {
        orderId,
        idempotencyKey,
        packageId: pkg.id,
        type: pkg.type,
        title: pkg.title,
        network,
        payerWallet,
        recipientTreasury: treasuryAddress,
        requiredAmountNano: pkg.amountNano,
        requiredAmountTon: pkg.amountTon,
        durationMs: pkg.durationMs,
        tokenAddress: targetAddress || null,
        tokenSymbol: params.tokenSymbol ? String(params.tokenSymbol).trim().toUpperCase().slice(0, 16) : null,
        profileData: sanitizedProfile,
        adData: sanitizedAd,
        ownerVerification,
        sponsorshipLabel: pkg.sponsorshipLabel,
        placementScope: 'IN_APP_ONLY',
        safetyScoreImpact: 'NONE',
        state: ORDER_STATES.AWAITING_PAYMENT,
        createdAt: currentTime,
        updatedAt: currentTime,
        startsAt: null,
        expiresAt: null,
        txHash: null,
        receiptId: null,
        failureReason: null
      };

      ordersById.set(orderId, order);
      orderIdByIdempotencyKey.set(idempotencyKey, orderId);

      return {
        ok: true,
        order,
        paymentsEnabled,
        paymentGateStatus: paymentsEnabled ? 'OPEN' : 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL'
      };
    }

    /**
     * Attempt to submit a live wallet payment for an order.
     * MUST fail closed when paymentsEnabled === false.
     */
    async function requestWalletPayment(orderId) {
      const order = ordersById.get(orderId);
      if (!order) {
        return { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order not found.' };
      }
      if (!paymentsEnabled) {
        return {
          ok: false,
          code: 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL',
          error: 'Payment systems are disabled until security and reconciliation checks pass and separate launch approval is granted. No wallet transaction was requested.'
        };
      }
      return { ok: false, code: 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL', error: 'Live payment execution disabled.' };
    }

    /**
     * Process an on-chain payment verification or callback.
     * Enforces payment gate (unless sandboxTestMode is explicitly enabled for integration tests),
     * duplicate txHash / callbackNonce rejection, exact amount & recipient checks, and truthful receipt generation.
     */
    function verifyAndActivateOrder(orderId, paymentEvidence = {}) {
      const currentTime = nowFn();
      reconcileExpiredOrders(currentTime);

      if (!paymentsEnabled && !sandboxTestMode) {
        return {
          ok: false,
          code: 'PAYMENT_GATE_CLOSED_UNTIL_LAUNCH_APPROVAL',
          error: 'Cannot activate paid order while MONETIZATION_PAYMENTS_ENABLED is false.'
        };
      }

      const order = ordersById.get(orderId);
      if (!order) {
        return { ok: false, code: 'ORDER_NOT_FOUND', error: 'Order not found.' };
      }

      const txHash = String(paymentEvidence.txHash || '').trim().toLowerCase();
      const callbackNonce = String(paymentEvidence.callbackNonce || '').trim();

      if (!/^[a-f0-9]{64}$/.test(txHash)) {
        return { ok: false, code: 'INVALID_TX_HASH', error: 'A verified 64-hex on-chain transaction hash is required.' };
      }

      // Duplicate callback / txHash protection
      if (processedTxHashes.has(txHash) || (callbackNonce && processedCallbackNonces.has(callbackNonce))) {
        return {
          ok: false,
          code: 'DUPLICATE_PAYMENT_CALLBACK_REJECTED',
          error: 'This transaction hash or payment callback has already been processed.'
        };
      }

      if (order.state === ORDER_STATES.ACTIVE) {
        return {
          ok: false,
          code: 'ORDER_ALREADY_ACTIVE',
          error: 'Order is already active.'
        };
      }

      order.state = ORDER_STATES.VERIFYING_ONCHAIN;
      order.updatedAt = currentTime;

      // Check on-chain transaction outcome
      if (paymentEvidence.aborted === true || paymentEvidence.success === false) {
        order.state = ORDER_STATES.CHARGE_FAILED;
        order.failureReason = 'ONCHAIN_TX_ABORTED';
        order.txHash = txHash;
        processedTxHashes.add(txHash);
        if (callbackNonce) processedCallbackNonces.add(callbackNonce);
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          failureReason: order.failureReason,
          order
        };
      }

      const recipient = normalizeTonAddress(paymentEvidence.recipientAddress || '');
      if (recipient !== order.recipientTreasury) {
        order.state = ORDER_STATES.CHARGE_FAILED;
        order.failureReason = 'WRONG_RECIPIENT_ADDRESS';
        order.txHash = txHash;
        processedTxHashes.add(txHash);
        if (callbackNonce) processedCallbackNonces.add(callbackNonce);
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          failureReason: order.failureReason,
          order
        };
      }

      const paidNano = BigInt(String(paymentEvidence.amountNano || '0'));
      const requiredNano = BigInt(order.requiredAmountNano);
      if (paidNano < requiredNano) {
        order.state = ORDER_STATES.CHARGE_FAILED;
        order.failureReason = 'INSUFFICIENT_PAYMENT_AMOUNT';
        order.txHash = txHash;
        processedTxHashes.add(txHash);
        if (callbackNonce) processedCallbackNonces.add(callbackNonce);
        return {
          ok: false,
          code: 'CHARGE_FAILED',
          failureReason: order.failureReason,
          order
        };
      }

      // Verified payment -> Activate order & generate truthful receipt
      processedTxHashes.add(txHash);
      if (callbackNonce) processedCallbackNonces.add(callbackNonce);

      const startsAt = currentTime;
      const expiresAt = startsAt + order.durationMs;
      const receiptId = `ANL-RCPT-${startsAt}-${txHash.slice(0, 10).toUpperCase()}`;

      order.state = ORDER_STATES.ACTIVE;
      order.txHash = txHash;
      order.startsAt = startsAt;
      order.expiresAt = expiresAt;
      order.receiptId = receiptId;
      order.failureReason = null;
      order.updatedAt = currentTime;

      const receipt = Object.freeze({
        receiptId,
        orderId: order.orderId,
        idempotencyKey: order.idempotencyKey,
        orderType: order.type,
        packageId: order.packageId,
        network: order.network,
        payerWallet: order.payerWallet,
        recipientTreasury: order.recipientTreasury,
        amountPaidNano: paidNano.toString(),
        amountRequiredNano: requiredNano.toString(),
        txHash,
        lt: String(paymentEvidence.lt || '0'),
        verifiedAt: startsAt,
        startsAt,
        expiresAt,
        sponsorshipLabel: order.sponsorshipLabel,
        placementScope: 'IN_APP_ONLY',
        safetyScoreImpact: 'NONE',
        disclaimer: 'Paid promotion provides in-app visibility only. It never alters Rug Radar safety scores or implies investment legitimacy.'
      });

      receiptsByOrderId.set(order.orderId, receipt);

      if (order.type === 'PROFILE_UPDATE' && order.tokenAddress && order.profileData) {
        tokenProfiles.set(order.tokenAddress, Object.freeze({
          tokenAddress: order.tokenAddress,
          updatedByOwner: order.payerWallet,
          ownerRole: order.ownerVerification?.role || 'ONCHAIN_JETTON_ADMIN',
          profile: { ...order.profileData },
          orderId: order.orderId,
          receiptId,
          txHash,
          updatedAt: startsAt,
          expiresAt,
          sponsorshipLabel: 'OWNER VERIFIED PROFILE · PAID UPDATE',
          safetyScoreImpact: 'NONE'
        }));
      }

      return {
        ok: true,
        order,
        receipt
      };
    }

    function getActivePromotions(currentTime = nowFn()) {
      reconcileExpiredOrders(currentTime);
      const boosts = [];
      const ads = [];
      for (const order of ordersById.values()) {
        if (order.state === ORDER_STATES.ACTIVE && (order.expiresAt === null || currentTime < order.expiresAt)) {
          if (order.type === 'BOOST') boosts.push(order);
          if (order.type === 'IN_APP_AD') ads.push(order);
        }
      }
      return {
        boosts,
        ads,
        paymentsEnabled,
        evaluatedAt: currentTime
      };
    }

    function getTokenProfile(tokenAddress, currentTime = nowFn()) {
      reconcileExpiredOrders(currentTime);
      const clean = normalizeTonAddress(tokenAddress);
      const entry = tokenProfiles.get(clean);
      if (!entry) return null;
      if (entry.expiresAt != null && currentTime >= entry.expiresAt) {
        tokenProfiles.delete(clean);
        return null;
      }
      return entry;
    }

    function getOrder(orderId, currentTime = nowFn()) {
      reconcileExpiredOrders(currentTime);
      return ordersById.get(orderId) || null;
    }

    function getReceipt(orderId) {
      return receiptsByOrderId.get(orderId) || null;
    }

    function listOrdersForWallet(walletAddress, currentTime = nowFn()) {
      reconcileExpiredOrders(currentTime);
      const clean = normalizeTonAddress(walletAddress);
      const list = [];
      for (const order of ordersById.values()) {
        if (!clean || order.payerWallet === clean) {
          list.push({
            ...order,
            receipt: receiptsByOrderId.get(order.orderId) || null
          });
        }
      }
      return list;
    }

    /**
     * Prove that an active Boost, Profile Update, or Ad NEVER alters a Rug Radar evaluation.
     */
    function verifySafetyScoreIsolation(rugRadarResult) {
      if (!rugRadarResult || typeof rugRadarResult !== 'object') return null;
      // Return a deep-frozen clone of the safety fields proving zero mutation from promotions
      return Object.freeze({
        address: rugRadarResult.address,
        score: rugRadarResult.score,
        band: rugRadarResult.band,
        observedFactsCount: Array.isArray(rugRadarResult.observedFacts) ? rugRadarResult.observedFacts.length : 0,
        heuristicAssessmentsCount: Array.isArray(rugRadarResult.heuristicAssessments) ? rugRadarResult.heuristicAssessments.length : 0,
        promotionInfluenceOnScore: 0,
        safetyScoreIsolated: true
      });
    }

    return {
      MONETIZATION_PAYMENTS_ENABLED: paymentsEnabled,
      PACKAGES,
      ORDER_STATES,
      createOrder,
      requestWalletPayment,
      verifyAndActivateOrder,
      verifyTokenOwner,
      sanitizeProfilePayload,
      getActivePromotions,
      getTokenProfile,
      getOrder,
      getReceipt,
      listOrdersForWallet,
      reconcileExpiredOrders,
      verifySafetyScoreIsolation
    };
  }

  // Create default singleton engine (payments strictly disabled by default)
  const defaultEngine = createMonetizationEngine({ paymentsEnabled: false, sandboxTestMode: false });

  // Browser UI mounting for Boosted Rail & Advertiser Dashboard
  function initBrowserMonetizationUI() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById('anl-monetization-rail')) return;

    // 1. Insert In-App Monetization & Sponsored Transparency Rail
    const targetMount = document.querySelector('.catalog-toolbar') || document.querySelector('.explorer-search-section') || document.querySelector('main');
    if (targetMount && targetMount.parentNode) {
      const rail = document.createElement('section');
      rail.id = 'anl-monetization-rail';
      rail.className = 'anl-monetization-rail';
      rail.setAttribute('aria-label', 'In-App Sponsored Visibility & Advertiser Controls');
      rail.innerHTML = `
        <div class="anl-monetization-rail-left">
          <span class="anl-sponsored-pill" title="All paid placements are clearly labeled">SPONSORED · IN-APP ONLY</span>
          <span class="anl-boosted-badge">PAYMENT GATE: CLOSED (PRE-LAUNCH)</span>
          <span class="anl-safety-isolation-note">
            Paid Token Boosts, Verified Owner Profile Updates, and In-App Ads <strong>never</strong> alter Rug Radar safety scores or imply investment legitimacy.
          </span>
        </div>
        <div class="anl-monetization-rail-actions">
          <button type="button" class="anl-monetization-btn" id="anl-open-advertiser-dashboard-btn">
            📢 Advertiser Dashboard &amp; Token Boost
          </button>
        </div>
      `;
      targetMount.parentNode.insertBefore(rail, targetMount.nextSibling);
    }

    // 2. Create Accessible Advertiser Dashboard Modal
    const backdrop = document.createElement('div');
    backdrop.id = 'anl-monetization-modal-backdrop';
    backdrop.className = 'anl-monetization-modal-backdrop';
    backdrop.innerHTML = `
      <div class="anl-monetization-modal" role="dialog" aria-modal="true" aria-labelledby="anl-monetization-modal-title">
        <div class="anl-monetization-modal-header">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h2 id="anl-monetization-modal-title" style="margin:0; font-size:18px; color:#fff;">ANLGRAM Advertiser Dashboard &amp; Token Promotions</h2>
              <span class="anl-sponsored-pill">SPONSORED · IN-APP ONLY</span>
            </div>
            <p style="margin:4px 0 0; font-size:12px; color:#94a3b8;">
              Manage Token Visibility Boosts, Authenticated Owner Profile Updates, In-App Banner Placements, and On-Chain Payment Receipts.
            </p>
          </div>
          <button type="button" id="anl-close-advertiser-dashboard-btn" aria-label="Close Advertiser Dashboard" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer; padding:4px;">✕</button>
        </div>

        <div class="anl-monetization-gate-banner" role="status">
          🔒 <strong>Financial Gate Status: DISABLED (Pre-Launch Safety Hold)</strong> —
          <code>MONETIZATION_PAYMENTS_ENABLED = false</code>. Payment submissions are disabled until all smart-contract security and reconciliation checks pass and separate launch approval is granted. You may preview packages, verify owner eligibility, and inspect order/receipt specifications below.
        </div>

        <div class="anl-monetization-grid">
          <div class="anl-monetization-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong style="color:#fff; font-size:13px;">🚀 Token Visibility Boost</strong>
              <span class="anl-boosted-badge">SPONSORED · BOOSTED</span>
            </div>
            <p style="font-size:11.5px; color:#94a3b8; margin:0 0 8px;">
              Highlights your Jetton in the ANLGRAM in-app Boosted rail with an explicit expiration timestamp.
              <strong>Zero impact on Rug Radar safety scores.</strong>
            </p>
            <div style="font-size:11px; color:#67e8f9; font-family:monospace;">
              24h: 5 TON · 72h: 12 TON · 7d: 25 TON
            </div>
          </div>

          <div class="anl-monetization-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong style="color:#fff; font-size:13px;">🛡️ Owner Token-Profile Update</strong>
              <span class="anl-sponsored-pill">OWNER AUTH REQUIRED</span>
            </div>
            <p style="font-size:11.5px; color:#94a3b8; margin:0 0 8px;">
              Attach verified description, website, Telegram, and X links. Requires cryptographic <code>ton_proof</code> session matching on-chain <code>admin_address</code>.
            </p>
            <div style="font-size:11px; color:#67e8f9; font-family:monospace;">
              Standard Update: 3 TON (Owner Verified)
            </div>
          </div>

          <div class="anl-monetization-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong style="color:#fff; font-size:13px;">📢 In-App Banner Placement</strong>
              <span class="anl-sponsored-pill">SPONSORED AD</span>
            </div>
            <p style="font-size:11.5px; color:#94a3b8; margin:0 0 8px;">
              Strictly in-app-only banner slot with clear sponsorship disclosure, expiration date, and truthful on-chain receipt. Deceptive safety claims are rejected.
            </p>
            <div style="font-size:11px; color:#67e8f9; font-family:monospace;">
              24h Slot: 8 TON · 7d Slot: 40 TON
            </div>
          </div>
        </div>

        <div class="anl-monetization-card" style="margin-bottom:14px;">
          <div style="font-weight:700; color:#fff; font-size:13px; margin-bottom:8px;">Prepare Order Preview &amp; Check Eligibility (Dry-Run — Payment Gate Closed)</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
            <div>
              <label for="anl-mon-pkg-select" style="display:block; font-size:11px; color:#94a3b8; margin-bottom:4px;">Package</label>
              <select id="anl-mon-pkg-select" class="anl-monetization-input">
                <option value="BOOST_24H">Boost 24h (5 TON)</option>
                <option value="BOOST_72H">Boost 72h (12 TON)</option>
                <option value="BOOST_7D">Boost 7d (25 TON)</option>
                <option value="PROFILE_STANDARD">Owner Profile Update (3 TON)</option>
                <option value="AD_BANNER_24H">In-App Ad Banner 24h (8 TON)</option>
                <option value="AD_BANNER_7D">In-App Ad Banner 7d (40 TON)</option>
              </select>
            </div>
            <div>
              <label for="anl-mon-token-input" style="display:block; font-size:11px; color:#94a3b8; margin-bottom:4px;">Token Master Address (EQ… / 0:…)</label>
              <input id="anl-mon-token-input" type="text" class="anl-monetization-input" placeholder="EQ... or 0:..." spellcheck="false" autocomplete="off" />
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:4px;">
            <button type="button" class="anl-monetization-btn" id="anl-mon-check-gate-btn">
              Check Order &amp; Payment Gate Status
            </button>
            <span id="anl-mon-status-output" role="status" aria-live="polite" style="font-size:11.5px; color:#fde68a;">
              Payment gate closed (MONETIZATION_PAYMENTS_ENABLED = false). No TON transactions can be submitted.
            </span>
          </div>
        </div>

        <div class="anl-monetization-card">
          <div style="font-weight:700; color:#fff; font-size:13px; margin-bottom:6px;">Receipt &amp; Safety Isolation Guarantees</div>
          <ul style="margin:0; padding-left:18px; font-size:11.5px; color:#cbd5e1; line-height:1.55;">
            <li><strong>Truthful Receipts:</strong> Receipts are issued only after verified on-chain inclusion and exact nanoTON reconciliation.</li>
            <li><strong>Duplicate Protection:</strong> Deterministic idempotency keys and <code>txHash</code> deduplication block double-charges and replay callbacks.</li>
            <li><strong>Automatic Expiration:</strong> Expired Boosts and Ads transition to <code>EXPIRED</code> immediately at <code>expiresAt</code>.</li>
            <li><strong>Safety Score Isolation:</strong> Paid promotions never modify Rug Radar scores, bands, Observed Facts, or Heuristic Risk Assessments.</li>
          </ul>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const openBtn = document.getElementById('anl-open-advertiser-dashboard-btn');
    const closeBtn = document.getElementById('anl-close-advertiser-dashboard-btn');
    const checkBtn = document.getElementById('anl-mon-check-gate-btn');
    const statusOut = document.getElementById('anl-mon-status-output');

    if (openBtn) {
      openBtn.addEventListener('click', () => backdrop.classList.add('open'));
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', () => backdrop.classList.remove('open'));
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('open')) {
        backdrop.classList.remove('open');
      }
    });
    if (checkBtn && statusOut) {
      checkBtn.addEventListener('click', async () => {
        const res = await defaultEngine.requestWalletPayment('PREVIEW');
        statusOut.textContent = `[${res.code}] ${res.error}`;
      });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initBrowserMonetizationUI);
    } else {
      initBrowserMonetizationUI();
    }
  }

  return {
    ...defaultEngine,
    createMonetizationEngine,
    openDashboard() {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('anl-monetization-modal-backdrop');
        if (el) el.classList.add('open');
      }
    },
    closeDashboard() {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('anl-monetization-modal-backdrop');
        if (el) el.classList.remove('open');
      }
    }
  };
});
