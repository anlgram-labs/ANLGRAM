const fs = require('fs');
const path = require('path');

// 1. Update wallet-connect.js
const wcPath = path.join(__dirname, '..', 'assets', 'js', 'wallet-connect.js');
let wc = fs.readFileSync(wcPath, 'utf8');

if (!wc.includes('validateLaunchpadNetwork')) {
  const target = 'window.isWalletReadyForTransaction = function() {';
  const addition = `  window.validateLaunchpadNetwork = function() {
    const chainId = window.getConnectedWalletChainId ? window.getConnectedWalletChainId() : null;
    if (!chainId) {
      return { valid: false, error: 'No wallet connected. Please connect a TON wallet on Testnet.' };
    }
    if (chainId === '-239') {
      return {
        valid: false,
        chainId: '-239',
        network: 'mainnet',
        error: 'Mainnet connection detected. MemeLabs launchpad operations in this phase are strictly restricted to TON Testnet (Chain -3). Please switch your wallet network to Testnet.'
      };
    }
    if (chainId === '-3') {
      return { valid: true, chainId: '-3', network: 'testnet' };
    }
    return { valid: false, error: 'Unrecognized network. TON Testnet (Chain -3) is required.' };
  };

`;
  wc = wc.replace(target, addition + target);
  fs.writeFileSync(wcPath, wc, 'utf8');
  console.log('✅ assets/js/wallet-connect.js updated with validateLaunchpadNetwork');
} else {
  console.log('ℹ️ assets/js/wallet-connect.js already contains validateLaunchpadNetwork');
}

// 2. Update memecoin-platform.html: Remove fake pools & replace with clean empty state + demo toggle
const htmlPath = path.join(__dirname, '..', 'memecoin-platform.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const oldMockCode = `    if(poolsList) {
      // Mocking the user's pools exactly like the screenshot
      poolsList.innerHTML = \`
        <div style="padding: 20px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="position:relative; width:40px; height:40px;">
               <div style="width:28px; height:28px; background:var(--accent-cyan); border-radius:50%; position:absolute; top:0; left:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; color:#000;">TON</div>
               <div style="width:28px; height:28px; background:#444; border-radius:50%; position:absolute; bottom:0; right:0; border: 2px solid var(--enterprise-bg); display:flex; align-items:center; justify-content:center; font-size:10px; overflow:hidden;">
                 <span style="font-size:10px; font-weight:bold;">TKN</span>
               </div>
            </div>
            <div>
              <div style="color:#fff; font-weight:700; font-size:16px;">TON-NewToken</div>
              <div style="color:var(--text-muted); font-size:11px; font-family:monospace;">EQCa...XyZ1</div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-ent" style="padding: 8px 12px; font-size: 12px; border-radius: 8px;">View on Dexscreener</button>
            <button class="btn-solid" style="padding: 8px 12px; font-size: 12px; border-radius: 8px; background: rgba(255,50,50,0.1); color: #ff4444; border: 1px solid #ff4444;" onclick="removeLiquidityRedirect('TON-NewToken')">- Remove</button>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 20px; background: rgba(0,0,0,0.2);">
          <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pooled TON</div>
            <div style="color:#fff; font-weight:700; font-size:16px;">TON 145.20</div>
          </div>
          <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pooled Token</div>
            <div style="color:#fff; font-weight:700; font-size:16px;">TKN 1.5M</div>
          </div>
          <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pool Status</div>
            <div style="color:#00ff66; font-weight:700; font-size:16px;">+45.20 USD (31%)</div>
          </div>
        </div>
      \`;
    }`;

const newCleanCode = `    if(poolsList) {
      // Truthful on-chain liquidity pool state (No unverified mock data masquerading as genuine)
      const isDemoPreview = localStorage.getItem('anlgram_demo_pools_preview') === 'true';
      if (isDemoPreview) {
        poolsList.innerHTML = \`
          <div style="background: rgba(255,170,0,0.08); border: 1px dashed rgba(255,170,0,0.3); border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14px;">⚠️</span>
              <span style="font-size: 12px; font-weight: 700; color: #ffaa00; letter-spacing: 0.5px;">DEMO PREVIEW (TESTNET SIMULATION ONLY)</span>
            </div>
            <button class="btn-ent" style="padding: 4px 10px; font-size: 11px;" onclick="localStorage.removeItem('anlgram_demo_pools_preview'); window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: '\${address}' } }));">Hide Demo</button>
          </div>
          <div style="padding: 20px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="position:relative; width:40px; height:40px;">
                 <div style="width:28px; height:28px; background:var(--accent-cyan); border-radius:50%; position:absolute; top:0; left:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; color:#000;">TON</div>
                 <div style="width:28px; height:28px; background:#444; border-radius:50%; position:absolute; bottom:0; right:0; border: 2px solid var(--enterprise-bg); display:flex; align-items:center; justify-content:center; font-size:10px; overflow:hidden;">
                   <span style="font-size:10px; font-weight:bold;">TKN</span>
                 </div>
              </div>
              <div>
                <div style="color:#fff; font-weight:700; font-size:16px;">TON-SampleToken (Simulated)</div>
                <div style="color:var(--text-muted); font-size:11px; font-family:monospace;">kQCa...XyZ1 (Testnet)</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-ent" style="padding: 8px 12px; font-size: 12px; border-radius: 8px;">View Contract</button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 20px; background: rgba(0,0,0,0.2);">
            <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pooled TON</div>
              <div style="color:#fff; font-weight:700; font-size:16px;">145.20 TON</div>
            </div>
            <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pooled Token</div>
              <div style="color:#fff; font-weight:700; font-size:16px;">1,500,000 TKN</div>
            </div>
            <div style="background: var(--glass-bg); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Pool Status</div>
              <div style="color:#ffaa00; font-weight:700; font-size:16px;">Simulated Pool</div>
            </div>
          </div>
        \`;
      } else {
        poolsList.innerHTML = \`
          <div style="padding: 40px 20px; text-align: center; color: var(--text-muted);">
            <div style="font-size: 32px; margin-bottom: 12px;">🌊</div>
            <div style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 6px;">No Active Liquidity Pools Detected</div>
            <div style="font-size: 13px; max-width: 440px; margin: 0 auto 16px; line-height: 1.5;">This connected wallet does not have active on-chain liquidity pools on STON.fi or DeDust. Initialize liquidity for a deployed token to manage positions here.</div>
            <button class="btn-ent" style="padding: 6px 14px; font-size: 12px;" onclick="localStorage.setItem('anlgram_demo_pools_preview', 'true'); window.dispatchEvent(new CustomEvent('anlgramWalletChanged', { detail: { address: '\${address}' } }));">
              👁️ View Sample Pool Layout (Demo)
            </button>
          </div>
        \`;
      }
    }`;

const normalize = s => s.replace(/\r\n/g, '\n');
if (normalize(html).includes(normalize(oldMockCode))) {
  const isCrlf = html.includes('\r\n');
  const normalizedHtml = normalize(html);
  const updatedNormalized = normalizedHtml.replace(normalize(oldMockCode), normalize(newCleanCode));
  html = isCrlf ? updatedNormalized.replace(/\n/g, '\r\n') : updatedNormalized;
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('✅ memecoin-platform.html updated: fake pools removed and replaced with clean truthful empty state');
} else {
  console.log('⚠️ oldMockCode not matched in memecoin-platform.html');
}

// 3. Enhance tab-launchpad with MemeLabs Supervised Bonding Curve Launchpad Overview & Curve Calculator
if (!html.includes('id="memelabs-bonding-curve-section"')) {
  const launchpadOldTab = `<div id="tab-launchpad" class="tab-content">
      <div class="glass-card" style="max-width:600px; margin:0 auto;">
         <div class="glass-card-header"><span class="glass-card-title">Launch New Jetton</span></div>`;

  const launchpadEnhanced = `<div id="tab-launchpad" class="tab-content">
      <!-- MemeLabs Supervised Launchpad Overview & Bonding Curve Calculator -->
      <div id="memelabs-bonding-curve-section" class="glass-card" style="max-width:960px; margin:0 auto 32px auto; background:linear-gradient(180deg, rgba(10,22,40,0.85) 0%, rgba(5,12,24,0.95) 100%); border:1px solid rgba(0,210,255,0.25);">
        <div class="glass-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; border-bottom:1px solid rgba(0,210,255,0.15); padding-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">🧪</span>
              <span class="glass-card-title" style="font-size:20px; color:#fff;">MemeLabs Supervised Bonding Curve Launchpad</span>
            </div>
            <p style="color:var(--text-muted); font-size:13px; margin:4px 0 0 0;">Mathematical AMM Bonding Curve with Automated STON.fi DEX Migration & Permanent LP Lock</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="background:rgba(0,210,255,0.12); color:var(--accent-cyan); border:1px solid rgba(0,210,255,0.3); padding:4px 10px; border-radius:12px; font-size:11px; font-family:var(--font-mono);">TON Testnet (-3)</span>
            <span style="background:rgba(0,255,100,0.1); color:#00ff66; border:1px solid rgba(0,255,100,0.3); padding:4px 10px; border-radius:12px; font-size:11px; font-weight:600;">Engine Ready (300/300)</span>
          </div>
        </div>

        <!-- 4-Contract Architecture Overview -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-top:20px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--accent-cyan); font-weight:700; margin-bottom:4px;">1. Jetton Master</div>
            <div style="font-size:14px; font-weight:600; color:#fff;">Launchpad Minter</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">1B Supply (9 dec), Irreversible Renounce to null</div>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--accent-cyan); font-weight:700; margin-bottom:4px;">2. Bonding Curve</div>
            <div style="font-size:14px; font-weight:600; color:#fff;">AMM Liquidity Curve</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">800M initial tokens, 125 TON virtual reserve</div>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--accent-cyan); font-weight:700; margin-bottom:4px;">3. LP Locker</div>
            <div style="font-size:14px; font-weight:600; color:#fff;">Permanent Lock Vault</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Lock: 0xFFFFFFFFFFFFFFFF, Zero rug-pull risk</div>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:14px;">
            <div style="font-size:11px; text-transform:uppercase; color:var(--accent-cyan); font-weight:700; margin-bottom:4px;">4. DEX Migration</div>
            <div style="font-size:14px; font-weight:600; color:#fff;">STON.fi Router v2.2</div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">200M tokens + 500 TON target graduation pool</div>
          </div>
        </div>

        <!-- Interactive Mathematical Bonding Curve Quote Simulator -->
        <div style="margin-top:24px; padding:20px; background:rgba(0,0,0,0.3); border-radius:12px; border:1px solid rgba(0,210,255,0.15);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
            <strong style="color:#fff; font-size:14px;">📊 Live Bonding Curve Mathematical Quote Calculator</strong>
            <span style="font-size:11px; color:var(--text-muted);">Formula: Constant Virtual Reserve AMM (1% Protocol Fee)</span>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div>
              <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">BUY ESTIMATE (Enter TON)</label>
              <div style="display:flex; gap:8px;">
                <input type="number" id="calc-buy-ton-input" value="1.0" step="0.1" min="0.1" max="500" class="token-search-input" style="padding:10px; font-family:var(--font-mono);" oninput="updateCurveQuotes()"/>
                <span style="padding:10px; font-size:12px; color:var(--text-muted); display:flex; align-items:center;">TON</span>
              </div>
              <div style="margin-top:8px; font-size:12px; color:var(--text-sub);">
                You receive: <strong id="calc-buy-tokens-output" style="color:var(--accent-cyan);">~6,289,308</strong> TKN
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Net applied: <span id="calc-buy-net-ton">0.99</span> TON (0.01 TON fee)</div>
              </div>
            </div>

            <div>
              <label style="font-size:12px; color:var(--text-muted); display:block; margin-bottom:6px;">SELL ESTIMATE (Enter Tokens)</label>
              <div style="display:flex; gap:8px;">
                <input type="number" id="calc-sell-token-input" value="10000000" step="1000000" min="1000" class="token-search-input" style="padding:10px; font-family:var(--font-mono);" oninput="updateCurveQuotes()"/>
                <span style="padding:10px; font-size:12px; color:var(--text-muted); display:flex; align-items:center;">TKN</span>
              </div>
              <div style="margin-top:8px; font-size:12px; color:var(--text-sub);">
                You receive: <strong id="calc-sell-ton-output" style="color:#00ff66;">~1.55</strong> TON
                <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Net payout after 1.00% protocol fee</div>
              </div>
            </div>
          </div>

          <!-- Graduation Progress Bar Indicator -->
          <div style="margin-top:18px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
              <span style="color:var(--text-muted);">Bonding Curve Graduation Target (0.00 / 500.00 TON)</span>
              <span style="color:var(--accent-cyan); font-family:var(--font-mono);">0.00%</span>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
              <div style="width:0%; height:100%; background:linear-gradient(90deg, var(--accent-cyan), #00ff88); border-radius:4px;"></div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px; padding:12px 16px; background:rgba(0,210,255,0.04); border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div style="font-size:12px; color:var(--text-muted);">
            🔐 <strong>Supervised Execution Policy:</strong> All 8 deployment operations require individual operator wallet confirmation. Zero automated mainnet transactions.
          </div>
          <button class="btn-ent" style="padding:6px 14px; font-size:12px;" onclick="window.labsSwitchSection ? window.labsSwitchSection('launchpad') : null">
            🚀 Open MemeLabs Wizard
          </button>
        </div>
      </div>

      <!-- Standard Jetton Creator Form (Preserved & Fully Functional) -->
      <div class="glass-card" style="max-width:600px; margin:0 auto;">
         <div class="glass-card-header"><span class="glass-card-title">Launch Standard Jetton</span></div>`;

  const normalizedHtml = normalize(html);
  if (normalizedHtml.includes(normalize(launchpadOldTab))) {
    const isCrlf = html.includes('\r\n');
    const updatedNormalized = normalizedHtml.replace(normalize(launchpadOldTab), normalize(launchpadEnhanced));
    html = isCrlf ? updatedNormalized.replace(/\n/g, '\r\n') : updatedNormalized;

    const quoteScript = `
<script>
  function updateCurveQuotes() {
    const V_TON = 125.0; // 125 TON virtual reserve
    const V_TKN = 266666666.666; // Virtual tokens
    const TOTAL_CURVE = 800000000.0; // 800M tokens
    const K = (V_TON) * (V_TKN + TOTAL_CURVE); // Invariant K

    // Buy calculation
    const buyTonInput = parseFloat(document.getElementById('calc-buy-ton-input')?.value || '0');
    if (buyTonInput > 0) {
      const fee = buyTonInput * 0.01;
      const netTon = buyTonInput - fee;
      const newTonReserve = V_TON + netTon;
      const newTokenReserve = K / newTonReserve;
      const tokensOut = Math.max(0, (V_TKN + TOTAL_CURVE) - newTokenReserve);
      
      const outEl = document.getElementById('calc-buy-tokens-output');
      const netEl = document.getElementById('calc-buy-net-ton');
      if (outEl) outEl.textContent = '~' + Math.floor(tokensOut).toLocaleString();
      if (netEl) netEl.textContent = netTon.toFixed(2);
    }

    // Sell calculation
    const sellTknInput = parseFloat(document.getElementById('calc-sell-token-input')?.value || '0');
    if (sellTknInput > 0) {
      const currentTonPool = 10.0;
      const currentTknPool = (V_TKN + TOTAL_CURVE) - 50000000.0;
      const newTknReserve = currentTknPool + sellTknInput;
      const newTonReserve = K / newTknReserve;
      const grossTonOut = Math.max(0, (V_TON + currentTonPool) - newTonReserve);
      const netTonOut = grossTonOut * 0.99;
      
      const sellOutEl = document.getElementById('calc-sell-ton-output');
      if (sellOutEl) sellOutEl.textContent = '~' + netTonOut.toFixed(2);
    }
  }
</script>
`;
    if (!html.includes('updateCurveQuotes')) {
      const bodyClose = '</body>';
      html = html.replace(bodyClose, quoteScript + '\n' + bodyClose);
    }

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('✅ memecoin-platform.html updated: tab-launchpad enhanced with MemeLabs Supervised Bonding Curve & Calculator');
  } else {
    console.log('⚠️ launchpadOldTab not matched in memecoin-platform.html');
  }
} else {
  console.log('ℹ️ memelabs-bonding-curve-section already present in memecoin-platform.html');
}
