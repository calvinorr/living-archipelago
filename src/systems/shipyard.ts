/**
 * Shipyard System
 * Handles ship construction and build order management
 */

import type {
  WorldState,
  IslandState,
  ShipyardState,
  ShipBuildOrder,
  ShipBlueprint,
  ShipState,
  AgentId,
  ShipId,
  IslandId,
  ShipyardId,
  BuildOrderId,
  CrewState,
} from '../core/types.js';

// ============================================================================
// Ship Blueprints
// ============================================================================

/**
 * Default ship blueprints available for construction
 */
export const DEFAULT_BLUEPRINTS: Map<string, ShipBlueprint> = new Map([
  [
    'sloop',
    {
      id: 'sloop',
      name: 'Sloop',
      description: 'A small, fast trading vessel',
      capacity: 80,
      speed: 12,
      timberCost: 50,
      toolsCost: 20,
      coinCost: 100,
      buildTicks: 48, // 2 game days (48 hours)
    },
  ],
  [
    'merchantman',
    {
      id: 'merchantman',
      name: 'Merchantman',
      description: 'A large cargo vessel with substantial hold',
      capacity: 200,
      speed: 8,
      timberCost: 120,
      toolsCost: 50,
      coinCost: 300,
      buildTicks: 120, // 5 game days
    },
  ],
  [
    'cutter',
    {
      id: 'cutter',
      name: 'Cutter',
      description: 'A swift vessel for urgent deliveries',
      capacity: 40,
      speed: 18,
      timberCost: 30,
      toolsCost: 15,
      coinCost: 80,
      buildTicks: 24, // 1 game day
    },
  ],
]);

// ============================================================================
// Build Order Management
// ============================================================================

/**
 * Result of attempting to start a build order
 */
export interface StartBuildResult {
  success: boolean;
  error?: string;
  order?: ShipBuildOrder;
}

/**
 * Result of processing shipyard for one tick
 */
export interface ShipyardTickResult {
  /** Updated shipyard state */
  newShipyard: ShipyardState;
  /** Updated island state (with resources deducted) */
  newIsland: IslandState;
  /** Newly created ship if one was completed */
  completedShip: ShipState | null;
  /** Build progress made this tick (0-1) */
  progressMade: number;
}

/**
 * Generate a unique build order ID
 */
let buildOrderCounter = 0;
export function generateBuildOrderId(): BuildOrderId {
  return `build-${++buildOrderCounter}-${Date.now()}`;
}

/**
 * Generate a unique ship ID
 */
let shipCounter = 100; // Start high to avoid collision with MVP ships
export function generateShipId(): ShipId {
  return `ship-${++shipCounter}`;
}

/**
 * Check if an island has enough resources to start a build
 */
export function canAffordBuild(
  island: IslandState,
  blueprint: ShipBlueprint,
  agentCash: number
): { canAfford: boolean; missing: string[] } {
  const missing: string[] = [];

  const timber = island.inventory.get('timber') ?? 0;
  const tools = island.inventory.get('tools') ?? 0;

  if (timber < blueprint.timberCost) {
    missing.push(`Timber (need ${blueprint.timberCost}, have ${Math.floor(timber)})`);
  }
  if (tools < blueprint.toolsCost) {
    missing.push(`Tools (need ${blueprint.toolsCost}, have ${Math.floor(tools)})`);
  }
  if (agentCash < blueprint.coinCost) {
    missing.push(`Coins (need ${blueprint.coinCost}, have ${Math.floor(agentCash)})`);
  }

  return { canAfford: missing.length === 0, missing };
}

/**
 * Start a new ship build order at a shipyard
 */
export function startBuildOrder(
  shipyard: ShipyardState,
  island: IslandState,
  blueprintId: string,
  shipName: string,
  ownerId: AgentId,
  agentCash: number,
  currentTick: number,
  blueprints: Map<string, ShipBlueprint> = DEFAULT_BLUEPRINTS
): StartBuildResult & { newIsland?: IslandState; newAgentCash?: number } {
  // Check if shipyard is busy
  if (shipyard.currentOrder !== null) {
    return {
      success: false,
      error: 'Shipyard is already building a ship',
    };
  }

  // Get blueprint
  const blueprint = blueprints.get(blueprintId);
  if (!blueprint) {
    return {
      success: false,
      error: `Unknown blueprint: ${blueprintId}`,
    };
  }

  // Check resources
  const affordCheck = canAffordBuild(island, blueprint, agentCash);
  if (!affordCheck.canAfford) {
    return {
      success: false,
      error: `Insufficient resources: ${affordCheck.missing.join(', ')}`,
    };
  }

  // Deduct resources from island
  const newInventory = new Map(island.inventory);
  newInventory.set('timber', (newInventory.get('timber') ?? 0) - blueprint.timberCost);
  newInventory.set('tools', (newInventory.get('tools') ?? 0) - blueprint.toolsCost);

  const newIsland: IslandState = {
    ...island,
    inventory: newInventory,
  };

  // Deduct coins from agent
  const newAgentCash = agentCash - blueprint.coinCost;

  // Create build order
  const order: ShipBuildOrder = {
    id: generateBuildOrderId(),
    blueprintId,
    shipName,
    ownerId,
    startTick: currentTick,
    completionTick: currentTick + blueprint.buildTicks,
    progress: 0,
  };

  return {
    success: true,
    order,
    newIsland,
    newAgentCash,
  };
}

/**
 * Cancel a build order (partial resource refund)
 */
export function cancelBuildOrder(
  shipyard: ShipyardState,
  island: IslandState,
  blueprints: Map<string, ShipBlueprint> = DEFAULT_BLUEPRINTS
): { newShipyard: ShipyardState; newIsland: IslandState; refundedCoins: number } {
  const order = shipyard.currentOrder;
  if (!order) {
    return { newShipyard: shipyard, newIsland: island, refundedCoins: 0 };
  }

  const blueprint = blueprints.get(order.blueprintId);
  if (!blueprint) {
    return { newShipyard: shipyard, newIsland: island, refundedCoins: 0 };
  }

  // Refund proportional to remaining progress (but at 50% rate)
  const remainingProgress = 1 - order.progress;
  const refundRate = 0.5;

  const timberRefund = Math.floor(blueprint.timberCost * remainingProgress * refundRate);
  const toolsRefund = Math.floor(blueprint.toolsCost * remainingProgress * refundRate);
  const coinRefund = Math.floor(blueprint.coinCost * remainingProgress * refundRate);

  const newInventory = new Map(island.inventory);
  newInventory.set('timber', (newInventory.get('timber') ?? 0) + timberRefund);
  newInventory.set('tools', (newInventory.get('tools') ?? 0) + toolsRefund);

  return {
    newShipyard: { ...shipyard, currentOrder: null },
    newIsland: { ...island, inventory: newInventory },
    refundedCoins: coinRefund,
  };
}

// ============================================================================
// Tick Processing
// ============================================================================

/**
 * Create default crew state for a new ship
 */
function createDefaultCrew(capacity: number, baseWageRate: number = 0.5): CrewState {
  // Crew capacity scales with ship cargo capacity
  const crewCapacity = Math.max(5, Math.floor(capacity / 10));
  return {
    count: crewCapacity, // Start fully crewed
    capacity: crewCapacity,
    morale: 0.8, // Start with good morale
    wageRate: baseWageRate,
    unpaidTicks: 0,
  };
}

/**
 * Create a new ship from a completed build order
 */
function createShipFromOrder(
  order: ShipBuildOrder,
  shipyard: ShipyardState,
  blueprints: Map<string, ShipBlueprint>
): ShipState | null {
  const blueprint = blueprints.get(order.blueprintId);
  if (!blueprint) return null;

  const shipId = generateShipId();

  return {
    id: shipId,
    name: order.shipName,
    ownerId: order.ownerId,
    capacity: blueprint.capacity,
    speed: blueprint.speed,
    cash: 0,
    cargo: new Map(),
    location: { kind: 'at_island', islandId: shipyard.islandId },
    cumulativeTransportCosts: 0,
    crew: createDefaultCrew(blueprint.capacity),
    condition: 1.0, // New ships start at full condition
    totalDistanceTraveled: 0,
  };
}

/**
 * Process one tick of shipyard activity
 */
export function updateShipyard(
  shipyard: ShipyardState,
  island: IslandState,
  currentTick: number,
  dt: number = 1,
  blueprints: Map<string, ShipBlueprint> = DEFAULT_BLUEPRINTS
): ShipyardTickResult {
  // If no current order, nothing to do
  if (!shipyard.currentOrder) {
    return {
      newShipyard: shipyard,
      newIsland: island,
      completedShip: null,
      progressMade: 0,
    };
  }

  const order = shipyard.currentOrder;
  const blueprint = blueprints.get(order.blueprintId);

  if (!blueprint) {
    // Invalid blueprint, cancel order
    return {
      newShipyard: { ...shipyard, currentOrder: null },
      newIsland: island,
      completedShip: null,
      progressMade: 0,
    };
  }

  // Calculate progress
  const progressPerTick = 1 / blueprint.buildTicks;
  const newProgress = Math.min(1, order.progress + progressPerTick * dt);

  // Check if build is complete
  if (newProgress >= 1 || currentTick >= order.completionTick) {
    // Build complete - create ship
    const completedShip = createShipFromOrder(order, shipyard, blueprints);

    const newShipyard: ShipyardState = {
      ...shipyard,
      currentOrder: null,
      completedShips: completedShip
        ? [...shipyard.completedShips, completedShip.id]
        : shipyard.completedShips,
      totalShipsBuilt: shipyard.totalShipsBuilt + (completedShip ? 1 : 0),
    };

    return {
      newShipyard,
      newIsland: island,
      completedShip,
      progressMade: 1 - order.progress,
    };
  }

  // Update order progress
  const updatedOrder: ShipBuildOrder = {
    ...order,
    progress: newProgress,
  };

  return {
    newShipyard: { ...shipyard, currentOrder: updatedOrder },
    newIsland: island,
    completedShip: null,
    progressMade: progressPerTick * dt,
  };
}

/**
 * Process all shipyards for one tick
 */
export function updateAllShipyards(
  state: WorldState,
  dt: number = 1,
  blueprints: Map<string, ShipBlueprint> = DEFAULT_BLUEPRINTS
): {
  newShipyards: Map<ShipyardId, ShipyardState>;
  newIslands: Map<IslandId, IslandState>;
  newShips: Map<ShipId, ShipState>;
  completions: Array<{ shipyardId: ShipyardId; shipId: ShipId; shipName: string }>;
} {
  const newShipyards = new Map(state.shipyards);
  const newIslands = new Map(state.islands);
  const newShips = new Map(state.ships);
  const completions: Array<{ shipyardId: ShipyardId; shipId: ShipId; shipName: string }> = [];

  for (const [shipyardId, shipyard] of state.shipyards) {
    const island = newIslands.get(shipyard.islandId);
    if (!island) continue;

    const result = updateShipyard(shipyard, island, state.tick, dt, blueprints);

    newShipyards.set(shipyardId, result.newShipyard);
    newIslands.set(shipyard.islandId, result.newIsland);

    if (result.completedShip) {
      newShips.set(result.completedShip.id, result.completedShip);
      completions.push({
        shipyardId,
        shipId: result.completedShip.id,
        shipName: result.completedShip.name,
      });

      // Also update the agent's ship list
      const agent = state.agents.get(result.completedShip.ownerId);
      if (agent) {
        // Note: Agent update should be handled in the simulation loop
        // This function only returns the new ship
      }
    }
  }

  return { newShipyards, newIslands, newShips, completions };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the estimated completion time in game hours
 */
export function getEstimatedCompletion(
  order: ShipBuildOrder,
  currentTick: number
): { ticksRemaining: number; hoursRemaining: number; daysRemaining: number } {
  const ticksRemaining = Math.max(0, order.completionTick - currentTick);
  return {
    ticksRemaining,
    hoursRemaining: ticksRemaining,
    daysRemaining: ticksRemaining / 24,
  };
}

/**
 * Get shipyard status summary
 */
export function getShipyardStatus(shipyard: ShipyardState, currentTick: number): {
  isBuilding: boolean;
  currentBuild: {
    shipName: string;
    blueprintId: string;
    progress: number;
    ticksRemaining: number;
  } | null;
  completedShipsCount: number;
  totalBuilt: number;
} {
  const isBuilding = shipyard.currentOrder !== null;
  let currentBuild = null;

  if (shipyard.currentOrder) {
    const order = shipyard.currentOrder;
    currentBuild = {
      shipName: order.shipName,
      blueprintId: order.blueprintId,
      progress: order.progress,
      ticksRemaining: Math.max(0, order.completionTick - currentTick),
    };
  }

  return {
    isBuilding,
    currentBuild,
    completedShipsCount: shipyard.completedShips.length,
    totalBuilt: shipyard.totalShipsBuilt,
  };
}

/**
 * Create initial shipyard for an island
 */
export function createShipyard(islandId: IslandId, name: string): ShipyardState {
  return {
    id: `shipyard-${islandId}`,
    islandId,
    name,
    currentOrder: null,
    completedShips: [],
    totalShipsBuilt: 0,
  };
}
