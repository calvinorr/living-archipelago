/**
 * Trader Agent
 * Main implementation combining LLM Strategist and Rule-Based Executor
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
  rateLimiterPreset: 'conservative' | 'balanced' | 'aggressive';
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
   */
  shouldReason(observation: ObservableState, triggers: Trigger[]): boolean {
    // Always reason if we have high-priority triggers
    if (triggers.length > 0 && triggers[0].priority >= 6) {
      return true;
    }

    // Reason if strategy is stale
    if (this.traderMemory.isStrategyStale(observation.tick)) {
      return true;
    }

    // Reason if no current strategy
    if (!this.traderMemory.getCurrentStrategy()) {
      return true;
    }

    // Check trigger system
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
 */
export function createMockTraderAgent(
  id: AgentId,
  name: string,
  initialAssets: { cash: number; shipIds: string[] },
  mockResponses?: (prompt: string) => string
): TraderAgent {
  const defaultResponse = () =>
    JSON.stringify({
      analysis: 'Mock analysis',
      strategy: {
        primaryGoal: 'profit',
        targetRoutes: [],
        riskTolerance: 'medium',
      },
      reasoning: 'Mock reasoning',
    });

  const mockClient = createMockLLMClient(mockResponses ?? defaultResponse);

  return new TraderAgent(id, name, mockClient, initialAssets, { debug: true });
}
