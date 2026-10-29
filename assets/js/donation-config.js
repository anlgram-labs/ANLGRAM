/**
 * ANLGRAM — Centralized Token Creation Donation Configuration
 *
 * Governs the 10% Token Creation Donation applied to all token-creation flows.
 * Recipient: UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd
 *
 * Exact Mathematical Model (BigInt NanoTON Integer Arithmetic):
 * - Deploy Minter StateInit Base:   50,000,000 nanoTON (0.05 TON)
 * - Mint Initial Supply Base:      150,000,000 nanoTON (0.15 TON)
 * - Total Execution Base:          200,000,000 nanoTON (0.20 TON)
 * - 10% Token Creation Donation:    20,000,000 nanoTON (0.02 TON = 10% of 200,000,000)
 * - Total Transaction to Sign:     220,000,000 nanoTON (0.22 TON)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ANLGRAM_DONATION_CONFIG = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RECIPIENT_ADDRESS = 'UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd';
  const DONATION_RATE_PERCENT = 10;
  const DONATION_RATE_BPS = 1000n; // 1,000 basis points out of 10,000 (10.00%)
  const BPS_DENOMINATOR = 10000n;

  const BASE_DEPLOY_NANO = 50_000_000n; // 0.05 TON
  const BASE_MINT_NANO = 150_000_000n;  // 0.15 TON
  const BASE_EXECUTION_NANO = BASE_DEPLOY_NANO + BASE_MINT_NANO; // 200_000_000n (0.20 TON)

  const DONATION_AMOUNT_NANO = (BASE_EXECUTION_NANO * DONATION_RATE_BPS) / BPS_DENOMINATOR; // 20_000_000n (0.02 TON)
  const TOTAL_TRANSACTION_NANO = BASE_EXECUTION_NANO + DONATION_AMOUNT_NANO; // 220_000_000n (0.22 TON)

  function nanoToTON(nano) {
    const whole = nano / 1_000_000_000n;
    const frac = nano % 1_000_000_000n;
    const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '') || '0';
    return `${whole}.${fracStr}`;
  }

  return {
    RECIPIENT_ADDRESS,
    DONATION_RATE_PERCENT,
    DONATION_RATE_BPS,
    BPS_DENOMINATOR,

    BASE_DEPLOY_NANO,
    BASE_MINT_NANO,
    BASE_EXECUTION_NANO,
    DONATION_AMOUNT_NANO,
    TOTAL_TRANSACTION_NANO,

    BASE_DEPLOY_TON: nanoToTON(BASE_DEPLOY_NANO),
    BASE_MINT_TON: nanoToTON(BASE_MINT_NANO),
    BASE_EXECUTION_TON: nanoToTON(BASE_EXECUTION_NANO),
    DONATION_AMOUNT_TON: nanoToTON(DONATION_AMOUNT_NANO),
    TOTAL_TRANSACTION_TON: nanoToTON(TOTAL_TRANSACTION_NANO),

    PAYLOAD_COMMENT: 'ANLGRAM 10% Token Creation Donation',
    PRIMARY_LABEL: '10% Token Creation Donation',
    RECIPIENT_LABEL: 'Token Creation Donation Recipient',

    DISCLOSURE_TEXT:
      'I understand that a 10% Token Creation Donation (0.02 TON), calculated from the displayed 0.20 TON execution base, will be sent to the displayed recipient wallet (UQDW_PsjmeOBB_fvzOFmwqW7redEcufKQgImyrURvO7dbSYd) as part of this token-creation flow.',

    /**
     * Compute donation for arbitrary nanoTON base using integer math.
     */
    calculateDonation(baseNano) {
      const base = BigInt(baseNano);
      const donation = (base * DONATION_RATE_BPS) / BPS_DENOMINATOR;
      const total = base + donation;
      return {
        baseNano: base,
        donationNano: donation,
        totalNano: total,
        baseTON: nanoToTON(base),
        donationTON: nanoToTON(donation),
        totalTON: nanoToTON(total)
      };
    }
  };
});
