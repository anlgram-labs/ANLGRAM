import { formatAddress } from '../utils/helpers.js';
import { Toast } from '../components/Toast.js';

export class WalletService {
    constructor() {
        this.tonConnectUI = null;
        this.balance = "0";
        this.walletInfo = null;
    }

    init() {
        if (typeof window.TON_CONNECT_UI === 'undefined') {
            console.error('TON Connect UI library not found.');
            return;
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

            if (this.tonConnectUI.connected) {
                this.handleConnection(this.tonConnectUI.wallet);
            }
        } catch (e) {
            console.error('Error initializing TON Connect UI:', e);
        }
    }

    async connect() {
        try {
            if(this.tonConnectUI.connected) {
                await this.disconnect();
            } else {
                await this.tonConnectUI.openModal();
            }
        } catch (e) {
            console.error('Connection error:', e);
            Toast.error('Connection canceled or failed.');
        }
    }

    async disconnect() {
        try {
            await this.tonConnectUI.disconnect();
            Toast.success('Wallet disconnected successfully.');
        } catch (e) {
            console.error('Disconnect error:', e);
        }
    }

    async handleConnection(wallet) {
        const rawAddress = wallet.account.address;
        const walletName = wallet.device?.appName || 'Wallet';
        
        try {
            const response = await fetch(`https://toncenter.com/api/v2/getAddressInformation?address=\${rawAddress}`);
            const data = await response.json();
            if (data.ok) {
                this.balance = (data.result.balance / 1e9).toFixed(2);
            }
        } catch(e) {
            this.balance = "?";
        }

        this.walletInfo = { address: rawAddress, name: walletName, balance: this.balance };
        Toast.success(`Connected to \${walletName}`);
        
        // Dispatch global event for the UI to update
        window.dispatchEvent(new CustomEvent('wallet:connected', { detail: this.walletInfo }));
    }

    handleDisconnection() {
        this.walletInfo = null;
        this.balance = "0";
        window.dispatchEvent(new CustomEvent('wallet:disconnected'));
    }
}

export const WalletManager = new WalletService();
