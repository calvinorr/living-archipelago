/**
 * Market System
 * Handles local price formation based on inventory pressure and consumption velocity
 * Based on 02_spec.md Section 5
 */

import type {
  IslandState,
  MarketState,
  GoodId,
  GoodDefinition,
  WorldEvent,
  SimulationConfig,
  GoodMarketConfig,
  MarketDepthConfig,
} from '../core/types.js';

import { getMarketEffect } from './buildings.js';
import { calculatePriceImpact, consumeDepth, type PriceImpactResult } from './market-depth.js';

const EPSILON = 0.001;

/**
 * Calculate inventory pressure
 * Formula: pressure = (s* / max(s, eps)) ^ gamma
 * Where s* = ideal stock, s = current stock
 */
function calculatePressure(
  currentStock: number,
  idealStock: number,
  gamma: number
): number {
  const s = Math.max(currentStock, EPSILON);
  const sIdeal = Math.max(idealStock, EPSILON);
  return Math.pow(sIdeal / s, gamma);
}

/**
 * Calculate velocity term based on recent consumption
 * Formula: velocity = 1 + k_v * (v / max(v_ref, eps))
 */
function calculateVelocity(
  consumptionRate: number,
  referenceRate: number,
  kv: number
): number {
  const vRef = Math.max(referenceRate, EPSILON);
  return 1 + kv * (consumptionRate / vRef);
}

/**
 * Get event price modifiers
 */
function getEventPriceModifier(
  islandId: string,
  goodId: GoodId,
  events: WorldEvent[]
): number {
  let modifier = 1;

  for (const event of events) {
    if (event.targetId === islandId || event.targetId === 'global') {
      // Festival increases luxury prices
      if (
        event.type === 'festival' &&
        goodId === 'luxuries' &&
        event.modifiers.luxuryDemandMultiplier !== undefined
      ) {
        modifier *= event.modifiers.luxuryDemandMultiplier;
      }
      // Blight increases grain prices
      if (
        event.type === 'blight' &&
        goodId === 'grain' &&
        event.modifiers.grainProductionMultiplier !== undefined
      ) {
        // Lower production = higher prices
        modifier *= 1 / Math.max(event.modifiers.grainProductionMultiplier, 0.5);
      }
    }
  }

  return modifier;
}

/**
 * Get market config for a good's category (Track 05)
 */
function getGoodMarketConfig(
  goodDef: GoodDefinition,
  config: SimulationConfig
): GoodMarketConfig {
  return config.goodMarketConfigs[goodDef.category];
}

/**
 * Calculate raw price for a good (Track 05: uses per-category elasticity)
 * Formula: raw_price = base_price * pressure * velocity * event_modifiers
 */
function calculateRawPrice(
  goodDef: GoodDefinition,
  currentStock: number,
  idealStock: number,
  consumptionRate: number,
  referenceConsumption: number,
  events: WorldEvent[],
  islandId: string,
  config: SimulationConfig
): number {
  const goodConfig = getGoodMarketConfig(goodDef, config);

  // Use per-category elasticity (Track 05)
  const pressure = calculatePressure(currentStock, idealStock, goodConfig.priceElasticity);
  const velocity = calculateVelocity(
    consumptionRate,
    referenceConsumption,
    goodConfig.velocityCoefficient
  );
  const eventMod = getEventPriceModifier(islandId, goodDef.id, events);

  return goodDef.basePrice * pressure * velocity * eventMod;
}

/**
 * Apply EMA smoothing to price update
 * Formula: price_{t+1} = price_t + lambda * (raw_price - price_t)
 */
function smoothPrice(
  currentPrice: number,
  rawPrice: number,
  lambda: number
): number {
  return currentPrice + lambda * (rawPrice - currentPrice);
}

/**
 * Update consumption velocity estimate (EMA)
 */
function updateVelocity(
  currentVelocity: number,
  newConsumption: number,
  smoothingFactor: number = 0.1
): number {
  return currentVelocity + smoothingFactor * (newConsumption - currentVelocity);
}

/**
 * Update market state for an island
 * Returns new market state
 *
 * Market buildings provide price stabilization, reducing volatility by
 * pulling prices toward the base price.
 */
export function updateMarket(
  island: IslandState,
  goods: Map<GoodId, GoodDefinition>,
  consumptionThisTick: Map<GoodId, number>,
  events: WorldEvent[],
  config: SimulationConfig,
  _dt: number
): MarketState {
  const newPrices = new Map<GoodId, number>();
  const newMomentum = new Map<GoodId, number>();
  const newVelocity = new Map<GoodId, number>();

  // Get market building effect for price stabilization
  const marketEffect = getMarketEffect(island, config.buildingsConfig);
  const priceStabilization = marketEffect.priceStabilization;

  for (const [goodId, goodDef] of goods) {
    const currentStock = island.inventory.get(goodId) ?? 0;
    const idealStock = island.market.idealStock.get(goodId) ?? 100;
    const currentPrice = island.market.prices.get(goodId) ?? goodDef.basePrice;
    const currentVelocity = island.market.consumptionVelocity.get(goodId) ?? 1;
    const consumed = consumptionThisTick.get(goodId) ?? 0;

    // Update velocity estimate
    const updatedVelocity = updateVelocity(currentVelocity, consumed);
    newVelocity.set(goodId, updatedVelocity);

    // Reference consumption (based on population and type)
    const referenceConsumption =
      goodDef.category === 'food' ? island.population.size * 0.1 : 1;

    // Calculate raw price
    const rawPrice = calculateRawPrice(
      goodDef,
      currentStock,
      idealStock,
      updatedVelocity,
      referenceConsumption,
      events,
      island.id,
      config
    );

    // Apply market building stabilization: blend raw price toward base price
    // priceStabilization of 0 = no effect, 0.6 = 60% pull toward base price
    const stabilizedRawPrice = rawPrice * (1 - priceStabilization) + goodDef.basePrice * priceStabilization;

    // Apply smoothing
    const smoothedPrice = smoothPrice(currentPrice, stabilizedRawPrice, config.priceLambda);

    // Clamp to bounds (both global and per-good based on base price)
    // Per-good bounds: 0.2x to 20x base price prevents extreme divergence
    const goodMinPrice = Math.max(config.minPrice, goodDef.basePrice * 0.2);
    const goodMaxPrice = Math.min(config.maxPrice, goodDef.basePrice * 20);
    const finalPrice = Math.max(goodMinPrice, Math.min(goodMaxPrice, smoothedPrice));

    newPrices.set(goodId, finalPrice);

    // Track momentum for UI (price change direction)
    const momentum = finalPrice - currentPrice;
    newMomentum.set(goodId, momentum);
  }

  return {
    prices: newPrices,
    idealStock: island.market.idealStock,
    momentum: newMomentum,
    consumptionVelocity: newVelocity,
    // Preserve market depth (updated separately via depth regeneration)
    buyDepth: island.market.buyDepth,
    sellDepth: island.market.sellDepth,
  };
}

/**
 * Options for trade execution (Economic Model V2)
 */
export interface TradeExecutionOptions {
  /** Transaction tax rate (0.04 = 4%), tax is destroyed */
  taxRate?: number;
  /** Island's current treasury balance (for purchasing power limits) */
  islandTreasury?: number;
  /** Whether to enforce island purchasing power limits */
  enforcePurchasingPower?: boolean;
  /** Maximum fraction of treasury island can spend per transaction (0.1 = 10%) */
  maxSpendRatio?: number;
  /** Market depth configuration (for price impact) */
  marketDepthConfig?: MarketDepthConfig;
  /** Current market state (for accessing depth) */
  market?: MarketState;
}

/**
 * Execute a trade transaction at an island
 * Returns updated inventories, cash, and treasury changes
 *
 * Economic Model V2 changes:
 * - Island receives money when ships BUY (export revenue)
 * - Island pays money when ships SELL (import costs)
 * - Transaction tax is still destroyed (currency sink)
 * - Optional purchasing power limits for islands
 */
export function executeTrade(
  islandInventory: Map<GoodId, number>,
  shipCargo: Map<GoodId, number>,
  shipCash: number,
  transactions: Array<{ goodId: GoodId; quantity: number }>, // positive = buy from island
  prices: Map<GoodId, number>,
  taxRateOrOptions: number | TradeExecutionOptions = 0
): {
  newIslandInventory: Map<GoodId, number>;
  newShipCargo: Map<GoodId, number>;
  newShipCash: number;
  totalCost: number;
  taxCollected: number; // Total tax collected (currency destroyed)
  // Economic Model V2: Island treasury changes
  islandExportRevenue: number;  // Money island received from exports
  islandImportCost: number;     // Money island spent on imports
  islandTreasuryChange: number; // Net change to island treasury
} {
  // Parse options (backwards compatible with old taxRate-only signature)
  const options: TradeExecutionOptions = typeof taxRateOrOptions === 'number'
    ? { taxRate: taxRateOrOptions }
    : taxRateOrOptions;

  const taxRate = options.taxRate ?? 0;
  const islandTreasury = options.islandTreasury ?? Infinity; // No limit if not specified
  const enforcePurchasingPower = options.enforcePurchasingPower ?? false;
  const maxSpendRatio = options.maxSpendRatio ?? 0.1;

  const newIslandInventory = new Map(islandInventory);
  const newShipCargo = new Map(shipCargo);
  let newShipCash = shipCash;
  let totalCost = 0;
  let taxCollected = 0;
  let islandExportRevenue = 0;
  let islandImportCost = 0;

  // Calculate island's spending budget for this transaction
  const islandBudget = enforcePurchasingPower
    ? Math.max(0, islandTreasury * maxSpendRatio)
    : Infinity;
  let islandSpentSoFar = 0;

  for (const { goodId, quantity } of transactions) {
    const price = prices.get(goodId) ?? 10;

    if (quantity > 0) {
      // Ship BUYING from island = Island EXPORTING
      // Ship pays island, island receives export revenue
      const available = newIslandInventory.get(goodId) ?? 0;
      const actualQty = Math.min(quantity, available);
      const baseCost = actualQty * price;
      const tax = baseCost * taxRate;
      const totalWithTax = baseCost + tax;

      if (totalWithTax <= newShipCash && actualQty > 0) {
        newIslandInventory.set(goodId, available - actualQty);
        newShipCargo.set(goodId, (newShipCargo.get(goodId) ?? 0) + actualQty);
        newShipCash -= totalWithTax; // Ship pays cost + tax
        totalCost += baseCost;
        taxCollected += tax; // Tax is destroyed (currency sink)

        // Economic Model V2: Island receives export revenue (pre-tax)
        islandExportRevenue += baseCost;
      }
    } else if (quantity < 0) {
      // Ship SELLING to island = Island IMPORTING
      // Island pays ship from treasury
      const sellingQty = Math.abs(quantity);
      const hasCargo = newShipCargo.get(goodId) ?? 0;
      let actualQty = Math.min(sellingQty, hasCargo);
      const baseRevenue = actualQty * price;

      // Economic Model V2: Check if island can afford this import
      if (enforcePurchasingPower) {
        const remainingBudget = islandBudget - islandSpentSoFar;
        if (baseRevenue > remainingBudget) {
          // Reduce quantity to what island can afford
          actualQty = Math.floor(remainingBudget / price);
        }
      }

      if (actualQty > 0) {
        const actualRevenue = actualQty * price;
        const tax = actualRevenue * taxRate;
        const netRevenue = actualRevenue - tax;

        newShipCargo.set(goodId, hasCargo - actualQty);
        newIslandInventory.set(
          goodId,
          (newIslandInventory.get(goodId) ?? 0) + actualQty
        );
        newShipCash += netRevenue; // Ship receives revenue minus tax
        totalCost -= actualRevenue; // Negative cost = revenue (pre-tax for accounting)
        taxCollected += tax; // Tax is destroyed (currency sink)

        // Economic Model V2: Island pays for imports
        islandImportCost += actualRevenue;
        islandSpentSoFar += actualRevenue;
      }
    }
  }

  return {
    newIslandInventory,
    newShipCargo,
    newShipCash,
    totalCost,
    taxCollected,
    // Economic Model V2
    islandExportRevenue,
    islandImportCost,
    islandTreasuryChange: islandExportRevenue - islandImportCost,
  };
}

/**
 * Trade execution result with price impact information (Economic Model V2)
 */
export interface TradeWithPriceImpactResult {
  newIslandInventory: Map<GoodId, number>;
  newShipCargo: Map<GoodId, number>;
  newShipCash: number;
  totalCost: number;
  taxCollected: number;
  islandExportRevenue: number;
  islandImportCost: number;
  islandTreasuryChange: number;
  /** Updated market state with consumed depth */
  newMarket: MarketState;
  /** Price impact details per transaction */
  priceImpacts: Array<{
    goodId: GoodId;
    quotedPrice: number;
    executionPrice: number;
    priceImpact: number;
    quantity: number;
  }>;
  /** Total slippage cost (difference between quoted and execution prices) */
  totalSlippage: number;
}

/**
 * Execute a trade with price impact (Economic Model V2)
 *
 * This version calculates price impact based on market depth:
 * - Large trades get worse prices (slippage)
 * - Consumes market depth, preventing rapid arbitrage
 * - Returns both the trade result and updated market state
 *
 * @param islandInventory - Current island inventory
 * @param shipCargo - Current ship cargo
 * @param shipCash - Current ship cash
 * @param transactions - Array of trades (positive qty = buy from island)
 * @param market - Current market state (prices and depth)
 * @param config - Market depth configuration
 * @param options - Additional trade options (tax, treasury limits)
 * @returns Trade result with price impact information
 */
export function executeTradeWithPriceImpact(
  islandInventory: Map<GoodId, number>,
  shipCargo: Map<GoodId, number>,
  shipCash: number,
  transactions: Array<{ goodId: GoodId; quantity: number }>,
  market: MarketState,
  config: MarketDepthConfig,
  options: TradeExecutionOptions = {}
): TradeWithPriceImpactResult {
  const taxRate = options.taxRate ?? 0;
  const islandTreasury = options.islandTreasury ?? Infinity;
  const enforcePurchasingPower = options.enforcePurchasingPower ?? false;
  const maxSpendRatio = options.maxSpendRatio ?? 0.1;

  const newIslandInventory = new Map(islandInventory);
  const newShipCargo = new Map(shipCargo);
  let newShipCash = shipCash;
  let totalCost = 0;
  let taxCollected = 0;
  let islandExportRevenue = 0;
  let islandImportCost = 0;
  let totalSlippage = 0;

  // Start with current market state
  let currentMarket = market;

  // Calculate island's spending budget
  const islandBudget = enforcePurchasingPower
    ? Math.max(0, islandTreasury * maxSpendRatio)
    : Infinity;
  let islandSpentSoFar = 0;

  const priceImpacts: TradeWithPriceImpactResult['priceImpacts'] = [];

  for (const { goodId, quantity } of transactions) {
    const quotedPrice = currentMarket.prices.get(goodId) ?? 10;

    if (quantity > 0) {
      // Ship BUYING from island = Island EXPORTING
      // Buy depth determines price impact
      const available = newIslandInventory.get(goodId) ?? 0;
      const actualQty = Math.min(quantity, available);

      if (actualQty <= 0) continue;

      // Calculate price impact for buying
      const buyDepth = currentMarket.buyDepth.get(goodId) ?? config.minDepth;
      const impact: PriceImpactResult = calculatePriceImpact(
        actualQty,
        buyDepth,
        quotedPrice,
        config
      );

      const executionPrice = impact.executionPrice;
      const baseCost = actualQty * executionPrice;
      const slippage = baseCost - (actualQty * quotedPrice);
      const tax = baseCost * taxRate;
      const totalWithTax = baseCost + tax;

      if (totalWithTax <= newShipCash) {
        newIslandInventory.set(goodId, available - actualQty);
        newShipCargo.set(goodId, (newShipCargo.get(goodId) ?? 0) + actualQty);
        newShipCash -= totalWithTax;
        totalCost += baseCost;
        taxCollected += tax;
        islandExportRevenue += baseCost;
        totalSlippage += slippage;

        // Consume depth
        currentMarket = consumeDepth(currentMarket, goodId, actualQty, config);

        priceImpacts.push({
          goodId,
          quotedPrice,
          executionPrice,
          priceImpact: impact.priceImpact,
          quantity: actualQty,
        });
      }
    } else if (quantity < 0) {
      // Ship SELLING to island = Island IMPORTING
      // Sell depth determines price impact
      const sellingQty = Math.abs(quantity);
      const hasCargo = newShipCargo.get(goodId) ?? 0;
      let actualQty = Math.min(sellingQty, hasCargo);

      if (actualQty <= 0) continue;

      // Calculate price impact for selling (negative quantity)
      const sellDepth = currentMarket.sellDepth.get(goodId) ?? config.minDepth;
      const impact: PriceImpactResult = calculatePriceImpact(
        -actualQty, // Negative for sell
        sellDepth,
        quotedPrice,
        config
      );

      const executionPrice = impact.executionPrice;
      let baseRevenue = actualQty * executionPrice;
      const quotedRevenue = actualQty * quotedPrice;
      const slippage = quotedRevenue - baseRevenue; // Positive = loss due to impact

      // Check if island can afford this import
      if (enforcePurchasingPower) {
        const remainingBudget = islandBudget - islandSpentSoFar;
        if (baseRevenue > remainingBudget) {
          actualQty = Math.floor(remainingBudget / executionPrice);
          if (actualQty <= 0) continue;
          baseRevenue = actualQty * executionPrice;
        }
      }

      const tax = baseRevenue * taxRate;
      const netRevenue = baseRevenue - tax;

      newShipCargo.set(goodId, hasCargo - actualQty);
      newIslandInventory.set(
        goodId,
        (newIslandInventory.get(goodId) ?? 0) + actualQty
      );
      newShipCash += netRevenue;
      totalCost -= baseRevenue;
      taxCollected += tax;
      islandImportCost += baseRevenue;
      islandSpentSoFar += baseRevenue;
      totalSlippage += slippage;

      // Consume depth (negative quantity for sell)
      currentMarket = consumeDepth(currentMarket, goodId, -actualQty, config);

      priceImpacts.push({
        goodId,
        quotedPrice,
        executionPrice,
        priceImpact: impact.priceImpact,
        quantity: -actualQty,
      });
    }
  }

  return {
    newIslandInventory,
    newShipCargo,
    newShipCash,
    totalCost,
    taxCollected,
    islandExportRevenue,
    islandImportCost,
    islandTreasuryChange: islandExportRevenue - islandImportCost,
    newMarket: currentMarket,
    priceImpacts,
    totalSlippage,
  };
}

/**
 * Get price breakdown for debugging/UI ("why this price")
 * Track 05: uses per-category elasticity
 */
export function getPriceBreakdown(
  island: IslandState,
  goodId: GoodId,
  goodDef: GoodDefinition,
  events: WorldEvent[],
  config: SimulationConfig
): {
  basePrice: number;
  currentStock: number;
  idealStock: number;
  pressure: number;
  velocity: number;
  eventModifier: number;
  rawPrice: number;
  smoothedPrice: number;
  priceElasticity: number;
} {
  const goodConfig = getGoodMarketConfig(goodDef, config);
  const currentStock = island.inventory.get(goodId) ?? 0;
  const idealStock = island.market.idealStock.get(goodId) ?? 100;
  const consumptionVelocity = island.market.consumptionVelocity.get(goodId) ?? 1;
  const currentPrice = island.market.prices.get(goodId) ?? goodDef.basePrice;

  // Use per-category elasticity (Track 05)
  const pressure = calculatePressure(currentStock, idealStock, goodConfig.priceElasticity);
  const referenceConsumption =
    goodDef.category === 'food' ? island.population.size * 0.1 : 1;
  const velocity = calculateVelocity(
    consumptionVelocity,
    referenceConsumption,
    goodConfig.velocityCoefficient
  );
  const eventModifier = getEventPriceModifier(island.id, goodId, events);

  const rawPrice = goodDef.basePrice * pressure * velocity * eventModifier;
  const smoothedPrice = smoothPrice(currentPrice, rawPrice, config.priceLambda);

  return {
    basePrice: goodDef.basePrice,
    currentStock,
    idealStock,
    pressure,
    velocity,
    eventModifier,
    rawPrice,
    smoothedPrice,
    priceElasticity: goodConfig.priceElasticity,
  };
}

/**
 * Calculate price divergence between islands for a good
 * Returns max divergence ratio
 */
export function calculatePriceDivergence(
  islands: Map<string, IslandState>,
  goodId: GoodId
): { divergence: number; highIsland: string; lowIsland: string } {
  let minPrice = Infinity;
  let maxPrice = 0;
  let highIsland = '';
  let lowIsland = '';

  for (const [islandId, island] of islands) {
    const price = island.market.prices.get(goodId) ?? 10;
    if (price < minPrice) {
      minPrice = price;
      lowIsland = islandId;
    }
    if (price > maxPrice) {
      maxPrice = price;
      highIsland = islandId;
    }
  }

  const divergence = minPrice > 0 ? (maxPrice - minPrice) / minPrice : 0;

  return { divergence, highIsland, lowIsland };
}
