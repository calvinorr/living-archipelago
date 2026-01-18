/**
 * Ecology System
 * Handles regeneration of renewable resources: fish, forest, soil
 * Based on 02_spec.md Section 3
 * Updated with harvest-production coupling (Track 03)
 * Updated with ecosystem collapse thresholds (Track 07)
 */

import type {
  IslandState,
  EcosystemState,
  WorldEvent,
  SimulationConfig,
  EcosystemHealthState,
} from '../core/types.js';

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Classify ecosystem health based on stock ratio (Track 07)
 *
 * Health states determine both productivity and recovery rates:
 * - healthy (>60%): Full productivity, normal recovery
 * - stressed (30-60%): Declining productivity, normal recovery
 * - degraded (10-30%): Severe decline, impaired recovery (hysteresis)
 * - collapsed (2-10%): Minimal function, very slow recovery
 * - dead (<2%): No function, no natural recovery
 */
export function classifyEcosystemHealth(
  currentStock: number,
  capacity: number,
  config: SimulationConfig
): EcosystemHealthState {
  if (capacity <= 0) return 'dead';

  const ratio = currentStock / capacity;

  if (ratio >= config.healthyThreshold) return 'healthy';
  if (ratio >= config.criticalThreshold) return 'stressed';
  if (ratio >= config.collapseThreshold) return 'degraded';
  if (ratio >= config.deadThreshold) return 'collapsed';
  return 'dead';
}

/**
 * Calculate recovery multiplier based on ecosystem health (Track 07)
 *
 * Implements hysteresis - recovery is slower than degradation:
 * - healthy/stressed: 100% recovery rate
 * - degraded: 50% recovery rate (impaired)
 * - collapsed: 10% recovery rate (minimal)
 * - dead: 0% natural recovery (requires intervention)
 */
export function calculateRecoveryMultiplier(
  currentStock: number,
  capacity: number,
  config: SimulationConfig
): number {
  const health = classifyEcosystemHealth(currentStock, capacity, config);

  switch (health) {
    case 'healthy':
    case 'stressed':
      return 1.0;
    case 'degraded':
      return config.impairedRecoveryMultiplier;
    case 'collapsed':
      return config.collapsedRecoveryMultiplier;
    case 'dead':
      return 0; // Dead ecosystems need deadRecoveryRate instead
  }
}

/**
 * Calculate yield multiplier based on stock-to-capacity ratio (Track 03 + Track 07)
 *
 * The yield curve determines how much production can extract based on ecosystem health:
 * - Dead zone (<2%): no production (0)
 * - Collapse zone (2-10%): minimal yield scaling from 0 to collapseFloor
 * - Degraded zone (10-30%): accelerating decline (quadratic)
 * - Stressed zone (30-60%): linear decline
 * - Healthy zone (>60%): full productivity (1.0)
 *
 * This ensures that depleted ecosystems naturally limit production.
 */
export function calculateYieldMultiplier(
  currentStock: number,
  capacity: number,
  config: SimulationConfig
): number {
  if (capacity <= 0) return 0;

  const ratio = currentStock / capacity;

  // Dead zone: no production (Track 07)
  if (ratio < config.deadThreshold) {
    return 0;
  }

  // Collapse zone: scale from 0 to collapseFloor (Track 07 enhancement)
  if (ratio < config.collapseThreshold) {
    const normalizedRatio =
      (ratio - config.deadThreshold) /
      (config.collapseThreshold - config.deadThreshold);
    return config.collapseFloor * normalizedRatio;
  }

  // Degraded zone: accelerating decline (quadratic curve)
  if (ratio < config.criticalThreshold) {
    const normalizedRatio =
      (ratio - config.collapseThreshold) /
      (config.criticalThreshold - config.collapseThreshold);
    return (
      config.collapseFloor +
      (config.criticalThreshold - config.collapseFloor) * Math.pow(normalizedRatio, 2)
    );
  }

  // Stressed zone: linear scaling from criticalThreshold (0.3) to healthyThreshold (0.6)
  if (ratio < config.healthyThreshold) {
    const normalizedRatio =
      (ratio - config.criticalThreshold) /
      (config.healthyThreshold - config.criticalThreshold);
    return config.criticalThreshold + (1 - config.criticalThreshold) * normalizedRatio;
  }

  // Healthy zone: full productivity
  return 1.0;
}

/**
 * Calculate logistic regeneration for a resource with hysteresis (Track 07)
 * Formula: R_{t+1} = clamp( R_t + dt * ( r * R_t * (1 - R_t / K) * recoveryMult - harvest_t ), 0, K )
 *
 * Recovery is slower when ecosystem is degraded/collapsed (hysteresis effect).
 * Dead ecosystems use a flat recovery rate instead of logistic growth.
 */
function logisticRegenerationWithHysteresis(
  current: number,
  capacity: number,
  regenRate: number,
  harvest: number,
  config: SimulationConfig,
  dt: number
): number {
  const health = classifyEcosystemHealth(current, capacity, config);

  // Dead ecosystems use flat recovery rate (or no recovery if rate is 0)
  if (health === 'dead') {
    const flatRecovery = config.deadRecoveryRate * capacity * dt;
    const netChange = flatRecovery - harvest * dt;
    return clamp(current + netChange, 0, capacity);
  }

  // Apply recovery multiplier for hysteresis
  const recoveryMult = calculateRecoveryMultiplier(current, capacity, config);
  const growth = regenRate * current * (1 - current / capacity) * recoveryMult;
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
 * Harvest amounts from production system (Track 03)
 */
export interface HarvestData {
  fish: number;
  timber: number;
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
 * Update ecosystem state for an island (Track 03 + Track 07)
 * Now accepts harvest amounts from production system for proper coupling
 * Includes hysteresis recovery based on ecosystem health state
 * Pure function - returns new state without mutating input
 *
 * @param island - Current island state
 * @param harvest - Harvest amounts from production (fish, timber)
 * @param config - Simulation config with ecosystem thresholds
 * @param events - Active world events
 * @param dt - Time delta
 */
export function updateEcology(
  island: IslandState,
  harvest: HarvestData,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): EcosystemState {
  const { ecosystem, ecosystemParams, productionParams } = island;
  const eventMods = getEcosystemEventModifier(island.id, events);

  // Get grain production rate for soil depletion
  const grainRate = productionParams.baseRate.get('grain') ?? 0;

  // Update fish stock with logistic regeneration and hysteresis (Track 07)
  const newFishStock = logisticRegenerationWithHysteresis(
    ecosystem.fishStock,
    ecosystemParams.fishCapacity,
    ecosystemParams.fishRegenRate,
    harvest.fish,
    config,
    dt
  );

  // Update forest biomass with logistic regeneration and hysteresis (Track 07)
  const newForestBiomass = logisticRegenerationWithHysteresis(
    ecosystem.forestBiomass,
    ecosystemParams.forestCapacity,
    ecosystemParams.forestRegenRate,
    harvest.timber,
    config,
    dt
  );

  // Update soil fertility (unchanged - degrades from farming, not stock extraction)
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
