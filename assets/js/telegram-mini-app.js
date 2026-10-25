/**
 * ANLGRAM Telegram Mini App (TMA) Integration Engine
 * Version: 2026.50
 *
 * Provides native Telegram WebApp lifecycle management, fullscreen expansion,
 * viewport handling, safe-area adjustments, native BackButton control, haptic feedback,
 * link routing, and unified mobile navigation for Telegram mobile and desktop clients.
 */
(function() {
  'use strict';

  const TMA_NAV_CONFIG = [
    {
      id: 'nav-home',
      label: 'Home',
      url: 'index.html',
      matchRegex: /(index\.html|^(\/[^\/]*\/)?$)/i,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    },
    {
      id: 'nav-explorer',
      label: 'Explorer',
      url: 'explorer.html',
      matchRegex: /explorer\.html/i,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>'
    },
    {
      id: 'nav-flow',
      label: 'Flow',
      url: 'visualizer.html',
      matchRegex: /visualizer\.html/i,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><circle cx="5" cy="18" r="2"/><path d="M10 10.5 6.5 7.5M14 10.5l3.5-3M10 13.5l-3.5 3M14 13.5l3.5 3"/></svg>'
    },
    {
      id: 'nav-staking',
      label: 'Staking',
      url: 'staking.html',
      matchRegex: /staking\.html/i,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
    },
    {
      id: 'nav-intel',
      label: 'Intel',
      url: 'intel-exchange.html',
      matchRegex: /intel-exchange\.html/i,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>'
    }
  ];

  let isTmaInitialized = false;

  function isTelegramEnvironment() {
    return Boolean(typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp && (window.Telegram.WebApp.initData || window.Telegram.WebApp.platform));
  }

  function getTelegramUser() {
    if (!isTelegramEnvironment()) return null;
    try {
      return window.Telegram.WebApp.initDataUnsafe?.user || null;
    } catch (e) {
      return null;
    }
  }

  function triggerHaptic(style = 'light') {
    if (!isTelegramEnvironment()) return;
    const haptic = window.Telegram.WebApp.HapticFeedback;
    if (!haptic) return;

    try {
      switch (style) {
        case 'light':
        case 'medium':
        case 'heavy':
        case 'rigid':
        case 'soft':
          haptic.impactOccurred(style);
          break;
        case 'success':
        case 'warning':
        case 'error':
          haptic.notificationOccurred(style);
          break;
        case 'selection':
          haptic.selectionChanged();
          break;
        default:
          haptic.impactOccurred('light');
      }
    } catch (err) {
      // Haptics fail gracefully if unsupported by the platform
    }
  }

  function updateViewportStyles() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    const vh = tg.viewportHeight || window.innerHeight;
    document.documentElement.style.setProperty('--tg-viewport-height', `${vh}px`);

    if (document.body) {
      document.body.style.minHeight = `${vh}px`;
    }
  }

  function setupNativeBackButton() {
    const tg = window.Telegram?.WebApp;
    if (!tg || !tg.BackButton) return;

    const path = window.location.pathname.toLowerCase();
    const isHome = path.endsWith('index.html') || path === '/' || path.endsWith('/anlgram/') || path === '';

    if (isHome) {
      try {
        tg.BackButton.hide();
      } catch (e) {}
    } else {
      try {
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
          triggerHaptic('light');
          if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
            window.history.back();
          } else {
            window.location.href = 'index.html';
          }
        });
      } catch (e) {
        console.warn('[ANLGRAM TMA] BackButton setup note:', e);
      }
    }
  }

  function setupExternalLinksInterceptor() {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link || !link.href) return;

      const url = link.href;

      // Handle Telegram internal links
      if (url.startsWith('https://t.me/') || url.startsWith('tg://')) {
        e.preventDefault();
        triggerHaptic('selection');
        if (typeof tg.openTelegramLink === 'function') {
          tg.openTelegramLink(url);
        } else {
          window.open(url, '_blank');
        }
        return;
      }

      // Handle external web links (e.g. Tonviewer, TonScan, DEXs, Docs)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const linkHost = new URL(url).hostname.toLowerCase();
        const currentHost = window.location.hostname.toLowerCase();

        // If link points outside current site and outside anlgram.com
        if (linkHost !== currentHost && !linkHost.includes('anlgram.com')) {
          e.preventDefault();
          triggerHaptic('light');
          if (typeof tg.openLink === 'function') {
            tg.openLink(url);
          } else {
            window.open(url, '_blank');
          }
        }
      }
    });
  }

  function injectTmaBottomNav() {
    // Only inject if not already present in DOM
    if (document.getElementById('anlgram-tma-nav')) return;

    const currentPath = window.location.pathname.toLowerCase();

    const nav = document.createElement('nav');
    nav.id = 'anlgram-tma-nav';
    nav.setAttribute('aria-label', 'ANLGRAM Navigation');

    TMA_NAV_CONFIG.forEach(item => {
      const isActive = item.matchRegex.test(currentPath) || 
                       (item.id === 'nav-home' && (currentPath.endsWith('/') || currentPath.endsWith('anlgram') || currentPath.endsWith('index.html') || currentPath === ''));

      const btn = document.createElement('button');
      btn.className = `tma-nav-btn ${isActive ? 'active' : ''}`;
      btn.id = item.id;
      btn.setAttribute('aria-label', item.label);
      btn.innerHTML = `${item.svg}<span>${item.label}</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic('selection');

        if (isActive) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.location.href = item.url;
        }
      });

      nav.appendChild(btn);
    });

    document.body.appendChild(nav);
  }

  function displayUserIndicator() {
    const user = getTelegramUser();
    if (!user) return;

    const userContainers = document.querySelectorAll('.tma-user-greeting, #tma-user-pill');
    userContainers.forEach(container => {
      const name = user.username ? `@${user.username}` : (user.first_name || 'TON Explorer');
      container.innerHTML = `
        <span class="tma-user-pill" title="Telegram Mini App Session">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.46.93-4.12 2.73-.39.26-.74.39-1.06.38-.35-.01-1.02-.2-1.52-.36-.61-.2-1.1-.31-1.08-.66.01-.18.27-.36.78-.55 3.05-1.33 5.09-2.21 6.12-2.64 2.91-1.21 3.51-1.42 3.91-1.43.09 0 .28.02.4.11.1.08.13.19.14.28-.01.05.01.17 0 .2z"/></svg>
          <span>${name}</span>
        </span>
      `;
    });
  }

  function initTelegramMiniApp() {
    if (typeof window === 'undefined' || isTmaInitialized) return;

    const tg = window.Telegram?.WebApp;
    const inTelegram = isTelegramEnvironment();

    // 1. Always inject the responsive bottom navigation bar on mobile viewports
    injectTmaBottomNav();

    if (!inTelegram || !tg) {
      // Running in standard browser outside Telegram
      console.log('[ANLGRAM] Standard Web Mode active.');
      isTmaInitialized = true;
      return;
    }

    try {
      // 2. Notify Telegram that the app has finished loading
      tg.ready();

      // 3. Expand Mini App to full vertical height
      tg.expand();

      // 4. Match Telegram chrome with ANLGRAM visual identity
      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('#030712');
      }
      if (typeof tg.setBackgroundColor === 'function') {
        tg.setBackgroundColor('#030712');
      }

      // 5. Prevent accidental pull-down closing during active interaction
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }

      // 6. Set CSS markers and safe-area adjustments
      if (document.body) {
        document.body.classList.add('tma-active');
      }
      if (document.documentElement) {
        document.documentElement.classList.add('tma-platform-' + (tg.platform || 'mobile'));
      }

      // 7. Manage Viewport & Safe Heights
      updateViewportStyles();
      if (typeof tg.onEvent === 'function') {
        tg.onEvent('viewportChanged', () => {
          updateViewportStyles();
          if (tg.isExpanded === false && typeof tg.expand === 'function') {
            tg.expand();
          }
        });

        tg.onEvent('themeChanged', () => {
          if (typeof tg.setHeaderColor === 'function') {
            tg.setHeaderColor('#030712');
          }
        });
      }

      // 8. Setup Native BackButton
      setupNativeBackButton();

      // 9. Intercept external links to use Telegram browser handlers
      setupExternalLinksInterceptor();

      // 10. Display user indicator if present
      displayUserIndicator();

      console.log('[ANLGRAM] Telegram Mini App SDK initialised successfully. Platform:', tg.platform, '| User:', tg.initDataUnsafe?.user?.username || 'Guest');
      isTmaInitialized = true;
    } catch (e) {
      console.warn('[ANLGRAM] Telegram Mini App initialization note:', e);
      isTmaInitialized = true;
    }
  }

  // Auto-init on DOM readiness
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTelegramMiniApp);
    } else {
      initTelegramMiniApp();
    }
  }

  // Global API exposure
  if (typeof window !== 'undefined') {
    window.ANLGRAM_TMA = {
      initTelegramMiniApp,
      isTelegram: isTelegramEnvironment,
      getUser: getTelegramUser,
      haptic: triggerHaptic,
      expand: () => window.Telegram?.WebApp?.expand?.(),
      close: () => window.Telegram?.WebApp?.close?.()
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initTelegramMiniApp,
      isTelegramEnvironment,
      getTelegramUser,
      triggerHaptic,
      TMA_NAV_CONFIG
    };
  }
})();
