/**
 * Buildings System
 * Handles building effects, construction, and maintenance
 */

import type {
  IslandState,
  BuildingType,
  BuildingId,
  Building,
  BuildingsConfig,
  SimulationConfig,
} from '../core/types.js';

// ============================================================================
// Building Construction Types
// ============================================================================

/**
 * Active building construction order on an island
 */
export interface BuildingConstructionOrder {
  id: string;
  buildingType: BuildingType;
  startTick: number;
  completionTick: number;
  progress: number; // 0..1
}

// ============================================================================
// Building ID Generation
// ============================================================================

let buildingCounter = 0;

/**
 * Generate a unique building ID
 */
export function generateBuildingId(): BuildingId {
  return `building-${++buildingCounter}-${Date.now()}`;
}

// ============================================================================
// Building Effect Calculations
// ============================================================================

/**
 * Calculate the effective multiplier for a building based on its level.
 * Formula: effect = baseEffect * (1 + (level - 1) * levelEffectMultiplier)
 *
 * @param level - Current building level
 * @param levelEffectMultiplier - How much each additional level increases the effect
 * @returns The effect multiplier
 */
function calculateLevelMultiplier(level: number, levelEffectMultiplier: number): number {
  return 1 + (level - 1) * levelEffectMultiplier;
}

/**
 * Get the cumulative level of all buildings of a specific type on an island.
 * This is useful for calculating stacking effects from multiple buildings.
 *
 * @param island - The island state
 * @param type - The building type to sum
 * @returns Total level of all buildings of that type
 */
export function getBuildingLevel(island: IslandState, type: BuildingType): number {
  // Handle case where buildings map doesn't exist (backward compatibility)
  if (!island.buildings) {
    return 0;
  }
  let totalLevel = 0;
  for (const building of island.buildings.values()) {
    if (building.type === type && building.condition > 0) {
      totalLevel += building.level;
    }
  }
  return totalLevel;
}

/**
 * Calculate warehouse effect on an island.
 * Warehouses reduce spoilage rate and increase effective storage capacity.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Spoilage reduction multiplier (0-1) and storage bonus
 */
export function getWarehouseEffect(
  island: IslandState,
  config: BuildingsConfig
): {
  spoilageReduction: number;
  storageBonus: number;
} {
  const warehouseLevel = getBuildingLevel(island, 'warehouse');

  if (warehouseLevel === 0) {
    return { spoilageReduction: 1, storageBonus: 0 };
  }

  const levelMultiplier = calculateLevelMultiplier(warehouseLevel, config.levelEffectMultiplier);

  // Base spoilage reduction: 20% per effective level, capped at 80%
  const baseSpoilageReduction = 0.2;
  const spoilageReduction = Math.max(0.2, 1 - baseSpoilageReduction * levelMultiplier);

  // Base storage bonus: 100 units per effective level
  const baseStorageBonus = 100;
  const storageBonus = baseStorageBonus * levelMultiplier;

  return {
    spoilageReduction,
    storageBonus,
  };
}

/**
 * Calculate market effect on an island.
 * Markets improve price discovery (reduce volatility) and reduce trade friction.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Price stabilization factor (0-1) and trade friction reduction (0-1)
 */
export function getMarketEffect(
  island: IslandState,
  config: BuildingsConfig
): {
  priceStabilization: number;
  tradeFrictionReduction: number;
} {
  const marketLevel = getBuildingLevel(island, 'market');

  if (marketLevel === 0) {
    return { priceStabilization: 0, tradeFrictionReduction: 0 };
  }

  const levelMultiplier = calculateLevelMultiplier(marketLevel, config.levelEffectMultiplier);

  // Base price stabilization: 15% per effective level, capped at 60%
  const basePriceStabilization = 0.15;
  const priceStabilization = Math.min(0.6, basePriceStabilization * levelMultiplier);

  // Base trade friction reduction: 10% per effective level, capped at 50%
  const baseTradeFrictionReduction = 0.1;
  const tradeFrictionReduction = Math.min(0.5, baseTradeFrictionReduction * levelMultiplier);

  return {
    priceStabilization,
    tradeFrictionReduction,
  };
}

/**
 * Calculate port effect on an island.
 * Ports enable faster loading and unloading of ships.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Loading speed bonus multiplier (1.0 = no bonus)
 */
export function getPortEffect(
  island: IslandState,
  config: BuildingsConfig
): {
  loadingSpeedBonus: number;
} {
  const portLevel = getBuildingLevel(island, 'port');

  if (portLevel === 0) {
    return { loadingSpeedBonus: 1 };
  }

  const levelMultiplier = calculateLevelMultiplier(portLevel, config.levelEffectMultiplier);

  // Base loading speed bonus: 25% per effective level
  const baseLoadingSpeedBonus = 0.25;
  const loadingSpeedBonus = 1 + baseLoadingSpeedBonus * levelMultiplier;

  return {
    loadingSpeedBonus,
  };
}

/**
 * Calculate workshop effect on an island.
 * Workshops provide a bonus to tool production.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Tool production bonus multiplier (1.0 = no bonus)
 */
export function getWorkshopEffect(
  island: IslandState,
  config: BuildingsConfig
): {
  toolProductionBonus: number;
} {
  const workshopLevel = getBuildingLevel(island, 'workshop');

  if (workshopLevel === 0) {
    return { toolProductionBonus: 1 };
  }

  const levelMultiplier = calculateLevelMultiplier(workshopLevel, config.levelEffectMultiplier);

  // Base tool production bonus: 20% per effective level
  const baseToolProductionBonus = 0.2;
  const toolProductionBonus = 1 + baseToolProductionBonus * levelMultiplier;

  return {
    toolProductionBonus,
  };
}

// ============================================================================
// Building Construction
// ============================================================================

/**
 * Check if a building can be constructed on an island.
 * Validates resource availability, build limits, and other constraints.
 *
 * @param island - The island state
 * @param buildingType - The type of building to construct
 * @param config - Full simulation configuration
 * @returns Whether the building can be built and an optional reason if not
 */
export function canBuildBuilding(
  island: IslandState,
  buildingType: BuildingType,
  config: SimulationConfig
): { canBuild: boolean; reason?: string } {
  const buildingsConfig = config.buildingsConfig;
  const definition = buildingsConfig.definitions[buildingType];

  if (!definition) {
    return { canBuild: false, reason: `Unknown building type: ${buildingType}` };
  }

  // Check if island already has max level of this building type
  const currentLevel = getBuildingLevel(island, buildingType);
  if (currentLevel >= definition.maxLevel) {
    return {
      canBuild: false,
      reason: `Maximum level (${definition.maxLevel}) already reached for ${definition.name}`,
    };
  }

  // Check timber availability
  const timber = island.inventory.get('timber') ?? 0;
  if (timber < definition.buildCost.timber) {
    return {
      canBuild: false,
      reason: `Insufficient timber (need ${definition.buildCost.timber}, have ${Math.floor(timber)})`,
    };
  }

  // Check tools availability
  const tools = island.inventory.get('tools') ?? 0;
  if (tools < definition.buildCost.tools) {
    return {
      canBuild: false,
      reason: `Insufficient tools (need ${definition.buildCost.tools}, have ${Math.floor(tools)})`,
    };
  }

  return { canBuild: true };
}

/**
 * Start construction of a new building on an island.
 * Deducts resources and creates a new building at level 1 (or upgrades existing).
 *
 * @param island - The island state
 * @param buildingType - The type of building to construct
 * @param config - Full simulation configuration
 * @param currentTick - Current simulation tick
 * @returns Updated island state and new building ID, or null if construction cannot start
 */
export function startBuildingConstruction(
  island: IslandState,
  buildingType: BuildingType,
  config: SimulationConfig,
  _currentTick: number // Reserved for future construction order tracking
): { newIsland: IslandState; buildingId: BuildingId } | null {
  const canBuildResult = canBuildBuilding(island, buildingType, config);
  if (!canBuildResult.canBuild) {
    return null;
  }

  const buildingsConfig = config.buildingsConfig;
  const definition = buildingsConfig.definitions[buildingType];

  // Deduct resources from island inventory
  const newInventory = new Map(island.inventory);
  newInventory.set('timber', (newInventory.get('timber') ?? 0) - definition.buildCost.timber);
  newInventory.set('tools', (newInventory.get('tools') ?? 0) - definition.buildCost.tools);

  // Check if we're upgrading an existing building or creating new one
  let existingBuilding: Building | null = null;
  for (const building of island.buildings.values()) {
    if (building.type === buildingType) {
      existingBuilding = building;
      break;
    }
  }

  const newBuildings = new Map(island.buildings);
  let buildingId: BuildingId;

  if (existingBuilding) {
    // Upgrade existing building
    buildingId = existingBuilding.id;
    const upgradedBuilding: Building = {
      ...existingBuilding,
      level: existingBuilding.level + 1,
      condition: 1.0, // Reset condition on upgrade
    };
    newBuildings.set(buildingId, upgradedBuilding);
  } else {
    // Create new building
    buildingId = generateBuildingId();
    const newBuilding: Building = {
      id: buildingId,
      type: buildingType,
      level: 1,
      condition: 1.0,
      islandId: island.id,
    };
    newBuildings.set(buildingId, newBuilding);
  }

  const newIsland: IslandState = {
    ...island,
    inventory: newInventory,
    buildings: newBuildings,
  };

  return { newIsland, buildingId };
}

// ============================================================================
// Building Maintenance
// ============================================================================

/**
 * Update building maintenance for an island.
 * Buildings degrade over time and require coin payments to maintain.
 * If maintenance is not paid, condition degrades. At 0 condition, building provides no benefits.
 *
 * @param island - The island state
 * @param config - Full simulation configuration
 * @param dt - Time delta in ticks
 * @returns Updated island state and total maintenance paid
 */
export function updateBuildingMaintenance(
  island: IslandState,
  config: SimulationConfig,
  dt: number
): { newIsland: IslandState; maintenancePaid: number } {
  const buildingsConfig = config.buildingsConfig;

  if (island.buildings.size === 0) {
    return { newIsland: island, maintenancePaid: 0 };
  }

  let totalMaintenancePaid = 0;
  const newBuildings = new Map<BuildingId, Building>();

  for (const [buildingId, building] of island.buildings) {
    const definition = buildingsConfig.definitions[building.type];
    if (!definition) {
      // Keep building as-is if no definition found
      newBuildings.set(buildingId, building);
      continue;
    }

    // Calculate maintenance cost for this tick
    const maintenanceCost = definition.maintenanceCost * dt * building.level;

    // For now, we assume maintenance is always paid if there's any economic activity
    // In a more complex system, you could check against island treasury
    totalMaintenancePaid += maintenanceCost;

    // Apply condition decay if not maintained (simplified: always maintain for now)
    // In a full implementation, you would check if the island can afford maintenance
    const conditionDecay = buildingsConfig.conditionDecayRate * dt;
    const newCondition = Math.max(0, Math.min(1, building.condition - conditionDecay + 0.01 * dt));

    const updatedBuilding: Building = {
      ...building,
      condition: newCondition,
    };

    newBuildings.set(buildingId, updatedBuilding);
  }

  const newIsland: IslandState = {
    ...island,
    buildings: newBuildings,
  };

  return { newIsland, maintenancePaid: totalMaintenancePaid };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all buildings of a specific type on an island.
 *
 * @param island - The island state
 * @param type - The building type to filter by
 * @returns Array of buildings matching the type
 */
export function getBuildingsByType(island: IslandState, type: BuildingType): Building[] {
  const result: Building[] = [];
  for (const building of island.buildings.values()) {
    if (building.type === type) {
      result.push(building);
    }
  }
  return result;
}

/**
 * Get a summary of all building effects on an island.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Combined effects from all buildings
 */
export function getAllBuildingEffects(
  island: IslandState,
  config: BuildingsConfig
): {
  warehouse: ReturnType<typeof getWarehouseEffect>;
  market: ReturnType<typeof getMarketEffect>;
  port: ReturnType<typeof getPortEffect>;
  workshop: ReturnType<typeof getWorkshopEffect>;
} {
  return {
    warehouse: getWarehouseEffect(island, config),
    market: getMarketEffect(island, config),
    port: getPortEffect(island, config),
    workshop: getWorkshopEffect(island, config),
  };
}

/**
 * Create default buildings configuration.
 *
 * @returns Default buildings configuration
 */
export function createDefaultBuildingsConfig(): BuildingsConfig {
  return {
    definitions: {
      warehouse: {
        type: 'warehouse',
        name: 'Warehouse',
        description: 'Reduces spoilage rate and increases storage capacity',
        buildCost: { timber: 50, tools: 20, coins: 100 },
        buildTicks: 48,
        maintenanceCost: 0.5,
        maxLevel: 5,
      },
      market: {
        type: 'market',
        name: 'Market',
        description: 'Improves price discovery and reduces trade friction',
        buildCost: { timber: 40, tools: 15, coins: 80 },
        buildTicks: 36,
        maintenanceCost: 0.3,
        maxLevel: 4,
      },
      port: {
        type: 'port',
        name: 'Port',
        description: 'Enables faster loading and unloading of ships',
        buildCost: { timber: 80, tools: 30, coins: 150 },
        buildTicks: 72,
        maintenanceCost: 0.8,
        maxLevel: 3,
      },
      workshop: {
        type: 'workshop',
        name: 'Workshop',
        description: 'Provides a bonus to tool production',
        buildCost: { timber: 30, tools: 25, coins: 60 },
        buildTicks: 24,
        maintenanceCost: 0.4,
        maxLevel: 5,
      },
    },
    conditionDecayRate: 0.001, // Decay per tick without maintenance
    levelEffectMultiplier: 0.5, // Each level increases effect by 50%
  };
}

/**
 * Get building status summary for UI/agents.
 *
 * @param island - The island state
 * @param config - Buildings configuration
 * @returns Summary of all buildings and their status
 */
export function getBuildingsSummary(
  island: IslandState,
  config: BuildingsConfig
): {
  totalBuildings: number;
  buildingsByType: Record<BuildingType, { count: number; totalLevel: number; avgCondition: number }>;
  effects: ReturnType<typeof getAllBuildingEffects>;
} {
  const buildingsByType: Record<BuildingType, { count: number; totalLevel: number; avgCondition: number }> = {
    warehouse: { count: 0, totalLevel: 0, avgCondition: 0 },
    market: { count: 0, totalLevel: 0, avgCondition: 0 },
    port: { count: 0, totalLevel: 0, avgCondition: 0 },
    workshop: { count: 0, totalLevel: 0, avgCondition: 0 },
  };

  let totalBuildings = 0;

  for (const building of island.buildings.values()) {
    const typeStats = buildingsByType[building.type];
    typeStats.count += 1;
    typeStats.totalLevel += building.level;
    typeStats.avgCondition += building.condition;
    totalBuildings += 1;
  }

  // Calculate averages
  for (const type of Object.keys(buildingsByType) as BuildingType[]) {
    const stats = buildingsByType[type];
    if (stats.count > 0) {
      stats.avgCondition = stats.avgCondition / stats.count;
    }
  }

  return {
    totalBuildings,
    buildingsByType,
    effects: getAllBuildingEffects(island, config),
  };
}
