(function () {
  "use strict";

  // --- 1. DATA ENGINE ---
  
  // 20 Mock GRAM tokens on TON network
  const tokens = [
    { id: 'gram', name: 'GRAM', symbol: 'GRAM', price: '$0.012', volume: '$1.2M', supply: '5B', logo: 'assets/img/gram.png' },
    { id: 'ton', name: 'Toncoin', symbol: 'TON', price: '$2.15', volume: '$45M', supply: '3.4B', logo: 'assets/img/ton.png' },
    { id: 'not', name: 'Notcoin', symbol: 'NOT', price: '$0.005', volume: '$20M', supply: '102B', logo: 'assets/img/not.png' },
    { id: 'ston', name: 'STON', symbol: 'STON', price: '$4.50', volume: '$500K', supply: '100M', logo: 'assets/img/ston.png' },
    { id: 'dfc', name: 'DeFinder Capital', symbol: 'DFC', price: '$1.10', volume: '$150K', supply: '20M', logo: 'assets/img/dfc.png' },
    { id: 'up', name: 'TonUp', symbol: 'UP', price: '$0.50', volume: '$300K', supply: '100M', logo: 'assets/img/up.png' },
    { id: 'raff', name: 'Ton Raffles', symbol: 'RAFF', price: '$0.05', volume: '$50K', supply: '1B', logo: 'assets/img/raff.png' },
    { id: 'mc', name: 'Meridian', symbol: 'MC', price: '$0.25', volume: '$80K', supply: '50M', logo: 'assets/img/mc.png' },
    { id: 'fnz', name: 'Fanzee', symbol: 'FNZ', price: '$0.02', volume: '$40K', supply: '2B', logo: 'assets/img/fnz.png' },
    { id: 'jvt', name: 'Jvault', symbol: 'JVT', price: '$0.15', volume: '$60K', supply: '100M', logo: 'assets/img/jvt.png' },
    { id: 'kote', name: 'KOTE', symbol: 'KOTE', price: '$0.0001', volume: '$10K', supply: '1T', logo: 'assets/img/kote.png' },
    { id: 'fish', name: 'Ton Fish', symbol: 'FISH', price: '$0.000005', volume: '$500K', supply: '420T', logo: 'assets/img/fish.png' },
    { id: 'tgr', name: 'Tegro', symbol: 'TGR', price: '$0.80', volume: '$100K', supply: '50M', logo: 'assets/img/tgr.png' },
    { id: 'glint', name: 'Glint', symbol: 'GLINT', price: '$0.03', volume: '$20K', supply: '100M', logo: 'assets/img/glint.png' },
    { id: 'pex', name: 'Pex', symbol: 'PEX', price: '$0.04', volume: '$15K', supply: '200M', logo: 'assets/img/pex.png' },
    { id: 'amo', name: 'Amo', symbol: 'AMO', price: '$0.01', volume: '$25K', supply: '500M', logo: 'assets/img/amo.png' },
    { id: 'punk', name: 'Ton Punks', symbol: 'PUNK', price: '$1.50', volume: '$75K', supply: '10M', logo: 'assets/img/punk.png' },
    { id: 'jetton', name: 'Jetton', symbol: 'JETTON', price: '$0.60', volume: '$90K', supply: '500M', logo: 'assets/img/jetton.png' },
    { id: 'scale', name: 'Scale', symbol: 'SCALE', price: '$2.00', volume: '$120K', supply: '25M', logo: 'assets/img/scale.png' },
    { id: 'wall', name: 'Wall', symbol: 'WALL', price: '$0.10', volume: '$30K', supply: '100M', logo: 'assets/img/wall.png' }
  ];

  // Pseudo-random number generator for deterministic data
  function mulberry32(a) {
    return function () {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Generate deterministic graph data for a token
  function generateTokenData(tokenId) {
    let seed = 0;
    for (let i = 0; i < tokenId.length; i++) {
      seed += tokenId.charCodeAt(i) * Math.pow(10, i);
    }
    const prng = mulberry32(seed);

    const numNodes = Math.floor(prng() * 51) + 100; // 100 to 150
    const numClusters = Math.floor(prng() * 3) + 3; // 3 to 5
    
    const nodes = [];
    let remainingSupply = 100.0; // percentages
    
    // Generate Nodes
    for (let i = 0; i < numNodes; i++) {
      const cluster = Math.floor(prng() * numClusters);
      const isLargeNode = prng() > 0.9;
      
      let holding = 0;
      if (i === numNodes - 1) {
        holding = remainingSupply;
      } else {
        const maxHolding = isLargeNode ? remainingSupply * 0.1 : remainingSupply * 0.02;
        holding = prng() * maxHolding;
        remainingSupply -= holding;
      }

      nodes.push({
        id: `node_${i}`,
        address: generateAddress(prng),
        holding: Math.max(holding, 0.001), // ensure positive
        cluster: cluster,
        radius: Math.max(Math.sqrt(holding) * 15, 3) // size proportional to holding
      });
    }

    // Sort nodes to have largest rendered on top or organized
    nodes.sort((a, b) => b.holding - a.holding);

    // Generate Links (transfers)
    const links = [];
    for (let i = 0; i < numNodes; i++) {
      // Connect to 1 or 2 other nodes in same cluster or randomly
      const numLinks = Math.floor(prng() * 2) + 1;
      for (let j = 0; j < numLinks; j++) {
        let targetIdx = Math.floor(prng() * numNodes);
        if (targetIdx !== i) {
          links.push({
            source: `node_${i}`,
            target: `node_${targetIdx}`,
            value: prng() * 10
          });
        }
      }
    }

    return { nodes, links };
  }

  function generateAddress(prng) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let addr = 'EQ';
    for (let i = 0; i < 46; i++) {
      addr += chars.charAt(Math.floor(prng() * chars.length));
    }
    return addr;
  }

  // --- 2. DOM & STATE ---

  let currentToken = null;
  let simulation = null;
  let svg = null;
  let g = null;
  let zoomBehavior = null;

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  // View containers
  const homepage = document.getElementById('homepage');
  const mapview = document.getElementById('mapview');
  
  // Lists & Panels
  const trendingList = document.getElementById('trending-list');
  const mapContainer = document.getElementById('map-container');
  const backBtn = document.getElementById('back-btn');
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomResetBtn = document.getElementById('zoom-reset');
  
  // Map Info overlay
  const mapTokenName = document.getElementById('map-token-name');
  const mapTokenPrice = document.getElementById('map-token-price');
  
  // Wallet Info Panel
  const walletPanel = document.getElementById('wallet-panel');
  const wAddress = document.getElementById('w-address');
  const wBalance = document.getElementById('w-balance');
  const wPercentage = document.getElementById('w-percentage');

  // Tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "d3-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "#fff")
    .style("padding", "8px 12px")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("font-family", "sans-serif")
    .style("font-size", "12px")
    .style("z-index", 9999);


  // --- 3. UI LOGIC ---

  function init() {
    renderTrending();
    bindEvents();
  }

  function renderTrending() {
    if (!trendingList) return;
    trendingList.innerHTML = '';
    
    tokens.forEach((token, index) => {
      const el = document.createElement('div');
      el.className = 'trending-item';
      // Basic HTML for trending item
      el.innerHTML = `
        <div class="trend-rank">#${index + 1}</div>
        <div class="trend-info">
          <span class="trend-name">${token.name}</span>
          <span class="trend-symbol">${token.symbol}</span>
        </div>
        <div class="trend-price">${token.price}</div>
      `;
      
      el.addEventListener('click', () => {
        openMap(token);
      });
      
      trendingList.appendChild(el);
    });
  }

  function bindEvents() {
    if (backBtn) {
      backBtn.addEventListener('click', closeMap);
    }
    
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        if (svg && zoomBehavior) {
          svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
        }
      });
    }
    
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        if (svg && zoomBehavior) {
          svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7);
        }
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        if (svg && zoomBehavior) {
          svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
        }
      });
    }
  }

  function openMap(token) {
    currentToken = token;
    
    if (homepage) homepage.style.display = 'none';
    if (mapview) mapview.style.display = 'flex'; // or block depending on layout
    if (walletPanel) walletPanel.style.display = 'none'; // hide until clicked

    if (mapTokenName) mapTokenName.textContent = token.name;
    if (mapTokenPrice) mapTokenPrice.textContent = token.price;

    const data = generateTokenData(token.id);
    initD3Map(data);
  }

  function closeMap() {
    currentToken = null;
    
    if (homepage) homepage.style.display = 'block';
    if (mapview) mapview.style.display = 'none';
    
    // Clear D3
    if (mapContainer) {
      mapContainer.innerHTML = '';
    }
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    tooltip.style("opacity", 0);
  }


  // --- 4. D3.JS INTEGRATION ---

  function initD3Map(data) {
    if (!mapContainer) return;
    mapContainer.innerHTML = ''; // clear previous

    const width = mapContainer.clientWidth || 800;
    const height = mapContainer.clientHeight || 600;

    svg = d3.select(mapContainer)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", [0, 0, width, height]);

    g = svg.append("g");

    // Zoom setup
    zoomBehavior = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
      
    svg.call(zoomBehavior);

    // Force simulation
    simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.links).id(d => d.id).distance(50).strength(0.1))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => d.radius + 2).iterations(2));

    // Links
    const link = g.append("g")
      .attr("stroke", "#444")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(data.links)
      .join("line")
      .attr("stroke-width", d => Math.sqrt(d.value) * 0.5);

    // Nodes
    const node = g.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("r", d => d.radius)
      .attr("fill", d => colorScale(d.cluster))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .call(drag(simulation));

    // Tooltips on hover
    node.on("mouseover", (event, d) => {
      d3.select(event.currentTarget)
        .attr("stroke", "#ffeb3b")
        .attr("stroke-width", 3);
        
      tooltip.transition().duration(200).style("opacity", 1);
      
      const shortAddr = d.address.slice(0, 6) + '...' + d.address.slice(-4);
      tooltip.html(`
        <strong>Wallet:</strong> ${shortAddr}<br/>
        <strong>Holding:</strong> ${d.holding.toFixed(4)}%
      `)
      .style("left", (event.pageX + 15) + "px")
      .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", (event, d) => {
      d3.select(event.currentTarget)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);
        
      tooltip.transition().duration(500).style("opacity", 0);
    });

    // Click on node
    node.on("click", (event, d) => {
      event.stopPropagation(); // prevent svg click
      showWalletPanel(d);
    });
    
    // Click on background
    svg.on("click", () => {
      if (walletPanel) walletPanel.style.display = 'none';
    });

    // Tick update
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    });
    
    // Helper: Drag interaction
    function drag(simulation) {
      function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      
      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      
      function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  }

  function showWalletPanel(d) {
    if (!walletPanel) return;
    walletPanel.style.display = 'block';
    
    if (wAddress) wAddress.textContent = d.address;
    if (wPercentage) wPercentage.textContent = d.holding.toFixed(4) + '%';
    
    // Simulate balance based on holding and currentToken supply
    if (wBalance && currentToken) {
      // Very basic extraction of supply numeric value
      let numericSupply = parseFloat(currentToken.supply);
      let multiplier = 1;
      if (currentToken.supply.includes('B')) multiplier = 1e9;
      else if (currentToken.supply.includes('M')) multiplier = 1e6;
      else if (currentToken.supply.includes('T')) multiplier = 1e12;
      else if (currentToken.supply.includes('K')) multiplier = 1e3;
      
      let actualSupply = numericSupply * multiplier;
      if (!isNaN(actualSupply)) {
        let bal = (actualSupply * (d.holding / 100));
        wBalance.textContent = bal.toLocaleString(undefined, { maximumFractionDigits: 2 });
      } else {
        wBalance.textContent = 'Unknown';
      }
    }
  }

  // --- Run ---
  // Ensure DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
