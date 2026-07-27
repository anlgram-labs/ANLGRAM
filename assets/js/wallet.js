// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Real Wallet Manager (v7.1 - Sleek & Non-conflicting)
// ═══════════════════════════════════════════════════════════════

(function() {
  // One-time clean wipe of any legacy/mock wallet addresses stuck in browser storage
  try {
    if (!localStorage.getItem('anlgram_clean_v7')) {
      localStorage.removeItem('anlgram_wallet_addr');
      localStorage.removeItem('anlgram_wallet_name');
      localStorage.removeItem('anlgram_pending_wallet_name');
      localStorage.setItem('anlgram_clean_v7', 'true');
    }
  } catch(e) {}

  function initWalletManager() {
    // Inject self-contained CSS for Wallet Modal & Toast
    if (!document.getElementById('anlgram-wallet-styles')) {
      const style = document.createElement('style');
      style.id = 'anlgram-wallet-styles';
      style.textContent = `
        .modal-overlay {
          position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          width: 100vw !important; height: 100vh !important;
          background: rgba(0, 0, 0, 0.88) !important; backdrop-filter: blur(10px) !important;
          display: none !important; align-items: center !important; justify-content: center !important;
          z-index: 999999 !important;
        }
        .modal-overlay[style*="display: flex"] {
          display: flex !important;
        }
        .modal {
          background: #0f0f16 !important; border: 1px solid rgba(0, 240, 255, 0.4) !important;
          border-radius: 20px !important; width: 92% !important; max-width: 440px !important;
          padding: 28px !important; position: relative !important;
          box-shadow: 0 25px 60px rgba(0,0,0,0.95), 0 0 40px rgba(0, 240, 255, 0.15) !important;
          color: #fff !important; font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          text-align: left !important;
        }
        .panel-close {
          position: absolute; top: 20px; right: 20px; background: none; border: none;
          color: #888; cursor: pointer; z-index: 10; padding: 6px; transition: color 0.2s;
        }
        .panel-close:hover { color: #fff; }
        .wallet-list { display: flex; flex-direction: column; gap: 12px; }
        .wallet-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
          cursor: pointer; transition: all 0.2s ease; text-decoration: none !important;
        }
        .wallet-item:hover {
          border-color: #00f0ff; transform: translateX(4px);
          background: rgba(0, 240, 255, 0.08);
        }
        .wallet-info { display: flex; align-items: center; gap: 16px; }
        .wallet-icon {
          width: 44px; height: 44px; border-radius: 12px; display: flex;
          align-items: center; justify-content: center; font-size: 22px;
          color: white; font-weight: bold; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .wallet-name { font-size: 15px; font-weight: 600; color: #fff; text-align: left; }
        .wallet-type { font-size: 12px; color: #888; margin-top: 2px; text-align: left; }
        .wallet-badge {
          font-size: 11px; padding: 4px 10px; border-radius: 99px; font-weight: 600;
          background: rgba(255,255,255,0.1); color: #ccc;
        }
        .wallet-toast-popup {
          position: fixed !important; bottom: 20px !important; right: 20px !important;
          background: #0c0c12 !important; border: 1px solid rgba(0, 240, 255, 0.3) !important;
          border-left: 3px solid #00f0ff !important; border-radius: 10px !important;
          padding: 10px 14px !important; z-index: 9999999 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.8) !important;
          transform: translateY(80px); opacity: 0; pointer-events: none !important;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          max-width: 260px; width: auto; color: #fff !important; font-family: 'Inter', system-ui, sans-serif !important;
        }
        .wallet-toast-popup.show { transform: translateY(0); opacity: 1; pointer-events: auto !important; }
        .wallet-toast-title { font-weight: 600; color: white; font-size: 13px; margin-bottom: 2px; display:flex; align-items:center; gap:6px; }
        .wallet-toast-desc { font-size: 11px; color: #aaa; line-height: 1.3; font-family: monospace; }
        .real-wallet-input {
          width: 100% !important; padding: 14px !important; background: #07070a !important;
          border: 1px solid rgba(0, 240, 255, 0.4) !important; border-radius: 12px !important;
          color: #00f0ff !important; font-family: monospace !important; font-size: 14px !important;
          margin: 16px 0 !important; box-sizing: border-box !important;
        }
        .real-wallet-input:focus { outline: none !important; border-color: #00f0ff !important; box-shadow: 0 0 15px rgba(0,240,255,0.2) !important; }
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('walletModal')) {
      const modalDiv = document.createElement('div');
      modalDiv.id = 'walletModal';
      modalDiv.className = 'modal-overlay';
      modalDiv.style.cssText = 'display: none !important; position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.88) !important; backdrop-filter: blur(10px) !important; z-index: 999999 !important; align-items: center; justify-content: center;';
      modalDiv.innerHTML = `
        <div class="modal animate-scale-in" style="max-width:440px;position:relative;">
          <button class="panel-close" onclick="closeWalletModal()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div id="walletStepList">
            <h2 style="font-size:20px;margin-bottom:6px;color:white;display:flex;align-items:center;gap:8px;">
              <span>⚡ Connect TON Wallet</span>
            </h2>
            <p style="color:#aaa;margin-bottom:20px;font-size:13px;line-height:1.5;">Select your wallet to monitor your real transactions on ANLGRAM.</p>
            
            <div class="wallet-list">
              <div class="wallet-item" onclick="selectWallet('Tonkeeper', '#0098EA', '💎', 'https://app.tonkeeper.com/')">
                <div class="wallet-info">
                  <div class="wallet-icon" style="background:#0098EA;">💎</div>
                  <div>
                    <div class="wallet-name">Tonkeeper</div>
                    <div class="wallet-type">Popular mobile & desktop wallet</div>
                  </div>
                </div>
                <span class="wallet-badge">POPULAR</span>
              </div>

              <div class="wallet-item" onclick="selectWallet('Telegram Wallet', '#229ED9', '✈️', 'https://t.me/wallet')">
                <div class="wallet-info">
                  <div class="wallet-icon" style="background:#229ED9;">✈️</div>
                  <div>
                    <div class="wallet-name">Telegram Wallet</div>
                    <div class="wallet-type">Official in-app wallet (@wallet)</div>
                  </div>
                </div>
                <span class="wallet-badge">IN-APP</span>
              </div>

              <div class="wallet-item" onclick="selectWallet('MyTonWallet', '#6C5CE7', '⚡', 'https://app.mytonwallet.io/')">
                <div class="wallet-info">
                  <div class="wallet-icon" style="background:#6C5CE7;">⚡</div>
                  <div>
                    <div class="wallet-name">MyTonWallet</div>
                    <div class="wallet-type">Fast browser extension</div>
                  </div>
                </div>
                <span class="wallet-badge">WEB3</span>
              </div>

              <div class="wallet-item" onclick="selectWallet('Tonhub', '#00B894', '🛡️', 'https://tonhub.com/')">
                <div class="wallet-info">
                  <div class="wallet-icon" style="background:#00B894;">🛡️</div>
                  <div>
                    <div class="wallet-name">Tonhub</div>
                    <div class="wallet-type">Mobile smart wallet</div>
                  </div>
                </div>
                <span class="wallet-badge">MOBILE</span>
              </div>
            </div>
            
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
              <span style="font-size:12px;color:#777;">Connect your true wallet to monitor TON networks & receive alerts.</span>
            </div>
          </div>

          <!-- Connecting & Real Address Input Step -->
          <div id="walletStepConnecting" style="display:none;text-align:center;padding:8px 0;">
            <div style="width:64px;height:64px;border-radius:18px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 0 30px rgba(0,240,255,0.2);border:2px solid #00f0ff;position:relative;" id="connIconBox">
              <span id="connIcon">💎</span>
            </div>
            <h3 style="font-size:18px;color:white;margin-bottom:6px;" id="connTitle">Connect Tonkeeper</h3>
            <p style="font-size:13px;color:#aaa;margin-bottom:16px;">Step 1: Open your wallet app/portal to view or copy your address.</p>
            
            <div style="margin-bottom:20px;">
              <a id="connOpenAppBtn" href="#" target="_blank" class="btn btn-primary btn-sm" style="display:inline-block;text-decoration:none;background:rgba(0,240,255,0.15);color:#00f0ff;border:1px solid #00f0ff;padding:12px 20px;border-radius:10px;font-weight:700;font-size:13px;box-shadow:0 0 15px rgba(0,240,255,0.2);">🚀 Open Official Web App / Wallet ↗</a>
            </div>

            <div style="border-top:1px dashed rgba(255,255,255,0.15);padding-top:16px;text-align:left;">
              <label style="font-size:13px;font-weight:600;color:#fff;display:block;margin-bottom:4px;">Step 2: Enter YOUR REAL TON Wallet Address:</label>
              <span style="font-size:12px;color:#888;display:block;">Paste your true address below so ANLGRAM monitors ONLY your wallet.</span>
              <input type="text" id="realWalletAddressInput" class="real-wallet-input" placeholder="Paste your address here (EQ... or UQ... or .ton)" />
              
              <button onclick="confirmRealWalletConnection()" style="width:100%;background:#00f0ff;color:#000;font-weight:700;padding:14px;border-radius:12px;border:none;cursor:pointer;font-size:14px;margin-bottom:8px;box-shadow:0 0 20px rgba(0,240,255,0.3);transition:all 0.2s;">⚡ Connect & Monitor My Wallet</button>
              <button onclick="cancelConnectStep()" style="width:100%;background:transparent;color:#888;padding:10px;border-radius:10px;border:none;cursor:pointer;font-size:13px;">← Back to wallet list</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }

    if (!document.getElementById('walletToastPopup')) {
      const toastDiv = document.createElement('div');
      toastDiv.id = 'walletToastPopup';
      toastDiv.className = 'wallet-toast-popup';
      toastDiv.innerHTML = `
        <div class="wallet-toast-title" id="walletToastTitle"></div>
        <div class="wallet-toast-desc" id="walletToastDesc"></div>
      `;
      document.body.appendChild(toastDiv);
    }

    // Auto-inject Connect Wallet button into topbar if missing
    const topbarActions = document.querySelector('.topbar-actions');
    if (topbarActions && !document.getElementById('topbarWalletBtn')) {
      const btn = document.createElement('button');
      btn.id = 'topbarWalletBtn';
      btn.className = 'btn btn-primary btn-sm';
      btn.style.marginLeft = '12px';
      btn.textContent = 'Connect Wallet';
      btn.onclick = window.openWalletModal;
      topbarActions.appendChild(btn);
    }

    // Auto-inject Universal Mobile Bottom Navigation Bar
    if (!document.getElementById('mobileBottomNav')) {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const nav = document.createElement('nav');
      nav.id = 'mobileBottomNav';
      nav.className = 'mobile-bottom-nav';
      nav.style.cssText = 'display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 68px; background: rgba(13, 13, 18, 0.96); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid rgba(0, 240, 255, 0.25); box-shadow: 0 -10px 30px rgba(0,0,0,0.8); z-index: 999999; flex-direction: row; justify-content: space-around; align-items: center; padding: 0 4px; margin: 0;';
      
      const items = [
        { name: 'Inicio', href: 'index.html', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        { name: 'Dash', href: 'dashboard.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { name: 'Explorar', href: 'explorer.html', icon: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>' },
        { name: 'Flows', href: 'visualizer.html', icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49"/>' },
        { name: 'Intel', href: 'intel-exchange.html', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>' },
        { name: 'Alertas', href: 'alerts.html', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' }
      ];

      nav.innerHTML = items.map(item => {
        const isActive = currentPage === item.href || (currentPage === '' && item.href === 'index.html');
        return `
          <a href="${item.href}" class="mobile-nav-item ${isActive ? 'active' : ''}" style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 3px !important; color: ${isActive ? '#00f0ff' : '#64748b'} !important; text-decoration: none !important; font-size: 10px !important; font-weight: 600 !important; padding: 6px 8px !important; flex: 1 !important; text-align: center !important; margin: 0 !important; background: ${isActive ? 'rgba(0,240,255,0.1)' : 'transparent'} !important; border-radius: 12px !important;">
            <svg width="20" height="20" style="width: 20px !important; height: 20px !important; min-width: 20px !important; max-width: 20px !important; flex-shrink: 0 !important; margin: 0 auto !important; display: block !important;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
            <span style="font-size: 10px !important; line-height: 1 !important; display: block !important; margin: 0 !important;">${item.name}</span>
          </a>
        `;
      }).join('');

      document.body.appendChild(nav);
    }

    // ── Device Recognition & Layout Adapter System ───────────────
    function initDeviceRecognition() {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth <= 768;
      const isPhone = isSmallScreen || (isMobileDevice && window.innerWidth <= 1024);
      const nav = document.getElementById('mobileBottomNav');
      
      if (isPhone) {
        document.documentElement.classList.add('device-phone');
        document.documentElement.classList.remove('device-pc');
        if (document.body) {
          document.body.classList.add('device-phone');
          document.body.classList.remove('device-pc');
        }
        if (nav && window.innerWidth <= 768) {
          nav.style.display = 'flex';
          nav.style.flexDirection = 'row';
        } else if (nav) {
          nav.style.display = 'none';
        }
      } else {
        document.documentElement.classList.add('device-pc');
        document.documentElement.classList.remove('device-phone');
        if (document.body) {
          document.body.classList.add('device-pc');
          document.body.classList.remove('device-phone');
        }
        if (nav) nav.style.display = 'none';
      }

      let devicePill = document.getElementById('anlgramDevicePill');
      if (!devicePill) {
        const targetContainer = document.querySelector('.topbar-actions') || document.querySelector('.nav-cta');
        if (targetContainer) {
          devicePill = document.createElement('div');
          devicePill.id = 'anlgramDevicePill';
          devicePill.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:99px; font-size:11px; font-weight:600; font-family:var(--font-mono, monospace); margin-right:8px; border:1px solid rgba(0, 240, 255, 0.25); background:rgba(0, 240, 255, 0.08); color:#00f0ff; transition:all 0.3s ease; white-space:nowrap; cursor:default;';
          targetContainer.insertBefore(devicePill, targetContainer.firstChild);
        }
      }

      if (devicePill) {
        if (isPhone) {
          devicePill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#00e676;display:inline-block;box-shadow:0 0 8px #00e676;"></span> 📱 Modo Móvil';
          devicePill.title = 'Plataforma adaptada para experiencia táctil en Móvil / Tablet';
        } else {
          devicePill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#00f0ff;display:inline-block;box-shadow:0 0 8px #00f0ff;"></span> 💻 Modo PC';
          devicePill.title = 'Plataforma optimizada para experiencia de Escritorio (PC)';
        }
      }
    }

    initDeviceRecognition();
    window.addEventListener('resize', initDeviceRecognition);

    updateWalletUI();
  }

  // Ensure initialization happens regardless of when script is executed
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initWalletManager);
  } else {
    initWalletManager();
  }

  // Bulletproof Event Delegation: catch any clicks on Connect Wallet buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#topbarWalletBtn') || e.target.closest('.connect-wallet-btn');
    if (btn) {
      const connectedWallet = localStorage.getItem('anlgram_wallet_addr');
      if (!connectedWallet) {
        e.preventDefault();
        window.openWalletModal();
      }
    }
  });

  let connectTimer = null;

  window.showWalletToast = function(title, desc, dur = 2500) {
    initWalletManager();
    const t = document.getElementById('walletToastPopup');
    const tTitle = document.getElementById('walletToastTitle');
    const tDesc = document.getElementById('walletToastDesc');
    if (t && tTitle && tDesc) {
      tTitle.textContent = title;
      tDesc.textContent = desc;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), dur);
    }
  };

  window.updateWalletUI = function() {
    const connectedWallet = localStorage.getItem('anlgram_wallet_addr');
    const connectedWalletName = localStorage.getItem('anlgram_wallet_name');
    window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: connectedWallet || null, name: connectedWalletName || null } }));
    const btns = document.querySelectorAll('#topbarWalletBtn');

    btns.forEach(btn => {
      if (connectedWallet) {
        const shortAddr = connectedWallet.length > 12 ? (connectedWallet.slice(0, 6) + '...' + connectedWallet.slice(-4)) : connectedWallet;
        btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00e676;margin-right:6px;box-shadow:0 0 8px #00e676;"></span>${shortAddr}`;
        btn.className = 'btn btn-secondary btn-sm';
        btn.style.background = 'rgba(0, 230, 118, 0.1)';
        btn.style.color = '#00e676';
        btn.style.border = '1px solid rgba(0, 230, 118, 0.3)';
        btn.title = `Connected to ${connectedWalletName || 'Wallet'}: ${connectedWallet}. Click to disconnect.`;
        btn.onclick = (e) => {
          e.preventDefault();
          if (confirm(`Disconnect wallet (${connectedWalletName || 'Wallet'}:\n${connectedWallet})?`)) {
            localStorage.removeItem('anlgram_wallet_addr');
            localStorage.removeItem('anlgram_wallet_name');
            updateWalletUI();
            showWalletToast('🔓 Wallet Disconnected', 'Your wallet has been disconnected.');
          }
        };
      } else {
        btn.textContent = 'Connect Wallet';
        btn.className = 'btn btn-primary btn-sm';
        btn.style.background = '#00f0ff';
        btn.style.color = '#000';
        btn.style.border = 'none';
        btn.style.fontWeight = '600';
        btn.title = 'Click to connect your TON wallet';
        btn.onclick = (e) => {
          e.preventDefault();
          window.openWalletModal();
        };
      }
    });
  };

  window.openWalletModal = function() {
    initWalletManager();
    const list = document.getElementById('walletStepList');
    const conn = document.getElementById('walletStepConnecting');
    const modal = document.getElementById('walletModal');
    if (list) list.style.display = 'block';
    if (conn) conn.style.display = 'none';
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
    }
  };

  window.closeWalletModal = function() {
    if (connectTimer) clearTimeout(connectTimer);
    const modal = document.getElementById('walletModal');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
    }
  };

  window.cancelConnectStep = function() {
    if (connectTimer) clearTimeout(connectTimer);
    const list = document.getElementById('walletStepList');
    const conn = document.getElementById('walletStepConnecting');
    if (list) list.style.display = 'block';
    if (conn) conn.style.display = 'none';
  };

  window.selectWallet = function(name, color, icon, url) {
    initWalletManager();
    const list = document.getElementById('walletStepList');
    const conn = document.getElementById('walletStepConnecting');
    if (list) list.style.display = 'none';
    if (conn) conn.style.display = 'block';
    
    const iconBox = document.getElementById('connIconBox');
    const iconEl = document.getElementById('connIcon');
    const titleEl = document.getElementById('connTitle');
    const btnEl = document.getElementById('connOpenAppBtn');

    if (iconBox) { iconBox.style.background = color + '22'; iconBox.style.borderColor = color; }
    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = `Connect ${name}`;
    if (btnEl) {
      btnEl.href = url;
      btnEl.innerHTML = `🚀 Open ${name} App / Web ↗`;
    }
    
    localStorage.setItem('anlgram_pending_wallet_name', name);
    
    const input = document.getElementById('realWalletAddressInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
    }
  };

  window.confirmRealWalletConnection = function() {
    const input = document.getElementById('realWalletAddressInput');
    const addr = input ? input.value.trim() : '';
    if (!addr || addr.length < 6) {
      showWalletToast('⚠️ Invalid Address', 'Please enter your true TON wallet address (e.g. EQ... or UQ...).');
      return;
    }
    const name = localStorage.getItem('anlgram_pending_wallet_name') || 'TON Wallet';
    localStorage.setItem('anlgram_wallet_addr', addr);
    localStorage.setItem('anlgram_wallet_name', name);
    localStorage.removeItem('anlgram_pending_wallet_name');
    
    updateWalletUI();
    closeWalletModal();
    showWalletToast('✅ Real Wallet Connected!', `Successfully connected ${name} (${addr.slice(0,6)}...${addr.slice(-4)}).`);
  };
})();
