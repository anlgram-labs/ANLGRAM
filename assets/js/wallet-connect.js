// ═══════════════════════════════════════════════════════════════
// ANLGRAM Universal TON Web3 Wallet & TON Connect Manager
// ═══════════════════════════════════════════════════════════════

(function() {
  let tonConnectUI = null;
  let currentAddress = localStorage.getItem('anlgram_wallet_addr') || '';

  function crc16(data) {
    let crc = 0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i] << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc;
  }

  function rawToFriendly(raw, bounceable = false, testnet = false) {
    if (!raw || typeof raw !== 'string') return '';
    if (!raw.includes(':')) return raw;
    const parts = raw.split(':');
    if (parts.length !== 2) return raw;
    const wc = parseInt(parts[0], 10);
    const hex = parts[1].trim();
    if (hex.length !== 64) return raw;

    const bytes = new Uint8Array(36);
    let tag = bounceable ? 0x11 : 0x51;
    if (testnet) tag |= 0x80;
    bytes[0] = tag;
    bytes[1] = wc === -1 ? 0xff : wc;

    for (let i = 0; i < 32; i++) {
      bytes[2 + i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    const c = crc16(bytes.subarray(0, 34));
    bytes[34] = (c >> 8) & 0xff;
    bytes[35] = c & 0xff;

    let binary = '';
    for (let i = 0; i < 36; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_');
  }

  function toFriendly(address) {
    if (!address) return '';
    if (address.includes(':')) {
      const isTest = (localStorage.getItem('anlgram_wallet_network') || localStorage.getItem('anlgram_staking_network')) === 'testnet';
      return rawToFriendly(address, false, isTest);
    }
    return address;
  }

  function formatAddress(address) {
    if (!address) return '';
    const friendly = toFriendly(address);
    return friendly.slice(0, 4) + '...' + friendly.slice(-4);
  }

  async function fetchTonBalance(address, networkOverride) {
    try {
      const net = networkOverride || localStorage.getItem('anlgram_wallet_network') || localStorage.getItem('anlgram_staking_network') || 'mainnet';
      const base = net === 'testnet' ? 'https://testnet.tonapi.io/v2' : 'https://tonapi.io/v2';
      const response = await fetch(`${base}/accounts/${encodeURIComponent(address)}`);
      if (!response.ok) throw new Error('Network response error');
      const data = await response.json();
      const balNano = BigInt(String(data.balance || 0).split('.')[0] || '0');
      const whole = balNano / 1000000000n;
      const frac = (balNano % 1000000000n).toString().padStart(9, '0').slice(0, 4);
      return Number(`${whole}.${frac}`);
    } catch (e) {
      console.warn('Could not fetch TON balance directly:', e);
      return 0;
    }
  }

  function getWalletButtons() {
    const list = new Set();
    
    // 1. Permanent selectors (by ID, dedicated class, or data attribute)
    document.querySelectorAll('#topbarWalletBtn, #heroWalletBtn, .connect-wallet-btn, [data-wallet-btn]').forEach(btn => {
      if (btn.id === 'anlgram-modal-disconnect-btn' || btn.getAttribute('onclick')?.includes('disconnect')) return;
      btn.setAttribute('data-wallet-btn', 'true');
      btn.classList.add('connect-wallet-btn');
      list.add(btn);
    });

    // 2. Elements with explicit click handlers for wallet modal
    document.querySelectorAll('[onclick*="openWalletModal"], [onclick*="connectWallet"]').forEach(btn => {
      if (btn.id === 'anlgram-modal-disconnect-btn' || btn.getAttribute('onclick')?.includes('disconnect')) return;
      btn.setAttribute('data-wallet-btn', 'true');
      btn.classList.add('connect-wallet-btn');
      list.add(btn);
    });

    // 3. Elements with wallet/conectado in title or aria-label
    document.querySelectorAll('button[title*="Wallet" i], button[title*="billetera" i], button[title*="conectado" i], button[aria-label*="wallet" i], button[aria-label*="billetera" i]').forEach(btn => {
      if (btn.id === 'anlgram-modal-disconnect-btn' || btn.getAttribute('onclick')?.includes('disconnect')) return;
      btn.setAttribute('data-wallet-btn', 'true');
      btn.classList.add('connect-wallet-btn');
      list.add(btn);
    });
    
    // 4. Initial button text discovery (marked so they are never lost on text updates)
    document.querySelectorAll('button, a.btn, a.btn-premium, a.btn-glass').forEach(btn => {
      if (btn.id === 'anlgram-modal-disconnect-btn' || btn.getAttribute('onclick')?.includes('disconnect')) return;
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('disconnect') || text.includes('desconectar')) return;
      if (text.includes('connect wallet') || text.includes('connect web3 wallet') || text.includes('connect ton wallet')) {
        btn.setAttribute('data-wallet-btn', 'true');
        btn.classList.add('connect-wallet-btn');
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
            <div id="anlgram-modal-full-addr" style="font-family:monospace; font-size:12px; color:#00f0ff; background:rgba(0,240,255,0.08); border:1px solid rgba(0,240,255,0.3); border-radius:12px; padding:14px; margin:16px 0; word-break:break-all; text-align:left;"></div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:14px; border-radius:12px; margin-bottom:20px;">
              <span style="color:#94a3b8; font-size:13px;">TON Balance:</span>
              <span id="anlgram-modal-balance-val" style="font-weight:700; font-size:16px; color:#fff;">Fetching...</span>
            </div>

            <button id="anlgram-modal-disconnect-btn" onclick="window.disconnectWallet()" style="width:100%; background:rgba(255,75,75,0.15); border:1px solid #ff4b4b; color:#ff4b4b; font-weight:700; padding:12px; border-radius:12px; cursor:pointer; font-size:14px; transition:all 0.2s;">
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
        const friendlyAddr = toFriendly(currentAddress);
        const fullAddrEl = document.getElementById('anlgram-modal-full-addr');
        if (fullAddrEl) {
          fullAddrEl.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:#00f0ff;letter-spacing:0.5px;">💎 Dirección Tonkeeper (UQ)</span>
              <button id="copy-friendly-btn" onclick="navigator.clipboard.writeText('${friendlyAddr}');this.textContent='✓ Copiado';setTimeout(()=>this.textContent='Copiar',2000)" style="background:rgba(0,240,255,0.15);border:1px solid rgba(0,240,255,0.4);border-radius:6px;color:#00f0ff;cursor:pointer;font-size:11px;font-weight:700;padding:2px 8px;">Copiar</button>
            </div>
            <div style="font-weight:700;color:#fff;margin-bottom:10px;word-break:break-all;font-size:13px;line-height:1.4;">${friendlyAddr}</div>
            ${currentAddress.includes(':') ? `<div style="font-size:10px;color:#64748b;border-top:1px dashed rgba(255,255,255,0.1);padding-top:6px;word-break:break-all;text-align:left;"><span style="color:#94a3b8;">Formato Raw Blockchain:</span> ${currentAddress}</div>` : ''}
          `;
        }
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
    if (!addr || addr.length < 10 || (typeof window.validateTonAddress === 'function' && !window.validateTonAddress(addr).valid)) {
      if (typeof window.showWalletToast === 'function') {
        window.showWalletToast('Dirección Inválida', 'Por favor ingresa una dirección TON válida con checksum CRC16 correcto.', 3000);
      }
      return;
    }
    const isTestPrefix = addr.startsWith('kQ') || addr.startsWith('0Q');
    const defaultNet = isTestPrefix ? 'testnet' : (localStorage.getItem('anlgram_staking_network') || 'testnet');
    // Manual pasted address is strictly Watch-Only / Read-Only. Cannot sign transactions.
    window.setConnectedWallet(addr, 'Watch-Only (Read-Only)', defaultNet, false);
    if (typeof window.showWalletToast === 'function') {
      window.showWalletToast('Modo Observador', 'Dirección vinculada en modo solo lectura. Para firmar transacciones conecta vía TON Connect.', 4500);
    }
  };

  window.getConnectedWalletChainId = function() {
    // 1. Live chain directly from connected TonConnect wallet instance
    const rawChain = window.tonConnectUI?.wallet?.account?.chain;
    if (rawChain === '-3' || rawChain === -3) return '-3';
    if (rawChain === '-239' || rawChain === -239) return '-239';

    // 2. Fallback to stored network preference if TonConnect session is still restoring or watch-only mode
    const storedNet = localStorage.getItem('anlgram_wallet_network') || localStorage.getItem('anlgram_staking_network');
    if (storedNet === 'mainnet') return '-239';
    if (storedNet === 'testnet') return '-3';

    // 3. Fallback based on address prefix if available
    const addr = currentAddress || localStorage.getItem('anlgram_wallet_addr');
    if (addr) {
      if (addr.startsWith('kQ') || addr.startsWith('0Q')) return '-3';
      if (addr.startsWith('EQ') || addr.startsWith('UQ')) return '-239';
      // Workchain 0 raw format (0:...), default to Mainnet
      return '-239';
    }

    return null;
  };

  window.isWalletReadyForTransaction = function() {
    const isTonConnect = localStorage.getItem('anlgram_wallet_is_tonconnect') === 'true';
    const hasAddr = Boolean(localStorage.getItem('anlgram_wallet_addr'));
    const hasUI = Boolean(window.tonConnectUI && window.tonConnectUI.wallet);
    return isTonConnect && hasAddr && hasUI;
  };

  window.setConnectedWallet = async function(address, walletName = 'TON Wallet', network = 'mainnet', isTonConnect = false) {
    currentAddress = address;
    localStorage.setItem('anlgram_wallet_addr', address);
    localStorage.setItem('anlgram_wallet_name', walletName);
    localStorage.setItem('anlgram_wallet_network', network);
    localStorage.setItem('anlgram_wallet_is_tonconnect', isTonConnect ? 'true' : 'false');
    
    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { 
      detail: { 
        address, 
        walletName, 
        network, 
        isTonConnect, 
        isReadOnly: !isTonConnect 
      } 
    }));
    await updateAllButtons();
    
    if (isTonConnect && typeof window.showWalletToast === 'function') {
      window.showWalletToast('Conexión Exitosa', `Billetera conectada: ${formatAddress(address)} (${network})`, 3000);
    }
  };

  window.disconnectWallet = async function() {
    if (tonConnectUI && tonConnectUI.wallet) {
      try { await tonConnectUI.disconnect(); } catch (e) {}
    }
    currentAddress = '';
    localStorage.removeItem('anlgram_wallet_addr');
    localStorage.removeItem('anlgram_wallet_name');
    localStorage.removeItem('anlgram_wallet_network');
    localStorage.removeItem('anlgram_wallet_is_tonconnect');

    const overlay = document.getElementById('anlgram-wallet-modal-overlay');
    if (overlay) overlay.style.display = 'none';

    window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: null, network: 'mainnet', isTonConnect: false, isReadOnly: true } }));
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
      const chainId = typeof window.getConnectedWalletChainId === 'function' ? window.getConnectedWalletChainId() : null;
      let balanceStr = '';
      let isWrongNet = false;
      let statusColor = '#00e676'; // green

      if (chainId === '-239') {
        try {
          const bal = await fetchTonBalance(currentAddress, 'mainnet');
          balanceStr = ` | ${bal.toFixed(2)} TON (Mainnet)`;
        } catch (e) {
          balanceStr = ' | Mainnet';
        }
        statusColor = '#00e676';
        isWrongNet = false;
      } else if (chainId === '-3') {
        try {
          const bal = await fetchTonBalance(currentAddress, 'testnet');
          balanceStr = ` | ${bal.toFixed(2)} TON (Testnet)`;
        } catch (e) {
          balanceStr = ' | Testnet';
        }
        statusColor = '#00e676';
        isWrongNet = false;
      } else {
        statusColor = '#f59e0b'; // yellow
        balanceStr = ' | Red no verificada';
      }

      buttons.forEach(btn => {
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${statusColor};box-shadow:0 0 8px ${statusColor};"></span>${short}${balanceStr}</span>`;
        btn.title = `Conectado: ${currentAddress} (${chainId === '-239' ? 'Mainnet -239' : (chainId === '-3' ? 'Testnet -3' : (chainId || 'Red no verificada'))})`;
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
        // Always use the public HTTPS manifest so mobile wallets (Tonkeeper, etc.) can fetch it via cellular/Wi-Fi
        const manifestUrl = 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json';

        tonConnectUI = new UIClass({
          manifestUrl: manifestUrl,
          // Attach the built-in button to a hidden element so the SDK doesn't
          // render its own floating button on top of our custom UI
          buttonRootId: null,
        });

        // Expose globally so staking.js can call sendTransaction
        window.tonConnectUI = tonConnectUI;

        const getChainNetwork = (wallet) => {
          const chain = wallet?.account?.chain;
          return (chain === '-3' || chain === -3) ? 'testnet' : 'mainnet';
        };

        let hasRestoredAttempted = false;

        // Listen for restored session from IndexedDB / Storage asynchronously
        if (tonConnectUI.connectionRestored) {
          tonConnectUI.connectionRestored.then(restored => {
            hasRestoredAttempted = true;
            if (restored && tonConnectUI.wallet && tonConnectUI.wallet.account) {
              const addr = tonConnectUI.wallet.account.address || tonConnectUI.wallet.account.friendlyAddress;
              const net = getChainNetwork(tonConnectUI.wallet);
              window.setConnectedWallet(addr, tonConnectUI.wallet.device?.appName || 'TON Connect', net, true);
            }
            updateAllButtons();
          }).catch(e => {
            hasRestoredAttempted = true;
            console.warn('[ANLGRAM] connectionRestored note:', e);
            updateAllButtons();
          });
        }

        tonConnectUI.onStatusChange(wallet => {
          if (wallet && wallet.account) {
            const addr = wallet.account.address || wallet.account.friendlyAddress;
            const net = getChainNetwork(wallet);
            window.setConnectedWallet(addr, wallet.device?.appName || 'TON Connect', net, true);
          } else if (!wallet && currentAddress && hasRestoredAttempted) {
            const isTonConnect = localStorage.getItem('anlgram_wallet_is_tonconnect') === 'true';
            if (isTonConnect) {
              window.disconnectWallet();
            }
          }
        });

        // Restore session if wallet was synchronously available
        if (tonConnectUI.wallet && tonConnectUI.wallet.account) {
          const addr = tonConnectUI.wallet.account.address || tonConnectUI.wallet.account.friendlyAddress;
          const net = getChainNetwork(tonConnectUI.wallet);
          window.setConnectedWallet(addr, tonConnectUI.wallet.device?.appName || 'TON Connect', net, true);
        }

        console.log('[ANLGRAM] TON Connect UI initialised successfully with manifest:', manifestUrl);
      } catch (e) {
        console.warn('[ANLGRAM] TonConnectUI init failed — manual address mode only:', e);
      }
    } else {
      console.warn('[ANLGRAM] TON Connect UI SDK not found. Wallet connection limited to manual address entry.');
    }
  }

  // Global event listener for any button click
  document.addEventListener('click', function(e) {
    const target = e.target.closest('#topbarWalletBtn, #heroWalletBtn, .connect-wallet-btn, [data-wallet-btn]');
    if (target) {
      e.preventDefault();
      window.openWalletModal();
    }
  });

  const style = document.createElement('style');
  style.textContent = `
    #topbarWalletBtn, #heroWalletBtn, .connect-wallet-btn, [data-wallet-btn] {
      transition: all 0.3s ease;
      cursor: pointer !important;
    }
    #topbarWalletBtn:hover, #heroWalletBtn:hover, .connect-wallet-btn:hover, [data-wallet-btn]:hover {
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
