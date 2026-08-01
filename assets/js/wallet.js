// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Integration (Official @tonconnect/ui)
// ═══════════════════════════════════════════════════════════════

class WalletManager {
  constructor() {
    this.tonConnectUI = null;
    this.balance = "0";
    this.init();
  }

  init() {
    if (typeof TON_CONNECT_UI === 'undefined') {
      console.error('TON Connect UI library not found. Please ensure the CDN script is loaded.');
      return;
    }

    try {
      this.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json',
      });

      this.tonConnectUI.onStatusChange(wallet => {
        if (wallet) {
          this.handleConnection(wallet);
        } else {
          this.handleDisconnection();
        }
      });
      
      // Auto restore connection UI if already connected on load
      if (this.tonConnectUI.connected) {
        this.handleConnection(this.tonConnectUI.wallet);
      } else {
        this.updateButtonsUI(null);
      }

    } catch (e) {
      console.error('Error initializing TON Connect UI:', e);
    }

    this.bindButtons();
  }

  bindButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#topbarWalletBtn') || e.target.closest('.connect-wallet-btn') || e.target.closest('.btn-ent');
      if (btn) {
        e.preventDefault();
        if (this.tonConnectUI.connected) {
          this.disconnect();
        } else {
          this.connect();
        }
      }
    });
  }

  async connect() {
    try {
      await this.tonConnectUI.openModal();
    } catch (e) {
      console.error('Connection error:', e);
      if (window.showWalletToast) {
        window.showWalletToast('⚠️ Error', 'Connection canceled or failed.');
      }
    }
  }

  async disconnect() {
    try {
      await this.tonConnectUI.disconnect();
      if (window.showWalletToast) {
        window.showWalletToast('🔓 Disconnected', 'Wallet disconnected successfully.');
      }
    } catch (e) {
      console.error('Disconnect error:', e);
    }
  }

  async handleConnection(wallet) {
    const rawAddress = wallet.account.address;
    
    // Check if wallet info has name, else default
    const walletName = wallet.device?.appName || 'Wallet';
    
    // Fetch balance from Toncenter public API
    try {
      // Use testnet or mainnet based on chain, but for memecoins usually mainnet
      const response = await fetch(`https://toncenter.com/api/v2/getAddressInformation?address=${rawAddress}`);
      const data = await response.json();
      if (data.ok) {
        const nanoTon = data.result.balance;
        this.balance = (nanoTon / 1e9).toFixed(2);
      }
    } catch(e) {
      console.error("Error fetching balance:", e);
      this.balance = "?";
    }

    if (window.showWalletToast) {
      window.showWalletToast('✅ Connected', `Successfully connected ${walletName}`);
    }
    if (window.playAnlgramSound) window.playAnlgramSound('bleep');

    this.updateButtonsUI({
      address: rawAddress,
      name: walletName,
      balance: this.balance
    });
  }

  handleDisconnection() {
    this.balance = "0";
    this.updateButtonsUI(null);
  }

  updateButtonsUI(walletInfo) {
    const btns = document.querySelectorAll('#topbarWalletBtn, .connect-wallet-btn, .btn-ent');
    const settings = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    const isMasked = settings.mask !== false;

    btns.forEach(btn => {
      if (walletInfo) {
        // Convert raw address to user-friendly (Base64URL format ideally, but we'll just truncate raw)
        const addr = walletInfo.address;
        const shortAddr = !isMasked ? addr : (addr.slice(0, 4) + '...' + addr.slice(-4));
        
        btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00e676;margin-right:6px;box-shadow:0 0 8px #00e676;"></span>${shortAddr} (${walletInfo.balance} TON)`;
        
        // Retain current classes but update style
        btn.style.background = 'rgba(0, 230, 118, 0.1)';
        btn.style.color = '#00e676';
        btn.style.border = '1px solid rgba(0, 230, 118, 0.3)';
        btn.title = `Connected to ${walletInfo.name}: ${addr}. Click to disconnect.`;
      } else {
        btn.textContent = 'Connect Wallet';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.border = '';
        btn.title = 'Click to connect your TON wallet';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.anlgramWalletManager = new WalletManager();
});
