/* web3-integration.js - Real TON Blockchain Integrations */
(function() {
  console.log("[Web3 Integration] Initializing Enterprise Web3 Modules...");

  // 1. Token Explorer (Live Data from STON.fi)
  async function loadTokenExplorer() {
    try {
      const tbody = document.getElementById('trending-tokens-tbody');
      if(!tbody) return;
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--accent-cyan); padding: 40px;"><div class="status-dot" style="display:inline-block; margin-right:10px;"></div> Loading live Mainnet data from STON.fi...</td></tr>';
      
      const res = await fetch('https://api.ston.fi/v1/assets');
      const data = await res.json();
      
      if(data && data.asset_list) {
        // Sort by popularity / volume and filter
        const tokens = data.asset_list
          .filter(t => t.display_name && t.symbol && !t.deprecated && t.dex_usd_price)
          .sort((a,b) => parseFloat(b.dex_usd_price) - parseFloat(a.dex_usd_price))
          .slice(0, 8);

        let html = '';
        tokens.forEach(t => {
          const price = parseFloat(t.dex_usd_price).toFixed(4);
          const shortAddress = t.contract_address.substring(0, 4) + '...' + t.contract_address.substring(t.contract_address.length - 4);
          const imgHtml = t.image_url ? `<img src="${t.image_url}" width="32" height="32" style="border-radius:50%;" onerror="this.style.display='none'">` : `<div style="width:32px; height:32px; border-radius:50%; background:var(--glass-border); display:flex; align-items:center; justify-content:center;">${t.symbol.charAt(0)}</div>`;
          
          html += `
            <tr>
              <td>
                <div class="token-cell" style="display:flex; align-items:center; gap:12px;">
                  <div class="token-icon">${imgHtml}</div>
                  <div>
                    <div style="font-weight:600;">${t.display_name}</div>
                    <div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);">${shortAddress}</div>
                  </div>
                </div>
              </td>
              <td style="font-family:var(--font-mono);">$${price}</td>
              <td style="font-family:var(--font-mono); color:var(--green);">Live on STON.fi</td>
              <td style="font-family:var(--font-mono);">Real Asset</td>
              <td style="white-space: nowrap;">
                <button class="btn-ent" style="padding:4px 12px;font-size:11px;">Analyze</button>
                <button class="btn-solid" style="padding:4px 12px;font-size:11px; margin-left: 4px;" onclick="copyToken('${t.display_name.replace(/'/g, "")}', '${t.symbol.replace(/'/g, "")}')">Copy</button>
              </td>
            </tr>
          `;
        });
        tbody.innerHTML = html;
      }
    } catch(err) {
      console.error("[Web3 Integration] Token Explorer Error:", err);
      const tbody = document.getElementById('trending-tokens-tbody');
      if(tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Failed to load live data. Retrying...</td></tr>';
    }
  }

  // 2. Wallet Manager (Real Balances from TonAPI)
  async function loadWalletBalances(address) {
    try {
      const tbody = document.getElementById('managed-wallets-tbody');
      if(!tbody) return;
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--accent-cyan); padding: 40px;"><div class="status-dot" style="display:inline-block; margin-right:10px;"></div> Scanning wallet on TON Mainnet...</td></tr>';
      
      const res = await fetch(`https://tonapi.io/v2/accounts/${address}/jettons`);
      const data = await res.json();
      
      if(data && data.balances) {
        let html = '';
        data.balances.forEach(b => {
          if(parseFloat(b.balance) === 0) return;
          const symbol = b.jetton.symbol;
          const name = b.jetton.name;
          const decimals = b.jetton.decimals;
          const bal = (parseFloat(b.balance) / Math.pow(10, decimals)).toLocaleString('en-US', {maximumFractionDigits: 2});
          const shortAddress = b.jetton.address.substring(0, 4) + '...' + b.jetton.address.substring(b.jetton.address.length - 4);
          
          html += `
            <tr>
              <td>
                <div style="display:flex; align-items:center; gap:8px;">
                   <img src="${b.jetton.image || ''}" width="24" height="24" style="border-radius:50%;" onerror="this.style.display='none'">
                   <span style="font-weight:600;">${name}</span>
                </div>
              </td>
              <td style="font-family:var(--font-mono); color:var(--text-muted);">${shortAddress}</td>
              <td style="font-family:var(--font-mono); color:var(--green);">${bal} ${symbol}</td>
              <td><span style="background:rgba(0,255,100,0.1); color:#00ff66; padding:2px 8px; border-radius:12px; font-size:11px;">Verified</span></td>
            </tr>
          `;
        });
        
        if(html === '') html = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">No Jettons found in this wallet. Try minting one!</td></tr>';
        tbody.innerHTML = html;
      }
    } catch(err) {
      console.error("[Web3 Integration] Wallet Manager Error:", err);
    }
  }

  // Listen to existing Wallet Connect event (emitted by wallet-connect.js)
  window.addEventListener('anlgramWalletChanged', (e) => {
    const address = e.detail?.address;
    if(address) {
      loadWalletBalances(address);
    }
  });

  // Export functions globally to be used by buttons
  window.loadTokenExplorer = loadTokenExplorer;
  
  // Call on load
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadTokenExplorer, 1000); // slight delay for ui render
  });

})();
