/**
 * Core Agent Interface
 * Defines the observe → reason → act pattern for all agents
 */

import type {
  AgentId,
  AgentType,
  AgentState,
  WorldState,
} from '../../core/types.js';
import type { ObservableState } from './observable.js';
import type { Action, ActionResult } from './action.js';
import type { Trigger } from '../core/trigger-system.js';

/**
 * Decision made by an agent after reasoning
 */
export interface Decision {
  /** Actions to execute this tick */
  actions: Action[];
  /** Updated plan (for planning agents) */
  plan?: Plan;
  /** Reason for triggering LLM reasoning (if applicable) */
  triggerReason?: string;
}

/**
 * A multi-step plan for achieving goals
 */
export interface Plan {
  id: string;
  createdAt: number; // tick
  status: 'active' | 'completed' | 'failed';
  summary: string;
  steps: PlanStep[];
  currentStep: number;
  failureReason?: string;
}

export interface PlanStep {
  action: string;
  target?: string;
  params?: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Agent memory for context persistence
 */
export interface AgentMemory {
  lastReasoningTick: number;
  currentPlan: Plan | null;
  recentDecisions: Array<{
    tick: number;
    decision: Decision;
  }>;
  customData: Record<string, unknown>;
}

/**
 * Core agent interface
 * All agent types (trader, population, governor, player) implement this
 */
export interface IAgent {
  /** Unique agent identifier */
  readonly id: AgentId;

  /** Agent type for filtering and permissions */
  readonly type: AgentType;

  /** Human-readable name */
  readonly name: string;

  /**
   * Initialize agent with world state
   * Called once when agent is registered
   */
  initialize(world: WorldState): void;

  /**
   * Build agent's observation of the world
   * Returns filtered view based on agent type and permissions
   */
  observe(world: WorldState): ObservableState;

  /**
   * Check if agent should engage in deep reasoning this tick
   * Returns true if triggers warrant LLM/complex reasoning
   */
  shouldReason(observation: ObservableState, triggers: Trigger[]): boolean;

  /**
   * Make decisions based on observation
   * May be async for LLM-based agents
   */
  reason(observation: ObservableState, triggers: Trigger[]): Promise<Decision>;

  /**
   * Convert decision to executable actions
   * Validates actions before returning
   */
  act(decision: Decision): Action[];

  /**
   * Get current agent state for serialization
   */
  getState(): AgentState;

  /**
   * Get agent memory for context
   */
  getMemory(): AgentMemory;

  /**
   * Update agent with action results
   * Called after actions are executed
   */
  onActionResults(results: ActionResult[]): void;

  /**
   * Called at start of each tick before observation
   */
  onTickStart(tick: number): void;

  /**
   * Called at end of each tick after all actions
   */
  onTickEnd(tick: number): void;
}

/**
 * Base agent implementation with common functionality
 */
export abstract class BaseAgent implements IAgent {
  readonly id: AgentId;
  readonly type: AgentType;
  readonly name: string;

  protected state: AgentState;
  protected memory: AgentMemory;
  protected initialized: boolean = false;

  constructor(id: AgentId, type: AgentType, name: string, initialState: AgentState) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.state = initialState;
    this.memory = {
      lastReasoningTick: 0,
      currentPlan: null,
      recentDecisions: [],
      customData: {},
    };
  }

  initialize(_world: WorldState): void {
    this.initialized = true;
  }

  abstract observe(world: WorldState): ObservableState;

  abstract shouldReason(observation: ObservableState, triggers: Trigger[]): boolean;

  abstract reason(observation: ObservableState, triggers: Trigger[]): Promise<Decision>;

  abstract act(decision: Decision): Action[];

  getState(): AgentState {
    return this.state;
  }

  getMemory(): AgentMemory {
    return this.memory;
  }

  onActionResults(_results: ActionResult[]): void {
    // Override in subclasses
  }

  onTickStart(_tick: number): void {
    // Override in subclasses
  }

  onTickEnd(_tick: number): void {
    // Override in subclasses
  }

  /**
   * Record a decision in memory
   */
  protected recordDecision(tick: number, decision: Decision): void {
    this.memory.recentDecisions.push({ tick, decision });

    // Keep only last 20 decisions
    if (this.memory.recentDecisions.length > 20) {
      this.memory.recentDecisions.shift();
    }
  }

  /**
   * Update current plan
   */
  protected updatePlan(plan: Plan | null): void {
    this.memory.currentPlan = plan;
  }

  /**
   * Mark last reasoning tick
   */
  protected markReasoning(tick: number): void {
    this.memory.lastReasoningTick = tick;
  }
}
