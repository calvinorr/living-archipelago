/**
 * Population System
 * Handles health, size, and labor allocation
 * Based on 02_spec.md Section 4.2 and Section 8
 */

import type {
  IslandState,
  PopulationState,
  LabourAllocation,
  SimulationConfig,
} from '../core/types.js';

import type { ConsumptionResult } from './consumption.js';

/**
 * Clamp value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Calculate health change based on food deficit
 * If food inventory < needed: apply health penalty proportional to deficit
 */
function calculateHealthChange(
  currentHealth: number,
  foodDeficit: number,
  foodConsumed: number,
  luxuryConsumed: number,
  populationSize: number,
  config: SimulationConfig,
  dt: number
): number {
  let healthChange = 0;

  // Food deficit causes health decline
  if (foodDeficit > 0 && foodConsumed > 0) {
    const deficitRatio = foodDeficit / (foodConsumed + foodDeficit);
    healthChange -= config.healthPenaltyRate * deficitRatio * dt;
  } else if (foodDeficit > 0 && foodConsumed === 0) {
    // Complete starvation - severe penalty
    healthChange -= config.healthPenaltyRate * 2 * dt;
  }

  // Natural health recovery when well-fed
  if (foodDeficit === 0 && currentHealth < 1) {
    const recoveryRate = 0.01; // 1% per hour
    healthChange += recoveryRate * dt;
  }

  // Luxury bonus (small)
  if (luxuryConsumed > 0 && populationSize > 0) {
    const luxuryBonus = 0.001 * (luxuryConsumed / populationSize);
    healthChange += luxuryBonus * dt;
  }

  return healthChange;
}

/**
 * Calculate population size change
 * If health below threshold for sustained period, reduce population size
 */
function calculatePopulationChange(
  currentSize: number,
  health: number,
  config: SimulationConfig,
  dt: number
): number {
  let sizeChange = 0;

  // Population decline when health is critically low
  if (health < config.populationDeclineThreshold) {
    const severity = 1 - health / config.populationDeclineThreshold;
    const declineRate = 0.01 * severity; // Up to 1% per hour at 0 health
    sizeChange -= currentSize * declineRate * dt;
  }

  // Natural growth when healthy (very slow)
  if (health > 0.8) {
    const growthRate = 0.0001; // 0.01% per hour
    sizeChange += currentSize * growthRate * dt;
  }

  return sizeChange;
}

/**
 * Reallocate labor based on island conditions
 * This is a simple adaptive model - populations shift toward productive sectors
 */
function reallocateLabour(
  currentLabour: LabourAllocation,
  island: IslandState,
  dt: number
): LabourAllocation {
  const adjustment = 0.001 * dt; // Slow adjustment rate

  // Get ecosystem health to guide allocation
  const fishHealth =
    island.ecosystem.fishStock / island.ecosystemParams.fishCapacity;
  const forestHealth =
    island.ecosystem.forestBiomass / island.ecosystemParams.forestCapacity;
  const soilHealth = island.ecosystem.soilFertility;

  // Calculate target allocation based on resource availability
  const weights = {
    fishing: fishHealth * 0.3,
    forestry: forestHealth * 0.2,
    farming: soilHealth * 0.3,
    industry: 0.1,
    services: 0.1,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  // Normalize weights
  const targets: LabourAllocation = {
    fishing: weights.fishing / totalWeight,
    forestry: weights.forestry / totalWeight,
    farming: weights.farming / totalWeight,
    industry: weights.industry / totalWeight,
    services: weights.services / totalWeight,
  };

  // Gradual adjustment toward targets
  const newLabour: LabourAllocation = {
    fishing:
      currentLabour.fishing +
      adjustment * (targets.fishing - currentLabour.fishing),
    forestry:
      currentLabour.forestry +
      adjustment * (targets.forestry - currentLabour.forestry),
    farming:
      currentLabour.farming +
      adjustment * (targets.farming - currentLabour.farming),
    industry:
      currentLabour.industry +
      adjustment * (targets.industry - currentLabour.industry),
    services:
      currentLabour.services +
      adjustment * (targets.services - currentLabour.services),
  };

  // Normalize to ensure sum = 1
  const total =
    newLabour.fishing +
    newLabour.forestry +
    newLabour.farming +
    newLabour.industry +
    newLabour.services;

  return {
    fishing: newLabour.fishing / total,
    forestry: newLabour.forestry / total,
    farming: newLabour.farming / total,
    industry: newLabour.industry / total,
    services: newLabour.services / total,
  };
}

/**
 * Update population state based on consumption results
 * Returns new population state
 */
export function updatePopulation(
  island: IslandState,
  consumptionResult: ConsumptionResult,
  config: SimulationConfig,
  dt: number
): PopulationState {
  const { population } = island;
  const { foodDeficit, foodConsumed, luxuryConsumed } = consumptionResult;

  // Calculate health change
  const healthChange = calculateHealthChange(
    population.health,
    foodDeficit,
    foodConsumed,
    luxuryConsumed,
    population.size,
    config,
    dt
  );
  const newHealth = clamp01(population.health + healthChange);

  // Calculate population size change
  const sizeChange = calculatePopulationChange(
    population.size,
    newHealth,
    config,
    dt
  );
  const newSize = Math.max(1, population.size + sizeChange); // Minimum population of 1

  // Reallocate labor
  const newLabour = reallocateLabour(population.labour, island, dt);

  return {
    size: newSize,
    health: newHealth,
    labour: newLabour,
  };
}

/**
 * Calculate migration attractiveness score for an island
 * Higher score = more attractive for migrants
 */
export function calculateMigrationAttractiveness(
  island: IslandState,
  config: SimulationConfig
): number {
  // Food surplus factor
  const fishStock = island.inventory.get('fish') ?? 0;
  const grainStock = island.inventory.get('grain') ?? 0;
  const totalFood = fishStock + grainStock;
  const dailyNeed = island.population.size * config.foodPerCapita * 24;
  const foodSurplusScore = Math.min(2, totalFood / Math.max(dailyNeed, 1));

  // Price factor (lower prices = more attractive)
  const fishPrice = island.market.prices.get('fish') ?? 10;
  const grainPrice = island.market.prices.get('grain') ?? 8;
  const avgFoodPrice = (fishPrice + grainPrice) / 2;
  const priceScore = 1 / (1 + avgFoodPrice / 20); // Normalize

  // Health factor
  const healthScore = island.population.health;

  // Ecosystem health factor
  const ecoScore =
    (island.ecosystem.fishStock / island.ecosystemParams.fishCapacity +
      island.ecosystem.forestBiomass / island.ecosystemParams.forestCapacity +
      island.ecosystem.soilFertility) /
    3;

  // Combined score
  return foodSurplusScore * 0.4 + priceScore * 0.2 + healthScore * 0.2 + ecoScore * 0.2;
}

/**
 * Check if migration should trigger
 * Returns migration fraction if triggered, 0 otherwise
 */
export function checkMigrationTrigger(
  island: IslandState,
  _config: SimulationConfig,
  sustainedDeficitTicks: number
): number {
  const thresholdTicks = 48; // 2 game days of sustained issues

  // Check for sustained food deficit
  if (sustainedDeficitTicks >= thresholdTicks) {
    return 0.01; // 1% of population considers leaving
  }

  // Check for low health
  if (island.population.health < 0.3) {
    return 0.005;
  }

  return 0;
}

/**
 * Get population indicators for UI/agents
 */
export function getPopulationIndicators(population: PopulationState): {
  size: number;
  health: number;
  dominantSector: string;
  laborDistribution: Record<string, number>;
} {
  const { labour } = population;

  // Find dominant sector
  let maxShare = 0;
  let dominantSector = 'services';
  for (const [sector, share] of Object.entries(labour)) {
    if (share > maxShare) {
      maxShare = share;
      dominantSector = sector;
    }
  }

  return {
    size: Math.round(population.size),
    health: population.health,
    dominantSector,
    laborDistribution: {
      fishing: Math.round(labour.fishing * 100),
      forestry: Math.round(labour.forestry * 100),
      farming: Math.round(labour.farming * 100),
      industry: Math.round(labour.industry * 100),
      services: Math.round(labour.services * 100),
    },
  };
}
