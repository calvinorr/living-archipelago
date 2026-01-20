/**
 * Trader Agent
 * Main implementation combining LLM Strategist and Rule-Based Executor
 *
 * Economic Model V2 Updates:
 * - Triggers reasoning when debt becomes high
 * - Triggers reasoning when prices become stale
 * - Mock trader includes cost-aware trade routes
 */

import type { AgentId, AgentState, WorldState } from '../../core/types.js';
import type { ObservableState } from '../interfaces/observable.js';
import type { Action, ActionResult } from '../interfaces/action.js';
import type { AgentMemory, Decision, Plan, PlanStep } from '../interfaces/agent.js';
import { BaseAgent } from '../interfaces/agent.js';
import { ObservableBuilder } from '../interfaces/observable.js';
import type { Trigger, TriggerConfig } from '../core/trigger-system.js';
import { TriggerSystem } from '../core/trigger-system.js';
import type { LLMClient } from '../../llm/client.js';
import { createMockLLMClient } from '../../llm/client.js';
import type { RateLimiter } from '../../llm/rate-limiter.js';
import { createRateLimiter } from '../../llm/rate-limiter.js';
import { TraderMemory, type TradeRecord } from './memory.js';
import { Strategist, type StrategistConfig } from './strategist.js';
import { Executor, type ExecutorConfig } from './executor.js';

/**
 * Trader agent configuration
 */
export interface TraderAgentConfig {
  /** Trigger system configuration */
  triggerConfig: Partial<TriggerConfig>;
  /** Strategist configuration */
  strategistConfig: Partial<StrategistConfig>;
  /** Executor configuration */
  executorConfig: Partial<ExecutorConfig>;
  /** Rate limiter preset */
  rateLimiterPreset: 'conservative' | 'balanced' | 'aggressive' | 'unlimited';
  /** Enable debug logging */
  debug: boolean;
}

const DEFAULT_CONFIG: TraderAgentConfig = {
  triggerConfig: {},
  strategistConfig: {},
  executorConfig: {},
  rateLimiterPreset: 'balanced',
  debug: false,
};

/**
 * Trader Agent
 * AI-powered trading agent that uses LLM for strategy and rules for execution
 */
export class TraderAgent extends BaseAgent {
  private rateLimiter: RateLimiter;
  private triggerSystem: TriggerSystem;
  private observableBuilder: ObservableBuilder;
  private strategist: Strategist;
  private executor: Executor;
  private traderMemory: TraderMemory;
  private config: TraderAgentConfig;
  private currentTick: number = 0;
  private llmCallsThisSession: number = 0;

  constructor(
    id: AgentId,
    name: string,
    llmClient: LLMClient,
    initialAssets: { cash: number; shipIds: string[] },
    config: Partial<TraderAgentConfig> = {}
  ) {
    const initialState: AgentState = {
      id,
      type: 'trader',
      name,
      assets: initialAssets,
    };

    super(id, 'trader', name, initialState);

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = createRateLimiter(this.config.rateLimiterPreset);
    this.triggerSystem = new TriggerSystem(this.config.triggerConfig);
    this.observableBuilder = new ObservableBuilder();
    this.strategist = new Strategist(
      llmClient,
      this.rateLimiter,
      this.config.strategistConfig
    );
    this.executor = new Executor(this.config.executorConfig);
    this.traderMemory = new TraderMemory();
  }

  /**
   * Initialize agent with world state
   */
  override initialize(world: WorldState): void {
    super.initialize(world);
    this.currentTick = world.tick;

    if (this.config.debug) {
      console.log(`[TraderAgent] ${this.name} initialized at tick ${world.tick}`);
    }
  }

  /**
   * Build observation from world state
   */
  observe(world: WorldState): ObservableState {
    return this.observableBuilder.build(
      world,
      this.id,
      this.type,
      this.name,
      this.memory
    );
  }

  /**
   * Check if agent should engage in deep (LLM) reasoning
   * Enhanced for Economic Model V2 with debt and price staleness awareness
   */
  shouldReason(observation: ObservableState, triggers: Trigger[]): boolean {
    // Cooldown: don't reason if we just reasoned recently (within 20 ticks)
    const ticksSinceReasoning = observation.tick - this.memory.lastReasoningTick;
    const minCooldown = 20; // Must wait at least 20 ticks between LLM calls

    if (ticksSinceReasoning < minCooldown && this.traderMemory.getCurrentStrategy()) {
      return false; // On cooldown and we have a strategy
    }

    // Reason if no current strategy (first time)
    if (!this.traderMemory.getCurrentStrategy()) {
      return true;
    }

    // Reason if strategy is stale (over 100 ticks old)
    if (this.traderMemory.isStrategyStale(observation.tick)) {
      return true;
    }

    // Only trigger on high-priority events after cooldown
    if (triggers.length > 0 && triggers[0].priority >= 8) {
      return true;
    }

    // =========================================================================
    // Economic Model V2: Additional reasoning triggers
    // =========================================================================

    // Trigger reasoning if debt becomes critical (>60%)
    const ownedShips = Array.from(observation.ships.values()).filter(s => s.isOwned);
    const avgDebtRatio = ownedShips.length > 0
      ? ownedShips.reduce((sum, s) => sum + s.debtRatio, 0) / ownedShips.length
      : 0;
    if (avgDebtRatio > 0.6) {
      if (this.config.debug) {
        console.log(`[TraderAgent] ${this.name} triggering reasoning due to high debt (${(avgDebtRatio * 100).toFixed(0)}%)`);
      }
      return true;
    }

    // Trigger reasoning if all price data becomes stale
    const staleIslands = Array.from(observation.islands.values()).filter(i => i.pricesStale).length;
    const totalIslands = observation.islands.size;
    if (staleIslands >= totalIslands * 0.8 && ticksSinceReasoning > minCooldown * 2) {
      if (this.config.debug) {
        console.log(`[TraderAgent] ${this.name} triggering reasoning due to stale prices (${staleIslands}/${totalIslands} stale)`);
      }
      return true;
    }

    // Trigger reasoning if current strategy goal doesn't match situation
    const currentStrategy = this.traderMemory.getCurrentStrategy();
    if (currentStrategy) {
      // If we're in 'profit' mode but debt is high, reconsider
      if (currentStrategy.primaryGoal === 'profit' && avgDebtRatio > 0.4) {
        return true;
      }
      // If we're in 'explore' mode but have fresh prices, maybe time to profit
      if (currentStrategy.primaryGoal === 'explore' && staleIslands < totalIslands * 0.3) {
        return true;
      }
    }

    // Check trigger system (which also has cooldown check)
    return this.triggerSystem.shouldTrigger(observation, this.memory);
  }

  /**
   * Make decisions based on observation
   */
  async reason(observation: ObservableState, triggers: Trigger[]): Promise<Decision> {
    this.currentTick = observation.tick;

    // Sync memory
    this.traderMemory.currentPlan = this.memory.currentPlan;
    this.traderMemory.lastReasoningTick = this.memory.lastReasoningTick;

    // Check if we need LLM reasoning
    const needsLLM = this.shouldReason(observation, triggers);

    let strategy = this.traderMemory.getCurrentStrategy();

    if (needsLLM) {
      if (this.config.debug) {
        console.log(
          `[TraderAgent] ${this.name} invoking LLM strategist. ` +
            `Triggers: ${this.triggerSystem.summarizeTriggers(triggers)}`
        );
      }

      // Call strategist for new strategy
      strategy = await this.strategist.generateStrategy(
        observation,
        triggers,
        this.traderMemory
      );

      this.llmCallsThisSession++;
      this.markReasoning(observation.tick);

      if (this.config.debug) {
        console.log(
          `[TraderAgent] ${this.name} new strategy: ` +
            `${strategy.primaryGoal}, routes: ${strategy.targetRoutes.length}, ` +
            `risk: ${strategy.riskTolerance}`
        );
      }
    }

    // Execute strategy with rule-based executor
    const execution = this.executor.execute(strategy, observation, this.traderMemory);

    // Update plan
    const plan = this.createPlan(strategy, execution);
    this.updatePlan(plan);
    this.traderMemory.currentPlan = plan;

    // Record prices for trend analysis
    this.recordPrices(observation);

    // Record decision
    const decision: Decision = {
      actions: execution.actions,
      plan: plan ?? undefined,
      triggerReason: needsLLM
        ? this.triggerSystem.summarizeTriggers(triggers)
        : undefined,
    };

    this.recordDecision(observation.tick, decision);

    return decision;
  }

  /**
   * Convert decision to executable actions
   */
  act(decision: Decision): Action[] {
    return decision.actions;
  }

  /**
   * Get agent memory (overridden to include trader-specific memory)
   */
  override getMemory(): AgentMemory {
    return {
      ...this.memory,
      customData: {
        traderMemory: this.traderMemory.serialize(),
        llmCalls: this.llmCallsThisSession,
        rateLimiterStatus: this.rateLimiter.getStatus(),
      },
    };
  }

  /**
   * Handle action results
   */
  override onActionResults(results: ActionResult[]): void {
    for (const result of results) {
      if (!result.success) {
        if (this.config.debug) {
          console.warn(
            `[TraderAgent] ${this.name} action failed: ${result.error}`
          );
        }

        // Mark plan as failed if we can't execute
        if (this.memory.currentPlan) {
          this.memory.currentPlan.status = 'failed';
          this.memory.currentPlan.failureReason = result.error;
        }
        continue;
      }

      // Record successful trades
      if (result.action.type === 'trade') {
        this.recordTrades(result);
      }

      // Record voyages
      if (result.action.type === 'navigate') {
        this.traderMemory.addNote(
          `Tick ${this.currentTick}: Sailing to ${result.action.destinationId}`
        );
      }
    }
  }

  /**
   * Called at start of each tick
   */
  override onTickStart(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * Called at end of each tick
   */
  override onTickEnd(_tick: number): void {
    // Update plan progress if active
    if (this.memory.currentPlan?.status === 'active') {
      const plan = this.memory.currentPlan;
      const currentStep = plan.steps[plan.currentStep];

      if (currentStep?.status === 'in_progress') {
        // Check completion conditions (simplified)
        // In a full implementation, we'd check actual world state
      }
    }
  }

  /**
   * Create a plan from strategy and execution
   */
  private createPlan(
    strategy: ReturnType<TraderMemory['getCurrentStrategy']>,
    execution: { reasoning: string; nextGoal?: string }
  ): Plan | null {
    if (!strategy || strategy.targetRoutes.length === 0) {
      return null;
    }

    const steps: PlanStep[] = strategy.targetRoutes.map((route) => ({
      action: 'trade_route',
      target: route.to,
      params: {
        from: route.from,
        goods: route.goods,
        priority: route.priority,
      },
      status: 'pending' as const,
    }));

    // Mark first step as in progress
    if (steps.length > 0) {
      steps[0].status = 'in_progress';
    }

    return {
      id: `plan-${this.currentTick}`,
      createdAt: this.currentTick,
      status: 'active',
      summary: execution.nextGoal ?? strategy.analysis,
      steps,
      currentStep: 0,
    };
  }

  /**
   * Record prices from observation
   */
  private recordPrices(observation: ObservableState): void {
    for (const [islandId, island] of observation.islands) {
      for (const [goodId, price] of island.prices) {
        this.traderMemory.recordPrice(observation.tick, islandId, goodId, price);
      }
    }
  }

  /**
   * Record trades from action result
   */
  private recordTrades(result: ActionResult): void {
    if (result.action.type !== 'trade') return;

    const action = result.action;

    for (const tx of action.transactions) {
      const record: TradeRecord = {
        tick: this.currentTick,
        shipId: action.shipId,
        islandId: action.islandId,
        goodId: tx.goodId,
        quantity: Math.abs(tx.quantity),
        price: 0, // Would need to get from world state
        type: tx.quantity > 0 ? 'buy' : 'sell',
      };

      this.traderMemory.recordTrade(record);
    }
  }

  /**
   * Get trader-specific statistics
   */
  getStats(): {
    llmCalls: number;
    rateLimiterStatus: ReturnType<RateLimiter['getStatus']>;
    recentProfit: number;
    strategiesCreated: number;
    currentStrategy: ReturnType<TraderMemory['getCurrentStrategy']>;
  } {
    return {
      llmCalls: this.llmCallsThisSession,
      rateLimiterStatus: this.rateLimiter.getStatus(),
      recentProfit: this.traderMemory.getRecentProfit(100),
      strategiesCreated: this.traderMemory.getStrategies().length,
      currentStrategy: this.traderMemory.getCurrentStrategy(),
    };
  }

  /**
   * Get the trader memory for debugging/persistence
   */
  getTraderMemory(): TraderMemory {
    return this.traderMemory;
  }

  /**
   * Reset LLM rate limiter (for new session)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
    this.llmCallsThisSession = 0;
  }
}

/**
 * Create a trader agent with mock LLM for testing
 *
 * The mock agent returns realistic trade routes based on the MVP archipelago:
 * - Shoalhold: Fishing island (abundant fish, needs grain)
 * - Greenbarrow: Agricultural island (abundant grain, needs fish)
 * - Timberwake: Forest island (abundant timber, needs food)
 *
 * Economic Model V2 Enhancements:
 * - Routes are designed to cover operating costs
 * - Prioritizes profitable food delivery to Timberwake
 * - Considers return cargo to maximize efficiency
 */
export function createMockTraderAgent(
  id: AgentId,
  name: string,
  initialAssets: { cash: number; shipIds: string[] },
  mockResponses?: (prompt: string) => string,
  config?: Partial<TraderAgentConfig>
): TraderAgent {
  // Define realistic trade routes based on island specializations
  // CRITICAL: Timberwake is the most isolated - prioritize food delivery there FIRST
  // Order matters: executor picks first matching route
  //
  // Economic Model V2: Routes are designed with cost awareness:
  // - Food to Timberwake has highest margin (high prices due to scarcity)
  // - Return trips carry timber to avoid empty returns (reduces wasted operating costs)
  // - Food exchange routes have moderate but reliable margins
  const mockTradeRoutes = [
    // HIGHEST PRIORITY: Food TO Timberwake (most vulnerable island, highest prices)
    {
      from: 'greenbarrow',
      to: 'timberwake',
      goods: ['grain'],
      priority: 1,
    },
    {
      from: 'shoalhold',
      to: 'timberwake',
      goods: ['fish'],
      priority: 1,
    },
    // PRIORITY 2: Food exchange between food producers
    {
      from: 'shoalhold',
      to: 'greenbarrow',
      goods: ['fish'],
      priority: 2,
    },
    {
      from: 'greenbarrow',
      to: 'shoalhold',
      goods: ['grain'],
      priority: 2,
    },
    // PRIORITY 3: Material trade (return trips - reduces wasted operating costs)
    {
      from: 'timberwake',
      to: 'greenbarrow',
      goods: ['timber'],
      priority: 3,
    },
    {
      from: 'timberwake',
      to: 'shoalhold',
      goods: ['timber'],
      priority: 3,
    },
    // PRIORITY 4: Tools distribution
    {
      from: 'greenbarrow',
      to: 'timberwake',
      goods: ['tools'],
      priority: 4,
    },
    {
      from: 'greenbarrow',
      to: 'shoalhold',
      goods: ['tools'],
      priority: 4,
    },
  ];

  /**
   * Economic Model V2: Smart response generator that considers prompt context
   * - Switches to 'stabilize' goal when debt is mentioned
   * - Switches to 'explore' goal when prices are stale
   * - Adjusts risk tolerance based on financial status
   */
  const smartDefaultResponse = (prompt: string) => {
    let primaryGoal: 'profit' | 'stabilize' | 'explore' = 'profit';
    let riskTolerance: 'low' | 'medium' | 'high' = 'medium';
    let reasoning = 'Trade routes follow island specializations: fish from Shoalhold, grain from Greenbarrow, timber from Timberwake';

    // Economic Model V2: Parse prompt for financial indicators
    const highDebtMatch = prompt.match(/debt ratio.*?(\d+)%/i) || prompt.match(/WARNING.*?High debt/i);
    const staleDataMatch = prompt.match(/STALE.*?UNRELIABLE/gi) || prompt.match(/RECOMMENDATION.*?explore/i);
    const lowMoraleMatch = prompt.match(/morale.*?(\d+)%.*?LOW/i);

    if (highDebtMatch) {
      primaryGoal = 'stabilize';
      riskTolerance = 'low';
      reasoning = 'High debt detected - prioritizing cash flow and debt repayment over risky trades';
    } else if (staleDataMatch && staleDataMatch.length >= 2) {
      primaryGoal = 'explore';
      riskTolerance = 'medium';
      reasoning = 'Multiple islands have stale price data - exploring to update market knowledge before committing to trades';
    } else if (lowMoraleMatch) {
      riskTolerance = 'low';
      reasoning = 'Low crew morale detected - taking conservative approach to avoid further issues';
    }

    return JSON.stringify({
      analysis: `Mock analysis: ${primaryGoal === 'profit' ? 'Exploiting natural island specialization for arbitrage' : primaryGoal === 'stabilize' ? 'Focusing on debt repayment and cash flow' : 'Updating market knowledge through exploration'}`,
      strategy: {
        primaryGoal,
        targetRoutes: mockTradeRoutes,
        riskTolerance,
      },
      reasoning,
    });
  };

  const mockClient = createMockLLMClient(mockResponses ?? smartDefaultResponse);

  // Use unlimited rate limiter for mock testing (no API costs)
  return new TraderAgent(id, name, mockClient, initialAssets, {
    debug: true,
    rateLimiterPreset: 'unlimited',
    ...config
  });
}
