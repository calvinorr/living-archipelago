/**
 * Shipping System
 * Handles ship movement, spoilage, and arrival
 * Based on 02_spec.md Section 6
 */

import type {
  ShipState,
  ShipLocation,
  IslandState,
  GoodId,
  GoodDefinition,
  WorldEvent,
  Vector2,
  TransportCostBreakdown,
  ShippingCostConfig,
  SimulationConfig,
  IslandId,
} from '../core/types.js';

import { getWarehouseEffect } from './buildings.js';

/**
 * Calculate distance between two points
 */
function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get distance between two islands by ID (Track 02)
 */
export function getDistanceBetweenIslands(
  originId: IslandId,
  destinationId: IslandId,
  islands: Map<string, IslandState>
): number {
  const origin = islands.get(originId);
  const destination = islands.get(destinationId);

  if (!origin || !destination) {
    return 0;
  }

  return distance(origin.position, destination.position);
}

/**
 * Calculate transport cost for a voyage (Track 02)
 *
 * Cost components:
 * 1. Fixed cost: port fees, loading/unloading
 * 2. Distance cost: scales with voyage length
 * 3. Volume cost: handling costs for cargo
 * 4. Return cost: empty return voyage costs ~50% of loaded trip
 */
export function calculateTransportCost(
  originId: IslandId,
  destinationId: IslandId,
  cargoVolume: number,
  islands: Map<string, IslandState>,
  config: SimulationConfig
): TransportCostBreakdown {
  const dist = getDistanceBetweenIslands(originId, destinationId, islands);

  const fixedCost = config.baseVoyageCost;
  const distanceCost = dist * config.costPerDistanceUnit;
  const volumeCost = cargoVolume * config.perVolumeHandlingCost;
  const oneWayCost = fixedCost + distanceCost + volumeCost;

  // Return voyage (assuming empty unless planning round trip with backhaul)
  const returnCost = dist * config.costPerDistanceUnit * config.emptyReturnMultiplier;

  return {
    fixedCost,
    distanceCost,
    volumeCost,
    returnCost,
    oneWayCost,
    totalRoundTrip: oneWayCost + returnCost,
  };
}

/**
 * Calculate transport costs for a voyage (Track 02)
 * Alternative signature taking IslandState objects directly
 */
export function calculateTransportCostFromIslands(
  origin: IslandState,
  destination: IslandState,
  cargoVolume: number,
  config: ShippingCostConfig
): TransportCostBreakdown {
  // Calculate distance between islands using their positions
  const dx = destination.position.x - origin.position.x;
  const dy = destination.position.y - origin.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const fixedCost = config.baseVoyageCost;
  const distanceCost = dist * config.costPerDistanceUnit;
  const volumeCost = cargoVolume * config.perVolumeHandlingCost;
  const oneWayCost = fixedCost + distanceCost + volumeCost;

  // Return voyage cost (assuming empty unless planning backhaul)
  const returnCost = dist * config.costPerDistanceUnit * config.emptyReturnMultiplier;

  return {
    fixedCost,
    distanceCost,
    volumeCost,
    returnCost,
    oneWayCost,
    totalRoundTrip: oneWayCost + returnCost,
  };
}

/**
 * Get ship speed modifier from events
 */
function getSpeedModifier(shipId: string, events: WorldEvent[]): number {
  let modifier = 1;

  for (const event of events) {
    if (
      event.targetId === shipId ||
      event.targetId === 'global' ||
      event.type === 'storm'
    ) {
      if (event.modifiers.shipSpeedMultiplier !== undefined) {
        modifier *= event.modifiers.shipSpeedMultiplier;
      }
    }
  }

  return modifier;
}

/**
 * Get spoilage modifier from events (weather effects)
 */
function getSpoilageModifier(events: WorldEvent[]): number {
  let modifier = 1;

  for (const event of events) {
    if (event.type === 'storm') {
      if (event.modifiers.spoilageMultiplier !== undefined) {
        modifier *= event.modifiers.spoilageMultiplier;
      }
    }
  }

  return modifier;
}

/**
 * Check if there's an active storm affecting the ship
 */
function isInStorm(shipId: string, events: WorldEvent[]): boolean {
  for (const event of events) {
    if (event.type === 'storm') {
      if (event.targetId === shipId || event.targetId === 'global') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculate ship speed modifier based on condition (Track 08)
 * Lower condition = slower ship
 */
function getConditionSpeedModifier(condition: number, config: SimulationConfig): number {
  // Linear penalty: at condition 0, speed reduced by speedConditionPenalty
  // at condition 1, no penalty
  const penalty = (1 - condition) * config.maintenanceConfig.speedConditionPenalty;
  return 1 - penalty;
}

/**
 * Calculate wear on ship condition during voyage (Track 08)
 */
function calculateWear(
  ship: ShipState,
  distanceTraveled: number,
  events: WorldEvent[],
  config: SimulationConfig,
  dt: number
): number {
  const mc = config.maintenanceConfig;

  // Base wear from being at sea
  let wear = mc.baseWearRate * dt;

  // Distance-based wear
  wear += mc.distanceWearRate * distanceTraveled;

  // Storm multiplier
  if (isInStorm(ship.id, events)) {
    wear *= mc.stormWearMultiplier;
  }

  return wear;
}

/**
 * Repair ship at island (Track 08)
 * Consumes timber and coins to restore condition
 */
export function repairShip(
  ship: ShipState,
  island: IslandState,
  config: SimulationConfig,
  dt: number
): {
  newShip: ShipState;
  newIsland: IslandState;
  repaired: number;
  timberUsed: number;
  coinsUsed: number;
} {
  const mc = config.maintenanceConfig;

  // Can't repair if already at full condition
  if (ship.condition >= 1.0) {
    return { newShip: ship, newIsland: island, repaired: 0, timberUsed: 0, coinsUsed: 0 };
  }

  // Calculate max repair possible this tick
  const maxRepairFromTime = mc.repairRateAtIsland * dt;
  const conditionNeeded = 1.0 - ship.condition;
  const desiredRepair = Math.min(maxRepairFromTime, conditionNeeded);

  // Convert to repair points (1 point = 0.01 condition)
  const repairPoints = desiredRepair * 100;

  // Check available resources
  const timberAvailable = island.inventory.get('timber') ?? 0;
  const coinsAvailable = ship.cash;

  // Determine actual repair based on available resources
  const timberLimitedPoints = (timberAvailable / mc.repairTimberCostPerPoint);
  const coinsLimitedPoints = (coinsAvailable / mc.repairCoinCostPerPoint);
  const actualRepairPoints = Math.min(repairPoints, timberLimitedPoints, coinsLimitedPoints);

  if (actualRepairPoints <= 0) {
    return { newShip: ship, newIsland: island, repaired: 0, timberUsed: 0, coinsUsed: 0 };
  }

  const actualRepair = actualRepairPoints / 100;
  const timberUsed = actualRepairPoints * mc.repairTimberCostPerPoint;
  const coinsUsed = actualRepairPoints * mc.repairCoinCostPerPoint;

  // Update ship condition and cash
  const newShip: ShipState = {
    ...ship,
    condition: Math.min(1.0, ship.condition + actualRepair),
    cash: ship.cash - coinsUsed,
  };

  // Update island timber inventory
  const newInventory = new Map(island.inventory);
  newInventory.set('timber', timberAvailable - timberUsed);
  const newIsland: IslandState = {
    ...island,
    inventory: newInventory,
  };

  return { newShip, newIsland, repaired: actualRepair, timberUsed, coinsUsed };
}

/**
 * Check if ship sinks due to critical condition (Track 08)
 * Returns true if ship sinks
 */
export function checkShipSinking(
  ship: ShipState,
  config: SimulationConfig,
  rng: () => number // Random number generator
): boolean {
  const mc = config.maintenanceConfig;

  // Only check sinking if below critical threshold
  if (ship.condition >= mc.criticalConditionThreshold) {
    return false;
  }

  // Risk increases as condition approaches 0
  const severityMultiplier = 1 - (ship.condition / mc.criticalConditionThreshold);
  const sinkingChance = mc.sinkingChancePerTick * severityMultiplier;

  return rng() < sinkingChance;
}

/**
 * Apply spoilage to perishable cargo
 * Formula: cargo_{t+1} = cargo_t * exp(-spoilage_rate * dt * weather_multiplier * warehouse_multiplier)
 *
 * @param warehouseMultiplier - Reduction from warehouse buildings (0-1, lower = less spoilage)
 */
function applySpoilage(
  cargo: Map<GoodId, number>,
  goods: Map<GoodId, GoodDefinition>,
  events: WorldEvent[],
  dt: number,
  warehouseMultiplier: number = 1
): { newCargo: Map<GoodId, number>; spoilageLoss: Map<GoodId, number> } {
  const newCargo = new Map<GoodId, number>();
  const spoilageLoss = new Map<GoodId, number>();
  const weatherMultiplier = getSpoilageModifier(events);

  for (const [goodId, quantity] of cargo) {
    const goodDef = goods.get(goodId);
    if (!goodDef || goodDef.spoilageRatePerHour <= 0) {
      // Non-perishable
      newCargo.set(goodId, quantity);
      continue;
    }

    // Apply exponential decay with warehouse reduction
    const decayFactor = Math.exp(
      -goodDef.spoilageRatePerHour * dt * weatherMultiplier * warehouseMultiplier
    );
    const newQuantity = quantity * decayFactor;
    const loss = quantity - newQuantity;

    newCargo.set(goodId, newQuantity);
    if (loss > 0.001) {
      spoilageLoss.set(goodId, loss);
    }
  }

  return { newCargo, spoilageLoss };
}

/**
 * Update ship movement (Track 08: includes condition-based speed)
 * Returns new ship state with updated location and distance traveled
 */
export function updateShipMovement(
  ship: ShipState,
  islands: Map<string, IslandState>,
  events: WorldEvent[],
  dt: number,
  config?: SimulationConfig
): { newLocation: ShipLocation; arrived: boolean; distanceTraveled: number } {
  if (ship.location.kind === 'at_island') {
    return { newLocation: ship.location, arrived: false, distanceTraveled: 0 };
  }

  const { route, position } = ship.location;
  const eventSpeedModifier = getSpeedModifier(ship.id, events);

  // Apply condition-based speed penalty (Track 08)
  const conditionModifier = config
    ? getConditionSpeedModifier(ship.condition, config)
    : 1;

  const effectiveSpeed = ship.speed * eventSpeedModifier * conditionModifier;

  // Update ETA
  const newEta = Math.max(0, route.etaHours - dt);

  // Calculate new progress
  const destination = islands.get(route.toIslandId);
  if (!destination) {
    // Destination not found, return to origin
    return {
      newLocation: { kind: 'at_island', islandId: route.fromIslandId },
      arrived: false,
      distanceTraveled: 0,
    };
  }

  const origin = islands.get(route.fromIslandId);
  const originPos = origin?.position ?? position;
  const destPos = destination.position;
  const totalDistance = distance(originPos, destPos);

  // Calculate new position along route
  const distanceTraveled = effectiveSpeed * dt;
  const newProgress = Math.min(
    1,
    route.progress + distanceTraveled / Math.max(totalDistance, 1)
  );

  // Interpolate position
  const newPosition: Vector2 = {
    x: originPos.x + (destPos.x - originPos.x) * newProgress,
    y: originPos.y + (destPos.y - originPos.y) * newProgress,
  };

  // Check for arrival
  if (newEta <= 0 || newProgress >= 1) {
    return {
      newLocation: { kind: 'at_island', islandId: route.toIslandId },
      arrived: true,
      distanceTraveled,
    };
  }

  return {
    newLocation: {
      kind: 'at_sea',
      position: newPosition,
      route: {
        ...route,
        etaHours: newEta,
        progress: newProgress,
      },
    },
    arrived: false,
    distanceTraveled,
  };
}

/**
 * Calculate travel time between islands
 */
export function calculateTravelTime(
  origin: IslandState,
  destination: IslandState,
  shipSpeed: number,
  events: WorldEvent[],
  shipId: string
): number {
  const dist = distance(origin.position, destination.position);
  const speedModifier = getSpeedModifier(shipId, events);
  const effectiveSpeed = shipSpeed * speedModifier;
  return dist / Math.max(effectiveSpeed, 0.1);
}

/**
 * Start a voyage from one island to another
 */
export function startVoyage(
  ship: ShipState,
  destinationId: string,
  islands: Map<string, IslandState>,
  events: WorldEvent[]
): ShipLocation {
  if (ship.location.kind !== 'at_island') {
    throw new Error('Ship must be at an island to start voyage');
  }

  const origin = islands.get(ship.location.islandId);
  const destination = islands.get(destinationId);

  if (!origin || !destination) {
    throw new Error('Invalid origin or destination island');
  }

  const travelTime = calculateTravelTime(
    origin,
    destination,
    ship.speed,
    events,
    ship.id
  );

  return {
    kind: 'at_sea',
    position: { ...origin.position },
    route: {
      fromIslandId: ship.location.islandId,
      toIslandId: destinationId,
      etaHours: travelTime,
      progress: 0,
    },
  };
}

/**
 * Update ship state including movement, spoilage, transport costs (Track 02), and wear (Track 08)
 */
export function updateShip(
  ship: ShipState,
  islands: Map<string, IslandState>,
  goods: Map<GoodId, GoodDefinition>,
  events: WorldEvent[],
  dt: number,
  config?: SimulationConfig
): {
  newShip: ShipState;
  arrived: boolean;
  arrivedAt: string | null;
  spoilageLoss: Map<GoodId, number>;
  transportCost: number;
  wearApplied: number;
} {
  // Calculate warehouse spoilage reduction if ship is at an island with warehouses
  let warehouseMultiplier = 1;
  if (ship.location.kind === 'at_island' && config) {
    const island = islands.get(ship.location.islandId);
    if (island) {
      const warehouseEffect = getWarehouseEffect(island, config.buildingsConfig);
      warehouseMultiplier = warehouseEffect.spoilageReduction;
    }
  }

  // Apply spoilage to cargo (reduced by warehouse if at island)
  const { newCargo, spoilageLoss } = applySpoilage(ship.cargo, goods, events, dt, warehouseMultiplier);

  // Update movement (now returns distance traveled)
  const { newLocation, arrived, distanceTraveled } = updateShipMovement(
    ship,
    islands,
    events,
    dt,
    config
  );

  let transportCost = 0;
  let lastVoyageCost = ship.lastVoyageCost;
  let cumulativeTransportCosts = ship.cumulativeTransportCosts;
  let cash = ship.cash;
  let condition = ship.condition;
  let totalDistanceTraveled = ship.totalDistanceTraveled;
  let wearApplied = 0;

  // Apply wear only when at sea (Track 08)
  if (ship.location.kind === 'at_sea' && config) {
    wearApplied = calculateWear(ship, distanceTraveled, events, config, dt);
    condition = Math.max(0, condition - wearApplied);
    totalDistanceTraveled += distanceTraveled;
  }

  // Deduct transport cost on voyage completion (Track 02)
  if (arrived && ship.location.kind === 'at_sea' && config) {
    const { route } = ship.location;
    const cargoVolume = calculateCargoVolume(newCargo, goods);

    // Calculate one-way cost (return cost is for planning, not deducted now)
    const costBreakdown = calculateTransportCost(
      route.fromIslandId,
      route.toIslandId,
      cargoVolume,
      islands,
      config
    );

    transportCost = costBreakdown.oneWayCost;
    lastVoyageCost = transportCost;
    cumulativeTransportCosts += transportCost;
    cash = Math.max(0, cash - transportCost); // Prevent negative cash
  }

  const newShip: ShipState = {
    ...ship,
    cargo: newCargo,
    location: newLocation,
    cash,
    lastVoyageCost,
    cumulativeTransportCosts,
    condition,
    totalDistanceTraveled,
  };

  const arrivedAt =
    arrived && newLocation.kind === 'at_island' ? newLocation.islandId : null;

  return { newShip, arrived, arrivedAt, spoilageLoss, transportCost, wearApplied };
}

/**
 * Calculate cargo volume
 */
export function calculateCargoVolume(
  cargo: Map<GoodId, number>,
  goods: Map<GoodId, GoodDefinition>
): number {
  let volume = 0;
  for (const [goodId, quantity] of cargo) {
    const goodDef = goods.get(goodId);
    const bulkiness = goodDef?.bulkiness ?? 1;
    volume += quantity * bulkiness;
  }
  return volume;
}

/**
 * Calculate remaining cargo capacity
 */
export function calculateRemainingCapacity(
  ship: ShipState,
  goods: Map<GoodId, GoodDefinition>
): number {
  const currentVolume = calculateCargoVolume(ship.cargo, goods);
  return Math.max(0, ship.capacity - currentVolume);
}

/**
 * Get ship status for UI/agents (Track 08: includes condition)
 */
export function getShipStatus(
  ship: ShipState,
  goods: Map<GoodId, GoodDefinition>,
  islands: Map<string, IslandState>
): {
  location: string;
  isAtSea: boolean;
  destination: string | null;
  etaHours: number | null;
  progress: number | null;
  cargoValue: number;
  cargoVolume: number;
  remainingCapacity: number;
  condition: number;
  conditionStatus: 'good' | 'fair' | 'poor' | 'critical';
} {
  const cargoVolume = calculateCargoVolume(ship.cargo, goods);
  const remainingCapacity = ship.capacity - cargoVolume;

  // Determine condition status
  let conditionStatus: 'good' | 'fair' | 'poor' | 'critical' = 'good';
  if (ship.condition < 0.15) conditionStatus = 'critical';
  else if (ship.condition < 0.4) conditionStatus = 'poor';
  else if (ship.condition < 0.7) conditionStatus = 'fair';

  // Calculate cargo value (using origin island prices if at sea)
  let cargoValue = 0;
  let priceSource: IslandState | undefined;

  if (ship.location.kind === 'at_island') {
    priceSource = islands.get(ship.location.islandId);
  } else {
    priceSource = islands.get(ship.location.route.toIslandId);
  }

  if (priceSource) {
    for (const [goodId, quantity] of ship.cargo) {
      const price = priceSource.market.prices.get(goodId) ?? 10;
      cargoValue += quantity * price;
    }
  }

  if (ship.location.kind === 'at_island') {
    const island = islands.get(ship.location.islandId);
    return {
      location: island?.name ?? ship.location.islandId,
      isAtSea: false,
      destination: null,
      etaHours: null,
      progress: null,
      cargoValue,
      cargoVolume,
      remainingCapacity,
      condition: ship.condition,
      conditionStatus,
    };
  }

  const { route } = ship.location;
  const destIsland = islands.get(route.toIslandId);

  return {
    location: 'At Sea',
    isAtSea: true,
    destination: destIsland?.name ?? route.toIslandId,
    etaHours: route.etaHours,
    progress: route.progress,
    cargoValue,
    cargoVolume,
    remainingCapacity,
    condition: ship.condition,
    conditionStatus,
  };
}
