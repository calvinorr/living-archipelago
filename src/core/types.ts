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

/**
 * Per-category market configuration (Track 05)
 */
export interface GoodMarketConfig {
  priceElasticity: number; // Inventory pressure exponent (gamma)
  velocityCoefficient: number; // Consumption velocity sensitivity
  idealStockDays: number; // Days of consumption to target as ideal stock
}

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

/**
 * Labor sector types (Track 06)
 */
export type Sector = 'fishing' | 'forestry' | 'farming' | 'industry' | 'services';

export interface LabourAllocation {
  fishing: number;
  forestry: number;
  farming: number;
  industry: number;
  services: number;
}

/**
 * Labor market configuration (Track 06)
 */
export interface LaborConfig {
  baseShares: Record<Sector, number>; // Default allocation without price signals
  wageResponsiveness: number; // How strongly labor responds to wage differentials (1.0 default)
  reallocationRate: number; // Max % change per hour (0.01 = 1%)
  minSectorShare: number; // Minimum share any sector can have (0.02)
  maxSectorShare: number; // Maximum share any sector can have (0.6)
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
  lastVoyageCost?: number; // Cost of most recent completed voyage (Track 02)
  cumulativeTransportCosts: number; // Total transport costs incurred (Track 02)
}

/**
 * Transport cost breakdown for a voyage (Track 02)
 */
export interface TransportCostBreakdown {
  fixedCost: number;
  distanceCost: number;
  volumeCost: number;
  returnCost: number;
  oneWayCost: number;
  totalRoundTrip: number;
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

  // Consumption tuning (Track 01)
  foodPriceElasticity: number; // Price elasticity for food (-0.3 = 30% demand drop per 100% price rise)
  luxuryPriceElasticity: number; // Price elasticity for luxuries (-1.2 = more elastic)
  foodSubstitutionElasticity: number; // How much demand shifts between fish/grain based on relative price
  healthConsumptionFactor: number; // How much health affects consumption (0.3 = 30% reduction at 0 health)

  // Population growth tuning (Track 04)
  maxGrowthRate: number; // Max annual growth rate (0.005 = 0.5%)
  maxDeclineRate: number; // Max annual decline rate (0.02 = 2%)
  stableHealthThreshold: number; // Health at which growth = 0 (0.5)
  optimalHealthThreshold: number; // Health for max growth (0.9)
  crisisHealthThreshold: number; // Health for max decline (0.3)

  // Production tuning (Section 4.1)
  labourAlpha: number;
  toolBeta: number;

  // Harvest-Production Coupling (Track 03)
  collapseThreshold: number; // Stock ratio below which collapse occurs (0.1)
  collapseFloor: number; // Minimum yield multiplier in collapse (0.05)
  criticalThreshold: number; // Stock ratio where decline accelerates (0.3)
  harvestEfficiency: number; // Fraction of harvest that becomes product (1.0 = perfect)

  // Ecosystem Collapse (Track 07)
  healthyThreshold: number; // Stock ratio for full productivity (0.6)
  deadThreshold: number; // Stock ratio below which ecosystem is dead (0.02)
  impairedRecoveryMultiplier: number; // Recovery rate when degraded (0.5)
  collapsedRecoveryMultiplier: number; // Recovery rate when collapsed (0.1)
  deadRecoveryRate: number; // Flat recovery rate when dead (0 = no natural recovery)

  // Transport Costs (Track 02)
  baseVoyageCost: number; // Fixed cost per voyage (default: 10)
  costPerDistanceUnit: number; // Per-distance cost (default: 0.1)
  perVolumeHandlingCost: number; // Per-cargo-volume cost (default: 0.05)
  emptyReturnMultiplier: number; // Cost multiplier for empty return voyage (default: 0.5)

  // Good-Specific Price Elasticity (Track 05)
  goodMarketConfigs: Record<GoodCategory, GoodMarketConfig>;

  // Wage-Based Labor Allocation (Track 06)
  laborConfig: LaborConfig;
}

/**
 * Ecosystem health classification (Track 07)
 */
export type EcosystemHealthState = 'healthy' | 'stressed' | 'degraded' | 'collapsed' | 'dead';

// ============================================================================
// Helper type for immutable state updates
// ============================================================================

export type DeepReadonly<T> = T extends Map<infer K, infer V>
  ? ReadonlyMap<K, DeepReadonly<V>>
  : T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
