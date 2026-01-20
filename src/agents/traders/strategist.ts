/**
 * LLM Strategist
 * Makes high-level strategic decisions using Gemini Flash
 *
 * Economic Model V2 Updates:
 * - Includes operating costs and financial status in LLM prompt
 * - Considers price staleness when generating strategies
 * - Accounts for debt management in strategy goals
 * - Factors in market depth and island treasury
 */

import type { LLMClient } from '../../llm/client.js';
import type { RateLimiter } from '../../llm/rate-limiter.js';
import type { ObservableState } from '../interfaces/observable.js';
import type { Trigger } from '../core/trigger-system.js';
import { TriggerType } from '../core/trigger-system.js';
import type { TraderMemory, Strategy, TradeRoute } from './memory.js';

/**
 * Strategist configuration
 */
export interface StrategistConfig {
  /** Strategy validity duration in ticks */
  strategyValidityTicks: number;
  /** Minimum profit margin to consider a route */
  minProfitMargin: number;
  /** Maximum routes to consider in strategy */
  maxRoutes: number;
}

const DEFAULT_CONFIG: StrategistConfig = {
  strategyValidityTicks: 48, // ~2 game days
  minProfitMargin: 0.10, // 10% minimum (was 15%)
  maxRoutes: 8, // Allow more routes for better coverage (was 3)
};

/**
 * Response format from LLM
 */
interface StrategyResponse {
  analysis: string;
  strategy: {
    primaryGoal: 'profit' | 'stabilize' | 'explore';
    targetRoutes: Array<{
      from: string;
      to: string;
      goods: string[];
      priority: number;
    }>;
    riskTolerance: 'low' | 'medium' | 'high';
  };
  reasoning: string;
}

/**
 * LLM Strategist - makes high-level trading decisions
 */
export class Strategist {
  private llm: LLMClient;
  private rateLimiter: RateLimiter;
  private config: StrategistConfig;

  constructor(
    llm: LLMClient,
    rateLimiter: RateLimiter,
    config: Partial<StrategistConfig> = {}
  ) {
    this.llm = llm;
    this.rateLimiter = rateLimiter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a new strategy based on observation and triggers
   */
  async generateStrategy(
    observation: ObservableState,
    triggers: Trigger[],
    memory: TraderMemory
  ): Promise<Strategy> {
    // Check rate limit
    if (!this.rateLimiter.canCall()) {
      // Return a default strategy when rate limited
      return this.createDefaultStrategy(observation, memory);
    }

    // Build the prompt
    const prompt = this.buildPrompt(observation, triggers, memory);

    try {
      // Record the call
      this.rateLimiter.recordCall();

      // Call the LLM
      const response = await this.llm.completeJSON<StrategyResponse>(prompt);

      // Validate and create strategy
      const strategy = this.parseResponse(response, observation);
      memory.recordStrategy(strategy);

      return strategy;
    } catch (error) {
      console.warn('[Strategist] LLM call failed, using default strategy:', error);
      return this.createDefaultStrategy(observation, memory);
    }
  }

  /**
   * Build the prompt for the LLM (Economic Model V2 enhanced)
   */
  private buildPrompt(
    observation: ObservableState,
    triggers: Trigger[],
    memory: TraderMemory
  ): string {
    const marketSummary = this.summarizeMarkets(observation);
    const triggerSummary = this.summarizeTriggers(triggers);
    const memorySummary = memory.toPromptContext();
    const shipStatus = this.summarizeShips(observation);
    const financialStatus = this.summarizeFinancials(observation);
    const priceDataStatus = this.summarizePriceDataFreshness(observation);

    return `You are an AI trading strategist in a maritime trading simulation. Analyze the market data and create a trading strategy.

## Current Situation
Tick: ${observation.tick} (Day ${observation.gameTime.day}, Hour ${observation.gameTime.hour})
Cash: ${observation.self.cash} gold
Ships: ${observation.self.shipIds.length}

## Financial Status (IMPORTANT for decision-making)
${financialStatus}

## Market Prices (buy/sell at these prices)
${marketSummary}

## Price Data Freshness
${priceDataStatus}

## Ship Status
${shipStatus}

## Triggers (why you're being consulted)
${triggerSummary}

## Your Memory
${memorySummary}

## Task
Create a trading strategy. Consider:
1. Price differences between islands (arbitrage opportunities)
2. Current cargo and ship positions
3. Events affecting trade (storms, festivals)
4. Risk vs reward tradeoffs
5. **Operating costs** - Ships have daily costs (crew, maintenance, port fees)
6. **Debt management** - If ships have debt, prioritize repayment
7. **Price staleness** - Old price data may be inaccurate; consider exploration
8. **Island purchasing power** - Islands have limited treasuries for buying goods

IMPORTANT Economic Constraints:
- Estimated profit must exceed operating costs for the voyage duration
- High debt (>50% of ship value) should trigger more conservative trading
- Stale prices (>24 ticks old) should be treated with caution
- Large trades may face slippage - prefer multiple smaller trades

Respond with valid JSON in this exact format:
\`\`\`json
{
  "analysis": "Brief 1-2 sentence market analysis",
  "strategy": {
    "primaryGoal": "profit|stabilize|explore",
    "targetRoutes": [
      {"from": "island_id", "to": "island_id", "goods": ["good1", "good2"], "priority": 1}
    ],
    "riskTolerance": "low|medium|high"
  },
  "reasoning": "1-2 sentences explaining your choice"
}
\`\`\`

Goal Selection Guide:
- "profit": Normal trading, focus on best margins
- "stabilize": Conservative, prioritize debt repayment and cash flow
- "explore": Visit islands with stale/unknown prices to update market knowledge

Rules:
- Only use island IDs from the market data
- Only use goods that appear in the price data
- Higher priority = execute first (1 is highest)
- Consider ship positions when choosing routes
- If debt is high, prefer "stabilize" goal`;
  }

  /**
   * Summarize financial status (Economic Model V2)
   */
  private summarizeFinancials(observation: ObservableState): string {
    const ownedShips = Array.from(observation.ships.values()).filter((s) => s.isOwned);
    if (ownedShips.length === 0) return 'No ships owned';

    const lines: string[] = [];

    // Aggregate financial metrics
    let totalCash = 0;
    let totalDebt = 0;
    let totalDailyOperatingCost = 0;
    let totalAvailableCredit = 0;

    for (const ship of ownedShips) {
      totalCash += ship.cash;
      totalDebt += ship.debt;
      totalDailyOperatingCost += ship.dailyOperatingCost;
      totalAvailableCredit += ship.availableCredit;
    }

    lines.push(`Fleet Cash: ${totalCash.toFixed(0)} gold`);
    lines.push(`Fleet Debt: ${totalDebt.toFixed(0)} gold`);
    lines.push(`Available Credit: ${totalAvailableCredit.toFixed(0)} gold`);
    lines.push(`Daily Operating Costs: ${totalDailyOperatingCost.toFixed(0)} gold/day`);

    // Calculate debt warnings
    const avgDebtRatio = ownedShips.reduce((sum, s) => sum + s.debtRatio, 0) / ownedShips.length;
    if (avgDebtRatio > 0.5) {
      lines.push(`WARNING: High debt ratio (${(avgDebtRatio * 100).toFixed(0)}%) - prioritize repayment!`);
    } else if (avgDebtRatio > 0.3) {
      lines.push(`CAUTION: Moderate debt ratio (${(avgDebtRatio * 100).toFixed(0)}%) - be conservative`);
    }

    // Daily interest cost
    const dailyInterest = ownedShips.reduce((sum, s) => sum + s.dailyInterestCost, 0);
    if (dailyInterest > 0) {
      lines.push(`Daily Interest Cost: ${dailyInterest.toFixed(0)} gold/day`);
    }

    return lines.join('\n');
  }

  /**
   * Summarize price data freshness (Economic Model V2)
   */
  private summarizePriceDataFreshness(observation: ObservableState): string {
    const lines: string[] = [];

    for (const [, island] of observation.islands) {
      let freshness: string;
      if (island.pricesRealTime) {
        freshness = 'CURRENT (at island)';
      } else if (island.priceAge === -1) {
        freshness = 'UNKNOWN (never visited)';
      } else if (island.pricesStale) {
        freshness = `STALE (${island.priceAge} ticks old - UNRELIABLE)`;
      } else {
        freshness = `${island.priceAge} ticks old`;
      }
      lines.push(`${island.name}: ${freshness}`);
    }

    // Add exploration recommendation if many prices are stale
    const staleCount = Array.from(observation.islands.values()).filter(i => i.pricesStale).length;
    const totalIslands = observation.islands.size;
    if (staleCount >= totalIslands * 0.5) {
      lines.push(`\nRECOMMENDATION: Consider "explore" goal - ${staleCount}/${totalIslands} islands have stale price data`);
    }

    return lines.join('\n');
  }

  /**
   * Summarize market prices for prompt (Economic Model V2 enhanced)
   */
  private summarizeMarkets(observation: ObservableState): string {
    const lines: string[] = [];

    for (const [islandId, island] of observation.islands) {
      const prices = Array.from(island.prices.entries())
        .map(([good, price]) => `${good}:${price.toFixed(1)}`)
        .join(', ');

      const inventory = island.inventory
        ? Array.from(island.inventory.entries())
            .filter(([_, qty]) => qty > 0)
            .map(([good, qty]) => `${good}:${qty}`)
            .join(', ')
        : 'unknown';

      // Economic Model V2: Include island treasury/purchasing power
      let treasuryInfo = '';
      if (island.treasury !== undefined) {
        treasuryInfo = ` [Treasury: ${island.treasury.toFixed(0)}g, Budget: ${(island.importBudget ?? 0).toFixed(0)}g/tick]`;
      }

      lines.push(`${island.name} (${islandId}): ${prices}${treasuryInfo}`);
      if (inventory !== 'unknown') {
        lines.push(`  Stock: ${inventory}`);
      }

      // Economic Model V2: Note production shocks
      if (island.productionShocks && island.productionShocks.size > 0) {
        const shocks = Array.from(island.productionShocks.entries())
          .map(([goodId, shock]) => `${goodId}:${shock.type}(${shock.ticksRemaining}t)`)
          .join(', ');
        lines.push(`  Shocks: ${shocks}`);
      }
    }

    // Add best arbitrage if found
    if (observation.metrics.bestArbitrage) {
      const arb = observation.metrics.bestArbitrage;
      lines.push(
        `\nBest Arbitrage: ${arb.goodId} from ${arb.fromIsland} to ${arb.toIsland} ` +
          `(${(arb.margin * 100).toFixed(0)}% margin)`
      );
    }

    return lines.join('\n');
  }

  /**
   * Summarize triggers for prompt
   */
  private summarizeTriggers(triggers: Trigger[]): string {
    if (triggers.length === 0) return 'Routine check (no specific triggers)';

    return triggers
      .slice(0, 3)
      .map((t) => {
        switch (t.type) {
          case TriggerType.PRICE_DIVERGENCE: {
            const d = t.data as { goodId: string; divergence: number; lowIsland: string; highIsland: string };
            return `Price opportunity: ${d.goodId} is ${(d.divergence * 100).toFixed(0)}% cheaper at ${d.lowIsland} than ${d.highIsland}`;
          }
          case TriggerType.EVENT_STARTED: {
            const d = t.data as { eventType: string; targetId: string };
            return `Event: ${d.eventType} at ${d.targetId}`;
          }
          case TriggerType.PLAN_COMPLETED:
            return 'Previous plan completed successfully';
          case TriggerType.PLAN_FAILED: {
            const d = t.data as { reason?: string };
            return `Previous plan failed: ${d.reason ?? 'unknown reason'}`;
          }
          case TriggerType.NO_PLAN:
            return 'No active trading plan';
          case TriggerType.TIME_ELAPSED:
            return 'Periodic strategy review';
          default:
            return `Trigger: ${t.type}`;
        }
      })
      .join('\n');
  }

  /**
   * Summarize ship status for prompt (Economic Model V2 enhanced)
   */
  private summarizeShips(observation: ObservableState): string {
    const ownedShips = Array.from(observation.ships.values()).filter((s) => s.isOwned);

    if (ownedShips.length === 0) return 'No ships owned';

    return ownedShips
      .map((ship) => {
        const cargo = Array.from(ship.cargo.entries())
          .filter(([_, qty]) => qty > 0)
          .map(([good, qty]) => `${qty} ${good}`)
          .join(', ') || 'empty';

        const location =
          ship.location.kind === 'at_island'
            ? `at ${ship.location.islandId}`
            : `sailing to ${ship.location.destination} (${Math.round((ship.location.progress ?? 0) * 100)}%)`;

        // Economic Model V2: Include financial status per ship
        const debtStatus = ship.debt > 0
          ? `, debt: ${ship.debt.toFixed(0)}g (${(ship.debtRatio * 100).toFixed(0)}%)`
          : '';
        const conditionStatus = ship.condition < 0.5
          ? `, condition: ${(ship.condition * 100).toFixed(0)}% (NEEDS REPAIR)`
          : '';
        const moraleStatus = ship.crew.morale < 0.5
          ? `, morale: ${(ship.crew.morale * 100).toFixed(0)}% (LOW)`
          : '';

        return `${ship.name}: ${location}, cargo: ${cargo}, cash: ${ship.cash.toFixed(0)}g${debtStatus}${conditionStatus}${moraleStatus}`;
      })
      .join('\n');
  }

  /**
   * Parse LLM response into Strategy
   */
  private parseResponse(response: StrategyResponse, observation: ObservableState): Strategy {
    const validIslands = new Set(observation.islands.keys());

    // Validate and filter routes
    const targetRoutes: TradeRoute[] = response.strategy.targetRoutes
      .filter(
        (r) => validIslands.has(r.from) && validIslands.has(r.to) && r.from !== r.to
      )
      .map((r) => ({
        from: r.from,
        to: r.to,
        goods: r.goods,
        priority: r.priority,
      }))
      .slice(0, this.config.maxRoutes);

    return {
      createdAt: observation.tick,
      primaryGoal: response.strategy.primaryGoal,
      targetRoutes,
      riskTolerance: response.strategy.riskTolerance,
      analysis: response.analysis,
      reasoning: response.reasoning,
      validUntil: observation.tick + this.config.strategyValidityTicks,
    };
  }

  /**
   * Create a default strategy when LLM is unavailable
   * Enhanced for Economic Model V2 with debt and staleness awareness
   */
  private createDefaultStrategy(
    observation: ObservableState,
    memory: TraderMemory
  ): Strategy {
    const routes: TradeRoute[] = [];

    // =========================================================================
    // Economic Model V2: Determine primary goal based on fleet status
    // =========================================================================
    const ownedShips = Array.from(observation.ships.values()).filter((s) => s.isOwned);
    const avgDebtRatio = ownedShips.length > 0
      ? ownedShips.reduce((sum, s) => sum + s.debtRatio, 0) / ownedShips.length
      : 0;
    const staleIslands = Array.from(observation.islands.values()).filter(i => i.pricesStale).length;
    const totalIslands = observation.islands.size;

    let primaryGoal: 'profit' | 'stabilize' | 'explore' = 'profit';
    let riskTolerance: 'low' | 'medium' | 'high' = 'medium';
    let reasoning = 'Following best arbitrage opportunities';

    // High debt -> stabilize mode
    if (avgDebtRatio > 0.5) {
      primaryGoal = 'stabilize';
      riskTolerance = 'low';
      reasoning = 'High debt - prioritizing cash flow and debt repayment';
    }
    // Most prices stale -> explore mode
    else if (staleIslands >= totalIslands * 0.6) {
      primaryGoal = 'explore';
      riskTolerance = 'medium';
      reasoning = 'Stale price data - exploring to update market knowledge';
    }

    // =========================================================================
    // Build routes based on goal
    // =========================================================================

    // Use best arbitrage if available (and prices aren't too stale)
    if (observation.metrics.bestArbitrage && primaryGoal !== 'explore') {
      const arb = observation.metrics.bestArbitrage;
      const fromIsland = observation.islands.get(arb.fromIsland);
      const toIsland = observation.islands.get(arb.toIsland);

      // Economic Model V2: Check if price data is fresh enough
      const maxAge = 48; // 2 game days
      const fromAge = fromIsland?.priceAge ?? -1;
      const toAge = toIsland?.priceAge ?? -1;

      if (fromAge !== -1 && toAge !== -1 && fromAge < maxAge && toAge < maxAge) {
        routes.push({
          from: arb.fromIsland,
          to: arb.toIsland,
          goods: [arb.goodId],
          priority: 1,
          expectedProfit: arb.margin,
        });
      }
    }

    // Add routes from previous strategy if available
    const prevStrategy = memory.getCurrentStrategy();
    if (prevStrategy && prevStrategy.targetRoutes.length > 0) {
      for (const route of prevStrategy.targetRoutes.slice(0, 2)) {
        if (!routes.find((r) => r.from === route.from && r.to === route.to)) {
          routes.push({ ...route, priority: routes.length + 1 });
        }
      }
    }

    // Economic Model V2: If exploring, prioritize islands with stale/unknown prices
    if (primaryGoal === 'explore' && routes.length === 0) {
      // Find islands sorted by price staleness (most stale first)
      const sortedIslands = Array.from(observation.islands.entries())
        .sort((a, b) => {
          const ageA = a[1].priceAge === -1 ? 10000 : a[1].priceAge;
          const ageB = b[1].priceAge === -1 ? 10000 : b[1].priceAge;
          return ageB - ageA;
        });

      // Create exploration route to most stale island
      if (sortedIslands.length >= 2) {
        const [targetId] = sortedIslands[0];
        // Find a ship location to use as source
        const shipAtIsland = ownedShips.find(s => s.location.kind === 'at_island');
        if (shipAtIsland && shipAtIsland.location.islandId !== targetId) {
          routes.push({
            from: shipAtIsland.location.islandId!,
            to: targetId,
            goods: ['fish', 'grain', 'timber'], // Generic goods to look for
            priority: 1,
          });
        }
      }
    }

    return {
      createdAt: observation.tick,
      primaryGoal,
      targetRoutes: routes,
      riskTolerance,
      analysis: 'Default strategy (LLM unavailable)',
      reasoning,
      validUntil: observation.tick + this.config.strategyValidityTicks / 2,
    };
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus(): ReturnType<RateLimiter['getStatus']> {
    return this.rateLimiter.getStatus();
  }
}
