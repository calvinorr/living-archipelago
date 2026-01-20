/**
 * Frontend types for Living Archipelago dashboard
 * Serializable versions of simulation types for WebSocket transport
 */

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameTime {
  tick: number;
  gameHour: number;
  gameDay: number;
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
 * Tracks available liquidity for price impact calculations
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
  buildings?: BuildingSnapshot[];
  // Economic Model V2: Island Treasury
  treasury?: TreasurySnapshot;
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
 * Operating costs per-tick estimate for display
 */
export interface OperatingCostsSnapshot {
  crewWages: number; // Per-tick crew wages
  maintenance: number; // Per-tick maintenance cost
  portFees: number; // Per-tick port fees (only when docked)
  total: number; // Total per-tick operating costs
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
  crew?: CrewSnapshot;
  condition?: number; // 0-1, ship hull condition (Track 08)
  // Spoilage tracking (Economic Model V2)
  spoilageLossThisVoyage?: Record<string, number>;
  cumulativeSpoilageLoss?: number;
  // Price Discovery Lag (Economic Model V2)
  lastKnownPrices?: LastKnownPricesSnapshot;
  // Operating costs (Economic Model V2)
  operatingCosts?: OperatingCostsSnapshot;
  // Credit/Debt System (Economic Model V2)
  credit?: CreditSnapshot;
}

export interface EventSnapshot {
  id: string;
  type: 'storm' | 'blight' | 'festival' | 'discovery';
  targetId: string;
  startTick: number;
  endTick: number;
  remainingHours: number;
}

export interface EconomyMetricsSnapshot {
  taxCollectedThisTick: number;
  totalTaxCollected: number;
  taxRedistributedThisTick: number;
  totalTaxRedistributed: number;
}

export interface AgentDecision {
  agentId: string;
  agentName: string;
  tick: number;
  triggered: boolean;
  triggers: string[];
  strategy?: {
    type: string;
    goal: string;
    targetRoute?: string;
  };
  actions: Array<{
    type: string;
    details: string;
  }>;
  reasoning?: string;
}

export interface WorldSnapshot {
  tick: number;
  gameTime: GameTime;
  islands: IslandSnapshot[];
  ships: ShipSnapshot[];
  events: EventSnapshot[];
  economyMetrics?: EconomyMetricsSnapshot;
}

export interface PriceHistoryPoint {
  tick: number;
  gameDay: number;
  gameHour: number;
  prices: Record<string, Record<string, number>>; // islandId -> goodId -> price
}

export interface EconomyHistoryPoint {
  tick: number;
  gameDay: number;
  totalTaxCollected: number;
  totalMoneySupply: number; // Sum of all ship cash
  avgFishStock: number; // Average fish stock ratio across islands
  tradeVolume: number; // Approximate trades this tick
}

export type SimulationStatus = 'disconnected' | 'connecting' | 'connected' | 'running' | 'paused';

export interface SimulationState {
  status: SimulationStatus;
  world: WorldSnapshot | null;
  priceHistory: PriceHistoryPoint[];
  agentDecisions: AgentDecision[];
  timeScale: number;
  economyHistory: EconomyHistoryPoint[];
}

// WebSocket message types
export type ServerMessage =
  | { type: 'tick'; data: WorldSnapshot }
  | { type: 'agent-decision'; data: AgentDecision }
  | { type: 'status'; data: { status: SimulationStatus } }
  | { type: 'history'; data: { priceHistory: PriceHistoryPoint[] } }
  | { type: 'llm-call'; data: LLMCallRecord }
  | { type: 'llm-stats'; data: LLMMetricsSummary }
  | { type: 'llm-status'; data: { enabled: boolean } };

export type ClientMessage =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'speed'; scale: number }
  | { type: 'subscribe'; channels: string[] }
  | { type: 'set-llm'; enabled: boolean };

// Goods metadata
export const GOODS = {
  fish: { name: 'Fish', color: '#3b82f6', emoji: '🐟' },
  grain: { name: 'Grain', color: '#eab308', emoji: '🌾' },
  timber: { name: 'Timber', color: '#84cc16', emoji: '🪵' },
  tools: { name: 'Tools', color: '#6b7280', emoji: '🔧' },
  luxuries: { name: 'Luxuries', color: '#a855f7', emoji: '💎' },
} as const;

export type GoodId = keyof typeof GOODS;

// LLM Metrics types
export interface LLMCallRecord {
  id: string;
  timestamp: number;
  model: string;
  promptSummary: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  finishReason: string;
}

export interface LLMMetricsSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  callsPerMinute: number;
  recentCalls: LLMCallRecord[];
}
