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
} from '../core/types.js';

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

    // Apply smoothing
    const smoothedPrice = smoothPrice(currentPrice, rawPrice, config.priceLambda);

    // Clamp to bounds
    const finalPrice = Math.max(
      config.minPrice,
      Math.min(config.maxPrice, smoothedPrice)
    );

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
  };
}

/**
 * Execute a trade transaction at an island
 * Returns updated inventories
 */
export function executeTrade(
  islandInventory: Map<GoodId, number>,
  shipCargo: Map<GoodId, number>,
  shipCash: number,
  transactions: Array<{ goodId: GoodId; quantity: number }>, // positive = buy from island
  prices: Map<GoodId, number>
): {
  newIslandInventory: Map<GoodId, number>;
  newShipCargo: Map<GoodId, number>;
  newShipCash: number;
  totalCost: number;
} {
  const newIslandInventory = new Map(islandInventory);
  const newShipCargo = new Map(shipCargo);
  let newShipCash = shipCash;
  let totalCost = 0;

  for (const { goodId, quantity } of transactions) {
    const price = prices.get(goodId) ?? 10;

    if (quantity > 0) {
      // Buying from island
      const available = newIslandInventory.get(goodId) ?? 0;
      const actualQty = Math.min(quantity, available);
      const cost = actualQty * price;

      if (cost <= newShipCash && actualQty > 0) {
        newIslandInventory.set(goodId, available - actualQty);
        newShipCargo.set(goodId, (newShipCargo.get(goodId) ?? 0) + actualQty);
        newShipCash -= cost;
        totalCost += cost;
      }
    } else if (quantity < 0) {
      // Selling to island
      const sellingQty = Math.abs(quantity);
      const hasCargo = newShipCargo.get(goodId) ?? 0;
      const actualQty = Math.min(sellingQty, hasCargo);
      const revenue = actualQty * price;

      if (actualQty > 0) {
        newShipCargo.set(goodId, hasCargo - actualQty);
        newIslandInventory.set(
          goodId,
          (newIslandInventory.get(goodId) ?? 0) + actualQty
        );
        newShipCash += revenue;
        totalCost -= revenue; // Negative cost = revenue
      }
    }
  }

  return {
    newIslandInventory,
    newShipCargo,
    newShipCash,
    totalCost,
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
