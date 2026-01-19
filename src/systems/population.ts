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
  Sector,
  GoodId,
} from '../core/types.js';

import { SECTOR_TO_GOOD, SECTORS } from '../core/world.js';
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
 * Calculate growth multiplier from health using continuous curve
 * Returns value from -1 (max decline) to +1 (max growth)
 *
 * Curve behavior:
 *   health < crisis (0.3): -1.0 (max decline)
 *   health = stable (0.5): 0.0 (stable population)
 *   health = optimal (0.9): +1.0 (max growth)
 *   health > optimal: +1.0 (max growth)
 */
export function calculateGrowthMultiplier(
  health: number,
  config: SimulationConfig
): number {
  // Below crisis threshold: max decline
  if (health <= config.crisisHealthThreshold) {
    return -1.0;
  }

  // Between crisis and stable: interpolate decline (-1.0 to 0.0)
  if (health < config.stableHealthThreshold) {
    const ratio =
      (health - config.crisisHealthThreshold) /
      (config.stableHealthThreshold - config.crisisHealthThreshold);
    return -1.0 + ratio; // -1.0 to 0.0
  }

  // Between stable and optimal: interpolate growth (0.0 to 1.0)
  if (health < config.optimalHealthThreshold) {
    const ratio =
      (health - config.stableHealthThreshold) /
      (config.optimalHealthThreshold - config.stableHealthThreshold);
    return ratio; // 0.0 to 1.0
  }

  // Above optimal: max growth
  return 1.0;
}

/**
 * Calculate population size change using realistic annual growth rates
 * Converts annual rates to per-tick rates for accurate compounding
 */
function calculatePopulationChange(
  currentSize: number,
  health: number,
  config: SimulationConfig,
  dt: number
): number {
  // Get growth multiplier from continuous curve (-1 to +1)
  const multiplier = calculateGrowthMultiplier(health, config);

  // Convert annual rate to per-tick (hourly) rate
  // Annual rate = (1 + hourlyRate)^8760 - 1
  // hourlyRate = (1 + annualRate)^(1/8760) - 1
  let annualRate: number;
  if (multiplier >= 0) {
    annualRate = config.maxGrowthRate * multiplier;
  } else {
    // multiplier is negative, maxDeclineRate is positive, result is negative
    annualRate = config.maxDeclineRate * multiplier;
  }

  const hourlyRate = Math.pow(1 + annualRate, 1 / 8760) - 1;
  const change = currentSize * hourlyRate * dt;

  return change;
}

/**
 * Calculate base production for a good at the island (Track 06)
 * Used to estimate marginal product of labor
 */
function getBaseProductionRate(goodId: GoodId, island: IslandState): number {
  return island.productionParams.baseRate.get(goodId) ?? 1;
}

/**
 * Calculate service sector wage based on population wealth (Track 06)
 * Services wage is based on average goods prices and population health
 */
function calculateServiceWage(island: IslandState): number {
  // Base service wage on average price of goods
  let totalPrice = 0;
  let count = 0;
  for (const [, price] of island.market.prices) {
    totalPrice += price;
    count++;
  }
  const avgPrice = count > 0 ? totalPrice / count : 10;

  // Services produce value proportional to population wealth/health
  const healthFactor = 0.5 + 0.5 * island.population.health;
  return avgPrice * healthFactor;
}

/**
 * Calculate implied wages for each sector based on output value (Track 06)
 * wage = price × marginal_product_of_labor
 */
export function calculateSectorWages(
  island: IslandState,
  config: SimulationConfig
): Record<Sector, number> {
  const wages: Record<Sector, number> = {
    fishing: 0,
    forestry: 0,
    farming: 0,
    industry: 0,
    services: 0,
  };

  const pop = island.population.size;
  const alpha = config.labourAlpha;

  for (const sector of SECTORS) {
    const goodId = SECTOR_TO_GOOD[sector];

    if (!goodId) {
      // Services sector - wage based on population wealth
      wages[sector] = calculateServiceWage(island);
      continue;
    }

    // Get current price for this good
    const price = island.market.prices.get(goodId) ?? 10;

    // Get base production rate
    const baseProduction = getBaseProductionRate(goodId, island);

    // Get current labor share in this sector
    const currentLabor = island.population.labour[sector];

    // Calculate effective labor in this sector
    const effectiveLabor = Math.max(currentLabor * pop, 1);

    // Marginal product = derivative of Cobb-Douglas production w.r.t. labor
    // For Q = A * L^alpha, dQ/dL = alpha * A * L^(alpha-1) = alpha * Q / L
    // Simplified: MP = alpha * baseProduction / currentLabor
    const marginalProduct = alpha * baseProduction / effectiveLabor * pop;

    wages[sector] = price * marginalProduct;
  }

  return wages;
}

/**
 * Calculate target labor allocation based on wage differentials (Track 06)
 * Workers prefer higher-wage sectors
 */
function calculateLaborTargets(
  wages: Record<Sector, number>,
  config: SimulationConfig
): Record<Sector, number> {
  const { laborConfig } = config;
  const targets: Record<Sector, number> = {
    fishing: 0,
    forestry: 0,
    farming: 0,
    industry: 0,
    services: 0,
  };

  // Calculate average wage
  const wageValues = Object.values(wages);
  const avgWage = wageValues.reduce((a, b) => a + b, 0) / wageValues.length;

  // Calculate raw targets based on wage ratios
  let totalWeight = 0;
  for (const sector of SECTORS) {
    const wageRatio = wages[sector] / Math.max(avgWage, 0.01);
    const baseShare = laborConfig.baseShares[sector];

    // Target = base allocation adjusted by wage attractiveness
    // attractiveness = (wage/avgWage)^responsiveness
    const attractiveness = Math.pow(
      Math.max(wageRatio, 0.01),
      laborConfig.wageResponsiveness
    );
    const rawTarget = baseShare * attractiveness;

    targets[sector] = rawTarget;
    totalWeight += rawTarget;
  }

  // Normalize
  for (const sector of SECTORS) {
    targets[sector] = targets[sector] / totalWeight;
  }

  // Apply min/max constraints
  for (const sector of SECTORS) {
    targets[sector] = Math.max(
      laborConfig.minSectorShare,
      Math.min(laborConfig.maxSectorShare, targets[sector])
    );
  }

  // Re-normalize after clamping
  const total = SECTORS.reduce((sum, s) => sum + targets[s], 0);
  for (const sector of SECTORS) {
    targets[sector] = targets[sector] / total;
  }

  return targets;
}

/**
 * Clamp and normalize labor allocation to respect constraints (Track 06)
 * Ensures sum = 1 while respecting min/max sector shares
 */
function clampAndNormalize(
  allocation: Record<Sector, number>,
  config: SimulationConfig
): LabourAllocation {
  const { laborConfig } = config;
  const result: LabourAllocation = {
    fishing: allocation.fishing,
    forestry: allocation.forestry,
    farming: allocation.farming,
    industry: allocation.industry,
    services: allocation.services,
  };

  // Iteratively clamp and redistribute
  for (let iter = 0; iter < 10; iter++) {
    let total = 0;
    let unclamped = 0;

    // First pass: clamp and count
    for (const sector of SECTORS) {
      if (result[sector] > laborConfig.maxSectorShare) {
        result[sector] = laborConfig.maxSectorShare;
      } else if (result[sector] < laborConfig.minSectorShare) {
        result[sector] = laborConfig.minSectorShare;
      } else {
        unclamped++;
      }
      total += result[sector];
    }

    // If total is 1, we're done
    if (Math.abs(total - 1.0) < 0.0001) break;

    // Redistribute difference among unclamped sectors
    if (unclamped > 0) {
      const diff = (1.0 - total) / unclamped;
      for (const sector of SECTORS) {
        if (result[sector] > laborConfig.minSectorShare &&
            result[sector] < laborConfig.maxSectorShare) {
          result[sector] += diff;
        }
      }
    }
  }

  // Final normalization (should be very close to 1.0 already)
  const finalTotal = SECTORS.reduce((sum, s) => sum + result[s], 0);
  if (Math.abs(finalTotal - 1.0) > 0.0001) {
    for (const sector of SECTORS) {
      result[sector] = result[sector] / finalTotal;
    }
  }

  return result;
}

/**
 * Apply labor reallocation with friction (Track 06)
 * Workers don't instantly move between sectors
 */
function applyLaborReallocation(
  current: LabourAllocation,
  targets: Record<Sector, number>,
  config: SimulationConfig,
  dt: number
): LabourAllocation {
  const { laborConfig } = config;
  const maxChange = laborConfig.reallocationRate * dt;

  const newAllocation: Record<Sector, number> = {
    fishing: current.fishing,
    forestry: current.forestry,
    farming: current.farming,
    industry: current.industry,
    services: current.services,
  };

  // Apply gradual change toward targets (targets are already constrained)
  for (const sector of SECTORS) {
    const diff = targets[sector] - current[sector];
    const change = Math.sign(diff) * Math.min(Math.abs(diff), maxChange);
    newAllocation[sector] = current[sector] + change;
  }

  // Clamp and normalize to ensure constraints are met
  return clampAndNormalize(newAllocation, config);
}

/**
 * Reallocate labor based on wage signals (Track 06)
 * Workers follow money - high prices attract more labor to that sector
 */
function reallocateLabour(
  currentLabour: LabourAllocation,
  island: IslandState,
  config: SimulationConfig,
  dt: number
): LabourAllocation {
  // Calculate wages for each sector
  const wages = calculateSectorWages(island, config);

  // Calculate target allocation based on wages
  const targets = calculateLaborTargets(wages, config);

  // Apply gradual reallocation toward targets
  return applyLaborReallocation(currentLabour, targets, config, dt);
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

  // Reallocate labor based on wage signals (Track 06)
  const newLabour = reallocateLabour(population.labour, island, config, dt);

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

/**
 * Get labor market indicators for UI/agents (Track 06)
 */
export function getLaborMarketIndicators(
  island: IslandState,
  config: SimulationConfig
): {
  wages: Record<Sector, number>;
  highestWageSector: Sector;
  lowestWageSector: Sector;
  wageSpread: number;
} {
  const wages = calculateSectorWages(island, config);

  let highestWage = 0;
  let lowestWage = Infinity;
  let highestWageSector: Sector = 'services';
  let lowestWageSector: Sector = 'services';

  for (const sector of SECTORS) {
    if (wages[sector] > highestWage) {
      highestWage = wages[sector];
      highestWageSector = sector;
    }
    if (wages[sector] < lowestWage) {
      lowestWage = wages[sector];
      lowestWageSector = sector;
    }
  }

  const wageSpread = lowestWage > 0 ? highestWage / lowestWage : 0;

  return {
    wages,
    highestWageSector,
    lowestWageSector,
    wageSpread,
  };
}
