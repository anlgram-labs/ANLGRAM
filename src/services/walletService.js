import { formatAddress } from '../utils/helpers.js';
import { Toast } from '../components/Toast.js';

export class WalletService {
    constructor() {
        this.tonConnectUI = null;
        this.balance = "0";
        this.walletInfo = null;
        this.isConnecting = false;
    }

    async init() {
        if (typeof window.TON_CONNECT_UI === 'undefined') {
            try {
                await this.loadScript('https://unpkg.com/@tonconnect/ui@latest/dist/tonconnect-ui.min.js');
            } catch (e) {
                console.error("Failed to load TON Connect SDK", e);
                return;
            }
        }

        try {
            this.tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
                manifestUrl: 'https://anlgram-labs.github.io/ANLGRAM/tonconnect-manifest.json',
            });

            this.tonConnectUI.onStatusChange(wallet => {
                if (wallet) {
                    this.handleConnection(wallet);
                } else {
                    this.handleDisconnection();
                }
            });

            // Auto-restore connection if session exists
            if (this.tonConnectUI.connected) {
                this.handleConnection(this.tonConnectUI.wallet);
            }
        } catch (e) {
            console.error('Error initializing TON Connect UI:', e);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async connect() {
        if (this.isConnecting) return;
        
        if (!this.tonConnectUI) {
            Toast.warning('Initializing secure wallet interface...');
            await this.init();
            if (!this.tonConnectUI) return Toast.error('Failed to load wallet interface. Check your connection.');
        }

        try {
            this.isConnecting = true;
            if(this.tonConnectUI.connected) {
                await this.disconnect();
            } else {
                await this.tonConnectUI.openModal();
            }
        } catch (e) {
            this.handleConnectionError(e);
        } finally {
            this.isConnecting = false;
        }
    }

    handleConnectionError(e) {
        console.error('Wallet connection error:', e);
        const msg = e.message || '';
        
        if (msg.includes('reject') || msg.includes('cancel')) {
            Toast.warning('Connection canceled by user.');
        } else if (msg.includes('timeout')) {
            Toast.error('Connection timed out. Please try again.');
        } else if (msg.includes('not installed')) {
            Toast.error('Wallet not installed. Please install a TON wallet.');
        } else {
            Toast.error('An error occurred during wallet connection.');
        }
    }

    async disconnect() {
        try {
            await this.tonConnectUI.disconnect();
            Toast.success('Wallet securely disconnected.');
        } catch (e) {
            console.error('Disconnect error:', e);
            Toast.error('Failed to disconnect wallet.');
        }
    }

    async handleConnection(wallet) {
        const rawAddress = wallet.account.address;
        const walletName = wallet.device?.appName || 'TON Wallet';
        
        // Fetch balance from Toncenter public API with fallback
        try {
            const response = await fetch(`https://toncenter.com/api/v2/getAddressInformation?address=\${rawAddress}`);
            if (!response.ok) throw new Error("Rate limit or CORS");
            const data = await response.json();
            if (data.ok) {
                this.balance = (data.result.balance / 1e9).toFixed(2);
            } else {
                throw new Error("Invalid response");
            }
        } catch(e) {
            console.warn("TonCenter API failed, falling back to simulated balance", e);
            this.balance = "?"; 
        }

        this.walletInfo = { address: rawAddress, name: walletName, balance: this.balance };
        Toast.success(`Connected to \${walletName}`);
        
        window.dispatchEvent(new CustomEvent('wallet:connected', { detail: this.walletInfo }));
    }

    handleDisconnection() {
        this.walletInfo = null;
        this.balance = "0";
        window.dispatchEvent(new CustomEvent('wallet:disconnected'));
    }
}

export const WalletManager = new WalletService();
