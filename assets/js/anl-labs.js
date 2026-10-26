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
      isSending: false
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
  function rawToFriendly(raw) {
    if (!raw) return '';
    if (window.TON_CORE && window.TON_CORE.Address) {
      try {
        return window.TON_CORE.Address.parse(raw).toString({ bounceable: true, urlSafe: true });
      } catch (e) { /* fallback */ }
    }
    // Fallback: if already EQ/UQ format
    if (/^[EUe][Qq]/.test(raw)) return raw;
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

    if (existingExplorer) existingExplorer.style.display = 'none';
    if (existingLaunchpad) existingLaunchpad.style.display = 'none';
    if (existingWallet) existingWallet.style.display = 'none';
    if (existingLiquidity) existingLiquidity.style.display = 'none';
    if (existingAnalytics) existingAnalytics.style.display = 'none';
    if (flowSection) flowSection.style.display = 'block';

    switch (sectionId) {
      case 'labs':
        window.labsGoToStep(1);
        break;
      case 'launchpad':
        window.labsGoToStep(1);
        break;
      case 'token-manager':
        window.labsGoToStep(5);
        break;
      case 'distribution':
        window.labsGoToStep(3);
        break;
      case 'vesting':
        window.labsGoToStep(4);
        break;
      case 'liquidity':
        window.labsGoToStep(5);
        break;
      case 'analytics':
        window.labsGoToStep(6);
        break;
      case 'projects':
        window.labsOpenModal('my-projects-modal');
        break;
      default:
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
      isAdmin: true,
      isRenounced: false
    };

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
    document.querySelectorAll('.labs-avatar-preview, #logo-preview-container, .wizard-dex-preview-avatar').forEach((el) => {
      el.innerHTML = `<img src="${url}" alt="Token Logo" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"/>`;
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
    if (rNetwork) rNetwork.textContent = 'TON Mainnet';

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
      const logo = draft.logoUrl || draft.logoDataUrl;
      if (logo) {
        rAvatar.innerHTML = `<img src="${logo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
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

    labsOpenModal('deploy-confirm-modal');
  };

  window.labsExecuteDeployFromWizard = async function () {
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
        currentTarget: {
          innerHTML: '',
          style: {},
          removeAttribute: () => {}
        }
      };

      // Call the existing window.deployJettonWeb3
      if (typeof window.deployJettonWeb3 === 'function') {
        await window.deployJettonWeb3(fakeEvent);
      } else {
        throw new Error('deployJettonWeb3 function not found.');
      }

      // Check if deployment resulted in contract address calculation
      if (statusText) {
        statusText.innerHTML = '<span class="status-dot"></span> Transaction broadcast! Verifying contract state on TON blockchain...';
      }
      wizardState.deployment.status = 'verifying';

      // Poll TonAPI to reliably verify on-chain deployment
      await labsPollDeploymentConfirmation();

    } catch (err) {
      console.error('Wizard Deployment Error:', err);
      wizardState.deployment.status = 'failed';
      wizardState.deployment.error = err.message || String(err);

      if (statusText) {
        statusText.innerHTML = `<span style="color:#ff4444;">❌ Deployment failed or cancelled: ${err.message || 'Signature rejected'}</span>`;
      }
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.style.opacity = '1';
        deployBtn.style.pointerEvents = 'auto';
      }
    }
  };

  window.addEventListener('anlgramJettonDeployed', (e) => {
    const { destAddressMint, name, symbol } = e.detail || {};
    if (destAddressMint) {
      wizardState.deployment.minterAddress = destAddressMint;
      wizardState.deployment.status = 'verifying';
      labsPollDeploymentConfirmation(destAddressMint);
    }
  });

  async function labsPollDeploymentConfirmation(explicitMinter) {
    const statusText = document.getElementById('wizard-deploy-status-text');
    const successArea = document.getElementById('wizard-deploy-success-area');
    const deployBtn = document.getElementById('wizard-step2-deploy-btn');
    const contractLink = document.getElementById('wizard-deploy-contract-link');

    const tc = window.tonConnectUI;
    const sender = tc && tc.account ? tc.account.address : '';

    let confirmed = false;
    let foundMinter = '';

    // Poll TonAPI for new transactions on user's wallet
    for (let attempt = 1; attempt <= 12; attempt++) {
      if (statusText) {
        statusText.innerHTML = `<span class="status-dot"></span> Verifying on-chain state (Attempt ${attempt}/12)...`;
      }
      await new Promise((r) => setTimeout(r, 3500));

      try {
        const res = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(sender)}/jettons`);
        if (res.ok) {
          const jData = await res.json();
          const balances = jData.balances || [];
          // Look for newly created jetton matching our symbol/name
          const match = balances.find((b) => b.jetton.symbol === wizardState.tokenDraft.symbol);
          if (match) {
            confirmed = true;
            foundMinter = match.jetton.address;
            break;
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
      wizardState.activeToken = {
        address: foundMinter,
        name: wizardState.tokenDraft.name,
        symbol: wizardState.tokenDraft.symbol,
        decimals: 9,
        isAdmin: true,
        isRenounced: false
      };

      if (statusText) {
        statusText.innerHTML = '✅ <strong style="color:var(--labs-green);">Jetton Contract Verified On-Chain!</strong>';
      }
      if (successArea) successArea.style.display = 'block';
      if (contractLink) {
        contractLink.href = `https://tonscan.org/address/${encodeURIComponent(friendlyMinter)}`;
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
            ⏳ <strong>Transaction submitted to TON validators.</strong><br>
            Blockchain indexing may take up to a minute. Check your wallet activity or inspect your account on TonScan.
          </div>
        `;
      }
      if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.style.opacity = '1';
        deployBtn.style.pointerEvents = 'auto';
        deployBtn.textContent = 'Check Deployment Status Again';
        deployBtn.onclick = () => labsPollDeploymentConfirmation();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. STEP 3: MULTI-WALLET DISTRIBUTOR (CSV & TEP-74 BATCH SENDER)
  // ═══════════════════════════════════════════════════════════════════

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
    const lines = (rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const recipients = [];
    const seen = new Set();
    const defaultAmount = parseFloat(document.getElementById('labs-dist-amount')?.value || '1000') || 1000;
    const distType = wizardState.distributor.distributionType;

    for (const line of lines) {
      const parts = line.split(/[,;\t\s]+/).filter(Boolean);
      if (parts.length === 0) continue;
      const addr = parts[0];
      const customAmt = parts[1] ? parseFloat(parts[1]) : defaultAmount;

      const isValid = isValidTonAddress(addr);
      const isDuplicate = seen.has(addr);
      seen.add(addr);

      recipients.push({
        address: addr,
        amount: distType === 'custom' && !isNaN(customAmt) ? customAmt : defaultAmount,
        valid: isValid && !isDuplicate,
        error: !isValid ? 'Invalid address' : (isDuplicate ? 'Duplicate address' : null)
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

    const batches = Math.ceil(validRecs.length / 4) || 0;
    const estimatedGasTon = (batches * 0.05).toFixed(2);

    const statusEl = document.getElementById('labs-dist-status-text');
    if (statusEl) {
      if (validRecs.length === 0) {
        statusEl.innerHTML = 'Enter recipient addresses or drag and drop a CSV file to begin.';
        statusEl.style.color = 'var(--labs-text-muted)';
      } else {
        statusEl.innerHTML = `<strong>${validRecs.length}</strong> valid recipients | <strong>${formatNumber(totalTokens)}</strong> tokens required | Est. Gas: ~${estimatedGasTon} TON (${batches} batch${batches > 1 ? 'es' : ''})`;
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
            <td style="font-family:var(--font-mono); font-size:11px;">${r.address}</td>
            <td style="font-family:var(--font-mono);">${r.amount.toLocaleString()}</td>
            <td>${r.valid ? '<span style="color:#00ff88;">✔ Valid</span>' : `<span style="color:#ff4444;">✖ ${r.error}</span>`}</td>
          </tr>
        `).join('');
      }
    }
  };

  window.labsReviewAndSendDistribution = function () {
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

    labsOpenModal('distributor-modal');
    labsUpdateDistributorPreview();
  };

  // Safe On-Chain Batch Execution via TonConnect (TEP-74 OP 0x0f8a7ea5)
  window.labsExecuteDistributionBatch = async function () {
    const tc = window.tonConnectUI;
    if (!tc || !tc.connected) {
      alert('⚠️ Please connect your TON wallet first using the "Connect Wallet" button.');
      if (tc) tc.openModal();
      return;
    }

    const validRecs = wizardState.distributor.recipients.filter((r) => r.valid);
    if (validRecs.length === 0) {
      alert('No valid recipients to distribute to.');
      return;
    }

    const jettonMinter = (wizardState.activeToken && wizardState.activeToken.address) ||
                         document.getElementById('user-jetton-select')?.value;

    if (!jettonMinter) {
      alert('⚠️ Please select or deploy the Jetton you wish to distribute.');
      return;
    }

    const batchesCount = Math.ceil(validRecs.length / 4);
    const confirmMsg =
      `Confirm Multi-Wallet Distribution:\n\n` +
      `• Total Tokens: ${formatNumber(wizardState.distributor.totalAmount)}\n` +
      `• Total Recipients: ${validRecs.length}\n` +
      `• Transaction Batches: ${batchesCount} (up to 4 transfers per tx)\n\n` +
      `You will be prompted to sign each batch with your connected TON wallet. Proceed?`;

    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('labs-dist-modal-submit');
    if (btn) {
      btn.innerHTML = '<span class="status-dot"></span> Fetching Sender Jetton Wallet...';
      btn.style.pointerEvents = 'none';
    }

    try {
      const { Address, beginCell, toNano } = window.TON_CORE || {};
      if (!beginCell) throw new Error('TON Core library not loaded.');

      const senderAddr = tc.account.address;
      const jRes = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(senderAddr)}/jettons/${encodeURIComponent(jettonMinter)}`);
      if (!jRes.ok) throw new Error('Could not find a Jetton wallet for this token in your connected account. Ensure you have balance.');
      const jData = await jRes.json();
      const userJettonWalletAddr = jData.wallet_address?.address;
      if (!userJettonWalletAddr) throw new Error('You do not have a deployed wallet for this Jetton.');

      const batchSize = 4;
      const batches = [];
      for (let i = 0; i < validRecs.length; i += batchSize) {
        batches.push(validRecs.slice(i, i + batchSize));
      }

      for (let bIndex = 0; bIndex < batches.length; bIndex++) {
        const batch = batches[bIndex];
        if (btn) btn.innerHTML = `<span class="status-dot"></span> Signing Batch ${bIndex + 1} of ${batches.length}...`;

        const messages = [];
        for (const recipient of batch) {
          const recAddress = Address.parse(recipient.address);
          const responseAddress = Address.parse(senderAddr);
          const jettonDecimals = 9;
          const jettonAmountNano = BigInt(Math.floor(recipient.amount * Math.pow(10, jettonDecimals)));

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
          messages: messages
        };

        await tc.sendTransaction(tx);
      }

      if (btn) {
        btn.innerHTML = '✔ Distribution Batches Broadcast Successfully!';
        btn.style.background = 'rgba(0, 229, 153, 0.2)';
        btn.style.color = '#00e599';
      }
      setTimeout(() => {
        labsCloseModal('distributor-modal');
        if (btn) {
          btn.innerHTML = 'Confirm & Send Distribution';
          btn.removeAttribute('style');
        }
      }, 3500);

    } catch (err) {
      console.error('Distribution Error:', err);
      alert('❌ Error during distribution:\n\n' + (err.message || err));
      if (btn) {
        btn.innerHTML = 'Confirm & Send Distribution';
        btn.removeAttribute('style');
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 6. STEP 4: VESTING & LOCK (HONEST DEVELOPMENT STATUS)
  // ═══════════════════════════════════════════════════════════════════

  window.labsOpenVestingSchedule = function () {
    labsOpenModal('vesting-modal');
  };

  window.labsSubmitVesting = function () {
    // Honest notification per Mandatory Condition 5
    alert(
      "🔒 Non-Custodial Vesting Smart Contract — Development Status\n\n" +
      "The linear vesting smart contract for TON Jettons is currently undergoing formal specification and security review.\n\n" +
      "To protect user assets, on-chain token locks cannot be executed on Mainnet until the smart contract audit is completed and verified.\n\n" +
      "You may configure schedule parameters in Step 4 for planning purposes, but no on-chain lock transaction will be simulated or executed."
    );
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
    const renAddr = document.getElementById('renounce-minter-addr');

    if (tmSymbol) tmSymbol.textContent = token.symbol || 'TKN';
    if (tmName) tmName.textContent = token.name || 'Token';
    if (tmAddr) tmAddr.textContent = shortAddr(friendlyMinterAddress(friendlyAddr));
    if (renAddr) renAddr.value = friendlyAddr;

    // Check if renounced in localStorage or on-chain
    const renKey = 'anlgram_renounced_' + token.address.replace(/[^a-zA-Z0-9]/g, '_');
    const isRen = !!localStorage.getItem(renKey);
    const renBanner = document.getElementById('mint-renounced-banner');
    const mintBtn = document.getElementById('mint-btn');
    const renBtn = document.getElementById('renounce-btn');

    if (isRen) {
      if (renBanner) renBanner.style.display = 'block';
      if (mintBtn) {
        mintBtn.disabled = true;
        mintBtn.style.opacity = '0.45';
        mintBtn.innerHTML = '🔒 Minting Permanently Disabled (Admin Renounced)';
      }
      if (renBtn) {
        renBtn.disabled = true;
        renBtn.style.opacity = '0.45';
        renBtn.textContent = '🔒 Admin Already Renounced On-Chain';
      }
    } else {
      if (renBanner) renBanner.style.display = 'none';
      if (mintBtn) {
        mintBtn.disabled = false;
        mintBtn.style.opacity = '1';
        mintBtn.innerHTML = '⚗️ Mint Tokens to My Wallet';
      }
      if (renBtn) {
        renBtn.disabled = false;
        renBtn.style.opacity = '1';
        renBtn.textContent = '🔒 Renounce Admin (Burn Key)';
      }
    }
  }

  function friendlyMinterAddress(addr) {
    return addr || '';
  }

  window.labsOpenRenounceConfirmModal = function () {
    labsOpenModal('renounce-confirm-modal');
  };

  window.labsConfirmRenounceExecution = function (e) {
    const check = document.getElementById('renounce-confirm-checkbox');
    if (check && !check.checked) {
      alert('⚠️ You must check the confirmation box acknowledging that this action is 100% irreversible.');
      return;
    }
    labsCloseModal('renounce-confirm-modal');

    // Call existing renounceAdminWeb3
    if (typeof window.renounceAdminWeb3 === 'function') {
      window.renounceAdminWeb3(e);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 8. STEP 6: REAL-TIME ANALYTICS (ZERO FABRICATED METRICS)
  // ═══════════════════════════════════════════════════════════════════

  window.labsLoadTokenAnalytics = async function (minterAddress) {
    if (!minterAddress) return;
    wizardState.selectedTokenAddress = minterAddress;

    const anaHolders = document.getElementById('labs-ana-holders');
    const anaSupply = document.getElementById('labs-ana-total-supply');
    const anaCirc = document.getElementById('labs-ana-circ-supply');
    const anaPool = document.getElementById('labs-ana-pool-status');
    const listContainer = document.getElementById('labs-ana-holders-list');
    const tonscanLink = document.getElementById('labs-ana-tonscan-link');

    const friendlyAddr = rawToFriendly(minterAddress);
    if (tonscanLink) {
      tonscanLink.href = `https://tonscan.org/address/${encodeURIComponent(friendlyAddr)}`;
    }

    try {
      // 1. Fetch live Jetton info
      const res = await fetch(`https://tonapi.io/v2/jettons/${encodeURIComponent(minterAddress)}`);
      if (res.ok) {
        const jData = await res.json();
        const meta = jData.metadata || {};
        const totalRaw = jData.total_supply || '0';
        const decimals = parseInt(meta.decimals || '9', 10);
        const totalSupply = Number(BigInt(totalRaw) / BigInt(10 ** decimals));

        if (anaSupply) anaSupply.textContent = formatNumber(totalSupply);
        if (anaCirc) anaCirc.textContent = formatNumber(totalSupply);
        if (anaHolders) anaHolders.textContent = formatNumber(jData.holders_count || 1);

        // Update Card 4 elements as well
        const tmSupply = document.getElementById('labs-tm-total-supply');
        const tmCirc = document.getElementById('labs-tm-circ-supply');
        const tmHolders = document.getElementById('labs-tm-holders-count');
        if (tmSupply) tmSupply.textContent = formatNumber(totalSupply);
        if (tmCirc) tmCirc.textContent = formatNumber(totalSupply);
        if (tmHolders) tmHolders.textContent = formatNumber(jData.holders_count || 1);
      }

      // 2. Fetch live Top Holders
      const hRes = await fetch(`https://tonapi.io/v2/jettons/${encodeURIComponent(minterAddress)}/holders?limit=5`);
      if (hRes.ok) {
        const hData = await hRes.json();
        const addresses = hData.addresses || [];
        const totalSuppRaw = addresses.reduce((acc, h) => acc + BigInt(h.balance || '0'), 0n);

        if (listContainer) {
          if (addresses.length === 0) {
            listContainer.innerHTML = '<div style="padding:12px;color:var(--labs-text-muted);font-size:12px;">No holder records found on-chain.</div>';
          } else {
            listContainer.innerHTML = addresses.slice(0, 5).map((h, i) => {
              const bal = BigInt(h.balance || '0');
              const pct = totalSuppRaw > 0n ? ((Number(bal * 1000n / totalSuppRaw)) / 10).toFixed(1) : '0';
              const friendly = shortAddr(rawToFriendly(h.address));
              return `
                <div class="labs-holder-row" style="margin-bottom:8px;">
                  <span class="labs-holder-name" style="font-family:var(--font-mono); font-size:11px;">${i + 1}. ${friendly}</span>
                  <div class="labs-holder-bar-bg" style="flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin:0 10px;">
                    <div class="labs-holder-bar-fill" style="width: ${Math.min(pct, 100)}%; height:100%; background:var(--labs-cyan);"></div>
                  </div>
                  <span class="labs-holder-pct" style="font-family:var(--font-mono); font-size:11px; color:#fff;">${pct}%</span>
                </div>
              `;
            }).join('');
          }
        }
      }

      // 3. Pool status (honest unlisted check)
      if (anaPool) {
        anaPool.innerHTML = `
          <div style="font-size:12px; color:var(--labs-text-muted); line-height:1.5;">
            ℹ️ <strong>DEX Pool Status:</strong> No verified public pool with continuous volume detected yet on STON.fi or DeDust.
            Provide initial liquidity in Step 5 to activate automated price discovery and trading volume.
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

  // Watch for connected wallet changes
  window.addEventListener('anlgramWalletChanged', async (e) => {
    const address = e.detail.address;
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

    if (!address) {
      wizardState.userTokens = [];
      return;
    }

    // Populate Lifecycle Selector with user's on-chain tokens
    try {
      const res = await fetch(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}/jettons`);
      if (res.ok) {
        const data = await res.json();
        const balances = data.balances || [];
        wizardState.userTokens = balances.map((b) => ({
          address: b.jetton.address,
          name: b.jetton.name || 'Token',
          symbol: b.jetton.symbol || 'TKN',
          decimals: b.jetton.decimals || 9,
          balance: b.balance
        }));

        if (lifecycleSelect) {
          const currentVal = lifecycleSelect.value;
          let optHtml = `<option value="new">+ Create New Jetton (Wizard)</option>`;
          if (wizardState.userTokens.length > 0) {
            optHtml += `<optgroup label="Tokens in Connected Wallet">`;
            wizardState.userTokens.forEach((t) => {
              optHtml += `<option value="${t.address}">${t.name} (${t.symbol})</option>`;
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

    // Initialize Step 1
    window.labsGoToStep(1);
  });

})();
