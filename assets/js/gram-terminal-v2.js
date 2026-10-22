/**
 * ANLGRAM Wallet Cluster Explorer — Legacy entrypoint compatibility wrapper
 * Points directly to the rebuilt ANLGRAM Wallet Cluster Explorer engine.
 */
(function() {
  'use strict';
  if (window.ANLGRAM_WCE) {
    console.log('[ANLGRAM] Wallet Cluster Explorer active.');
  }
})();
