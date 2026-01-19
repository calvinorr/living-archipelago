/**
 * Main Simulation Loop
 * Orchestrates all systems in the correct tick order
 * Based on 02_spec.md Section 9
 */

import type {
  WorldState,
  IslandState,
  GoodId,
  SimulationConfig,
  ShipyardId,
  ShipId,
} from './types.js';
import { SeededRNG, hashState } from './rng.js';
import { cloneWorldState, tickToGameTime, DEFAULT_CONFIG, initializeWorld } from './world.js';

import { updateEcology, type HarvestData } from '../systems/ecology.js';
import { updateProduction, type ProductionResult } from '../systems/production.js';
import { updateConsumption, type ConsumptionResult } from '../systems/consumption.js';
import { updatePopulation } from '../systems/population.js';
import { updateMarket } from '../systems/market.js';
import { updateShip } from '../systems/shipping.js';
import { generateEvents, updateEvents } from '../systems/events.js';
import { updateCrew, type CrewUpdateResult } from '../systems/crew.js';
import { updateAllShipyards } from '../systems/shipyard.js';
import { updateBuildingMaintenance } from '../systems/buildings.js';

/**
 * Tick metrics for logging/debugging
 */
export interface TickMetrics {
  tick: number;
  stateHash: string;
  production: Map<string, Map<GoodId, number>>;
  consumption: Map<string, ConsumptionResult>;
  priceChanges: Map<string, Map<GoodId, number>>;
  arrivals: Array<{ shipId: string; islandId: string }>;
  newEvents: string[];
  expiredEvents: string[];
  crewUpdates: Map<string, CrewUpdateResult>;
  shipyardCompletions: Array<{ shipyardId: ShipyardId; shipId: ShipId; shipName: string }>;
}

/**
 * Simulation class manages the world state and tick execution
 */
export class Simulation {
  private state: WorldState;
  private rng: SeededRNG;
  private config: SimulationConfig;
  private tickHistory: string[] = []; // State hashes for determinism verification

  constructor(initialState: WorldState, config: Partial<SimulationConfig> = {}) {
    this.state = cloneWorldState(initialState);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRNG(this.state.rngState);
  }

  /**
   * Get current world state (read-only)
   */
  getState(): WorldState {
    return this.state;
  }

  /**
   * Update world state (used for applying agent actions)
   * Only modifies ships and islands since agent actions only affect those
   */
  updateState(newState: WorldState): void {
    // Copy over ships and islands from the new state
    // This preserves the tick, events, and other simulation state
    // while applying agent action results (trades, navigation)
    this.state = {
      ...this.state,
      ships: newState.ships,
      islands: newState.islands,
    };
  }

  /**
   * Get current tick
   */
  getTick(): number {
    return this.state.tick;
  }

  /**
   * Get tick history hashes for determinism verification
   */
  getTickHistory(): string[] {
    return [...this.tickHistory];
  }

  /**
   * Execute one simulation tick
   * Returns metrics about what changed
   */
  tick(dt: number = 1): TickMetrics {
    const metrics: TickMetrics = {
      tick: this.state.tick,
      stateHash: '',
      production: new Map(),
      consumption: new Map(),
      priceChanges: new Map(),
      arrivals: [],
      newEvents: [],
      expiredEvents: [],
      crewUpdates: new Map(),
      shipyardCompletions: [],
    };

    // Clone state for immutable update
    const next = cloneWorldState(this.state);
    next.tick += 1;
    next.gameTime = tickToGameTime(next.tick);

    // =========================================================================
    // 1. Generate and apply events
    // =========================================================================
    const newEvents = generateEvents(next, this.rng, dt);
    metrics.newEvents = newEvents.map((e) => `${e.type}@${e.targetId}`);

    // Track expired events
    const expiredEventIds = next.events
      .filter((e) => e.endTick <= next.tick)
      .map((e) => e.id);
    metrics.expiredEvents = expiredEventIds;

    next.events = updateEvents(next.events, newEvents, next.tick);

    // =========================================================================
    // 2-6. Update each island
    // =========================================================================
    for (const [islandId, island] of next.islands) {
      // 2. Production (now runs first to determine harvest - Track 03)
      const goodIds = Array.from(next.goods.keys());
      const productionResult: ProductionResult = updateProduction(
        island,
        goodIds,
        this.config,
        next.events,
        dt
      );

      // Track production
      const productionThisTick = new Map<GoodId, number>();
      for (const goodId of goodIds) {
        productionThisTick.set(goodId, productionResult.produced.get(goodId) ?? 0);
      }
      metrics.production.set(islandId, productionThisTick);

      // 3. Ecology regeneration (now uses harvest from production - Track 03)
      const harvestData: HarvestData = {
        fish: productionResult.harvested.get('fish') ?? 0,
        timber: productionResult.harvested.get('timber') ?? 0,
      };
      const newEcosystem = updateEcology(island, harvestData, this.config, next.events, dt);

      // 4. Consumption
      const islandForConsumption: IslandState = {
        ...island,
        ecosystem: newEcosystem,
        inventory: productionResult.newInventory,
      };
      const consumptionResult = updateConsumption(
        islandForConsumption,
        this.config,
        next.events,
        dt
      );
      metrics.consumption.set(islandId, consumptionResult);

      // 5. Population update
      const islandForPopulation: IslandState = {
        ...island,
        ecosystem: newEcosystem,
        inventory: consumptionResult.newInventory,
      };
      const newPopulation = updatePopulation(
        islandForPopulation,
        consumptionResult,
        this.config,
        dt
      );

      // Track consumption by good type for price velocity
      const consumptionByGood = new Map<GoodId, number>();
      consumptionByGood.set('fish', consumptionResult.foodConsumed * 0.5);
      consumptionByGood.set('grain', consumptionResult.foodConsumed * 0.5);
      consumptionByGood.set('luxuries', consumptionResult.luxuryConsumed);

      // 6. Price update
      const islandForMarket: IslandState = {
        ...island,
        ecosystem: newEcosystem,
        inventory: consumptionResult.newInventory,
        population: newPopulation,
      };
      const newMarket = updateMarket(
        islandForMarket,
        next.goods,
        consumptionByGood,
        next.events,
        this.config,
        dt
      );

      // Track price changes
      const priceChanges = new Map<GoodId, number>();
      for (const [goodId, newPrice] of newMarket.prices) {
        const oldPrice = island.market.prices.get(goodId) ?? newPrice;
        priceChanges.set(goodId, newPrice - oldPrice);
      }
      metrics.priceChanges.set(islandId, priceChanges);

      // Update island state
      next.islands.set(islandId, {
        ...island,
        ecosystem: newEcosystem,
        population: newPopulation,
        inventory: consumptionResult.newInventory,
        market: newMarket,
      });
    }

    // =========================================================================
    // 7. Building maintenance - condition decay and upkeep
    // =========================================================================
    for (const [islandId, island] of next.islands) {
      const { newIsland } = updateBuildingMaintenance(island, this.config, dt);
      next.islands.set(islandId, newIsland);
    }

    // =========================================================================
    // 8-9. Ship movement, spoilage, arrival, and transport costs (Track 02)
    // =========================================================================
    for (const [shipId, ship] of next.ships) {
      const { newShip, arrived, arrivedAt } = updateShip(
        ship,
        next.islands,
        next.goods,
        next.events,
        dt,
        this.config
      );

      if (arrived && arrivedAt) {
        metrics.arrivals.push({ shipId, islandId: arrivedAt });
      }

      next.ships.set(shipId, newShip);
    }

    // =========================================================================
    // 10. Ship crew system - wages, morale, and desertion
    // =========================================================================
    for (const [shipId, ship] of next.ships) {
      // Get the island if ship is docked (for desertion to return to population)
      let currentIsland: IslandState | null = null;
      if (ship.location.kind === 'at_island') {
        currentIsland = next.islands.get(ship.location.islandId) ?? null;
      }

      const crewResult = updateCrew(ship, currentIsland, this.config, dt);
      metrics.crewUpdates.set(shipId, crewResult);

      // Update ship with new crew state
      next.ships.set(shipId, crewResult.newShip);

      // Update island population if crew deserted at island
      if (crewResult.newIsland && ship.location.kind === 'at_island') {
        next.islands.set(ship.location.islandId, crewResult.newIsland);
      }
    }

    // =========================================================================
    // 11. Shipyard system - process build orders and complete ships
    // =========================================================================
    const shipyardResult = updateAllShipyards(next, dt);
    next.shipyards = shipyardResult.newShipyards;
    // Apply any island inventory changes from shipyards
    for (const [islandId, island] of shipyardResult.newIslands) {
      const currentIsland = next.islands.get(islandId);
      if (currentIsland) {
        // Merge inventory changes while preserving other island state changes
        next.islands.set(islandId, {
          ...currentIsland,
          inventory: island.inventory,
        });
      }
    }
    // Add newly completed ships
    for (const [shipId, ship] of shipyardResult.newShips) {
      next.ships.set(shipId, ship);
      // Update the owner's agent state to include the new ship
      const agent = next.agents.get(ship.ownerId);
      if (agent) {
        next.agents.set(ship.ownerId, {
          ...agent,
          assets: {
            ...agent.assets,
            shipIds: [...agent.assets.shipIds, shipId],
          },
        });
      }
    }
    metrics.shipyardCompletions = shipyardResult.completions;

    // =========================================================================
    // 12. Update RNG state and compute hash
    // =========================================================================
    next.rngState = this.rng.getState().s0;
    metrics.stateHash = hashState(next);
    this.tickHistory.push(metrics.stateHash);

    // Update state
    this.state = next;

    return metrics;
  }

  /**
   * Run simulation for N ticks
   */
  run(ticks: number, dt: number = 1): TickMetrics[] {
    const allMetrics: TickMetrics[] = [];

    for (let i = 0; i < ticks; i++) {
      allMetrics.push(this.tick(dt));
    }

    return allMetrics;
  }

  /**
   * Get simulation summary for current state
   */
  getSummary(): {
    tick: number;
    gameDay: number;
    islands: Array<{
      id: string;
      name: string;
      population: number;
      health: number;
      prices: Record<string, number>;
    }>;
    ships: Array<{
      id: string;
      location: string;
      cash: number;
      crew: {
        count: number;
        capacity: number;
        morale: number;
      };
    }>;
    activeEvents: string[];
  } {
    const islands = Array.from(this.state.islands.values()).map((island) => ({
      id: island.id,
      name: island.name,
      population: Math.round(island.population.size),
      health: Math.round(island.population.health * 100) / 100,
      prices: Object.fromEntries(
        Array.from(island.market.prices.entries()).map(([k, v]) => [
          k,
          Math.round(v * 100) / 100,
        ])
      ),
    }));

    const ships = Array.from(this.state.ships.values()).map((ship) => ({
      id: ship.id,
      location:
        ship.location.kind === 'at_island'
          ? ship.location.islandId
          : `At sea → ${ship.location.route.toIslandId}`,
      cash: Math.round(ship.cash),
      crew: {
        count: ship.crew.count,
        capacity: ship.crew.capacity,
        morale: Math.round(ship.crew.morale * 100) / 100,
      },
    }));

    const activeEvents = this.state.events
      .filter((e) => e.startTick <= this.state.tick && e.endTick > this.state.tick)
      .map((e) => `${e.type}@${e.targetId}`);

    return {
      tick: this.state.tick,
      gameDay: this.state.gameTime.gameDay,
      islands,
      ships,
      activeEvents,
    };
  }
}

/**
 * Create and run a determinism test
 * Returns true if two runs with same seed produce identical results
 */
export function verifyDeterminism(seed: number, ticks: number): boolean {

  const state1 = initializeWorld(seed);
  const state2 = initializeWorld(seed);

  const sim1 = new Simulation(state1, { seed });
  const sim2 = new Simulation(state2, { seed });

  const history1 = sim1.run(ticks).map((m) => m.stateHash);
  const history2 = sim2.run(ticks).map((m) => m.stateHash);

  if (history1.length !== history2.length) return false;

  for (let i = 0; i < history1.length; i++) {
    if (history1[i] !== history2[i]) return false;
  }

  return true;
}
