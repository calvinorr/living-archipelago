/**
 * Ecology System
 * Handles regeneration of renewable resources: fish, forest, soil
 * Based on 02_spec.md Section 3
 */

import type {
  IslandState,
  EcosystemState,
  WorldEvent,
} from '../core/types.js';

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate logistic regeneration for a resource
 * Formula: R_{t+1} = clamp( R_t + dt * ( r * R_t * (1 - R_t / K) - harvest_t ), 0, K )
 */
function logisticRegeneration(
  current: number,
  capacity: number,
  regenRate: number,
  harvest: number,
  dt: number
): number {
  const growth = regenRate * current * (1 - current / capacity);
  const netChange = dt * (growth - harvest);
  return clamp(current + netChange, 0, capacity);
}

/**
 * Get event modifier for ecosystem regeneration
 */
function getEcosystemEventModifier(
  islandId: string,
  events: WorldEvent[]
): { soilRegenMultiplier: number } {
  let soilRegenMultiplier = 1;

  for (const event of events) {
    if (event.targetId === islandId || event.targetId === 'global') {
      if (event.modifiers.soilFertilityRegenMultiplier !== undefined) {
        soilRegenMultiplier *= event.modifiers.soilFertilityRegenMultiplier;
      }
    }
  }

  return { soilRegenMultiplier };
}

/**
 * Calculate harvest pressure on fish stock from fishing labor
 */
function calculateFishHarvest(
  island: IslandState,
  fishProductionRate: number
): number {
  const fishingLabor = island.population.labour.fishing;
  const laborModifier = Math.pow(fishingLabor / 0.2, 0.5); // assuming 0.2 as reference
  const healthModifier = 0.5 + 0.5 * island.population.health;

  // Harvest is proportional to production
  return fishProductionRate * laborModifier * healthModifier * 0.1; // 10% of production as harvest pressure
}

/**
 * Calculate harvest pressure on forest biomass from forestry labor
 */
function calculateForestHarvest(
  island: IslandState,
  timberProductionRate: number
): number {
  const forestryLabor = island.population.labour.forestry;
  const laborModifier = Math.pow(forestryLabor / 0.15, 0.5);
  const healthModifier = 0.5 + 0.5 * island.population.health;

  return timberProductionRate * laborModifier * healthModifier * 0.05;
}

/**
 * Calculate soil fertility dynamics
 * Soil decreases with farming, recovers when farming is low
 */
function updateSoilFertility(
  current: number,
  farmingLabor: number,
  grainProductionRate: number,
  regenBase: number,
  depletionRate: number,
  eventMultiplier: number,
  dt: number
): number {
  // Depletion proportional to farming intensity
  const depletion = depletionRate * farmingLabor * grainProductionRate * 0.001;

  // Regeneration when farming is low
  const fallowBonus = farmingLabor < 0.1 ? 0.01 : 0;
  const regen = regenBase * (1 - farmingLabor) + fallowBonus;

  const netChange = dt * (regen * eventMultiplier - depletion);
  return clamp(current + netChange, 0, 1);
}

/**
 * Update ecosystem state for an island
 * Pure function - returns new state without mutating input
 */
export function updateEcology(
  island: IslandState,
  events: WorldEvent[],
  dt: number
): EcosystemState {
  const { ecosystem, ecosystemParams, productionParams } = island;
  const eventMods = getEcosystemEventModifier(island.id, events);

  // Get production rates for harvest calculation
  const fishRate = productionParams.baseRate.get('fish') ?? 0;
  const timberRate = productionParams.baseRate.get('timber') ?? 0;
  const grainRate = productionParams.baseRate.get('grain') ?? 0;

  // Calculate harvests
  const fishHarvest = calculateFishHarvest(island, fishRate);
  const forestHarvest = calculateForestHarvest(island, timberRate);

  // Update fish stock with logistic regeneration
  const newFishStock = logisticRegeneration(
    ecosystem.fishStock,
    ecosystemParams.fishCapacity,
    ecosystemParams.fishRegenRate,
    fishHarvest,
    dt
  );

  // Update forest biomass with logistic regeneration
  const newForestBiomass = logisticRegeneration(
    ecosystem.forestBiomass,
    ecosystemParams.forestCapacity,
    ecosystemParams.forestRegenRate,
    forestHarvest,
    dt
  );

  // Update soil fertility
  const newSoilFertility = updateSoilFertility(
    ecosystem.soilFertility,
    island.population.labour.farming,
    grainRate,
    ecosystemParams.soilRegenBase,
    ecosystemParams.soilDepletionRate,
    eventMods.soilRegenMultiplier,
    dt
  );

  return {
    fishStock: newFishStock,
    forestBiomass: newForestBiomass,
    soilFertility: newSoilFertility,
  };
}

/**
 * Get ecosystem health indicators (for agent observation)
 */
export function getEcosystemIndicators(
  ecosystem: EcosystemState,
  params: import('../core/types.js').EcosystemParams
): {
  fishHealth: number; // 0-1 ratio to capacity
  forestHealth: number;
  soilHealth: number;
} {
  return {
    fishHealth: ecosystem.fishStock / params.fishCapacity,
    forestHealth: ecosystem.forestBiomass / params.forestCapacity,
    soilHealth: ecosystem.soilFertility,
  };
}
