/**
 * Observable State Interface
 * Defines what agents can see of the world
 */

import type {
  IslandId,
  ShipId,
  GoodId,
  AgentId,
  AgentType,
  WorldState,
  WorldEvent,
  Vector2,
} from '../../core/types.js';

/**
 * Visibility configuration per agent type
 */
export interface VisibilityConfig {
  /** Can see all island prices */
  seeAllPrices: boolean;
  /** Inventory visibility: 'none', 'at_location', 'own_island', 'all' */
  seeInventory: 'none' | 'at_location' | 'own_island' | 'all';
  /** Ecosystem visibility: 'none', 'indicators', 'full' */
  seeEcosystem: 'none' | 'indicators' | 'full';
  /** Population visibility: 'none', 'indicators', 'full' */
  seePopulation: 'none' | 'indicators' | 'full';
  /** Can see other agents' ships */
  seeOtherShips: boolean;
  /** Can see events affecting other islands */
  seeGlobalEvents: boolean;
}

/**
 * Observable island (filtered view)
 */
export interface ObservableIsland {
  id: IslandId;
  name: string;
  position: Vector2;

  /** Market prices (always visible for traders) */
  prices: Map<GoodId, number>;
  /** Price history (last N ticks) */
  priceHistory: Map<GoodId, number[]>;
  /** Price momentum (direction of change) */
  priceMomentum: Map<GoodId, number>;

  /** Inventory (visibility depends on agent type/location) */
  inventory?: Map<GoodId, number>;

  /** Ecosystem indicators (may be estimates) */
  ecosystemIndicators?: {
    fishHealth: number; // 0-1
    forestHealth: number; // 0-1
    soilHealth: number; // 0-1
  };

  /** Population indicators (may be approximate) */
  populationIndicators?: {
    size: number;
    health: number;
    dominantSector: string;
  };
}

/**
 * Observable ship (filtered view)
 */
export interface ObservableShip {
  id: ShipId;
  name: string;
  ownerId: AgentId;
  isOwned: boolean; // Is this agent's ship

  capacity: number;
  speed: number;
  cash: number;
  cargo: Map<GoodId, number>;
  cargoVolume: number;
  remainingCapacity: number;

  location: {
    kind: 'at_island' | 'at_sea';
    islandId?: IslandId;
    destination?: IslandId;
    etaHours?: number;
    progress?: number;
  };
}

/**
 * Observable event
 */
export interface ObservableEvent {
  id: string;
  type: string;
  target: string;
  remainingHours: number;
  isNew: boolean; // Started this tick
  affectsAgent: boolean; // Directly affects this agent
}

/**
 * Agent's view of itself
 */
export interface SelfView {
  id: AgentId;
  type: AgentType;
  name: string;
  cash: number;
  shipIds: ShipId[];
  currentPlan: {
    summary: string;
    status: string;
    currentStep: number;
    totalSteps: number;
  } | null;
  lastReasoningTick: number;
}

/**
 * Complete observable state for an agent
 */
export interface ObservableState {
  /** Current simulation tick */
  tick: number;
  /** Game time */
  gameTime: {
    hour: number;
    day: number;
  };

  /** Islands visible to this agent */
  islands: Map<IslandId, ObservableIsland>;

  /** Ships the agent can see */
  ships: Map<ShipId, ObservableShip>;

  /** Events the agent is aware of */
  events: ObservableEvent[];

  /** Agent's view of itself */
  self: SelfView;

  /** Summary metrics for quick decisions */
  metrics: {
    /** Best arbitrage opportunity */
    bestArbitrage?: {
      goodId: GoodId;
      fromIsland: IslandId;
      toIsland: IslandId;
      priceDiff: number;
      margin: number;
    };
    /** Islands with warnings */
    islandWarnings: Array<{
      islandId: IslandId;
      warning: string;
    }>;
  };
}

/**
 * Build observable state from world state for a specific agent
 */
export class ObservableBuilder {
  private priceHistoryLength = 24; // Keep 24 hours of history
  private priceHistories: Map<IslandId, Map<GoodId, number[]>> = new Map();

  /**
   * Get visibility config for agent type
   */
  getVisibilityConfig(type: AgentType): VisibilityConfig {
    switch (type) {
      case 'trader':
        return {
          seeAllPrices: true,
          seeInventory: 'at_location',
          seeEcosystem: 'indicators',
          seePopulation: 'indicators',
          seeOtherShips: true,
          seeGlobalEvents: true,
        };
      case 'governor':
        return {
          seeAllPrices: true,
          seeInventory: 'own_island',
          seeEcosystem: 'full',
          seePopulation: 'full',
          seeOtherShips: true,
          seeGlobalEvents: true,
        };
      case 'population':
        return {
          seeAllPrices: false, // Only local prices
          seeInventory: 'none',
          seeEcosystem: 'indicators',
          seePopulation: 'indicators',
          seeOtherShips: false,
          seeGlobalEvents: false,
        };
      case 'player':
        return {
          seeAllPrices: true,
          seeInventory: 'at_location',
          seeEcosystem: 'indicators',
          seePopulation: 'indicators',
          seeOtherShips: true,
          seeGlobalEvents: true,
        };
      default:
        return {
          seeAllPrices: false,
          seeInventory: 'none',
          seeEcosystem: 'none',
          seePopulation: 'none',
          seeOtherShips: false,
          seeGlobalEvents: false,
        };
    }
  }

  /**
   * Build observable state for an agent
   */
  build(
    world: WorldState,
    agentId: AgentId,
    agentType: AgentType,
    agentName: string,
    memory: import('./agent.js').AgentMemory
  ): ObservableState {
    const config = this.getVisibilityConfig(agentType);
    const agent = world.agents.get(agentId);

    // Get agent's ship locations for "at_location" visibility
    const agentShipLocations = new Set<IslandId>();
    for (const ship of world.ships.values()) {
      if (ship.ownerId === agentId && ship.location.kind === 'at_island') {
        agentShipLocations.add(ship.location.islandId);
      }
    }

    // Build islands
    const islands = this.buildIslands(world, config, agentShipLocations);

    // Build ships
    const ships = this.buildShips(world, agentId, config);

    // Build events
    const events = this.buildEvents(world, agentId, config);

    // Build self view
    const self = this.buildSelfView(agentId, agentType, agentName, agent, memory);

    // Build metrics
    const metrics = this.buildMetrics(islands, world);

    // Update price histories
    this.updatePriceHistories(world);

    return {
      tick: world.tick,
      gameTime: {
        hour: world.gameTime.gameHour,
        day: world.gameTime.gameDay,
      },
      islands,
      ships,
      events,
      self,
      metrics,
    };
  }

  private buildIslands(
    world: WorldState,
    config: VisibilityConfig,
    agentLocations: Set<IslandId>
  ): Map<IslandId, ObservableIsland> {
    const result = new Map<IslandId, ObservableIsland>();

    for (const [islandId, island] of world.islands) {
      const observable: ObservableIsland = {
        id: islandId,
        name: island.name,
        position: { ...island.position },
        prices: new Map(island.market.prices),
        priceHistory: this.getPriceHistory(islandId),
        priceMomentum: new Map(island.market.momentum),
      };

      // Add inventory based on visibility
      if (
        config.seeInventory === 'all' ||
        (config.seeInventory === 'at_location' && agentLocations.has(islandId))
      ) {
        observable.inventory = new Map(island.inventory);
      }

      // Add ecosystem indicators
      if (config.seeEcosystem !== 'none') {
        observable.ecosystemIndicators = {
          fishHealth: island.ecosystem.fishStock / island.ecosystemParams.fishCapacity,
          forestHealth: island.ecosystem.forestBiomass / island.ecosystemParams.forestCapacity,
          soilHealth: island.ecosystem.soilFertility,
        };
      }

      // Add population indicators
      if (config.seePopulation !== 'none') {
        const labour = island.population.labour;
        let dominantSector = 'services';
        let maxShare = 0;
        for (const [sector, share] of Object.entries(labour)) {
          if (share > maxShare) {
            maxShare = share;
            dominantSector = sector;
          }
        }

        observable.populationIndicators = {
          size: Math.round(island.population.size),
          health: island.population.health,
          dominantSector,
        };
      }

      result.set(islandId, observable);
    }

    return result;
  }

  private buildShips(
    world: WorldState,
    agentId: AgentId,
    config: VisibilityConfig
  ): Map<ShipId, ObservableShip> {
    const result = new Map<ShipId, ObservableShip>();

    for (const [shipId, ship] of world.ships) {
      const isOwned = ship.ownerId === agentId;

      // Skip other ships if not visible
      if (!isOwned && !config.seeOtherShips) {
        continue;
      }

      let cargoVolume = 0;
      for (const [goodId, qty] of ship.cargo) {
        const good = world.goods.get(goodId);
        cargoVolume += qty * (good?.bulkiness ?? 1);
      }

      const observable: ObservableShip = {
        id: shipId,
        name: ship.name,
        ownerId: ship.ownerId,
        isOwned,
        capacity: ship.capacity,
        speed: ship.speed,
        cash: ship.cash,
        cargo: new Map(ship.cargo),
        cargoVolume,
        remainingCapacity: ship.capacity - cargoVolume,
        location:
          ship.location.kind === 'at_island'
            ? { kind: 'at_island', islandId: ship.location.islandId }
            : {
                kind: 'at_sea',
                destination: ship.location.route.toIslandId,
                etaHours: ship.location.route.etaHours,
                progress: ship.location.route.progress,
              },
      };

      result.set(shipId, observable);
    }

    return result;
  }

  private buildEvents(
    world: WorldState,
    agentId: AgentId,
    config: VisibilityConfig
  ): ObservableEvent[] {
    const result: ObservableEvent[] = [];

    for (const event of world.events) {
      // Skip if event is not active
      if (event.startTick > world.tick || event.endTick <= world.tick) {
        continue;
      }

      // Check visibility
      const affectsAgent = this.eventAffectsAgent(event, agentId, world);

      if (!config.seeGlobalEvents && !affectsAgent) {
        continue;
      }

      result.push({
        id: event.id,
        type: event.type,
        target: event.targetId,
        remainingHours: event.endTick - world.tick,
        isNew: event.startTick === world.tick,
        affectsAgent,
      });
    }

    return result;
  }

  private eventAffectsAgent(
    event: WorldEvent,
    agentId: AgentId,
    world: WorldState
  ): boolean {
    if (event.targetId === 'global') return true;

    // Check if agent has ships at affected island
    for (const ship of world.ships.values()) {
      if (ship.ownerId === agentId) {
        if (
          ship.location.kind === 'at_island' &&
          ship.location.islandId === event.targetId
        ) {
          return true;
        }
        if (
          ship.location.kind === 'at_sea' &&
          (ship.location.route.fromIslandId === event.targetId ||
            ship.location.route.toIslandId === event.targetId)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private buildSelfView(
    agentId: AgentId,
    agentType: AgentType,
    agentName: string,
    agent: import('../../core/types.js').AgentState | undefined,
    memory: import('./agent.js').AgentMemory
  ): SelfView {
    return {
      id: agentId,
      type: agentType,
      name: agentName,
      cash: agent?.assets.cash ?? 0,
      shipIds: agent?.assets.shipIds ?? [],
      currentPlan: memory.currentPlan
        ? {
            summary: memory.currentPlan.summary,
            status: memory.currentPlan.status,
            currentStep: memory.currentPlan.currentStep,
            totalSteps: memory.currentPlan.steps.length,
          }
        : null,
      lastReasoningTick: memory.lastReasoningTick,
    };
  }

  private buildMetrics(
    islands: Map<IslandId, ObservableIsland>,
    world: WorldState
  ): ObservableState['metrics'] {
    const metrics: ObservableState['metrics'] = {
      islandWarnings: [],
    };

    // Find best arbitrage opportunity
    let bestArbitrage: ObservableState['metrics']['bestArbitrage'];
    let bestMargin = 0;

    const islandList = Array.from(islands.values());
    const goodIds = Array.from(world.goods.keys());

    for (const goodId of goodIds) {
      for (const from of islandList) {
        for (const to of islandList) {
          if (from.id === to.id) continue;

          const fromPrice = from.prices.get(goodId) ?? 0;
          const toPrice = to.prices.get(goodId) ?? 0;

          if (fromPrice > 0 && toPrice > fromPrice) {
            const margin = (toPrice - fromPrice) / fromPrice;
            if (margin > bestMargin) {
              bestMargin = margin;
              bestArbitrage = {
                goodId,
                fromIsland: from.id,
                toIsland: to.id,
                priceDiff: toPrice - fromPrice,
                margin,
              };
            }
          }
        }
      }
    }

    if (bestArbitrage) {
      metrics.bestArbitrage = bestArbitrage;
    }

    // Check for island warnings
    for (const island of islands.values()) {
      if (island.populationIndicators && island.populationIndicators.health < 0.3) {
        metrics.islandWarnings.push({
          islandId: island.id,
          warning: 'Low population health',
        });
      }
      if (island.ecosystemIndicators && island.ecosystemIndicators.fishHealth < 0.2) {
        metrics.islandWarnings.push({
          islandId: island.id,
          warning: 'Fish stock critically low',
        });
      }
    }

    return metrics;
  }

  private getPriceHistory(islandId: IslandId): Map<GoodId, number[]> {
    return this.priceHistories.get(islandId) ?? new Map();
  }

  private updatePriceHistories(world: WorldState): void {
    for (const [islandId, island] of world.islands) {
      let islandHistory = this.priceHistories.get(islandId);
      if (!islandHistory) {
        islandHistory = new Map();
        this.priceHistories.set(islandId, islandHistory);
      }

      for (const [goodId, price] of island.market.prices) {
        let goodHistory = islandHistory.get(goodId);
        if (!goodHistory) {
          goodHistory = [];
          islandHistory.set(goodId, goodHistory);
        }

        goodHistory.push(price);
        if (goodHistory.length > this.priceHistoryLength) {
          goodHistory.shift();
        }
      }
    }
  }
}
