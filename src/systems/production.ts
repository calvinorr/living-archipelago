/**
 * Production System
 * Handles good production based on labor, ecosystem, tools, and health
 * Based on 02_spec.md Section 4
 * Updated with harvest-production coupling (Track 03)
 * Updated with supply shocks and variance (Economic Model V2)
 */

import type {
  IslandState,
  GoodId,
  WorldEvent,
  SimulationConfig,
} from '../core/types.js';

import { calculateYieldMultiplier } from './ecology.js';
import { getWorkshopEffect } from './buildings.js';
import { getProductionMultiplier, applyProductionVariance } from './supply-shocks.js';

/**
 * Result of production calculation including harvest data (Track 03)
 */
export interface ProductionResult {
  /** New inventory after production */
  newInventory: Map<GoodId, number>;
  /** Amount produced per good */
  produced: Map<GoodId, number>;
  /** Amount harvested from ecosystem per good (for fish/timber) */
  harvested: Map<GoodId, number>;
  /** Whether production was limited by ecosystem capacity */
  constrained: Map<GoodId, boolean>;
  /** Supply shock multipliers applied per good (1.0 = no shock) */
  shockMultipliers: Map<GoodId, number>;
}

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
 * Formula: 0.05 + 0.95 * (resource / resource_ref)
 * Low floor allows near-collapse when ecosystem is depleted
 */
function ecosystemModifier(resourceLevel: number, capacity: number): number {
  if (capacity <= 0) return 0.05;
  const ratio = Math.min(resourceLevel / capacity, 1);
  return 0.05 + 0.95 * ratio;  // Floor lowered from 0.2 to 0.05
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
 * Formula: 0.2 + 0.8 * health
 * Low floor means sick populations are severely impacted
 */
function healthModifier(health: number): number {
  return 0.2 + 0.8 * health;  // Floor lowered from 0.5 to 0.2
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
 * Formula: base_rate * labour_mod * ecosystem_mod * tool_mod * health_mod * event_mod * building_mod
 *
 * Workshop buildings provide a bonus to tool production.
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

  // Get building modifier (workshop bonus for tools)
  let buildingMod = 1;
  if (goodId === 'tools') {
    const workshopEffect = getWorkshopEffect(island, config.buildingsConfig);
    buildingMod = workshopEffect.toolProductionBonus;
  }

  // Calculate total production
  const production = baseRate * labourMod * ecoMod * toolMod * healthMod * eventMod * buildingMod * dt;

  return Math.max(0, production);
}

/**
 * Check if a good is extractive (harvested from ecosystem stock)
 */
function isExtractiveGood(goodId: GoodId): boolean {
  return goodId === 'fish' || goodId === 'timber';
}

/**
 * Get ecosystem stock and capacity for extractive goods
 */
function getExtractiveStock(
  goodId: GoodId,
  island: IslandState
): { stock: number; capacity: number } | null {
  switch (goodId) {
    case 'fish':
      return {
        stock: island.ecosystem.fishStock,
        capacity: island.ecosystemParams.fishCapacity,
      };
    case 'timber':
      return {
        stock: island.ecosystem.forestBiomass,
        capacity: island.ecosystemParams.forestCapacity,
      };
    default:
      return null;
  }
}

/**
 * Update island inventory with production for all goods (Track 03)
 * Returns ProductionResult with harvest data for ecosystem coupling
 *
 * Updated for Economic Model V2:
 * - Applies supply shock multipliers from active boom/bust events
 * - Applies random variance when RNG is provided
 *
 * @param island - Current island state
 * @param goods - List of goods to produce
 * @param config - Simulation configuration
 * @param events - Active world events
 * @param dt - Time delta
 * @param currentTick - Current simulation tick (for shock expiration)
 * @param rng - Optional seeded RNG function for production variance
 */
export function updateProduction(
  island: IslandState,
  goods: GoodId[],
  config: SimulationConfig,
  events: WorldEvent[],
  dt: number,
  currentTick: number = 0,
  rng?: () => number
): ProductionResult {
  const newInventory = new Map(island.inventory);
  const produced = new Map<GoodId, number>();
  const harvested = new Map<GoodId, number>();
  const constrained = new Map<GoodId, boolean>();
  const shockMultipliers = new Map<GoodId, number>();

  for (const goodId of goods) {
    // Calculate desired production (what labor/tools/health would produce)
    let desiredProduction = calculateProduction(island, goodId, config, events, dt);

    // Apply supply shock multiplier (boom/bust effects)
    const shockMult = getProductionMultiplier(island, goodId, currentTick);
    shockMultipliers.set(goodId, shockMult);
    desiredProduction *= shockMult;

    // Apply random variance if RNG is provided
    if (rng && config.supplyVolatilityConfig) {
      desiredProduction = applyProductionVariance(
        desiredProduction,
        rng,
        config.supplyVolatilityConfig
      );
    }

    let actualProduction = desiredProduction;
    let harvestAmount = 0;
    let wasConstrained = false;

    // For extractive goods, apply yield multiplier and cap by available stock
    if (isExtractiveGood(goodId)) {
      const stockInfo = getExtractiveStock(goodId, island);

      if (stockInfo && stockInfo.capacity > 0) {
        // Calculate yield multiplier based on ecosystem health
        const yieldMult = calculateYieldMultiplier(
          stockInfo.stock,
          stockInfo.capacity,
          config
        );

        // Maximum sustainable harvest for this tick
        // Based on stock level and yield curve
        const maxSustainableHarvest = stockInfo.stock * yieldMult * 0.1 * dt;

        // Actual production is limited by what ecosystem can sustainably yield
        if (desiredProduction > maxSustainableHarvest) {
          actualProduction = maxSustainableHarvest;
          wasConstrained = true;
        }

        // Harvest amount (what we take from ecosystem)
        // With perfect efficiency, harvest = production
        harvestAmount = actualProduction / config.harvestEfficiency;
      }
    }

    // Update inventory
    const current = newInventory.get(goodId) ?? 0;
    newInventory.set(goodId, current + actualProduction);

    // Track results
    produced.set(goodId, actualProduction);
    harvested.set(goodId, harvestAmount);
    constrained.set(goodId, wasConstrained);
  }

  return { newInventory, produced, harvested, constrained, shockMultipliers };
}

/**
 * Get production breakdown for debugging/UI
 *
 * @param island - Current island state
 * @param goodId - Good to analyze
 * @param config - Simulation configuration
 * @param events - Active world events
 * @param currentTick - Current tick for shock expiration (optional)
 */
export function getProductionBreakdown(
  island: IslandState,
  goodId: GoodId,
  config: SimulationConfig,
  events: WorldEvent[],
  currentTick: number = 0
): {
  baseRate: number;
  labourModifier: number;
  ecosystemModifier: number;
  toolModifier: number;
  healthModifier: number;
  eventModifier: number;
  buildingModifier: number;
  shockMultiplier: number;
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

  // Get building modifier (workshop bonus for tools)
  let buildingMod = 1;
  if (goodId === 'tools') {
    const workshopEffect = getWorkshopEffect(island, config.buildingsConfig);
    buildingMod = workshopEffect.toolProductionBonus;
  }

  // Get supply shock multiplier
  const shockMult = getProductionMultiplier(island, goodId, currentTick);

  return {
    baseRate,
    labourModifier: labourMod,
    ecosystemModifier: ecoMod,
    toolModifier: toolMod,
    healthModifier: healthMod,
    eventModifier: eventMod,
    buildingModifier: buildingMod,
    shockMultiplier: shockMult,
    effectiveRate: baseRate * labourMod * ecoMod * toolMod * healthMod * eventMod * buildingMod * shockMult,
  };
}
