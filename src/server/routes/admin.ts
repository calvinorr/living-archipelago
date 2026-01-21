/**
 * Admin routes
 */

import type { Router } from './router.js';
import { sendJson, sendError, parseJsonBody } from '../utils/http.js';
import { state, config, clients } from '../state.js';
import { llmMetrics } from '../../llm/metrics.js';
import { loadOverrides } from '../../config/overrides.js';
import { TraderAgent } from '../../agents/traders/trader-agent.js';
import { AgentManager } from '../../agents/core/agent-manager.js';
import { LLMClient } from '../../llm/client.js';

// Dependencies injected from api-server
export interface AdminDeps {
  pauseSimulation: () => void;
  resumeSimulation: () => void;
}

let deps: AdminDeps | null = null;

export function setAdminDeps(d: AdminDeps): void {
  deps = d;
}

export function registerAdminRoutes(router: Router): void {
  // Get LLM metrics and recent calls
  router.add('GET', '/api/admin/llm', (_req, res) => {
    const summary = llmMetrics.getSummary();
    const agentStats =
      state.agentManager?.getAllAgents().map((agent) => {
        if ('getStats' in agent && typeof agent.getStats === 'function') {
          const stats = (agent as TraderAgent).getStats();
          return {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            llmCalls: stats.llmCalls,
            rateLimiter: stats.rateLimiterStatus,
          };
        }
        return { id: agent.id, name: agent.name, type: agent.type };
      }) ?? [];

    sendJson(res, 200, {
      summary,
      agents: agentStats,
      llmEnabled: state.llmEnabled,
    });
  });

  // Get agent diagnostics
  router.add('GET', '/api/admin/agents', (_req, res) => {
    const agents =
      state.agentManager?.getAllAgents().map((agent) => {
        const memory = agent.getMemory();
        let traderStats = null;

        if ('getStats' in agent && typeof agent.getStats === 'function') {
          traderStats = (agent as TraderAgent).getStats();
        }

        return {
          id: agent.id,
          name: agent.name,
          type: agent.type,
          memory: {
            lastReasoningTick: memory.lastReasoningTick,
            currentPlan: memory.currentPlan,
            recentDecisions: memory.recentDecisions.slice(-10),
          },
          traderStats,
        };
      }) ?? [];

    sendJson(res, 200, {
      agents,
      tick: state.simulation?.getTick() ?? 0,
    });
  });

  // Get current active config
  router.add('GET', '/api/admin/config', (_req, res) => {
    const activeConfig = state.simulation?.getConfig() ?? null;
    const overrides = loadOverrides();

    sendJson(res, 200, {
      activeConfig,
      overrides,
    });
  });

  // Get server status and diagnostics
  router.add('GET', '/api/admin/status', (_req, res) => {
    sendJson(res, 200, {
      status: state.status,
      tick: state.simulation?.getTick() ?? 0,
      runId: state.database?.getCurrentRunId() ?? null,
      timeScale: state.timeScale,
      llmEnabled: state.llmEnabled,
      llmModel: state.llmModel,
      availableModels: [
        {
          id: 'gemini-1.5-flash-8b',
          name: 'Gemini 1.5 Flash 8B',
          cost: '$0.0375/$0.15 per 1M tokens',
          recommended: true,
        },
        {
          id: 'gemini-1.5-flash',
          name: 'Gemini 1.5 Flash',
          cost: '$0.075/$0.30 per 1M tokens',
        },
        {
          id: 'gemini-2.0-flash',
          name: 'Gemini 2.0 Flash',
          cost: '$0.10/$0.40 per 1M tokens',
        },
      ],
      dbEnabled: config.DB_ENABLED,
      connectedClients: clients.size,
      uptime: process.uptime(),
    });
  });

  // Change LLM model
  router.add('POST', '/api/admin/model', async (req, res) => {
    if (!deps) {
      sendError(res, 500, 'Admin dependencies not initialized');
      return;
    }

    const body = await parseJsonBody<{ model?: string }>(req);
    if (!body) {
      sendError(res, 400, 'Invalid JSON');
      return;
    }

    const { model } = body;
    const validModels = ['gemini-1.5-flash-8b', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

    if (!model || !validModels.includes(model)) {
      sendError(res, 400, `Invalid model. Choose from: ${validModels.join(', ')}`);
      return;
    }

    const oldModel = state.llmModel;
    state.llmModel = model;

    // If LLM is enabled, need to reinitialize agent with new model
    if (state.llmEnabled && state.simulation && config.ENABLE_AGENTS) {
      const wasRunning = state.status === 'running';
      if (wasRunning) deps.pauseSimulation();

      // Reinitialize with new model
      const worldState = state.simulation.getState();
      state.agentManager = new AgentManager({ debug: false });

      const shipIds = Array.from(worldState.ships.values())
        .filter((s) => s.ownerId === 'trader-alpha')
        .map((s) => s.id);
      const initialCash = 1000;
      const triggerConfig = { maxTicksWithoutReasoning: 10, priceDivergenceThreshold: 0.1 };

      console.log(`[Server] Switching LLM model: ${oldModel} → ${model}`);
      const llmClient = new LLMClient({ model: state.llmModel });
      const agent = new TraderAgent(
        'trader-alpha',
        'Alpha Trader',
        llmClient,
        { cash: initialCash, shipIds },
        { triggerConfig, debug: true }
      );

      state.agentManager.registerAgent(agent, worldState);
      llmMetrics.reset();

      if (wasRunning) deps.resumeSimulation();
    }

    sendJson(res, 200, {
      success: true,
      oldModel,
      newModel: model,
      message: `Model changed to ${model}`,
    });
  });
}
