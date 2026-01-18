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

export interface MarketSnapshot {
  prices: Record<string, number>;
  idealStock: Record<string, number>;
}

export interface IslandSnapshot {
  id: string;
  name: string;
  position: Vector2;
  ecosystem: EcosystemSnapshot;
  population: PopulationSnapshot;
  inventory: Record<string, number>;
  market: MarketSnapshot;
}

export interface RouteSnapshot {
  fromIslandId: string;
  toIslandId: string;
  etaHours: number;
  progress: number;
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
}

export interface EventSnapshot {
  id: string;
  type: string;
  targetId: string;
  startTick: number;
  endTick: number;
  remainingHours: number;
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
}

function serializeIsland(island: IslandState): IslandSnapshot {
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
    },
  };
}

function serializeShip(ship: ShipState): ShipSnapshot {
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

  return {
    id: ship.id,
    name: ship.name,
    ownerId: ship.ownerId,
    capacity: ship.capacity,
    speed: ship.speed,
    cash: ship.cash,
    cargo: Object.fromEntries(ship.cargo),
    location,
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
  return {
    tick: state.tick,
    gameTime: {
      tick: state.gameTime.tick,
      gameHour: state.gameTime.gameHour,
      gameDay: state.gameTime.gameDay,
    },
    islands: Array.from(state.islands.values()).map(serializeIsland),
    ships: Array.from(state.ships.values()).map(serializeShip),
    events: state.events
      .filter((e) => e.startTick <= state.tick && e.endTick > state.tick)
      .map((e) => serializeEvent(e, state.tick)),
  };
}
