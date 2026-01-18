/**
 * Production System
 * Handles good production based on labor, ecosystem, tools, and health
 * Based on 02_spec.md Section 4
 */

import type {
  IslandState,
  GoodId,
  WorldEvent,
  SimulationConfig,
} from '../core/types.js';

/**
 * Calculate labor modifier
 * Formula: (s / s_ref) ^ alpha, capped at 2.0
 */
function labourModifier(
  sectorShare: number,
  referenceShare: number,
  alpha: number
): number {
  if (referenceShare <= 0) return 1;
  const modifier = Math.pow(sectorShare / referenceShare, alpha);
  return Math.min(modifier, 2.0); // Cap at 2x
}

/**
 * Calculate ecosystem modifier
 * Formula: 0.2 + 0.8 * (resource / resource_ref)
 * Prevents total zeroing of production
 */
function ecosystemModifier(resourceLevel: number, capacity: number): number {
  if (capacity <= 0) return 0.2;
  const ratio = Math.min(resourceLevel / capacity, 1);
  return 0.2 + 0.8 * ratio;
}

/**
 * Calculate tool modifier
 * Formula: 1 + beta * log(1 + tools_per_capita)
 */
function toolModifier(
  toolsAvailable: number,
  populationSize: number,
  beta: number
): number {
  if (populationSize <= 0) return 1;
  const toolsPerCapita = toolsAvailable / populationSize;
  return 1 + beta * Math.log(1 + toolsPerCapita);
}

/**
 * Calculate health modifier
 * Formula: 0.5 + 0.5 * health
 */
function healthModifier(health: number): number {
  return 0.5 + 0.5 * health;
}

/**
 * Labor sector type
 */
type LaborSector = 'fishing' | 'forestry' | 'farming' | 'industry' | 'services';

/**
 * Good to sector mapping
 */
const GOOD_TO_SECTOR: Record<string, LaborSector> = {
  fish: 'fishing',
  grain: 'farming',
  timber: 'forestry',
  tools: 'industry',
  luxuries: 'services',
};

/**
 * Get the relevant labor sector for a good
 */
function getLaborSectorForGood(goodId: GoodId): LaborSector {
  return GOOD_TO_SECTOR[goodId] ?? 'services';
}

/**
 * Get ecosystem resource for a good
 */
function getEcosystemResourceForGood(
  goodId: GoodId,
  island: IslandState
): { level: number; capacity: number } {
  switch (goodId) {
    case 'fish':
      return {
        level: island.ecosystem.fishStock,
        capacity: island.ecosystemParams.fishCapacity,
      };
    case 'timber':
      return {
        level: island.ecosystem.forestBiomass,
        capacity: island.ecosystemParams.forestCapacity,
      };
    case 'grain':
      return {
        level: island.ecosystem.soilFertility,
        capacity: 1, // Soil fertility is 0-1
      };
    default:
      return { level: 1, capacity: 1 }; // No ecosystem dependency
  }
}

/**
 * Reference labor shares for modifier calculation
 */
const REFERENCE_LABOR_SHARES: Record<string, number> = {
  fishing: 0.2,
  forestry: 0.15,
  farming: 0.25,
  industry: 0.2,
  services: 0.2,
};

/**
 * Get event modifier for production
 */
function getProductionEventModifier(
  islandId: string,
  goodId: GoodId,
  events: WorldEvent[]
): number {
  let modifier = 1;

  for (const event of events) {
    if (event.targetId === islandId || event.targetId === 'global') {
      if (goodId === 'grain' && event.modifiers.grainProductionMultiplier !== undefined) {
        modifier *= event.modifiers.grainProductionMultiplier;
      }
      if (goodId === 'tools' && event.modifiers.toolEfficiencyBoost !== undefined) {
        modifier *= 1 + event.modifiers.toolEfficiencyBoost;
      }
    }
  }

  return modifier;
}

/**
 * Calculate effective production for a single good
 * Formula: base_rate * labour_mod * ecosystem_mod * tool_mod * health_mod * event_mod
 */
export function calculateProduction(
  island: IslandState,
  goodId: GoodId,
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): number {
  const baseRate = island.productionParams.baseRate.get(goodId) ?? 0;
  if (baseRate <= 0) return 0;

  // Get labor modifier
  const sector = getLaborSectorForGood(goodId);
  const labour = island.population.labour;
  const laborShare = labour[sector as keyof typeof labour] ?? 0;
  const refShare = REFERENCE_LABOR_SHARES[sector] ?? 0.2;
  const labourMod = labourModifier(laborShare, refShare, config.labourAlpha);

  // Get ecosystem modifier
  const { level, capacity } = getEcosystemResourceForGood(goodId, island);
  const sensitivity = island.productionParams.ecosystemSensitivity.get(goodId) ?? 0.5;
  const ecoMod = ecosystemModifier(level * sensitivity, capacity * sensitivity);

  // Get tool modifier
  const toolsAvailable = island.inventory.get('tools') ?? 0;
  const toolSensitivity = island.productionParams.toolSensitivity.get(goodId) ?? 0.5;
  const toolMod = toolModifier(
    toolsAvailable * toolSensitivity,
    island.population.size,
    config.toolBeta
  );

  // Get health modifier
  const healthMod = healthModifier(island.population.health);

  // Get event modifier
  const eventMod = getProductionEventModifier(island.id, goodId, events);

  // Calculate total production
  const production = baseRate * labourMod * ecoMod * toolMod * healthMod * eventMod * dt;

  return Math.max(0, production);
}

/**
 * Update island inventory with production for all goods
 * Returns new inventory map
 */
export function updateProduction(
  island: IslandState,
  goods: GoodId[],
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number
): Map<GoodId, number> {
  const newInventory = new Map(island.inventory);

  for (const goodId of goods) {
    const production = calculateProduction(island, goodId, config, events, dt);
    const current = newInventory.get(goodId) ?? 0;
    newInventory.set(goodId, current + production);
  }

  return newInventory;
}

/**
 * Get production breakdown for debugging/UI
 */
export function getProductionBreakdown(
  island: IslandState,
  goodId: GoodId,
  config: SimulationConfig,
  events: WorldEvent[]
): {
  baseRate: number;
  labourModifier: number;
  ecosystemModifier: number;
  toolModifier: number;
  healthModifier: number;
  eventModifier: number;
  effectiveRate: number;
} {
  const baseRate = island.productionParams.baseRate.get(goodId) ?? 0;

  const sector = getLaborSectorForGood(goodId);
  const labour = island.population.labour;
  const laborShare = labour[sector as keyof typeof labour] ?? 0;
  const refShare = REFERENCE_LABOR_SHARES[sector] ?? 0.2;
  const labourMod = labourModifier(laborShare, refShare, config.labourAlpha);

  const { level, capacity } = getEcosystemResourceForGood(goodId, island);
  const sensitivity = island.productionParams.ecosystemSensitivity.get(goodId) ?? 0.5;
  const ecoMod = ecosystemModifier(level * sensitivity, capacity * sensitivity);

  const toolsAvailable = island.inventory.get('tools') ?? 0;
  const toolSensitivity = island.productionParams.toolSensitivity.get(goodId) ?? 0.5;
  const toolMod = toolModifier(
    toolsAvailable * toolSensitivity,
    island.population.size,
    config.toolBeta
  );

  const healthMod = healthModifier(island.population.health);
  const eventMod = getProductionEventModifier(island.id, goodId, events);

  return {
    baseRate,
    labourModifier: labourMod,
    ecosystemModifier: ecoMod,
    toolModifier: toolMod,
    healthModifier: healthMod,
    eventModifier: eventMod,
    effectiveRate: baseRate * labourMod * ecoMod * toolMod * healthMod * eventMod,
  };
}
