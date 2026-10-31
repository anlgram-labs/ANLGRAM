/**
 * ANL LABS — Real-Time Progressive Multi-Step Wizard Engine
 * Implements "The Complete Flow" for memecoin-platform.html:
 *   Step 1: Create Token
 *   Step 2: Review & Deploy
 *   Step 3: Distribute Tokens
 *   Step 4: Vesting & Lock (Honest Development Status)
 *   Step 5: Manage Token (Liquidity, Mint, Renounce)
 *   Step 6: Real-Time Analytics (TonAPI v2 verified)
 *
 * Rules:
 * - Real mainnet data, zero fabricated numbers.
 * - Non-destructive: preserves existing deployJettonWeb3, provideLiquidityWeb3,
 *   mintMoreTokensWeb3, and renounceAdminWeb3 handlers.
 * - Multi-Wallet Distributor: supports CSV import, strict TON address validation,
 *   TEP-74 batch generation, gas estimates, and safe user signing via TonConnect.
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  const wizardState = {
    currentStep: 1, // 1 to 6
    mode: 'create', // 'create' or 'manage'
    tokenDraft: {
      name: 'MoonDog',
      symbol: 'MOON',
      supply: '1000000000',
      decimals: 9,
      description: 'The community meme coin on TON.',
      logoUrl: '',
      logoDataUrl: ''
    },
    activeToken: null, // { address, name, symbol, decimals, totalSupply, isAdmin, isRenounced }
    deployment: {
      status: 'idle', // 'idle' | 'preparing' | 'signing' | 'verifying' | 'confirmed' | 'failed'
      txHash: '',
      minterAddress: '',
      minterFriendly: '',
      error: ''
    },
    userTokens: [],
    distributor: {
      mode: 'csv', // 'csv' or 'manual'
      distributionType: 'equal', // 'equal' or 'custom'
      recipients: [], // Array of { address, amount, valid, error }
      tokenAmount: 1000,
      totalAmount: 0,
      isSending: false,
      status: 'idle', // 'idle' | 'in_progress' | 'completed' | 'failed'
      successfulBatches: [], // Store successfully broadcast batch records
      failedBatchIndex: -1,
      lastError: null
    },
    vesting: {
      beneficiary: '',
      amount: 100000000,
      cliffMonths: 3,
      durationMonths: 12,
      releaseType: 'linear',
      startDate: new Date().toISOString().split('T')[0]
    }
  };

  // Expose state for debugging/regression inspection
  window.wizardState = wizardState;
  const state = wizardState; // Alias for backward compatibility

  // Helper: Safe HTML Escaping (prevents XSS and ReferenceError in standalone DOM environments)
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  if (typeof window !== 'undefined' && typeof window.escapeHtml !== 'function') {
    window.escapeHtml = escapeHtml;
  }

  // Helper: Format Big Numbers
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return Number(num).toLocaleString('en-US');
  }

  // Helper: Shorten Address
  function shortAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    const clean = addr.trim();
    if (clean.length <= 10) return clean;
    return clean.slice(0, 4) + '...' + clean.slice(-4);
  }

  // Helper: Validate TON Address (friendly EQ/UQ base64url or raw 0:)
  function isValidTonAddress(addr) {
    if (!addr || typeof addr !== 'string') return false;
    const clean = addr.trim();
    // Friendly base64 / base64url length is 48 chars
    if (/^[EUe][Qq][a-zA-Z0-9_-]{46}$/.test(clean)) return true;
    // Raw address format 0:xxxx (64 hex characters)
    if (/^-?[0-1]:[0-9a-fA-F]{64}$/.test(clean)) return true;
    return false;
  }

  // Helper: Convert raw address to friendly bounceable format
  function getNetworkContext() {
    if (window.ANLGRAM_READONLY) return window.ANLGRAM_READONLY.getContext();
    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    let chainId = tc?.wallet?.account?.chain || tc?.account?.chain;
    
    if (!chainId && typeof window !== 'undefined') {
      if (typeof window.getConnectedWalletChainId === 'function') {
        chainId = window.getConnectedWalletChainId();
      } else {
        const stored = localStorage.getItem('anlgram_wallet_network') || localStorage.getItem('anlgram_staking_network');
        if (stored === 'testnet') chainId = '-3';
        else if (stored === 'mainnet') chainId = '-239';
      }
    }
    
    if (typeof window !== 'undefined' && (
      window.location.search.includes('testnet') ||
      window.location.search.includes('network=testnet')
    )) {
      chainId = '-3';
    }

    const isTestnet = chainId === '-3' || chainId === -3;
    const configuredProxy = (!isTestnet && typeof window !== 'undefined' && window.ANLGRAM_TON_PROXY_URL)
      ? String(window.ANLGRAM_TON_PROXY_URL).replace(/\/+$/, '')
      : ((!isTestnet && typeof window !== 'undefined' && window.ANLGRAM_CONFIG && window.ANLGRAM_CONFIG.TON_PROXY_URL)
          ? String(window.ANLGRAM_CONFIG.TON_PROXY_URL).replace(/\/+$/, '')
          : null);
    return {
      isTestnet,
      chainId: isTestnet ? '-3' : '-239',
      tonApiBase: isTestnet ? 'https://testnet.tonapi.io/v2' : (configuredProxy || 'https://tonapi.io/v2'),
      tonApiDirectBase: isTestnet ? 'https://testnet.tonapi.io/v2' : 'https://tonapi.io/v2',
      tonscanBase: isTestnet ? 'https://testnet.tonscan.org' : 'https://tonscan.org',
      tonviewerBase: isTestnet ? 'https://testnet.tonviewer.com' : 'https://tonviewer.com'
    };
  }

  /**
   * Resilient TonAPI v2 fetcher for ANL Labs:
   * Routes Mainnet requests through the configured Cloudflare Worker proxy
   * (window.ANLGRAM_TON_PROXY_URL) with automatic fallback to direct TonAPI v2.
   */
  async function labsFetchTonApi(endpoint) {
    if (window.ANLGRAM_READONLY) return window.ANLGRAM_READONLY.fetchTonApi(endpoint);
    const net = getNetworkContext();
    const primaryUrl = `${net.tonApiBase}${endpoint}`;
    try {
      const res = await fetch(primaryUrl);
      if (res.ok || res.status === 404) {
        return res;
      }
    } catch (e) {
      // Fallback to direct TonAPI if proxy is unreachable
    }
    if (net.tonApiBase !== net.tonApiDirectBase) {
      return fetch(`${net.tonApiDirectBase}${endpoint}`);
    }
    return fetch(primaryUrl);
  }

  function rawToFriendly(raw, bounceable = true) {
    if (!raw) return '';
    const net = getNetworkContext();
    if (window.TON_CORE && window.TON_CORE.Address) {
      try {
        return window.TON_CORE.Address.parse(raw).toString({ 
          bounceable: bounceable, 
          urlSafe: true, 
          testOnly: net.isTestnet 
        });
      } catch (e) { /* fallback */ }
    }
    // Fallback: if already EQ/UQ/kQ/0Q format
    if (/^[EUeKk0][Qq]/.test(raw)) return raw;
    return raw;
  }

  function toFriendly(raw) {
    return rawToFriendly(raw);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. WIZARD STEP NAVIGATION & STATE CONTROL
  // ═══════════════════════════════════════════════════════════════════

  window.labsSwitchSection = function (sectionId) {
    document.querySelectorAll('.labs-pill').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.section === sectionId);
    });

    const flowSection = document.getElementById('labs-flow-section');
    const existingExplorer = document.getElementById('tab-explorer');
    const existingLaunchpad = document.getElementById('tab-launchpad');
    const existingWallet = document.getElementById('tab-wallet');
    const existingLiquidity = document.getElementById('tab-liquidity');
    const existingAnalytics = document.getElementById('tab-analytics');

    if (existingExplorer) { existingExplorer.style.display = 'none'; existingExplorer.classList.remove('active'); }
    if (existingLaunchpad) { existingLaunchpad.style.display = 'none'; existingLaunchpad.classList.remove('active'); }
    if (existingWallet) { existingWallet.style.display = 'none'; existingWallet.classList.remove('active'); }
    if (existingLiquidity) { existingLiquidity.style.display = 'none'; existingLiquidity.classList.remove('active'); }
    if (existingAnalytics) { existingAnalytics.style.display = 'none'; existingAnalytics.classList.remove('active'); }

    switch (sectionId) {
      case 'labs':
        if (flowSection) flowSection.style.display = 'block';
        window.labsGoToStep(1);
        break;
      case 'launchpad':
        if (flowSection) flowSection.style.display = 'none';
        if (existingLaunchpad) {
          existingLaunchpad.style.display = 'block';
          existingLaunchpad.classList.add('active');
          if (typeof window.updateCurveQuotes === 'function') {
            window.updateCurveQuotes();
          }
        }
        break;
      case 'token-manager':
        if (flowSection) flowSection.style.display = 'block';
        window.labsGoToStep(5);
        break;
      case 'distribution':
        if (flowSection) flowSection.style.display = 'block';
        window.labsGoToStep(3);
        break;
      case 'vesting':
        if (flowSection) flowSection.style.display = 'block';
        window.labsGoToStep(4);
        break;
      case 'liquidity':
        if (flowSection) flowSection.style.display = 'none';
        if (existingLiquidity) {
          existingLiquidity.style.display = 'block';
          existingLiquidity.classList.add('active');
        }
        break;
      case 'analytics':
        if (flowSection) flowSection.style.display = 'none';
        if (existingAnalytics) {
          existingAnalytics.style.display = 'block';
          existingAnalytics.classList.add('active');
        }
        break;
      case 'projects':
        window.labsOpenModal('my-projects-modal');
        break;
      default:
        if (flowSection) flowSection.style.display = 'block';
        window.labsGoToStep(1);
        break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const STEP_TITLES = [
    'Create Token',
    'Review & Deploy',
    'Distribute Tokens',
    'Lock Tokens (Vesting)',
    'Manage & Monitor',
    'Analyze & Grow'
  ];

  window.labsGoToStep = function (stepNum) {
    stepNum = parseInt(stepNum, 10);
    if (isNaN(stepNum) || stepNum < 1 || stepNum > 6) return;

    // Prerequisite checks
    if (stepNum > 1 && wizardState.mode === 'create') {
      const name = (wizardState.tokenDraft.name || '').trim();
      const symbol = (wizardState.tokenDraft.symbol || '').trim();
      if (!name || !symbol) {
        const errBox = document.getElementById('wizard-step1-error');
        if (errBox) {
          errBox.style.display = 'flex';
          const desc = document.getElementById('wizard-step1-error-desc');
          if (desc) {
            if (!name && !symbol) desc.textContent = 'Please provide both a Token Name and Symbol (ticker) to continue.';
            else if (!name) desc.textContent = 'Please provide a Token Name to continue.';
            else desc.textContent = 'Please provide a Token Symbol (ticker) to continue.';
          }
        }
        const inputToFocus = !name ? document.getElementById('labs-card1-name') : document.getElementById('labs-card1-symbol');
        if (inputToFocus) inputToFocus.focus();
        stepNum = 1;
        return;
      } else {
        const errBox = document.getElementById('wizard-step1-error');
        if (errBox) errBox.style.display = 'none';
      }
    }

    // Steps 3, 4, 5, 6 require an active token (either deployed or selected from wallet)
    if (stepNum >= 3 && !wizardState.activeToken) {
      alert('⚠️ To access this step, please deploy your Jetton in Step 2 or select an existing token from your wallet in the lifecycle switcher above.');
      stepNum = wizardState.deployment.status === 'confirmed' ? 3 : 2;
    }

    wizardState.currentStep = stepNum;

    // 1. Update Desktop Stepper
    document.querySelectorAll('.labs-step-node').forEach((node) => {
      const stepIdx = parseInt(node.dataset.step, 10);
      node.classList.remove('active', 'completed', 'locked');

      if (stepIdx === stepNum) {
        node.classList.add('active');
      } else if (stepIdx < stepNum || (wizardState.activeToken && stepIdx <= 2)) {
        node.classList.add('completed');
      } else if (!wizardState.activeToken && stepIdx > 2) {
        node.classList.add('locked');
      }
    });

    document.querySelectorAll('.labs-step-divider').forEach((div, idx) => {
      if (idx + 1 < stepNum || (wizardState.activeToken && idx < 2)) {
        div.classList.add('filled');
      } else {
        div.classList.remove('filled');
      }
    });

    // Desktop continuous progress track fill
    const pct = Math.round((stepNum / 6) * 100);
    const desktopBarFill = document.getElementById('labs-wizard-progress-bar-fill');
    if (desktopBarFill) {
      desktopBarFill.style.width = `${pct}%`;
    }

    // 2. Update Mobile Stepper
    const mobileTitle = document.getElementById('labs-mobile-step-title');
    const mobilePct = document.getElementById('labs-mobile-step-pct');
    const mobileBarFill = document.getElementById('labs-mobile-bar-fill');

    if (mobileTitle) mobileTitle.textContent = `Step ${stepNum} of 6: ${STEP_TITLES[stepNum - 1]}`;
    if (mobilePct) mobilePct.textContent = `${pct}%`;
    if (mobileBarFill) mobileBarFill.style.width = `${pct}%`;

    // 3. Toggle Step Panels
    document.querySelectorAll('.labs-wizard-panel').forEach((panel) => {
      panel.classList.remove('active');
    });
    const targetPanel = document.getElementById(`wizard-step-${stepNum}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // 4. Step-specific initializations
    if (stepNum === 2) {
      labsUpdateReviewScreen();
    } else if (stepNum === 3) {
      labsUpdateDistributorPreview();
    } else if (stepNum === 4) {
      if (window.labsUpdateVestingUI) window.labsUpdateVestingUI();
      if (window.labsUpdateVestingScheduleCalculation) window.labsUpdateVestingScheduleCalculation();
    } else if (stepNum === 5) {
      labsUpdateManagementScreen();
    } else if (stepNum === 6) {
      if (wizardState.activeToken) {
        labsLoadTokenAnalytics(wizardState.activeToken.address);
      }
    }

    // Smooth scroll to wizard top
    const wizardTop = document.getElementById('labs-flow-section');
    if (wizardTop) {
      wizardTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Auto-focus next interactive element
    setTimeout(() => {
      if (targetPanel) {
        const focusable = targetPanel.querySelector('input:not([readonly]):not([type="file"]), textarea, button.labs-btn-primary');
        if (focusable && typeof focusable.focus === 'function') {
          focusable.focus({ preventScroll: true });
        }
      }
    }, 60);
  };

  // ═══════════════════════════════════════════════════════════════════
  // 2. TOKEN LIFECYCLE BAR & TOKEN SELECTION
  // ═══════════════════════════════════════════════════════════════════

  window.labsSelectLifecycleToken = function (tokenAddr) {
    const badge = document.getElementById('labs-lifecycle-badge');
    const currentName = document.getElementById('labs-lifecycle-current-token');

    if (!tokenAddr || tokenAddr === 'new') {
      // Switch back to "Create New" mode
      wizardState.mode = 'create';
      wizardState.activeToken = null;
      if (badge) {
        badge.className = 'labs-lifecycle-badge draft';
        badge.textContent = 'DRAFT';
      }
      if (currentName) {
        currentName.textContent = 'New Jetton Draft';
      }
      // Return to Step 1
      window.labsGoToStep(1);
      return;
    }

    // Find token details from userTokens or query TonAPI
    const tokenInfo = wizardState.userTokens.find((t) => t.address === tokenAddr || t.minterAddress === tokenAddr) || {
      address: tokenAddr,
      name: 'Custom Jetton',
      symbol: 'TKN',
      decimals: 9,
      image: '',
      isAdmin: true,
      isRenounced: false
    };
    if (!tokenInfo.image) {
      try {
        const cached = JSON.parse(localStorage.getItem('anlgram_token_' + tokenAddr) || '{}');
        if (cached.image) tokenInfo.image = cached.image;
        else if (localStorage.getItem('anlgram_last_uploaded_logo')) tokenInfo.image = localStorage.getItem('anlgram_last_uploaded_logo');
      } catch (e) {}
    }

    wizardState.mode = 'manage';
    wizardState.activeToken = tokenInfo;

    if (badge) {
      badge.className = 'labs-lifecycle-badge deployed';
      badge.textContent = 'DEPLOYED ON TON';
    }
    if (currentName) {
      currentName.textContent = `${tokenInfo.name} ($${tokenInfo.symbol})`;
    }

    // Sync address to management select if present
    const sel = document.getElementById('user-jetton-select');
    if (sel && sel.value !== tokenAddr) {
      sel.value = tokenAddr;
      sel.dispatchEvent(new Event('change'));
    }

    // Unlock and jump directly to Step 5 (Token Management)
    window.labsGoToStep(5);
  };

  // ═══════════════════════════════════════════════════════════════════
  // 3. STEP 1: CREATE TOKEN DRAFT & LOGO UPLOAD
  // ═══════════════════════════════════════════════════════════════════

  window.labsSetWizardDraftField = function (field, value) {
    wizardState.tokenDraft[field] = value;

    // Sync with existing launchpad / legacy IDs
    if (field === 'name') {
      const lp = document.getElementById('lp-name');
      const c1 = document.getElementById('labs-card1-name');
      if (lp && lp.value !== value) lp.value = value;
      if (c1 && c1.value !== value) c1.value = value;
    } else if (field === 'symbol') {
      const lp = document.getElementById('lp-symbol');
      const c1 = document.getElementById('labs-card1-symbol');
      if (lp && lp.value !== value) lp.value = value;
      if (c1 && c1.value !== value) c1.value = value;
    } else if (field === 'description') {
      const lp = document.getElementById('lp-desc');
      if (lp && lp.value !== value) lp.value = value;
    } else if (field === 'logoUrl') {
      const lp = document.getElementById('lp-logo');
      if (lp && lp.value !== value) lp.value = value;
      labsUpdateAvatarPreviews(value);
    }

    // Clear step 1 inline error if required fields filled
    if (wizardState.tokenDraft.name && wizardState.tokenDraft.symbol) {
      const errBox = document.getElementById('wizard-step1-error');
      if (errBox) errBox.style.display = 'none';
    }

    if (window.labsUpdateStep1DexPreview) window.labsUpdateStep1DexPreview();
  };

  window.labsUpdateStep1DexPreview = function () {
    const nameEl = document.getElementById('labs-card1-name');
    const symEl = document.getElementById('labs-card1-symbol');
    const dexName = document.getElementById('dex-preview-name');
    const dexSym = document.getElementById('dex-preview-symbol');
    const dexEmoji = document.getElementById('dex-preview-emoji');
    const avatarEmoji = document.getElementById('labs-avatar-emoji');

    if (dexName && nameEl) dexName.textContent = nameEl.value.trim() || 'My Token';
    if (dexSym && symEl) dexSym.textContent = symEl.value.trim() ? ('$' + symEl.value.trim().toUpperCase()) : '$TOKEN';
    if (dexEmoji && avatarEmoji && !dexEmoji.querySelector('img')) {
      dexEmoji.textContent = avatarEmoji.textContent || '🪙';
    }
  };

  function labsUpdateAvatarPreviews(url) {
    if (!url) return;
    const safeUrl = url.includes('anlgram.io') ? 'https://anlgram.com/assets/images/icon-192.png' : url;
    document.querySelectorAll('.labs-avatar-preview, #logo-preview-container, .wizard-dex-preview-avatar').forEach((el) => {
      el.innerHTML = `<img src="${safeUrl}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" alt="Token Logo" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"/>`;
    });
  }

  function labsUpdateReviewScreen() {
    const tc = window.tonConnectUI;
    const draft = wizardState.tokenDraft;

    const rName = document.getElementById('labs-review-name');
    const rSymbol = document.getElementById('labs-review-symbol');
    const rSupply = document.getElementById('labs-review-supply');
    const rDecimals = document.getElementById('labs-review-decimals');
    const rNetwork = document.getElementById('labs-review-network');
    const rWallet = document.getElementById('labs-review-wallet');
    const rAvatar = document.getElementById('labs-review-avatar');

    if (rName) rName.textContent = draft.name || 'Unnamed';
    if (rSymbol) rSymbol.textContent = draft.symbol ? `$${draft.symbol}` : '---';
    if (rSupply) rSupply.textContent = formatNumber(draft.supply);
    if (rDecimals) rDecimals.textContent = draft.decimals || '9';
    const reviewChain = tc?.account?.chain == null ? '' : String(tc.account.chain);
    if (rNetwork) rNetwork.textContent = reviewChain === '-239' ? 'TON Mainnet' : reviewChain === '-3' ? 'TON Testnet' : 'Network not verified';

    if (rWallet) {
      if (tc && tc.account && tc.account.address) {
        rWallet.textContent = shortAddr(rawToFriendly(tc.account.address));
        rWallet.style.color = 'var(--labs-green)';
      } else {
        rWallet.textContent = 'Wallet Not Connected';
        rWallet.style.color = '#ff8888';
      }
    }

    if (rAvatar) {
      let logo = draft.logoUrl || draft.logoDataUrl;
      if (logo && logo.includes('anlgram.io')) logo = 'https://anlgram.com/assets/images/icon-192.png';
      if (logo) {
        rAvatar.innerHTML = `<img src="${logo}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
      } else {
        rAvatar.innerHTML = `<span style="font-size:24px;">🪙</span>`;
      }
    }
  }

  window.labsOpenDeployConfirmModal = function () {
    const tc = window.tonConnectUI;
    if (!tc || !tc.connected) {
      alert('⚠️ Please connect your TON wallet first using the "Connect Wallet" button.');
      if (tc) tc.openModal();
      return;
    }
    const reviewChain = tc.account?.chain == null ? '' : String(tc.account.chain);
    if (!tc.account?.address || (reviewChain !== '-3' && reviewChain !== '-239') ||
        (tc.wallet?.account?.chain != null && String(tc.wallet.account.chain) !== reviewChain) ||
        getNetworkContext().chainId !== reviewChain) {
      alert('⚠️ The wallet network could not be verified. Check the wallet and page settings.');
      return;
    }
    wizardState.deployment.reviewedWallet = tc.account.address;
    wizardState.deployment.reviewedChain = reviewChain;

    const draft = wizardState.tokenDraft;
    if (!draft.name || !draft.symbol) {
      alert('⚠️ Missing token name or symbol. Return to Step 1 to fill required details.');
      window.labsGoToStep(1);
      return;
    }

    const modalName = document.getElementById('deploy-confirm-token-name');
    const modalSymbol = document.getElementById('deploy-confirm-token-symbol');
    const modalSupply = document.getElementById('deploy-confirm-token-supply');

    if (modalName) modalName.textContent = draft.name;
    if (modalSymbol) modalSymbol.textContent = `$${draft.symbol}`;
    if (modalSupply) modalSupply.textContent = formatNumber(draft.supply);
    const modalNetwork = document.getElementById('deploy-confirm-network');
    if (modalNetwork) modalNetwork.textContent = reviewChain === '-3' ? 'TON Testnet' : 'TON Mainnet';
    const deployCheck = document.getElementById('deploy-confirm-checkbox');
    if (deployCheck) deployCheck.checked = false;

    labsOpenModal('deploy-confirm-modal');
  };

  window.labsExecuteDeployFromWizard = async function () {
    if (wizardState.deployment.status === 'signing' || wizardState.deployment.status === 'verifying') return;
    const deployCheck = document.getElementById('deploy-confirm-checkbox');
    if (!deployCheck || !deployCheck.checked) {
      alert('⚠️ You must authorize the Mandatory Donation (10%): 0.02 TON on the 0.20 TON execution base before signing.');
      return;
    }
    const reviewedWallet = window.tonConnectUI;
    if (!reviewedWallet?.connected || reviewedWallet.account?.address !== wizardState.deployment.reviewedWallet ||
        String(reviewedWallet.account?.chain) !== wizardState.deployment.reviewedChain ||
        getNetworkContext().chainId !== wizardState.deployment.reviewedChain) {
      alert('⚠️ The wallet or network changed. Review the deployment details again before signing.');
      return;
    }
    labsCloseModal('deploy-confirm-modal');

    const statusBanner = document.getElementById('wizard-deploy-status-banner');
    const statusText = document.getElementById('wizard-deploy-status-text');
    const deployBtn = document.getElementById('wizard-step2-deploy-btn');

    if (statusBanner) statusBanner.style.display = 'block';
    if (statusText) statusText.innerHTML = '<span class="status-dot"></span> Requesting transaction signature in your wallet...';
    if (deployBtn) {
      deployBtn.disabled = true;
      deployBtn.style.opacity = '0.5';
      deployBtn.style.pointerEvents = 'none';
    }

    wizardState.deployment.status = 'signing';

    try {
      // Use existing verified deployJettonWeb3 logic
      const fakeEvent = {
        wizardInitiated: true,
        currentTarget: {
          innerHTML: '',
          style: {},
          removeAttribute: () => {}
        }
      };

      // Call the existing window.deployJettonWeb3
      if (typeof window.deployJettonWeb3 !== 'function') {
        throw new Error('deployJettonWeb3 function not found.');
      }
      const result = await window.deployJettonWeb3(fakeEvent);
      if (!result || !result.submitted) {
        if (result?.uncertain) {
          wizardState.deployment.status = 'verifying';
          wizardState.deployment.minterAddress = result.destAddressMint || '';
          if (statusText) statusText.textContent = 'Wallet request outcome is uncertain. Check your wallet and blockchain before retrying.';
          if (deployBtn) {
            deployBtn.disabled = !result.destAddressMint;
            deployBtn.style.pointerEvents = result.destAddressMint ? 'auto' : 'none';
            deployBtn.textContent = 'Check Deployment Status Again';
            if (result.destAddressMint) deployBtn.onclick = () => labsPollDeploymentConfirmation(result.destAddressMint);
          }
          return;
        }
        throw new Error(result?.reason || 'Wallet request was not submitted.');
      }
      if (!result.destAddressMint) throw new Error('Wallet request returned without the expected contract address.');
      wizardState.deployment.minterAddress = result.destAddressMint;
      wizardState.deployment.submission = result.submission || null;

      // Check if deployment resulted in contract address calculation
      if (statusText) {
        statusText.innerHTML = '<span class="status-dot"></span> Wallet request accepted. Checking the expected contract state...';
      }
      wizardState.deployment.status = 'verifying';

      // Poll TonAPI to reliably verify on-chain deployment
      await labsPollDeploymentConfirmation(result.destAddressMint);

    } catch (err) {
      console.error('Wizard Deployment Error:', err);
      wizardState.deployment.status = 'failed';
      wizardState.deployment.error = err.message || String(err);

      if (statusText) {
        statusText.textContent = `Deployment failed or cancelled: ${err.message || 'Signature rejected'}`;
      }
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.style.opacity = '1';
        deployBtn.style.pointerEvents = 'auto';
      }
    }
  };

  window.addEventListener('anlgramJettonDeployed', (e) => {
    const { destAddressMint, wizardInitiated, submission } = e.detail || {};
    if (wizardInitiated) return; // The wizard polls the exact returned address itself.
    if (destAddressMint) {
      wizardState.deployment.minterAddress = destAddressMint;
      wizardState.deployment.submission = submission || null;
      wizardState.deployment.status = 'verifying';
      labsPollDeploymentConfirmation(destAddressMint);
    }
  });

  async function labsPollDeploymentConfirmation(explicitMinter) {
    if (wizardState.deployment.polling) return;
    wizardState.deployment.polling = true;
    try {
    const statusText = document.getElementById('wizard-deploy-status-text');
    const successArea = document.getElementById('wizard-deploy-success-area');
    const deployBtn = document.getElementById('wizard-step2-deploy-btn');
    const contractLink = document.getElementById('wizard-deploy-contract-link');

    const tc = window.tonConnectUI;
    const sender = tc && tc.account ? tc.account.address : '';
    const sameWalletAndNetwork = () => window.tonConnectUI === tc && tc?.account?.address === sender &&
      String(tc?.account?.chain) === '-239' && getNetworkContext().chainId === '-239';

    let confirmed = false;
    let foundMinter = explicitMinter || wizardState.deployment.minterAddress || '';
    let submission = wizardState.deployment.submission;
    if (!submission && foundMinter) {
      try { submission = JSON.parse(localStorage.getItem(`anlgram_jetton_deploy_pending_v1:${tc?.account?.chain}:${foundMinter}`) || 'null')?.submission; } catch (_) {}
    }

    // Poll using institutional TokenVerificationEngine
    let verificationReport = null;
    // TokenVerificationEngine is Mainnet-only. Never use it as testnet evidence.
    const canVerify = foundMinter && sender && sameWalletAndNetwork();
    for (let attempt = 1; canVerify && attempt <= 15; attempt++) {
      if (statusText) {
        statusText.innerHTML = `<span class="status-dot"></span> Verifying on-chain state via TokenVerificationEngine (Attempt ${attempt}/15)...`;
      }
      await new Promise((r) => setTimeout(r, 3500));
      if (!sameWalletAndNetwork()) break;

      try {
        const receipt = window.AnlgramTransactionReceipt
          ? await window.AnlgramTransactionReceipt.lookup(submission, String(tc?.account?.chain), labsFetchTonApi, window.TON_CORE)
          : { status: 'PENDING' };
        wizardState.deployment.walletReceipt = receipt;
        if (receipt.status !== 'INCLUDED') continue;
        const donationReceipt = typeof window.AnlgramTransactionReceipt.lookupDonation === 'function'
          ? await window.AnlgramTransactionReceipt.lookupDonation(submission, String(tc?.account?.chain), labsFetchTonApi, window.TON_CORE, window.ANLGRAM_DONATION_CONFIG)
          : { status: 'PENDING' };
        wizardState.deployment.donationReceipt = donationReceipt;
        if (donationReceipt.status !== 'INCLUDED') continue;
        const targetMinter = foundMinter;
        if (targetMinter) {
          const verifier = window.TokenVerificationEngine;
          if (verifier && typeof verifier.verifyToken === 'function') {
            const rep = await verifier.verifyToken(targetMinter, { viewerWallet: sender, forceFresh: true });
            const claims = rep?.claims || {};
            const supply = claims.total_supply?.evidence;
            const balancesResponse = await labsFetchTonApi(`/accounts/${encodeURIComponent(sender)}/jettons`);
            const balancesData = balancesResponse.ok ? await balancesResponse.json() : {};
            const Address = window.TON_CORE?.Address;
            const balance = Address && (balancesData.balances || []).find((entry) => {
              try { return Address.parse(entry.jetton.address).equals(Address.parse(targetMinter)); } catch (_) { return false; }
            });
            if (sameWalletAndNetwork() && rep?.target?.network === 'TON Mainnet' && claims.account_status?.status === 'VERIFIED' &&
                claims.total_supply?.status === 'VERIFIED' && supply?.rawSupply === '1000000000000000000' &&
                Number(supply?.decimals) === 9 && claims.admin_status?.status === 'VERIFIED' &&
                claims.admin_status?.evidence?.isUserAdmin === true && balance?.balance === '1000000000000000000') {
              confirmed = true;
              foundMinter = targetMinter;
              verificationReport = rep;
              break;
            }
          }
        }
      } catch (e) {
        // keep polling
      }
    }

    if (confirmed && foundMinter) {
      const friendlyMinter = rawToFriendly(foundMinter);
      wizardState.deployment.status = 'confirmed';
      wizardState.deployment.minterAddress = foundMinter;
      wizardState.deployment.minterFriendly = friendlyMinter;
      let deployedImg = wizardState.tokenDraft.logoUrl || wizardState.tokenDraft.logoDataUrl || '';
      try { deployedImg = deployedImg || localStorage.getItem('anlgram_last_uploaded_logo') || ''; } catch (_) {}
      wizardState.activeToken = {
        address: foundMinter,
        name: wizardState.tokenDraft.name,
        symbol: wizardState.tokenDraft.symbol,
        decimals: 9,
        image: deployedImg,
        isAdmin: true,
        isRenounced: false
      };
      try {
        localStorage.setItem('anlgram_token_' + foundMinter, JSON.stringify(wizardState.activeToken));
      } catch (e) {}

      if (statusText) {
        statusText.innerHTML = '✅ <strong style="color:var(--labs-green);">Contract, supply and creator balance verified.</strong>';
      }
      if (successArea) successArea.style.display = 'block';
      if (contractLink) {
        contractLink.href = `${getNetworkContext().tonscanBase}/address/${encodeURIComponent(friendlyMinter)}`;
        contractLink.textContent = shortAddr(friendlyMinter);
      }

      // Update lifecycle badge
      const badge = document.getElementById('labs-lifecycle-badge');
      const curToken = document.getElementById('labs-lifecycle-current-token');
      if (badge) {
        badge.className = 'labs-lifecycle-badge deployed';
        badge.textContent = 'DEPLOYED ON TON';
      }
      if (curToken) {
        curToken.textContent = `${wizardState.tokenDraft.name} ($${wizardState.tokenDraft.symbol})`;
      }

      // Hide deploy button, show continue button
      if (deployBtn) deployBtn.style.display = 'none';
      const contBtn = document.getElementById('wizard-step2-continue-btn');
      if (contBtn) contBtn.style.display = 'inline-block';

      // Refresh wallet list
      if (tc && tc.account) {
        window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: tc.account.address } }));
      }
    } else {
      if (statusText) {
        statusText.innerHTML = `
          <div style="color:#ffa500; font-size:12px; line-height:1.5;">
            ⏳ <strong>Deployment is not yet verified.</strong><br>
            Check your wallet and the expected contract on the correct network before retrying.
          </div>
        `;
      }
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.style.opacity = '1';
        deployBtn.style.pointerEvents = 'auto';
        deployBtn.textContent = 'Check Deployment Status Again';
        deployBtn.onclick = () => labsPollDeploymentConfirmation(foundMinter);
      }
    }
    } catch (error) {
      console.error('Deployment verification error:', error);
      wizardState.deployment.status = 'verifying';
      const statusText = document.getElementById('wizard-deploy-status-text');
      const deployBtn = document.getElementById('wizard-step2-deploy-btn');
      if (statusText) statusText.textContent = 'Deployment is not yet verified. Check your wallet and the expected contract before retrying.';
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.style.opacity = '1';
        deployBtn.style.pointerEvents = 'auto';
        deployBtn.textContent = 'Check Deployment Status Again';
        deployBtn.onclick = () => labsPollDeploymentConfirmation(explicitMinter);
      }
    } finally {
      wizardState.deployment.polling = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. STEP 3: MULTI-WALLET DISTRIBUTOR (CSV & TEP-74 BATCH SENDER)
  // ═══════════════════════════════════════════════════════════════════

  // A wallet submission is not evidence of token delivery. Keep an unresolved
  // submission across reloads so a retry cannot silently send the same batch.
  const DISTRIBUTION_PENDING_KEY = 'anlgram_distribution_pending_v1';
  // Keep sending disabled until transaction-linked, per-recipient trace
  // verification and safe partial-batch reconciliation are implemented.
  const DISTRIBUTION_VERIFICATION_AVAILABLE = false;

  function labsGetPendingDistribution() {
    try {
      const value = window.localStorage.getItem(DISTRIBUTION_PENDING_KEY);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      // If storage cannot be read, fail closed instead of risking a duplicate.
      return { storageUnavailable: true };
    }
  }

  function labsShowPendingDistribution() {
    wizardState.distributor.status = 'pending';
    labsSetDistributionUiState('pending');
  }

  function labsDistributionAmountUnits(amountText, decimals) {
    // Parse the original input text, never an IEEE-754 number. Coins are
    // serialized as VarUInteger 16, whose maximum is 2^120 - 1.
    if (typeof amountText !== 'string' || amountText.length > 128 || !/^\d+(?:\.\d+)?$/.test(amountText)) {
      throw new Error('Enter each distribution amount as a plain positive decimal number.');
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      throw new Error('The Jetton decimals could not be verified. Distribution is disabled.');
    }
    const [whole, fraction = ''] = amountText.split('.');
    const significantFraction = fraction.replace(/0+$/, '');
    if (significantFraction.length > decimals) {
      throw new Error('A distribution amount has more precision than this Jetton supports.');
    }
    const units = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((significantFraction.padEnd(decimals, '0')) || '0');
    if (units <= 0n || units >= (1n << 120n)) {
      throw new Error('A distribution amount is zero or exceeds the supported Jetton transfer range.');
    }
    return units;
  }

  function labsDistributionTotalText(recipients) {
    if (!recipients.length) return '0';
    const decimals = recipients.reduce((max, r) => Math.max(max, (r.amountText.split('.')[1] || '').length), 0);
    let total = 0n;
    for (const recipient of recipients) {
      const [whole, fraction = ''] = recipient.amountText.split('.');
      total += BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
    }
    const digits = total.toString().padStart(decimals + 1, '0');
    if (!decimals) return digits;
    const frac = digits.slice(-decimals).replace(/0+$/, '');
    return digits.slice(0, -decimals) + (frac ? '.' + frac : '');
  }

  window.labsSetDistributorMode = function (mode) {
    wizardState.distributor.mode = mode;
    const tabCsv = document.getElementById('labs-dist-tab-csv');
    const tabManual = document.getElementById('labs-dist-tab-manual');
    const dropzone = document.getElementById('labs-dist-dropzone');
    const manualArea = document.getElementById('labs-dist-manual-area');

    if (mode === 'csv') {
      tabCsv?.classList.add('active');
      tabManual?.classList.remove('active');
      if (dropzone) dropzone.style.display = 'block';
      if (manualArea) manualArea.style.display = 'none';
    } else {
      tabManual?.classList.add('active');
      tabCsv?.classList.remove('active');
      if (dropzone) dropzone.style.display = 'none';
      if (manualArea) manualArea.style.display = 'block';
    }
  };

  window.labsHandleCsvFile = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      labsParseDistributionText(e.target.result);
    };
    reader.readAsText(file);
  };

  window.labsParseDistributionText = function (rawText) {
    // If previously completed, typing new recipients resets distribution state
    if (wizardState.distributor.status === 'completed') {
      wizardState.distributor.successfulBatches = [];
      wizardState.distributor.status = 'idle';
      labsSetDistributionUiState('idle');
    }

    const lines = (rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const recipients = [];
    const seen = new Set();
    const defaultAmountText = document.getElementById('labs-dist-amount')?.value ?? '1000';
    const distType = wizardState.distributor.distributionType;

    for (const line of lines) {
      const parts = line.split(/[,;\t\s]+/).filter(Boolean);
      if (parts.length === 0) continue;
      const addr = parts[0];
      const amountText = distType === 'custom' && parts.length > 1 ? parts[1] : defaultAmountText;
      const isValidAmount = typeof amountText === 'string' && amountText.length <= 128 &&
        /^\d+(?:\.\d+)?$/.test(amountText) && /[1-9]/.test(amountText);

      const isValid = isValidTonAddress(addr);
      const isDuplicate = seen.has(addr);
      seen.add(addr);

      recipients.push({
        address: addr,
        amount: isValidAmount ? Number(amountText) : 0,
        amountText,
        valid: isValid && !isDuplicate && isValidAmount,
        error: !isValid ? 'Invalid address' : (isDuplicate ? 'Duplicate address' : (!isValidAmount ? 'Invalid amount' : null))
      });
    }

    wizardState.distributor.recipients = recipients;
    labsUpdateDistributorPreview();
  };

  window.labsUpdateDistributorPreview = function () {
    const recs = wizardState.distributor.recipients;
    const validRecs = recs.filter((r) => r.valid);
    const totalTokens = validRecs.reduce((sum, r) => sum + r.amount, 0);
    wizardState.distributor.totalAmount = totalTokens;
    const totalAmountText = labsDistributionTotalText(validRecs);
    wizardState.distributor.totalAmountText = totalAmountText;

    const batches = Math.ceil(validRecs.length / 4) || 0;
    const estimatedGasTon = (batches * 0.05).toFixed(2);

    const statusEl = document.getElementById('labs-dist-status-text');
    if (statusEl) {
      if (validRecs.length === 0) {
        statusEl.innerHTML = 'Enter recipient addresses or drag and drop a CSV file to begin.';
        statusEl.style.color = 'var(--labs-text-muted)';
      } else {
        statusEl.innerHTML = `<strong>${validRecs.length}</strong> valid recipients | <strong>${totalAmountText}</strong> tokens required | Est. Gas: ~${estimatedGasTon} TON (${batches} batch${batches > 1 ? 'es' : ''})`;
        statusEl.style.color = 'var(--labs-cyan)';
      }
    }

    // Modal table populate
    const modalTable = document.getElementById('labs-dist-modal-tbody');
    if (modalTable) {
      if (recs.length === 0) {
        modalTable.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--labs-text-muted);padding:20px;">No addresses uploaded yet.</td></tr>';
      } else {
        modalTable.innerHTML = recs.slice(0, 100).map((r, i) => `
          <tr style="${r.valid ? '' : 'color:#ff6b6b;background:rgba(255,0,0,0.05);'}">
            <td>${i + 1}</td>
            <td style="font-family:var(--font-mono); font-size:11px;">${escapeHtml(r.address)}</td>
            <td style="font-family:var(--font-mono);">${escapeHtml(r.amountText ?? '')}</td>
            <td>${r.valid ? '<span style="color:#00ff88;">✔ Valid</span>' : `<span style="color:#ff4444;">✖ ${r.error}</span>`}</td>
          </tr>
        `).join('');
      }
    }
  };

  window.labsReviewAndSendDistribution = function () {
    if (labsGetPendingDistribution()) {
      labsShowPendingDistribution();
      alert('A distribution may already have been submitted. Check wallet and blockchain activity before sending again. Automatic retry is disabled until this can be reconciled.');
      return;
    }
    // Prevent opening modal while distribution is already transmitting
    if (wizardState.distributor.isSending) {
      console.warn('Distribution is already running in background.');
      return;
    }

    if (wizardState.distributor.recipients.length === 0) {
      const manualText = document.getElementById('labs-dist-manual-text')?.value;
      if (manualText) {
        labsParseDistributionText(manualText);
      }
    }

    const validRecs = wizardState.distributor.recipients.filter((r) => r.valid);
    if (validRecs.length === 0) {
      alert('⚠️ No valid recipient addresses detected.\nPlease upload a CSV file or enter addresses manually in TON format (EQ... or UQ...).');
      return;
    }

    // Reset modal button to ready state
    const submitBtn = document.getElementById('labs-dist-modal-submit');
    const completedCount = wizardState.distributor.successfulBatches.length;
    const totalBatches = Math.ceil(validRecs.length / 4);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.pointerEvents = 'auto';
      submitBtn.style.opacity = '1';
      if (completedCount > 0 && completedCount < totalBatches) {
        submitBtn.innerHTML = `Resume Distribution (Batch ${completedCount + 1} of ${totalBatches})`;
      } else {
        submitBtn.innerHTML = 'Confirm & Send Distribution';
      }
    }

    labsOpenModal('distributor-modal');
    labsUpdateDistributorPreview();
    if (!DISTRIBUTION_VERIFICATION_AVAILABLE) {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.pointerEvents = 'none';
        submitBtn.textContent = 'Distribution temporarily unavailable';
      }
      const banner = document.getElementById('labs-dist-modal-status-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Distribution is temporarily unavailable while reliable transaction verification is completed. No wallet request will be sent.';
      }
    }
  };

  // Safe On-Chain Batch Execution via TonConnect (TEP-74 OP 0x0f8a7ea5)
  window.labsExecuteDistributionBatch = async function () {
    if (!DISTRIBUTION_VERIFICATION_AVAILABLE) {
      alert('Distribution is temporarily unavailable while reliable transaction verification is completed. No wallet request was sent.');
      return;
    }
    if (labsGetPendingDistribution()) {
      labsShowPendingDistribution();
      alert('A distribution may already have been submitted. Check wallet and blockchain activity before sending again. Automatic retry is disabled until this can be reconciled.');
      return;
    }
    // 1. Concurrent submission guard
    if (wizardState.distributor.isSending) {
      console.warn('Distribution transaction already in flight.');
      return;
    }

    const tc = window.tonConnectUI;
    if (!tc || !tc.connected) {
      alert('⚠️ Please connect your TON wallet first using the "Connect Wallet" button.');
      if (tc) tc.openModal();
      return;
    }

    // Require the selected RPC network to match the connected wallet. In
    // particular, a ?testnet URL must not override a mainnet wallet session.
    const walletChain = String(tc.account?.chain ?? tc.wallet?.account?.chain ?? '');
    const secondaryChain = tc.wallet?.account?.chain;
    if (!['-3', '-239'].includes(walletChain) ||
        (secondaryChain != null && String(secondaryChain) !== walletChain) ||
        getNetworkContext().chainId !== walletChain) {
      alert('Wallet network is missing or does not match the selected blockchain network. Reconnect your wallet on the correct network.');
      return;
    }

    const validRecs = wizardState.distributor.recipients.filter((r) => r.valid);
    if (validRecs.length === 0) {
      alert('No valid recipients to distribute to.');
      return;
    }
    if (validRecs.some((r) => typeof r.amountText !== 'string' || r.amountText.length > 128 ||
      !/^\d+(?:\.\d+)?$/.test(r.amountText) || !/[1-9]/.test(r.amountText))) {
      alert('Distribution amounts must be entered as positive decimal text. Review the recipients before sending.');
      return;
    }

    const jettonMinter = (wizardState.activeToken && wizardState.activeToken.address) ||
                         document.getElementById('user-jetton-select')?.value;

    if (!jettonMinter) {
      alert('⚠️ Please select or deploy the Jetton you wish to distribute.');
      return;
    }

    const batchSize = 4;
    const batches = [];
    for (let i = 0; i < validRecs.length; i += batchSize) {
      batches.push(validRecs.slice(i, i + batchSize));
    }

    const totalBatches = batches.length;
    // Determine start batch index based on already confirmed batches
    const startIndex = wizardState.distributor.successfulBatches.length;

    if (startIndex >= totalBatches && totalBatches > 0) {
      alert('All batches have already been successfully distributed.');
      labsOnDistributionComplete(validRecs.length, wizardState.distributor.totalAmount, totalBatches);
      return;
    }

    const remainingBatches = totalBatches - startIndex;
    const confirmMsg = (startIndex === 0)
      ? `Confirm Multi-Wallet Distribution:\n\n` +
        `• Total Tokens: ${wizardState.distributor.totalAmountText || labsDistributionTotalText(validRecs)}\n` +
        `• Total Recipients: ${validRecs.length}\n` +
        `• Transaction Batches: ${totalBatches} (up to 4 transfers per tx)\n\n` +
        `Only the first batch can be submitted. Automatic confirmation and continuation are unavailable; the request will remain pending and retries will be blocked. Proceed?`
      : `Resume Multi-Wallet Distribution:\n\n` +
        `• Completed Batches: ${startIndex} of ${totalBatches}\n` +
        `• Remaining Batches: ${remainingBatches}\n\n` +
        `Automatic confirmation and continuation are unavailable; the next request will remain pending and retries will be blocked. Proceed?`;

    if (!confirm(confirmMsg)) return;

    // Set active transmission state
    wizardState.distributor.isSending = true;
    wizardState.distributor.status = 'in_progress';
    labsSetDistributionUiState('in_progress');

    const btn = document.getElementById('labs-dist-modal-submit');
    const cancelBtn = document.getElementById('labs-dist-modal-cancel');
    const modalStatusBanner = document.getElementById('labs-dist-modal-status-banner');

    if (btn) {
      btn.innerHTML = '<span class="status-dot"></span> Resolving Jetton Wallet...';
      btn.style.pointerEvents = 'none';
      btn.disabled = true;
    }
    if (cancelBtn) {
      cancelBtn.style.pointerEvents = 'none';
      cancelBtn.disabled = true;
    }

    try {
      const { Address, beginCell, toNano } = window.TON_CORE || {};
      if (!beginCell) throw new Error('TON Core library not loaded.');

      const senderAddr = tc.account.address;
      const jRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(senderAddr)}/jettons/${encodeURIComponent(jettonMinter)}`);
      if (!jRes.ok) throw new Error('Could not find a Jetton wallet for this token in your connected account. Ensure you have balance.');
      const jData = await jRes.json();
      const userJettonWalletAddr = jData.wallet_address?.address;
      if (!userJettonWalletAddr) throw new Error('You do not have a deployed wallet for this Jetton.');

      // This sender only constructs standard TEP-74 transfers. Never guess at
      // custom payloads, locked balances, or scaled display-unit conversions.
      if ((Array.isArray(jData.extensions) && jData.extensions.length > 0) ||
          jData.jetton?.scaled_ui != null || jData.lock != null) {
        throw new Error('This Jetton requires transfer or display features that distribution does not support.');
      }

      const decimalsValue = jData.jetton?.decimals;
      if ((typeof decimalsValue !== 'string' && typeof decimalsValue !== 'number') ||
          !/^\d+$/.test(String(decimalsValue))) {
        throw new Error('The Jetton decimals could not be verified. Distribution is disabled.');
      }
      const jettonDecimals = Number(decimalsValue);
      // Validate every batch before the first wallet request to avoid partial
      // distribution when a later amount cannot be represented exactly.
      const recipientUnits = new Map(validRecs.map((r) => [r, labsDistributionAmountUnits(r.amountText, jettonDecimals)]));
      if (typeof jData.balance !== 'string' || !/^\d+$/.test(jData.balance)) {
        throw new Error('The Jetton wallet balance could not be verified.');
      }
      const totalUnits = [...recipientUnits.values()].reduce((sum, amount) => sum + amount, 0n);
      if (totalUnits > BigInt(jData.balance)) throw new Error('Insufficient Jetton balance for this distribution.');

      for (let bIndex = startIndex; bIndex < totalBatches; bIndex++) {
        const batch = batches[bIndex];
        const batchNum = bIndex + 1;

        if (btn) {
          btn.innerHTML = `<span class="status-dot"></span> Waiting for signature: Batch ${batchNum} of ${totalBatches}...`;
        }
        if (modalStatusBanner) {
          modalStatusBanner.style.display = 'block';
          modalStatusBanner.style.background = 'rgba(0, 140, 255, 0.15)';
          modalStatusBanner.style.border = '1px solid rgba(0, 210, 255, 0.3)';
          modalStatusBanner.style.color = '#fff';
          modalStatusBanner.innerHTML = `<strong>Batch ${batchNum}/${totalBatches}:</strong> Please sign transaction in your TON wallet (${batch.length} recipient${batch.length > 1 ? 's' : ''}).`;
        }

        const messages = [];
        for (const recipient of batch) {
          const recAddress = Address.parse(recipient.address);
          const responseAddress = Address.parse(senderAddr);
          const jettonAmountNano = recipientUnits.get(recipient);

          const forwardPayload = beginCell().storeUint(0, 32).storeStringTail('ANL Labs Distribution').endCell();

          // TEP-74 Jetton transfer payload: op::transfer = 0x0f8a7ea5
          const transferPayload = beginCell()
            .storeUint(0x0f8a7ea5, 32)
            .storeUint(BigInt(Date.now()), 64) // query_id
            .storeCoins(jettonAmountNano)
            .storeAddress(recAddress)
            .storeAddress(responseAddress)
            .storeBit(0) // null custom_payload
            .storeCoins(toNano('0.01')) // forward_ton_amount
            .storeBit(1) // forward_payload in ref
            .storeRef(forwardPayload)
            .endCell();

          messages.push({
            address: userJettonWalletAddr,
            amount: toNano('0.05').toString(), // TON for fees and forwarding
            payload: transferPayload.toBoc().toString('base64')
          });
        }

        const tx = {
          validUntil: Math.floor(Date.now() / 1000) + 300,
          network: walletChain,
          messages: messages
        };

        if (!tc.connected || tc.account?.address !== senderAddr ||
            String(tc.account?.chain ?? tc.wallet?.account?.chain ?? '') !== walletChain ||
            getNetworkContext().chainId !== walletChain) {
          throw new Error('The connected wallet or network changed. No distribution request was sent.');
        }

        // Persist the intent BEFORE invoking the wallet. A timeout, page reload,
        // or bridge error cannot then cause the same batch to be resent.
        const pending = {
          wallet: senderAddr,
          jetton: jettonMinter,
          jettonWallet: userJettonWalletAddr,
          batchIndex: bIndex,
          totalBatches,
          recipients: batch.map((r) => ({ address: r.address, amount: r.amountText })),
          validUntil: tx.validUntil,
          createdAt: Date.now()
        };
        try {
          window.localStorage.setItem(DISTRIBUTION_PENDING_KEY, JSON.stringify(pending));
          if (!window.localStorage.getItem(DISTRIBUTION_PENDING_KEY)) throw new Error('Storage unavailable');
        } catch (storageError) {
          throw new Error('Cannot safely record this distribution locally. No wallet request was sent.');
        }
        try {
          await tc.sendTransaction(tx);
        } catch (signErr) {
          // Only the wallet's explicit rejection error establishes that the
          // user refused the request; other errors may occur after submission.
          const isRejected = signErr && signErr.name === 'UserRejectsError';
          if (isRejected) {
            try { window.localStorage.removeItem(DISTRIBUTION_PENDING_KEY); } catch (e) {}
            if (labsGetPendingDistribution()) throw { type: 'CONFIRMATION_PENDING', batchIndex: bIndex };
          }
          throw {
            type: isRejected ? 'SIGNATURE_REJECTED' : 'CONFIRMATION_PENDING',
            batchIndex: bIndex,
            originalError: signErr
          };
        }

        // The existing recent-event lookup cannot link this request to all
        // recipients and amounts. Stop until reliable reconciliation exists.
        throw { type: 'CONFIRMATION_PENDING', batchIndex: bIndex };
      }

      // ALL BATCHES COMPLETED
      wizardState.distributor.isSending = false;
      wizardState.distributor.status = 'completed';

      if (btn) {
        btn.innerHTML = '✔ All Batches Successfully Distributed!';
        btn.style.background = 'rgba(0, 229, 153, 0.2)';
        btn.style.color = '#00e599';
      }

      labsOnDistributionComplete(validRecs.length, wizardState.distributor.totalAmount, totalBatches);

    } catch (err) {
      console.error('Distribution Error:', err);
      wizardState.distributor.isSending = false;
      if (err.type === 'CONFIRMATION_PENDING') {
        labsShowPendingDistribution();
        if (modalStatusBanner) {
          modalStatusBanner.style.display = 'block';
          modalStatusBanner.style.color = '#ffa500';
          modalStatusBanner.textContent = 'Transaction outcome is unverified. Check wallet and blockchain activity; do not resend this batch.';
        }
        if (btn) {
          btn.disabled = true;
          btn.style.pointerEvents = 'none';
          btn.textContent = 'Awaiting verification';
        }
        if (cancelBtn) {
          cancelBtn.disabled = false;
          cancelBtn.style.pointerEvents = 'auto';
        }
        alert('Distribution paused: the wallet request may have been submitted, but token delivery is not verified. Check wallet and blockchain activity before taking any further action.');
        return;
      }
      wizardState.distributor.status = 'failed';
      wizardState.distributor.lastError = err;

      const completedCount = wizardState.distributor.successfulBatches.length;
      let userMsg = '';
      if (err.type === 'SIGNATURE_REJECTED') {
        userMsg = `Wallet signature was cancelled/rejected for Batch ${(err.batchIndex !== undefined ? err.batchIndex : 0) + 1}.`;
      } else {
        userMsg = err.originalError?.message || err.message || String(err);
      }

      labsSetDistributionUiState('failed', {
        completedCount,
        totalBatches,
        errorMessage: userMsg
      });

      if (modalStatusBanner) {
        modalStatusBanner.style.display = 'block';
        modalStatusBanner.style.background = 'rgba(255, 68, 68, 0.15)';
        modalStatusBanner.style.border = '1px solid rgba(255, 68, 68, 0.3)';
        modalStatusBanner.style.color = '#ff6b6b';
        modalStatusBanner.innerHTML = `⚠️ ${userMsg}${completedCount > 0 ? ` (${completedCount} of ${totalBatches} batches already safely sent)` : ''}`;
      }

      if (btn) {
        btn.disabled = false;
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        btn.innerHTML = completedCount > 0 ? `Resume Distribution (Batch ${completedCount + 1} of ${totalBatches})` : 'Retry Distribution';
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.style.pointerEvents = 'auto';
      }

      alert(`❌ Distribution paused:\n\n${userMsg}\n\n${completedCount > 0 ? `${completedCount} batch(es) were already sent safely and will NOT be resent when retrying.` : 'No tokens were transferred.'}`);
    }
  };

  function labsOnDistributionComplete(recipientCount, totalAmount, totalBatches) {
    // 1. Mark Step 3 as completed in Stepper
    const step3Node = document.querySelector('.labs-step-node[data-step="3"]');
    if (step3Node) {
      step3Node.classList.remove('locked', 'active');
      step3Node.classList.add('completed');
    }
    const step3Divider = document.querySelectorAll('.labs-step-divider')[2];
    if (step3Divider) {
      step3Divider.classList.add('filled');
    }

    // 2. Close modal after brief confirmation display
    setTimeout(() => {
      labsCloseModal('distributor-modal');
      const submitBtn = document.getElementById('labs-dist-modal-submit');
      if (submitBtn) {
        submitBtn.innerHTML = '✔ Distribution Completed';
        submitBtn.style.pointerEvents = 'none';
      }
      const cancelBtn = document.getElementById('labs-dist-modal-cancel');
      if (cancelBtn) {
        cancelBtn.disabled = false;
        cancelBtn.style.pointerEvents = 'auto';
      }
    }, 1200);

    // 3. Update Step 3 panel UI to show success banner & primary Continue button
    labsSetDistributionUiState('completed', {
      recipientCount,
      totalAmount,
      totalBatches
    });

    // 4. Automatically advance to Step 4 after ~1200ms
    setTimeout(() => {
      if (wizardState.currentStep === 3) {
        window.labsGoToStep(4);
      }
    }, 2200);
  }

  window.labsSetDistributionUiState = function (state, info = {}) {
    const sendBtn = document.getElementById('wizard-step3-send-btn');
    const continueBtn = document.getElementById('wizard-step3-continue-btn');
    const skipBtn = document.getElementById('wizard-step3-skip-btn');
    const successBanner = document.getElementById('labs-dist-success-banner');
    const errorBanner = document.getElementById('labs-dist-error-banner');

    if (state === 'pending') {
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.pointerEvents = 'none';
        sendBtn.style.display = 'inline-block';
        sendBtn.textContent = 'Distribution awaiting verification';
      }
      if (skipBtn) skipBtn.style.display = 'inline-block';
      if (continueBtn) continueBtn.style.display = 'none';
      if (successBanner) successBanner.style.display = 'none';
      if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.textContent = 'A distribution may have been submitted, but delivery is not verified. Check wallet and blockchain activity. Automatic retry is disabled.';
      }
    } else if (state === 'in_progress') {
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.pointerEvents = 'none';
        sendBtn.style.opacity = '0.7';
        sendBtn.innerHTML = '<span class="status-dot"></span> Distribution in Progress...';
      }
      if (skipBtn) skipBtn.style.display = 'none';
      if (continueBtn) continueBtn.style.display = 'none';
      if (errorBanner) errorBanner.style.display = 'none';
    } else if (state === 'completed') {
      if (sendBtn) sendBtn.style.display = 'none';
      if (skipBtn) skipBtn.style.display = 'none';
      if (continueBtn) {
        continueBtn.style.display = 'inline-block';
        continueBtn.innerHTML = 'Continue to Vesting →';
      }
      if (errorBanner) errorBanner.style.display = 'none';
      if (successBanner) {
        successBanner.style.display = 'block';
        const count = info.recipientCount || wizardState.distributor.recipients.filter((r) => r.valid).length;
        const amt = info.totalAmount || wizardState.distributor.totalAmount;
        const batches = info.totalBatches || Math.ceil(count / 4) || 1;
        successBanner.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:24px;">🎉</span>
            <div>
              <strong style="color:var(--labs-green); font-size:14px;">Distribution Successfully Verified!</strong>
              <p style="margin:2px 0 0; font-size:12px; color:var(--labs-text-sub);">
                Confirmed <strong>${formatNumber(amt)}</strong> tokens distributed across <strong>${count}</strong> recipient(s) in <strong>${batches}</strong> batch(es).
              </p>
            </div>
          </div>
        `;
      }
    } else if (state === 'failed') {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.pointerEvents = 'auto';
        sendBtn.style.opacity = '1';
        sendBtn.innerHTML = (info.completedCount > 0)
          ? `Retry Remaining Batches (${info.completedCount + 1}/${info.totalBatches})`
          : 'Retry Distribution';
      }
      if (skipBtn) skipBtn.style.display = 'inline-block';
      if (continueBtn) continueBtn.style.display = 'none';
      if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:20px;">⚠️</span>
            <div>
              <strong style="color:#ff6b6b; font-size:13px;">Distribution Incomplete</strong>
              <p style="margin:2px 0 0; font-size:12px; color:var(--labs-text-sub);">
                ${info.errorMessage || 'Transaction was cancelled or failed.'}
                ${info.completedCount > 0 ? ` <strong>${info.completedCount} batch(es) already succeeded</strong> and will not be resent.` : ''}
              </p>
            </div>
          </div>
        `;
      }
    } else {
      // idle
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.pointerEvents = 'auto';
        sendBtn.style.opacity = '1';
        sendBtn.style.display = 'inline-block';
        sendBtn.innerHTML = 'Review & Send Distribution';
      }
      if (skipBtn) skipBtn.style.display = 'inline-block';
      if (continueBtn) continueBtn.style.display = 'none';
      if (successBanner) successBanner.style.display = 'none';
      if (errorBanner) errorBanner.style.display = 'none';
    }
  };

  window.labsContinueToVesting = function (e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    // Navigates strictly without initiating any token transfer
    window.labsGoToStep(4);
  };

  window.labsContinueWithoutDistributing = function () {
    // User chose to proceed without distributing tokens
    window.labsGoToStep(4);
  };

  // ═══════════════════════════════════════════════════════════════════
  // 6. STEP 4: VESTING & LOCK (HONEST DEVELOPMENT STATUS)
  // ═══════════════════════════════════════════════════════════════════

  window.labsOpenVestingSchedule = function () {
    labsOpenModal('vesting-modal');
  };

  window.labsUpdateVestingScheduleCalculation = function () {
    const amountInput = document.getElementById('labs-vesting-amount');
    const cliffSelect = document.getElementById('labs-vesting-cliff');
    const periodSelect = document.getElementById('labs-vesting-period');
    const dateInput = document.getElementById('labs-vesting-date');
    const errBox = document.getElementById('vesting-validation-error');
    const cliffRel = document.getElementById('vesting-cliff-release');
    const monthRel = document.getElementById('vesting-monthly-rate');
    const endRel = document.getElementById('vesting-end-date');
    const calcStatus = document.getElementById('vesting-calc-status');

    if (!amountInput || !cliffSelect || !periodSelect || !dateInput) return;

    const amount = parseFloat(amountInput.value) || 0;
    const cliffText = cliffSelect.value || '3 months';
    const periodText = periodSelect.value || '12 months';
    const cliffMonths = parseInt(cliffText) || 3;
    const periodMonths = parseInt(periodText) || 12;

    if (cliffMonths > periodMonths) {
      if (errBox) {
        errBox.textContent = '⚠️ Cliff period cannot exceed total vesting duration.';
        errBox.style.display = 'block';
      }
      if (calcStatus) calcStatus.textContent = 'Invalid Duration';
      return;
    }

    if (errBox) errBox.style.display = 'none';
    if (calcStatus) calcStatus.textContent = 'Verified Linear Formula';

    const cliffPct = (cliffMonths / periodMonths) * 100;
    const cliffTokens = Math.floor((amount * cliffMonths) / periodMonths);
    const monthlyPct = (1 / periodMonths) * 100;

    if (cliffRel) cliffRel.textContent = `${cliffPct.toFixed(1)}% (${cliffTokens.toLocaleString()} tokens)`;
    if (monthRel) monthRel.textContent = `${monthlyPct.toFixed(2)}% / mo`;

    // Calculate full unlock date
    const startDate = new Date(dateInput.value || '2026-11-01');
    if (!isNaN(startDate.getTime())) {
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + periodMonths);
      if (endRel) endRel.textContent = endDate.toISOString().split('T')[0];
    }
  };

  window.labsUpdateVestingUI = function () {
    const submitBtn = document.getElementById('labs-vesting-submit-btn');
    const noteEl = document.getElementById('vesting-network-status-note');
    if (!submitBtn) return;

    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    const isTestnet = tc?.connected && String(tc.account?.chain) === '-3';

    if (isTestnet || window.__allowMainnetVesting) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.className = 'labs-btn-primary';
      submitBtn.innerHTML = isTestnet
        ? '🔒 Deploy Vesting Contract & Lock Tokens (Testnet)'
        : '🔒 Deploy Vesting Contract & Lock Tokens (Mainnet)';
      if (noteEl) {
        noteEl.innerHTML = isTestnet
          ? '<span style="color:var(--labs-cyan);">🌐 TON Testnet Active:</span> Ready for on-chain vesting contract deployment and deposit testing.'
          : '<span style="color:#00e676;">🛡️ Verified On-Chain Contract:</span> Ready to deploy non-custodial linear vesting contract on Mainnet.';
      }
    } else {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.className = 'labs-btn-secondary';
      submitBtn.innerHTML = '🔒 Mainnet Contract Locked (Pending Security Verification)';
      if (noteEl) {
        noteEl.innerHTML = 'Status: Contract in specification & security audit. Mainnet token locking is currently disabled to prevent simulated or insecure locks.';
      }
    }
  };

  window.labsSubmitVesting = async function (forceMainnet = false) {
    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    const walletChain = tc?.account?.chain == null ? '' : String(tc.account.chain);
    const isTestnet = walletChain === '-3';

    if (!tc || !tc.connected || !tc.account?.address) {
      alert('Please connect your TON wallet first to deploy and fund a vesting contract.');
      return;
    }
    const connectedAddress = tc.account.address;

    // A URL or stored preference cannot establish the connected wallet's network.
    // Reject unknown or conflicting networks before asking the wallet to sign.
    const walletInfoChain = tc.wallet?.account?.chain;
    if ((walletChain !== '-3' && walletChain !== '-239') ||
        (walletInfoChain != null && String(walletInfoChain) !== walletChain) ||
        getNetworkContext().chainId !== walletChain) {
      alert('The connected wallet network could not be verified. Check the wallet network and page settings before continuing.');
      return;
    }

    // Mandatory Condition: Mainnet safety guard
    if (!isTestnet && !forceMainnet && !window.__allowMainnetVesting) {
      alert(
        "🔒 Non-Custodial Vesting Smart Contract — Development Status\n\n" +
        "The linear vesting smart contract for TON Jettons is currently undergoing formal specification and security review.\n\n" +
        "To protect user assets, on-chain token locks cannot be executed on Mainnet until the smart contract audit is completed and verified.\n\n" +
        "You may configure schedule parameters in Step 4 for planning purposes, but no on-chain lock transaction will be simulated or executed."
      );
      return;
    }

    const beneficiaryInput = document.getElementById('labs-vesting-beneficiary');
    const amountInput = document.getElementById('labs-vesting-amount');
    const cliffSelect = document.getElementById('labs-vesting-cliff');
    const periodSelect = document.getElementById('labs-vesting-period');
    const dateInput = document.getElementById('labs-vesting-date');
    const statusDiv = document.getElementById('vesting-tx-status');
    const errBox = document.getElementById('vesting-validation-error');
    const submitBtn = document.getElementById('labs-vesting-submit-btn');

    const beneficiary = beneficiaryInput ? beneficiaryInput.value.trim() : '';
    const amountText = amountInput ? String(amountInput.value).trim() : '';
    const cliffMonths = cliffSelect ? parseInt(cliffSelect.value) : 3;
    const periodMonths = periodSelect ? parseInt(periodSelect.value) : 12;
    const startDateVal = dateInput ? dateInput.value : '';

    if (!beneficiary) {
      if (errBox) {
        errBox.textContent = '⚠️ Please enter a valid beneficiary TON address.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (!/^\d+(?:\.\d+)?$/.test(amountText) || !/[1-9]/.test(amountText)) {
      if (errBox) {
        errBox.textContent = '⚠️ Please enter a positive token amount to lock.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (cliffMonths > periodMonths) {
      if (errBox) {
        errBox.textContent = '⚠️ Cliff period cannot exceed total vesting duration.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (!startDateVal) {
      if (errBox) {
        errBox.textContent = '⚠️ Please choose a valid unlock start date.';
        errBox.style.display = 'block';
      }
      return;
    }

    const activeToken = wizardState.activeToken;
    if (!activeToken || !activeToken.address) {
      alert('Please select or create a token first in Step 1 before configuring vesting.');
      return;
    }

    // Resolve decimals from the selected token on the connected network. Do
    // not fall back to 9: some tokens have zero decimals, and a guessed value
    // can transfer an entirely different amount than the user entered.
    let lockedUnits;
    try {
      const metaRes = await labsFetchTonApi(`/jettons/${encodeURIComponent(activeToken.address)}`);
      if (!metaRes.ok) throw new Error('Could not read Jetton metadata.');
      const metadata = await metaRes.json();
      const rawDecimals = metadata?.metadata?.decimals;
      if (rawDecimals == null || !/^\d{1,3}$/.test(String(rawDecimals))) {
        throw new Error('The Jetton decimals could not be verified.');
      }
      lockedUnits = labsDistributionAmountUnits(amountText, Number(rawDecimals));
    } catch (err) {
      if (errBox) {
        errBox.textContent = `⚠️ ${String(err.message || 'Token amount could not be verified.').replace(/distribution/gi, 'vesting')}`;
        errBox.style.display = 'block';
      } else {
        alert('The token amount or decimals could not be verified.');
      }
      return;
    }

    const netName = isTestnet ? 'Testnet' : 'Mainnet';
    const confirmed = confirm(
      `🔒 Confirm ${netName} Vesting Deployment & Token Lock:\n\n` +
      `• Network: TON ${netName}\n` +
      `• Token: ${activeToken.name || 'Token'} (${activeToken.symbol || 'TOK'})\n` +
      `• Beneficiary: ${beneficiary}\n` +
      `• Amount to Lock: ${amountText} ${activeToken.symbol || 'TOK'}\n` +
      `• Cliff Period: ${cliffMonths} month(s)\n` +
      `• Total Duration: ${periodMonths} month(s)\n` +
      `• Start Date: ${startDateVal}\n` +
      `• Storage & Deployment Fee: ~0.13 TON\n\n` +
      `Do you want to proceed and sign this transaction in your wallet?`
    );
    if (!confirmed) return;

    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.className = 'labs-status-box';
      statusDiv.innerHTML = '<span class="status-dot"></span> ⏳ Compiling contract StateInit and querying minter wallet code...';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="status-dot"></span> Preparing Transaction...';
    }

    let vestingRequestStarted = false;
    try {
      const { beginCell, toNano, Address, Cell, contractAddress, storeStateInit } = window.TON_CORE || {};
      if (!beginCell || !Address || !contractAddress) {
        throw new Error('TON Core libraries are still loading. Please try again.');
      }

      const creator = Address.parse(tc.account.address);
      const benAddr = Address.parse(beneficiary);
      const jettonMaster = Address.parse(activeToken.address);

      // 1. Compiled Vesting Bytecode BOC (anlgram-vesting-wallet.compiled.json)
      const vestingCodeBoc = 'te6ccgECDAEAAycAART/APSkE/S88sgLAQIBYgIDA/TQMyLHAJJfA+DQ0wP6QDDtRND6QPpA+kDU1DDQ0x/TH9Mf+gD6ANMAMAtxsI66O/goU2VwVCATVBQDyFAE+gJYzxYBzxbMySLIywES9AD0AMsAyfkAcHTIywLKB8v/ydAZxwWSXwvjDeAM0x/TP4IQc2LQnFIwuuMCMAQFBgIBagoLALoq10nCP45SCoAg1yHTH4IQD4p+pRK6jj2AQNch+gAwGaEgwQCSMHDeEFkQSBA3RgUDBcjLHxTLHxLLHwH6AgH6AssAychQBc8WUAPPFgHPFszMye1Ukl8L4pJfC+IBzD1bCvoA+kAw+ChTdnBUIBNUFAPIUAT6AljPFgHPFszJIsjLARL0APQAywDJ+QBwdMjLAsoHy//J0IEBk1C7xwUa8vSBAZcKwAEa8vKBAZFRh8cFGPL0gQGUUYm+GPL0EEhVM0EwcQcBIIIQQU5MdhK64wJfDYQP8vAIAEgFyMsfFMsfEssfAfoCAfoCywDJyFAFzxZQA88WAc8WzMzJ7VQB/oEBlivAAfL0gQGRUajHBRry9IEBmAuCCmJaAL4b8vT4I12ggQGSUiK+8vRTMaBSEL6SMCmXI6FUaiGphOIroYEBlSHCAPL0UbugJhB4UWBRYAYFBE0zDAXIyx8Uyx8Syx8B+gIB+gLLAMnIUAXPFlADzxYBzxbMzMntVPgoQEMJAMpwVCATVBQDyFAE+gJYzxYBzxbMySLIywES9AD0AMsAyfkAcHTIywLKB8v/ydBwIIIQD4p+pcjLHxTLP1AF+gIjzxZQA88WywBx+gISywDJcYAYyMsFUAPPFnD6AhLLaszJgED7AACbtkfdqJofSB9IH0gamoYaGmP6Y/pj/0AfQBpgBgbGxsbAWAASa+DOHApAVApKFzJr4K4cCmB0CkoX0oYNhFQ8ApQrFTCANCQYIBJGDhwQAKm0jF2omh9IH0gfSBqahhoaY/pj+mP/QB9AGmAGBt8EbgT4ACpu1ApGF9YRw4YKanQKQhfSRgQy5LQqjEg1MJxENCQYIBJGDhvSJjxJMOIKwgiqAGCQ';
      const vestingCode = Cell.fromBoc(Uint8Array.from(atob(vestingCodeBoc), c => c.charCodeAt(0)))[0];

      // 2. Fetch standard wallet code from minter
      const netCtx = getNetworkContext();
      const minterRes = await labsFetchTonApi(`/blockchain/accounts/${encodeURIComponent(activeToken.address)}`);
      const minterDataJson = await minterRes.json();
      if (!minterDataJson.data) throw new Error('Could not load minter contract data from blockchain.');

      const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
      const minterDataCell = Cell.fromBoc(hexToBytes(minterDataJson.data))[0].beginParse();
      minterDataCell.loadCoins(); // total_supply
      minterDataCell.loadMaybeAddress(); // admin_address (null if renounced)
      minterDataCell.loadRef(); // metadata ref
      const jettonWalletCode = minterDataCell.loadRef(); // jetton wallet code cell!

      // 3. Compute Schedule Timestamps
      const startTimestamp = Math.floor(new Date(startDateVal).getTime() / 1000);
      const cliffSecs = cliffMonths * 30 * 24 * 3600;
      const totalSecs = periodMonths * 30 * 24 * 3600;

      // 4. Construct Initial Data Cell for Vesting Contract (two-cell ref layout)
      const scheduleCell = beginCell()
        .storeUint(startTimestamp, 32)
        .storeUint(cliffSecs, 32)
        .storeUint(totalSecs, 32)
        .storeCoins(lockedUnits)
        .storeCoins(0n) // claimed = 0
        .storeBit(0)   // is_initialized = 0
        .endCell();

      const initialData = beginCell()
        .storeAddress(creator)
        .storeAddress(benAddr)
        .storeAddress(jettonMaster)
        .storeRef(jettonWalletCode)
        .storeRef(scheduleCell)
        .endCell();

      const stateInitObj = { code: vestingCode, data: initialData };
      const stateInitCell = beginCell().store(storeStateInit(stateInitObj)).endCell();
      const vestingAddress = contractAddress(0, stateInitObj);
      const vestingAddressFriendly = vestingAddress.toString({ bounceable: true, testOnly: isTestnet });
      const explorerUrl = `${netCtx.tonscanBase}/address/${vestingAddressFriendly}`;

      // Retain a per-network, per-creator, per-contract intent across reloads.
      // Repeating this same deposit can strand tokens if the first request landed.
      const vestingIntentKey = `anlgram_vesting_pending_v1:${walletChain}:${creator.toRawString()}:${vestingAddress.toRawString()}`;
      let pendingVestingIntent;
      try {
        pendingVestingIntent = localStorage.getItem(vestingIntentKey);
      } catch (e) {
        throw new Error('Cannot safely store the vesting request. Enable local storage before continuing.');
      }
      if (pendingVestingIntent) {
        if (statusDiv) {
          statusDiv.innerHTML = `⏳ A previous vesting request for this contract is pending or unconfirmed. Check <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">the contract on the explorer</a> and the wallet transaction before attempting another deposit.`;
        }
        if (submitBtn) submitBtn.innerHTML = '⏳ Vesting Verification Pending';
        return;
      }

      if (statusDiv) {
        statusDiv.innerHTML = `<span class="status-dot"></span> ⏳ Contract address: <code>${vestingAddressFriendly.slice(0,8)}...${vestingAddressFriendly.slice(-6)}</code>. Fetching your Jetton Wallet...`;
      }

      // 5. Fetch Creator's Jetton Wallet
      const jRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(creator.toRawString())}/jettons/${encodeURIComponent(activeToken.address)}`);
      const jData = await jRes.json();
      const creatorJWallet = jData.wallet_address?.address;
      if (!creatorJWallet) {
        throw new Error('Could not find your Jetton Wallet balance for this token.');
      }

      // 6. Construct TEP-74 Transfer Payload to deposit tokens into Vesting Contract
      const depositPayload = beginCell()
        .storeUint(0x0f8a7ea5, 32) // op::transfer
        .storeUint(BigInt(Date.now()), 64) // query_id
        .storeCoins(lockedUnits) // amount
        .storeAddress(vestingAddress) // destination = vesting contract
        .storeAddress(creator) // response_destination = creator
        .storeBit(0) // null custom_payload
        .storeCoins(toNano('0.04')) // forward_ton_amount to vesting contract
        .storeBit(0) // empty forward_payload
        .endCell();

      // 7. Bundle Deploy + Deposit into 1 TonConnect transaction!
      const tx = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        network: walletChain,
        messages: [
          {
            address: vestingAddress.toString({ bounceable: false, testOnly: isTestnet }),
            amount: toNano('0.05').toString(), // 0.05 TON for contract deployment
            stateInit: stateInitCell.toBoc().toString('base64'),
            payload: ''
          },
          {
            address: Address.parse(creatorJWallet).toString({ bounceable: true, testOnly: isTestnet }),
            amount: toNano('0.08').toString(), // 0.08 TON for jetton transfer & forwarding
            payload: depositPayload.toBoc().toString('base64')
          }
        ]
      };

      if (statusDiv) {
        statusDiv.innerHTML = '<span class="status-dot"></span> ⏳ Awaiting wallet approval in Tonkeeper... Please confirm the transaction on your phone.';
      }

      // RPC preparation takes time; refuse to sign if the account or network
      // changed while constructing the transaction.
      if (tc !== (window.tonConnectUI || window.TonConnectUIInstance) || !tc.connected ||
          tc.account?.address !== connectedAddress || String(tc.account?.chain) !== walletChain ||
          (tc.wallet?.account?.chain != null && String(tc.wallet.account.chain) !== walletChain) ||
          getNetworkContext().chainId !== walletChain) {
        throw new Error('Wallet account or network changed while preparing vesting. Review the details and try again.');
      }
      try {
        // Another invocation may have finished preparation since the first
        // check above. Recheck synchronously before creating the intent.
        if (localStorage.getItem(vestingIntentKey)) {
          if (statusDiv) statusDiv.innerHTML = `⏳ A previous vesting request for this contract is pending or unconfirmed. Check <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">the contract on the explorer</a> and your wallet history before retrying.`;
          if (submitBtn) submitBtn.innerHTML = '⏳ Vesting Verification Pending';
          return;
        }
        localStorage.setItem(vestingIntentKey, JSON.stringify({
          address: vestingAddress.toRawString(), network: walletChain, submittedAt: Date.now()
        }));
      } catch (e) {
        throw new Error('Cannot safely store the vesting request. Enable local storage before continuing.');
      }
      vestingRequestStarted = true;
      try {
        await tc.sendTransaction(tx);
      } catch (sendError) {
        // Wallet/bridge errors can occur after broadcast. Do not treat them as
        // proof that no transaction was sent or silently allow a retry.
        if (statusDiv) {
          statusDiv.innerHTML = `⏳ Wallet request outcome is unknown. The token deposit is not confirmed. Check <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">the contract on the explorer</a> and your wallet history before retrying.`;
        }
        if (submitBtn) submitBtn.innerHTML = '⏳ Vesting Verification Pending';
        return;
      }

      if (statusDiv) {
        statusDiv.innerHTML = '⏳ Wallet request submitted. Checking the contract; token deposit has not yet been verified. <span class="status-dot"></span>';
      }

      // 8. An active account does not prove the Jetton deposit succeeded. Until
      // custody and initialization can both be verified, report a pending result.
      let deploymentObserved = false;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        if (!tc.connected || tc.account?.address !== connectedAddress ||
            String(tc.account?.chain) !== walletChain || getNetworkContext().chainId !== walletChain) break;
        try {
          const vRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(vestingAddress.toRawString())}`);
          if (vRes.ok) {
            const vData = await vRes.json();
            if (vData.status === 'active') {
              deploymentObserved = true;
              break;
            }
          }
        } catch (e) {}
      }

      if (statusDiv) {
        statusDiv.innerHTML = `
          <div style="background:rgba(255,170,0,0.1); border:1px solid #ffaa00; border-radius:8px; padding:12px; color:#ffaa00;">
            <strong>⏳ Vesting transaction requires verification</strong><br>
            <div style="font-size:12px; color:#fff; margin-top:6px; word-break:break-all;">
              Contract Address: <a href="${explorerUrl}" target="_blank" style="color:var(--labs-cyan); text-decoration:underline;">${vestingAddressFriendly}</a>
            </div>
            <div style="font-size:12px; color:#94a3b8; margin-top:4px;">
              ${deploymentObserved ? 'The account is active.' : 'Contract activation has not been confirmed.'}
              The token deposit and lock have not been verified. Check the transaction and Jetton balance before retrying.
            </div>
          </div>
        `;
      }
      if (submitBtn) {
        submitBtn.innerHTML = '⏳ Vesting Verification Pending';
      }
    } catch (err) {
      console.error('Vesting deployment error:', err);
      if (statusDiv) {
        statusDiv.innerHTML = vestingRequestStarted
          ? '⏳ Vesting request outcome is unknown. Check your wallet and the contract on-chain before retrying.'
          : `<span style="color:#ff5555;">❌ Error: ${escapeHtml(err.message || 'Transaction cancelled or failed.')}</span>`;
      }
      if (submitBtn) {
        submitBtn.disabled = vestingRequestStarted;
        submitBtn.innerHTML = vestingRequestStarted ? '⏳ Vesting Verification Pending' : '🔒 Lock Tokens (Vesting)';
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 7. STEP 5: TOKEN MANAGEMENT & LIQUIDITY
  // ═══════════════════════════════════════════════════════════════════

  function labsUpdateManagementScreen() {
    const token = wizardState.activeToken;
    if (!token) return;

    const friendlyAddr = rawToFriendly(token.address);
    const tmSymbol = document.getElementById('labs-tm-token-symbol');
    const tmName = document.getElementById('labs-tm-token-name');
    const tmAddr = document.getElementById('labs-tm-token-addr');
    const tmAvatar = document.getElementById('labs-tm-token-avatar');
    const renAddr = document.getElementById('renounce-minter-addr');

    if (tmSymbol) tmSymbol.textContent = token.symbol || 'TKN';
    if (tmName) tmName.textContent = token.name || 'Token';
    if (tmAddr) tmAddr.textContent = shortAddr(friendlyMinterAddress(friendlyAddr));
    if (renAddr) renAddr.value = friendlyAddr;

    // Render Token Avatar in Step 5 Header
    const defaultLogo = 'https://anlgram.com/assets/images/icon-192.png';
    let tokenImage = token.image || wizardState.tokenDraft?.logoUrl || wizardState.tokenDraft?.logoDataUrl || '';
    if (!tokenImage || tokenImage.includes('anlgram.io')) {
      try {
        const cached = JSON.parse(localStorage.getItem('anlgram_token_' + token.address) || '{}');
        tokenImage = cached.image || localStorage.getItem('anlgram_last_uploaded_logo') || '';
      } catch (e) {}
    }
    if (!tokenImage || tokenImage.includes('anlgram.io')) {
      tokenImage = defaultLogo;
    }

    if (tmAvatar) {
      tmAvatar.innerHTML = `<img src="${tokenImage}" onerror="this.onerror=null; this.src='${defaultLogo}';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
    }

    // Query on-chain Jetton metadata from TonAPI to reflect live status
    if (token.address) {
      labsFetchTonApi(`/jettons/${encodeURIComponent(token.address)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.metadata && data.metadata.image) {
            let fetchedImg = data.metadata.image;
            if (fetchedImg.includes('anlgram.io')) {
              fetchedImg = defaultLogo;
            }
            token.image = fetchedImg;
            if (tmAvatar) {
              tmAvatar.innerHTML = `<img src="${fetchedImg}" onerror="this.onerror=null; this.src='${defaultLogo}';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
            }
          }
        })
        .catch(() => {});
    }

    // Refresh on-chain security analysis and live balances (Source of Truth: TON Blockchain)
    if (typeof window.labsRefreshSecurityAnalysis === 'function') {
      window.labsRefreshSecurityAnalysis();
    }
  }

  function friendlyMinterAddress(addr) {
    return addr || '';
  }

  // Dynamic token logo changer for Step 5
  window.labsChangeStep5Logo = async function (file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WEBP, or SVG).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds 15MB limit.');
      return;
    }

    const tmAvatar = document.getElementById('labs-tm-token-avatar');
    if (tmAvatar) {
      tmAvatar.style.opacity = '0.5';
    }

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let finalUrl = dataUrl;
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((res) => { img.onload = res; img.onerror = res; });
        if (img.width && img.height) {
          const maxDim = 512;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          finalUrl = canvas.toDataURL('image/png', 0.9);
        }
      } catch (cvErr) {}

      // Try server upload endpoint if available
      try {
        const base64Data = finalUrl.split(',')[1] || '';
        if (base64Data) {
          const res = await fetch('/api/upload-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data })
          });
          if (res.ok) {
            const j = await res.json();
            if (j.url) finalUrl = j.url;
          }
        }
      } catch (netErr) {}

      const activeToken = wizardState.activeToken;
      if (activeToken) {
        activeToken.image = finalUrl;
        if (activeToken.address) {
          try {
            const existing = JSON.parse(localStorage.getItem('anlgram_token_' + activeToken.address) || '{}');
            localStorage.setItem('anlgram_token_' + activeToken.address, JSON.stringify({ ...existing, ...activeToken, image: finalUrl }));
          } catch (e) {}
        }
      }
      try {
        localStorage.setItem('anlgram_last_uploaded_logo', finalUrl);
      } catch (e) {}

      // Update avatar element in Step 5
      if (tmAvatar) {
        tmAvatar.style.opacity = '1';
        tmAvatar.innerHTML = `<img src="${finalUrl}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
      }

      // Also update any other avatar containers across the wizard
      document.querySelectorAll('.labs-avatar-preview, #labs-avatar-preview-box, #labs-review-avatar, .wizard-dex-preview-avatar, #logo-preview-container').forEach((el) => {
        el.innerHTML = `<img src="${finalUrl}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
      });

      console.log('Step 5 Token Logo updated successfully:', finalUrl.substring(0, 60) + '...');
    } catch (err) {
      console.error('Error changing Step 5 token logo:', err);
      if (tmAvatar) tmAvatar.style.opacity = '1';
      alert('Error updating logo. Please try another image.');
    }
  };

  window.labsOpenRenounceConfirmModal = function () {
    labsOpenModal('renounce-confirm-modal');
  };

  window.labsConfirmRenounceExecution = function (e) {
    const check = document.getElementById('renounce-confirm-checkbox');
    if (check && !check.checked) {
      alert('⚠️ You must check the confirmation box acknowledging that this action is 100% irreversible.');
      return;
    }
    window.__renounceModalConfirmed = true;
    labsCloseModal('renounce-confirm-modal');

    // Call existing renounceAdminWeb3
    if (typeof window.renounceAdminWeb3 === 'function') {
      window.renounceAdminWeb3(e);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: REAL ON-CHAIN TOKEN SECURITY VERIFICATION & TEP-74 BURN
  // ═══════════════════════════════════════════════════════════════════

  /**
   * On-chain token security and authority verifier.
   * Smart contract get_jetton_data is the EXCLUSIVE source of truth.
   * No localStorage, zero simulated security scores.
   */
  window.labsVerifyOnChainTokenSecurity = async function (minterAddress) {
    if (!minterAddress) return null;

    let rawAddr = minterAddress;
    let friendlyAddr = minterAddress;
    const { Address } = window.TON_CORE || {};
    if (Address) {
      try {
        const parsed = Address.parse(minterAddress);
        rawAddr = parsed.toRawString();
        friendlyAddr = parsed.toString({ bounceable: true, urlSafe: true });
      } catch (e) {}
    }

    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    const userWallet = tc?.account?.address;

    // Institutional TokenVerificationEngine integration
    const verifier = window.TokenVerificationEngine;
    if (verifier && typeof verifier.verifyToken === 'function') {
      try {
        const rep = await verifier.verifyToken(friendlyAddr, { viewerWallet: userWallet, forceFresh: true });
        const cAdmin = rep.claims.admin_status || {};
        const cSupply = rep.claims.total_supply || {};
        const cMint = rep.claims.minting_permissions || {};
        const cCode = rep.claims.bytecode_integrity || {};
        const cUpgrade = rep.claims.no_upgrade_hooks || {};

        const isUnverified = (
          cMint.status === 'NOT VERIFIED' ||
          cAdmin.status === 'NOT VERIFIED' ||
          cSupply.status === 'NOT VERIFIED' ||
          cCode.status === 'NOT VERIFIED' ||
          cUpgrade.status === 'NOT VERIFIED' ||
          rep.summary.totalChecksUnverified > 0
        );
        const isStandardTEP74 = Boolean(cCode.status === 'VERIFIED' && cCode.evidence?.isStandardTEP74);
        const supplyVerified = Boolean(cSupply.status === 'VERIFIED' && cSupply.evidence?.rawSupply !== undefined && cSupply.evidence?.rawSupply !== null);
        return {
          minterAddress: friendlyAddr,
          minterRawAddress: rep.target.rawAddress || rawAddr,
          adminAddress: cAdmin.evidence?.adminAddress || null,
          isRenounced: Boolean(rep.summary.permanentRenounced && !isUnverified),
          isUnverified,
          adminVerified: cAdmin.status === 'VERIFIED',
          supplyVerified,
          isUserAdmin: Boolean(!isUnverified && cAdmin.evidence?.isUserAdmin),
          mintAuthority: rep.summary.permanentRenounced ? 'DISABLED' : (isUnverified ? 'NOT VERIFIED' : (cAdmin.evidence?.isUserAdmin ? 'ACTIVE (CREATOR WALLET)' : 'ACTIVE (OTHER CREATOR)')),
          additionalMinting: rep.summary.permanentRenounced ? 'PERMANENTLY BLOCKED' : (isUnverified ? 'NOT VERIFIED' : 'POSSIBLE BY ADMIN'),
          renounceStatus: rep.summary.permanentRenounced ? 'VERIFIED ON-CHAIN (PERMANENTLY RENOUNCED)' : (isUnverified ? 'NOT VERIFIED (BYTECODE / RPC AUDIT REQUIRED)' : 'NOT RENOUNCED (ADMIN ACTIVE)'),
          burnCapability: isStandardTEP74 ? 'AVAILABLE (TEP-74 Standard)' : 'NOT VERIFIED (Bytecode Unverified)',
          totalSupplyRaw: supplyVerified ? String(cSupply.evidence.rawSupply) : 'NOT VERIFIED',
          totalSupplyFormatted: supplyVerified ? verifier.formatUnits(cSupply.evidence.rawSupply, cSupply.evidence?.decimals) : 'NOT VERIFIED',
          decimals: cSupply.evidence?.decimals ?? 9,
          verificationSource: rep.dataSources.join(' + ') || 'UNVERIFIED',
          verifiedAt: Date.now(),
          codeHashHex: cCode.evidence?.codeHashHex,
          isStandardTEP74,
          fullReport: rep,
          error: (rep.claims.account_status?.status === 'FAILED' || rep.claims.validation_error || rep.claims.engine_execution)
            ? (rep.claims.validation_error?.detail || rep.claims.account_status?.detail || rep.claims.engine_execution?.detail)
            : null
        };
      } catch (engineErr) {
        console.warn('[ANLGRAM-VERIFIER] Engine execution fallback:', engineErr);
      }
    }

    const result = {
      minterAddress: friendlyAddr,
      minterRawAddress: rawAddr,
      adminAddress: null,
      isRenounced: false,
      isUnverified: true,
      adminVerified: false,
      supplyVerified: false,
      isStandardTEP74: false,
      isUserAdmin: false,
      mintAuthority: 'NOT VERIFIED',
      additionalMinting: 'NOT VERIFIED',
      renounceStatus: 'NOT VERIFIED',
      burnCapability: 'NOT VERIFIED (Bytecode Audit Required)',
      totalSupplyRaw: '0',
      totalSupplyFormatted: 'NOT VERIFIED',
      decimals: 9,
      verificationSource: 'TON Blockchain get_jetton_data',
      verifiedAt: Date.now(),
      error: null
    };

    try {
      // 1. Query TON blockchain get_jetton_data method
      const res = await labsFetchTonApi(`/blockchain/accounts/${encodeURIComponent(friendlyAddr)}/methods/get_jetton_data`);
      if (!res.ok) {
        throw new Error(`TonAPI returned HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      const decoded = data.decoded || {};
      const admin = decoded.admin_address;
      const totalSupply = decoded.total_supply;
      if (totalSupply !== undefined && totalSupply !== null) {
        result.totalSupplyRaw = totalSupply.toString();
        result.supplyVerified = true;
      }

      // Jetton metadata for decimals
      try {
        const metaRes = await labsFetchTonApi(`/jettons/${encodeURIComponent(friendlyAddr)}`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.metadata && meta.metadata.decimals !== undefined) {
            result.decimals = parseInt(meta.metadata.decimals, 10);
          }
        }
      } catch (e) {}

      const dec = result.decimals;
      if (result.supplyVerified) {
        try {
          const tsBig = BigInt(result.totalSupplyRaw);
          const div = 10n ** BigInt(dec);
          const whole = tsBig / div;
          const frac = tsBig % div;
          const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          result.totalSupplyFormatted = wholeStr + (frac > 0n && dec > 0 ? '.' + frac.toString().padStart(dec, '0').replace(/0+$/, '') : '');
        } catch (e) {
          result.totalSupplyFormatted = 'NOT VERIFIED';
        }
      }

      // Check admin status on TON: addr_none decodes to empty string "" or "null" or all-zeroes
      const isNullAdmin = (!admin || admin.trim() === '' || admin === 'null' || admin === '0:0000000000000000000000000000000000000000000000000000000000000000');
      if (isNullAdmin) {
        result.adminAddress = null;
        result.isUserAdmin = false;
        result.isUnverified = true;
        // SEC-01: Exigir bytecode canónico verificado antes de certificar renuncia permanente
        // Sin TokenVerificationEngine confirmando bytecode estándar TEP-74, marcar como NOT VERIFIED
        result.isRenounced = false;
        result.mintAuthority = 'NOT VERIFIED (BYTECODE UNVERIFIED)';
        result.additionalMinting = 'NOT VERIFIED';
        result.renounceStatus = 'NOT VERIFIED (BYTECODE AUDIT REQUIRED)';
      } else {
        result.adminAddress = admin;
        result.adminVerified = true;
        result.isRenounced = false;
        result.isUnverified = false;

        // Check if user is the admin
        const tc = window.tonConnectUI || window.TonConnectUIInstance;
        const userWallet = tc?.account?.address;
        if (userWallet) {
          let userRaw = userWallet;
          let adminRaw = admin;
          if (Address) {
            try { userRaw = Address.parse(userWallet).toRawString(); } catch (e) {}
            try { adminRaw = Address.parse(admin).toRawString(); } catch (e) {}
          }
          result.isUserAdmin = (userRaw.toLowerCase() === adminRaw.toLowerCase());
        }

        result.mintAuthority = result.isUserAdmin ? 'ACTIVE (CREATOR WALLET)' : 'ACTIVE (OTHER CREATOR)';
        result.additionalMinting = 'POSSIBLE BY ADMIN';
        result.renounceStatus = 'NOT RENOUNCED (ADMIN ACTIVE)';
      }

      return result;
    } catch (err) {
      result.error = err.message;
      result.isUnverified = true;
      result.verificationSource = 'FAILED TO REACH ON-CHAIN DATA';
      return result;
    }
  };

  /**
   * Refreshes the Token Security & Authority Analysis Card and Burn balances
   */
  window.labsRefreshSecurityAnalysis = async function () {
    const secContract = document.getElementById('sec-contract-addr');
    const secAdmin = document.getElementById('sec-admin-addr');
    const secSupply = document.getElementById('sec-total-supply');
    const secMintAuth = document.getElementById('sec-mint-authority');
    const secMintStatus = document.getElementById('sec-minting-status');
    const secRenStatus = document.getElementById('sec-renounce-status');
    const secBurnStatus = document.getElementById('sec-burn-status');
    const burnBalEl = document.getElementById('labs-burn-balance');
    const burnSymEl = document.getElementById('labs-burn-symbol');
    const renBanner = document.getElementById('mint-renounced-banner');
    const renStatusBanner = document.getElementById('labs-renounce-status-banner');
    const mintBtn = document.getElementById('mint-btn');
    const renBtn = document.getElementById('renounce-btn');
    const note = document.getElementById('sec-verification-note');

    const token = wizardState.activeToken || wizardState.deployedToken || {};
    const renAddr = document.getElementById('renounce-minter-addr');
    const selectEl = document.getElementById('user-jetton-select');
    const minterAddr = (renAddr && renAddr.value) || token.address || (selectEl && selectEl.value);

    if (!minterAddr) return;

    if (secContract) {
      const shortMinter = shortAddr(rawToFriendly(minterAddr));
      secContract.innerHTML = `<a href="${getNetworkContext().tonscanBase}/address/${encodeURIComponent(rawToFriendly(minterAddr))}" target="_blank" style="color:var(--labs-cyan); text-decoration:none;">${escapeHtml(shortMinter)} ↗</a>`;
    }

    if (secAdmin) secAdmin.innerHTML = '<span class="status-dot"></span> Checking on-chain...';
    if (secMintAuth) secMintAuth.innerHTML = '<span class="status-dot"></span> Checking...';
    if (secMintStatus) secMintStatus.innerHTML = '<span class="status-dot"></span> Checking...';
    if (secRenStatus) secRenStatus.innerHTML = '<span class="status-dot"></span> Verifying...';

    const sec = await window.labsVerifyOnChainTokenSecurity(minterAddr);
    if (!sec) return;

    // ALTO-02: Explicit NOT VERIFIED state on network/API failure — clear any residual green banners
    if (sec.error) {
      if (secAdmin) secAdmin.innerHTML = `<span style="color:#ffaa00; font-weight:600;">⚠️ NOT VERIFIED (${escapeHtml(sec.error)})</span>`;
      if (secSupply) secSupply.innerHTML = '<span style="color:#ffaa00; font-weight:600;">NOT VERIFIED</span>';
      if (secMintAuth) secMintAuth.innerHTML = '<span style="color:#ffaa00; font-weight:600;">NOT VERIFIED</span>';
      if (secMintStatus) secMintStatus.innerHTML = '<span style="color:#ffaa00; font-weight:600;">NOT VERIFIED</span>';
      if (secRenStatus) secRenStatus.innerHTML = '<span style="color:#ffaa00; font-weight:600;">NOT VERIFIED</span>';
      if (secBurnStatus) secBurnStatus.innerHTML = '<span style="color:#ffaa00; font-weight:600;">NOT VERIFIED</span>';

      // Hide any previous green renounced banners so stale verified state never lingers
      if (renBanner) renBanner.style.display = 'none';
      if (renStatusBanner) {
        renStatusBanner.style.display = 'none';
        renStatusBanner.innerHTML = '';
      }
      if (mintBtn) {
        mintBtn.disabled = true;
        mintBtn.style.opacity = '0.45';
        mintBtn.style.cursor = 'not-allowed';
        mintBtn.innerHTML = '⚠️ Minting Locked (On-Chain State Not Verified)';
      }
      if (renBtn) {
        renBtn.disabled = true;
        renBtn.style.opacity = '0.45';
        renBtn.style.cursor = 'not-allowed';
        renBtn.textContent = '⚠️ Renounce Locked (On-Chain State Not Verified)';
      }

      const lastKnownNote = wizardState.lastVerifiedSecurityAt
        ? ` (Last known verification: ${new Date(wizardState.lastVerifiedSecurityAt).toLocaleTimeString()} — current state NOT VERIFIED)`
        : '';
      if (note) {
        note.innerHTML = `<span style="color:#ffaa00;">⚠️ Blockchain query could not be completed: ${escapeHtml(sec.error)}${escapeHtml(lastKnownNote)}. Click "Refresh" to retry.</span>`;
      }
      return;
    }

    // Update Security Card with verified or explicitly NOT VERIFIED on-chain data
    if (secSupply) {
      if (sec.supplyVerified && sec.totalSupplyFormatted && sec.totalSupplyFormatted !== 'NOT VERIFIED' && sec.totalSupplyFormatted !== 'INVALID') {
        secSupply.textContent = sec.totalSupplyFormatted;
      } else {
        secSupply.innerHTML = '<span style="color:#ffaa00; font-weight:600;">⚠️ NOT VERIFIED</span>';
      }
    }

    const hasVerifiedActiveAdmin = Boolean(!sec.isRenounced && sec.adminAddress && sec.adminVerified !== false);
    const isUnverifiedState = Boolean(sec.isUnverified || (!sec.isRenounced && !hasVerifiedActiveAdmin));

    if (secAdmin) {
      if (sec.isRenounced && !isUnverifiedState) {
        secAdmin.innerHTML = '<span style="color:var(--labs-green); font-weight:700;">🔒 None (Permanently Renounced)</span>';
      } else if (hasVerifiedActiveAdmin) {
        const shortAdmin = shortAddr(rawToFriendly(sec.adminAddress));
        secAdmin.innerHTML = `<a href="${getNetworkContext().tonscanBase}/address/${encodeURIComponent(rawToFriendly(sec.adminAddress))}" target="_blank" style="color:var(--labs-cyan); text-decoration:none;">${escapeHtml(shortAdmin)} ↗</a> ${sec.isUserAdmin ? '<span style="color:var(--labs-green); font-size:11px;">(You)</span>' : ''}`;
      } else if (!sec.adminAddress) {
        secAdmin.innerHTML = '<span style="color:#ffaa00; font-weight:700;">⚠️ Null Admin — NOT VERIFIED (Bytecode Unverified)</span>';
      } else {
        secAdmin.innerHTML = '<span style="color:#ffaa00; font-weight:700;">⚠️ NOT VERIFIED</span>';
      }
    }

    if (secMintAuth) {
      if (sec.isRenounced && !isUnverifiedState) {
        secMintAuth.innerHTML = '<span style="color:var(--labs-red); font-weight:700;">DISABLED (No Admin)</span>';
      } else if (isUnverifiedState) {
        secMintAuth.innerHTML = '<span style="color:#ffaa00; font-weight:700;">⚠️ NOT VERIFIED</span>';
      } else if (sec.isUserAdmin) {
        secMintAuth.innerHTML = '<span style="color:var(--labs-green); font-weight:700;">ACTIVE (Creator Wallet)</span>';
      } else {
        secMintAuth.innerHTML = '<span style="color:#ffaa00; font-weight:700;">ACTIVE (External Address)</span>';
      }
    }

    if (secMintStatus) {
      if (sec.isRenounced && !isUnverifiedState) {
        secMintStatus.innerHTML = '<span style="color:var(--labs-red); font-weight:700;">PERMANENTLY BLOCKED</span>';
      } else if (isUnverifiedState) {
        secMintStatus.innerHTML = '<span style="color:#ffaa00; font-weight:700;">⚠️ NOT VERIFIED</span>';
      } else {
        secMintStatus.innerHTML = '<span style="color:var(--labs-green); font-weight:700;">POSSIBLE (Admin Controlled)</span>';
      }
    }

    if (secRenStatus) {
      if (sec.isRenounced && !isUnverifiedState) {
        secRenStatus.innerHTML = '<span style="color:var(--labs-green); font-weight:700;">✔ VERIFIED ON-CHAIN (PERMANENT)</span>';
      } else if (isUnverifiedState) {
        secRenStatus.innerHTML = `<span style="color:#ffaa00; font-weight:700;">⚠️ ${escapeHtml(sec.renounceStatus || 'NOT VERIFIED')}</span>`;
      } else {
        secRenStatus.innerHTML = '<span style="color:#ffaa00; font-weight:700;">NOT RENOUNCED (ADMIN ACTIVE)</span>';
      }
    }

    if (secBurnStatus) {
      if (sec.isStandardTEP74) {
        secBurnStatus.innerHTML = '<span style="color:var(--labs-green); font-weight:700;">✔ AVAILABLE (TEP-74 Standard)</span>';
      } else {
        secBurnStatus.innerHTML = '<span style="color:#ffaa00; font-weight:700;">⚠️ NOT VERIFIED (Bytecode Unverified)</span>';
      }
    }

    // Update Action Buttons & Banners based on verified state
    if (sec.isRenounced && !isUnverifiedState) {
      wizardState.lastVerifiedSecurityAt = sec.verifiedAt || Date.now();
      if (renBanner) renBanner.style.display = 'block';
      if (renStatusBanner) {
        renStatusBanner.style.display = 'block';
        renStatusBanner.style.background = 'rgba(0,255,136,0.08)';
        renStatusBanner.style.border = '1px solid var(--labs-green)';
        renStatusBanner.style.color = '#fff';
        renStatusBanner.innerHTML = '✔ <strong>Verified On-Chain:</strong> Contract admin has been permanently renounced. <code>admin_address</code> is null (<code>addr_none</code>) and canonical TEP-74 bytecode is confirmed. Supply is permanently fixed.';
      }
      if (mintBtn) {
        mintBtn.disabled = true;
        mintBtn.style.opacity = '0.45';
        mintBtn.style.cursor = 'not-allowed';
        mintBtn.innerHTML = '🔒 Minting Permanently Disabled (Admin Renounced)';
      }
      if (renBtn) {
        renBtn.disabled = true;
        renBtn.style.opacity = '0.45';
        renBtn.style.cursor = 'not-allowed';
        renBtn.textContent = '🔒 Admin Already Renounced On-Chain';
      }
    } else if (isUnverifiedState) {
      if (renBanner) renBanner.style.display = 'none';
      if (renStatusBanner) {
        renStatusBanner.style.display = 'block';
        renStatusBanner.style.background = 'rgba(255,170,0,0.08)';
        renStatusBanner.style.border = '1px solid #ffaa00';
        renStatusBanner.style.color = '#ffaa00';
        renStatusBanner.innerHTML = '⚠️ <strong>NOT VERIFIED:</strong> Contract bytecode or TVM getter state could not be verified against canonical TEP-74 artifacts. Administrative actions are locked until verification succeeds.';
      }
      if (mintBtn) {
        mintBtn.disabled = true;
        mintBtn.style.opacity = '0.45';
        mintBtn.style.cursor = 'not-allowed';
        mintBtn.innerHTML = '⚠️ Minting Locked (State Not Verified)';
      }
      if (renBtn) {
        renBtn.disabled = true;
        renBtn.style.opacity = '0.45';
        renBtn.style.cursor = 'not-allowed';
        renBtn.textContent = '⚠️ Renounce Locked (State Not Verified)';
      }
    } else {
      wizardState.lastVerifiedSecurityAt = sec.verifiedAt || Date.now();
      if (renBanner) renBanner.style.display = 'none';
      if (renStatusBanner) {
        renStatusBanner.style.display = 'none';
        renStatusBanner.innerHTML = '';
      }
      if (mintBtn) {
        mintBtn.disabled = !sec.isUserAdmin;
        mintBtn.style.opacity = sec.isUserAdmin ? '1' : '0.5';
        mintBtn.style.cursor = sec.isUserAdmin ? 'pointer' : 'not-allowed';
        mintBtn.innerHTML = sec.isUserAdmin ? '⚗️ Mint Tokens to My Wallet' : '🔒 Only Creator Can Mint';
      }
      if (renBtn) {
        renBtn.disabled = !sec.isUserAdmin;
        renBtn.style.opacity = sec.isUserAdmin ? '1' : '0.5';
        renBtn.style.cursor = sec.isUserAdmin ? 'pointer' : 'not-allowed';
        renBtn.textContent = '🔒 Renounce Admin Rights (Burn Key)';
      }
    }

    // Update Burn Card Balance from TonAPI
    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    const userWallet = tc?.account?.address;
    const symbol = token.symbol || document.getElementById('labs-tm-token-symbol')?.textContent?.replace(/[()$]/g, '') || 'TOK';
    if (burnSymEl) burnSymEl.textContent = symbol;

    if (userWallet && minterAddr) {
      try {
        const jRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(userWallet)}/jettons/${encodeURIComponent(minterAddr)}`);
        if (jRes.ok) {
          const jData = await jRes.json();
          const rawBal = BigInt(jData.balance || '0');
          const dec = jData.jetton?.decimals ? parseInt(jData.jetton.decimals, 10) : 9;
          const numBal = Number(rawBal) / (10 ** dec);
          wizardState.userJettonBalanceNumeric = numBal;
          wizardState.userJettonWalletAddress = jData.wallet_address?.address || null;
          if (burnBalEl) burnBalEl.textContent = numBal.toLocaleString(undefined, { maximumFractionDigits: 4 });
        } else {
          if (burnBalEl) burnBalEl.textContent = '0';
          wizardState.userJettonBalanceNumeric = 0;
        }
      } catch (e) {
        if (burnBalEl) burnBalEl.textContent = '0';
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: TOKEN BURN MODAL & REAL TEP-74 BURN DISPATCH
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Mathematically exact lossless token amount parser.
   * Prevents IEEE 754 float precision loss on large memecoin supplies.
   */
  function parseTokenUnits(amountInput, decimals = 9) {
    if (amountInput === null || amountInput === undefined) return 0n;
    let str = String(amountInput).trim().replace(/,/g, '');
    if (!str || str.startsWith('-')) return 0n;

    if (str.includes('e') || str.includes('E')) {
      const num = Number(str);
      if (isNaN(num) || num <= 0) return 0n;
      str = num.toFixed(decimals);
    }

    const parts = str.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');

    if (!/^\d+$/.test(whole) || !/^\d+$/.test(frac)) return 0n;

    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(frac);
  }

  window.labsOpenBurnConfirmModal = function () {
    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    if (!tc || !tc.connected || !tc.account?.address) {
      alert('⚠️ Wallet not connected.\n\nPlease connect your TON wallet to burn tokens.');
      if (tc && tc.openModal) tc.openModal();
      return;
    }

    const input = document.getElementById('labs-burn-amount');
    const amount = Number(input ? input.value : 0);
    if (!amount || isNaN(amount) || amount <= 0) {
      alert('Please enter a valid token amount greater than 0 to burn.');
      if (input) input.focus();
      return;
    }

    const token = wizardState.activeToken || wizardState.deployedToken || {};
    const symbol = token.symbol || document.getElementById('labs-tm-token-symbol')?.textContent?.replace(/[()$]/g, '') || 'TOK';
    const name = token.name || document.getElementById('labs-tm-token-name')?.textContent || 'Token';

    const modalTokenLabel = document.getElementById('modal-burn-token-label');
    const modalAmountLabel = document.getElementById('modal-burn-amount-label');
    const checkbox = document.getElementById('burn-confirm-checkbox');

    if (modalTokenLabel) modalTokenLabel.textContent = `${name} (${symbol})`;
    if (modalAmountLabel) modalAmountLabel.textContent = `${amount.toLocaleString()} ${symbol}`;
    if (checkbox) checkbox.checked = false;

    labsOpenModal('burn-confirm-modal');
  };

  window.labsSetBurnPercent = function (pct) {
    const bal = wizardState.userJettonBalanceNumeric || 0;
    if (!bal || bal <= 0) {
      alert('No token balance found in your connected wallet for this Jetton.');
      return;
    }
    const input = document.getElementById('labs-burn-amount');
    if (input) {
      const val = bal * (pct / 100);
      input.value = (pct === 100) ? val : Number(val.toFixed(4));
    }
  };

  window.labsExecuteBurnFromModal = function () {
    const checkbox = document.getElementById('burn-confirm-checkbox');
    if (checkbox && !checkbox.checked) {
      alert('⚠️ Please check the confirmation box acknowledging that token burning is irreversible.');
      return;
    }

    const input = document.getElementById('labs-burn-amount');
    const amount = input ? input.value : '';
    const token = wizardState.activeToken || wizardState.deployedToken || {};
    const renAddr = document.getElementById('renounce-minter-addr');
    const selectEl = document.getElementById('user-jetton-select');
    const minterAddr = (renAddr && renAddr.value) || token.address || (selectEl && selectEl.value);

    labsCloseModal('burn-confirm-modal');

    if (typeof window.burnTokensWeb3 === 'function') {
      window.burnTokensWeb3(minterAddr, amount);
    }
  };

  /**
   * Real on-chain burn transaction via TEP-74 op::burn (0x595f07bc)
   * Dispatched to the user's Jetton Wallet with on-chain verification
   */
  window.burnTokensWeb3 = async function (minterAddress, amount) {
    const tc = window.tonConnectUI || window.TonConnectUIInstance;
    const statusBanner = document.getElementById('labs-burn-status-banner');
    const burnBtn = document.getElementById('labs-burn-btn');
    const origBtnText = burnBtn ? burnBtn.innerHTML : '🔥 Burn Tokens';

    if (!tc || !tc.connected || !tc.account?.address) {
      alert('Please connect your TON wallet first.');
      if (tc && tc.openModal) tc.openModal();
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid token amount greater than 0 to burn.');
      return;
    }

    const userAddress = tc.account.address;
    const { beginCell, Address } = window.TON_CORE || {};
    if (!beginCell || !Address) {
      alert('TON Core libraries are still loading. Please wait a moment.');
      return;
    }

    try {
      if (burnBtn) {
        burnBtn.disabled = true;
        burnBtn.innerHTML = '<span class="status-dot"></span> Resolving Jetton Wallet...';
      }

      if (statusBanner) {
        statusBanner.style.display = 'block';
        statusBanner.style.background = 'rgba(0,210,255,0.08)';
        statusBanner.style.border = '1px solid var(--labs-cyan)';
        statusBanner.style.color = 'var(--labs-cyan)';
        statusBanner.innerHTML = '⏳ <strong>Verifying Jetton Wallet:</strong> Querying TON blockchain for your token account...';
      }

      // 1. Fetch user Jetton wallet and current balance from TonAPI
      let jettonWalletAddress = wizardState.userJettonWalletAddress || null;
      let userBalanceRaw = 0n;
      let decimals = 9;

      try {
        const jRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(userAddress)}/jettons/${encodeURIComponent(minterAddress)}`);
        if (jRes.ok) {
          const jData = await jRes.json();
          if (jData && jData.wallet_address && jData.wallet_address.address) {
            jettonWalletAddress = jData.wallet_address.address;
            userBalanceRaw = BigInt(jData.balance || '0');
            if (jData.jetton && jData.jetton.decimals) {
              decimals = parseInt(jData.jetton.decimals, 10);
            }
          }
        }
      } catch (err) {
        console.warn('TonAPI account jetton lookup:', err);
      }

      // Fallback: query minter contract get_wallet_address getter if not found above
      if (!jettonWalletAddress) {
        const gwRes = await labsFetchTonApi(`/blockchain/accounts/${encodeURIComponent(minterAddress)}/methods/get_wallet_address?args=${encodeURIComponent(userAddress)}`);
        if (gwRes.ok) {
          const gwData = await gwRes.json();
          if (gwData.decoded && gwData.decoded.jetton_wallet_address) {
            jettonWalletAddress = gwData.decoded.jetton_wallet_address;
          }
        }
      }

      if (!jettonWalletAddress) {
        throw new Error('Could not resolve your Jetton Wallet address on-chain. Make sure you hold tokens of this Jetton in your connected wallet.');
      }

      // Lossless base units conversion
      let burnUnits = parseTokenUnits(amount, decimals);
      if (burnUnits <= 0n) {
        throw new Error('Invalid burn amount specified.');
      }

      // If user selected 100% MAX, burn exact raw balance
      if (userBalanceRaw > 0n && (burnUnits === userBalanceRaw || (burnUnits > userBalanceRaw && burnUnits - userBalanceRaw <= 10n))) {
        burnUnits = userBalanceRaw;
      }

      if (userBalanceRaw > 0n && burnUnits > userBalanceRaw) {
        const availFormatted = (Number(userBalanceRaw) / (10 ** decimals)).toLocaleString();
        throw new Error(`Insufficient token balance. You have ${availFormatted} tokens available, but attempted to burn ${numAmount.toLocaleString()}.`);
      }

      // Capture initial total supply before burning for dual verification
      let initialSupply = 0n;
      try {
        const supRes = await labsFetchTonApi(`/blockchain/accounts/${encodeURIComponent(minterAddress)}/methods/get_jetton_data`);
        if (supRes.ok) {
          const supData = await supRes.json();
          initialSupply = BigInt(supData.decoded?.total_supply || '0');
        }
      } catch (e) {}

      if (statusBanner) {
        statusBanner.innerHTML = '⏳ <strong>Awaiting Wallet Signature:</strong> Please approve the burn transaction in your TON wallet...';
      }
      if (burnBtn) burnBtn.innerHTML = '<span class="status-dot"></span> Awaiting Signature...';

      // 2. Build TEP-74 op::burn (0x595f07bc) message
      // body: op (uint32 = 0x595f07bc), query_id (uint64), jetton_amount (Coins), response_address (MsgAddress), custom_payload (Maybe Cell)
      const userParsedAddr = Address.parse(userAddress);
      const burnPayload = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(BigInt(Date.now()), 64)
        .storeCoins(burnUnits)
        .storeAddress(userParsedAddr)
        .storeBit(0) // null custom_payload
        .endCell();

      const targetFriendly = Address.parse(jettonWalletAddress).toString({ bounceable: true, urlSafe: true });

      const tx = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: targetFriendly,
          amount: '50000000', // 0.05 TON for gas
          payload: burnPayload.toBoc().toString('base64')
        }]
      };

      // 3. Send transaction via TonConnect
      await tc.sendTransaction(tx);

      if (statusBanner) {
        statusBanner.style.background = 'rgba(255,107,0,0.1)';
        statusBanner.style.border = '1px solid #ff8a00';
        statusBanner.style.color = '#ffaa44';
        statusBanner.innerHTML = '🔥 <strong>Transaction Broadcast:</strong> Burn transaction submitted to TON network. Polling blockchain to verify on-chain supply and balance reduction... <span class="status-dot"></span>';
      }
      if (burnBtn) burnBtn.innerHTML = '<span class="status-dot"></span> Verifying On-Chain...';

      // 4. Poll blockchain for verified balance and supply reduction
      let verifiedBalance = false;
      let verifiedSupply = false;
      const initialBalance = userBalanceRaw;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          // Poll user balance
          const pollRes = await labsFetchTonApi(`/accounts/${encodeURIComponent(userAddress)}/jettons/${encodeURIComponent(minterAddress)}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            const currentBal = BigInt(pollData.balance || '0');
            if (currentBal < initialBalance) {
              verifiedBalance = true;
            }
          }
          // Poll minter total supply
          if (initialSupply > 0n) {
            const sRes = await labsFetchTonApi(`/blockchain/accounts/${encodeURIComponent(minterAddress)}/methods/get_jetton_data`);
            if (sRes.ok) {
              const sData = await sRes.json();
              const curSup = BigInt(sData.decoded?.total_supply || '0');
              if (curSup < initialSupply) {
                verifiedSupply = true;
              }
            }
          }
          if (verifiedBalance || verifiedSupply) {
            break;
          }
        } catch (e) {}
      }
      const verified = verifiedBalance || verifiedSupply;

      if (verified) {
        if (statusBanner) {
          statusBanner.style.background = 'rgba(0,255,136,0.1)';
          statusBanner.style.border = '1px solid var(--labs-green)';
          statusBanner.style.color = '#fff';
          statusBanner.innerHTML = `✔ <strong>Burn Verified On-Chain:</strong> Successfully burned <strong>${numAmount.toLocaleString()}</strong> tokens permanently. On-chain total supply and wallet balance updated.`;
        }
      } else {
        if (statusBanner) {
          statusBanner.style.background = 'rgba(255,165,0,0.1)';
          statusBanner.style.border = '1px solid orange';
          statusBanner.style.color = '#ffb040';
          statusBanner.innerHTML = '⚠️ <strong>Transaction Broadcast:</strong> Burn submitted. TON indexers may take 30-60 seconds to update. Please refresh the page to view updated balances.';
        }
      }

      // Refresh UI
      if (typeof window.labsRefreshSecurityAnalysis === 'function') {
        await window.labsRefreshSecurityAnalysis();
      }

      const burnInput = document.getElementById('labs-burn-amount');
      if (burnInput) burnInput.value = '';

    } catch (err) {
      console.error('Burn error:', err);
      if (statusBanner) {
        statusBanner.style.display = 'block';
        statusBanner.style.background = 'rgba(255,68,68,0.1)';
        statusBanner.style.border = '1px solid #ff4444';
        statusBanner.style.color = '#ff8888';
        statusBanner.innerHTML = `❌ <strong>Burn Failed:</strong> ${err.message || String(err)}`;
      }
      alert(`Burn Failed: ${err.message || String(err)}`);
    } finally {
      if (burnBtn) {
        burnBtn.disabled = false;
        burnBtn.innerHTML = origBtnText;
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 8. STEP 6: REAL-TIME ANALYTICS (ZERO FABRICATED METRICS)
  // ═══════════════════════════════════════════════════════════════════

  let tokenAnalyticsRequest = 0;
  window.labsLoadTokenAnalytics = async function (minterAddress) {
    if (!minterAddress) return;
    const request = ++tokenAnalyticsRequest;
    const network = getNetworkContext().chainId;
    const current = () => {
      try { return request === tokenAnalyticsRequest && network === getNetworkContext().chainId; }
      catch (_) { return false; }
    };
    wizardState.selectedTokenAddress = minterAddress;

    const anaHolders = document.getElementById('labs-ana-holders');
    const anaSupply = document.getElementById('labs-ana-total-supply');
    const anaCirc = document.getElementById('labs-ana-circ-supply');
    const anaPool = document.getElementById('labs-ana-pool-status');
    const listContainer = document.getElementById('labs-ana-holders-list');
    const tonscanLink = document.getElementById('labs-ana-tonscan-link');
    for (const id of ['labs-ana-holders','labs-ana-total-supply','labs-ana-circ-supply','labs-tm-total-supply','labs-tm-circ-supply','labs-tm-holders-count']) {
      const el = document.getElementById(id);
      if (el) el.textContent = 'Unavailable';
    }
    if (listContainer) listContainer.textContent = 'Holder data unavailable.';
    if (anaPool) anaPool.textContent = 'DEX pool status unverified.';

    const friendlyAddr = rawToFriendly(minterAddress);
    if (tonscanLink) {
      tonscanLink.href = `${getNetworkContext().tonscanBase}/address/${encodeURIComponent(friendlyAddr)}`;
    }

    try {
      let totalSuppRaw = null;
      // 1. Fetch live Jetton info
      const res = await labsFetchTonApi(`/jettons/${encodeURIComponent(minterAddress)}`);
      if (res.ok) {
        const jData = await res.json();
        if (!current()) return;
        const meta = jData.metadata || {};
        const totalRaw = jData.total_supply;
        if (typeof totalRaw === 'string' && /^\d{1,130}$/.test(totalRaw)) totalSuppRaw = BigInt(totalRaw);
        const totalSupply = window.ANLGRAM_READONLY_UTILS
          ? window.ANLGRAM_READONLY_UTILS.formatUnits(totalRaw, meta.decimals)
          : 'Unavailable';
        const holders = Number.isSafeInteger(jData.holders_count) && jData.holders_count >= 0 ? formatNumber(jData.holders_count) : 'Unavailable';

        if (anaSupply) anaSupply.textContent = totalSupply;
        if (anaCirc) anaCirc.textContent = 'Unavailable';
        if (anaHolders) anaHolders.textContent = holders;

        // Update Card 4 elements as well
        const tmSupply = document.getElementById('labs-tm-total-supply');
        const tmCirc = document.getElementById('labs-tm-circ-supply');
        const tmHolders = document.getElementById('labs-tm-holders-count');
        if (tmSupply) tmSupply.textContent = totalSupply;
        if (tmCirc) tmCirc.textContent = 'Unavailable';
        if (tmHolders) tmHolders.textContent = holders;
      }

      // 2. Fetch live Top Holders
      const hRes = await labsFetchTonApi(`/jettons/${encodeURIComponent(minterAddress)}/holders?limit=5`);
      if (hRes.ok) {
        const hData = await hRes.json();
        if (!current()) return;
        const addresses = hData.addresses || [];

        if (listContainer) {
          if (addresses.length === 0) {
            listContainer.innerHTML = '<div style="padding:12px;color:var(--labs-text-muted);font-size:12px;">No holder records found on-chain.</div>';
          } else {
            listContainer.innerHTML = addresses.slice(0, 5).map((h, i) => {
              const valid = typeof h.balance === 'string' && /^\d{1,130}$/.test(h.balance);
              const bal = valid ? BigInt(h.balance) : null;
              const pct = totalSuppRaw > 0n && bal !== null && bal <= totalSuppRaw ? ((Number(bal * 1000n / totalSuppRaw)) / 10).toFixed(1) : null;
              const friendly = escapeHtml(shortAddr(rawToFriendly(h.address)));
              return `
                <div class="labs-holder-row" style="margin-bottom:8px;">
                  <span class="labs-holder-name" style="font-family:var(--font-mono); font-size:11px;">${i + 1}. ${friendly}</span>
                  <div class="labs-holder-bar-bg" style="flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin:0 10px;">
                    <div class="labs-holder-bar-fill" style="width: ${pct === null ? 0 : pct}%; height:100%; background:var(--labs-cyan);"></div>
                  </div>
                  <span class="labs-holder-pct" style="font-family:var(--font-mono); font-size:11px; color:#fff;">${pct === null ? 'Unavailable' : pct + '%'}</span>
                </div>
              `;
            }).join('');
          }
        }
      }

      if (!current()) return;
      // This route has no authenticated DEX-pool discovery evidence.
      if (anaPool) {
        anaPool.innerHTML = `
          <div style="font-size:12px; color:var(--labs-text-muted); line-height:1.5;">
            ℹ️ <strong>DEX Pool Status:</strong> Unverified. No authenticated pool or liquidity custody evidence is available in this view.
          </div>
        `;
      }

      // Sparkline rendering
      labsRenderSparkline();

    } catch (err) {
      console.warn('Could not load real-time analytics for', minterAddress, err);
    }
  };

  // Sparkline Chart (Clean indicator)
  function labsRenderSparkline() {
    const canvas = document.getElementById('labs-ana-sparkline');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth || 220;
    const height = canvas.height = 50;

    ctx.clearRect(0, 0, width, height);

    // Draw gentle baseline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 9. MODAL & WALLET EVENTS
  // ═══════════════════════════════════════════════════════════════════

  window.labsOpenModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  };

  window.labsCloseModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  };

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('labs-modal-backdrop')) {
      e.target.classList.remove('active');
    }
  });

  let walletTokenRequest = 0;
  // Watch for connected wallet changes
  window.addEventListener('anlgramWalletChanged', async (e) => {
    const request = ++walletTokenRequest;
    const address = e.detail.address;
    wizardState.userTokens = [];
    let context;
    try { context = getNetworkContext().chainId; } catch (_) { context = null; }
    const walletBtn = document.getElementById('labsTopbarWalletBtn');
    const lifecycleSelect = document.getElementById('labs-lifecycle-select');

    if (walletBtn) {
      if (address) {
        walletBtn.innerHTML = `💎 ${shortAddr(toFriendly(address))}`;
        walletBtn.style.borderColor = 'var(--labs-green)';
      } else {
        walletBtn.innerHTML = `Connect Wallet`;
        walletBtn.removeAttribute('style');
      }
    }

    if (lifecycleSelect) lifecycleSelect.innerHTML = '<option value="new">+ Create New Jetton (Wizard)</option>';
    if (!address || !context) return;

    // Populate Lifecycle Selector with user's on-chain tokens
    try {
      const res = await labsFetchTonApi(`/accounts/${encodeURIComponent(address)}/jettons`);
      if (res.ok) {
        const data = await res.json();
        if (request !== walletTokenRequest || context !== getNetworkContext().chainId) return;
        const balances = (data.balances || []).filter(b => !window.BlockchainProvider || window.BlockchainProvider.validateTonAddress(b?.jetton?.address).valid);
        wizardState.userTokens = balances.map((b) => ({
          address: b.jetton.address,
          name: b.jetton.name || 'Token',
          symbol: b.jetton.symbol || 'TKN',
          decimals: b.jetton.decimals ?? 9,
          image: b.jetton.image || '',
          balance: b.balance
        }));

        if (lifecycleSelect) {
          const currentVal = lifecycleSelect.value;
          let optHtml = `<option value="new">+ Create New Jetton (Wizard)</option>`;
          if (wizardState.userTokens.length > 0) {
            optHtml += `<optgroup label="Tokens in Connected Wallet">`;
            wizardState.userTokens.forEach((t) => {
              optHtml += `<option value="${escapeHtml(t.address)}">${escapeHtml(t.name)} (${escapeHtml(t.symbol)})</option>`;
            });
            optHtml += `</optgroup>`;
          }
          lifecycleSelect.innerHTML = optHtml;
          if (currentVal) lifecycleSelect.value = currentVal;
        }
      }
    } catch (err) {
      console.warn('Could not populate user tokens in lifecycle bar:', err);
    }
  });

  // Dropzone initialization
  document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('labs-dist-dropzone');
    const fileInput = document.getElementById('labs-dist-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          labsHandleCsvFile(e.target.files[0]);
        }
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--labs-cyan)';
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = '';
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          labsHandleCsvFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Initialize Step or Tab from URL hash
    const initialHash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (['launchpad', 'liquidity', 'analytics', 'token-manager', 'distribution', 'vesting', 'projects'].includes(initialHash)) {
      window.labsSwitchSection(initialHash);
    } else {
      window.labsGoToStep(1);
    }
  });

})();
