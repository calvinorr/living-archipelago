/**
 * Agent Manager
 * Handles agent lifecycle, registration, and tick integration
 */

import type { WorldState, AgentId } from '../../core/types.js';
import type { IAgent, Decision } from '../interfaces/agent.js';
import type { Action, ActionResult } from '../interfaces/action.js';
import { ActionValidator } from '../interfaces/action.js';
import { ObservableBuilder } from '../interfaces/observable.js';
import { TriggerSystem, type Trigger, type TriggerConfig } from './trigger-system.js';
import { startVoyage } from '../../systems/shipping.js';
import { executeTrade } from '../../systems/market.js';

/**
 * Agent execution result for a single tick
 */
export interface AgentTickResult {
  agentId: AgentId;
  triggered: boolean;
  triggers: Trigger[];
  decision: Decision | null;
  actions: Action[];
  results: ActionResult[];
  error?: string;
}

/**
 * Agent Manager configuration
 */
export interface AgentManagerConfig {
  /** Enable debug logging */
  debug: boolean;
  /** Trigger configuration */
  triggerConfig: Partial<TriggerConfig>;
  /** Transaction tax rate (0.04 = 4%, currency sink) */
  transactionTaxRate: number;
}

const DEFAULT_MANAGER_CONFIG: AgentManagerConfig = {
  debug: false,
  triggerConfig: {},
  transactionTaxRate: 0.04, // 4% default transaction tax
};

/**
 * Agent Manager
 * Coordinates agent execution within simulation ticks
 */
export class AgentManager {
  private agents: Map<AgentId, IAgent> = new Map();
  private actionValidator: ActionValidator;
  private observableBuilder: ObservableBuilder;
  private triggerSystems: Map<AgentId, TriggerSystem> = new Map();
  private config: AgentManagerConfig;

  constructor(config: Partial<AgentManagerConfig> = {}) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.actionValidator = new ActionValidator();
    this.observableBuilder = new ObservableBuilder();
  }

  /**
   * Register an agent
   */
  registerAgent(agent: IAgent, world: WorldState): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} already registered`);
    }

    agent.initialize(world);
    this.agents.set(agent.id, agent);
    this.triggerSystems.set(agent.id, new TriggerSystem(this.config.triggerConfig));

    if (this.config.debug) {
      console.log(`[AgentManager] Registered agent: ${agent.id} (${agent.type})`);
    }
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: AgentId): boolean {
    const removed = this.agents.delete(agentId);
    this.triggerSystems.delete(agentId);
    return removed;
  }

  /**
   * Get registered agent
   */
  getAgent(agentId: AgentId): IAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Process all agents for a tick
   * Returns updated world state and agent results
   */
  async processTick(world: WorldState): Promise<{
    newWorld: WorldState;
    results: AgentTickResult[];
  }> {
    const results: AgentTickResult[] = [];
    let currentWorld = world;

    // Notify agents of tick start
    for (const agent of this.agents.values()) {
      agent.onTickStart(world.tick);
    }

    // Process each agent
    for (const agent of this.agents.values()) {
      try {
        const result = await this.processAgent(agent, currentWorld);
        results.push(result);

        // Apply successful actions to world
        if (result.results.some((r) => r.success)) {
          currentWorld = this.applyActions(currentWorld, result.results);
        }
      } catch (error) {
        results.push({
          agentId: agent.id,
          triggered: false,
          triggers: [],
          decision: null,
          actions: [],
          results: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Notify agents of tick end
    for (const agent of this.agents.values()) {
      agent.onTickEnd(currentWorld.tick);
    }

    return { newWorld: currentWorld, results };
  }

  /**
   * Process a single agent for a tick
   */
  private async processAgent(
    agent: IAgent,
    world: WorldState
  ): Promise<AgentTickResult> {
    const triggerSystem = this.triggerSystems.get(agent.id)!;
    const memory = agent.getMemory();

    // Build observation
    const observation = this.observableBuilder.build(
      world,
      agent.id,
      agent.type,
      agent.name,
      memory
    );

    // Evaluate triggers
    const triggers = triggerSystem.evaluate(observation, memory);
    const shouldTrigger = triggers.length > 0 &&
      triggers[0].priority >= (this.config.triggerConfig.minTriggerPriority ?? 3);

    if (this.config.debug && triggers.length > 0) {
      console.log(
        `[AgentManager] ${agent.id} triggers: ${triggerSystem.summarizeTriggers(triggers)}`
      );
    }

    // Get decision (may invoke LLM for some agents)
    let decision: Decision;
    if (shouldTrigger || agent.shouldReason(observation, triggers)) {
      decision = await agent.reason(observation, triggers);
    } else {
      // Continue with current plan without deep reasoning
      decision = await agent.reason(observation, []);
    }

    // Convert decision to actions
    const actions = agent.act(decision);

    // Validate and execute actions
    const results: ActionResult[] = [];
    for (const action of actions) {
      const validation = this.actionValidator.validate(action, world, agent.id);

      if (validation.valid) {
        results.push({
          action,
          success: true,
          details: { validated: true },
        });
      } else {
        results.push({
          action,
          success: false,
          error: validation.errors.join('; '),
        });
      }
    }

    // Notify agent of results
    agent.onActionResults(results);

    return {
      agentId: agent.id,
      triggered: shouldTrigger,
      triggers,
      decision,
      actions,
      results,
    };
  }

  /**
   * Apply successful actions to world state
   */
  private applyActions(world: WorldState, results: ActionResult[]): WorldState {
    // Clone world for immutability
    const newWorld = this.cloneWorld(world);

    for (const result of results) {
      if (!result.success) continue;

      const action = result.action;

      switch (action.type) {
        case 'trade':
          this.applyTradeAction(newWorld, action);
          break;
        case 'navigate':
          this.applyNavigateAction(newWorld, action);
          break;
        case 'wait':
          // No-op for wait
          break;
      }
    }

    return newWorld;
  }

  private applyTradeAction(
    world: WorldState,
    action: import('../interfaces/action.js').TradeAction
  ): void {
    const ship = world.ships.get(action.shipId);
    const island = world.islands.get(action.islandId);

    if (!ship || !island) return;

    const {
      newIslandInventory,
      newShipCargo,
      newShipCash,
      taxCollected,
      islandExportRevenue,
      islandImportCost,
    } = executeTrade(
      island.inventory,
      ship.cargo,
      ship.cash,
      action.transactions,
      island.market.prices,
      {
        taxRate: this.config.transactionTaxRate,
        // Economic Model V2: Enable purchasing power limits if island has treasury
        islandTreasury: island.treasury ?? Infinity,
        enforcePurchasingPower: island.treasury !== undefined,
        maxSpendRatio: 0.1, // Islands can spend up to 10% of treasury per transaction
      }
    );

    // Update ship
    const updatedShip = { ...ship, cargo: newShipCargo, cash: newShipCash };
    world.ships.set(action.shipId, updatedShip);

    // Economic Model V2: Update island with treasury changes
    const updatedIsland = {
      ...island,
      inventory: newIslandInventory,
      // Treasury changes: receives export revenue, pays import costs
      treasury: (island.treasury ?? 0) + islandExportRevenue - islandImportCost,
      treasuryIncome: (island.treasuryIncome ?? 0) + islandExportRevenue,
      treasuryExpenses: (island.treasuryExpenses ?? 0) + islandImportCost,
      cumulativeExportRevenue: (island.cumulativeExportRevenue ?? 0) + islandExportRevenue,
      cumulativeImportCosts: (island.cumulativeImportCosts ?? 0) + islandImportCost,
    };
    world.islands.set(action.islandId, updatedIsland);

    // Update economy metrics (tax is a currency sink - money destroyed)
    if (taxCollected > 0 && world.economyMetrics) {
      world.economyMetrics.taxCollectedThisTick += taxCollected;
      world.economyMetrics.totalTaxCollected += taxCollected;
    }
  }

  private applyNavigateAction(
    world: WorldState,
    action: import('../interfaces/action.js').NavigateAction
  ): void {
    const ship = world.ships.get(action.shipId);
    if (!ship) return;

    const newLocation = startVoyage(ship, action.destinationId, world.islands, world.events);

    const updatedShip = { ...ship, location: newLocation };
    world.ships.set(action.shipId, updatedShip);
  }

  private cloneWorld(world: WorldState): WorldState {
    // Shallow clone - actions only modify ships, islands, and economy metrics
    return {
      ...world,
      islands: new Map(
        Array.from(world.islands.entries()).map(([id, island]) => [
          id,
          {
            ...island,
            inventory: new Map(island.inventory),
            market: {
              ...island.market,
              prices: new Map(island.market.prices),
              idealStock: new Map(island.market.idealStock),
              momentum: new Map(island.market.momentum),
              consumptionVelocity: new Map(island.market.consumptionVelocity),
            },
            // Economic Model V2: Reset per-tick treasury values
            treasuryIncome: 0,
            treasuryExpenses: 0,
          },
        ])
      ),
      ships: new Map(
        Array.from(world.ships.entries()).map(([id, ship]) => [
          id,
          {
            ...ship,
            cargo: new Map(ship.cargo),
            location:
              ship.location.kind === 'at_island'
                ? { ...ship.location }
                : {
                    ...ship.location,
                    position: { ...ship.location.position },
                    route: { ...ship.location.route },
                  },
          },
        ])
      ),
      // Clone economy metrics for immutability
      economyMetrics: world.economyMetrics
        ? { ...world.economyMetrics }
        : { taxCollectedThisTick: 0, totalTaxCollected: 0, taxRedistributedThisTick: 0, totalTaxRedistributed: 0 },
    };
  }

  /**
   * Get statistics about agent execution
   */
  getStats(): {
    agentCount: number;
    agentsByType: Record<string, number>;
  } {
    const agentsByType: Record<string, number> = {};

    for (const agent of this.agents.values()) {
      agentsByType[agent.type] = (agentsByType[agent.type] ?? 0) + 1;
    }

    return {
      agentCount: this.agents.size,
      agentsByType,
    };
  }
}
