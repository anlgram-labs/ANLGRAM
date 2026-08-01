// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Real Wallet Integration (v2.0 - Fully Functional)
// ═══════════════════════════════════════════════════════════════

(function() {
  let tonConnectUI = null;

  function formatAddress(address) {
    if (!address) return '';
    return address.slice(0, 4) + '...' + address.slice(-4);
  }

  async function fetchTonBalance(address) {
    try {
      const response = await fetch(`https://tonapi.io/v2/accounts/${address}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const balance = data.balance; // nanoTON
      return balance / 1000000000;
    } catch (error) {
      console.error('Error fetching TON balance:', error);
      return 0;
    }
  }

  function getWalletButtons() {
    const list = new Set();
    document.querySelectorAll('#topbarWalletBtn, .connect-wallet-btn, button[title="Connect Wallet"], button[title="Connect Web3 Wallet"]').forEach(btn => list.add(btn));
    
    document.querySelectorAll('button, a.btn').forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('connect wallet') || text.includes('connect web3 wallet')) {
        list.add(btn);
      }
    });
    return Array.from(list);
  }

  window.openWalletModal = async function() {
    if (!tonConnectUI) {
      console.warn('TON Connect UI is not initialized yet');
      return;
    }

    if (tonConnectUI.wallet) {
      try {
        await tonConnectUI.disconnect();
        if (typeof window.showWalletToast === 'function') {
          window.showWalletToast('Desconectado', 'Billetera desconectada correctamente.', 3000);
        }
      } catch (e) {
        console.error('Error disconnecting wallet:', e);
      }
    } else {
      try {
        await tonConnectUI.openModal();
      } catch (e) {
        console.error('Error opening TON Connect modal:', e);
      }
    }
  };

  async function updateWalletUI(wallet) {
    const buttons = getWalletButtons();
    const isMobile = window.innerWidth <= 768;

    if (wallet) {
      const rawAddress = wallet.account ? wallet.account.address : '';
      const shortAddress = formatAddress(rawAddress);

      localStorage.setItem('anlgram_wallet_addr', rawAddress);
      localStorage.setItem('anlgram_wallet_name', (wallet.device && wallet.device.appName) ? wallet.device.appName : 'TON Wallet');
      
      window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: rawAddress, wallet } }));

      let balanceStr = '';
      if (rawAddress) {
        try {
          const balance = await fetchTonBalance(rawAddress);
          balanceStr = ` | ${balance.toFixed(2)} TON`;
        } catch (e) {
          console.error(e);
        }
      }

      buttons.forEach(btn => {
        btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#00e676;box-shadow:0 0 8px #00e676;"></span>${shortAddress}${balanceStr}</span>`;
        btn.title = `Conectado: ${rawAddress} (Clic para desconectar)`;
        btn.onclick = (e) => {
          e.preventDefault();
          window.openWalletModal();
        };
      });

      if (typeof window.showWalletToast === 'function') {
        window.showWalletToast('Conexión Exitosa', `Billetera conectada: ${shortAddress}`, 3000);
      }

    } else {
      localStorage.removeItem('anlgram_wallet_addr');
      window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: null, wallet: null } }));

      buttons.forEach(btn => {
        btn.innerHTML = isMobile ? 'Connect' : 'Connect Wallet';
        btn.title = 'Click to connect your TON wallet';
        btn.onclick = (e) => {
          e.preventDefault();
          window.openWalletModal();
        };
      });
    }
  }

  function initTonConnect(retries = 0) {
    if (typeof window.TON_CONNECT_UI === 'undefined' || !window.TON_CONNECT_UI.TonConnectUI) {
      if (retries < 20) {
        setTimeout(() => initTonConnect(retries + 1), 150);
      } else {
        console.error('TON_CONNECT_UI library failed to load.');
      }
      return;
    }

    try {
      tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
        manifestUrl: 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json',
      });

      tonConnectUI.uiOptions = {
        twaReturnUrl: 'https://t.me/AnlgramBot/app',
        theme: window.TON_CONNECT_UI.THEME.DARK
      };

      tonConnectUI.onStatusChange(wallet => {
        updateWalletUI(wallet);
      });

      updateWalletUI(tonConnectUI.wallet || null);

    } catch (e) {
      console.error('Failed to initialize TON Connect UI:', e);
    }
  }

  // Global event listener for any dynamically created connect wallet buttons
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
    document.addEventListener('DOMContentLoaded', () => initTonConnect());
  } else {
    initTonConnect();
  }
})();
