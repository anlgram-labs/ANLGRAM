/**
 * ANLGRAM Professional Flow Visualizer Engine
 * On-chain transaction flow topology & investigation inspired by Arkham Intelligence.
 * Built for The Open Network (TON).
 * Strictly complies with ANLGRAM Real-Data Policy: zero mock balances, zero fabricated transactions.
 */
(function() {
  'use strict';

  // Environment Root (Isomorphic for Browser and Node test suites)
  const root = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : globalThis);

  // --- Constants & Config ---
  const DEFAULT_MAX_CONNECTIONS = 30;
  const DEFAULT_DATE_RANGE = '30d';

  // State
  const state = {
    currentAddress: null,
    accountInfo: null,
    jettons: [],
    events: [],
    allTransfers: [],
    filteredTransfers: [],
    graphNodes: [],
    graphLinks: [],
    selectedNode: null,
    selectedLink: null,
    filters: {
      dateRange: DEFAULT_DATE_RANGE,
      inflow: true,
      outflow: true,
      asset: 'all',
      minAmount: 0,
      maxConnections: DEFAULT_MAX_CONNECTIONS,
      brushRange: null // [minTimestamp, maxTimestamp]
    },
    depth: 1,
    isLoading: false,
    tonPriceUsd: 0,
    d3Simulation: null,
    d3Zoom: null,
    d3Svg: null,
    d3Container: null
  };

  // --- Utility Functions ---
  function safeTrim(str) {
    return (str || '').toString().trim();
  }

  function formatNumber(num, maxDecimals = 2) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    const n = Number(num);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
  }

  function formatCryptoAmount(amount, maxDecimals = 4) {
    if (amount === null || amount === undefined || isNaN(amount)) return '0';
    const n = Number(amount);
    if (n === 0) return '0';
    if (Math.abs(n) < 0.0001) return '< 0.0001';
    return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '--';
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestamp);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function formatDateIso(timestamp) {
    if (!timestamp) return '--';
    const d = new Date(timestamp * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }

  function shortenAddr(addr, head = 4, tail = 4) {
    if (!addr) return '';
    const s = safeTrim(addr);
    if (s.length <= head + tail + 2) return s;
    return `${s.slice(0, head)}...${s.slice(-tail)}`;
  }

  // --- Entity Resolution ---
  function resolveEntityInfo(address) {
    if (!address) return { name: 'Unknown Wallet', category: 'unknown', isVerified: false };
    
    // Check global registry
    const registry = root.VERIFIED_TON_REGISTRY || [];
    const clean = safeTrim(address).toLowerCase();
    
    const matched = registry.find(item => {
      const matchFriendly = item.address && item.address.toLowerCase() === clean;
      const matchRaw = item.raw && item.raw.toLowerCase() === clean;
      const matchAlias = item.aliases && item.aliases.some(a => a.toLowerCase() === clean);
      return matchFriendly || matchRaw || matchAlias;
    });

    if (matched) {
      return {
        name: matched.name,
        category: matched.category || 'verified',
        isVerified: true,
        logo: matched.logo || null,
        description: matched.description || null
      };
    }

    // Default unknown
    return {
      name: 'Unknown Wallet',
      category: 'unknown',
      isVerified: false,
      logo: null,
      description: null
    };
  }

  function getCategoryColor(category) {
    switch ((category || '').toLowerCase()) {
      case 'center':
        return '#00CFFF'; // Signature ANLGRAM Cyan
      case 'exchange':
      case 'cex':
        return '#8B5CF6'; // Purple
      case 'dex':
      case 'amm':
        return '#10B981'; // Emerald
      case 'bridge':
        return '#F59E0B'; // Amber
      case 'whale':
        return '#EC4899'; // Pink
      case 'verified':
      case 'official':
        return '#38BDF8'; // Light Blue
      default:
        return '#64748B'; // Slate
    }
  }

  // --- Data Fetching & Normalization ---
  async function fetchWalletFlowData(targetQuery) {
    const clean = safeTrim(targetQuery);
    if (!clean) return;

    state.isLoading = true;
    updateLoadingUi(true, 'Consultando TonAPI v2 Gateway...');

    try {
      // 1. Resolve Account Info & Validation
      let account = null;
      if (typeof root.getAccountInfo === 'function') {
        account = await root.getAccountInfo(clean);
      } else {
        const res = await fetch(`/api/ton/accounts/${encodeURIComponent(clean)}`);
        if (res.ok) account = await res.json();
      }

      if (!account || (!account.address && !account.raw_address)) {
        showEmptyState('Billetera No Encontrada', 'No se pudo verificar la dirección en la red TON.');
        state.isLoading = false;
        updateLoadingUi(false);
        return;
      }

      state.currentAddress = account.address || clean;
      state.accountInfo = account;

      // Update URL without full reload
      if (typeof window !== 'undefined' && window.history && window.history.pushState) {
        const url = new URL(window.location.href);
        url.searchParams.set('address', state.currentAddress);
        window.history.pushState(null, '', url.toString());
      }

      // Update header search inputs
      const flowInput = document.getElementById('flow-wallet-input');
      if (flowInput) flowInput.value = state.currentAddress;
      const globalInput = document.getElementById('token-search-input');
      if (globalInput) globalInput.value = state.currentAddress;

      // 2. Fetch Ton Price
      if (typeof root.getTonPrice === 'function') {
        state.tonPriceUsd = await root.getTonPrice();
      }

      // 3. Fetch Jettons Holdings
      if (typeof root.getAccountJettons === 'function') {
        const jetData = await root.getAccountJettons(state.currentAddress);
        state.jettons = Array.isArray(jetData) ? jetData : (jetData?.balances || []);
      } else {
        const jetRes = await fetch(`/api/ton/accounts/${encodeURIComponent(state.currentAddress)}/jettons`);
        if (jetRes.ok) {
          const jetData = await jetRes.json();
          state.jettons = Array.isArray(jetData) ? jetData : (jetData?.balances || []);
        }
      }

      // 4. Fetch Account Events (Transactions & Transfers)
      updateLoadingUi(true, 'Indexando eventos on-chain observados...');
      let eventsData = null;
      if (typeof root.getAccountEvents === 'function') {
        eventsData = await root.getAccountEvents(state.currentAddress, 50);
      } else {
        const evRes = await fetch(`/api/ton/accounts/${encodeURIComponent(state.currentAddress)}/events?limit=50`);
        if (evRes.ok) eventsData = await evRes.json();
      }

      const eventsList = (eventsData && Array.isArray(eventsData.events)) ? eventsData.events : [];
      state.events = eventsList;

      // 5. Parse All Real Transfer Events
      state.allTransfers = parseTransfersFromEvents(eventsList, state.currentAddress);

      // Populate Asset Filter Options
      populateAssetFilterOptions();

      // Apply Filters and Build Graph
      applyFiltersAndRebuildGraph();

    } catch (err) {
      console.error('[FlowVisualizer] Fetch error:', err);
      showEmptyState('Error de Red o Indexador', 'No se pudieron consultar los eventos on-chain: ' + (err.message || 'Error'));
    } finally {
      state.isLoading = false;
      updateLoadingUi(false);
    }
  }

  // Parses raw TonAPI events into clean transfer records
  function parseTransfersFromEvents(events, currentAddr) {
    const transfers = [];
    const rawCurrent = (root.friendlyToRaw && currentAddr) ? root.friendlyToRaw(currentAddr).toLowerCase() : '';
    const friendlyCurrent = (root.rawToFriendly && currentAddr) ? root.rawToFriendly(currentAddr) : currentAddr;

    events.forEach(evt => {
      const timestamp = evt.timestamp || Math.floor(Date.now() / 1000);
      const eventId = evt.event_id || '';
      const fee = evt.extra ? Math.abs(evt.extra) / 1e9 : 0;

      if (!Array.isArray(evt.actions)) return;

      evt.actions.forEach(act => {
        const status = act.status || 'ok';

        // 1. TON Transfer Action
        if (act.type === 'TonTransfer' && act.TonTransfer) {
          const tt = act.TonTransfer;
          const senderRaw = tt.sender?.address || '';
          const senderFriendly = (root.rawToFriendly && senderRaw) ? root.rawToFriendly(senderRaw) : senderRaw;
          const recipientRaw = tt.recipient?.address || '';
          const recipientFriendly = (root.rawToFriendly && recipientRaw) ? root.rawToFriendly(recipientRaw) : recipientRaw;
          const amount = tt.amount ? Number(tt.amount) / 1e9 : 0;
          const comment = tt.comment || '';

          const isIncoming = (recipientRaw.toLowerCase() === rawCurrent) || (recipientFriendly === friendlyCurrent);
          const isOutgoing = (senderRaw.toLowerCase() === rawCurrent) || (senderFriendly === friendlyCurrent);

          if (isIncoming || isOutgoing) {
            transfers.push({
              id: `${eventId}_ton_${transfers.length}`,
              txHash: (act.base_transactions && act.base_transactions[0]) || eventId,
              timestamp,
              from: senderFriendly,
              fromRaw: senderRaw,
              to: recipientFriendly,
              toRaw: recipientRaw,
              counterparty: isIncoming ? senderFriendly : recipientFriendly,
              isIncoming,
              isOutgoing,
              asset: 'TON',
              assetAddress: 'TON',
              amount,
              rawAmount: tt.amount,
              decimals: 9,
              fee,
              status,
              comment
            });
          }
        }

        // 2. Jetton Transfer Action
        if (act.type === 'JettonTransfer' && act.JettonTransfer) {
          const jt = act.JettonTransfer;
          const senderRaw = jt.sender?.address || '';
          const senderFriendly = (root.rawToFriendly && senderRaw) ? root.rawToFriendly(senderRaw) : senderRaw;
          const recipientRaw = jt.recipient?.address || '';
          const recipientFriendly = (root.rawToFriendly && recipientRaw) ? root.rawToFriendly(recipientRaw) : recipientRaw;
          const decimals = jt.jetton?.decimals !== undefined ? jt.jetton.decimals : 9;
          const rawAmount = jt.amount || '0';
          const amount = Number(rawAmount) / Math.pow(10, decimals);
          const symbol = jt.jetton?.symbol || 'JETTON';
          const jettonAddress = jt.jetton?.address || '';

          const isIncoming = (recipientRaw.toLowerCase() === rawCurrent) || (recipientFriendly === friendlyCurrent);
          const isOutgoing = (senderRaw.toLowerCase() === rawCurrent) || (senderFriendly === friendlyCurrent);

          if (isIncoming || isOutgoing) {
            transfers.push({
              id: `${eventId}_jet_${transfers.length}`,
              txHash: (act.base_transactions && act.base_transactions[0]) || eventId,
              timestamp,
              from: senderFriendly,
              fromRaw: senderRaw,
              to: recipientFriendly,
              toRaw: recipientRaw,
              counterparty: isIncoming ? senderFriendly : recipientFriendly,
              isIncoming,
              isOutgoing,
              asset: symbol,
              assetAddress: jettonAddress,
              amount,
              rawAmount,
              decimals,
              fee,
              status,
              comment: jt.comment || ''
            });
          }
        }

        // 3. Jetton Swap Action (DEX Trade)
        if (act.type === 'JettonSwap' && act.JettonSwap) {
          const js = act.JettonSwap;
          const routerRaw = js.router?.address || '';
          const routerFriendly = (root.rawToFriendly && routerRaw) ? root.rawToFriendly(routerRaw) : routerRaw;
          const userRaw = js.user?.address || '';
          const userFriendly = (root.rawToFriendly && userRaw) ? root.rawToFriendly(userRaw) : userRaw;

          const isOurUser = (userRaw.toLowerCase() === rawCurrent) || (userFriendly === friendlyCurrent);
          if (isOurUser && routerFriendly) {
            const tonAmount = js.ton_in ? Number(js.ton_in) / 1e9 : (js.ton_out ? Number(js.ton_out) / 1e9 : 0);
            const isBuy = !!js.ton_in;

            transfers.push({
              id: `${eventId}_swap_${transfers.length}`,
              txHash: (act.base_transactions && act.base_transactions[0]) || eventId,
              timestamp,
              from: isBuy ? userFriendly : routerFriendly,
              fromRaw: isBuy ? userRaw : routerRaw,
              to: isBuy ? routerFriendly : userFriendly,
              toRaw: isBuy ? routerRaw : userRaw,
              counterparty: routerFriendly,
              isIncoming: !isBuy,
              isOutgoing: isBuy,
              asset: js.ton_in ? 'TON' : (js.jetton_master_out?.symbol || 'TON'),
              assetAddress: 'DEX_SWAP',
              amount: tonAmount,
              rawAmount: js.ton_in || js.ton_out || '0',
              decimals: 9,
              fee,
              status,
              comment: `DEX Swap on ${js.dex || 'AMM'}`
            });
          }
        }
      });
    });

    return transfers;
  }

  // --- Dynamic Asset Dropdown ---
  function populateAssetFilterOptions() {
    const select = document.getElementById('flow-asset-select');
    if (!select) return;

    const assets = new Set(['TON']);
    state.allTransfers.forEach(t => {
      if (t.asset) assets.add(t.asset);
    });

    const currentVal = select.value || 'all';
    select.innerHTML = '<option value="all">Todos los Activos</option>';
    assets.forEach(sym => {
      const opt = document.createElement('option');
      opt.value = sym;
      opt.textContent = sym;
      if (sym === currentVal) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // --- Filtering Engine ---
  function applyFiltersAndRebuildGraph() {
    if (!state.currentAddress) return;

    const now = Math.floor(Date.now() / 1000);
    let minTimestamp = 0;

    switch (state.filters.dateRange) {
      case '24h':
        minTimestamp = now - 86400;
        break;
      case '7d':
        minTimestamp = now - (7 * 86400);
        break;
      case '30d':
        minTimestamp = now - (30 * 86400);
        break;
      case '90d':
        minTimestamp = now - (90 * 86400);
        break;
      case 'all':
      default:
        minTimestamp = 0;
        break;
    }

    // Brush interval override if active
    if (state.filters.brushRange && Array.isArray(state.filters.brushRange)) {
      minTimestamp = Math.max(minTimestamp, state.filters.brushRange[0]);
    }

    const maxTimestamp = (state.filters.brushRange && state.filters.brushRange[1]) ? state.filters.brushRange[1] : Infinity;

    // Filter transfers
    const filtered = state.allTransfers.filter(t => {
      // 1. Date Range & Brush
      if (t.timestamp < minTimestamp || t.timestamp > maxTimestamp) return false;

      // 2. Inflow / Outflow toggle
      if (t.isIncoming && !state.filters.inflow) return false;
      if (t.isOutgoing && !state.filters.outflow) return false;

      // 3. Asset
      if (state.filters.asset !== 'all' && t.asset !== state.filters.asset) return false;

      // 4. Min Amount
      if (state.filters.minAmount > 0 && t.amount < state.filters.minAmount) return false;

      return true;
    });

    state.filteredTransfers = filtered;

    // Build Graph Topology Data
    buildGraphData(filtered);

    // Update UI Components
    renderActiveFilterChips();
    renderTimelineHistogram();
    renderGraphD3();

    // Default select central node for panel display
    if (!state.selectedNode || state.selectedNode.id === state.currentAddress) {
      selectCentralWalletNode();
    }
  }

  // --- Graph Topology Builder ---
  function buildGraphData(transfers) {
    const centerAddr = state.currentAddress;
    const centerInfo = resolveEntityInfo(centerAddr);

    // Calculate Inflow & Outflow totals for center
    let centerInTotal = 0;
    let centerInCount = 0;
    let centerOutTotal = 0;
    let centerOutCount = 0;

    transfers.forEach(t => {
      if (t.isIncoming) {
        centerInTotal += (t.asset === 'TON' ? t.amount : 0);
        centerInCount++;
      }
      if (t.isOutgoing) {
        centerOutTotal += (t.asset === 'TON' ? t.amount : 0);
        centerOutCount++;
      }
    });

    const centralNode = {
      id: centerAddr,
      name: centerInfo.name !== 'Unknown Wallet' ? centerInfo.name : shortenAddr(centerAddr, 6, 6),
      rawAddress: state.accountInfo?.raw_address || '',
      category: 'center',
      isCenter: true,
      isVerified: centerInfo.isVerified,
      logo: centerInfo.logo,
      balance: state.accountInfo?.balance ? Number(state.accountInfo.balance) / 1e9 : 0,
      jettons: state.jettons || [],
      inTotal: centerInTotal,
      inCount: centerInCount,
      outTotal: centerOutTotal,
      outCount: centerOutCount,
      netTotal: centerInTotal - centerOutTotal,
      radius: 30
    };

    // Aggregate by Counterparty
    const cpMap = new Map();

    transfers.forEach(t => {
      const cpAddr = t.counterparty;
      if (!cpAddr || cpAddr === centerAddr) return;

      if (!cpMap.has(cpAddr)) {
        const cpInfo = resolveEntityInfo(cpAddr);
        cpMap.set(cpAddr, {
          id: cpAddr,
          name: cpInfo.name !== 'Unknown Wallet' ? cpInfo.name : shortenAddr(cpAddr, 5, 5),
          category: cpInfo.category,
          isCenter: false,
          isVerified: cpInfo.isVerified,
          logo: cpInfo.logo,
          inTotal: 0,
          inCount: 0,
          outTotal: 0,
          outCount: 0,
          totalVolume: 0,
          transfersIn: [],
          transfersOut: [],
          allTransfers: [],
          firstSeen: t.timestamp,
          lastSeen: t.timestamp
        });
      }

      const cp = cpMap.get(cpAddr);
      cp.allTransfers.push(t);
      cp.firstSeen = Math.min(cp.firstSeen, t.timestamp);
      cp.lastSeen = Math.max(cp.lastSeen, t.timestamp);

      // From Center -> Counterparty (Center Outflow = CP Inflow)
      if (t.isOutgoing) {
        cp.inTotal += t.amount;
        cp.inCount++;
        cp.totalVolume += t.amount;
        cp.transfersIn.push(t);
      }
      // From Counterparty -> Center (Center Inflow = CP Outflow)
      if (t.isIncoming) {
        cp.outTotal += t.amount;
        cp.outCount++;
        cp.totalVolume += t.amount;
        cp.transfersOut.push(t);
      }
    });

    // Sort Counterparties by Total Observed Volume & Limit to Max Connections
    const sortedCps = Array.from(cpMap.values()).sort((a, b) => b.totalVolume - a.totalVolume);
    const visibleCps = sortedCps.slice(0, state.filters.maxConnections);

    // Compute dynamic node radii
    const maxVol = Math.max(...visibleCps.map(c => c.totalVolume), 1);
    visibleCps.forEach(cp => {
      // Scale radius between 16 and 25
      const ratio = Math.log10(cp.totalVolume + 1) / Math.log10(maxVol + 1);
      cp.radius = 16 + (ratio * 10);
    });

    const nodes = [centralNode, ...visibleCps];

    // Build Directed Edges
    const links = [];
    visibleCps.forEach(cp => {
      // 1. Counterparty to Center (Incoming to target wallet)
      if (cp.outCount > 0) {
        links.push({
          id: `link_${cp.id}_to_${centerAddr}`,
          source: cp.id,
          target: centerAddr,
          direction: 'inflow',
          volume: cp.outTotal,
          txCount: cp.outCount,
          transfers: cp.transfersOut,
          primaryAsset: cp.transfersOut[0]?.asset || 'TON',
          lastSeen: cp.lastSeen
        });
      }

      // 2. Center to Counterparty (Outgoing from target wallet)
      if (cp.inCount > 0) {
        links.push({
          id: `link_${centerAddr}_to_${cp.id}`,
          source: centerAddr,
          target: cp.id,
          direction: 'outflow',
          volume: cp.inTotal,
          txCount: cp.inCount,
          transfers: cp.transfersIn,
          primaryAsset: cp.transfersIn[0]?.asset || 'TON',
          lastSeen: cp.lastSeen
        });
      }
    });

    state.graphNodes = nodes;
    state.graphLinks = links;
  }

  // --- D3 Force Simulation Graph Renderer ---
  function renderGraphD3() {
    const svgElem = document.getElementById('flow-svg');
    const container = document.getElementById('flow-canvas-container');
    if (!svgElem || !container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const svg = d3.select(svgElem)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    if (state.graphNodes.length === 0) {
      showEmptyState('Sin Conexiones Visibles', 'No hay transacciones que cumplan con los filtros seleccionados.');
      return;
    }

    hideEmptyState();

    // 1. SVG Definitions (Arrowheads & Glow Filters)
    const defs = svg.append('defs');

    // Inflow Arrow (Green)
    defs.append('marker')
      .attr('id', 'marker-arrow-in')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#10B981');

    // Outflow Arrow (Rose/Red)
    defs.append('marker')
      .attr('id', 'marker-arrow-out')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#F43F5E');

    // Glow Filter for Central Node
    const filter = defs.append('filter')
      .attr('id', 'glow-cyan')
      .attr('x', '-50%').attr('y', '-50%')
      .attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', 5).attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 2. Zoom & Pan Container
    const gRoot = svg.append('g').attr('class', 'flow-graph-root');

    const zoom = d3.zoom()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        gRoot.attr('transform', event.transform);
      });

    svg.call(zoom);
    state.d3Zoom = zoom;
    state.d3Svg = svg;

    // Deselect on empty canvas click
    svg.on('click', (event) => {
      if (event.target === svgElem) {
        clearSelection();
      }
    });

    // 3. Force Simulation Setup
    const simulation = d3.forceSimulation(state.graphNodes)
      .force('link', d3.forceLink(state.graphLinks).id(d => d.id).distance(135))
      .force('charge', d3.forceManyBody().strength(d => d.isCenter ? -650 : -280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => d.radius + 18).iterations(3));

    state.d3Simulation = simulation;

    // 4. Render Edges (Links)
    const gLinks = gRoot.append('g').attr('class', 'flow-links');

    const link = gLinks.selectAll('g.link-group')
      .data(state.graphLinks)
      .enter()
      .append('g')
      .attr('class', 'link-group')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        selectEdge(d);
      })
      .on('mouseenter', (event, d) => showEdgeTooltip(event, d))
      .on('mouseleave', hideTooltip);

    // Visible Edge Line
    const linkPath = link.append('path')
      .attr('class', 'flow-link-path')
      .attr('stroke', d => d.direction === 'inflow' ? '#10B981' : '#F43F5E')
      .attr('stroke-width', d => Math.min(6, Math.max(1.8, Math.log10(d.volume + 1) * 1.5)))
      .attr('stroke-opacity', 0.7)
      .attr('fill', 'none')
      .attr('marker-end', d => d.direction === 'inflow' ? 'url(#marker-arrow-in)' : 'url(#marker-arrow-out)');

    // Invisible Wide Hitbox for Easy Clicking
    link.append('path')
      .attr('class', 'flow-link-hitbox')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 16)
      .attr('fill', 'none');

    // Transfer Count Badge for Grouped Edges (e.g. 3x)
    const linkBadge = link.filter(d => d.txCount > 1)
      .append('g')
      .attr('class', 'flow-link-badge');

    linkBadge.append('rect')
      .attr('rx', 4).attr('ry', 4)
      .attr('width', 22).attr('height', 14)
      .attr('fill', 'rgba(7, 13, 26, 0.88)')
      .attr('stroke', d => d.direction === 'inflow' ? '#10B981' : '#F43F5E')
      .attr('stroke-width', 1);

    linkBadge.append('text')
      .attr('dx', 11).attr('dy', 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(d => `${d.txCount}x`);

    // 5. Render Nodes
    const gNodes = gRoot.append('g').attr('class', 'flow-nodes');

    const node = gNodes.selectAll('g.node-group')
      .data(state.graphNodes)
      .enter()
      .append('g')
      .attr('class', d => `node-group ${d.isCenter ? 'node-central' : ''}`)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        selectNode(d);
      })
      .on('mouseenter', (event, d) => showNodeTooltip(event, d))
      .on('mouseleave', hideTooltip);

    // Halo ring for central node
    node.filter(d => d.isCenter)
      .append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', d => d.radius + 6)
      .attr('fill', 'none')
      .attr('stroke', '#00CFFF')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .attr('filter', 'url(#glow-cyan)');

    // Node Main Circle
    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.isCenter ? '#071630' : '#0B1528')
      .attr('stroke', d => getCategoryColor(d.category))
      .attr('stroke-width', d => d.isCenter ? 3.5 : 2.5);

    // Node Center Glyph / Icon
    node.append('text')
      .attr('class', 'node-glyph')
      .attr('dy', 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.isCenter ? '14px' : '11px')
      .attr('font-weight', '700')
      .attr('fill', d => getCategoryColor(d.category))
      .text(d => d.isCenter ? '💎' : (d.isVerified ? '✓' : '●'));

    // Node Label Text Below
    node.append('text')
      .attr('class', 'node-text-label')
      .attr('dy', d => d.radius + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', d => d.isCenter ? '12px' : '10.5px')
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', d => d.isCenter ? '700' : '500')
      .style('paint-order', 'stroke')
      .style('stroke', '#030712')
      .style('stroke-width', '3px')
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .text(d => d.name);

    // Node Secondary Subtext (Volume / Role)
    node.append('text')
      .attr('class', 'node-sub-label')
      .attr('dy', d => d.radius + 26)
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.isCenter ? '#00CFFF' : 'rgba(255,255,255,0.65)')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .style('paint-order', 'stroke')
      .style('stroke', '#030712')
      .style('stroke-width', '2.5px')
      .text(d => d.isCenter ? `${formatCryptoAmount(d.balance)} TON` : (d.totalVolume > 0 ? `${formatCryptoAmount(d.totalVolume)} TON` : ''));

    // 6. Simulation Tick Function with Curved Links
    simulation.on('tick', () => {
      linkPath.attr('d', d => {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const dr = Math.sqrt(dx * dx + dy * dy);

        // Gentle curve if both in and out exist between nodes
        const curveOffset = d.direction === 'inflow' ? 1.8 : 1.8;
        return `M${sx},${sy}A${dr * curveOffset},${dr * curveOffset} 0 0,1 ${tx},${ty}`;
      });

      link.selectAll('.flow-link-hitbox').attr('d', d => {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${sx},${sy}A${dr * 1.8},${dr * 1.8} 0 0,1 ${tx},${ty}`;
      });

      linkBadge.attr('transform', d => {
        const midX = (d.source.x + d.target.x) / 2;
        const midY = (d.source.y + d.target.y) / 2;
        return `translate(${midX - 11}, ${midY - 7})`;
      });

      node.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });

    // Drag handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  }

  // --- Graph Selection & Dimming ---
  function selectNode(selected) {
    state.selectedNode = selected;
    state.selectedLink = null;

    const svg = d3.select('#flow-svg');
    if (svg.empty()) return;

    // Dim unrelated nodes and links to 15% opacity
    const connectedNodeIds = new Set([selected.id]);
    state.graphLinks.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      if (srcId === selected.id) connectedNodeIds.add(tgtId);
      if (tgtId === selected.id) connectedNodeIds.add(srcId);
    });

    svg.selectAll('.node-group')
      .transition().duration(200)
      .style('opacity', d => connectedNodeIds.has(d.id) ? 1 : 0.15);

    svg.selectAll('.link-group')
      .transition().duration(200)
      .style('opacity', l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        return (srcId === selected.id || tgtId === selected.id) ? 1 : 0.1;
      });

    // Populate Right-Side Panel
    renderRightPanelWallet(selected);
  }

  function selectCentralWalletNode() {
    const center = state.graphNodes.find(n => n.isCenter);
    if (center) {
      selectNode(center);
    }
  }

  function selectEdge(linkData) {
    state.selectedLink = linkData;
    state.selectedNode = null;

    const svg = d3.select('#flow-svg');
    if (svg.empty()) return;

    const srcId = typeof linkData.source === 'object' ? linkData.source.id : linkData.source;
    const tgtId = typeof linkData.target === 'object' ? linkData.target.id : linkData.target;

    // Highlight only this edge and its two endpoints
    svg.selectAll('.node-group')
      .transition().duration(200)
      .style('opacity', d => (d.id === srcId || d.id === tgtId) ? 1 : 0.15);

    svg.selectAll('.link-group')
      .transition().duration(200)
      .style('opacity', l => l.id === linkData.id ? 1 : 0.1);

    // Populate Right-Side Panel with Edge Details
    renderRightPanelEdge(linkData);
  }

  function clearSelection() {
    state.selectedNode = null;
    state.selectedLink = null;

    const svg = d3.select('#flow-svg');
    if (!svg.empty()) {
      svg.selectAll('.node-group').transition().duration(200).style('opacity', 1);
      svg.selectAll('.link-group').transition().duration(200).style('opacity', 0.85);
    }

    // Default back to center node details
    selectCentralWalletNode();
  }

  // --- Right-Side Investigation Panel Renderers ---
  function renderRightPanelWallet(node) {
    const panelWrap = document.getElementById('flow-panel-right');
    const panelWallet = document.getElementById('flow-panel-wallet');
    const panelEdge = document.getElementById('flow-panel-edge');
    if (!panelWrap || !panelWallet || !panelEdge) return;

    panelWrap.style.display = 'block';
    panelWallet.style.display = 'block';
    panelEdge.style.display = 'none';

    // Badge
    const badge = document.getElementById('fp-wallet-badge');
    if (badge) {
      badge.textContent = node.isCenter ? 'BILLETERA INVESTIGADA' : (node.isVerified ? 'ENTIDAD VERIFICADA' : 'BILLETERA ON-CHAIN');
      badge.style.color = getCategoryColor(node.category);
      badge.style.borderColor = getCategoryColor(node.category);
    }

    // Name & Address
    const nameEl = document.getElementById('fp-wallet-name');
    if (nameEl) nameEl.textContent = node.name || 'Unknown Wallet';

    const addrEl = document.getElementById('fp-wallet-address');
    if (addrEl) {
      addrEl.textContent = shortenAddr(node.id, 8, 8);
      addrEl.title = node.id;
    }

    // Copy Address Button
    const btnCopy = document.getElementById('fp-btn-copy-addr');
    if (btnCopy) {
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(node.id).then(() => {
          btnCopy.innerHTML = '<span>✓ Copiado</span>';
          setTimeout(() => {
            btnCopy.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copiar</span>';
          }, 1800);
        });
      };
    }

    // Balances
    const balEl = document.getElementById('fp-ton-balance');
    const usdEl = document.getElementById('fp-ton-usd');
    if (balEl) balEl.textContent = `${formatCryptoAmount(node.balance)} TON`;
    if (usdEl) {
      const usdVal = node.balance * (state.tonPriceUsd || 0);
      usdEl.textContent = usdVal > 0 ? `≈ $${formatNumber(usdVal)} USD` : 'Precio no disponible';
    }

    // Jettons
    const jetCountEl = document.getElementById('fp-jetton-count');
    const jetSummEl = document.getElementById('fp-jettons-summary');
    const jetList = Array.isArray(node.jettons) ? node.jettons : (node.jettons?.balances || []);
    if (jetCountEl) jetCountEl.textContent = `${jetList.length} Tokens`;
    if (jetSummEl) {
      const topJets = jetList.slice(0, 3).map(j => j.jetton?.symbol || 'Token').join(', ');
      jetSummEl.textContent = topJets ? `Holdings: ${topJets}` : 'Sin Jettons reportados';
    }

    // Flow Totals
    const inTotalEl = document.getElementById('fp-in-total');
    const outTotalEl = document.getElementById('fp-out-total');
    const netTotalEl = document.getElementById('fp-net-total');

    if (inTotalEl) inTotalEl.textContent = `+${formatCryptoAmount(node.inTotal)} TON (${node.inCount} TX)`;
    if (outTotalEl) outTotalEl.textContent = `-${formatCryptoAmount(node.outTotal)} TON (${node.outCount} TX)`;
    if (netTotalEl) {
      const net = (node.inTotal || 0) - (node.outTotal || 0);
      netTotalEl.textContent = `${net >= 0 ? '+' : ''}${formatCryptoAmount(net)} TON`;
      netTotalEl.style.color = net >= 0 ? '#10B981' : '#F43F5E';
    }

    // Dates
    const firstEl = document.getElementById('fp-first-seen');
    const lastEl = document.getElementById('fp-last-seen');
    if (firstEl) firstEl.textContent = node.firstSeen ? formatDateIso(node.firstSeen) : '--';
    if (lastEl) lastEl.textContent = node.lastSeen ? formatDateIso(node.lastSeen) : '--';

    // Actions
    const btnRecenter = document.getElementById('fp-btn-recenter');
    if (btnRecenter) {
      btnRecenter.style.display = node.isCenter ? 'none' : 'flex';
      btnRecenter.onclick = () => {
        fetchWalletFlowData(node.id);
      };
    }

    const btnExplorer = document.getElementById('fp-btn-open-explorer');
    if (btnExplorer) {
      btnExplorer.onclick = () => {
        window.location.href = `explorer.html?address=${encodeURIComponent(node.id)}`;
      };
    }

    const linkTonviewer = document.getElementById('fp-link-tonviewer');
    if (linkTonviewer) {
      linkTonviewer.href = `https://tonviewer.com/${encodeURIComponent(node.id)}`;
    }
  }

  function renderRightPanelEdge(linkData) {
    const panelWrap = document.getElementById('flow-panel-right');
    const panelWallet = document.getElementById('flow-panel-wallet');
    const panelEdge = document.getElementById('flow-panel-edge');
    if (!panelWrap || !panelWallet || !panelEdge) return;

    panelWrap.style.display = 'block';
    panelWallet.style.display = 'none';
    panelEdge.style.display = 'block';

    const srcId = typeof linkData.source === 'object' ? linkData.source.id : linkData.source;
    const tgtId = typeof linkData.target === 'object' ? linkData.target.id : linkData.target;

    const fromEl = document.getElementById('fp-edge-from');
    if (fromEl) {
      fromEl.textContent = shortenAddr(srcId, 8, 8);
      fromEl.title = srcId;
      fromEl.onclick = () => fetchWalletFlowData(srcId);
    }

    const toEl = document.getElementById('fp-edge-to');
    if (toEl) {
      toEl.textContent = shortenAddr(tgtId, 8, 8);
      toEl.title = tgtId;
      toEl.onclick = () => fetchWalletFlowData(tgtId);
    }

    const amountEl = document.getElementById('fp-edge-amount');
    if (amountEl) {
      amountEl.textContent = `${formatCryptoAmount(linkData.volume)} ${linkData.primaryAsset}`;
    }

    const usdEl = document.getElementById('fp-edge-usd');
    if (usdEl) {
      if (linkData.primaryAsset === 'TON' && state.tonPriceUsd > 0) {
        usdEl.textContent = `≈ $${formatNumber(linkData.volume * state.tonPriceUsd)} USD`;
      } else {
        usdEl.textContent = 'Cotización USD no disponible';
      }
    }

    const timeEl = document.getElementById('fp-edge-time');
    if (timeEl) {
      timeEl.textContent = linkData.lastSeen ? formatDateIso(linkData.lastSeen) : '--';
    }

    // Individual transfers list for grouped edges
    const groupedSec = document.getElementById('fp-edge-grouped-section');
    const groupedTitle = document.getElementById('fp-edge-grouped-title');
    const txList = document.getElementById('fp-edge-tx-list');

    if (groupedSec && txList) {
      const transfers = linkData.transfers || [];
      if (transfers.length > 0) {
        groupedSec.style.display = 'block';
        if (groupedTitle) groupedTitle.textContent = `Transferencias Individuales (${transfers.length})`;

        txList.innerHTML = transfers.map(t => `
          <div class="fp-tx-item">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span class="data-font" style="font-size:11px; color:#fff;">${formatCryptoAmount(t.amount)} ${t.asset}</span>
              <span style="font-size:10px; color:var(--text-secondary);">${formatTimeAgo(t.timestamp)}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
              <span>TX: ${shortenAddr(t.txHash, 6, 6)}</span>
              <a href="https://tonviewer.com/transaction/${encodeURIComponent(t.txHash)}" target="_blank" style="color:var(--color-cyan); text-decoration:none;">Tonviewer ↗</a>
            </div>
          </div>
        `).join('');
      } else {
        groupedSec.style.display = 'none';
      }
    }
  }

  // --- Tooltips ---
  function showNodeTooltip(event, node) {
    const tip = document.getElementById('flow-tooltip');
    if (!tip) return;

    tip.style.display = 'block';
    tip.style.left = (event.clientX + 14) + 'px';
    tip.style.top = (event.clientY - 20) + 'px';

    tip.innerHTML = `
      <div style="font-weight:700; color:#fff; margin-bottom:4px; font-size:12px;">${node.name}</div>
      <div style="font-size:10.5px; color:var(--color-cyan); margin-bottom:6px; font-family:JetBrains Mono, monospace;">${shortenAddr(node.id, 8, 8)}</div>
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary); margin-bottom:2px;">
        <span>Flujo Total Observado:</span>
        <span class="data-font" style="color:#fff;">${formatCryptoAmount(node.totalVolume || node.balance)} TON</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary);">
        <span>Categoría:</span>
        <span style="color:${getCategoryColor(node.category)}; text-transform:uppercase; font-weight:600; font-size:10px;">${node.category}</span>
      </div>
    `;
  }

  function showEdgeTooltip(event, link) {
    const tip = document.getElementById('flow-tooltip');
    if (!tip) return;

    tip.style.display = 'block';
    tip.style.left = (event.clientX + 14) + 'px';
    tip.style.top = (event.clientY - 20) + 'px';

    tip.innerHTML = `
      <div style="font-weight:700; color:#fff; margin-bottom:4px; font-size:12px;">Flujo Transaccional (${link.direction === 'inflow' ? 'Entrada' : 'Salida'})</div>
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary); margin-bottom:2px;">
        <span>Volumen Acumulado:</span>
        <span class="data-font" style="color:#00CFFF; font-weight:700;">${formatCryptoAmount(link.volume)} ${link.primaryAsset}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary);">
        <span>Eventos On-Chain:</span>
        <span class="data-font" style="color:#fff;">${link.txCount} transacciones</span>
      </div>
    `;
  }

  function hideTooltip() {
    const tip = document.getElementById('flow-tooltip');
    if (tip) tip.style.display = 'none';
  }

  // --- Bottom Activity Timeline Histogram ---
  function renderTimelineHistogram() {
    const svgElem = document.getElementById('timeline-svg');
    const wrap = document.getElementById('flow-timeline-histogram');
    if (!svgElem || !wrap) return;

    const width = wrap.clientWidth || 600;
    const height = wrap.clientHeight || 54;

    const svg = d3.select(svgElem)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    const transfers = state.allTransfers;
    if (transfers.length === 0) {
      const countEl = document.getElementById('flow-timeline-count');
      if (countEl) countEl.textContent = '0 eventos';
      return;
    }

    // Min and max timestamp across all observed transfers
    const timestamps = transfers.map(t => t.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps, minTime + 3600);

    // Update timeline labels
    const startEl = document.getElementById('flow-timeline-start');
    const endEl = document.getElementById('flow-timeline-end');
    const countEl = document.getElementById('flow-timeline-count');

    if (startEl) startEl.textContent = formatDateIso(minTime).slice(0, 10);
    if (endEl) endEl.textContent = formatDateIso(maxTime).slice(0, 10);
    if (countEl) countEl.textContent = `${state.filteredTransfers.length} de ${transfers.length} eventos`;

    // Divide into 30 uniform time bins
    const binCount = Math.min(35, Math.max(12, Math.floor(width / 20)));
    const binSpan = (maxTime - minTime) / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      index: i,
      tMin: minTime + (i * binSpan),
      tMax: minTime + ((i + 1) * binSpan),
      inCount: 0,
      inVol: 0,
      outCount: 0,
      outVol: 0
    }));

    transfers.forEach(t => {
      const bIdx = Math.min(binCount - 1, Math.max(0, Math.floor((t.timestamp - minTime) / binSpan)));
      const b = bins[bIdx];
      if (t.isIncoming) {
        b.inCount++;
        b.inVol += t.amount;
      }
      if (t.isOutgoing) {
        b.outCount++;
        b.outVol += t.amount;
      }
    });

    // Max volume for scaling
    const maxBinCount = Math.max(...bins.map(b => b.inCount + b.outCount), 1);

    const x = d3.scaleLinear().domain([minTime, maxTime]).range([10, width - 10]);
    const barWidth = Math.max(3, (width - 20) / binCount - 2);

    // Render bars
    const gBars = svg.append('g').attr('class', 'histogram-bars');

    bins.forEach((b, i) => {
      const bx = x(b.tMin);
      const totalCount = b.inCount + b.outCount;
      if (totalCount === 0) return;

      const totalH = Math.min(height - 10, Math.max(4, (totalCount / maxBinCount) * (height - 12)));
      const inRatio = b.inCount / totalCount;
      const inH = totalH * inRatio;
      const outH = totalH * (1 - inRatio);

      // Inflow part (green)
      if (inH > 0) {
        gBars.append('rect')
          .attr('x', bx)
          .attr('y', height - totalH)
          .attr('width', barWidth)
          .attr('height', inH)
          .attr('fill', '#10B981')
          .attr('rx', 1.5)
          .attr('opacity', 0.85);
      }

      // Outflow part (rose)
      if (outH > 0) {
        gBars.append('rect')
          .attr('x', bx)
          .attr('y', height - outH)
          .attr('width', barWidth)
          .attr('height', outH)
          .attr('fill', '#F43F5E')
          .attr('rx', 1.5)
          .attr('opacity', 0.85);
      }
    });

    // Interactive D3 Brush for Timeline Selection
    const brush = d3.brushX()
      .extent([[10, 0], [width - 10, height]])
      .on('brush end', (event) => {
        if (!event.selection) {
          state.filters.brushRange = null;
        } else {
          const [x0, x1] = event.selection;
          const t0 = Math.floor(x.invert(x0));
          const t1 = Math.floor(x.invert(x1));
          state.filters.brushRange = [t0, t1];
        }
        // Update graph without recursion
        if (event.type === 'end') {
          applyFiltersAndRebuildGraph();
        }
      });

    svg.append('g')
      .attr('class', 'timeline-brush')
      .call(brush);
  }

  // --- Removable Filter Chips ---
  function renderActiveFilterChips() {
    const container = document.getElementById('flow-active-chips');
    if (!container) return;

    const chips = [];

    if (state.filters.dateRange !== 'all') {
      chips.push({ key: 'dateRange', label: `Período: ${state.filters.dateRange.toUpperCase()}`, onClear: () => setDateRange('all') });
    }
    if (!state.filters.inflow) {
      chips.push({ key: 'inflow', label: 'Sin Entradas', onClear: () => toggleDirection('in') });
    }
    if (!state.filters.outflow) {
      chips.push({ key: 'outflow', label: 'Sin Salidas', onClear: () => toggleDirection('out') });
    }
    if (state.filters.asset !== 'all') {
      chips.push({ key: 'asset', label: `Activo: ${state.filters.asset}`, onClear: () => setAssetFilter('all') });
    }
    if (state.filters.minAmount > 0) {
      chips.push({ key: 'minAmount', label: `Monto ≥ ${state.filters.minAmount}`, onClear: () => setMinAmount(0) });
    }
    if (state.filters.brushRange) {
      chips.push({ key: 'brush', label: 'Rango de Tiempo Personalizado', onClear: () => clearBrush() });
    }

    if (chips.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = chips.map(c => `
      <div class="flow-chip" data-key="${c.key}">
        <span>${c.label}</span>
        <button class="flow-chip-close" title="Eliminar filtro">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.flow-chip').forEach(el => {
      const key = el.getAttribute('data-key');
      const chipObj = chips.find(c => c.key === key);
      const closeBtn = el.querySelector('.flow-chip-close');
      if (closeBtn && chipObj) {
        closeBtn.onclick = () => chipObj.onClear();
      }
    });
  }

  // --- Filter Control Actions ---
  function setDateRange(range) {
    state.filters.dateRange = range;
    state.filters.brushRange = null;

    document.querySelectorAll('#flow-date-range-pills .flow-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-range') === range);
    });

    applyFiltersAndRebuildGraph();
  }

  function toggleDirection(type) {
    if (type === 'in') {
      state.filters.inflow = !state.filters.inflow;
      const btn = document.getElementById('flow-toggle-in');
      if (btn) btn.classList.toggle('active-in', state.filters.inflow);
    } else if (type === 'out') {
      state.filters.outflow = !state.filters.outflow;
      const btn = document.getElementById('flow-toggle-out');
      if (btn) btn.classList.toggle('active-out', state.filters.outflow);
    }

    applyFiltersAndRebuildGraph();
  }

  function setAssetFilter(asset) {
    state.filters.asset = asset;
    const select = document.getElementById('flow-asset-select');
    if (select) select.value = asset;
    applyFiltersAndRebuildGraph();
  }

  function setMinAmount(amount) {
    state.filters.minAmount = Number(amount) || 0;
    const input = document.getElementById('flow-min-amount');
    if (input) input.value = state.filters.minAmount > 0 ? state.filters.minAmount : '';
    applyFiltersAndRebuildGraph();
  }

  function clearBrush() {
    state.filters.brushRange = null;
    applyFiltersAndRebuildGraph();
  }

  function clearAllFilters() {
    state.filters.dateRange = 'all';
    state.filters.inflow = true;
    state.filters.outflow = true;
    state.filters.asset = 'all';
    state.filters.minAmount = 0;
    state.filters.maxConnections = DEFAULT_MAX_CONNECTIONS;
    state.filters.brushRange = null;

    document.querySelectorAll('#flow-date-range-pills .flow-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-range') === 'all');
    });

    const btnIn = document.getElementById('flow-toggle-in');
    if (btnIn) btnIn.classList.add('active-in');
    const btnOut = document.getElementById('flow-toggle-out');
    if (btnOut) btnOut.classList.add('active-out');

    const assetSel = document.getElementById('flow-asset-select');
    if (assetSel) assetSel.value = 'all';

    const minIn = document.getElementById('flow-min-amount');
    if (minIn) minIn.value = '';

    const maxSel = document.getElementById('flow-max-conn-select');
    if (maxSel) maxSel.value = String(DEFAULT_MAX_CONNECTIONS);

    applyFiltersAndRebuildGraph();
  }

  // --- Loading & Empty UI Helpers ---
  function updateLoadingUi(isLoading, message = '') {
    const overlay = document.getElementById('flow-loading');
    const msgEl = document.getElementById('flow-loading-status');
    if (!overlay) return;

    if (isLoading) {
      overlay.style.display = 'flex';
      if (msgEl) msgEl.textContent = message;
    } else {
      overlay.style.display = 'none';
    }
  }

  function showEmptyState(title, desc) {
    const empty = document.getElementById('flow-empty');
    if (!empty) return;
    empty.style.display = 'flex';
    const titleEl = document.getElementById('flow-empty-title');
    const descEl = document.getElementById('flow-empty-desc');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
  }

  function hideEmptyState() {
    const empty = document.getElementById('flow-empty');
    if (empty) empty.style.display = 'none';
  }

  // --- Graph Controls (Fit, Reset, Expand) ---
  function fitGraphToScreen() {
    if (!state.d3Svg || !state.d3Zoom) return;
    const container = document.getElementById('flow-canvas-container');
    if (!container) return;

    state.d3Svg.transition().duration(600).call(
      state.d3Zoom.transform,
      d3.zoomIdentity.translate(container.clientWidth / 2, container.clientHeight / 2).scale(0.9).translate(-container.clientWidth / 2, -container.clientHeight / 2)
    );
  }

  function resetGraph() {
    if (state.d3Simulation) {
      state.d3Simulation.alpha(0.8).restart();
    }
    fitGraphToScreen();
    clearSelection();
  }

  function expandGraph() {
    state.filters.maxConnections = Math.min(100, state.filters.maxConnections + 20);
    const sel = document.getElementById('flow-max-conn-select');
    if (sel) sel.value = String(state.filters.maxConnections);
    applyFiltersAndRebuildGraph();
  }

  // --- UI Event Listeners ---
  function bindFlowVisualizerEvents() {
    // 1. Wallet Search Input in Flow Toolbar
    const input = document.getElementById('flow-wallet-input');
    const btnSearch = document.getElementById('flow-wallet-search-btn');
    const btnClear = document.getElementById('flow-wallet-clear-btn');

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          fetchWalletFlowData(input.value);
        }
      });
      input.addEventListener('input', () => {
        if (btnClear) btnClear.style.display = input.value ? 'block' : 'none';
      });
    }

    if (btnSearch && input) {
      btnSearch.onclick = () => fetchWalletFlowData(input.value);
    }

    if (btnClear && input) {
      btnClear.onclick = () => {
        input.value = '';
        btnClear.style.display = 'none';
        input.focus();
      };
    }

    // 2. Sample Entity Chips
    document.querySelectorAll('.flow-sample-chip').forEach(chip => {
      chip.onclick = () => {
        const addr = chip.getAttribute('data-addr');
        if (addr) fetchWalletFlowData(addr);
      };
    });

    // 3. Date Range Buttons
    document.querySelectorAll('#flow-date-range-pills .flow-pill-btn').forEach(btn => {
      btn.onclick = () => setDateRange(btn.getAttribute('data-range'));
    });

    // 4. Inflow & Outflow Toggles
    const toggleIn = document.getElementById('flow-toggle-in');
    if (toggleIn) toggleIn.onclick = () => toggleDirection('in');
    const toggleOut = document.getElementById('flow-toggle-out');
    if (toggleOut) toggleOut.onclick = () => toggleDirection('out');

    // 5. Asset Select
    const assetSelect = document.getElementById('flow-asset-select');
    if (assetSelect) {
      assetSelect.onchange = (e) => setAssetFilter(e.target.value);
    }

    // 6. Min Amount Input
    const minInput = document.getElementById('flow-min-amount');
    if (minInput) {
      minInput.onchange = (e) => setMinAmount(e.target.value);
    }

    // 7. Max Connections Select
    const maxSelect = document.getElementById('flow-max-conn-select');
    if (maxSelect) {
      maxSelect.onchange = (e) => {
        state.filters.maxConnections = Number(e.target.value) || DEFAULT_MAX_CONNECTIONS;
        applyFiltersAndRebuildGraph();
      };
    }

    // 8. Toolbar Actions
    const btnFit = document.getElementById('flow-btn-fit');
    if (btnFit) btnFit.onclick = fitGraphToScreen;

    const btnReset = document.getElementById('flow-btn-reset');
    if (btnReset) btnReset.onclick = resetGraph;

    const btnExpand = document.getElementById('flow-btn-expand');
    if (btnExpand) btnExpand.onclick = expandGraph;

    const btnRefresh = document.getElementById('flow-btn-refresh');
    if (btnRefresh) {
      btnRefresh.onclick = () => {
        if (state.currentAddress) fetchWalletFlowData(state.currentAddress);
      };
    }

    const btnClearFilters = document.getElementById('flow-btn-clear-filters');
    if (btnClearFilters) btnClearFilters.onclick = clearAllFilters;

    const btnEmptyAction = document.getElementById('flow-empty-action');
    if (btnEmptyAction) btnEmptyAction.onclick = clearAllFilters;

    // 9. Close Right Panel Buttons
    const btnClosePanel = document.getElementById('fp-btn-close');
    if (btnClosePanel) btnClosePanel.onclick = () => {
      const panel = document.getElementById('flow-panel-right');
      if (panel) panel.style.display = 'none';
      clearSelection();
    };

    const btnCloseEdge = document.getElementById('fp-btn-close-edge');
    if (btnCloseEdge) btnCloseEdge.onclick = () => {
      const panel = document.getElementById('flow-panel-right');
      if (panel) panel.style.display = 'none';
      clearSelection();
    };

    // 10. Window Resize Handler
    window.addEventListener('resize', () => {
      if (state.graphNodes.length > 0) {
        renderGraphD3();
        renderTimelineHistogram();
      }
    });
  }

  // --- Initial Deep-Link & URL Route Handler ---
  function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const addr = params.get('address') || params.get('wallet') || params.get('target');

    if (addr) {
      fetchWalletFlowData(addr);
    } else {
      // Default to TON Foundation Treasury as a rich canonical reference
      fetchWalletFlowData('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N');
    }
  }

  // --- Initialize on DOMContentLoaded ---
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      bindFlowVisualizerEvents();
      initFromUrl();
    });
  }

  // Export to global window for interoperability
  if (typeof window !== 'undefined') {
    window.ANLGRAM_FLOW = {
      state,
      fetchWalletFlowData,
      setDateRange,
      toggleDirection,
      setAssetFilter,
      setMinAmount,
      clearAllFilters,
      fitGraphToScreen,
      resetGraph,
      expandGraph
    };
  }

  // Node environment exports for test suites
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      state,
      parseTransfersFromEvents,
      resolveEntityInfo,
      getCategoryColor,
      formatCryptoAmount,
      shortenAddr
    };
  }
})();
