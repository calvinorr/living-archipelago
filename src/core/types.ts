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
  buildings: Map<BuildingId, Building>;
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

// ============================================================================
// Crew System
// ============================================================================

/**
 * Crew state for a ship
 */
export interface CrewState {
  count: number; // Current number of crew members
  capacity: number; // Maximum crew the ship can hold
  morale: number; // 0-1, affects ship efficiency
  wageRate: number; // Wage per crew member per tick
  unpaidTicks: number; // Ticks since last wage payment (for desertion tracking)
}

/**
 * Crew configuration parameters
 */
export interface CrewConfig {
  minCrewRatio: number; // Minimum crew/capacity ratio to operate (e.g., 0.3)
  baseWageRate: number; // Default wage per crew member per tick
  moraleDecayRate: number; // Morale decay per tick when conditions are bad
  moraleRecoveryRate: number; // Morale recovery per tick when conditions are good
  desertionMoraleThreshold: number; // Morale below which crew desert
  desertionRate: number; // Fraction of crew that desert per tick when morale is low
  unpaidDesertionThreshold: number; // Ticks without pay before desertion starts
  speedMoraleBonus: number; // Max speed bonus from high morale (e.g., 0.2 = +20%)
  speedMoralePenalty: number; // Max speed penalty from low morale (e.g., 0.3 = -30%)
  atSeaMoralePenalty: number; // Additional morale decay when at sea
  lowCrewMoralePenalty: number; // Morale penalty when understaffed
}

/**
 * Ship maintenance configuration (Track 08)
 */
export interface MaintenanceConfig {
  baseWearRate: number; // Condition loss per tick when at sea (e.g., 0.0005)
  distanceWearRate: number; // Additional wear per distance unit traveled (e.g., 0.0001)
  stormWearMultiplier: number; // Wear multiplier during storms (e.g., 3.0)
  repairRateAtIsland: number; // Condition restored per tick when docked (e.g., 0.02)
  repairTimberCostPerPoint: number; // Timber cost per 0.01 condition restored (e.g., 1)
  repairCoinCostPerPoint: number; // Coin cost per 0.01 condition restored (e.g., 5)
  speedConditionPenalty: number; // Max speed penalty at 0 condition (e.g., 0.5 = -50%)
  criticalConditionThreshold: number; // Below this, ship risks sinking (e.g., 0.1)
  sinkingChancePerTick: number; // Chance of sinking per tick when critical (e.g., 0.001)
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
  crew: CrewState; // Ship crew state
  condition: number; // 0-1, ship hull/equipment condition (Track 08)
  totalDistanceTraveled: number; // Cumulative distance for wear calculation
}

/**
 * Shipping cost configuration (Track 02)
 */
export interface ShippingCostConfig {
  baseVoyageCost: number;        // Fixed cost per voyage (default: 10)
  costPerDistanceUnit: number;   // Per-distance cost (default: 0.1)
  perVolumeHandlingCost: number; // Per-cargo-volume cost (default: 0.05)
  emptyReturnMultiplier: number; // Cost multiplier for empty return (default: 0.5)
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

/**
 * Economy metrics for monitoring (currency sinks, etc.)
 */
export interface EconomyMetrics {
  taxCollectedThisTick: number; // Tax collected in current tick
  totalTaxCollected: number; // Cumulative tax collected (currency destroyed)
}

export interface WorldState {
  tick: number;
  gameTime: GameTime;
  rngState: number; // Seed state for determinism
  islands: Map<IslandId, IslandState>;
  ships: Map<ShipId, ShipState>;
  shipyards: Map<ShipyardId, ShipyardState>;
  events: WorldEvent[];
  agents: Map<AgentId, AgentState>;
  goods: Map<GoodId, GoodDefinition>;
  economyMetrics: EconomyMetrics; // Economic monitoring data
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
  shippingCosts: ShippingCostConfig; // Consolidated shipping cost config

  // Good-Specific Price Elasticity (Track 05)
  goodMarketConfigs: Record<GoodCategory, GoodMarketConfig>;

  // Wage-Based Labor Allocation (Track 06)
  laborConfig: LaborConfig;

  // Ship Crew System
  crewConfig: CrewConfig;

  // Ship Maintenance System (Track 08)
  maintenanceConfig: MaintenanceConfig;

  // Buildings System (Track 08)
  buildingsConfig: BuildingsConfig;

  // Fish Migration System
  fishMigrationConfig: FishMigrationConfig;

  // Transaction Tax (currency sink)
  transactionTaxRate: number; // Tax rate on trades (0.04 = 4%)
}

/**
 * Fish migration configuration
 * Fish migrate from depleted ecosystems to healthier ones
 */
export interface FishMigrationConfig {
  depletedThreshold: number; // Fish stock ratio below which fish migrate away (0.4)
  healthyThreshold: number; // Fish stock ratio above which fish can receive migrants (0.6)
  migrationRate: number; // Max fraction of fish stock that can migrate per tick (0.02 = 2%)
  minMigrationAmount: number; // Minimum fish amount to trigger migration (5)
}

/**
 * Ecosystem health classification (Track 07)
 */
export type EcosystemHealthState = 'healthy' | 'stressed' | 'degraded' | 'collapsed' | 'dead';

// ============================================================================
// Shipyard System (Ship Building)
// ============================================================================

export type ShipyardId = string;
export type BuildOrderId = string;

/**
 * Blueprint defining ship specifications and build costs
 */
export interface ShipBlueprint {
  id: string;
  name: string;
  description: string;
  // Ship stats
  capacity: number;
  speed: number;
  // Build requirements
  timberCost: number;
  toolsCost: number;
  coinCost: number; // Labor cost
  buildTicks: number; // Total ticks to complete construction
}

/**
 * Active ship build order in a shipyard
 */
export interface ShipBuildOrder {
  id: BuildOrderId;
  blueprintId: string;
  shipName: string;
  ownerId: AgentId;
  startTick: number;
  completionTick: number;
  progress: number; // 0..1
}

/**
 * Shipyard state - attached to an island
 */
export interface ShipyardState {
  id: ShipyardId;
  islandId: IslandId;
  name: string;
  // Current build queue (one ship at a time for simplicity)
  currentOrder: ShipBuildOrder | null;
  // Completed ships waiting to be claimed
  completedShips: ShipId[];
  // Statistics
  totalShipsBuilt: number;
}

/**
 * Ship blueprints configuration
 */
export interface ShipyardConfig {
  blueprints: Map<string, ShipBlueprint>;
}

// ============================================================================
// Buildings System (Track 08)
// ============================================================================

export type BuildingId = string;

export type BuildingType =
  | 'warehouse'    // Reduce spoilage, increase storage capacity
  | 'market'       // Reduce trade friction, better price discovery
  | 'port'         // Faster ship loading/unloading
  | 'workshop';    // Tool production bonus

export interface BuildingDefinition {
  type: BuildingType;
  name: string;
  description: string;
  buildCost: {
    timber: number;
    tools: number;
    coins: number;
  };
  buildTicks: number;
  maintenanceCost: number; // Coins per tick
  maxLevel: number;
}

export interface Building {
  id: BuildingId;
  type: BuildingType;
  level: number;          // 1 to maxLevel
  condition: number;      // 0-1, degrades without maintenance
  islandId: IslandId;
}

export interface BuildingsConfig {
  definitions: Record<BuildingType, BuildingDefinition>;
  conditionDecayRate: number;      // Decay per tick without maintenance
  levelEffectMultiplier: number;   // How much each level increases effect
}

// ============================================================================
// Helper type for immutable state updates
// ============================================================================

export type DeepReadonly<T> = T extends Map<infer K, infer V>
  ? ReadonlyMap<K, DeepReadonly<V>>
  : T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
