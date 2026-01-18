/**
 * Rule-Based Executor
 * Tactical decision-making based on strategy from LLM
 */

import type { GoodId, IslandId } from '../../core/types.js';
import type {
  ObservableState,
  ObservableShip,
  ObservableIsland,
} from '../interfaces/observable.js';
import type { Action, Transaction } from '../interfaces/action.js';
import { createTradeAction, createNavigateAction, createWaitAction } from '../interfaces/action.js';
import type { Strategy, TraderMemory } from './memory.js';

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Fraction of cash to keep in reserve */
  cashReserve: number;
  /** Minimum profit margin to execute trade */
  minProfitMargin: number;
  /** Maximum fraction of cargo to fill per trade */
  maxCargoFill: number;
  /** Prefer selling cargo before buying more */
  sellFirst: boolean;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  cashReserve: 0.1, // Keep 10% cash reserve
  minProfitMargin: 0.1, // 10% minimum
  maxCargoFill: 0.8, // Fill 80% of capacity max
  sellFirst: true,
};

/**
 * Decision made by the executor
 */
export interface ExecutorDecision {
  actions: Action[];
  reasoning: string;
  nextGoal?: string;
}

/**
 * Rule-Based Executor
 * Converts high-level strategy into concrete actions
 */
export class Executor {
  private config: ExecutorConfig;

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the current strategy for this tick
   */
  execute(
    strategy: Strategy | null,
    observation: ObservableState,
    memory: TraderMemory
  ): ExecutorDecision {
    const actions: Action[] = [];
    const reasoning: string[] = [];

    // Get owned ships
    const ownedShips = Array.from(observation.ships.values()).filter((s) => s.isOwned);

    if (ownedShips.length === 0) {
      return { actions: [], reasoning: 'No ships to command' };
    }

    // Process each ship
    for (const ship of ownedShips) {
      const shipDecision = this.processShip(ship, strategy, observation, memory);
      actions.push(...shipDecision.actions);
      if (shipDecision.reasoning) {
        reasoning.push(`${ship.name}: ${shipDecision.reasoning}`);
      }
    }

    return {
      actions,
      reasoning: reasoning.join('; ') || 'No actions needed',
      nextGoal: this.determineNextGoal(strategy, observation),
    };
  }

  /**
   * Process a single ship
   */
  private processShip(
    ship: ObservableShip,
    strategy: Strategy | null,
    observation: ObservableState,
    _memory: TraderMemory
  ): ExecutorDecision {
    // Ship at sea - nothing to do
    if (ship.location.kind === 'at_sea') {
      return { actions: [], reasoning: 'In transit' };
    }

    const islandId = ship.location.islandId!;
    const island = observation.islands.get(islandId);

    if (!island) {
      return { actions: [], reasoning: 'Island not found' };
    }

    const actions: Action[] = [];
    const reasoning: string[] = [];

    // 1. Sell cargo if profitable or if at destination
    if (this.config.sellFirst && ship.cargo.size > 0) {
      const sellAction = this.createSellAction(ship, island, strategy, observation);
      if (sellAction) {
        actions.push(sellAction);
        reasoning.push('Selling cargo');
      }
    }

    // 2. Buy goods if at a source location
    const buyAction = this.createBuyAction(ship, island, strategy, observation);
    if (buyAction) {
      actions.push(buyAction);
      reasoning.push('Buying goods');
    }

    // 3. Navigate if we have a destination
    const navAction = this.createNavigateAction(ship, islandId, strategy, observation);
    if (navAction) {
      actions.push(navAction);
      reasoning.push('Setting sail');
    }

    // 4. If nothing to do, wait
    if (actions.length === 0) {
      actions.push(createWaitAction(ship.id, 1));
      reasoning.push('Waiting for opportunity');
    }

    return {
      actions,
      reasoning: reasoning.join(', '),
    };
  }

  /**
   * Create sell transactions for current cargo
   */
  private createSellAction(
    ship: ObservableShip,
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState
  ): Action | null {
    const transactions: Transaction[] = [];

    for (const [goodId, quantity] of ship.cargo) {
      if (quantity <= 0) continue;

      const price = island.prices.get(goodId);
      if (!price) continue;

      // Check if this is a good place to sell
      const shouldSell = this.shouldSell(goodId, island, strategy, observation);
      if (shouldSell) {
        transactions.push({
          goodId,
          quantity: -quantity, // Negative = sell
        });
      }
    }

    if (transactions.length === 0) return null;

    return createTradeAction(ship.id, island.id, transactions);
  }

  /**
   * Determine if we should sell a good at this island
   */
  private shouldSell(
    goodId: GoodId,
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState
  ): boolean {
    const price = island.prices.get(goodId) ?? 0;
    if (price <= 0) return false;

    // Check if this is a destination in our strategy
    if (strategy) {
      const isDestination = strategy.targetRoutes.some(
        (r) => r.to === island.id && r.goods.includes(goodId)
      );
      if (isDestination) return true;
    }

    // Check if price is above average across islands
    const prices: number[] = [];
    for (const i of observation.islands.values()) {
      const p = i.prices.get(goodId);
      if (p && p > 0) prices.push(p);
    }

    if (prices.length < 2) return true; // Only option

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const margin = (price - avgPrice) / avgPrice;

    return margin >= this.config.minProfitMargin;
  }

  /**
   * Create buy transactions based on strategy
   */
  private createBuyAction(
    ship: ObservableShip,
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState
  ): Action | null {
    // Check if we have space
    if (ship.remainingCapacity <= 0) return null;

    // Check if we have cash
    const availableCash = ship.cash * (1 - this.config.cashReserve);
    if (availableCash <= 0) return null;

    const transactions: Transaction[] = [];

    // Find goods to buy based on strategy
    const goodsToBuy = this.findGoodsToBuy(island, strategy, observation);

    for (const { goodId, quantity } of goodsToBuy) {
      const price = island.prices.get(goodId) ?? 0;
      if (price <= 0) continue;

      // Check inventory
      const available = island.inventory?.get(goodId) ?? 0;
      if (available <= 0) continue;

      // Calculate how much we can buy
      const maxBySpace = Math.floor(ship.remainingCapacity); // Assume bulkiness = 1
      const maxByCash = Math.floor(availableCash / price);
      const maxByInventory = available;
      const maxByCapacity = Math.floor(ship.capacity * this.config.maxCargoFill);

      const buyQuantity = Math.min(quantity, maxBySpace, maxByCash, maxByInventory, maxByCapacity);

      if (buyQuantity > 0) {
        transactions.push({
          goodId,
          quantity: buyQuantity,
        });
      }
    }

    if (transactions.length === 0) return null;

    return createTradeAction(ship.id, island.id, transactions);
  }

  /**
   * Find goods to buy based on strategy and market conditions
   */
  private findGoodsToBuy(
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState
  ): Array<{ goodId: GoodId; quantity: number }> {
    const result: Array<{ goodId: GoodId; quantity: number; score: number }> = [];

    // Check strategy routes
    if (strategy) {
      for (const route of strategy.targetRoutes) {
        if (route.from !== island.id) continue;

        for (const goodId of route.goods) {
          const buyPrice = island.prices.get(goodId) ?? 0;
          const destIsland = observation.islands.get(route.to);
          const sellPrice = destIsland?.prices.get(goodId) ?? 0;

          if (buyPrice > 0 && sellPrice > buyPrice) {
            const margin = (sellPrice - buyPrice) / buyPrice;
            if (margin >= this.config.minProfitMargin) {
              result.push({
                goodId,
                quantity: 100, // Base quantity, limited by constraints
                score: margin * route.priority,
              });
            }
          }
        }
      }
    }

    // If no strategy goods, use best arbitrage
    if (result.length === 0 && observation.metrics.bestArbitrage) {
      const arb = observation.metrics.bestArbitrage;
      if (arb.fromIsland === island.id) {
        result.push({
          goodId: arb.goodId,
          quantity: 50,
          score: arb.margin,
        });
      }
    }

    // Sort by score and return
    return result.sort((a, b) => b.score - a.score).map(({ goodId, quantity }) => ({ goodId, quantity }));
  }

  /**
   * Create navigation action based on strategy
   */
  private createNavigateAction(
    ship: ObservableShip,
    currentIsland: IslandId,
    strategy: Strategy | null,
    observation: ObservableState
  ): Action | null {
    // Don't navigate if we have cargo to sell here
    if (ship.cargo.size > 0) {
      const island = observation.islands.get(currentIsland);
      if (island) {
        for (const [goodId, qty] of ship.cargo) {
          if (qty > 0 && this.shouldSell(goodId, island, strategy, observation)) {
            return null; // Stay to sell
          }
        }
      }
    }

    // Find destination from strategy
    const destination = this.findDestination(ship, currentIsland, strategy, observation);

    if (destination && destination !== currentIsland) {
      return createNavigateAction(ship.id, destination);
    }

    return null;
  }

  /**
   * Find best destination for ship
   */
  private findDestination(
    ship: ObservableShip,
    currentIsland: IslandId,
    strategy: Strategy | null,
    observation: ObservableState
  ): IslandId | null {
    // If we have cargo, go to sell destination
    if (ship.cargo.size > 0) {
      for (const [goodId] of ship.cargo) {
        // Check strategy routes
        if (strategy) {
          for (const route of strategy.targetRoutes) {
            if (route.goods.includes(goodId) && route.to !== currentIsland) {
              return route.to;
            }
          }
        }

        // Find best selling location
        let bestIsland: IslandId | null = null;
        let bestPrice = 0;

        for (const [islandId, island] of observation.islands) {
          if (islandId === currentIsland) continue;
          const price = island.prices.get(goodId) ?? 0;
          if (price > bestPrice) {
            bestPrice = price;
            bestIsland = islandId;
          }
        }

        if (bestIsland) return bestIsland;
      }
    }

    // If empty, go to buy location from strategy
    if (strategy && strategy.targetRoutes.length > 0) {
      const topRoute = strategy.targetRoutes[0];
      if (topRoute.from !== currentIsland) {
        return topRoute.from;
      } else if (topRoute.to !== currentIsland) {
        return topRoute.to;
      }
    }

    // Fallback: go to best arbitrage source
    if (observation.metrics.bestArbitrage) {
      const arb = observation.metrics.bestArbitrage;
      if (arb.fromIsland !== currentIsland) {
        return arb.fromIsland;
      }
    }

    return null;
  }

  /**
   * Determine the next goal description
   */
  private determineNextGoal(
    strategy: Strategy | null,
    _observation: ObservableState
  ): string {
    if (!strategy || strategy.targetRoutes.length === 0) {
      return 'Find trading opportunities';
    }

    const route = strategy.targetRoutes[0];
    return `Trade ${route.goods.join(', ')} from ${route.from} to ${route.to}`;
  }

  /**
   * Apply risk tolerance adjustments
   */
  adjustForRisk(quantity: number, strategy: Strategy | null): number {
    if (!strategy) return quantity;

    switch (strategy.riskTolerance) {
      case 'low':
        return Math.floor(quantity * 0.5);
      case 'medium':
        return Math.floor(quantity * 0.75);
      case 'high':
        return quantity;
      default:
        return quantity;
    }
  }
}
