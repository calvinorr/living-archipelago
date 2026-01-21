/**
 * Agent Service
 * Handles agent creation, LLM switching, and model changes
 */

import { AgentManager } from '../../agents/core/agent-manager.js';
import { TraderAgent, createMockTraderAgent } from '../../agents/traders/trader-agent.js';
import { LLMClient } from '../../llm/client.js';
import { llmMetrics } from '../../llm/metrics.js';
import type { WorldState } from '../../core/types.js';
import { state, config } from '../state.js';

const TRIGGER_CONFIG = { maxTicksWithoutReasoning: 10, priceDivergenceThreshold: 0.1 };
const INITIAL_CASH = 1000;

/**
 * Create a trader agent with the appropriate LLM client
 */
export function createTraderAgent(
  shipIds: string[],
  useLLM: boolean,
  model?: string
): TraderAgent {
  if (useLLM && config.HAS_API_KEY) {
    const modelToUse = model || state.llmModel;
    console.log(`[AgentService] Creating real LLM agent (model: ${modelToUse})`);
    const llmClient = new LLMClient({ model: modelToUse });
    return new TraderAgent(
      'trader-alpha',
      'Alpha Trader',
      llmClient,
      { cash: INITIAL_CASH, shipIds },
      { triggerConfig: TRIGGER_CONFIG, debug: true }
    );
  } else {
    console.log('[AgentService] Creating mock LLM agent');
    return createMockTraderAgent(
      'trader-alpha',
      'Mock Trader',
      { cash: INITIAL_CASH, shipIds },
      undefined,
      { triggerConfig: TRIGGER_CONFIG, debug: true }
    );
  }
}

/**
 * Initialize agents for a world state
 */
export function initializeAgents(worldState: WorldState): void {
  if (!config.ENABLE_AGENTS) return;

  state.agentManager = new AgentManager({ debug: false });
  const shipIds = Array.from(worldState.ships.keys());
  const agent = createTraderAgent(shipIds, state.llmEnabled);
  state.agentManager.registerAgent(agent, worldState);
}

/**
 * Reinitialize agents with a different LLM mode
 */
export function switchLLMMode(enabled: boolean): void {
  if (!state.simulation || !config.ENABLE_AGENTS) return;

  const worldState = state.simulation.getState();
  state.agentManager = new AgentManager({ debug: false });

  const shipIds = Array.from(worldState.ships.keys());
  const agent = createTraderAgent(shipIds, enabled);
  state.agentManager.registerAgent(agent, worldState);

  llmMetrics.reset();
}

/**
 * Change the LLM model for the agent
 */
export function changeModel(newModel: string): void {
  if (!state.simulation || !config.ENABLE_AGENTS || !state.llmEnabled) return;

  const worldState = state.simulation.getState();
  state.agentManager = new AgentManager({ debug: false });

  const shipIds = Array.from(worldState.ships.values())
    .filter((s) => s.ownerId === 'trader-alpha')
    .map((s) => s.id);

  console.log(`[AgentService] Switching model to: ${newModel}`);
  const agent = createTraderAgent(shipIds, true, newModel);
  state.agentManager.registerAgent(agent, worldState);

  llmMetrics.reset();
}
