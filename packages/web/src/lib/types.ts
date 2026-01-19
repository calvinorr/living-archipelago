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

export interface MarketSnapshot {
  prices: Record<string, number>;
  idealStock: Record<string, number>;
}

export interface BuildingSnapshot {
  id: string;
  type: 'warehouse' | 'market' | 'port' | 'workshop';
  level: number;
  condition: number;
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
}

export interface EventSnapshot {
  id: string;
  type: 'storm' | 'blight' | 'festival' | 'discovery';
  targetId: string;
  startTick: number;
  endTick: number;
  remainingHours: number;
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
}

export interface PriceHistoryPoint {
  tick: number;
  gameDay: number;
  gameHour: number;
  prices: Record<string, Record<string, number>>; // islandId -> goodId -> price
}

export type SimulationStatus = 'disconnected' | 'connecting' | 'connected' | 'running' | 'paused';

export interface SimulationState {
  status: SimulationStatus;
  world: WorldSnapshot | null;
  priceHistory: PriceHistoryPoint[];
  agentDecisions: AgentDecision[];
  timeScale: number;
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
