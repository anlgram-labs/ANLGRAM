/**
 * ANLGRAM Launchpad — Factory Integration
 * Version: 1.0.0
 *
 * Factory submission remains blocked pending verified routing and approval.
 * Direct creation delegates to the canonical creator and its safeguards.
 *
 * Fee model (all BigInt, no floating point):
 *   Creation execution  : 0.20 TON
 *   Mandatory Donation  : 0.02 TON (10% of execution)
 *   Transaction total   : 0.22 TON before wallet network fees
 * See donation-config.js for the preserved main-branch creation allocation.
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // CONFIGURATION
  // ══════════════════════════════════════════════════════════
  const ANLGRAM_CONFIG = {
    FACTORY_TESTNET: '',   // TODO: fill after testnet deploy
    FACTORY_MAINNET: '',   // TODO: fill after mainnet deploy

    TREASURY: 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd',

    NETWORK: 'testnet',  // change to 'mainnet' when ready

    CLONE_SOURCE: '0:30eb766a2e69f0440efb3d6d3b0962049e0c20f9e222cac6aa67c216a542f49c',

    OP_CREATE_JETTON: 0x4e585a91,
  };

  // ══════════════════════════════════════════════════════════
  // FEE CALCULATION  (BigInt only)
  // ══════════════════════════════════════════════════════════

  function calculateFees() {
    const d = window.ANLGRAM_DONATION_CONFIG;
    if (!d || d.DONATION_AMOUNT_NANO !== 20000000n || d.BASE_EXECUTION_NANO !== 200000000n) throw new Error('Mandatory donation configuration unavailable.');
    return { blockchainCostNano: d.BASE_EXECUTION_NANO, platformFeeNano: d.DONATION_AMOUNT_NANO,
      estimatedTotalNano: d.TOTAL_TRANSACTION_NANO, sendAmountNano: d.TOTAL_TRANSACTION_NANO,
      blockchainCostTON: d.BASE_EXECUTION_TON, platformFeeTON: d.DONATION_AMOUNT_TON,
      estimatedTotalTON: d.TOTAL_TRANSACTION_TON, sendAmountTON: d.TOTAL_TRANSACTION_TON };
  }
  function nanoToTON(nano) {
    const whole = nano / 1_000_000_000n;
    const frac  = nano % 1_000_000_000n;
    const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '') || '0';
    return `${whole}.${fracStr}`;
  }

  // ══════════════════════════════════════════════════════════
  // QUOTE SYSTEM
  // ══════════════════════════════════════════════════════════

  let currentQuote = null;

  function generateFeeQuote(walletAddress) {
    const fees    = calculateFees();
    const network = ANLGRAM_CONFIG.NETWORK;
    const factory = network === 'mainnet'
      ? ANLGRAM_CONFIG.FACTORY_MAINNET
      : ANLGRAM_CONFIG.FACTORY_TESTNET;

    const quoteId = 'ANL-'
      + new Date().toISOString().slice(0, 10).replace(/-/g, '')
      + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

    currentQuote = {
      quoteId,
      network,
      wallet:             walletAddress || '',
      factoryAddress:     factory,
      blockchainCostNano: fees.blockchainCostNano,
      platformFeeNano:    fees.platformFeeNano,
      estimatedTotalNano: fees.estimatedTotalNano,
      sendAmountNano:     fees.sendAmountNano,
      blockchainCostTON:  fees.blockchainCostTON,
      platformFeeTON:     fees.platformFeeTON,
      estimatedTotalTON:  fees.estimatedTotalTON,
      sendAmountTON:      fees.sendAmountTON,
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
    };
    return currentQuote;
  }

  function isQuoteValid(q) {
    return q && Date.now() < q.expiresAt;
  }

  // ══════════════════════════════════════════════════════════
  // FACTORY TRANSACTION BUILDER
  // ══════════════════════════════════════════════════════════

  async function buildFactoryTransaction(quote, formData) {
    const { beginCell, toNano, Address } = window.TON_CORE || {};
    if (!beginCell) throw new Error('TON Core libraries not ready. Please retry.');
    if (!isQuoteValid(quote)) throw new Error('Fee quote expired. Please refresh the cost estimate.');
    if (!quote.factoryAddress) {
      throw new Error(
        'ANLGRAM Factory not yet deployed on ' + quote.network.toUpperCase() + '. ' +
        'Use the canonical creator with its disclosed Mandatory Donation (10%).'
      );
    }

    const { name, symbol, description, image, decimals, totalSupply, ownerAddress, quoteId } = formData;
    const strToCell = (s) => beginCell().storeUint(0, 8).storeStringTail(s || '').endCell();

    const creatorAddr = Address.parse(ownerAddress);
    const supplyNano  = BigInt(totalSupply) * (10n ** BigInt(decimals));

    const msgBody = beginCell()
      .storeUint(ANLGRAM_CONFIG.OP_CREATE_JETTON, 32)
      .storeUint(BigInt(Date.now()), 64)
      .storeRef(strToCell(name))
      .storeRef(strToCell(symbol))
      .storeRef(strToCell(description))
      .storeRef(strToCell(image))
      .storeUint(decimals, 8)
      .storeCoins(supplyNano)
      .storeAddress(creatorAddr)
      .storeRef(strToCell(quoteId))
      .endCell();

    return {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [{
        address: quote.factoryAddress,
        amount:  quote.sendAmountNano.toString(),
        payload: msgBody.toBoc().toString('base64'),
      }],
    };
  }

  // ══════════════════════════════════════════════════════════
  // MAIN: deployViaFactory
  // ══════════════════════════════════════════════════════════

  window.deployViaFactory = async function (event) {
    const btn      = event.currentTarget;
    const origHTML = btn.innerHTML;

    const tc = window.tonConnectUI;
    if (!tc) { alert('Wallet system initializing. Please retry.'); return; }
    if (!tc.connected) {
      alert("Connect your TON wallet first using 'Connect Wallet'!");
      tc.openModal(); return;
    }
    if (!window.TON_CORE?.Address) {
      alert('TON libraries still loading. Please retry in a few seconds.'); return;
    }

    const name   = (document.getElementById('lp-name')?.value   || '').trim();
    const symbol = (document.getElementById('lp-symbol')?.value || '').trim();
    const logo   = (document.getElementById('lp-logo')?.value   || '').trim();
    const desc   = (document.getElementById('lp-desc')?.value   || '').trim();

    if (!name)   { alert('Please enter a Token Name.');   return; }
    if (!symbol) { alert('Please enter a Token Symbol.'); return; }

    const creatorWallet = tc.account?.address || '';
    const quote = generateFeeQuote(creatorWallet);

    showProgress(btn, 0, 'Preparing transaction...');

    try {
      // If factory not deployed yet → fallback to direct deploy
      if (!quote.factoryAddress) {
        showProgress(btn, 1, 'Preparing creation with disclosed Mandatory Donation (10%)...');
        await directDeploy(btn, origHTML, tc, name, symbol, desc, logo);
        return;
      }

      throw new Error('Factory creation requires verified donation routing and explicit production approval. No wallet request was sent.');
      showProgress(btn, 1, 'Building factory transaction...');
      const formData = {
        name, symbol,
        description: desc,
        image: logo || 'https://anlgram-labs.github.io/ANLGRAM/assets/img/logo.png',
        decimals: 9,
        totalSupply: 1_000_000_000,
        ownerAddress: creatorWallet,
        quoteId: quote.quoteId,
      };
      const tx = await buildFactoryTransaction(quote, formData);

      showProgress(btn, 2, 'Confirm in your wallet — ONE transaction...');
      await tc.sendTransaction(tx);

      // A wallet response and a recent transaction to the factory do not prove
      // that this particular token was created. Keep the result unconfirmed.
      showProgress(btn, 3, 'Transaction submitted; token creation is not yet verified. Check your wallet and the blockchain.');

    } catch (e) {
      console.error('[Launchpad] Error:', e);
      const msg = e?.message || String(e);
      if (!msg.includes('User declined') && !msg.includes('rejected')) {
        // If factory missing → transparent fallback
        if (msg.includes('Falling back')) {
          await directDeploy(btn, origHTML, tc, name, symbol, desc, logo);
          return;
        }
        alert('❌ Token creation error:\n\n' + msg);
      }
      btn.innerHTML = origHTML;
      btn.removeAttribute('style');
    }
  };

  // ══════════════════════════════════════════════════════════
  // FALLBACK: DIRECT DEPLOY (existing logic, kept intact)
  // Active while Factory is not yet deployed
  // ══════════════════════════════════════════════════════════

  async function directDeploy(btn, origHTML, tc, name, symbol, desc, logo) {
    // Reuse the canonical creator: bytecode, network, intent persistence and
    // exact-address verification must not be bypassed by this entry point.
    if (typeof window.deployJettonWeb3 !== 'function') {
      throw new Error('Verified Jetton creator is unavailable. No wallet request was sent.');
    }
    const result = await window.deployJettonWeb3({ currentTarget: btn });
    if (!result?.submitted) {
      btn.innerHTML = origHTML;
      btn.removeAttribute('style');
      if (result?.uncertain) {
        btn.textContent = 'Deployment outcome pending — check wallet and contract';
        return result;
      }
      throw new Error(result?.reason || 'Jetton creation was not submitted.');
    }
    // The creator emits its existing event to start exact-address state checks.
    // Wallet acceptance alone is never displayed as completed deployment.
    btn.textContent = 'Transaction submitted — deployment not yet verified';
    return result;
  }
  // ══════════════════════════════════════════════════════════
  // TX MONITORING  (best-effort, no backend)
  // ══════════════════════════════════════════════════════════

  async function waitForConfirmation(sender, factory, timeoutMs) {
    const base = ANLGRAM_CONFIG.NETWORK === 'mainnet'
      ? 'https://tonapi.io' : 'https://testnet.tonapi.io';
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(3000);
      try {
        const url  = `${base}/v2/blockchain/accounts/${factory}/transactions?limit=5`;
        const data = await (await fetch(url)).json();
        const hit  = (data.transactions||[]).find(tx =>
          (Date.now()/1000 - tx.utime) < 120 &&
          tx.in_msg?.source?.address === sender
        );
        if (hit) return hit.hash || 'confirmed';
      } catch { /* keep polling */ }
    }
    return 'pending';
  }

  // ══════════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════════

  function showProgress(btn, step, message) {
    const steps = [
      'Preparing', 'Building tx', 'Wallet confirm',
      'Blockchain confirm', 'Done',
    ];
    const dots = steps.map((s,i) => {
      const done   = i < step;
      const active = i === step;
      return `<span style="color:${done?'#00ff66':active?'#00f0ff':'#4a5568'};font-size:10px;margin:0 4px;">
        ${done?'✓':active?'⟳':'○'} ${s}</span>`;
    }).join('');
    btn.innerHTML = `<div style="text-align:center;">
      <div style="font-size:12px;color:#fff;margin-bottom:4px;">${message}</div>
      <div style="display:flex;justify-content:center;flex-wrap:wrap;">${dots}</div>
    </div>`;
    btn.style.pointerEvents = 'none';
  }

  function showSuccessScreen(quote, formData, txHash) {
    const panel = document.getElementById('tab-launchpad');
    if (!panel) return;
    const txBase = quote.network === 'mainnet'
      ? 'https://tonscan.org/tx/' : 'https://testnet.tonscan.org/tx/';

    panel.innerHTML = `
<div class="glass-card" style="max-width:640px;margin:40px auto;text-align:center;padding:40px 32px;">
  <div style="font-size:56px;margin-bottom:12px;">🚀</div>
  <h2 style="color:#fff;font-size:26px;font-weight:700;margin-bottom:6px;">Token Created Successfully!</h2>
  <div style="color:var(--accent-cyan);font-size:20px;font-weight:600;margin-bottom:28px;">$${formData.symbol}</div>

  <div class="glass-card" style="text-align:left;margin-bottom:20px;">
    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">Creation Cost Breakdown</div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="color:#94a3b8;">Blockchain execution base</span>
      <span style="font-family:var(--font-mono);color:#fff;">~${quote.blockchainCostTON} TON</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span style="color:#94a3b8;">Mandatory Donation (10%)</span>
      <span style="font-family:var(--font-mono);color:#fff;">~${quote.platformFeeTON} TON</span>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.1);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;">
      <strong style="color:#fff;">Estimated total</strong>
      <span style="font-family:var(--font-mono);color:var(--accent-cyan);font-weight:700;">~${quote.estimatedTotalTON} TON</span>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
    <div style="display:flex;align-items:center;gap:10px;background:rgba(0,255,100,0.07);border:1px solid rgba(0,255,100,0.2);padding:10px 14px;border-radius:10px;">
      <span style="color:#00ff66;font-size:16px;">✓</span>
      <span style="color:#94a3b8;font-size:12px;">Platform service — Processed via ANLGRAM Factory</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;background:rgba(0,255,100,0.07);border:1px solid rgba(0,255,100,0.2);padding:10px 14px;border-radius:10px;">
      <span style="color:#00ff66;font-size:16px;">✓</span>
      <span style="color:#94a3b8;font-size:12px;">Blockchain transaction — Submitted</span>
    </div>
  </div>

  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
    <a href="${txBase}${txHash}" target="_blank" class="btn-ent" style="text-decoration:none;padding:10px 18px;">View Transaction ↗</a>
    <button class="btn-solid" onclick="switchTab('liquidity')" style="padding:10px 18px;">Manage Token</button>
    <button class="btn-solid" onclick="location.reload()" style="padding:10px 18px;background:rgba(255,255,255,0.08);color:#fff;">Create Another</button>
  </div>
  <div style="margin-top:16px;font-size:10px;color:var(--text-muted);">
    Quote ID: ${quote.quoteId} · ${quote.network.toUpperCase()}
  </div>
</div>`;
  }

  // ══════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════
  // LOGO UPLOAD SYSTEM & OPTIMIZER (High Reliability for PC & Mobile)
  // ══════════════════════════════════════════════════════════

  async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async function optimizeImageForUpload(file) {
    return new Promise((resolve) => {
      // If SVG or small animated GIF, preserve original
      if (file.type === 'image/svg+xml' || (file.type === 'image/gif' && file.size < 512 * 1024)) {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ base64: e.target.result.split(',')[1], blob: file, dataUrl: e.target.result });
        reader.readAsDataURL(file);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        canvas.toBlob((blob) => {
          resolve({ base64, blob: blob || file, dataUrl });
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        const reader = new FileReader();
        reader.onload = (e) => resolve({ base64: e.target.result.split(',')[1], blob: file, dataUrl: e.target.result });
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  async function uploadToServer(base64Data) {
    const res = await fetchWithTimeout('/api/upload-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data })
    }, 3000);
    if (!res.ok) throw new Error('Server upload returned ' + res.status);
    const json = await res.json();
    if (json.url) return json.url;
    throw new Error('No URL in server response');
  }

  async function uploadToImgur(base64Data) {
    const clientIds = [
      '546c25a59c58ad7',
      'c06eb6f6b5b5ba3',
      'ebc35c1ec8b50e4'
    ];

    for (const clientId of clientIds) {
      try {
        const fd = new FormData();
        fd.append('image', base64Data);
        fd.append('type', 'base64');

        const res = await fetchWithTimeout('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: { 'Authorization': `Client-ID ${clientId}` },
          body: fd
        }, 2500);

        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.link) {
            return json.data.link.replace('http://', 'https://');
          }
        }
      } catch (err) {
        // Continue to fallback
      }
    }
    throw new Error('All Imgur attempts failed');
  }

  function initLogoUpload() {
    const fileInput = document.getElementById('lp-logo-file');
    const previewImg = document.getElementById('logo-preview-img');
    const previewPlaceholder = document.getElementById('logo-preview-placeholder');
    const statusText = document.getElementById('logo-upload-status');
    const urlInput = document.getElementById('lp-logo');
    const uploadBtn = document.getElementById('lp-upload-btn');

    if (!fileInput || fileInput.dataset.initialized) return;
    fileInput.dataset.initialized = 'true';

    if (uploadBtn) {
      uploadBtn.addEventListener('click', (e) => {
        if (e.target !== fileInput) {
          fileInput.click();
        }
      });
    }

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // 1. Validate file size (max 15MB)
      if (file.size > 15 * 1024 * 1024) {
        alert('File is too large. Maximum size is 15MB.');
        fileInput.value = '';
        return;
      }

      // 2. Process & Show local preview instantly
      if (statusText) {
        statusText.innerHTML = '<span class="status-dot"></span> Processing logo...';
        statusText.style.color = 'var(--accent-cyan)';
      }
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = '⏳ Processing...';
      }

      let optimized;
      try {
        optimized = await optimizeImageForUpload(file);
        if (previewImg && optimized.dataUrl) {
          previewImg.src = optimized.dataUrl;
          previewImg.style.display = 'block';
        }
        if (previewPlaceholder) previewPlaceholder.style.display = 'none';

        // Update Card 1 avatar in ANL Labs immediately
        const card1Preview = document.querySelector('.labs-avatar-preview');
        if (card1Preview && optimized.dataUrl) {
          card1Preview.innerHTML = `<img src="${optimized.dataUrl}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
        }
      } catch (optErr) {
        console.warn('Image optimization fallback:', optErr);
      }

      const base64Data = optimized ? optimized.base64 : '';

      // 3. Multi-tier upload strategy with zero-failure guarantee
      let uploadedUrl = null;

      // Tier 1: Local / Node.js Server upload endpoint (if running with backend)
      if (base64Data) {
        try {
          uploadedUrl = await uploadToServer(base64Data);
          console.log('[LogoUpload] Uploaded via ANLGRAM Server API:', uploadedUrl);
        } catch (sErr) {
          // Normal on static GitHub Pages
        }
      }

      // Tier 2: Imgur CDN
      if (!uploadedUrl && base64Data) {
        try {
          uploadedUrl = await uploadToImgur(base64Data);
          console.log('[LogoUpload] Uploaded via Imgur CDN:', uploadedUrl);
        } catch (e1) {
          // Imgur unavailable or CORS blocked
        }
      }

      // Tier 3: Guaranteed client-side optimized attachment (works 100% on any PC / Mobile / GitHub Pages)
      const finalUrl = uploadedUrl || (optimized ? optimized.dataUrl : '');
      if (finalUrl) {
        if (urlInput) urlInput.value = finalUrl;
        if (statusText) {
          statusText.innerHTML = uploadedUrl 
            ? '✅ Public CDN Logo active (Ready for DEXs & Wallets)' 
            : '✅ Logo optimized & attached locally';
          statusText.style.color = 'var(--green)';
        }
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = '📂 Change Image';
        }
        // Ensure manual url container has value reflected
        const urlContainer = document.getElementById('logo-url-container');
        if (urlContainer && !uploadedUrl) {
          urlContainer.style.display = 'block';
        }

        // Deep synchronization with ANL Labs Wizard State
        if (window.wizardState && window.wizardState.tokenDraft) {
          window.wizardState.tokenDraft.logoUrl = finalUrl;
          window.wizardState.tokenDraft.logoDataUrl = finalUrl;
        }
        if (typeof window.labsSetWizardDraftField === 'function') {
          window.labsSetWizardDraftField('logoUrl', finalUrl);
        }
        try {
          localStorage.setItem('anlgram_last_uploaded_logo', finalUrl);
        } catch (e) {}
      } else {
        if (statusText) {
          statusText.innerHTML = '⚠️ Please select a valid PNG, JPG, or SVG image.';
          statusText.style.color = '#ff9900';
        }
        if (uploadBtn) {
          uploadBtn.disabled = false;
          uploadBtn.textContent = '📂 Select Image';
        }
      }

      // Universal synchronization of ALL avatar elements in ANL Labs
      if (finalUrl) {
        document.querySelectorAll('.labs-avatar-preview, #labs-avatar-preview-box, #labs-review-avatar, #labs-tm-token-avatar, .wizard-dex-preview-avatar, #logo-preview-container').forEach((el) => {
          el.innerHTML = `<img src="${finalUrl}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
        });
      }
    });
  }

  // Global helper for one-click Public CDN logo presets
  window.setLogoPreset = function(url) {
    const urlInput = document.getElementById('lp-logo');
    const previewImg = document.getElementById('logo-preview-img');
    const previewPlaceholder = document.getElementById('logo-preview-placeholder');
    const statusText = document.getElementById('logo-upload-status');
    const uploadBtn = document.getElementById('lp-upload-btn');

    if (urlInput) urlInput.value = url;
    if (previewImg) {
      previewImg.src = url;
      previewImg.style.display = 'block';
    }
    if (previewPlaceholder) previewPlaceholder.style.display = 'none';
    if (statusText) {
      statusText.innerHTML = '✅ Public CDN Logo active (Ready for DEXs & Wallets)';
      statusText.style.color = 'var(--green)';
    }
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '📂 Change Image';
    }

    // Sync with wizard state
    if (window.wizardState && window.wizardState.tokenDraft) {
      window.wizardState.tokenDraft.logoUrl = url;
      window.wizardState.tokenDraft.logoDataUrl = url;
    }
    if (typeof window.labsSetWizardDraftField === 'function') {
      window.labsSetWizardDraftField('logoUrl', url);
    }
    try {
      localStorage.setItem('anlgram_last_uploaded_logo', url);
    } catch (e) {}

    // Update all avatar boxes
    document.querySelectorAll('.labs-avatar-preview, #labs-avatar-preview-box, #labs-review-avatar, #labs-tm-token-avatar, .wizard-dex-preview-avatar, #logo-preview-container').forEach((el) => {
      el.innerHTML = `<img src="${url}" onerror="this.onerror=null; this.src='https://anlgram.com/assets/images/icon-192.png';" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Logo"/>`;
    });
  };

  // ══════════════════════════════════════════════════════════
  // FEE BREAKDOWN UI
  // ══════════════════════════════════════════════════════════

  function injectFeeBreakdown() {
    if (document.getElementById('anlgram-fee-breakdown')) return;
    // Find the deploy button in the Launchpad tab
    const btn = document.querySelector('#tab-launchpad .deploy-btn, #tab-launchpad [onclick*="deploy"]');
    if (!btn) return;
    const fees = calculateFees();
    const card = document.createElement('div');
    card.id = 'anlgram-fee-breakdown';
    card.innerHTML = `
<div style="background:rgba(0,240,255,0.04);border:1px solid rgba(0,240,255,0.15);border-radius:12px;padding:16px 20px;margin-bottom:16px;">
  <div style="color:var(--accent-cyan);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Token Creation Cost &amp; Donation Breakdown</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;">
    <span style="color:#94a3b8;">Blockchain execution base</span>
    <span style="font-family:var(--font-mono);">~${fees.blockchainCostTON} TON</span>
  </div>
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;align-items:center;">
    <span style="color:#94a3b8;display:flex;align-items:center;gap:5px;">
      Mandatory Donation (10%)
      <span title="Mandatory 0.02 TON donation on the 0.20 TON creation execution base."
        style="width:15px;height:15px;border-radius:50%;background:rgba(0,240,255,0.15);border:1px solid rgba(0,240,255,0.3);display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--accent-cyan);cursor:help;">ℹ</span>
    </span>
    <span style="font-family:var(--font-mono);color:#4ade80;">+${fees.platformFeeTON} TON</span>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:10px;padding-top:10px;display:flex;justify-content:space-between;">
    <strong style="font-size:13px;">Estimated total</strong>
    <span style="font-family:var(--font-mono);color:var(--accent-cyan);font-weight:700;font-size:15px;">~${fees.estimatedTotalTON} TON</span>
  </div>
</div>`;
    btn.parentNode.insertBefore(card, btn);
    // Point button to factory flow
    btn.setAttribute('onclick', 'deployViaFactory(event)');
    btn.textContent = 'CREATE TOKEN';
  }

  // ══════════════════════════════════════════════════════════
  // HOOK INTO switchTab
  // ══════════════════════════════════════════════════════════

  const _orig = window.switchTab;
  window.switchTab = function (tabId) {
    if (typeof _orig === 'function') _orig(tabId);
    if (tabId === 'launchpad') {
      setTimeout(() => {
        injectFeeBreakdown();
        initLogoUpload();
      }, 60);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      injectFeeBreakdown();
      initLogoUpload();
    }, 500);
  });

  // ══════════════════════════════════════════════════════════
  // UTILITY
  // ══════════════════════════════════════════════════════════

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Public API
  window.ANLGRAM_LAUNCHPAD = {
    calculateFees, generateFeeQuote, buildFactoryTransaction, nanoToTON,
    CONFIG: ANLGRAM_CONFIG,
  };

  console.log('[ANLGRAM Launchpad] Factory module loaded.', {
    network:  ANLGRAM_CONFIG.NETWORK,
    treasury: ANLGRAM_CONFIG.TREASURY,
    factory:  ANLGRAM_CONFIG.NETWORK === 'mainnet'
      ? (ANLGRAM_CONFIG.FACTORY_MAINNET || 'NOT DEPLOYED')
      : (ANLGRAM_CONFIG.FACTORY_TESTNET || 'NOT DEPLOYED'),
  });

})();
