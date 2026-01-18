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
  AgentId,
  GameTime,
  MarketState,
  ProductionParams,
  LabourAllocation,
} from './types.js';

/**
 * Default simulation configuration
 */
export const DEFAULT_CONFIG: SimulationConfig = {
  seed: 12345,
  ticksPerSecond: 1,
  timeScale: 1,

  // Market tuning
  priceGamma: 1.5,
  priceVelocityK: 0.3,
  priceLambda: 0.1,
  minPrice: 0.1,
  maxPrice: 1000,

  // Population tuning
  foodPerCapita: 0.05, // 0.05 units per person per hour
  healthPenaltyRate: 0.1,
  populationDeclineThreshold: 0.3,

  // Production tuning
  labourAlpha: 0.7,
  toolBeta: 0.5,
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
      inventory.set('fish', 50);
      inventory.set('grain', 80);
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

  switch (archetype) {
    case 'fishing':
      baseRate.set('fish', 15);
      baseRate.set('grain', 2);
      baseRate.set('timber', 3);
      baseRate.set('tools', 1);
      baseRate.set('luxuries', 0.5);
      break;
    case 'agricultural':
      baseRate.set('fish', 2);
      baseRate.set('grain', 18);
      baseRate.set('timber', 4);
      baseRate.set('tools', 2);
      baseRate.set('luxuries', 1);
      break;
    case 'forest':
      baseRate.set('fish', 1);
      baseRate.set('grain', 3);
      baseRate.set('timber', 20);
      baseRate.set('tools', 3);
      baseRate.set('luxuries', 0.5);
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
  });

  return islands;
}

/**
 * Create MVP ships
 */
export function createMVPShips(): Map<ShipId, ShipState> {
  const ships = new Map<ShipId, ShipState>();

  ships.set('sloop-1', {
    id: 'sloop-1',
    name: 'Sea Trader',
    ownerId: 'trader-1',
    capacity: 100,
    speed: 10, // distance units per hour
    cash: 500,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'shoalhold' },
  });

  ships.set('sloop-2', {
    id: 'sloop-2',
    name: 'Wave Runner',
    ownerId: 'trader-2',
    capacity: 80,
    speed: 12,
    cash: 400,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'greenbarrow' },
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
  const agents = createMVPAgents();

  return {
    tick: 0,
    gameTime: tickToGameTime(0),
    rngState: seed,
    islands,
    ships,
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
  };
}
