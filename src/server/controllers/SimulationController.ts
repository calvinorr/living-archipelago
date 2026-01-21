/**
 * Simulation Controller
 * Orchestrates simulation lifecycle: init, tick, start/pause/resume, speed, LLM toggle
 */

import { Simulation } from '../../core/simulation.js';
import { initializeWorld, DEFAULT_CONFIG } from '../../core/world.js';
import { applyOverridesToConfig } from '../../config/overrides.js';
import { llmMetrics } from '../../llm/metrics.js';
import { serializeWorldState } from '../state-serializer.js';
import { state, config, broadcast, type AgentDecisionEvent } from '../state.js';
import {
  initializeAgents,
  switchLLMMode,
} from '../services/AgentService.js';
import {
  initializeDatabase,
  startRun,
  recordSnapshot,
  recordEvents,
  recordTrade,
} from '../services/DatabaseService.js';
import type { TradeRecord } from '../../storage/index.js';

/**
 * Initialize or reinitialize the simulation
 */
export function initializeSimulation(): void {
  const seed = parseInt(process.env.SEED || '12345', 10);
  const initialState = initializeWorld(seed);

  // Build config with overrides applied
  const configObj = { ...DEFAULT_CONFIG, seed } as unknown as Record<string, unknown>;
  applyOverridesToConfig(configObj);
  const simConfig = configObj as unknown as typeof DEFAULT_CONFIG & { seed: number };

  state.simulation = new Simulation(initialState, simConfig);
  state.priceHistory = [];

  // Initialize database and start new run
  initializeDatabase();
  startRun(seed, simConfig);

  // Initialize agents
  initializeAgents(initialState);

  console.log('[SimulationController] Simulation initialized');
}

/**
 * Execute a single simulation tick
 */
export async function runTick(): Promise<void> {
  if (!state.simulation || state.status !== 'running') return;

  try {
    state.simulation.tick();
    const worldState = state.simulation.getState();
    const snapshot = serializeWorldState(worldState);

    // Record price history
    const pricePoint = {
      tick: worldState.tick,
      gameDay: worldState.gameTime.gameDay,
      gameHour: worldState.gameTime.gameHour,
      prices: {} as Record<string, Record<string, number>>,
    };
    for (const island of snapshot.islands) {
      pricePoint.prices[island.id] = island.market.prices;
    }
    state.priceHistory.push(pricePoint);
    if (state.priceHistory.length > 500) {
      state.priceHistory.shift();
    }

    // Record to database
    recordSnapshot(worldState.tick, worldState);
    recordEvents(worldState.tick, worldState.events);

    // Process agents
    if (state.agentManager) {
      const agentResults = await state.agentManager.processTick(worldState);

      if (agentResults.newWorld !== worldState) {
        state.simulation.updateState(agentResults.newWorld);
      }

      for (const result of agentResults.results) {
        if (worldState.tick % 10 === 0) {
          console.log(`[Agent] Tick ${worldState.tick}: triggered=${result.triggered}, actions=${result.actions.length}`);
        }

        if (result.triggered || result.actions.length > 0) {
          console.log(`[Agent] Decision at tick ${worldState.tick}:`, result.triggered ? 'TRIGGERED' : 'ACTIONS');

          const decision: AgentDecisionEvent = {
            agentId: result.agentId,
            agentName: result.agentId,
            tick: worldState.tick,
            triggered: result.triggered,
            triggers: result.triggers.map((t) => t.data.type),
            actions: result.actions.map((a) => ({
              type: a.type,
              details: JSON.stringify(a),
            })),
          };

          if (result.decision?.plan) {
            decision.strategy = {
              type: 'trade',
              goal: result.decision.plan.summary,
            };
          }

          // Record trades to database
          for (const action of result.actions) {
            if (action.type === 'trade') {
              const tradeAction = action as {
                shipId: string;
                islandId: string;
                transactions: Array<{ goodId: string; quantity: number }>;
              };
              const island = worldState.islands.get(tradeAction.islandId);
              if (island) {
                for (const tx of tradeAction.transactions) {
                  const price = island.market.prices.get(tx.goodId) ?? 0;
                  const tradeRecord: TradeRecord = {
                    agentId: result.agentId,
                    shipId: tradeAction.shipId,
                    islandId: tradeAction.islandId,
                    goodId: tx.goodId,
                    quantity: tx.quantity,
                    price: price,
                  };
                  recordTrade(worldState.tick, tradeRecord);
                }
              }
            }
          }

          broadcast({ type: 'agent-decision', data: decision });
        }
      }
    }

    broadcast({ type: 'tick', data: snapshot });
  } catch (error) {
    console.error('[SimulationController] Tick error:', error);
  }
}

/**
 * Start the simulation
 */
export function startSimulation(): void {
  if (state.status === 'running') return;

  if (!state.simulation) {
    initializeSimulation();
  }

  state.status = 'running';
  const intervalMs = Math.round(1000 / state.timeScale);
  state.tickInterval = setInterval(runTick, intervalMs);

  broadcast({ type: 'status', data: { status: 'running' } });
  console.log(`[SimulationController] Started (${state.timeScale}x speed)`);
}

/**
 * Pause the simulation
 */
export function pauseSimulation(): void {
  if (state.status !== 'running') return;

  state.status = 'paused';
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }

  broadcast({ type: 'status', data: { status: 'paused' } });
  console.log('[SimulationController] Paused');
}

/**
 * Resume the simulation
 */
export function resumeSimulation(): void {
  if (state.status !== 'paused') return;

  state.status = 'running';
  const intervalMs = Math.round(1000 / state.timeScale);
  state.tickInterval = setInterval(runTick, intervalMs);

  broadcast({ type: 'status', data: { status: 'running' } });
  console.log('[SimulationController] Resumed');
}

/**
 * Set the simulation speed
 */
export function setSpeed(scale: number): void {
  state.timeScale = Math.max(1, Math.min(10, scale));

  if (state.status === 'running' && state.tickInterval) {
    clearInterval(state.tickInterval);
    const intervalMs = Math.round(1000 / state.timeScale);
    state.tickInterval = setInterval(runTick, intervalMs);
  }

  console.log(`[SimulationController] Speed set to ${state.timeScale}x`);
}

/**
 * Enable or disable LLM for agents
 */
export function setLLMEnabled(enabled: boolean): void {
  if (!config.HAS_API_KEY && enabled) {
    console.log('[SimulationController] Cannot enable LLM: GEMINI_API_KEY not set');
    broadcast({ type: 'llm-status', data: { enabled: false } });
    return;
  }

  const wasRunning = state.status === 'running';
  if (wasRunning) {
    pauseSimulation();
  }

  state.llmEnabled = enabled;
  switchLLMMode(enabled);

  broadcast({ type: 'llm-status', data: { enabled: state.llmEnabled } });
  broadcast({ type: 'llm-stats', data: llmMetrics.getSummary() });

  if (wasRunning) {
    resumeSimulation();
  }

  console.log(`[SimulationController] LLM ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Reset the simulation (start a new run)
 */
export function resetSimulation(): { oldRunId: number | null; newRunId: number | null } {
  // Stop current simulation
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }
  state.status = 'paused';

  const oldRunId = state.database?.getCurrentRunId() ?? null;

  // Reinitialize
  initializeSimulation();

  const newRunId = state.database?.getCurrentRunId() ?? null;

  // Broadcast to clients
  broadcast({ type: 'simulation_reset', data: { oldRunId, newRunId } });

  if (state.simulation) {
    broadcast({ type: 'state', data: serializeWorldState(state.simulation.getState()) });
  }

  console.log(`[SimulationController] Reset: run ${oldRunId} → run ${newRunId}`);

  return { oldRunId, newRunId };
}
