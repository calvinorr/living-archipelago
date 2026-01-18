/**
 * Action Types and Validation
 * Defines what agents can do and validates actions
 */

import type {
  ShipId,
  IslandId,
  GoodId,
  AgentId,
  WorldState,
} from '../../core/types.js';

/**
 * Trade action - buy or sell goods at an island
 */
export interface TradeAction {
  type: 'trade';
  shipId: ShipId;
  islandId: IslandId;
  transactions: Transaction[];
}

export interface Transaction {
  goodId: GoodId;
  quantity: number; // Positive = buy, negative = sell
}

/**
 * Navigate action - send ship to another island
 */
export interface NavigateAction {
  type: 'navigate';
  shipId: ShipId;
  destinationId: IslandId;
}

/**
 * Wait action - ship stays at current location
 */
export interface WaitAction {
  type: 'wait';
  shipId: ShipId;
  ticks: number;
}

/**
 * All possible actions
 */
export type Action = TradeAction | NavigateAction | WaitAction;

/**
 * Result of action execution
 */
export interface ActionResult {
  action: Action;
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Action Validator
 * Validates actions against world state and agent permissions
 */
export class ActionValidator {
  /**
   * Validate a single action
   */
  validate(action: Action, world: WorldState, agentId: AgentId): ValidationResult {
    switch (action.type) {
      case 'trade':
        return this.validateTrade(action, world, agentId);
      case 'navigate':
        return this.validateNavigate(action, world, agentId);
      case 'wait':
        return this.validateWait(action, world, agentId);
      default:
        return { valid: false, errors: ['Unknown action type'] };
    }
  }

  /**
   * Validate multiple actions
   */
  validateAll(
    actions: Action[],
    world: WorldState,
    agentId: AgentId
  ): Map<Action, ValidationResult> {
    const results = new Map<Action, ValidationResult>();

    for (const action of actions) {
      results.set(action, this.validate(action, world, agentId));
    }

    return results;
  }

  private validateTrade(
    action: TradeAction,
    world: WorldState,
    agentId: AgentId
  ): ValidationResult {
    const errors: string[] = [];

    // Check ship exists and is owned
    const ship = world.ships.get(action.shipId);
    if (!ship) {
      errors.push(`Ship ${action.shipId} does not exist`);
      return { valid: false, errors };
    }

    if (ship.ownerId !== agentId) {
      errors.push(`Ship ${action.shipId} is not owned by agent ${agentId}`);
      return { valid: false, errors };
    }

    // Check ship is at the correct island
    if (ship.location.kind !== 'at_island') {
      errors.push(`Ship ${action.shipId} is not at an island`);
      return { valid: false, errors };
    }

    if (ship.location.islandId !== action.islandId) {
      errors.push(
        `Ship ${action.shipId} is at ${ship.location.islandId}, not ${action.islandId}`
      );
      return { valid: false, errors };
    }

    // Check island exists
    const island = world.islands.get(action.islandId);
    if (!island) {
      errors.push(`Island ${action.islandId} does not exist`);
      return { valid: false, errors };
    }

    // Validate each transaction
    let totalCost = 0;
    let volumeChange = 0;

    for (const tx of action.transactions) {
      const good = world.goods.get(tx.goodId);
      if (!good) {
        errors.push(`Good ${tx.goodId} does not exist`);
        continue;
      }

      const price = island.market.prices.get(tx.goodId) ?? 0;

      if (tx.quantity > 0) {
        // Buying
        const available = island.inventory.get(tx.goodId) ?? 0;
        if (tx.quantity > available) {
          errors.push(
            `Not enough ${tx.goodId} at ${action.islandId}: need ${tx.quantity}, have ${available}`
          );
        }
        totalCost += tx.quantity * price;
        volumeChange += tx.quantity * good.bulkiness;
      } else if (tx.quantity < 0) {
        // Selling
        const hasCargo = ship.cargo.get(tx.goodId) ?? 0;
        if (Math.abs(tx.quantity) > hasCargo) {
          errors.push(
            `Not enough ${tx.goodId} in cargo: need ${Math.abs(tx.quantity)}, have ${hasCargo}`
          );
        }
        totalCost -= Math.abs(tx.quantity) * price;
        volumeChange -= Math.abs(tx.quantity) * good.bulkiness;
      }
    }

    // Check cash for purchases
    if (totalCost > ship.cash) {
      errors.push(`Not enough cash: need ${totalCost.toFixed(2)}, have ${ship.cash.toFixed(2)}`);
    }

    // Check cargo capacity
    let currentVolume = 0;
    for (const [goodId, qty] of ship.cargo) {
      const good = world.goods.get(goodId);
      currentVolume += qty * (good?.bulkiness ?? 1);
    }

    if (currentVolume + volumeChange > ship.capacity) {
      errors.push(
        `Exceeds cargo capacity: need ${(currentVolume + volumeChange).toFixed(1)}, have ${ship.capacity}`
      );
    }

    return { valid: errors.length === 0, errors };
  }

  private validateNavigate(
    action: NavigateAction,
    world: WorldState,
    agentId: AgentId
  ): ValidationResult {
    const errors: string[] = [];

    // Check ship exists and is owned
    const ship = world.ships.get(action.shipId);
    if (!ship) {
      errors.push(`Ship ${action.shipId} does not exist`);
      return { valid: false, errors };
    }

    if (ship.ownerId !== agentId) {
      errors.push(`Ship ${action.shipId} is not owned by agent ${agentId}`);
      return { valid: false, errors };
    }

    // Check ship is at an island (not already at sea)
    if (ship.location.kind !== 'at_island') {
      errors.push(`Ship ${action.shipId} is already at sea`);
      return { valid: false, errors };
    }

    // Check destination exists
    if (!world.islands.has(action.destinationId)) {
      errors.push(`Destination ${action.destinationId} does not exist`);
      return { valid: false, errors };
    }

    // Check not navigating to current location
    if (ship.location.islandId === action.destinationId) {
      errors.push(`Ship ${action.shipId} is already at ${action.destinationId}`);
      return { valid: false, errors };
    }

    return { valid: errors.length === 0, errors };
  }

  private validateWait(
    action: WaitAction,
    world: WorldState,
    agentId: AgentId
  ): ValidationResult {
    const errors: string[] = [];

    // Check ship exists and is owned
    const ship = world.ships.get(action.shipId);
    if (!ship) {
      errors.push(`Ship ${action.shipId} does not exist`);
      return { valid: false, errors };
    }

    if (ship.ownerId !== agentId) {
      errors.push(`Ship ${action.shipId} is not owned by agent ${agentId}`);
      return { valid: false, errors };
    }

    // Check ticks is reasonable
    if (action.ticks < 1 || action.ticks > 168) {
      errors.push(`Wait ticks must be between 1 and 168 (one week)`);
      return { valid: false, errors };
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Create actions from simple parameters
 */
export function createTradeAction(
  shipId: ShipId,
  islandId: IslandId,
  transactions: Array<{ goodId: GoodId; quantity: number }>
): TradeAction {
  return {
    type: 'trade',
    shipId,
    islandId,
    transactions,
  };
}

export function createNavigateAction(
  shipId: ShipId,
  destinationId: IslandId
): NavigateAction {
  return {
    type: 'navigate',
    shipId,
    destinationId,
  };
}

export function createWaitAction(shipId: ShipId, ticks: number = 1): WaitAction {
  return {
    type: 'wait',
    shipId,
    ticks,
  };
}
