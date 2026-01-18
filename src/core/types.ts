/**
 * Core types for Living Archipelago simulation
 * Based on 02_spec.md canonical data structures
 */

// ============================================================================
// Primitive Types
// ============================================================================

export type IslandId = string;
export type ShipId = string;
export type GoodId = string;
export type AgentId = string;
export type EventId = string;

export interface Vector2 {
  x: number;
  y: number;
}

// ============================================================================
// Goods (Section 2.1)
// ============================================================================

export type GoodCategory = 'food' | 'material' | 'tool' | 'luxury';

export interface GoodDefinition {
  id: GoodId;
  name: string;
  category: GoodCategory;
  basePrice: number;
  spoilageRatePerHour: number; // 0 for non-perishables
  bulkiness: number; // space per unit, affects capacity
}

// ============================================================================
// Ecosystem State (Section 2.2)
// ============================================================================

export interface EcosystemState {
  fishStock: number; // 0..K_fish
  forestBiomass: number; // 0..K_forest
  soilFertility: number; // 0..1
}

export interface EcosystemParams {
  fishCapacity: number;
  fishRegenRate: number;
  forestCapacity: number;
  forestRegenRate: number;
  soilRegenBase: number;
  soilDepletionRate: number;
}

// ============================================================================
// Population State (Section 2.2)
// ============================================================================

export interface LabourAllocation {
  fishing: number;
  forestry: number;
  farming: number;
  industry: number;
  services: number;
}

export interface PopulationState {
  size: number; // continuous for stability; render rounded
  health: number; // 0..1
  labour: LabourAllocation;
}

// ============================================================================
// Market State (Section 2.2)
// ============================================================================

export interface MarketState {
  prices: Map<GoodId, number>;
  idealStock: Map<GoodId, number>; // tuning knob per island
  momentum: Map<GoodId, number>; // for smoothing price change
  consumptionVelocity: Map<GoodId, number>; // recent consumption rate
}

// ============================================================================
// Production Params (Section 2.2)
// ============================================================================

export interface ProductionParams {
  baseRate: Map<GoodId, number>; // per hour
  toolSensitivity: Map<GoodId, number>;
  ecosystemSensitivity: Map<GoodId, number>;
}

// ============================================================================
// Island State (Section 2.2)
// ============================================================================

export interface IslandState {
  id: IslandId;
  name: string;
  position: Vector2;
  ecosystem: EcosystemState;
  ecosystemParams: EcosystemParams;
  population: PopulationState;
  inventory: Map<GoodId, number>;
  market: MarketState;
  productionParams: ProductionParams;
}

// ============================================================================
// Ship State (Section 2.3)
// ============================================================================

export type ShipLocation =
  | { kind: 'at_island'; islandId: IslandId }
  | { kind: 'at_sea'; position: Vector2; route: Route };

export interface Route {
  fromIslandId: IslandId;
  toIslandId: IslandId;
  etaHours: number;
  progress: number; // 0..1
}

export interface ShipState {
  id: ShipId;
  name: string;
  ownerId: AgentId; // Links ship to controlling agent
  capacity: number; // cargo-volume units
  speed: number; // distance per hour
  cash: number;
  cargo: Map<GoodId, number>;
  location: ShipLocation;
}

// ============================================================================
// Events / Perturbations (Section 2.4)
// ============================================================================

export type EventType = 'storm' | 'blight' | 'festival' | 'discovery';

export interface EventModifiers {
  shipSpeedMultiplier?: number;
  spoilageMultiplier?: number;
  soilFertilityRegenMultiplier?: number;
  grainProductionMultiplier?: number;
  luxuryDemandMultiplier?: number;
  foodDemandMultiplier?: number;
  toolEfficiencyBoost?: number;
}

export interface WorldEvent {
  id: EventId;
  type: EventType;
  targetId: IslandId | ShipId | 'global';
  startTick: number;
  endTick: number;
  modifiers: EventModifiers;
}

// ============================================================================
// Agent Types (for extensibility)
// ============================================================================

export type AgentType = 'trader' | 'population' | 'governor' | 'player';

export interface AgentAssets {
  cash: number;
  shipIds: ShipId[];
}

export interface AgentState {
  id: AgentId;
  type: AgentType;
  name: string;
  assets: AgentAssets;
}

// ============================================================================
// World State (Complete simulation state)
// ============================================================================

export interface GameTime {
  tick: number;
  gameHour: number; // 0-23
  gameDay: number;
}

export interface WorldState {
  tick: number;
  gameTime: GameTime;
  rngState: number; // Seed state for determinism
  islands: Map<IslandId, IslandState>;
  ships: Map<ShipId, ShipState>;
  events: WorldEvent[];
  agents: Map<AgentId, AgentState>;
  goods: Map<GoodId, GoodDefinition>;
}

// ============================================================================
// Simulation Config
// ============================================================================

export interface SimulationConfig {
  seed: number;
  ticksPerSecond: number; // default 1
  timeScale: number; // 1x, 2x, 4x

  // Market tuning (Section 5)
  priceGamma: number; // inventory pressure exponent
  priceVelocityK: number; // velocity coefficient
  priceLambda: number; // EMA smoothing factor
  minPrice: number;
  maxPrice: number;

  // Population tuning (Section 4)
  foodPerCapita: number;
  healthPenaltyRate: number;
  populationDeclineThreshold: number;

  // Production tuning (Section 4.1)
  labourAlpha: number;
  toolBeta: number;
}

// ============================================================================
// Helper type for immutable state updates
// ============================================================================

export type DeepReadonly<T> = T extends Map<infer K, infer V>
  ? ReadonlyMap<K, DeepReadonly<V>>
  : T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
