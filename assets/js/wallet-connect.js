// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Real Wallet Integration
// ═══════════════════════════════════════════════════════════════

(function() {
  let tonConnectUI = null;
  let tonPrice = 0; // Cached TON price for calculating USD balance

  function formatAddress(address) {
    if (!address) return '';
    return address.slice(0, 4) + '...' + address.slice(-4);
  }

  async function fetchTonBalance(address) {
    try {
      // Using tonapi.io v2 to get the balance
      const response = await fetch(`https://tonapi.io/v2/accounts/${address}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      const balance = data.balance; // balance in nanoTON
      return balance / 1000000000; // Convert to TON
    } catch (error) {
      console.error('Error fetching TON balance:', error);
      return 0;
    }
  }

  async function updateWalletUI(wallet) {
    const buttons = document.querySelectorAll('#topbarWalletBtn, button[title="Connect Wallet"], button[title="Connect Web3 Wallet"], button:contains("Connect Wallet")');
    const isMobile = window.innerWidth <= 768;

    if (wallet) {
      // Get friendly user-friendly address representation (Base64url bounceable or non-bounceable)
      // TonConnect UI exposes `wallet.account.address`. We can convert it or just format the raw address for display.
      const rawAddress = wallet.account.address;
      
      // Let's use a simple format first
      const shortAddress = formatAddress(rawAddress);

      // Fetch balance
      const balance = await fetchTonBalance(rawAddress);

      buttons.forEach(btn => {
        btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#00e676;box-shadow:0 0 8px #00e676;"></span>${shortAddress} | ${balance.toFixed(2)} TON</span>`;
        btn.onclick = async (e) => {
          e.preventDefault();
          try {
            await tonConnectUI.disconnect();
            window.showWalletToast('Desconectado', 'Billetera desconectada correctamente.', 3000);
          } catch (e) {
            console.error(e);
          }
        };
      });

      window.showWalletToast('Conexión Exitosa', `Billetera conectada: ${shortAddress}`, 3000);

    } else {
      // Not connected
      buttons.forEach(btn => {
        btn.innerHTML = isMobile ? 'Connect' : 'Connect Wallet';
        btn.onclick = async (e) => {
          e.preventDefault();
          try {
            await tonConnectUI.connectWallet();
          } catch (error) {
            console.error('Error connecting wallet', error);
            // Ignore user-rejected errors silently or show a generic error
            if (error.message && !error.message.includes('reject')) {
              window.showWalletToast('Error de Conexión', 'No se pudo conectar la billetera.', 3000);
            }
          }
        };
      });
    }
  }

  function initTonConnect() {
    // Make sure we have the TON_CONNECT_UI global
    if (typeof window.TON_CONNECT_UI === 'undefined') {
      console.error('TON_CONNECT_UI is not loaded. Ensure tonconnect-ui.min.js is included.');
      return;
    }

    try {
      tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
        manifestUrl: 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json',
      });

      // Customizing UI (Optional but requested for "Premium" look)
      tonConnectUI.uiOptions = {
        twaReturnUrl: 'https://t.me/AnlgramBot/app',
        theme: window.TON_CONNECT_UI.THEME.DARK,
        colorsSet: {
          [window.TON_CONNECT_UI.THEME.DARK]: {
            connectButton: {
              background: '#00f0ff'
            },
            accent: '#00f0ff',
            telegramButton: '#0088CC',
            background: {
              primary: '#0f0f16',
              secondary: '#1a1a24',
              segment: '#1a1a24',
              tint: '#1a1a24'
            }
          }
        }
      };

      // Subscribe to wallet changes
      tonConnectUI.onStatusChange(wallet => {
        updateWalletUI(wallet);
      });

      // Initial check if already connected
      if (tonConnectUI.wallet) {
        updateWalletUI(tonConnectUI.wallet);
      } else {
        updateWalletUI(null);
      }

    } catch (e) {
      console.error('Failed to init TON Connect UI', e);
    }
  }

  // Inject styles for the button if needed to override
  const style = document.createElement('style');
  style.textContent = `
    #topbarWalletBtn {
      transition: all 0.3s ease;
    }
    #topbarWalletBtn:hover {
      box-shadow: 0 0 20px rgba(0,240,255,0.4) !important;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);

  // Initialize once the DOM is fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTonConnect);
  } else {
    initTonConnect();
  }
})();
