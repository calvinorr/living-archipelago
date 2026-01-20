/**
 * Trigger System
 * Event-driven reasoning triggers for agents
 */

import type { GoodId, IslandId } from '../../core/types.js';
import type { ObservableState } from '../interfaces/observable.js';
import type { AgentMemory } from '../interfaces/agent.js';

/**
 * Trigger types that can cause agent reasoning
 */
export enum TriggerType {
  PRICE_DIVERGENCE = 'price_divergence',
  SHIP_ARRIVAL = 'ship_arrival',
  EVENT_STARTED = 'event_started',
  EVENT_ENDED = 'event_ended',
  PLAN_COMPLETED = 'plan_completed',
  PLAN_FAILED = 'plan_failed',
  RESOURCE_THRESHOLD = 'resource_threshold',
  TIME_ELAPSED = 'time_elapsed',
  NO_PLAN = 'no_plan',
}

/**
 * A trigger that may cause agent reasoning
 */
export interface Trigger {
  type: TriggerType;
  priority: number; // 0-10, higher = more urgent
  data: TriggerData;
}

/**
 * Data associated with different trigger types
 */
export type TriggerData =
  | PriceDivergenceTriggerData
  | ShipArrivalTriggerData
  | EventTriggerData
  | PlanTriggerData
  | ResourceTriggerData
  | TimeElapsedTriggerData
  | NoPlanTriggerData;

export interface PriceDivergenceTriggerData {
  type: 'price_divergence';
  goodId: GoodId;
  divergence: number;
  highIsland: IslandId;
  lowIsland: IslandId;
  highPrice: number;
  lowPrice: number;
}

export interface ShipArrivalTriggerData {
  type: 'ship_arrival';
  shipId: string;
  islandId: IslandId;
}

export interface EventTriggerData {
  type: 'event_started' | 'event_ended';
  eventId: string;
  eventType: string;
  targetId: string;
}

export interface PlanTriggerData {
  type: 'plan_completed' | 'plan_failed';
  planId: string;
  reason?: string;
}

export interface ResourceTriggerData {
  type: 'resource_threshold';
  resource: 'cash' | 'cargo' | 'health';
  current: number;
  threshold: number;
  isLow: boolean;
}

export interface TimeElapsedTriggerData {
  type: 'time_elapsed';
  ticksSinceLastReasoning: number;
}

export interface NoPlanTriggerData {
  type: 'no_plan';
}

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  /** Price divergence threshold (fraction) to trigger reasoning */
  priceDivergenceThreshold: number;
  /** Maximum ticks without reasoning before forced re-evaluation */
  maxTicksWithoutReasoning: number;
  /** Minimum ticks between LLM reasoning (cooldown) */
  minTicksBetweenReasoning: number;
  /** Goods to track for price divergence */
  trackedGoods: GoodId[];
  /** Minimum priority to trigger reasoning */
  minTriggerPriority: number;
}

/**
 * Default trigger configuration
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  priceDivergenceThreshold: 0.5, // 50% price difference (was 30%)
  maxTicksWithoutReasoning: 60, // Force reasoning every ~2.5 days
  minTicksBetweenReasoning: 20, // Cooldown: wait 20 ticks (~1 day) between LLM calls
  trackedGoods: ['fish', 'grain', 'timber', 'tools'],
  minTriggerPriority: 5, // Raised from 3 to reduce sensitivity
};

/**
 * Trigger System
 * Evaluates world state and determines if agent should reason
 */
export class TriggerSystem {
  private config: TriggerConfig;
  private activeTriggers: Trigger[] = [];

  constructor(config: Partial<TriggerConfig> = {}) {
    this.config = { ...DEFAULT_TRIGGER_CONFIG, ...config };
  }

  /**
   * Evaluate triggers for current observation
   */
  evaluate(observation: ObservableState, memory: AgentMemory): Trigger[] {
    this.activeTriggers = [];

    this.checkPriceDivergence(observation);
    this.checkShipArrivals(observation);
    this.checkEvents(observation);
    this.checkPlanStatus(memory);
    this.checkNoPlan(memory);
    this.checkTimeElapsed(observation, memory);

    // Sort by priority (highest first)
    this.activeTriggers.sort((a, b) => b.priority - a.priority);

    return this.activeTriggers;
  }

  /**
   * Check if agent should trigger reasoning based on current triggers
   */
  shouldTrigger(observation: ObservableState, memory: AgentMemory): boolean {
    // Cooldown check: don't trigger if we reasoned recently
    const ticksSinceReasoning = observation.tick - memory.lastReasoningTick;
    if (ticksSinceReasoning < this.config.minTicksBetweenReasoning) {
      return false;
    }

    const triggers = this.evaluate(observation, memory);
    return triggers.length > 0 && triggers[0].priority >= this.config.minTriggerPriority;
  }

  /**
   * Get active triggers (from last evaluation)
   */
  getActiveTriggers(): Trigger[] {
    return [...this.activeTriggers];
  }

  /**
   * Get highest priority trigger
   */
  getTopTrigger(): Trigger | null {
    return this.activeTriggers[0] ?? null;
  }

  private checkPriceDivergence(observation: ObservableState): void {
    const islands = Array.from(observation.islands.values());

    for (const goodId of this.config.trackedGoods) {
      const prices = islands.map((i) => ({
        island: i.id,
        price: i.prices.get(goodId) ?? 0,
      }));

      const validPrices = prices.filter((p) => p.price > 0);
      if (validPrices.length < 2) continue;

      const maxPrice = Math.max(...validPrices.map((p) => p.price));
      const minPrice = Math.min(...validPrices.map((p) => p.price));

      const divergence = (maxPrice - minPrice) / minPrice;

      if (divergence > this.config.priceDivergenceThreshold) {
        const highIsland = validPrices.find((p) => p.price === maxPrice)!.island;
        const lowIsland = validPrices.find((p) => p.price === minPrice)!.island;

        // Priority scales with divergence (30% = 5, 100% = 10)
        const priority = Math.min(10, Math.floor(5 + divergence * 5));

        this.activeTriggers.push({
          type: TriggerType.PRICE_DIVERGENCE,
          priority,
          data: {
            type: 'price_divergence',
            goodId,
            divergence,
            highIsland,
            lowIsland,
            highPrice: maxPrice,
            lowPrice: minPrice,
          },
        });
      }
    }
  }

  private checkShipArrivals(observation: ObservableState): void {
    for (const ship of observation.ships.values()) {
      if (!ship.isOwned) continue;

      // Check if ship just arrived (at island, was at sea)
      // This is a simplification - in practice we'd track previous state
      if (ship.location.kind === 'at_island' && ship.location.islandId) {
        // For now, we'll rely on the simulation to mark arrivals
        // This trigger would be set by the agent manager when ship state changes
      }
    }
  }

  private checkEvents(observation: ObservableState): void {
    for (const event of observation.events) {
      if (event.isNew) {
        // Event just started
        const priority = this.getEventPriority(event.type, event.affectsAgent);

        this.activeTriggers.push({
          type: TriggerType.EVENT_STARTED,
          priority,
          data: {
            type: 'event_started',
            eventId: event.id,
            eventType: event.type,
            targetId: event.target,
          },
        });
      }

      // Could also check for ending events, but that requires tracking previous state
    }
  }

  private getEventPriority(eventType: string, affectsAgent: boolean): number {
    const basePriority: Record<string, number> = {
      storm: 7,
      blight: 5,
      festival: 4,
      discovery: 3,
    };

    let priority = basePriority[eventType] ?? 4;

    if (affectsAgent) {
      priority += 2;
    }

    return Math.min(10, priority);
  }

  private checkPlanStatus(memory: AgentMemory): void {
    const plan = memory.currentPlan;
    if (!plan) return;

    if (plan.status === 'completed') {
      this.activeTriggers.push({
        type: TriggerType.PLAN_COMPLETED,
        priority: 8,
        data: {
          type: 'plan_completed',
          planId: plan.id,
        },
      });
    }

    if (plan.status === 'failed') {
      this.activeTriggers.push({
        type: TriggerType.PLAN_FAILED,
        priority: 9,
        data: {
          type: 'plan_failed',
          planId: plan.id,
          reason: plan.failureReason,
        },
      });
    }
  }

  private checkNoPlan(memory: AgentMemory): void {
    if (!memory.currentPlan || memory.currentPlan.status !== 'active') {
      this.activeTriggers.push({
        type: TriggerType.NO_PLAN,
        priority: 6,
        data: {
          type: 'no_plan',
        },
      });
    }
  }

  private checkTimeElapsed(observation: ObservableState, memory: AgentMemory): void {
    const ticksSince = observation.tick - memory.lastReasoningTick;

    if (ticksSince >= this.config.maxTicksWithoutReasoning) {
      this.activeTriggers.push({
        type: TriggerType.TIME_ELAPSED,
        priority: 5,
        data: {
          type: 'time_elapsed',
          ticksSinceLastReasoning: ticksSince,
        },
      });
    }
  }

  /**
   * Create a trigger summary for logging/debugging
   */
  summarizeTriggers(triggers: Trigger[]): string {
    if (triggers.length === 0) return 'No triggers';

    return triggers
      .map((t) => {
        switch (t.type) {
          case TriggerType.PRICE_DIVERGENCE: {
            const d = t.data as PriceDivergenceTriggerData;
            return `Price: ${d.goodId} ${(d.divergence * 100).toFixed(0)}% (${d.lowIsland}→${d.highIsland})`;
          }
          case TriggerType.EVENT_STARTED: {
            const d = t.data as EventTriggerData;
            return `Event: ${d.eventType} at ${d.targetId}`;
          }
          case TriggerType.PLAN_COMPLETED:
            return 'Plan completed';
          case TriggerType.PLAN_FAILED: {
            const d = t.data as PlanTriggerData;
            return `Plan failed: ${d.reason ?? 'unknown'}`;
          }
          case TriggerType.NO_PLAN:
            return 'No active plan';
          case TriggerType.TIME_ELAPSED: {
            const d = t.data as TimeElapsedTriggerData;
            return `Time: ${d.ticksSinceLastReasoning} ticks since reasoning`;
          }
          default:
            return t.type;
        }
      })
      .join(', ');
  }
}
