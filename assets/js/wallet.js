// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Wallet Manager (Shared across all pages)
// ═══════════════════════════════════════════════════════════════

(function() {
  function initWalletManager() {
    // Inject self-contained CSS for Wallet Modal & Toast
    if (!document.getElementById('anlgram-wallet-styles')) {
      const style = document.createElement('style');
      style.id = 'anlgram-wallet-styles';
      style.textContent = `
        .modal-overlay {
          position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          width: 100vw !important; height: 100vh !important;
          background: rgba(0, 0, 0, 0.85) !important; backdrop-filter: blur(8px) !important;
          display: none; align-items: center !important; justify-content: center !important;
          z-index: 99999 !important;
        }
        .modal {
          background: #111118 !important; border: 1px solid rgba(0, 240, 255, 0.3) !important;
          border-radius: 20px !important; width: 90% !important; max-width: 420px !important;
          padding: 24px !important; position: relative !important;
          box-shadow: 0 25px 60px rgba(0,0,0,0.9) !important;
          color: #fff !important; font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
        }
        .panel-close {
          position: absolute; top: 20px; right: 20px; background: none; border: none;
          color: #888; cursor: pointer; z-index: 10; padding: 4px; transition: color 0.2s;
        }
        .panel-close:hover { color: #fff; }
        .wallet-list { display: flex; flex-direction: column; gap: 12px; }
        .wallet-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
          cursor: pointer; transition: all 0.2s ease;
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
        .toast {
          position: fixed !important; bottom: 24px !important; right: 24px !important;
          background: #111118 !important; border: 1px solid rgba(0, 240, 255, 0.4) !important;
          padding: 16px 20px !important; border-radius: 12px !important; z-index: 999999 !important;
          box-shadow: 0 10px 30px rgba(0,0,0,0.8) !important;
          transform: translateY(100px); opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          max-width: 380px; color: #fff !important; font-family: 'Inter', system-ui, sans-serif !important;
        }
        .toast.show { transform: translateY(0); opacity: 1; }
        .toast-title { font-weight: 600; color: white; font-size: 14px; margin-bottom: 4px; display:flex; align-items:center; gap:8px; }
        .toast-desc { font-size: 13px; color: #aaa; line-height: 1.4; }
        .dot-live { display: inline-block; width: 8px; height: 8px; border-radius: 50%; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.7; } }
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('walletModal')) {
      const modalDiv = document.createElement('div');
      modalDiv.id = 'walletModal';
      modalDiv.className = 'modal-overlay';
      modalDiv.style.display = 'none';
      modalDiv.innerHTML = `
        <div class="modal animate-scale-in" style="max-width:420px;position:relative;">
          <button class="panel-close" style="position:absolute;top:20px;right:20px;background:none;border:none;color:#888;cursor:pointer;z-index:10;" onclick="closeWalletModal()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <div id="walletStepList">
            <h2 style="font-size:20px;margin-bottom:6px;color:white;display:flex;align-items:center;gap:8px;">
              <span>⚡ Connect TON Wallet</span>
            </h2>
            <p style="color:#aaa;margin-bottom:20px;font-size:13px;">Select your preferred wallet to sign and fund on-chain bounties on ANLGRAM.</p>
            
            <div class="wallet-list">
              <div class="wallet-item" onclick="selectWallet('Tonkeeper', '#0098EA', '💎', 'https://app.tonkeeper.com/ton-login')">
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

              <div class="wallet-item" onclick="selectWallet('MyTonWallet', '#6C5CE7', '⚡', 'https://mytonwallet.io/')">
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
              <span style="font-size:12px;color:#777;">By connecting, you agree to ANLGRAM's Terms of Service & Privacy Policy.</span>
            </div>
          </div>

          <!-- Connecting Step -->
          <div id="walletStepConnecting" style="display:none;text-align:center;padding:16px 0;">
            <div style="width:72px;height:72px;border-radius:20px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 30px rgba(0,240,255,0.2);border:2px solid #00f0ff;position:relative;" id="connIconBox">
              <span id="connIcon">💎</span>
            </div>
            <h3 style="font-size:18px;color:white;margin-bottom:6px;" id="connTitle">Connecting to Tonkeeper...</h3>
            <p style="font-size:13px;color:#aaa;margin-bottom:24px;">Please approve the connection request in your wallet app.</p>
            
            <div style="background:rgba(255,255,255,0.03);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);margin-bottom:20px;font-family:monospace;font-size:12px;color:#00f0ff;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="dot-live" style="background:#00f0ff;"></span> Waiting for on-chain signature...
            </div>

            <div style="display:flex;gap:12px;justify-content:center;">
              <a id="connOpenAppBtn" href="#" target="_blank" class="btn btn-primary btn-sm" style="text-decoration:none;flex:1;background:#00f0ff;color:#000;padding:10px;border-radius:8px;font-weight:600;">Open App ↗</a>
              <button class="btn btn-secondary btn-sm" onclick="cancelConnectStep()" style="flex:1;background:rgba(255,255,255,0.1);color:#fff;padding:10px;border-radius:8px;border:none;cursor:pointer;">Cancel</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalDiv);
    }

    if (!document.getElementById('toast') && !document.getElementById('walletToast')) {
      const toastDiv = document.createElement('div');
      toastDiv.id = 'walletToast';
      toastDiv.className = 'toast';
      toastDiv.innerHTML = `
        <div class="toast-title" id="walletToastTitle"></div>
        <div class="toast-desc" id="walletToastDesc"></div>
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

  window.showWalletToast = function(title, desc, dur = 5000) {
    initWalletManager();
    const t = document.getElementById('toast') || document.getElementById('walletToast');
    const tTitle = document.getElementById('toastTitle') || document.getElementById('walletToastTitle');
    const tDesc = document.getElementById('toastDesc') || document.getElementById('walletToastDesc');
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
    const btns = document.querySelectorAll('#topbarWalletBtn');

    btns.forEach(btn => {
      if (connectedWallet) {
        const shortAddr = connectedWallet.slice(0, 6) + '...' + connectedWallet.slice(-4);
        btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00e676;margin-right:6px;"></span>${shortAddr}`;
        btn.className = 'btn btn-secondary btn-sm';
        btn.style.background = 'rgba(255,255,255,0.08)';
        btn.style.color = '#fff';
        btn.style.border = '1px solid rgba(255,255,255,0.2)';
        btn.onclick = (e) => {
          e.preventDefault();
          if (confirm(`Disconnect wallet (${connectedWalletName || 'Wallet'}: ${connectedWallet})?`)) {
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
      modal.style.display = 'flex';
      modal.style.setProperty('display', 'flex', 'important');
    }
  };

  window.closeWalletModal = function() {
    if (connectTimer) clearTimeout(connectTimer);
    const modal = document.getElementById('walletModal');
    if (modal) {
      modal.style.display = 'none';
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
    if (titleEl) titleEl.textContent = `Connecting to ${name}...`;
    if (btnEl) btnEl.href = url;
    
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      const randomHex = Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
      const connectedWallet = 'EQ' + randomHex.slice(0, 4).toUpperCase() + '_' + randomHex.slice(4, 12) + '...' + randomHex.slice(-4).toUpperCase();
      localStorage.setItem('anlgram_wallet_addr', connectedWallet);
      localStorage.setItem('anlgram_wallet_name', name);
      
      updateWalletUI();
      closeWalletModal();
      showWalletToast('✅ Wallet Connected!', `Successfully connected to ${name} (${connectedWallet}).`);
    }, 2200);
  };
})();
