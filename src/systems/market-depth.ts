/**
 * Market Depth System (Economic Model V2)
 *
 * Implements price impact for large trades. Large trades move prices,
 * preventing instant arbitrage and creating realistic market dynamics.
 *
 * Key concepts:
 * - Market depth: How much can be traded before prices move significantly
 * - Price impact: The price change caused by a trade's size
 * - Depth recovery: Markets replenish liquidity over time
 */

import type {
  MarketState,
  GoodId,
  MarketDepthConfig,
} from '../core/types.js';

/**
 * Result of price impact calculation
 */
export interface PriceImpactResult {
  /** The effective execution price (after impact) */
  executionPrice: number;
  /** The price impact as a fraction (e.g., 0.05 = 5% impact) */
  priceImpact: number;
  /** Amount of depth consumed by this trade */
  depthConsumed: number;
  /** Actual quantity that can be traded at this depth */
  actualQuantity: number;
}

/**
 * Calculate price impact for a trade
 *
 * Price impact formula:
 * - impactFactor = (quantity / availableDepth) * priceImpactCoefficient
 * - For buys: executionPrice = currentPrice * (1 + impactFactor)
 * - For sells: executionPrice = currentPrice * (1 - impactFactor)
 *
 * The impact increases quadratically when the trade exceeds available depth,
 * making very large trades increasingly expensive.
 *
 * @param quantity - The quantity to trade (positive for buy, negative for sell)
 * @param availableDepth - The available market depth on the relevant side
 * @param currentPrice - The current quoted market price
 * @param config - Market depth configuration
 * @returns Price impact calculation results
 */
export function calculatePriceImpact(
  quantity: number,
  availableDepth: number,
  currentPrice: number,
  config: MarketDepthConfig
): PriceImpactResult {
  const absQuantity = Math.abs(quantity);
  const isBuy = quantity > 0;

  // Ensure we have a minimum depth floor
  const effectiveDepth = Math.max(availableDepth, config.minDepth);

  // Calculate base impact factor
  // Linear for small trades, increases for larger trades
  const depthRatio = absQuantity / effectiveDepth;

  // Impact grows more than linearly when exceeding depth
  // This creates increasing resistance to very large trades
  let impactFactor: number;
  if (depthRatio <= 1) {
    // Within available depth: linear impact
    impactFactor = depthRatio * config.priceImpactCoefficient;
  } else {
    // Exceeding depth: quadratic penalty for the excess
    const withinDepthImpact = config.priceImpactCoefficient;
    const excessRatio = depthRatio - 1;
    const excessImpact = excessRatio * excessRatio * config.priceImpactCoefficient * 2;
    impactFactor = withinDepthImpact + excessImpact;
  }

  // Cap maximum impact at 50% to prevent absurd prices
  impactFactor = Math.min(impactFactor, 0.5);

  // Calculate execution price
  let executionPrice: number;
  if (isBuy) {
    // Buying pushes price up
    executionPrice = currentPrice * (1 + impactFactor);
  } else {
    // Selling pushes price down
    executionPrice = currentPrice * (1 - impactFactor);
  }

  // Ensure price stays positive
  executionPrice = Math.max(executionPrice, 0.01);

  // Depth consumed is the minimum of quantity and available depth
  // (trades beyond depth still happen but at worse prices)
  const depthConsumed = Math.min(absQuantity, effectiveDepth);

  return {
    executionPrice,
    priceImpact: impactFactor,
    depthConsumed,
    actualQuantity: absQuantity,
  };
}

/**
 * Update market depth after a trade
 *
 * When goods are bought, buy depth decreases (less liquidity on buy side)
 * When goods are sold, sell depth decreases (less liquidity on sell side)
 *
 * @param market - Current market state
 * @param goodId - The good being traded
 * @param quantity - Quantity traded (positive = buy, negative = sell)
 * @param config - Market depth configuration
 * @returns Updated market state with reduced depth
 */
export function consumeDepth(
  market: MarketState,
  goodId: GoodId,
  quantity: number,
  config: MarketDepthConfig
): MarketState {
  const absQuantity = Math.abs(quantity);
  const isBuy = quantity > 0;

  // Clone the depth maps
  const newBuyDepth = new Map(market.buyDepth);
  const newSellDepth = new Map(market.sellDepth);

  if (isBuy) {
    // Buying consumes buy depth
    const currentDepth = newBuyDepth.get(goodId) ?? config.minDepth;
    const newDepth = Math.max(config.minDepth, currentDepth - absQuantity);
    newBuyDepth.set(goodId, newDepth);
  } else {
    // Selling consumes sell depth
    const currentDepth = newSellDepth.get(goodId) ?? config.minDepth;
    const newDepth = Math.max(config.minDepth, currentDepth - absQuantity);
    newSellDepth.set(goodId, newDepth);
  }

  return {
    ...market,
    buyDepth: newBuyDepth,
    sellDepth: newSellDepth,
  };
}

/**
 * Regenerate market depth each tick
 *
 * Depth gradually recovers toward the ideal level based on:
 * - Ideal stock levels (markets with more ideal stock have more depth)
 * - Recovery rate (how fast liquidity returns)
 *
 * This allows markets to recover from large trades over time,
 * but prevents rapid-fire arbitrage from fully exploiting price differences.
 *
 * @param market - Current market state
 * @param idealStock - Map of ideal stock levels per good
 * @param config - Market depth configuration
 * @param dt - Time delta (usually 1)
 * @returns Updated market state with regenerated depth
 */
export function regenerateDepth(
  market: MarketState,
  idealStock: Map<GoodId, number>,
  config: MarketDepthConfig,
  dt: number
): MarketState {
  const newBuyDepth = new Map(market.buyDepth);
  const newSellDepth = new Map(market.sellDepth);

  for (const [goodId, ideal] of idealStock) {
    // Target depth based on ideal stock
    const targetDepth = Math.max(
      config.minDepth,
      ideal * config.baseDepthMultiplier
    );

    // Regenerate buy depth toward target
    const currentBuyDepth = newBuyDepth.get(goodId) ?? config.minDepth;
    const buyRegenAmount = (targetDepth - currentBuyDepth) * config.depthRecoveryRate * dt;
    const newBuyLevel = Math.max(config.minDepth, currentBuyDepth + buyRegenAmount);
    newBuyDepth.set(goodId, newBuyLevel);

    // Regenerate sell depth toward target
    const currentSellDepth = newSellDepth.get(goodId) ?? config.minDepth;
    const sellRegenAmount = (targetDepth - currentSellDepth) * config.depthRecoveryRate * dt;
    const newSellLevel = Math.max(config.minDepth, currentSellDepth + sellRegenAmount);
    newSellDepth.set(goodId, newSellLevel);
  }

  return {
    ...market,
    buyDepth: newBuyDepth,
    sellDepth: newSellDepth,
  };
}

/**
 * Initialize market depth for a new market
 *
 * Sets initial depth based on ideal stock levels.
 *
 * @param idealStock - Map of ideal stock levels per good
 * @param config - Market depth configuration
 * @returns Initial depth maps for buy and sell sides
 */
export function initializeMarketDepth(
  idealStock: Map<GoodId, number>,
  config: MarketDepthConfig
): { buyDepth: Map<GoodId, number>; sellDepth: Map<GoodId, number> } {
  const buyDepth = new Map<GoodId, number>();
  const sellDepth = new Map<GoodId, number>();

  for (const [goodId, ideal] of idealStock) {
    const depth = Math.max(
      config.minDepth,
      ideal * config.baseDepthMultiplier
    );
    buyDepth.set(goodId, depth);
    sellDepth.set(goodId, depth);
  }

  return { buyDepth, sellDepth };
}

/**
 * Get the current market depth summary for a good
 * Useful for debugging and UI display
 */
export function getDepthSummary(
  market: MarketState,
  goodId: GoodId,
  idealStock: Map<GoodId, number>,
  config: MarketDepthConfig
): {
  buyDepth: number;
  sellDepth: number;
  targetDepth: number;
  buyDepthRatio: number;
  sellDepthRatio: number;
} {
  const ideal = idealStock.get(goodId) ?? 100;
  const targetDepth = Math.max(config.minDepth, ideal * config.baseDepthMultiplier);
  const buyDepth = market.buyDepth.get(goodId) ?? config.minDepth;
  const sellDepth = market.sellDepth.get(goodId) ?? config.minDepth;

  return {
    buyDepth,
    sellDepth,
    targetDepth,
    buyDepthRatio: buyDepth / targetDepth,
    sellDepthRatio: sellDepth / targetDepth,
  };
}
