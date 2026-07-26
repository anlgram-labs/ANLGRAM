/**
 * ANLGRAM Intelligence - TonAPI Integration
 * Base URL for TON API v2
 */
const TONAPI_BASE = 'https://tonapi.io/v2';

/**
 * Helper to make API requests
 */
async function fetchTonApi(endpoint) {
  try {
    const response = await fetch(`${TONAPI_BASE}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

/**
 * Get current TON price in USD
 */
async function getTonPrice() {
  const data = await fetchTonApi('/rates?tokens=ton&currencies=usd');
  if (data && data.rates && data.rates.TON) {
    return data.rates.TON.prices.USD;
  }
  return 2.47; // fallback
}

/**
 * Get account details (balance, status, etc)
 * @param {string} accountId - The TON address
 */
async function getAccountInfo(accountId) {
  return await fetchTonApi(`/accounts/${accountId}`);
}

/**
 * Get account transactions
 * @param {string} accountId - The TON address
 * @param {number} limit - Number of tx to fetch
 */
async function getAccountTransactions(accountId, limit = 15) {
  return await fetchTonApi(`/blockchain/accounts/${accountId}/transactions?limit=${limit}`);
}

/**
 * Format nanoTON to TON/GRAM
 * 1 TON = 1,000,000,000 nanoTON
 */
function formatNanoTon(nanoStr) {
  if (!nanoStr) return "0";
  const num = parseInt(nanoStr) / 1e9;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
}

/**
 * Shorten address (e.g., EQC...x8Kp)
 */
function shortenAddress(addr) {
  if (!addr) return '';
  return addr.substring(0, 4) + '...' + addr.substring(addr.length - 4);
}

/**
 * Time ago formatter
 */
function timeAgoTimestamp(unixTimestamp) {
  const diff = Math.floor(Date.now() / 1000) - unixTimestamp;
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
