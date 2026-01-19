/**
 * World State Management
 * Initialization and state helpers
 */

import type {
  WorldState,
  IslandState,
  ShipState,
  GoodDefinition,
  AgentState,
  SimulationConfig,
  GoodId,
  IslandId,
  ShipId,
  ShipyardId,
  AgentId,
  GameTime,
  MarketState,
  ProductionParams,
  LabourAllocation,
  Sector,
  ShipyardState,
  CrewState,
  BuildingsConfig,
  BuildingId,
  Building,
} from './types.js';
import { createShipyard } from '../systems/shipyard.js';

/**
 * Mapping from labor sectors to produced goods (Track 06)
 * Services sector doesn't produce a tradeable good
 */
export const SECTOR_TO_GOOD: Record<Sector, GoodId | null> = {
  fishing: 'fish',
  forestry: 'timber',
  farming: 'grain',
  industry: 'tools',
  services: null, // Services don't produce a tradeable good
};

/**
 * All labor sectors (Track 06)
 */
export const SECTORS: Sector[] = ['fishing', 'forestry', 'farming', 'industry', 'services'];

/**
 * Default buildings configuration (Track 08)
 */
export const DEFAULT_BUILDINGS_CONFIG: BuildingsConfig = {
  definitions: {
    warehouse: {
      type: 'warehouse',
      name: 'Warehouse',
      description: 'Reduce spoilage, increase storage capacity',
      buildCost: { timber: 30, tools: 10, coins: 50 },
      buildTicks: 72,
      maintenanceCost: 0.5,
      maxLevel: 3,
    },
    market: {
      type: 'market',
      name: 'Market',
      description: 'Reduce trade friction, better price discovery',
      buildCost: { timber: 20, tools: 15, coins: 80 },
      buildTicks: 48,
      maintenanceCost: 1.0,
      maxLevel: 3,
    },
    port: {
      type: 'port',
      name: 'Port',
      description: 'Faster ship loading/unloading',
      buildCost: { timber: 50, tools: 20, coins: 100 },
      buildTicks: 96,
      maintenanceCost: 1.5,
      maxLevel: 3,
    },
    workshop: {
      type: 'workshop',
      name: 'Workshop',
      description: 'Tool production bonus',
      buildCost: { timber: 25, tools: 25, coins: 60 },
      buildTicks: 60,
      maintenanceCost: 0.8,
      maxLevel: 3,
    },
  },
  conditionDecayRate: 0.001,
  levelEffectMultiplier: 0.5,
};

/**
 * Default simulation configuration
 */
export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 12345,
  ticksPerSecond: 1,
  timeScale: 1,

  // Market tuning
  priceGamma: 0.8, // Reduced from 1.5 for more realistic price response
  priceVelocityK: 0.2, // Reduced from 0.3 for less velocity impact
  priceLambda: 0.2, // Increased from 0.1 for smoother price changes
  minPrice: 1, // Tightened from 0.1 to prevent near-zero prices
  maxPrice: 200, // Tightened from 1000 to prevent extreme spikes

  // Population tuning
  foodPerCapita: 0.06, // 0.06 units per person per hour (20% more than original - creates pressure without collapse)
  healthPenaltyRate: 0.1,
  populationDeclineThreshold: 0.3,

  // Consumption tuning (Track 01)
  foodPriceElasticity: -0.3, // 30% demand reduction per 100% price increase
  luxuryPriceElasticity: -1.2, // Luxuries are more price-elastic
  foodSubstitutionElasticity: 0.5, // Moderate substitution between fish/grain
  healthConsumptionFactor: 0.3, // 30% consumption reduction at 0 health

  // Population growth tuning (Track 04)
  maxGrowthRate: 0.002, // 0.2% annual growth at optimal health (reduced from 0.5%)
  maxDeclineRate: 0.02, // 2% annual decline at crisis health
  stableHealthThreshold: 0.65, // Health where population is stable (raised from 0.5)
  optimalHealthThreshold: 0.9, // Health for maximum growth
  crisisHealthThreshold: 0.3, // Health for maximum decline

  // Production tuning
  labourAlpha: 0.7,
  toolBeta: 0.5,

  // Harvest-Production Coupling (Track 03)
  collapseThreshold: 0.1, // Below 10% stock: collapse zone
  collapseFloor: 0.05, // Minimum 5% yield in collapse
  criticalThreshold: 0.3, // Below 30% stock: accelerating decline
  harvestEfficiency: 1.0, // 100% of harvest becomes product

  // Ecosystem Collapse (Track 07)
  healthyThreshold: 0.6, // Above 60% stock: full productivity
  deadThreshold: 0.02, // Below 2% stock: ecosystem is dead
  impairedRecoveryMultiplier: 0.5, // 50% recovery rate when degraded
  collapsedRecoveryMultiplier: 0.1, // 10% recovery rate when collapsed
  deadRecoveryRate: 0, // No natural recovery when dead

  // Transport Costs (Track 02)
  baseVoyageCost: 10, // Fixed cost per voyage
  costPerDistanceUnit: 0.1, // Per-distance cost
  perVolumeHandlingCost: 0.05, // Per-cargo-volume cost
  emptyReturnMultiplier: 0.5, // Cost multiplier for empty return voyage

  // Good-Specific Price Elasticity (Track 05)
  // Reduced elasticity values for more stable prices (~40% reduction)
  goodMarketConfigs: {
    food: {
      priceElasticity: 0.4, // Essential goods: very stable prices (was 0.6)
      velocityCoefficient: 0.3,
      idealStockDays: 7,
    },
    material: {
      priceElasticity: 0.5, // Materials: moderate stability (was 0.9)
      velocityCoefficient: 0.2,
      idealStockDays: 14,
    },
    tool: {
      priceElasticity: 0.5, // Tools: moderate stability (was 0.8)
      velocityCoefficient: 0.15,
      idealStockDays: 30,
    },
    luxury: {
      priceElasticity: 0.8, // Luxuries: more volatile but manageable (was 1.4)
      velocityCoefficient: 0.3,
      idealStockDays: 21,
    },
  },

  // Wage-Based Labor Allocation (Track 06)
  laborConfig: {
    baseShares: {
      fishing: 0.20,
      forestry: 0.15,
      farming: 0.25,
      industry: 0.15,
      services: 0.25,
    },
    wageResponsiveness: 1.0, // Balanced response to wage differentials
    reallocationRate: 0.01, // 1% max change per hour
    minSectorShare: 0.02, // Minimum 2% in any sector
    maxSectorShare: 0.60, // Maximum 60% in any sector
  },

  // Ship Crew System
  crewConfig: {
    minCrewRatio: 0.3, // Need at least 30% crew to operate
    baseWageRate: 0.5, // 0.5 coins per crew member per tick
    moraleDecayRate: 0.005, // 0.5% morale decay per tick in bad conditions
    moraleRecoveryRate: 0.01, // 1% morale recovery per tick in good conditions
    desertionMoraleThreshold: 0.2, // Below 20% morale, crew start deserting
    desertionRate: 0.02, // 2% of crew desert per tick when morale is very low
    unpaidDesertionThreshold: 48, // 2 days without pay before desertion starts
    speedMoraleBonus: 0.2, // +20% speed at max morale
    speedMoralePenalty: 0.3, // -30% speed at min morale
    atSeaMoralePenalty: 0.002, // Additional 0.2% morale decay when at sea
    lowCrewMoralePenalty: 0.01, // 1% morale penalty when understaffed
  },

  // Ship Maintenance System (Track 08)
  maintenanceConfig: {
    baseWearRate: 0.0002, // 0.02% condition loss per tick at sea (~5% per day)
    distanceWearRate: 0.00005, // Wear per distance unit traveled
    stormWearMultiplier: 3.0, // 3x wear during storms
    repairRateAtIsland: 0.01, // 1% condition restored per tick when docked
    repairTimberCostPerPoint: 0.5, // 0.5 timber per 1% repair
    repairCoinCostPerPoint: 2, // 2 coins per 1% repair
    speedConditionPenalty: 0.4, // -40% speed at 0 condition
    criticalConditionThreshold: 0.15, // Below 15%, ship at risk
    sinkingChancePerTick: 0.001, // 0.1% chance of sinking per tick when critical
  },

  // Buildings System (Track 08)
  buildingsConfig: DEFAULT_BUILDINGS_CONFIG,
};

/**
 * MVP Goods definitions
 */
export const MVP_GOODS: GoodDefinition[] = [
  {
    id: 'fish',
    name: 'Fish',
    category: 'food',
    basePrice: 8,
    spoilageRatePerHour: 0.02, // ~2% per hour
    bulkiness: 1,
  },
  {
    id: 'grain',
    name: 'Grain',
    category: 'food',
    basePrice: 6,
    spoilageRatePerHour: 0.001, // Very slow spoilage
    bulkiness: 1,
  },
  {
    id: 'timber',
    name: 'Timber',
    category: 'material',
    basePrice: 10,
    spoilageRatePerHour: 0,
    bulkiness: 2,
  },
  {
    id: 'tools',
    name: 'Tools',
    category: 'tool',
    basePrice: 25,
    spoilageRatePerHour: 0,
    bulkiness: 0.5,
  },
  {
    id: 'luxuries',
    name: 'Luxuries',
    category: 'luxury',
    basePrice: 30,
    spoilageRatePerHour: 0,
    bulkiness: 0.3,
  },
];

/**
 * Create goods map from array
 */
export function createGoodsMap(goods: GoodDefinition[]): Map<GoodId, GoodDefinition> {
  return new Map(goods.map((g) => [g.id, g]));
}

/**
 * Create initial inventory for an island
 */
function createInitialInventory(
  archetype: 'fishing' | 'agricultural' | 'forest'
): Map<GoodId, number> {
  const inventory = new Map<GoodId, number>();

  switch (archetype) {
    case 'fishing':
      inventory.set('fish', 200);
      inventory.set('grain', 100);
      inventory.set('timber', 30);
      inventory.set('tools', 20);
      inventory.set('luxuries', 10);
      break;
    case 'agricultural':
      inventory.set('fish', 50);
      inventory.set('grain', 300);
      inventory.set('timber', 50);
      inventory.set('tools', 30);
      inventory.set('luxuries', 15);
      break;
    case 'forest':
      // Increased starting food to allow time for trade routes to establish
      inventory.set('fish', 100);
      inventory.set('grain', 150);
      inventory.set('timber', 250);
      inventory.set('tools', 25);
      inventory.set('luxuries', 10);
      break;
  }

  return inventory;
}

/**
 * Create initial market state
 */
function createInitialMarket(
  goods: GoodDefinition[],
  archetype: 'fishing' | 'agricultural' | 'forest'
): MarketState {
  const prices = new Map<GoodId, number>();
  const idealStock = new Map<GoodId, number>();
  const momentum = new Map<GoodId, number>();
  const consumptionVelocity = new Map<GoodId, number>();

  for (const good of goods) {
    prices.set(good.id, good.basePrice);
    momentum.set(good.id, 0);
    consumptionVelocity.set(good.id, 1);

    // Set ideal stock based on archetype
    let ideal = 100;
    switch (archetype) {
      case 'fishing':
        if (good.id === 'fish') ideal = 150;
        if (good.id === 'grain') ideal = 200;
        if (good.id === 'tools') ideal = 50;
        break;
      case 'agricultural':
        if (good.id === 'grain') ideal = 200;
        if (good.id === 'fish') ideal = 150;
        if (good.id === 'tools') ideal = 50;
        break;
      case 'forest':
        if (good.id === 'timber') ideal = 150;
        if (good.id === 'grain') ideal = 200;
        break;
    }
    idealStock.set(good.id, ideal);
  }

  return { prices, idealStock, momentum, consumptionVelocity };
}

/**
 * Create production params for an archetype
 */
function createProductionParams(
  archetype: 'fishing' | 'agricultural' | 'forest'
): ProductionParams {
  const baseRate = new Map<GoodId, number>();
  const toolSensitivity = new Map<GoodId, number>();
  const ecosystemSensitivity = new Map<GoodId, number>();

  // Production rates reduced ~35% from original to create tighter economy
  switch (archetype) {
    case 'fishing':
      baseRate.set('fish', 10);  // Was 15
      baseRate.set('grain', 1.5);
      baseRate.set('timber', 2);
      baseRate.set('tools', 0.7);
      baseRate.set('luxuries', 0.3);
      break;
    case 'agricultural':
      baseRate.set('fish', 1.5);
      baseRate.set('grain', 12);  // Was 18
      baseRate.set('timber', 2.5);
      baseRate.set('tools', 1.3);
      baseRate.set('luxuries', 0.7);
      break;
    case 'forest':
      // Slight increase in food production to prevent starvation before trade establishes
      baseRate.set('fish', 1.5);  // Was 0.7 - small fishing village
      baseRate.set('grain', 3);   // Was 2 - some subsistence farming
      baseRate.set('timber', 13); // Was 20
      baseRate.set('tools', 2);
      baseRate.set('luxuries', 0.3);
      break;
  }

  // Default sensitivities
  for (const goodId of ['fish', 'grain', 'timber', 'tools', 'luxuries']) {
    toolSensitivity.set(goodId, 0.5);
    ecosystemSensitivity.set(goodId, goodId === 'tools' || goodId === 'luxuries' ? 0.2 : 0.8);
  }

  return { baseRate, toolSensitivity, ecosystemSensitivity };
}

/**
 * Create labour allocation for an archetype
 */
function createLabourAllocation(
  archetype: 'fishing' | 'agricultural' | 'forest'
): LabourAllocation {
  switch (archetype) {
    case 'fishing':
      return { fishing: 0.45, forestry: 0.1, farming: 0.15, industry: 0.15, services: 0.15 };
    case 'agricultural':
      return { fishing: 0.1, forestry: 0.1, farming: 0.5, industry: 0.15, services: 0.15 };
    case 'forest':
      return { fishing: 0.1, forestry: 0.45, farming: 0.15, industry: 0.15, services: 0.15 };
  }
}

/**
 * MVP Island definitions
 */
export function createMVPIslands(goods: GoodDefinition[]): Map<IslandId, IslandState> {
  const islands = new Map<IslandId, IslandState>();

  // Shoalhold - Fishing Isle
  islands.set('shoalhold', {
    id: 'shoalhold',
    name: 'Shoalhold',
    position: { x: 100, y: 200 },
    ecosystem: {
      fishStock: 800,
      forestBiomass: 100,
      soilFertility: 0.2,
    },
    ecosystemParams: {
      fishCapacity: 1000,
      fishRegenRate: 0.05,
      forestCapacity: 200,
      forestRegenRate: 0.02,
      soilRegenBase: 0.005,
      soilDepletionRate: 0.01,
    },
    population: {
      size: 500,
      health: 0.8,
      labour: createLabourAllocation('fishing'),
    },
    inventory: createInitialInventory('fishing'),
    market: createInitialMarket(goods, 'fishing'),
    productionParams: createProductionParams('fishing'),
    buildings: new Map<BuildingId, Building>(),
  });

  // Greenbarrow - Agricultural Isle
  islands.set('greenbarrow', {
    id: 'greenbarrow',
    name: 'Greenbarrow',
    position: { x: 300, y: 100 },
    ecosystem: {
      fishStock: 200,
      forestBiomass: 150,
      soilFertility: 0.9,
    },
    ecosystemParams: {
      fishCapacity: 300,
      fishRegenRate: 0.03,
      forestCapacity: 300,
      forestRegenRate: 0.025,
      soilRegenBase: 0.01,
      soilDepletionRate: 0.008,
    },
    population: {
      size: 600,
      health: 0.85,
      labour: createLabourAllocation('agricultural'),
    },
    inventory: createInitialInventory('agricultural'),
    market: createInitialMarket(goods, 'agricultural'),
    productionParams: createProductionParams('agricultural'),
    buildings: new Map<BuildingId, Building>(),
  });

  // Timberwake - Forest Isle
  islands.set('timberwake', {
    id: 'timberwake',
    name: 'Timberwake',
    position: { x: 200, y: 350 },
    ecosystem: {
      fishStock: 150,
      forestBiomass: 900,
      soilFertility: 0.4,
    },
    ecosystemParams: {
      fishCapacity: 200,
      fishRegenRate: 0.02,
      forestCapacity: 1000,
      forestRegenRate: 0.04,
      soilRegenBase: 0.008,
      soilDepletionRate: 0.01,
    },
    population: {
      size: 450,
      health: 0.75,
      labour: createLabourAllocation('forest'),
    },
    inventory: createInitialInventory('forest'),
    market: createInitialMarket(goods, 'forest'),
    productionParams: createProductionParams('forest'),
    buildings: new Map<BuildingId, Building>(),
  });

  return islands;
}

/**
 * Create default crew state for a ship
 */
export function createDefaultCrew(capacity: number, baseWageRate: number = 0.5): CrewState {
  // Crew capacity scales with ship cargo capacity
  const crewCapacity = Math.max(5, Math.floor(capacity / 10));
  return {
    count: crewCapacity, // Start fully crewed
    capacity: crewCapacity,
    morale: 0.8, // Start with good morale
    wageRate: baseWageRate,
    unpaidTicks: 0,
  };
}

/**
 * Create MVP ships
 */
export function createMVPShips(): Map<ShipId, ShipState> {
  const ships = new Map<ShipId, ShipState>();

  ships.set('sloop-1', {
    id: 'sloop-1',
    name: 'Sea Trader',
    ownerId: 'trader-alpha',
    capacity: 100,
    speed: 10, // distance units per hour
    cash: 500,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'shoalhold' },
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(100),
    condition: 1.0, // New ships start at full condition
    totalDistanceTraveled: 0,
  });

  ships.set('sloop-2', {
    id: 'sloop-2',
    name: 'Wave Runner',
    ownerId: 'trader-alpha',
    capacity: 80,
    speed: 12,
    cash: 400,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'greenbarrow' },
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(80),
    condition: 1.0,
    totalDistanceTraveled: 0,
  });

  return ships;
}

/**
 * Create MVP agents
 */
export function createMVPAgents(): Map<AgentId, AgentState> {
  const agents = new Map<AgentId, AgentState>();

  agents.set('trader-1', {
    id: 'trader-1',
    type: 'trader',
    name: 'Merchant Voss',
    assets: {
      cash: 500,
      shipIds: ['sloop-1'],
    },
  });

  agents.set('trader-2', {
    id: 'trader-2',
    type: 'trader',
    name: 'Captain Reef',
    assets: {
      cash: 400,
      shipIds: ['sloop-2'],
    },
  });

  return agents;
}

/**
 * Create MVP shipyards - one per island
 */
export function createMVPShipyards(): Map<ShipyardId, ShipyardState> {
  const shipyards = new Map<ShipyardId, ShipyardState>();

  // Each island gets a shipyard
  shipyards.set('shipyard-shoalhold', createShipyard('shoalhold', 'Shoalhold Docks'));
  shipyards.set('shipyard-greenbarrow', createShipyard('greenbarrow', 'Greenbarrow Harbor'));
  shipyards.set('shipyard-timberwake', createShipyard('timberwake', 'Timberwake Shipworks'));

  return shipyards;
}

/**
 * Calculate game time from tick
 */
export function tickToGameTime(tick: number): GameTime {
  const gameHour = tick % 24;
  const gameDay = Math.floor(tick / 24);

  return { tick, gameHour, gameDay };
}

/**
 * Initialize world state
 */
export function initializeWorld(seed: number): WorldState {
  const goods = createGoodsMap(MVP_GOODS);
  const islands = createMVPIslands(MVP_GOODS);
  const ships = createMVPShips();
  const shipyards = createMVPShipyards();
  const agents = createMVPAgents();

  return {
    tick: 0,
    gameTime: tickToGameTime(0),
    rngState: seed,
    islands,
    ships,
    shipyards,
    events: [],
    agents,
    goods,
  };
}

/**
 * Clone world state (deep copy for immutability)
 */
export function cloneWorldState(state: WorldState): WorldState {
  return {
    tick: state.tick,
    gameTime: { ...state.gameTime },
    rngState: state.rngState,
    islands: new Map(
      Array.from(state.islands.entries()).map(([id, island]) => [
        id,
        cloneIsland(island),
      ])
    ),
    ships: new Map(
      Array.from(state.ships.entries()).map(([id, ship]) => [id, cloneShip(ship)])
    ),
    shipyards: new Map(
      Array.from(state.shipyards.entries()).map(([id, shipyard]) => [
        id,
        cloneShipyard(shipyard),
      ])
    ),
    events: state.events.map((e) => ({ ...e, modifiers: { ...e.modifiers } })),
    agents: new Map(
      Array.from(state.agents.entries()).map(([id, agent]) => [
        id,
        { ...agent, assets: { ...agent.assets, shipIds: [...agent.assets.shipIds] } },
      ])
    ),
    goods: new Map(state.goods),
  };
}

function cloneIsland(island: IslandState): IslandState {
  return {
    ...island,
    position: { ...island.position },
    ecosystem: { ...island.ecosystem },
    ecosystemParams: { ...island.ecosystemParams },
    population: {
      ...island.population,
      labour: { ...island.population.labour },
    },
    inventory: new Map(island.inventory),
    market: {
      prices: new Map(island.market.prices),
      idealStock: new Map(island.market.idealStock),
      momentum: new Map(island.market.momentum),
      consumptionVelocity: new Map(island.market.consumptionVelocity),
    },
    productionParams: {
      baseRate: new Map(island.productionParams.baseRate),
      toolSensitivity: new Map(island.productionParams.toolSensitivity),
      ecosystemSensitivity: new Map(island.productionParams.ecosystemSensitivity),
    },
    buildings: new Map(
      Array.from(island.buildings.entries()).map(([id, building]) => [
        id,
        { ...building },
      ])
    ),
  };
}

function cloneShip(ship: ShipState): ShipState {
  return {
    ...ship,
    cargo: new Map(ship.cargo),
    location:
      ship.location.kind === 'at_island'
        ? { ...ship.location }
        : {
            ...ship.location,
            position: { ...ship.location.position },
            route: { ...ship.location.route },
          },
    cumulativeTransportCosts: ship.cumulativeTransportCosts,
    lastVoyageCost: ship.lastVoyageCost,
    crew: { ...ship.crew },
  };
}

function cloneShipyard(shipyard: ShipyardState): ShipyardState {
  return {
    ...shipyard,
    currentOrder: shipyard.currentOrder ? { ...shipyard.currentOrder } : null,
    completedShips: [...shipyard.completedShips],
  };
}
