// ═══════════════════════════════════════════════════════════════
// ANLGRAM Universal TON Web3 Wallet & TON Connect Manager
// ═══════════════════════════════════════════════════════════════

(function() {
  let tonConnectUI = null;
  let currentAddress = localStorage.getItem('anlgram_wallet_addr') || '';

  function formatAddress(address) {
    if (!address) return '';
    return address.slice(0, 4) + '...' + address.slice(-4);
  }

  async function fetchTonBalance(address) {
    try {
      const response = await fetch(`https://tonapi.io/v2/accounts/${address}`);
      if (!response.ok) throw new Error('Network response error');
      const data = await response.json();
      return (data.balance || 0) / 1000000000;
    } catch (e) {
      console.warn('Could not fetch TON balance directly:', e);
      return 0;
    }
  }

  function getWalletButtons() {
    const list = new Set();
    document.querySelectorAll('#topbarWalletBtn, .connect-wallet-btn, button[title*="Wallet"], button[title*="wallet"]').forEach(btn => list.add(btn));
    
    document.querySelectorAll('button, a.btn, a.btn-premium, a.btn-glass').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('connect wallet') || text.includes('connect web3 wallet') || text.includes('connect ton wallet')) {
        list.add(btn);
      }
    });
    return Array.from(list);
  }

  // ── Inject Custom Fallback QR Modal ─────────────────────────
  function injectWalletModal() {
    if (document.getElementById('anlgram-wallet-modal-overlay')) return;

    const modalHTML = `
      <div id="anlgram-wallet-modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); z-index:2000000; align-items:center; justify-content:center; padding:16px;">
        <div style="background:#0d0e15; border:1px solid rgba(0, 240, 255, 0.35); border-radius:24px; max-width:440px; width:100%; padding:28px; box-shadow:0 0 50px rgba(0, 240, 255, 0.2); color:#fff; position:relative; font-family:'Inter', system-ui, sans-serif; text-align:center; box-sizing:border-box;">
          
          <button id="anlgram-modal-close" style="position:absolute; top:20px; right:20px; background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:4px;">✕</button>
          
          <div id="anlgram-modal-connect-view">
            <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;">
              <span style="font-size:24px;">💎</span>
              <h3 style="margin:0; font-size:20px; font-weight:800; color:#fff;">Connect TON Wallet</h3>
            </div>
            <p style="font-size:13px; color:#94a3b8; margin:0 0 20px 0;">Scan QR code with Tonkeeper or select your preferred TON wallet.</p>
            
            <!-- Fallback Info -->
            <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:18px; margin-bottom:20px; text-align:left;">
              <p style="font-size:13px; color:#94a3b8; margin:0;">El sistema de conexión automático (TonConnect) parece estar bloqueado o cargando. Puedes intentar con los botones directos abajo o usar tu dirección manualmente.</p>
            </div>
            
            <div style="font-size:11px; color:#00f0ff; font-weight:600; margin-bottom:16px; text-transform:uppercase; letter-spacing:0.5px;">Supported Wallets</div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
              <button onclick="window.connectSpecificWallet('Tonkeeper')" style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; transition:all 0.2s;">
                <span style="font-size:18px;">💎</span> Tonkeeper
              </button>
              <button onclick="window.connectSpecificWallet('Telegram Wallet')" style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; transition:all 0.2s;">
                <span style="font-size:18px;">✈️</span> Telegram @wallet
              </button>
              <button onclick="window.connectSpecificWallet('MyTonWallet')" style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; transition:all 0.2s;">
                <span style="font-size:18px;">🔵</span> MyTonWallet
              </button>
              <button onclick="window.connectSpecificWallet('OpenMask')" style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:12px; color:#fff; font-weight:600; font-size:13px; cursor:pointer; transition:all 0.2s;">
                <span style="font-size:18px;">🛡️</span> OpenMask
              </button>
            </div>

            <!-- Manual Address Paste Option -->
            <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:16px;">
              <div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Or connect manually by address:</div>
              <div style="display:flex; gap:8px;">
                <input type="text" id="anlgram-manual-addr-input" placeholder="Paste TON address (EQ... / UQ...)" style="flex:1; background:#07070a; border:1px solid rgba(0,240,255,0.3); border-radius:10px; padding:10px 12px; color:#00f0ff; font-family:monospace; font-size:12px; outline:none;" />
                <button onclick="window.connectManualAddress()" style="background:#00f0ff; color:#000; font-weight:700; border:none; border-radius:10px; padding:0 16px; font-size:13px; cursor:pointer;">Connect</button>
              </div>
            </div>
          </div>

          <!-- Connected Account View -->
          <div id="anlgram-modal-account-view" style="display:none;">
            <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px;">
              <span style="width:10px; height:10px; border-radius:50%; background:#00e676; box-shadow:0 0 10px #00e676;"></span>
              <h3 style="margin:0; font-size:20px; font-weight:800; color:#fff;">Wallet Connected</h3>
            </div>
            <div id="anlgram-modal-full-addr" style="font-family:monospace; font-size:12px; color:#00f0ff; background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.3); border-radius:12px; padding:12px; margin:16px 0; word-break:break-all;"></div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:14px; border-radius:12px; margin-bottom:20px;">
              <span style="color:#94a3b8; font-size:13px;">TON Balance:</span>
              <span id="anlgram-modal-balance-val" style="font-weight:700; font-size:16px; color:#fff;">Fetching...</span>
            </div>

            <button onclick="window.disconnectWallet()" style="width:100%; background:rgba(255,75,75,0.15); border:1px solid #ff4b4b; color:#ff4b4b; font-weight:700; padding:12px; border-radius:12px; cursor:pointer; font-size:14px; transition:all 0.2s;">
              🚫 Disconnect Wallet
            </button>
          </div>

        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('anlgram-modal-close').onclick = () => {
      document.getElementById('anlgram-wallet-modal-overlay').style.display = 'none';
    };
  }

  window.openWalletModal = async function() {
    injectWalletModal();
    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    const connectView = document.getElementById('anlgram-modal-connect-view');
    const accountView = document.getElementById('anlgram-modal-account-view');

    if (tonConnectUI && !currentAddress) {
      try {
        await tonConnectUI.openModal();
        return;
      } catch (e) {
        console.warn('TonConnectUI openModal fallback to built-in modal', e);
      }
    }

    if (overlay && connectView && accountView) {
      overlay.style.display = 'flex';
      if (currentAddress) {
        connectView.style.display = 'none';
        accountView.style.display = 'block';
        document.getElementById('anlgram-modal-full-addr').textContent = currentAddress;
        fetchTonBalance(currentAddress).then(bal => {
          const balEl = document.getElementById('anlgram-modal-balance-val');
          if (balEl) balEl.textContent = `${bal.toFixed(2)} TON`;
        });
      } else {
        connectView.style.display = 'block';
        accountView.style.display = 'none';
      }
    }
  };

  window.connectSpecificWallet = function(walletName) {
    // Always use TON Connect UI for real wallet connection — never generate fake addresses
    if (tonConnectUI) {
      try {
        tonConnectUI.openModal();
        return;
      } catch (e) {
        console.warn('[ANLGRAM] TON Connect openModal failed:', e);
      }
    }
    // Fallback: direct deep-link to wallet app
    const links = {
      'Tonkeeper':        'https://app.tonkeeper.com/ton-connect?ret=' + encodeURIComponent(location.href),
      'Telegram Wallet':  'https://t.me/wallet',
      'MyTonWallet':      'https://mytonwallet.io',
      'OpenMask':         'https://openmask.app',
    };
    if (links[walletName]) window.open(links[walletName], '_blank');
  };

  window.connectWallet = function(walletName) {
    if (walletName) {
      window.connectSpecificWallet(walletName);
    } else {
      window.openWalletModal();
    }
  };

  window.closeWalletModal = function() {
    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  };

  window.connectManualAddress = function() {
    const input = document.getElementById('anlgram-manual-addr-input');
    const addr = input ? input.value.trim() : '';
    if (!addr || addr.length < 10) {
      if (typeof window.showWalletToast === 'function') {
        window.showWalletToast('Dirección Inválida', 'Por favor ingresa una dirección TON válida.', 3000);
      }
      return;
    }
    window.setConnectedWallet(addr, 'Manual TON Wallet');
  };

  window.setConnectedWallet = async function(address, walletName = 'TON Wallet') {
    currentAddress = address;
    localStorage.setItem('anlgram_wallet_addr', address);
    localStorage.setItem('anlgram_wallet_name', walletName);
    
    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address, walletName } }));
    await updateAllButtons();
    
    if (typeof window.showWalletToast === 'function') {
      window.showWalletToast('Conexión Exitosa', `Billetera conectada: ${formatAddress(address)}`, 3000);
    }
  };

  window.disconnectWallet = async function() {
    if (tonConnectUI && tonConnectUI.wallet) {
      try { await tonConnectUI.disconnect(); } catch (e) {}
    }
    currentAddress = '';
    localStorage.removeItem('anlgram_wallet_addr');
    localStorage.removeItem('anlgram_wallet_name');

    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: null } }));
    await updateAllButtons();

    if (typeof window.showWalletToast === 'function') {
      window.showWalletToast('Desconectado', 'Billetera desconectada correctamente.', 3000);
    }
  };

  async function updateAllButtons() {
    const buttons = getWalletButtons();
    const isMobile = window.innerWidth <= 768;

    if (currentAddress) {
      const short = formatAddress(currentAddress);
      let balanceStr = '';
      try {
        const bal = await fetchTonBalance(currentAddress);
        balanceStr = ` | ${bal.toFixed(2)} TON`;
      } catch (e) {}

      buttons.forEach(btn => {
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#00e676;box-shadow:0 0 8px #00e676;"></span>${short}${balanceStr}</span>`;
        btn.title = `Conectado: ${currentAddress}`;
      });
    } else {
      buttons.forEach(btn => {
        btn.innerHTML = isMobile ? 'Connect' : 'Connect Wallet';
        btn.title = 'Click to connect your TON wallet';
      });
    }
  }

  function initTonConnect() {
    injectWalletModal();
    updateAllButtons();

    // Try to initialise the TON Connect UI SDK (loaded from CDN before this script)
    const SDK = window.TON_CONNECT_UI || window.TonConnectUI;
    const UIClass = SDK?.TonConnectUI || SDK;
    if (typeof UIClass === 'function') {
      try {
        tonConnectUI = new UIClass({
          manifestUrl: 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json',
          // Attach the built-in button to a hidden element so the SDK doesn't
          // render its own floating button on top of our custom UI
          buttonRootId: null,
        });

        // Expose globally so staking.js can call sendTransaction
        window.tonConnectUI = tonConnectUI;

        tonConnectUI.onStatusChange(wallet => {
          if (wallet && wallet.account) {
            const addr = wallet.account.address || wallet.account.friendlyAddress;
            window.setConnectedWallet(addr, wallet.device?.appName || 'TON Connect');
          } else if (!wallet && currentAddress) {
            window.disconnectWallet();
          }
        });

        // Restore session if wallet was previously connected
        if (tonConnectUI.wallet && tonConnectUI.wallet.account) {
          const addr = tonConnectUI.wallet.account.address || tonConnectUI.wallet.account.friendlyAddress;
          window.setConnectedWallet(addr, tonConnectUI.wallet.device?.appName || 'TON Connect');
        }

        console.log('[ANLGRAM] TON Connect UI initialised successfully.');
      } catch (e) {
        console.warn('[ANLGRAM] TonConnectUI init failed — manual address mode only:', e);
      }
    } else {
      console.warn('[ANLGRAM] TON Connect UI SDK not found. Wallet connection limited to manual address entry.');
    }
  }

  // Global event listener for any button click
  document.addEventListener('click', function(e) {
    const target = e.target.closest('#topbarWalletBtn, .connect-wallet-btn');
    if (target) {
      e.preventDefault();
      window.openWalletModal();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    #topbarWalletBtn, .connect-wallet-btn {
      transition: all 0.3s ease;
      cursor: pointer !important;
    }
    #topbarWalletBtn:hover, .connect-wallet-btn:hover {
      box-shadow: 0 0 20px rgba(0,240,255,0.4) !important;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTonConnect);
  } else {
    initTonConnect();
  }
})();
