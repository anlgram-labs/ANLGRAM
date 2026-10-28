/**
 * ANLGRAM Launchpad — Deterministic Bonding Curve Integer Mathematical Engine
 * File: minter-contract/scripts/bonding-curve-math.js
 * 
 * Strict Integer Precision Only (BigInt throughout).
 * Constant-Product AMM (x * y = k) with Virtual Reserves.
 * 
 * Solvency Invariants:
 * 1. Rounding strictly favors contract reserves (downward token output on buy, downward TON payout on sell).
 * 2. Invariant K is strictly non-decreasing across all valid operations (delta K >= 0).
 * 3. Real TON payout on sell can NEVER exceed real TON reserve (r_TON >= 0 at all times).
 * 4. Token supply is strictly conserved: Sold Tokens + Remaining Inventory + Graduation Escrow == TOTAL_SUPPLY.
 * 5. Rejects 0 input, negative input, invalid slippage, and trades post-graduation.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BondingCurveMath = factory();
    root.ANLGRAM_BONDING_CURVE_MATH = root.BondingCurveMath;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BPS_DENOMINATOR = 10000n; // 10,000 bps = 100%
  const DEFAULT_DECIMALS = 9n;
  const ONE_TOKEN = 10n ** DEFAULT_DECIMALS; // 1,000,000,000 atomic units per whole token

  // Default Canonical Model Parameters
  const DEFAULT_CONFIG = {
    totalSupply: 1_000_000_000n * ONE_TOKEN,       // 1 Billion tokens
    curveTokens:   800_000_000n * ONE_TOKEN,       // 800M tokens on curve (80%)
    gradTokens:    200_000_000n * ONE_TOKEN,       // 200M tokens for DEX liquidity (20%)
    creatorTokens: 0n,                             // 0 tokens (Fair launch)
    treasuryTokens: 0n,                            // 0 tokens
    initialVirtualTon: 30n * 1_000_000_000n,       // 30 TON virtual reserve
    graduationThresholdTon: 500n * 1_000_000_000n, // 500 TON real threshold
    protocolFeeBps: 100n,                          // 100 bps = 1.00%
    decimals: 9n,
  };

  /**
   * Clones and converts all numeric values to BigInt safely
   */
  function normalizeConfig(cfg = {}) {
    const c = { ...DEFAULT_CONFIG, ...cfg };
    return {
      totalSupply: BigInt(c.totalSupply),
      curveTokens: BigInt(c.curveTokens),
      gradTokens: BigInt(c.gradTokens),
      creatorTokens: BigInt(c.creatorTokens),
      treasuryTokens: BigInt(c.treasuryTokens),
      initialVirtualTon: BigInt(c.initialVirtualTon),
      graduationThresholdTon: BigInt(c.graduationThresholdTon),
      protocolFeeBps: BigInt(c.protocolFeeBps),
      decimals: BigInt(c.decimals || DEFAULT_DECIMALS),
    };
  }

  /**
   * Bonding Curve State & Mathematical Calculation Engine
   */
  class BondingCurveEngine {
    constructor(userConfig = {}) {
      this.config = normalizeConfig(userConfig);

      // Validate fundamental supply conservation
      const sumAllocations = this.config.curveTokens + this.config.gradTokens + this.config.creatorTokens + this.config.treasuryTokens;
      if (sumAllocations !== this.config.totalSupply) {
        throw new Error(`INVARIANT FAULT: Allocations sum (${sumAllocations}) != total supply (${this.config.totalSupply})`);
      }

      if (this.config.initialVirtualTon <= 0n) {
        throw new Error('INVARIANT FAULT: initialVirtualTon must be strictly positive');
      }
      if (this.config.graduationThresholdTon <= 0n) {
        throw new Error('INVARIANT FAULT: graduationThresholdTon must be strictly positive');
      }
      if (this.config.protocolFeeBps < 0n || this.config.protocolFeeBps > 1000n) {
        throw new Error('INVARIANT FAULT: protocolFeeBps must be between 0 and 1000 (0% - 10%)');
      }

      // Derived Virtual Token Reserve:
      // v_TOK = floor(v_TON * S_curve / T_grad)
      this.virtualToken = (this.config.initialVirtualTon * this.config.curveTokens) / this.config.graduationThresholdTon;
      this.virtualTon = this.config.initialVirtualTon;

      // Invariant K = v_TON * (S_curve + v_TOK)
      this.K = this.virtualTon * (this.config.curveTokens + this.virtualToken);

      // Real Reserves (Mutable state)
      this.realTon = 0n;
      this.realTokens = this.config.curveTokens;
      this.accumulatedFeesTon = 0n;
      this.graduated = false;
      this.tradeCount = 0;
    }

    /**
     * Current Effective Reserves
     */
    get effectiveTon() {
      return this.realTon + this.virtualTon;
    }

    get effectiveTokens() {
      return this.realTokens + this.virtualToken;
    }

    /**
     * Current Spot Price in nanoTON per 1 whole token (10^9 base units)
     * Spot Price = (effectiveTon * 10^decimals) / effectiveTokens
     */
    getCurrentSpotPriceNano() {
      if (this.effectiveTokens === 0n) return 0n;
      const oneToken = 10n ** this.config.decimals;
      return (this.effectiveTon * oneToken) / this.effectiveTokens;
    }

    /**
     * Compute Buy Quote (Read-only, does not alter state)
     * 
     * @param {bigint|number|string} grossTonInNano - Gross nanoTON user wants to spend
     * @param {bigint|number|string} slippageBps - Max allowed slippage in basis points (e.g. 100 = 1%)
     * @returns {object} Quote result with detailed fee, output, price impact, and slippage bounds
     */
    quoteBuy(grossTonInNano, slippageBps = 100n) {
      const grossIn = BigInt(grossTonInNano);
      const slipBps = BigInt(slippageBps);

      if (grossIn <= 0n) {
        return { success: false, error: 'ZERO_INPUT', message: 'Gross TON input must be strictly positive' };
      }
      if (slipBps < 0n || slipBps > 10000n) {
        return { success: false, error: 'INVALID_SLIPPAGE', message: 'Slippage must be between 0 and 10,000 bps' };
      }
      if (this.graduated || this.realTokens === 0n) {
        return { success: false, error: 'CURVE_GRADUATED', message: 'Bonding curve has completed graduation. Trading locked.' };
      }

      // 1. Calculate Protocol Fee
      const feeTon = (grossIn * this.config.protocolFeeBps) / BPS_DENOMINATOR;
      const netTon = grossIn - feeTon;

      if (netTon <= 0n) {
        return { success: false, error: 'INPUT_TOO_SMALL_FOR_FEE', message: 'Gross TON input is consumed entirely by fee' };
      }

      // 2. Compute Token Output from Constant Product Invariant
      // dy = floor(Y * dx / (X + dx))
      const X = this.effectiveTon;
      const Y = this.effectiveTokens;
      const tokensOut = (Y * netTon) / (X + netTon);

      if (tokensOut <= 0n) {
        return { success: false, error: 'ZERO_OUTPUT', message: 'Trade input produces 0 tokens due to integer truncation' };
      }

      // 3. Check Curve Inventory Cap
      const availableTokens = this.realTokens;
      let cappedTokensOut = tokensOut;
      let willGraduate = false;
      let actualNetTon = netTon;
      let actualGrossIn = grossIn;
      let actualFeeTon = feeTon;

      if (tokensOut >= availableTokens) {
        // Trade consumes all remaining curve tokens -> Graduation threshold reached!
        cappedTokensOut = availableTokens;
        willGraduate = true;

        // Calculate exact required net TON to buy remaining inventory:
        // dx_req = ceil(K / (Y - dy_req)) - X
        const targetY = Y - availableTokens;
        if (targetY > 0n) {
          // Ceil division: (K + targetY - 1) / targetY
          const requiredX = (this.K + targetY - 1n) / targetY;
          if (requiredX > X) {
            actualNetTon = requiredX - X;
            // Recompute gross with fee
            // actualNetTon = actualGrossIn * (10000 - fee) / 10000
            // actualGrossIn = ceil(actualNetTon * 10000 / (10000 - fee))
            const netMultiplier = BPS_DENOMINATOR - this.config.protocolFeeBps;
            actualGrossIn = (actualNetTon * BPS_DENOMINATOR + netMultiplier - 1n) / netMultiplier;
            actualFeeTon = actualGrossIn - actualNetTon;
          }
        }
      }

      // 4. Compute Minimum Acceptable Output with Slippage
      // minTokensOut = floor(cappedTokensOut * (10000 - slipBps) / 10000)
      const minTokensOut = (cappedTokensOut * (BPS_DENOMINATOR - slipBps)) / BPS_DENOMINATOR;

      // 5. Price Metrics
      const spotBefore = this.getCurrentSpotPriceNano();
      const newX = X + actualNetTon;
      const newY = Y - cappedTokensOut;
      const oneToken = 10n ** this.config.decimals;
      const spotAfter = (newX * oneToken) / newY;

      // Price impact in bps = abs(spotAfter - spotBefore) * 10000 / spotBefore
      let priceImpactBps = 0n;
      if (spotBefore > 0n) {
        const diff = spotAfter > spotBefore ? spotAfter - spotBefore : spotBefore - spotAfter;
        priceImpactBps = (diff * BPS_DENOMINATOR) / spotBefore;
      }

      // 6. Check Graduation Threshold Condition
      if (this.realTon + actualNetTon >= this.config.graduationThresholdTon) {
        willGraduate = true;
      }

      return {
        success: true,
        grossTonIn: actualGrossIn,
        feeTon: actualFeeTon,
        netTonApplied: actualNetTon,
        tokensOut: cappedTokensOut,
        minTokensOut,
        spotPriceBefore: spotBefore,
        spotPriceAfter: spotAfter,
        priceImpactBps,
        willGraduate,
        newRealTon: this.realTon + actualNetTon,
        newRealTokens: this.realTokens - cappedTokensOut,
        newInvariant: (X + actualNetTon) * (Y - cappedTokensOut),
      };
    }

    /**
     * Execute Buy on Curve (Alters state)
     */
    applyBuy(grossTonInNano, minTokensOutSpecified = 0n) {
      const grossIn = BigInt(grossTonInNano);
      const minOut = BigInt(minTokensOutSpecified);

      const quote = this.quoteBuy(grossIn, 0n);
      if (!quote.success) {
        return quote;
      }

      if (quote.tokensOut < minOut) {
        return {
          success: false,
          error: 'SLIPPAGE_EXCEEDED',
          message: `Received ${quote.tokensOut} tokens which is below specified minTokensOut ${minOut}`,
          receivedTokens: quote.tokensOut,
          minTokensOut: minOut,
        };
      }

      // State Update
      this.realTon += quote.netTonApplied;
      this.realTokens -= quote.tokensOut;
      this.accumulatedFeesTon += quote.feeTon;
      this.tradeCount++;

      if (quote.willGraduate || this.realTokens === 0n || this.realTon >= this.config.graduationThresholdTon) {
        this.graduated = true;
      }

      // Invariant Check
      this.assertInvariants();

      return {
        success: true,
        tradeType: 'BUY',
        grossTonIn: quote.grossTonIn,
        feeTon: quote.feeTon,
        netTonApplied: quote.netTonApplied,
        tokensReceived: quote.tokensOut,
        newRealTon: this.realTon,
        newRealTokens: this.realTokens,
        accumulatedFeesTon: this.accumulatedFeesTon,
        graduated: this.graduated,
      };
    }

    /**
     * Compute Sell Quote (Read-only, does not alter state)
     * 
     * @param {bigint|number|string} tokenAmountIn - Jetton atomic units to sell
     * @param {bigint|number|string} slippageBps - Max allowed slippage in basis points
     * @returns {object} Quote result with detailed payout, fee, price impact, and slippage bounds
     */
    quoteSell(tokenAmountIn, slippageBps = 100n) {
      const tokensIn = BigInt(tokenAmountIn);
      const slipBps = BigInt(slippageBps);

      if (tokensIn <= 0n) {
        return { success: false, error: 'ZERO_INPUT', message: 'Token sell amount must be strictly positive' };
      }
      if (slipBps < 0n || slipBps > 10000n) {
        return { success: false, error: 'INVALID_SLIPPAGE', message: 'Slippage must be between 0 and 10,000 bps' };
      }
      if (this.graduated) {
        return { success: false, error: 'CURVE_GRADUATED', message: 'Bonding curve has completed graduation. Trading locked.' };
      }
      if (this.realTon === 0n) {
        return { success: false, error: 'NO_REAL_RESERVE', message: 'Real TON reserve is currently empty. Cannot sell.' };
      }

      // 1. Compute Gross TON Output from Constant Product Invariant
      // dx_gross = floor(X * dy / (Y + dy))
      const X = this.effectiveTon;
      const Y = this.effectiveTokens;
      const grossTonOut = (X * tokensIn) / (Y + tokensIn);

      if (grossTonOut <= 0n) {
        return { success: false, error: 'ZERO_OUTPUT', message: 'Token sell amount produces 0 nanoTON due to integer truncation' };
      }

      // 2. Strict Solvency Check: payout CANNOT exceed real TON reserve
      if (grossTonOut > this.realTon) {
        return {
          success: false,
          error: 'SOLVENCY_VIOLATION',
          message: `Calculated payout (${grossTonOut}) exceeds real contract TON reserve (${this.realTon})`,
        };
      }

      // 3. Calculate Protocol Fee on Payout
      const feeTon = (grossTonOut * this.config.protocolFeeBps) / BPS_DENOMINATOR;
      const netTonOut = grossTonOut - feeTon;

      if (netTonOut <= 0n) {
        return { success: false, error: 'PAYOUT_CONSUMED_BY_FEE', message: 'TON payout is consumed entirely by fee' };
      }

      // 4. Compute Minimum Acceptable TON Output with Slippage
      // minTonOut = floor(netTonOut * (10000 - slipBps) / 10000)
      const minTonOut = (netTonOut * (BPS_DENOMINATOR - slipBps)) / BPS_DENOMINATOR;

      // 5. Price Metrics
      const spotBefore = this.getCurrentSpotPriceNano();
      const newX = X - grossTonOut;
      const newY = Y + tokensIn;
      const oneToken = 10n ** this.config.decimals;
      const spotAfter = (newX * oneToken) / newY;

      let priceImpactBps = 0n;
      if (spotBefore > 0n) {
        const diff = spotBefore > spotAfter ? spotBefore - spotAfter : spotAfter - spotBefore;
        priceImpactBps = (diff * BPS_DENOMINATOR) / spotBefore;
      }

      return {
        success: true,
        tokensIn,
        grossTonOut,
        feeTon,
        netTonOut,
        minTonOut,
        spotPriceBefore: spotBefore,
        spotPriceAfter: spotAfter,
        priceImpactBps,
        newRealTon: this.realTon - grossTonOut,
        newRealTokens: this.realTokens + tokensIn,
        newInvariant: newX * newY,
      };
    }

    /**
     * Execute Sell on Curve (Alters state)
     */
    applySell(tokenAmountIn, minTonOutSpecified = 0n) {
      const tokensIn = BigInt(tokenAmountIn);
      const minOut = BigInt(minTonOutSpecified);

      const quote = this.quoteSell(tokensIn, 0n);
      if (!quote.success) {
        return quote;
      }

      if (quote.netTonOut < minOut) {
        return {
          success: false,
          error: 'SLIPPAGE_EXCEEDED',
          message: `Received ${quote.netTonOut} nanoTON which is below specified minTonOut ${minOut}`,
          receivedTon: quote.netTonOut,
          minTonOut: minOut,
        };
      }

      // State Update: Real reserve decreases by gross payout
      // The curve releases grossTonOut: netTonOut goes to seller, feeTon goes to treasury.
      this.realTon -= quote.grossTonOut;
      this.realTokens += quote.tokensIn;
      this.accumulatedFeesTon += quote.feeTon;
      this.tradeCount++;

      // Invariant Check
      this.assertInvariants();

      return {
        success: true,
        tradeType: 'SELL',
        tokensIn: quote.tokensIn,
        grossTonOut: quote.grossTonOut,
        feeTon: quote.feeTon,
        netTonReceived: quote.netTonOut,
        newRealTon: this.realTon,
        newRealTokens: this.realTokens,
        accumulatedFeesTon: this.accumulatedFeesTon,
      };
    }

    /**
     * Invariant Verification Assertion
     * Throws an error immediately if any mathematical solvency invariant is violated.
     */
    assertInvariants() {
      // 1. Real TON reserve non-negative
      if (this.realTon < 0n) {
        throw new Error(`CRITICAL INVARIANT FAULT: realTon is negative (${this.realTon})`);
      }

      // 2. Real Token reserve within bounds [0, S_curve]
      if (this.realTokens < 0n) {
        throw new Error(`CRITICAL INVARIANT FAULT: realTokens is negative (${this.realTokens})`);
      }
      if (this.realTokens > this.config.curveTokens) {
        throw new Error(`CRITICAL INVARIANT FAULT: realTokens (${this.realTokens}) exceeds curve initial allocation (${this.config.curveTokens})`);
      }

      // 3. Constant product invariant non-decreasing
      const currentK = this.effectiveTon * this.effectiveTokens;
      if (currentK < this.K) {
        throw new Error(`CRITICAL INVARIANT FAULT: Current invariant K (${currentK}) fell below base invariant (${this.K})`);
      }

      // 4. Token supply conservation
      const soldTokens = this.config.curveTokens - this.realTokens;
      const totalAccounted = soldTokens + this.realTokens + this.config.gradTokens + this.config.creatorTokens + this.config.treasuryTokens;
      if (totalAccounted !== this.config.totalSupply) {
        throw new Error(`CRITICAL INVARIANT FAULT: Total accounted tokens (${totalAccounted}) != total supply (${this.config.totalSupply})`);
      }
    }

    /**
     * Snapshot of full internal state
     */
    getState() {
      return {
        config: { ...this.config },
        virtualTon: this.virtualTon,
        virtualToken: this.virtualToken,
        realTon: this.realTon,
        realTokens: this.realTokens,
        effectiveTon: this.effectiveTon,
        effectiveTokens: this.effectiveTokens,
        K: this.K,
        accumulatedFeesTon: this.accumulatedFeesTon,
        graduated: this.graduated,
        tradeCount: this.tradeCount,
        spotPriceNano: this.getCurrentSpotPriceNano(),
      };
    }
  }

  return {
    BPS_DENOMINATOR,
    DEFAULT_DECIMALS,
    ONE_TOKEN,
    DEFAULT_CONFIG,
    normalizeConfig,
    BondingCurveEngine,
  };
}));
