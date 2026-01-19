/**
 * LLM Strategist
 * Makes high-level strategic decisions using Gemini Flash
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
   * Build the prompt for the LLM
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

    return `You are an AI trading strategist in a maritime trading simulation. Analyze the market data and create a trading strategy.

## Current Situation
Tick: ${observation.tick} (Day ${observation.gameTime.day}, Hour ${observation.gameTime.hour})
Cash: ${observation.self.cash} gold
Ships: ${observation.self.shipIds.length}

## Market Prices (buy/sell at these prices)
${marketSummary}

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

Rules:
- Only use island IDs from the market data
- Only use goods that appear in the price data
- Higher priority = execute first (1 is highest)
- Consider ship positions when choosing routes`;
  }

  /**
   * Summarize market prices for prompt
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

      lines.push(`${island.name} (${islandId}): ${prices}`);
      if (inventory !== 'unknown') {
        lines.push(`  Stock: ${inventory}`);
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
   * Summarize ship status for prompt
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

        return `${ship.name}: ${location}, cargo: ${cargo}, cash: ${ship.cash.toFixed(0)}g`;
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
   */
  private createDefaultStrategy(
    observation: ObservableState,
    memory: TraderMemory
  ): Strategy {
    const routes: TradeRoute[] = [];

    // Use best arbitrage if available
    if (observation.metrics.bestArbitrage) {
      const arb = observation.metrics.bestArbitrage;
      routes.push({
        from: arb.fromIsland,
        to: arb.toIsland,
        goods: [arb.goodId],
        priority: 1,
        expectedProfit: arb.margin,
      });
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

    return {
      createdAt: observation.tick,
      primaryGoal: 'profit',
      targetRoutes: routes,
      riskTolerance: 'medium',
      analysis: 'Default strategy (LLM unavailable)',
      reasoning: 'Following best arbitrage opportunities',
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
