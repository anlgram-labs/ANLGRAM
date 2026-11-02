// Rug Radar for ANLGRAM Wallet Cluster Explorer (Read-Only)
// Mounted via DOM into .catalog-toolbar .toolbar-controls before .sort-select-wrap

(function () {
  'use strict';

  // --- Verified STON.fi Pools Mapping (Mainnet) ---
  const KNOWN_STONFI_POOLS = {
    'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs': 'EQCGScrZe1xbyWqWDvdI6mzP-GAcAWFv6ZXuaJOuSqemxku4', // USDT
    'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT': 'EQCaY8Ifl2S6lRBMBJeY35LIuMXPc8JfItWG4tl7lBGrSoR2', // NOT
    'EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO': 'EQBbsMjyLRj-xJE4eqMbtgABvPq34TF_hwiAGEAUGUb5sNGO', // STON
    'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS': 'EQD7AY9ov7urTou069yON36pH0Okd-bpd1hxYxA5-Sp54Cza', // DOGS
    'EQDNhy-nxYFgUqzfUzImBEP67JqNYm9ZJIgnReAnilNU_n65': 'EQAFtMZmka_ki1em2CeWcYKZiia5IHeHzs2c9ll4cmSAePdX', // tsTON
    'EQBZ_cafPyDr5KUTs0aNxh0ZTDhkpEZONmLJA2SNGlLm4Cko': 'EQBCwe_IObXA4Mt3RbcHil2s4-v4YQS3wUDt1-DvZOceeMGO', // REDO
    'EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE': 'EQAEQcxaAJNsp58SYTBJs9XkxXWZb-rFSoG9esDdCTz62kjm', // DUST
    'EQCuPm01HldiduQ55xaBF_1kaW_WAUy5DHey8suqzU_MAJOR': 'EQCItmol3T2MxI476jbvQa01EDqmBRIZ3xP_FtGdQewuWVUk'  // MAJOR
  };

  // Known Burn Addresses in ANLGRAM Repo
  const KNOWN_BURN_ADDRESSES = new Set([
    '0:0000000000000000000000000000000000000000000000000000000000000000',
    'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ',
    'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'
  ]);

  // STON.fi DEX Routers
  const KNOWN_DEX_ROUTERS = new Set([
    '0:9220c181a6cfeacd11b7b8f62138df1bb9cc82b6ed2661d2f5faee204b3efb20', // STON.fi AMM Router
    '0:92e1411ae546892f33b2c8a89ea90390d8ff4cfbb917a643b91e73f706fdb9d1'  // STON.fi Router v1
  ]);

  // In-memory tab cache (TTL: 60s)
  const radarCache = new Map();
  const CACHE_TTL_MS = 60000;

  // Selected row tracking
  let selectedRowAddr = '';
  let selectedRowTicker = '';

  // DOM Elements
  let radarWrap = null;
  let radarBtn = null;
  let radarDropdown = null;
  let radarInput = null;
  let radarScanBtn = null;
  let radarSelectedHint = null;
  let radarHintText = null;
  let radarUseSelectedBtn = null;
  let radarFeedback = null;
  let radarResult = null;
  let isDropdownOpen = false;

  /**
   * Safe address & string utilities
   */
  function escapeHtml(val) {
    if (window.ANLGRAM_SEC && typeof window.ANLGRAM_SEC.escapeHtml === 'function') {
      return window.ANLGRAM_SEC.escapeHtml(val);
    }
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(url) {
    if (window.ANLGRAM_SEC && typeof window.ANLGRAM_SEC.sanitizeUrl === 'function') {
      const sanitized = window.ANLGRAM_SEC.sanitizeUrl(url, '');
      return (sanitized && sanitized !== '#') ? sanitized : '';
    }
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('https://') || url.startsWith('http://')) return url;
    return '';
  }

  function isValidAddress(addr) {
    if (!addr || typeof addr !== 'string') return false;
    const clean = addr.trim();
    if (window.ANLGRAM_SEC && typeof window.ANLGRAM_SEC.isValidTonAddress === 'function') {
      return window.ANLGRAM_SEC.isValidTonAddress(clean);
    }
    return /^(0:[a-fA-F0-9]{64}|[EQ|UQ|kQ|0Q][a-zA-Z0-9_-]{46,47})$/.test(clean);
  }

  function isTestnetAddress(addr) {
    if (!addr || typeof addr !== 'string') return false;
    const clean = addr.trim();
    return clean.startsWith('kQ') || clean.startsWith('0Q');
  }

  function shortenAddress(addr) {
    if (typeof window.shortenAddress === 'function') {
      return window.shortenAddress(addr, true);
    }
    if (!addr || addr.length < 10) return addr || '';
    return addr.slice(0, 4) + '...' + addr.slice(-4);
  }

  function formatUsdDepth(val) {
    const num = Number(val);
    if (!num || isNaN(num)) return '$0';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toFixed(2);
  }

  function formatTonDepth(nanoVal) {
    const num = Number(nanoVal) / 1e9;
    if (!num || isNaN(num)) return '0 TON';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M TON';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K TON';
    return num.toFixed(2) + ' TON';
  }

  function getTonviewerLink(address) {
    if (!address) return '';
    return sanitizeUrl('https://tonviewer.com/' + encodeURIComponent(address));
  }

  /**
   * Safe fetch with 8s abort timeout
   */
  async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Unified TonAPI caller (proxied or direct)
   */
  async function callTonApi(endpoint) {
    if (typeof window.fetchTonApi === 'function') {
      return await window.fetchTonApi(endpoint);
    }
    const res = await fetchWithTimeout(`https://tonapi.io/v2${endpoint}`);
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  }

  /**
   * UI feedback helpers
   */
  function showError(msg) {
    if (!radarFeedback) return;
    radarFeedback.className = 'rug-radar-error-box';
    radarFeedback.textContent = msg;
    radarFeedback.style.display = 'block';
  }

  function showWarning(msg) {
    if (!radarFeedback) return;
    radarFeedback.className = 'rug-radar-warn-box';
    radarFeedback.textContent = msg;
    radarFeedback.style.display = 'block';
  }

  function clearFeedback() {
    if (!radarFeedback) return;
    radarFeedback.textContent = '';
    radarFeedback.style.display = 'none';
  }

  function updateSelectedHint() {
    if (!radarSelectedHint || !radarHintText) return;
    if (selectedRowAddr) {
      const label = selectedRowTicker ? `${selectedRowTicker} (${shortenAddress(selectedRowAddr)})` : shortenAddress(selectedRowAddr);
      radarHintText.textContent = `Selected: ${label}`;
      radarSelectedHint.style.display = 'flex';
    } else {
      radarSelectedHint.style.display = 'none';
    }
  }

  function toggleRadar(open) {
    isDropdownOpen = (open !== undefined) ? open : !isDropdownOpen;
    if (isDropdownOpen) {
      radarBtn.classList.add('active');
      radarBtn.setAttribute('aria-expanded', 'true');
      radarDropdown.classList.add('open');

      // Sync from #token-search-input if valid
      const tokenSearchInput = document.getElementById('token-search-input');
      if (tokenSearchInput && tokenSearchInput.value) {
        const queryVal = tokenSearchInput.value.trim();
        if (isValidAddress(queryVal)) {
          radarInput.value = queryVal;
        }
      } else if (selectedRowAddr && (!radarInput.value || !radarInput.value.trim())) {
        radarInput.value = selectedRowAddr;
      }

      radarInput.focus();
    } else {
      radarBtn.classList.remove('active');
      radarBtn.setAttribute('aria-expanded', 'false');
      radarDropdown.classList.remove('open');
    }
  }

  /**
   * Core Analysis Engine — 6 Structural Checks
   */
  async function scanMasterContract(targetAddr) {
    const cleanAddr = (targetAddr || '').trim();
    clearFeedback();

    if (!cleanAddr) {
      showError('Please enter a Jetton Master contract address.');
      return;
    }

    if (isTestnetAddress(cleanAddr)) {
      showError('Address network does not match the catalog (mainnet)');
      return;
    }

    if (!isValidAddress(cleanAddr)) {
      showError('Invalid TON address. Please enter a valid master contract (EQ... / UQ...).');
      return;
    }

    // Check memory cache
    const cacheKey = 'mainnet:' + cleanAddr;
    const cached = radarCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      renderRadarResult(cached.data);
      return;
    }

    radarScanBtn.disabled = true;
    radarScanBtn.textContent = 'Scanning...';
    radarResult.innerHTML = `
      <div style="text-align:center; padding: 24px; color: var(--text-secondary);">
        <div style="font-weight: 600; color: var(--color-cyan); margin-bottom: 6px;">Scanning Master Contract On-Chain...</div>
        <div style="font-size: 0.78rem;">Verifying interface, admin rights, mint capability, and AMM pools</div>
      </div>
    `;
    radarResult.style.display = 'block';

    try {
      // Step A: Fetch Jetton master data from TonAPI
      let jettonData = null;
      try {
        jettonData = await callTonApi('/jettons/' + encodeURIComponent(cleanAddr));
      } catch (e) {
        console.warn('[Rug Radar] Jettons endpoint fetch:', e.message);
      }

      // Step B: Fetch Account interface data
      let accountData = null;
      try {
        accountData = await callTonApi('/blockchain/accounts/' + encodeURIComponent(cleanAddr));
      } catch (e) {
        console.warn('[Rug Radar] Blockchain account fetch:', e.message);
      }

      // Step C: Fallback to runGetMethod get_jetton_data if admin or mintable is missing
      if ((!jettonData || jettonData.mintable === undefined || !jettonData.admin) && window.ANLGRAM_PROVIDER && typeof window.ANLGRAM_PROVIDER.runGetMethod === 'function') {
        try {
          const gm = await window.ANLGRAM_PROVIDER.runGetMethod(cleanAddr, 'get_jetton_data', []);
          if (gm && gm.success && gm.result) {
            if (!jettonData) jettonData = {};
            if (gm.result.decoded) {
              if (gm.result.decoded.mintable !== undefined && jettonData.mintable === undefined) {
                jettonData.mintable = gm.result.decoded.mintable;
              }
              if (gm.result.decoded.admin_address && !jettonData.admin) {
                jettonData.admin = { address: gm.result.decoded.admin_address };
              }
            }
          }
        } catch (e) {
          console.warn('[Rug Radar] runGetMethod fallback error:', e.message);
        }
      }

      // Step D: Fetch Holders (limit 50)
      let holdersData = { addresses: [], total: 0 };
      if (typeof window.getJettonHolders === 'function') {
        try {
          holdersData = await window.getJettonHolders(cleanAddr, 50);
        } catch (e) {
          console.warn('[Rug Radar] getJettonHolders fetch:', e.message);
        }
      } else {
        try {
          holdersData = await callTonApi('/jettons/' + encodeURIComponent(cleanAddr) + '/holders?limit=50');
        } catch (e) {
          console.warn('[Rug Radar] holders fetch fallback:', e.message);
        }
      }

      // Step E: Resolve Liquidity Pool on STON.fi
      let poolAddr = KNOWN_STONFI_POOLS[cleanAddr] || null;
      let stonfiAsset = null;
      let stonfiPool = null;

      if (!poolAddr && typeof window.fetchStonfiAsset === 'function') {
        try {
          stonfiAsset = await window.fetchStonfiAsset(cleanAddr);
          if (stonfiAsset && stonfiAsset.pool_address) {
            poolAddr = stonfiAsset.pool_address;
          }
        } catch (e) {
          console.warn('[Rug Radar] fetchStonfiAsset error:', e.message);
        }
      }

      if (poolAddr) {
        if (typeof window.fetchStonfiPool === 'function') {
          try {
            stonfiPool = await window.fetchStonfiPool(poolAddr);
          } catch (e) {
            console.warn('[Rug Radar] fetchStonfiPool error:', e.message);
          }
        } else {
          try {
            const poolRes = await fetchWithTimeout(`https://api.ston.fi/v1/pools/${encodeURIComponent(poolAddr)}`);
            if (poolRes.ok) {
              const pj = await poolRes.json();
              stonfiPool = pj.pool || pj;
            }
          } catch (e) {
            console.warn('[Rug Radar] STON.fi pool direct fetch error:', e.message);
          }
        }
      }

      // Query LP token holders if pool is resolved
      let lpHolders = [];
      if (stonfiPool && poolAddr) {
        try {
          const lpHoldersRes = await callTonApi('/jettons/' + encodeURIComponent(poolAddr) + '/holders?limit=5');
          if (lpHoldersRes && Array.isArray(lpHoldersRes.addresses)) {
            lpHolders = lpHoldersRes.addresses;
          }
        } catch (e) {
          console.warn('[Rug Radar] LP holders check error:', e.message);
        }
      }

      // Step F: Deployer / Admin events (limit 20)
      const adminAddr = (jettonData && jettonData.admin && jettonData.admin.address) ? jettonData.admin.address : '';
      let adminEvents = [];
      if (adminAddr && adminAddr !== '0:0000000000000000000000000000000000000000000000000000000000000000') {
        try {
          const eventsRes = await callTonApi('/accounts/' + encodeURIComponent(adminAddr) + '/events?limit=20');
          if (eventsRes && Array.isArray(eventsRes.events)) {
            adminEvents = eventsRes.events;
          }
        } catch (e) {
          console.warn('[Rug Radar] Admin events fetch error:', e.message);
        }
      }

      // --- EVALUATE THE 6 CHECKS ---
      const analysis = evaluateStructuralChecks({
        cleanAddr,
        jettonData,
        accountData,
        holdersData,
        stonfiPool,
        poolAddr,
        lpHolders,
        adminAddr,
        adminEvents
      });

      // Cache result
      radarCache.set(cacheKey, { timestamp: Date.now(), data: analysis });
      renderRadarResult(analysis);

    } catch (err) {
      console.error('[Rug Radar] Scan execution failed:', err);
      if (err.status === 429 || err.name === 'AbortError' || err.message.includes('timeout')) {
        showWarning('Provider limit. Retry.');
      } else {
        showError('Unable to scan contract. Contract may be unindexed or network timed out.');
      }
      radarResult.style.display = 'none';
    } finally {
      radarScanBtn.disabled = false;
      radarScanBtn.textContent = 'Scan';
    }
  }

  /**
   * Rule Evaluation Engine
   */
  function evaluateStructuralChecks(data) {
    const {
      cleanAddr,
      jettonData,
      accountData,
      holdersData,
      stonfiPool,
      poolAddr,
      lpHolders,
      adminAddr,
      adminEvents
    } = data;

    const metadata = (jettonData && jettonData.metadata) || {};
    const ticker = metadata.symbol || (jettonData && jettonData.name) || 'TOKEN';
    const interfaces = (accountData && Array.isArray(accountData.interfaces))
      ? accountData.interfaces
      : (jettonData && Array.isArray(jettonData.interfaces) ? jettonData.interfaces : []);

    let isCodeVeto = false;
    let isCodeUnverified = false;
    let isMintOpen = false;
    let isMintUnverified = false;
    let isAdminUnverified = false;
    let isLpUnlocked = false;
    let hasLockProof = false;

    // 1. Code Check (Veto)
    let rowCode = { name: 'Code', value: 'Unverified', status: 'unverified', weight: 0, points: 0, link: getTonviewerLink(cleanAddr) };
    if (interfaces.includes('jetton_master')) {
      rowCode.value = 'Jetton interface';
      rowCode.status = 'neutral';
    } else if (accountData && accountData.status) {
      rowCode.value = 'Not standard jetton';
      rowCode.status = 'red';
      isCodeVeto = true;
    } else {
      rowCode.value = 'Unreadable';
      rowCode.status = 'unverified';
      isCodeUnverified = true;
    }

    // 2. Admin Check (Weight: 20)
    let rowAdmin = { name: 'Admin', value: 'Unverified', status: 'unverified', weight: 20, points: 0, link: '' };
    if (!adminAddr || adminAddr === '0:0000000000000000000000000000000000000000000000000000000000000000' || adminAddr === 'addr_none') {
      rowAdmin.value = 'Renounced';
      rowAdmin.status = 'green';
      rowAdmin.points = 20;
    } else if (jettonData && jettonData.admin) {
      rowAdmin.link = getTonviewerLink(adminAddr);
      if (jettonData.admin.is_wallet === true) {
        rowAdmin.value = `Admin live (${shortenAddress(adminAddr)})`;
        rowAdmin.status = 'red';
        rowAdmin.points = 0;
      } else if (jettonData.admin.is_wallet === false) {
        rowAdmin.value = 'Contract admin';
        rowAdmin.status = 'amber';
        rowAdmin.points = 10;
      } else {
        rowAdmin.value = `Admin (${shortenAddress(adminAddr)})`;
        rowAdmin.status = 'red';
        rowAdmin.points = 0;
      }
    } else {
      rowAdmin.status = 'unverified';
      isAdminUnverified = true;
    }

    // 3. Mint Check (Weight: 15)
    let rowMint = { name: 'Mint', value: 'Unverified', status: 'unverified', weight: 15, points: 0, link: getTonviewerLink(cleanAddr) };
    if (jettonData && jettonData.mintable !== undefined) {
      if (jettonData.mintable === false) {
        rowMint.value = 'Mint closed';
        rowMint.status = 'green';
        rowMint.points = 15;
      } else {
        rowMint.value = 'Mint open';
        rowMint.status = 'red';
        rowMint.points = 0;
        isMintOpen = true;
      }
    } else {
      rowMint.status = 'unverified';
      isMintUnverified = true;
    }

    // 4. Liquidity Check (Weight: 25)
    let rowLiquidity = { name: 'Liquidity', value: 'Unverified', status: 'unverified', weight: 25, points: 0, link: '' };
    let depthUsdStr = null;
    let depthTonStr = null;

    if (stonfiPool) {
      rowLiquidity.link = getTonviewerLink(poolAddr);
      if (stonfiPool.lp_total_supply_usd) {
        depthUsdStr = formatUsdDepth(stonfiPool.lp_total_supply_usd);
      }
      if (stonfiPool.reserve1) {
        depthTonStr = formatTonDepth(stonfiPool.reserve1);
      }

      if (lpHolders && lpHolders.length > 0) {
        const topHolder = lpHolders[0];
        const topOwnerAddr = (topHolder.owner && topHolder.owner.address) ? topHolder.owner.address : (topHolder.address || '');

        if (KNOWN_BURN_ADDRESSES.has(topOwnerAddr) || topOwnerAddr === '0:0000000000000000000000000000000000000000000000000000000000000000') {
          rowLiquidity.value = 'Burned';
          rowLiquidity.status = 'green';
          rowLiquidity.points = 25;
          hasLockProof = true;
        } else if (adminAddr && topOwnerAddr === adminAddr) {
          rowLiquidity.value = 'Unlocked';
          rowLiquidity.status = 'red';
          rowLiquidity.points = 0;
          isLpUnlocked = true;
        } else {
          // LP outside admin wallet, but locker not in allowlist
          rowLiquidity.value = 'Holder not in lock allowlist';
          rowLiquidity.status = 'amber';
          rowLiquidity.points = 12.5;
        }
      } else {
        rowLiquidity.value = 'Pool found (LP unverified)';
        rowLiquidity.status = 'amber';
        rowLiquidity.points = 10;
      }
    } else {
      rowLiquidity.value = 'Unverified (DeDust not queried)';
      rowLiquidity.status = 'unverified';
      rowLiquidity.points = 0;
    }

    // 5. Distribution Check (Weight: 20)
    let rowDistribution = { name: 'Distribution', value: 'Unverified', status: 'unverified', weight: 20, points: 0, link: getTonviewerLink(cleanAddr) };
    const totalHoldersCount = (jettonData && jettonData.holders_count != null) ? Number(jettonData.holders_count) : (holdersData.total || 0);
    const sampleList = (holdersData && Array.isArray(holdersData.addresses)) ? holdersData.addresses : [];

    if (totalHoldersCount > 0 && sampleList.length > 0) {
      if (totalHoldersCount > (2 * sampleList.length)) {
        // Sample is less than half the total set: unverified
        rowDistribution.value = `Sample < total (${totalHoldersCount.toLocaleString()} holders)`;
        rowDistribution.status = 'unverified';
        rowDistribution.points = 0;
      } else {
        // Calculate percentages excluding pool and known burns
        let validHolders = sampleList.filter(h => {
          const ownerAddr = (h.owner && h.owner.address) ? h.owner.address : (h.address || '');
          return ownerAddr !== poolAddr && !KNOWN_BURN_ADDRESSES.has(ownerAddr);
        });

        const totalCircBalance = validHolders.reduce((acc, h) => acc + (Number(h.balance) || 0), 0);
        if (totalCircBalance > 0) {
          const top1Pct = ((Number(validHolders[0]?.balance) || 0) / totalCircBalance) * 100;
          const top10Bal = validHolders.slice(0, 10).reduce((acc, h) => acc + (Number(h.balance) || 0), 0);
          const top10Pct = (top10Bal / totalCircBalance) * 100;

          if (top10Pct < 20 && top1Pct < 10) {
            rowDistribution.value = `Top10: ${top10Pct.toFixed(1)}% · Top1: ${top1Pct.toFixed(1)}%`;
            rowDistribution.status = 'green';
            rowDistribution.points = 20;
          } else if (top10Pct <= 40 && top1Pct <= 10) {
            rowDistribution.value = `Top10: ${top10Pct.toFixed(1)}% · Top1: ${top1Pct.toFixed(1)}%`;
            rowDistribution.status = 'amber';
            rowDistribution.points = 10;
          } else {
            rowDistribution.value = `Top10: ${top10Pct.toFixed(1)}% · Top1: ${top1Pct.toFixed(1)}%`;
            rowDistribution.status = 'red';
            rowDistribution.points = 0;
          }
        } else {
          rowDistribution.value = 'Circulating supply unverified';
          rowDistribution.status = 'unverified';
        }
      }
    } else {
      rowDistribution.value = 'Holders snapshot unverified';
      rowDistribution.status = 'unverified';
    }

    // 6. Behavior Check (Weight: 20)
    let rowBehavior = { name: 'Behavior', value: 'Unverified', status: 'unverified', weight: 20, points: 0, link: '' };
    if (!adminAddr || adminAddr === '0:0000000000000000000000000000000000000000000000000000000000000000') {
      rowBehavior.value = 'Deployer unknown (renounced)';
      rowBehavior.status = 'unverified';
    } else if (adminEvents && adminEvents.length > 0) {
      rowBehavior.link = getTonviewerLink(adminAddr);
      let deployerSold = false;
      let soldAmount = 0;

      for (const ev of adminEvents) {
        if (ev && Array.isArray(ev.actions)) {
          for (const act of ev.actions) {
            if (act.type === 'JettonTransfer' && act.JettonTransfer) {
              const jt = act.JettonTransfer;
              const recipient = (jt.recipient && jt.recipient.address) ? jt.recipient.address : '';
              if (KNOWN_DEX_ROUTERS.has(recipient) || recipient === poolAddr) {
                deployerSold = true;
                soldAmount += Number(jt.amount) || 0;
              }
            }
          }
        }
      }

      if (deployerSold) {
        rowBehavior.value = 'Deployer sold jettons to DEX';
        rowBehavior.status = 'red';
        rowBehavior.points = 0;
      } else {
        rowBehavior.value = 'No deployer sale in the last 20 events';
        rowBehavior.status = 'green';
        rowBehavior.points = 20;
      }
    } else {
      rowBehavior.value = 'Recent events unverified';
      rowBehavior.status = 'unverified';
    }

    // --- SCORE COMPUTATION & CEILINGS ---
    const evaluatedRows = [rowAdmin, rowMint, rowLiquidity, rowDistribution, rowBehavior].filter(
      r => r.status === 'green' || r.status === 'amber' || r.status === 'red'
    );

    let earnedPoints = 0;
    let totalWeight = 0;
    evaluatedRows.forEach(r => {
      totalWeight += r.weight;
      earnedPoints += r.points;
    });

    let finalScore = null;
    let band = 'unverified';

    if (totalWeight > 0) {
      finalScore = Math.round((earnedPoints / totalWeight) * 100);

      // Ceilings in exact order
      if (isCodeVeto) {
        finalScore = Math.min(finalScore, 49);
        band = 'red';
      } else if (isMintOpen) {
        finalScore = Math.min(finalScore, 30);
        band = 'red';
      } else {
        if (isLpUnlocked) {
          if (finalScore >= 80) finalScore = 79;
        }
        if (isCodeUnverified || isAdminUnverified || isMintUnverified) {
          if (finalScore >= 80) finalScore = 79;
        }
        if (!hasLockProof) {
          if (finalScore >= 80) finalScore = 79;
        }

        if (finalScore >= 80) {
          band = 'green';
        } else if (finalScore >= 50) {
          band = 'amber';
        } else {
          band = 'red';
        }
      }
    }

    return {
      ticker,
      address: cleanAddr,
      score: finalScore,
      band,
      depthUsd: depthUsdStr,
      depthTon: depthTonStr,
      rows: [rowCode, rowAdmin, rowMint, rowLiquidity, rowDistribution, rowBehavior]
    };
  }

  /**
   * Render Result Panel
   */
  function renderRadarResult(result) {
    if (!radarResult) return;

    const { ticker, address, score, band, depthUsd, depthTon, rows } = result;
    const tonviewerUrl = getTonviewerLink(address);

    // Score ring calculation (r = 21, circumference = 131.95)
    const radius = 21;
    const circumference = 2 * Math.PI * radius;
    const scoreVal = (score !== null) ? score : 0;
    const strokeDashoffset = circumference - (circumference * scoreVal / 100);

    let ringStrokeColor = '#94a3b8';
    if (band === 'green') ringStrokeColor = 'var(--color-cyan, #00f0ff)';
    else if (band === 'amber') ringStrokeColor = '#e0a100';
    else if (band === 'red') ringStrokeColor = 'var(--color-red, #ef4444)';

    const bandLabels = {
      green: 'Green',
      amber: 'Amber',
      red: 'Red',
      unverified: 'Unverified'
    };

    let html = `
      <div class="rug-radar-token-summary">
        <div class="rug-radar-token-meta">
          <span class="rug-radar-token-ticker">${escapeHtml(ticker)}</span>
          <span class="rug-radar-token-addr">${escapeHtml(shortenAddress(address))}</span>
          ${tonviewerUrl ? `<a href="${tonviewerUrl}" target="_blank" rel="noopener noreferrer" class="rug-radar-token-link">View on Tonviewer &rarr;</a>` : ''}
        </div>
        <div class="rug-radar-score-container">
          <div class="rug-radar-score-ring">
            <svg width="48" height="48" class="rug-radar-score-circle">
              <circle cx="24" cy="24" r="${radius}" stroke="rgba(255,255,255,0.1)" stroke-width="3.5" fill="none"/>
              <circle cx="24" cy="24" r="${radius}" stroke="${ringStrokeColor}" stroke-width="3.5" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" fill="none"/>
            </svg>
            <div class="rug-radar-score-text">${score !== null ? score : '—'}</div>
          </div>
          <span class="rug-radar-band-pill ${band}">${bandLabels[band] || 'Unverified'}</span>
        </div>
      </div>
    `;

    // Depth highlight
    if (depthUsd || depthTon) {
      html += `
        <div class="rug-radar-depth-box">
          <div class="rug-radar-depth-label">Pool Depth</div>
          <div class="rug-radar-depth-val">${depthUsd ? escapeHtml(depthUsd) : ''} ${depthTon ? `<span style="font-size:0.85rem; color:var(--text-secondary); font-weight:normal;">(${escapeHtml(depthTon)})</span>` : ''}</div>
        </div>
      `;
    }

    // 6 Rows
    html += '<div class="rug-radar-rows">';
    rows.forEach(r => {
      const linkHtml = r.link ? `<a href="${r.link}" target="_blank" rel="noopener noreferrer" class="rug-radar-row-link" title="Open in Tonviewer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : '';
      html += `
        <div class="rug-radar-row">
          <div class="rug-radar-row-left">
            <span class="rug-radar-row-name">${escapeHtml(r.name)}</span>
            <span class="rug-radar-row-value">${escapeHtml(r.value)}</span>
          </div>
          <div class="rug-radar-row-right">
            <span class="rug-radar-status-badge ${r.status}">${escapeHtml(r.status)}</span>
            ${linkHtml}
          </div>
        </div>
      `;
    });
    html += '</div>';

    radarResult.innerHTML = html;
    radarResult.style.display = 'block';
  }

  /**
   * DOM Insertion & Event Wire-Up
   */
  function initRugRadar() {
    try {
      const catalogToolbar = document.querySelector('.catalog-toolbar');
      const toolbarControls = document.querySelector('.toolbar-controls');
      const sortWrap = toolbarControls ? toolbarControls.querySelector('.sort-select-wrap') : null;

      if (!catalogToolbar || !toolbarControls || !sortWrap) {
        console.warn('[Rug Radar] .catalog-toolbar or .toolbar-controls not found.');
        return;
      }

      // Avoid duplicate initialization
      if (document.getElementById('rug-radar-container')) {
        return;
      }

      // Create container wrap
      radarWrap = document.createElement('div');
      radarWrap.className = 'rug-radar-wrap';
      radarWrap.id = 'rug-radar-container';

      // Insert as first child of toolbar-controls, right before sort-select-wrap
      toolbarControls.insertBefore(radarWrap, sortWrap);

      // Create Trigger Button
      radarBtn = document.createElement('button');
      radarBtn.className = 'rug-radar-btn';
      radarBtn.id = 'rug-radar-btn';
      radarBtn.type = 'button';
      radarBtn.setAttribute('aria-expanded', 'false');
      radarBtn.setAttribute('title', 'Rug Radar - Structural On-Chain Safety Check');
      radarBtn.innerHTML = `
        <span>Rug Radar</span>
        <svg class="rug-radar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
      `;
      radarWrap.appendChild(radarBtn);

      // Create Dropdown Panel
      radarDropdown = document.createElement('div');
      radarDropdown.className = 'rug-radar-dropdown';
      radarDropdown.id = 'rug-radar-dropdown';
      radarDropdown.innerHTML = `
        <div class="rug-radar-header">
          <div class="rug-radar-title-group">
            <h3>Rug Radar</h3>
            <div class="rug-radar-subtitle">Structural check. Not a price signal.</div>
          </div>
          <span class="rug-radar-badge-live">ON-CHAIN</span>
        </div>

        <div class="rug-radar-input-row">
          <input type="text" id="rug-radar-address" class="rug-radar-input" placeholder="EQ… / UQ… master" spellcheck="false" autocomplete="off" />
          <button type="button" id="rug-radar-scan-btn" class="rug-radar-scan-btn">Scan</button>
        </div>

        <div id="rug-radar-selected-hint" class="rug-radar-selected-hint" style="display:none;">
          <span id="rug-radar-hint-text">Focused row available</span>
          <button type="button" id="rug-radar-use-selected" class="rug-radar-use-selected-btn">Use selected token</button>
        </div>

        <div id="rug-radar-feedback" style="display:none;"></div>

        <div id="rug-radar-result" style="display:none;"></div>

        <div class="rug-radar-footer">
          Chequeo estructural. No es una señal de precio. LP bloqueado no significa que haya liquidez. La concentración es un snapshot de TonAPI, no el supply completo.
        </div>
      `;
      radarWrap.appendChild(radarDropdown);

      // Cache DOM references
      radarInput = document.getElementById('rug-radar-address');
      radarScanBtn = document.getElementById('rug-radar-scan-btn');
      radarSelectedHint = document.getElementById('rug-radar-selected-hint');
      radarHintText = document.getElementById('rug-radar-hint-text');
      radarUseSelectedBtn = document.getElementById('rug-radar-use-selected');
      radarFeedback = document.getElementById('rug-radar-feedback');
      radarResult = document.getElementById('rug-radar-result');

      // Toggle button event
      if (radarBtn) {
        radarBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleRadar();
        });
      }

      // Scan button event
      if (radarScanBtn) {
        radarScanBtn.addEventListener('click', () => {
          if (radarInput) {
            scanMasterContract(radarInput.value);
          }
        });
      }

      // Enter key in input
      if (radarInput) {
        radarInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            scanMasterContract(radarInput.value);
          }
        });
      }

      // Use Selected Token button
      if (radarUseSelectedBtn) {
        radarUseSelectedBtn.addEventListener('click', () => {
          if (selectedRowAddr) {
            if (radarInput) radarInput.value = selectedRowAddr;
            scanMasterContract(selectedRowAddr);
          }
        });
      }

      // Click outside and Escape (Without stopImmediatePropagation to let explorer listeners run!)
      document.addEventListener('click', (e) => {
        if (isDropdownOpen && radarWrap && !radarWrap.contains(e.target)) {
          toggleRadar(false);
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDropdownOpen) {
          toggleRadar(false);
        }
      });

      // Bubble phase listener for table interactions (.btn-token-intel or .row-addr-snippet)
      document.addEventListener('click', (e) => {
        const intelBtn = e.target.closest('.btn-token-intel');
        const addrSnippet = e.target.closest('.row-addr-snippet');
        let foundAddr = '';

        if (intelBtn) {
          foundAddr = intelBtn.getAttribute('data-contract') || '';
        } else if (addrSnippet) {
          foundAddr = addrSnippet.getAttribute('data-addr') || '';
        }

        if (foundAddr) {
          selectedRowAddr = foundAddr.trim();
          const row = e.target.closest('.table-row');
          if (row) {
            const tickerEl = row.querySelector('.row-ticker');
            selectedRowTicker = tickerEl ? tickerEl.textContent.trim() : '';
          }
          updateSelectedHint();
          if (radarInput && (!radarInput.value || !radarInput.value.trim())) {
            radarInput.value = selectedRowAddr;
          }
        }
      });

    } catch (err) {
      console.error('[Rug Radar] Boot failed safely:', err);
    }
  }

  // Expose for safe diagnostics and integration
  window.ANLGRAM_RUG_RADAR = {
    evaluateStructuralChecks,
    scanMasterContract
  };

  // Safe app initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRugRadar);
  } else {
    initRugRadar();
  }

})();
