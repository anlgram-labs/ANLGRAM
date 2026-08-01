// ═══════════════════════════════════════════════════════════════
// ANLGRAM TON Connect Real Wallet Manager (v7.1 - Sleek & Non-conflicting)
// ═══════════════════════════════════════════════════════════════

(function() {
  // One-time clean wipe of any legacy/mock wallet addresses stuck in browser storage
  

  function initWalletManager() {
    // Inject self-contained CSS for Wallet Modal & Toast
    if (!document.getElementById('anlgram-wallet-styles')) {
      const style = document.createElement('style');
      style.id = 'anlgram-wallet-styles';
      style.textContent = `
        .modal-overlay {
          position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          width: 100vw !important; height: 100vh !important;
          background: rgba(0, 0, 0, 0.88) !important; backdrop-filter: blur(10px) !important;
          display: none !important; align-items: center !important; justify-content: center !important;
          z-index: 999999 !important;
        }
        .modal-overlay[style*="display: flex"] {
          display: flex !important;
        }
        .modal {
          background: #0f0f16 !important; border: 1px solid rgba(0, 240, 255, 0.4) !important;
          border-radius: 20px !important; width: 92% !important; max-width: 440px !important;
          padding: 28px !important; position: relative !important;
          box-shadow: 0 25px 60px rgba(0,0,0,0.95), 0 0 40px rgba(0, 240, 255, 0.15) !important;
          color: #fff !important; font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
          text-align: left !important;
        }
        .panel-close {
          position: absolute; top: 20px; right: 20px; background: none; border: none;
          color: #888; cursor: pointer; z-index: 10; padding: 6px; transition: color 0.2s;
        }
        .panel-close:hover { color: #fff; }
        .wallet-list { display: flex; flex-direction: column; gap: 12px; }
        .wallet-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
          cursor: pointer; transition: all 0.2s ease; text-decoration: none !important;
        }
        .wallet-item:hover {
          border-color: #00f0ff; transform: translateX(4px);
          background: rgba(0, 240, 255, 0.08);
        }
        .wallet-info { display: flex; align-items: center; gap: 16px; }
        .wallet-icon {
          width: 44px; height: 44px; border-radius: 12px; display: flex;
          align-items: center; justify-content: center; font-size: 22px;
          color: white; font-weight: bold; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .wallet-name { font-size: 15px; font-weight: 600; color: #fff; text-align: left; }
        .wallet-type { font-size: 12px; color: #888; margin-top: 2px; text-align: left; }
        .wallet-badge {
          font-size: 11px; padding: 4px 10px; border-radius: 99px; font-weight: 600;
          background: rgba(255,255,255,0.1); color: #ccc;
        }
        .wallet-toast-popup {
          position: fixed !important; bottom: 20px !important; right: 20px !important;
          background: #0c0c12 !important; border: 1px solid rgba(0, 240, 255, 0.3) !important;
          border-left: 3px solid #00f0ff !important; border-radius: 10px !important;
          padding: 10px 14px !important; z-index: 9999999 !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.8) !important;
          transform: translateY(80px); opacity: 0; pointer-events: none !important;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          max-width: 260px; width: auto; color: #fff !important; font-family: 'Inter', system-ui, sans-serif !important;
        }
        .wallet-toast-popup.show { transform: translateY(0); opacity: 1; pointer-events: auto !important; }
        .wallet-toast-title { font-weight: 600; color: white; font-size: 13px; margin-bottom: 2px; display:flex; align-items:center; gap:6px; }
        .wallet-toast-desc { font-size: 11px; color: #aaa; line-height: 1.3; font-family: monospace; }
        .real-wallet-input {
          width: 100% !important; padding: 14px !important; background: #07070a !important;
          border: 1px solid rgba(0, 240, 255, 0.4) !important; border-radius: 12px !important;
          color: #00f0ff !important; font-family: monospace !important; font-size: 14px !important;
          margin: 16px 0 !important; box-sizing: border-box !important;
        }
        .real-wallet-input:focus { outline: none !important; border-color: #00f0ff !important; box-shadow: 0 0 15px rgba(0,240,255,0.2) !important; }
      `;
      document.head.appendChild(style);
    }

    

    if (!document.getElementById('walletToastPopup')) {
      const toastDiv = document.createElement('div');
      toastDiv.id = 'walletToastPopup';
      toastDiv.className = 'wallet-toast-popup';
      toastDiv.innerHTML = `
        <div class="wallet-toast-title" id="walletToastTitle"></div>
        <div class="wallet-toast-desc" id="walletToastDesc"></div>
      `;
      document.body.appendChild(toastDiv);
    }

        if (!document.getElementById('settingsModal')) {
      const setDiv = document.createElement('div');
      setDiv.id = 'settingsModal';
      setDiv.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); z-index:1000000; align-items:center; justify-content:center; padding:16px; font-family:"Inter", system-ui, sans-serif;';
      setDiv.innerHTML = `
        <style>
          .stab-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            text-align: left;
            transition: all 0.2s ease;
            width: 100%;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .stab-btn:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #fff;
          }
          .stab-btn.active {
            background: rgba(59, 130, 246, 0.15);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.4);
            font-weight: 700;
          }
          .set-section-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 8px;
          }
          .set-group {
            margin-bottom: 20px;
          }
          .set-label {
            font-size: 13px;
            font-weight: 600;
            color: #e2e8f0;
            display: block;
            margin-bottom: 8px;
          }
          .setting-opt-btn {
            padding: 10px;
            border-radius: 10px;
            background: #121821;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            transition: all 0.2s ease;
          }
          .setting-opt-btn:hover {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.1);
          }
          .setting-opt-btn.active {
            border-color: #3b82f6 !important;
            background: rgba(59, 130, 246, 0.2) !important;
            color: #3b82f6 !important;
            font-weight: 700;
          }
          .set-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            background: #121821;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            cursor: pointer;
            font-size: 13px;
            color: #e2e8f0;
          }
          .set-toggle-row input {
            width: 18px;
            height: 18px;
            accent-color: #3b82f6;
            cursor: pointer;
          }
          .set-select {
            width: 100%;
            padding: 10px 14px;
            border-radius: 10px;
            background: #121821;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #fff;
            font-size: 13px;
            outline: none;
          }
          .set-btn-primary {
            background: #3b82f6;
            color: #fff;
            font-weight: 700;
            border: none;
            border-radius: 10px;
            padding: 10px 16px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
            box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
          }
          .set-btn-primary:hover {
            background: #2563eb;
            transform: translateY(-1px);
          }
          .set-btn-secondary {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #fff;
            font-weight: 600;
            border-radius: 10px;
            padding: 10px 16px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
          }
          .set-btn-secondary:hover {
            border-color: #3b82f6;
            color: #3b82f6;
          }
          .set-btn-danger {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid #ef4444;
            color: #ef4444;
            font-weight: 700;
            border-radius: 10px;
            padding: 10px 16px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
          }
          .set-btn-danger:hover {
            background: #ef4444;
            color: #fff;
          }
        </style>

        <div style="background:#0b0f14; border:1px solid rgba(59, 130, 246, 0.4); border-radius:24px; max-width:760px; width:100%; height:82vh; max-height:720px; box-shadow:0 0 50px rgba(59, 130, 246, 0.25); color:#fff; position:relative; display:flex; flex-direction:column; overflow:hidden; text-align:left;">
          
          <!-- Header Bar -->
          <div style="padding:18px 24px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between; background:#121821;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:22px;">⚙️</span>
              <div>
                <h3 style="font-size:17px; margin:0; font-weight:700; color:#fff;">ANLGRAM Settings Terminal</h3>
                <span style="font-size:11px; color:#94a3b8;">Institutional Configuration & Preferences</span>
              </div>
            </div>
            <button onclick="closeSettingsModal()" style="background:none; border:none; color:#888; font-size:22px; cursor:pointer; padding:4px;">✕</button>
          </div>

          <!-- Main Layout -->
          <div style="display:flex; flex:1; overflow:hidden;">
            
            <!-- Side Navigation Tabs -->
            <div style="width:200px; background:#0f141c; border-right:1px solid rgba(255,255,255,0.08); padding:12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto;">
              <button onclick="switchSettingsTab('general')" id="stab-general" class="stab-btn active">🌐 General</button>
              <button onclick="switchSettingsTab('appearance')" id="stab-appearance" class="stab-btn">🎨 Apariencia</button>
              <button onclick="switchSettingsTab('dashboard')" id="stab-dashboard" class="stab-btn">📊 Dashboard</button>
              <button onclick="switchSettingsTab('refresh')" id="stab-refresh" class="stab-btn">⏱️ Data Refresh</button>
              <button onclick="switchSettingsTab('wallet')" id="stab-wallet" class="stab-btn">🔑 Wallet</button>
              <button onclick="switchSettingsTab('notifications')" id="stab-notifications" class="stab-btn">🔔 Notificaciones</button>
              <button onclick="switchSettingsTab('security')" id="stab-security" class="stab-btn">🛡️ Seguridad</button>
              <button onclick="switchSettingsTab('info')" id="stab-info" class="stab-btn">ℹ️ Información</button>
            </div>

            <!-- Content Area -->
            <div style="flex:1; padding:24px; overflow-y:auto; background:#0b0f14;">
              
              <!-- Tab 1: General -->
              <div id="set-content-general" class="set-tab-content">
                <h4 class="set-section-title">General Preferences</h4>
                <p style="font-size:12px; color:#94a3b8; margin-bottom:16px;">Configuración regional, tema visual predeterminado y tipografía.</p>
                
                <div class="set-group">
                  <label class="set-label">🌐 Idioma (Language):</label>
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button onclick="setLanguage('en')" id="lang-en" class="setting-opt-btn">English (US)</button>
                    <button onclick="setLanguage('es')" id="lang-es" class="setting-opt-btn">Español (ES)</button>
                  </div>
                </div>

                <div class="set-group">
                  <label class="set-label">🌙 Tema Base (Theme):</label>
                  <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                    <button onclick="setTheme('cyberpunk')" id="theme-cyberpunk" class="setting-opt-btn">🌙 Dark Mode</button>
                    <button onclick="setTheme('midnight')" id="theme-midnight" class="setting-opt-btn">🖤 OLED Black</button>
                    <button onclick="setTheme('matrix')" id="theme-matrix" class="setting-opt-btn">🐍 Matrix</button>
                  </div>
                </div>

                <div class="set-group">
                  <label class="set-label">🔤 Tamaño de Fuente (Font Size):</label>
                  <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                    <button onclick="setFontSize('small')" id="fontsize-small" class="setting-opt-btn">Pequeño (13px)</button>
                    <button onclick="setFontSize('medium')" id="fontsize-medium" class="setting-opt-btn">Normal (15px)</button>
                    <button onclick="setFontSize('large')" id="fontsize-large" class="setting-opt-btn">Grande (17px)</button>
                  </div>
                </div>

                <div style="margin-top:24px; border-top:1px solid rgba(255,255,255,0.08); padding-top:16px;">
                  <button onclick="factoryResetPlatform()" class="set-btn-danger" style="width:100%;">🔄 Restablecer Configuración Predeterminada</button>
                </div>
              </div>

              <!-- Tab 2: Appearance -->
              <div id="set-content-appearance" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Apariencia & Color Accent</h4>
                <p style="font-size:12px; color:#94a3b8; margin-bottom:16px;">Personaliza luces, animaciones y presentación gráfica.</p>

                <div class="set-group">
                  <label class="set-label">🎨 Color de Acento (Accent Color):</label>
                  <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
                    <button onclick="setAccentColor('#3B82F6')" id="accent-blue" class="setting-opt-btn">🔵 Blue (#3B82F6)</button>
                    <button onclick="setAccentColor('#06B6D4')" id="accent-cyan" class="setting-opt-btn">🩵 Cyan (#06B6D4)</button>
                    <button onclick="setAccentColor('#10B981')" id="accent-green" class="setting-opt-btn">🟢 Emerald (#10B981)</button>
                    <button onclick="setAccentColor('#8B5CF6')" id="accent-purple" class="setting-opt-btn">💜 Purple (#8B5CF6)</button>
                    <button onclick="setAccentColor('#F59E0B')" id="accent-gold" class="setting-opt-btn">💛 Gold (#F59E0B)</button>
                  </div>
                </div>

                <div class="set-group" style="display:flex; flex-direction:column; gap:10px;">
                  <label class="set-toggle-row">
                    <span>✨ Animaciones Fluidas de Interfaz</span>
                    <input type="checkbox" id="setting-anim" onchange="toggleAnimations(this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>💎 Resplandor Neón & Glassmorphism</span>
                    <input type="checkbox" id="setting-glow" onchange="toggleGlows(this.checked)" checked />
                  </label>
                </div>

                <div class="set-group">
                  <label class="set-label">📈 Estilo de Gráficos:</label>
                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button onclick="setChartStyle('full')" id="chartstyle-full" class="setting-opt-btn">TradingView Full</button>
                    <button onclick="setChartStyle('compact')" id="chartstyle-compact" class="setting-opt-btn">Compact DEX</button>
                  </div>
                </div>
              </div>

              <!-- Tab 3: Dashboard -->
              <div id="set-content-dashboard" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Tarjetas del Dashboard</h4>
                <p style="font-size:12px; color:#94a3b8; margin-bottom:16px;">Selecciona las tarjetas visibles en el panel de control:</p>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                  <label class="set-toggle-row">
                    <span>₿ Bitcoin (BTC) Card</span>
                    <input type="checkbox" id="card-toggle-btc" onchange="toggleDashboardCard('btc', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>Ξ Ethereum (ETH) Card</span>
                    <input type="checkbox" id="card-toggle-eth" onchange="toggleDashboardCard('eth', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>💎 Toncoin (TON) Card</span>
                    <input type="checkbox" id="card-toggle-ton" onchange="toggleDashboardCard('ton', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>⚡ ANLGRAM Token Card</span>
                    <input type="checkbox" id="card-toggle-anl" onchange="toggleDashboardCard('anl', this.checked)" checked />
                  </label>
                </div>

                <button onclick="saveDashboardLayout()" class="set-btn-primary" style="width:100%;">💾 Guardar Disposición del Dashboard</button>
              </div>

              <!-- Tab 4: Data Refresh -->
              <div id="set-content-refresh" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Actualización de Datos en Tiempo Real</h4>
                <p style="font-size:12px; color:#94a3b8; margin-bottom:16px;">Ajusta la frecuencia de auto-refresh de cotizaciones DEX/CEX.</p>

                <div class="set-group">
                  <label class="set-label">⏱️ Frecuencia de Polling (Segundos):</label>
                  <select id="setting-polling-select" onchange="setPollingInterval(this.value)" class="set-select">
                    <option value="5">⚡ 5 segundos (Tiempo Real Rápido)</option>
                    <option value="10">💠 10 segundos (Recomendado)</option>
                    <option value="30">⏱️ 30 segundos (Estándar)</option>
                    <option value="60">🌱 60 segundos (Ahorro Batería/Datos)</option>
                  </select>
                </div>

                <div class="set-group">
                  <label class="set-toggle-row">
                    <span>🔄 Polling Automático Activo</span>
                    <input type="checkbox" id="setting-autorefresh-check" onchange="toggleAutoRefresh(this.checked)" checked />
                  </label>
                </div>

                <div style="margin-top:20px;">
                  <button onclick="triggerImmediateRefresh()" class="set-btn-primary" style="width:100%;">🔄 Actualizar Cotizaciones Ahora</button>
                </div>
              </div>

              <!-- Tab 5: Wallet -->
              <div id="set-content-wallet" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Billetera TON Conectada</h4>

                <div style="background:#121821; border:1px solid rgba(255,255,255,0.08); padding:16px; border-radius:14px; margin-bottom:20px;">
                  <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-size:12px; color:#94a3b8;">Estado:</span>
                    <span id="set-wallet-status" style="font-weight:700; color:#22c55e;">Desconectado</span>
                  </div>
                  <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-size:12px; color:#94a3b8;">Dirección:</span>
                    <span id="set-wallet-addr" style="font-family:monospace; font-weight:700; color:#3b82f6;">--</span>
                  </div>
                  <div style="display:flex; justify-content:space-between;">
                    <span style="font-size:12px; color:#94a3b8;">Balance:</span>
                    <span id="set-wallet-bal" style="font-weight:700; color:#fff;">-- TON</span>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
                  <button onclick="window.openWalletModal()" class="set-btn-primary">⚡ Conectar Billetera</button>
                  <button onclick="window.disconnectWallet()" class="set-btn-danger">🚫 Desconectar</button>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                  <button onclick="copyConnectedAddress()" class="set-btn-secondary">📋 Copiar Dirección</button>
                  <button onclick="openInExplorer()" class="set-btn-secondary">🔗 Abrir en TON Explorer</button>
                </div>
              </div>

              <!-- Tab 6: Notifications -->
              <div id="set-content-notifications" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Notificaciones & Alertas On-Chain</h4>

                <div style="display:flex; flex-direction:column; gap:12px;">
                  <label class="set-toggle-row">
                    <span>🔔 Notificaciones Globales de Sistema</span>
                    <input type="checkbox" id="notif-opt-global" onchange="toggleNotifOpt('global', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>📈 Alertas de Precio (>5%)</span>
                    <input type="checkbox" id="notif-opt-price" onchange="toggleNotifOpt('price', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>🟢 Alertas de Grandes Compras</span>
                    <input type="checkbox" id="notif-opt-buy" onchange="toggleNotifOpt('buy', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>🔴 Alertas de Grandes Ventas</span>
                    <input type="checkbox" id="notif-opt-sell" onchange="toggleNotifOpt('sell', this.checked)" checked />
                  </label>
                  <label class="set-toggle-row">
                    <span>🐋 Alertas de Transferencias Whale</span>
                    <input type="checkbox" id="notif-opt-whale" onchange="toggleNotifOpt('whale', this.checked)" checked />
                  </label>
                </div>
              </div>

              <!-- Tab 7: Security -->
              <div id="set-content-security" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Seguridad y Mantenimiento de Memoria</h4>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
                  <label class="set-toggle-row">
                    <span>🛡️ Confirmar Operaciones Importantes</span>
                    <input type="checkbox" id="sec-opt-confirm" onchange="toggleSecOpt('confirm', this.checked)" checked />
                  </label>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px;">
                  <button onclick="clearLocalCache()" class="set-btn-secondary">🧹 Borrar Caché Local</button>
                  <button onclick="factoryResetPlatform()" class="set-btn-danger">⚠️ Restablecer Configuración de Fábrica</button>
                </div>
              </div>

              <!-- Tab 8: Info -->
              <div id="set-content-info" class="set-tab-content" style="display:none;">
                <h4 class="set-section-title">Información del Sistema</h4>

                <div style="background:#121821; border:1px solid rgba(255,255,255,0.08); padding:18px; border-radius:14px; font-size:13px; display:flex; flex-direction:column; gap:10px;">
                  <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Versión:</span><span style="font-weight:700; color:#3b82f6;">v2026.14 (Institutional Edition)</span></div>
                  <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Estado del Sistema:</span><span style="font-weight:700; color:#22c55e;">Operational 🟢</span></div>
                  <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Conexión RPC:</span><span style="font-weight:700; color:#06b6d4;">Online (TON API v2)</span></div>
                  <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">Última Sincronización:</span><span id="sys-sync-time" style="font-weight:600; color:#fff;">Just now</span></div>
                </div>
              </div>

            </div>
          </div>

          <!-- Bottom Footer -->
          <div style="padding:14px 24px; border-top:1px solid rgba(255,255,255,0.08); background:#121821; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:11px; color:#64748b;">ANLGRAM Web3 Protocol · Settings Auto-saved</span>
            <button onclick="saveAndCloseSettings()" class="set-btn-primary" style="padding:8px 20px; font-size:13px;">💾 Aplicar y Cerrar</button>
          </div>

        </div>
      `;
      document.body.appendChild(setDiv);
    }
if (!document.getElementById('notificationsModal')) {
      const notifDiv = document.createElement('div');
      notifDiv.id = 'notificationsModal';
      notifDiv.style.cssText = 'display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(16px); z-index:1000000; align-items:center; justify-content:center; padding:16px;';
      notifDiv.innerHTML = `
        <div style="background:#111116; border:1px solid #00CFFF; border-radius:24px; max-width:500px; width:100%; padding:24px; box-shadow:0 0 40px rgba(0,207,255,0.25); color:#fff; position:relative; max-height:85vh; display:flex; flex-direction:column; text-align:left;">
          <button onclick="closeNotificationsModal()" style="position:absolute; top:20px; right:20px; background:transparent; border:none; color:#888; font-size:20px; cursor:pointer;">✕</button>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:14px;">
            <span style="font-size:24px;">📡</span>
            <div>
              <h2 style="font-size:18px; margin:0; font-weight:700; color:#00CFFF;">Centro de Notificaciones On-Chain</h2>
              <span style="font-size:12px; color:#888;">Alertas en vivo sobre movimientos y transacciones en TON</span>
            </div>
          </div>

          <div style="display:flex; gap:6px; margin-bottom:16px; overflow-x:auto; padding-bottom:4px;">
            <button onclick="filterNotifications('all')" id="notif-tab-all" class="notif-tab-btn active" style="padding:6px 12px; border-radius:16px; background:rgba(0,207,255,0.2); border:1px solid #00CFFF; color:#00CFFF; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap;">💠 Todas</button>
            <button onclick="filterNotifications('whales')" id="notif-tab-whales" class="notif-tab-btn" style="padding:6px 12px; border-radius:16px; background:#1a1a24; border:1px solid #333; color:#aaa; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">🐋 Ballenas</button>
            <button onclick="filterNotifications('defi')" id="notif-tab-defi" class="notif-tab-btn" style="padding:6px 12px; border-radius:16px; background:#1a1a24; border:1px solid #333; color:#aaa; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">💎 DeFi & Swaps</button>
            <button onclick="filterNotifications('security')" id="notif-tab-security" class="notif-tab-btn" style="padding:6px 12px; border-radius:16px; background:#1a1a24; border:1px solid #333; color:#aaa; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">🛡️ Seguridad</button>
          </div>

          <div id="notifFeedList" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:12px; margin-bottom:18px; padding-right:4px;">
            <!-- Notifications dynamically rendered here -->
          </div>

          <div style="display:flex; gap:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:16px;">
            <button onclick="markAllNotifAsRead()" style="flex:1; background:rgba(0,136,204,0.2); color:#00CFFF; font-weight:700; padding:10px; border-radius:12px; border:1px solid #0088CC; cursor:pointer; font-size:12px;">✓ Marcar como leídas</button>
            <button onclick="window.location.href='alerts.html'" style="flex:1; background:#00CFFF; color:#000; font-weight:700; padding:10px; border-radius:12px; border:none; cursor:pointer; font-size:12px; box-shadow:0 0 15px rgba(0,207,255,0.3);">💠 Configurar Alertas</button>
            <button onclick="clearAllNotifications()" title="Borrar Historial" style="padding:10px 14px; background:rgba(255,255,255,0.05); color:#888; border:1px solid rgba(255,255,255,0.1); border-radius:12px; cursor:pointer; font-size:14px;">🗑️</button>
          </div>
        </div>
      `;
      document.body.appendChild(notifDiv);
    }

    // Auto-inject Connect Wallet button into topbar if missing
    const topbarActions = document.querySelector('.topbar-actions') || document.querySelector('.nav-cta');
    if (topbarActions && !document.getElementById('topbarWalletBtn')) {
      const btn = document.createElement('button');
      btn.id = 'topbarWalletBtn';
      btn.className = 'btn btn-primary btn-sm';
      btn.style.marginLeft = '12px';
      btn.textContent = 'Connect Wallet';
      // Wallet click handled by wallet-connect.js
      topbarActions.appendChild(btn);
    }

    // Auto-inject or bind Settings button in topbar
    if (topbarActions && !document.getElementById('topbarSettingsBtn')) {
      let settingsBtn = topbarActions.querySelector('button[title="Settings"]') || topbarActions.querySelector('button[title="Ajustes"]');
      if (!settingsBtn) {
        settingsBtn = document.createElement('button');
        settingsBtn.className = 'topbar-btn';
        settingsBtn.title = 'Settings';
        settingsBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06-.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
        const walletBtn = document.getElementById('topbarWalletBtn');
        if (walletBtn && walletBtn.parentNode === topbarActions) {
          topbarActions.insertBefore(settingsBtn, walletBtn);
        } else {
          topbarActions.appendChild(settingsBtn);
        }
      }
      settingsBtn.id = 'topbarSettingsBtn';
      settingsBtn.onclick = (e) => { e.preventDefault(); window.openSettingsModal(); };
    } else if (document.getElementById('topbarSettingsBtn')) {
      document.getElementById('topbarSettingsBtn').onclick = (e) => { e.preventDefault(); window.openSettingsModal(); };
    }

    document.querySelectorAll('button[title="Settings"], button[title="Ajustes"], #topbarSettingsBtn, .settings-btn').forEach(b => {
      b.onclick = (e) => { e.preventDefault(); window.openSettingsModal(); };
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[title="Settings"], button[title="Ajustes"], #topbarSettingsBtn, .settings-btn');
      if (btn) {
        e.preventDefault();
        window.openSettingsModal();
      }
    });

    // Auto-inject or bind Notifications button in topbar
    if (topbarActions && !document.getElementById('topbarNotifBtn')) {
      let notifBtn = topbarActions.querySelector('button[title="Notifications"]') || topbarActions.querySelector('button[title="Notificaciones"]');
      if (!notifBtn) {
        notifBtn = document.createElement('button');
        notifBtn.className = 'topbar-btn';
        notifBtn.title = 'Notifications';
        notifBtn.style.position = 'relative';
        notifBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
        const settingsBtnRef = document.getElementById('topbarSettingsBtn') || topbarActions.querySelector('button[title="Settings"]') || topbarActions.querySelector('button[title="Ajustes"]');
        if (settingsBtnRef && settingsBtnRef.parentNode === topbarActions) {
          topbarActions.insertBefore(notifBtn, settingsBtnRef);
        } else {
          topbarActions.appendChild(notifBtn);
        }
      }
      notifBtn.id = 'topbarNotifBtn';
    }

    // Bind click handlers and badge to all notifications buttons across all pages
    document.querySelectorAll('button[title="Notifications"], button[title="Notificaciones"], #topbarNotifBtn').forEach(b => {
      b.style.position = 'relative';
      if (!b.querySelector('#topbarNotifBadge') && !b.querySelector('.nav-badge')) {
        let notifs = JSON.parse(localStorage.getItem('anlgram_notifications') || 'null');
        const unreadCount = notifs ? notifs.filter(n => !n.read).length : 3;
        if (unreadCount > 0) {
          const badge = document.createElement('span');
          badge.id = 'topbarNotifBadge';
          badge.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#00CFFF;color:#000;font-size:9px;font-weight:800;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px #00CFFF;pointer-events:none;';
          badge.textContent = unreadCount;
          b.appendChild(badge);
        }
      }
      b.onclick = (e) => { e.preventDefault(); window.openNotificationsModal(); };
    });

    // Auto-inject Universal Mobile Bottom Navigation Bar
    if (!document.getElementById('mobileBottomNav')) {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const nav = document.createElement('nav');
      nav.id = 'mobileBottomNav';
      nav.className = 'mobile-bottom-nav';
      nav.style.cssText = 'display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 68px; background: rgba(13, 13, 18, 0.96); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 1px solid rgba(0, 240, 255, 0.25); box-shadow: 0 -10px 30px rgba(0,0,0,0.8); z-index: 999999; flex-direction: row; justify-content: space-around; align-items: center; padding: 0 4px; margin: 0;';
      
      const items = [
        { name: 'Inicio', href: 'index.html', icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        { name: 'Wallet', href: '#', onclick: 'openWalletModal(); return false;', icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
        { name: 'Dash', href: 'dashboard.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
        { name: 'Explorar', href: 'explorer.html', icon: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>' },
        { name: 'Flows', href: 'visualizer.html', icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51 15.42 17.49M15.41 6.51 8.59 10.49"/>' },
        { name: 'Intel', href: 'intel-exchange.html', icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>' },
        { name: 'Alertas', href: 'alerts.html', icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
        { name: 'Ajustes', href: '#', onclick: 'openSettingsModal(); return false;', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06-.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06-.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' }
      ];

      nav.innerHTML = items.map(item => {
        const isActive = currentPage === item.href || (currentPage === '' && item.href === 'index.html');
        return `
          <a href="${item.href}" ${item.onclick ? `onclick="${item.onclick}"` : ''} class="mobile-nav-item ${isActive ? 'active' : ''}" style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; gap: 3px !important; color: ${isActive ? '#00f0ff' : '#64748b'} !important; text-decoration: none !important; font-size: 9px !important; font-weight: 600 !important; padding: 4px 5px !important; flex: 1 !important; text-align: center !important; margin: 0 !important; background: ${isActive ? 'rgba(0,240,255,0.1)' : 'transparent'} !important; border-radius: 12px !important;">
            <svg width="20" height="20" style="width: 18px !important; height: 18px !important; min-width: 18px !important; max-width: 18px !important; flex-shrink: 0 !important; margin: 0 auto !important; display: block !important;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
            <span style="font-size: 9px !important; line-height: 1 !important; display: block !important; margin: 0 !important;">${item.name}</span>
          </a>
        `;
      }).join('');

      document.body.appendChild(nav);
    }

    // ── Device Recognition & Layout Adapter System ───────────────
    function initDeviceRecognition() {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth <= 768;
      const isPhone = isSmallScreen || (isMobileDevice && window.innerWidth <= 1024);
      const nav = document.getElementById('mobileBottomNav');
      
      if (isPhone) {
        document.documentElement.classList.add('device-phone');
        document.documentElement.classList.remove('device-pc');
        if (document.body) {
          document.body.classList.add('device-phone');
          document.body.classList.remove('device-pc');
        }
        if (nav && window.innerWidth <= 768) {
          nav.style.display = 'flex';
          nav.style.flexDirection = 'row';
        } else if (nav) {
          nav.style.display = 'none';
        }
      } else {
        document.documentElement.classList.add('device-pc');
        document.documentElement.classList.remove('device-phone');
        if (document.body) {
          document.body.classList.add('device-pc');
          document.body.classList.remove('device-phone');
        }
        if (nav) nav.style.display = 'none';
      }

      let devicePill = document.getElementById('anlgramDevicePill');
      if (!devicePill) {
        const targetContainer = document.querySelector('.topbar-actions') || document.querySelector('.nav-cta');
        if (targetContainer) {
          devicePill = document.createElement('div');
          devicePill.id = 'anlgramDevicePill';
          devicePill.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:99px; font-size:11px; font-weight:600; font-family:var(--font-mono, monospace); margin-right:8px; border:1px solid rgba(0, 240, 255, 0.25); background:rgba(0, 240, 255, 0.08); color:#00f0ff; transition:all 0.3s ease; white-space:nowrap; cursor:default;';
          targetContainer.insertBefore(devicePill, targetContainer.firstChild);
        }
      }

      if (devicePill) {
        if (isPhone) {
          devicePill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#00e676;display:inline-block;box-shadow:0 0 8px #00e676;"></span> 📱 Modo Móvil';
          devicePill.title = 'Plataforma adaptada para experiencia táctil en Móvil / Tablet';
        } else {
          devicePill.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#00f0ff;display:inline-block;box-shadow:0 0 8px #00f0ff;"></span> 💻 Modo PC';
          devicePill.title = 'Plataforma optimizada para experiencia de Escritorio (PC)';
        }
      }
    }

    initDeviceRecognition();
    window.addEventListener('resize', initDeviceRecognition);

    
  }

  // Ensure initialization happens regardless of when script is executed
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initWalletManager);
  } else {
    initWalletManager();
  }

  // Bulletproof Event Delegation: catch any clicks on Connect Wallet buttons
  
  
  window.showWalletToast = function(title, desc, dur = 2500) {
    initWalletManager();
    const t = document.getElementById('walletToastPopup');
    const tTitle = document.getElementById('walletToastTitle');
    const tDesc = document.getElementById('walletToastDesc');
    if (t && tTitle && tDesc) {
      tTitle.textContent = title;
      tDesc.textContent = desc;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), dur);
    }
  };


  
  
  
  
  
  
  // ── Multi-Tab Settings Control Panel Engine ────────────────────
  window.switchSettingsTab = function(tabName) {
    document.querySelectorAll('.stab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.set-tab-content').forEach(c => c.style.display = 'none');
    
    const activeTabBtn = document.getElementById('stab-' + tabName);
    if (activeTabBtn) activeTabBtn.classList.add('active');

    const content = document.getElementById('set-content-' + tabName);
    if (content) content.style.display = 'block';
  };

  window.updateSettingsUIState = function() {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    
    // Lang
    document.querySelectorAll('[id^="lang-"]').forEach(b => b.classList.remove('active'));
    const langBtn = document.getElementById('lang-' + (s.lang || 'en'));
    if (langBtn) langBtn.classList.add('active');

    // Font size
    document.querySelectorAll('[id^="fontsize-"]').forEach(b => b.classList.remove('active'));
    const fontBtn = document.getElementById('fontsize-' + (s.fontSize || 'medium'));
    if (fontBtn) fontBtn.classList.add('active');

    // Accent
    document.querySelectorAll('[id^="accent-"]').forEach(b => b.classList.remove('active'));
    if (s.accentColor) {
      if (s.accentColor === '#3B82F6') document.getElementById('accent-blue')?.classList.add('active');
      else if (s.accentColor === '#06B6D4') document.getElementById('accent-cyan')?.classList.add('active');
      else if (s.accentColor === '#10B981') document.getElementById('accent-green')?.classList.add('active');
      else if (s.accentColor === '#8B5CF6') document.getElementById('accent-purple')?.classList.add('active');
      else if (s.accentColor === '#F59E0B') document.getElementById('accent-gold')?.classList.add('active');
    } else {
      document.getElementById('accent-blue')?.classList.add('active');
    }

    // Chart style
    document.querySelectorAll('[id^="chartstyle-"]').forEach(b => b.classList.remove('active'));
    const chartBtn = document.getElementById('chartstyle-' + (s.chartStyle || 'full'));
    if (chartBtn) chartBtn.classList.add('active');

    // Polling
    const pSel = document.getElementById('setting-polling-select');
    if (pSel) pSel.value = s.polling || '30';

    // Wallet status
    const addr = localStorage.getItem('anlgram_wallet_addr');
    const stEl = document.getElementById('set-wallet-status');
    const adEl = document.getElementById('set-wallet-addr');
    if (stEl && adEl) {
      if (addr) {
        stEl.textContent = 'Conectado 🟢';
        stEl.style.color = '#22c55e';
        adEl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
      } else {
        stEl.textContent = 'Desconectado ⚪';
        stEl.style.color = '#94a3b8';
        adEl.textContent = '--';
      }
    }
  };

  window.setLanguage = function(lang) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.lang = lang;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    showWalletToast('🌐 Idioma Actualizado', `Idioma configurado a: ${lang === 'es' ? 'Español' : 'English'}`);
    updateSettingsUIState();
  };

  window.setFontSize = function(size) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.fontSize = size;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
    showWalletToast('🔤 Fuente Cambiada', `Tamaño de letra: ${size}`);
    updateSettingsUIState();
  };

  window.setAccentColor = function(color) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.accentColor = color;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
    showWalletToast('🎨 Color Cambiado', `Nuevo color de acento aplicado.`);
    updateSettingsUIState();
  };

  window.toggleAnimations = function(enabled) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.animations = enabled;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
  };

  window.toggleGlows = function(enabled) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.glows = enabled;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
  };

  window.setChartStyle = function(style) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.chartStyle = style;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    showWalletToast('📈 Estilo de Gráfico', `Estilo cambiado a ${style}`);
    updateSettingsUIState();
  };

  window.toggleDashboardCard = function(cardKey, visible) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    if (!s.cards) s.cards = {};
    s.cards[cardKey] = visible;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
  };

  window.saveDashboardLayout = function() {
    showWalletToast('💾 Disposición Guardada', 'La configuración de tarjetas del panel fue guardada.');
  };

  window.setPollingInterval = function(sec) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.polling = sec;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    showWalletToast('⏱️ Polling Actualizado', `Intervalo fijado en ${sec} segundos.`);
  };

  window.toggleAutoRefresh = function(enabled) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.autoRefresh = enabled;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
  };

  window.triggerImmediateRefresh = function() {
    if (typeof fetchLivePrices === 'function') fetchLivePrices();
    showWalletToast('🔄 Refresco Inmediato', 'Obteniendo cotizaciones actualizadas...');
  };

  window.copyConnectedAddress = function() {
    const addr = localStorage.getItem('anlgram_wallet_addr');
    if (!addr) {
      showWalletToast('⚠️ Wallet no conectada', 'Conecta tu billetera primero.');
      return;
    }
    navigator.clipboard.writeText(addr);
    showWalletToast('📋 Copiado', 'Dirección de billetera copiada al portapapeles.');
  };

  window.openInExplorer = function() {
    const addr = localStorage.getItem('anlgram_wallet_addr');
    if (addr) {
      window.open(`https://tonviewer.com/${addr}`, '_blank');
    } else {
      window.open('https://tonviewer.com', '_blank');
    }
  };

  window.toggleNotifOpt = function(key, enabled) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    if (!s.notifs) s.notifs = {};
    s.notifs[key] = enabled;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
  };

  window.toggleSecOpt = function(key, enabled) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    if (!s.security) s.security = {};
    s.security[key] = enabled;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
  };

  window.clearLocalCache = function() {
    const walletAddr = localStorage.getItem('anlgram_wallet_addr');
    const walletName = localStorage.getItem('anlgram_wallet_name');
    localStorage.clear();
    if (walletAddr) localStorage.setItem('anlgram_wallet_addr', walletAddr);
    if (walletName) localStorage.setItem('anlgram_wallet_name', walletName);
    showWalletToast('🧹 Caché Limpiado', 'Los datos locales temporales se han borrado.');
  };

  window.factoryResetPlatform = function() {
    if (confirm('¿Estás seguro de que deseas restablecer todos los ajustes a los valores de fábrica?')) {
      localStorage.removeItem('anlgram_user_settings');
      applyAnlgramSettings();
      updateSettingsUIState();
      showWalletToast('⚠️ Restablecido', 'La plataforma se ha restaurado a valores por defecto.');
    }
  };
window.openSettingsModal = function() {
    initWalletManager();
    updateSettingsUIState();
    initWalletManager();
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      const settings = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{"theme":"cyberpunk","currency":"USD","polling":"15","mask":true,"sound":true}');
      
      document.querySelectorAll('.setting-opt-btn').forEach(b => {
        b.style.borderColor = '#333';
        b.style.background = '#1a1a24';
        b.style.color = '#fff';
      });
      if (settings.theme === 'gold' || settings.theme === 'glacier') settings.theme = 'cyberpunk';
      const tBtn = document.getElementById('theme-' + (settings.theme || 'cyberpunk'));
      if (tBtn) { tBtn.style.borderColor = '#00f0ff'; tBtn.style.background = 'rgba(0,240,255,0.15)'; tBtn.style.color = '#00f0ff'; }
      
      const cBtn = document.getElementById('curr-' + (settings.currency || 'USD'));
      if (cBtn) { cBtn.style.borderColor = '#00f0ff'; cBtn.style.background = 'rgba(0,240,255,0.15)'; cBtn.style.color = '#00f0ff'; }

      const pSel = document.getElementById('setting-polling');
      if (pSel) pSel.value = settings.polling || '15';

      const mChk = document.getElementById('setting-mask');
      if (mChk) mChk.checked = settings.mask !== false;

      const sChk = document.getElementById('setting-sound');
      if (sChk) sChk.checked = settings.sound !== false;
    }
  };

  window.closeSettingsModal = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  };

  window.setTheme = function(t) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.theme = t;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
    openSettingsModal();
    playAnlgramSound('bleep');
  };

  window.setCurrency = function(c) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.currency = c;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
    openSettingsModal();
    playAnlgramSound('bleep');
  };

  window.setPolling = function(p) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.polling = p;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    showWalletToast('⏱️ Frecuencia Cambiada', `Actualización fijada cada ${p} segundos.`);
    playAnlgramSound('bleep');
  };

  window.toggleMask = function(m) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.mask = m;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    applyAnlgramSettings();
  };

  window.toggleSound = function(snd) {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    s.sound = snd;
    localStorage.setItem('anlgram_user_settings', JSON.stringify(s));
    if (snd) playAnlgramSound('bleep');
  };

  window.saveAndCloseSettings = function() {
    closeSettingsModal();
    showWalletToast('⚙️ Ajustes Guardados', 'Tu configuración personalizada ha sido aplicada exitosamente.');
    playAnlgramSound('bleep');
  };

  window.openNotificationsModal = function() {
    initWalletManager();
    const modal = document.getElementById('notificationsModal');
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      renderNotificationsList('all');
      playAnlgramSound('bleep');
    }
  };

  window.closeNotificationsModal = function() {
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.style.setProperty('display', 'none', 'important');
  };

  window.filterNotifications = function(cat) {
    document.querySelectorAll('.notif-tab-btn').forEach(b => {
      b.style.background = '#1a1a24';
      b.style.borderColor = '#333';
      b.style.color = '#aaa';
      b.classList.remove('active');
    });
    const activeBtn = document.getElementById('notif-tab-' + cat);
    if (activeBtn) {
      activeBtn.style.background = 'rgba(0,207,255,0.2)';
      activeBtn.style.borderColor = '#00CFFF';
      activeBtn.style.color = '#00CFFF';
      activeBtn.classList.add('active');
    }
    renderNotificationsList(cat);
  };

  window.renderNotificationsList = function(cat = 'all') {
    const feed = document.getElementById('notifFeedList');
    if (!feed) return;

    let notifs = JSON.parse(localStorage.getItem('anlgram_notifications') || 'null');
    if (!notifs || !notifs.length) {
      notifs = [
        { id: 1, type: 'whales', title: '🐋 Movimiento de Ballena GRAM', text: 'Transferencia masiva de 500,000 GRAM ($1.25M USD) hacia Binance Hot Wallet 7.', time: 'Hace 3 min', read: false, url: 'explorer.html?q=Binance' },
        { id: 2, type: 'defi', title: '💎 Pico de Volumen en Ston.fi Pool', text: 'El par GRAM/TON superó los $850,000 USD en volumen continuo en 15 min.', time: 'Hace 18 min', read: false, url: 'visualizer.html' },
        { id: 3, type: 'security', title: '🛡️ Auditoría de Seguridad On-Chain', text: 'Los contratos de liquidez en DeDust Router han sido verificados y sin anomalías.', time: 'Hace 45 min', read: false, url: 'intel-exchange.html' },
        { id: 4, type: 'whales', title: '🐋 Alerta de Custodia Institucional', text: 'Bybit Institutional Hot Wallet acumuló +120,000 TON en reserva de staking.', time: 'Hace 2 horas', read: true, url: 'explorer.html?q=Bybit' }
      ];
      localStorage.setItem('anlgram_notifications', JSON.stringify(notifs));
    }

    const filtered = cat === 'all' ? notifs : notifs.filter(n => n.type === cat);

    if (filtered.length === 0) {
      feed.innerHTML = `<div style="text-align:center; padding:30px; color:#666; font-size:13px;">No hay notificaciones en esta categoría.</div>`;
      return;
    }

    feed.innerHTML = filtered.map(n => `
      <div onclick="${n.url ? `window.location.href='${n.url}'` : ''}" style="background: ${n.read ? 'rgba(255,255,255,0.02)' : 'rgba(0,136,204,0.1)'}; border: 1px solid ${n.read ? 'rgba(255,255,255,0.06)' : 'rgba(0,207,255,0.3)'}; border-radius: 14px; padding: 14px; display:flex; gap: 12px; align-items:flex-start; cursor:pointer; transition:all 0.2s;">
        <div style="font-size:20px; background:rgba(0,207,255,0.1); width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${n.title.split(' ')[0]}</div>
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:13px; font-weight:700; color:${n.read ? '#ccc' : '#00CFFF'};">${n.title.substring(n.title.indexOf(' ')+1)}</span>
            <span style="font-size:11px; color:#666;">${n.time}</span>
          </div>
          <div style="font-size:12px; color:#94a3b8; line-height:1.4;">${n.text}</div>
        </div>
        ${!n.read ? `<div style="width:8px; height:8px; border-radius:50%; background:#00CFFF; box-shadow:0 0 8px #00CFFF; align-self:center;"></div>` : ''}
      </div>
    `).join('');
  };

  window.markAllNotifAsRead = function() {
    let notifs = JSON.parse(localStorage.getItem('anlgram_notifications') || '[]');
    notifs.forEach(n => n.read = true);
    localStorage.setItem('anlgram_notifications', JSON.stringify(notifs));
    renderNotificationsList('all');
    document.querySelectorAll('#topbarNotifBadge, .nav-badge').forEach(b => b.style.display = 'none');
    showWalletToast('✅ Leídas', 'Todas las alertas y notificaciones marcadas como leídas.');
    playAnlgramSound('bleep');
  };

  window.clearAllNotifications = function() {
    localStorage.setItem('anlgram_notifications', '[]');
    renderNotificationsList('all');
    document.querySelectorAll('#topbarNotifBadge, .nav-badge').forEach(b => b.style.display = 'none');
    showWalletToast('🗑️ Historial Limpio', 'Se han eliminado todas las notificaciones.');
  };

  window.playAnlgramSound = function(type = 'bleep') {
    const s = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    if (s.sound === false) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'bleep') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      } else {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
      }
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  window.applyAnlgramSettings = function() {
    const settings = JSON.parse(localStorage.getItem('anlgram_user_settings') || '{}');
    const root = document.documentElement;

    // Accent Color
    if (settings.accentColor) {
      root.style.setProperty('--accent-blue', settings.accentColor);
      root.style.setProperty('--border-accent', settings.accentColor + '66');
    }

    // Font size
    if (settings.fontSize === 'small') root.style.fontSize = '14px';
    else if (settings.fontSize === 'large') root.style.fontSize = '16px';
    else root.style.fontSize = '15px';

    // Dashboard Cards Visibility
    if (settings.cards) {
      if (settings.cards.btc === false) document.getElementById('card-btc')?.style.setProperty('display', 'none', 'important');
      else document.getElementById('card-btc')?.style.removeProperty('display');

      if (settings.cards.eth === false) document.getElementById('card-eth')?.style.setProperty('display', 'none', 'important');
      else document.getElementById('card-eth')?.style.removeProperty('display');

      if (settings.cards.ton === false) document.getElementById('card-ton')?.style.setProperty('display', 'none', 'important');
      else document.getElementById('card-ton')?.style.removeProperty('display');

      if (settings.cards.anl === false) document.getElementById('card-anl')?.style.setProperty('display', 'none', 'important');
      else document.getElementById('card-anl')?.style.removeProperty('display');
    }

    if (theme === 'midnight') {
      root.style.setProperty('--bg-void', '#000000');
      root.style.setProperty('--bg-primary', '#040405');
      root.style.setProperty('--bg-secondary', '#08080a');
      root.style.setProperty('--bg-sidebar', '#020203');
      root.style.setProperty('--bg-card', '#0a0a0d');
      root.style.setProperty('--cyan', '#00CFFF');
      root.style.setProperty('--ton-blue', '#0088CC');
    } else if (theme === 'matrix') {
      root.style.setProperty('--bg-void', '#040a06');
      root.style.setProperty('--bg-primary', '#060f08');
      root.style.setProperty('--bg-secondary', '#0a170d');
      root.style.setProperty('--bg-card', '#0d2112');
      root.style.setProperty('--cyan', '#00ff66');
      root.style.setProperty('--ton-blue', '#00cc44');
      root.style.setProperty('--border-cyan', 'rgba(0, 255, 102, 0.4)');
    } else if (theme === 'glacier' || theme === 'gold') {
      settings.theme = 'cyberpunk';
      localStorage.setItem('anlgram_user_settings', JSON.stringify(settings));
      root.style.setProperty('--bg-void', '#030712');
      root.style.setProperty('--bg-primary', '#050c1e');
      root.style.setProperty('--bg-secondary', '#08142c');
      root.style.setProperty('--bg-sidebar', '#040918');
      root.style.setProperty('--bg-card', '#0a1836');
      root.style.setProperty('--cyan', '#00CFFF');
      root.style.setProperty('--ton-blue', '#0088CC');
      root.style.setProperty('--border-cyan', 'rgba(0, 207, 255, 0.4)');
    } else {
      root.style.setProperty('--bg-void', '#030712');
      root.style.setProperty('--bg-primary', '#050c1e');
      root.style.setProperty('--bg-secondary', '#08142c');
      root.style.setProperty('--bg-sidebar', '#040918');
      root.style.setProperty('--bg-card', '#0a1836');
      root.style.setProperty('--cyan', '#00CFFF');
      root.style.setProperty('--ton-blue', '#0088CC');
      root.style.setProperty('--border-cyan', 'rgba(0, 207, 255, 0.4)');
    }

    const currency = settings.currency || 'USD';
    const priceEl = document.getElementById('topbar-price');
    if (priceEl && window.lastTonPriceVal) {
      if (currency === 'EUR') priceEl.textContent = '€' + (window.lastTonPriceVal * 0.92).toFixed(2);
      else if (currency === 'TON') priceEl.textContent = '1.00 💎';
      else if (currency === 'BTC') priceEl.textContent = '₿' + (window.lastTonPriceVal / 65000).toFixed(6);
      else priceEl.textContent = '$' + window.lastTonPriceVal.toFixed(2);
    }

    if (typeof updateWalletUI === 'function') updateWalletUI();
  };

  // Universal TON/GRAM Crystal Branding & Favicon Injector
  window.applyAnlgramBranding = function() {
    // 1. Inject Favicon & Domain Icon into Head if not already present or update existing
    let favSvg = document.querySelector('link[rel="icon"]');
    if (!favSvg) {
      favSvg = document.createElement('link');
      favSvg.rel = 'icon';
      favSvg.type = 'image/svg+xml';
      favSvg.href = 'favicon.svg?v=2';
      document.head.appendChild(favSvg);
    } else {
      favSvg.href = 'favicon.svg?v=2';
      favSvg.type = 'image/svg+xml';
    }

    let favIco = document.querySelector('link[rel="shortcut icon"]');
    if (!favIco) {
      favIco = document.createElement('link');
      favIco.rel = 'shortcut icon';
      favIco.href = 'favicon.ico?v=2';
      document.head.appendChild(favIco);
    } else {
      favIco.href = 'favicon.ico?v=2';
    }

    let appleIco = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIco) {
      appleIco = document.createElement('link');
      appleIco.rel = 'apple-touch-icon';
      appleIco.href = 'favicon.svg?v=2';
      document.head.appendChild(appleIco);
    } else {
      appleIco.href = 'favicon.svg?v=2';
    }

    // 2. Transform all nav-logo-icon and sidebar-logo-icon elements into TON Crystal emblems
    const logoIcons = document.querySelectorAll('.nav-logo-icon, .sidebar-logo-icon');
    logoIcons.forEach(icon => {
      if (!icon.querySelector('img')) {
        icon.style.background = 'transparent';
        icon.style.boxShadow = 'none';
        icon.style.padding = '0';
        icon.innerHTML = `<img src="assets/img/anlgram-icon.svg" alt="ANLGRAM Crystal" style="width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 0 8px rgba(0,207,255,0.4)); transition:transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.3s ease;">`;
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.applyAnlgramSettings();
      window.applyAnlgramBranding();
    });
  } else {
    window.applyAnlgramSettings();
    window.applyAnlgramBranding();
  }
})();

