/**
 * Supply Shocks System (Economic Model V2)
 *
 * Implements production variance and supply shocks:
 * - Base variance: Random +/- variance on all production (makes playthroughs different)
 * - Boom shocks: Temporary production bonus (good harvests, efficiency gains)
 * - Bust shocks: Temporary production penalty (equipment breakdowns, bad weather)
 *
 * Design notes:
 * - Random variance makes each playthrough slightly different
 * - Shocks create trading opportunities (buy from boom islands, avoid bust islands)
 * - Bust chance slightly higher than boom = slight deflationary pressure
 * - Shocks are temporary - economy self-corrects
 * - All randomness uses seeded RNG for determinism
 */

import type {
  IslandState,
  GoodId,
  SupplyVolatilityConfig,
  ProductionShock,
} from '../core/types.js';

/**
 * Result of processing supply shocks for an island
 */
export interface SupplyShockResult {
  /** Updated island state with new/expired shocks */
  newIsland: IslandState;
  /** New shocks triggered this tick */
  shocksTriggered: Array<{ goodId: GoodId; type: 'boom' | 'bust'; multiplier: number }>;
  /** Shocks that expired this tick */
  shocksExpired: Array<{ goodId: GoodId; type: 'boom' | 'bust' }>;
}

/**
 * Process supply shocks for an island
 *
 * This function:
 * 1. Expires old shocks that have reached their end tick
 * 2. Rolls for new shocks based on config probabilities
 * 3. Returns updated island state and metrics
 *
 * @param island - Current island state
 * @param rng - Seeded RNG function returning 0-1
 * @param currentTick - Current simulation tick
 * @param config - Supply volatility configuration
 * @param goodIds - List of goods to process
 */
export function processSupplyShocks(
  island: IslandState,
  rng: () => number,
  currentTick: number,
  config: SupplyVolatilityConfig,
  goodIds: GoodId[]
): SupplyShockResult {
  const shocksTriggered: Array<{ goodId: GoodId; type: 'boom' | 'bust'; multiplier: number }> = [];
  const shocksExpired: Array<{ goodId: GoodId; type: 'boom' | 'bust' }> = [];

  // Clone production shocks map
  const newProductionShocks = new Map<GoodId, ProductionShock>();

  // First, copy over unexpired shocks and track expired ones
  for (const [goodId, shock] of island.productionShocks) {
    if (shock.expiresAtTick > currentTick) {
      // Shock still active
      newProductionShocks.set(goodId, { ...shock });
    } else {
      // Shock expired
      shocksExpired.push({ goodId, type: shock.type });
    }
  }

  // Roll for new shocks for each good (only if not already affected)
  for (const goodId of goodIds) {
    // Skip if this good already has an active shock
    if (newProductionShocks.has(goodId)) {
      continue;
    }

    const roll = rng();

    // Check for boom first (lower probability)
    if (roll < config.boomChance) {
      const shock: ProductionShock = {
        multiplier: config.boomMultiplier,
        expiresAtTick: currentTick + config.shockDuration,
        type: 'boom',
      };
      newProductionShocks.set(goodId, shock);
      shocksTriggered.push({ goodId, type: 'boom', multiplier: config.boomMultiplier });
    }
    // Check for bust (slightly higher probability, but don't double-trigger)
    else if (roll < config.boomChance + config.bustChance) {
      const shock: ProductionShock = {
        multiplier: config.bustMultiplier,
        expiresAtTick: currentTick + config.shockDuration,
        type: 'bust',
      };
      newProductionShocks.set(goodId, shock);
      shocksTriggered.push({ goodId, type: 'bust', multiplier: config.bustMultiplier });
    }
  }

  // Create updated island state
  const newIsland: IslandState = {
    ...island,
    productionShocks: newProductionShocks,
  };

  return { newIsland, shocksTriggered, shocksExpired };
}

/**
 * Get the production multiplier for a specific good
 *
 * Returns the multiplier from any active shock, or 1.0 if no shock active.
 *
 * @param island - Island state with production shocks
 * @param goodId - Good to get multiplier for
 * @param currentTick - Current tick for expiration check
 */
export function getProductionMultiplier(
  island: IslandState,
  goodId: GoodId,
  currentTick: number
): number {
  const shock = island.productionShocks?.get(goodId);

  // No shock or expired shock
  if (!shock || shock.expiresAtTick <= currentTick) {
    return 1.0;
  }

  return shock.multiplier;
}

/**
 * Apply random variance to a production value
 *
 * Adds +/- baseVariance random fluctuation to production.
 * For baseVariance = 0.1, production varies from 0.9x to 1.1x.
 *
 * The variance is applied using a uniform distribution centered on 1.0.
 *
 * @param baseProduction - Base production amount before variance
 * @param rng - Seeded RNG function returning 0-1
 * @param config - Supply volatility configuration
 */
export function applyProductionVariance(
  baseProduction: number,
  rng: () => number,
  config: SupplyVolatilityConfig
): number {
  // Skip variance if baseVariance is 0 or production is 0
  if (config.baseVariance <= 0 || baseProduction <= 0) {
    return baseProduction;
  }

  // Generate variance: rng() gives 0-1, we want -variance to +variance
  // Formula: (rng * 2 - 1) * variance = value between -variance and +variance
  const varianceFactor = (rng() * 2 - 1) * config.baseVariance;

  // Apply variance: multiplier between (1 - variance) and (1 + variance)
  const multiplier = 1 + varianceFactor;

  return Math.max(0, baseProduction * multiplier);
}

/**
 * Get combined production modifier including shock and variance
 *
 * Convenience function that combines shock multiplier with random variance.
 *
 * @param island - Island state
 * @param goodId - Good being produced
 * @param baseProduction - Base production before modifiers
 * @param rng - Seeded RNG function
 * @param currentTick - Current simulation tick
 * @param config - Supply volatility configuration
 */
export function getModifiedProduction(
  island: IslandState,
  goodId: GoodId,
  baseProduction: number,
  rng: () => number,
  currentTick: number,
  config: SupplyVolatilityConfig
): number {
  // Get shock multiplier (boom/bust)
  const shockMultiplier = getProductionMultiplier(island, goodId, currentTick);

  // Apply shock first
  const afterShock = baseProduction * shockMultiplier;

  // Then apply random variance
  const finalProduction = applyProductionVariance(afterShock, rng, config);

  return finalProduction;
}

/**
 * Get active shocks summary for UI/logging
 */
export function getActiveShocksSummary(
  island: IslandState,
  currentTick: number
): Array<{
  goodId: GoodId;
  type: 'boom' | 'bust';
  multiplier: number;
  remainingTicks: number;
}> {
  const summary: Array<{
    goodId: GoodId;
    type: 'boom' | 'bust';
    multiplier: number;
    remainingTicks: number;
  }> = [];

  for (const [goodId, shock] of island.productionShocks) {
    if (shock.expiresAtTick > currentTick) {
      summary.push({
        goodId,
        type: shock.type,
        multiplier: shock.multiplier,
        remainingTicks: shock.expiresAtTick - currentTick,
      });
    }
  }

  return summary;
}
