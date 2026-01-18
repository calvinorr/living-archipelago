/**
 * Consumption System
 * Handles population food consumption and effects
 * Based on 02_spec.md Section 4.2
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
 * Calculate food needed for population
 */
function calculateFoodNeeded(
  populationSize: number,
  foodPerCapita: number,
  events: WorldEvent[],
  islandId: string,
  dt: number
): number {
  const baseDemand = populationSize * foodPerCapita * dt;
  // Average food demand modifier across food types
  const fishMod = getDemandEventModifier(islandId, 'fish', events);
  const grainMod = getDemandEventModifier(islandId, 'grain', events);
  const avgMod = (fishMod + grainMod) / 2;
  return baseDemand * avgMod;
}

/**
 * Consume food from inventory
 * Prefers grain over fish (less spoilage), but will eat both
 */
function consumeFood(
  inventory: Map<GoodId, number>,
  amountNeeded: number
): { consumed: number; remaining: Map<GoodId, number> } {
  const remaining = new Map(inventory);
  let consumed = 0;

  // Food types in preference order (grain first - less spoilage)
  const foodTypes: GoodId[] = ['grain', 'fish'];

  for (const foodType of foodTypes) {
    const available = remaining.get(foodType) ?? 0;
    const toConsume = Math.min(available, amountNeeded - consumed);

    if (toConsume > 0) {
      remaining.set(foodType, available - toConsume);
      consumed += toConsume;
    }

    if (consumed >= amountNeeded) break;
  }

  return { consumed, remaining };
}

/**
 * Optional luxury consumption
 * Provides small health/stability bonus
 */
function consumeLuxuries(
  inventory: Map<GoodId, number>,
  populationSize: number,
  events: WorldEvent[],
  islandId: string,
  dt: number
): { consumed: number; remaining: Map<GoodId, number> } {
  const remaining = new Map(inventory);
  const available = remaining.get('luxuries') ?? 0;

  if (available <= 0) {
    return { consumed: 0, remaining };
  }

  // Luxury consumption is optional, rate based on events
  const demandMod = getDemandEventModifier(islandId, 'luxuries', events);
  const baseRate = 0.01; // 1% of population per tick
  const desired = populationSize * baseRate * demandMod * dt;
  const consumed = Math.min(available, desired);

  remaining.set('luxuries', available - consumed);
  return { consumed, remaining };
}

/**
 * Update island inventory based on consumption
 * Returns consumption result including deficits
 */
export function updateConsumption(
  island: IslandState,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): ConsumptionResult {
  const foodNeeded = calculateFoodNeeded(
    island.population.size,
    config.foodPerCapita,
    events,
    island.id,
    dt
  );

  // Consume food
  const { consumed: foodConsumed, remaining: afterFood } = consumeFood(
    island.inventory,
    foodNeeded
  );

  const foodDeficit = Math.max(0, foodNeeded - foodConsumed);

  // Consume luxuries (optional)
  const { consumed: luxuryConsumed, remaining: finalInventory } = consumeLuxuries(
    afterFood,
    island.population.size,
    events,
    island.id,
    dt
  );

  return {
    newInventory: finalInventory,
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
