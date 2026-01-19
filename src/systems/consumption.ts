/**
 * Consumption System
 * Handles population food consumption and effects
 * Based on 02_spec.md Section 4.2
 * Updated with price-elastic demand (Track 01)
 */

import type {
  IslandState,
  GoodId,
  WorldEvent,
  SimulationConfig,
} from '../core/types.js';

export interface ConsumptionResult {
  newInventory: Map<GoodId, number>;
  foodDeficit: number; // How much food was missing
  foodConsumed: number;
  luxuryConsumed: number;
}

export interface FoodDemand {
  grainDemand: number;
  fishDemand: number;
  totalDemand: number;
}

// Base prices for elasticity calculations (from MVP_GOODS in world.ts)
const BASE_PRICES = {
  fish: 8,
  grain: 6,
  luxuries: 30,
};

/**
 * Get event modifier for demand
 */
function getDemandEventModifier(
  islandId: string,
  goodId: GoodId,
  events: WorldEvent[]
): number {
  let modifier = 1;

  for (const event of events) {
    if (event.targetId === islandId || event.targetId === 'global') {
      if (event.modifiers.foodDemandMultiplier !== undefined) {
        if (goodId === 'fish' || goodId === 'grain') {
          modifier *= event.modifiers.foodDemandMultiplier;
        }
      }
      if (event.modifiers.luxuryDemandMultiplier !== undefined) {
        if (goodId === 'luxuries') {
          modifier *= event.modifiers.luxuryDemandMultiplier;
        }
      }
    }
  }

  return modifier;
}

/**
 * Calculate price-elastic food demand with substitution effects (Track 01)
 *
 * Implements:
 * 1. Health factor: sicker populations consume less (rationing)
 * 2. Price elasticity: higher prices reduce demand
 * 3. Substitution: when one food is expensive, demand shifts to the other
 */
export function calculateFoodDemand(
  island: IslandState,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): FoodDemand {
  const pop = island.population.size;
  const baseNeed = pop * config.foodPerCapita * dt;

  // Health factor: sicker populations ration consumption
  // Range: (1 - healthFactor) to 1.0, e.g., 0.7 to 1.0 with default 0.3
  const healthFactor =
    1 - config.healthConsumptionFactor +
    config.healthConsumptionFactor * island.population.health;

  // Get current prices (fall back to base prices if not set)
  const grainPrice = island.market.prices.get('grain') ?? BASE_PRICES.grain;
  const fishPrice = island.market.prices.get('fish') ?? BASE_PRICES.fish;

  // Apply event modifiers to demand
  const grainEventMod = getDemandEventModifier(island.id, 'grain', events);
  const fishEventMod = getDemandEventModifier(island.id, 'fish', events);

  // Price elasticity effect: Q = Q_base * (P_ref / P_current)^elasticity
  // With negative elasticity, higher prices reduce demand
  // (P_ref / P_current)^(-0.3) means if price doubles, demand drops to ~0.81x
  const grainElasticityMult = Math.pow(
    BASE_PRICES.grain / grainPrice,
    -config.foodPriceElasticity
  );
  const fishElasticityMult = Math.pow(
    BASE_PRICES.fish / fishPrice,
    -config.foodPriceElasticity
  );

  // Substitution effect: relative price determines share between foods
  // When fish is expensive relative to grain, grain share increases
  // Using tanh to smoothly bound the range
  const relativePrice = (fishPrice / BASE_PRICES.fish) / (grainPrice / BASE_PRICES.grain);
  const logRatio = Math.log(relativePrice) * config.foodSubstitutionElasticity;
  // grainShare ranges from 0.25 to 0.75 based on relative prices
  const grainShare = 0.5 + 0.25 * Math.tanh(logRatio);
  const fishShare = 1 - grainShare;

  // Calculate adjusted base need
  const adjustedNeed = baseNeed * healthFactor;

  // Final demand for each food type
  const grainDemand = adjustedNeed * grainShare * grainElasticityMult * grainEventMod;
  const fishDemand = adjustedNeed * fishShare * fishElasticityMult * fishEventMod;

  return {
    grainDemand: Math.max(0, grainDemand),
    fishDemand: Math.max(0, fishDemand),
    totalDemand: Math.max(0, grainDemand + fishDemand),
  };
}

/**
 * Consume food from inventory based on elastic demand (Track 01)
 * Attempts to fulfill grain and fish demands separately, with overflow handling
 */
function consumeFoodElastic(
  inventory: Map<GoodId, number>,
  demand: FoodDemand
): { consumed: number; remaining: Map<GoodId, number> } {
  const remaining = new Map(inventory);
  let consumed = 0;

  const grainAvailable = remaining.get('grain') ?? 0;
  const fishAvailable = remaining.get('fish') ?? 0;

  // Try to fulfill each demand
  const grainConsumed = Math.min(grainAvailable, demand.grainDemand);
  const fishConsumed = Math.min(fishAvailable, demand.fishDemand);

  // Handle unfulfilled demand: try to substitute
  const grainDeficit = demand.grainDemand - grainConsumed;
  const fishDeficit = demand.fishDemand - fishConsumed;

  // If grain is short, try to get more fish
  const extraFishAvailable = fishAvailable - fishConsumed;
  const fishSubstitution = Math.min(extraFishAvailable, grainDeficit);

  // If fish is short, try to get more grain
  const extraGrainAvailable = grainAvailable - grainConsumed;
  const grainSubstitution = Math.min(extraGrainAvailable, fishDeficit);

  // Final consumption
  const finalGrainConsumed = grainConsumed + grainSubstitution;
  const finalFishConsumed = fishConsumed + fishSubstitution;

  remaining.set('grain', grainAvailable - finalGrainConsumed);
  remaining.set('fish', fishAvailable - finalFishConsumed);

  consumed = finalGrainConsumed + finalFishConsumed;

  return { consumed, remaining };
}

/**
 * Optional luxury consumption with price elasticity (Track 01)
 * Provides small health/stability bonus
 */
function consumeLuxuries(
  inventory: Map<GoodId, number>,
  island: IslandState,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): { consumed: number; remaining: Map<GoodId, number> } {
  const remaining = new Map(inventory);
  const available = remaining.get('luxuries') ?? 0;

  if (available <= 0) {
    return { consumed: 0, remaining };
  }

  // Get current luxury price
  const luxuryPrice = island.market.prices.get('luxuries') ?? BASE_PRICES.luxuries;

  // Event modifier
  const demandMod = getDemandEventModifier(island.id, 'luxuries', events);

  // Price elasticity: luxuries are highly elastic (default -1.2)
  // Higher prices significantly reduce demand
  const elasticityMult = Math.pow(
    BASE_PRICES.luxuries / luxuryPrice,
    -config.luxuryPriceElasticity
  );

  // Health factor affects luxury consumption too (sick people buy less luxuries)
  const healthFactor =
    1 - config.healthConsumptionFactor +
    config.healthConsumptionFactor * island.population.health;

  // Base luxury consumption rate
  const baseRate = 0.01; // 1% of population per tick
  const desired =
    island.population.size * baseRate * demandMod * elasticityMult * healthFactor * dt;

  const consumed = Math.min(available, Math.max(0, desired));

  remaining.set('luxuries', available - consumed);
  return { consumed, remaining };
}

/**
 * Update island inventory based on consumption
 * Returns consumption result including deficits
 * Updated to use price-elastic demand (Track 01)
 */
export function updateConsumption(
  island: IslandState,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): ConsumptionResult {
  // Calculate price-elastic food demand with substitution
  const foodDemand = calculateFoodDemand(island, config, events, dt);

  // Consume food based on elastic demand
  const { consumed: foodConsumed, remaining: afterFood } = consumeFoodElastic(
    island.inventory,
    foodDemand
  );

  const foodDeficit = Math.max(0, foodDemand.totalDemand - foodConsumed);

  // Consume luxuries (optional) with price elasticity
  const { consumed: luxuryConsumed, remaining: afterLuxuries } = consumeLuxuries(
    afterFood,
    island,
    config,
    events,
    dt
  );

  // No inventory floor - goods can run out completely
  // This creates real scarcity and proper price signals

  return {
    newInventory: afterLuxuries,
    foodDeficit,
    foodConsumed,
    luxuryConsumed,
  };
}

/**
 * Calculate food days of cover (for UI)
 */
export function calculateFoodDaysOfCover(
  island: IslandState,
  config: SimulationConfig
): number {
  const dailyConsumption = island.population.size * config.foodPerCapita * 24;
  if (dailyConsumption <= 0) return Infinity;

  const fishStock = island.inventory.get('fish') ?? 0;
  const grainStock = island.inventory.get('grain') ?? 0;
  const totalFood = fishStock + grainStock;

  return totalFood / dailyConsumption;
}

/**
 * Get consumption breakdown for debugging/UI
 */
export function getConsumptionBreakdown(
  island: IslandState,
  config: SimulationConfig,
  events: WorldEvent[]
): {
  foodPerHour: number;
  foodInStock: number;
  daysOfCover: number;
  luxuryDemandMultiplier: number;
} {
  const foodPerHour = island.population.size * config.foodPerCapita;
  const fishStock = island.inventory.get('fish') ?? 0;
  const grainStock = island.inventory.get('grain') ?? 0;
  const foodInStock = fishStock + grainStock;
  const daysOfCover = calculateFoodDaysOfCover(island, config);
  const luxuryDemandMultiplier = getDemandEventModifier(island.id, 'luxuries', events);

  return {
    foodPerHour,
    foodInStock,
    daysOfCover,
    luxuryDemandMultiplier,
  };
}
