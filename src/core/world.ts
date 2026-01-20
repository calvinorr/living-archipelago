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
  FishMigrationConfig,
  ShippingCostConfig,
  IslandEconomyConfig,
  OperatingCostsConfig,
  CreditConfig,
  MarketDepthConfig,
  SupplyVolatilityConfig,
  ProductionShock,
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
 * Default fish migration configuration
 * Fish migrate from depleted ecosystems to healthier ones
 */
export const DEFAULT_FISH_MIGRATION_CONFIG: FishMigrationConfig = {
  depletedThreshold: 0.4, // Below 40% capacity: fish start migrating away
  healthyThreshold: 0.6, // Above 60% capacity: can receive migrating fish
  migrationRate: 0.02, // 2% of fish stock can migrate per tick
  minMigrationAmount: 5, // Minimum fish to trigger migration
};

/**
 * Default shipping cost configuration (Track 02)
 */
export const DEFAULT_SHIPPING_COST_CONFIG: ShippingCostConfig = {
  baseVoyageCost: 10,
  costPerDistanceUnit: 0.1,
  perVolumeHandlingCost: 0.05,
  emptyReturnMultiplier: 0.5,
};

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
 * Default island economy configuration (Economic Model V2)
 * Controls how islands manage treasury and purchasing power
 */
export const DEFAULT_ISLAND_ECONOMY_CONFIG: IslandEconomyConfig = {
  enabled: true, // Enable island treasury system
  baseTreasuryPerPop: 10, // 10 coins per population for initial treasury
  importBudgetRatio: 0.1, // Can spend 10% of treasury per tick on imports
  minTreasuryRatio: 0.2, // Keep 20% as emergency reserve
  taxRedistributionRate: 0.5, // 50% of tax goes back to islands
  productionValueRate: 0.5, // Each unit produced adds 0.5 to treasury (internal value)
};

/**
 * Default operating costs configuration (Economic Model V2)
 * Creates realistic cost pressure on traders
 *
 * Design goals:
 * - Operating costs should be ~5-10% of typical trade profits
 * - Ships should not go bankrupt immediately but feel pressure from idle time
 * - Costs scale with ship size (capacity) to encourage efficient fleet management
 *
 * Example calculation for a ship with capacity 100, crew 10 at 0.5 wage rate:
 * - Crew wages: 10 * 0.5 * 1.0 = 5 coins/tick
 * - Maintenance: 100 * 0.01 = 1 coin/tick
 * - Port fee: 1 coin/tick (when docked)
 * - Total at sea: 6 coins/tick, docked: 7 coins/tick
 * - Daily cost (24 ticks): 144-168 coins
 */
export const DEFAULT_OPERATING_COSTS_CONFIG: OperatingCostsConfig = {
  crewWageMultiplier: 1.0, // Normal wages (uses crew.wageRate which is 0.5 by default)
  maintenanceRate: 0.01, // 1 coin per 100 capacity per tick
  portFeePerTick: 1.0, // 1 coin per tick when docked
  unpaidWagesMoraleThreshold: 24, // 1 day without pay before morale drops
};

/**
 * Default credit/debt configuration (Economic Model V2)
 * Allows ships to borrow funds when cash runs low
 *
 * Design goals:
 * - Prevent ships from being completely stuck without funds
 * - Create financial management pressure through interest
 * - Ships with excessive debt lose access to more credit
 *
 * Example calculation for a ship with capacity 100:
 * - Ship value: 100 * 10 = 1000 coins
 * - Credit limit: 1000 * 2.0 = 2000 coins
 * - Max debt before cut-off: 1000 * 0.8 = 800 coins
 * - Daily interest on 500 debt: 500 * 0.001 * 24 = 12 coins
 */
export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  baseCreditMultiplier: 2.0, // Can borrow up to 2x ship value
  interestRatePerTick: 0.001, // 0.1% per tick (~2.4% daily)
  minCashThreshold: 50, // Auto-borrow when cash below 50
  maxDebtRatio: 0.8, // Credit cut off at 80% of ship value
  baseValuePerCapacity: 10, // Each capacity unit worth 10 coins for credit calculation
};

/**
 * Default market depth configuration (Economic Model V2)
 * Controls price impact and liquidity for large trades
 *
 * Design goals:
 * - Large trades should get worse prices (slippage)
 * - Prevents instant arbitrage of price differences
 * - Markets recover liquidity over time
 * - Small trades have minimal impact
 *
 * Example with idealStock=100, baseDepthMultiplier=0.5:
 * - Target depth: 50 units
 * - Trading 10 units (20% of depth): ~2% price impact
 * - Trading 50 units (100% of depth): ~10% price impact
 * - Trading 100 units (200% of depth): ~30% price impact (quadratic penalty)
 */
export const DEFAULT_MARKET_DEPTH_CONFIG: MarketDepthConfig = {
  baseDepthMultiplier: 0.5, // Depth = 50% of ideal stock
  priceImpactCoefficient: 0.1, // 10% max impact when consuming full depth
  minDepth: 10, // Always have at least 10 units of depth
  depthRecoveryRate: 0.1, // Recover 10% of missing depth per tick
};

/**
 * Default supply volatility configuration (Economic Model V2)
 * Controls production variance and supply shocks
 *
 * Design goals:
 * - Random variance makes each playthrough slightly different
 * - Shocks create trading opportunities (buy from boom islands, avoid bust islands)
 * - Bust chance slightly higher than boom = slight deflationary pressure
 * - Shocks are temporary - economy self-corrects
 * - All randomness uses seeded RNG for determinism
 *
 * Example with baseVariance=0.1:
 * - Production varies from 0.9x to 1.1x randomly each tick
 * - Adds natural fluctuation to prices without destabilizing the economy
 *
 * Example with boomChance=0.001, bustChance=0.002:
 * - Each good on each island has ~0.1% chance of boom per tick
 * - Each good on each island has ~0.2% chance of bust per tick
 * - With 5 goods and 3 islands, expect ~0.4 booms and ~0.7 busts per day (24 ticks)
 */
export const DEFAULT_SUPPLY_VOLATILITY_CONFIG: SupplyVolatilityConfig = {
  baseVariance: 0.1, // +/-10% random variance on production
  boomChance: 0.001, // 0.1% chance of boom per tick per island per good
  bustChance: 0.002, // 0.2% chance of bust per tick per island per good
  boomMultiplier: 1.5, // 50% production increase during boom
  bustMultiplier: 0.5, // 50% production decrease during bust
  shockDuration: 24, // Shocks last 24 ticks (1 day)
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
  shippingCosts: DEFAULT_SHIPPING_COST_CONFIG,

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

  // Fish Migration System
  fishMigrationConfig: DEFAULT_FISH_MIGRATION_CONFIG,

  // Operating Costs System (Economic Model V2)
  operatingCostsConfig: DEFAULT_OPERATING_COSTS_CONFIG,

  // Credit/Debt System (Economic Model V2)
  creditConfig: DEFAULT_CREDIT_CONFIG,

  // Transaction Tax (currency sink)
  transactionTaxRate: 0.04, // 4% tax on all trades

  // Island Economy System (Economic Model V2)
  islandEconomyConfig: DEFAULT_ISLAND_ECONOMY_CONFIG,

  // Market Depth System (Economic Model V2)
  marketDepthConfig: DEFAULT_MARKET_DEPTH_CONFIG,

  // Supply Volatility System (Economic Model V2)
  supplyVolatilityConfig: DEFAULT_SUPPLY_VOLATILITY_CONFIG,
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
 *
 * DESIGN: Start with ~1-2 days of food buffer to force reliance on production.
 * This creates a real economy where:
 * - Islands that don't produce food will run out and need imports
 * - Arbitrage opportunities are temporary and based on actual scarcity
 * - Traders provide real value by moving goods from surplus to deficit areas
 *
 * Consumption formula: population * 0.06/hour * 24 hours ≈ 1.44 * population per day
 */
function createInitialInventory(
  archetype: 'fishing' | 'agricultural' | 'forest'
): Map<GoodId, number> {
  const inventory = new Map<GoodId, number>();

  switch (archetype) {
    case 'fishing':
      // Population 500: needs ~720 food/day
      // Start with ~1.5 days buffer = ~1080 food total
      // Fishing island produces fish locally, needs grain imports
      inventory.set('fish', 800);   // ~1 day of local production surplus
      inventory.set('grain', 300);  // ~0.5 day - creates import demand
      inventory.set('timber', 30);
      inventory.set('tools', 25);
      inventory.set('luxuries', 10);
      break;
    case 'agricultural':
      // Population 600: needs ~864 food/day
      // Start with ~1.5 days buffer = ~1300 food total
      // Agricultural island has grain surplus, needs fish imports
      inventory.set('fish', 200);   // ~0.25 day - creates import demand
      inventory.set('grain', 1000); // ~1 day of local production surplus
      inventory.set('timber', 60);
      inventory.set('tools', 35);
      inventory.set('luxuries', 15);
      break;
    case 'forest':
      // Population 450: needs ~648 food/day
      // Start with ~0.75 day buffer = ~500 food total
      // Forest island is food-poor, creates strong import demand
      inventory.set('fish', 200);   // ~0.3 day - urgent need
      inventory.set('grain', 250);  // ~0.4 day - urgent need
      inventory.set('timber', 400); // Main export good - reduced from 800
      inventory.set('tools', 30);
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
  const buyDepth = new Map<GoodId, number>();
  const sellDepth = new Map<GoodId, number>();

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

    // Initialize market depth based on ideal stock
    // Depth = idealStock * baseDepthMultiplier (from DEFAULT_MARKET_DEPTH_CONFIG)
    const depth = Math.max(
      DEFAULT_MARKET_DEPTH_CONFIG.minDepth,
      ideal * DEFAULT_MARKET_DEPTH_CONFIG.baseDepthMultiplier
    );
    buyDepth.set(good.id, depth);
    sellDepth.set(good.id, depth);
  }

  return { prices, idealStock, momentum, consumptionVelocity, buyDepth, sellDepth };
}

/**
 * Create production params for an archetype
 *
 * DESIGN: Production rates are calibrated so that:
 * - Specialized islands produce ~80-100% of their local consumption in their specialty
 * - Non-specialty production covers ~20-30% of needs
 * - Trade is REQUIRED to achieve food security (no island is fully self-sufficient)
 * - At equilibrium, total archipelago production should slightly exceed consumption
 *
 * Consumption formula: population * 0.06/hour
 * - Shoalhold (500 pop): 30 food/hr
 * - Greenbarrow (600 pop): 36 food/hr
 * - Timberwake (450 pop): 27 food/hr
 * Total: 93 food/hr across archipelago
 *
 * Target production: ~100-110 food/hr total (slight surplus for trade buffer)
 */
function createProductionParams(
  archetype: 'fishing' | 'agricultural' | 'forest'
): ProductionParams {
  const baseRate = new Map<GoodId, number>();
  const toolSensitivity = new Map<GoodId, number>();
  const ecosystemSensitivity = new Map<GoodId, number>();

  switch (archetype) {
    case 'fishing':
      // Shoalhold needs 30 food/hr
      // Fish production: 25/hr (83% of needs) - main export
      // Grain production: 3/hr (10% of needs) - must import
      // Total local: 28/hr - slight deficit requires grain imports
      baseRate.set('fish', 25);   // Main specialty - can export surplus
      baseRate.set('grain', 3);   // Minimal local farming
      baseRate.set('timber', 1);  // Very limited forestry
      baseRate.set('tools', 0.5);
      baseRate.set('luxuries', 0.2);
      break;
    case 'agricultural':
      // Greenbarrow needs 36 food/hr
      // Grain production: 32/hr (89% of needs) - main export
      // Fish production: 3/hr (8% of needs) - must import
      // Total local: 35/hr - slight deficit requires fish imports
      baseRate.set('fish', 3);    // Minimal coastal fishing
      baseRate.set('grain', 32);  // Main specialty - can export surplus
      baseRate.set('timber', 2);  // Some forestry
      baseRate.set('tools', 1.0);
      baseRate.set('luxuries', 0.5);
      break;
    case 'forest':
      // Timberwake needs 27 food/hr
      // Forest islands have poor food production - MUST rely on trade
      // Fish production: 8/hr (30% of needs)
      // Grain production: 6/hr (22% of needs)
      // Total local: 14/hr - significant deficit, ~52% covered
      // Must import ~13 food/hr to survive
      baseRate.set('fish', 8);    // Some coastal fishing
      baseRate.set('grain', 6);   // Subsistence farming in clearings
      baseRate.set('timber', 15); // Main specialty - high export potential
      baseRate.set('tools', 1.5); // Good tool production from wood
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

  // Shoalhold - Fishing Isle (pop: 500, treasury: 5000)
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
    // Economic Model V2: Treasury initialized at 10 coins per population
    treasury: 5000,
    treasuryIncome: 0,
    treasuryExpenses: 0,
    cumulativeExportRevenue: 0,
    cumulativeImportCosts: 0,
    // Economic Model V2: Supply Volatility - Production Shocks
    productionShocks: new Map<GoodId, ProductionShock>(),
  });

  // Greenbarrow - Agricultural Isle (pop: 600, treasury: 6000)
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
    // Economic Model V2: Treasury initialized at 10 coins per population
    treasury: 6000,
    treasuryIncome: 0,
    treasuryExpenses: 0,
    cumulativeExportRevenue: 0,
    cumulativeImportCosts: 0,
    // Economic Model V2: Supply Volatility - Production Shocks
    productionShocks: new Map<GoodId, ProductionShock>(),
  });

  // Timberwake - Forest Isle (pop: 450, treasury: 4500)
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
    // Economic Model V2: Treasury initialized at 10 coins per population
    treasury: 4500,
    treasuryIncome: 0,
    treasuryExpenses: 0,
    cumulativeExportRevenue: 0,
    cumulativeImportCosts: 0,
    // Economic Model V2: Supply Volatility - Production Shocks
    productionShocks: new Map<GoodId, ProductionShock>(),
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

  // Ship 1: Greenbarrow to Shoalhold grain route
  ships.set('sloop-1', {
    id: 'sloop-1',
    name: 'Sea Trader',
    ownerId: 'trader-alpha',
    capacity: 100,
    speed: 10,
    cash: 2000,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'greenbarrow' }, // Start at grain source
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(100),
    condition: 1.0,
    totalDistanceTraveled: 0,
    spoilageLossThisVoyage: new Map(),
    cumulativeSpoilageLoss: 0,
    lastKnownPrices: new Map(), // Price Discovery Lag: starts with no price knowledge
    // Credit/Debt System (Economic Model V2)
    debt: 0,
    creditLimit: 100 * DEFAULT_CREDIT_CONFIG.baseValuePerCapacity * DEFAULT_CREDIT_CONFIG.baseCreditMultiplier, // 2000
    interestRate: DEFAULT_CREDIT_CONFIG.interestRatePerTick,
    cumulativeInterestPaid: 0,
  });

  // Ship 2: Greenbarrow to Timberwake grain route
  ships.set('sloop-2', {
    id: 'sloop-2',
    name: 'Wave Runner',
    ownerId: 'trader-alpha',
    capacity: 80,
    speed: 12,
    cash: 1600,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'greenbarrow' }, // Start at grain source
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(80),
    condition: 1.0,
    totalDistanceTraveled: 0,
    spoilageLossThisVoyage: new Map(),
    cumulativeSpoilageLoss: 0,
    lastKnownPrices: new Map(), // Price Discovery Lag: starts with no price knowledge
    // Credit/Debt System (Economic Model V2)
    debt: 0,
    creditLimit: 80 * DEFAULT_CREDIT_CONFIG.baseValuePerCapacity * DEFAULT_CREDIT_CONFIG.baseCreditMultiplier, // 1600
    interestRate: DEFAULT_CREDIT_CONFIG.interestRatePerTick,
    cumulativeInterestPaid: 0,
  });

  // Ship 3: Shoalhold to Timberwake fish route
  ships.set('sloop-3', {
    id: 'sloop-3',
    name: 'Forest Spirit',
    ownerId: 'trader-alpha',
    capacity: 90,
    speed: 11,
    cash: 1800,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'shoalhold' }, // Start at fish source
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(90),
    condition: 1.0,
    totalDistanceTraveled: 0,
    spoilageLossThisVoyage: new Map(),
    cumulativeSpoilageLoss: 0,
    lastKnownPrices: new Map(), // Price Discovery Lag: starts with no price knowledge
    // Credit/Debt System (Economic Model V2)
    debt: 0,
    creditLimit: 90 * DEFAULT_CREDIT_CONFIG.baseValuePerCapacity * DEFAULT_CREDIT_CONFIG.baseCreditMultiplier, // 1800
    interestRate: DEFAULT_CREDIT_CONFIG.interestRatePerTick,
    cumulativeInterestPaid: 0,
  });

  // Ship 4: General trade / fish to Greenbarrow
  ships.set('clipper-1', {
    id: 'clipper-1',
    name: 'Swift Current',
    ownerId: 'trader-alpha',
    capacity: 60,
    speed: 15,
    cash: 1200,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'shoalhold' }, // Start at fish source
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(60),
    condition: 1.0,
    totalDistanceTraveled: 0,
    spoilageLossThisVoyage: new Map(),
    cumulativeSpoilageLoss: 0,
    lastKnownPrices: new Map(), // Price Discovery Lag: starts with no price knowledge
    // Credit/Debt System (Economic Model V2)
    debt: 0,
    creditLimit: 60 * DEFAULT_CREDIT_CONFIG.baseValuePerCapacity * DEFAULT_CREDIT_CONFIG.baseCreditMultiplier, // 1200
    interestRate: DEFAULT_CREDIT_CONFIG.interestRatePerTick,
    cumulativeInterestPaid: 0,
  });

  // Ship 5: Dedicated Timberwake food supplier
  ships.set('sloop-4', {
    id: 'sloop-4',
    name: 'Timber Lifeline',
    ownerId: 'trader-alpha',
    capacity: 100,
    speed: 10,
    cash: 2000,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: 'greenbarrow' }, // Start at grain source for Timberwake
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(100),
    condition: 1.0,
    totalDistanceTraveled: 0,
    spoilageLossThisVoyage: new Map(),
    cumulativeSpoilageLoss: 0,
    lastKnownPrices: new Map(), // Price Discovery Lag: starts with no price knowledge
    // Credit/Debt System (Economic Model V2)
    debt: 0,
    creditLimit: 100 * DEFAULT_CREDIT_CONFIG.baseValuePerCapacity * DEFAULT_CREDIT_CONFIG.baseCreditMultiplier, // 2000
    interestRate: DEFAULT_CREDIT_CONFIG.interestRatePerTick,
    cumulativeInterestPaid: 0,
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
    economyMetrics: {
      taxCollectedThisTick: 0,
      totalTaxCollected: 0,
      taxRedistributedThisTick: 0,
      totalTaxRedistributed: 0,
    },
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
    economyMetrics: state.economyMetrics
      ? { ...state.economyMetrics }
      : { taxCollectedThisTick: 0, totalTaxCollected: 0, taxRedistributedThisTick: 0, totalTaxRedistributed: 0 },
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
      buyDepth: new Map(island.market.buyDepth),
      sellDepth: new Map(island.market.sellDepth),
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
    // Economic Model V2: Clone treasury fields
    treasury: island.treasury,
    treasuryIncome: island.treasuryIncome,
    treasuryExpenses: island.treasuryExpenses,
    cumulativeExportRevenue: island.cumulativeExportRevenue,
    cumulativeImportCosts: island.cumulativeImportCosts,
    // Economic Model V2: Clone production shocks
    productionShocks: new Map(
      Array.from(island.productionShocks?.entries() ?? []).map(([goodId, shock]) => [
        goodId,
        { ...shock },
      ])
    ),
  };
}

function cloneShip(ship: ShipState): ShipState {
  // Clone lastKnownPrices Map with deep copy of PriceKnowledge entries
  const clonedLastKnownPrices = new Map(
    Array.from(ship.lastKnownPrices?.entries() ?? []).map(([islandId, knowledge]) => [
      islandId,
      {
        prices: new Map(knowledge.prices),
        tick: knowledge.tick,
      },
    ])
  );

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
    spoilageLossThisVoyage: new Map(ship.spoilageLossThisVoyage),
    cumulativeSpoilageLoss: ship.cumulativeSpoilageLoss,
    lastKnownPrices: clonedLastKnownPrices,
    // Credit/Debt System (Economic Model V2)
    debt: ship.debt ?? 0,
    creditLimit: ship.creditLimit ?? 0,
    interestRate: ship.interestRate ?? 0,
    cumulativeInterestPaid: ship.cumulativeInterestPaid ?? 0,
  };
}

function cloneShipyard(shipyard: ShipyardState): ShipyardState {
  return {
    ...shipyard,
    currentOrder: shipyard.currentOrder ? { ...shipyard.currentOrder } : null,
    completedShips: [...shipyard.completedShips],
  };
}
