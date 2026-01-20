/**
 * State Serializer
 * Converts simulation state to JSON-serializable snapshots for the frontend
 */

import type { WorldState, IslandState, ShipState, WorldEvent } from '../core/types.js';

export interface Vector2 {
  x: number;
  y: number;
}

export interface EcosystemSnapshot {
  fishStock: number;
  fishCapacity: number;
  forestBiomass: number;
  forestCapacity: number;
  soilFertility: number;
}

export interface PopulationSnapshot {
  size: number;
  health: number;
  labour: {
    fishing: number;
    forestry: number;
    farming: number;
    industry: number;
    services: number;
  };
}

/**
 * Market depth snapshot for an island (Economic Model V2)
 */
export interface MarketDepthSnapshot {
  buyDepth: Record<string, number>;
  sellDepth: Record<string, number>;
}

export interface MarketSnapshot {
  prices: Record<string, number>;
  idealStock: Record<string, number>;
  /** Market depth for price impact calculations (Economic Model V2) */
  depth?: MarketDepthSnapshot;
}

export interface BuildingSnapshot {
  id: string;
  type: 'warehouse' | 'market' | 'port' | 'workshop';
  level: number;
  condition: number;
}

export interface TreasurySnapshot {
  balance: number;
  income: number;      // Income this tick
  expenses: number;    // Expenses this tick
  cumulativeExportRevenue: number;
  cumulativeImportCosts: number;
}

export interface IslandSnapshot {
  id: string;
  name: string;
  position: Vector2;
  ecosystem: EcosystemSnapshot;
  population: PopulationSnapshot;
  inventory: Record<string, number>;
  market: MarketSnapshot;
  buildings: BuildingSnapshot[];
  // Economic Model V2: Island Treasury
  treasury: TreasurySnapshot;
}

export interface RouteSnapshot {
  fromIslandId: string;
  toIslandId: string;
  etaHours: number;
  progress: number;
}

export interface CrewSnapshot {
  count: number;
  capacity: number;
  morale: number;
  wageRate: number;
  unpaidTicks: number; // Ticks since last wage payment
}

/**
 * Operating costs per-tick estimate for display
 */
export interface OperatingCostsSnapshot {
  crewWages: number; // Per-tick crew wages
  maintenance: number; // Per-tick maintenance cost
  portFees: number; // Per-tick port fees (only when docked)
  total: number; // Total per-tick operating costs
}

/**
 * Credit/debt status for display (Economic Model V2)
 */
export interface CreditSnapshot {
  debt: number; // Current outstanding debt
  creditLimit: number; // Maximum borrowing capacity
  interestRate: number; // Interest rate per tick
  cumulativeInterestPaid: number; // Total interest paid over ship lifetime
  availableCredit: number; // creditLimit - debt (how much more can borrow)
  debtRatio: number; // debt / shipValue (0-1)
}

/**
 * Price knowledge snapshot for an island (Price Discovery Lag)
 */
export interface PriceKnowledgeSnapshot {
  prices: Record<string, number>;
  tick: number; // When prices were observed
  age: number; // Current tick - observed tick
  isStale: boolean; // True if age > 24 ticks
}

/**
 * Ship's price knowledge across all islands (Price Discovery Lag)
 */
export interface LastKnownPricesSnapshot {
  [islandId: string]: PriceKnowledgeSnapshot;
}

export interface ShipSnapshot {
  id: string;
  name: string;
  ownerId: string;
  capacity: number;
  speed: number;
  cash: number;
  cargo: Record<string, number>;
  location:
    | { kind: 'at_island'; islandId: string }
    | { kind: 'at_sea'; position: Vector2; route: RouteSnapshot };
  crew: CrewSnapshot;
  condition: number; // 0-1, ship hull condition (Track 08)
  // Spoilage tracking (Economic Model V2)
  spoilageLossThisVoyage: Record<string, number>;
  cumulativeSpoilageLoss: number;
  // Operating costs (Economic Model V2)
  operatingCosts: OperatingCostsSnapshot;
  // Price Discovery Lag (Economic Model V2)
  lastKnownPrices: LastKnownPricesSnapshot;
  // Credit/Debt System (Economic Model V2)
  credit: CreditSnapshot;
}

export interface EventSnapshot {
  id: string;
  type: string;
  targetId: string;
  startTick: number;
  endTick: number;
  remainingHours: number;
}

export interface EconomyMetricsSnapshot {
  taxCollectedThisTick: number; // Tax collected in current tick
  totalTaxCollected: number; // Cumulative tax collected (currency destroyed)
  taxRedistributedThisTick: number; // Tax redistributed to islands this tick
  totalTaxRedistributed: number; // Cumulative tax redistributed to islands
}

export interface WorldSnapshot {
  tick: number;
  gameTime: {
    tick: number;
    gameHour: number;
    gameDay: number;
  };
  islands: IslandSnapshot[];
  ships: ShipSnapshot[];
  events: EventSnapshot[];
  economyMetrics: EconomyMetricsSnapshot;
}

function serializeIsland(island: IslandState): IslandSnapshot {
  // Convert buildings Map to array (with fallback for backwards compatibility)
  const buildings: BuildingSnapshot[] = island.buildings
    ? Array.from(island.buildings.values()).map((b) => ({
        id: b.id,
        type: b.type as BuildingSnapshot['type'],
        level: b.level,
        condition: b.condition,
      }))
    : [];

  return {
    id: island.id,
    name: island.name,
    position: { x: island.position.x, y: island.position.y },
    ecosystem: {
      fishStock: island.ecosystem.fishStock,
      fishCapacity: island.ecosystemParams.fishCapacity,
      forestBiomass: island.ecosystem.forestBiomass,
      forestCapacity: island.ecosystemParams.forestCapacity,
      soilFertility: island.ecosystem.soilFertility,
    },
    population: {
      size: island.population.size,
      health: island.population.health,
      labour: { ...island.population.labour },
    },
    inventory: Object.fromEntries(island.inventory),
    market: {
      prices: Object.fromEntries(island.market.prices),
      idealStock: Object.fromEntries(island.market.idealStock),
      // Economic Model V2: Market depth for price impact
      depth: island.market.buyDepth && island.market.sellDepth ? {
        buyDepth: Object.fromEntries(island.market.buyDepth),
        sellDepth: Object.fromEntries(island.market.sellDepth),
      } : undefined,
    },
    buildings,
    // Economic Model V2: Island Treasury (with backwards compatibility)
    treasury: {
      balance: island.treasury ?? 0,
      income: island.treasuryIncome ?? 0,
      expenses: island.treasuryExpenses ?? 0,
      cumulativeExportRevenue: island.cumulativeExportRevenue ?? 0,
      cumulativeImportCosts: island.cumulativeImportCosts ?? 0,
    },
  };
}

/** Threshold for considering price data stale (24 ticks = 1 game day) */
const STALE_PRICE_THRESHOLD = 24;

function serializeShip(ship: ShipState, currentTick: number): ShipSnapshot {
  const location =
    ship.location.kind === 'at_island'
      ? { kind: 'at_island' as const, islandId: ship.location.islandId }
      : {
          kind: 'at_sea' as const,
          position: { x: ship.location.position.x, y: ship.location.position.y },
          route: {
            fromIslandId: ship.location.route.fromIslandId,
            toIslandId: ship.location.route.toIslandId,
            etaHours: ship.location.route.etaHours,
            progress: ship.location.route.progress,
          },
        };

  // Fallbacks for backwards compatibility with older ship data
  const crew = ship.crew ?? { count: 0, capacity: 10, morale: 0.5, wageRate: 0.5, unpaidTicks: 0 };
  const condition = ship.condition ?? 1.0;
  const spoilageLossThisVoyage = ship.spoilageLossThisVoyage ?? new Map();
  const cumulativeSpoilageLoss = ship.cumulativeSpoilageLoss ?? 0;
  const lastKnownPrices = ship.lastKnownPrices ?? new Map();

  // Calculate operating costs estimates for display
  // Using default config values for serialization (actual costs calculated in simulation)
  const crewWages = crew.count * crew.wageRate; // Per tick
  const maintenanceRate = 0.01; // Default from config
  const maintenance = ship.capacity * maintenanceRate;
  const isDockedAtIsland = ship.location.kind === 'at_island';
  const portFeePerTick = 1.0; // Default from config
  const portFees = isDockedAtIsland ? portFeePerTick : 0;

  // Serialize lastKnownPrices with age and staleness information
  const serializedPriceKnowledge: LastKnownPricesSnapshot = {};
  for (const [islandId, knowledge] of lastKnownPrices) {
    const age = currentTick - knowledge.tick;
    serializedPriceKnowledge[islandId] = {
      prices: Object.fromEntries(knowledge.prices),
      tick: knowledge.tick,
      age,
      isStale: age > STALE_PRICE_THRESHOLD,
    };
  }

  // Credit/debt calculations (with backwards compatibility)
  const debt = ship.debt ?? 0;
  const creditLimit = ship.creditLimit ?? 0;
  const interestRate = ship.interestRate ?? 0;
  const cumulativeInterestPaid = ship.cumulativeInterestPaid ?? 0;
  // Calculate ship value for debt ratio (using default baseValuePerCapacity of 10)
  const baseValuePerCapacity = 10;
  const shipValue = ship.capacity * baseValuePerCapacity;
  const availableCredit = Math.max(0, creditLimit - debt);
  const debtRatio = shipValue > 0 ? debt / shipValue : 0;

  return {
    id: ship.id,
    name: ship.name,
    ownerId: ship.ownerId,
    capacity: ship.capacity,
    speed: ship.speed,
    cash: ship.cash,
    cargo: Object.fromEntries(ship.cargo),
    location,
    crew: {
      count: crew.count,
      capacity: crew.capacity,
      morale: crew.morale,
      wageRate: crew.wageRate,
      unpaidTicks: crew.unpaidTicks,
    },
    condition,
    spoilageLossThisVoyage: Object.fromEntries(spoilageLossThisVoyage),
    cumulativeSpoilageLoss,
    operatingCosts: {
      crewWages,
      maintenance,
      portFees,
      total: crewWages + maintenance + portFees,
    },
    lastKnownPrices: serializedPriceKnowledge,
    credit: {
      debt,
      creditLimit,
      interestRate,
      cumulativeInterestPaid,
      availableCredit,
      debtRatio,
    },
  };
}

function serializeEvent(event: WorldEvent, currentTick: number): EventSnapshot {
  return {
    id: event.id,
    type: event.type,
    targetId: String(event.targetId),
    startTick: event.startTick,
    endTick: event.endTick,
    remainingHours: Math.max(0, event.endTick - currentTick),
  };
}

export function serializeWorldState(state: WorldState): WorldSnapshot {
  // Provide default economy metrics for backwards compatibility
  const economyMetrics = state.economyMetrics ?? {
    taxCollectedThisTick: 0,
    totalTaxCollected: 0,
    taxRedistributedThisTick: 0,
    totalTaxRedistributed: 0,
  };

  return {
    tick: state.tick,
    gameTime: {
      tick: state.gameTime.tick,
      gameHour: state.gameTime.gameHour,
      gameDay: state.gameTime.gameDay,
    },
    islands: Array.from(state.islands.values()).map(serializeIsland),
    ships: Array.from(state.ships.values()).map((ship) => serializeShip(ship, state.tick)),
    events: state.events
      .filter((e) => e.startTick <= state.tick && e.endTick > state.tick)
      .map((e) => serializeEvent(e, state.tick)),
    economyMetrics: {
      taxCollectedThisTick: economyMetrics.taxCollectedThisTick,
      totalTaxCollected: economyMetrics.totalTaxCollected,
      taxRedistributedThisTick: economyMetrics.taxRedistributedThisTick ?? 0,
      totalTaxRedistributed: economyMetrics.totalTaxRedistributed ?? 0,
    },
  };
}
