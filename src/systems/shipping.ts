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
} from '../core/types.js';

/**
 * Calculate distance between two points
 */
function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
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
 * Apply spoilage to perishable cargo
 * Formula: cargo_{t+1} = cargo_t * exp(-spoilage_rate * dt * weather_multiplier)
 */
function applySpoilage(
  cargo: Map<GoodId, number>,
  goods: Map<GoodId, GoodDefinition>,
  events: WorldEvent[],
  dt: number
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

    // Apply exponential decay
    const decayFactor = Math.exp(
      -goodDef.spoilageRatePerHour * dt * weatherMultiplier
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
 * Update ship movement
 * Returns new ship state with updated location
 */
export function updateShipMovement(
  ship: ShipState,
  islands: Map<string, IslandState>,
  events: WorldEvent[],
  dt: number
): { newLocation: ShipLocation; arrived: boolean } {
  if (ship.location.kind === 'at_island') {
    return { newLocation: ship.location, arrived: false };
  }

  const { route, position } = ship.location;
  const speedModifier = getSpeedModifier(ship.id, events);
  const effectiveSpeed = ship.speed * speedModifier;

  // Update ETA
  const newEta = Math.max(0, route.etaHours - dt);

  // Calculate new progress
  const destination = islands.get(route.toIslandId);
  if (!destination) {
    // Destination not found, return to origin
    return {
      newLocation: { kind: 'at_island', islandId: route.fromIslandId },
      arrived: false,
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
 * Update ship state including movement and spoilage
 */
export function updateShip(
  ship: ShipState,
  islands: Map<string, IslandState>,
  goods: Map<GoodId, GoodDefinition>,
  events: WorldEvent[],
  dt: number
): {
  newShip: ShipState;
  arrived: boolean;
  arrivedAt: string | null;
  spoilageLoss: Map<GoodId, number>;
} {
  // Apply spoilage to cargo
  const { newCargo, spoilageLoss } = applySpoilage(ship.cargo, goods, events, dt);

  // Update movement
  const { newLocation, arrived } = updateShipMovement(ship, islands, events, dt);

  const newShip: ShipState = {
    ...ship,
    cargo: newCargo,
    location: newLocation,
  };

  const arrivedAt =
    arrived && newLocation.kind === 'at_island' ? newLocation.islandId : null;

  return { newShip, arrived, arrivedAt, spoilageLoss };
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
 * Get ship status for UI/agents
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
} {
  const cargoVolume = calculateCargoVolume(ship.cargo, goods);
  const remainingCapacity = ship.capacity - cargoVolume;

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
  };
}
