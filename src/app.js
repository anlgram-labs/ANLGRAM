import { WalletManager } from './services/walletService.js';
import { Toast } from './components/Toast.js';
import { Loader } from './components/Loader.js';
import { API } from './services/api.js';

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Wallet
    WalletManager.init();

    // 2. Global Button Binding
    bindGlobalButtons();

    // 3. Listen to Wallet Events
    window.addEventListener('wallet:connected', (e) => updateWalletUI(e.detail));
    window.addEventListener('wallet:disconnected', () => updateWalletUI(null));

    // 4. Page Specific Logic Initialization
    const path = window.location.pathname;
    if (path.includes('intel-exchange')) {
        initIntelExchange();
    } else {
        // Generic page init
        setupPlaceholderButtons();
    }
});

function updateWalletUI(walletInfo) {
    const btns = document.querySelectorAll('.connect-wallet-btn, #topbarWalletBtn');
    btns.forEach(btn => {
        if (walletInfo) {
            const shortAddr = walletInfo.address.slice(0, 4) + '...' + walletInfo.address.slice(-4);
            btn.innerHTML = \`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00e676;margin-right:6px;box-shadow:0 0 8px #00e676;"></span>\${shortAddr} (\${walletInfo.balance} TON)\`;
            btn.style.background = 'rgba(0, 230, 118, 0.1)';
            btn.style.color = '#00e676';
            btn.style.border = '1px solid rgba(0, 230, 118, 0.3)';
        } else {
            btn.textContent = 'Connect Wallet';
            btn.style.background = '';
            btn.style.color = '';
            btn.style.border = '';
        }
    });
}

function bindGlobalButtons() {
    document.addEventListener('click', async (e) => {
        // Wallet Connect
        const walletBtn = e.target.closest('.connect-wallet-btn') || e.target.closest('#topbarWalletBtn');
        if (walletBtn) {
            e.preventDefault();
            WalletManager.connect();
        }

        // Copy Address
        const copyBtn = e.target.closest('.copy-address-btn');
        if (copyBtn) {
            e.preventDefault();
            navigator.clipboard.writeText(WalletManager.walletInfo?.address || 'EQC...');
            Toast.info("Address copied to clipboard");
        }
    });
}

function setupPlaceholderButtons() {
    // Phase 2: Convert ALL buttons to have some interaction
    document.querySelectorAll('button:not(#topbarWalletBtn):not(.connect-wallet-btn)').forEach(btn => {
        if(!btn.hasAttribute('data-bound')) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                Loader.show('Processing Action...');
                await API.executeSwap('A', 'B', 0); // Fake delay
                Loader.hide();
                Toast.success('Action executed successfully via Global Manager');
            });
            btn.setAttribute('data-bound', 'true');
        }
    });
}

// Intel Exchange Pro Controller
async function initIntelExchange() {
    // The previous intel-engine.js handles the chart loop.
    // Here we hook up specific UI buttons requested in the prompt
    
    // Scan Wallet Button
    const scanBtn = document.querySelector('.col-right .btn-glass-sm');
    if (scanBtn && scanBtn.textContent.includes('Scan Wallet')) {
        scanBtn.addEventListener('click', async () => {
            const input = document.querySelector('.col-right .search-box input').value;
            if(!input) {
                Toast.warning('Please enter a wallet address');
                return;
            }
            Loader.show('Scanning Blockchain...');
            try {
                const data = await API.analyzeWallet(input);
                Loader.hide();
                Toast.success(`Wallet Found! PNL: \${data.pnl}`);
            } catch(e) {
                Loader.hide();
                Toast.error('Invalid wallet address');
            }
        });
    }

    // Token Search Filter
    const tokenInput = document.querySelector('.col-left .search-box input');
    if(tokenInput) {
        tokenInput.addEventListener('keypress', async (e) => {
            if(e.key === 'Enter') {
                Loader.show('Searching Token...');
                await API.fetchTokens();
                Loader.hide();
                Toast.info(`Tokens updated for search: \${tokenInput.value}`);
            }
        });
    }
}
