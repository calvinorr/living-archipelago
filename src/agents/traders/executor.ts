/**
 * Rule-Based Executor
 * Tactical decision-making based on strategy from LLM
 *
 * Economic Model V2 Updates:
 * - Operating costs awareness in profit calculations
 * - Credit/debt management
 * - Price staleness consideration
 * - Market depth (slippage) estimation
 * - Island treasury (purchasing power) checks
 */

import type { GoodId, IslandId, TransportCostBreakdown } from '../../core/types.js';
import type {
  ObservableState,
  ObservableShip,
  ObservableIsland,
} from '../interfaces/observable.js';
import type { Action, Transaction } from '../interfaces/action.js';
import { createTradeAction, createNavigateAction, createWaitAction } from '../interfaces/action.js';
import type { Strategy, TraderMemory } from './memory.js';
import { DEFAULT_MARKET_DEPTH_CONFIG } from '../../core/world.js';

/**
 * Shipping cost configuration for the executor
 */
export interface ShippingCostConfig {
  baseVoyageCost: number;
  costPerDistanceUnit: number;
  perVolumeHandlingCost: number;
  emptyReturnMultiplier: number;
}

/**
 * Bulkiness values for goods (space per unit)
 * Must match world.ts definitions
 */
const GOOD_BULKINESS: Record<string, number> = {
  fish: 1,
  grain: 1,
  timber: 2,
  tools: 0.5,
  luxuries: 0.3,
};

function getBulkiness(goodId: GoodId): number {
  return GOOD_BULKINESS[goodId] ?? 1;
}

/**
 * Spoilage rates for goods (per hour)
 * Must match world.ts definitions
 */
const GOOD_SPOILAGE: Record<string, number> = {
  fish: 0.02,
  grain: 0.001,
  timber: 0,
  tools: 0,
  luxuries: 0,
};

function getSpoilageRate(goodId: GoodId): number {
  return GOOD_SPOILAGE[goodId] ?? 0;
}

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
  /** Shipping cost configuration */
  shippingCosts: ShippingCostConfig;
  // =========================================================================
  // Economic Model V2 Configuration
  // =========================================================================
  /** Maximum debt-to-value ratio to accept (0.5 = 50%) */
  maxAcceptableDebtRatio: number;
  /** Discount factor for stale prices (per tick of age) */
  stalePriceDiscountPerTick: number;
  /** Maximum price age in ticks before considering exploration */
  maxPriceAge: number;
  /** Minimum required depth as fraction of trade quantity */
  minDepthRatio: number;
  /** Maximum fraction of island treasury to expect as payment */
  maxTreasuryFraction: number;
}

/**
 * Comprehensive profit evaluation result (Economic Model V2)
 */
export interface ProfitEvaluation {
  profitable: boolean;
  netMargin: number;
  transportCost: number;
  operatingCost: number;
  interestCost: number;
  spoilageLoss: number;
  slippageCost: number;
  stalePriceDiscount: number;
  treasuryLimited: boolean;
  adjustedQuantity: number;
}

const DEFAULT_CONFIG: ExecutorConfig = {
  cashReserve: 0.1, // Keep 10% cash reserve
  minProfitMargin: 0.05, // 5% minimum (was 10% - too restrictive)
  maxCargoFill: 0.9, // Fill 90% of capacity max (was 80%)
  sellFirst: true,
  shippingCosts: {
    baseVoyageCost: 10,
    costPerDistanceUnit: 0.1,
    perVolumeHandlingCost: 0.05,
    emptyReturnMultiplier: 0.5,
  },
  // Economic Model V2 defaults
  maxAcceptableDebtRatio: 0.5, // Stay under 50% debt-to-value
  stalePriceDiscountPerTick: 0.005, // 0.5% discount per tick of staleness
  maxPriceAge: 48, // 2 days before we really want to explore
  minDepthRatio: 0.5, // Need at least 50% of trade quantity in depth
  maxTreasuryFraction: 0.5, // Don't expect island to spend more than 50% treasury
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
   * Updated for Economic Model V2 with treasury-aware quantity limiting
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
      const doSell = this.shouldSell(goodId, island, strategy, observation, ship, quantity);
      if (doSell) {
        // Economic Model V2: Limit sell quantity by island treasury
        let sellQuantity = quantity;
        if (island.importBudget !== undefined) {
          const maxAffordable = Math.floor(island.importBudget / price);
          const maxByTreasury = Math.floor(maxAffordable * this.config.maxTreasuryFraction);
          if (maxByTreasury < sellQuantity && maxByTreasury > 0) {
            // Sell only what island can afford (partial sell)
            sellQuantity = maxByTreasury;
          }
        }

        // Economic Model V2: Limit by market depth to avoid excessive slippage
        if (island.sellDepth) {
          const depth = island.sellDepth.get(goodId) ?? DEFAULT_MARKET_DEPTH_CONFIG.minDepth;
          // Don't sell more than 2x the available depth (would cause severe slippage)
          const maxByDepth = Math.floor(depth * 2);
          if (maxByDepth < sellQuantity && maxByDepth > 0) {
            sellQuantity = maxByDepth;
          }
        }

        if (sellQuantity > 0) {
          transactions.push({
            goodId,
            quantity: -sellQuantity, // Negative = sell
          });
        }
      }
    }

    if (transactions.length === 0) return null;

    return createTradeAction(ship.id, island.id, transactions);
  }

  /**
   * Determine if we should sell a good at this island
   * Updated for Economic Model V2 with treasury and depth awareness
   */
  private shouldSell(
    goodId: GoodId,
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState,
    ship?: ObservableShip,
    quantity?: number
  ): boolean {
    const price = island.prices.get(goodId) ?? 0;
    if (price <= 0) return false;

    // =========================================================================
    // Economic Model V2: Check island treasury (can they afford to buy?)
    // =========================================================================
    if (island.importBudget !== undefined && quantity !== undefined) {
      const maxAffordable = island.importBudget / price;
      if (quantity > maxAffordable * 2) {
        // Island can't afford even half our cargo - maybe wait or find another buyer
        // But still sell if it's a strategy destination or price is very good
      }
    }

    // Check if this is a destination in our strategy
    if (strategy) {
      const isDestination = strategy.targetRoutes.some(
        (r) => r.to === island.id && r.goods.includes(goodId)
      );
      if (isDestination) return true;
    }

    // =========================================================================
    // Economic Model V2: Consider selling to pay down debt
    // =========================================================================
    if (ship && ship.debtRatio > this.config.maxAcceptableDebtRatio * 0.8) {
      // Ship has significant debt - more willing to sell even at lower margins
      // to generate cash for debt repayment
      const marginThreshold = this.config.minProfitMargin * 0.5; // Accept half the normal margin

      // Find lowest price across islands
      let lowestPrice = price;
      for (const i of observation.islands.values()) {
        const p = i.prices.get(goodId);
        if (p && p > 0 && p < lowestPrice) lowestPrice = p;
      }

      const marginFromLowest = (price - lowestPrice) / lowestPrice;
      if (marginFromLowest >= marginThreshold) return true;
    }

    // Find lowest price across islands (where we likely bought)
    let lowestPrice = price;
    let highestPrice = price;
    for (const i of observation.islands.values()) {
      const p = i.prices.get(goodId);
      if (p && p > 0) {
        if (p < lowestPrice) lowestPrice = p;
        if (p > highestPrice) highestPrice = p;
      }
    }

    // Sell if current price is significantly above the lowest (arbitrage profit)
    const marginFromLowest = (price - lowestPrice) / lowestPrice;
    if (marginFromLowest >= this.config.minProfitMargin) return true;

    // Also sell if we're at one of the higher-priced islands (top 50% of price range)
    const priceRange = highestPrice - lowestPrice;
    if (priceRange > 0) {
      const pricePosition = (price - lowestPrice) / priceRange;
      if (pricePosition >= 0.4) return true; // Sell if in top 60% of price range
    }

    return false;
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
    const initialCash = ship.cash * (1 - this.config.cashReserve);
    if (initialCash <= 0) return null;

    const transactions: Transaction[] = [];

    // Track remaining resources across the loop
    let remainingCash = initialCash;
    let remainingSpace = ship.remainingCapacity;

    // Find goods to buy based on strategy
    const goodsToBuy = this.findGoodsToBuy(island, strategy, observation, ship);

    for (const { goodId, quantity } of goodsToBuy) {
      // Stop if we're out of resources
      if (remainingCash <= 0 || remainingSpace <= 0) break;

      const price = island.prices.get(goodId) ?? 0;
      if (price <= 0) continue;

      // Check inventory
      const available = island.inventory?.get(goodId) ?? 0;
      if (available <= 0) continue;

      // Get bulkiness for this good
      const bulkiness = getBulkiness(goodId);

      // Calculate how much we can buy with REMAINING resources
      const maxBySpace = Math.floor(remainingSpace / bulkiness); // Account for bulkiness
      const maxByCash = Math.floor(remainingCash / price);
      const maxByInventory = available;
      const maxByCapacity = Math.floor((ship.capacity * this.config.maxCargoFill) / bulkiness);

      const buyQuantity = Math.min(quantity, maxBySpace, maxByCash, maxByInventory, maxByCapacity);

      if (buyQuantity > 0) {
        transactions.push({
          goodId,
          quantity: buyQuantity,
        });
        // Update remaining resources (account for bulkiness)
        remainingCash -= buyQuantity * price;
        remainingSpace -= buyQuantity * bulkiness;
      }
    }

    if (transactions.length === 0) return null;

    return createTradeAction(ship.id, island.id, transactions);
  }

  /**
   * Find goods to buy based on strategy and market conditions
   * Updated for Economic Model V2 with comprehensive cost awareness
   */
  private findGoodsToBuy(
    island: ObservableIsland,
    strategy: Strategy | null,
    observation: ObservableState,
    ship: ObservableShip
  ): Array<{ goodId: GoodId; quantity: number }> {
    const result: Array<{ goodId: GoodId; quantity: number; score: number }> = [];

    // =========================================================================
    // Economic Model V2: Check if ship should avoid buying due to high debt
    // =========================================================================
    if (ship.debtRatio > this.config.maxAcceptableDebtRatio) {
      // High debt - prioritize paying it down by selling, not buying more
      return [];
    }

    // Calculate max capacity based on ship constraints
    // Economic Model V2: Consider available credit when calculating cash
    const cashWithCredit = ship.cash + (ship.availableCredit * 0.5); // Only use half of credit for buying
    const availableCash = cashWithCredit * (1 - this.config.cashReserve);
    const maxSpace = ship.remainingCapacity * this.config.maxCargoFill;

    // Check strategy routes
    if (strategy) {
      for (const route of strategy.targetRoutes) {
        if (route.from !== island.id) continue;

        const destIsland = observation.islands.get(route.to);
        if (!destIsland) continue;

        for (const goodId of route.goods) {
          const buyPrice = island.prices.get(goodId) ?? 0;
          const sellPrice = destIsland.prices.get(goodId) ?? 0;

          if (buyPrice > 0 && sellPrice > buyPrice) {
            // Calculate quantity based on actual constraints (accounting for bulkiness)
            const bulkiness = getBulkiness(goodId);
            const maxBySpace = Math.floor(maxSpace / bulkiness);
            const maxByCash = Math.floor(availableCash / buyPrice);
            const available = island.inventory?.get(goodId) ?? 0;

            // Economic Model V2: Limit by market depth at destination
            let maxByDepth = 100; // Default cap
            if (destIsland.sellDepth) {
              const depth = destIsland.sellDepth.get(goodId) ?? DEFAULT_MARKET_DEPTH_CONFIG.minDepth;
              maxByDepth = Math.floor(depth / this.config.minDepthRatio);
            }

            // Economic Model V2: Limit by island treasury
            let maxByTreasury = 100;
            if (destIsland.importBudget !== undefined) {
              maxByTreasury = Math.floor((destIsland.importBudget * this.config.maxTreasuryFraction) / sellPrice);
            }

            const quantity = Math.min(maxBySpace, maxByCash, available, maxByDepth, maxByTreasury, 100);

            if (quantity > 0) {
              // Evaluate profitability with ALL costs (Economic Model V2)
              const evaluation = this.evaluateRouteProfitabilityV2(
                island,
                destIsland,
                goodId,
                quantity,
                observation,
                ship
              );

              if (evaluation.profitable) {
                // Economic Model V2: Adjust score based on price data freshness
                let freshnessBonus = 1.0;
                if (!island.pricesStale && !destIsland.pricesStale) {
                  freshnessBonus = 1.2; // 20% bonus for fresh data
                } else if (island.pricesStale || destIsland.pricesStale) {
                  freshnessBonus = 0.8; // 20% penalty for stale data
                }

                result.push({
                  goodId,
                  quantity: evaluation.adjustedQuantity,
                  score: evaluation.netMargin * route.priority * freshnessBonus,
                });
              }
            }
          }
        }
      }
    }

    // If no strategy goods, use best arbitrage
    if (result.length === 0 && observation.metrics.bestArbitrage) {
      const arb = observation.metrics.bestArbitrage;
      if (arb.fromIsland === island.id) {
        const destIsland = observation.islands.get(arb.toIsland);
        if (destIsland) {
          const buyPrice = island.prices.get(arb.goodId) ?? 1;
          const bulkiness = getBulkiness(arb.goodId);
          const maxBySpace = Math.floor(maxSpace / bulkiness);
          const maxByCash = Math.floor(availableCash / buyPrice);
          const available = island.inventory?.get(arb.goodId) ?? 0;
          const quantity = Math.min(maxBySpace, maxByCash, available, 50);

          if (quantity > 0) {
            // Evaluate profitability with ALL costs (Economic Model V2)
            const evaluation = this.evaluateRouteProfitabilityV2(
              island,
              destIsland,
              arb.goodId,
              quantity,
              observation,
              ship
            );

            if (evaluation.profitable) {
              result.push({
                goodId: arb.goodId,
                quantity: evaluation.adjustedQuantity,
                score: evaluation.netMargin,
              });
            }
          }
        }
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
          if (qty > 0 && this.shouldSell(goodId, island, strategy, observation, ship, qty)) {
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
   * Updated for Economic Model V2 with price freshness and exploration
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

        // Find best selling location (Economic Model V2: factor in price freshness)
        let bestIsland: IslandId | null = null;
        let bestScore = 0;

        for (const [islandId, island] of observation.islands) {
          if (islandId === currentIsland) continue;
          const price = island.prices.get(goodId) ?? 0;
          if (price <= 0) continue;

          // Base score is the price
          let score = price;

          // Economic Model V2: Discount stale prices
          if (island.pricesStale) {
            const ageDiscount = 1 - (island.priceAge * this.config.stalePriceDiscountPerTick);
            score *= Math.max(0.5, ageDiscount); // At least 50% of original score
          }

          // Economic Model V2: Bonus for islands with good treasury
          if (island.importBudget !== undefined) {
            const cargoValue = (ship.cargo.get(goodId) ?? 0) * price;
            if (island.importBudget >= cargoValue) {
              score *= 1.1; // 10% bonus for islands that can afford our cargo
            }
          }

          if (score > bestScore) {
            bestScore = score;
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

    // =========================================================================
    // Economic Model V2: Exploration when prices are stale
    // =========================================================================
    // If all known prices are stale, prioritize visiting islands with oldest data
    const allStale = Array.from(observation.islands.values()).every(i => i.pricesStale);
    if (allStale || strategy?.primaryGoal === 'explore') {
      let oldestIsland: IslandId | null = null;
      let oldestAge = -1;

      for (const [islandId, island] of observation.islands) {
        if (islandId === currentIsland) continue;
        // priceAge of -1 means never visited - highest priority
        const effectiveAge = island.priceAge === -1 ? 10000 : island.priceAge;
        if (effectiveAge > oldestAge) {
          oldestAge = effectiveAge;
          oldestIsland = islandId;
        }
      }

      if (oldestIsland) return oldestIsland;
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

  /**
   * Evaluate if a trade route is profitable after ALL costs (Economic Model V2)
   *
   * New formula:
   * grossProfit = (sellPrice - buyPrice) * quantity
   * slippageCost = estimatedSlippage(quantity, depth)
   * operatingCosts = dailyCost * estimatedTripDays
   * interestCost = currentDebt * interestRate * estimatedTripDays
   * spoilageLoss = quantity * spoilageRate * tripHours * avgPrice
   * stalePriceDiscount = profit * priceAge * discountPerTick
   * netProfit = grossProfit - slippageCost - operatingCosts - interestCost - spoilageLoss - stalePriceDiscount
   */
  /**
   * Full Economic Model V2 profit evaluation with detailed breakdown
   *
   * Comprehensive profit calculation including:
   * - Transport costs (distance, volume, handling)
   * - Operating costs (crew wages, maintenance, port fees)
   * - Interest costs on debt
   * - Spoilage losses for perishable goods
   * - Market slippage from depth consumption
   * - Price staleness discount
   */
  private evaluateRouteProfitabilityV2(
    fromIsland: ObservableIsland,
    toIsland: ObservableIsland,
    goodId: GoodId,
    quantity: number,
    _observation: ObservableState,
    ship?: ObservableShip
  ): ProfitEvaluation {
    const buyPrice = fromIsland.prices.get(goodId) ?? 0;
    const sellPrice = toIsland.prices.get(goodId) ?? 0;

    // Base case: no profit possible
    if (buyPrice <= 0 || sellPrice <= buyPrice) {
      return {
        profitable: false,
        netMargin: 0,
        transportCost: 0,
        operatingCost: 0,
        interestCost: 0,
        spoilageLoss: 0,
        slippageCost: 0,
        stalePriceDiscount: 0,
        treasuryLimited: false,
        adjustedQuantity: quantity,
      };
    }

    // =========================================================================
    // Calculate distance and trip time
    // =========================================================================
    const dx = toIsland.position.x - fromIsland.position.x;
    const dy = toIsland.position.y - fromIsland.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const shipSpeed = ship?.speed ?? 10; // Default speed if no ship provided
    const tripHours = distance / shipSpeed;
    const tripDays = tripHours / 24;

    // =========================================================================
    // Check island treasury (can they afford to buy?)
    // =========================================================================
    let adjustedQuantity = quantity;
    let treasuryLimited = false;
    if (toIsland.importBudget !== undefined) {
      const maxAffordable = Math.floor(toIsland.importBudget / sellPrice);
      const maxByTreasury = Math.floor(maxAffordable * this.config.maxTreasuryFraction);
      if (maxByTreasury < quantity) {
        adjustedQuantity = Math.max(1, maxByTreasury);
        treasuryLimited = true;
      }
    }

    // =========================================================================
    // Calculate cargo volume
    // =========================================================================
    const bulkiness = getBulkiness(goodId);
    const cargoVolume = adjustedQuantity * bulkiness;

    // =========================================================================
    // Transport costs (existing)
    // =========================================================================
    const transport = this.calculateRouteTransportCost(fromIsland, toIsland, cargoVolume);
    const transportCost = transport.totalRoundTrip;

    // =========================================================================
    // Operating costs (Economic Model V2)
    // =========================================================================
    const dailyOperatingCost = ship?.dailyOperatingCost ?? 50; // Default estimate
    const operatingCost = dailyOperatingCost * tripDays;

    // =========================================================================
    // Interest costs (Economic Model V2)
    // =========================================================================
    const currentDebt = ship?.debt ?? 0;
    const interestRate = ship?.interestRate ?? 0.001;
    const interestCost = currentDebt * interestRate * tripHours;

    // =========================================================================
    // Spoilage loss (Economic Model V2)
    // =========================================================================
    const spoilageRate = getSpoilageRate(goodId);
    const avgPrice = (buyPrice + sellPrice) / 2;
    const spoilageFraction = Math.min(1, spoilageRate * tripHours);
    const spoilageLoss = adjustedQuantity * spoilageFraction * avgPrice;

    // =========================================================================
    // Slippage cost from market depth (Economic Model V2)
    // =========================================================================
    let slippageCost = 0;
    if (toIsland.sellDepth) {
      // When selling to island, we consume their buy depth
      const availableDepth = toIsland.sellDepth.get(goodId) ?? DEFAULT_MARKET_DEPTH_CONFIG.minDepth;
      const depthRatio = adjustedQuantity / Math.max(availableDepth, DEFAULT_MARKET_DEPTH_CONFIG.minDepth);

      // Calculate price impact (similar to market-depth.ts)
      let priceImpact: number;
      if (depthRatio <= 1) {
        priceImpact = depthRatio * DEFAULT_MARKET_DEPTH_CONFIG.priceImpactCoefficient;
      } else {
        const withinDepthImpact = DEFAULT_MARKET_DEPTH_CONFIG.priceImpactCoefficient;
        const excessRatio = depthRatio - 1;
        const excessImpact = excessRatio * excessRatio * DEFAULT_MARKET_DEPTH_CONFIG.priceImpactCoefficient * 2;
        priceImpact = withinDepthImpact + excessImpact;
      }
      priceImpact = Math.min(priceImpact, 0.5); // Cap at 50%

      // Slippage reduces effective sell price
      slippageCost = adjustedQuantity * sellPrice * priceImpact;
    }

    // =========================================================================
    // Stale price discount (Economic Model V2)
    // =========================================================================
    let stalePriceDiscount = 0;
    const priceAge = Math.max(fromIsland.priceAge, toIsland.priceAge);
    if (priceAge > 0) {
      // Apply discount for uncertainty due to stale prices
      const grossProfit = (sellPrice - buyPrice) * adjustedQuantity;
      stalePriceDiscount = grossProfit * priceAge * this.config.stalePriceDiscountPerTick;
    }

    // =========================================================================
    // Calculate net profit
    // =========================================================================
    const revenue = adjustedQuantity * sellPrice;
    const purchaseCost = adjustedQuantity * buyPrice;
    const grossProfit = revenue - purchaseCost;
    const totalCosts = transportCost + operatingCost + interestCost + spoilageLoss + slippageCost + stalePriceDiscount;
    const netProfit = grossProfit - totalCosts;
    const netMargin = purchaseCost > 0 ? netProfit / purchaseCost : 0;

    // =========================================================================
    // Determine if profitable
    // =========================================================================
    const isProfitable = netMargin >= this.config.minProfitMargin && adjustedQuantity > 0;

    return {
      profitable: isProfitable,
      netMargin,
      transportCost,
      operatingCost,
      interestCost,
      spoilageLoss,
      slippageCost,
      stalePriceDiscount,
      treasuryLimited,
      adjustedQuantity,
    };
  }

  /**
   * Calculate transport cost between two islands
   */
  private calculateRouteTransportCost(
    fromIsland: ObservableIsland,
    toIsland: ObservableIsland,
    cargoVolume: number
  ): TransportCostBreakdown {
    // Calculate distance
    const dx = toIsland.position.x - fromIsland.position.x;
    const dy = toIsland.position.y - fromIsland.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const config = this.config.shippingCosts;
    const fixedCost = config.baseVoyageCost;
    const distanceCost = distance * config.costPerDistanceUnit;
    const volumeCost = cargoVolume * config.perVolumeHandlingCost;
    const oneWayCost = fixedCost + distanceCost + volumeCost;
    const returnCost = distance * config.costPerDistanceUnit * config.emptyReturnMultiplier;

    return {
      fixedCost,
      distanceCost,
      volumeCost,
      returnCost,
      oneWayCost,
      totalRoundTrip: oneWayCost + returnCost,
    };
  }
}
